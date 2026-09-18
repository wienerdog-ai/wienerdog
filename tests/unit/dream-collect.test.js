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
  // Row D1: the invocation geometry rides the TEXT-FREE gate projection of the
  // ORIGINAL timeline, which the collector returns in memory — never the scratch
  // file the model reads.
  const gate = result.gateExtracts.get(`claude:${sessionId}`);
  assert.equal(gate.messages.length, 64);

  const skills = gate.skill_invocations.map((si) => si.skill);
  assert.ok(skills.includes('early')); // no budget-induced prefix removal

  const late = gate.skill_invocations.find((si) => si.skill === 'late');
  assert.ok(late, 'late invocation must survive whole admission');
  assert.ok(late.index >= 0 && late.index < gate.messages.length);
  assert.ok(late.resultIndex >= 0 && late.resultIndex < gate.messages.length);
  assert.equal(gate.messages[late.resultIndex].role, 'tool_result');

  // Rows C2/D2: what the MODEL reads is dialogue, with no tool-record metadata
  // and no tool text at all.
  const extract = JSON.parse(fs.readFileSync(path.join(result.scratchDir, `claude-${sessionId}.json`), 'utf8'));
  assert.equal(extract.skill_invocations, undefined);
  assert.ok(extract.messages.every((m) => m.role === 'user' || m.role === 'assistant'));
  assert.ok(!JSON.stringify(extract).includes('done-late'), 'tool result text never reaches scratch');
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
  const parsed = primaryExtracts(paths)[0].extract;
  assert.deepEqual(extract, parsed);
  // The trailing invocation's exact parser representation survives on the gate
  // projection (row D1); the scratch extract carries no invocation array at all.
  assert.equal(result.gateExtracts.get(`claude:${sessionId}`).skill_invocations[0].skill, 'bar');
  assert.equal(extract.skill_invocations, undefined);
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
  assert.equal(extract.truncated, true);
  const gate = result.gateExtracts.get(`claude:${sessionId}`);
  assert.equal(gate.messages.length, MAX_MESSAGES);
  assert.equal(gate.skill_invocations.length, 1);
  const mid = gate.skill_invocations[0];
  assert.equal(mid.skill, 'mid');
  assert.ok(mid.index >= 0 && mid.index < gate.messages.length);
  assert.ok(mid.resultIndex >= 0 && mid.resultIndex < gate.messages.length);
  assert.equal(gate.messages[mid.resultIndex].role, 'tool_result');
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

/** The same discovery order, parsed through the PRIMARY-DIALOGUE entry point the
 *  collector now uses: `.extract` is what reaches scratch, `.intakeBytes` is what
 *  X is measured against (WP-dream-primary-dialogue-collection, rows C1 and C2). */
function primaryExtracts(paths) {
  return transcripts.discover(paths, { since: null }).sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((d) => ({ d, ...transcripts.parsePrimaryWithOutcome(d, transcripts.newRunBudget()) }));
}

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
  const primary = primaryExtracts(paths);
  assert.ok(primary.reduce((sum, { intakeBytes }) => sum + intakeBytes, 0) < 400_000);
  const result = collectExtracts(paths, emptyLedger(), 400_000);
  assert.equal(result.entries.length, 2);
  for (const { extract } of primary) {
    const entry = result.entries.find((e) => e.session_id === extract.session_id);
    assert.deepEqual(JSON.parse(fs.readFileSync(entry.scratchFile)), extract);
  }
  assert.deepEqual(result.truncated, []);
  // Row C5: the run's intake total is the sum of the admitted sessions' intake.
  assert.equal(result.intakeBytesTotal, primary.reduce((sum, { intakeBytes }) => sum + intakeBytes, 0));
});

test('dream-collect: compact metadata is charged even when larger than raw source; exact fit stops', () => {
  const paths = tempPaths();
  writeClaude(paths, 'tiny', 1, 1, new Date('2026-01-03'));
  const [{ d, extract }] = fullExtracts(paths);
  const [primary] = primaryExtracts(paths);
  // Row C1: the number X is measured against is byte-identical to the compact
  // raw extract this loop measured before the projection landed.
  const exact = compactBytes(extract);
  assert.equal(primary.intakeBytes, exact);
  assert.ok(exact > d.size);
  const tooSmall = collectExtracts(paths, emptyLedger(), exact - 1);
  assert.equal(tooSmall.entries.length, 0);
  assert.equal(tooSmall.oversized[0].extractBytes, exact);
  writeCodex(paths, 'older', new Date('2026-01-02'));
  const result = collectExtracts(paths, emptyLedger(), exact);
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.deferred.map((e) => e.session_id), ['rollout-older']);
  // …and the bytes WRITTEN are the projection's, which is a different quantity.
  assert.equal(fs.readFileSync(result.wrote[0], 'utf8'), JSON.stringify(primary.extract, null, 2));
  assert.equal(result.intakeBytesTotal, exact);
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
  const parser = t.mock.method(transcripts, 'parsePrimaryWithOutcome');
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
  const parse = transcripts.parsePrimaryWithOutcome;
  t.mock.method(transcripts, 'parsePrimaryWithOutcome', (...args) => { tick = 100; return parse(...args); });
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
  const parse = transcripts.parsePrimaryWithOutcome;
  const budgets = [];
  t.mock.method(transcripts, 'parsePrimaryWithOutcome', (d, budget) => {
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
  const parser = t.mock.method(transcripts, 'parsePrimaryWithOutcome');
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
  const parser = t.mock.method(transcripts, 'parsePrimaryWithOutcome');
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
  const parse = transcripts.parsePrimaryWithOutcome;
  const parser = t.mock.method(transcripts, 'parsePrimaryWithOutcome', (...args) => {
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

// -------------------------------------------------------------------------
// secret-sink wiring probes (WP-secret-sink-wiring-probes, ADR-0042)
// -------------------------------------------------------------------------

// A labelled-rule match: the `anthropic-key` rule is
// /sk-ant-[A-Za-z0-9\-_]{20,}/g -> [REDACTED:anthropic-key], severity
// QUARANTINE (src/core/secret-scan.js:88). 48 characters. Shaped so that
// PROBE_HEAD and PROBE_TAIL each trip NO rule: PROBE_HEAD has only 17
// characters after `sk-ant-` (the rule needs 20), and every
// delimiter-separated segment of both halves is word-shaped, so the entropy
// pass suppresses them. Measured against the shipped detector 2026-09-17:
// scanAndRedact(PROBE_HEAD).text === PROBE_HEAD, findings [];
// scanAndRedact(PROBE_TAIL).text === PROBE_TAIL, findings [].
const PROBE = 'sk-ant-api03-PROBE-aaaa-bbbb-cccc-dddd-eeee-ffff';
const PROBE_HEAD = PROBE.slice(0, 24); // 'sk-ant-api03-PROBE-aaaa-'
const MARKER = '[REDACTED:anthropic-key]';

// `artifact` is the file's text, read from disk after the sink ran.
const safeOf = (artifact) => artifact.includes(MARKER) && !artifact.includes(PROBE_HEAD);

// Table S row S4 — src/core/transcripts/index.js
test('sink-probe: transcripts — a labelled secret in a transcript reaches dream-scratch redacted', () => {
  const paths = tempPaths();
  const sessionId = 'secret-probe';
  // Mirror writeClaude's record shape but with content: 'boom ' + PROBE (do not
  // modify writeClaude, which hardcodes its message body).
  const dir = path.join(paths.claudeDir, 'projects', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.jsonl`);
  const line = JSON.stringify({
    type: 'user',
    sessionId,
    cwd: '/home/ada/proj',
    timestamp: '2026-01-01T10:00:00.000Z',
    message: { role: 'user', content: `boom ${PROBE}` },
  });
  fs.writeFileSync(file, `${line}\n`);
  const when = new Date('2026-01-01T10:00:00Z');
  fs.utimesSync(file, when, when);

  const result = collectExtracts(paths, emptyLedger(), 400_000);
  const scratchFile = result.wrote.find((p) => p.includes(sessionId));
  assert.ok(scratchFile, 'the fixture was written to scratch');

  const artifact = fs.readFileSync(scratchFile, 'utf8');
  const safe = safeOf(artifact);
  assert.equal(safe, true, artifact);
});

// ── The still-quarantined count (WP-dream-report-run-skips) ─────────────────
//
// The count is taken at SELECTION time — the discovered files whose
// `selectState` answered `'skip-quarantined'` — and NOT from the run-start
// ledger's active-quarantine set. The four cases below are what separate the
// two readings; under the run-start reading, three of them miscount.

const { runSkipSummarySection } = require('../../src/core/dream/promote');

/** The six counts the dream report is built from, read off one collection. */
function sixCounts(result) {
  return {
    newlyQuarantined: result.newlyQuarantined.length,
    stillQuarantined: result.skippedQuarantined,
    oversized: result.oversized.length,
    capacityDeferred: result.deferred.length,
    deadlineDeferred: result.deadlineDeferred.length,
    readDeferred: result.readDeferred.length,
  };
}

/** Every session the collector NAMED, across the five arms it names and the
 *  admitted entries — one id per contribution, duplicates included. */
function namedContributions(result) {
  const idOf = (p) => path.basename(p).replace(/\.[^.]+$/, '');
  return [
    ...result.entries.map((e) => e.session_id),
    ...result.newlyQuarantined.map((d) => idOf(d.path)),
    ...result.oversized.map((d) => idOf(d.path)),
    ...result.deferred.map((e) => e.session_id),
    ...result.deadlineDeferred.map((e) => e.session_id),
    ...result.readDeferred.map((e) => e.session_id),
  ];
}

/** Quarantine `stuck`, memoise `memoised` as individually oversized, and
 *  measure the budget `fits` fills exactly. */
function stopFixture(paths) {
  let ledger = emptyLedger();
  const byId = Object.fromEntries(
    transcripts.discover(paths, { since: null })
      .filter((d) => !path.basename(d.path).startsWith('ceiling'))
      .map((d) => [path.basename(d.path).replace(/\.[^.]+$/, ''), d])
  );
  ledger = ledgerLib.recordQuarantined(ledger, byId.stuck, 'too-many-lines');
  const memoKey = ledgerLib.foldKey(byId.memoised.path);
  const memo = memoFor(byId.memoised, 900_000);
  ledger.oversizedExtracts = { [memoKey]: memo };
  const fitsExtract = transcripts.parseWithOutcome(byId.fits, transcripts.newRunBudget()).extract;
  return { ledger, x: compactBytes(fitsExtract), memo, memoKey };
}

/** Collect with `partial`'s read forced incomplete — `runExhausted` is the
 *  collector's only evidence for the read-deferred arm. */
function collectRun(t, paths, ledger, x, options) {
  const parse = transcripts.parsePrimaryWithOutcome;
  t.mock.method(transcripts, 'parsePrimaryWithOutcome', (d, budget) => {
    const result = parse(d, budget);
    if (path.basename(d.path) === 'partial.jsonl') result.parse.runExhausted = true;
    return result;
  });
  return collectExtracts(paths, ledger, x, options);
}

/** Row B8: no discovered file contributes to two counts, and the six counts
 *  plus the admitted entries never exceed the number of discovered files. */
function assertPartition(paths, result) {
  const named = namedContributions(result);
  assert.equal(new Set(named).size, named.length, `a session was counted twice: ${named.join(', ')}`);
  const c = sixCounts(result);
  const discovered = transcripts.discover(paths, { since: null }).length;
  const total = result.entries.length + Object.values(c).reduce((a, b) => a + b, 0);
  assert.ok(total <= discovered, `the partition over-counts: ${total} contributions from ${discovered} discovered files`);
  assert.equal(named.length + c.stillQuarantined, total, 'every contribution is either named or a quarantine skip');
}

/** A deferral bullet may promise only that the session is CONSIDERED again. */
function assertNoRetryPromise(counts) {
  const section = runSkipSummarySection(counts);
  assert.ok(!/will be retried/.test(section), `a deferral bullet promised a retry: ${section}`);
  assert.ok(!/first time/.test(section), `a bullet claimed a first-ever skip: ${section}`);
  assert.ok(
    section.includes('Wienerdog will consider them again on the next run, though some may turn out to be too big to dream over on their own.'),
    section
  );
}

test('dream-collect: skippedQuarantined counts what this run actually skipped, not the run-start quarantine set', () => {
  const paths = tempPaths();
  // (a) an UNCHANGED prior quarantine — the only one skipped for a quarantine.
  writeClaude(paths, 'stuck', 1, 10, new Date('2026-01-05'));
  // (b) a prior quarantine whose file CHANGED and now parses — consolidated.
  writeClaude(paths, 'healed', 1, 10, new Date('2026-01-04'));
  // (d) a prior quarantine whose file is GONE — discovered by nothing.
  writeClaude(paths, 'vanished', 1, 10, new Date('2026-01-03'));
  let ledger = emptyLedger();
  for (const d of transcripts.discover(paths, { since: null })) {
    ledger = ledgerLib.recordQuarantined(ledger, d, 'too-many-lines');
  }
  assert.equal(Object.keys(ledger.files).length, 3, 'three active quarantines at run start');
  // Move (b) and (d) away from the fingerprints the ledger recorded.
  writeClaude(paths, 'healed', 2, 20, new Date('2026-01-02'));
  fs.rmSync(path.join(paths.claudeDir, 'projects', 'proj', 'vanished.jsonl'));

  const result = collectExtracts(paths, ledger, 400_000);
  assert.deepEqual(sixCounts(result), {
    newlyQuarantined: 0, stillQuarantined: 1, oversized: 0,
    capacityDeferred: 0, deadlineDeferred: 0, readDeferred: 0,
  }, 'only the unchanged prior quarantine was skipped for a quarantine this run');
  assert.deepEqual(result.entries.map((e) => e.session_id), ['healed'], 'the changed one was consolidated');
});

test('dream-collect: a re-quarantined prior quarantine lands in newlyQuarantined ONLY, and its wording claims no first skip', () => {
  const paths = tempPaths();
  writeClaude(paths, 'reborn', 1, 10, new Date('2026-01-05'));
  writeClaude(paths, 'stuck', 1, 10, new Date('2026-01-04'));
  let ledger = emptyLedger();
  for (const d of transcripts.discover(paths, { since: null })) {
    ledger = ledgerLib.recordQuarantined(ledger, d, 'too-many-lines');
  }
  // `reborn` changes into something the pre-read ceiling refuses: re-selected
  // (the fingerprint moved), then quarantined again by THIS run.
  writeOverCeiling(paths, 'reborn', new Date('2026-01-05'));

  const counts = sixCounts(collectExtracts(paths, ledger, 400_000));
  assert.deepEqual(counts, {
    newlyQuarantined: 1, stillQuarantined: 1, oversized: 0,
    capacityDeferred: 0, deadlineDeferred: 0, readDeferred: 0,
  });
  // THE SUM, not only the individual counts: under the run-start-ledger reading
  // `reborn` is counted twice, and this is the assertion that sees it.
  assert.equal(
    counts.newlyQuarantined + counts.stillQuarantined, 2,
    'two quarantined files, two contributions — a re-quarantine is never counted in both'
  );
  // The rendered wording is the case that made the old text untrue: `reborn`
  // was quarantined before, so nothing may say this was its first skip.
  const section = runSkipSummarySection(counts);
  assert.ok(
    section.includes('- 1 session transcript(s) were set aside by this run and will be skipped from now on, until they change.'),
    section
  );
  assert.ok(!/first time/.test(section), 'no bullet may claim a session was skipped for the first time');
});

test('dream-collect: a capacity stop partitions every discovered file exactly once, memo behind it intact', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'stuck', 1, 10, new Date('2026-01-08'));     // already quarantined
  writeOverCeiling(paths, 'ceiling', new Date('2026-01-07'));      // newly quarantined
  writeClaude(paths, 'big', 10, 1000, new Date('2026-01-06'));     // oversized, fresh measurement
  writeClaude(paths, 'partial', 1, 10, new Date('2026-01-05'));    // read-deferred
  writeClaude(paths, 'fits', 1, 10, new Date('2026-01-04'));       // admitted, fills X exactly
  writeClaude(paths, 'memoised', 1, 10, new Date('2026-01-03'));   // memoised oversized, BEHIND the stop
  writeClaude(paths, 'tail', 1, 10, new Date('2026-01-02'));       // also behind the stop
  const { ledger, x, memo, memoKey } = stopFixture(paths);

  const result = collectRun(t, paths, ledger, x, {});
  assert.deepEqual(sixCounts(result), {
    newlyQuarantined: 1, stillQuarantined: 1, oversized: 1,
    capacityDeferred: 2, deadlineDeferred: 0, readDeferred: 1,
  });
  assertPartition(paths, result);
  // Row B12: the memoised session is behind the stop, so it is a DEFERRAL this
  // run — never `oversized` — and its measurement survives untouched.
  assert.deepEqual(result.deferred.map((e) => e.session_id), ['memoised', 'tail']);
  assert.deepEqual(result.oversizedExtracts[memoKey], memo, 'the memo behind the stop survives');
  assertNoRetryPromise(sixCounts(result));
});

test('dream-collect: a deadline stop partitions every discovered file exactly once, memo behind it intact', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'stuck', 1, 10, new Date('2026-01-08'));
  writeOverCeiling(paths, 'ceiling', new Date('2026-01-07'));
  writeClaude(paths, 'big', 10, 1000, new Date('2026-01-06'));
  writeClaude(paths, 'partial', 1, 10, new Date('2026-01-05'));
  writeClaude(paths, 'fits', 1, 10, new Date('2026-01-04'));
  writeClaude(paths, 'memoised', 1, 10, new Date('2026-01-03'));
  writeClaude(paths, 'tail', 1, 10, new Date('2026-01-02'));
  const { ledger, x, memo, memoKey } = stopFixture(paths);

  // The clock is read once before the loop and once per iteration. `big`,
  // `partial` and `fits` are visited on a live clock; the fourth iteration —
  // `memoised` — finds it expired, so the stop is the DEADLINE's, not capacity's.
  // X leaves headroom after `fits` so the capacity arm cannot fire first, and
  // stays far below `big`'s extract so `big` is still individually oversized.
  let n = 0;
  const result = collectRun(t, paths, ledger, x + 1000, { preprocessTimeoutMs: 60, now: () => (n++ < 4 ? 0 : 60) });
  assert.deepEqual(sixCounts(result), {
    newlyQuarantined: 1, stillQuarantined: 1, oversized: 1,
    capacityDeferred: 0, deadlineDeferred: 2, readDeferred: 1,
  });
  assertPartition(paths, result);
  assert.deepEqual(result.deadlineDeferred.map((e) => e.session_id), ['memoised', 'tail']);
  assert.deepEqual(result.oversizedExtracts[memoKey], memo, 'the memo behind the stop survives');
  assertNoRetryPromise(sixCounts(result));
});

// ═══════════════════════════════════════════════════════════════════════════
// WP-dream-primary-dialogue-collection — Table C
//
// The collector now parses through `parsePrimaryWithOutcome`: `X` is measured
// against the RAW capped extract's compact length (`intakeBytes`), what reaches
// scratch is the smaller PRIMARY DIALOGUE, and the text-free gate projection of
// the ORIGINAL timeline is returned in memory for the ledger gate.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * THE BASE COMMIT'S COLLECTOR, reproduced without a second copy of the loop.
 * Before this package the admission loop called `parseWithOutcome`, measured
 * `Buffer.byteLength(JSON.stringify(extract))` and wrote that same extract.
 * Substituting the new entry point with one that returns the RAW extract as
 * `extract` and its own compact length as `intakeBytes` reproduces all three —
 * the same measured number, the same newest-first order and the same written
 * bytes — so a deep-equal against this run is a deep-equal against the base
 * commit's behaviour. `costMs` and `exhaust` are the clock and read-outcome
 * seams the deadline cases below drive.
 * @param {*} t @param {*} paths @param {*} ledger @param {number} x
 * @param {{options?:object, costMs?:number, tick?:{v:number}, exhaust?:string}} [o]
 */
function collectBaseline(t, paths, ledger, x, o = {}) {
  const raw = transcripts.parseWithOutcome;
  const m = t.mock.method(transcripts, 'parsePrimaryWithOutcome', (d, budget) => {
    const { extract, parse } = raw(d, budget);
    if (o.tick) o.tick.v += o.costMs || 0;
    const gateExtract = {
      harness: extract.harness,
      session_id: extract.session_id,
      messages: extract.messages.map((msg) => ({ role: msg.role })),
      skill_invocations: extract.skill_invocations,
    };
    const exhausted = o.exhaust && path.basename(d.path) === o.exhaust;
    return {
      extract,
      gateExtract,
      intakeBytes: compactBytes(extract),
      parse: exhausted ? { ...parse, runExhausted: true } : parse,
    };
  });
  try {
    return collectExtracts(paths, ledger, x, o.options || {});
  } finally {
    m.mock.restore();
  }
}

/** The projected (real) collector, driven through the same two seams. */
function collectProjected(t, paths, ledger, x, o = {}) {
  const real = transcripts.parsePrimaryWithOutcome;
  const m = t.mock.method(transcripts, 'parsePrimaryWithOutcome', (d, budget) => {
    const out = real(d, budget);
    if (o.tick) o.tick.v += o.costMs || 0;
    if (o.exhaust && path.basename(d.path) === o.exhaust) {
      return { ...out, parse: { ...out.parse, runExhausted: true } };
    }
    return out;
  });
  try {
    return collectExtracts(paths, ledger, x, o.options || {});
  } finally {
    m.mock.restore();
  }
}

/** The arms a byte decision can move. `gateExtracts` and `intakeBytesTotal` are
 *  this package's ADDITIONS and are compared separately, never here. */
function admissionArms(result) {
  return {
    entries: result.entries,
    processed: result.processed,
    deferred: result.deferred,
    deadlineDeferred: result.deadlineDeferred,
    readDeferred: result.readDeferred,
    oversized: result.oversized,
    newlyQuarantined: result.newlyQuarantined,
    oversizedExtracts: result.oversizedExtracts,
  };
}

/** A claude transcript whose ORIGINAL timeline is mostly TOOL OUTPUT — the shape
 *  the projection shrinks. One real user line, then `pairs` Skill-free tool
 *  exchanges whose results the projection removes entirely. */
function writeToolHeavy(paths, sessionId, pairs, toolLen, when) {
  const dir = path.join(paths.claudeDir, 'projects', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.jsonl`);
  const ts = '2026-01-01T10:00:00.000Z';
  const lines = [JSON.stringify({ type: 'user', sessionId, cwd: '/p', timestamp: ts, message: { role: 'user', content: 'ask' } })];
  for (let i = 0; i < pairs; i++) {
    lines.push(JSON.stringify({
      type: 'assistant', sessionId, cwd: '/p', timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'tool_use', id: `t${i}`, name: 'Bash', input: {} }] },
    }));
    lines.push(JSON.stringify({
      type: 'user', sessionId, cwd: '/p', timestamp: ts,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${i}`, is_error: false, content: [{ type: 'text', text: 'o'.repeat(toolLen) }] }] },
    }));
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
  fs.utimesSync(file, when, when);
  return file;
}

const idOfPath = (p) => path.basename(p).replace(/\.[^.]+$/, '');

test('dream-collect: [PDC-AC1] every byte decision is the base commit\'s, and a session the projection would have fitted is still deferred', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'stuck', 1, 10, new Date('2026-01-08'));        // prior quarantine
  writeOverCeiling(paths, 'ceiling', new Date('2026-01-07'));         // newlyQuarantined
  writeToolHeavy(paths, 'big', 60, 2000, new Date('2026-01-06'));     // individually oversized
  writeToolHeavy(paths, 'partial', 2, 100, new Date('2026-01-05'));   // readDeferred
  writeToolHeavy(paths, 'keep', 8, 2000, new Date('2026-01-04'));     // admitted
  writeToolHeavy(paths, 'extra', 8, 2000, new Date('2026-01-03'));    // capacity-deferred
  writeToolHeavy(paths, 'tail', 8, 2000, new Date('2026-01-02'));     // behind the stop

  let ledger = emptyLedger();
  const byId = Object.fromEntries(transcripts.discover(paths, { since: null }).map((d) => [idOfPath(d.path), d]));
  ledger = ledgerLib.recordQuarantined(ledger, byId.stuck, 'too-many-lines');
  const primary = Object.fromEntries(primaryExtracts(paths).map((p) => [idOfPath(p.d.path), p]));

  // X admits `keep` on its INTAKE and leaves one byte too little for `extra`'s.
  const x = primary.keep.intakeBytes + primary.extra.intakeBytes - 1;
  assert.ok(primary.big.intakeBytes > x, 'the oversized fixture really exceeds X');
  // The premise of the criterion: measured on the PROJECTION, `extra` would fit
  // in what is left after `keep` — and it must still be deferred.
  const projectedKeep = compactBytes(primary.keep.extract);
  const projectedExtra = compactBytes(primary.extra.extract);
  assert.ok(projectedExtra <= x - projectedKeep, 'the projection would have let `extra` fit');

  const base = collectBaseline(t, paths, ledger, x, { exhaust: 'partial.jsonl', options: { now: () => 0 } });
  const proj = collectProjected(t, paths, ledger, x, { exhaust: 'partial.jsonl', options: { now: () => 0 } });

  // Neither run deferred on the deadline — the condition row C1a states, and it
  // is asserted for BOTH runs, because one finishing in time says nothing about
  // the other.
  assert.deepEqual(base.deadlineDeferred, [], '[PDC-AC1] the baseline run deferred on the deadline, so row C1a applies and this fixture is not the byte-dimension case it claims to be');
  assert.deepEqual(proj.deadlineDeferred, [], '[PDC-AC1] the projected run deferred on the deadline, so row C1a applies and this fixture is not the byte-dimension case it claims to be');
  assert.deepEqual(
    admissionArms(proj), admissionArms(base),
    `[PDC-AC1] a byte decision moved: the projected arms differ from the base commit's.\nbase=${JSON.stringify(admissionArms(base))}\nproj=${JSON.stringify(admissionArms(proj))}`
  );
  assert.equal(proj.skippedQuarantined, base.skippedQuarantined, '[PDC-AC1] the quarantine-skip count moved');

  // The four populated arms, named so a corpus that quietly stopped exercising
  // one cannot leave this criterion green.
  assert.deepEqual(proj.entries.map((e) => e.session_id), ['keep'], '[PDC-AC1] admitted set');
  assert.deepEqual(proj.deferred.map((e) => e.session_id), ['extra', 'tail'], '[PDC-AC1] capacity arm');
  assert.deepEqual(proj.readDeferred.map((e) => e.session_id), ['partial'], '[PDC-AC1] read-deferred arm');
  assert.deepEqual(proj.oversized.map((d) => path.basename(d.path)), ['big.jsonl'], '[PDC-AC1] oversized arm');
  assert.deepEqual(proj.newlyQuarantined.map((d) => path.basename(d.path)), ['ceiling.jsonl'], '[PDC-AC1] quarantine arm');
  assert.equal(proj.skippedQuarantined, 1, '[PDC-AC1] quarantine-skip count');
  assert.equal(proj.intakeBytesTotal, primary.keep.intakeBytes, '[PDC-AC1] the run intake total');
});

test('dream-collect: [PDC-AC1a-more] a deadline-bound run admits MORE under projection, and no byte verdict moves', (t) => {
  const paths = tempPaths();
  for (let i = 0; i < 5; i++) writeToolHeavy(paths, `s${i}`, 4, 500, new Date(`2026-01-0${8 - i}`));
  const x = 4_000_000; // far above the corpus: the deadline is the ONLY constraint

  const tickA = { v: 0 };
  const base = collectBaseline(t, paths, emptyLedger(), x, {
    tick: tickA, costMs: 60, options: { preprocessTimeoutMs: 100, now: () => tickA.v },
  });
  const tickB = { v: 0 };
  const proj = collectProjected(t, paths, emptyLedger(), x, {
    tick: tickB, costMs: 10, options: { preprocessTimeoutMs: 100, now: () => tickB.v },
  });

  // The round-2 reviewer's shape: the projected run defers NOTHING while the
  // baseline defers under the same limit.
  assert.ok(base.deadlineDeferred.length > 0, 'the baseline is deadline-bound');
  assert.deepEqual(proj.deadlineDeferred, []);
  assert.ok(proj.entries.length > base.entries.length, `${proj.entries.length} > ${base.entries.length}`);

  // …and every session the loop ACTUALLY VISITED got the base commit's byte
  // verdict: nothing was capacity-deferred, nothing measured oversized, and the
  // baseline's admitted list is a prefix of the projected one. The visited set
  // moved; no byte decision did.
  for (const r of [base, proj]) {
    assert.deepEqual(r.deferred, []);
    assert.deepEqual(r.oversized, []);
    assert.deepEqual(r.oversizedExtracts, {});
  }
  const ids = (r) => r.entries.map((e) => e.session_id);
  assert.deepEqual(ids(proj).slice(0, ids(base).length), ids(base));
});

test('dream-collect: [PDC-AC1a-fewer] a deadline-bound run admits FEWER under projection, and no byte verdict moves', (t) => {
  const paths = tempPaths();
  for (let i = 0; i < 5; i++) writeToolHeavy(paths, `s${i}`, 4, 500, new Date(`2026-01-0${8 - i}`));
  const x = 4_000_000;

  // The other direction: classifying two policies in one pass costs MORE than
  // the write serialization it saves. The direction is a property of the
  // machine, not of this package — row C1a says so, and both are exercised.
  const tickA = { v: 0 };
  const base = collectBaseline(t, paths, emptyLedger(), x, {
    tick: tickA, costMs: 10, options: { preprocessTimeoutMs: 100, now: () => tickA.v },
  });
  const tickB = { v: 0 };
  const proj = collectProjected(t, paths, emptyLedger(), x, {
    tick: tickB, costMs: 60, options: { preprocessTimeoutMs: 100, now: () => tickB.v },
  });

  assert.deepEqual(base.deadlineDeferred, []);
  assert.ok(proj.deadlineDeferred.length > 0, 'the projected run is deadline-bound');
  assert.ok(proj.entries.length < base.entries.length, `${proj.entries.length} < ${base.entries.length}`);
  for (const r of [base, proj]) {
    assert.deepEqual(r.deferred, []);
    assert.deepEqual(r.oversized, []);
    assert.deepEqual(r.oversizedExtracts, {});
  }
  const ids = (r) => r.entries.map((e) => e.session_id);
  assert.deepEqual(ids(base).slice(0, ids(proj).length), ids(proj));
});

// ── Rows C4 / C4a: the filename collision, and the eviction that reproduces
//    today's refusal ────────────────────────────────────────────────────────

const { makeGates } = require('../../src/core/dream/validate');
const { defaultLayout } = require('../../src/core/layout');

/** The registered parent skill the ledger below lives beside. */
const PDC_SKILL = [
  '---', 'id: foo', 'type: skill', 'created: 2026-07-05', 'updated: 2026-07-05',
  'origin: dream', 'confidence: 0.9', 'recurrence: 3', 'derived_from_untrusted: false',
  '---', '', 'skill body', '',
].join('\n');

/** A structurally valid one-entry learnings ledger counting exactly `sid`. */
const pdcLedgerFor = (sid) => [
  '---', 'id: foo-learnings', 'type: note', 'created: 2026-07-05',
  'updated: 2026-07-11', 'origin: dream', 'derived_from_untrusted: false', '---', '',
  '## deps.module-not-found', '',
  '- Pattern-Key: `deps.module-not-found`',
  '- Status: open',
  '- Recurrence: 1',
  `- Session-IDs: ${sid}`,
  '- First-Seen: 2026-07-05',
  '- Last-Seen: 2026-07-11',
  '- derived_from_untrusted: false',
  '- Observation: the install step failed when the module was missing.',
  '',
].join('\n');

/** Ask the SHIPPED ledger gate for its verdict on a ledger counting `sid`,
 *  given `extractsBySession`. `null` means the write is accepted. */
function pdcLedgerVerdict(sid, extractsBySession) {
  const layout = defaultLayout();
  return makeGates({}).ledger({
    rel: `${layout.skills_dir}/foo/LEARNINGS.md`,
    candidateBytes: Buffer.from(pdcLedgerFor(sid)),
    baselineLedgerBytes: null,
    pairedSkillBytes: Buffer.from(PDC_SKILL),
    registry: { skills: { [`${layout.skills_dir}/foo/SKILL.md`]: { id: 'foo', created: '2026-07-05' } } },
    extractsBySession,
    layout,
  });
}

/** A claude transcript carrying ONE clean `foo` invocation — the skill's own
 *  paired result is the only message in its window — and, optionally, a line of
 *  real user dialogue before it. With `dialogue` omitted the PRIMARY projection
 *  of this session retains ZERO messages. */
function writeInvokingSession(paths, file, sessionId, when, dialogue) {
  const dir = path.join(paths.claudeDir, 'projects', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, file);
  const ts = '2026-01-01T10:00:00.000Z';
  const lines = [];
  if (dialogue) {
    lines.push(JSON.stringify({ type: 'user', sessionId, cwd: '/p', timestamp: ts, message: { role: 'user', content: dialogue } }));
  }
  lines.push(JSON.stringify({
    type: 'assistant', sessionId, cwd: '/p', timestamp: ts,
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'k1', name: 'Skill', input: { skill: 'foo' } }] },
  }));
  lines.push(JSON.stringify({
    type: 'user', sessionId, cwd: '/p', timestamp: ts,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'k1', is_error: false, content: [{ type: 'text', text: 'ran foo' }] }] },
  }));
  fs.writeFileSync(full, lines.join('\n') + '\n');
  fs.utimesSync(full, when, when);
  return full;
}

test('dream-collect: [PDC-AC1b] a filename collision keeps exactly the surviving session, and nothing else moves', () => {
  const paths = tempPaths();
  // `s.1` and `s_1` both sanitize to `claude-s_1.json`. Newest-first admission
  // visits `s.1` first, so `s_1` is written LAST and is the SURVIVOR — the write
  // order AC1b names. The survivor's primary projection retains ZERO messages,
  // which is the empty case row C2 requires covering here.
  writeInvokingSession(paths, 'a.jsonl', 's.1', new Date('2026-01-05'), 'please run foo');
  writeInvokingSession(paths, 'b.jsonl', 's_1', new Date('2026-01-04')); // empty primary dialogue

  const result = collectExtracts(paths, emptyLedger(), 400_000);

  // Nothing else about the collision moved: both sessions are still parsed,
  // still admitted, still marked processed, and the SAME path is in `wrote`
  // twice. That the overwritten session's dialogue is lost is a pre-existing
  // defect of the base commit and is deliberately NOT fixed here.
  assert.deepEqual(result.entries.map((e) => e.session_id), ['s.1', 's_1']);
  assert.deepEqual(result.processed.map((d) => path.basename(d.path)), ['a.jsonl', 'b.jsonl']);
  const collided = path.join(result.scratchDir, 'claude-s_1.json');
  assert.deepEqual(result.wrote, [collided, collided]);
  assert.deepEqual(fs.readdirSync(result.scratchDir), ['claude-s_1.json']);

  // Row C4: exactly ONE session per distinct filename — the last one written.
  assert.equal(result.gateExtracts.size, 1,
    `[PDC-AC1b] the gate map holds more than the surviving session: ${JSON.stringify([...result.gateExtracts.keys()])}`);
  assert.deepEqual([...result.gateExtracts.keys()], ['claude:s_1'],
    '[PDC-AC1b] the surviving filename must map to exactly the last session written');
  // …which is bit-for-bit the key set the base commit produced by RE-READING the
  // surviving file off disk.
  const reread = new Map();
  for (const f of result.wrote) {
    const ex = JSON.parse(fs.readFileSync(f, 'utf8'));
    reread.set(`${ex.harness}:${ex.session_id}`, ex);
  }
  assert.deepEqual([...reread.keys()], [...result.gateExtracts.keys()],
    '[PDC-AC1b] the in-memory map no longer equals the disk rebuild it replaces');

  // Row C2: the survivor's projection retained no messages and is written anyway.
  const survivor = JSON.parse(fs.readFileSync(collided, 'utf8'));
  assert.equal(survivor.session_id, 's_1');
  assert.deepEqual(survivor.messages, []);

  // A learning counting the SURVIVOR is accepted, so the map is real evidence
  // and not merely small.
  assert.equal(pdcLedgerVerdict('claude:s_1', result.gateExtracts), null,
    '[PDC-AC1b] the surviving session must still authorize a learning');

  // IN THIS WRITE ORDER THE OVERWRITTEN SESSION'S REFUSAL IS OVER-DETERMINED,
  // and the test says so rather than banking it. `SID_RE` in validate.js is
  // `^[a-z0-9]+:[A-Za-z0-9_-]+$` — exactly `sanitize`'s alphabet — so ANY id
  // that collides with `s_1` without being `s_1` is also a schema violation.
  // A ledger counting `claude:s.1` is therefore refused whatever the map holds,
  // which is why the eviction's authorization effect is proven by the sibling
  // test below, in the other write order, instead of here.
  assert.match(String(pdcLedgerVerdict('claude:s.1', result.gateExtracts)), /malformed Session-ID/,
    '[PDC-AC1b] the over-determination this test documents no longer holds');
});

test('dream-collect: [PDC-AC1b] the eviction is what refuses a learning counting the OVERWRITTEN session', () => {
  const paths = tempPaths();
  // THE OTHER WRITE ORDER, and the only one in which the refusal is decided by
  // the map: the overwritten id is the schema-clean `s_1`, so the gate has no
  // second reason to refuse it. Both sessions still collide on
  // `claude-s_1.json`; here `s.1` is written last and survives.
  writeInvokingSession(paths, 'a.jsonl', 's_1', new Date('2026-01-05'), 'please run foo');
  writeInvokingSession(paths, 'b.jsonl', 's.1', new Date('2026-01-04'), 'please run foo again');

  const result = collectExtracts(paths, emptyLedger(), 400_000);
  const collided = path.join(result.scratchDir, 'claude-s_1.json');
  assert.deepEqual(result.wrote, [collided, collided], '[PDC-AC1b] both sessions still write the colliding path');
  assert.deepEqual([...result.gateExtracts.keys()], ['claude:s.1'],
    `[PDC-AC1b] the gate map is not exactly the surviving session: ${JSON.stringify([...result.gateExtracts.keys()])}`);
  assert.equal(JSON.parse(fs.readFileSync(collided, 'utf8')).session_id, 's.1', '[PDC-AC1b] the survivor on disk');

  // A learning counting the OVERWRITTEN session is refused as not among this
  // run's processed extracts — bit-for-bit what the base commit does by
  // re-reading the surviving file.
  assert.match(
    String(pdcLedgerVerdict('claude:s_1', result.gateExtracts)),
    /not among this run's processed extracts/,
    '[PDC-AC1b] without the eviction the overwritten session still authorizes a learning the model never saw'
  );

  // NON-VACUITY: the same gate, the same ledger, against a session-keyed map
  // built WITHOUT the eviction ACCEPTS it — so the refusal above is a property
  // of the eviction and not of the ledger fixture. Without row C4 a learning
  // would be authorized by a session whose dialogue the model never saw a byte
  // of, which is the authorization difference round 2 measured.
  const noEviction = new Map();
  for (const d of transcripts.discover(paths, { since: null }).sort((a, b) => b.mtimeMs - a.mtimeMs)) {
    const { gateExtract } = transcripts.parsePrimaryWithOutcome(d, transcripts.newRunBudget());
    noEviction.set(`${d.harness}:${gateExtract.session_id}`, gateExtract);
  }
  assert.equal(noEviction.size, 2, '[PDC-AC1b] the no-eviction control map holds both sessions');
  assert.equal(pdcLedgerVerdict('claude:s_1', noEviction), null,
    '[PDC-AC1b] without the eviction the refusal is lost');
});

// ── Rows C2 / C3: what is written, and the memo ─────────────────────────────

test('dream-collect: [PDC-AC2] the scratch file is the projection, byte-exact, and the intake it was measured on is a different number', () => {
  const paths = tempPaths();
  const dir = path.join(paths.codexDir, 'sessions', '2026', '01', '01');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'rollout-demo.jsonl');
  fs.writeFileSync(file, [
    JSON.stringify({ type: 'session_meta', payload: { id: 'demo', thread_source: 'user' } }),
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message', role: 'user',
        content: [{ type: 'input_text', text: 'Keep explanations concise.' }],
        internal_chat_message_metadata_passthrough: { content_item_kinds: ['user.text'] },
      },
    }),
  ].join('\n') + '\n');
  const when = new Date('2026-01-03');
  fs.utimesSync(file, when, when);

  const [primary] = primaryExtracts(paths);
  const result = collectExtracts(paths, emptyLedger(), 400_000);
  assert.deepEqual(result.wrote, [path.join(result.scratchDir, 'codex-demo.json')]);

  // The spec's literal expected file, in the EMITTED key order. Only
  // `source_path` is substituted: the literal is written for
  // `/samples/rollout-demo.jsonl` and this fixture lives under a temp home,
  // which the extract's own path-bounding rewrites.
  const expected = {
    harness: 'codex',
    session_id: 'demo',
    started: null,
    cwd: null,
    source_path: primary.extract.source_path,
    truncated: false,
    messages: [
      { role: 'user', text: 'Keep explanations concise.', ts: null, derived_from_untrusted: false },
    ],
  };
  assert.equal(fs.readFileSync(result.wrote[0], 'utf8'), JSON.stringify(expected, null, 2));
  assert.ok(!fs.readFileSync(result.wrote[0], 'utf8').endsWith('\n'), 'the writer adds no trailing newline');

  // THE BYTE COUNT THIS ADMISSION WAS MEASURED AGAINST IS NOT THE SIZE OF THAT
  // FILE. This source has nothing to remove and the projection ADDS a
  // `derived_from_untrusted` key per message, so here the projection is LARGER
  // than the intake — projection shrinks extracts in aggregate, not on every
  // session, and row C1 is what makes that harmless. The added key costs
  // `,"derived_from_untrusted":false` = 31 compact bytes per message, which is
  // also the difference between the spec's own 233 and 202 (its prose says 30).
  assert.equal(result.intakeBytesTotal, primary.intakeBytes);
  assert.equal(compactBytes(primary.extract), primary.intakeBytes + 31);
  assert.ok(fs.statSync(result.wrote[0]).size > primary.intakeBytes);
});

test('dream-collect: [PDC-AC2] a session whose projection retains no messages is still written, and still counted', () => {
  const paths = tempPaths();
  writeInvokingSession(paths, 'silent.jsonl', 'silent', new Date('2026-01-03'));
  const result = collectExtracts(paths, emptyLedger(), 400_000);
  assert.deepEqual(result.entries.map((e) => e.session_id), ['silent']);
  assert.equal(result.wrote.length, 1);
  assert.equal(result.processed.length, 1);
  const written = JSON.parse(fs.readFileSync(result.wrote[0], 'utf8'));
  assert.deepEqual(written.messages, []);
  assert.equal(written.session_id, 'silent');
  // The agent may legitimately decide a session holds nothing worth
  // remembering; that is a different state from the session being absent.
  assert.equal(fs.existsSync(path.join(result.scratchDir, 'claude-silent.json')), true);
});

test('dream-collect: [PDC-AC2] an oversized memo written by the base commit is honoured unchanged, and gains no field', (t) => {
  const paths = tempPaths();
  writeToolHeavy(paths, 'large', 20, 2000, new Date('2026-01-03'));
  const [{ d }] = primaryExtracts(paths);
  const x = 1000;

  const base = collectBaseline(t, paths, emptyLedger(), x, { options: { now: () => 0 } });
  const key = ledgerLib.foldKey(d.path);
  const memo = base.oversizedExtracts[key];
  assert.deepEqual(Object.keys(memo).sort(), ['appVersion', 'extractBytes', 'fingerprint']);

  // The projected collector accepts that memo as-is — no format discriminator,
  // no new invalidation rule — and skips the parse on it.
  const parser = t.mock.method(transcripts, 'parsePrimaryWithOutcome');
  const proj = collectExtracts(paths, { ...emptyLedger(), oversizedExtracts: { [key]: memo } }, x);
  assert.equal(parser.mock.callCount(), 0, 'a valid memo still skips the parse entirely');
  assert.equal(proj.oversized[0].cached, true);
  assert.deepEqual(proj.oversizedExtracts, base.oversizedExtracts);
  assert.deepEqual(Object.keys(proj.oversizedExtracts[key]).sort(), ['appVersion', 'extractBytes', 'fingerprint']);
});

// ═══════════════════════════════════════════════════════════════════════════
// WP-dream-collect-parse-throw-quarantine — Table B (the per-candidate fault
// boundary) and Table A rows A1, A5, A6.
//
// Transcript content is fully attacker-influenceable, and the parsers join
// content blocks with `Array.prototype.join`, which coerces: a block whose
// `text` is an object with a poisoned `toString` throws. Before this package
// that throw escaped the collector, ended the whole dream run, and — because
// the file was never set aside — ended it again every night after. The loop now
// carries a per-candidate fault boundary: one candidate's preparation either
// completes or that candidate is set aside as `parse-threw`.
//
// Every test whose expected outcome is a SUCCESSFUL collection wraps the call
// in `assert.doesNotThrow`: the ADR-0042 runner accepts only `ERR_ASSERTION`,
// so a mutation that makes the collector THROW is unprovable unless the
// assertion is the thing that fails.
// ═══════════════════════════════════════════════════════════════════════════

const PT_FIXTURES = path.resolve(__dirname, '../fixtures/dream/transcripts');

/** Plant one of this package's crafted rollouts; set its mtime.
 *  @returns {string} its absolute path. */
function writeCraftedCodex(paths, name, fixture, when) {
  const dir = path.join(paths.codexDir, 'sessions', '2026', '01', '01');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, fs.readFileSync(path.join(PT_FIXTURES, fixture)));
  fs.utimesSync(file, when, when);
  return file;
}

/** Make ONE candidate's preparation throw from inside the parse, keyed by
 *  basename — the same seam [PT-2] installs, and the same TypeError the crafted
 *  rollout raised before `WP-transcript-parsers-harden-text-values` made the
 *  parsers decline a non-string `text` instead of coercing it. The throw must
 *  come from the PARSE, not from after it: `pt-only-parse-is-caught` re-throws
 *  only when `extract` is already bound, and declares that [PT-3] and only
 *  [PT-3] reddens under it.
 *  @param {import('node:test').TestContext} t @param {string} basename */
function throwOnParseOf(t, basename) {
  const real = transcripts.parsePrimaryWithOutcome;
  t.mock.method(transcripts, 'parsePrimaryWithOutcome', (d, budget) => {
    if (path.basename(d.path) === basename) throw new TypeError('Cannot convert object to primitive value');
    return real(d, budget);
  });
}

/** A healthy rollout whose `session_meta.id` is `id` — however long. */
function writeCodexWithId(paths, name, id, when) {
  const dir = path.join(paths.codexDir, 'sessions', '2026', '01', '01');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(
    file,
    JSON.stringify({ type: 'session_meta', payload: { id, timestamp: '2026-01-01T09:00:00.000Z', cwd: '/p' } }) +
      '\n' +
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] } }) +
      '\n'
  );
  fs.utimesSync(file, when, when);
  return file;
}

test('dream-collect: [PT-1] a transcript whose preparation throws is set aside, and the run finishes over the healthy ones', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'alpha', 1, 10, new Date('2026-01-05'));
  writeClaude(paths, 'beta', 1, 10, new Date('2026-01-04'));
  const crafted = writeCraftedCodex(paths, 'rollout-crafted.jsonl', 'codex-poisoned-text-block.jsonl', new Date('2026-01-06'));
  throwOnParseOf(t, 'rollout-crafted.jsonl');

  let result = null;
  assert.doesNotThrow(() => {
    result = collectExtracts(paths, emptyLedger(), 400_000);
  }, '[PT-1] one crafted transcript must not end the whole dream run');

  assert.deepEqual(
    result.entries.map((e) => e.session_id).sort(),
    ['alpha', 'beta'],
    '[PT-1] every healthy session in the same corpus is still admitted'
  );
  const q = result.newlyQuarantined.filter((x) => x.path === crafted);
  assert.equal(q.length, 1, '[PT-1] the crafted file is NAMED — set aside exactly once, not silently dropped');
  assert.equal(q[0].reason, 'parse-threw', '[PT-1] the set-aside reason is the code-owned literal');
  assertPartition(paths, result);
});

test('dream-collect: [PT-2] the boundary is not parser-specific — an injected throw sets aside exactly that candidate', (t) => {
  const paths = tempPaths();
  writeOverCeiling(paths, 'ceiling', new Date('2026-01-07'));
  writeClaude(paths, 'newest', 1, 10, new Date('2026-01-06'));
  writeClaude(paths, 'boom', 1, 10, new Date('2026-01-05'));
  writeClaude(paths, 'oldest', 1, 10, new Date('2026-01-04'));
  const real = transcripts.parsePrimaryWithOutcome;
  t.mock.method(transcripts, 'parsePrimaryWithOutcome', (d, budget) => {
    if (path.basename(d.path) === 'boom.jsonl') throw new TypeError('Cannot convert object to primitive value');
    return real(d, budget);
  });

  let result = null;
  assert.doesNotThrow(() => {
    result = collectExtracts(paths, emptyLedger(), 400_000);
  }, '[PT-2] a throw from any step inside the boundary is contained, whatever raised it');

  assert.deepEqual(
    result.entries.map((e) => e.session_id),
    ['newest', 'oldest'],
    '[PT-2] the loop continued to the next candidate rather than stopping'
  );
  const byName = Object.fromEntries(result.newlyQuarantined.map((x) => [path.basename(x.path), x.reason]));
  assert.deepEqual(
    byName,
    { 'boom.jsonl': 'parse-threw', 'ceiling.jsonl': 'over-ceiling' },
    '[PT-2] the injected candidate is parse-threw and every other arm keeps its own classification'
  );
  assertPartition(paths, result);
});

test('dream-collect: [PT-3] the boundary extends PAST the parse call — a post-parse failure is caught too', () => {
  const paths = tempPaths();
  // This rollout PARSES cleanly; its non-string `session_meta.id` throws later,
  // at `sanitize(extract.session_id)` during the filename derivation. Newest
  // mtime, so it is visited BEFORE the healthy session.
  const crafted = writeCraftedCodex(paths, 'rollout-post-parse.jsonl', 'codex-poisoned-session-id.jsonl', new Date('2026-01-09'));
  writeClaude(paths, 'behind', 1, 10, new Date('2026-01-02'));

  let result = null;
  assert.doesNotThrow(() => {
    result = collectExtracts(paths, emptyLedger(), 400_000);
  }, '[PT-3] a transcript that parses and THEN throws must not end the run — a boundary around the parse call alone is not enough');

  const q = result.newlyQuarantined.filter((x) => x.path === crafted);
  assert.equal(q.length, 1, '[PT-3] the post-parse failure is set aside, not merely survived');
  assert.equal(q[0].reason, 'parse-threw', '[PT-3] a post-parse failure carries the same code-owned reason');
  assert.deepEqual(
    result.entries.map((e) => e.session_id),
    ['behind'],
    '[PT-3] the healthy session visited AFTER the crafted one is still admitted'
  );
  assertPartition(paths, result);
});

test('dream-collect: [PT-4] a set-aside candidate consumes nothing and records nothing derived from the throw', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'earlier', 1, 10, new Date('2026-01-08'));
  const crafted = writeCraftedCodex(paths, 'rollout-crafted.jsonl', 'codex-poisoned-text-block.jsonl', new Date('2026-01-07'));
  writeClaude(paths, 'later', 1, 10, new Date('2026-01-06'));
  throwOnParseOf(t, 'rollout-crafted.jsonl');
  const result = collectExtracts(paths, emptyLedger(), 400_000);

  // The same two healthy sessions, collected without the crafted file at all —
  // the baseline every "consumes nothing" claim below is measured against.
  const clean = tempPaths();
  writeClaude(clean, 'earlier', 1, 10, new Date('2026-01-08'));
  writeClaude(clean, 'later', 1, 10, new Date('2026-01-06'));
  const baseline = collectExtracts(clean, emptyLedger(), 400_000);

  const [q] = result.newlyQuarantined.filter((x) => x.path === crafted);
  assert.ok(q, '[PT-4] the crafted file was set aside');
  assert.deepEqual(
    Object.keys(q).sort(),
    ['dev', 'harness', 'ino', 'mtimeMs', 'path', 'reason', 'size'],
    '[PT-4] the record is the discovery record plus the reason — no field carries anything about the throw'
  );
  for (const leak of ['TypeError', 'primitive', 'convert', 'stack', '.js:']) {
    assert.ok(!JSON.stringify(q).includes(leak), `[PT-4] "${leak}" reached the durable record — the caught value must stay unbound`);
  }

  // Consumes nothing: capacity, intake bytes, scratch, and the run's gate map.
  assert.deepEqual(result.entries.map((e) => e.session_id), ['earlier', 'later'], '[PT-4] a later candidate that fits still fits');
  assert.equal(result.deferred.length, 0, '[PT-4] nothing was deferred for capacity');
  assert.equal(result.intakeBytesTotal, baseline.intakeBytesTotal, '[PT-4] intakeBytesTotal is unchanged by the set-aside candidate');
  assert.equal(result.wrote.length, 2, '[PT-4] no scratch file was written for it');
  assert.equal(fs.readdirSync(result.scratchDir).length, 2, '[PT-4] the scratch directory holds nothing for it');
  assert.equal(
    result.gateExtracts.size,
    result.entries.length,
    '[PT-4] the run gate map holds exactly the admitted sessions — the set-aside candidate added no entry'
  );
  assert.ok(result.gateExtracts.has('claude:earlier'), '[PT-4] the entry an EARLIER session put in the gate map was not evicted by it');
  assert.ok(
    ![...result.gateExtracts.keys()].some((k) => k.includes('crafted')),
    '[PT-4] the set-aside candidate is absent from the gate map'
  );
  // Nothing about the throw reached the scratch directory either.
  for (const f of fs.readdirSync(result.scratchDir)) {
    assert.ok(!/TypeError|primitive/.test(fs.readFileSync(path.join(result.scratchDir, f), 'utf8')), `[PT-4] ${f} carries the caught value`);
  }
});

test('dream-collect: [PT-6] a set-aside transcript is skipped while unchanged and reconsidered once it changes', (t) => {
  const paths = tempPaths();
  writeCraftedCodex(paths, 'rollout-crafted.jsonl', 'codex-poisoned-text-block.jsonl', new Date('2026-01-05'));
  throwOnParseOf(t, 'rollout-crafted.jsonl');
  let ledger = emptyLedger();

  const first = collectExtracts(paths, ledger, 400_000);
  assert.equal(first.newlyQuarantined.length, 1, '[PT-6] the first run sets the crafted file aside');
  for (const q of first.newlyQuarantined) ledger = ledgerLib.recordQuarantined(ledger, q, q.reason);

  const second = collectExtracts(paths, ledger, 400_000);
  assert.deepEqual(
    sixCounts(second),
    { newlyQuarantined: 0, stillQuarantined: 1, oversized: 0, capacityDeferred: 0, deadlineDeferred: 0, readDeferred: 0 },
    '[PT-6] an UNCHANGED set-aside file is skipped, not re-parsed and not re-announced'
  );

  // Rewriting the file moves its fingerprint, so it is a candidate again: the
  // cost is bounded, and a future harness-format fix heals itself.
  const rewritten = path.join(paths.codexDir, 'sessions', '2026', '01', '01', 'rollout-crafted.jsonl');
  fs.appendFileSync(
    rewritten,
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'a later turn' }] } }) + '\n'
  );
  fs.utimesSync(rewritten, new Date('2026-01-06'), new Date('2026-01-06'));
  const third = collectExtracts(paths, ledger, 400_000);
  assert.equal(third.newlyQuarantined.length, 1, '[PT-6] a CHANGED file is reconsidered, never permanently excluded');
  assert.equal(third.skippedQuarantined, 0, '[PT-6] a changed file is no longer counted as a quarantine skip');
});

test('dream-collect: [PT-7] a write failure is environmental and still ends the run', (t) => {
  const paths = tempPaths();
  writeClaude(paths, 'healthy', 1, 10, new Date('2026-01-05'));
  const realRename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to, ...rest) => {
    if (String(to).includes('dream-scratch')) {
      const e = new Error('ENOSPC: no space left on device');
      e.code = 'ENOSPC';
      throw e;
    }
    return realRename(from, to, ...rest);
  });

  // Catching this would set aside every remaining transcript for a machine-wide
  // condition, and each would then be skipped until it happened to change.
  assert.throws(
    () => collectExtracts(paths, emptyLedger(), 400_000),
    /ENOSPC/,
    '[PT-7] a writeFilePrivate failure propagates out of collectExtracts'
  );
});

test('dream-collect: [PT-8] a 4,000-character session id is admitted, with a bounded scratch filename', () => {
  const paths = tempPaths();
  writeCodexWithId(paths, 'rollout-long.jsonl', 'A'.repeat(4000), new Date('2026-01-05'));

  let result = null;
  assert.doesNotThrow(() => {
    result = collectExtracts(paths, emptyLedger(), 400_000);
  }, '[PT-8] a long session id must not reach writeFilePrivate as an ENAMETOOLONG and end the run');

  assert.equal(result.entries.length, 1, '[PT-8] the session is admitted normally');
  const name = path.basename(result.entries[0].scratchFile);
  assert.equal(name, `codex-${'A'.repeat(128)}.json`, '[PT-8] sanitize returns at most 128 characters');
  assert.ok(Buffer.byteLength(name) <= 139, `[PT-8] the scratch filename is bounded, got ${Buffer.byteLength(name)} bytes`);
});
