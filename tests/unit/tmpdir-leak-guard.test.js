'use strict';

// Regression guard for tests/with-temp-root.js (WP-temp-root-wrapper): the
// run-scoped temp root wrapper placed in front of every test entry point.
// Runs under `npm test` itself (which is already routed through the
// wrapper), so every case here exercises the wrapper as a nested child
// process — its own scratch directories land inside the OUTER wrapper's run
// root and are cleaned up when that outer run tears down.
//
// Every test name is prefixed `tmpdir-leak-guard: ` so the spec's literal
// verification command — `npm test -- --test-name-pattern
// "tmpdir-leak-guard"` — genuinely selects this whole file (a name-pattern
// that matches nothing passes vacuously).
//
// These cases are designed to go RED if the wrapper's TMPDIR/TMP/TEMP
// injection is removed (the injection case below stops resolving to a
// wd-testrun- root), or if its permission-restore walk is removed (the
// mode-0o000 case below stops being removable, so the wrapper's own
// exit-status rule turns a passing child into exit 1). That is demonstrated
// by actually breaking the wrapper and re-running `npm test`, not asserted
// in this file.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const WRAPPER = path.join(REPO_ROOT, 'tests', 'with-temp-root.js');

/** @param {string} prefix @returns {string} a fresh temp dir under the OS tmp root. */
function mkTemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Write a one-off Node script under `dir` and return its path.
 * @param {string} dir
 * @param {string} name
 * @param {string} code
 * @returns {string}
 */
function writeScript(dir, name, code) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, code);
  return p;
}

/**
 * Spawn tests/with-temp-root.js with the given wrapper argv, optionally
 * overriding or unsetting caller env vars.
 * @param {string[]} args
 * @param {{ env?: Record<string, string>, unset?: string[] }} [opts]
 */
function runWrapper(args, opts = {}) {
  const env = { ...process.env, ...(opts.env || {}) };
  for (const name of opts.unset || []) delete env[name];
  return spawnSync(process.execPath, [WRAPPER, ...args], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
  });
}

/** @param {string} stdout @returns {string} the last non-empty line. */
function lastLine(stdout) {
  const lines = stdout.split('\n').filter((l) => l.length > 0);
  return lines[lines.length - 1] || '';
}

// ── package.json wiring (Table B) ──────────────────────────────────────

test('tmpdir-leak-guard: all six test-running npm scripts are routed through tests/with-temp-root.js and keep their names', () => {
  const scripts = require('../../package.json').scripts;
  const routed = {
    test: 'tests/run.js',
    scenarios: 'tests/scenarios/run-scenarios.js',
    'scenarios:negative': 'tests/scenarios/negative/run-negative.js',
    'broker:selfcheck': 'tests/scenarios/broker/lifecycle-selfcheck.js',
    'scenarios:broker-e2e': 'tests/scenarios/broker-e2e/run-broker-e2e.js',
    'scenarios:a7-integrity': 'tests/scenarios/a7-integrity/run-a7-integrity.js',
  };
  for (const [name, entry] of Object.entries(routed)) {
    assert.ok(name in scripts, `missing script: ${name}`);
    assert.equal(scripts[name], `node tests/with-temp-root.js ${entry}`);
  }
});

test('tmpdir-leak-guard: package.json scripts carries the "//" convention note naming the wrapper, as the first entry', () => {
  const scripts = require('../../package.json').scripts;
  const keys = Object.keys(scripts);
  assert.equal(keys[0], '//', 'the "//" key must be the first entry in scripts');
  const note = scripts['//'] || '';
  assert.ok(
    note.includes('tests/with-temp-root.js'),
    `note missing or does not name the wrapper: ${note}`
  );
});

// ── injected env (Table A) ─────────────────────────────────────────────

test('tmpdir-leak-guard: injects TMPDIR, TMP and TEMP, all set to a fresh wd-testrun- root distinct from the ambient one', () => {
  // This guard runs nested inside `npm test`, which is itself routed
  // through the wrapper — so the AMBIENT TMPDIR already carries a
  // wd-testrun- prefix. A prefix check alone would pass vacuously if the
  // wrapper under test stopped injecting anything (the child would just
  // inherit that same ambient value). Capture the ambient value first and
  // require the child's to be a genuinely different, freshly-created one.
  const ambient = process.env.TMPDIR || os.tmpdir();
  const dir = mkTemp('wd-tmpguard-inject-');
  const script = writeScript(
    dir,
    'envdump.js',
    "console.log(JSON.stringify({T:process.env.TMPDIR,M:process.env.TMP,E:process.env.TEMP}));"
  );
  const r = runWrapper([script]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(lastLine(r.stdout));
  assert.ok(out.T, 'TMPDIR not set in child');
  assert.equal(out.T, out.M, 'TMPDIR and TMP must match');
  assert.equal(out.T, out.E, 'TMPDIR and TEMP must match');
  assert.ok(
    path.basename(out.T).startsWith('wd-testrun-'),
    `child TMPDIR does not look like a fresh run root: ${out.T}`
  );
  assert.notEqual(
    path.resolve(out.T),
    path.resolve(ambient),
    'child TMPDIR must be a freshly created root, not the inherited ambient one'
  );
});

test('tmpdir-leak-guard: does not inject WIENERDOG_TEST_NO_REAL_SCHEDULER or WIENERDOG_RUN_SCENARIOS when the caller lacks them', () => {
  const dir = mkTemp('wd-tmpguard-noinject-');
  const script = writeScript(
    dir,
    'envcheck.js',
    "const n=['WIENERDOG_TEST_NO_REAL_SCHEDULER','WIENERDOG_RUN_SCENARIOS'];" +
      "console.log(n.map(k=>`${k}=${k in process.env?JSON.stringify(process.env[k]):'<unset>'}`).join(' '));"
  );
  const r = runWrapper([script], {
    unset: ['WIENERDOG_TEST_NO_REAL_SCHEDULER', 'WIENERDOG_RUN_SCENARIOS'],
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    lastLine(r.stdout),
    'WIENERDOG_TEST_NO_REAL_SCHEDULER=<unset> WIENERDOG_RUN_SCENARIOS=<unset>'
  );
});

test("tmpdir-leak-guard: passes the caller's own WIENERDOG_TEST_NO_REAL_SCHEDULER / WIENERDOG_RUN_SCENARIOS through byte-exact", () => {
  const dir = mkTemp('wd-tmpguard-passthru-');
  const script = writeScript(
    dir,
    'envcheck2.js',
    "const n=['WIENERDOG_TEST_NO_REAL_SCHEDULER','WIENERDOG_RUN_SCENARIOS'];" +
      "console.log(n.map(k=>`${k}=${k in process.env?JSON.stringify(process.env[k]):'<unset>'}`).join(' '));"
  );
  const r = runWrapper([script], {
    env: {
      WIENERDOG_TEST_NO_REAL_SCHEDULER: 'passthru1',
      WIENERDOG_RUN_SCENARIOS: 'passthru2',
    },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    lastLine(r.stdout),
    'WIENERDOG_TEST_NO_REAL_SCHEDULER="passthru1" WIENERDOG_RUN_SCENARIOS="passthru2"'
  );
});

// ── argument forwarding (Table A) ──────────────────────────────────────

test('tmpdir-leak-guard: forwards every argument to the child byte-exact and order-exact, including one containing a space', () => {
  const dir = mkTemp('wd-tmpguard-argv-');
  const script = writeScript(
    dir,
    'argv.js',
    'console.log(JSON.stringify(process.argv.slice(2)));'
  );
  const r = runWrapper([script, '--flag', 'value', 'two words', '--k=v']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    lastLine(r.stdout),
    JSON.stringify(['--flag', 'value', 'two words', '--k=v'])
  );
});

// ── exit status (Table A) ──────────────────────────────────────────────

test('tmpdir-leak-guard: propagates a non-zero numeric child exit status unchanged', () => {
  const dir = mkTemp('wd-tmpguard-boom-');
  const script = writeScript(dir, 'boom.js', 'process.exit(7);');
  const r = runWrapper([script]);
  assert.equal(r.status, 7);
});

test('tmpdir-leak-guard: exits 1 when the child dies on a signal', () => {
  const dir = mkTemp('wd-tmpguard-signal-');
  const script = writeScript(
    dir,
    'signal.js',
    "process.kill(process.pid, 'SIGKILL');"
  );
  const r = runWrapper([script]);
  assert.equal(r.status, 1);
});

test('tmpdir-leak-guard: exits non-zero with a usage message on stderr when no script argument is given', () => {
  const r = runWrapper([]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage/i);
});

// ── permission-restoring teardown (Table A) ────────────────────────────

test('tmpdir-leak-guard: teardown removes a tree containing a directory whose mode is 0o000', () => {
  const dir = mkTemp('wd-tmpguard-leaky-');
  const script = writeScript(
    dir,
    'leaky.js',
    "const fs=require('node:fs'),os=require('node:os'),path=require('node:path');" +
      "const b=fs.mkdtempSync(path.join(os.tmpdir(),'wd-synthleak-'));" +
      "fs.mkdirSync(path.join(b,'locked'));" +
      "fs.writeFileSync(path.join(b,'locked','f'),'x');" +
      "fs.chmodSync(path.join(b,'locked'),0o000);" +
      "console.log(b);"
  );
  const r = runWrapper([script]);
  assert.equal(r.status, 0, r.stderr);
  const leakedRoot = lastLine(r.stdout);
  assert.equal(
    fs.existsSync(leakedRoot),
    false,
    'the mode-0o000 tree should have been removed by teardown'
  );
});

test('tmpdir-leak-guard: does not follow a symbolic link out of the root during teardown', () => {
  const outside = mkTemp('wd-tmpguard-outside-');
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'still here');
  fs.chmodSync(outside, 0o755);

  const dir = mkTemp('wd-tmpguard-symlink-');
  const script = writeScript(
    dir,
    'linker.js',
    "const fs=require('node:fs'),os=require('node:os'),path=require('node:path');" +
      `const root=fs.mkdtempSync(path.join(os.tmpdir(),'wd-synthlink-'));` +
      `fs.symlinkSync(${JSON.stringify(outside)},path.join(root,'escape'),'dir');` +
      'console.log(root);'
  );
  const r = runWrapper([script]);
  assert.equal(r.status, 0, r.stderr);
  const leakedRoot = lastLine(r.stdout);
  assert.equal(
    fs.existsSync(leakedRoot),
    false,
    'the synthetic run root (and its symlink) should be gone'
  );
  assert.equal(fs.existsSync(outside), true, 'the symlink target must survive');
  assert.equal(fs.statSync(outside).mode & 0o777, 0o755, 'the symlink target must keep its own mode');
  assert.equal(
    fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'),
    'still here'
  );
});
