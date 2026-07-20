'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scaffoldVault } = require('../../src/core/vault');
const { WienerdogError } = require('../../src/core/errors');
const { compareTrees } = require('../helpers/golden');

const goldenDir = path.join(__dirname, '..', 'golden', 'vault-default');

/** @returns {string} a fresh temp dir, never under the real HOME. */
function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** @param {string} dir @returns {string} `git log --oneline` output. */
function gitLog(dir) {
  return execFileSync('git', ['log', '--oneline'], { cwd: dir, encoding: 'utf8' });
}

test('scaffoldVault creates the full tree and matches the golden fixture', async () => {
  const target = tempDir('wd-vault-golden-');
  // WP-155: the WIENERDOG_FAKE_TODAY env seam is deleted; inject the clock via
  // opts.now (a UTC midnight so today() is timezone-independent for the golden).
  const { created, skipped } = await scaffoldVault(target, { now: new Date('2026-01-01T00:00:00Z') });
  assert.equal(skipped.length, 0);
  assert.ok(created.length > 0);

  const { equal, diffs } = compareTrees(target, goldenDir);
  assert.ok(equal, `tree differs from golden fixture:\n${diffs.join('\n')}`);
});

test('scaffoldVault: a set WIENERDOG_FAKE_TODAY has ZERO effect — the injected clock is used (WP-155)', async () => {
  const target = tempDir('wd-vault-noenv-');
  const saved = process.env.WIENERDOG_FAKE_TODAY;
  process.env.WIENERDOG_FAKE_TODAY = '2099-12-31'; // the date the deleted env seam would have used
  try {
    await scaffoldVault(target, { now: new Date('2026-01-01T00:00:00Z') });
  } finally {
    if (saved === undefined) delete process.env.WIENERDOG_FAKE_TODAY;
    else process.env.WIENERDOG_FAKE_TODAY = saved;
  }
  const profile = fs.readFileSync(path.join(target, '06-Identity', 'profile.md'), 'utf8');
  assert.match(profile, /2026-01-01/, 'the injected clock date is used in scaffolded content');
  assert.ok(!profile.includes('2099-12-31'), 'the WIENERDOG_FAKE_TODAY env var is ignored (seam deleted)');
});

test('scaffoldVault initializes a git repo with exactly one commit', async () => {
  const target = tempDir('wd-vault-git-');
  await scaffoldVault(target);
  const log = gitLog(target);
  const commits = log.trim().split('\n').filter(Boolean);
  assert.equal(commits.length, 1);
  assert.match(log, /wienerdog: vault created/);
});

test('a second scaffoldVault run creates nothing and makes no new commit', async () => {
  const target = tempDir('wd-vault-idempotent-');
  await scaffoldVault(target);
  const before = gitLog(target);

  const { created, skipped } = await scaffoldVault(target);
  assert.equal(created.length, 0);
  assert.ok(skipped.length > 0);
  assert.equal(gitLog(target), before);
});

test('a pre-existing file in the target is never overwritten', async () => {
  const target = tempDir('wd-vault-preexisting-');
  fs.mkdirSync(path.join(target, '06-Identity'), { recursive: true });
  fs.writeFileSync(path.join(target, '06-Identity', 'profile.md'), 'my own profile, untouched\n');

  const { created, skipped } = await scaffoldVault(target);
  assert.ok(skipped.includes(path.join(target, '06-Identity', 'profile.md')));
  assert.ok(!created.includes(path.join(target, '06-Identity', 'profile.md')));
  assert.equal(
    fs.readFileSync(path.join(target, '06-Identity', 'profile.md'), 'utf8'),
    'my own profile, untouched\n'
  );
});

test('scaffoldVault records every created file in the manifest as kind vault-file', async () => {
  const target = tempDir('wd-vault-manifest-');
  const manifest = { version: 1, createdAt: new Date().toISOString(), entries: [] };
  const { created } = await scaffoldVault(target, { manifest });
  assert.equal(manifest.entries.length, created.length);
  for (const entry of manifest.entries) {
    assert.equal(entry.kind, 'vault-file');
    assert.ok(created.includes(entry.path));
  }
});

test('scaffoldVault dryRun makes no changes', async () => {
  const target = tempDir('wd-vault-dryrun-');
  const { created, skipped } = await scaffoldVault(target, { dryRun: true });
  assert.ok(created.length > 0);
  assert.equal(skipped.length, 0);
  assert.deepEqual(fs.readdirSync(target), []);
});

test('scaffoldVault throws a WienerdogError when git is not installed', async () => {
  const target = tempDir('wd-vault-nogit-');
  const prevPath = process.env.PATH;
  process.env.PATH = '';
  try {
    await assert.rejects(() => scaffoldVault(target), (err) => {
      assert.ok(err instanceof WienerdogError);
      assert.match(err.message, /git/i);
      return true;
    });
  } finally {
    process.env.PATH = prevPath;
  }
});
