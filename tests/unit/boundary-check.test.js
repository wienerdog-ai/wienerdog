'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'boundary-check.js');
const specPath = 'docs/specs/done/WP-001-ci-and-lint-pipeline.md';

/** @param {string[]} args @returns {{status: number, stdout: string, stderr: string}} */
function run(args) {
  try {
    const stdout = execFileSync('node', [scriptPath, ...args], { cwd: repoRoot, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

test('allows a file listed in the Deliverables table', () => {
  const result = run([specPath, 'scripts/lint.js']);
  assert.equal(result.status, 0);
});

test('allows the spec file itself', () => {
  const result = run([specPath, specPath]);
  assert.equal(result.status, 0);
});

test('allows docs/specs/ROADMAP.md unconditionally', () => {
  const result = run([specPath, 'docs/specs/ROADMAP.md']);
  assert.equal(result.status, 0);
});

test('rejects a file not in the Deliverables table', () => {
  const result = run([specPath, 'src/nope.js']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/nope\.js/);
});

test('rejects when at least one of several changed files is disallowed', () => {
  const result = run([specPath, 'scripts/lint.js', 'src/nope.js']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/nope\.js/);
});

test('prints usage and exits 1 when no changed files are given', () => {
  const result = run([specPath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});

test('allows files under a directory-style Deliverables entry', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-bc-'));
  const tempSpec = path.join(tmp, 'spec.md');
  fs.writeFileSync(
    tempSpec,
    [
      '## Deliverables',
      '',
      '| Action | Path | Notes |',
      '|--------|------|-------|',
      '| create | templates/vault/ | whole tree |',
      '| create | src/core/vault.js | |',
      '',
      '## Next section',
    ].join('\n')
  );
  const ok = run([tempSpec, 'templates/vault/01-Projects/README.md', 'src/core/vault.js']);
  assert.equal(ok.status, 0);
  const bad = run([tempSpec, 'templates/other/file.md']);
  assert.equal(bad.status, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});
