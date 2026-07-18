'use strict';

const fs = require('node:fs');
const path = require('node:path');
const shared = require('./shared');
const { WienerdogError } = require('../core/errors');

/**
 * Apply the Codex CLI adapter idempotently.
 *
 * The AGENTS.md managed block holds the whole digest so a Codex session has
 * its context even with zero (or untrusted) hooks; the SessionStart/Stop
 * hooks are enrichment only. Correctness never depends on a hook firing.
 * Ground-truth transcript capture is rollout-file scanning (WP-007), which
 * works with zero hooks trusted.
 *
 * @param {ReturnType<import('../core/paths').getPaths>} paths
 * @param {{dryRun?: boolean, manifest?: object, skipManagedBlock?: boolean}} [opts]
 * @returns {{changed: string[], unchanged: string[], notices: string[]}}
 *  Steps (each idempotent; on dryRun make NO writes, still report intended changes):
 *    1. Managed block in <codexDir>/AGENTS.md ← contents of <state>/digest.md.
 *       Requires a vault/digest: skipped when opts.skipManagedBlock is set, or
 *       (with a notice) when <state>/digest.md is absent. If
 *       <codexDir>/AGENTS.override.md exists, push a NOTICE: our AGENTS.md is
 *       silently shadowed by the override (research fact) — user must merge manually.
 *    2. Copy session-start.sh + codex-session-end.sh into <core>/bin/ (0755); register
 *       SessionStart + Stop command hooks in <codexDir>/hooks.json (settings-entry).
 *       Push a NOTICE: Codex requires trusting new hooks via `/hooks` before they run;
 *       the AGENTS.md block already carries the digest so context works regardless.
 *    3. Symlink each <core>/skills/wienerdog-* into <codexDir>/skills/ (Codex's
 *       user-scope skill-discovery root — $CODEX_HOME/skills, default
 *       ~/.codex/skills; NOT ~/.agents/skills, which current Codex uses only for
 *       the plugin marketplace — WP-078). Only wienerdog-* entries are created or
 *       adopted; Codex's own ~/.codex/skills/.system/ is never read or modified.
 *       Then push a NOTICE that Codex skills are not slash commands: /skills to
 *       list them, $wienerdog-setup (or plain language) to start one.
 *  Steps 2-3 carry no user knowledge and ALWAYS run; only Step 1 is gated on a
 *  vault/digest. Never throws on a missing digest. Records new entries in
 *  opts.manifest.
 */
function applyCodexAdapter(paths, opts = {}) {
  const dryRun = opts.dryRun === true;
  const skipManagedBlock = opts.skipManagedBlock === true;
  const manifest = opts.manifest;
  /** @type {{changed: string[], unchanged: string[], notices: string[]}} */
  const out = { changed: [], unchanged: [], notices: [] };

  const binDir = path.join(paths.core, 'bin');
  const skillsDir = path.join(paths.core, 'skills');
  const agentsMd = path.join(paths.codexDir, 'AGENTS.md');
  const overridePath = path.join(paths.codexDir, 'AGENTS.override.md');
  const hooksPath = path.join(paths.codexDir, 'hooks.json');
  const codexSkillsDir = path.join(paths.codexDir, 'skills'); // Codex user-scope skill-discovery root ($CODEX_HOME/skills, default ~/.codex/skills)
  const digestPath = path.join(paths.state, 'digest.md');
  const startSrc = path.resolve(__dirname, '..', '..', 'templates', 'hooks', 'session-start.sh');
  const stopSrc = path.resolve(__dirname, '..', '..', 'templates', 'hooks', 'codex-session-end.sh');
  const startAbs = path.join(binDir, 'session-start.sh');
  const stopAbs = path.join(binDir, 'codex-session-end.sh');

  // Step 1 — managed block. Requires a vault/digest; skipped on a no-vault
  // machine. Skills + hooks (Steps 2-3) carry no user knowledge and ALWAYS run.
  if (!skipManagedBlock) {
    let digest = null;
    try {
      digest = fs.readFileSync(digestPath, 'utf8');
    } catch {
      digest = null;
    }
    if (digest !== null) {
      try {
        shared.applyManagedBlock(agentsMd, digest, dryRun, manifest, out);
        // Success-only by design (spec implementation note): the override notice
        // need not fire when the block could not be updated.
        if (fs.existsSync(overridePath)) {
          out.notices.push(
            "~/.codex/AGENTS.override.md exists — it shadows Wienerdog's AGENTS.md; merge the managed block manually or remove the override"
          );
        }
      } catch (err) {
        if (err instanceof WienerdogError) {
          // Ambiguous / hand-broken sentinels in the user's markdown. Do NOT abort the
          // whole sync — the hook + skill reconciliation below is independent and
          // provably safe. Surface the problem and continue (audit A13).
          out.notices.push(
            `managed block not updated in ${agentsMd} — ${err.message}; hooks + skills still installed. Resolve the markers by hand, then re-run 'wienerdog sync'.`
          );
        } else {
          throw err; // a non-ambiguity error (e.g. an unexpected I/O fault) is NOT swallowed
        }
      }
    } else {
      out.notices.push(
        `digest not found at ${digestPath}; managed block skipped (hooks + skills still installed)`
      );
    }
  }

  // Step 2 — hook scripts + hooks.json.
  if (!fs.existsSync(binDir)) {
    if (!dryRun) fs.mkdirSync(binDir, { recursive: true });
    shared.recordOnce(manifest, { kind: 'dir', path: binDir });
  }
  shared.copyHookScript(startSrc, startAbs, dryRun, manifest, out);
  shared.copyHookScript(stopSrc, stopAbs, dryRun, manifest, out);
  shared.applySettings(hooksPath, [['SessionStart', startAbs], ['Stop', stopAbs]], dryRun, manifest, out);
  out.notices.push(
    "Codex requires trusting new hooks via `/hooks` before they run; the AGENTS.md block already carries the digest so context works regardless"
  );

  // Step 3 — skill symlinks + Codex skill-invocation notice.
  shared.applySkillLinks(skillsDir, codexSkillsDir, dryRun, manifest, out);
  out.notices.push(
    "In Codex, skills aren't slash commands — type /skills to see them, then start one by typing $wienerdog-setup or just asking in plain words (there is no /wienerdog-setup command)."
  );

  return out;
}

module.exports = { applyCodexAdapter };
