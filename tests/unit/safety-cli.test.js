'use strict';

// WP-109: `wienerdog safety` read-only preflight — subprocess-tests the real
// CLI dispatch (bin/wienerdog.js), mirroring the run()/execFileSync pattern
// used by tests/unit/sandbox-guard.test.js and doctor.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

const ALL_GATES = [
  'google-setup',
  'gws-use',
  'external-content-routine',
  'daily-summary-injection',
  'identity-auto-activation',
];

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{status: number, stdout: string, stderr: string}}
 */
function run(args, env = process.env) {
  try {
    const stdout = execFileSync(process.execPath, [bin, ...args], { env, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

test('safety-cli: `wienerdog safety` exits 0 and prints all five gates as [blocked] plus the no-override footer', () => {
  const r = run(['safety']);
  assert.equal(r.status, 0);
  for (const gate of ALL_GATES) {
    assert.match(r.stdout, new RegExp(`\\[blocked\\] ${gate} — `), `${gate}: printed as [blocked]`);
  }
  assert.match(r.stdout, /no flag or environment override/);
});

test('safety-cli: the first data line is two-space-indented `[blocked] google-setup — connecting a Google account is disabled`', () => {
  const r = run(['safety']);
  assert.equal(r.status, 0);
  const lines = r.stdout.split('\n');
  const firstDataLine = lines.find((l) => l.startsWith('  [blocked]'));
  assert.equal(firstDataLine, '  [blocked] google-setup — connecting a Google account is disabled');
});

test('safety-cli: `wienerdog safety --json` exits 0 and prints a five-element array, every status "blocked", in fixed ORDER', () => {
  const r = run(['safety', '--json']);
  assert.equal(r.status, 0);
  const rows = JSON.parse(r.stdout);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((row) => row.name), ALL_GATES);
  for (const row of rows) {
    assert.equal(row.status, 'blocked');
    assert.equal(typeof row.description, 'string');
  }
});

test('safety-cli: no environment variable or CLI flag opens a gate — `--yes` / `WIENERDOG_YES=1` present does not change the output', () => {
  const env = { ...process.env, WIENERDOG_YES: '1' };
  const r = run(['safety', '--yes'], env);
  assert.equal(r.status, 0);
  const rows = JSON.parse(run(['safety', '--json', '--yes'], env).stdout);
  for (const row of rows) assert.equal(row.status, 'blocked');
  for (const gate of ALL_GATES) {
    assert.match(r.stdout, new RegExp(`\\[blocked\\] ${gate} — `));
  }
});
