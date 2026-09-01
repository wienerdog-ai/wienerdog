'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { schedulerSpawn, realSchedulerAuthority } = require('../../src/scheduler/spawn');
const { WienerdogError } = require('../../src/core/errors');
const { defaultLoader } = require('../../src/cli/schedule');
const { defaultCatchupLoader } = require('../../src/scheduler/generators');

/** The env vars the chokepoint reads (Table A rows 1-2 + Table B's two arms and
 *  the two lookups they feed). Every test declares the WHOLE set; a key left
 *  `undefined` is DELETED, so no test inherits an ambient value. */
const ENV_KEYS = {
  guard: 'WIENERDOG_TEST_NO_REAL_SCHEDULER',
  noop: 'WIENERDOG_LOADER_NOOP',
  allow: 'WIENERDOG_ALLOW_REAL_SCHEDULER',
  home: 'HOME',
  wdhome: 'WIENERDOG_HOME',
};

/**
 * Run `fn` with those env vars forced to the given values, restoring the original
 * values afterwards so the suite-wide setting (WIENERDOG_TEST_NO_REAL_SCHEDULER=1
 * from tests/run.js) is not disturbed for other tests.
 * @param {{guard?: string, noop?: string, allow?: string, home?: string, wdhome?: string}} vals
 * @param {() => any} fn
 */
function withEnv(vals, fn) {
  /** @type {Record<string, string|undefined>} */ const saved = {};
  for (const name of Object.values(ENV_KEYS)) saved[name] = process.env[name];
  const set = (k, v) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  for (const [key, name] of Object.entries(ENV_KEYS)) set(name, vals[key]);
  try {
    return fn();
  } finally {
    for (const name of Object.values(ENV_KEYS)) set(name, saved[name]);
  }
}

/** Run `fn` with stdout AND stderr captured. The refusal contract is "exactly one
 *  line on stderr, nothing on stdout" — stdout is where schedulerSpawn's callers
 *  read scheduler-client output, so a stray byte there is a real defect.
 *  @param {() => any} fn @returns {{value:any, err:string, out:string}} */
function capture(fn) {
  const origErr = process.stderr.write.bind(process.stderr);
  const origOut = process.stdout.write.bind(process.stdout);
  let err = '';
  let out = '';
  process.stderr.write = (chunk) => {
    err += chunk;
    return true;
  };
  process.stdout.write = (chunk) => {
    out += chunk;
    return true;
  };
  try {
    return { value: fn(), err, out };
  } finally {
    process.stderr.write = origErr;
    process.stdout.write = origOut;
  }
}

/** A temp dir that is cleaned up when the test ends. @param {import('node:test').TestContext} t */
function tempDir(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sched-guard-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

/** An argv that PROVES whether the chokepoint spawned: running it creates
 *  `canary`. Portable (it is this Node), and harmless — it touches one file in a
 *  temp dir and never goes near a scheduler. @param {string} canary @returns {string[]} */
function canaryArgv(canary) {
  return [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(canary)}, 'x')`];
}

/** An argv that exits with `code`, for reading back "row 3 returns the process's
 *  own status". @param {number} code @returns {string[]} */
function exitArgv(code) {
  return [process.execPath, '-e', `process.exit(${code})`];
}

const BOOTOUT = ['launchctl', 'bootout', 'gui/0/ai.wienerdog.dream'];

// ── Table A rows 1 and 2: unchanged, byte for byte ────────────────────────────

test('guard set, NOOP unset: schedulerSpawn throws WienerdogError naming the argv', () => {
  withEnv({ guard: '1', noop: undefined }, () => {
    assert.throws(
      () => schedulerSpawn(BOOTOUT),
      (err) => {
        assert.ok(err instanceof WienerdogError, 'is a WienerdogError');
        assert.match(err.message, /launchctl bootout gui\/0\/ai\.wienerdog\.dream/, 'message names the argv');
        return true;
      }
    );
  });
});

test('NOOP set (precedence over guard): schedulerSpawn returns {status:0}, does not throw', () => {
  withEnv({ guard: '1', noop: '1' }, () => {
    assert.deepEqual(schedulerSpawn(BOOTOUT), { status: 0 });
  });
});

test('defaultLoader delegates through the guard: throws under the guard, NOOP unset', () => {
  withEnv({ guard: '1', noop: undefined }, () => {
    assert.throws(() => defaultLoader(BOOTOUT), WienerdogError);
  });
});

test('defaultCatchupLoader delegates through the guard: throws under the guard, NOOP unset', () => {
  withEnv({ guard: '1', noop: undefined }, () => {
    assert.throws(() => defaultCatchupLoader(BOOTOUT), WienerdogError);
  });
});

test('rows 1 and 2 still win over authority: NOOP first, then the guard (Table A precedence)', (t) => {
  const home = tempDir(t);
  withEnv({ guard: '1', noop: '1', allow: '1', home }, () => {
    assert.deepEqual(schedulerSpawn(BOOTOUT), { status: 0 }, 'row 1 wins over ALLOW + guard');
  });
  withEnv({ guard: '1', allow: '1', home }, () => {
    assert.throws(() => schedulerSpawn(BOOTOUT), WienerdogError, 'row 2 wins over ALLOW');
  });
});

// ── Table A row 4: the new default ───────────────────────────────────────────

test('Table A row 4: a redirected HOME with no marker REFUSES — nothing spawns, one stderr line', (t) => {
  const home = tempDir(t);
  const canary = path.join(home, 'canary');
  const argv = canaryArgv(canary);
  const { value, err, out } = withEnv({ home }, () => capture(() => schedulerSpawn(argv)));
  assert.deepEqual(value, { status: 1, stdout: '' }, 'non-zero status through the existing shape');
  assert.equal(fs.existsSync(canary), false, 'nothing was spawned');
  assert.equal(out, '', 'nothing on stdout');
  assert.equal(err.split('\n').filter((l) => l !== '').length, 1, 'exactly one stderr line');
  assert.ok(err.endsWith('\n'), 'the line is newline-terminated');
  assert.match(err, /WIENERDOG_ALLOW_REAL_SCHEDULER/, 'names the opt-in');
  assert.ok(err.includes(argv.join(' ')), 'names the skipped argv');
  assert.ok(err.includes(path.join(home, '.wienerdog')), 'names the resolved core');
  assert.doesNotMatch(err, /<unavailable>/, 'both lookups resolved — no placeholder');
});

test('Table A row 4: each refused call names its own argv — no de-duplication', (t) => {
  const home = tempDir(t);
  const { err } = withEnv({ home }, () =>
    capture(() => {
      schedulerSpawn(['launchctl', 'bootout', 'gui/0/ai.wienerdog.dream']);
      schedulerSpawn(['launchctl', 'bootout', 'gui/0/ai.wienerdog.catchup']);
    })
  );
  const lines = err.split('\n').filter((l) => l !== '');
  assert.equal(lines.length, 2, 'one line per refused call');
  assert.ok(lines[0].includes('ai.wienerdog.dream'));
  assert.ok(lines[1].includes('ai.wienerdog.catchup'));
});

test('both default loaders inherit row 4: they refuse, softly, with the same line', (t) => {
  const home = tempDir(t);
  const canary = path.join(home, 'canary');
  const argv = canaryArgv(canary);
  for (const loader of [defaultLoader, defaultCatchupLoader]) {
    const { value, err } = withEnv({ home }, () => capture(() => loader(argv)));
    assert.equal(value.status, 1);
    assert.equal(fs.existsSync(canary), false, 'nothing was spawned');
    assert.match(err, /WIENERDOG_ALLOW_REAL_SCHEDULER/);
  }
});

// ── Table A row 3 / Table B: what makes the mutating branch reachable ─────────

test('Table A row 3, opt-in arm: the exact string "1" really spawns and returns the process status', (t) => {
  const home = tempDir(t);
  const canary = path.join(home, 'canary');
  const spawned = withEnv({ allow: '1', home }, () => capture(() => schedulerSpawn(canaryArgv(canary))));
  assert.equal(spawned.value.status, 0);
  assert.equal(fs.existsSync(canary), true, 'the argv really ran');
  assert.equal(spawned.err, '', 'an authorized call prints nothing');
  const nonZero = withEnv({ allow: '1', home }, () => schedulerSpawn(exitArgv(3)));
  assert.equal(nonZero.status, 3, "row 3 returns the process's own status");
});

test('Table B exact-value rule: 0 / false / no / "" grant nothing; only "1" does', (t) => {
  const home = tempDir(t);
  for (const allow of ['0', 'false', 'no', '', 'TRUE', '1 ']) {
    const canary = path.join(home, `canary-${allow.trim() || 'empty'}`);
    const { value } = withEnv({ allow, home }, () => capture(() => schedulerSpawn(canaryArgv(canary))));
    assert.equal(value.status, 1, `${JSON.stringify(allow)} must not grant authority`);
    assert.equal(fs.existsSync(canary), false, `${JSON.stringify(allow)} spawned something`);
  }
});

test('Table B: the home comes from os.userInfo(), so a temp HOME with its own .wienerdog still refuses', (t) => {
  const home = tempDir(t);
  // This directory satisfies a naive os.homedir()/$HOME-based check exactly.
  fs.mkdirSync(path.join(home, '.wienerdog'));
  const { value, err } = withEnv({ home }, () => capture(() => schedulerSpawn(BOOTOUT)));
  assert.equal(value.status, 1, 'a redirected HOME never grants coherence');
  assert.ok(err.includes(path.join(home, '.wienerdog')), 'the line names this run’s core');
  const auth = withEnv({ home }, () => realSchedulerAuthority());
  assert.equal(auth.ok, false);
  assert.equal(auth.home, os.userInfo().homedir, 'home is the passwd home, not $HOME');
});

test('Table A row 3, coherence arm: the passwd home with no marker really spawns', () => {
  const home = os.userInfo().homedir;
  const { value, err } = withEnv({ home }, () => capture(() => schedulerSpawn(exitArgv(0))));
  assert.equal(value.status, 0, 'a legitimate install on a real machine is unchanged');
  assert.equal(err, '', 'nothing is printed when authority is present');
  const auth = withEnv({ home }, () => realSchedulerAuthority());
  assert.deepEqual(
    { ok: auth.ok, error: auth.error },
    { ok: true, error: null },
    'the coherence arm grants without an error'
  );
});

test('Table B arm 1 short-circuits: core/home are NOT evaluated when the opt-in grants', (t) => {
  const home = tempDir(t);
  const auth = withEnv({ allow: '1', home, wdhome: 'relative/not/absolute' }, () => realSchedulerAuthority());
  assert.deepEqual(auth, { ok: true, core: null, home: null, error: null });
});

// ── Table B's evaluation-failure row + Table R's second form ──────────────────

/** Force `os.userInfo()` to throw for the duration of `fn` — the "uid has no
 *  passwd entry" case, which cannot be produced from the environment.
 *  @param {() => any} fn */
function withThrowingUserInfo(fn) {
  const orig = os.userInfo;
  os.userInfo = () => {
    throw new Error('no passwd entry for uid');
  };
  try {
    return fn();
  } finally {
    os.userInfo = orig;
  }
}

test('Table B evaluation failure (core lookup): an unsafe WIENERDOG_HOME REFUSES, never throws out', (t) => {
  const home = tempDir(t);
  const canary = path.join(home, 'canary');
  const { value, err, out } = withEnv({ home, wdhome: 'relative/not/absolute' }, () =>
    capture(() => schedulerSpawn(canaryArgv(canary)))
  );
  assert.deepEqual(value, { status: 1, stdout: '' }, 'a refusal, not an exception');
  assert.equal(fs.existsSync(canary), false, 'nothing was spawned');
  assert.equal(out, '');
  assert.equal(err.split('\n').filter((l) => l !== '').length, 1, 'exactly one stderr line');
  assert.match(err, /could not establish which user's scheduler this run belongs to/);
  assert.ok(err.includes('core: <unavailable>'), 'the unresolvable core renders as the placeholder');
  assert.ok(err.includes(`home: ${os.userInfo().homedir}`), 'the resolved home is still named');
  assert.match(err, /must be an absolute path/, "carries the failing lookup's message");
  assert.doesNotMatch(err, /undefined|\bnull\b/, 'no partially-built path, no undefined');
  assert.match(err, /WIENERDOG_ALLOW_REAL_SCHEDULER/);
});

test('Table B evaluation failure (home lookup): a throwing os.userInfo() REFUSES with <unavailable> for home', (t) => {
  const home = tempDir(t);
  const { value, err } = withThrowingUserInfo(() =>
    withEnv({ home }, () => capture(() => schedulerSpawn(BOOTOUT)))
  );
  assert.equal(value.status, 1);
  assert.ok(err.includes(`core: ${path.join(home, '.wienerdog')}`), 'the resolved core is named');
  assert.ok(err.includes('home: <unavailable>'));
  assert.match(err, /no passwd entry for uid/);
  assert.equal(err.split('\n').filter((l) => l !== '').length, 1);
});

test('Table B evaluation failure (BOTH lookups): the FIRST failure is the reported error', (t) => {
  const home = tempDir(t);
  const { value, err } = withThrowingUserInfo(() =>
    withEnv({ home, wdhome: 'relative/not/absolute' }, () => capture(() => schedulerSpawn(BOOTOUT)))
  );
  assert.equal(value.status, 1);
  assert.ok(err.includes('core: <unavailable>') && err.includes('home: <unavailable>'));
  assert.match(err, /must be an absolute path/, 'the core lookup failed first');
  assert.doesNotMatch(err, /no passwd entry/, 'the second failure is not appended');
  assert.equal(err.split('\n').filter((l) => l !== '').length, 1, 'still exactly one line');
});

// ── Table B ordering: the opt-in cannot be revoked by a broken lookup ─────────

test('Table B ordering: the opt-in grants even when the core lookup would throw', (t) => {
  const home = tempDir(t);
  const canary = path.join(home, 'canary');
  const { value, err } = withEnv({ allow: '1', home, wdhome: 'relative/not/absolute' }, () =>
    capture(() => schedulerSpawn(canaryArgv(canary)))
  );
  assert.equal(value.status, 0, 'the opt-in short-circuits before any lookup runs');
  assert.equal(fs.existsSync(canary), true, 'it really spawned');
  assert.equal(err, '', 'nothing is printed');
});

test('Table B ordering: the opt-in grants even when the home lookup would throw', (t) => {
  const home = tempDir(t);
  const canary = path.join(home, 'canary');
  const { value, err } = withThrowingUserInfo(() =>
    withEnv({ allow: '1', home }, () => capture(() => schedulerSpawn(canaryArgv(canary))))
  );
  assert.equal(value.status, 0);
  assert.equal(fs.existsSync(canary), true, 'it really spawned');
  assert.equal(err, '');
});

test('Table B ordering: the opt-in grants even when BOTH lookups would throw', (t) => {
  const home = tempDir(t);
  const canary = path.join(home, 'canary');
  const { value, err } = withThrowingUserInfo(() =>
    withEnv({ allow: '1', home, wdhome: 'relative/not/absolute' }, () =>
      capture(() => schedulerSpawn(canaryArgv(canary)))
    )
  );
  assert.equal(value.status, 0);
  assert.equal(fs.existsSync(canary), true, 'it really spawned');
  assert.equal(err, '');
});
