'use strict';

// WP-154 — executable-identity pinning, fail-closed + interpreter-safe.
//
// The exec-path helpers (resolveExecutable/verifyExecutable/probeVersion/
// verifyPin/resolvePinnedSpawn/bindInterpreter) are MODULE-INTERNAL now (R13/
// R15): tests drive them ONLY through the encapsulated public API —
// `createPins` (whose pin fields + notices surface resolve/verify/probe) and
// `spawnPinnedSync`/`spawnPinned` (whose throw-or-spawn behavior surfaces
// verifyPin/bindInterpreter). Every guard below is mutation-sensitive: reverting
// the guard it covers makes the assertion fail (security WP). Marker executables
// prove (by the ABSENCE of a marker file) that a planted interpreter/binary was
// never executed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPins, loadPins, spawnPinnedSync, spawnPinned, EXEC_PINS_PATH } = require('../../src/core/exec-identity');
const { captureClaudeVersion } = require('../../src/cli/run-job');
const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');

const posixOnly = { skip: process.platform === 'win32' };
const platform = process.platform;

/** Isolated temp core. @returns {{paths:import('../../src/core/paths').WienerdogPaths, root:string}} */
function tempPaths() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-execid-')));
  return { paths: getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') }), root };
}

/** A `#!/bin/sh` executable named `name` in `dir` (native /bin/sh interpreter,
 *  which bindInterpreter spawns directly). @returns {string} its path */
function writeExec(dir, name, body = 'exit 0') {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

/** A `#!/usr/bin/env node` executable (bindInterpreter runs it via
 *  process.execPath, never a PATH-resolved node). @returns {string} */
function writeNodeExec(dir, name, body = "process.stdout.write('9.9.9 (node fake)\\n');") {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!/usr/bin/env node\n${body}\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

/** An executable whose shebang PATH-resolves a NON-node interpreter
 *  (`#!/usr/bin/env <interp>`) — bindInterpreter must fail closed on it.
 *  @returns {string} */
function writeEnvShebangExec(dir, name, interp) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!/usr/bin/env ${interp}\necho unreachable\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

/** A "loud" `#!/bin/sh` executable that CREATES `markerPath` when run — its
 *  presence proves execution, its absence proves non-execution. @returns {string} */
function writeLoudExec(dir, name, markerPath) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!/bin/sh\n: > "${markerPath}"\nexit 0\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

/** A bin dir under `root`, mode 0700 (no group/other-writable ancestor). @returns {string} */
function makeBin(root, label) {
  const dir = path.join(root, label);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** Write a valid schema-1 pin store directly (bypasses createPins' own refusal,
 *  so spawnPinnedSync reaches bindInterpreter live). */
function writePinStore(paths, pins) {
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(path.join(paths.state, EXEC_PINS_PATH), JSON.stringify({ schema: 1, pins }), { mode: 0o600 });
}

// ── createPins: resolution + verification + probe surface through pin fields ─

test('exec-identity: createPins records commandPath = first PATH hit and installDir = dirname(realpath)', posixOnly, () => {
  const { paths, root } = tempPaths();
  const binA = makeBin(root, 'binA');
  const binB = makeBin(root, 'binB');
  const versions = makeBin(root, 'versions');
  const target = writeExec(versions, '2.1.214', 'echo "9.9.9"');
  fs.symlinkSync(target, path.join(binA, 'claude')); // symlinked command (auto-update shape)
  writeExec(binB, 'claude', 'echo "later"'); // shadowed — binA wins left-to-right
  writeExec(binA, 'git', 'echo "git version 2.9.0"');

  const r = createPins(paths, { env: { PATH: `${binA}:${binB}` }, platform });
  assert.equal(r.pins.claude.commandPath, path.join(binA, 'claude'), 'first PATH hit, pre-realpath');
  assert.equal(r.pins.claude.installDir, path.dirname(fs.realpathSync(target)), 'dirname of the canonical realpath');
});

test('exec-identity: createPins skips a non-executable PATH entry (execvp semantics)', posixOnly, () => {
  const { paths, root } = tempPaths();
  const binA = makeBin(root, 'binA');
  const binB = makeBin(root, 'binB');
  fs.writeFileSync(path.join(binA, 'claude'), '#!/bin/sh\nexit 0\n'); // mode 0644 — not executable
  writeExec(binB, 'claude', 'echo "9.9.9"');

  const r = createPins(paths, { env: { PATH: `${binA}:${binB}` }, platform });
  assert.equal(r.pins.claude.commandPath, path.join(binB, 'claude'), 'PATH walked past the non-exec file');
});

test('exec-identity: createPins pins claude+git, notices unresolvable codex, 0600 store, manifest once, idempotent', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'claude', 'echo "9.9.9 (Fake Claude)"');
  writeExec(bin, 'git', 'echo "git version 2.99.0"');
  const env = { PATH: bin };
  const manifest = { version: 1, createdAt: 'now', entries: [] };

  const r = createPins(paths, { env, platform, manifest });
  assert.deepEqual(Object.keys(r.pins), ['claude', 'git']);
  assert.equal(r.pins.claude.commandPath, path.join(bin, 'claude'));
  assert.equal(r.pins.claude.version, '9.9.9 (Fake Claude)', 'probeVersion output recorded');
  assert.equal(r.notices.length, 1);
  assert.match(r.notices[0], /codex/);

  const store = path.join(paths.state, EXEC_PINS_PATH);
  assert.equal(fs.statSync(store).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(store, 'utf8')).schema, 1);

  const bytes1 = fs.readFileSync(store);
  createPins(paths, { env, platform, manifest });
  assert.ok(fs.readFileSync(store).equals(bytes1), 'idempotent re-pin is byte-identical (pinnedAt preserved)');
  assert.equal(manifest.entries.filter((e) => e.path === store).length, 1, 'manifest entry recorded once');
});

test('exec-identity: createPins records version "unknown" when the probe exits non-zero', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'claude', 'exit 3'); // valid exec, failing probe
  const r = createPins(paths, { env: { PATH: bin }, platform });
  assert.equal(r.pins.claude.version, 'unknown');
});

test('exec-identity: createPins notices a missing git; dryRun writes nothing', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'claude', 'echo "9.9.9"');
  const dry = createPins(paths, { env: { PATH: bin }, platform, dryRun: true });
  assert.deepEqual(Object.keys(dry.pins), ['claude']);
  assert.ok(dry.notices.some((n) => /git not found on the job PATH/.test(n)));
  assert.equal(fs.existsSync(path.join(paths.state, EXEC_PINS_PATH)), false, 'dry-run never writes');
});

test('exec-identity: createPins REFUSES a verify-failing exec (group/other-writable ancestor) — notice, no pin', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'claude', 'echo "9.9.9"');
  writeExec(bin, 'git', 'echo "git"');
  fs.chmodSync(bin, 0o777); // group/other-writable ancestor — a co-writer could swap the target
  try {
    const r = createPins(paths, { env: { PATH: bin }, platform });
    assert.equal(r.pins.claude, undefined, 'a verify-failing exec is never pinned');
    assert.ok(r.notices.some((n) => /claude/.test(n) && /verification|writable/.test(n)));
  } finally {
    fs.chmodSync(bin, 0o700);
  }
});

test('exec-identity: loadPins returns {} on missing, corrupt, or foreign store', () => {
  const { paths } = tempPaths();
  assert.deepEqual(loadPins(paths), {});
  fs.mkdirSync(paths.state, { recursive: true });
  const store = path.join(paths.state, EXEC_PINS_PATH);
  fs.writeFileSync(store, 'not json');
  assert.deepEqual(loadPins(paths), {});
  fs.writeFileSync(store, JSON.stringify({ schema: 99, pins: { claude: {} } }));
  assert.deepEqual(loadPins(paths), {}, 'a foreign schema is not trusted');
});

// ── spawnPinnedSync: verifyPin drift/self-heal surface (throw vs spawn) ──────

test('exec-identity: spawnPinnedSync runs the pinned exec across a silent auto-update (new file, same install dir)', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const versions = makeBin(root, 'versions');
  const v1 = writeExec(versions, '1.0.0', 'echo v1');
  fs.symlinkSync(v1, path.join(bin, 'claude'));
  const env = { PATH: bin };
  createPins(paths, { env, platform });

  // Auto-update: a NEW version file appears, the command symlink repoints.
  const v2 = writeExec(versions, '2.0.0', 'echo v2; exit 0');
  fs.unlinkSync(path.join(bin, 'claude'));
  fs.symlinkSync(v2, path.join(bin, 'claude'));

  const r = spawnPinnedSync('claude', paths, { env, platform, encoding: 'utf8' });
  assert.equal(r.status, 0, 'the live realpath under the pinned install dir spawns silently');
  assert.match(String(r.stdout), /v2/, 'the LIVE (updated) target ran, never the stored one');
});

test('exec-identity: spawnPinnedSync THROWS the repin message on a changed command path (fake earlier on PATH)', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const evil = makeBin(root, 'evil');
  const marker = path.join(root, 'PWNED');
  writeExec(bin, 'claude', 'echo ok');
  createPins(paths, { env: { PATH: bin }, platform });
  writeLoudExec(evil, 'claude', marker); // planted first on PATH

  assert.throws(
    () => spawnPinnedSync('claude', paths, { env: { PATH: `${evil}:${bin}` }, platform }),
    (err) => err instanceof WienerdogError && /wienerdog sync/.test(err.message) && /claude/.test(err.message)
  );
  assert.equal(fs.existsSync(marker), false, 'the planted claude was NEVER spawned');
});

test('exec-identity: spawnPinnedSync THROWS when the symlink leaves the pinned install dir', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const versions = makeBin(root, 'versions');
  const v1 = writeExec(versions, '1.0.0');
  fs.symlinkSync(v1, path.join(bin, 'claude'));
  const env = { PATH: bin };
  createPins(paths, { env, platform });

  const tmpDir = fs.mkdtempSync('/tmp/wd-execid-out-');
  try {
    const evil = writeExec(tmpDir, 'evil');
    fs.unlinkSync(path.join(bin, 'claude'));
    fs.symlinkSync(evil, path.join(bin, 'claude')); // now resolves OUTSIDE installDir
    assert.throws(() => spawnPinnedSync('claude', paths, { env, platform }), WienerdogError);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('exec-identity: spawnPinnedSync THROWS when the live pinned target fails structural verification', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'git');
  createPins(paths, { env: { PATH: bin }, platform });
  fs.chmodSync(bin, 0o770); // group-writable ancestor of the live target
  try {
    assert.throws(() => spawnPinnedSync('git', paths, { env: { PATH: bin }, platform }), WienerdogError);
  } finally {
    fs.chmodSync(bin, 0o700);
  }
});

// ── Fail-CLOSED store state machine (A1/A1b) ────────────────────────────────

test('exec-identity: (A1) a TAMPERED store (corrupt bytes) makes spawnPinnedSync THROW — never live-resolves', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const marker = path.join(root, 'PWNED');
  writeExec(bin, 'claude', 'echo ok');
  createPins(paths, { env: { PATH: bin }, platform });
  // Corrupt the store, then plant a claude that would live-resolve if it fell open.
  fs.writeFileSync(path.join(paths.state, EXEC_PINS_PATH), '{ this is not json');
  const evil = makeBin(root, 'evil');
  writeLoudExec(evil, 'claude', marker);

  assert.throws(() => spawnPinnedSync('claude', paths, { env: { PATH: `${evil}:${bin}` }, platform }), WienerdogError);
  assert.equal(fs.existsSync(marker), false, 'a corrupt store fails CLOSED — no live resolve of the plant');
});

test('exec-identity: (A1) an UNREADABLE store (chmod 000) makes spawnPinnedSync THROW', { skip: process.platform === 'win32' || process.getuid() === 0 }, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'claude', 'echo ok');
  createPins(paths, { env: { PATH: bin }, platform });
  const store = path.join(paths.state, EXEC_PINS_PATH);
  fs.chmodSync(store, 0o000);
  try {
    assert.throws(() => spawnPinnedSync('claude', paths, { env: { PATH: bin }, platform }), WienerdogError);
  } finally {
    fs.chmodSync(store, 0o600);
  }
});

test('exec-identity: (A1) an ABSENT store + no pin SELF-HEALS — spawnPinnedSync live-resolves and spawns', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'git', 'echo ok; exit 0');
  const r = spawnPinnedSync('git', paths, { env: { PATH: bin }, platform, encoding: 'utf8' });
  assert.equal(r.status, 0, 'genuine first-run self-heal spawns the live-verified resolve');
  // An absent store with an unresolvable name still throws (nothing to spawn).
  assert.throws(() => spawnPinnedSync('claude', paths, { env: { PATH: bin }, platform }), WienerdogError);
});

test('exec-identity: (A1b) an OK store MISSING the requested pin fails CLOSED — never live-resolves a plant', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const marker = path.join(root, 'PWNED');
  // A valid PARTIAL store: git pinned, claude absent (the sync-race shape).
  const gitPath = writeExec(bin, 'git', 'echo git');
  writePinStore(paths, {
    git: { commandPath: gitPath, installDir: bin, version: 'x', pinnedAt: 'x' },
  });
  writeLoudExec(bin, 'claude', marker); // a later-planted claude that digest-matches nothing

  assert.throws(() => spawnPinnedSync('claude', paths, { env: { PATH: bin }, platform }), WienerdogError);
  assert.equal(fs.existsSync(marker), false, 'a present store missing the requested pin does NOT live-resolve the plant');
});

// ── Interpreter binding (A2/R10/R11/R13): node vs non-node vs recursive ──────

test('exec-identity: (A2) a node-shebang pin runs via process.execPath — a planted `node` earlier on PATH is NEVER executed', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const evil = makeBin(root, 'evil');
  const marker = path.join(root, 'NODE_RAN');
  writeNodeExec(bin, 'claude', "process.stdout.write('1.2.3\\n');");
  writeLoudExec(evil, 'node', marker); // planted `node` first on PATH
  const env = { PATH: `${evil}:${bin}` };
  createPins(paths, { env, platform });

  const r = spawnPinnedSync('claude', paths, { env, platform, args: ['--version'], encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(String(r.stdout), /1\.2\.3/, 'the script ran under the real node (process.execPath)');
  assert.equal(fs.existsSync(marker), false, 'the planted `node` was NEVER executed — process.execPath is used');
});

test('exec-identity: (R10) a non-node `#!/usr/bin/env <x>` pin is REFUSED and the planted `<x>` is NEVER executed', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const evil = makeBin(root, 'evil');
  const marker = path.join(root, 'X_RAN');
  const claudePath = writeEnvShebangExec(bin, 'claude', 'wdfakelang');
  writeLoudExec(evil, 'wdfakelang', marker); // planted interpreter first on PATH
  const env = { PATH: `${evil}:${bin}` };
  // createPins would refuse to pin it (see below), so write the store directly to
  // drive the FIRE path (spawnPinnedSync) into bindInterpreter live.
  writePinStore(paths, { claude: { commandPath: claudePath, installDir: bin, version: 'x', pinnedAt: 'x' } });

  assert.throws(() => spawnPinnedSync('claude', paths, { env, platform }), WienerdogError);
  assert.equal(fs.existsSync(marker), false, 'the planted PATH-resolved interpreter was NEVER executed');
});

test('exec-identity: (R13) a RECURSIVE interpreter (absolute interp that is itself a script) is REFUSED, plant never runs', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const interpDir = makeBin(root, 'interp');
  const evil = makeBin(root, 'evil');
  const marker = path.join(root, 'RECURSE_RAN');
  // An absolute interpreter that is ITSELF `#!/usr/bin/env recurselang` — spawning
  // it would recursively PATH-resolve `recurselang`.
  const interp = path.join(interpDir, 'wdinterp');
  fs.writeFileSync(interp, '#!/usr/bin/env recurselang\n');
  fs.chmodSync(interp, 0o755);
  const claudePath = path.join(bin, 'claude');
  fs.writeFileSync(claudePath, `#!${interp}\n`); // absolute non-node interpreter
  fs.chmodSync(claudePath, 0o755);
  writeLoudExec(evil, 'recurselang', marker);
  const env = { PATH: `${evil}:${bin}` };
  writePinStore(paths, { claude: { commandPath: claudePath, installDir: bin, version: 'x', pinnedAt: 'x' } });

  assert.throws(() => spawnPinnedSync('claude', paths, { env, platform }), WienerdogError);
  assert.equal(fs.existsSync(marker), false, 'the recursive interpreter was refused — nothing planted ran');
});

// ── Zero-execution at EVERY pin-creation exec site (R11/R12) ─────────────────

test('exec-identity: (R11) createPins REFUSES a non-node-env-shebang exec WITHOUT executing the planted interpreter', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const evil = makeBin(root, 'evil');
  const marker = path.join(root, 'X_RAN');
  writeEnvShebangExec(bin, 'claude', 'wdfakelang');
  writeLoudExec(evil, 'wdfakelang', marker);
  const env = { PATH: `${evil}:${bin}` };

  const r = createPins(paths, { env, platform });
  assert.equal(r.pins.claude, undefined, 'the unsupported-interpreter exec is refused (never pinned)');
  assert.ok(r.notices.some((n) => /claude/.test(n) && /interpreter/.test(n)));
  assert.equal(fs.existsSync(marker), false, 'createPins never executed the planted interpreter');
});

test('exec-identity: (R11) createPins({dryRun:true}) — the adopt-preflight path — also refuses WITHOUT executing the plant', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const evil = makeBin(root, 'evil');
  const marker = path.join(root, 'X_RAN');
  writeEnvShebangExec(bin, 'claude', 'wdfakelang');
  writeLoudExec(evil, 'wdfakelang', marker);
  const env = { PATH: `${evil}:${bin}` };

  const r = createPins(paths, { env, platform, dryRun: true });
  assert.equal(r.pins.claude, undefined);
  assert.equal(fs.existsSync(marker), false, 'the dry preflight never executed the planted interpreter');
  assert.equal(fs.existsSync(path.join(paths.state, EXEC_PINS_PATH)), false, 'dry-run wrote nothing');
});

// ── Zero-execution at captureClaudeVersion (R12) ────────────────────────────

test('exec-identity: (R12) captureClaudeVersion runs a node-shebang claude via process.execPath — planted `node` NEVER runs', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const evil = makeBin(root, 'evil');
  const marker = path.join(root, 'NODE_RAN');
  writeNodeExec(bin, 'claude', "process.stdout.write('4.5.6 (Claude Code)\\n');");
  writeLoudExec(evil, 'node', marker);
  const env = { PATH: `${evil}:${bin}` };
  createPins(paths, { env, platform });

  const v = captureClaudeVersion(path.join(bin, 'claude'), env, paths);
  assert.match(v, /4\.5\.6/, 'the version was captured via process.execPath');
  assert.equal(fs.existsSync(marker), false, 'the planted `node` was NEVER executed');
});

test('exec-identity: (R12) captureClaudeVersion returns "unknown" for a non-node-env-shebang claude WITHOUT executing the plant', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const evil = makeBin(root, 'evil');
  const marker = path.join(root, 'X_RAN');
  const claudePath = writeEnvShebangExec(bin, 'claude', 'wdfakelang');
  writeLoudExec(evil, 'wdfakelang', marker);
  const env = { PATH: `${evil}:${bin}` };
  writePinStore(paths, { claude: { commandPath: claudePath, installDir: bin, version: 'x', pinnedAt: 'x' } });

  const v = captureClaudeVersion(claudePath, env, paths);
  assert.equal(v, 'unknown', 'the throw is swallowed as unknown — no version, no execution');
  assert.equal(fs.existsSync(marker), false, 'the planted interpreter was NEVER executed');
});

test('exec-identity: (R12) captureClaudeVersion returns "unknown" for a non-claude basename WITHOUT any spawn', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const marker = path.join(root, 'CODEX_RAN');
  writeLoudExec(bin, 'codex', marker);
  const v = captureClaudeVersion(path.join(bin, 'codex'), { PATH: bin }, paths);
  assert.equal(v, 'unknown');
  assert.equal(fs.existsSync(marker), false, 'a non-claude basename is never probed');
});

// ── Sanitized-by-construction facade error channel (R16) ────────────────────

test('exec-identity: (R16) spawnPinned facade emits a SANITIZED error (no .path/.spawnargs/.spawnfile/.syscall/.cause)', posixOnly, async () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'claude', 'echo ok');
  const env = { PATH: bin };
  createPins(paths, { env, platform });

  // Force a spawn failure via an invalid cwd — the RAW child error would carry
  // the pinned realpath in .path/.spawnargs; the facade must not surface it.
  const facade = spawnPinned('claude', paths, {
    env,
    platform,
    cwd: path.join(root, 'no', 'such', 'dir'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no error event fired')), 8000);
    facade.once('error', (err) => {
      clearTimeout(t);
      try {
        assert.ok(err instanceof Error);
        assert.equal(err.path, undefined, 'no .path');
        assert.equal(err.spawnargs, undefined, 'no .spawnargs');
        assert.equal(err.spawnfile, undefined, 'no .spawnfile');
        assert.equal(err.syscall, undefined, 'no .syscall');
        assert.equal(err.cause, undefined, 'no .cause');
        assert.doesNotMatch(err.message, /\//, 'no path-bearing text in the message');
        assert.match(err.message, /claude/, 'names the exec by its logical name only');
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
});

test('exec-identity: (R15) spawnPinnedSync / spawnPinned returns carry NO spawnfile/spawnargs', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'git', 'echo ok');
  const env = { PATH: bin };
  createPins(paths, { env, platform });

  const sync = spawnPinnedSync('git', paths, { env, platform, encoding: 'utf8' });
  assert.deepEqual(Object.keys(sync).sort(), ['signal', 'status', 'stderr', 'stdout'].sort());
  assert.equal('spawnfile' in sync, false);
  assert.equal('spawnargs' in sync, false);

  const facade = spawnPinned('git', paths, { env, platform, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal('spawnfile' in facade, false);
  assert.equal('spawnargs' in facade, false);
  facade.kill('SIGKILL');
});
