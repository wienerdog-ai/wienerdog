'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  RUNTIME_DIR,
  HOOK_FREE_SETTINGS,
  ensureSettingsProfile,
  settingsDigest,
  loadVendoredSkill,
  verifySkillIntegrity,
} = require('../../src/core/runtime-settings');
const { WienerdogError } = require('../../src/core/errors');

const POSIX = process.platform !== 'win32';

const OPERATING_SKILLS = [
  'wienerdog-dream',
  'wienerdog-daily-digest',
  'wienerdog-inbox-triage',
  'wienerdog-weekly-review',
];

/** @param {string} p @returns {number} */
function modeOf(p) {
  return fs.statSync(p).mode & 0o777;
}

/** Minimal paths object over a temp root. @returns {{core:string}} */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rtset-'));
  return { core: path.join(root, 'wd') };
}

/** Run `fn` under a permissive umask, restoring the previous one. */
function withUmask(mask, fn) {
  const prev = process.umask(mask);
  try {
    return fn();
  } finally {
    process.umask(prev);
  }
}

/** A fake skills root with one skill body. @returns {{root:string, digest:string}} */
function fakeSkill(skillId, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-skills-'));
  fs.mkdirSync(path.join(root, skillId), { recursive: true });
  fs.writeFileSync(path.join(root, skillId, 'SKILL.md'), body);
  const digest = crypto.createHash('sha256').update(Buffer.from(body)).digest('hex');
  return { root, digest };
}

// --- settings profile ---

test('runtime-settings: HOOK_FREE_SETTINGS is frozen, hook-free, and names no ambient content', () => {
  assert.ok(Object.isFrozen(HOOK_FREE_SETTINGS));
  assert.equal(HOOK_FREE_SETTINGS.disableAllHooks, true);
  for (const key of ['hooks', 'plugins', 'mcpServers', 'permissions']) {
    assert.ok(!(key in HOOK_FREE_SETTINGS), `no ${key} in the inert profile`);
  }
});

test('runtime-settings: ensureSettingsProfile writes the hook-free profile idempotently', () => {
  const paths = tempPaths();
  const dest = ensureSettingsProfile(paths);
  assert.equal(dest, path.join(RUNTIME_DIR(paths), 'settings.json'));
  const first = fs.readFileSync(dest);
  assert.equal(JSON.parse(first.toString('utf8')).disableAllHooks, true);
  const again = ensureSettingsProfile(paths);
  assert.equal(again, dest);
  assert.deepEqual(fs.readFileSync(dest), first, 'second run writes identical bytes');
});

test('runtime-settings: settings dir is 0700 and file 0600 under a permissive umask', { skip: !POSIX }, () => {
  withUmask(0o000, () => {
    const paths = tempPaths();
    const dest = ensureSettingsProfile(paths);
    assert.equal(modeOf(RUNTIME_DIR(paths)), 0o700);
    assert.equal(modeOf(dest), 0o600);
  });
});

test('runtime-settings: settingsDigest is a stable sha256 and fail-closed on absence', () => {
  const paths = tempPaths();
  const dest = ensureSettingsProfile(paths);
  const d1 = settingsDigest(dest);
  assert.match(d1, /^[0-9a-f]{64}$/);
  assert.equal(settingsDigest(dest), d1, 'stable across reads');
  assert.equal(
    d1,
    crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex')
  );
  assert.equal(settingsDigest('/absent/path/settings.json'), 'missing');
});

// --- vendored skill integrity ---

test('runtime-settings: loadVendoredSkill returns the shipped dream skill body (digest match)', () => {
  const body = loadVendoredSkill('wienerdog-dream');
  const shipped = fs.readFileSync(
    path.join(__dirname, '..', '..', 'skills', 'wienerdog-dream', 'SKILL.md'),
    'utf8'
  );
  assert.equal(body, shipped);
});

test('runtime-settings: every shipped operating skill matches its checked-in digest (drift guard)', () => {
  for (const skillId of OPERATING_SKILLS) {
    assert.equal(verifySkillIntegrity(skillId), true, `${skillId} digest matches shipped bytes`);
  }
});

test('runtime-settings: the digest map covers EXACTLY the 4 fixed operating skills', () => {
  const digests = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'runtime-skill-digests.json'), 'utf8')
  );
  assert.deepEqual(Object.keys(digests).sort(), [...OPERATING_SKILLS].sort());
  for (const [id, digest] of Object.entries(digests)) {
    assert.match(digest, /^[0-9a-f]{64}$/, `${id} digest is sha256 hex`);
  }
});

test('runtime-settings: a tampered skill body fails closed', () => {
  const { root } = fakeSkill('wienerdog-dream', '# tampered\nattacker text\n');
  // Real checked-in digest vs tampered bytes → throw.
  assert.throws(() => loadVendoredSkill('wienerdog-dream', { skillsRoot: root }), WienerdogError);
  // Forced wrong digest vs real shipped bytes → throw.
  assert.throws(
    () => loadVendoredSkill('wienerdog-dream', { digests: { 'wienerdog-dream': 'deadbeef' } }),
    WienerdogError
  );
  assert.equal(verifySkillIntegrity('wienerdog-dream', { skillsRoot: root }), false);
});

test('runtime-settings: a missing skill or missing digest entry fails closed', () => {
  // No digest entry — an arbitrary/later-created skill can never become operating text.
  assert.throws(() => loadVendoredSkill('no-such-skill'), WienerdogError);
  // Digest present but skill file absent.
  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-skills-'));
  assert.throws(
    () => loadVendoredSkill('wienerdog-dream', { skillsRoot: emptyRoot }),
    WienerdogError
  );
  assert.equal(verifySkillIntegrity('no-such-skill'), false);
});

test('runtime-settings: a matching custom digest verifies (test-seam round trip)', () => {
  const { root, digest } = fakeSkill('my-skill', '# my skill\nbody\n');
  const body = loadVendoredSkill('my-skill', { skillsRoot: root, digests: { 'my-skill': digest } });
  assert.equal(body, '# my skill\nbody\n');
});
