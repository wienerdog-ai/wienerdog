'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const uc = require('../../src/core/update-check');

/** Build an isolated temp core (no real ~/.wienerdog touched).
 *  @param {string} [configExtra] extra line(s) appended to config.yaml. */
function setup(configExtra = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-update-check-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  fs.mkdirSync(paths.core, { recursive: true });
  fs.writeFileSync(
    paths.config,
    `# Wienerdog configuration\nversion: 1\nvault: null\n${configExtra}`
  );
  return { root, env, paths };
}

/** A temp dir containing an executable `npx` stub. Host-independent. */
function dirWithNpx() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-npx-'));
  const name = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  fs.writeFileSync(path.join(d, name), '#!/bin/sh\nexit 0\n');
  fs.chmodSync(path.join(d, name), 0o755);
  return d;
}

/** A temp dir with NO npx. */
function dirWithoutNpx() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wd-nonpx-'));
}

// -------------------------------------------------------------------------
// isSemver
// -------------------------------------------------------------------------

test('update-check: isSemver accepts valid semver shapes', () => {
  assert.ok(uc.isSemver('0.3.0'));
  assert.ok(uc.isSemver('1.2.3-rc.1'));
  assert.ok(uc.isSemver('1.0.0+build'));
});

test('update-check: isSemver rejects non-semver / injection-shaped / non-string values', () => {
  assert.ok(!uc.isSemver('latest'));
  assert.ok(!uc.isSemver('1.2'));
  assert.ok(!uc.isSemver(''));
  assert.ok(!uc.isSemver('1.2.3; rm -rf'));
  assert.ok(!uc.isSemver(undefined));
  assert.ok(!uc.isSemver(null));
  assert.ok(!uc.isSemver(123));
  assert.ok(!uc.isSemver({}));
  assert.ok(!uc.isSemver('1.2.3'.padEnd(300, '.0')), 'length-guarded');
});

// -------------------------------------------------------------------------
// cmpRelease
// -------------------------------------------------------------------------

test('update-check: cmpRelease compares release cores, ignoring prerelease/build', () => {
  assert.equal(uc.cmpRelease('1.2.3', '1.2.4'), -1);
  assert.equal(uc.cmpRelease('1.3.0', '1.2.9'), 1);
  assert.equal(uc.cmpRelease('1.2.3-rc.1', '1.2.3+build'), 0);
});

// -------------------------------------------------------------------------
// maybeRefresh — success, TTL
// -------------------------------------------------------------------------

test('update-check: maybeRefresh stores a valid latest, stamps last_check, and is a TTL no-op', async () => {
  const { paths } = setup();
  let calls = 0;
  const fetchLatest = async () => { calls += 1; return '9.9.9'; };
  const now = Date.parse('2026-07-04T03:30:00.000Z');

  const first = await uc.maybeRefresh(paths, { fetchLatest, now });
  assert.deepEqual(first, { refreshed: true, latest: '9.9.9' });
  assert.equal(calls, 1);
  const state1 = uc.readState(paths);
  assert.equal(state1.latest, '9.9.9');
  assert.equal(state1.last_check, new Date(now).toISOString());

  // A second call inside the 24h TTL is a no-op: skipped:'fresh', no re-fetch.
  const second = await uc.maybeRefresh(paths, { fetchLatest, now: now + 1000 });
  assert.deepEqual(second, { skipped: 'fresh' });
  assert.equal(calls, 1, 'fetchLatest not called again inside the TTL');
});

test('update-check: maybeRefresh refreshes again once the 24h TTL has elapsed', async () => {
  const { paths } = setup();
  const now = Date.parse('2026-07-04T03:30:00.000Z');
  await uc.maybeRefresh(paths, { fetchLatest: async () => '1.0.0', now });
  const later = now + 24 * 60 * 60 * 1000 + 1;
  const result = await uc.maybeRefresh(paths, { fetchLatest: async () => '1.1.0', now: later });
  assert.deepEqual(result, { refreshed: true, latest: '1.1.0' });
});

// -------------------------------------------------------------------------
// maybeRefresh — failure never throws, but stamps the attempt
// -------------------------------------------------------------------------

test('update-check: maybeRefresh stamps last_check even when the fetch rejects, and never throws', async () => {
  const { paths } = setup();
  const now = Date.parse('2026-07-04T03:30:00.000Z');
  const fetchLatest = async () => { throw new Error('registry unreachable'); };

  const result = await uc.maybeRefresh(paths, { fetchLatest, now });
  assert.deepEqual(result, { skipped: 'error' });
  const state = uc.readState(paths);
  assert.equal(state.last_check, new Date(now).toISOString(), 'attempt stamped despite failure');
  assert.equal(state.latest, undefined, 'no latest stored on failure');
});

// -------------------------------------------------------------------------
// maybeRefresh — opt-out
// -------------------------------------------------------------------------

test('update-check: maybeRefresh returns skipped:disabled and writes nothing when update_check: false', async () => {
  const { paths } = setup('update_check: false\n');
  let called = false;
  const result = await uc.maybeRefresh(paths, { fetchLatest: async () => { called = true; return '9.9.9'; } });
  assert.deepEqual(result, { skipped: 'disabled' });
  assert.equal(called, false, 'fetch never invoked when disabled');
  assert.equal(fs.existsSync(uc.updateCheckPath(paths)), false, 'no state file written');
});

test('update-check: isEnabled defaults true when config is missing or has no update_check line', () => {
  const { paths } = setup();
  assert.equal(uc.isEnabled(paths), true);
  const ghost = getPaths({ HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ghost-')) });
  assert.equal(uc.isEnabled(ghost), true, 'missing config.yaml also defaults to enabled');
});

// -------------------------------------------------------------------------
// Untrusted response — never stored, never rendered
// -------------------------------------------------------------------------

test('update-check: an invalid/injection-shaped fetch result is never stored as latest', async () => {
  const bad = ['latest', '', '1.2.3; rm -rf ~', {}];
  for (const value of bad) {
    const { paths } = setup();
    const result = await uc.maybeRefresh(paths, { fetchLatest: async () => value });
    assert.deepEqual(result, { skipped: 'invalid' });
    const state = uc.readState(paths);
    assert.equal(state.latest, undefined, `not stored: ${JSON.stringify(value)}`);
    assert.equal(uc.renderUpdateLine(paths, '0.1.0'), '', 'no callout rendered from an invalid cache');
  }
});

// -------------------------------------------------------------------------
// getUpdateNotice / renderUpdateLine
// -------------------------------------------------------------------------

test('update-check: renderUpdateLine emits the fixed template only when a strictly-greater semver is cached', async () => {
  const { paths } = setup();
  const now = Date.parse('2026-07-04T03:30:07.101Z');
  await uc.maybeRefresh(paths, { fetchLatest: async () => '0.3.0', now });

  // Command is host-dependent now (npx switch); inject an env with npx present.
  const line = uc.renderUpdateLine(paths, '0.2.1', { PATH: dirWithNpx() });
  assert.equal(
    line,
    '> [!note] A newer Wienerdog is available (0.2.1 → 0.3.0). Update with: npx wienerdog@latest sync'
  );

  const notice = uc.getUpdateNotice(paths, '0.2.1');
  assert.deepEqual(notice, { available: true, current: '0.2.1', latest: '0.3.0' });
});

// -------------------------------------------------------------------------
// npxAvailable / updateCommand / renderUpdateLine command switch (WP-054)
// -------------------------------------------------------------------------

test('update-check: npxAvailable is true when PATH has an executable npx, false otherwise', () => {
  assert.equal(uc.npxAvailable({ PATH: dirWithNpx() }), true);
  assert.equal(uc.npxAvailable({ PATH: dirWithoutNpx() }), false);
  assert.equal(uc.npxAvailable({ PATH: '' }), false, 'empty PATH → false');
});

test('update-check: updateCommand switches on npx presence', () => {
  assert.equal(uc.updateCommand({ PATH: dirWithNpx() }), 'npx wienerdog@latest sync');
  assert.equal(uc.updateCommand({ PATH: dirWithoutNpx() }), 'wienerdog update');
});

test('update-check: renderUpdateLine quotes `wienerdog update` when npx is absent', async () => {
  const { paths } = setup();
  const now = Date.parse('2026-07-04T03:30:07.101Z');
  await uc.maybeRefresh(paths, { fetchLatest: async () => '0.3.0', now });
  const line = uc.renderUpdateLine(paths, '0.2.1', { PATH: dirWithoutNpx() });
  assert.equal(
    line,
    '> [!note] A newer Wienerdog is available (0.2.1 → 0.3.0). Update with: wienerdog update'
  );
});

test('update-check: renderUpdateLine returns \'\' when cached latest <= current', async () => {
  const { paths } = setup();
  await uc.maybeRefresh(paths, { fetchLatest: async () => '0.2.1' });
  assert.equal(uc.renderUpdateLine(paths, '0.2.1'), '', 'equal version: no callout');

  const { paths: paths2 } = setup();
  await uc.maybeRefresh(paths2, { fetchLatest: async () => '0.1.0' });
  assert.equal(uc.renderUpdateLine(paths2, '0.2.1'), '', 'older cached latest: no callout');
});

test('update-check: getUpdateNotice with no cache reports unavailable', () => {
  const { paths } = setup();
  assert.deepEqual(uc.getUpdateNotice(paths, '0.2.1'), { available: false, current: '0.2.1', latest: null });
});

// -------------------------------------------------------------------------
// readState — missing / corrupt
// -------------------------------------------------------------------------

test('update-check: readState returns {} when the state file is missing or corrupt', () => {
  const { paths } = setup();
  assert.deepEqual(uc.readState(paths), {}, 'missing file');
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(uc.updateCheckPath(paths), 'not json{{{');
  assert.deepEqual(uc.readState(paths), {}, 'corrupt file');
});

// -------------------------------------------------------------------------
// Env seam — WIENERDOG_UPDATE_FETCH_CMD (mirrors WIENERDOG_RUNJOB_CMD idiom)
// -------------------------------------------------------------------------

test('update-check: defaultFetchLatest uses WIENERDOG_UPDATE_FETCH_CMD instead of the network', async () => {
  const { root, paths } = setup();
  const script = path.join(root, 'fake-fetch.sh');
  fs.writeFileSync(script, '#!/bin/sh\necho 0.9.9\n');
  fs.chmodSync(script, 0o755);

  const saved = process.env.WIENERDOG_UPDATE_FETCH_CMD;
  process.env.WIENERDOG_UPDATE_FETCH_CMD = script;
  try {
    const result = await uc.maybeRefresh(paths, {}); // no injected fetchLatest: exercises defaultFetchLatest
    assert.deepEqual(result, { refreshed: true, latest: '0.9.9' });
    assert.equal(uc.readState(paths).latest, '0.9.9');
  } finally {
    if (saved === undefined) delete process.env.WIENERDOG_UPDATE_FETCH_CMD;
    else process.env.WIENERDOG_UPDATE_FETCH_CMD = saved;
  }
});

test('update-check: defaultFetchLatest throws when WIENERDOG_UPDATE_FETCH_CMD exits non-zero', async () => {
  const { root } = setup();
  const script = path.join(root, 'fail-fetch.sh');
  fs.writeFileSync(script, '#!/bin/sh\nexit 1\n');
  fs.chmodSync(script, 0o755);

  const saved = process.env.WIENERDOG_UPDATE_FETCH_CMD;
  process.env.WIENERDOG_UPDATE_FETCH_CMD = script;
  try {
    // defaultFetchLatest throws synchronously on the cmd path; wrap so
    // assert.rejects sees a rejected promise rather than a raw throw.
    await assert.rejects(async () => uc.defaultFetchLatest(1000));
  } finally {
    if (saved === undefined) delete process.env.WIENERDOG_UPDATE_FETCH_CMD;
    else process.env.WIENERDOG_UPDATE_FETCH_CMD = saved;
  }
});

// -------------------------------------------------------------------------
// currentVersion / updateCheckPath
// -------------------------------------------------------------------------

test('update-check: currentVersion reads this build\'s package.json version', () => {
  const pkg = require('../../package.json');
  assert.equal(uc.currentVersion(), pkg.version);
});

test('update-check: updateCheckPath is state/update-check.json under the core', () => {
  const { paths } = setup();
  assert.equal(uc.updateCheckPath(paths), path.join(paths.state, 'update-check.json'));
});
