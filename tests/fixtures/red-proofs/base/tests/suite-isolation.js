'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const subject = require('../subject/subject.js');

// NO TWO PHASES SHARE A WRITABLE PATH THE RUNNER PROVIDES. Each test below
// writes a sentinel into one provided location and asserts no EARLIER phase's
// sentinel was visible. A phase that could see another's would fail HERE, with
// its own signal — never with the declared one — so the proof would be FAILED
// rather than quietly PROVEN.

/** `process.cwd()` is already canonical; a provided path need not be. */
const inCopy = (p) => {
  const real = fs.realpathSync(p);
  const here = fs.realpathSync(process.cwd());
  return real === here || real.startsWith(here + path.sep);
};

test('fixture iso: the temp directory carries no other phase sentinel', () => {
  const sentinel = path.join(os.tmpdir(), 'rp-tmp-sentinel');
  const existed = fs.existsSync(sentinel);
  fs.writeFileSync(sentinel, 'phase');
  assert.equal(existed, false, 'RP-SIGNAL-TMP-SHARED');
  assert.ok(inCopy(os.tmpdir()), 'RP-SIGNAL-TMP-OUTSIDE');
});

test('fixture iso: HOME carries no other phase sentinel', () => {
  const home = process.env.HOME;
  const sentinel = path.join(home, 'rp-home-sentinel');
  const existed = fs.existsSync(sentinel);
  fs.writeFileSync(sentinel, 'phase');
  assert.equal(existed, false, 'RP-SIGNAL-HOME-SHARED');
  assert.ok(inCopy(home), 'RP-SIGNAL-HOME-OUTSIDE');
});

test('fixture iso: the copies common parent is not writable', () => {
  assert.throws(
    () => fs.writeFileSync(path.join(process.cwd(), '..', 'rp-parent-sentinel'), 'phase'),
    (e) => e && /EACCES|EPERM|EROFS/.test(String(e.code)),
    'RP-SIGNAL-PARENT-WRITABLE'
  );
});

test('fixture iso: no ambient Wienerdog override reaches this phase', () => {
  const ambient = process.env.RP_AMBIENT_CLAUDE_DIR;
  assert.ok(ambient, 'RP-SIGNAL-FIXTURE-MISCONFIGURED: the test must export the ambient value it planted');
  assert.notEqual(process.env.WIENERDOG_CLAUDE_DIR, ambient, 'RP-SIGNAL-AMBIENT-LEAKED');
  assert.notEqual(process.env.CLAUDE_CONFIG_DIR, ambient, 'RP-SIGNAL-AMBIENT-LEAKED');
});

test('fixture iso: the copy carries no node_modules', () => {
  assert.equal(fs.existsSync(path.join(process.cwd(), 'node_modules')), false,
    'RP-SIGNAL-NODE-MODULES-COPIED');
  assert.equal(fs.existsSync(path.join(process.cwd(), '.git')), false,
    'RP-SIGNAL-GIT-COPIED');
});

test('fixture iso: the suite was started through the tree own tests/run.js', () => {
  // Only `tests/run.js` sets this, so its value here is what proves the runner
  // started the suite through the tree's own entry rather than `node --test`.
  assert.equal(process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER, '1', 'RP-SIGNAL-SCHEDULER-GUARD');
});

test('fixture iso: the greeting is hello', () => {
  assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
});
