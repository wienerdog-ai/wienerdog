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

const ENV_KEYS = [
  'HOME',
  'WIENERDOG_HOME',
  'WIENERDOG_VAULT',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'WIENERDOG_FAKE_TODAY',
  'WIENERDOG_DREAM_CMD',
  'WIENERDOG_FAKE_BRAIN_MODE',
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

/**
 * Apply env, run `dream`, capture stdout/stderr text and any thrown error, then
 * restore env — all in-process (no real claude, no network).
 * @param {ReturnType<typeof setup>} ctx
 * @param {string[]} argv
 * @param {Record<string,string>} [extraEnv]
 */
async function runDream(ctx, argv, extraEnv = {}) {
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  Object.assign(process.env, {
    HOME: ctx.home,
    WIENERDOG_HOME: ctx.core,
    WIENERDOG_VAULT: ctx.vault,
    CLAUDE_CONFIG_DIR: ctx.claude,
    CODEX_HOME: ctx.codex,
    WIENERDOG_FAKE_TODAY: DATE,
    WIENERDOG_DREAM_CMD: FAKE_BRAIN,
    ...extraEnv,
  });
  if (extraEnv.WIENERDOG_FAKE_BRAIN_MODE === undefined) delete process.env.WIENERDOG_FAKE_BRAIN_MODE;

  const logs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
  let thrown = null;
  try {
    await dream.run(argv);
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
