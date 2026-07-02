'use strict';

const fs = require('node:fs');
const path = require('node:path');
const shared = require('./shared');

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
  shared.applyManagedBlock(claudeMd, digest, dryRun, manifest, out);

  // Step 2 — hook scripts + settings.json.
  const startSrc = path.resolve(__dirname, '..', '..', 'templates', 'hooks', 'session-start.sh');
  const endSrc = path.resolve(__dirname, '..', '..', 'templates', 'hooks', 'session-end.sh');
  const startAbs = path.join(binDir, 'session-start.sh');
  const endAbs = path.join(binDir, 'session-end.sh');

  if (!fs.existsSync(binDir)) {
    if (!dryRun) fs.mkdirSync(binDir, { recursive: true });
    shared.recordOnce(manifest, { kind: 'dir', path: binDir });
  }
  shared.copyHookScript(startSrc, startAbs, dryRun, manifest, out);
  shared.copyHookScript(endSrc, endAbs, dryRun, manifest, out);
  shared.applySettings(settingsPath, [['SessionStart', startAbs], ['SessionEnd', endAbs]], dryRun, manifest, out);

  // Step 3 — skill symlinks.
  shared.applySkillLinks(skillsDir, claudeSkillsDir, dryRun, manifest, out);

  return out;
}

module.exports = { applyClaudeAdapter };
