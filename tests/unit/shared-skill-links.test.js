'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const shared = require('../../src/adapters/shared');
const { hashDir } = require('../../src/core/manifest');

/** Fresh temp core skills dir (with one wienerdog-* skill) + empty target dir. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-skill-links-'));
  const skillsDir = path.join(root, 'core-skills');
  const targetSkillsDir = path.join(root, 'harness-skills');
  const coreSkill = path.join(skillsDir, 'wienerdog-setup');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');
  return { root, skillsDir, targetSkillsDir, coreSkill };
}

function freshOut() {
  return { changed: [], unchanged: [], notices: [] };
}

function freshManifest() {
  return { version: 1, createdAt: new Date().toISOString(), entries: [] };
}

/** A symlink seam that always throws EPERM (Windows without privilege). */
function epermSeam() {
  return () => {
    const err = new Error('operation not permitted, symlink');
    err.code = 'EPERM';
    throw err;
  };
}

test('skill symlinked into the target dir with the default seam (POSIX)', () => {
  if (process.platform === 'win32') return;
  const { skillsDir, targetSkillsDir, coreSkill } = setup();
  const out = freshOut();
  const manifest = freshManifest();

  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out);

  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  assert.ok(fs.lstatSync(linkPath).isSymbolicLink(), 'a symlink is created');
  assert.equal(fs.readlinkSync(linkPath), coreSkill);
  assert.ok(out.changed.includes(linkPath));
  assert.deepEqual(
    manifest.entries.filter((e) => e.path === linkPath),
    [{ kind: 'symlink', path: linkPath }]
  );
});

test('EPERM on symlink falls back to copying the folder + records copied-skill', () => {
  const { skillsDir, targetSkillsDir } = setup();
  const out = freshOut();
  const manifest = freshManifest();

  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out, { symlink: epermSeam() });

  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  assert.ok(fs.statSync(linkPath).isDirectory(), 'target is a real directory');
  assert.ok(!fs.lstatSync(linkPath).isSymbolicLink(), 'not a symlink');
  assert.equal(fs.readFileSync(path.join(linkPath, 'SKILL.md'), 'utf8'), '# skill\n', 'SKILL.md present so /wienerdog-* registers');
  assert.ok(out.changed.includes(linkPath));
  assert.deepEqual(
    manifest.entries.filter((e) => e.path === linkPath),
    [{ kind: 'copied-skill', path: linkPath, hash: hashDir(linkPath) }],
    'the copied-skill entry carries the freshly-copied tree fingerprint'
  );
});

test('EACCES on symlink also falls back to copying', () => {
  const { skillsDir, targetSkillsDir } = setup();
  const out = freshOut();
  const manifest = freshManifest();
  const seam = () => {
    const err = new Error('permission denied');
    err.code = 'EACCES';
    throw err;
  };

  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out, { symlink: seam });

  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  assert.ok(fs.statSync(linkPath).isDirectory());
  assert.equal(manifest.entries.filter((e) => e.kind === 'copied-skill' && e.path === linkPath).length, 1);
});

test('a non-permission symlink error is rethrown (not swallowed as a copy)', () => {
  const { skillsDir, targetSkillsDir } = setup();
  const out = freshOut();
  const seam = () => {
    const err = new Error('boom');
    err.code = 'ENOSPC';
    throw err;
  };
  assert.throws(
    () => shared.applySkillLinks(skillsDir, targetSkillsDir, false, freshManifest(), out, { symlink: seam }),
    /boom/
  );
});

test('second run over an existing copy is unchanged and does not grow the manifest', () => {
  const { skillsDir, targetSkillsDir } = setup();
  const manifest = freshManifest();

  // First run copies via the EPERM seam.
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, freshOut(), { symlink: epermSeam() });

  // Second run: the target is now a real dir → refresh branch, seam not called.
  const out = freshOut();
  const seam = () => { throw new Error('seam must not be called on an existing copy'); };
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out, { symlink: seam });

  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  assert.deepEqual(out.changed, []);
  assert.ok(out.unchanged.includes(linkPath));
  assert.equal(
    manifest.entries.filter((e) => e.kind === 'copied-skill' && e.path === linkPath).length,
    1,
    'no duplicate manifest entry'
  );
});

test('changed source content refreshes the copy and bytes match the new source', () => {
  const { skillsDir, targetSkillsDir, coreSkill } = setup();
  const manifest = freshManifest();
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, freshOut(), { symlink: epermSeam() });

  // Bump the source skill content.
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill v2\n');
  const out = freshOut();
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out, { symlink: epermSeam() });

  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  assert.ok(out.changed.includes(linkPath), 'refresh reported as changed');
  assert.equal(fs.readFileSync(path.join(linkPath, 'SKILL.md'), 'utf8'), '# skill v2\n');
  assert.equal(
    manifest.entries.filter((e) => e.kind === 'copied-skill' && e.path === linkPath).length,
    1
  );
});

test('a nested source change is detected and refreshed (dirsEqual walks recursively)', () => {
  const { skillsDir, targetSkillsDir, coreSkill } = setup();
  fs.mkdirSync(path.join(coreSkill, 'sub'));
  fs.writeFileSync(path.join(coreSkill, 'sub', 'ref.md'), 'a\n');
  const manifest = freshManifest();
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, freshOut(), { symlink: epermSeam() });

  fs.writeFileSync(path.join(coreSkill, 'sub', 'ref.md'), 'b\n');
  const out = freshOut();
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out, { symlink: epermSeam() });

  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  assert.ok(out.changed.includes(linkPath));
  assert.equal(fs.readFileSync(path.join(linkPath, 'sub', 'ref.md'), 'utf8'), 'b\n');
});

test('a plain regular file at the target path is left untouched with a notice', () => {
  const { skillsDir, targetSkillsDir } = setup();
  fs.mkdirSync(targetSkillsDir, { recursive: true });
  const userFile = path.join(targetSkillsDir, 'wienerdog-setup');
  fs.writeFileSync(userFile, 'user owns this\n');
  const out = freshOut();
  const manifest = freshManifest();

  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out, { symlink: epermSeam() });

  assert.equal(fs.readFileSync(userFile, 'utf8'), 'user owns this\n');
  assert.ok(out.notices.some((n) => n.includes('wienerdog-setup')));
  assert.equal(manifest.entries.filter((e) => e.path === userFile).length, 0, 'user file is never recorded');
});

test('dry-run records a symlink entry and reports the change without writing', () => {
  const { skillsDir, targetSkillsDir } = setup();
  const out = freshOut();
  const manifest = freshManifest();
  const seam = () => { throw new Error('dry-run must not probe symlink permission'); };

  shared.applySkillLinks(skillsDir, targetSkillsDir, true, manifest, out, { symlink: seam });

  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  assert.equal(fs.existsSync(linkPath), false, 'nothing written on dry-run');
  assert.ok(out.changed.includes(linkPath));
  assert.deepEqual(
    manifest.entries.filter((e) => e.path === linkPath),
    [{ kind: 'symlink', path: linkPath }]
  );
});

test('matching-fingerprint refresh with UNCHANGED source: no write, unchanged, hash re-recorded', () => {
  const { skillsDir, targetSkillsDir } = setup();
  const manifest = freshManifest();
  // First copy records the fingerprint.
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, freshOut(), { symlink: epermSeam() });

  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  const recordedBefore = manifest.entries.find(
    (e) => e.kind === 'copied-skill' && e.path === linkPath
  );
  assert.equal(typeof recordedBefore.hash, 'string');
  const beforeMtime = fs.statSync(path.join(linkPath, 'SKILL.md')).mtimeMs;

  // Second sync: fingerprint matches, source unchanged → no filesystem write.
  const out = freshOut();
  const seam = () => { throw new Error('seam must not be called on an existing copy'); };
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out, { symlink: seam });

  assert.deepEqual(out.changed, []);
  assert.ok(out.unchanged.includes(linkPath));
  assert.equal(fs.statSync(path.join(linkPath, 'SKILL.md')).mtimeMs, beforeMtime, 'no rewrite');
  const recordedAfter = manifest.entries.filter(
    (e) => e.kind === 'copied-skill' && e.path === linkPath
  );
  assert.equal(recordedAfter.length, 1, 'no duplicate entry');
  assert.equal(recordedAfter[0].hash, hashDir(linkPath), 'hash re-recorded idempotently');
});

test('matching-fingerprint refresh with CHANGED source: rmSync+cpSync, changed, new hash re-recorded', () => {
  const { skillsDir, targetSkillsDir, coreSkill } = setup();
  const manifest = freshManifest();
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, freshOut(), { symlink: epermSeam() });

  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  // Bump the packaged source; the copy is left untouched → still fingerprints to recorded.
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill v2\n');

  const out = freshOut();
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out, { symlink: epermSeam() });

  assert.ok(out.changed.includes(linkPath));
  assert.equal(fs.readFileSync(path.join(linkPath, 'SKILL.md'), 'utf8'), '# skill v2\n', 'converged to new source');
  const recorded = manifest.entries.filter(
    (e) => e.kind === 'copied-skill' && e.path === linkPath
  );
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].hash, hashDir(linkPath), 'new source fingerprint re-recorded');
  assert.equal(recorded[0].hash, hashDir(coreSkill), 'matches the packaged source');
});

test('mismatched fingerprint (user edited our copy) → PRESERVED untouched, notice, hash NOT changed', () => {
  const { skillsDir, targetSkillsDir } = setup();
  const manifest = freshManifest();
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, freshOut(), { symlink: epermSeam() });

  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  const recordedHash = manifest.entries.find(
    (e) => e.kind === 'copied-skill' && e.path === linkPath
  ).hash;
  // The user edits our copy — its fingerprint now diverges from what we recorded.
  const userFile = path.join(linkPath, 'USER-NOTES.md');
  fs.writeFileSync(userFile, 'the user added this\n');

  const out = freshOut();
  const seam = () => { throw new Error('seam must not be probed for an existing dir'); };
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out, { symlink: seam });

  // Left byte-for-byte intact: the user's file survives, nothing refreshed.
  assert.equal(fs.readFileSync(userFile, 'utf8'), 'the user added this\n');
  assert.deepEqual(out.changed, []);
  assert.deepEqual(out.unchanged, []);
  assert.ok(out.notices.some((n) => n.includes(linkPath)), 'reported via out.notices');
  const recorded = manifest.entries.filter(
    (e) => e.kind === 'copied-skill' && e.path === linkPath
  );
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].hash, recordedHash, 'recorded hash NOT changed');
});

test('no recorded entry (user pre-existing wienerdog-foo/) → PRESERVED, notice, not adopted', () => {
  const { skillsDir, targetSkillsDir } = setup();
  // A user's own directory sits in the namespace; nothing recorded for it.
  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  fs.mkdirSync(linkPath, { recursive: true });
  fs.writeFileSync(path.join(linkPath, 'user-owned.md'), 'mine\n');
  const out = freshOut();
  const manifest = freshManifest();
  const seam = () => { throw new Error('seam must not be probed for an existing dir'); };

  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out, { symlink: seam });

  assert.equal(fs.readFileSync(path.join(linkPath, 'user-owned.md'), 'utf8'), 'mine\n', 'never rmSync-ed');
  assert.deepEqual(out.changed, []);
  assert.ok(out.notices.some((n) => n.includes(linkPath)));
  assert.equal(
    manifest.entries.filter((e) => e.path === linkPath).length,
    0,
    'a user directory is never adopted into the manifest'
  );
});

test('legacy hash-less copied-skill entry → PRESERVED, notice, never rmSync (unverifiable)', () => {
  const { skillsDir, targetSkillsDir } = setup();
  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  fs.mkdirSync(linkPath, { recursive: true });
  fs.writeFileSync(path.join(linkPath, 'SKILL.md'), '# maybe ours, maybe not\n');
  // A legacy manifest entry from before fingerprints existed — no hash field.
  const manifest = freshManifest();
  manifest.entries.push({ kind: 'copied-skill', path: linkPath });
  const out = freshOut();
  const seam = () => { throw new Error('seam must not be probed for an existing dir'); };

  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out, { symlink: seam });

  assert.equal(
    fs.readFileSync(path.join(linkPath, 'SKILL.md'), 'utf8'),
    '# maybe ours, maybe not\n',
    'a hash-less (unverifiable) entry is preserved, never deleted'
  );
  assert.deepEqual(out.changed, []);
  assert.ok(out.notices.some((n) => n.includes(linkPath)));
  // The legacy entry is left as-is (still hash-less; not adopted with a fresh hash).
  const recorded = manifest.entries.filter((e) => e.kind === 'copied-skill' && e.path === linkPath);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].hash, undefined);
});

test('a pre-existing correct symlink is adopted into the manifest (recorded, reported unchanged)', () => {
  if (process.platform === 'win32') return;
  const { skillsDir, targetSkillsDir, coreSkill } = setup();
  fs.mkdirSync(targetSkillsDir, { recursive: true });
  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  fs.symlinkSync(coreSkill, linkPath);

  const out = freshOut();
  const manifest = freshManifest();
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out);

  assert.ok(out.unchanged.includes(linkPath));
  assert.ok(!out.changed.includes(linkPath));
  assert.deepEqual(
    manifest.entries.filter((e) => e.path === linkPath),
    [{ kind: 'symlink', path: linkPath }]
  );
});

// ── WP-146: foreign-symlink preservation (audit A13) ─────────────────────────

test('a wienerdog-* symlink pointing elsewhere is preserved with a notice, no manifest entry (WP-146)', () => {
  if (process.platform === 'win32') return;
  const { root, skillsDir, targetSkillsDir } = setup();
  const foreignTarget = path.join(root, 'somewhere-else');
  fs.mkdirSync(foreignTarget, { recursive: true });
  fs.mkdirSync(targetSkillsDir, { recursive: true });
  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  fs.symlinkSync(foreignTarget, linkPath);

  const out = freshOut();
  const manifest = freshManifest();
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out);

  assert.equal(fs.readlinkSync(linkPath), foreignTarget, 'still points at the foreign target');
  assert.ok(
    out.notices.some((n) => n.includes('left foreign symlink untouched') && n.includes(foreignTarget) && n.includes(linkPath)),
    'notice names the foreign target and the link path'
  );
  assert.equal(out.changed.length, 0, 'not reported as changed');
  assert.equal(
    manifest.entries.filter((e) => e.kind === 'symlink' && e.path === linkPath).length,
    0,
    'no symlink manifest entry recorded for a link we do not own'
  );
});

test('dry-run also preserves a foreign symlink and still discloses the notice (WP-146)', () => {
  if (process.platform === 'win32') return;
  const { root, skillsDir, targetSkillsDir } = setup();
  const foreignTarget = path.join(root, 'somewhere-else');
  fs.mkdirSync(foreignTarget, { recursive: true });
  fs.mkdirSync(targetSkillsDir, { recursive: true });
  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  fs.symlinkSync(foreignTarget, linkPath);

  const out = freshOut();
  shared.applySkillLinks(skillsDir, targetSkillsDir, true, freshManifest(), out);

  assert.equal(fs.readlinkSync(linkPath), foreignTarget);
  assert.ok(out.notices.some((n) => n.includes('left foreign symlink untouched')));
});

test('a symlink already pointing at our core source is still unchanged + recorded (WP-146 regression guard)', () => {
  if (process.platform === 'win32') return;
  const { skillsDir, targetSkillsDir, coreSkill } = setup();
  fs.mkdirSync(targetSkillsDir, { recursive: true });
  const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');
  fs.symlinkSync(coreSkill, linkPath);

  const out = freshOut();
  const manifest = freshManifest();
  shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out);

  assert.ok(out.unchanged.includes(linkPath));
  assert.equal(manifest.entries.filter((e) => e.kind === 'symlink' && e.path === linkPath).length, 1);
  assert.equal(out.notices.length, 0);
});
