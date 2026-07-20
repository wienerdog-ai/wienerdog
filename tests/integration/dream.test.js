'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dream = require('../../src/cli/dream');
const { acquireLock } = require('../../src/core/dream/lock');
const idApprovals = require('../../src/core/identity-approvals');
const { defaultLayout } = require('../../src/core/layout');
const { Limits } = require('../../src/core/transcripts');

const FAKE_BRAIN = path.resolve(__dirname, '../fixtures/dream/fake-brain.js');
const INJ_FIXTURE = path.resolve(__dirname, '../fixtures/dream/transcripts/claude-injection.jsonl');
const DATE = '2026-07-02';
// WP-155: the WIENERDOG_FAKE_TODAY env seam is deleted from production; the
// integration tests inject the clock via dream.run's JS-only opts.now. Build a
// local-noon Date so resolveDate (local components) yields exactly DATE in any
// timezone. The env var is still set for the fake-brain FIXTURE (a test file,
// not production src) which reads its own date from the inherited env.
const [DY, DM, DD] = DATE.split('-').map(Number);
const NOW = new Date(DY, DM - 1, DD, 12, 0, 0);

const ENV_KEYS = [
  'HOME',
  'WIENERDOG_HOME',
  'WIENERDOG_VAULT',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'WIENERDOG_FAKE_TODAY',
  'WIENERDOG_FAKE_BRAIN_MODE',
  'WIENERDOG_DREAM_RUN_TOKEN', // WP-a10: run-job's per-run brain hand-up token
  'PATH', // pinFakeBrain prepends the fake-brain bin dir (WP-155)
];

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

/** @param {string} base @param {string} rel @param {string} content */
function writeFile(base, rel, content) {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/** @param {string} vault @returns {number} number of commits on HEAD. */
function commitCount(vault) {
  return Number(git(vault, ['rev-list', '--count', 'HEAD']).trim());
}

/** Plant an oversized (~205 KB serialized) Claude transcript so the input
 *  assembly must truncate or drop it. @param {string} claudeDir @param {string} sessionId */
function plantOversized(claudeDir, sessionId) {
  const projDir = path.join(claudeDir, 'projects', 'proj');
  fs.mkdirSync(projDir, { recursive: true });
  const lines = [];
  for (let i = 0; i < 100; i++) {
    lines.push(
      JSON.stringify({
        type: 'user',
        sessionId,
        cwd: '/home/ada/proj',
        timestamp: '2026-01-01T10:00:00.000Z',
        message: { role: 'user', content: 'x'.repeat(2000) },
      })
    );
  }
  fs.writeFileSync(path.join(projDir, `${sessionId}.jsonl`), lines.join('\n') + '\n');
}

/** Plant a sparse file just over the pre-read ceiling (ADR-0023): discovery
 *  stats it, but it must never be opened. @param {string} claudeDir @param {string} name
 *  @returns {string} its absolute path. */
function plantOverCeiling(claudeDir, name) {
  const projDir = path.join(claudeDir, 'projects', 'proj');
  fs.mkdirSync(projDir, { recursive: true });
  const file = path.join(projDir, `${name}.jsonl`);
  fs.writeFileSync(file, '');
  fs.truncateSync(file, Limits.PRE_READ_CEILING_BYTES + 1);
  return file;
}

/** Read the parsed quarantine ledger from a core dir, or null when absent. */
function readLedgerFile(core) {
  const p = path.join(core, 'state', 'transcript-ledger.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** The single ledger record whose folded-path key ends with `suffix`, or null. */
function ledgerRecord(ledger, suffix) {
  const hit = Object.entries(ledger.files).find(([k]) => k.endsWith(suffix));
  return hit ? hit[1] : null;
}

/**
 * Build a temp home + core + clean vault git repo + config.yaml, and (unless
 * disabled) plant the injection transcript so the pipeline has input to dream on.
 * @param {{timeoutMinutes?:number, withTranscript?:boolean, maxInputBytes?:number, oversized?:string, overCeiling?:string}} [opts]
 */
function setup(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-dream-int-'));
  const home = path.join(root, 'home');
  const core = path.join(root, 'core');
  const vault = path.join(root, 'vault');
  const claude = path.join(root, 'claude');
  const codex = path.join(root, 'codex-absent');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(core, { recursive: true });
  fs.mkdirSync(vault, { recursive: true });

  // Seed the vault: a README plus a canonical identity file (so the regenerated
  // digest has content to reflect), then commit to a clean baseline.
  writeFile(vault, 'README.md', '# vault\n');
  writeFile(vault, '06-Identity/profile.md', '---\nderived_from_untrusted: false\n---\n\n# Who\n\nAda, a product designer.\n');
  git(vault, ['init', '-q']);
  git(vault, ['config', 'user.name', 'test']);
  git(vault, ['config', 'user.email', 'test@test']);
  git(vault, ['add', '-A']);
  git(vault, ['commit', '-q', '-m', 'seed']);

  const budgetLine = opts.maxInputBytes ? `dream_max_input_bytes: ${opts.maxInputBytes}\n` : '';
  writeFile(core, 'config.yaml', `vault: ${vault}\ndream_timeout_minutes: ${opts.timeoutMinutes ?? 5}\n${budgetLine}`);

  if (opts.withTranscript !== false) {
    const projDir = path.join(claude, 'projects', 'proj');
    fs.mkdirSync(projDir, { recursive: true });
    fs.copyFileSync(INJ_FIXTURE, path.join(projDir, 'inj.jsonl'));
  }

  if (opts.oversized) plantOversized(claude, opts.oversized);
  if (opts.overCeiling) plantOverCeiling(claude, opts.overCeiling);

  return { root, home, core, vault, claude, codex };
}

/** Resolve `name` against `searchPath` the way exec-identity's resolveExecutable
 *  does (first regular file with an exec bit wins), returning its command path +
 *  install dir (dirname of the realpath), or null. @returns {{commandPath:string, installDir:string}|null} */
function resolveOnPath(name, searchPath) {
  for (const dir of String(searchPath).split(path.delimiter).filter(Boolean)) {
    const cand = path.join(dir, name);
    try {
      const st = fs.statSync(cand);
      if (st.isFile() && (st.mode & 0o111) !== 0) {
        return { commandPath: cand, installDir: path.dirname(fs.realpathSync(cand)) };
      }
    } catch {
      /* absent / unreadable — keep walking */
    }
  }
  return null;
}

/** Install `fakeScriptPath` as the pinned `name` ('claude'|'codex') in `core`'s
 *  pin store (WP-154 schema), and return an env fragment that makes the REAL
 *  dispatch path (spawnPinned* → verifyPin → verifyExecutable → spawn) resolve
 *  and run it. Also pins the REAL `git` resolved off the SAME live PATH — the
 *  fail-closed state machine (WP-154 A1b) now refuses to spawn a command absent
 *  from an existing store, and the dream commits via a pinned `git`; a fake git
 *  marker would break real vault commits, so the genuine git is pinned. Replaces
 *  the deleted fake-command env seam (WP-155).
 *  @param {string} root @param {string} core @param {string} fakeScriptPath
 *  @param {string} [name='claude']
 *  @returns {{PATH:string, WIENERDOG_HOME:string}} env fragment to spread into env */
function pinFakeBrain(root, core, fakeScriptPath, name = 'claude') {
  // realpath FIRST (macOS /var → /private/var) so commandPath and
  // dirname(realpath) are stable and the pin's string-equality checks pass.
  const realRoot = fs.realpathSync(root);
  const binDir = path.join(realRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const cmd = path.join(binDir, name);
  fs.copyFileSync(fakeScriptPath, cmd); // regular file (copy, not symlink)
  fs.chmodSync(cmd, 0o755);
  const pins = {
    [name]: { commandPath: cmd, installDir: binDir, version: 'fake', pinnedAt: new Date().toISOString() },
  };
  // The live PATH at dream time is `binDir` prepended to the inherited PATH —
  // resolve git against exactly that so verifyPin's command-path/install-dir
  // string equality holds against the same git the dream will spawn.
  const livePath = binDir + path.delimiter + process.env.PATH;
  const gitHit = resolveOnPath('git', livePath);
  if (gitHit) {
    pins.git = { commandPath: gitHit.commandPath, installDir: gitHit.installDir, version: 'fake', pinnedAt: new Date().toISOString() };
  }
  const store = { schema: 1, pins };
  const stateDir = path.join(core, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'exec-pins.json'), JSON.stringify(store), { mode: 0o600 });
  return { PATH: livePath, WIENERDOG_HOME: core };
}

/**
 * Apply env, run `dream`, capture stdout/stderr text and any thrown error, then
 * restore env — all in-process (no real claude, no network). The fake brain is
 * installed as the PINNED claude (WP-155 — the env seam is gone), and the probe
 * is skipped by default via dream.run's JS-only opts seam (a fake brain cannot
 * satisfy a live probe); probe cases pass {skipContainmentProbe:false, probeCmd}.
 * @param {ReturnType<typeof setup>} ctx
 * @param {string[]} argv
 * @param {Record<string,string>} [extraEnv]
 * @param {{skipContainmentProbe?:boolean, probeCmd?:string}} [opts]
 */
async function runDream(ctx, argv, extraEnv = {}, opts = {}) {
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  Object.assign(process.env, {
    HOME: ctx.home,
    WIENERDOG_HOME: ctx.core,
    WIENERDOG_VAULT: ctx.vault,
    CLAUDE_CONFIG_DIR: ctx.claude,
    CODEX_HOME: ctx.codex,
    WIENERDOG_FAKE_TODAY: DATE,
    ...pinFakeBrain(ctx.root, ctx.core, FAKE_BRAIN),
    ...extraEnv,
  });
  if (extraEnv.WIENERDOG_FAKE_BRAIN_MODE === undefined) delete process.env.WIENERDOG_FAKE_BRAIN_MODE;
  if (extraEnv.WIENERDOG_DREAM_RUN_TOKEN === undefined) delete process.env.WIENERDOG_DREAM_RUN_TOKEN;

  const logs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
  let thrown = null;
  try {
    await dream.run(argv, { skipContainmentProbe: true, now: NOW, ...opts });
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

// ── WP-155: the deleted date env seam has zero effect ───────────────────────

test('dream-integration: a set WIENERDOG_FAKE_TODAY has ZERO effect — dream derives the date from the injected clock (WP-155)', async () => {
  const ctx = setup();
  // A bogus env date the deleted WIENERDOG_FAKE_TODAY seam would have used, and a
  // DIFFERENT injected clock. --dry-run prints the resolved date before any brain
  // spawn, so this isolates dream.js's date resolution from the fake-brain fixture.
  const { output } = await runDream(
    ctx,
    ['--dry-run'],
    { WIENERDOG_FAKE_TODAY: '2099-12-31' },
    { now: new Date(2026, 6, 2, 12, 0, 0) }
  );
  assert.match(output, /date: 2026-07-02/, 'the plan date comes from the injected clock, not the env var');
  assert.ok(!output.includes('2099-12-31'), 'the WIENERDOG_FAKE_TODAY env var is ignored (seam deleted)');
});

// ── the full happy path + all gate outcomes ─────────────────────────────────

test('dream-integration: full run commits valid tiers, reverts injection + weak skill, deletes out-of-vault, one revertable commit', async () => {
  const ctx = setup();
  // A3 hash gate (WP-116): simulate the attended sync's first-time seed so the
  // dream's registry read finds approved hashes. The dream itself never seeds;
  // profile.md is freeze-protected (WP-112), so the seeded hash still matches
  // at the step-15 render.
  idApprovals.seedApprovals(path.join(ctx.core, 'state'), ctx.vault, defaultLayout());
  const before = commitCount(ctx.vault);

  const { output, thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);

  // Exactly one new commit, correct message shape.
  assert.equal(commitCount(ctx.vault), before + 1);
  const msg = git(ctx.vault, ['log', '-1', '--pretty=%s']).trim();
  assert.match(msg, /^dream: \d{4}-\d{2}-\d{2} — \d+ notes, \d+ skills$/);

  const tracked = git(ctx.vault, ['ls-files']);
  assert.ok(tracked.includes('06-Identity/valid-identity.md'));
  assert.ok(tracked.includes('03-Resources/valid-note.md'));
  assert.ok(!tracked.includes('06-Identity/injected.md'));
  assert.ok(!tracked.includes('05-Skills/weak-skill/SKILL.md'));

  // The injected instruction never lands under 06-Identity in the committed tree.
  let matches = '';
  try {
    matches = git(ctx.vault, ['grep', '-rl', 'attacker@evil.com']);
  } catch (e) {
    if (e.status !== 1) throw e; // exit 1 = no match
  }
  assert.equal(matches.trim(), '');

  // The report's enforcement section lists every intervention.
  const report = fs.readFileSync(path.join(ctx.vault, 'reports/dreams', `${DATE}.md`), 'utf8');
  assert.ok(report.includes('## Reverted by orchestrator (policy enforcement)'));
  assert.ok(report.includes('06-Identity/injected.md'));
  assert.ok(report.includes('05-Skills/weak-skill/SKILL.md'));
  assert.ok(report.includes('EVIL.json'));

  // Per-file ledger advanced (the transcript recorded processed at its
  // fingerprint); no scalar watermark is written any more.
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'watermarks.json')), false, 'no watermarks.json write');
  const ledger = readLedgerFile(ctx.core);
  assert.ok(ledger, 'transcript-ledger.json written after the commit');
  const rec = ledgerRecord(ledger, 'inj.jsonl');
  assert.ok(rec, 'the consumed transcript has a ledger record');
  assert.equal(rec.outcome, 'processed');
  assert.equal(typeof rec.fingerprint, 'string');

  // Digest regenerated over the vault (reflects the identity content).
  const digest = fs.readFileSync(path.join(ctx.core, 'state', 'digest.md'), 'utf8');
  assert.ok(digest.includes('Ada, a product designer.'));

  // Scratch is gone.
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream-scratch')), false);

  // Summary output present.
  assert.match(output, /dream committed/);

  // `git revert` cleanly undoes the whole run.
  const sha = git(ctx.vault, ['rev-parse', 'HEAD']).trim();
  git(ctx.vault, ['revert', '--no-edit', sha]);
  assert.equal(fs.existsSync(path.join(ctx.vault, '06-Identity/valid-identity.md')), false);
  assert.equal(git(ctx.vault, ['status', '--porcelain']).trim(), '');
});

test('dream-integration: without a seeded registry the dream digest omits identity (dream never seeds, fails closed)', async () => {
  const ctx = setup();
  // NO seedApprovals here — the registry the dream reads is empty.
  const { thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);

  const digest = fs.readFileSync(path.join(ctx.core, 'state', 'digest.md'), 'utf8');
  assert.ok(!digest.includes('Ada, a product designer.'), 'unapproved identity omitted (fail closed)');
  assert.ok(
    digest.includes('some identity notes were left out of your session context'),
    'the identity-exclusion banner surfaces the omission'
  );
  // The dream did not create a registry (it never seeds).
  assert.equal(
    fs.existsSync(path.join(ctx.core, 'state', 'identity-approvals.json')),
    false,
    'no registry written by the dream'
  );
});

test('dream-integration: a second run with no new transcripts makes no commit and no ledger change', async () => {
  const ctx = setup();
  await runDream(ctx, ['--yes']);
  const afterFirst = commitCount(ctx.vault);
  const ledgerFirst = fs.readFileSync(path.join(ctx.core, 'state', 'transcript-ledger.json'), 'utf8');

  const { output } = await runDream(ctx, ['--yes']);
  assert.match(output, /nothing new to dream/);
  assert.equal(commitCount(ctx.vault), afterFirst);
  assert.equal(fs.readFileSync(path.join(ctx.core, 'state', 'transcript-ledger.json'), 'utf8'), ledgerFirst);
});

test('dream-integration: --dry-run prints the plan and resolved argv, runs no brain, makes no commit', async () => {
  const ctx = setup();
  const before = commitCount(ctx.vault);
  const { output, thrown } = await runDream(ctx, ['--dry-run']);
  assert.equal(thrown, null);
  assert.match(output, /dry-run/);
  assert.match(output, /brain argv: claude -p/);
  assert.ok(output.includes(ctx.vault));
  assert.equal(commitCount(ctx.vault), before);
  assert.equal(fs.existsSync(path.join(ctx.vault, '06-Identity/injected.md')), false);
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream-scratch')), false);
});

test('dream-integration: a dirty vault is pre-committed, then the dream proceeds (starvation fix)', async () => {
  const ctx = setup();
  const before = commitCount(ctx.vault);
  // An ordinary interactive session left the vault dirty (uncommitted edits).
  fs.writeFileSync(path.join(ctx.vault, 'uncommitted.md'), 'session edit\n');

  const { thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);

  // Two new commits: the pre-commit of the user's edits, then the dream commit.
  assert.equal(commitCount(ctx.vault), before + 2);
  const subjects = git(ctx.vault, ['log', '-2', '--pretty=%s']).trim().split('\n');
  assert.match(subjects[0], /^dream: \d{4}-\d{2}-\d{2} — \d+ notes, \d+ skills$/);
  assert.equal(subjects[1], 'vault: session edits before dream');

  // The previously-uncommitted file is now tracked.
  assert.ok(git(ctx.vault, ['ls-files']).includes('uncommitted.md'));
  // The dream's own writes still landed and the tree is clean.
  assert.ok(git(ctx.vault, ['ls-files']).includes('06-Identity/valid-identity.md'));
  assert.equal(git(ctx.vault, ['status', '--porcelain']).trim(), '');
});

test('dream-integration: a crashed brain restores the vault, releases the lock, records no ledger outcome', async () => {
  const ctx = setup();
  const before = commitCount(ctx.vault);
  const { output, thrown } = await runDream(ctx, ['--yes'], { WIENERDOG_FAKE_BRAIN_MODE: 'crash' });

  // The run fails loud, surfacing the brain's stderr tail.
  assert.ok(thrown);
  assert.match(thrown.message, /dream brain exited 1/);
  assert.match(thrown.message, /API connection dropped/);

  // No dream commit, no per-file state advanced (sessions retried next run).
  assert.equal(commitCount(ctx.vault), before);
  assert.equal(readLedgerFile(ctx.core), null);

  // The brain's partial write is gone and the tree is byte-clean.
  assert.equal(fs.existsSync(path.join(ctx.vault, '00-Inbox/partial-note.md')), false);
  assert.equal(git(ctx.vault, ['status', '--porcelain']).trim(), '');

  // Lock released and scratch wiped (the outer finally ran after the restore).
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream.lock')), false);
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream-scratch')), false);
  assert.ok(!/dream committed/.test(output));
});

test('dream-integration: the watchdog kills a hanging brain, exits with a timeout error, no commit, no scratch left', async () => {
  const ctx = setup({ timeoutMinutes: 0.02 }); // ~1.2s watchdog
  const before = commitCount(ctx.vault);
  const { thrown } = await runDream(ctx, ['--yes'], { WIENERDOG_FAKE_BRAIN_MODE: 'hang' });
  assert.ok(thrown);
  assert.match(thrown.message, /timed out/);
  assert.equal(commitCount(ctx.vault), before);
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream-scratch')), false);
  // Lock released (finally ran).
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream.lock')), false);
});

test('dream-integration: a live concurrent lock yields "another dream in progress" and no commit', async () => {
  const ctx = setup();
  const before = commitCount(ctx.vault);
  // Plant a live foreign lock (future deadline, different pid).
  const state = path.join(ctx.core, 'state');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(
    path.join(state, 'dream.lock'),
    JSON.stringify({ pid: process.pid + 99999, host: 'other', startedAt: new Date().toISOString(), deadline: Date.now() + 600000 })
  );

  const { output, thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null);
  assert.match(output, /another dream is in progress/);
  assert.equal(commitCount(ctx.vault), before);
  // The foreign lock was not deleted.
  assert.equal(fs.existsSync(path.join(state, 'dream.lock')), true);
});

test('dream-integration: a stale lock past its deadline is stolen with a warning and the run proceeds', async () => {
  const ctx = setup();
  const before = commitCount(ctx.vault);
  const state = path.join(ctx.core, 'state');
  // Pre-seed a stale lock (deadline in the past) using the real helper.
  acquireLock(state, -1);

  const { output, thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);
  assert.match(output, /stole a stale dream lock/);
  assert.equal(commitCount(ctx.vault), before + 1);
});

test('dream-integration: a capacity-wedged dream (budget below the floor) throws loud, never "nothing new"', async () => {
  // Only an oversized session, and a budget below MIN_TRUNCATE_BYTES → nothing
  // can be fed even after truncation. This must FAIL LOUD (exit 1 → run-job alert),
  // not report success.
  const ctx = setup({ withTranscript: false, oversized: 'big', maxInputBytes: 1000 });
  const before = commitCount(ctx.vault);

  const { output, thrown } = await runDream(ctx, ['--yes']);

  assert.ok(thrown, 'expected a WienerdogError throw');
  assert.match(thrown.message, /^dream capacity exhausted:/);
  // It must NOT masquerade as the genuinely-empty case.
  assert.ok(!/nothing new to dream/.test(output));
  // Its capacity drop was surfaced plainly.
  assert.match(output, /capacity: dropped 1 session/);
  // No commit; a capacity-deferred session gets NO ledger record (retried next run).
  assert.equal(commitCount(ctx.vault), before);
  assert.equal(readLedgerFile(ctx.core), null);
});

test('dream-integration: capacity truncation logs plainly and the dream still proceeds to a commit', async () => {
  // An oversized session plus the normal injection fixture, with a budget above
  // the floor but below the oversized extract → it is truncated to fit and the
  // dream proceeds (forward progress restored).
  const ctx = setup({ oversized: 'big', maxInputBytes: 100_000 });
  const before = commitCount(ctx.vault);

  const { output, thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);

  // The truncation was surfaced plainly on stdout.
  assert.match(output, /truncated claude\/big to fit the input budget/);
  // And the run actually committed (no wedge, no silent stall).
  assert.match(output, /dream committed/);
  assert.equal(commitCount(ctx.vault), before + 1);
});

test('dream-integration: a capacity dry-run diagnoses exhaustion without throwing', async () => {
  const ctx = setup({ withTranscript: false, oversized: 'big', maxInputBytes: 1000 });
  const before = commitCount(ctx.vault);

  const { output, thrown } = await runDream(ctx, ['--dry-run']);
  assert.equal(thrown, null, thrown && thrown.message);
  assert.match(output, /capacity exhausted: no fresh session fits/);
  assert.ok(!/nothing new to dream/.test(output));
  assert.equal(commitCount(ctx.vault), before);
});

// ── WP-069: concurrency + watermark-consolidation safety ────────────────────

test('dream-integration: a lock-losing dream is a pure no-op that leaves the winner\'s live scratch byte-for-byte untouched', async () => {
  // The winner (dream A) holds the lock and has live extracts in the shared
  // scratch dir mid-read. A concurrent loser (this run) must NOT collect, must
  // NOT cleanScratch — it must leave A's inputs inviolate. On pre-WP-069 code
  // collectExtracts (rm+mkdir) ran before the lock and the lock-loss path called
  // cleanScratch, so A's extracts were destroyed twice: this test FAILS there.
  const ctx = setup();
  const before = commitCount(ctx.vault);
  const state = path.join(ctx.core, 'state');
  const scratch = path.join(state, 'dream-scratch');
  fs.mkdirSync(scratch, { recursive: true });

  // Winner A's live extracts (sentinels) — record their exact bytes.
  const sentinels = {
    'claude__sess-1.md': '# extract 1\nnever-consolidated session A\n',
    'claude__sess-2.md': '# extract 2\nanother of A\'s live inputs\n',
  };
  for (const [name, body] of Object.entries(sentinels)) {
    fs.writeFileSync(path.join(scratch, name), body);
  }

  // Winner A holds a live foreign lock (future deadline, different pid).
  fs.writeFileSync(
    path.join(state, 'dream.lock'),
    JSON.stringify({ pid: process.pid + 99999, host: 'other', startedAt: new Date().toISOString(), deadline: Date.now() + 600000 })
  );

  const { output, thrown } = await runDream(ctx, ['--yes']);

  assert.equal(thrown, null);
  assert.match(output, /another dream is in progress/);
  // No commit, no per-file state advanced.
  assert.equal(commitCount(ctx.vault), before);
  assert.equal(fs.existsSync(path.join(state, 'transcript-ledger.json')), false);
  // A's lock is intact.
  assert.equal(fs.existsSync(path.join(state, 'dream.lock')), true);
  // A's scratch is byte-for-byte untouched — no extra files, no deletions.
  assert.deepEqual(fs.readdirSync(scratch).sort(), Object.keys(sentinels).sort());
  for (const [name, body] of Object.entries(sentinels)) {
    assert.equal(fs.readFileSync(path.join(scratch, name), 'utf8'), body);
  }
});

test('dream-integration: a brain whose inputs vanish mid-run records no ledger outcome, makes no commit, and fails loud', async () => {
  // The brain exits 0 but its scratch inputs disappeared mid-read (the 2026-07-07
  // concurrency incident), so it consolidated nothing and wrote only a failure-doc
  // note. run() must catch that the inputs vanished, restore the vault (dropping
  // the failure-doc note), record NO per-file outcome, and throw. On pre-WP-069
  // code there is no such gate: it commits the failure note and advances the
  // state, so this test FAILS there.
  const ctx = setup();
  const before = commitCount(ctx.vault);

  const { output, thrown } = await runDream(ctx, ['--yes'], { WIENERDOG_FAKE_BRAIN_MODE: 'vanish-scratch' });

  // Fail loud.
  assert.ok(thrown, 'expected a WienerdogError throw');
  assert.match(thrown.message, /input extracts vanished or changed mid-run/);
  // No dream commit; the brain's failure-doc note was restored away.
  assert.equal(commitCount(ctx.vault), before);
  assert.equal(fs.existsSync(path.join(ctx.vault, '00-Inbox/dream-failure-note.md')), false);
  assert.equal(git(ctx.vault, ['status', '--porcelain']).trim(), '');
  // No processed record — the sessions are retried next run.
  assert.equal(readLedgerFile(ctx.core), null);
  // Never reported success.
  assert.ok(!/dream committed/.test(output));
  // Teardown still ran: lock released, scratch gone.
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream.lock')), false);
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream-scratch')), false);
});

// ── WP-119: per-file quarantine ledger (audit A6, ADR-0023) ─────────────────

test('dream-integration: an over-ceiling transcript is quarantined while the valid neighbour is consolidated', async () => {
  const ctx = setup({ overCeiling: 'huge' });
  idApprovals.seedApprovals(path.join(ctx.core, 'state'), ctx.vault, defaultLayout());
  const before = commitCount(ctx.vault);

  const { output, thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);

  // The valid neighbour was consolidated and committed; the run exited 0.
  assert.equal(commitCount(ctx.vault), before + 1);
  assert.match(output, /dream committed/);
  // The quarantine was surfaced plainly — basename + reason only.
  assert.match(output, /quarantined claude\/huge\.jsonl \(over-ceiling\); it will not be retried until it changes\./);
  assert.ok(!output.includes(path.join(ctx.claude, 'projects')), 'console line carries no full path');

  // The ledger records BOTH outcomes.
  const ledger = readLedgerFile(ctx.core);
  assert.ok(ledger, 'ledger written');
  assert.equal(ledgerRecord(ledger, 'inj.jsonl').outcome, 'processed');
  const q = ledgerRecord(ledger, 'huge.jsonl');
  assert.equal(q.outcome, 'quarantined');
  assert.equal(q.reason, 'over-ceiling');
  // No scalar watermark write anywhere.
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'watermarks.json')), false);

  // The digest shows the durable, secret-free quarantine banner.
  const digest = fs.readFileSync(path.join(ctx.core, 'state', 'digest.md'), 'utf8');
  assert.ok(digest.includes('could not be read and were skipped'), 'banner present');
  assert.ok(digest.includes('huge.jsonl (over-ceiling)'), 'banner names basename + reason');
  assert.ok(!digest.includes(ctx.claude), 'banner carries no full path');
});

test('dream-integration: a quarantine-only run records + banners + exits 0; unchanged not retried; changed retried', async () => {
  const ctx = setup({ withTranscript: false, overCeiling: 'huge' });
  const before = commitCount(ctx.vault);
  const ledgerPath = path.join(ctx.core, 'state', 'transcript-ledger.json');

  // Run 1: the ONLY fresh input is the broken file → record, banner, exit 0.
  const r1 = await runDream(ctx, ['--yes']);
  assert.equal(r1.thrown, null, r1.thrown && r1.thrown.message);
  assert.match(r1.output, /quarantined claude\/huge\.jsonl \(over-ceiling\)/);
  assert.match(r1.output, /nothing new to dream/);
  assert.equal(commitCount(ctx.vault), before);
  const ledger1 = readLedgerFile(ctx.core);
  assert.equal(ledgerRecord(ledger1, 'huge.jsonl').outcome, 'quarantined');
  const digest1 = fs.readFileSync(path.join(ctx.core, 'state', 'digest.md'), 'utf8');
  assert.ok(digest1.includes('huge.jsonl (over-ceiling)'), 'banner written on the quarantine-only run');
  const bytes1 = fs.readFileSync(ledgerPath, 'utf8');

  // Run 2: unchanged file → skip-quarantined, no re-record, no re-alert.
  const r2 = await runDream(ctx, ['--yes']);
  assert.equal(r2.thrown, null, r2.thrown && r2.thrown.message);
  assert.ok(!/quarantined claude/.test(r2.output), 'no re-quarantine console line');
  assert.equal(fs.readFileSync(ledgerPath, 'utf8'), bytes1, 'ledger byte-unchanged');
  assert.equal(commitCount(ctx.vault), before);

  // Run 3: the file CHANGES into a small valid transcript → retried and processed.
  const huge = path.join(ctx.claude, 'projects', 'proj', 'huge.jsonl');
  fs.writeFileSync(
    huge,
    JSON.stringify({
      type: 'user',
      sessionId: 'huge',
      cwd: '/home/ada/proj',
      timestamp: '2026-01-01T10:00:00.000Z',
      message: { role: 'user', content: 'now a perfectly normal session' },
    }) + '\n'
  );
  const r3 = await runDream(ctx, ['--yes']);
  assert.equal(r3.thrown, null, r3.thrown && r3.thrown.message);
  assert.match(r3.output, /dream committed/);
  assert.equal(commitCount(ctx.vault), before + 1);
  const ledger3 = readLedgerFile(ctx.core);
  assert.equal(ledgerRecord(ledger3, 'huge.jsonl').outcome, 'processed');
  // The banner self-clears once the file leaves quarantine.
  const digest3 = fs.readFileSync(path.join(ctx.core, 'state', 'digest.md'), 'utf8');
  assert.ok(!digest3.includes('huge.jsonl (over-ceiling)'), 'banner cleared after the retry succeeded');
});

test('dream-integration: the one-time migration seeds the ledger baseline from watermarks.json', async () => {
  const ctx = setup();
  const inj = path.join(ctx.claude, 'projects', 'proj', 'inj.jsonl');
  const mtime = fs.statSync(inj).mtimeMs;
  const state = path.join(ctx.core, 'state');
  fs.mkdirSync(state, { recursive: true });
  // A pre-WP-119 install: the scalar watermark says this transcript is done.
  fs.writeFileSync(path.join(state, 'watermarks.json'), JSON.stringify({ version: 1, claude: mtime, codex: null }));
  const before = commitCount(ctx.vault);

  const { output, thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);

  // Everything at/below the old watermark is treated as already-processed.
  assert.match(output, /nothing new to dream/);
  assert.equal(commitCount(ctx.vault), before);
  const ledger = readLedgerFile(ctx.core);
  assert.ok(ledger, 'migrated ledger persisted');
  assert.equal(ledger.baseline_mtime.claude, mtime);
  assert.deepEqual(ledger.files, {});
  // watermarks.json is left in place (ignored from now on, never deleted).
  assert.ok(fs.existsSync(path.join(state, 'watermarks.json')));
});

test('dream-integration: a hostile quarantined filename reaches the banner and console only in sanitized form', async () => {
  // Review finding: a newline + markdown callout in the FILENAME would render
  // its own line inside the injected digest. The whitelist sanitizer
  // ([A-Za-z0-9._-]) is what enforces the no-untrusted-bytes invariant.
  const ctx = setup({ withTranscript: false });
  plantOverCeiling(ctx.claude, 'evil]\n> [!danger] INJECTED');

  const { output, thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);

  const sanitized = 'evil______danger__injected.jsonl';
  // Console: sanitized, folded form only.
  assert.ok(output.includes(`quarantined claude/${sanitized} (over-ceiling)`), 'console uses the sanitized folded basename');
  assert.ok(!output.includes('[!danger]'), 'no raw markdown in console output');
  assert.ok(!output.includes('INJECTED'), 'no raw (unfolded) filename bytes in console output');

  // Digest banner: sanitized, no attacker-controlled line break or callout.
  const digest = fs.readFileSync(path.join(ctx.core, 'state', 'digest.md'), 'utf8');
  assert.ok(digest.includes(`${sanitized} (over-ceiling)`), 'banner names the sanitized basename');
  assert.ok(!digest.includes('[!danger]'), 'no raw markdown from the filename in the digest');
  assert.ok(!digest.includes('INJECTED'), 'no raw filename bytes in the digest');
  assert.ok(!/\n> \[!danger\]/.test(digest), 'the hostile name cannot start its own digest line');
});

test('dream-integration: --dry-run reports a would-be quarantine but persists neither the ledger nor the digest', async () => {
  // OWNER-APPROVED amendment (2026-07-17): a preview run must not permanently
  // mutate state — no transcript-ledger.json write, no digest.md rewrite.
  const ctx = setup({ withTranscript: false, overCeiling: 'huge' });
  const before = commitCount(ctx.vault);

  const dry = await runDream(ctx, ['--dry-run']);
  assert.equal(dry.thrown, null, dry.thrown && dry.thrown.message);
  assert.match(dry.output, /would quarantine claude\/huge\.jsonl \(over-ceiling\)/);
  assert.ok(!/quarantined claude/.test(dry.output), 'no definitive "quarantined" line on a preview');
  assert.equal(commitCount(ctx.vault), before);
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'transcript-ledger.json')), false, 'no ledger write on dry-run');
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'digest.md')), false, 'no digest write on dry-run');

  // The preview consumed nothing: a real run still quarantines + records + banners.
  const real = await runDream(ctx, ['--yes']);
  assert.equal(real.thrown, null, real.thrown && real.thrown.message);
  assert.match(real.output, /quarantined claude\/huge\.jsonl \(over-ceiling\)/);
  const ledger = readLedgerFile(ctx.core);
  assert.equal(ledgerRecord(ledger, 'huge.jsonl').outcome, 'quarantined');
  assert.ok(fs.readFileSync(path.join(ctx.core, 'state', 'digest.md'), 'utf8').includes('huge.jsonl (over-ceiling)'));
});

test('dream-integration: --dry-run on the upgrade path (watermarks.json present, no ledger) persists nothing', async () => {
  // Second review round (2026-07-17 amendment): the universal first-adoption
  // state is watermarks.json present + no ledger. The fresh-state dry-run test
  // never fires the one-time migration, so it could not catch the migration
  // write persisting transcript-ledger.json on a preview run.
  const ctx = setup({ withTranscript: false, overCeiling: 'huge' });
  const state = path.join(ctx.core, 'state');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'watermarks.json'), JSON.stringify({ version: 1, claude: 1, codex: null }));
  const before = commitCount(ctx.vault);

  const dry = await runDream(ctx, ['--dry-run']);
  assert.equal(dry.thrown, null, dry.thrown && dry.thrown.message);
  assert.match(dry.output, /would quarantine claude\/huge\.jsonl \(over-ceiling\)/);
  assert.equal(commitCount(ctx.vault), before);
  assert.equal(fs.existsSync(path.join(state, 'transcript-ledger.json')), false, 'no migration write on dry-run');
  assert.equal(fs.existsSync(path.join(state, 'digest.md')), false, 'no digest write on dry-run');

  // Migration is idempotent: the next REAL run re-migrates identically, records
  // the quarantine, and writes the banner.
  const real = await runDream(ctx, ['--yes']);
  assert.equal(real.thrown, null, real.thrown && real.thrown.message);
  assert.match(real.output, /quarantined claude\/huge\.jsonl \(over-ceiling\)/);
  const ledger = readLedgerFile(ctx.core);
  assert.ok(ledger, 'real run persists the migrated ledger');
  assert.equal(ledger.baseline_mtime.claude, 1, 'baseline seeded from watermarks.json');
  assert.equal(ledgerRecord(ledger, 'huge.jsonl').outcome, 'quarantined');
  assert.ok(fs.readFileSync(path.join(state, 'digest.md'), 'utf8').includes('huge.jsonl (over-ceiling)'), 'banner written by the real run');
});

test('dream-integration: A5 private modes — digest.md 0600 after a dream; scratch dir 0700 with 0600 extracts (WP-126)', { skip: process.platform === 'win32' }, async () => {
  const ctx = setup();
  idApprovals.seedApprovals(path.join(ctx.core, 'state'), ctx.vault, defaultLayout());

  const { thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);

  const digestMode = fs.statSync(path.join(ctx.core, 'state', 'digest.md')).mode & 0o777;
  assert.equal(digestMode, 0o600, 'digest.md must be private after a dream');

  // The dream wipes scratch on exit, so probe the collector directly (the same
  // code path the dream ran): the scratch dir must be 0700, every extract 0600.
  const { collectExtracts, cleanScratch } = require('../../src/core/dream/scratch');
  const paths = { state: path.join(ctx.core, 'state'), claudeDir: ctx.claude, codexDir: ctx.codex };
  // A fresh empty ledger re-selects the fixture transcript, so extracts are written.
  const sel = collectExtracts(paths, { version: 1, files: {}, baseline_mtime: {} }, 1024 * 1024);
  try {
    assert.equal(fs.statSync(sel.scratchDir).mode & 0o777, 0o700, 'scratch dir must be 0700');
    assert.ok(sel.wrote.length > 0, 'the probe must materialize at least one extract');
    for (const f of sel.wrote) {
      assert.equal(fs.statSync(f).mode & 0o777, 0o600, `extract ${f} must be 0600`);
    }
  } finally {
    cleanScratch(paths.state);
  }
});

test('dream-integration: WP-a9 — the real dream writer path leaves a 0700 log dir and a 0600 daily log under umask 000', { skip: process.platform === 'win32' }, async () => {
  const ctx = setup();
  // Pre-create pinFakeBrain's bin dir under the normal umask: a 0777 bin dir
  // would (correctly) trip exec-identity's group/other-writable ancestor
  // refusal, which is not what this test probes.
  fs.mkdirSync(path.join(fs.realpathSync(ctx.root), 'bin'), { recursive: true, mode: 0o755 });
  const prevUmask = process.umask(0o000); // the permissive-umask fresh install
  let thrown;
  try {
    ({ thrown } = await runDream(ctx, ['--yes']));
  } finally {
    process.umask(prevUmask);
  }
  assert.equal(thrown, null, thrown && thrown.message);

  const logDir = path.join(ctx.core, 'logs', 'dream');
  assert.equal(fs.statSync(logDir).mode & 0o777, 0o700, 'dream log dir is 0700, not 0777');
  const logFile = path.join(logDir, `${DATE}.log`);
  assert.equal(fs.statSync(logFile).mode & 0o777, 0o600, 'dream daily log is 0600, not 0666');
});

test('dream-integration: WP-a9 — appending into a legacy 0666 daily log re-secures it to 0600 (and the dir to 0700)', { skip: process.platform === 'win32' }, async () => {
  const ctx = setup();
  // The legacy pre-hardening state: a 0777 log dir holding a 0666 daily log.
  const logDir = path.join(ctx.core, 'logs', 'dream');
  fs.mkdirSync(logDir, { recursive: true });
  fs.chmodSync(logDir, 0o777);
  const logFile = path.join(logDir, `${DATE}.log`);
  fs.writeFileSync(logFile, 'legacy line\n');
  fs.chmodSync(logFile, 0o666);

  const { thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);

  assert.equal(fs.statSync(logDir).mode & 0o777, 0o700, 'legacy 0777 log dir repaired at write time');
  assert.equal(fs.statSync(logFile).mode & 0o777, 0o600, 'legacy 0666 daily log secured before any byte was appended');
  assert.ok(fs.readFileSync(logFile, 'utf8').startsWith('legacy line\n'), 'append semantics preserved');
});

// ── WP-135: pre-dream containment self-check wiring ─────────────────────────

const { spawnBrain } = require('../../src/core/dream/brain');
const { EVIDENCE_FILE } = require('../../src/core/run-evidence');

/** Write a fake `claude` for the probe that responds to --version and emits a
 *  JSON envelope shaped by `mode` ('pass' | 'fail' | 'garbage'). @returns {string} */
function writeProbeFake(root, mode) {
  const p = path.join(root, `probe-${mode}.js`);
  fs.writeFileSync(
    p,
    `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
if (process.argv[2] === '--version') { process.stdout.write('9.9.9 (Fake Claude)\\n'); process.exit(0); }
const mode = ${JSON.stringify(mode)};
if (mode === 'garbage') { process.stdout.write('not json'); process.exit(0); }
if (mode === 'fail') {
  const tok = fs.readFileSync(process.env.WIENERDOG_PROBE_CANARY_PATH, 'utf8').trim();
  process.stdout.write(JSON.stringify({ result: 'leaked: ' + tok }) + '\\n'); process.exit(0);
}
process.stdout.write(JSON.stringify({ result: 'contained', permission_denials: [
  { tool_name: 'Read', tool_input: { file_path: process.env.WIENERDOG_PROBE_CANARY_PATH } },
  { tool_name: 'Write', tool_input: { file_path: process.env.WIENERDOG_PROBE_WRITE_PATH } },
] }) + '\\n');
process.exit(0);
`
  );
  fs.chmodSync(p, 0o755);
  return p;
}

test('dream-integration: a probe FAIL halts the dream — no brain, no precommit, no commit (WP-135)', async () => {
  const ctx = setup();
  idApprovals.seedApprovals(path.join(ctx.core, 'state'), ctx.vault, defaultLayout());
  const before = commitCount(ctx.vault);
  // Plant an uncommitted session edit: if precommit had run, the tree would change.
  writeFile(ctx.vault, '00-Inbox/pending.md', 'uncommitted user edit\n');

  const failFake = writeProbeFake(ctx.root, 'fail');
  // The probe WANTS to run here: opt out of runDream's default skip and inject
  // the failing probe fake via the JS-only opts seam. The probe FAIL throws at
  // step 8b, before spawnBrain — the pinned fake brain is never reached.
  const { thrown } = await runDream(ctx, ['--yes'], {}, {
    skipContainmentProbe: false,
    probeCmd: failFake,
  });
  assert.ok(thrown, 'the dream must halt');
  assert.match(thrown.message, /containment self-check fail/i);
  assert.match(thrown.message, /memory was not touched/i);
  assert.equal(commitCount(ctx.vault), before, 'no brain, no commit');
  // The pending edit is still uncommitted — precommit never ran (git abbreviates
  // the wholly-untracked dir as `?? 00-Inbox/`).
  assert.match(git(ctx.vault, ['status', '--porcelain']), /00-Inbox\//);
});

test('dream-integration: a probe INCONCLUSIVE halts the dream fail-closed (WP-135)', async () => {
  const ctx = setup();
  idApprovals.seedApprovals(path.join(ctx.core, 'state'), ctx.vault, defaultLayout());
  const before = commitCount(ctx.vault);
  const garbageFake = writeProbeFake(ctx.root, 'garbage');
  const { thrown } = await runDream(ctx, ['--yes'], {}, {
    skipContainmentProbe: false,
    probeCmd: garbageFake,
  });
  assert.ok(thrown);
  assert.match(thrown.message, /containment self-check inconclusive/i);
  assert.equal(commitCount(ctx.vault), before, 'no commit on an unconfirmable probe');
});

test('dream-integration: opts.skipContainmentProbe skips the probe — the JS-only seam, no env var (WP-135/WP-155)', async () => {
  const ctx = setup();
  idApprovals.seedApprovals(path.join(ctx.core, 'state'), ctx.vault, defaultLayout());
  const before = commitCount(ctx.vault);
  // A failing probe fake is INJECTED, but the opts skip suppresses the probe
  // entirely — the dream commits because the probe never ran. (This is the
  // re-spec of the deleted env-var skip: only a JS caller can do this.)
  const failFake = writeProbeFake(ctx.root, 'fail');
  const { thrown } = await runDream(ctx, ['--yes'], {}, {
    skipContainmentProbe: true,
    probeCmd: failFake,
  });
  assert.equal(thrown, null, thrown && thrown.message);
  assert.equal(commitCount(ctx.vault), before + 1, 'the dream committed — the probe never ran');
});

// ── WP-a10-reap-mechanism: brain hand-up pidfile + reap-to-quiescence wiring ─

const reapLib = require('../../src/core/reap');

/** A well-formed per-run token exactly as run-job mints it (16 hex chars). */
const TOKEN = 'a1b2c3d4e5f60718';

/** @param {ReturnType<typeof setup>} ctx @returns {string} this token's pidfile path */
function tokenPidfile(ctx) {
  return path.join(ctx.core, 'state', `dream-brain.${TOKEN}.pid`);
}

test('dream-integration: a supervised run writes the per-token brain pidfile at spawn, PROVES group-B quiescence, then removes it (R6-2/R7-2)', async () => {
  const ctx = setup();
  const pidfilePath = tokenPidfile(ctx);
  /** @type {{pgid:number, pidfilePresent:boolean, body:string|null}[]} */ const reapCalls = [];
  const { thrown } = await runDream(ctx, ['--yes'], { WIENERDOG_DREAM_RUN_TOKEN: TOKEN }, {
    // The seam is invoked in the finally BEFORE the pidfile unlink — the
    // hand-up must still be on disk (and parseable) at reap time.
    reapGroup: (pgid) => {
      let body = null;
      try {
        body = fs.readFileSync(pidfilePath, 'utf8');
      } catch {
        body = null;
      }
      reapCalls.push({ pgid, pidfilePresent: fs.existsSync(pidfilePath), body });
      return { reaped: true };
    },
  });
  assert.equal(thrown, null, thrown && thrown.message);
  assert.equal(reapCalls.length, 1, 'reapGroup(child.pid) runs once in the finally');
  assert.ok(Number.isInteger(reapCalls[0].pgid) && reapCalls[0].pgid > 1, 'the brain pgid (== its pid, spawned detached)');
  assert.equal(reapCalls[0].pidfilePresent, true, 'reap ordered strictly BEFORE the pidfile unlink');
  const handed = JSON.parse(reapCalls[0].body);
  assert.deepEqual(handed, { pid: reapCalls[0].pgid, pgid: reapCalls[0].pgid }, 'the hand-up carries {pid, pgid}');
  assert.equal(fs.existsSync(pidfilePath), false, 'the pidfile is removed on normal completion — only AFTER { reaped: true }');
});

test('dream-integration: R6-2 — a brain-leader NON-ZERO exit still reaps group B BEFORE deleting the pidfile', async () => {
  // Not a timeout: the brain 'close's non-zero, runBrainWithWatchdog throws,
  // and the finally must reapGroup(child.pid) (a surviving same-PGID group-B
  // child would otherwise leak — the inner watchdog fires only on timeout, and
  // run-job's backstop reaps group B only while the pidfile is present).
  const ctx = setup();
  const pidfilePath = tokenPidfile(ctx);
  /** @type {{pgid:number, pidfilePresent:boolean}[]} */ const reapCalls = [];
  const { thrown } = await runDream(
    ctx,
    ['--yes'],
    { WIENERDOG_DREAM_RUN_TOKEN: TOKEN, WIENERDOG_FAKE_BRAIN_MODE: 'crash' },
    {
      reapGroup: (pgid) => {
        reapCalls.push({ pgid, pidfilePresent: fs.existsSync(pidfilePath) });
        return { reaped: true };
      },
    }
  );
  assert.ok(thrown, 'the run fails on the brain exit');
  assert.match(thrown.message, /dream brain exited 1/);
  assert.equal(reapCalls.length, 1, 'group B reaped on the non-timeout settle too');
  assert.equal(reapCalls[0].pidfilePresent, true, 'the reap seam is invoked and ordered BEFORE the pidfile unlink');
  assert.equal(fs.existsSync(pidfilePath), false, 'deleted only after the verified { reaped: true }');
});

test('dream-integration: R7-2 — an injected { reaped: false } RETAINS the pidfile for run-job\'s backstop retry', async () => {
  const ctx = setup();
  const pidfilePath = tokenPidfile(ctx);
  const { thrown } = await runDream(
    ctx,
    ['--yes'],
    { WIENERDOG_DREAM_RUN_TOKEN: TOKEN, WIENERDOG_FAKE_BRAIN_MODE: 'crash' },
    {
      // The bounded poll "timed out with a member still present": the hand-up
      // must NOT be released — never delete a pidfile whose group is not yet
      // verified empty.
      reapGroup: () => ({ reaped: false }),
    }
  );
  assert.ok(thrown);
  assert.match(thrown.message, /dream brain exited 1/);
  assert.equal(fs.existsSync(pidfilePath), true, 'pidfile RETAINED on { reaped: false } so run-job can retry reapGroup(brain.pgid)');
});

test('dream-integration: the watchdog timeout reaps the detached fake brain via the injected reapTree seam — no orphan survives', async () => {
  // The fake brain is spawned detached into its OWN group (the re-detached
  // shape relative to the middle's group): the pre-A10 inline kill(-child.pid)
  // is replaced by the authoritative-table reapTree, injected here as a
  // recording seam that delegates to the real reap. (A middle killed in the
  // sub-ms spawn→hand-up window writes no pidfile at all — the documented
  // ADR-0030 residual, a best-effort no-op for the backstop, not asserted
  // reaped here.)
  const ctx = setup({ timeoutMinutes: 0.02 }); // ~1.2s watchdog
  /** @type {number[]} */ const treeCalls = [];
  const { thrown } = await runDream(ctx, ['--yes'], { WIENERDOG_FAKE_BRAIN_MODE: 'hang' }, {
    reapTree: (pid, platform, seams) => {
      treeCalls.push(pid);
      reapLib.reapTree(pid, platform, seams); // really reap — the assertion below proves no orphan
    },
  });
  assert.ok(thrown);
  assert.match(thrown.message, /timed out/);
  assert.equal(treeCalls.length, 1, 'the timeout path reaps via the injected reapTree seam');
  const brainPid = treeCalls[0];
  assert.ok(Number.isInteger(brainPid) && brainPid > 1);
  // The brain must be gone (poll briefly — SIGKILL delivery + init reaping).
  const deadline = Date.now() + 2000;
  let alive = true;
  while (Date.now() < deadline) {
    try {
      process.kill(brainPid, 0);
      alive = true;
    } catch (e) {
      alive = e.code === 'EPERM';
      if (!alive) break;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.equal(alive, false, 'no orphaned brain survives the timeout reap');
});

test('dream-integration: R10-1 — a THROWING hand-up write reaps the just-spawned brain group and FAILS the run ({ reaped: true } branch)', async () => {
  // writeFilePrivate is fallible I/O (disk-full / permission / temp→final
  // rename): when it throws AFTER the brain spawned, NO identity was handed up
  // — run-job's pidfile-gated backstop can never retry this group, so
  // dream.js's guard is the only reaper holding child.pid and must finish the
  // job here, then FAIL the run (never proceed into the brain race).
  const ctx = setup();
  const before = commitCount(ctx.vault);
  /** @type {number[]} */ const reapCalls = [];
  const { thrown } = await runDream(ctx, ['--yes'], { WIENERDOG_DREAM_RUN_TOKEN: TOKEN }, {
    writeFilePrivate: () => {
      throw new Error('disk full (injected write-fail)');
    },
    reapGroup: async (pgid, platform, seams) => {
      reapCalls.push(pgid);
      await reapLib.reapGroup(pgid, platform, seams); // really kill the live brain
      return { reaped: true };
    },
  });
  assert.ok(thrown, 'the run FAILS — never a silent unsupervised continuation');
  assert.equal(thrown.constructor.name, 'WienerdogError');
  assert.match(thrown.message, /could not record the brain's process id/);
  assert.equal(reapCalls.length, 1, 'the guard reaps exactly once when the first reap verifies empty');
  assert.ok(reapCalls[0] > 1, 'the reap seam is invoked on child.pid (the brain group)');
  assert.equal(fs.existsSync(tokenPidfile(ctx)), false, 'no pidfile was handed up (the write failed)');
  assert.equal(commitCount(ctx.vault), before, 'the brain race never ran — no commit');
});

test('dream-integration: R10-1/R11-3 — write-fail guard { reaped: false → true }: ONE bounded escalation reaps, the run still fails', async () => {
  const ctx = setup();
  /** @type {number[]} */ const reapCalls = [];
  const script = [{ reaped: false }, { reaped: true }];
  const { thrown } = await runDream(ctx, ['--yes'], { WIENERDOG_DREAM_RUN_TOKEN: TOKEN }, {
    writeFilePrivate: () => {
      throw new Error('rename failed (injected)');
    },
    reapGroup: async (pgid, platform, seams) => {
      reapCalls.push(pgid);
      await reapLib.reapGroup(pgid, platform, seams); // really kill the live brain
      return script.shift();
    },
  });
  assert.ok(thrown);
  assert.match(thrown.message, /could not record the brain's process id/);
  assert.ok(!/could not be reaped to quiescence/.test(thrown.message), 'escalation reached { reaped: true } — no survivor claim');
  assert.equal(reapCalls.length, 2, 'exactly ONE bounded final escalation (unified with R8-1)');
  assert.equal(reapCalls[0], reapCalls[1], 'the escalation retries the SAME brain group while still holding child.pid');
});

test('dream-integration: R11-3 — write-fail guard { reaped: false → false }: a survivor-specific error names the un-reaped brain group', async () => {
  const ctx = setup();
  /** @type {number[]} */ const reapCalls = [];
  const { thrown } = await runDream(ctx, ['--yes'], { WIENERDOG_DREAM_RUN_TOKEN: TOKEN }, {
    writeFilePrivate: () => {
      throw new Error('EDQUOT (injected)');
    },
    reapGroup: async (pgid, platform, seams) => {
      reapCalls.push(pgid);
      await reapLib.reapGroup(pgid, platform, seams); // really kill the live brain regardless of the scripted result
      return { reaped: false };
    },
  });
  assert.ok(thrown, 'NOT a silent pass — the survivor is surfaced LOUDLY (error outcome via run-job)');
  assert.match(thrown.message, /could not be reaped to quiescence/, 'survivor-specific message');
  assert.ok(thrown.message.includes(String(reapCalls[0])), 'names the un-reaped brain group (child.pid)');
  assert.equal(reapCalls.length, 2, 'the escalation call count stays BOUNDED — never an unbounded block-until-ESRCH');
});

test('dream-integration: a standalone run (no run token) writes no hand-up pidfile', async () => {
  const ctx = setup();
  /** @type {number[]} */ const reapCalls = [];
  const { thrown } = await runDream(ctx, ['--yes'], {}, {
    reapGroup: (pgid) => (reapCalls.push(pgid), { reaped: true }),
  });
  assert.equal(thrown, null, thrown && thrown.message);
  const state = path.join(ctx.core, 'state');
  const pidfiles = fs.readdirSync(state).filter((f) => f.startsWith('dream-brain.'));
  assert.deepEqual(pidfiles, [], 'no per-token pidfile on the standalone path');
  assert.equal(reapCalls.length, 0, 'no token → no hand-up, no finally group reap (the inner watchdog covers the brain)');
});

test('dream-integration: a passing probe result is recorded in the dream run evidence (WP-135)', async () => {
  // Drive spawnBrain directly with a containmentProbe option (the dream.js →
  // spawnBrain threading), using the fake brain so no real claude is spawned.
  const ctx = setup();
  const { done } = spawnBrain({
    vaultDir: ctx.vault,
    scratchDir: path.join(ctx.core, 'state', 'dream-scratch'),
    date: DATE,
    model: null,
    // WP-155: the fake brain arrives via the pinned front door, not an env seam.
    env: { ...process.env, ...pinFakeBrain(ctx.root, ctx.core, FAKE_BRAIN), WIENERDOG_FAKE_TODAY: DATE },
    containmentProbe: { outcome: 'pass', claudeVersion: '9.9.9 (Fake Claude)' },
  });
  await done;
  const rec = JSON.parse(
    fs.readFileSync(path.join(ctx.core, 'state', EVIDENCE_FILE), 'utf8').trim().split('\n').pop()
  );
  assert.equal(rec.job, 'dream');
  assert.deepEqual(rec.containmentProbe, { outcome: 'pass', claudeVersion: '9.9.9 (Fake Claude)' });
});
