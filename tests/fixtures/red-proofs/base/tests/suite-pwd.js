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
  // A provided path need not exist, so realpath is best-effort on both sides.
  const resolve = (x) => { try { return fs.realpathSync(x); } catch { return path.resolve(x); } };
  const real = resolve(p);
  const here = resolve(process.cwd());
  return real === here || real.startsWith(here + path.sep);
};

test('fixture pwd: PWD names this phase copy, not the checkout', () => {
  assert.ok(process.env.PWD, 'RP-SIGNAL-PWD-UNSET');
  assert.ok(inCopy(process.env.PWD), 'RP-SIGNAL-PWD-OUTSIDE');
  assert.equal(process.env.OLDPWD, undefined, 'RP-SIGNAL-OLDPWD-PRESENT');
});

// EVERY inherited variable that could still name the checkout, written through.
// Under `npm run` — the documented entry point — npm exports several of these,
// and spawning with `cwd:` touches none of them.
const CWD_NAMING = ['PWD', 'INIT_CWD', 'npm_config_local_prefix', 'npm_package_json'];

test('fixture pwd: no inherited variable still names the checkout', () => {
  for (const name of CWD_NAMING) {
    const v = process.env[name];
    if (v === undefined) continue;                       // removed: nothing to leak
    const dir = name === 'npm_package_json' ? path.dirname(v) : v;
    assert.ok(inCopy(dir), `RP-SIGNAL-CWD-VAR-OUTSIDE: ${name}=${v}`);
  }
});

test('fixture pwd: no other phase left a sentinel under any of them', () => {
  for (const name of CWD_NAMING) {
    const v = process.env[name];
    if (v === undefined) continue;
    const dir = name === 'npm_package_json' ? path.dirname(v) : v;
    const sentinel = path.join(dir, `SENTINEL-${name}`);
    const existed = fs.existsSync(sentinel);
    fs.writeFileSync(sentinel, 'phase');
    assert.equal(existed, false, `RP-SIGNAL-CWD-VAR-SHARED: ${name}`);
  }
});

test('fixture pwd: the greeting is hello', () => {
  assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
});
