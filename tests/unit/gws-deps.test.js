'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');
const deps = require('../../src/gws/deps');

/** Fresh, isolated temp core. No app/deps dir exists yet. */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-gws-deps-'));
  const core = path.join(root, 'wd');
  return getPaths({ HOME: root, WIENERDOG_HOME: core });
}

/**
 * Write a fake googleapis package at <base>/node_modules/googleapis that
 * resolves and loads, without any network. `which` tags the copy so tests can
 * tell WHICH one the seam loaded.
 * @param {string} base
 * @param {string} which
 */
function plantGoogleapis(base, which) {
  const pkgDir = path.join(base, 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' })
  );
  fs.writeFileSync(
    path.join(pkgDir, 'index.js'),
    `module.exports = { google: { FAKE: true, WHICH: ${JSON.stringify(which)} } };\n`
  );
}

/**
 * Stub installer: mimics a real `npm install --ignore-scripts --prefix <dir>
 * googleapis@…` by writing a fake `node_modules/googleapis` that resolves and
 * loads. Returns {status:0}. Never touches the real registry.
 */
function fakeInstall(dir /*, spec */) {
  plantGoogleapis(dir, 'deps');
  return { status: 0 };
}

/** Write a valid-looking Google token so hasToken()/self-heal see a connected core. */
function plantToken(paths) {
  fs.mkdirSync(paths.secrets, { recursive: true });
  fs.writeFileSync(
    path.join(paths.secrets, 'google-token.json'),
    JSON.stringify({ access_token: 'a', refresh_token: 'r' })
  );
}

/** Plant a CORRUPT googleapis in the deps dir: it RESOLVES (containment guard
 *  passes) but its entry point THROWS on require — the corrupt/partial-install
 *  state (WP-102 broken branch). */
function plantCorruptDeps(paths) {
  const pkgDir = path.join(deps.depsDir(paths), 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' })
  );
  fs.writeFileSync(path.join(pkgDir, 'index.js'), "throw new Error('corrupt googleapis entry point');\n");
}

/**
 * Run one resolution case in a FRESH child process. A single process caches
 * successful resolutions (Module._pathCache keys on request+lookup-paths), so
 * e.g. a decoy resolved before a deps-dir install would falsify a later
 * in-process check. One child per probe = no cache carryover. Hermetic: only
 * loads local files, no network.
 * @param {object} paths
 * @param {'isInstalled'|'loadGoogleapis'} mode
 * @returns {{installed?:boolean, ok?:boolean, which?:string, name?:string, message?:string}}
 */
function probeInChild(paths, mode) {
  const script = `
    'use strict';
    const deps = require(process.env.WD_DEPS_MOD);
    const paths = JSON.parse(process.env.WD_PATHS);
    if (process.env.WD_MODE === 'isInstalled') {
      process.stdout.write(JSON.stringify({ installed: deps.isInstalled(paths) }));
    } else {
      try {
        const g = deps.loadGoogleapis(paths);
        process.stdout.write(JSON.stringify({ ok: true, which: g.google && g.google.WHICH }));
      } catch (e) {
        process.stdout.write(JSON.stringify({ ok: false, name: e.name, message: e.message }));
      }
    }
  `;
  const out = execFileSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      WD_DEPS_MOD: path.join(__dirname, '..', '..', 'src', 'gws', 'deps.js'),
      WD_PATHS: JSON.stringify(paths),
      WD_MODE: mode,
    },
  });
  return JSON.parse(out);
}

test('depsDir is <core>/app/deps', () => {
  const paths = tempPaths();
  assert.equal(deps.depsDir(paths), path.join(paths.core, 'app', 'deps'));
});

test('isInstalled is false on an empty core, true after a (fake) install', () => {
  const paths = tempPaths();
  assert.equal(deps.isInstalled(paths), false);
  fakeInstall(deps.depsDir(paths));
  assert.equal(deps.isInstalled(paths), true);
});

test('loadGoogleapis throws the plain setup error (not MODULE_NOT_FOUND) when absent', () => {
  const paths = tempPaths();
  assert.throws(
    () => deps.loadGoogleapis(paths),
    (err) =>
      err instanceof WienerdogError &&
      /Google isn't set up yet — run \/wienerdog-google-setup/.test(err.message) &&
      !/MODULE_NOT_FOUND/.test(err.message)
  );
});

test('loadGoogleapis resolves googleapis from the deps dir once present', () => {
  const paths = tempPaths();
  fakeInstall(deps.depsDir(paths));
  const g = deps.loadGoogleapis(paths);
  assert.equal(g.google.FAKE, true);
});

test('ensureGoogleapis is a no-op when already installed', async () => {
  const paths = tempPaths();
  fakeInstall(deps.depsDir(paths));
  let ran = false;
  const res = await deps.ensureGoogleapis(paths, {
    confirm: async () => true,
    runInstall: () => {
      ran = true;
      return { status: 0 };
    },
  });
  assert.deepEqual(res, { installed: false, already: true });
  assert.equal(ran, false, 'installer must not run when already installed');
});

test('ensureGoogleapis on consent-yes runs the injected installer and reports installed', async () => {
  const paths = tempPaths();
  let sawDir;
  let sawSpec;
  const res = await deps.ensureGoogleapis(paths, {
    confirm: async () => true,
    runInstall: (dir, spec) => {
      sawDir = dir;
      sawSpec = spec;
      return fakeInstall(dir, spec);
    },
  });
  assert.deepEqual(res, { installed: true });
  assert.equal(sawDir, deps.depsDir(paths));
  assert.equal(sawSpec, deps.GOOGLEAPIS_SPEC);
  assert.equal(deps.isInstalled(paths), true);
});

test('ensureGoogleapis with opts.yes skips the prompt and installs', async () => {
  const paths = tempPaths();
  let asked = false;
  const res = await deps.ensureGoogleapis(paths, {
    yes: true,
    confirm: async () => {
      asked = true;
      return false;
    },
    runInstall: fakeInstall,
  });
  assert.deepEqual(res, { installed: true });
  assert.equal(asked, false, 'opts.yes must not prompt');
});

test('ensureGoogleapis on consent-no throws with the exact npm install command', async () => {
  const paths = tempPaths();
  let ran = false;
  await assert.rejects(
    () =>
      deps.ensureGoogleapis(paths, {
        confirm: async () => false,
        runInstall: () => {
          ran = true;
          return { status: 0 };
        },
      }),
    (err) =>
      err instanceof WienerdogError &&
      err.message.includes(
        `npm install --ignore-scripts --prefix "${deps.depsDir(paths)}" ${deps.GOOGLEAPIS_SPEC}`
      )
  );
  assert.equal(ran, false, 'installer must not run when consent is declined');
  assert.equal(deps.isInstalled(paths), false);
});

test('ensureGoogleapis surfaces a non-zero installer status with the command', async () => {
  const paths = tempPaths();
  await assert.rejects(
    () =>
      deps.ensureGoogleapis(paths, {
        confirm: async () => true,
        runInstall: () => ({ status: 1 }),
      }),
    (err) =>
      err instanceof WienerdogError &&
      err.message.includes(
        `npm install --ignore-scripts --prefix "${deps.depsDir(paths)}" ${deps.GOOGLEAPIS_SPEC}`
      )
  );
});

test('containment guard: an ancestor-node_modules decoy does not count as installed', () => {
  const paths = tempPaths();
  // Decoy planted in an ancestor of <core>/app/deps (the temp root itself, an
  // ancestor Node's resolver walks). Deps dir stays absent/empty.
  plantGoogleapis(paths.home, 'decoy');

  assert.deepEqual(probeInChild(paths, 'isInstalled'), { installed: false });

  const load = probeInChild(paths, 'loadGoogleapis');
  assert.equal(load.ok, false);
  assert.equal(load.name, 'WienerdogError');
  assert.match(load.message, /Google isn't set up yet — run \/wienerdog-google-setup/);
  assert.doesNotMatch(load.message, /MODULE_NOT_FOUND/);
});

test('containment guard: the deps-dir copy is loaded even when an ancestor decoy exists', () => {
  const paths = tempPaths();
  plantGoogleapis(paths.home, 'decoy');
  fakeInstall(deps.depsDir(paths));

  assert.deepEqual(probeInChild(paths, 'isInstalled'), { installed: true });

  const load = probeInChild(paths, 'loadGoogleapis');
  assert.equal(load.ok, true);
  assert.equal(load.which, 'deps', 'must load the deps-dir copy, not the decoy');
});

test('loadGoogleapis with a token present + deps absent throws the "client library" message', () => {
  const paths = tempPaths();
  plantToken(paths);
  assert.throws(
    () => deps.loadGoogleapis(paths),
    (err) =>
      err instanceof WienerdogError &&
      /Google is connected, but its client library needs a one-time install/.test(err.message) &&
      /will offer to install it/.test(err.message) &&
      err.message.includes(
        `npm install --ignore-scripts --prefix "${deps.depsDir(paths)}" ${deps.GOOGLEAPIS_SPEC}`
      ) &&
      !/\/wienerdog-google-setup/.test(err.message) &&
      !/gws auth/.test(err.message) &&
      !/no browser/i.test(err.message) &&
      !/MODULE_NOT_FOUND/.test(err.message)
  );
});

test('loadGoogleapis with a token present + a corrupt (resolvable-but-unloadable) install throws the "broken" message; delete-then-reinstall repairs it', () => {
  const paths = tempPaths();
  plantToken(paths);
  plantCorruptDeps(paths);
  assert.throws(
    () => deps.loadGoogleapis(paths),
    (err) =>
      err instanceof WienerdogError &&
      /Google is connected, but its client library is broken \(installed but not loadable\)/.test(
        err.message
      ) &&
      /delete the folder/.test(err.message) &&
      err.message.includes(deps.depsDir(paths)) &&
      err.message.includes(
        `npm install --ignore-scripts --prefix "${deps.depsDir(paths)}" ${deps.GOOGLEAPIS_SPEC}`
      ) &&
      !/will offer to install/.test(err.message) &&
      !/\/wienerdog-google-setup/.test(err.message) &&
      !/gws auth/.test(err.message)
  );
  // Execute the prescribed repair flow: delete the deps folder, then reinstall.
  // The fake install seam proves the FLOW SHAPE (remove → reinstall → loadable);
  // real npm's metadata-vs-content no-op behavior is out of unit-test reach —
  // the delete-first instruction exists precisely to defeat it. (Node does not
  // cache a module that throws at load, so this runs in-process.)
  fs.rmSync(deps.depsDir(paths), { recursive: true, force: true });
  fakeInstall(deps.depsDir(paths));
  const g = deps.loadGoogleapis(paths);
  assert.equal(g.google.FAKE, true);
});

test('ensureGoogleReady with a token present + deps absent + consent-yes installs', async () => {
  const paths = tempPaths();
  plantToken(paths);
  let ran = false;
  await deps.ensureGoogleReady(paths, {
    confirm: async () => true,
    runInstall: (dir, spec) => {
      ran = true;
      return fakeInstall(dir, spec);
    },
  });
  assert.equal(ran, true, 'the injected installer must run');
  assert.equal(deps.isInstalled(paths), true);
});

test('ensureGoogleReady on consent-no throws the exact npm command and installs nothing', async () => {
  const paths = tempPaths();
  plantToken(paths);
  let ran = false;
  await assert.rejects(
    () =>
      deps.ensureGoogleReady(paths, {
        confirm: async () => false,
        runInstall: () => {
          ran = true;
          return { status: 0 };
        },
      }),
    (err) =>
      err instanceof WienerdogError &&
      err.message.includes(
        `npm install --ignore-scripts --prefix "${deps.depsDir(paths)}" ${deps.GOOGLEAPIS_SPEC}`
      )
  );
  assert.equal(ran, false, 'installer must not run when consent is declined');
  assert.equal(deps.isInstalled(paths), false);
});

test('ensureGoogleReady with NO token is a no-op (unauthed path unchanged)', async () => {
  const paths = tempPaths();
  let ran = false;
  const res = await deps.ensureGoogleReady(paths, {
    confirm: async () => true,
    runInstall: () => {
      ran = true;
      return { status: 0 };
    },
  });
  assert.equal(res, undefined);
  assert.equal(ran, false, 'installer must not run for an unauthed user');
  assert.equal(deps.isInstalled(paths), false);
});

test('ensureGoogleReady is a no-op when googleapis is already installed', async () => {
  const paths = tempPaths();
  plantToken(paths);
  fakeInstall(deps.depsDir(paths));
  let ran = false;
  await deps.ensureGoogleReady(paths, {
    confirm: async () => true,
    runInstall: () => {
      ran = true;
      return { status: 0 };
    },
  });
  assert.equal(ran, false, 'installer must not run when already installed');
});

test('ensureGoogleReady with opts.yes installs without prompting', async () => {
  const paths = tempPaths();
  plantToken(paths);
  let asked = false;
  await deps.ensureGoogleReady(paths, {
    yes: true,
    confirm: async () => {
      asked = true;
      return false;
    },
    runInstall: fakeInstall,
  });
  assert.equal(asked, false, 'opts.yes must not prompt');
  assert.equal(deps.isInstalled(paths), true);
});

test('ensureGoogleapis passes { defaultYes: true } to confirm (Enter accepts)', async () => {
  const paths = tempPaths();
  let seenQ, seenOpts;
  await deps.ensureGoogleapis(paths, {
    confirm: async (q, opts) => {
      seenQ = q;
      seenOpts = opts;
      return true;
    },
    runInstall: fakeInstall,
  });
  assert.equal(seenQ, 'Install it now? [Y/n] ');
  assert.deepEqual(seenOpts, { defaultYes: true });
  assert.equal(deps.isInstalled(paths), true, 'the install must have run');
});

test('GOOGLEAPIS_SPEC tracks package.json googleapis major', () => {
  const pkg = require('../../package.json');
  const range = pkg.dependencies.googleapis; // e.g. "^173.0.0"
  const major = range.replace(/[^\d]*(\d+).*/, '$1');
  assert.equal(deps.GOOGLEAPIS_SPEC, `googleapis@^${major}`);
});
