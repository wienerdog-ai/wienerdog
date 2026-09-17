'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { getPaths } = require('../../src/core/paths');
const { readDreamConfig } = require('../../src/core/dream/config');
const { readWatermarks, writeWatermarks } = require('../../src/core/dream/watermarks');
const { collectExtracts, cleanScratch } = require('../../src/core/dream/scratch');
const ledgerLib = require('../../src/core/dream/ledger');
const transcripts = require('../../src/core/transcripts');
const { MAX_MESSAGES, Limits } = require('../../src/core/transcripts');

/** Fresh temp home + resolved paths. */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-collect-'));
  const core = path.join(root, 'wd');
  return getPaths({
    HOME: root,
    WIENERDOG_HOME: core,
    CLAUDE_CONFIG_DIR: path.join(root, 'claude'),
    CODEX_HOME: path.join(root, 'codex'),
  });
}

/** A fresh empty ledger (nothing recorded, no baseline). */
function emptyLedger() {
  return { version: 1, baseline_mtime: { claude: null, codex: null }, files: {} };
}

/** Write a claude transcript with `msgCount` user messages; set its mtime.
 *  @returns {number} the file's real mtimeMs after setting. */
function writeClaude(paths, sessionId, msgCount, msgLen, when) {
  const dir = path.join(paths.claudeDir, 'projects', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.jsonl`);
  const lines = [];
  for (let i = 0; i < msgCount; i++) {
    lines.push(
      JSON.stringify({
        type: 'user',
        sessionId,
        cwd: '/home/ada/proj',
        timestamp: '2026-01-01T10:00:00.000Z',
        message: { role: 'user', content: 'x'.repeat(msgLen) },
      })
    );
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
  fs.utimesSync(file, when, when);
  return fs.statSync(file).mtimeMs;
}

/** Write a small codex rollout; set its mtime. @returns {number} mtimeMs. */
function writeCodex(paths, sessionId, when) {
  const dir = path.join(paths.codexDir, 'sessions', '2026', '01', '01');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-${sessionId}.jsonl`);
  const lines = [
    JSON.stringify({ type: 'session_meta', payload: { id: sessionId, timestamp: '2026-01-01T09:00:00.000Z', cwd: '/p' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] } }),
  ];
  fs.writeFileSync(file, lines.join('\n') + '\n');
  fs.utimesSync(file, when, when);
  return fs.statSync(file).mtimeMs;
}

/** Plant a sparse over-ceiling claude file (never opened — content irrelevant).
 *  @returns {string} its absolute path. */
function writeOverCeiling(paths, sessionId, when) {
  const dir = path.join(paths.claudeDir, 'projects', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(file, '');
  fs.truncateSync(file, Limits.PRE_READ_CEILING_BYTES + 1);
  fs.utimesSync(file, when, when);
  return file;
}

// ---- config ----

test('dream-collect: readDreamConfig returns defaults with only a vault', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.writeFileSync(paths.config, 'vault: /home/ada/wienerdog\n');
  const cfg = readDreamConfig(paths.config);
  assert.equal(cfg.vault, '/home/ada/wienerdog');
  assert.equal(cfg.timeoutMs, 20 * 60_000);
  assert.equal(cfg.maxInputBytes, 8_000_000);
  assert.equal(cfg.model, null);
  assert.equal(cfg.preprocessTimeoutMs, 60_000);
});

test('dream-collect: readDreamConfig honors optional knobs', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.writeFileSync(
    paths.config,
    ['vault: "/v/path"', 'dream_timeout_minutes: 5', 'dream_max_input_bytes: 1234', 'dream_model: sonnet'].join('\n') + '\n'
  );
  const cfg = readDreamConfig(paths.config);
  assert.equal(cfg.vault, '/v/path');
  assert.equal(cfg.timeoutMs, 5 * 60_000);
  assert.equal(cfg.maxInputBytes, 1234);
  assert.equal(cfg.model, 'sonnet');
});

test('dream-collect: readDreamConfig throws on a missing vault', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.writeFileSync(paths.config, 'version: 1\n');
  assert.throws(() => readDreamConfig(paths.config), /no vault configured/);
});

// ---- watermarks (module stays for the one-time ledger migration) ----

test('dream-collect: readWatermarks tolerates missing/corrupt file', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.state, { recursive: true });
  assert.deepEqual(readWatermarks(paths.state), { claude: null, codex: null });
  fs.writeFileSync(path.join(paths.state, 'watermarks.json'), '{ broken');
  assert.deepEqual(readWatermarks(paths.state), { claude: null, codex: null });
});

test('dream-collect: writeWatermarks round-trips atomically', () => {
  const paths = tempPaths();
  writeWatermarks(paths.state, { claude: 111, codex: 222 });
  assert.deepEqual(readWatermarks(paths.state), { claude: 111, codex: 222 });
});

// ---- collectExtracts ----

test('dream-collect: returns both harnesses on a fresh ledger; both land in processed', () => {
  const paths = tempPaths();
  writeClaude(paths, 'c1', 1, 10, new Date('2026-01-02T00:00:00Z'));
  writeCodex(paths, 'x1', new Date('2026-01-03T00:00:00Z'));

  const result = collectExtracts(paths, emptyLedger(), 400_000);

  assert.equal(result.entries.length, 2);
  assert.equal(result.wrote.length, 2);
  assert.equal(result.droppedForSize, 0);
  assert.ok(fs.existsSync(path.join(result.scratchDir, 'claude-c1.json')));
  assert.ok(fs.existsSync(path.join(result.scratchDir, 'codex-x1.json')));
  // Per-file outcomes: both were written to scratch → candidates for a processed record.
  assert.equal(result.processed.length, 2);
  assert.deepEqual(result.processed.map((d) => d.harness).sort(), ['claude', 'codex']);
  assert.equal(result.newlyQuarantined.length, 0);
  assert.equal(result.deferred.length, 0);
});

test('dream-collect: return shape — deferred aliases dropped, maxMtime is gone, disc metadata rides processed', () => {
  const paths = tempPaths();
  writeClaude(paths, 'c1', 1, 10, new Date('2026-01-02T00:00:00Z'));

  const result = collectExtracts(paths, emptyLedger(), 400_000);

  assert.ok(!('maxMtime' in result), 'the scalar-watermark maxMtime is removed');
  assert.equal(result.dropped, result.deferred, 'dropped is a back-compat alias of deferred');
  assert.equal(result.droppedForSize, result.deferred.length);
  // processed carries the discovery record the ledger fingerprints.
  const d = result.processed[0];
  for (const k of ['harness', 'path', 'mtimeMs', 'size', 'dev', 'ino']) {
    assert.ok(k in d, `processed[0].${k} present`);
  }
});

test('dream-collect: honors the migrated baseline_mtime (at/below baseline with no record → skipped)', () => {
  const paths = tempPaths();
  const cMtime = writeClaude(paths, 'c1', 1, 10, new Date('2026-01-02T00:00:00Z'));
  writeCodex(paths, 'x1', new Date('2026-01-03T00:00:00Z'));

  // Claude baseline == its file mtime → treated as already-processed (must be strictly newer).
  const ledger = { ...emptyLedger(), baseline_mtime: { claude: cMtime, codex: null } };
  const result = collectExtracts(paths, ledger, 400_000);

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].harness, 'codex');
  assert.equal(fs.existsSync(path.join(result.scratchDir, 'claude-c1.json')), false);
  assert.ok(fs.existsSync(path.join(result.scratchDir, 'codex-x1.json')));
  assert.equal(result.processed.length, 1);
  assert.equal(result.processed[0].harness, 'codex');
});

test('dream-collect: a matching processed record skips the file; a changed file is re-selected', () => {
  const paths = tempPaths();
  writeClaude(paths, 'c1', 1, 10, new Date('2026-01-02T00:00:00Z'));

  const first = collectExtracts(paths, emptyLedger(), 400_000);
  assert.equal(first.entries.length, 1);
  let ledger = emptyLedger();
  for (const d of first.processed) ledger = ledgerLib.recordProcessed(ledger, d);

  const second = collectExtracts(paths, ledger, 400_000);
  assert.equal(second.entries.length, 0, 'unchanged processed file not re-selected');

  // The file changes (content + mtime) → new fingerprint → reprocessed.
  writeClaude(paths, 'c1', 2, 10, new Date('2026-01-04T00:00:00Z'));
  const third = collectExtracts(paths, ledger, 400_000);
  assert.equal(third.entries.length, 1);
});

test('dream-collect: oversized sessions are skipped with no negative record', () => {
  const paths = tempPaths();
  // Claude is OLDER and LARGE; codex is NEWER and small.
  writeClaude(paths, 'c1', 5, 4000, new Date('2026-01-02T00:00:00Z'));
  writeCodex(paths, 'x1', new Date('2026-01-03T00:00:00Z'));

  // Cap fits the small codex extract but not the large claude one.
  const result = collectExtracts(paths, emptyLedger(), 2000);

  assert.ok(result.oversized.length > 0);
  assert.equal(result.wrote.length, 1);
  assert.equal(result.entries[0].harness, 'codex');
  // Oversized: in NEITHER processed nor newlyQuarantined
  // (no record → naturally retried next run — the WP-048/069 starvation fix).
  assert.equal(result.oversized.length, 1);
  assert.equal(path.basename(result.oversized[0].path), 'c1.jsonl');
  assert.ok(!result.processed.some((d) => d.path.endsWith('c1.jsonl')));
  assert.equal(result.newlyQuarantined.length, 0);
});

test('dream-collect: a oversized file is selected again on a subsequent larger-budget run', () => {
  const paths = tempPaths();
  writeClaude(paths, 'c1', 5, 4000, new Date('2026-01-02T00:00:00Z'));
  writeCodex(paths, 'x1', new Date('2026-01-03T00:00:00Z'));

  const first = collectExtracts(paths, emptyLedger(), 2000);
  assert.equal(first.oversized.length, 1);
  // Record ONLY what a successful run records: the processed files.
  let ledger = emptyLedger();
  for (const d of first.processed) ledger = ledgerLib.recordProcessed(ledger, d);

  // A larger budget next run picks the oversized file up (no watermark gap).
  const second = collectExtracts(paths, ledger, 400_000);
  assert.equal(second.entries.length, 1);
  assert.equal(second.entries[0].session_id, 'c1');
  assert.equal(second.deferred.length, 0);
});

test('dream-collect: an over-ceiling file is quarantined WITHOUT being opened; the valid neighbour is still processed', () => {
  const paths = tempPaths();
  writeClaude(paths, 'c-ok', 1, 10, new Date('2026-01-02T00:00:00Z'));
  const hugePath = writeOverCeiling(paths, 'huge', new Date('2026-01-03T00:00:00Z'));
  if (process.platform !== 'win32') {
    // Unreadable: any attempt to OPEN it would report read-error, so an
    // 'over-ceiling' outcome proves the pre-read ceiling fired before open.
    fs.chmodSync(hugePath, 0o000);
  }

  const result = collectExtracts(paths, emptyLedger(), 400_000);

  assert.equal(result.newlyQuarantined.length, 1);
  assert.equal(result.newlyQuarantined[0].reason, 'over-ceiling');
  assert.equal(path.basename(result.newlyQuarantined[0].path), 'huge.jsonl');
  // The valid neighbour is unaffected.
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].session_id, 'c-ok');
  assert.equal(result.processed.length, 1);
  assert.ok(result.processed[0].path.endsWith('c-ok.jsonl'));
  // Quarantined ≠ deferred: it never enters the byte budget.
  assert.equal(result.deferred.length, 0);
});

test('dream-collect: a ledger-quarantined unchanged file is not re-selected', () => {
  const paths = tempPaths();
  writeOverCeiling(paths, 'huge', new Date('2026-01-03T00:00:00Z'));

  const first = collectExtracts(paths, emptyLedger(), 400_000);
  assert.equal(first.newlyQuarantined.length, 1);
  let ledger = emptyLedger();
  for (const q of first.newlyQuarantined) ledger = ledgerLib.recordQuarantined(ledger, q, q.reason);

  const second = collectExtracts(paths, ledger, 400_000);
  assert.equal(second.newlyQuarantined.length, 0, 'unchanged quarantine not re-quarantined');
  assert.equal(second.entries.length, 0);
});

test('dream-collect: newest complete extract wins; remaining-space overflow stops before older fits', () => {
  const paths = tempPaths();
  writeClaude(paths, 'newest', 100, 2000, new Date('2026-01-05'));
  writeClaude(paths, 'middle', 100, 2000, new Date('2026-01-04'));
  writeClaude(paths, 'oldsmall', 1, 10, new Date('2026-01-03'));
  const result = collectExtracts(paths, emptyLedger(), 400_000);
  assert.deepEqual(result.entries.map((e) => e.session_id), ['newest']);
  assert.deepEqual(result.deferred.map((e) => e.session_id), ['middle', 'oldsmall']);
  assert.deepEqual(result.truncated, []);
  assert.equal(result.entries[0].truncatedToFit, false);
  assert.equal(JSON.parse(fs.readFileSync(result.wrote[0])).messages.length, 100);
});

test('dream-collect: oversized newer extract reserves nothing for a fitting older session', () => {
  const paths = tempPaths();
  writeClaude(paths, 'big', 100, 2000, new Date('2026-01-05'));
  writeClaude(paths, 'small', 1, 10, new Date('2026-01-02'));
  const result = collectExtracts(paths, emptyLedger(), 100_000);
  assert.deepEqual(result.entries.map((e) => e.session_id), ['small']);
  assert.equal(result.oversized.length, 1);
  assert.equal(result.oversized[0].cached, false);
  assert.equal(result.deferred.length, 0);
  assert.equal(result.newlyQuarantined.length, 0);
});

// ---- capacity fairness after a secret-revert exhaustion (ADR-0023 Amendment 1) ----

/** The discovery record collectExtracts would build for a real file on disk.
 *  @param {string} file @returns {object} */
function discOf(file) {
  const st = fs.statSync(file);
  return { harness: 'claude', path: file, mtimeMs: st.mtimeMs, size: st.size, dev: st.dev, ino: st.ino };
}

/** The A/B fixture: two ~103 KB claude transcripts under one 150 000-byte budget,
 *  with the OFFENDER the NEWER of the two (as an actively-appended transcript
 *  always is). One full extract fits; only the ledger differs between A and B.
 *  @returns {{paths:object, offender:string, fresh:string}} */
function fairnessFixture() {
  const paths = tempPaths();
  writeClaude(paths, 'offender', 25, 4000, new Date('2026-01-03T00:00:00Z'));
  writeClaude(paths, 'fresh', 25, 4000, new Date('2026-01-02T00:00:00Z'));
  const dir = path.join(paths.claudeDir, 'projects', 'proj');
  return { paths, offender: path.join(dir, 'offender.jsonl'), fresh: path.join(dir, 'fresh.jsonl') };
}

test('dream-collect: B — a DEFERRED offender is still a candidate and starves the older session out of the budget', () => {
  const { paths, offender } = fairnessFixture();
  // A secret-revert deferral at the offender's CURRENT fingerprint. It is not a
  // negative record: the file is re-selected, wins the newest-mtime-first
  // admission, and the genuinely fresh session is capacity-deferred with NO
  // record. (Before the fix a `deferred` record read as skip-processed, so the
  // offender would not even be a candidate — this is the B5 proof.)
  const ledger = ledgerLib.recordSecretDeferred(emptyLedger(), discOf(offender), 1);

  const result = collectExtracts(paths, ledger, 150_000);

  assert.deepEqual(result.processed.map((d) => path.basename(d.path)), ['offender.jsonl']);
  assert.equal(result.entries[0].truncatedToFit, false, 'the offender fits whole');
  assert.deepEqual(result.deferred.map((d) => d.session_id), ['fresh'], 'the new session is starved');
  assert.equal(result.newlyQuarantined.length, 0);
});

test('dream-collect: A — an EXHAUSTED offender is not a candidate at all, so the fresh session gets the budget', () => {
  const { paths, offender, fresh } = fairnessFixture();
  // Same two files, same budget — only the ledger differs. The exhausted record
  // carries a deliberately STALE fingerprint (the appended-transcript case): the
  // sticky skip must ignore it, or the offender is re-selected forever.
  const ledger = {
    ...emptyLedger(),
    files: {
      [ledgerLib.foldKey(offender)]: {
        fingerprint: '1:1:1:1',
        outcome: 'quarantined',
        reason: ledgerLib.SECRET_REVERT_EXHAUSTED_REASON,
        updated_at: '2026-01-04T00:00:00.000Z',
        harness: 'claude',
      },
    },
  };

  const result = collectExtracts(paths, ledger, 150_000);

  assert.deepEqual(result.processed.map((d) => path.basename(d.path)), ['fresh.jsonl']);
  assert.equal(result.entries[0].session_id, 'fresh');
  // The offender never enters the byte budget: not processed, not deferred, and
  // not re-quarantined at intake.
  const named = (list) => list.some((x) => (x.path || '').endsWith('offender.jsonl') || x.session_id === 'offender');
  assert.equal(named(result.processed), false);
  assert.equal(named(result.deferred), false);
  assert.equal(named(result.newlyQuarantined), false);
  assert.ok(fs.existsSync(offender) && fs.existsSync(fresh), 'a skip is never a deletion');
});

test('dream-collect: rotating an exhausted transcript hands the rotated file a fresh budget (residual R4)', () => {
  // This test DOCUMENTS Table E rows E4/E5 — a rotation gives the rotated file a
  // fresh budget under path keys, and the replacement at the old path inherits
  // the record. Neither harness rotates transcripts, so this characterises
  // behaviour rather than requiring it.
  const { paths, offender } = fairnessFixture();
  const ledger = {
    ...emptyLedger(),
    files: {
      [ledgerLib.foldKey(offender)]: {
        fingerprint: '1:1:1:1',
        outcome: 'quarantined',
        reason: ledgerLib.SECRET_REVERT_EXHAUSTED_REASON,
        updated_at: '2026-01-04T00:00:00.000Z',
        harness: 'claude',
      },
    },
  };

  // Keep the `.jsonl` suffix: claude discovery skips any other name, so an
  // `offender + '.1'` target would drop out of discovery and pin nothing.
  const rotated = offender.replace(/\.jsonl$/, '.1.jsonl');
  fs.renameSync(offender, rotated);
  // A new session file appears at the old, still-exhausted path.
  writeClaude(paths, 'offender', 1, 10, new Date('2026-01-06T00:00:00Z'));

  const result = collectExtracts(paths, ledger, 400_000);

  const processed = result.processed.map((d) => path.basename(d.path)).sort();
  assert.ok(processed.includes('offender.1.jsonl'), 'E4 — the rotated file has no record: a fresh budget');
  assert.equal(processed.includes('offender.jsonl'), false, 'E5 — the replacement inherits the sticky exhausted record');
  assert.equal(result.deferred.some((d) => d.session_id === 'offender'), false);
  assert.equal(result.newlyQuarantined.some((q) => q.path.endsWith('/offender.jsonl')), false);
});

// ---- one file at a time (the F1 fix) ----

test('dream-collect: a backlog of near-limit files collects under a constrained heap (one file resident at a time)', () => {
  const paths = tempPaths();
  // 10 sessions × ~8 MB serialized extract each (2000 msgs × 4000 chars). The old
  // collect-all-then-budget path holds all ~80 MB of parsed extracts at once and
  // dies under a 64 MB old-space heap; the one-file-at-a-time path holds at most
  // one extract and survives.
  const when = new Date('2026-01-05T00:00:00Z');
  const dir = path.join(paths.claudeDir, 'projects', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 10; i++) {
    const sessionId = `bulk${i}`;
    const line = JSON.stringify({
      type: 'user',
      sessionId,
      cwd: '/home/ada/proj',
      timestamp: '2026-01-01T10:00:00.000Z',
      message: { role: 'user', content: 'x'.repeat(4000) },
    });
    const file = path.join(dir, `${sessionId}.jsonl`);
    fs.writeFileSync(file, `${line}\n`.repeat(MAX_MESSAGES));
    fs.utimesSync(file, when, when);
  }

  const scratchPath = require.resolve('../../src/core/dream/scratch');
  const pathsPath = require.resolve('../../src/core/paths');
  const opts = {
    HOME: path.dirname(paths.core),
    WIENERDOG_HOME: paths.core,
    CLAUDE_CONFIG_DIR: paths.claudeDir,
    CODEX_HOME: paths.codexDir,
  };
  const script = [
    `const { collectExtracts } = require(${JSON.stringify(scratchPath)});`,
    `const { getPaths } = require(${JSON.stringify(pathsPath)});`,
    `const paths = getPaths(${JSON.stringify(opts)});`,
    'const ledger = { version: 1, baseline_mtime: { claude: null, codex: null }, files: {} };',
    'const res = collectExtracts(paths, ledger, 200_000_000);',
    'console.log(JSON.stringify({ entries: res.entries.length, processed: res.processed.length, quarantined: res.newlyQuarantined.length, deferred: res.deferred.length }));',
  ].join('\n');
  const child = spawnSync(process.execPath, ['--max-old-space-size=64', '-e', script], { encoding: 'utf8' });
  assert.equal(child.status, 0, `constrained-heap collect failed: ${child.stderr}`);
  const out = JSON.parse(child.stdout);
  assert.deepEqual(out, { entries: 10, processed: 10, quarantined: 0, deferred: 0 });
});

// ---- admitted extracts preserve parser skill_invocations (WP-087) ----

test('dream-collect: whole admission preserves early and late skill invocations', () => {
  const paths = tempPaths();
  const sessionId = 'sk1';
  const dir = path.join(paths.claudeDir, 'projects', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.jsonl`);
  const ts = '2026-01-01T10:00:00.000Z';
  const big = 'x'.repeat(4000); // at MAX_MSG_CHARS so capMessage doesn't shrink it
  const lines = [];
  for (let i = 0; i < 30; i++) {
    lines.push(JSON.stringify({ type: 'user', sessionId, cwd: '/p', timestamp: ts, message: { role: 'user', content: big } }));
  }
  lines.push(
    JSON.stringify({
      type: 'assistant',
      sessionId,
      cwd: '/p',
      timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'text', text: 'look' }, { type: 'tool_use', id: 'toolu_early', name: 'Skill', input: { skill: 'early' } }] },
    })
  );
  lines.push(
    JSON.stringify({
      type: 'user',
      sessionId,
      cwd: '/p',
      timestamp: ts,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_early', is_error: false, content: [{ type: 'text', text: 'done-early' }] }] },
    })
  );
  for (let i = 0; i < 30; i++) {
    lines.push(JSON.stringify({ type: 'user', sessionId, cwd: '/p', timestamp: ts, message: { role: 'user', content: big } }));
  }
  // A second invocation/result window follows the padding; both must survive.
  lines.push(
    JSON.stringify({
      type: 'assistant',
      sessionId,
      cwd: '/p',
      timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'text', text: 'run-late' }, { type: 'tool_use', id: 'toolu_late', name: 'Skill', input: { skill: 'late' } }] },
    })
  );
  lines.push(
    JSON.stringify({
      type: 'user',
      sessionId,
      cwd: '/p',
      timestamp: ts,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_late', is_error: false, content: [{ type: 'text', text: 'done-late' }] }] },
    })
  );
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const when = new Date('2026-01-05T00:00:00Z');
  fs.utimesSync(file, when, when);

  // The full filtered extract fits and must retain both invocation windows.
  const result = collectExtracts(paths, emptyLedger(), 400_000);

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].truncatedToFit, false);
  const extract = JSON.parse(fs.readFileSync(path.join(result.scratchDir, `claude-${sessionId}.json`), 'utf8'));
  assert.equal(extract.messages.length, 64);

  const skills = extract.skill_invocations.map((si) => si.skill);
  assert.ok(skills.includes('early')); // no budget-induced prefix removal

  const late = extract.skill_invocations.find((si) => si.skill === 'late');
  assert.ok(late, 'late invocation must survive whole admission');
  assert.ok(late.index >= 0 && late.index < extract.messages.length);
  assert.ok(late.resultIndex >= 0 && late.resultIndex < extract.messages.length);
  assert.equal(extract.messages[late.resultIndex].text, 'done-late');
});

test('dream-collect: whole admission preserves the parser result for a trailing invocation', () => {
  const paths = tempPaths();
  const sessionId = 'sk2';
  const dir = path.join(paths.claudeDir, 'projects', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.jsonl`);
  const ts = '2026-01-01T10:00:00.000Z';
  const big = 'x'.repeat(4000);
  const lines = [];
  for (let i = 0; i < 30; i++) {
    lines.push(JSON.stringify({ type: 'user', sessionId, cwd: '/p', timestamp: ts, message: { role: 'user', content: big } }));
  }
  // Final raw event: an assistant turn with text and an unpaired Skill tool_use.
  // Whole admission must preserve the parser's exact invocation representation.
  lines.push(
    JSON.stringify({
      type: 'assistant',
      sessionId,
      cwd: '/p',
      timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'text', text: 'tail' }, { type: 'tool_use', id: 'toolu_bar', name: 'Skill', input: { skill: 'bar' } }] },
    })
  );
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const when = new Date('2026-01-05T00:00:00Z');
  fs.utimesSync(file, when, when);

  const result = collectExtracts(paths, emptyLedger(), 400_000);

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].truncatedToFit, false);
  const extract = JSON.parse(fs.readFileSync(path.join(result.scratchDir, `claude-${sessionId}.json`), 'utf8'));
  const parsed = fullExtracts(paths)[0].extract;
  assert.deepEqual(extract, parsed);
  assert.equal(extract.skill_invocations[0].skill, 'bar');
});

test('dream-collect: a session hitting the parser MAX_MESSAGES cap preserves its invocation without further truncation', () => {
  const paths = tempPaths();
  const sessionId = 'sk3';
  const dir = path.join(paths.claudeDir, 'projects', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.jsonl`);
  const ts = '2026-01-01T10:00:00.000Z';
  const lines = [];
  // Enough small padding messages that, once the invocation + result are appended,
  // parse() applies its MAX_MESSAGES count cap FIRST (front-truncating and
  // rebasing — WP-080, untouched by this WP).
  const padCount = MAX_MESSAGES + 50;
  for (let i = 0; i < padCount; i++) {
    lines.push(JSON.stringify({ type: 'user', sessionId, cwd: '/p', timestamp: ts, message: { role: 'user', content: `pad${i}` } }));
  }
  // The invocation + its result are the LAST raw messages: they survive parse()'s
  // count cap as the newest tail; collection must preserve that exact result.
  lines.push(
    JSON.stringify({
      type: 'assistant',
      sessionId,
      cwd: '/p',
      timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'text', text: 'run-mid' }, { type: 'tool_use', id: 'toolu_mid', name: 'Skill', input: { skill: 'mid' } }] },
    })
  );
  lines.push(
    JSON.stringify({
      type: 'user',
      sessionId,
      cwd: '/p',
      timestamp: ts,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_mid', is_error: false, content: [{ type: 'text', text: 'done-mid' }] }] },
    })
  );
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const when = new Date('2026-01-05T00:00:00Z');
  fs.utimesSync(file, when, when);

  // The parser cap remains; the collector must not shorten it again.
  const result = collectExtracts(paths, emptyLedger(), 400_000);

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].truncatedToFit, false);
  const extract = JSON.parse(fs.readFileSync(path.join(result.scratchDir, `claude-${sessionId}.json`), 'utf8'));
  assert.equal(extract.messages.length, MAX_MESSAGES);
  assert.equal(extract.truncated, true);
  assert.equal(extract.skill_invocations.length, 1);
  const mid = extract.skill_invocations[0];
  assert.equal(mid.skill, 'mid');
  assert.ok(mid.index >= 0 && mid.index < extract.messages.length);
  assert.ok(mid.resultIndex >= 0 && mid.resultIndex < extract.messages.length);
  assert.equal(extract.messages[mid.resultIndex].text, 'done-mid');
});

test('dream-collect: re-running empties stale scratch, cleanScratch removes it', () => {
  const paths = tempPaths();
  writeCodex(paths, 'x1', new Date('2026-01-03T00:00:00Z'));
  const first = collectExtracts(paths, emptyLedger(), 400_000);
  // Plant a stray file; a fresh collect must wipe it.
  fs.writeFileSync(path.join(first.scratchDir, 'stray.json'), '{}');
  const second = collectExtracts(paths, emptyLedger(), 400_000);
  assert.equal(fs.existsSync(path.join(second.scratchDir, 'stray.json')), false);

  cleanScratch(paths.state);
  assert.equal(fs.existsSync(second.scratchDir), false);
});

// ---- filtered demand, independent work budgets and admission deadline ----

function fullExtracts(paths) {
  return transcripts.discover(paths, { since: null }).sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((d) => ({ d, extract: transcripts.parseWithOutcome(d, transcripts.newRunBudget()).extract }));
}
const compactBytes = (extract) => Buffer.byteLength(JSON.stringify(extract));

test('dream-collect: preprocessing scalar accepts fractional seconds and rejects invalid or overflowing conversion', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  for (const [scalar, expected] of [['0.25', 250], ['"2"', 2000], ['2 # seconds', 2000], ['0', 60_000], ['-1', 60_000], ['NaN', 60_000], ['Infinity', 60_000], ['1e308', 60_000], ['', 60_000]]) {
    fs.writeFileSync(paths.config, `vault: /v\ndream_preprocess_timeout_seconds: ${scalar}\n`);
    assert.equal(readDreamConfig(paths.config).preprocessTimeoutMs, expected, scalar);
  }
  fs.writeFileSync(paths.config, 'vault: /v\nother:\n  dream_preprocess_timeout_seconds: 3\n');
  assert.equal(readDreamConfig(paths.config).preprocessTimeoutMs, 60_000);
});

test('dream-collect: filtered complete content from both harnesses fits despite raw padding', () => {
  const paths = tempPaths();
  writeClaude(paths, 'useful', 200, 1000, new Date('2026-01-03'));
  writeCodex(paths, 'small', new Date('2026-01-02'));
  for (const d of transcripts.discover(paths, { since: null })) {
    fs.appendFileSync(d.path, `${JSON.stringify({ type: 'ignored', padding: 'z'.repeat(900_000) })}\n`.repeat(3));
  }
  const full = fullExtracts(paths);
  assert.ok(full.reduce((sum, { extract }) => sum + compactBytes(extract), 0) < 400_000);
  const result = collectExtracts(paths, emptyLedger(), 400_000);
  assert.equal(result.entries.length, 2);
  for (const { extract } of full) {
    const entry = result.entries.find((e) => e.session_id === extract.session_id);
    assert.deepEqual(JSON.parse(fs.readFileSync(entry.scratchFile)), extract);
  }
  assert.deepEqual(result.truncated, []);
});

test('dream-collect: compact metadata is charged even when larger than raw source; exact fit stops', () => {
  const paths = tempPaths();
  writeClaude(paths, 'tiny', 1, 1, new Date('2026-01-03'));
  const [{ d, extract }] = fullExtracts(paths);
  const exact = compactBytes(extract);
  assert.ok(exact > d.size);
  const tooSmall = collectExtracts(paths, emptyLedger(), exact - 1);
  assert.equal(tooSmall.entries.length, 0);
  assert.equal(tooSmall.oversized[0].extractBytes, exact);
  writeCodex(paths, 'older', new Date('2026-01-02'));
  const result = collectExtracts(paths, emptyLedger(), exact);
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.deferred.map((e) => e.session_id), ['rollout-older']);
  assert.equal(fs.readFileSync(result.wrote[0], 'utf8'), JSON.stringify(extract, null, 2));
  assert.ok(fs.statSync(result.wrote[0]).size > exact, 'physical bytes are deliberately a different measure');
});

test('dream-collect: equal-mtime admission preserves discovery order', () => {
  const paths = tempPaths();
  writeClaude(paths, 'one', 1, 1, new Date('2026-01-03'));
  writeCodex(paths, 'two', new Date('2026-01-03'));
  const [{ extract }] = fullExtracts(paths);
  const result = collectExtracts(paths, emptyLedger(), compactBytes(extract));
  assert.equal(result.entries[0].session_id, extract.session_id);
  assert.equal(result.deferred.length, 1);
});

test('dream-collect: deadline includes discovery and scratch setup, equality excludes a parse', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'one', 1, 10, new Date('2026-01-03'));
  let tick = 0;
  const discover = transcripts.discover;
  t.mock.method(transcripts, 'discover', (...args) => { tick += 40; return discover(...args); });
  const mkdir = fs.mkdirSync;
  t.mock.method(fs, 'mkdirSync', (...args) => { tick += 20; return mkdir(...args); });
  const parser = t.mock.method(transcripts, 'parseWithOutcome');
  const result = collectExtracts(paths, emptyLedger(), 400_000, { preprocessTimeoutMs: 60, now: () => tick });
  assert.equal(parser.mock.callCount(), 0);
  assert.equal(result.deadlineDeferred.length, 1);
  assert.deepEqual(result.oversizedExtracts, {});
  assert.equal(result.deferred.length, 0);
});

test('dream-collect: a started parse finishes across expiry, then deadline stops older sessions', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'new', 1, 10, new Date('2026-01-03'));
  writeCodex(paths, 'old', new Date('2026-01-02'));
  let tick = 0;
  const parse = transcripts.parseWithOutcome;
  t.mock.method(transcripts, 'parseWithOutcome', (...args) => { tick = 100; return parse(...args); });
  const result = collectExtracts(paths, emptyLedger(), 400_000, { preprocessTimeoutMs: 60, now: () => tick });
  assert.equal(result.entries.length, 1);
  assert.equal(result.deadlineDeferred.length, 1);
  assert.equal(result.deferred.length, 0);
});

test('dream-collect: post-parse writing time counts before the next admission', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'new', 1, 10, new Date('2026-01-03'));
  writeCodex(paths, 'old', new Date('2026-01-02'));
  let tick = 0;
  const write = fs.writeSync;
  t.mock.method(fs, 'writeSync', (...args) => { tick = 100; return write(...args); });
  const result = collectExtracts(paths, emptyLedger(), 400_000, { preprocessTimeoutMs: 60, now: () => tick });
  assert.equal(result.entries.length, 1);
  assert.equal(result.deadlineDeferred.length, 1);
});

test('dream-collect: incomplete reads are discarded and the next candidate receives a fresh budget', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'partial', 1, 10, new Date('2026-01-03'));
  writeCodex(paths, 'whole', new Date('2026-01-02'));
  const parse = transcripts.parseWithOutcome;
  const budgets = [];
  t.mock.method(transcripts, 'parseWithOutcome', (d, budget) => {
    assert.equal(budget.remaining, Limits.MAX_RUN_BYTES);
    budgets.push(budget);
    const result = parse(d, budget);
    if (budgets.length === 1) { budget.remaining = 0; result.parse.runExhausted = true; }
    return result;
  });
  const result = collectExtracts(paths, emptyLedger(), 400_000);
  assert.notEqual(budgets[0], budgets[1]);
  assert.deepEqual(result.entries.map((e) => e.session_id), ['whole']);
  assert.deepEqual(result.readDeferred.map((e) => e.session_id), ['partial']);
  assert.equal(result.deferred.length, 0);
  assert.deepEqual(fs.readdirSync(result.scratchDir), ['codex-whole.json']);
});

test('dream-collect: raw work can cross 200 MiB across individually bounded sessions', (t) => {
  const paths = tempPaths();
  t.after(() => fs.rmSync(path.dirname(paths.core), { recursive: true, force: true }));
  const dir = path.join(paths.claudeDir, 'projects', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  const padding = `${JSON.stringify({ type: 'ignored', padding: 'x'.repeat(900_000) })}\n`;
  for (let i = 0; i < 5; i++) {
    const file = path.join(dir, `work${i}.jsonl`);
    writeClaude(paths, `work${i}`, 1, 10, new Date('2026-01-03'));
    const fd = fs.openSync(file, 'a');
    try { for (let j = 0; j < 48; j++) fs.writeSync(fd, padding); } finally { fs.closeSync(fd); }
  }
  const discovered = transcripts.discover(paths, { since: null });
  assert.ok(discovered.reduce((n, d) => n + d.size, 0) > Limits.MAX_RUN_BYTES);
  const result = collectExtracts(paths, emptyLedger(), 400_000, { now: () => 0 });
  assert.equal(result.entries.length, 5);
  assert.equal(result.readDeferred.length, 0);
});

test('dream-collect: identical clock decisions reproduce accounting, private scratch bytes and source bytes', () => {
  const paths = tempPaths();
  writeClaude(paths, 'repeat', 1, 10, new Date('2026-01-03'));
  const [{ d }] = fullExtracts(paths);
  const source = fs.readFileSync(d.path);
  const first = collectExtracts(paths, emptyLedger(), 400_000, { now: () => 0 });
  const bytes = fs.readFileSync(first.wrote[0]);
  const second = collectExtracts(paths, emptyLedger(), 400_000, { now: () => 0 });
  assert.deepEqual(second, first);
  assert.deepEqual(fs.readFileSync(second.wrote[0]), bytes);
  assert.deepEqual(fs.readFileSync(d.path), source);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(second.scratchDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(second.wrote[0]).mode & 0o777, 0o600);
  }
});

// ---- optional oversized measurements never authorize processing ----

function memoFor(d, extractBytes) {
  return { fingerprint: ledgerLib.fingerprint(d), appVersion: require('../../package.json').version, extractBytes };
}

test('dream-collect: oversized memo skips parsing only for matching fingerprint/version and insufficient X', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'large', 10, 1000, new Date('2026-01-03'));
  const [{ d, extract }] = fullExtracts(paths);
  const bytes = compactBytes(extract);
  const first = collectExtracts(paths, emptyLedger(), 1000);
  assert.deepEqual(first.oversizedExtracts, { [ledgerLib.foldKey(d.path)]: memoFor(d, bytes) });
  const ledger = { ...emptyLedger(), oversizedExtracts: first.oversizedExtracts };
  const snapshot = structuredClone(ledger);
  const parser = t.mock.method(transcripts, 'parseWithOutcome');
  for (const x of [1000, 500, bytes - 1]) {
    const result = collectExtracts(paths, ledger, x);
    assert.equal(result.oversized[0].cached, true);
    assert.deepEqual(result.oversizedExtracts, first.oversizedExtracts);
  }
  assert.equal(parser.mock.callCount(), 0);
  const retry = collectExtracts(paths, ledger, bytes);
  assert.equal(parser.mock.callCount(), 1);
  assert.equal(retry.entries.length, 1);
  assert.deepEqual(retry.oversizedExtracts, {});
  assert.deepEqual(ledger, snapshot, 'collector must not mutate input ledger or its memo');
});

test('dream-collect: changed fingerprint/version or malformed memo forces fresh parsing', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'large', 10, 1000, new Date('2026-01-03'));
  const [{ d, extract }] = fullExtracts(paths);
  const valid = memoFor(d, compactBytes(extract));
  const parser = t.mock.method(transcripts, 'parseWithOutcome');
  const variants = [
    { ...valid, fingerprint: 'changed' }, { ...valid, appVersion: 'older' },
    null, [], { ...valid, extractBytes: '20000' }, { ...valid, extractBytes: 0 },
    { ...valid, extractBytes: 1.5 }, { ...valid, extractBytes: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, fingerprint: 1 }, { ...valid, appVersion: 1 },
  ];
  for (const record of variants) {
    const result = collectExtracts(paths, { ...emptyLedger(), oversizedExtracts: { [ledgerLib.foldKey(d.path)]: record } }, 1000);
    assert.equal(result.oversized[0].cached, false);
    assert.deepEqual(result.oversizedExtracts[ledgerLib.foldKey(d.path)], valid);
  }
  assert.equal(parser.mock.callCount(), variants.length);
});

test('dream-collect: memo pruning honors eligibility and retains valid unvisited measurements behind stops', () => {
  const paths = tempPaths();
  writeClaude(paths, 'newest', 1, 10, new Date('2026-01-05'));
  writeClaude(paths, 'unvisited', 1, 10, new Date('2026-01-04'));
  writeClaude(paths, 'processed', 1, 10, new Date('2026-01-03'));
  writeClaude(paths, 'changed', 1, 10, new Date('2026-01-02'));
  writeClaude(paths, 'exhausted', 1, 10, new Date('2026-01-01'));
  const huge = writeOverCeiling(paths, 'ceiling', new Date('2026-01-01'));
  const full = fullExtracts(paths).filter(({ d }) => d.path !== huge);
  const byId = Object.fromEntries(full.map((item) => [item.extract.session_id, item]));
  let ledger = ledgerLib.recordProcessed(emptyLedger(), byId.processed.d);
  ledger = ledgerLib.recordSecretExhausted(ledger, byId.exhausted.d);
  const memos = {};
  for (const { d } of full) memos[ledgerLib.foldKey(d.path)] = memoFor(d, 900_000);
  memos[ledgerLib.foldKey(huge)] = memoFor(discOf(huge), 900_000);
  memos[ledgerLib.foldKey(byId.changed.d.path)].fingerprint = 'stale';
  memos['/absent.jsonl'] = memoFor(byId.newest.d, 900_000);
  delete memos[ledgerLib.foldKey(byId.newest.d.path)];
  ledger.oversizedExtracts = memos;
  const x = compactBytes(byId.newest.extract);
  const result = collectExtracts(paths, ledger, x);
  assert.deepEqual(result.oversizedExtracts, { [ledgerLib.foldKey(byId.unvisited.d.path)]: memoFor(byId.unvisited.d, 900_000) });
  assert.deepEqual(result.deferred.map((e) => e.session_id), ['unvisited', 'changed']);
  assert.equal(result.oversized.length, 0, 'unvisited is classified by capacity, never inferred oversized');
  assert.equal(result.newlyQuarantined.length, 1);
});

test('dream-collect: expired deadline retains valid unvisited memo even when X is now sufficient', () => {
  const paths = tempPaths();
  writeClaude(paths, 'one', 1, 10, new Date('2026-01-03'));
  const [{ d, extract }] = fullExtracts(paths);
  const oversizedExtracts = { [ledgerLib.foldKey(d.path)]: memoFor(d, compactBytes(extract)) };
  let n = 0;
  const result = collectExtracts(paths, { ...emptyLedger(), oversizedExtracts }, 400_000,
    { preprocessTimeoutMs: 60, now: () => n++ === 0 ? 0 : 60 });
  assert.equal(result.deadlineDeferred.length, 1);
  assert.deepEqual(result.oversizedExtracts, oversizedExtracts);
  assert.deepEqual(result.oversized, []);
});

test('dream-collect: parser quarantine and scratch write errors preserve their existing behavior', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'one', 1, 10, new Date('2026-01-03'));
  const parse = transcripts.parseWithOutcome;
  const parser = t.mock.method(transcripts, 'parseWithOutcome', (...args) => {
    const result = parse(...args); result.parse.outcome = 'too-many-lines'; return result;
  });
  const result = collectExtracts(paths, emptyLedger(), 400_000);
  assert.equal(result.newlyQuarantined[0].reason, 'too-many-lines');
  assert.equal(result.processed.length, 0);
  assert.deepEqual(fs.readdirSync(result.scratchDir), []);
  parser.mock.restore();
  t.mock.method(fs, 'writeSync', () => { throw new Error('scratch write failed'); });
  assert.throws(() => collectExtracts(paths, emptyLedger(), 400_000), /scratch write failed/);
});
