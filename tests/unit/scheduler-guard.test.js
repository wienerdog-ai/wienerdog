'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { schedulerSpawn } = require('../../src/scheduler/spawn');
const { WienerdogError } = require('../../src/core/errors');
const { defaultLoader } = require('../../src/cli/schedule');
const { defaultCatchupLoader } = require('../../src/scheduler/generators');

/**
 * Run `fn` with the two guard env vars forced to the given values, restoring the
 * original values afterwards so the suite-wide setting (WIENERDOG_TEST_NO_REAL_SCHEDULER=1
 * from tests/run.js) is not disturbed for other tests.
 * @param {{guard?: string, noop?: string}} vals  undefined = delete the var
 * @param {() => void} fn
 */
function withEnv(vals, fn) {
  const savedGuard = process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER;
  const savedNoop = process.env.WIENERDOG_LOADER_NOOP;
  const set = (k, v) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  set('WIENERDOG_TEST_NO_REAL_SCHEDULER', vals.guard);
  set('WIENERDOG_LOADER_NOOP', vals.noop);
  try {
    fn();
  } finally {
    set('WIENERDOG_TEST_NO_REAL_SCHEDULER', savedGuard);
    set('WIENERDOG_LOADER_NOOP', savedNoop);
  }
}

const BOOTOUT = ['launchctl', 'bootout', 'gui/0/ai.wienerdog.dream'];

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
