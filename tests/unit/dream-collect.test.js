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
const { collectExtracts, cleanScratch, MIN_TRUNCATE_BYTES } = require('../../src/core/dream/scratch');
const ledgerLib = require('../../src/core/dream/ledger');
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

test('dream-collect: capacity defers the oldest sessions past the size cap with no negative record', () => {
  const paths = tempPaths();
  // Claude is OLDER and LARGE; codex is NEWER and small.
  writeClaude(paths, 'c1', 5, 4000, new Date('2026-01-02T00:00:00Z'));
  writeCodex(paths, 'x1', new Date('2026-01-03T00:00:00Z'));

  // Cap fits the small codex extract but not the large claude one.
  const result = collectExtracts(paths, emptyLedger(), 2000);

  assert.ok(result.droppedForSize > 0);
  assert.equal(result.wrote.length, 1);
  assert.equal(result.entries[0].harness, 'codex');
  // Capacity-deferred: listed in deferred, in NEITHER processed nor newlyQuarantined
  // (no record → naturally retried next run — the WP-048/069 starvation fix).
  assert.equal(result.deferred.length, 1);
  assert.equal(result.deferred[0].session_id, 'c1');
  assert.ok(!result.processed.some((d) => d.path.endsWith('c1.jsonl')));
  assert.equal(result.newlyQuarantined.length, 0);
});

test('dream-collect: a deferred file is selected again on a subsequent larger-budget run', () => {
  const paths = tempPaths();
  writeClaude(paths, 'c1', 5, 4000, new Date('2026-01-02T00:00:00Z'));
  writeCodex(paths, 'x1', new Date('2026-01-03T00:00:00Z'));

  const first = collectExtracts(paths, emptyLedger(), 2000);
  assert.equal(first.deferred.length, 1);
  // Record ONLY what a successful run records: the processed files.
  let ledger = emptyLedger();
  for (const d of first.processed) ledger = ledgerLib.recordProcessed(ledger, d);

  // A larger budget next run picks the deferred file up (no watermark gap).
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

test('dream-collect: capacity incident replay — four oversized sessions are all kept truncated (old loop kept 0)', () => {
  const paths = tempPaths();
  // Four fresh Claude sessions, each ~205 KB serialized (100 msgs × 2000 chars),
  // newest→oldest c4..c1. This is the 2026-07-05 starvation set.
  writeClaude(paths, 'c1', 100, 2000, new Date('2026-01-02T00:00:00Z'));
  writeClaude(paths, 'c2', 100, 2000, new Date('2026-01-03T00:00:00Z'));
  writeClaude(paths, 'c3', 100, 2000, new Date('2026-01-04T00:00:00Z'));
  writeClaude(paths, 'c4', 100, 2000, new Date('2026-01-05T00:00:00Z'));

  // Budget admits four equal shares (100 000 each) above the floor but below any
  // single extract → all four truncated. The OLD break loop kept 0 here.
  const result = collectExtracts(paths, emptyLedger(), 400_000);

  assert.equal(result.entries.length, 4);
  assert.equal(result.droppedForSize, 0);
  assert.equal(result.dropped.length, 0);
  assert.equal(result.truncated.length, 4);
  assert.ok(result.entries.every((e) => e.truncatedToFit === true));
  // A truncated session still counts as consumed → all four are processed.
  assert.equal(result.processed.length, 4);

  // The kept extracts are actually truncated and keep the NEWEST messages.
  const one = JSON.parse(fs.readFileSync(path.join(result.scratchDir, 'claude-c4.json'), 'utf8'));
  assert.equal(one.truncated, true);
  assert.ok(one.messages.length > 0 && one.messages.length < 100);
});

test('dream-collect: capacity water-fill keeps a fitting session whole behind an oversized newer one (no shadowing)', () => {
  const paths = tempPaths();
  // Newest is huge (~205 KB); an OLDER session is tiny and fits its share whole.
  writeClaude(paths, 'cbig', 100, 2000, new Date('2026-01-05T00:00:00Z'));
  const smallMtime = writeClaude(paths, 'csmall', 1, 10, new Date('2026-01-02T00:00:00Z'));

  const result = collectExtracts(paths, emptyLedger(), 100_000);

  assert.equal(result.entries.length, 2);
  assert.equal(result.dropped.length, 0);
  // The small older session is kept WHOLE despite the oversized newer one ahead.
  const small = result.entries.find((e) => e.session_id === 'csmall');
  assert.ok(small);
  assert.equal(small.truncatedToFit, false);
  assert.equal(small.mtimeMs, smallMtime);
  // The big newer session is truncated to fit.
  const big = result.entries.find((e) => e.session_id === 'cbig');
  assert.equal(big.truncatedToFit, true);
  assert.equal(result.truncated.length, 1);
});

test('dream-collect: capacity sub-floor budget defers the session whole (no record of any kind)', () => {
  const paths = tempPaths();
  writeClaude(paths, 'c1', 100, 2000, new Date('2026-01-05T00:00:00Z'));

  // Budget below MIN_TRUNCATE_BYTES → no useful share → deferred whole, kept 0.
  const result = collectExtracts(paths, emptyLedger(), MIN_TRUNCATE_BYTES - 1);

  assert.equal(result.entries.length, 0);
  assert.equal(result.dropped.length, 1);
  assert.equal(result.droppedForSize, 1);
  assert.equal(result.dropped[0].session_id, 'c1');
  // Whole-deferred session gets NO record (retried next run).
  assert.equal(result.processed.length, 0);
  assert.equal(result.newlyQuarantined.length, 0);
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

// ---- byte-budget truncation rebases skill_invocations (WP-087) ----

test('dream-collect: byte-budget truncation rebases skill_invocations and drops ones fallen into the removed prefix', () => {
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
  // 'late' is the LAST raw event in the file, so it survives any byte truncation
  // that keeps at least one message (k >= 1) — robust regardless of exact k.
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

  // ~240KB+ of padding vs. a 60KB budget forces truncation to a small newest-suffix.
  const result = collectExtracts(paths, emptyLedger(), 60_000);

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].truncatedToFit, true);
  const extract = JSON.parse(fs.readFileSync(path.join(result.scratchDir, `claude-${sessionId}.json`), 'utf8'));
  assert.ok(extract.messages.length < 64);

  const skills = extract.skill_invocations.map((si) => si.skill);
  assert.ok(!skills.includes('early')); // window fell entirely in the dropped prefix

  const late = extract.skill_invocations.find((si) => si.skill === 'late');
  assert.ok(late, 'late invocation must survive truncation');
  assert.ok(late.index >= 0 && late.index < extract.messages.length);
  assert.ok(late.resultIndex >= 0 && late.resultIndex < extract.messages.length);
  assert.equal(extract.messages[late.resultIndex].text, 'done-late');
});

test('dream-collect: byte-budget truncation drops a trailing invocation whose rebased index would equal messages.length (right edge)', () => {
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
  // Final raw event: an assistant turn carrying a Skill tool_use with nothing after
  // it (no paired tool_result, no later message). Its raw index === raw messages
  // count, so after rebasing it lands on keptMsgs.length — one past the last valid
  // slot — and must be dropped by the upper-bound filter.
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

  const result = collectExtracts(paths, emptyLedger(), 60_000);

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].truncatedToFit, true);
  const extract = JSON.parse(fs.readFileSync(path.join(result.scratchDir, `claude-${sessionId}.json`), 'utf8'));
  assert.deepEqual(extract.skill_invocations, []);
});

test('dream-collect: a session hitting the MAX_MESSAGES count cap in parse() AND THEN byte-budget truncation keeps its invocation in range', () => {
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
  // count cap as the newest tail, remaining the last two messages of the capped
  // extract, so they also survive any further byte-budget truncation (k2 >= 1).
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

  // Budget well below the ~2000-message capped extract's serialized size, but above
  // MIN_TRUNCATE_BYTES → forces a SECOND (byte) truncation on top of the count cap.
  const result = collectExtracts(paths, emptyLedger(), 50_000);

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].truncatedToFit, true);
  const extract = JSON.parse(fs.readFileSync(path.join(result.scratchDir, `claude-${sessionId}.json`), 'utf8'));
  assert.ok(extract.messages.length < MAX_MESSAGES);
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
