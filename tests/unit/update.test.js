'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const https = require('node:https');

const { WienerdogError } = require('../../src/core/errors');
const update = require('../../src/cli/update');

/**
 * Point `getPaths()` (which reads process.env) at a fresh temp core, isolating
 * BOTH HOME and WIENERDOG_HOME. Returns a restore() to undo the env mutation.
 */
function tempHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-update-'));
  const core = path.join(root, 'wd');
  fs.mkdirSync(core, { recursive: true });
  const saved = { HOME: process.env.HOME, WIENERDOG_HOME: process.env.WIENERDOG_HOME };
  process.env.HOME = root;
  process.env.WIENERDOG_HOME = core;
  return {
    root,
    core,
    restore() {
      if (saved.HOME === undefined) delete process.env.HOME; else process.env.HOME = saved.HOME;
      if (saved.WIENERDOG_HOME === undefined) delete process.env.WIENERDOG_HOME; else process.env.WIENERDOG_HOME = saved.WIENERDOG_HOME;
    },
  };
}

/**
 * Build a fixture npm-shaped tarball OFFLINE with system `tar` (no npm pack, no
 * network); entries live under `package/`. Mirrors tarball.test.js.
 * @param {string} version @returns {{tgz:string, integrity:string, binBody:string}}
 */
function buildFixtureTarball(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-fixture-'));
  const pkg = path.join(root, 'pkg');
  const binBody = `// vendored bin ${version}\n`;
  fs.mkdirSync(path.join(pkg, 'package', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(pkg, 'package', 'src'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package', 'bin', 'wienerdog.js'), binBody);
  fs.writeFileSync(path.join(pkg, 'package', 'src', 'x.js'), '// x\n');
  fs.writeFileSync(path.join(pkg, 'package', 'package.json'), JSON.stringify({ name: 'wienerdog', version }));
  const tgz = path.join(root, `wienerdog-${version}.tgz`);
  const r = spawnSync('tar', ['-czf', tgz, '-C', pkg, 'package']);
  assert.equal(r.status, 0, 'fixture tar build succeeds');
  const integrity = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64');
  return { tgz, integrity, binBody };
}

/** Run `fn` with console.log captured; returns the joined stdout lines. */
async function captureLog(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try { await fn(); } finally { console.log = orig; }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// (a) newer available → installs + hands off to the NEW version's bin sync
// ---------------------------------------------------------------------------

test('update: newer version installs and hands off to the new version bin sync', async () => {
  const { core, restore } = tempHome();
  try {
    const { tgz, integrity, binBody } = buildFixtureTarball('0.4.0');
    const calls = [];
    const out = await captureLog(() => update.run([], {
      current: '0.3.1',
      fetchManifest: async () => JSON.stringify({ version: '0.4.0', dist: { integrity } }),
      downloadBuffer: async () => fs.readFileSync(tgz),
      runSync: (bin) => { calls.push(bin); return { status: 0 }; },
    }));

    const expectedBin = path.join(core, 'app', '0.4.0', 'bin', 'wienerdog.js');
    assert.deepEqual(calls, [expectedBin], 'sync spawned from the NEW version bin');
    assert.equal(fs.readFileSync(expectedBin, 'utf8'), binBody, 'new version unpacked');
    assert.match(out, /updating v0\.3\.1 → v0\.4\.0/);
    assert.match(out, /updated to v0\.4\.0/);
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// (b) already current → prints up-to-date; no download, no sync
// ---------------------------------------------------------------------------

test('update: already current prints up-to-date and performs no download or sync', async () => {
  const { restore } = tempHome();
  try {
    let downloaded = false;
    let synced = false;
    const out = await captureLog(() => update.run([], {
      current: '0.4.0',
      fetchManifest: async () => JSON.stringify({ version: '0.4.0', dist: { integrity: 'sha512-AAAA' } }),
      downloadBuffer: async () => { downloaded = true; return Buffer.alloc(0); },
      runSync: () => { synced = true; return { status: 0 }; },
    }));
    assert.match(out, /already up to date \(v0\.4\.0\)/);
    assert.equal(downloaded, false, 'no download when already current');
    assert.equal(synced, false, 'no sync when already current');
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// (c) --dry-run → prints the plan; downloads nothing, syncs nothing
// ---------------------------------------------------------------------------

test('update: --dry-run prints the plan and downloads nothing', async () => {
  const { restore } = tempHome();
  try {
    let downloaded = false;
    let synced = false;
    const { integrity } = buildFixtureTarball('0.4.0');
    const out = await captureLog(() => update.run(['--dry-run'], {
      current: '0.3.1',
      fetchManifest: async () => JSON.stringify({ version: '0.4.0', dist: { integrity } }),
      downloadBuffer: async () => { downloaded = true; return Buffer.alloc(0); },
      runSync: () => { synced = true; return { status: 0 }; },
    }));
    assert.match(out, /--dry-run: no changes made\./);
    assert.equal(downloaded, false, 'dry-run downloads nothing');
    assert.equal(synced, false, 'dry-run syncs nothing');
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// (d) failed handoff sync → WienerdogError mentioning `wienerdog sync`
// ---------------------------------------------------------------------------

test('update: a failed handoff sync throws WienerdogError telling the user to run wienerdog sync', async () => {
  const { restore } = tempHome();
  try {
    const { tgz, integrity } = buildFixtureTarball('0.4.0');
    await captureLog(() => assert.rejects(
      () => update.run([], {
        current: '0.3.1',
        fetchManifest: async () => JSON.stringify({ version: '0.4.0', dist: { integrity } }),
        downloadBuffer: async () => fs.readFileSync(tgz),
        runSync: () => ({ status: 1 }),
      }),
      (e) => e instanceof WienerdogError && /wienerdog sync/.test(e.message),
    ));
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// Hermeticity proof: the injected seams never touch https.get.
// ---------------------------------------------------------------------------

test('update: seam paths never call https.get (hermeticity proof)', async () => {
  const { restore } = tempHome();
  const orig = https.get;
  https.get = () => { throw new Error('network access is forbidden in tests'); };
  try {
    const { tgz, integrity } = buildFixtureTarball('0.4.0');
    await captureLog(() => update.run([], {
      current: '0.3.1',
      fetchManifest: async () => JSON.stringify({ version: '0.4.0', dist: { integrity } }),
      downloadBuffer: async () => fs.readFileSync(tgz),
      runSync: () => ({ status: 0 }),
    }));
  } finally {
    https.get = orig;
    restore();
  }
});
