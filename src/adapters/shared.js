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

  const begin = current.indexOf(BEGIN);
  const end = current.indexOf(END);
  if (begin !== -1 && end !== -1 && end > begin) {
    // Replace everything from begin sentinel through end sentinel (inclusive).
    const before = current.slice(0, begin);
    const after = current.slice(end + END.length);
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
    commands: events.map(([, command]) => command),
  });
}

/**
 * Step 3 — symlink each core skill dir into a target harness's skills dir.
 * @param {string} skillsDir core skills dir
 * @param {string} targetSkillsDir the harness's skills dir
 * @param {boolean} dryRun
 * @param {object} [manifest]
 * @param {{changed: string[], unchanged: string[], notices: string[]}} out
 */
function applySkillLinks(skillsDir, targetSkillsDir, dryRun, manifest, out) {
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

module.exports = { recordOnce, buildBlock, applyManagedBlock, copyHookScript, applySettings, applySkillLinks };
