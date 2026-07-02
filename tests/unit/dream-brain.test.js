'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildClaudeArgs, spawnBrain } = require('../../src/core/dream/brain');

test('dream-brain: buildClaudeArgs contains the sandbox flags, no model', () => {
  const args = buildClaudeArgs({ vaultDir: '/v', scratchDir: '/s', date: '2026-07-02', model: null });
  const joined = args.join(' ');

  assert.ok(joined.includes('-p'));
  assert.ok(joined.includes('--tools Read,Write,Edit,Glob,Grep'));
  assert.ok(joined.includes('--permission-mode acceptEdits'));
  assert.ok(joined.includes('--add-dir /v'));
  assert.ok(joined.includes('--add-dir /s'));
  assert.ok(joined.includes('--strict-mcp-config'));
  assert.ok(joined.includes('--setting-sources user'));

  // Forbidden escape hatches must never appear.
  assert.ok(!joined.includes('--dangerously-skip-permissions'));
  assert.ok(!joined.includes('--bare'));
  assert.ok(!joined.includes('--safe-mode'));

  // Model omitted when null.
  assert.ok(!args.includes('--model'));

  // The prompt carries the paths (Bash is off; the skill reads them from text).
  assert.ok(joined.includes('/wienerdog-dream'));
  assert.ok(joined.includes('/s'));
  assert.ok(joined.includes('/v'));
  assert.ok(joined.includes('2026-07-02'));
});

test('dream-brain: buildClaudeArgs includes --model when set', () => {
  const args = buildClaudeArgs({ vaultDir: '/v', scratchDir: '/s', date: '2026-07-02', model: 'opus' });
  const i = args.indexOf('--model');
  assert.ok(i !== -1);
  assert.equal(args[i + 1], 'opus');
});

test('dream-brain: spawnBrain runs WIENERDOG_DREAM_CMD and passes the env', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-brain-'));
  const marker = path.join(root, 'marker.txt');
  const fakeCmd = path.join(root, 'fake-brain.sh');
  fs.writeFileSync(
    fakeCmd,
    ['#!/bin/sh', 'printf "%s\\n%s\\n" "$WIENERDOG_DREAM_VAULT" "$WIENERDOG_DREAM_SCRATCH" > "$MARKER"', 'exit 7', ''].join('\n')
  );
  fs.chmodSync(fakeCmd, 0o755);

  const vaultDir = path.join(root, 'vault');
  const scratchDir = path.join(root, 'scratch');
  fs.mkdirSync(vaultDir);

  const { done } = spawnBrain({
    vaultDir,
    scratchDir,
    date: '2026-07-02',
    model: null,
    env: { ...process.env, WIENERDOG_DREAM_CMD: fakeCmd, MARKER: marker },
  });

  const result = await done;
  assert.equal(result.code, 7);
  assert.equal(typeof result.durationMs, 'number');

  const [gotVault, gotScratch] = fs.readFileSync(marker, 'utf8').trim().split('\n');
  assert.equal(gotVault, vaultDir);
  assert.equal(gotScratch, scratchDir);
});
