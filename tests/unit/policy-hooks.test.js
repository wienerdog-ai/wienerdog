'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { detectPolicyHooks } = require('../../src/core/policy-hooks');

/** Minimal paths object (detection never uses it for locations). */
const PATHS = { core: '/nonexistent', state: '/nonexistent' };

/** @returns {string} a fresh temp dir */
function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wd-policy-'));
}

test('policy-hooks: absent managed-settings files → present:false', () => {
  const dir = tempDir();
  const report = detectPolicyHooks(PATHS, {}, {
    locations: [path.join(dir, 'managed-settings.json'), path.join(dir, 'managed-settings.d')],
  });
  assert.deepEqual(report, { present: false, sources: [] });
});

test('policy-hooks: a managed file defining hooks → present:true with the source path', () => {
  const dir = tempDir();
  const file = path.join(dir, 'managed-settings.json');
  fs.writeFileSync(file, JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'evil' }] }] } }));
  const report = detectPolicyHooks(PATHS, {}, { locations: [file] });
  assert.equal(report.present, true);
  assert.deepEqual(report.sources, [file]);
});

test('policy-hooks: a managed file WITHOUT hooks (or with empty hooks) → present:false', () => {
  const dir = tempDir();
  const clean = path.join(dir, 'clean.json');
  fs.writeFileSync(clean, JSON.stringify({ permissions: { deny: ['Bash'] } }));
  const empty = path.join(dir, 'empty-hooks.json');
  fs.writeFileSync(empty, JSON.stringify({ hooks: {} }));
  const report = detectPolicyHooks(PATHS, {}, { locations: [clean, empty] });
  assert.deepEqual(report, { present: false, sources: [] });
});

test('policy-hooks: a malformed managed file → present:true (fail closed: cannot prove absence)', () => {
  const dir = tempDir();
  const file = path.join(dir, 'managed-settings.json');
  fs.writeFileSync(file, 'not json {');
  const report = detectPolicyHooks(PATHS, {}, { locations: [file] });
  assert.equal(report.present, true);
  assert.deepEqual(report.sources, [file]);
});

test('policy-hooks: an unreadable managed file → present:true (fail closed), ENOENT → absent', () => {
  const eaccess = (p) => {
    const err = new Error(`EACCES: permission denied, open '${p}'`);
    err.code = 'EACCES';
    throw err;
  };
  const denied = detectPolicyHooks(PATHS, {}, { locations: ['/x/managed-settings.json'], readFile: eaccess });
  assert.equal(denied.present, true);
  assert.deepEqual(denied.sources, ['/x/managed-settings.json']);

  const enoent = (p) => {
    const err = new Error(`ENOENT: no such file, open '${p}'`);
    err.code = 'ENOENT';
    throw err;
  };
  const absent = detectPolicyHooks(PATHS, {}, { locations: ['/x/managed-settings.json'], readFile: enoent });
  assert.deepEqual(absent, { present: false, sources: [] });
});

test('policy-hooks: a managed-settings.d drop-in with a hooks file → present:true', () => {
  const dir = tempDir();
  const dropin = path.join(dir, 'managed-settings.d');
  fs.mkdirSync(dropin);
  fs.writeFileSync(path.join(dropin, '10-org.json'), JSON.stringify({ hooks: { PreToolUse: [{}] } }));
  fs.writeFileSync(path.join(dropin, 'notes.txt'), 'ignored — not .json');
  const report = detectPolicyHooks(PATHS, {}, { locations: [dropin] });
  assert.equal(report.present, true);
  assert.deepEqual(report.sources, [path.join(dropin, '10-org.json')]);
});

test('policy-hooks: never throws, even on a pathological readFile seam', () => {
  const explode = () => {
    throw 'a non-Error throw'; // eslint-disable-line no-throw-literal
  };
  let report;
  assert.doesNotThrow(() => {
    report = detectPolicyHooks(PATHS, {}, { locations: ['/x/managed-settings.json'], readFile: explode });
  });
  assert.equal(report.present, true, 'an unexplainable read failure cannot prove absence');
});

test('policy-hooks: default locations are platform-shaped (no seam)', () => {
  // No locations seam → the real OS paths are consulted read-only. On a dev
  // machine these normally do not exist; the call must not throw either way.
  let report;
  assert.doesNotThrow(() => {
    report = detectPolicyHooks(PATHS, process.env);
  });
  assert.equal(typeof report.present, 'boolean');
  assert.ok(Array.isArray(report.sources));
});
