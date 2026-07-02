'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'gen-agents-md.js');

const HEADER =
  '<!-- GENERATED from CLAUDE.md — do not hand-edit. Regenerate with: npm run gen:agents. -->';

/** @param {string[]} args @param {string} dir @returns {{status: number, stdout: string}} */
function run(args, dir) {
  const script = path.join(dir, 'scripts', 'gen-agents-md.js');
  try {
    const stdout = execFileSync('node', [script, ...args], { cwd: dir, encoding: 'utf8' });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '' };
  }
}

/** Sets up a temp dir containing only CLAUDE.md, and copies the generator into it. */
function makeTempRepo(claudeMdContents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-agents-md-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), claudeMdContents, 'utf8');
  fs.copyFileSync(scriptPath, path.join(dir, 'scripts', 'gen-agents-md.js'));
  return dir;
}

test('writes AGENTS.md as HEADER + newline + CLAUDE.md contents', () => {
  const dir = makeTempRepo('# Hello\nworld\n');
  const result = run([], dir);
  assert.equal(result.status, 0);
  const agentsMd = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.equal(agentsMd, `${HEADER}\n# Hello\nworld\n`);
});

test('preserves CLAUDE.md byte-for-byte, including trailing newline', () => {
  const dir = makeTempRepo('line one\nline two\n');
  run([], dir);
  const agentsMd = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.equal(agentsMd.slice(HEADER.length + 1), 'line one\nline two\n');
});

test('is idempotent: running twice produces the same output', () => {
  const dir = makeTempRepo('some content\n');
  run([], dir);
  const first = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  run([], dir);
  const second = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.equal(first, second);
});

test('--check exits 1 with a message when AGENTS.md is missing', () => {
  const dir = makeTempRepo('some content\n');
  const result = run(['--check'], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /missing/i);
});

test('--check exits 1 with a one-line diff summary after CLAUDE.md changes', () => {
  const dir = makeTempRepo('original content\n');
  run([], dir);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'changed content\n', 'utf8');
  const result = run(['--check'], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  assert.match(result.stdout, /out of sync/i);
});

test('--check exits 0 after regenerating following a CLAUDE.md change', () => {
  const dir = makeTempRepo('original content\n');
  run([], dir);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'changed content\n', 'utf8');
  assert.equal(run(['--check'], dir).status, 1);
  run([], dir);
  assert.equal(run(['--check'], dir).status, 0);
});
