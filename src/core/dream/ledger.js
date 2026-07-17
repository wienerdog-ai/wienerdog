'use strict';

// The per-file transcript quarantine ledger (audit A6, ADR-0023). Replaces the
// scalar per-harness watermark with one record per transcript file, so the dream
// can distinguish *processed*, *capacity-deferred* (no record — retried next
// run), and *permanently-unprocessable* (quarantined — skipped until the file
// changes). Pure data + fs I/O; no env, no argv, no network, no model.

const fs = require('node:fs');
const path = require('node:path');
const { readWatermarks } = require('./watermarks');

const LEDGER_BASENAME = 'transcript-ledger.json';

/** Case-folded absolute-path key (ADR-0021/0023: path identity folded, content exact).
 *  @param {string} absPath @returns {string} */
function foldKey(absPath) {
  return String(path.resolve(absPath)).toLowerCase();
}

/** Content-independent fingerprint of a discovered file. Any change to size, mtime, device,
 *  or inode ⇒ a different string ⇒ "the file changed" ⇒ reprocess.
 *  @param {{size:number, mtimeMs:number, dev:number, ino:number}} d @returns {string} */
function fingerprint(d) {
  return `${d.size}:${d.mtimeMs}:${d.dev}:${d.ino}`;
}

/** @param {string} stateDir @returns {string} */
function ledgerPath(stateDir) {
  return path.join(stateDir, LEDGER_BASENAME);
}

/**
 * @typedef {{version:1,
 *            baseline_mtime:{claude:number|null, codex:number|null},
 *            files: Record<string, {fingerprint:string, outcome:'processed'|'quarantined',
 *                                   reason?:string, updated_at:string, harness:'claude'|'codex'}>}} Ledger
 */

/** @returns {Ledger} */
function emptyLedger() {
  return { version: 1, baseline_mtime: { claude: null, codex: null }, files: {} };
}

/** @param {unknown} v @returns {boolean} */
function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Read the ledger. Missing/corrupt/malformed → a fresh empty ledger
 *  ({version:1, baseline_mtime:{claude:null,codex:null}, files:{}}) — fail closed (nothing
 *  recorded ⇒ everything above baseline eligible). Never throws.
 *  @param {string} stateDir @returns {Ledger} */
function readLedger(stateDir) {
  try {
    const obj = JSON.parse(fs.readFileSync(ledgerPath(stateDir), 'utf8'));
    if (!isPlainObject(obj) || !isPlainObject(obj.files) || !isPlainObject(obj.baseline_mtime)) {
      return emptyLedger();
    }
    return {
      version: 1,
      baseline_mtime: {
        claude: typeof obj.baseline_mtime.claude === 'number' ? obj.baseline_mtime.claude : null,
        codex: typeof obj.baseline_mtime.codex === 'number' ? obj.baseline_mtime.codex : null,
      },
      files: obj.files,
    };
  } catch {
    return emptyLedger();
  }
}

/** Atomically persist the ledger at 0600 (state dir 0700): temp+rename+chmod, mirroring
 *  identity-approvals.writeRegistry. @param {string} stateDir @param {Ledger} ledger */
function writeLedger(stateDir, ledger) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const dest = ledgerPath(stateDir);
  const tmp = `${dest}.${process.pid}.tmp`;
  const body = JSON.stringify(
    { version: 1, baseline_mtime: ledger.baseline_mtime, files: ledger.files },
    null,
    2
  );
  fs.writeFileSync(tmp, `${body}\n`, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, dest);
  fs.chmodSync(dest, 0o600);
}

/** ONE-TIME migration: if the ledger has NO baseline yet (a fresh read that never carried a
 *  baseline key on disk) AND state/watermarks.json exists, seed baseline_mtime from
 *  readWatermarks() so every file at/below the old watermark is treated as
 *  already-processed. Idempotent: a persisted ledger already carrying a baseline (even
 *  {null,null}) is NOT re-seeded. Returns the possibly-migrated ledger WITHOUT writing
 *  (the caller persists once).
 *  @param {string} stateDir @param {Ledger} ledger @returns {{ledger:Ledger, migrated:boolean}} */
function migrateFromWatermarks(stateDir, ledger) {
  let carriesBaseline = false;
  try {
    const raw = JSON.parse(fs.readFileSync(ledgerPath(stateDir), 'utf8'));
    carriesBaseline = isPlainObject(raw) && 'baseline_mtime' in raw;
  } catch {
    carriesBaseline = false; // missing/corrupt → never carried a baseline
  }
  if (carriesBaseline) return { ledger, migrated: false };
  if (!fs.existsSync(path.join(stateDir, 'watermarks.json'))) return { ledger, migrated: false };
  const wm = readWatermarks(stateDir);
  return {
    ledger: { ...ledger, baseline_mtime: { claude: wm.claude, codex: wm.codex } },
    migrated: true,
  };
}

/** Decide what to do with ONE discovered file given the ledger.
 *  @param {Ledger} ledger
 *  @param {{harness:'claude'|'codex', path:string, mtimeMs:number, size:number, dev:number, ino:number}} disc
 *  @returns {'select'|'skip-processed'|'skip-quarantined'}
 *    'skip-quarantined' — quarantine record exists AND its fingerprint == current → no retry.
 *    'skip-processed'   — processed record exists AND fingerprint == current, OR mtime <=
 *                         baseline_mtime[harness] with no record → done.
 *    'select'           — else: above baseline with no record, OR any record whose fingerprint
 *                         DIFFERS from current (the file changed → reprocess). */
function selectState(ledger, disc) {
  const files = (ledger && ledger.files) || {};
  const rec = files[foldKey(disc.path)];
  if (rec) {
    if (rec.fingerprint !== fingerprint(disc)) return 'select'; // the file changed → reprocess
    return rec.outcome === 'quarantined' ? 'skip-quarantined' : 'skip-processed';
  }
  const baseline = ((ledger && ledger.baseline_mtime) || {})[disc.harness];
  if (typeof baseline === 'number' && disc.mtimeMs <= baseline) return 'skip-processed'; // predates the ledger
  return 'select';
}

/** @param {Ledger} ledger @param {object} disc @param {object} record @returns {Ledger} */
function withRecord(ledger, disc, record) {
  return { ...ledger, files: { ...ledger.files, [foldKey(disc.path)]: record } };
}

/** Return a NEW ledger with one file recorded as processed at its current fingerprint (pure;
 *  overwrites any prior quarantine for the same key). @param {Ledger} ledger @param {object} disc @returns {Ledger} */
function recordProcessed(ledger, disc) {
  return withRecord(ledger, disc, {
    fingerprint: fingerprint(disc),
    outcome: 'processed',
    updated_at: new Date().toISOString(),
    harness: disc.harness,
  });
}

/** Return a NEW ledger with one file recorded as quarantined (reason ∈
 *  'over-ceiling'|'too-many-lines'|'read-error') at its current fingerprint (pure).
 *  @param {Ledger} ledger @param {object} disc @param {string} reason @returns {Ledger} */
function recordQuarantined(ledger, disc, reason) {
  return withRecord(ledger, disc, {
    fingerprint: fingerprint(disc),
    outcome: 'quarantined',
    reason,
    updated_at: new Date().toISOString(),
    harness: disc.harness,
  });
}

/** Sanitized, case-folded basename for the banner and console lines. A raw
 *  basename is ATTACKER-INFLUENCEABLE (a newline + markdown callout in the
 *  filename would render its own line inside the injected digest — review
 *  finding, amended 2026-07-17): whitelist `[A-Za-z0-9._-]`, any other byte →
 *  `_`. The SAME sanitizer serves both surfaces so they always agree.
 *  @param {string} absPath @returns {string} */
function displayName(absPath) {
  return path.basename(foldKey(absPath)).replace(/[^A-Za-z0-9._-]/g, '_');
}

/** The active quarantines for the durable banner. SANITIZED basenames
 *  (whitelist `[A-Za-z0-9._-]`; other bytes → `_`) + code-owned reason enum
 *  only — never a full path, never content. Sorted by basename for a
 *  deterministic banner.
 *  @param {Ledger} ledger @returns {Array<{file:string, reason:string, harness:string}>} */
function activeQuarantines(ledger) {
  const out = [];
  for (const [key, rec] of Object.entries(ledger.files || {})) {
    if (rec && rec.outcome === 'quarantined') {
      out.push({ file: displayName(key), reason: String(rec.reason || 'unreadable'), harness: rec.harness });
    }
  }
  out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return out;
}

module.exports = {
  LEDGER_BASENAME,
  foldKey,
  fingerprint,
  displayName,
  ledgerPath,
  readLedger,
  writeLedger,
  migrateFromWatermarks,
  selectState,
  recordProcessed,
  recordQuarantined,
  activeQuarantines,
};
