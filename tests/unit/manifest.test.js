'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { getPaths } = require('../../src/core/paths');
const manifestLib = require('../../src/core/manifest');

/** Create a fresh temp core and return its resolved paths. */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-manifest-'));
  const core = path.join(root, 'wd');
  return getPaths({ HOME: root, WIENERDOG_HOME: core });
}

/**
 * Build a realistic install on disk (core + subdirs + config) plus a matching
 * saved manifest, and return the manifest.
 * @param {import('../../src/core/paths').WienerdogPaths} paths
 */
function makeInstall(paths) {
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state);
  fs.mkdirSync(paths.secrets, { mode: 0o700 });
  fs.mkdirSync(paths.logs);
  const content = 'version: 1\n';
  fs.writeFileSync(paths.config, content);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const manifest = { version: 1, createdAt: new Date().toISOString(), entries: [] };
  manifestLib.record(manifest, { kind: 'dir', path: paths.core });
  manifestLib.record(manifest, { kind: 'dir', path: paths.state });
  manifestLib.record(manifest, { kind: 'dir', path: paths.secrets });
  manifestLib.record(manifest, { kind: 'dir', path: paths.logs });
  manifestLib.record(manifest, { kind: 'file', path: paths.config, hash });
  manifestLib.save(paths, manifest);
  return manifest;
}

test('load returns an empty manifest when none exists', () => {
  const paths = tempPaths();
  const manifest = manifestLib.load(paths);
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.entries, []);
});

test('record + save + load round-trips entries', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  const manifest = manifestLib.load(paths);
  manifestLib.record(manifest, { kind: 'dir', path: paths.core });
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);
  assert.equal(reloaded.entries.length, 1);
  assert.deepEqual(reloaded.entries[0], { kind: 'dir', path: paths.core });
});

test('load throws on a corrupted manifest', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.writeFileSync(paths.manifest, '{ not valid json');
  assert.throws(() => manifestLib.load(paths));
});

test('reverse removes all files and empty dirs, leaving nothing', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.equal(fs.existsSync(paths.core), false);
  assert.ok(removed.includes(paths.config));
  assert.ok(removed.includes(paths.core));
  assert.equal(skipped.length, 0);
});

test('reverse dry-run removes nothing but reports would-be removals', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const { removed } = manifestLib.reverse(paths, manifest, { dryRun: true });
  assert.equal(fs.existsSync(paths.core), true);
  assert.equal(fs.existsSync(paths.config), true);
  assert.equal(fs.existsSync(paths.manifest), true);
  assert.ok(removed.includes(paths.config));
  assert.ok(removed.includes(paths.core));
});

test('reverse keeps config.yaml when it was modified since install', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.writeFileSync(paths.config, 'user edited this\n');
  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(skipped.includes(paths.config));
  assert.ok(!removed.includes(paths.config));
  assert.equal(fs.existsSync(paths.config), true);
  // Core dir must remain because config still lives in it.
  assert.equal(fs.existsSync(paths.core), true);
});

test('reverse reports already-gone entries as skipped', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.rmSync(paths.config);
  const { skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(skipped.includes(paths.config));
  // Everything else still cleaned up.
  assert.equal(fs.existsSync(paths.core), false);
});

test('reverse removes a vendored-tree recursively and empties the enclosing core', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // Build a realistic vendored app tree: app/<version>/{bin,...} + a current symlink.
  const app = path.join(paths.core, 'app');
  const versionDir = path.join(app, '0.2.1');
  fs.mkdirSync(path.join(versionDir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(versionDir, 'bin', 'wienerdog.js'), '// vendored\n');
  fs.symlinkSync(versionDir, path.join(app, 'current'));
  manifestLib.record(manifest, { kind: 'vendored-tree', path: app });
  manifestLib.save(paths, manifest);

  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.equal(fs.existsSync(app), false, 'the vendored app tree is removed recursively');
  assert.ok(removed.includes(app));
  // Empties the core so the enclosing core dir is still removed.
  assert.equal(fs.existsSync(paths.core), false);
  assert.ok(removed.includes(paths.core));
  assert.equal(skipped.length, 0);
});

test('reverse skips a vendored-tree entry that is already gone', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const app = path.join(paths.core, 'app');
  manifestLib.record(manifest, { kind: 'vendored-tree', path: app });
  manifestLib.save(paths, manifest);
  const { skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(skipped.includes(app), 'a missing vendored tree is skipped, not an error');
  assert.equal(fs.existsSync(paths.core), false);
});

test('reverse removes a copied-skill recursively and empties the enclosing skills dir', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // Build a realistic copied skill: <claude>/skills/wienerdog-setup/{SKILL.md,sub/ref.md}.
  const skillsDir = path.join(paths.core, 'harness-skills');
  const copied = path.join(skillsDir, 'wienerdog-setup');
  fs.mkdirSync(path.join(copied, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(copied, 'SKILL.md'), '# skill\n');
  fs.writeFileSync(path.join(copied, 'sub', 'ref.md'), 'ref\n');
  manifestLib.record(manifest, { kind: 'dir', path: skillsDir });
  manifestLib.record(manifest, { kind: 'copied-skill', path: copied });
  manifestLib.save(paths, manifest);

  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.equal(fs.existsSync(copied), false, 'the copied skill folder is removed recursively');
  assert.ok(removed.includes(copied));
  // The now-empty skills dir is removed too (copied path in removedSet).
  assert.equal(fs.existsSync(skillsDir), false);
  assert.ok(removed.includes(skillsDir));
  assert.equal(skipped.length, 0);
});

test('reverse skips a copied-skill entry that is already gone', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const copied = path.join(paths.core, 'harness-skills', 'wienerdog-setup');
  manifestLib.record(manifest, { kind: 'copied-skill', path: copied });
  manifestLib.save(paths, manifest);
  const { skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(skipped.includes(copied), 'a missing copied skill is skipped, not an error');
  assert.equal(fs.existsSync(paths.core), false);
});

test('reverse skips unknown entry kinds (forward compat)', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [{ kind: 'settings-entry', path: 'some/config/key' }],
  };
  manifestLib.save(paths, manifest);
  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.deepEqual(removed, []);
  assert.ok(skipped.includes('some/config/key'));
});

test('reverse preserves vault-file/vault-dir entries (never removed, never skipped, no warning)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // A vault living OUTSIDE the core, with seeded notes + an ensured dir.
  const vaultDir = path.join(path.dirname(paths.core), 'vault');
  const daily = path.join(vaultDir, '05-Daily');
  const note = path.join(daily, 'note.md');
  fs.mkdirSync(daily, { recursive: true });
  fs.writeFileSync(note, '# my note\n');
  manifestLib.record(manifest, { kind: 'vault-dir', path: daily });
  manifestLib.record(manifest, { kind: 'vault-file', path: note });
  manifestLib.save(paths, manifest);

  // Capture stderr to prove no unknown-kind warning for a known kind.
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  let result;
  try {
    result = manifestLib.reverse(paths, manifest, {});
  } finally {
    process.stderr.write = origWrite;
  }

  assert.deepEqual(result.preserved.sort(), [daily, note].sort());
  assert.ok(!result.removed.includes(note) && !result.removed.includes(daily));
  assert.ok(!result.skipped.includes(note) && !result.skipped.includes(daily));
  assert.doesNotMatch(err, /unknown manifest entry kind 'vault-file'/);
  assert.doesNotMatch(err, /unknown manifest entry kind 'vault-dir'/);
  // The vault files are left untouched on disk.
  assert.equal(fs.readFileSync(note, 'utf8'), '# my note\n');
  assert.equal(fs.existsSync(daily), true);
});

test('disposeCoreMechanics recursively removes the four subdirs then rmdirs the empty core', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  // Non-empty machine-generated subdirs (untracked runtime artifacts).
  fs.mkdirSync(path.join(paths.state, 'scratch'), { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), '# digest\n');
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.writeFileSync(path.join(paths.logs, 'dream.log'), 'run\n');
  const schedules = path.join(paths.core, 'schedules');
  fs.mkdirSync(schedules, { recursive: true });
  fs.writeFileSync(path.join(schedules, 'wienerdog-dream.xml'), '<Task/>\n');
  fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(paths.secrets, 'google-token.json'), '{}\n');

  const { removed } = manifestLib.disposeCoreMechanics(paths, {});
  assert.ok(removed.includes(paths.state));
  assert.ok(removed.includes(paths.logs));
  assert.ok(removed.includes(schedules));
  assert.ok(removed.includes(paths.secrets));
  assert.ok(removed.includes(paths.core));
  assert.equal(fs.existsSync(paths.core), false);
});

test('disposeCoreMechanics is idempotent — a second run is a no-op', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), '# d\n');
  const first = manifestLib.disposeCoreMechanics(paths, {});
  assert.ok(first.removed.includes(paths.state));
  assert.equal(fs.existsSync(paths.core), false);
  const second = manifestLib.disposeCoreMechanics(paths, {});
  assert.deepEqual(second.removed, []);
});

test('disposeCoreMechanics keeps the core alive when config.yaml remains', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), '# d\n');
  // A kept (user-modified) config.yaml sits in the core root, not a swept subdir.
  fs.writeFileSync(paths.config, 'user edited this\n');
  const { removed } = manifestLib.disposeCoreMechanics(paths, {});
  assert.ok(removed.includes(paths.state));
  assert.ok(!removed.includes(paths.core), 'core kept while config.yaml remains');
  assert.equal(fs.existsSync(paths.core), true);
  assert.equal(fs.existsSync(paths.config), true);
});

test('disposeCoreMechanics skips a mechanics dir that contains the vault (containment guard)', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  // Legacy/hand-edited install: the vault was nested INSIDE state/.
  const nestedVault = path.join(paths.state, 'mynotes');
  fs.mkdirSync(nestedVault, { recursive: true });
  fs.writeFileSync(path.join(nestedVault, 'precious-note.md'), '# precious\n');
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.writeFileSync(path.join(paths.logs, 'run.log'), 'x\n');

  const { removed, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
    vaultPath: nestedVault,
  });
  // state/ (the dir containing the vault) is skipped; logs/ is still swept.
  assert.deepEqual(skippedForVault, [paths.state]);
  assert.ok(!removed.includes(paths.state));
  assert.ok(removed.includes(paths.logs));
  assert.ok(!removed.includes(paths.core), 'core kept alive — it still holds the vault');
  assert.equal(
    fs.readFileSync(path.join(nestedVault, 'precious-note.md'), 'utf8'),
    '# precious\n',
    'the nested vault survives byte-identical'
  );
});

test('disposeCoreMechanics containment guard is realpath-based (symlinked vault path)', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  const nestedVault = path.join(paths.state, 'mynotes');
  fs.mkdirSync(nestedVault, { recursive: true });
  fs.writeFileSync(path.join(nestedVault, 'note.md'), 'n\n');
  // The configured vault path reaches the nested dir through a symlink.
  const link = path.join(path.dirname(paths.core), 'vault-link');
  fs.symlinkSync(nestedVault, link);

  const { skippedForVault } = manifestLib.disposeCoreMechanics(paths, { vaultPath: link });
  assert.deepEqual(skippedForVault, [paths.state], 'symlinked vault path still detected inside state/');
  assert.equal(fs.existsSync(path.join(nestedVault, 'note.md')), true);
});

test('disposeCoreMechanics with a vault safely outside the core sweeps everything (guard inert)', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), '# d\n');
  const outsideVault = path.join(path.dirname(paths.core), 'vault');
  fs.mkdirSync(outsideVault, { recursive: true });

  const { removed, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
    vaultPath: outsideVault,
  });
  assert.deepEqual(skippedForVault, []);
  assert.ok(removed.includes(paths.state));
  assert.ok(removed.includes(paths.core));
  assert.equal(fs.existsSync(paths.core), false);
  assert.equal(fs.existsSync(outsideVault), true);
});

test('disposeCoreMechanics on a symlinked core unlinks the link, keeps the target, never throws', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-manifest-symcore-'));
  const realCore = path.join(root, 'real-core');
  const linkCore = path.join(root, 'wd');
  fs.mkdirSync(path.join(realCore, 'state'), { recursive: true });
  fs.writeFileSync(path.join(realCore, 'state', 'digest.md'), '# d\n');
  fs.symlinkSync(realCore, linkCore);
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: linkCore });

  const { removed } = manifestLib.disposeCoreMechanics(paths, {});
  assert.ok(removed.includes(paths.state), 'mechanics swept through the symlink');
  assert.ok(removed.includes(linkCore), 'the core link itself reported removed');
  assert.equal(fs.lstatSync(realCore).isDirectory(), true, 'the real target dir remains');
  assert.deepEqual(fs.readdirSync(realCore), [], 'target dir was emptied of mechanics');
  assert.equal(fs.existsSync(linkCore), false, 'the symlink was unlinked, not rmdir-crashed');
});

test('disposeCoreMechanics dry-run changes nothing on disk', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), '# d\n');
  fs.mkdirSync(paths.secrets, { recursive: true });
  fs.writeFileSync(path.join(paths.secrets, 'google-token.json'), '{}\n');
  const { removed } = manifestLib.disposeCoreMechanics(paths, { dryRun: true });
  assert.ok(removed.includes(paths.state));
  assert.ok(removed.includes(paths.secrets));
  // Nothing actually deleted; core is non-empty so it is NOT reported removed.
  assert.ok(!removed.includes(paths.core));
  assert.equal(fs.existsSync(paths.state), true);
  assert.equal(fs.existsSync(paths.secrets), true);
  assert.equal(fs.existsSync(paths.core), true);
});
