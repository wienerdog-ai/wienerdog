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
}
