'use strict';
// WP-session-start-digest-dedup: the SessionStart hook injects the digest only
// when the managed block of every present harness is not already carrying the
// same bytes (ADR-0039). Drives templates/hooks/session-start.sh as a bash
// subprocess through Table A rows A4-A11 and the Table B path resolutions
// (B4, B6, B8, B10), asserting exit 0 on every case: silence exactly when
// every present harness carries buildBlock(digest), the full envelope on any
// mismatch, absence, ambiguity, oversize, override shadow, or zero harnesses.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The shipped session hooks are POSIX bash — skip the whole file on Windows.
if (process.platform === 'win32') {
  test('session-start dedup suite', { skip: 'POSIX bash hooks; not applicable on win32' }, () => {});
} else {
  const repoRoot = path.join(__dirname, '..', '..');
  const HOOK = path.join(repoRoot, 'templates', 'hooks', 'session-start.sh');
  // AC13/AC14 parity: the expected block ALWAYS comes from the real writer,
  // never from a hand-written literal (the anti-drift gate).
  const shared = require('../../src/adapters/shared');

  const DIGEST_CONTENT = '# Digest\n\n"quotes", back\\slashes and a tab\there.\n';

  // Invoke bash by absolute path so PATH manipulation cannot break the spawn.
  const bashProbe = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' });
  const BASH = (bashProbe.stdout || '').trim() || '/bin/bash';

  /**
   * Fresh isolated world: a fake HOME and a core dir under it with the digest.
   * No harness directory exists until a test creates one.
   * @param {string} [digest] digest.md content
   * @returns {{home: string, core: string, digest: string}}
   */
  function tempWorld(digest = DIGEST_CONTENT) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-dedup-'));
    const core = path.join(home, '.wienerdog');
    fs.mkdirSync(path.join(core, 'state'), { recursive: true });
    fs.writeFileSync(path.join(core, 'state', 'digest.md'), digest);
    return { home, core, digest };
  }

  /**
   * Run the SessionStart hook under a fully controlled env.
   * @param {{home: string, core: string}} world
   * @param {NodeJS.ProcessEnv} [extraEnv]
   * @returns {import('node:child_process').SpawnSyncReturns<string>}
   */
  function runHook(world, extraEnv = {}) {
    return spawnSync(BASH, [HOOK], {
      env: {
        PATH: process.env.PATH || '',
        HOME: world.home,
        WIENERDOG_HOME: world.core,
        ...extraEnv,
      },
      input: '',
      encoding: 'utf8',
      timeout: 15000,
    });
  }

  /** Assert exit 0 and exactly one valid envelope carrying `digest` byte-for-byte. */
  function assertEnvelope(r, digest) {
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout); // throws if not exactly one JSON object
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.equal(parsed.hookSpecificOutput.additionalContext, digest);
  }

  /** Assert exit 0 and empty stdout (the dedup silence). */
  function assertSilence(r) {
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', 'expected silence when every present harness carries the block');
  }

  /** Create the Claude harness dir under HOME; returns its CLAUDE.md path. */
  function claudeDir(world) {
    const dir = path.join(world.home, '.claude');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'CLAUDE.md');
  }

  /** Create the Codex harness dir under HOME; returns its AGENTS.md path. */
  function codexDir(world) {
    const dir = path.join(world.home, '.codex');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'AGENTS.md');
  }

  // ---- AC1 (A5, Claude only): fresh block → silence -------------------------

  test('AC1: Claude present, CLAUDE.md carries buildBlock(digest) → exit 0, empty stdout', () => {
    const world = tempWorld();
    fs.writeFileSync(claudeDir(world), `${shared.buildBlock(world.digest)}\n`);
    assertSilence(runHook(world));
  });

  // ---- AC2 (A6): block from a different digest → envelope -------------------

  test('AC2: CLAUDE.md block built from a different digest → full envelope', () => {
    const world = tempWorld();
    fs.writeFileSync(claudeDir(world), `${shared.buildBlock('# An older digest\n')}\n`);
    assertEnvelope(runHook(world), world.digest);
  });

  // ---- AC3 (A7): content but no sentinel line → envelope ---------------------

  test('AC3: CLAUDE.md has content but no sentinel line → full envelope', () => {
    const world = tempWorld();
    fs.writeFileSync(claudeDir(world), '# My own instructions\n\nNo wienerdog block here.\n');
    assertEnvelope(runHook(world), world.digest);
  });

  // ---- AC4 (A8): harness dir present, target file absent → envelope ----------

  test('AC4: Claude dir present, CLAUDE.md absent → full envelope', () => {
    const world = tempWorld();
    fs.mkdirSync(path.join(world.home, '.claude'), { recursive: true });
    assertEnvelope(runHook(world), world.digest);
  });

  // ---- AC5 (A9): ambiguous sentinels (two correct blocks) → envelope ---------

  test('AC5: CLAUDE.md holds two correct blocks (ambiguous) → full envelope', () => {
    const world = tempWorld();
    const block = shared.buildBlock(world.digest);
    fs.writeFileSync(claudeDir(world), `${block}\n\n${block}\n`);
    assertEnvelope(runHook(world), world.digest);
  });

  // ---- AC6 (A10): target file larger than 4 MiB → envelope, not read ---------

  test('AC6: CLAUDE.md is a correct block padded past 4 MiB → full envelope', () => {
    const world = tempWorld();
    const block = shared.buildBlock(world.digest);
    const padding = `\n${'x'.repeat(4 * 1024 * 1024)}\n`; // pushes size past MAX_TARGET_BYTES
    fs.writeFileSync(claudeDir(world), `${block}\n${padding}`);
    assertEnvelope(runHook(world), world.digest);
  });

  // ---- AC7 (A4): zero harness directories → envelope -------------------------

  test('AC7: no harness directory exists → full envelope', () => {
    const world = tempWorld();
    assertEnvelope(runHook(world), world.digest);
  });

  // ---- AC8 (A5, dual): both harnesses fresh → silence ------------------------

  test('AC8: Claude and Codex both carry buildBlock(digest) → exit 0, empty stdout', () => {
    const world = tempWorld();
    const block = shared.buildBlock(world.digest);
    fs.writeFileSync(claudeDir(world), `${block}\n`);
    fs.writeFileSync(codexDir(world), `${block}\n`);
    assertSilence(runHook(world));
  });

  // ---- AC9 (A6, dual): Claude fresh, Codex stale → envelope ------------------

  test('AC9: Claude fresh, Codex stale → full envelope', () => {
    const world = tempWorld();
    fs.writeFileSync(claudeDir(world), `${shared.buildBlock(world.digest)}\n`);
    fs.writeFileSync(codexDir(world), `${shared.buildBlock('# An older digest\n')}\n`);
    assertEnvelope(runHook(world), world.digest);
  });

  // ---- AC10 (A11): AGENTS.override.md shadows a fresh AGENTS.md → envelope ---

  test('AC10: both fresh but AGENTS.override.md present → full envelope', () => {
    const world = tempWorld();
    const block = shared.buildBlock(world.digest);
    fs.writeFileSync(claudeDir(world), `${block}\n`);
    fs.writeFileSync(codexDir(world), `${block}\n`);
    fs.writeFileSync(path.join(world.home, '.codex', 'AGENTS.override.md'), '# override\n');
    assertEnvelope(runHook(world), world.digest);
  });

  // ---- AC11 (B4/B6): env overrides resolve the way paths.js resolves them ----

  test('AC11: CLAUDE_CONFIG_DIR override holding the fresh block → empty stdout', () => {
    const world = tempWorld();
    const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-dedup-claudedir-'));
    fs.writeFileSync(path.join(custom, 'CLAUDE.md'), `${shared.buildBlock(world.digest)}\n`);
    // No ~/.claude and no ~/.codex under HOME — the override is the only harness.
    assertSilence(runHook(world, { CLAUDE_CONFIG_DIR: custom }));
  });

  test('AC11: CODEX_HOME override holding the fresh block → empty stdout', () => {
    const world = tempWorld();
    const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-dedup-codexhome-'));
    fs.writeFileSync(path.join(custom, 'AGENTS.md'), `${shared.buildBlock(world.digest)}\n`);
    assertSilence(runHook(world, { CODEX_HOME: custom }));
  });

  // ---- AC13 (B10, parity — the anti-drift gate) -------------------------------
  // For each digest shape, writing the REAL buildBlock(digest) into CLAUDE.md
  // must silence the hook. Any divergence between the hook's expectedBlock and
  // shared.buildBlock fails here.

  const PARITY_DIGESTS = [
    ['plain', '# Digest\n\nA plain digest body.\n'],
    ['trailing blank lines', '# Digest\n\nBody.\n\n\n\n'],
    ['full-line begin sentinel', '# Digest\n\n<!-- wienerdog:begin -->\n\nBody.\n'],
    ['full-line end sentinel', '# Digest\n\n  <!-- wienerdog:end -->  \n\nBody.\n'],
    ['CRLF line endings', '# Digest\r\n\r\nBody with CRLF.\r\n'],
    ['non-ASCII text', '# Digest\n\nÁrvíztűrő tükörfúrógép — 日本語 · émoji ✨\n'],
  ];

  for (const [name, digest] of PARITY_DIGESTS) {
    test(`AC13 parity (${name}): buildBlock(digest) in CLAUDE.md → empty stdout`, () => {
      const world = tempWorld(digest);
      fs.writeFileSync(claudeDir(world), `${shared.buildBlock(digest)}\n`);
      assertSilence(runHook(world));
    });
  }

  // ---- AC14 (integration parity): the real writer's append path --------------

  test('AC14: CLAUDE.md written by applyManagedBlock on existing user content → empty stdout', () => {
    const world = tempWorld();
    const mdPath = claudeDir(world);
    // Pre-existing user content WITHOUT a trailing newline exercises the append
    // path's separator logic (sepBefore = "\n\n").
    fs.writeFileSync(mdPath, '# My own notes\n\nKept above the block.');
    const out = { changed: [], unchanged: [] };
    shared.applyManagedBlock(mdPath, world.digest, false, null, out);
    assert.deepEqual(out.changed, [mdPath], 'applyManagedBlock must report the write');
    assertSilence(runHook(world));
  });

  // ===========================================================================
  // WP-hook-doctor-inspection-read-hardening — the hook rows of Tables A and D.
  // Presence taxonomy: present | cleanly absent | doubt, where ONLY a clean
  // ENOENT is absence and every doubt injects. Reads are descriptor-based
  // (open O_RDONLY|O_NONBLOCK|O_NOCTTY → fstat the SAME fd → refuse
  // non-regular → EOF-bounded read). Every potentially-blocking fixture runs
  // the hook as a timeout-bounded child and asserts it did NOT time out.
  // ===========================================================================

  const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
  const SKIP_EACCES = IS_ROOT ? 'EACCES fixtures cannot be produced as root' : false;

  /** The explicit did-not-time-out assertion for blockable paths. */
  function assertNoTimeout(r) {
    assert.equal(r.error, undefined, `hook child errored: ${r.error}`);
    assert.equal(r.signal, null, 'hook child must not be killed by the timeout');
  }

  /** mkfifo(1) — portable on macOS and Linux (Codex-confirmed in the spec). */
  function makeFifo(p) {
    const r = spawnSync('mkfifo', [p], { encoding: 'utf8' });
    assert.equal(r.status, 0, `mkfifo failed: ${r.stderr}`);
  }

  /** Codex harness carrying the fresh block — makes doubt-fixtures non-vacuous:
   *  if the doubted harness were wrongly read as "absent", this fresh harness
   *  alone would silence the hook (the shipped D4 wrong-silence shape). */
  function freshCodex(world) {
    fs.writeFileSync(codexDir(world), `${shared.buildBlock(world.digest)}\n`);
  }

  /** Write the fstat-underreport shim (--require) into the world and return the
   *  env additions that arm it for `target`. Lets any platform exercise the
   *  A-H7 slow tier and the C2a st_size-is-not-a-length contract; on Linux the
   *  procfs rows below exercise the same contract with no shim at all. */
  function underreportEnv(world, target, fakeSize = 0) {
    const shim = path.join(world.home, 'underreport-shim.js');
    fs.writeFileSync(shim, [
      "'use strict';",
      'const fs = require("fs");',
      'const target = process.env.WD_UNDERREPORT_PATH;',
      'if (target) {',
      '  const fakeSize = Number(process.env.WD_UNDERREPORT_SIZE || "0");',
      '  const realOpen = fs.openSync;',
      '  const tracked = new Set();',
      '  fs.openSync = function (p, ...rest) {',
      '    const fd = realOpen.call(fs, p, ...rest);',
      '    try { if (String(p) === target) tracked.add(fd); } catch (e) { /* ignore */ }',
      '    return fd;',
      '  };',
      '  const realFstat = fs.fstatSync;',
      '  fs.fstatSync = function (fd, ...rest) {',
      '    const st = realFstat.call(fs, fd, ...rest);',
      '    if (tracked.has(fd)) Object.defineProperty(st, "size", { value: fakeSize });',
      '    return st;',
      '  };',
      '  const realClose = fs.closeSync;',
      '  fs.closeSync = function (fd) { tracked.delete(fd); return realClose.call(fs, fd); };',
      '}',
      '',
    ].join('\n'));
    return {
      NODE_OPTIONS: `--require ${shim}`,
      WD_UNDERREPORT_PATH: target,
      WD_UNDERREPORT_SIZE: String(fakeSize),
    };
  }

  // ---- AC2 (A-H5, A-H6): non-regular targets inject, promptly ---------------

  test('H-AC2: CLAUDE.md is a FIFO with no writer → envelope, no timeout', () => {
    const world = tempWorld();
    const md = claudeDir(world);
    makeFifo(md);
    const r = runHook(world);
    assertNoTimeout(r);
    assertEnvelope(r, world.digest);
  });

  test('H-AC2: CLAUDE.md is a symlink to a FIFO → envelope, no timeout', () => {
    const world = tempWorld();
    const md = claudeDir(world);
    const fifo = path.join(world.home, 'somewhere.fifo');
    makeFifo(fifo);
    fs.symlinkSync(fifo, md);
    const r = runHook(world);
    assertNoTimeout(r);
    assertEnvelope(r, world.digest);
  });

  test('H-AC2: CLAUDE.md is a directory → envelope', () => {
    const world = tempWorld();
    const md = claudeDir(world);
    fs.mkdirSync(md);
    const r = runHook(world);
    assertNoTimeout(r);
    assertEnvelope(r, world.digest);
  });

  // ---- AC1 (A-H2/A-H3/A-H4; Table D): only a clean ENOENT is absence --------
  // Every fixture pairs the doubted Claude dir with a FRESH Codex harness: on
  // 152ae3a the doubt read as "absent" and the fresh harness silenced the hook
  // (the D4 wrong silence). Injection here is the fix, not the default.

  test('H-AC1 (D-E3): Claude dir stat EACCES + Codex fresh → envelope (the D4 dual-harness wrong silence)', { skip: SKIP_EACCES }, () => {
    const world = tempWorld();
    freshCodex(world);
    const locked = path.join(world.home, 'locked');
    const dir = path.join(locked, 'claude');
    fs.mkdirSync(dir, { recursive: true });
    fs.chmodSync(locked, 0o000);
    try {
      const r = runHook(world, { CLAUDE_CONFIG_DIR: dir });
      assertNoTimeout(r);
      assertEnvelope(r, world.digest);
    } finally {
      fs.chmodSync(locked, 0o700);
    }
  });

  test('H-AC1 (D-E4): Claude dir is a symlink loop (ELOOP) + Codex fresh → envelope', () => {
    const world = tempWorld();
    freshCodex(world);
    const a = path.join(world.home, 'loop-a');
    const b = path.join(world.home, 'loop-b');
    fs.symlinkSync(a, b);
    fs.symlinkSync(b, a);
    const r = runHook(world, { CLAUDE_CONFIG_DIR: a });
    assertNoTimeout(r);
    assertEnvelope(r, world.digest);
  });

  test('H-AC1 (D-E5): Claude dir path under a regular file (ENOTDIR) + Codex fresh → envelope', () => {
    const world = tempWorld();
    freshCodex(world);
    const file = path.join(world.home, 'plain-file');
    fs.writeFileSync(file, 'not a directory\n');
    const r = runHook(world, { CLAUDE_CONFIG_DIR: path.join(file, 'claude') });
    assertNoTimeout(r);
    assertEnvelope(r, world.digest);
  });

  test('H-AC1 (D-E6): Claude dir with a 500-char component (ENAMETOOLONG) + Codex fresh → envelope', () => {
    const world = tempWorld();
    freshCodex(world);
    const long = path.join(world.home, 'x'.repeat(500));
    const r = runHook(world, { CLAUDE_CONFIG_DIR: long });
    assertNoTimeout(r);
    assertEnvelope(r, world.digest);
  });

  test('H-AC1 (A-H4): Claude config path exists but is a regular file + Codex fresh → envelope', () => {
    const world = tempWorld();
    freshCodex(world);
    const file = path.join(world.home, 'claude-config-as-a-file');
    fs.writeFileSync(file, 'exists, but not a directory\n');
    const r = runHook(world, { CLAUDE_CONFIG_DIR: file });
    assertNoTimeout(r);
    assertEnvelope(r, world.digest);
  });

  // ---- AC1 structural (D-E8): the errno taxonomy is the code's, not a list --
  // EMFILE/EIO have no portable deterministic fixture (the spec allows a
  // structural-branch check): assert the shipped payload maps ONLY a clean
  // ENOENT to absence, in BOTH probes, so every unlisted errno falls to doubt.

  test('H-AC1 structural: only a clean ENOENT is absence, in dirState and entryState', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    const absences = src.match(/e && e\.code === "ENOENT" \? "absent" : "doubt"/g) || [];
    assert.equal(absences.length, 2, 'both probes must map only ENOENT to absence');
    assert.match(src, /O_RDONLY \| fs\.constants\.O_NONBLOCK \| fs\.constants\.O_NOCTTY/);
  });

  // ---- AC3 (A-H8): a dangling override symlink still shadows ----------------

  test('H-AC3: AGENTS.override.md is a DANGLING symlink over fresh blocks → envelope', () => {
    const world = tempWorld();
    fs.writeFileSync(claudeDir(world), `${shared.buildBlock(world.digest)}\n`);
    freshCodex(world);
    fs.symlinkSync(
      path.join(world.home, 'no-such-target'),
      path.join(world.home, '.codex', 'AGENTS.override.md')
    );
    const r = runHook(world);
    assertNoTimeout(r);
    assertEnvelope(r, world.digest);
  });

  // ---- AC4 (C3): a symlink to a regular file must keep working --------------

  test('H-AC4: CLAUDE.md is a symlink to a regular file with the fresh block → silence', () => {
    const world = tempWorld();
    const md = claudeDir(world);
    const real = path.join(world.home, 'real-claude.md');
    fs.writeFileSync(real, `${shared.buildBlock(world.digest)}\n`);
    fs.symlinkSync(real, md);
    const r = runHook(world);
    assertNoTimeout(r);
    assertSilence(r);
  });

  test('H-AC4 (C3, digest side): digest.md is a symlink to a regular file → envelope with its content', () => {
    const world = tempWorld();
    const digestPath = path.join(world.core, 'state', 'digest.md');
    const real = path.join(world.home, 'real-digest.md');
    fs.renameSync(digestPath, real);
    fs.symlinkSync(real, digestPath);
    const r = runHook(world);
    assertNoTimeout(r);
    assertEnvelope(r, world.digest);
  });

  // ---- AC5 (A-H10): a digest with no readable content stays silent ----------

  test('H-AC5: digest.md is a FIFO → exit 0, silence, no timeout (A-H10/A-H11)', () => {
    const world = tempWorld();
    const digestPath = path.join(world.core, 'state', 'digest.md');
    fs.rmSync(digestPath);
    makeFifo(digestPath);
    const r = runHook(world);
    assertNoTimeout(r);
    assertSilence(r);
  });

  test('H-AC5: digest.md over the ceiling → exit 0, silence', () => {
    const world = tempWorld();
    const digestPath = path.join(world.core, 'state', 'digest.md');
    fs.writeFileSync(digestPath, 'x'.repeat(4 * 1024 * 1024 + 2));
    const r = runHook(world);
    assertNoTimeout(r);
    assertSilence(r);
  });

  // ---- AC5 (A-H7 slow tier) + AC16 (C2a): st_size is never a length ---------
  // The pair pins the EOF-bounded read: with fstat forced to report size 0,
  // an under-ceiling fresh block still SILENCES (the loop read the real bytes;
  // an st_size-as-length reader would see an empty file and inject), and an
  // actually-over-ceiling file still INJECTS (over-cap emerged from the read,
  // not from st_size — the fast tier cannot have fired at size 0).

  test('H-AC16: fstat underreports CLAUDE.md size as 0, fresh block within ceiling → still silence', () => {
    const world = tempWorld();
    const md = claudeDir(world);
    fs.writeFileSync(md, `${shared.buildBlock(world.digest)}\n`);
    const r = runHook(world, underreportEnv(world, md, 0));
    assertNoTimeout(r);
    assertSilence(r);
  });

  test('H-AC5 slow tier: fstat underreports an over-ceiling CLAUDE.md as 0 → envelope (over-cap found by the read)', () => {
    const world = tempWorld();
    const md = claudeDir(world);
    fs.writeFileSync(md, `${shared.buildBlock(world.digest)}\n${'x'.repeat(4 * 1024 * 1024 + 2)}`);
    const r = runHook(world, underreportEnv(world, md, 0));
    assertNoTimeout(r);
    assertEnvelope(r, world.digest);
  });

  test('H-AC16 (digest side): fstat underreports digest.md size as 0 → envelope still carries the FULL digest', () => {
    const world = tempWorld();
    const digestPath = path.join(world.core, 'state', 'digest.md');
    const r = runHook(world, underreportEnv(world, digestPath, 0));
    assertNoTimeout(r);
    assertEnvelope(r, world.digest); // byte-for-byte, so a truncated read fails
  });

  // ---- AC14/AC16 (Linux): the virtual-regular st_size=0 procfs class --------

  test('H-AC16 procfs (Linux): digest.md → /proc/version (virtual regular, st_size 0) is read to EOF', { skip: process.platform !== 'linux' ? 'procfs is Linux-only' : false }, () => {
    const world = tempWorld();
    const digestPath = path.join(world.core, 'state', 'digest.md');
    fs.rmSync(digestPath);
    fs.symlinkSync('/proc/version', digestPath);
    assert.equal(fs.statSync(digestPath).size, 0, 'fixture: procfs must report st_size 0');
    const content = fs.readFileSync('/proc/version', 'utf8');
    assert.ok(content.length > 0, 'fixture: /proc/version must yield bytes');
    const r = runHook(world);
    assertNoTimeout(r);
    assertEnvelope(r, content);
  });

  test('H-AC14 procfs (Linux): CLAUDE.md → /proc/self/status (virtual regular, st_size 0) as target → envelope', { skip: process.platform !== 'linux' ? 'procfs is Linux-only' : false }, () => {
    const world = tempWorld();
    const md = claudeDir(world);
    fs.symlinkSync('/proc/self/status', md);
    const r = runHook(world);
    assertNoTimeout(r);
    assertEnvelope(r, world.digest);
  });

  // ---- AC17 (C2c/R-A): the descriptor check is the authority ----------------
  // Deterministic R-A window: a `node` wrapper first in PATH swaps the digest
  // for a FIFO AFTER bash's `-f` passed and BEFORE node opens it. The
  // descriptor mechanism must refuse it promptly — exit 0, silence, no hang.

  test('H-AC17: digest passes -f, is swapped for a FIFO before the open → refused by fstat, silence, no timeout', () => {
    const world = tempWorld();
    const digestPath = path.join(world.core, 'state', 'digest.md');
    const bindir = path.join(world.home, 'swapbin');
    fs.mkdirSync(bindir);
    const wrapper = path.join(bindir, 'node');
    fs.writeFileSync(wrapper, [
      '#!/bin/sh',
      '# R-A window, made deterministic: runs between bash -f and the real open.',
      'rm -f "$WD_SWAP_PATH"',
      'mkfifo "$WD_SWAP_PATH"',
      `exec "${process.execPath}" "$@"`,
      '',
    ].join('\n'), { mode: 0o755 });
    const r = runHook(world, {
      PATH: `${bindir}${path.delimiter}${process.env.PATH || ''}`,
      WD_SWAP_PATH: digestPath,
    });
    assertNoTimeout(r);
    assertSilence(r);
    assert.ok(fs.lstatSync(digestPath).isFIFO(), 'fixture: the swap must have happened');
  });

  test('H-AC17 structural: the -f pre-filter is present and the flags carry O_NOCTTY', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /^\[ -f "\$DIGEST" \] \|\| exit 0$/m, 'the -f pre-filter (defense in depth) must be present');
    assert.match(src, /O_NOCTTY/, 'O_NOCTTY must be in the reader flags');
  });
}
