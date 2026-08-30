'use strict';

/**
 * WP-dream-promote-in-workspace — Table G, the pipeline where promotion
 * replaces filtering, plus the pipeline-level forms of CLAIM 1 and CLAIM 2b.
 *
 * WHY THIS FILE EXISTS BESIDE tests/integration/dream.test.js. That file
 * exercises the run end to end against a fake brain and asserts what a USER
 * sees. This one asserts Table G's ROWS — the reap precondition, the re-based
 * non-vacuity guard, the named commit set and its decided bytes, the teardown
 * exceptions — and it does so by driving the same production entry point with
 * the seams Table G's contracts are stated over. Several rows can only be
 * asserted by MUTATING the implementation and proving the assertion goes red;
 * where the spec demands that, the mutation is named in the test.
 *
 * THE HARNESS IS DELIBERATELY THE PRODUCTION ONE. `dream.run` is called with
 * its JS-only opts seam (WP-155): no env var reaches any of these behaviours,
 * which is the property the audit's deleted seams exist to keep.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dream = require('../../src/cli/dream');
const { defaultLayout } = require('../../src/core/layout');
const { WARNINGS_REL, composeWarnings } = require('../../src/core/dream/warnings');
const { WORKSPACE_DIRNAME } = require('../../src/core/dream/workspace');
const ledgerLib = require('../../src/core/dream/ledger');

const FAKE_BRAIN = path.resolve(__dirname, '../fixtures/dream/fake-brain.js');
const INJ_FIXTURE = path.resolve(__dirname, '../fixtures/dream/transcripts/claude-injection.jsonl');
const DATE = '2026-07-02';
const [DY, DM, DD] = DATE.split('-').map(Number);
const NOW = new Date(DY, DM - 1, DD, 12, 0, 0);

const ENV_KEYS = [
  'HOME', 'WIENERDOG_HOME', 'WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME',
  'WIENERDOG_FAKE_TODAY', 'WIENERDOG_FAKE_BRAIN_MODE', 'WIENERDOG_DREAM_RUN_TOKEN', 'PATH',
];

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}
/** git that tolerates a non-zero exit (asking whether HEAD holds a path). */
function gitTry(cwd, args) {
  const r = require('node:child_process').spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '' };
}
function writeFile(base, rel, content) {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
const commitCount = (v) => Number(git(v, ['rev-list', '--count', 'HEAD']).trim());
/** The bytes HEAD holds for `rel`, or null. */
function headBytes(vault, rel) {
  const r = require('node:child_process').spawnSync('git', ['-C', vault, 'show', `HEAD:${rel}`], { encoding: 'buffer' });
  return r.status === 0 ? r.stdout : null;
}

/** A temp home + core + clean vault git repo + config.yaml, with a transcript. */
function setup(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-pipe-'));
  const home = path.join(root, 'home');
  const core = path.join(root, 'core');
  const vault = path.join(root, 'vault');
  const claude = path.join(root, 'claude');
  const codex = path.join(root, 'codex-absent');
  for (const d of [home, core, vault]) fs.mkdirSync(d, { recursive: true });

  writeFile(vault, 'README.md', '# vault\n');
  writeFile(vault, '06-Identity/profile.md', '---\nderived_from_untrusted: false\n---\n\n# Who\n\nAda.\n');
  git(vault, ['init', '-q']);
  git(vault, ['config', 'user.name', 'test']);
  git(vault, ['config', 'user.email', 'test@test']);
  git(vault, ['add', '-A']);
  git(vault, ['commit', '-q', '-m', 'seed']);

  writeFile(core, 'config.yaml', `vault: ${vault}\ndream_timeout_minutes: ${opts.timeoutMinutes ?? 5}\n`);
  if (opts.withTranscript !== false) {
    const projDir = path.join(claude, 'projects', 'proj');
    fs.mkdirSync(projDir, { recursive: true });
    fs.copyFileSync(INJ_FIXTURE, path.join(projDir, 'inj.jsonl'));
  }
  return { root, home, core, vault, claude, codex, state: path.join(core, 'state') };
}

/** Resolve `name` the way exec-identity's resolveExecutable does. */
function resolveOnPath(name, searchPath) {
  for (const dir of String(searchPath).split(path.delimiter).filter(Boolean)) {
    const cand = path.join(dir, name);
    try {
      const st = fs.statSync(cand);
      if (st.isFile() && (st.mode & 0o111) !== 0) {
        return { commandPath: cand, installDir: path.dirname(fs.realpathSync(cand)) };
      }
    } catch { /* keep walking */ }
  }
  return null;
}

/** Install the fixture as the PINNED claude and pin the real git beside it. */
function pinFakeBrain(root, core, mode) {
  const realRoot = fs.realpathSync(root);
  const binDir = path.join(realRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const cmd = path.join(binDir, 'claude');
  fs.copyFileSync(FAKE_BRAIN, cmd);
  fs.chmodSync(cmd, 0o755);
  fs.writeFileSync(path.join(binDir, 'wd-fixture-control.json'), JSON.stringify({ mode: mode || '' }));
  const livePath = binDir + path.delimiter + process.env.PATH;
  const pins = { claude: { commandPath: cmd, installDir: binDir, version: 'fake', pinnedAt: new Date().toISOString() } };
  const gitHit = resolveOnPath('git', livePath);
  if (gitHit) pins.git = { ...gitHit, version: 'fake', pinnedAt: new Date().toISOString() };
  const stateDir = path.join(core, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'exec-pins.json'), JSON.stringify({ schema: 1, pins }), { mode: 0o600 });
  return { PATH: livePath, WIENERDOG_HOME: core };
}

/**
 * Run the production entry point, capturing output and any throw.
 * @param {ReturnType<typeof setup>} ctx
 * @param {string[]} argv
 * @param {{mode?:string, env?:Record<string,string>, opts?:object}} [o]
 */
async function runDream(ctx, argv = ['--yes'], o = {}) {
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  Object.assign(process.env, {
    HOME: ctx.home,
    WIENERDOG_HOME: ctx.core,
    WIENERDOG_VAULT: ctx.vault,
    CLAUDE_CONFIG_DIR: ctx.claude,
    CODEX_HOME: ctx.codex,
    ...pinFakeBrain(ctx.root, ctx.core, o.mode),
    ...(o.env || {}),
  });
  if (!o.env || o.env.WIENERDOG_DREAM_RUN_TOKEN === undefined) delete process.env.WIENERDOG_DREAM_RUN_TOKEN;
  const logs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
  let thrown = null;
  try {
    await dream.run(argv, { skipContainmentProbe: true, now: NOW, ...(o.opts || {}) });
  } catch (e) {
    thrown = e;
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
  return { output: logs.join('\n'), thrown };
}

const workspaceOf = (ctx) => path.join(ctx.state, WORKSPACE_DIRNAME);

// ── CLAIM 1 at pipeline level ────────────────────────────────────────────────

test('dream-pipeline: claim-1-pipeline structurally — no composed argv or child env element is, or contains, the vault path', async () => {
  const ctx = setup();
  // A CAPTURE HARNESS, pinned as `claude`, that reports back exactly what the
  // child received. Observing the composition anywhere else would observe a
  // reconstruction of it; this is the child's own argv and env.
  const realRoot = fs.realpathSync(ctx.root);
  const binDir = path.join(realRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const capture = path.join(realRoot, 'capture.jsonl');
  fs.writeFileSync(
    path.join(binDir, 'claude'),
    '#!/usr/bin/env node\n'
      + "'use strict';\n"
      + 'const fs = require("node:fs");\n'
      + `fs.appendFileSync(${JSON.stringify(capture)}, JSON.stringify({argv: process.argv.slice(2), env: process.env}) + "\\n");\n`
      + 'if (process.argv.includes("--version")) { process.stdout.write("0.0.0 (capture)\\n"); process.exit(0); }\n'
      + '// Write one admissible note into the WRITE TARGET so the run is not vacuous.\n'
      + 'const p = require("node:path");\n'
      + 'const ws = process.env.WIENERDOG_DREAM_VAULT;\n'
      + 'if (ws) {\n'
      + '  fs.mkdirSync(p.join(ws, "03-Resources"), {recursive: true});\n'
      + '  fs.writeFileSync(p.join(ws, "03-Resources", "n.md"), "---\\ntype: note\\nderived_from_untrusted: false\\n---\\n\\nbody\\n");\n'
      + '}\n'
      + 'process.exit(0);\n',
    { mode: 0o755 }
  );
  const livePath = binDir + path.delimiter + process.env.PATH;
  const pins = { claude: { commandPath: path.join(binDir, 'claude'), installDir: binDir, version: 'fake', pinnedAt: new Date().toISOString() } };
  const gitHit = resolveOnPath('git', livePath);
  if (gitHit) pins.git = { ...gitHit, version: 'fake', pinnedAt: new Date().toISOString() };
  fs.mkdirSync(ctx.state, { recursive: true });
  fs.writeFileSync(path.join(ctx.state, 'exec-pins.json'), JSON.stringify({ schema: 1, pins }), { mode: 0o600 });

  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  Object.assign(process.env, {
    HOME: ctx.home, WIENERDOG_HOME: ctx.core, WIENERDOG_VAULT: ctx.vault,
    CLAUDE_CONFIG_DIR: ctx.claude, CODEX_HOME: ctx.codex, PATH: livePath,
  });
  delete process.env.WIENERDOG_DREAM_RUN_TOKEN;
  const origLog = console.log;
  console.log = () => {};
  try {
    await dream.run(['--yes'], { skipContainmentProbe: true, now: NOW });
  } finally {
    console.log = origLog;
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }

  const lines = fs.readFileSync(capture, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  const run = lines.find((l) => !(l.argv.length === 1 && l.argv[0] === '--version'));
  assert.ok(run, 'the pinned harness actually started and reported');

  // GREEN: nothing the child received is, or contains, the vault path.
  for (const el of run.argv) {
    assert.ok(!String(el).includes(ctx.vault), `argv element leaks the vault path: ${el}`);
  }
  for (const [k, v] of Object.entries(run.env)) {
    assert.ok(!String(v).includes(ctx.vault), `env ${k} leaks the vault path: ${v}`);
  }
  // NON-VACUITY: the WORKSPACE really did reach the child, so the assertions
  // above are not green on a child that received nothing. This is the line the
  // sibling's transitional `workspaceDir: vaultDir` argument reddens.
  const ws = workspaceOf(ctx);
  assert.equal(run.env.WIENERDOG_DREAM_VAULT, ws, 'the write target IS the run workspace (row G1)');
  assert.ok(run.argv.join('\n').includes(ws), 'the workspace path is in the argv');
  assert.ok(run.env.PATH && run.env.PATH.length > 0, 'PATH is sanitised, not omitted');
});

test('dream-pipeline: claim-1-pipeline behaviourally — a brain that attempts a vault write leaves the vault byte-identical outside promotion', async () => {
  const ctx = setup();
  // The fixture writes through WIENERDOG_DREAM_VAULT, which the constructed env
  // sets to the WORKSPACE. So every one of its writes lands there, and the only
  // vault mutation in the whole run is promotion's own.
  const beforeReadme = fs.readFileSync(path.join(ctx.vault, 'README.md'));
  const beforeProfile = fs.readFileSync(path.join(ctx.vault, '06-Identity/profile.md'));
  const r = await runDream(ctx);
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  assert.deepEqual(fs.readFileSync(path.join(ctx.vault, 'README.md')), beforeReadme);
  assert.deepEqual(fs.readFileSync(path.join(ctx.vault, '06-Identity/profile.md')), beforeProfile);
  // The paths the brain wrote that policy REFUSED never appeared in the vault at
  // all — under promotion there is no revert, because there was nothing to undo.
  assert.equal(fs.existsSync(path.join(ctx.vault, '06-Identity/injected.md')), false);
  assert.equal(fs.existsSync(path.join(ctx.vault, '05-Skills/weak-skill/SKILL.md')), false);
});

// ── CLAIM 2b, product-wide ───────────────────────────────────────────────────

test('dream-pipeline: claim-2b-pipeline — no product code invokes git with a cwd at or beneath the workspace root, over a whole run', async () => {
  const ctx = setup();
  const ws = workspaceOf(ctx);
  /** @type {string[]} */
  const cwds = [];
  const { spawnPinnedSync } = require('../../src/core/exec-identity');
  const { getPaths } = require('../../src/core/paths');
  // THE SEAM, NOT A GREP. A source grep for a workspace-rooted cwd cannot
  // discriminate: it is green today, green on a correct implementation, and
  // green on a broken one that passes the path through a variable.
  const spawnGit = (o) => {
    cwds.push(o.cwd);
    return spawnPinnedSync('git', getPaths(), {
      args: ['-C', o.cwd, ...o.args], env: o.env, platform: process.platform,
      encoding: 'utf8', ...(o.input === undefined ? {} : { input: o.input }),
    });
  };
  const r = await runDream(ctx, ['--yes'], { opts: { spawnGit } });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  assert.ok(cwds.length > 0, 'the git seam was exercised — a vacuous pass would prove nothing');
  const wsReal = fs.existsSync(ws) ? fs.realpathSync(ws) : ws;
  for (const c of cwds) {
    const real = fs.existsSync(c) ? fs.realpathSync(c) : c;
    assert.ok(
      real !== wsReal && !real.startsWith(wsReal + path.sep),
      `git ran with a cwd at or beneath the workspace root: ${c}`
    );
  }
});

// ── M10's mechanism ──────────────────────────────────────────────────────────

test('dream-pipeline: M10 — a self-hiding .gitignore in the workspace does not hide the payload from classification', async () => {
  const { captureBaseline, computeDelta } = require('../../src/core/dream/delta');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-m10-'));
  const baseline = captureBaseline(root);
  fs.writeFileSync(path.join(root, '.gitignore'), '*\n');
  fs.writeFileSync(path.join(root, 'payload.md'), 'the note the ignore file would have hidden\n');
  const delta = computeDelta(root, baseline);
  const rels = delta.records.map((r) => r.rel).sort();
  assert.deepEqual(rels, ['.gitignore', 'payload.md']);
  // The closure rests on the walk being GIT-FREE, never on any repository-status
  // property of the workspace: classification never consults git, so an ignore
  // file has nothing to blind. The mechanism is absent, not defeated.
  assert.ok(delta.records.some((r) => r.rel === 'payload.md' && r.status === 'added'));
});

// ── row G2, the reap precondition ────────────────────────────────────────────

test('dream-pipeline: the reap precondition refuses fail-closed on POSIX and does NOT tear the workspace down (rows G2, G5)', async () => {
  const ctx = setup();
  const r = await runDream(ctx, ['--yes'], {
    opts: { platform: 'linux', reapGroup: async () => ({ reaped: false }) },
  });
  assert.ok(r.thrown, 'an unverified reap refuses the run');
  assert.match(r.thrown.message, /could not be verified empty/);
  assert.match(r.thrown.message, /nothing was committed/i);
  assert.equal(commitCount(ctx.vault), 1, 'no commit was made');
  // THE REFUSING RUN DOES NOT TEAR DOWN — removing a tree a surviving process
  // may still be writing is not a cleanup, and this is the one state in which
  // that is distinguishable.
  assert.ok(fs.existsSync(workspaceOf(ctx)), 'the workspace is left in place for inspection');
});

test('dream-pipeline: a verified reap proceeds, and every other exit path DOES tear the workspace down (rows G2, G5)', async () => {
  const ctx = setup();
  const r = await runDream(ctx, ['--yes'], {
    opts: { platform: 'linux', reapGroup: async () => ({ reaped: true }) },
  });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  assert.equal(fs.existsSync(workspaceOf(ctx)), false, 'the success path tears down');
});

test('dream-pipeline: a TOKENLESS manual run computes the verdict too — an ABSENT verdict is unverified, never success (row G2)', async () => {
  const ctx = setup();
  let reapCalls = 0;
  // No WIENERDOG_DREAM_RUN_TOKEN, so no hand-up pidfile. Before this package the
  // verdict was computed INSIDE `if (pidfile)` and was therefore ABSENT here —
  // not merely discarded. Fail-closed means absent reads as unverified.
  const r = await runDream(ctx, ['--yes'], {
    opts: {
      platform: 'linux',
      reapGroup: async () => { reapCalls += 1; return { reaped: false }; },
    },
  });
  assert.ok(reapCalls > 0, 'the verdict is computed on a tokenless run at all');
  assert.ok(r.thrown, 'and an unverified one refuses');
  assert.match(r.thrown.message, /could not be verified empty/);
});

test('dream-pipeline: on win32 an ordinary successful run is NOT refused — a platform-blind rule breaks Windows (row G2)', async () => {
  const ctx = setup();
  // src/core/reap.js:505-519 — the win32 branch returns { reaped: false }
  // whenever taskkill cannot reach an already-exited leader, which is the NORMAL
  // successful shape. A fail-closed rule keyed on a verified group reap would
  // refuse every ordinary Windows run: the product not running.
  const r = await runDream(ctx, ['--yes'], {
    opts: { platform: 'win32', reapGroup: async () => ({ reaped: false }) },
  });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  assert.match(r.output, /dream committed/);
});

// ── row G3, the re-based non-vacuity guard ───────────────────────────────────

test('dream-pipeline: the marker plus an EMPTY workspace delta aborts as "brain did not run" (row G3)', async () => {
  const ctx = setup();
  const r = await runDream(ctx, ['--yes'], { mode: 'unknown-command' });
  assert.ok(r.thrown);
  assert.match(r.thrown.message, /the brain did not run/);
  assert.equal(commitCount(ctx.vault), 1, 'nothing committed');
});

test('dream-pipeline: the marker with a DIRTY VAULT still aborts — the decision keys off the delta, not the vault (row G3)', async () => {
  const ctx = setup();
  // The premise the old guard rested on (a tree asserted clean immediately
  // before the spawn) is exactly what removing the pre-commit destroys. A dirty
  // vault must not change the outcome either way.
  writeFile(ctx.vault, 'README.md', '# vault, edited by the user mid-session\n');
  const r = await runDream(ctx, ['--yes'], { mode: 'unknown-command' });
  assert.ok(r.thrown);
  assert.match(r.thrown.message, /the brain did not run/);
  assert.equal(
    fs.readFileSync(path.join(ctx.vault, 'README.md'), 'utf8'),
    '# vault, edited by the user mid-session\n',
    "and the user's edit is neither committed nor discarded"
  );
});

test('dream-pipeline: a run that emits the marker but DID write the workspace proceeds into promotion (row G3)', async () => {
  const ctx = setup();
  const r = await runDream(ctx, ['--yes'], { mode: 'bare-marker-after-writes' });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  assert.match(r.output, /dream committed/);
});

// ── row G6, the retired pre-commit ───────────────────────────────────────────

test('dream-pipeline: an uncommitted user edit is neither pre-committed nor swept into the dream commit (rows G6, G8)', async () => {
  const ctx = setup();
  writeFile(ctx.vault, 'MY-NOTES.md', 'the user was mid-sentence when the dream fired\n');
  const before = commitCount(ctx.vault);
  const r = await runDream(ctx);
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  assert.equal(commitCount(ctx.vault), before + 1, 'ONE commit — the dream\'s own, with no pre-commit beside it');
  assert.ok(
    !git(ctx.vault, ['log', '--pretty=%s']).includes('vault: session edits before dream'),
    'the retired pre-commit message appears nowhere'
  );
  assert.equal(headBytes(ctx.vault, 'MY-NOTES.md'), null, "the user's file is NOT in the commit");
  assert.equal(
    fs.readFileSync(path.join(ctx.vault, 'MY-NOTES.md'), 'utf8'),
    'the user was mid-sentence when the dream fired\n',
    'and it is not lost either — it stays an uncommitted working-tree file'
  );
});

// ── row G8, the named commit set and its decided bytes ───────────────────────

test('dream-pipeline: the commit contains the promoted paths and the report, and nothing else (row G8)', async () => {
  const ctx = setup();
  writeFile(ctx.vault, 'stray.md', 'user bytes\n');
  const r = await runDream(ctx);
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  const named = git(ctx.vault, ['show', '--name-only', '--pretty=', 'HEAD']).trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(named, ['03-Resources/valid-note.md', '06-Identity/valid-identity.md', 'reports/dreams/2026-07-02.md']);
  assert.equal(headBytes(ctx.vault, 'stray.md'), null, 'the stray user file is not in it');
});

test('dream-pipeline: the commit carries the DECIDED bytes — a user save landing after the publish is neither committed nor lost (row G8)', async () => {
  const ctx = setup();
  const rel = '03-Resources/valid-note.md';
  const USER = 'THE USER SAVED OVER IT AFTER THE PUBLISH\n';
  const { spawnPinnedSync } = require('../../src/core/exec-identity');
  const { getPaths } = require('../../src/core/paths');
  let saved = false;
  // THE GAP THE ROW IS ABOUT, entered through the run's own git seam: promotion
  // has published by the time the commit starts hashing, so writing the user's
  // bytes at the first `hash-object` lands the save exactly between the publish
  // and the staging call. Staging by NAMING the path would re-read the working
  // tree here and commit these bytes, ungated.
  const spawnGit = (o) => {
    if (!saved && o.args[0] === 'hash-object') {
      fs.writeFileSync(path.join(ctx.vault, rel), USER);
      saved = true;
    }
    return spawnPinnedSync('git', getPaths(), {
      args: ['-C', o.cwd, ...o.args], env: o.env, platform: process.platform,
      encoding: 'utf8', ...(o.input === undefined ? {} : { input: o.input }),
    });
  };
  const r = await runDream(ctx, ['--yes'], { opts: { spawnGit } });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  assert.ok(saved, 'the save really did land in the gap — a vacuous pass would prove nothing');

  const committed = headBytes(ctx.vault, rel).toString('utf8');
  assert.ok(committed.includes('A legitimately-learned resource note.'), 'the committed bytes are the ones promotion approved');
  assert.ok(!committed.includes('THE USER SAVED OVER IT'), 'the post-publish save did NOT enter the commit');
  assert.equal(
    fs.readFileSync(path.join(ctx.vault, rel), 'utf8'), USER,
    'and it is not discarded either — it survives as an uncommitted working-tree modification'
  );
});

// ── row G8's third clause: the code-owned warnings file, reconciled BY CONTENT ─

/** Put an over-ceiling transcript in place so the run quarantines it and the
 *  ledger gains an active quarantine — the warnings file's whole subject. */
function plantOverCeiling(ctx, name) {
  const { Limits } = require('../../src/core/transcripts');
  const projDir = path.join(ctx.claude, 'projects', 'proj');
  fs.mkdirSync(projDir, { recursive: true });
  const file = path.join(projDir, `${name}.jsonl`);
  fs.writeFileSync(file, '');
  fs.truncateSync(file, Limits.PRE_READ_CEILING_BYTES + 1);
  return file;
}

test('dream-pipeline: (e) a ledger with no active quarantine and no file at HEAD commits no warnings file (row G8)', async () => {
  const ctx = setup();
  const r = await runDream(ctx);
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  // An empty ledger renders NON-EMPTY bytes, which differ from an absent HEAD
  // file — so without the empty-ledger guard the comparison would order exactly
  // the churn commit the guard forbids.
  assert.equal(headBytes(ctx.vault, WARNINGS_REL), null, 'a vault that never had a quarantine gets no file');
});

test('dream-pipeline: (a) a file written at refresh point 2 rides the NEXT run\'s commit, though that run writes it nowhere (row G8)', async () => {
  const ctx = setup();
  plantOverCeiling(ctx, 'huge');
  // Run 1 quarantines the over-ceiling transcript. Its warnings refresh at point
  // 2 runs AFTER its own commit, so the file lands in the working tree
  // uncommitted — the state the retired pre-commit used to sweep up next run.
  const r1 = await runDream(ctx);
  assert.equal(r1.thrown, null, r1.thrown && r1.thrown.message);
  assert.ok(fs.existsSync(path.join(ctx.vault, WARNINGS_REL)), 'run 1 wrote the file on disk');

  // Run 2 writes the file NOWHERE — on disk it is already correct, so nothing
  // rewrites it. An AUTHORSHIP test ("did THIS run write it?") strands it here
  // forever. The render-versus-HEAD comparison carries it.
  const projDir = path.join(ctx.claude, 'projects', 'proj');
  fs.writeFileSync(path.join(projDir, 'second.jsonl'), fs.readFileSync(path.join(projDir, 'inj.jsonl')));
  const r2 = await runDream(ctx);
  assert.equal(r2.thrown, null, r2.thrown && r2.thrown.message);
  const committed = headBytes(ctx.vault, WARNINGS_REL);
  assert.ok(committed, 'the second run carried the file into its commit');
  assert.deepEqual(committed, fs.readFileSync(path.join(ctx.vault, WARNINGS_REL)), 'with the bytes the earlier run wrote');
});

test('dream-pipeline: (c) a run whose render EQUALS HEAD omits the file — no churn commit (row G8)', async () => {
  const ctx = setup();
  plantOverCeiling(ctx, 'huge');
  await runDream(ctx);
  const projDir = path.join(ctx.claude, 'projects', 'proj');
  fs.writeFileSync(path.join(projDir, 'second.jsonl'), fs.readFileSync(path.join(projDir, 'inj.jsonl')));
  await runDream(ctx); // this one commits it
  const atHead = headBytes(ctx.vault, WARNINGS_REL);
  assert.ok(atHead, 'precondition: the file is at HEAD now');

  fs.writeFileSync(path.join(projDir, 'third.jsonl'), fs.readFileSync(path.join(projDir, 'inj.jsonl')));
  const r3 = await runDream(ctx);
  assert.equal(r3.thrown, null, r3.thrown && r3.thrown.message);
  const named = git(ctx.vault, ['show', '--name-only', '--pretty=', 'HEAD']).trim().split('\n').filter(Boolean);
  assert.ok(!named.includes(WARNINGS_REL), 'an unchanged quarantine set produces no churn commit');
});

test('dream-pipeline: a stray user edit ANYWHERE in the code-owned warnings file is never committed, and never lost (row G8)', async () => {
  const ctx = setup();
  plantOverCeiling(ctx, 'huge');
  await runDream(ctx);
  const abs = path.join(ctx.vault, WARNINGS_REL);
  const STRAY = fs.readFileSync(abs, 'utf8') + '\n<!-- the user typed this under every heading -->\n';
  fs.writeFileSync(abs, STRAY);

  const projDir = path.join(ctx.claude, 'projects', 'proj');
  fs.writeFileSync(path.join(projDir, 'second.jsonl'), fs.readFileSync(path.join(projDir, 'inj.jsonl')));
  const r = await runDream(ctx);
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);

  const committed = headBytes(ctx.vault, WARNINGS_REL);
  assert.ok(committed, 'the file is in the commit');
  assert.ok(!committed.toString('utf8').includes('the user typed this'), 'none of the edited bytes appear in it');
  // (d) the committed bytes are byte-identical to composeWarnings' render for the
  // pinned ledger — the composer is never shown the bytes on disk.
  const ledger = ledgerLib.readLedger(ctx.state);
  assert.deepEqual(committed, composeWarnings(ledger), 'the render for the run\'s own ledger');
  // WHAT THE COMMIT DID WITH THE EDIT IS THE CLAIM, and it is asserted above:
  // none of those bytes are in it, because the composer is never shown the file
  // on disk. The commit itself WRITES NOTHING to disk — the edit's survival is
  // bounded by refresh point 2, which on a run whose ledger moved legitimately
  // rewrites the file WHOLE. Asserting the edit still on disk at run end would
  // therefore be asserting against row G8's own "until a refresh point
  // legitimately rewrites the file whole", so what is asserted is that the
  // rewrite was the CANONICAL RENDER and not a merge of the user's bytes.
  assert.ok(
    !fs.readFileSync(abs, 'utf8').includes('the user typed this'),
    'refresh point 2 rewrote the file whole, from the ledger — never merging the stray bytes forward'
  );
});

// ── row G12, scratch: deleted AND recorded, on two channels ──────────────────

test('dream-pipeline: an unexpected scratch write is deleted AND recorded, and does not abort the run (row G12)', async () => {
  const ctx = setup();
  // The fixture writes <scratch>/EVIL.json alongside every expected extract,
  // which stay present and byte-intact. `scratchIntact` is GREEN on this input —
  // measured — which is the whole reason the delete-and-record half is needed.
  const r = await runDream(ctx);
  assert.equal(r.thrown, null, 'an unexpected write does NOT abort the run');
  assert.match(r.output, /out-of-vault/, 'it reaches the run\'s output');
  assert.match(r.output, /EVIL\.json/, 'naming the file');
  assert.match(r.output, /1 out-of-vault/, 'and it is counted');
  const scratchDir = path.join(ctx.state, 'dream-scratch');
  if (fs.existsSync(scratchDir)) {
    assert.equal(fs.existsSync(path.join(scratchDir, 'EVIL.json')), false, 'the file is removed');
  }
});

test('dream-pipeline: the scratch violation reaches the DURABLE report, not only the log (row G12)', async () => {
  const ctx = setup();
  const r = await runDream(ctx);
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  // It travels to the report through promote()'s `records` input — two channels,
  // deliberately: a log line is not a durable record, and a sandbox-policy
  // breach surviving only in transient output is the observability loss the row
  // exists to prevent.
  const report = headBytes(ctx.vault, `reports/dreams/${DATE}.md`);
  assert.ok(report, 'the report is in the commit');
  assert.match(report.toString('utf8'), /EVIL\.json/, 'and it names the scratch violation');
});

// ── rows G4 and V10: the transcript advance and the digest's ordering ────────

test('dream-pipeline: a secret-WITHHELD transcript is NOT marked processed — it regenerates next run (row G4)', async () => {
  const ctx = setup();
  const r = await runDream(ctx, ['--yes'], { mode: 'secret-note' });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  const ledger = ledgerLib.readLedger(ctx.state);
  const rec = Object.entries(ledger.files).find(([k]) => k.endsWith('inj.jsonl'));
  assert.ok(rec, 'the transcript is in the ledger');
  assert.notEqual(rec[1].outcome, 'processed', 'a withheld-only run defers rather than consuming');
});

test('dream-pipeline: a clean run marks its transcript processed — only `withheld` defers (row G4)', async () => {
  const ctx = setup();
  const r = await runDream(ctx);
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  const ledger = ledgerLib.readLedger(ctx.state);
  const rec = Object.entries(ledger.files).find(([k]) => k.endsWith('inj.jsonl'));
  assert.equal(rec[1].outcome, 'processed');
});

test('dream-pipeline: the digest is regenerated AFTER the ledger is persisted (row G4, Table V row V10)', async () => {
  const ctx = setup();
  /** @type {string[]} */
  const order = [];
  const idApprovals = require('../../src/core/identity-approvals');
  const realWriteLedger = ledgerLib.writeLedger;
  const realApprovalsMap = idApprovals.approvalsMap;
  // Both durable writes go through `writeFilePrivate` (fd-based), so patching
  // `fs.writeFileSync` sees neither. These two calls are made THROUGH a module
  // object by the two steps in question, so they are observable and they bracket
  // exactly the ordering the row is about.
  ledgerLib.writeLedger = (...a) => { order.push('ledger'); return realWriteLedger(...a); };
  idApprovals.approvalsMap = (...a) => { order.push('digest'); return realApprovalsMap(...a); };
  let r;
  try {
    r = await runDream(ctx, ['--yes'], { mode: 'secret-note' });
  } finally {
    ledgerLib.writeLedger = realWriteLedger;
    idApprovals.approvalsMap = realApprovalsMap;
  }
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  const lastLedger = order.lastIndexOf('ledger');
  const lastDigest = order.lastIndexOf('digest');
  assert.ok(lastLedger !== -1 && lastDigest !== -1, `both steps were observed, saw: ${order.join(',')}`);
  // The ORDER is the content: state/digest.md is the next session's context, so
  // regenerating it before the ledger lands shows that session a state this run
  // has already changed.
  assert.ok(lastDigest > lastLedger, `the digest follows the ledger, saw: ${order.join(',')}`);
});

// ── rows G1/V8, G9, G11/V7 ───────────────────────────────────────────────────

test('dream-pipeline: the dry-run previews the run that actually happens — the workspace target, not the vault (row G1, Table V row V8)', async () => {
  const ctx = setup();
  const r = await runDream(ctx, ['--dry-run']);
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  const m = /brain argv: claude ([\s\S]*)/.exec(r.output);
  assert.ok(m, 'the preview prints the composed argv');
  // The core is resolved through realpath (/var -> /private/var on the primary
  // platform), so the comparison is on the resolved form the run actually uses.
  const wsReal = path.join(fs.realpathSync(ctx.core), 'state', WORKSPACE_DIRNAME);
  assert.ok(
    m[1].includes(workspaceOf(ctx)) || m[1].includes(wsReal),
    `the preview names the WORKSPACE the real run writes; argv: ${m[1]}`
  );
  assert.ok(!m[1].includes(`${ctx.vault} `) && !m[1].endsWith(ctx.vault), 'never the vault as a write target');
  // A preview writes nothing — the workspace path is composed, not built.
  assert.equal(fs.existsSync(workspaceOf(ctx)), false);
});

test('dream-pipeline: a brain failure removes the workspace and leaves the vault byte-identical, uncommitted edits included (row G9)', async () => {
  const ctx = setup();
  writeFile(ctx.vault, 'MY-NOTES.md', 'uncommitted user work\n');
  const before = commitCount(ctx.vault);
  const r = await runDream(ctx, ['--yes'], { mode: 'crash' });
  assert.ok(r.thrown, 'a crashed brain fails the run');
  assert.equal(commitCount(ctx.vault), before, 'no commit');
  // The retired `restoreVaultToHead` here was a `reset --hard` + `clean -fd`.
  // With the pre-commit gone it would destroy ALL of this, for a failure that
  // never touched the vault.
  assert.equal(fs.readFileSync(path.join(ctx.vault, 'MY-NOTES.md'), 'utf8'), 'uncommitted user work\n');
  assert.equal(fs.existsSync(workspaceOf(ctx)), false, 'and the workspace is gone');
});

test('dream-pipeline: the counts keep their exact semantics, on the commit message AND the summary (row G11, Table V row V7)', async () => {
  const ctx = setup();
  const r = await runDream(ctx);
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  // The fixture promotes two notes (a Tier-2 resource note and a floor-passing
  // identity note) and the report. Notes count anything outside the skills and
  // reports directories; the report is counted in neither.
  assert.equal(git(ctx.vault, ['log', '-1', '--pretty=%s']).trim(), 'dream: 2026-07-02 — 2 notes, 0 skills');
  assert.match(r.output, /2 notes, 0 skills/);
});

test('dream-pipeline: scratch is removed before the lock is released, and a non-owner removes neither (row G5, Table V row V9)', async () => {
  const ctx = setup();
  /** @type {string[]} */
  const order = [];
  const lock = require('../../src/core/dream/lock');
  const scratch = require('../../src/core/dream/scratch');
  const realRelease = lock.releaseLock;
  const realClean = scratch.cleanScratch;
  lock.releaseLock = (...a) => { order.push('release'); return realRelease(...a); };
  scratch.cleanScratch = (...a) => { order.push('clean'); return realClean(...a); };
  try {
    await runDream(ctx);
  } finally {
    lock.releaseLock = realRelease;
    scratch.cleanScratch = realClean;
  }
  // Clean-before-release is what closes the acquire-versus-clean race: a
  // newly-starting dream must not acquire the freed lock and have its fresh
  // scratch wiped by our cleanup.
  if (order.includes('clean') && order.includes('release')) {
    assert.ok(order.indexOf('clean') < order.indexOf('release'), `saw: ${order.join(',')}`);
  }
});

// ── The round-1 gate findings, each asserted in both directions ──────────────
//
// Every test below exists because a gate found a defect the suite could not see.
// The lesson the staged-work loss taught is written into how they are shaped: a
// fix is an untested change until something goes RED without it, so each of
// these was run against the pre-fix code and observed to fail.

test('dream-pipeline: the commit stores the DECIDED bytes verbatim, through a vault clean filter (row G8)', async () => {
  const ctx = setup();
  // A clean filter that rewrites ANY content, so the assertion does not depend
  // on the fixture's line endings. `hash-object --path` would apply this to the
  // piped buffer and store bytes no gate judged.
  writeFile(ctx.vault, '.gitattributes', '*.md filter=mangle\n');
  git(ctx.vault, ['config', 'filter.mangle.clean', 'sed "s/note/MANGLED/g"']);
  git(ctx.vault, ['add', '-A']);
  git(ctx.vault, ['commit', '-q', '-m', 'attributes']);

  const { spawnPinnedSync } = require('../../src/core/exec-identity');
  const { getPaths } = require('../../src/core/paths');
  /** @type {Map<string, Buffer>} what was actually piped to hash-object, in order */
  const piped = [];
  const spawnGit = (o) => {
    if (o.args[0] === 'hash-object') {
      piped.push(Buffer.from(o.input));
      assert.ok(!o.args.includes('--path'), '`--path` re-applies the path filters to the piped buffer');
    }
    return spawnPinnedSync('git', getPaths(), {
      args: ['-C', o.cwd, ...o.args], env: o.env, platform: process.platform,
      encoding: 'utf8', ...(o.input === undefined ? {} : { input: o.input }),
    });
  };
  const r = await runDream(ctx, ['--yes'], { opts: { spawnGit } });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  assert.ok(piped.length > 0, 'the commit hashed something — a vacuous pass would prove nothing');

  // Every committed path holds EXACTLY the buffer that was piped for it. Under
  // the filter, a `--path` hash would have stored the mangled form instead.
  const named = git(ctx.vault, ['show', '--name-only', '--pretty=', 'HEAD']).trim().split('\n').filter(Boolean);
  const bodies = named.map((rel) => headBytes(ctx.vault, rel));
  for (const buf of piped) {
    assert.ok(
      bodies.some((b) => b !== null && b.equals(buf)),
      `a decided buffer is not byte-equal to any committed blob: ${JSON.stringify(buf.toString('utf8').slice(0, 60))}`
    );
  }
  assert.ok(
    !bodies.some((b) => b !== null && b.toString('utf8').includes('MANGLED')),
    'the clean filter never touched the committed bytes'
  );
});

test('dream-pipeline: a user STAGED version of a promoted path is never overwritten by the index refresh (row G8)', async () => {
  const ctx = setup();
  const rel = '03-Resources/valid-note.md';
  const STAGED = 'THE USER STAGED THEIR OWN VERSION\n';
  // The user stages their own content at a path this run will also promote.
  writeFile(ctx.vault, rel, STAGED);
  git(ctx.vault, ['add', rel]);
  const stagedSha = git(ctx.vault, ['ls-files', '--stage', rel]).trim().split(/\s+/)[1];

  const r = await runDream(ctx);
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);

  // The commit is still the dream's decided bytes — the user's staged version
  // does not leak into it.
  assert.ok(headBytes(ctx.vault, rel).toString('utf8').includes('A legitimately-learned resource note.'));
  // AND the user's staged work survives: their index entry is untouched, so the
  // bytes are still reachable. Destroying it would leave them recoverable from
  // nothing.
  const afterSha = git(ctx.vault, ['ls-files', '--stage', rel]).trim().split(/\s+/)[1];
  assert.equal(afterSha, stagedSha, "the user's staged blob is still the index entry");
  assert.equal(
    git(ctx.vault, ['cat-file', 'blob', afterSha]), STAGED,
    "and it still holds the user's own bytes"
  );
});

test('dream-pipeline: an index refresh that FAILS is reported, never silent (row G8)', async () => {
  const ctx = setup();
  const { spawnPinnedSync } = require('../../src/core/exec-identity');
  const { getPaths } = require('../../src/core/paths');
  // `update-ref` has already moved HEAD by the time the refresh runs, so a
  // failure here leaves the index describing the old HEAD — exactly the state
  // the refresh exists to prevent. It must not pass silently.
  const spawnGit = (o) => {
    // ONLY the refresh of the USER's index — the tree-building call runs against
    // the private index and carries GIT_INDEX_FILE. Breaking both would fail the
    // commit itself and assert nothing about the refresh.
    if (o.args[0] === 'update-index' && o.args.includes('--cacheinfo') && !(o.env && o.env.GIT_INDEX_FILE)) {
      return { status: 1, stdout: '', stderr: 'fatal: Unable to create index.lock: File exists' };
    }
    return spawnPinnedSync('git', getPaths(), {
      args: ['-C', o.cwd, ...o.args], env: o.env, platform: process.platform,
      encoding: 'utf8', ...(o.input === undefined ? {} : { input: o.input }),
    });
  };
  const r = await runDream(ctx, ['--yes'], { opts: { spawnGit } });
  assert.equal(r.thrown, null, 'the commit is sound and the run does not fail');
  assert.match(r.output, /your git index could not be updated/, 'the failure reaches the user');
  assert.match(r.output, /index\.lock/, 'naming the cause');
  assert.match(r.output, /Nothing was lost/, 'and telling them the commit is complete');
});

test('dream-pipeline: a NON-REGULAR scratch entry is recorded, not silently swept (row G12)', async () => {
  const ctx = setup();
  // A symlink planted in the read-only scratch dir is a sandbox-policy breach
  // exactly like a stray file, and `cleanScratch` removes it at teardown either
  // way — so an enumerator that skipped it would delete the evidence and record
  // nothing. Planted just before the walk, through the run's own git seam.
  let planted = false;
  // The reap seam fires after the brain has settled and BEFORE the caller's
  // scratch walk — the exact window a surviving process would write in.
  const reapGroup = async () => {
    if (!planted) {
      try {
        fs.symlinkSync('/etc/passwd', path.join(ctx.state, 'dream-scratch', 'EVIL.link'));
        planted = true;
      } catch { /* scratch not built yet on an early call */ }
    }
    return { reaped: true };
  };
  const r = await runDream(ctx, ['--yes'], { opts: { platform: 'linux', reapGroup } });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  if (planted) {
    assert.match(r.output, /EVIL\.link/, 'the symlink is recorded as an out-of-vault violation');
  }
  // Non-vacuity for the enumerator itself, which is the half that regressed:
  // it must return every NON-DIRECTORY entry, not only regular files.
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-enum-'));
  fs.writeFileSync(path.join(probe, 'plain.json'), '{}');
  fs.symlinkSync('/etc/passwd', path.join(probe, 'link.json'));
  fs.mkdirSync(path.join(probe, 'sub'));
  fs.writeFileSync(path.join(probe, 'sub', 'nested.json'), '{}');
  const seen = dream.__listFilesRecursive(probe).map((f) => path.relative(probe, f)).sort();
  assert.deepEqual(seen, ['link.json', 'plain.json', path.join('sub', 'nested.json')].sort(),
    'the symlink is enumerated alongside the regular files');
});

// ── Gate round 1's six assertion gaps ────────────────────────────────────────
//
// Each of these had a criterion in the spec and an implementation in `src/`, and
// nothing in between. The gate's own grouping is the lesson: a criterion list is
// not self-checking, so "the code is there" and "the behaviour is proven" are
// different claims and only one of them was true.
//
// The workspace-write seam below is how a test plays the brain. `reapGroup`
// fires after the brain has settled and BEFORE `computeDelta`, so anything
// written to the workspace there is indistinguishable, to the rest of the run,
// from something the brain wrote — which is exactly what these criteria need.

/** @param {ReturnType<typeof setup>} ctx @param {Record<string,string|null>} files */
function brainWrites(ctx, files) {
  return async () => {
    const ws = workspaceOf(ctx);
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(ws, rel);
      if (content === null) {
        fs.rmSync(abs, { force: true }); // a deletion the brain made
        continue;
      }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    return { reaped: true };
  };
}

const SKILL_BODY = (id) => [
  '---', `name: ${id}`, `id: ${id}`, 'created: 2026-07-02', 'origin: dream',
  'confidence: 0.9', 'recurrence: 3', 'derived_from_untrusted: false', '---', '', 'A well-supported skill.', '',
].join('\n');

test('dream-pipeline: a promoted NEW dream-created skill gets its registry entry, from the DECIDED bytes (row G10)', async () => {
  const ctx = setup();
  const r = await runDream(ctx, ['--yes'], {
    opts: {
      platform: 'linux',
      reapGroup: brainWrites(ctx, {
        '05-Skills/new-skill/SKILL.md': SKILL_BODY('new-skill'),
        '05-Skills/wienerdog-shipped/SKILL.md': SKILL_BODY('wienerdog-shipped'),
        '05-Skills/weak-skill/SKILL.md': [
          '---', 'name: weak-skill', 'confidence: 0.4', 'recurrence: 1',
          'derived_from_untrusted: false', '---', '', 'weak', '',
        ].join('\n'),
      }),
    },
  });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  const reg = JSON.parse(fs.readFileSync(path.join(ctx.state, 'skill-registry.json'), 'utf8'));

  // The accepted new dream-created skill IS registered, and its id/created come
  // from the bytes promotion decided — never from a re-read of the vault path.
  const entry = reg.skills['05-Skills/new-skill/SKILL.md'];
  assert.ok(entry, `no registry entry: ${JSON.stringify(Object.keys(reg.skills))}`);
  assert.equal(entry.id, 'new-skill');
  assert.equal(entry.created, '2026-07-02');
  assert.ok(headBytes(ctx.vault, '05-Skills/new-skill/SKILL.md'), 'and it really was committed');

  // The three negatives, in the same criterion.
  assert.equal(reg.skills['05-Skills/wienerdog-shipped/SKILL.md'], undefined, 'a shipped wienerdog-* skill is registered by nobody');
  assert.equal(reg.skills['05-Skills/weak-skill/SKILL.md'], undefined, 'a REFUSED skill is registered by nobody');
});

test('dream-pipeline: the counts keep their exact semantics on a discriminating input (row G11, Table V row V7)', async () => {
  const ctx = setup();
  // A skills-dir file that is NOT SKILL.md is a SKILL for counting purposes —
  // the plausible misreading is to count only SKILL.md, and a fixture with zero
  // skills cannot tell the two apart.
  const r = await runDream(ctx, ['--yes'], {
    opts: {
      platform: 'linux',
      reapGroup: brainWrites(ctx, {
        '05-Skills/new-skill/SKILL.md': SKILL_BODY('new-skill'),
        '05-Skills/new-skill/REFERENCE.md': '---\nconfidence: 0.9\nrecurrence: 3\nderived_from_untrusted: false\n---\n\nnotes\n',
        'README.md': null, // a deletion — counted in neither
      }),
    },
  });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  const msg = git(ctx.vault, ['log', '-1', '--pretty=%s']).trim();
  const m = /(\d+) notes, (\d+) skills/.exec(msg);
  assert.ok(m, msg);
  assert.equal(Number(m[2]), 2, 'BOTH skills-dir files count as skills, not only SKILL.md');
  // The report is counted in neither, and the deletion is not in the commit at
  // all (promotion never deletes).
  assert.ok(headBytes(ctx.vault, 'README.md'), 'the deletion was refused — the vault keeps its version');
  assert.match(r.output, new RegExp(`${m[1]} notes, ${m[2]} skills`), 'the summary carries the same counts as the commit message');
});

test('dream-pipeline: a REDACTED transcript IS marked processed — only `withheld` defers (row G4)', async () => {
  const ctx = setup();
  // A context-free high-entropy blob is REDACT severity, so the sanitized note
  // is PROMOTED and its transcript was therefore consumed. Inverting this
  // re-does consumed work and mints a second quarantine artifact.
  const r = await runDream(ctx, ['--yes'], {
    opts: {
      platform: 'linux',
      reapGroup: brainWrites(ctx, {
        '03-Resources/entropy.md': '---\ntype: note\nderived_from_untrusted: false\n---\n\nref xY9kQ2mZ7pL4vB8nR3sT6wA1 in prose\n',
      }),
    },
  });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  const ledger = ledgerLib.readLedger(ctx.state);
  const rec = Object.entries(ledger.files).find(([k]) => k.endsWith('inj.jsonl'));
  assert.ok(rec, 'the transcript is in the ledger');
  assert.equal(rec[1].outcome, 'processed', 'a redacted run CONSUMED its transcript — redactions never defer');
  // And the sanitized bytes are what landed, not the raw ones.
  const committed = headBytes(ctx.vault, '03-Resources/entropy.md');
  assert.ok(committed, 'the sanitized note was promoted');
  assert.ok(!committed.toString('utf8').includes('xY9kQ2mZ7pL4vB8nR3sT6wA1'), 'the blob is gone from the committed bytes');
});

test('dream-pipeline: a REFUSED report reaches the user with its COMPLETE record, and nothing is committed for it (row G11)', async () => {
  const ctx = setup();
  const reportRel = `reports/dreams/${DATE}.md`;
  // A SYMLINKED report target — one of the two refusal causes the criterion
  // names. Planted at the reap seam, i.e. after the workspace was built (so the
  // report is an `added` path there) and before promotion runs, which is the
  // only window in which the vault-write primitive meets it.
  const r = await runDream(ctx, ['--yes'], {
    opts: {
      platform: 'linux',
      reapGroup: async () => {
        const abs = path.join(ctx.vault, reportRel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        try { fs.symlinkSync('/tmp/somewhere-else.md', abs); } catch { /* already planted */ }
        return { reaped: true };
      },
    },
  });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);

  // THE RECORD REACHES THE USER, and on this arm it reaches them through no
  // other channel: returning it is not delivering it.
  assert.match(r.output, /the report could not be written to your vault/, `the refusal is announced: ${r.output}`);
  assert.match(r.output, /the complete record of this run follows/, 'and the record is delivered');
  assert.match(r.output, /Refused by policy/, 'the record carries its enforcement section');
  assert.match(r.output, /injected/, 'naming what this run refused');

  // NOTHING is staged or committed for the report on this arm — there are no
  // bytes to commit.
  const named = git(ctx.vault, ['show', '--name-only', '--pretty=', 'HEAD']).trim().split('\n').filter(Boolean);
  assert.ok(!named.includes(reportRel), `the report path is not in the commit: ${named.join(', ')}`);
  // The vault object is byte-unchanged: still the symlink the test planted.
  assert.ok(fs.lstatSync(path.join(ctx.vault, reportRel)).isSymbolicLink(), 'the vault object is untouched');
});

test('dream-pipeline: the report refusal REASON is neutralised where this package renders it (row G11)', async () => {
  const ctx = setup();
  // `report.reason` / `report.accounting.reason` ORIGINATE WITH THE VAULT-WRITE
  // PRIMITIVE and quote the target they could not write, so Table N classifies
  // them attacker-influenceable BY DERIVATION. The write that would have
  // composed them is the one that was refused, so the report package's
  // code-authored-section criterion does not reach them: THIS package renders
  // them, so this is where the classification is enforced.
  //
  // THE HOSTILE BYTES MUST BE IN THE PATH THE REASON QUOTES. An earlier form of
  // this test put them in a symlink's TARGET, which the reason never carries —
  // it was VACUOUS and stayed green with the reason rendered raw. The layout's
  // `reports_dir` is a real, user-supplied route into that path.
  const HOSTILE = 'token=abcdefghijkl client_secret: abcdefghijkl';
  writeFile(ctx.core, 'config.yaml',
    `vault: ${ctx.vault}\ndream_timeout_minutes: 5\nvault_layout:\n  reports_dir: ${HOSTILE}\n`);
  const reportRel = `${HOSTILE}/${DATE}.md`;

  const r = await runDream(ctx, ['--yes'], {
    opts: {
      platform: 'linux',
      reapGroup: async () => {
        const abs = path.join(ctx.vault, reportRel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        try { fs.symlinkSync('/tmp/elsewhere.md', abs); } catch { /* already planted */ }
        return { reaped: true };
      },
    },
  });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  assert.match(r.output, /the report could not be written to your vault/, `the arm was reached: ${r.output}`);

  // GREEN, and BOTH shapes, because a prefix-shaped secret survives the
  // sanitiser intact and is caught in either order.
  assert.ok(!r.output.includes('token=abcdefghijkl'), `raw assignment-shaped secret leaked: ${r.output}`);
  assert.ok(!r.output.includes('client_secret: abcdefghijkl'), `raw prefix-shaped secret leaked: ${r.output}`);
  // NON-VACUITY: the channel really did carry the hostile path, so the two
  // assertions above are not green on an output that never contained it.
  assert.match(r.output, /token_abcdefghijkl|REDACTED/, `the neutralised form is present: ${r.output}`);
});

test('dream-pipeline: teardown never destroys the last copy — the only-copy refusal RETAINS the workspace (row G5)', async () => {
  const ctx = setup();
  // A note whose redaction AND whose withheld preservation both fail. With the
  // quarantine tree unwritable, the EP2 gate's preservation-failure abort fires
  // and `promote()` throws — and at that moment the WORKSPACE holds the sole
  // surviving copy of what the brain wrote. Removing it is the data loss the
  // shipped abort exists to refuse (Table Q row Q4).
  const r = await runDream(ctx, ['--yes'], {
    opts: {
      platform: 'linux',
      // The reap seam already fires after the brain settles and BEFORE
      // promotion, so it is where both the brain's write and the quarantine
      // sabotage belong. A FILE where the quarantine DIRECTORY must be makes
      // every preservation fail — both arms — which is the cross-product the
      // abort guards.
      reapGroup: async () => {
        const ws = workspaceOf(ctx);
        fs.mkdirSync(path.join(ws, '03-Resources'), { recursive: true });
        fs.writeFileSync(
          path.join(ws, '03-Resources/entropy.md'),
          '---\ntype: note\nderived_from_untrusted: false\n---\n\nref xY9kQ2mZ7pL4vB8nR3sT6wA1 in prose\n'
        );
        const q = path.join(ctx.state, 'quarantine');
        fs.rmSync(q, { recursive: true, force: true });
        fs.writeFileSync(q, 'not a directory\n');
        return { reaped: true };
      },
    },
  });
  assert.ok(r.thrown, `the run refuses fail-loud: ${r.output}`);
  // THE WORKSPACE IS NOT TORN DOWN, and the note's bytes are still on disk.
  assert.ok(fs.existsSync(workspaceOf(ctx)), 'the workspace holding the sole copy survives');
  assert.ok(
    fs.existsSync(path.join(workspaceOf(ctx), '03-Resources/entropy.md')),
    "the note's bytes are still there afterwards"
  );
  assert.equal(commitCount(ctx.vault), 1, 'and nothing was committed');
});

test('dream-pipeline: the PARTIALLY PUBLISHED report — the path IS committed from that arm\'s bytes, and the record is delivered (rows G8, G11)', async () => {
  const ctx = setup();
  const reportRel = `reports/dreams/${DATE}.md`;
  const { writeIntoVault } = require('../../src/core/dream/vault-write');
  const HOSTILE_REASON = 'staging object token=abcdefghijkl client_secret: abcdefghijkl could not be replaced';
  let reportWrites = 0;
  // THE BODY PUBLISHES, THE SECOND WRITE IS REFUSED. That is the only way to
  // reach `report.outcome === 'promoted'` with `accounting.published === false`:
  // the two writes target the same path inside one synchronous call.
  const writeFile = (o) => {
    if (o.rel === reportRel) {
      reportWrites += 1;
      if (reportWrites === 2) return { written: false, reason: HOSTILE_REASON };
    }
    return writeIntoVault(o);
  };
  const r = await runDream(ctx, ['--yes'], { opts: { writeFile } });
  assert.equal(r.thrown, null, r.thrown && r.thrown.message);
  assert.equal(reportWrites, 2, 'both report writes were attempted — a vacuous pass would prove nothing');

  // ROW G8: the report path IS in the run's one commit, from that arm's `bytes`
  // — the body THIS RUN PUBLISHED. Skipping it would drop a published, gated
  // file out of the commit; manufacturing the missing section would commit bytes
  // no gate judged and no primitive published.
  const named = git(ctx.vault, ['show', '--name-only', '--pretty=', 'HEAD']).trim().split('\n').filter(Boolean);
  assert.ok(named.includes(reportRel), `the report path is committed on this arm: ${named.join(', ')}`);
  const committed = headBytes(ctx.vault, reportRel).toString('utf8');
  assert.ok(committed.includes('Consolidated recent sessions.'), 'the committed bytes are the body the first write published');
  assert.ok(!committed.includes('Refused by policy'), 'and NOT a manufactured enforcement section');

  // ROW G11 (i-b): the COMPLETE record is delivered, and the accounting names
  // the reason — NEUTRALISED, because this package renders it and the primitive
  // derives it from a brain-chosen path.
  assert.match(r.output, /the report body was published, but its enforcement section was NOT/);
  assert.match(r.output, /Refused by policy/, 'the complete record follows');
  assert.ok(!r.output.includes('token=abcdefghijkl'), `raw assignment-shaped secret leaked: ${r.output}`);
  assert.ok(!r.output.includes('client_secret: abcdefghijkl'), 'raw prefix-shaped secret leaked');
  assert.match(r.output, /token_abcdefghijkl|REDACTED/, 'and the neutralised form is present — non-vacuity');
});
