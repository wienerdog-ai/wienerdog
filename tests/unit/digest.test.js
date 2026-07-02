'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { renderDigest } = require('../../src/core/digest');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'identity-filled');
const GOLDEN = path.join(__dirname, '..', 'golden', 'digest-default.md');

test('renderDigest on the fixture equals the golden byte-for-byte', () => {
  const actual = renderDigest(FIXTURE);
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  assert.equal(actual, golden);
});

test('renderDigest is deterministic (pure): same input, identical bytes', () => {
  assert.equal(renderDigest(FIXTURE), renderDigest(FIXTURE));
});

test('a note flagged derived_from_untrusted is excluded from the digest', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-digest-'));
  const idDir = path.join(tmp, '06-Identity');
  fs.mkdirSync(idDir, { recursive: true });
  for (const f of ['profile.md', 'preferences.md', 'goals.md', 'instructions.md']) {
    fs.copyFileSync(path.join(FIXTURE, '06-Identity', f), path.join(idDir, f));
  }
  // Taint the profile note.
  const profilePath = path.join(idDir, 'profile.md');
  const tainted = fs
    .readFileSync(profilePath, 'utf8')
    .replace('status: active', 'status: active\nderived_from_untrusted: true');
  fs.writeFileSync(profilePath, tainted);

  const digest = renderDigest(tmp);
  assert.ok(!digest.includes("# Who you're working with"), 'profile section header must be omitted');
  assert.ok(!digest.includes('Ada Kovács'), 'tainted profile content must be omitted');
  // Untainted sections still render.
  assert.ok(digest.includes('## Preferences'), 'other identity sections still render');
});

test('missing identity files are omitted, not errored', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-digest-'));
  const idDir = path.join(tmp, '06-Identity');
  fs.mkdirSync(idDir, { recursive: true });
  fs.copyFileSync(path.join(FIXTURE, '06-Identity', 'goals.md'), path.join(idDir, 'goals.md'));

  const digest = renderDigest(tmp);
  assert.ok(digest.includes('## Goals'));
  assert.ok(!digest.includes('## Preferences'));
  assert.ok(!digest.includes("# Who you're working with"));
});
