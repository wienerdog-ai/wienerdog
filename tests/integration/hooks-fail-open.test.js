'use strict';
// WP-121: fail-open harness for the three shipped session hooks.
// Drives each hook (templates/hooks/*.sh) as a bash subprocess through every
// adverse condition the A6 audit listed and asserts it ALWAYS exits 0 —
// missing HOME, missing/failing node, TOCTOU/unreadable digest, unwritable
// state, malformed and oversized stdin. SessionStart must additionally emit
// either exactly one valid JSON envelope or NOTHING (never a partial one).

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The shipped session hooks are POSIX bash — skip the whole file on Windows.
if (process.platform === 'win32') {
  test('hooks fail-open harness', { skip: 'POSIX bash hooks; not applicable on win32' }, () => {});
} else {
  const repoRoot = path.join(__dirname, '..', '..');
  const hooksDir = path.join(repoRoot, 'templates', 'hooks');
  const SESSION_START = path.join(hooksDir, 'session-start.sh');
  const SESSION_END = path.join(hooksDir, 'session-end.sh');
  const CODEX_END = path.join(hooksDir, 'codex-session-end.sh');
  const QUEUE_HOOKS = [
    { name: 'session-end', hook: SESSION_END, harness: 'claude' },
    { name: 'codex-session-end', hook: CODEX_END, harness: 'codex' },
  ];
  const ALL_HOOKS = [{ name: 'session-start', hook: SESSION_START }, ...QUEUE_HOOKS];

  // OWNER-APPROVED 2026-07-17: stdin bound (1 MB), matching WP-118's MAX_LINE_BYTES.
  const HOOK_STDIN_MAX = 1048576;

  // Invoke bash by absolute path so the tests can point the child's PATH
  // anywhere (e.g. a dir with no node) without breaking the spawn itself.
  const bashProbe = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' });
  const BASH = (bashProbe.stdout || '').trim() || '/bin/bash';

  /** Fresh temp core dir with a state/ subdir (stands in for ~/.wienerdog). */
  function tempCore() {
    const core = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-hookfo-'));
    fs.mkdirSync(path.join(core, 'state'), { recursive: true });
    return core;
  }

  /**
   * Run one hook script under a fully controlled env.
   * @param {string} hook absolute path to the .sh file
   * @param {{env?: NodeJS.ProcessEnv, input?: string, timeout?: number}} [opts]
   * @returns {import('node:child_process').SpawnSyncReturns<string>}
   */
  function runHook(hook, opts = {}) {
    return spawnSync(BASH, [hook], {
      env: opts.env || { PATH: process.env.PATH || '' },
      input: opts.input !== undefined ? opts.input : '',
      encoding: 'utf8',
      timeout: opts.timeout || 15000,
    });
  }

  /** Baseline env: real PATH (node resolvable) + an isolated WIENERDOG_HOME. */
  function baseEnv(core) {
    return { PATH: process.env.PATH || '', HOME: core, WIENERDOG_HOME: core };
  }

  // ---- missing HOME (no HOME, no WIENERDOG_HOME) → exit 0, all three -------

  for (const { name, hook } of ALL_HOOKS) {
    test(`${name}: missing HOME and WIENERDOG_HOME → exit 0`, () => {
      const r = runHook(hook, { env: { PATH: process.env.PATH || '' } });
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    });
  }

  // ---- missing node (PATH without node) → exit 0, all three ----------------

  for (const { name, hook } of ALL_HOOKS) {
    test(`${name}: node unresolvable on PATH → exit 0`, () => {
      const core = tempCore();
      // A digest is present so session-start would otherwise reach the node step.
      fs.writeFileSync(path.join(core, 'state', 'digest.md'), '# digest\n');
      const emptyBin = path.join(core, 'empty-bin');
      fs.mkdirSync(emptyBin);
      const r = runHook(hook, { env: { PATH: emptyBin, HOME: core, WIENERDOG_HOME: core } });
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    });
  }

  // ---- node present but failing (stub earlier on PATH exits 1) → exit 0 ----

  for (const { name, hook } of ALL_HOOKS) {
    test(`${name}: node stub that exits 1 → exit 0`, () => {
      const core = tempCore();
      // session-start only reaches node when a digest exists.
      fs.writeFileSync(path.join(core, 'state', 'digest.md'), '# digest\n');
      const stubBin = path.join(core, 'stub-bin');
      fs.mkdirSync(stubBin);
      const stub = path.join(stubBin, 'node');
      fs.writeFileSync(stub, '#!/bin/sh\nexit 1\n');
      fs.chmodSync(stub, 0o755);
      const env = {
        PATH: `${stubBin}${path.delimiter}${process.env.PATH || ''}`,
        HOME: core,
        WIENERDOG_HOME: core,
      };
      const r = runHook(hook, { env, input: '{}' });
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      if (hook === SESSION_START) {
        assert.equal(r.stdout, '', 'failed node step must emit no partial envelope');
      }
    });
  }

  // ---- SessionStart: TOCTOU / unreadable digest ----------------------------

  test('session-start: digest is a directory (TOCTOU stand-in) → exit 0, empty stdout', () => {
    const core = tempCore();
    fs.mkdirSync(path.join(core, 'state', 'digest.md')); // readFileSync would throw EISDIR
    const r = runHook(SESSION_START, { env: baseEnv(core) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', 'no partial envelope on an unreadable digest');
  });

  test('session-start: digest unreadable (chmod 000) → exit 0, empty stdout', (t) => {
    const core = tempCore();
    const digest = path.join(core, 'state', 'digest.md');
    fs.writeFileSync(digest, '# secret\n');
    fs.chmodSync(digest, 0o000);
    // Root ignores file modes — detect via a probe read and skip gracefully.
    let readable = false;
    try {
      fs.readFileSync(digest);
      readable = true;
    } catch {
      /* expected for non-root */
    }
    if (readable) {
      fs.chmodSync(digest, 0o644);
      t.skip('running as root; chmod 000 is not enforced');
      return;
    }
    const r = runHook(SESSION_START, { env: baseEnv(core) });
    fs.chmodSync(digest, 0o644);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', 'no partial envelope on an unreadable digest');
  });

  // ---- SessionStart: happy path — exactly one valid envelope ---------------

  test('session-start: normal digest → exit 0 and a single valid SessionStart envelope', () => {
    const core = tempCore();
    const content = '# Digest\n\n"quotes", back\\slashes, newlines\nand a tab\there.\n';
    fs.writeFileSync(path.join(core, 'state', 'digest.md'), content);
    const r = runHook(SESSION_START, { env: baseEnv(core) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout); // throws if not exactly one JSON object
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.equal(parsed.hookSpecificOutput.additionalContext, content);
  });

  test('session-start: no digest → exit 0, empty stdout', () => {
    const core = tempCore();
    const r = runHook(SESSION_START, { env: baseEnv(core) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
  });

  test('session-start: WIENERDOG_JOB set → exit 0, empty stdout (job skip preserved)', () => {
    const core = tempCore();
    fs.writeFileSync(path.join(core, 'state', 'digest.md'), '# digest\n');
    const r = runHook(SESSION_START, { env: { ...baseEnv(core), WIENERDOG_JOB: 'dream' } });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
  });

  // ---- queue hooks: unwritable state dir → exit 0 --------------------------

  for (const { name, hook } of QUEUE_HOOKS) {
    test(`${name}: unwritable state dir (chmod 0500) → exit 0`, (t) => {
      const core = tempCore();
      const stateDir = path.join(core, 'state');
      fs.chmodSync(stateDir, 0o500);
      // Root ignores modes — probe-write to detect and relax the assertion.
      let writable = false;
      try {
        fs.writeFileSync(path.join(stateDir, '.probe'), 'x');
        writable = true;
        fs.rmSync(path.join(stateDir, '.probe'));
      } catch {
        /* expected for non-root */
      }
      const r = runHook(hook, { env: baseEnv(core), input: '{"cwd":"/tmp"}' });
      fs.chmodSync(stateDir, 0o755);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      if (writable) {
        t.diagnostic('running as root; unwritable-state assertion relaxed to exit-0 only');
      } else {
        assert.equal(fs.existsSync(path.join(stateDir, 'queue.jsonl')), false);
      }
    });
  }

  // ---- queue hooks: malformed stdin → exit 0, sane queue record ------------

  for (const { name, hook, harness } of QUEUE_HOOKS) {
    test(`${name}: malformed stdin → exit 0, queue absent or null-field record`, () => {
      const core = tempCore();
      const r = runHook(hook, { env: baseEnv(core), input: 'not json{{' });
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const queue = path.join(core, 'state', 'queue.jsonl');
      if (fs.existsSync(queue)) {
        const lines = fs.readFileSync(queue, 'utf8').trim().split('\n');
        assert.equal(lines.length, 1);
        const rec = JSON.parse(lines[0]);
        assert.equal(rec.harness, harness);
        assert.equal(rec.session_path, null);
        assert.equal(rec.cwd, null);
      }
    });
  }

  // ---- queue hooks: oversized stdin is bounded → exit 0 in bounded time ----

  for (const { name, hook } of QUEUE_HOOKS) {
    test(`${name}: oversized stdin (HOOK_STDIN_MAX + 1 bytes) → exit 0 within time bound`, () => {
      const core = tempCore();
      const input = 'x'.repeat(HOOK_STDIN_MAX + 1);
      const started = Date.now();
      const r = runHook(hook, { env: baseEnv(core), input, timeout: 15000 });
      const elapsed = Date.now() - started;
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.ok(elapsed < 10000, `bounded read took ${elapsed}ms`);
    });
  }

  // ---- queue hooks: happy path — well-formed JSON.stringify record ---------

  for (const { name, hook, harness } of QUEUE_HOOKS) {
    test(`${name}: normal hook JSON → exit 0 and one well-formed queue record`, () => {
      const core = tempCore();
      const input = JSON.stringify({
        session_id: 's-1',
        transcript_path: '/tmp/t.jsonl',
        cwd: '/tmp/"quoted" dir',
      });
      const r = runHook(hook, { env: baseEnv(core), input });
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      if (harness === 'codex') {
        assert.equal(r.stdout, '', 'Codex Stop hooks must emit no stdout');
      }
      const lines = fs
        .readFileSync(path.join(core, 'state', 'queue.jsonl'), 'utf8')
        .trim()
        .split('\n');
      assert.equal(lines.length, 1);
      const rec = JSON.parse(lines[0]);
      assert.equal(rec.harness, harness);
      assert.equal(rec.session_path, '/tmp/t.jsonl');
      assert.equal(rec.cwd, '/tmp/"quoted" dir');
      assert.ok(typeof rec.ts === 'string' && !Number.isNaN(Date.parse(rec.ts)));
    });
  }
}
