'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { acquireLock, releaseLock, ownsLock } = require('../../src/core/dream/lock');

/** Fresh temp state dir. @returns {string} */
function tempState() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-lock-'));
  return path.join(root, 'state');
}

test('dream-lock: acquires on an empty state dir', () => {
  const state = tempState();
  const result = acquireLock(state, 60_000);
  assert.deepEqual(result, { acquired: true, stolen: false });
  assert.ok(fs.existsSync(path.join(state, 'dream.lock')));
});

test('dream-lock: a second call while the lock is live is refused', () => {
  const state = tempState();
  acquireLock(state, 60_000);
  const second = acquireLock(state, 60_000);
  assert.equal(second.acquired, false);
  assert.equal(second.stolen, false);
});

test('dream-lock: a lock past its deadline is stolen', () => {
  const state = tempState();
  // Negative timeout → deadline already in the past.
  const first = acquireLock(state, -1);
  assert.deepEqual(first, { acquired: true, stolen: false });
  const stolen = acquireLock(state, 60_000);
  assert.deepEqual(stolen, { acquired: true, stolen: true });
});

test('dream-lock: an unparseable lock is stolen', () => {
  const state = tempState();
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'dream.lock'), 'not json');
  const result = acquireLock(state, 60_000);
  assert.deepEqual(result, { acquired: true, stolen: true });
});

test('dream-lock: releaseLock removes only our own lock', () => {
  const state = tempState();
  acquireLock(state, 60_000);
  releaseLock(state);
  assert.equal(fs.existsSync(path.join(state, 'dream.lock')), false);
});

test('dream-lock: releaseLock leaves another process lock intact', () => {
  const state = tempState();
  fs.mkdirSync(state, { recursive: true });
  const other = JSON.stringify({ pid: process.pid + 99999, host: 'x', startedAt: 'now', deadline: Date.now() + 60_000 });
  fs.writeFileSync(path.join(state, 'dream.lock'), other);
  releaseLock(state);
  assert.equal(fs.existsSync(path.join(state, 'dream.lock')), true);
});

test('dream-lock: releaseLock is a no-op when absent', () => {
  const state = tempState();
  assert.doesNotThrow(() => releaseLock(state));
});

test('dream-lock: ownsLock is true for our own live lock', () => {
  const state = tempState();
  acquireLock(state, 60_000);
  assert.equal(ownsLock(state), true);
});

test('dream-lock: ownsLock is false for a foreign-pid lock (superseded holder)', () => {
  const state = tempState();
  fs.mkdirSync(state, { recursive: true });
  const other = JSON.stringify({ pid: process.pid + 99999, host: 'x', startedAt: 'now', deadline: Date.now() + 60_000 });
  fs.writeFileSync(path.join(state, 'dream.lock'), other);
  assert.equal(ownsLock(state), false);
});

test('dream-lock: ownsLock is false when the lock is absent', () => {
  const state = tempState();
  assert.equal(ownsLock(state), false);
});

test('dream-lock: ownsLock is false when the lock is unparseable', () => {
  const state = tempState();
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'dream.lock'), 'not json');
  assert.equal(ownsLock(state), false);
});
