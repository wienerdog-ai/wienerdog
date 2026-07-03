'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildClaudeArgs, spawnBrain, DREAM_PROMPT } = require('../../src/core/dream/brain');

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

test('dream-brain: DREAM_PROMPT with no layout carries the paths + default layout lines', () => {
  const prompt = DREAM_PROMPT('/s', '/v', '2026-07-03');

  // The three original path lines survive.
  assert.ok(prompt.includes('Scratch extracts directory (read-only inputs): /s'));
  assert.ok(prompt.includes('Vault directory (your only write target): /v'));
  assert.ok(prompt.includes("Today's date: 2026-07-03"));

  // Default layout lines are injected (folder names == today's defaults).
  assert.ok(prompt.includes('- Identity notes directory: 06-Identity'));
  assert.ok(prompt.includes('- Skills directory: 05-Skills'));
  assert.ok(prompt.includes('- Daily log file for today: 07-Daily/2026-07-03.md'));
  assert.ok(prompt.includes('- Reports directory: reports/dreams'));
});

test('dream-brain: buildClaudeArgs embeds a non-default layout, allowlist unchanged', () => {
  // Power-user layout: renamed daily dir + nested filename pattern.
  const layout = {
    identity_dir: '06-Identity',
    daily_dir: '05-Daily',
    daily_filename: 'YYYY/MM/YYYY-MM-DD.md',
    projects_dir: '01-Projects',
    skills_dir: '05-Skills',
    reports_dir: 'reports/dreams',
    inbox_dir: '00-Inbox',
  };
  const args = buildClaudeArgs({ vaultDir: '/v', scratchDir: '/s', date: '2026-07-03', model: null, layout });
  const joined = args.join(' ');

  // The resolved (nested) daily-log path lands in the prompt; the default does not.
  assert.ok(joined.includes('05-Daily/2026/07/2026-07-03.md'));
  assert.ok(!joined.includes('07-Daily'));

  // The tool allowlist is untouched by layout.
  assert.ok(joined.includes('--tools Read,Write,Edit,Glob,Grep'));
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
