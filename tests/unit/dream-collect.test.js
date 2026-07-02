'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const { readDreamConfig } = require('../../src/core/dream/config');
const { readWatermarks, writeWatermarks } = require('../../src/core/dream/watermarks');
const { collectExtracts, cleanScratch } = require('../../src/core/dream/scratch');

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

// ---- config ----

test('dream-collect: readDreamConfig returns defaults with only a vault', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.writeFileSync(paths.config, 'vault: /home/ada/wienerdog\n');
  const cfg = readDreamConfig(paths.config);
  assert.equal(cfg.vault, '/home/ada/wienerdog');
  assert.equal(cfg.timeoutMs, 20 * 60_000);
  assert.equal(cfg.maxInputBytes, 400_000);
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

// ---- watermarks ----

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

test('dream-collect: returns both harnesses when watermarks are null', () => {
  const paths = tempPaths();
  const cMtime = writeClaude(paths, 'c1', 1, 10, new Date('2026-01-02T00:00:00Z'));
  const xMtime = writeCodex(paths, 'x1', new Date('2026-01-03T00:00:00Z'));

  const result = collectExtracts(paths, { claude: null, codex: null }, 400_000);

  assert.equal(result.entries.length, 2);
  assert.equal(result.wrote.length, 2);
  assert.equal(result.droppedForSize, 0);
  assert.ok(fs.existsSync(path.join(result.scratchDir, 'claude-c1.json')));
  assert.ok(fs.existsSync(path.join(result.scratchDir, 'codex-x1.json')));
  assert.equal(result.maxMtime.claude, cMtime);
  assert.equal(result.maxMtime.codex, xMtime);
});

test('dream-collect: honors a per-harness watermark', () => {
  const paths = tempPaths();
  const cMtime = writeClaude(paths, 'c1', 1, 10, new Date('2026-01-02T00:00:00Z'));
  const xMtime = writeCodex(paths, 'x1', new Date('2026-01-03T00:00:00Z'));

  // Claude watermark == its file mtime → excluded (must be strictly newer).
  const result = collectExtracts(paths, { claude: cMtime, codex: null }, 400_000);

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].harness, 'codex');
  assert.equal(fs.existsSync(path.join(result.scratchDir, 'claude-c1.json')), false);
  assert.ok(fs.existsSync(path.join(result.scratchDir, 'codex-x1.json')));
  // Claude had nothing new → its watermark is unchanged.
  assert.equal(result.maxMtime.claude, cMtime);
  assert.equal(result.maxMtime.codex, xMtime);
});

test('dream-collect: drops the oldest sessions past the size cap', () => {
  const paths = tempPaths();
  // Claude is OLDER and LARGE; codex is NEWER and small.
  writeClaude(paths, 'c1', 5, 4000, new Date('2026-01-02T00:00:00Z'));
  const xMtime = writeCodex(paths, 'x1', new Date('2026-01-03T00:00:00Z'));

  // Cap fits the small codex extract but not the large claude one.
  const result = collectExtracts(paths, { claude: null, codex: null }, 2000);

  assert.ok(result.droppedForSize > 0);
  assert.equal(result.wrote.length, 1);
  assert.equal(result.entries[0].harness, 'codex');
  // Dropped claude → its watermark stays null (won't skip it next run).
  assert.equal(result.maxMtime.claude, null);
  assert.equal(result.maxMtime.codex, xMtime);
});

test('dream-collect: re-running empties stale scratch, cleanScratch removes it', () => {
  const paths = tempPaths();
  writeCodex(paths, 'x1', new Date('2026-01-03T00:00:00Z'));
  const first = collectExtracts(paths, { claude: null, codex: null }, 400_000);
  // Plant a stray file; a fresh collect must wipe it.
  fs.writeFileSync(path.join(first.scratchDir, 'stray.json'), '{}');
  const second = collectExtracts(paths, { claude: null, codex: null }, 400_000);
  assert.equal(fs.existsSync(path.join(second.scratchDir, 'stray.json')), false);

  cleanScratch(paths.state);
  assert.equal(fs.existsSync(second.scratchDir), false);
});
