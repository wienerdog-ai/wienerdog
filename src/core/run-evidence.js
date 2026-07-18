'use strict';

/**
 * Hermetic-run evidence (audit A1 point 8, ADR-0025, WP-132). One bounded,
 * secret-free JSONL record per headless model run, so the run's actual
 * runtime posture (version, executable, profile, argv, digests, managed-
 * policy state) is auditable after the fact. Evidence records the version +
 * resolved executable path, NEVER a content hash of the `claude` binary —
 * executable integrity is A7's boundary (D-EVIDENCE, OWNER-APPROVED
 * 2026-07-18).
 *
 * Best-effort by contract: recordRunEvidence NEVER throws — an evidence
 * failure must not fail the job.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { redactOnly } = require('./secret-scan');
const { writeFilePrivate } = require('./private-fs');

const EVIDENCE_FILE = 'run-evidence.jsonl';
const MAX_RECORDS = 200; // keep only the most-recent N records (mirrors alerts.jsonl / WP-096)
const MAX_FILE_BYTES = 512 * 1024; // hard byte bound on the evidence file

/** The argv flags whose VALUES are free text that can echo staged content
 *  (the prompt, the appended skill body). Those values are NEVER stored raw —
 *  each is reduced to a sha256 placeholder. */
const FREE_TEXT_FLAGS = new Set(['-p', '--append-system-prompt']);

/**
 * @typedef {Object} RunEvidence
 * @property {string} at            ISO timestamp
 * @property {string} job           'dream' | routine name
 * @property {string} profileId     the hermetic profile id
 * @property {string} claudeVersion output of `claude --version` (captured by the caller; 'unknown' on failure)
 * @property {string} execPath      resolved path/name of the spawned executable
 * @property {string[]} argv        the composed argv (free-text values reduced to sha256 here)
 * @property {string} settingsDigest  sha256 of the --settings file, or 'missing'
 * @property {string} mcpDigest       sha256 of the --mcp-config file, or 'none'
 * @property {{present:boolean, sources:string[]}} policyHooks  managed-policy detection at this run
 */

/** @param {import('./paths').WienerdogPaths} paths @returns {string} */
function evidencePath(paths) {
  return path.join(paths.state, EVIDENCE_FILE);
}

/**
 * Reduce an argv to its secret-free evidence form: the value following a
 * free-text flag (`-p`, `--append-system-prompt`) becomes `sha256:<hex>`;
 * every other element (code-owned flags/paths) is kept, defensively scrubbed
 * through redactOnly. This module therefore never stores raw prompt/skill
 * bytes regardless of what the caller passes.
 * @param {string[]} argv
 * @returns {string[]}
 */
function sanitizeArgv(argv) {
  const out = [];
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i++) {
    const a = String(list[i]);
    out.push(redactOnly(a.slice(0, 2000)));
    if (FREE_TEXT_FLAGS.has(a) && i + 1 < list.length) {
      const hash = crypto.createHash('sha256').update(String(list[i + 1])).digest('hex');
      out.push(`sha256:${hash}`);
      i += 1;
    }
  }
  return out;
}

/** Coerce a caller record to the known evidence fields, bounded + scrubbed.
 *  @param {*} r @returns {RunEvidence} */
function sanitizeRecord(r) {
  const o = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  const scrub = (v) => redactOnly(String(v == null ? '' : v).slice(0, 2000));
  const hooks = o.policyHooks && typeof o.policyHooks === 'object' ? o.policyHooks : {};
  return {
    at: scrub(o.at),
    job: scrub(o.job),
    profileId: scrub(o.profileId),
    claudeVersion: scrub(o.claudeVersion),
    execPath: scrub(o.execPath),
    argv: sanitizeArgv(o.argv),
    settingsDigest: scrub(o.settingsDigest),
    mcpDigest: scrub(o.mcpDigest),
    policyHooks: {
      present: hooks.present === true,
      sources: (Array.isArray(hooks.sources) ? hooks.sources : []).slice(0, 20).map(scrub),
    },
  };
}

/**
 * Append a RunEvidence record to state/run-evidence.jsonl at 0600, bounded
 * (drop the oldest over the cap). Implemented as an atomic read-cap-rewrite
 * via writeFilePrivate (no appendFilePrivate exists in private-fs; the atomic
 * rewrite keeps the file 0600 on every write). NEVER throws — evidence is
 * best-effort and a failure must not fail the job.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {RunEvidence} rec
 */
function recordRunEvidence(paths, rec) {
  try {
    const file = evidencePath(paths);
    let lines = [];
    try {
      lines = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l.trim() !== '');
    } catch {
      lines = []; // missing/unreadable → start fresh (never lose the new record)
    }
    lines.push(JSON.stringify(sanitizeRecord(rec)));
    if (lines.length > MAX_RECORDS) lines = lines.slice(lines.length - MAX_RECORDS);
    let text = lines.join('\n') + '\n';
    while (lines.length > 1 && Buffer.byteLength(text) > MAX_FILE_BYTES) {
      lines = lines.slice(1); // drop oldest until the byte bound holds
      text = lines.join('\n') + '\n';
    }
    writeFilePrivate(file, text);
  } catch {
    // Best-effort: an evidence failure must never fail or mask the job.
  }
}

module.exports = { recordRunEvidence, EVIDENCE_FILE, MAX_RECORDS, MAX_FILE_BYTES };
