'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const shared = require('../../src/adapters/shared');

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
    [{ kind: 'copied-skill', path: linkPath }]
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
