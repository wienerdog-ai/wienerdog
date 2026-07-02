'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BEGIN = '<!-- wienerdog:begin -->';
const END = '<!-- wienerdog:end -->';

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

/**
 * Build the sentinel-delimited managed block from a digest string.
 * @param {string} digest
 * @returns {string} begin sentinel + digest.trimEnd() + end sentinel, no trailing newline.
 */
function buildBlock(digest) {
  return `${BEGIN}\n${digest.trimEnd()}\n${END}`;
}

/**
 * Step 1 — write the managed block into <claudeDir>/CLAUDE.md.
 * @param {string} claudeMd
 * @param {string} digest
 * @param {boolean} dryRun
 * @param {object} [manifest]
 * @param {{changed: string[], unchanged: string[], notices: string[]}} out
 */
function applyManagedBlock(claudeMd, digest, dryRun, manifest, out) {
  const block = buildBlock(digest);
  let current = null;
  try {
    current = fs.readFileSync(claudeMd, 'utf8');
  } catch {
    current = null;
  }

  if (current === null) {
    // File absent → create it holding exactly the block + newline.
    const next = `${block}\n`;
    if (!dryRun) {
      fs.mkdirSync(path.dirname(claudeMd), { recursive: true });
      fs.writeFileSync(claudeMd, next);
    }
    recordOnce(manifest, { kind: 'managed-block', path: claudeMd, createdFile: true });
    out.changed.push(claudeMd);
    return;
  }

  const begin = current.indexOf(BEGIN);
  const end = current.indexOf(END);
  if (begin !== -1 && end !== -1 && end > begin) {
    // Replace everything from begin sentinel through end sentinel (inclusive).
    const before = current.slice(0, begin);
    const after = current.slice(end + END.length);
    const next = `${before}${block}${after}`;
    if (next === current) {
      out.unchanged.push(claudeMd);
    } else {
      if (!dryRun) fs.writeFileSync(claudeMd, next);
      out.changed.push(claudeMd);
    }
    // Manifest entry (if any) already exists from a prior run; do not re-record.
    recordOnce(manifest, { kind: 'managed-block', path: claudeMd, createdFile: false });
    return;
  }

  // File present without sentinels → append with exactly one blank-line separator.
  const base = current.replace(/\n+$/, '');
  const next = `${base}\n\n${block}\n`;
  if (!dryRun) fs.writeFileSync(claudeMd, next);
  recordOnce(manifest, { kind: 'managed-block', path: claudeMd, createdFile: false });
  out.changed.push(claudeMd);
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

/**
 * Step 2 — register SessionStart + SessionEnd hooks in settings.json, merging
 * without clobbering the user's existing hooks.
 * @param {string} settingsPath
 * @param {string} startAbs absolute path to session-start.sh in core/bin
 * @param {string} endAbs absolute path to session-end.sh in core/bin
 * @param {boolean} dryRun
 * @param {object} [manifest]
 * @param {{changed: string[], unchanged: string[], notices: string[]}} out
 */
function applySettings(settingsPath, startAbs, endAbs, dryRun, manifest, out) {
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
  const events = [
    ['SessionStart', startAbs],
    ['SessionEnd', endAbs],
  ];
  for (const [event, command] of events) {
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
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
    commands: [startAbs, endAbs],
  });
}

/**
 * Step 3 — symlink each core skill dir into <claudeDir>/skills.
 * @param {string} skillsDir core skills dir
 * @param {string} claudeSkillsDir <claudeDir>/skills
 * @param {boolean} dryRun
 * @param {object} [manifest]
 * @param {{changed: string[], unchanged: string[], notices: string[]}} out
 */
function applySkillLinks(skillsDir, claudeSkillsDir, dryRun, manifest, out) {
  if (process.platform === 'win32') {
    out.notices.push('skill linking unsupported on Windows in v1');
    return;
  }

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

  // Ensure <claudeDir>/skills exists.
  if (!fs.existsSync(claudeSkillsDir)) {
    if (!dryRun) fs.mkdirSync(claudeSkillsDir, { recursive: true });
    recordOnce(manifest, { kind: 'dir', path: claudeSkillsDir });
  }

  for (const name of names) {
    const target = path.join(skillsDir, name);
    const linkPath = path.join(claudeSkillsDir, name);
    let stat = null;
    try {
      stat = fs.lstatSync(linkPath);
    } catch {
      stat = null;
    }

    if (stat === null) {
      if (!dryRun) fs.symlinkSync(target, linkPath);
      recordOnce(manifest, { kind: 'symlink', path: linkPath });
      out.changed.push(linkPath);
    } else if (stat.isSymbolicLink()) {
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
          fs.symlinkSync(target, linkPath);
        }
        recordOnce(manifest, { kind: 'symlink', path: linkPath });
        out.changed.push(linkPath);
      }
    } else {
      // Regular file/dir the user owns — never clobber.
      out.notices.push(`left user file untouched: ${linkPath}`);
    }
  }
}

/**
 * Apply the Claude Code adapter idempotently.
 *
 * The managed block holds the whole digest so a Claude Code session has its
 * context even with zero hooks; the SessionStart hook is enrichment only
 * (fresher digest between syncs). Correctness never depends on a hook firing.
 *
 * @param {ReturnType<import('../core/paths').getPaths>} paths
 * @param {{dryRun?: boolean, manifest?: object}} [opts]
 * @returns {{changed: string[], unchanged: string[], notices: string[]}}
 *  Steps (each idempotent; on dryRun make NO writes, still report intended changes):
 *    1. Managed block in <claudeDir>/CLAUDE.md ← contents of <state>/digest.md
 *    2. Copy hook scripts to <core>/bin/; register SessionStart + SessionEnd in
 *       <claudeDir>/settings.json (merge, never clobber the user's other hooks)
 *    3. Symlink each <core>/skills/wienerdog-* into <claudeDir>/skills/
 *  Records new entries in opts.manifest (never duplicates an existing kind+path).
 *  `changed` / `unchanged` list absolute paths acted on; `notices` are warnings.
 *  Never throws on a missing digest — if <state>/digest.md is absent, return
 *  early with a notice (sync writes it first).
 */
function applyClaudeAdapter(paths, opts = {}) {
  const dryRun = opts.dryRun === true;
  const manifest = opts.manifest;
  /** @type {{changed: string[], unchanged: string[], notices: string[]}} */
  const out = { changed: [], unchanged: [], notices: [] };

  const binDir = path.join(paths.core, 'bin');
  const skillsDir = path.join(paths.core, 'skills');
  const claudeMd = path.join(paths.claudeDir, 'CLAUDE.md');
  const settingsPath = path.join(paths.claudeDir, 'settings.json');
  const claudeSkillsDir = path.join(paths.claudeDir, 'skills');
  const digestPath = path.join(paths.state, 'digest.md');

  let digest;
  try {
    digest = fs.readFileSync(digestPath, 'utf8');
  } catch {
    out.notices.push(`digest not found at ${digestPath}; skipping Claude adapter`);
    return out;
  }

  // Step 1 — managed block.
  applyManagedBlock(claudeMd, digest, dryRun, manifest, out);

  // Step 2 — hook scripts + settings.json.
  const startSrc = path.resolve(__dirname, '..', '..', 'templates', 'hooks', 'session-start.sh');
  const endSrc = path.resolve(__dirname, '..', '..', 'templates', 'hooks', 'session-end.sh');
  const startAbs = path.join(binDir, 'session-start.sh');
  const endAbs = path.join(binDir, 'session-end.sh');

  if (!fs.existsSync(binDir)) {
    if (!dryRun) fs.mkdirSync(binDir, { recursive: true });
    recordOnce(manifest, { kind: 'dir', path: binDir });
  }
  copyHookScript(startSrc, startAbs, dryRun, manifest, out);
  copyHookScript(endSrc, endAbs, dryRun, manifest, out);
  applySettings(settingsPath, startAbs, endAbs, dryRun, manifest, out);

  // Step 3 — skill symlinks.
  applySkillLinks(skillsDir, claudeSkillsDir, dryRun, manifest, out);

  return out;
}

module.exports = { applyClaudeAdapter };
