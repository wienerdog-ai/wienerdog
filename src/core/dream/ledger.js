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

/** The `reason` on a record DEFERRED because this run's derived output was
 *  reverted by the EP2 staged-output secret gate (ADR-0024). Code-owned. */
const SECRET_REVERT_REASON = 'secret-revert';

/** The `reason` on a QUARANTINE record written once a file has accumulated
 *  SECRET_REVERT_MAX_DEFERRALS deferrals. Code-owned. */
const SECRET_REVERT_EXHAUSTED_REASON = 'secret-revert-exhausted';

/** How many secret-revert DEFERRALS one transcript may accumulate: three are
 *  recorded (1, 2, 3) and the FOURTH consecutive secret-reverted run that
 *  consumes the file quarantines it instead (ADR-0023 Amendment 1). Three,
 *  because the human is warned on night 1 and every night after — the
 *  quarantine lands ~72 h after the first warning — while each extra deferral
 *  re-runs the brain over the same corpus and keeps those bytes occupying
 *  dream_max_input_bytes against genuinely new sessions. */
const SECRET_REVERT_MAX_DEFERRALS = 3;

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
 * A record is keyed by foldKey(absPath) for EVERY outcome — no record carries a
 * file-identity field (dev/ino/hash/file id): a rename hands the file a fresh
 * budget and a file at a reused path inherits the record left there, both named
 * residuals (ADR-0023 Amendment 1, "Consequences"), not bugs.
 * `deferrals` rides ONLY an `outcome:'deferred'` record and is an integer in
 * [1, SECRET_REVERT_MAX_DEFERRALS]; `reason` rides every `deferred` and every
 * `quarantined` record and never a `processed` one.
 * @typedef {{version:1,
 *            baseline_mtime:{claude:number|null, codex:number|null},
 *            files: Record<string, {fingerprint:string,
 *                                   outcome:'processed'|'quarantined'|'deferred',
 *                                   reason?:'over-ceiling'|'too-many-lines'|'read-error'|
 *                                           'secret-revert'|'secret-revert-exhausted',
 *                                   deferrals?:number,
 *                                   updated_at:string, harness:'claude'|'codex'}>}} Ledger
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

/** Decide what to do with ONE discovered file given the ledger. The rows below
 *  are evaluated IN ORDER; the first match wins (ADR-0023 §2 + Amendment 1):
 *    1. a `secret-revert-exhausted` quarantine → 'skip-quarantined' WHATEVER the
 *       fingerprint. The sticky exception, and it MUST precede the fingerprint
 *       comparison it overrides: a transcript that is still being appended to has
 *       a different fingerprint every night, so a fingerprint-sensitive skip
 *       would re-select it forever — and because the byte budget is water-filled
 *       newest-mtime-first, that one file would then eat the budget nightly and
 *       starve new sessions (the WP-048 class in a new dress).
 *    2. any record whose `fingerprint` differs — INCLUDING a record that is not
 *       an object or carries no fingerprint → 'select' (the file changed).
 *    3. 'processed' → 'skip-processed'.  4. 'quarantined' (any other reason) →
 *       'skip-quarantined'.  5. 'deferred' → 'select': a secret-revert deferral
 *       is NOT a negative record, it only carries the bounded counter.
 *    6. anything else (unknown/missing/corrupt/forward-schema outcome) →
 *       'select', from a REAL switch `default:`. The old
 *       `outcome === 'quarantined' ? … : 'skip-processed'` ternary mapped every
 *       unknown outcome to 'skip-processed' — silently re-creating the
 *       2026-07-24/25 memory-loss bug.
 *    7/8. no record → the baseline comparison, unchanged.
 *  Fail-safe direction: the default is 'select'. readLedger deliberately does
 *  NOT validate individual records, so this switch must be exhaustive — and
 *  selecting grants NO trust (the intake ceiling and line caps come from
 *  fs.Stats, the content is still redacted at parse, provenance-gated, and its
 *  derived output still passes the EP2 gate), so an unnecessary select costs
 *  re-processing while 'skip-processed' destroys content silently. Availability
 *  IS the closed direction here. secretDeferralCount makes the opposite call for
 *  an unreadable counter, and says why there.
 *  @param {Ledger} ledger
 *  @param {{harness:'claude'|'codex', path:string, mtimeMs:number, size:number, dev:number, ino:number}} disc
 *  @returns {'select'|'skip-processed'|'skip-quarantined'} */
function selectState(ledger, disc) {
  const files = (ledger && ledger.files) || {};
  const key = foldKey(disc.path);
  const rec = files[key];
  // PRESENCE, never truthiness: a present-but-falsy record (null, false, 0, '')
  // is CORRUPT, not absent. A truthiness test hands it to the baseline branch
  // below, which answers 'skip-processed' on any install carrying a real
  // baseline — silently suppressing an unconsolidated transcript, the exact
  // fail-open the switch below exists to close.
  if (Object.prototype.hasOwnProperty.call(files, key)) {
    if (!isPlainObject(rec)) return 'select'; // corrupt/forward-schema → reprocess
    if (rec.outcome === 'quarantined' && rec.reason === SECRET_REVERT_EXHAUSTED_REASON) {
      return 'skip-quarantined'; // sticky: the fingerprint is deliberately not consulted
    }
    if (rec.fingerprint !== fingerprint(disc)) return 'select'; // the file changed → reprocess
    switch (rec.outcome) {
      case 'processed':
        return 'skip-processed';
      case 'quarantined':
        return 'skip-quarantined';
      case 'deferred':
        return 'select'; // a deferral is retried, exactly as if no record existed
      default:
        return 'select';
    }
  }
  const baseline = ((ledger && ledger.baseline_mtime) || {})[disc.harness];
  if (typeof baseline === 'number' && disc.mtimeMs <= baseline) return 'skip-processed'; // predates the ledger
  return 'select';
}

/**
 * How many secret-revert deferrals this file has ALREADY accumulated. An
 * exhaustive switch over the record at foldKey(disc.path) — the same path key
 * every other record kind uses (ADR-0023 §2). Deliberately INDEPENDENT of the
 * fingerprint: an appended transcript is the same episode, and resetting the
 * count on append is exactly what would make the bound unbounded.
 *
 * Fail-safe direction, and it is the OPPOSITE of selectState's on purpose: a
 * `deferred`/`secret-revert` record positively asserts "this file has already
 * been deferred" and only the count is unreadable, so the conservative reading
 * of an unreadable bound is SPENT (returning 1 would let a garbled counter
 * launder the bound forever). An unrecognized record asserts nothing about
 * deferrals, so it gets the full budget rather than an invented exhaustion.
 * @param {Ledger} ledger
 * @param {{path:string}} disc
 * @returns {number} an integer in [0, SECRET_REVERT_MAX_DEFERRALS]
 */
function secretDeferralCount(ledger, disc) {
  const files = (ledger && ledger.files) || {};
  const rec = files[foldKey(disc.path)];
  if (!isPlainObject(rec)) return 0;
  switch (rec.outcome) {
    case 'deferred':
      if (rec.reason !== SECRET_REVERT_REASON) return 0;
      // Integer + explicit range bounds, NEVER numeric coercion: `Number(x) || 0`
      // reads the string '2' as a live budget and 2.5 as a fraction of one.
      return Number.isInteger(rec.deferrals) && rec.deferrals >= 1 && rec.deferrals <= SECRET_REVERT_MAX_DEFERRALS
        ? rec.deferrals
        : SECRET_REVERT_MAX_DEFERRALS;
    case 'quarantined':
      // Defensive: selectState's sticky row already makes an exhausted file
      // unselectable, so the dream never reaches this arm today. It exists so
      // the bound cannot be laundered by any future caller.
      return rec.reason === SECRET_REVERT_EXHAUSTED_REASON ? SECRET_REVERT_MAX_DEFERRALS : 0;
    case 'processed':
      return 0;
    default:
      return 0;
  }
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

/** Return a NEW ledger with one file recorded as secret-revert DEFERRED (pure):
 *  its derived output was reverted by the EP2 staged-output secret gate, so the
 *  run consumed nothing and the file must be retried, exactly like a
 *  capacity-deferred one. Not a negative record — selectState returns 'select'
 *  for it; it exists only to carry the bounded counter. The written
 *  `fingerprint` is DIAGNOSTIC: no decision reads it. Any `deferrals` outside
 *  [1, SECRET_REVERT_MAX_DEFERRALS] is clamped to the maximum, so an
 *  out-of-range counter is never persisted.
 *  @param {Ledger} ledger @param {object} disc @param {number} deferrals @returns {Ledger} */
function recordSecretDeferred(ledger, disc, deferrals) {
  const n =
    Number.isInteger(deferrals) && deferrals >= 1 && deferrals <= SECRET_REVERT_MAX_DEFERRALS
      ? deferrals
      : SECRET_REVERT_MAX_DEFERRALS;
  return withRecord(ledger, disc, {
    fingerprint: fingerprint(disc),
    outcome: 'deferred',
    reason: SECRET_REVERT_REASON,
    deferrals: n,
    updated_at: new Date().toISOString(),
    harness: disc.harness,
  });
}

/** Return a NEW ledger with one file QUARANTINED because its secret-revert
 *  deferrals are spent (pure). Kept separate from recordQuarantined so the three
 *  intake reasons keep their exact shape AND their retry-on-fingerprint-change
 *  behaviour — the sticky skip is scoped to this reason alone.
 *  @param {Ledger} ledger @param {object} disc @returns {Ledger} */
function recordSecretExhausted(ledger, disc) {
  return withRecord(ledger, disc, {
    fingerprint: fingerprint(disc),
    outcome: 'quarantined',
    reason: SECRET_REVERT_EXHAUSTED_REASON,
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

/** The code-owned transcript-quarantine banner, derived from the ledger ALONE:
 *  displayName output plus the code-owned reason enum, never a path, never
 *  content, never a matched value. The two sentences are partitioned by reason —
 *  an UNRECOGNIZED reason falls into the first one, so a quarantine is never
 *  silently dropped from the banner. When both apply the intake sentence comes
 *  first, separated by a blank line.
 *  @param {Ledger} ledger @returns {string} '' when no quarantine is active */
function quarantineBannerLine(ledger) {
  const active = activeQuarantines(ledger);
  const intake = active.filter((e) => e.reason !== SECRET_REVERT_EXHAUSTED_REASON);
  const spent = active.filter((e) => e.reason === SECRET_REVERT_EXHAUSTED_REASON);
  /** @type {string[]} */
  const lines = [];
  if (intake.length > 0) {
    lines.push(
      `> [!warning] Wienerdog: ${intake.length} session transcript(s) could not be read and were skipped — ` +
        `${intake.map((e) => `${e.file} (${e.reason})`).join(', ')}. Dreaming continues over your other sessions; ` +
        'a skipped file is retried automatically if it changes.'
    );
  }
  if (spent.length > 0) {
    // Names NO command: nothing ships a way to un-skip these sessions yet, and a
    // banner must not tell the user to run something that does not exist. It
    // states no deferral count either — a file can also reach this state through
    // an unreadable counter, and a banner must not assert what the ledger cannot
    // prove.
    lines.push(
      `> [!warning] Wienerdog: ${spent.length} session transcript(s) are no longer being dreamed over — the notes made ` +
        `from them were withheld by the secret check too many times in a row: ${spent.map((e) => e.file).join(', ')}. ` +
        'The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest. ' +
        'The session files themselves are untouched.'
    );
  }
  return lines.join('\n\n');
}

/** The code-owned console summary for a secret-reverted run. Every argument that
 *  is not a non-negative safe integer renders as 0, which is what makes it
 *  STRUCTURALLY impossible for a basename, a path or a matched value to enter
 *  this line — it is built from integers alone.
 *  @param {{withheld:number, deferred:number, quarantined:number}} counts
 *  @returns {string} */
function secretRevertSummaryLine(counts) {
  const c = counts || {};
  const int = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);
  const withheld = int(c.withheld);
  const deferred = int(c.deferred);
  const quarantined = int(c.quarantined);
  return (
    `wienerdog: dream — the secret check withheld ${withheld} note(s); ${deferred} session transcript(s) ` +
    `will be retried on the next run and ${quarantined} were skipped after too many withheld runs in a ` +
    'row. The withheld notes are in state/quarantine/.'
  );
}

module.exports = {
  LEDGER_BASENAME,
  SECRET_REVERT_REASON,
  SECRET_REVERT_EXHAUSTED_REASON,
  SECRET_REVERT_MAX_DEFERRALS,
  foldKey,
  fingerprint,
  displayName,
  ledgerPath,
  readLedger,
  writeLedger,
  migrateFromWatermarks,
  selectState,
  secretDeferralCount,
  recordProcessed,
  recordQuarantined,
  recordSecretDeferred,
  recordSecretExhausted,
  activeQuarantines,
  quarantineBannerLine,
  secretRevertSummaryLine,
};
