'use strict';

// WP-launcher-refusal-banner — the APP-SIDE half of the banner contract
// (Table B). The launcher owns the write (pinned in tests/unit/launcher.test.js);
// this file pins the read/clear helpers, the A5 private-file membership, and the
// two lifecycle facts that only a real `sync` can demonstrate: a dry run never
// clears the banner (B12) and a real run does (B10) while staying idempotent.
//
// The sync tests reuse the hermetic sync-repoint/sync-digest-quarantine harness:
// temp HOME + WIENERDOG_HOME, WIENERDOG_LOADER_NOOP=1 so nothing spawns
// launchctl/systemctl, harness dirs pointed at absent paths, stdout silenced.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { getPaths } = require('../../src/core/paths');
const manifestLib = require('../../src/core/manifest');
const { A5_PRIVATE_FILE_BASENAMES } = require('../../src/core/private-fs');
const sync = require('../../src/cli/sync');
const {
  REFUSAL_BANNER_FILE,
  refusalBannerPath,
  readRefusalBanner,
  clearRefusalBanner,
} = require('../../src/core/refusal-banner');

// Hermeticity: CI sets XDG_CONFIG_HOME to the real ~/.config, which
// systemdUserDir() prefers over $HOME. Unset it (this file runs in its own
// `node --test` process) so nothing resolves under a real dir.
delete process.env.XDG_CONFIG_HOME;

/** @param {string} c @returns {string} */
function sha256(c) {
  return crypto.createHash('sha256').update(c).digest('hex');
}

/** A bare temp state dir — enough for the read/clear helpers, which only ever
 *  touch `paths.state`. @returns {{state:string}} */
function tempPaths() {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-banner-'));
  return { state };
}

/** Isolated temp core + vault + matching manifest + absent harness dirs. */
function setupSync() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-bannersync-')));
  const vault = path.join(root, 'vault');
  fs.mkdirSync(vault, { recursive: true });
  const env = {
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'wd'),
    CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
    CODEX_HOME: path.join(root, 'absent-codex'),
  };
  const paths = getPaths(env);
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  const cfg = `version: 1\nvault: ${vault}\n`;
  fs.writeFileSync(paths.config, cfg);
  manifestLib.save(paths, {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [
      { kind: 'dir', path: paths.core },
      { kind: 'file', path: paths.config, hash: sha256(cfg) },
    ],
  });
  return { root, env, paths };
}

/** Run sync.run with process.env pointed at the temp core and the loader no-op
 *  set; returns everything it printed. */
async function runSync(env, argv = []) {
  const savedKeys = ['HOME', 'WIENERDOG_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'WIENERDOG_LOADER_NOOP'];
  const saved = Object.fromEntries(savedKeys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, env, { WIENERDOG_LOADER_NOOP: '1' });
  const origWrite = process.stdout.write.bind(process.stdout);
  const origLog = console.log;
  let out = '';
  console.log = (...a) => {
    out += `${a.join(' ')}\n`;
  };
  process.stdout.write = (s) => {
    out += s;
    return true;
  };
  try {
    await sync.run(argv, { interactive: false });
  } finally {
    process.stdout.write = origWrite;
    console.log = origLog;
    for (const k of savedKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
  return out;
}

/** The launcher's exact on-disk shape, written by hand — the app side must never
 *  reach into the launcher to produce one. */
function plantBanner(paths, text = 'wienerdog: refusing to run "--catch-up" — cannot resolve app/current') {
  fs.writeFileSync(refusalBannerPath(paths), `> [!warning] ${text}\n`, { mode: 0o600 });
}

test('refusal-banner: the path is <core>/state/refusal-banner.md (Table B row B1)', () => {
  const paths = tempPaths();
  assert.equal(REFUSAL_BANNER_FILE, 'refusal-banner.md');
  assert.equal(refusalBannerPath(paths), path.join(paths.state, 'refusal-banner.md'));
});

test('refusal-banner: reading an absent banner is the normal case — returns "", never throws', () => {
  assert.equal(readRefusalBanner(tempPaths()), '');
});

test('refusal-banner: reading returns the line with the trailing newline trimmed', () => {
  const paths = tempPaths();
  plantBanner(paths, 'X');
  assert.equal(readRefusalBanner(paths), '> [!warning] X');
});

test('refusal-banner: an empty or unreadable banner reads as ""', () => {
  const paths = tempPaths();
  fs.writeFileSync(refusalBannerPath(paths), '');
  assert.equal(readRefusalBanner(paths), '', 'empty file');
  fs.rmSync(refusalBannerPath(paths));
  fs.mkdirSync(refusalBannerPath(paths)); // EISDIR on read — must not escape
  assert.equal(readRefusalBanner(paths), '', 'unreadable file');
});

test('refusal-banner: clearRefusalBanner removes it and is a no-op when absent (B10, AC-8)', () => {
  const paths = tempPaths();
  plantBanner(paths);
  clearRefusalBanner(paths);
  assert.equal(fs.existsSync(refusalBannerPath(paths)), false, 'removed');
  clearRefusalBanner(paths); // idempotent — a missing file is success
  assert.equal(readRefusalBanner(paths), '');
});

test("refusal-banner: 'refusal-banner.md' is an A5 private file (B13, AC-9)", () => {
  assert.ok(
    A5_PRIVATE_FILE_BASENAMES.includes('refusal-banner.md'),
    'repairPrivateModes/scanPrivateModes must cover the banner'
  );
  assert.equal(
    A5_PRIVATE_FILE_BASENAMES.filter((b) => b === 'refusal-banner.md').length,
    1,
    'registered exactly once'
  );
});

test('refusal-banner: `sync --dry-run` leaves the banner in place (B12, AC-11)', async () => {
  const { env, paths } = setupSync();
  plantBanner(paths);
  await runSync(env, ['--dry-run']);
  assert.equal(readRefusalBanner(paths), '> [!warning] wienerdog: refusing to run "--catch-up" — cannot resolve app/current');
});

test('refusal-banner: a real `sync` clears the banner and stays idempotent (B10, AC-12)', async () => {
  const { env, paths } = setupSync();
  plantBanner(paths);
  await runSync(env);
  assert.equal(fs.existsSync(refusalBannerPath(paths)), false, 'the first sync cleared it');
  const second = await runSync(env);
  assert.match(second, /wienerdog: 0 changed,/, 'the second sync reports zero changes');
  assert.equal(fs.existsSync(refusalBannerPath(paths)), false, 'and the banner stays gone');
});
