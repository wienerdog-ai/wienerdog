'use strict';

// WP-154 [R13/R15/R16] — the EXECUTION-ONLY encapsulation-boundary canary.
//
// The sound closure of the F4 PATH-hijack class is encapsulation, not a
// whole-codebase execution scan: a pinned target is EXECUTED only through
// `spawnPinnedSync`/`spawnPinned`, whose returns never leak a spawnable path and
// whose facade never forwards a raw child/event/error. This canary guards that
// boundary (defense-in-depth), NOT "no function ever returns a path" (loadPins/
// createPins legitimately return pin state as DATA). Each check is
// mutation-sensitive — the mutation it catches is named inline.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const execIdentity = require('../../src/core/exec-identity');
const { getPaths } = require('../../src/core/paths');

const SRC_ROOT = path.resolve(__dirname, '..', '..', 'src');
const EXEC_IDENTITY_FILE = path.join(SRC_ROOT, 'core', 'exec-identity.js');

/** The EXACT path-free, seam-free public exec surface. */
const PUBLIC_EXPORTS = ['createPins', 'loadPins', 'spawnPinnedSync', 'spawnPinned', 'EXEC_PINS_PATH'];

/** The exec-path helpers that MUST stay module-internal (never exported, never
 *  imported by any other module). */
const INTERNAL_HELPERS = [
  'resolvePinnedSpawn',
  'bindInterpreter',
  'resolveExecutable',
  'verifyExecutable',
  'verifyPin',
  'buildPin',
  'probeVersion',
  'readShebang',
  'readPinStore',
];

/** All `.js` files under src/, recursively. @returns {string[]} */
function srcFiles(dir = SRC_ROOT, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) srcFiles(p, acc);
    else if (ent.isFile() && ent.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

// ── (a) exports equal the EXACT path-free list ──────────────────────────────

test('canary: (a) exec-identity public exports are EXACTLY the path-free, seam-free list', () => {
  assert.deepEqual(
    Object.keys(execIdentity).sort(),
    [...PUBLIC_EXPORTS].sort(),
    'the exec-path helpers must not be exported (adding one to module.exports fails this)'
  );
  for (const h of INTERNAL_HELPERS) {
    assert.equal(execIdentity[h], undefined, `${h} must be module-internal (not exported)`);
  }
});

// ── (b) no module OUTSIDE exec-identity.js imports an internal exec-path helper ─

test('canary: (b) no module outside exec-identity.js references an internal exec-path helper', () => {
  const rx = new RegExp(`\\b(${INTERNAL_HELPERS.join('|')})\\b`);
  for (const file of srcFiles()) {
    if (file === EXEC_IDENTITY_FILE) continue;
    const text = fs.readFileSync(file, 'utf8');
    const m = text.match(rx);
    assert.equal(m, null, `${path.relative(SRC_ROOT, file)} references internal helper "${m && m[1]}" — import spawnPinned* instead`);
  }
});

test('canary: (b) every exec-identity require destructures ONLY public exports', () => {
  const rx = /(?:const|let|var)\s*\{([^{}]*?)\}\s*=\s*require\(\s*['"][^'"]*exec-identity['"]\s*\)/g;
  for (const file of srcFiles()) {
    if (file === EXEC_IDENTITY_FILE) continue;
    const text = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = rx.exec(text)) !== null) {
      const names = m[1]
        .split(',')
        .map((s) => s.split(':')[0].trim())
        .filter(Boolean);
      for (const n of names) {
        assert.ok(PUBLIC_EXPORTS.includes(n), `${path.relative(SRC_ROOT, file)} imports "${n}" from exec-identity — not a public export`);
      }
    }
  }
});

// ── (c) no module feeds a pin-state field into a spawn*/exec* call ───────────

test('canary: (c) no spawn*/exec* call is fed a loadPins/createPins pin-state field', () => {
  const spawnCall = /\b(spawn|spawnSync|exec|execFile|execFileSync|execSync)\s*\(/;
  const pinField = /\b(commandPath|installDir)\b|\.realpath\b/;
  for (const file of srcFiles()) {
    if (file === EXEC_IDENTITY_FILE) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (spawnCall.test(line) && pinField.test(line)) {
        assert.fail(`${path.relative(SRC_ROOT, file)}:${i + 1} feeds pin-state into a spawn/exec — pin state is DATA, never a spawn arg`);
      }
    }
  }
});

// ── (d) no public exec-surface function accepts a spawn/exec callback param ──

test('canary: (d) the public exec surface exposes NO spawn/exec callback seam', () => {
  const src = fs.readFileSync(EXEC_IDENTITY_FILE, 'utf8');
  // An injected spawn/exec callback would receive the bound command+args and
  // leak the path (WP-155 "test seam in the public API" class). The real spawn
  // is module-private; opts carries only safe passthroughs.
  assert.doesNotMatch(src, /opts\.(spawnSync|spawn|exec|execFile)\b/, 'no spawn/exec callback is read from opts');
  assert.doesNotMatch(src, /options\.(spawnSync|spawn|exec|execFile)\b/);
  // Behavioral: an injected spawn callback is ignored (never invoked).
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-canary-')));
  try {
    const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
    const git = path.join(bin, 'git');
    fs.writeFileSync(git, '#!/bin/sh\necho ok\n');
    fs.chmodSync(git, 0o755);
    execIdentity.createPins(paths, { env: { PATH: bin }, platform: process.platform });
    let injected = false;
    const spy = () => {
      injected = true;
      return { status: 0, stdout: '', stderr: '' };
    };
    if (process.platform !== 'win32') {
      execIdentity.spawnPinnedSync('git', paths, { env: { PATH: bin }, platform: process.platform, spawnSync: spy, spawn: spy });
      assert.equal(injected, false, 'an injected spawn callback is never invoked — the real spawn is module-private');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── (e/f) returns leak no path; the facade error channel is sanitized ────────

test('canary: (e) spawnPinnedSync/spawnPinned returns carry no spawnfile/spawnargs', { skip: process.platform === 'win32' }, () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-canary-')));
  try {
    const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
    const git = path.join(bin, 'git');
    fs.writeFileSync(git, '#!/bin/sh\necho ok\n');
    fs.chmodSync(git, 0o755);
    const env = { PATH: bin };
    execIdentity.createPins(paths, { env, platform: process.platform });

    const sync = execIdentity.spawnPinnedSync('git', paths, { env, platform: process.platform, encoding: 'utf8' });
    assert.equal('spawnfile' in sync, false);
    assert.equal('spawnargs' in sync, false);

    const facade = execIdentity.spawnPinned('git', paths, { env, platform: process.platform, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal('spawnfile' in facade, false);
    assert.equal('spawnargs' in facade, false);
    facade.kill('SIGKILL');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('canary: (f) the async facade proxies no raw child error — its error payload is sanitized', { skip: process.platform === 'win32' }, async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-canary-')));
  try {
    const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
    const claude = path.join(bin, 'claude');
    fs.writeFileSync(claude, '#!/bin/sh\necho ok\n');
    fs.chmodSync(claude, 0o755);
    const env = { PATH: bin };
    execIdentity.createPins(paths, { env, platform: process.platform });

    const facade = execIdentity.spawnPinned('claude', paths, {
      env,
      platform: process.platform,
      cwd: path.join(root, 'no', 'such', 'dir'), // forces an ENOENT spawn error
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no error event fired')), 8000);
      facade.once('error', (err) => {
        clearTimeout(t);
        try {
          for (const f of ['path', 'spawnargs', 'spawnfile', 'syscall', 'cause']) {
            assert.equal(err[f], undefined, `error payload must not carry .${f}`);
          }
          assert.doesNotMatch(err.message, /\//, 'no path-bearing text');
          assert.match(err.message, /claude/, 'names the exec by its logical name only');
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
