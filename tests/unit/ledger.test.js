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
