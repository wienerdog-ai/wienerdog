'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const subject = require('../subject/subject.js');

// `PWD` IS INHERITED, NOT UPDATED BY `cwd:`. A shell-shaped script naturally
// reads it, and before it was redirected every phase saw the REAL checkout
// there — one shared writable path across BASELINE, RED and CONTROL, pointing
// straight at the source tree.
const inCopy = (p) => {
  const real = fs.realpathSync(p);
  const here = fs.realpathSync(process.cwd());
  return real === here || real.startsWith(here + path.sep);
};

test('fixture pwd: PWD names this phase copy, not the checkout', () => {
  assert.ok(process.env.PWD, 'RP-SIGNAL-PWD-UNSET');
  assert.ok(inCopy(process.env.PWD), 'RP-SIGNAL-PWD-OUTSIDE');
  assert.equal(process.env.OLDPWD, undefined, 'RP-SIGNAL-OLDPWD-PRESENT');
});

test('fixture pwd: no other phase left a sentinel under PWD', () => {
  const sentinel = path.join(process.env.PWD, 'pwd-sentinel');
  const existed = fs.existsSync(sentinel);
  fs.writeFileSync(sentinel, 'phase');
  assert.equal(existed, false, 'RP-SIGNAL-PWD-SHARED');
});

test('fixture pwd: the greeting is hello', () => {
  assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
});
