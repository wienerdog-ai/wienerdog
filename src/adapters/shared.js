'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hashDir } = require('../core/manifest');
const { WienerdogError } = require('../core/errors');

const BEGIN = '<!-- wienerdog:begin -->';
const END = '<!-- wienerdog:end -->';

/** Locate the SINGLE managed block by FULL-LINE sentinel match (a line whose
 *  trimmed content equals the sentinel). Returns {begin, end} character offsets
 *  where `begin` = start of the BEGIN line and `end` = position just past the END
 *  sentinel text on its line (matching the historical slice offsets), OR null when
 *  no sentinel line exists. Throws WienerdogError when the markers are AMBIGUOUS:
 *  more than one BEGIN or END line, or an END line before the BEGIN line, or exactly
 *  one of the two present — refuse to edit rather than guess and swallow user text.
 *  @param {string} content @param {string} what  file path, for the error message
 *  @returns {{begin:number, end:number}|null} */
function locateManagedBlock(content, what) {
  const lines = content.split('\n');
  const starts = []; let off = 0;
  for (const l of lines) { starts.push(off); off += l.length + 1; }
  const begins = []; const ends = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === BEGIN) begins.push(i);
    else if (t === END) ends.push(i);
  }
  if (begins.length === 0 && ends.length === 0) return null;
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0]) {
    throw new WienerdogError(`ambiguous wienerdog managed-block markers in ${what} — refusing to edit (resolve by hand)`);
  }
  const b = begins[0], e = ends[0];
  // `end` = right after the END sentinel text on its line (excludes trailing \n),
  // matching the historical `indexOf(END) + END.length` for a clean written block.
  const end = starts[e] + lines[e].indexOf(END) + END.length;
  return { begin: starts[b], end };
}

/**
 * Record a manifest entry only if one with the same kind+path is not already
 * present. Keeps re-syncs from bloating the manifest with duplicates.
 * @param {object} [manifest]
 * @param {{kind: string, path: string, [k: string]: any}} entry
 */
function recordOnce(manifest, entry) {
  if (!manifest) return;
  if (!Array.isArray(manifest.entries)) manifest.entries = [];
  const exists = manifest.entries.some((e) => e.kind === entry.kind && e.path === entry.path);
  if (!exists) manifest.entries.push(entry);
}

/** Record — or UPSERT — a copied-skill manifest entry, refreshing its content
 *  fingerprint. Unlike recordOnce (which no-ops when a same-kind+path entry
 *  exists), this updates the recorded `hash` so a legitimately refreshed copy
 *  carries its CURRENT fingerprint. When `hash` is null (hashDir could not read
 *  the tree) the entry is recorded WITHOUT a `hash` field — NEVER persist null/''
 *  (a hash-less entry is treated as unverifiable → preserved, the safe direction).
 *  @param {object} [manifest] @param {string} linkPath @param {string|null} hash */
function recordCopiedSkill(manifest, linkPath, hash) {
  if (!manifest) return;
  if (!Array.isArray(manifest.entries)) manifest.entries = [];
  const existing = manifest.entries.find(
    (e) => e.kind === 'copied-skill' && e.path === linkPath
  );
  const entry = existing || { kind: 'copied-skill', path: linkPath };
  if (typeof hash === 'string') entry.hash = hash;
  else delete entry.hash;
  if (!existing) manifest.entries.push(entry);
}

/**
 * Build the sentinel-delimited managed block from a digest string. Neutralize any
 * digest LINE that trims exactly to a sentinel so the emitted block always has
 * exactly ONE begin/end pair — otherwise a self-wedge: the next sync/uninstall
 * would see two markers, hit the single-pair invariant, and fail closed on
 * Wienerdog's own output. Only a full-line sentinel is touched (colon → space);
 * inline mentions are already safe under full-line matching, and a normal digest
 * is unchanged (golden output stays byte-identical).
 * @param {string} digest
 * @returns {string} begin sentinel + neutralized digest.trimEnd() + end sentinel, no trailing newline.
 */
function buildBlock(digest) {
  const safeDigest = digest
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (t === BEGIN) return line.replace(BEGIN, '<!-- wienerdog begin -->'); // colon → space: no longer a sentinel
      if (t === END) return line.replace(END, '<!-- wienerdog end -->');
      return line;
    })
    .join('\n');
  return `${BEGIN}\n${safeDigest.trimEnd()}\n${END}`;
}

/**
 * Step 1 — write the managed block into a target markdown file (Claude's
 * CLAUDE.md or Codex's AGENTS.md).
 * @param {string} mdPath
 * @param {string} digest
 * @param {boolean} dryRun
 * @param {object} [manifest]
 * @param {{changed: string[], unchanged: string[], notices: string[]}} out
 */
function applyManagedBlock(mdPath, digest, dryRun, manifest, out) {
  const block = buildBlock(digest);
  let current = null;
  try {
    current = fs.readFileSync(mdPath, 'utf8');
  } catch {
    current = null;
  }

  if (current === null) {
    // File absent → create it holding exactly the block + newline.
    const next = `${block}\n`;
    if (!dryRun) {
      fs.mkdirSync(path.dirname(mdPath), { recursive: true });
      fs.writeFileSync(mdPath, next);
    }
    recordOnce(manifest, { kind: 'managed-block', path: mdPath, createdFile: true });
    out.changed.push(mdPath);
    return;
  }

  const span = locateManagedBlock(current, mdPath); // may throw on ambiguous markers
  if (span) {
    // Replace everything from begin sentinel through end sentinel (inclusive).
    const before = current.slice(0, span.begin);
    const after = current.slice(span.end);
    const next = `${before}${block}${after}`;
    if (next === current) {
      out.unchanged.push(mdPath);
    } else {
      if (!dryRun) fs.writeFileSync(mdPath, next);
      out.changed.push(mdPath);
    }
    // Manifest entry (if any) already exists from a prior run; do not re-record.
    recordOnce(manifest, { kind: 'managed-block', path: mdPath, createdFile: false });
    return;
  }

  // File present without sentinels → append with exactly one blank-line separator.
  const base = current.replace(/\n+$/, '');
  const next = `${base}\n\n${block}\n`;
  if (!dryRun) fs.writeFileSync(mdPath, next);
  recordOnce(manifest, { kind: 'managed-block', path: mdPath, createdFile: false });
  out.changed.push(mdPath);
}

/**
 * Copy a hook script into core/bin with mode 0755, idempotently.
 * @param {string} src
 * @param {string} dest
 * @param {boolean} dryRun
 * @param {object} [manifest]
 * @param {{changed: string[], unchanged: string[], notices: string[]}} out
 */
function copyHookScript(src, dest, dryRun, manifest, out) {
  const desired = fs.readFileSync(src);
  let same = false;
  try {
    same = fs.readFileSync(dest).equals(desired);
  } catch {
    same = false;
  }
  if (same) {
    out.unchanged.push(dest);
  } else {
    if (!dryRun) {
      fs.writeFileSync(dest, desired, { mode: 0o755 });
      fs.chmodSync(dest, 0o755);
    }
    out.changed.push(dest);
  }
  recordOnce(manifest, { kind: 'file', path: dest });
}

/** Normalize a hook command's path separators to forward slashes. Claude Code and
 *  Codex run command hooks through bash on Windows, where an unquoted backslash is an
 *  escape char (C:\Users\… collapses to C:Users…, ENOENT). Forward slashes are valid
 *  for bash AND the Windows API, so we register the forward-slash form on EVERY
 *  platform — a no-op on POSIX, where paths already use '/'. One code path, no
 *  platform branch (WP-077).
 *  @param {string} command
 *  @returns {string}
 */
function toPosixCommand(command) {
  return String(command).replace(/\\/g, '/');
}

/** Wrap a (forward-slash-normalized) script path so bash runs it as ONE argument
 *  even when it contains spaces or shell metacharacters. Single-quotes are the
 *  strongest bash quoting (no interpolation); an embedded ' is closed, escaped,
 *  reopened. Valid on POSIX bash AND the bash the Windows harnesses shell out to
 *  (WP-077). Idempotent input → identical output, so prune/present comparisons and
 *  the recorded manifest command all use this one canonical form.
 *  @param {string} rawCommand @returns {string} */
function shellQuoteCommand(rawCommand) {
  const p = toPosixCommand(rawCommand);
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

/**
 * Merge command hooks into a JSON file's `.hooks`, dedup by command path.
 * @param {string} settingsPath  target JSON file (Claude settings.json OR Codex hooks.json)
 * @param {Array<[string, string]>} events  e.g. [['SessionStart', startAbs], ['Stop', stopAbs]]
 * @param {boolean} dryRun
 * @param {object} [manifest]
 * @param {{changed: string[], unchanged: string[], notices: string[]}} out
 */
function applySettings(settingsPath, events, dryRun, manifest, out) {
  let raw = null;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch {
    raw = null;
  }
  const createdFile = raw === null;
  /** @type {any} */
  let settings = {};
  if (!createdFile) {
    settings = JSON.parse(raw);
    if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
      settings = {};
    }
  }

  if (typeof settings.hooks !== 'object' || settings.hooks === null || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }

  let changed = false;
  for (const [event, rawCommand] of events) {
    const command = shellQuoteCommand(rawCommand);
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];

    // Prune stale variants of OUR command (a bare, backslash, or forward-slash-
    // unquoted entry written by a pre-fix version). Match strictly on the
    // re-quoted path being ours while the raw string differs — a user's
    // unrelated hook never re-quotes to our path, so it is never touched. An
    // already-canonical entry re-quotes to itself, so `h.command !== command`
    // excludes it here; it is picked up by the `present` check below instead.
    // Drop a group whose hooks array is emptied.
    const before = settings.hooks[event];
    const pruned = [];
    for (const group of before) {
      if (!group || !Array.isArray(group.hooks)) {
        pruned.push(group);
        continue;
      }
      const keptHooks = group.hooks.filter(
        (h) => !(h && shellQuoteCommand(h.command) === command && h.command !== command)
      );
      if (keptHooks.length !== group.hooks.length) {
        changed = true;
        if (keptHooks.length === 0) continue; // drop the emptied group
        pruned.push({ ...group, hooks: keptHooks });
      } else {
        pruned.push(group);
      }
    }
    settings.hooks[event] = pruned;

    const present = settings.hooks[event].some(
      (group) =>
        group &&
        Array.isArray(group.hooks) &&
        group.hooks.some((h) => h && h.command === command)
    );
    if (!present) {
      settings.hooks[event].push({
        matcher: '*',
        hooks: [{ type: 'command', command, timeout: 10 }],
      });
      changed = true;
    }
  }

  if (changed) {
    if (!dryRun) fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    out.changed.push(settingsPath);
  } else {
    out.unchanged.push(settingsPath);
  }
  recordOnce(manifest, {
    kind: 'settings-entry',
    path: settingsPath,
    createdFile,
    commands: events.map(([, c]) => shellQuoteCommand(c)),
  });
}

/** Deep-equal two directory trees: identical relative entry set + file bytes.
 *  @param {string} a @param {string} b @returns {boolean} */
function dirsEqual(a, b) {
  const listRel = (root) => {
    const acc = [];
    const walk = (dir, prefix) => {
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents.slice().sort((x, y) => x.name.localeCompare(y.name))) {
        const rp = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) { acc.push(`d:${rp}`); walk(path.join(dir, e.name), rp); }
        else acc.push(`f:${rp}`);
      }
    };
    walk(root, '');
    return acc;
  };
  const ra = listRel(a);
  const rb = listRel(b);
  if (ra.length !== rb.length || ra.some((v, i) => v !== rb[i])) return false;
  for (const entry of ra) {
    if (!entry.startsWith('f:')) continue;
    const relParts = entry.slice(2).split('/');
    if (!fs.readFileSync(path.join(a, ...relParts)).equals(fs.readFileSync(path.join(b, ...relParts)))) {
      return false;
    }
  }
  return true;
}

/** Step 3 — register each core skill dir into a harness's skills dir. Prefers a
 *  symlink; where symlink creation is unpermitted (Windows without privilege:
 *  EPERM/EACCES) falls back to COPYING the folder so /wienerdog-* still
 *  registers. A copied dir is recorded as `copied-skill` (reversed by recursive
 *  removal). A prior copy (a wienerdog-* directory at the target) is refreshed
 *  when its content differs from the source.
 *  @param {string} skillsDir core skills dir
 *  @param {string} targetSkillsDir the harness's skills dir
 *  @param {boolean} dryRun
 *  @param {object} [manifest]
 *  @param {{changed: string[], unchanged: string[], notices: string[]}} out
 *  @param {{symlink?: (target: string, path: string) => void}} [opts]
 *    test seam only; defaults to fs.symlinkSync. */
function applySkillLinks(skillsDir, targetSkillsDir, dryRun, manifest, out, opts = {}) {
  const symlink = opts.symlink || fs.symlinkSync;

  let names = [];
  try {
    names = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => (d.isDirectory() || d.isSymbolicLink()) && d.name.startsWith('wienerdog-'))
      .map((d) => d.name);
  } catch {
    names = [];
  }
  if (names.length === 0) return;

  // Ensure the target skills dir exists.
  if (!fs.existsSync(targetSkillsDir)) {
    if (!dryRun) fs.mkdirSync(targetSkillsDir, { recursive: true });
    recordOnce(manifest, { kind: 'dir', path: targetSkillsDir });
  }

  for (const name of names) {
    const target = path.join(skillsDir, name);
    const linkPath = path.join(targetSkillsDir, name);
    let stat = null;
    try {
      stat = fs.lstatSync(linkPath);
    } catch {
      stat = null;
    }

    if (stat !== null && stat.isSymbolicLink()) {
      let currentTarget = null;
      try {
        currentTarget = fs.readlinkSync(linkPath);
      } catch {
        currentTarget = null;
      }
      if (currentTarget === target) {
        out.unchanged.push(linkPath);
        recordOnce(manifest, { kind: 'symlink', path: linkPath });
      } else {
        if (!dryRun) {
          fs.unlinkSync(linkPath);
          symlink(target, linkPath);
        }
        recordOnce(manifest, { kind: 'symlink', path: linkPath });
        out.changed.push(linkPath);
      }
    } else if (stat !== null && stat.isDirectory()) {
      // A directory in the wienerdog-* namespace. Refresh it ONLY when its on-disk
      // fingerprint still matches the hash WE recorded for it (proof it is our own
      // unmodified copy). A mismatch — the user edited/replaced it — or a directory
      // we never recorded (a pre-existing user dir; a legacy hash-less entry) is NOT
      // provably ours, so PRESERVE it untouched with a notice; NEVER rmSync+recopy
      // (that was the destroy-user-edits P0).
      const recorded =
        manifest && Array.isArray(manifest.entries)
          ? manifest.entries.find((e) => e.kind === 'copied-skill' && e.path === linkPath)
          : null;
      const onDisk = hashDir(linkPath);
      if (recorded && typeof recorded.hash === 'string' && onDisk !== null && onDisk === recorded.hash) {
        // Provably our own unmodified copy → converge it to the current source.
        const sourceHash = hashDir(target);
        if (sourceHash !== null && sourceHash !== onDisk) {
          if (!dryRun) {
            fs.rmSync(linkPath, { recursive: true, force: true });
            fs.cpSync(target, linkPath, { recursive: true });
          }
          out.changed.push(linkPath);
          recordCopiedSkill(manifest, linkPath, sourceHash);
        } else {
          // Source unchanged (or momentarily unreadable) → leave our copy in place.
          out.unchanged.push(linkPath);
          recordCopiedSkill(manifest, linkPath, onDisk);
        }
      } else {
        out.notices.push(
          `left skill directory untouched (not a recorded Wienerdog copy, or modified since — delete it to let sync re-copy): ${linkPath}`
        );
      }
    } else if (stat !== null) {
      // Regular file the user owns — never clobber.
      out.notices.push(`left user file untouched: ${linkPath}`);
    } else if (dryRun) {
      // A dry run does not probe symlink permission; report the common case.
      recordOnce(manifest, { kind: 'symlink', path: linkPath });
      out.changed.push(linkPath);
    } else {
      // Absent: prefer a symlink; copy where symlink creation is unpermitted.
      try {
        symlink(target, linkPath);
        recordOnce(manifest, { kind: 'symlink', path: linkPath });
      } catch (err) {
        if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
          fs.cpSync(target, linkPath, { recursive: true });
          recordCopiedSkill(manifest, linkPath, hashDir(linkPath));
        } else {
          throw err;
        }
      }
      out.changed.push(linkPath);
    }
  }
}

module.exports = { recordOnce, buildBlock, applyManagedBlock, copyHookScript, toPosixCommand, applySettings, applySkillLinks };
