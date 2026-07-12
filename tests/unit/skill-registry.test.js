'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  readRegistry,
  recordSkills,
  registeredEntry,
} = require('../../src/core/dream/skill-registry');

test('skill-registry: readRegistry missing file → empty registry', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reg-'));
  assert.deepEqual(readRegistry(dir), { version: 1, skills: {} });
});

test('skill-registry: readRegistry corrupt JSON → empty registry (never throws)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reg-'));
  fs.writeFileSync(path.join(dir, 'skill-registry.json'), '{not json');
  assert.deepEqual(readRegistry(dir), { version: 1, skills: {} });
});

test('skill-registry: readRegistry malformed (skills not an object) → empty registry', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reg-'));
  fs.writeFileSync(path.join(dir, 'skill-registry.json'), JSON.stringify({ version: 1, skills: [] }));
  assert.deepEqual(readRegistry(dir), { version: 1, skills: {} });
});

test('skill-registry: recordSkills writes atomically and is idempotent + additive', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reg-'));
  recordSkills(dir, [{ rel: '05-Skills/a/SKILL.md', created: '2026-07-11', id: 'a' }]);
  recordSkills(dir, [{ rel: '05-Skills/a/SKILL.md', created: '2026-07-11', id: 'a' }]); // idempotent
  recordSkills(dir, [{ rel: '05-Skills/b/SKILL.md', created: '2026-07-12', id: 'b' }]); // additive
  const reg = readRegistry(dir);
  assert.equal(Object.keys(reg.skills).length, 2);
  assert.deepEqual(reg.skills['05-Skills/a/SKILL.md'], { created: '2026-07-11', id: 'a' });
  assert.equal(registeredEntry(reg, '05-Skills/b/SKILL.md').id, 'b');
  assert.equal(registeredEntry(reg, '05-Skills/missing/SKILL.md'), null);
  // Atomic write leaves no temp file behind.
  assert.equal(fs.readdirSync(dir).some((f) => f.includes('.tmp-')), false);
});

test('skill-registry: recordSkills empty entries is a no-op (no file created)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reg-'));
  recordSkills(dir, []);
  assert.equal(fs.existsSync(path.join(dir, 'skill-registry.json')), false);
});
