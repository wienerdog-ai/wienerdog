'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ledgerLib = require('../../src/core/dream/ledger');
const { writeWatermarks } = require('../../src/core/dream/watermarks');

/** @returns {string} a fresh empty state dir. */
function tempState() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ledger-'));
}

/** A discovery record for tests. @param {object} [over] @returns {object} */
function disc(over = {}) {
  return {
    harness: 'claude',
    path: '/tmp/wd-ledger-fixture/sess-a.jsonl',
    mtimeMs: 1000,
    size: 64,
    dev: 7,
    ino: 42,
    ...over,
  };
}

const EMPTY = { version: 1, baseline_mtime: { claude: null, codex: null }, files: {} };

// ---- fingerprint + foldKey ----

test('ledger: fingerprint is size:mtimeMs:dev:ino and changes when any component changes', () => {
  const d = disc();
  assert.equal(ledgerLib.fingerprint(d), '64:1000:7:42');
  assert.notEqual(ledgerLib.fingerprint(disc({ size: 65 })), ledgerLib.fingerprint(d));
  assert.notEqual(ledgerLib.fingerprint(disc({ mtimeMs: 1001 })), ledgerLib.fingerprint(d));
  assert.notEqual(ledgerLib.fingerprint(disc({ dev: 8 })), ledgerLib.fingerprint(d));
  assert.notEqual(ledgerLib.fingerprint(disc({ ino: 43 })), ledgerLib.fingerprint(d));
});

test('ledger: foldKey case-folds and resolves the path', () => {
  assert.equal(ledgerLib.foldKey('/Tmp/Proj/Sess-A.jsonl'), '/tmp/proj/sess-a.jsonl');
  assert.equal(ledgerLib.foldKey('/tmp/proj/../proj/a.jsonl'), '/tmp/proj/a.jsonl');
});

// ---- selectState: the ADR-0023 §2 selection rule table ----

test('ledger: selectState matches the selection rule table', () => {
  const d = disc();
  const fpMatched = d;
  const fpChanged = disc({ size: d.size + 1 });

  // | no record, mtime > baseline | select |
  assert.equal(ledgerLib.selectState(EMPTY, d), 'select');
  const base = { ...EMPTY, baseline_mtime: { claude: 500, codex: null } };
  assert.equal(ledgerLib.selectState(base, disc({ mtimeMs: 501 })), 'select');

  // | no record, mtime <= baseline | skip-processed (predates ledger) |
  assert.equal(ledgerLib.selectState(base, disc({ mtimeMs: 500 })), 'skip-processed');
  assert.equal(ledgerLib.selectState(base, disc({ mtimeMs: 499 })), 'skip-processed');

  // | processed, record.fp == fp | skip-processed |
  const processed = ledgerLib.recordProcessed(EMPTY, d);
  assert.equal(ledgerLib.selectState(processed, fpMatched), 'skip-processed');

  // | processed, record.fp != fp | select (reprocess) |
  assert.equal(ledgerLib.selectState(processed, fpChanged), 'select');

  // | quarantined, record.fp == fp | skip-quarantined (no retry) |
  const quarantined = ledgerLib.recordQuarantined(EMPTY, d, 'over-ceiling');
  assert.equal(ledgerLib.selectState(quarantined, fpMatched), 'skip-quarantined');

  // | quarantined, record.fp != fp | select (retry the changed file) |
  assert.equal(ledgerLib.selectState(quarantined, fpChanged), 'select');
});

test('ledger: an unchanged quarantine is skipped; a changed file is retried', () => {
  const d = disc();
  const l = ledgerLib.recordQuarantined(EMPTY, d, 'read-error');
  // Same fingerprint next run → no retry, no re-record.
  assert.equal(ledgerLib.selectState(l, d), 'skip-quarantined');
  // Any fingerprint component change → the file changed → retry.
  assert.equal(ledgerLib.selectState(l, disc({ mtimeMs: d.mtimeMs + 1 })), 'select');
  assert.equal(ledgerLib.selectState(l, disc({ ino: d.ino + 1 })), 'select');
});

test('ledger: a record beats the baseline (a changed already-processed file below baseline is reprocessed)', () => {
  const d = disc({ mtimeMs: 100 });
  const base = { ...EMPTY, baseline_mtime: { claude: 1000, codex: null } };
  const l = ledgerLib.recordProcessed(base, d);
  // fingerprint differs → select even though mtime <= baseline.
  assert.equal(ledgerLib.selectState(l, disc({ mtimeMs: 100, size: 999 })), 'select');
});

// ---- record* are pure and overwrite per key ----

test('ledger: recordProcessed / recordQuarantined are pure and overwrite the same key', () => {
  const d = disc();
  const q = ledgerLib.recordQuarantined(EMPTY, d, 'too-many-lines');
  assert.deepEqual(EMPTY.files, {}, 'input ledger untouched (pure)');
  const key = ledgerLib.foldKey(d.path);
  assert.equal(q.files[key].outcome, 'quarantined');
  assert.equal(q.files[key].reason, 'too-many-lines');
  assert.equal(q.files[key].harness, 'claude');
  assert.equal(q.files[key].fingerprint, ledgerLib.fingerprint(d));
  assert.equal(typeof q.files[key].updated_at, 'string');

  // A later processed record for the same key overwrites the quarantine.
  const p = ledgerLib.recordProcessed(q, d);
  assert.equal(p.files[key].outcome, 'processed');
  assert.equal(q.files[key].outcome, 'quarantined', 'prior ledger untouched (pure)');
});

// ---- migration ----

test('ledger: migration seeds baseline_mtime from watermarks.json once, idempotently', () => {
  const state = tempState();
  writeWatermarks(state, { claude: 111.5, codex: 222 });

  let ledger = ledgerLib.readLedger(state); // missing → fresh empty, no baseline carried
  const mig1 = ledgerLib.migrateFromWatermarks(state, ledger);
  assert.equal(mig1.migrated, true);
  assert.deepEqual(mig1.ledger.baseline_mtime, { claude: 111.5, codex: 222 });

  // The caller persists once; a second migrate on the persisted ledger is a no-op.
  ledgerLib.writeLedger(state, mig1.ledger);
  ledger = ledgerLib.readLedger(state);
  const mig2 = ledgerLib.migrateFromWatermarks(state, ledger);
  assert.equal(mig2.migrated, false);
  assert.deepEqual(mig2.ledger.baseline_mtime, { claude: 111.5, codex: 222 });
});

test('ledger: no watermarks.json → no migration (fresh install)', () => {
  const state = tempState();
  const mig = ledgerLib.migrateFromWatermarks(state, ledgerLib.readLedger(state));
  assert.equal(mig.migrated, false);
  assert.deepEqual(mig.ledger.baseline_mtime, { claude: null, codex: null });
});

test('ledger: a persisted ledger carrying a {null,null} baseline is NOT re-seeded', () => {
  const state = tempState();
  // A ledger written BEFORE any watermarks.json existed carries baseline {null,null}.
  ledgerLib.writeLedger(state, { version: 1, baseline_mtime: { claude: null, codex: null }, files: {} });
  writeWatermarks(state, { claude: 999, codex: 999 });
  const mig = ledgerLib.migrateFromWatermarks(state, ledgerLib.readLedger(state));
  assert.equal(mig.migrated, false);
  assert.deepEqual(mig.ledger.baseline_mtime, { claude: null, codex: null });
});

// ---- read/write ----

test('ledger: readLedger fails closed on missing, corrupt, and mis-shaped files', () => {
  const state = tempState();
  assert.deepEqual(ledgerLib.readLedger(state), EMPTY); // missing
  fs.writeFileSync(ledgerLib.ledgerPath(state), '{ broken');
  assert.deepEqual(ledgerLib.readLedger(state), EMPTY); // corrupt
  fs.writeFileSync(ledgerLib.ledgerPath(state), '[]');
  assert.deepEqual(ledgerLib.readLedger(state), EMPTY); // wrong shape
  fs.writeFileSync(ledgerLib.ledgerPath(state), JSON.stringify({ version: 1, files: 'nope' }));
  assert.deepEqual(ledgerLib.readLedger(state), EMPTY); // files not an object
});

test('ledger: writeLedger round-trips and produces a 0600 file', () => {
  const state = tempState();
  const d = disc();
  let ledger = ledgerLib.readLedger(state);
  ledger = ledgerLib.recordQuarantined(ledger, d, 'over-ceiling');
  ledger = ledgerLib.recordProcessed(ledger, disc({ path: '/tmp/other.jsonl', harness: 'codex' }));
  ledgerLib.writeLedger(state, ledger);

  const back = ledgerLib.readLedger(state);
  assert.deepEqual(back, ledger);
  if (process.platform !== 'win32') {
    const mode = fs.statSync(ledgerLib.ledgerPath(state)).mode & 0o777;
    assert.equal(mode, 0o600);
  }
});

// ---- activeQuarantines ----

test('ledger: activeQuarantines returns basename + reason + harness only (secret-free)', () => {
  const state = tempState();
  let ledger = ledgerLib.readLedger(state);
  ledger = ledgerLib.recordQuarantined(ledger, disc({ path: '/tmp/Secret Project/huge.jsonl' }), 'over-ceiling');
  ledger = ledgerLib.recordProcessed(ledger, disc({ path: '/tmp/Secret Project/fine.jsonl' }));

  const q = ledgerLib.activeQuarantines(ledger);
  assert.equal(q.length, 1, 'processed records are not quarantines');
  assert.deepEqual(Object.keys(q[0]).sort(), ['file', 'harness', 'reason']);
  assert.equal(q[0].file, 'huge.jsonl');
  assert.equal(q[0].reason, 'over-ceiling');
  assert.equal(q[0].harness, 'claude');
  assert.ok(!q[0].file.includes('/'), 'never a full path');

  // A quarantine overwritten by processed leaves the active list (self-clearing banner).
  const cleared = ledgerLib.recordProcessed(ledger, disc({ path: '/tmp/Secret Project/huge.jsonl' }));
  assert.deepEqual(ledgerLib.activeQuarantines(cleared), []);
});

test('ledger: activeQuarantines sanitizes a hostile basename to the [A-Za-z0-9._-] whitelist (review finding)', () => {
  // The reviewer's proof file: a newline + markdown callout in the NAME would
  // render its own line inside the injected digest banner.
  const hostile = '/tmp/proj/x]\n> [!danger] INJECTED\nfake.jsonl';
  const ledger = ledgerLib.recordQuarantined(
    { version: 1, baseline_mtime: { claude: null, codex: null }, files: {} },
    disc({ path: hostile }),
    'over-ceiling'
  );

  const q = ledgerLib.activeQuarantines(ledger);
  assert.equal(q.length, 1);
  // Folded + whitelist-sanitized: every non-[A-Za-z0-9._-] byte becomes '_'.
  assert.equal(q[0].file, 'x______danger__injected_fake.jsonl');
  assert.match(q[0].file, /^[A-Za-z0-9._-]+$/, 'only whitelisted bytes survive');
  assert.ok(!q[0].file.includes('\n'), 'no raw newline');
  assert.ok(!q[0].file.includes('['), 'no markdown control chars');
});

test('ledger: displayName is the shared sanitizer (folded + whitelisted) for banner and console', () => {
  assert.equal(ledgerLib.displayName('/tmp/proj/Huge File!.jsonl'), 'huge_file_.jsonl');
  assert.equal(ledgerLib.displayName('/tmp/proj/normal-name_1.2.jsonl'), 'normal-name_1.2.jsonl');
});

// ── WP-secret-revert-defers-ledger (ADR-0023 Amendment 1) ───────────────────

const MAX = ledgerLib.SECRET_REVERT_MAX_DEFERRALS;

/** A raw ledger holding exactly one record at disc()'s folded path key, and — this
 *  is load-bearing — a claude baseline ABOVE disc()'s mtimeMs (1000), which is what
 *  a real install carries. A malformed record that is mistakenly treated as ABSENT
 *  falls through to the baseline branch and answers `skip-processed`, silently
 *  suppressing an unconsolidated transcript. Without the baseline the fall-through
 *  also answers `select` and every garbage-record assertion below passes vacuously.
 *  @param {object} rec @param {object} [over] disc overrides @returns {object} */
function withRaw(rec, over = {}) {
  return {
    ...EMPTY,
    baseline_mtime: { claude: 2000, codex: null },
    files: { [ledgerLib.foldKey(disc(over).path)]: rec },
  };
}

test('ledger: the secret-revert constants are exported and the bound is three', () => {
  assert.equal(ledgerLib.SECRET_REVERT_REASON, 'secret-revert');
  assert.equal(ledgerLib.SECRET_REVERT_EXHAUSTED_REASON, 'secret-revert-exhausted');
  assert.equal(MAX, 3);
});

test('ledger: selectState — a deferred record at a MATCHING fingerprint is selected, not skipped', () => {
  const d = disc();
  const l = ledgerLib.recordSecretDeferred(EMPTY, d, 1);
  // The whole point: a deferral is NOT a negative record. Before the fix the
  // ternary mapped it to skip-processed — the file would never be re-dreamed.
  assert.equal(ledgerLib.selectState(l, d), 'select');
  assert.equal(ledgerLib.selectState(l, disc({ size: d.size + 1 })), 'select');
});

test('ledger: selectState — a secret-revert-exhausted quarantine is STICKY across a changed fingerprint', () => {
  const d = disc();
  const l = ledgerLib.recordSecretExhausted(EMPTY, d);
  assert.equal(ledgerLib.selectState(l, d), 'skip-quarantined');
  // The appended-transcript case: a deliberately different fingerprint every
  // night must NOT re-open the skip (that is what makes the bound a bound).
  assert.equal(ledgerLib.selectState(l, disc({ size: d.size + 1, mtimeMs: 9e9 })), 'skip-quarantined');
  assert.equal(
    ledgerLib.selectState(withRaw({ fingerprint: '1:1:1:1', outcome: 'quarantined', reason: 'secret-revert-exhausted' }), d),
    'skip-quarantined'
  );
});

test('ledger: selectState — an intake quarantine keeps its retry-on-change behaviour (the exception is reason-scoped)', () => {
  const d = disc();
  const l = ledgerLib.recordQuarantined(EMPTY, d, 'over-ceiling');
  assert.equal(ledgerLib.selectState(l, d), 'skip-quarantined');
  assert.equal(ledgerLib.selectState(l, disc({ size: d.size + 1 })), 'select');
});

test('ledger: selectState — an unknown/garbage record is SELECTED, never skip-processed (the switch default)', () => {
  // Every ledger here carries a baseline ABOVE this file's mtime (see withRaw),
  // so a record that leaks past the switch and is read as ABSENT answers
  // skip-processed and fails these assertions. That is what makes them real.
  const d = disc();
  const fp = ledgerLib.fingerprint(d);
  assert.equal(ledgerLib.selectState({ ...EMPTY, baseline_mtime: { claude: 2000, codex: null } }, d), 'skip-processed',
    'control: with NO record the baseline genuinely suppresses this file');
  // Unknown outcome at a MATCHING fingerprint: the old ternary answered
  // skip-processed here, which silently re-creates the memory-loss bug.
  assert.equal(ledgerLib.selectState(withRaw({ fingerprint: fp, outcome: 'tomorrows-outcome' }), d), 'select');
  assert.equal(ledgerLib.selectState(withRaw({ fingerprint: fp }), d), 'select'); // outcome missing
  assert.equal(ledgerLib.selectState(withRaw({ outcome: 'processed' }), d), 'select'); // fingerprint missing
  // PRESENT but falsy. A truthiness test reads these as "no record at all" and
  // hands them to the baseline branch — fail-open, one line above the switch
  // that exists to close exactly this. Presence must be tested by own-property.
  for (const garbage of [null, false, 0, '', NaN, undefined]) {
    assert.equal(ledgerLib.selectState(withRaw(garbage), d), 'select', `a present ${String(garbage)} record is corrupt, not absent`);
  }
  assert.equal(ledgerLib.selectState(withRaw('nope'), d), 'select'); // record is a string
  assert.equal(ledgerLib.selectState(withRaw([1, 2]), d), 'select'); // record is an array
});

test('ledger: secretDeferralCount — one asserted value per record shape (the exhaustive switch)', () => {
  const d = disc();
  const fp = ledgerLib.fingerprint(d);
  const deferred = (deferrals) => withRaw({ fingerprint: fp, outcome: 'deferred', reason: 'secret-revert', deferrals });

  // Absent / null / not an object → 0.
  assert.equal(ledgerLib.secretDeferralCount(EMPTY, d), 0);
  assert.equal(ledgerLib.secretDeferralCount(withRaw(null), d), 0);
  assert.equal(ledgerLib.secretDeferralCount(withRaw('nope'), d), 0);
  assert.equal(ledgerLib.secretDeferralCount(withRaw([1, 2]), d), 0);

  // A well-formed counter in [1, MAX] is returned as-is.
  for (const n of [1, 2, 3]) assert.equal(ledgerLib.secretDeferralCount(deferred(n), d), n);

  // Anything else on a record that ASSERTS a deferral reads as SPENT — never
  // numeric coercion, which would read '2' and 2.5 as a live budget.
  for (const bad of [undefined, null, '2', NaN, Infinity, -Infinity, 2.5, 0, -1, 99, true, {}]) {
    assert.equal(ledgerLib.secretDeferralCount(deferred(bad), d), MAX, `deferrals=${String(bad)} → spent`);
  }
  assert.equal(
    ledgerLib.secretDeferralCount(withRaw({ fingerprint: fp, outcome: 'deferred', reason: 'secret-revert' }), d),
    MAX,
    'a missing deferrals key reads as spent'
  );

  // A deferred record with any OTHER reason asserts nothing about secret reverts.
  assert.equal(
    ledgerLib.secretDeferralCount(withRaw({ fingerprint: fp, outcome: 'deferred', reason: 'something-else', deferrals: 1 }), d),
    0
  );

  // Quarantined: exhausted → MAX (defensive; unreachable through the dream);
  // any other reason → 0. Processed → 0. Unknown outcome → 0 (the default arm).
  assert.equal(ledgerLib.secretDeferralCount(ledgerLib.recordSecretExhausted(EMPTY, d), d), MAX);
  assert.equal(ledgerLib.secretDeferralCount(ledgerLib.recordQuarantined(EMPTY, d, 'read-error'), d), 0);
  assert.equal(ledgerLib.secretDeferralCount(ledgerLib.recordProcessed(EMPTY, d), d), 0);
  assert.equal(ledgerLib.secretDeferralCount(withRaw({ fingerprint: fp, outcome: 'tomorrows-outcome', deferrals: 2 }), d), 0);
});

test('ledger: secretDeferralCount is INDEPENDENT of the fingerprint (an appended transcript keeps its count)', () => {
  const d = disc();
  const l = ledgerLib.recordSecretDeferred(EMPTY, d, 2);
  // Same path, every fingerprint component changed — the count must not reset.
  assert.equal(ledgerLib.secretDeferralCount(l, disc({ size: 999, mtimeMs: 9e9, dev: 1, ino: 1 })), 2);
});

test('ledger: recordSecretDeferred writes exactly the deferred shape — no dev, no ino, no file id', () => {
  const d = disc();
  const l = ledgerLib.recordSecretDeferred(EMPTY, d, 2);
  assert.deepEqual(EMPTY.files, {}, 'input ledger untouched (pure)');
  const rec = l.files[ledgerLib.foldKey(d.path)];
  assert.deepEqual(Object.keys(rec).sort(), ['deferrals', 'fingerprint', 'harness', 'outcome', 'reason', 'updated_at']);
  assert.equal(rec.outcome, 'deferred');
  assert.equal(rec.reason, 'secret-revert');
  assert.equal(rec.deferrals, 2);
  assert.equal(rec.fingerprint, ledgerLib.fingerprint(d));
  assert.equal(rec.harness, 'claude');
  assert.equal(typeof rec.updated_at, 'string');
  assert.equal('dev' in rec, false, 'no file-identity field (records stay path-keyed)');
  assert.equal('ino' in rec, false, 'no file-identity field (records stay path-keyed)');
});

test('ledger: recordSecretDeferred clamps an out-of-range counter to the maximum', () => {
  const d = disc();
  const key = ledgerLib.foldKey(d.path);
  for (const bad of [0, -1, 4, 1.5, NaN, '2', undefined, Infinity]) {
    assert.equal(ledgerLib.recordSecretDeferred(EMPTY, d, bad).files[key].deferrals, MAX, `deferrals=${String(bad)} clamped`);
  }
  for (const ok of [1, 2, 3]) {
    assert.equal(ledgerLib.recordSecretDeferred(EMPTY, d, ok).files[key].deferrals, ok);
  }
});

test('ledger: recordSecretExhausted writes the quarantined shape with the exhausted reason and NO deferrals', () => {
  const d = disc();
  const l = ledgerLib.recordSecretExhausted(ledgerLib.recordSecretDeferred(EMPTY, d, 3), d);
  const rec = l.files[ledgerLib.foldKey(d.path)];
  assert.deepEqual(Object.keys(rec).sort(), ['fingerprint', 'harness', 'outcome', 'reason', 'updated_at']);
  assert.equal(rec.outcome, 'quarantined');
  assert.equal(rec.reason, 'secret-revert-exhausted');
  assert.equal('deferrals' in rec, false, 'the counter is gone once it is spent');
  assert.equal(rec.fingerprint, ledgerLib.fingerprint(d));
});

test('ledger: both secret writers key at foldKey(path) and touch no other record (no migration, no sweep)', () => {
  const other = disc({ path: '/tmp/wd-ledger-fixture/sess-b.jsonl' });
  const base = ledgerLib.recordSecretDeferred(EMPTY, other, 2);
  const otherKey = ledgerLib.foldKey(other.path);
  const snapshot = JSON.stringify(base.files[otherKey]);

  const d = disc();
  const key = ledgerLib.foldKey(d.path);
  for (const next of [ledgerLib.recordSecretDeferred(base, d, 1), ledgerLib.recordSecretExhausted(base, d)]) {
    assert.deepEqual(Object.keys(next.files).sort(), [key, otherKey].sort());
    assert.equal(JSON.stringify(next.files[otherKey]), snapshot, "the other path's record is byte-identical");
  }
  // A clean consolidation overwrites the counter at the same key — the one reset.
  const healed = ledgerLib.recordProcessed(ledgerLib.recordSecretDeferred(EMPTY, d, 3), d);
  assert.equal(healed.files[key].outcome, 'processed');
  assert.equal('deferrals' in healed.files[key], false);
  assert.equal(ledgerLib.secretDeferralCount(healed, d), 0);
});

test('ledger: quarantineBannerLine reproduces the intake banner byte for byte', () => {
  assert.equal(ledgerLib.quarantineBannerLine(EMPTY), '', 'no quarantine → empty, so renderDigest drops it');

  let l = ledgerLib.recordQuarantined(EMPTY, disc({ path: '/tmp/proj/huge.jsonl' }), 'over-ceiling');
  l = ledgerLib.recordQuarantined(l, disc({ path: '/tmp/proj/broken.jsonl' }), 'read-error');
  // The exact bytes of the template dream.js used to build inline (WP-119).
  const q = ledgerLib.activeQuarantines(l);
  const expected =
    `> [!warning] Wienerdog: ${q.length} session transcript(s) could not be read and were skipped — ` +
    `${q.map((e) => `${e.file} (${e.reason})`).join(', ')}. Dreaming continues over your other sessions; ` +
    'a skipped file is retried automatically if it changes.';
  assert.equal(ledgerLib.quarantineBannerLine(l), expected);
  assert.ok(expected.includes('broken.jsonl (read-error), huge.jsonl (over-ceiling)'), 'sorted by basename');
});

test('ledger: quarantineBannerLine renders the exhausted sentence, names no command, and states no count', () => {
  let l = ledgerLib.recordSecretExhausted(EMPTY, disc({ path: '/tmp/proj/sess-a.jsonl' }));
  l = ledgerLib.recordSecretExhausted(l, disc({ path: '/tmp/proj/sess-b.jsonl' }));
  const line = ledgerLib.quarantineBannerLine(l);
  assert.equal(
    line,
    '> [!warning] Wienerdog: 2 session transcript(s) are no longer being dreamed over — the notes made ' +
      'from them were withheld by the secret check too many times in a row: sess-a.jsonl, sess-b.jsonl. ' +
      'The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest. ' +
      'The session files themselves are untouched.'
  );
  assert.ok(!line.includes('could not be read'), 'the intake sentence is not emitted for this reason');
  // The banner's own occurrence is `Wienerdog:` — brand, colon, no command. Any
  // "wienerdog <subcommand>" in EITHER casing would be telling the user to run
  // something this package does not ship.
  assert.ok(!/wienerdog\s+[a-z]/i.test(line), 'names no recovery command — none ships yet');
  assert.ok(!line.includes('secret-revert-exhausted'), 'the raw reason enum is not shown to the user');
});

test('ledger: quarantineBannerLine emits BOTH sentences, intake first, separated by a blank line', () => {
  let l = ledgerLib.recordQuarantined(EMPTY, disc({ path: '/tmp/proj/huge.jsonl' }), 'over-ceiling');
  l = ledgerLib.recordSecretExhausted(l, disc({ path: '/tmp/proj/spent.jsonl' }));
  const parts = ledgerLib.quarantineBannerLine(l).split('\n\n');
  assert.equal(parts.length, 2);
  assert.ok(parts[0].includes('could not be read and were skipped'));
  assert.ok(parts[0].includes('huge.jsonl (over-ceiling)'));
  assert.ok(!parts[0].includes('spent.jsonl'), 'the exhausted file is not double-counted in the intake sentence');
  assert.ok(parts[1].includes('are no longer being dreamed over'));
  assert.ok(parts[1].includes('spent.jsonl'));
});

test('ledger: an UNRECOGNIZED quarantine reason lands in the intake sentence — never silently dropped', () => {
  const l = { ...EMPTY, files: { '/tmp/proj/odd.jsonl': { fingerprint: 'x', outcome: 'quarantined', reason: 'from-the-future', harness: 'claude' } } };
  const line = ledgerLib.quarantineBannerLine(l);
  assert.ok(line.includes('could not be read and were skipped'));
  assert.ok(line.includes('odd.jsonl (from-the-future)'));
});

test('ledger: secretRevertSummaryLine is built from integers alone', () => {
  assert.equal(
    ledgerLib.secretRevertSummaryLine({ withheld: 2, deferred: 3, quarantined: 0 }),
    'wienerdog: dream — the secret check withheld 2 note(s); 3 session transcript(s) ' +
      'will be retried on the next run and 0 were skipped after too many withheld runs in a ' +
      'row. The withheld notes are in state/quarantine/.'
  );
  // Anything that is not a non-negative safe integer renders as 0, which is what
  // makes it structurally impossible for a basename or a matched value to enter.
  for (const bad of [undefined, null, -1, NaN, '3', Infinity, 1.5, 'huge.jsonl', {}]) {
    const line = ledgerLib.secretRevertSummaryLine({ withheld: bad, deferred: bad, quarantined: bad });
    assert.ok(line.includes('withheld 0 note(s)'), `withheld=${String(bad)} → 0`);
    assert.ok(line.includes('0 session transcript(s)'), `deferred=${String(bad)} → 0`);
    assert.ok(line.includes('and 0 were skipped'), `quarantined=${String(bad)} → 0`);
  }
  assert.ok(ledgerLib.secretRevertSummaryLine({}).includes('withheld 0 note(s)'));
});
