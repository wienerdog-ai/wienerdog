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

test('dream-lock: an expired live local owner keeps its lock on repeated attempts', () => {
  const state = tempState();
  acquireLock(state, -1);
  const file = path.join(state, 'dream.lock');
  const before = fs.readFileSync(file);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(acquireLock(state, 60_000), { acquired: false, stolen: false, reason: 'busy' });
    assert.deepEqual(fs.readFileSync(file), before);
  }
});

const FIXED_NOW = 1789466400000;
const localOwner = { pid: 12345, host: os.hostname(), deadline: FIXED_NOW - 1 };

function seedLock(state, bytes) {
  fs.mkdirSync(state, { recursive: true });
  const file = path.join(state, 'dream.lock');
  fs.writeFileSync(file, bytes);
  return file;
}

test('dream-lock: ordinary acquisition preserves the complete payload bytes', (t) => {
  t.mock.method(Date, 'now', () => FIXED_NOW);
  t.mock.method(os, 'hostname', () => 'example-host');
  const state = tempState();
  assert.deepEqual(acquireLock(state, 60_000), { acquired: true, stolen: false });
  assert.equal(fs.readFileSync(path.join(state, 'dream.lock'), 'utf8'),
    `{"pid":${process.pid},"host":"example-host","startedAt":"2026-09-15T10:00:00.000Z","deadline":1789466460000}`);
});

test('dream-lock: non-EEXIST creation failure propagates', (t) => {
  const state = tempState();
  const error = Object.assign(new Error('write refused'), { code: 'EACCES' });
  t.mock.method(fs, 'writeFileSync', () => { throw error; });
  assert.throws(() => acquireLock(state, 60_000), (e) => e === error);
});

for (const deadline of [FIXED_NOW, FIXED_NOW + 1]) {
  test(`dream-lock: deadline ${deadline} is busy before identity or PID probing`, (t) => {
    const state = tempState();
    const bytes = JSON.stringify({ host: 'foreign', pid: 0, deadline });
    const file = seedLock(state, bytes);
    t.mock.method(Date, 'now', () => FIXED_NOW);
    const probe = t.mock.method(process, 'kill', () => { throw new Error('must not probe'); });
    assert.deepEqual(acquireLock(state, 60_000), { acquired: false, stolen: false, reason: 'busy' });
    assert.equal(probe.mock.callCount(), 0);
    assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  });
}

const unknownRecords = [
  ['malformed JSON', 'not json'], ['null', 'null'], ['array', '[]'],
  ['string record', '"record"'], ['numeric record', '12'],
  ['missing deadline', JSON.stringify({ pid: 12345, host: os.hostname() })],
  ['string deadline', JSON.stringify({ ...localOwner, deadline: '0' })],
  ['null deadline', JSON.stringify({ ...localOwner, deadline: null })],
  ['infinite deadline', '{"deadline":1e999}'],
  ['negative infinite deadline', '{"deadline":-1e999}'],
  ['foreign host', JSON.stringify({ ...localOwner, host: os.hostname() + '-other' })],
  ['non-string host', JSON.stringify({ ...localOwner, host: 12 })],
  ['missing host', JSON.stringify({ pid: 12345, deadline: 0 })],
  ...[undefined, '12345', 0, -1, 1.5, 2147483648, null].map((pid) =>
    [`invalid PID ${pid}`, JSON.stringify({ ...localOwner, pid })]),
];
for (const [label, bytes] of unknownRecords) {
  test(`dream-lock: ${label} retains the unknown owner without probing`, (t) => {
    const state = tempState();
    const file = seedLock(state, bytes);
    t.mock.method(Date, 'now', () => FIXED_NOW);
    const probe = t.mock.method(process, 'kill', () => { throw new Error('must not probe'); });
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(acquireLock(state, 60_000), { acquired: false, stolen: false, reason: 'owner-unknown' });
      assert.equal(fs.readFileSync(file, 'utf8'), bytes);
    }
    assert.equal(probe.mock.callCount(), 0);
  });
}

for (const code of ['EACCES', 'ENOENT']) {
  test(`dream-lock: existing-record read failure ${code} declines without replacement`, (t) => {
    const state = tempState();
    const file = seedLock(state, 'old bytes');
    const read = fs.readFileSync;
    const readMock = t.mock.method(fs, 'readFileSync', (...args) => {
      if (args[0] !== file) return read(...args);
      if (code === 'ENOENT') fs.unlinkSync(file);
      throw Object.assign(new Error('read failed'), { code });
    });
    assert.deepEqual(acquireLock(state, 60_000), { acquired: false, stolen: false, reason: 'owner-unknown' });
    readMock.mock.restore();
    if (code === 'ENOENT') {
      assert.equal(fs.existsSync(file), false);
      assert.deepEqual(acquireLock(state, 60_000), { acquired: true, stolen: false });
    } else assert.equal(fs.readFileSync(file, 'utf8'), 'old bytes');
  });
}

for (const [outcome, reason] of [[null, 'busy'], ['EPERM', 'busy'], ['ESRCH', null], ['EINVAL', 'owner-unknown'], [undefined, 'owner-unknown']]) {
  test(`dream-lock: expired local owner probe ${String(outcome)} determines recovery`, (t) => {
    const state = tempState();
    const bytes = JSON.stringify(localOwner);
    const file = seedLock(state, bytes);
    t.mock.method(Date, 'now', () => FIXED_NOW);
    const calls = [];
    t.mock.method(process, 'kill', (pid, signal) => {
      calls.push([pid, signal]);
      if (outcome !== null) throw Object.assign(new Error('probe failed'), { code: outcome });
    });
    const expected = reason ? { acquired: false, stolen: false, reason } : { acquired: true, stolen: true };
    assert.deepEqual(acquireLock(state, 60_000), expected);
    assert.deepEqual(calls, [[12345, 0]]);
    if (reason) assert.equal(fs.readFileSync(file, 'utf8'), bytes);
    else assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pid, process.pid);
  });
}

for (const pid of [1, 2147483647]) {
  test(`dream-lock: positive PID domain endpoint ${pid} is probeable`, (t) => {
    const state = tempState();
    seedLock(state, JSON.stringify({ ...localOwner, pid }));
    t.mock.method(Date, 'now', () => FIXED_NOW);
    const probe = t.mock.method(process, 'kill', () => {});
    assert.deepEqual(acquireLock(state, 60_000), { acquired: false, stolen: false, reason: 'busy' });
    assert.deepEqual(probe.mock.calls.map((c) => c.arguments), [[pid, 0]]);
  });
}

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
