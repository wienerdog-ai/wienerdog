'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { readVaultLayout } = require('../core/layout');
const idApprovals = require('../core/identity-approvals');
const { parse } = require('../core/frontmatter');
const { readScalar } = require('../core/dream/config');
const { defaultPrompt } = require('./grant');

/**
 * `wienerdog memory approve <file>` — the ONLY way to change an already-seeded
 * identity file's approved hash (audit A3, ADR-0021). The identity analog of
 * `wienerdog grant` (ADR-0007): the security boundary is a typed-word
 * confirmation read from a REAL controlling terminal, with NO headless /
 * `--yes` / environment bypass — so no skill, hook, dream, or scheduled job can
 * ratify identity bytes. It shows the exact bytes it is about to approve and
 * any provenance frontmatter (as EVIDENCE, never as authorization), then
 * records the exact-byte hash with `source: 'approved'`.
 */

/** Fixed allowlist: short name / basename → canonical basename. No arbitrary
 *  path, `..`, or `/` ever reaches the filesystem — an unknown value is
 *  rejected before any read. */
const KNOWN = {
  profile: 'profile.md',
  preferences: 'preferences.md',
  goals: 'goals.md',
  instructions: 'instructions.md',
};

/** Provenance fields shown to the human (evidence only — never authorization). */
const EVIDENCE_FIELDS = ['derived_from_untrusted', 'source_sessions', 'confidence', 'recurrence'];

/**
 * Read the configured vault path from config.yaml via the ONE shared scalar
 * reader (WP-115 convention). Returns null when unset/empty/`null`.
 * @param {string} configFile
 * @returns {string|null}
 */
function readVaultPath(configFile) {
  let body;
  try {
    body = fs.readFileSync(configFile, 'utf8');
  } catch {
    return null;
  }
  const value = readScalar(body, 'vault');
  return value === null || value === '' || value === 'null' ? null : value;
}

/**
 * @param {string[]} argv
 * @param {{promptFn?: (q: string) => Promise<string>,
 *          paths?: import('../core/paths').WienerdogPaths}} [opts]
 *   promptFn/paths are code-level test seams only (the grant.js model); the
 *   default prompt is TTY-only and `--yes` is never honored.
 * @returns {Promise<void>}
 */
async function run(argv, opts = {}) {
  const promptFn = opts.promptFn || defaultPrompt;
  const paths = opts.paths || getPaths();

  const verb = argv[0];
  if (verb !== 'approve') {
    throw new WienerdogError(`unknown memory command '${verb || ''}' — only 'approve' is supported`);
  }

  const arg = argv[1] || '';
  const all = arg === '--all';
  // Own-property lookup only: a plain-object bracket read would resolve
  // inherited prototype members (toString, constructor, …) and leak past the
  // allowlist to a filesystem read (reviewer finding, WP-117).
  const basename = Object.prototype.hasOwnProperty.call(KNOWN, arg)
    ? KNOWN[arg]
    : Object.values(KNOWN).includes(arg)
      ? arg
      : null;
  if (!all && !basename) {
    throw new WienerdogError('approve which identity note? one of: profile, preferences, goals, instructions — or --all');
  }

  const vaultDir = readVaultPath(paths.config);
  if (!vaultDir) throw new WienerdogError('no vault configured — run /wienerdog-setup first');
  const layout = readVaultLayout(paths.config);
  const registry = idApprovals.readRegistry(paths.state);
  const approvals = idApprovals.approvalsMap(registry);
  const out = process.stdout;

  // The target set: --all iterates the FIXED KNOWN allowlist (never an arbitrary
  // path); a single approve targets one allowlisted basename. For each, read the
  // exact bytes and compare to any recorded approval.
  const targets = all ? Object.values(KNOWN) : [basename];
  /** @type {Array<{rel:string, basename:string, bytes:Buffer, approvedHash:string|undefined}>} */
  const pending = [];
  for (const bn of targets) {
    const rel = `${layout.identity_dir}/${bn}`;
    let bytes;
    try {
      bytes = fs.readFileSync(path.join(vaultDir, rel));
    } catch {
      // --all silently skips a note that does not exist on disk; a single
      // approve of a missing note is an error, as before.
      if (all) continue;
      throw new WienerdogError(`identity file not found: ${rel}`);
    }
    const approvedHash = approvals[idApprovals.foldKey(rel)];
    if (idApprovals.hashBytes(bytes) === approvedHash) continue; // already approved → skip
    pending.push({ rel, basename: bn, bytes, approvedHash });
  }

  if (pending.length === 0) {
    out.write(
      all
        ? 'wienerdog: all identity notes are already approved (no change).\n'
        : `wienerdog: "${basename}" is already approved (no change).\n`
    );
    return;
  }

  // Display EXACTLY what will be approved for EACH note — the full bytes, then
  // provenance as evidence. The human decides by reading the actual text; a
  // forged `false/0.9/3` frontmatter changes nothing about what gets ratified.
  // One typed-word confirmation ratifies the batch: the see-the-bytes boundary
  // is preserved (every note's bytes are shown), only the prompt count drops.
  for (const p of pending) {
    out.write(`You are about to approve the CURRENT exact bytes of ${p.rel}:\n`);
    out.write('----------------------------------------------------------------\n');
    out.write(p.bytes.toString('utf8'));
    if (!p.bytes.toString('utf8').endsWith('\n')) out.write('\n');
    out.write('----------------------------------------------------------------\n');
    const fm = parse(p.bytes.toString('utf8'));
    for (const field of EVIDENCE_FIELDS) {
      if (fm.fields.has(field)) {
        out.write(`  ${field}: ${fm.fields.get(field)} (evidence only — not proof)\n`);
      }
    }
    if (p.approvedHash !== undefined) {
      out.write('This REPLACES the previously approved version of this note.\n');
    }
  }

  const noun = pending.length === 1 ? 'these exact bytes' : `these ${pending.length} notes' exact bytes`;
  const answer = await promptFn(`Type the word "approve" to confirm ${noun} (anything else cancels): `);
  if (String(answer).trim() !== 'approve') {
    out.write('Cancelled.\n');
    return;
  }

  for (const p of pending) idApprovals.recordApproval(paths.state, vaultDir, p.rel, 'approved');
  const names = pending.map((p) => `"${p.basename}"`).join(', ');
  out.write(
    `wienerdog: approved ${names} — ${pending.length === 1 ? 'it' : 'they'} will be injected into your session digest on the next \`wienerdog sync\`.\n`
  );
}

module.exports = { run };
