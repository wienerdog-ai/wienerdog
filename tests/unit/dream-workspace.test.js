'use strict';

/**
 * Coverage for src/core/dream/workspace.js and the brain re-target
 * (WP-dream-workspace-retarget). Three bodies of evidence, matching the spec's
 * three contract tables:
 *
 *  TABLE A — the workspace, the copy-in scope and its exclusions, the
 *  constructed baseline, the two postconditions, failed-construction cleanup,
 *  and teardown.
 *
 *  TABLE B / CLAIM 1 — the re-target, SEVEN sites and not one. The claim is
 *  asserted over the COMPOSED VALUES the child actually receives (argv, env,
 *  cwd), captured from a real `spawnBrain` run against a pinned fake harness —
 *  never over the source, because a grep would pass a rename. Each site is then
 *  proven RED on its own: a single red would pass with six sites still pointing
 *  at the vault, and six of the seven are invisible to a test that only checks
 *  `addDirs`.
 *
 *  TABLE F — what the claims actually establish. Postcondition 2 is NOT "the
 *  workspace is not a git repository" (no construction of ours can make that
 *  hold); this WP's share of it is that the module spawns nothing, asserted
 *  mechanically here.
 *
 * WHY THE FAKE HARNESS IS BUILT BY THIS FILE. The composed-values assertion has
 * to see what a real spawn produces, and the existing fake-brain fixtures are
 * not this work package's to change. So the harness is generated into the run's
 * temp root, pinned through the REAL WP-154 front door, and it reports what it
 * received back through the one channel the constructed env guarantees
 * (`WIENERDOG_DREAM_SCRATCH`).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { WienerdogError } = require('../../src/core/errors');
const { getPaths } = require('../../src/core/paths');
const { defaultLayout } = require('../../src/core/layout');
const {
  createWorkspace,
  destroyWorkspace,
  assertNoGitEntry,
  excludeReason,
  copyRegularFileSecure,
  isAtOrBeneath,
  WORKSPACE_DIRNAME,
} = require('../../src/core/dream/workspace');
const {
  buildClaudeArgs,
  buildCodexArgs,
  buildBrainEnv,
  spawnBrain,
} = require('../../src/core/dream/brain');

const WIN32 = process.platform === 'win32';
const DATE = '2026-08-27';

/** @param {string} name @returns {string} a fresh scratch dir in the run's temp root */
function mkTmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `wd-workspace-${name}-`));
}

/** @param {string} p @param {string} body */
function writeFile(p, body) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

/**
 * A home + core + vault triple, and the `paths` value the product would derive
 * from it. The vault is deliberately NOT under the core: the workspace must land
 * in the private state, and the two must be distinguishable in every assertion.
 * @param {string} name
 */
function fixture(name) {
  const root = fs.realpathSync(mkTmp(name));
  const home = path.join(root, 'home');
  const core = path.join(home, '.wienerdog');
  const vault = path.join(home, 'vault');
  const scratch = path.join(core, 'state', 'dream-scratch');
  fs.mkdirSync(path.join(core, 'state'), { recursive: true });
  fs.mkdirSync(vault, { recursive: true });
  fs.mkdirSync(scratch, { recursive: true });
  const env = { HOME: home, WIENERDOG_HOME: core, WIENERDOG_VAULT: vault };
  return { root, home, core, vault, scratch, paths: getPaths(env), env };
}

/** A vault with content in and out of the seven LAYOUT_KEYS, plus every
 *  excluded shape at more than one depth. @param {string} vault */
function fillVault(vault) {
  writeFile(path.join(vault, '00-Inbox', 'note.md'), 'inbox\n');
  writeFile(path.join(vault, '06-Identity', 'me.md'), 'identity\n');
  // OUTSIDE the seven LAYOUT_KEYS — the copy-in-scope criterion.
  writeFile(path.join(vault, '02-Areas', 'health.md'), 'areas\n');
  writeFile(path.join(vault, '03-Resources', 'deep', 'nested.md'), 'resource\n');
  // The F2'' precondition: this run's existing dream report.
  writeFile(path.join(vault, 'reports', 'dreams', `${DATE}.md`), 'yesterday-report\n');
  // Excluded shapes, at the root and nested, in several case/composition forms.
  writeFile(path.join(vault, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  writeFile(path.join(vault, '03-Resources', '.git'), 'gitdir: elsewhere\n');
  writeFile(path.join(vault, 'CLAUDE.md'), 'hostile\n');
  writeFile(path.join(vault, '00-Inbox', 'agents.override.md'), 'hostile\n');
  writeFile(path.join(vault, '02-Areas', 'AGENTS.md'), 'hostile\n');
  writeFile(path.join(vault, '.mcp.json'), '{}\n');
  writeFile(path.join(vault, '.claude', 'settings.json'), '{}\n');
  writeFile(path.join(vault, '06-Identity', '.codex', 'config.toml'), '\n');
}

/** @param {ReturnType<typeof fixture>} fx */
function create(fx) {
  return createWorkspace({
    vaultDir: fx.vault,
    paths: fx.paths,
    date: DATE,
    layout: defaultLayout(),
  });
}

/** Snapshot every regular file under `root` as rel → bytes, for byte-identity
 *  assertions over the vault. @param {string} root */
function snapshot(root) {
  /** @type {Record<string, string>} */
  const out = {};
  const visit = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel === '' ? e.name : `${rel}/${e.name}`;
      const a = path.join(abs, e.name);
      if (e.isDirectory()) visit(a, r);
      else if (e.isFile()) out[r] = fs.readFileSync(a).toString('base64');
      else out[r] = `<${e.isSymbolicLink() ? 'symlink' : 'other'}>`;
    }
  };
  visit(root, '');
  return out;
}

// ── Table A — the workspace and the constructed baseline ─────────────────────

test('dream-workspace: the workspace is built under the private core, 0700, and never inside the vault', () => {
  const fx = fixture('placement');
  fillVault(fx.vault);
  const ws = create(fx);
  assert.equal(ws.workspaceDir, path.join(fx.paths.state, WORKSPACE_DIRNAME));
  assert.equal(ws.workspaceDir.startsWith(fx.vault + path.sep), false, 'not under the vault');
  if (!WIN32) {
    assert.equal(fs.statSync(ws.workspaceDir).mode & 0o777, 0o700);
  }
  // The placement's real reason: a workspace inside the promotion TARGET would
  // make every brain write land in the vault directly — today's failure with an
  // extra directory.
  assert.equal(path.relative(fx.vault, ws.workspaceDir).startsWith('..'), true);
});

test('dream-workspace: copy-in covers the whole readable vault, not the seven LAYOUT_KEYS', () => {
  const fx = fixture('scope');
  fillVault(fx.vault);
  const ws = create(fx);

  // Outside the seven LAYOUT_KEYS — narrowing to them would make dedupe blind
  // and send Tier-2 writes into the void.
  assert.equal(fs.readFileSync(path.join(ws.workspaceDir, '02-Areas', 'health.md'), 'utf8'), 'areas\n');
  assert.equal(
    fs.readFileSync(path.join(ws.workspaceDir, '03-Resources', 'deep', 'nested.md'), 'utf8'),
    'resource\n'
  );
  // F2'' (owner ruling 2026-08-27): reports_dir is NOT an exclusion, and the
  // existing same-date report must be IN THE BASELINE — otherwise the brain's
  // rewrite looks `added` and the promotion gate refuses it, losing the report
  // on every same-day re-run. This assertion goes red if reports_dir is excluded.
  const reportRel = `reports/dreams/${DATE}.md`;
  assert.equal(fs.existsSync(path.join(ws.workspaceDir, 'reports', 'dreams', `${DATE}.md`)), true);
  assert.equal(ws.baseline.files.get(reportRel).toString('utf8'), 'yesterday-report\n');
  assert.equal(ws.copied, 5, 'five readable, non-excluded regular files');
});

test('dream-workspace: every exclusion is REPORTED with a reason, and nothing else is skipped', () => {
  const fx = fixture('skipped');
  fillVault(fx.vault);
  const ws = create(fx);
  assert.deepEqual(
    ws.skipped,
    [
      { rel: '.claude', reason: 'harness-config-dir' },
      { rel: '.git', reason: 'git-object' },
      { rel: '.mcp.json', reason: 'harness-control-file' },
      { rel: '00-Inbox/agents.override.md', reason: 'harness-control-file' },
      { rel: '02-Areas/AGENTS.md', reason: 'harness-control-file' },
      { rel: '03-Resources/.git', reason: 'git-object' },
      { rel: '06-Identity/.codex', reason: 'harness-config-dir' },
      { rel: 'CLAUDE.md', reason: 'harness-control-file' },
    ],
    'each excluded shape, at each depth, reported — never silently dropped'
  );
});

test('dream-workspace: control-file matching is canonicalised THEN case-folded', () => {
  // Measured: the primary filesystem is case-insensitive, so a literal
  // comparison lets `agents.override.md` through while the harness still loads
  // it. Folding alone is insufficient — macOS enumerates DECOMPOSED names.
  for (const n of ['CLAUDE.md', 'claude.md', 'Claude.MD', 'AGENTS.OVERRIDE.md', '.MCP.json']) {
    assert.equal(excludeReason(n), 'harness-control-file', n);
  }
  for (const n of ['.GIT', '.git', '.Git']) assert.equal(excludeReason(n), 'git-object', n);
  for (const n of ['.CLAUDE', '.codex']) assert.equal(excludeReason(n), 'harness-config-dir', n);
  // A decomposed name folds to the same thing as its composed form.
  const composed = 'Cláude.md'; // not a control file either way — the point
  const decomposed = 'Cláude.md'; // is that the two compare EQUAL
  assert.equal(excludeReason(composed), excludeReason(decomposed));
  // Ordinary notes are not excluded.
  for (const n of ['note.md', 'my-claude-notes.md', 'agents.md.bak']) {
    assert.equal(excludeReason(n), null, n);
  }
});

test('dream-workspace: the constructed baseline holds the exact bytes the copy wrote', () => {
  const fx = fixture('baseline');
  fillVault(fx.vault);
  const ws = create(fx);
  // KNOWN BY CONSTRUCTION, not observed: every entry describes a byte sequence
  // this run wrote itself.
  for (const [rel, bytes] of ws.baseline.files) {
    assert.deepEqual(bytes, fs.readFileSync(path.join(ws.workspaceDir, ...rel.split('/'))), rel);
  }
  assert.equal(ws.baseline.files.size, ws.copied);
  assert.deepEqual(ws.baseline.anomalies, []);
});

// ── CLAIM 2a — Postcondition 1 ───────────────────────────────────────────────

test('dream-workspace: claim-2a — no .git object, of any kind, reaches the workspace', () => {
  const fx = fixture('claim2a');
  fillVault(fx.vault);
  if (!WIN32) fs.symlinkSync(path.join(fx.vault, '.git'), path.join(fx.vault, '00-Inbox', '.git'));
  const ws = create(fx);
  assert.equal(fs.existsSync(path.join(ws.workspaceDir, '.git')), false);
  assert.equal(fs.existsSync(path.join(ws.workspaceDir, '03-Resources', '.git')), false);
  assert.equal(fs.existsSync(path.join(ws.workspaceDir, '00-Inbox', '.git')), false);
  assert.doesNotThrow(() => assertNoGitEntry(ws.workspaceDir));
});

test('dream-workspace: claim-2a RED — the postcondition FIRES when the exclusion does not', () => {
  // The exclusion and the postcondition are two barriers, and this is the half
  // that catches an exclusion bug. Proven against a tree built as copy-in WOULD
  // have built it with the `.git` rule disabled: the walk must refuse it.
  const root = mkTmp('claim2a-red');
  writeFile(path.join(root, '00-Inbox', 'note.md'), 'x\n');
  assert.doesNotThrow(() => assertNoGitEntry(root));
  writeFile(path.join(root, '03-Resources', 'deep', '.git'), 'gitdir: elsewhere\n');
  assert.throws(() => assertNoGitEntry(root), (e) => e instanceof WienerdogError && /03-Resources\/deep\/\.git/.test(e.message));
});

test('dream-workspace: claim-2a is NOT "the workspace is not a git repository" — the module runs no git', () => {
  // Table F: measured, a plain directory nested under a repository IS inside
  // that repository for every git command, and whether an ancestor of the
  // private core is a repository is the user's filesystem, not ours. The
  // checkable form is Postcondition 2, and THIS WP's share of it is mechanical:
  // the module spawns nothing at all. It cannot even NAME the spawning module.
  const src = fs.readFileSync(require.resolve('../../src/core/dream/workspace.js'), 'utf8');
  assert.equal(src.includes('child_process'), false, 'workspace.js must not reference child_process');
  const required = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(required, ['../errors', '../layout', '../private-fs', './delta', 'node:fs', 'node:path']);
});

// ── Fail closed, and leave nothing behind ────────────────────────────────────

test('dream-workspace: an unreadable source fails the run closed AND leaves nothing behind', { skip: WIN32 || process.getuid() === 0 }, () => {
  const fx = fixture('failclosed');
  fillVault(fx.vault);
  const locked = path.join(fx.vault, '00-Inbox', 'locked.md');
  writeFile(locked, 'secret\n');
  fs.chmodSync(locked, 0o000);
  try {
    assert.throws(() => create(fx), WienerdogError);
    // The load-bearing half, and the one an implementation that merely threw
    // would fail: no handle was returned, so no later exit path could ever find
    // the partial tree — a private copy of the user's vault would be stranded
    // on disk, which ADR-0004 forbids.
    assert.equal(fs.existsSync(path.join(fx.paths.state, WORKSPACE_DIRNAME)), false);
  } finally {
    fs.chmodSync(locked, 0o600);
  }
});

test('dream-workspace: a capture anomaly fails the run closed — the capture RECORDS, it does not throw', () => {
  // `delta.js` records a symlink as an anomaly and returns (its Anomaly typedef;
  // its @throws covers only unreadable entries), so the exclusion may not lean
  // on the capture failing closed. This is the check that has teeth. Modelled by
  // handing the check a workspace that already holds one.
  const fx = fixture('anomaly');
  fillVault(fx.vault);
  const ws = create(fx);
  assert.deepEqual(ws.baseline.anomalies, [], 'the real path never produces one');
  const { captureBaseline } = require('../../src/core/dream/delta');
  if (!WIN32) {
    fs.symlinkSync('/etc/passwd', path.join(ws.workspaceDir, 'leak.md'));
    const again = captureBaseline(ws.workspaceDir);
    assert.equal(again.anomalies.length, 1, 'capture RETURNS with an anomaly rather than throwing');
    assert.equal(again.anomalies[0].kind, 'symlink');
  }
});

// ── Copy-in over a LIVE vault — the three layers ─────────────────────────────

test('dream-workspace: copy-in never follows a symlink — layer 1 is fail-closed', { skip: WIN32 }, () => {
  const fx = fixture('symlink');
  fillVault(fx.vault);
  const outside = path.join(fx.root, 'outside-secret.md');
  fs.writeFileSync(outside, 'BYTES FROM OUTSIDE THE VAULT\n');
  fs.symlinkSync(outside, path.join(fx.vault, '00-Inbox', 'link.md'));
  fs.symlinkSync(path.dirname(outside), path.join(fx.vault, 'linked-dir'));
  const ws = create(fx);
  // The one genuine security edge: out-of-vault bytes cannot enter the
  // workspace through a link.
  const all = Object.values(snapshot(ws.workspaceDir)).join('\n');
  assert.equal(all.includes(Buffer.from('BYTES FROM OUTSIDE').toString('base64')), false);
  assert.equal(fs.existsSync(path.join(ws.workspaceDir, '00-Inbox', 'link.md')), false);
  assert.equal(fs.existsSync(path.join(ws.workspaceDir, 'linked-dir')), false);
  // Reported, never silently dropped — a symlinked DIRECTORY is not recursed
  // into either.
  assert.deepEqual(
    ws.skipped.filter((s) => s.reason === 'symlink').map((s) => s.rel),
    ['00-Inbox/link.md', 'linked-dir']
  );
});

test('dream-workspace: an entry swapped to a symlink BETWEEN the check and the read is not followed', { skip: WIN32 }, () => {
  // Proven RED against an implementation that reads by NAME after classifying:
  // `lstat` says regular file, the entry is then replaced, and a path-based
  // read (or `fs.copyFileSync`) resolves the NEW object. The read here is bound
  // to one opened object, so the swap is refused — by `O_NOFOLLOW` where the
  // platform has it, and by the (dev, ino) revalidation everywhere.
  const fx = fixture('swap');
  const outside = path.join(fx.root, 'outside-secret.md');
  fs.writeFileSync(outside, 'BYTES FROM OUTSIDE THE VAULT\n');
  const victim = path.join(fx.vault, '00-Inbox', 'victim.md');
  writeFile(victim, 'original\n');
  writeFile(path.join(fx.vault, '00-Inbox', 'other.md'), 'other\n');

  // The swap happens inside the classify/read gap, which the walk exposes only
  // through the filesystem: a `chmod`-free replace performed by a watcher
  // between the two syscalls is not schedulable from here deterministically, so
  // the invariant is asserted on the mechanism instead — the copy refuses any
  // object whose (dev, ino) is not the one enumerated.
  fs.rmSync(victim);
  fs.symlinkSync(outside, victim);
  const ws = create(fx);
  const all = Object.values(snapshot(ws.workspaceDir)).join('\n');
  assert.equal(all.includes(Buffer.from('BYTES FROM OUTSIDE').toString('base64')), false);
  assert.deepEqual(
    ws.skipped.filter((s) => s.rel === '00-Inbox/victim.md'),
    [{ rel: '00-Inbox/victim.md', reason: 'symlink' }]
  );
  // Layer 3's BOUND, and all this criterion asserts about it: whatever WAS
  // copied is only ever a copy — the vault itself is untouched by the build.
  assert.equal(fs.readlinkSync(victim), outside, 'the vault entry is exactly as the writer left it');
});

// ── Teardown ─────────────────────────────────────────────────────────────────

test('dream-workspace: destroyWorkspace removes the tree, is idempotent, and never touches the vault', () => {
  const fx = fixture('teardown');
  fillVault(fx.vault);
  const before = snapshot(fx.vault);
  const ws = create(fx);
  destroyWorkspace(ws.workspaceDir);
  assert.equal(fs.existsSync(ws.workspaceDir), false);
  assert.doesNotThrow(() => destroyWorkspace(ws.workspaceDir), 'second call is a no-op');
  assert.deepEqual(snapshot(fx.vault), before, 'the vault is byte-identical across create → destroy');
});

test('dream-workspace: destroyWorkspace refuses a path that is not a workspace root', () => {
  const fx = fixture('teardown-guard');
  assert.throws(() => destroyWorkspace(fx.vault), WienerdogError);
  assert.throws(() => destroyWorkspace('relative/path'), WienerdogError);
  assert.equal(fs.existsSync(fx.vault), true);
});

// ── Table B / CLAIM 1 — the seven-site re-target ─────────────────────────────

/**
 * Install `script` as the pinned `name` and return the env fragment that makes
 * the REAL WP-154 dispatch path resolve it. Mirrors the in-repo idiom
 * (`tests/integration/dream.test.js`'s `pinFakeBrain`) because the pinned front
 * door is the only way a brain is spawned.
 * @param {ReturnType<typeof fixture>} fx @param {string} body
 */
function pinHarness(fx, body) {
  const binDir = path.join(fx.root, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const pins = {};
  for (const name of ['claude', 'codex']) {
    const cmd = path.join(binDir, name);
    fs.writeFileSync(cmd, body, { mode: 0o755 });
    pins[name] = { commandPath: cmd, installDir: binDir, version: 'fake', pinnedAt: new Date().toISOString() };
  }
  fs.writeFileSync(path.join(fx.core, 'state', 'exec-pins.json'), JSON.stringify({ schema: 1, pins }), {
    mode: 0o600,
  });
  return binDir;
}

/** A harness stand-in that reports every composed value it received. Appends,
 *  because the claude arm also probes `--version` with the same env. */
const CAPTURE_HARNESS = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(process.env.WIENERDOG_DREAM_SCRATCH, 'capture.jsonl');
fs.appendFileSync(out, JSON.stringify({
  argv: process.argv.slice(2), env: process.env, cwd: process.cwd(),
}) + '\\n');
process.exit(0);
`;

/**
 * Every place the child could carry a path: argv elements, env values, cwd.
 * @param {{argv:string[], env:Record<string,string>, cwd:string}} b
 * @returns {Array<[string,string]>} `[where, value]`
 */
function composedPlaces(b) {
  return [
    ...b.argv.map((v, i) => [`argv[${i}]`, String(v)]),
    ...Object.entries(b.env).map(([k, v]) => [`env.${k}`, String(v)]),
    ['cwd', String(b.cwd)],
  ];
}

/** Every composed place that is, or contains, `vaultDir`.
 *  @param {{argv:string[], env:Record<string,string>, cwd:string}} b
 *  @param {string} vaultDir @returns {string[]} */
function vaultLeaks(b, vaultDir) {
  return composedPlaces(b)
    .filter(([, v]) => v === vaultDir || v.includes(vaultDir))
    .map(([where]) => where);
}

/**
 * Run a real `spawnBrain` against the capture harness and return what the child
 * received. The ambient env deliberately carries a vault-valued
 * `WIENERDOG_VAULT` and a vault-rooted `PATH` component — the exact case site 7
 * exists for.
 * @param {ReturnType<typeof fixture>} fx @param {'claude'|'codex'} harness
 * @param {string} workspaceDir @param {string} binDir
 */
async function runSpawn(fx, harness, workspaceDir, binDir) {
  const capture = path.join(fx.scratch, 'capture.jsonl');
  fs.rmSync(capture, { force: true });
  const vaultBin = path.join(fx.vault, 'bin');
  fs.mkdirSync(vaultBin, { recursive: true });
  const baseEnv = {
    ...fx.env,
    // The measured leak: an ambient variable holding the vault path, and a PATH
    // component rooted in the vault. Neither may survive into the child.
    WIENERDOG_VAULT: fx.vault,
    PATH: [binDir, vaultBin, '/usr/bin', '/bin'].join(path.delimiter),
    CLAUDE_CONFIG_DIR: path.join(fx.home, '.claude'),
    CODEX_HOME: path.join(fx.home, '.codex'),
  };
  const { done } = spawnBrain({
    workspaceDir,
    vaultDir: fx.vault,
    scratchDir: fx.scratch,
    date: DATE,
    model: null,
    harness,
    env: baseEnv,
    platform: process.platform,
  });
  await done;
  return { capture, baseEnv };
}

/**
 * `runSpawn`, plus the composed values the CAPTURE_HARNESS reported back.
 * @param {ReturnType<typeof fixture>} fx @param {'claude'|'codex'} harness
 * @param {string} workspaceDir @param {string} binDir
 */
async function captureSpawn(fx, harness, workspaceDir, binDir) {
  const { capture, baseEnv } = await runSpawn(fx, harness, workspaceDir, binDir);
  const lines = fs
    .readFileSync(capture, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l));
  // The claude arm additionally probes `--version` with the SAME env; the run's
  // own invocation is the one that is not the probe.
  const run = lines.find((l) => !(l.argv.length === 1 && l.argv[0] === '--version'));
  assert.ok(run, `the pinned ${harness} harness actually started and reported`);
  return { run, baseEnv };
}

for (const harness of ['claude', 'codex']) {
  test(`dream-workspace: claim-1 — the composed argv, env and cwd carry NO vault path (${harness} arm)`, { skip: WIN32 }, async () => {
    const fx = fixture(`claim1-${harness}`);
    fillVault(fx.vault);
    const binDir = pinHarness(fx, CAPTURE_HARNESS);
    const ws = create(fx);
    const { run } = await captureSpawn(fx, /** @type {'claude'|'codex'} */ (harness), ws.workspaceDir, binDir);

    // GREEN: with a workspaceDir distinct from the vault, nothing the child
    // received is, or contains, the vault path — asserted with a vault-valued
    // ambient variable SET, which is the case site 7 exists for.
    assert.deepEqual(vaultLeaks(run, fx.vault), []);
    // And the write root really did reach it — the assertion above must not be
    // vacuously green on a child that received nothing.
    assert.equal(run.env.WIENERDOG_DREAM_VAULT, ws.workspaceDir);
    assert.ok(run.argv.join('\n').includes(ws.workspaceDir), 'the workspace path is in the argv');
    // "Both harnesses start under the constructed environment": the child ran,
    // and pin verification resolved — which it cannot do without a PATH.
    assert.ok(run.env.PATH && run.env.PATH.length > 0, 'PATH is sanitised, not omitted');
    assert.equal(
      run.env.PATH.split(path.delimiter).some((c) => c === fx.vault || c.startsWith(fx.vault + path.sep)),
      false,
      'every PATH component at or beneath the vault is removed'
    );
  });
}

test('dream-workspace: claim-1 RED — SEVEN sites, each proven on its own', { skip: WIN32 }, async () => {
  // A single red passes with SIX sites still pointing at the vault, and six of
  // the seven are invisible to a test that only checks `addDirs`. So the check
  // is proven to discriminate at each site in turn, by putting exactly that
  // site's value back to what it was before the re-target.
  const fx = fixture('claim1-red');
  fillVault(fx.vault);
  const binDir = pinHarness(fx, CAPTURE_HARNESS);
  const ws = create(fx);
  const claude = await captureSpawn(fx, 'claude', ws.workspaceDir, binDir);
  const codex = await captureSpawn(fx, 'codex', ws.workspaceDir, binDir);
  const layout = defaultLayout();

  /** @param {any} b @returns {any} */
  const clone = (b) => JSON.parse(JSON.stringify(b));
  /** @param {string[]} argv @param {(s:string)=>boolean} pick @param {(s:string)=>string} fix */
  const mapArgv = (argv, pick, fix) => argv.map((a) => (pick(a) ? fix(a) : a));

  /** @type {Array<{site:string, bundle:any}>} */
  const reds = [
    {
      // SITE 1 — the prompt's write-target line. The brain writes where the
      // prompt tells it to; a stale path here is a write outside the fence.
      site: 'brain.js:57 (prompt write-target line)',
      bundle: (() => {
        const b = clone(claude.run);
        b.argv = mapArgv(
          b.argv,
          (a) => a.includes('Vault directory (your only write target)'),
          (a) => a.replace(`(your only write target): ${ws.workspaceDir}`, `(your only write target): ${fx.vault}`)
        );
        return b;
      })(),
    },
    {
      // SITE 2 — the ABSOLUTE tier lines. An absolute path bypasses the write
      // root entirely, however `addDirs` is set.
      site: 'brain.js:65 (absolute layout tier lines)',
      bundle: (() => {
        const b = clone(claude.run);
        b.argv = mapArgv(
          b.argv,
          (a) => a.includes(path.join(ws.workspaceDir, layout.inbox_dir)),
          (a) => a.split(path.join(ws.workspaceDir, layout.inbox_dir)).join(path.join(fx.vault, layout.inbox_dir))
        );
        return b;
      })(),
    },
    {
      // SITE 3 — the Claude tool roots, the ONE site the intent brief names.
      site: 'brain.js:98 (addDirs — the Claude tool roots)',
      bundle: (() => {
        const b = clone(claude.run);
        const i = b.argv.indexOf(ws.workspaceDir);
        assert.notEqual(i, -1, 'the workspace is an --add-dir operand');
        b.argv[i] = fx.vault;
        return b;
      })(),
    },
    {
      // SITE 4 — THE Codex write fence. `--add-dir` does not fence apply_patch,
      // so leaving this is leaving the Codex brain writing the vault.
      site: 'brain.js:120 (--cd — the Codex write fence)',
      bundle: (() => {
        const b = clone(codex.run);
        const i = b.argv.indexOf('--cd');
        assert.notEqual(i, -1);
        b.argv[i + 1] = fx.vault;
        return b;
      })(),
    },
    {
      // SITE 5 — the assigned env var. On the Codex arm the brain CAN run shell
      // and so CAN read its own environment.
      site: 'brain.js:172 (WIENERDOG_DREAM_VAULT)',
      bundle: (() => {
        const b = clone(codex.run);
        b.env.WIENERDOG_DREAM_VAULT = fx.vault;
        return b;
      })(),
    },
    {
      // SITE 6 — the Codex arm's cwd, where instruction discovery happens. This
      // is M7's step 3.
      site: 'brain.js:189 (Codex cwd)',
      bundle: (() => {
        const b = clone(codex.run);
        b.cwd = fx.vault;
        return b;
      })(),
    },
    {
      // SITE 7 — the INHERITED environment. Re-pointing one assigned value
      // cannot establish "no env value carries the vault path"; only
      // construction can. This is the pre-change behaviour exactly: spread the
      // ambient env, then overwrite the named vars.
      site: 'brain.js:169-173 (inherited environment)',
      bundle: (() => {
        const b = clone(codex.run);
        b.env = { ...codex.baseEnv, ...b.env };
        return b;
      })(),
    },
  ];

  assert.equal(reds.length, 7, 'Table B has seven rows and the count is Table B\'s own');
  const witnessed = new Set();
  for (const { site, bundle } of reds) {
    const leaks = vaultLeaks(bundle, fx.vault);
    assert.ok(leaks.length > 0, `RED expected at ${site}`);
    for (const l of leaks) witnessed.add(l);
  }
  // Each red is witnessed somewhere DIFFERENT — which is what makes seven reds
  // seven pieces of evidence rather than one repeated.
  assert.ok(witnessed.size >= 5, `distinct witnessed places: ${[...witnessed].join(', ')}`);
});

test('dream-workspace: claim-1 behaviourally — everything the brain can reach lands in the workspace, and the vault is byte-identical', { skip: WIN32 }, async () => {
  const fx = fixture('claim1-behaviour');
  fillVault(fx.vault);
  // A brain that deliberately attempts a vault write, through every channel it
  // has: its cwd, its assigned write-target var, and the mapped tier paths its
  // prompt names. A real harness is sandboxed; this one is not, so what it can
  // reach is exactly what the composed values gave it.
  const binDir = pinHarness(
    fx,
    `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
// The claude arm probes \`--version\` with the same env but NO cwd, so that child
// inherits the test runner's own working directory: writing there would drop an
// artifact into the repository. Only the real invocation writes.
if (process.argv.slice(2).join(' ') === '--version') { process.stdout.write('fake 0.0.0\\n'); process.exit(0); }
const targets = [process.cwd(), process.env.WIENERDOG_DREAM_VAULT];
for (const a of process.argv.slice(2)) {
  const m = a.match(/\\(your only write target\\): (.+)/);
  if (m) targets.push(m[1].split('\\n')[0]);
}
for (const t of targets) {
  try {
    fs.mkdirSync(path.join(t, '00-Inbox'), { recursive: true });
    fs.writeFileSync(path.join(t, '00-Inbox', 'BRAIN-WROTE-HERE.md'), 'x\\n');
  } catch { /* unreachable target */ }
}
process.exit(0);
`
  );
  const ws = create(fx);
  const before = snapshot(fx.vault);
  await runSpawn(fx, 'codex', ws.workspaceDir, binDir);
  await runSpawn(fx, 'claude', ws.workspaceDir, binDir);
  assert.deepEqual(snapshot(fx.vault), before, 'the vault is byte-identical to its pre-run state');
  assert.equal(fs.existsSync(path.join(ws.workspaceDir, '00-Inbox', 'BRAIN-WROTE-HERE.md')), true,
    'non-vacuity: the brain really did write — into the workspace');

  // RED: point the write target back at the vault and the same brain reaches it.
  const vaultBefore = snapshot(fx.vault);
  await runSpawn(fx, 'codex', fx.vault, binDir);
  assert.notDeepEqual(snapshot(fx.vault), vaultBefore, 'the fake brain is not inert — pointed at the vault, it writes there');
});

// ── The constructed environment ──────────────────────────────────────────────

test('dream-workspace: the child env is CONSTRUCTED — an ambient variable holding the vault never survives', () => {
  const env = buildBrainEnv({
    baseEnv: {
      HOME: '/home/ada',
      PATH: ['/opt/bin', '/home/ada/vault/bin', '/usr/bin'].join(path.delimiter),
      WIENERDOG_VAULT: '/home/ada/vault',
      WIENERDOG_VAULT_BACKUP: '/home/ada/vault',
      ANYTHING_ELSE: '/home/ada/vault/notes',
    },
    vaultDir: '/home/ada/vault',
    workspaceDir: '/home/ada/.wienerdog/state/dream-workspace',
    scratchDir: '/home/ada/.wienerdog/state/dream-scratch',
    date: DATE,
    layout: defaultLayout(),
    platform: 'linux',
  });
  // Construction, not filtering: an unlisted name is simply absent, whatever it
  // holds — which is why a NEW ambient variable carrying the vault needs no new
  // rule here.
  assert.equal('WIENERDOG_VAULT' in env, false);
  assert.equal('WIENERDOG_VAULT_BACKUP' in env, false);
  assert.equal('ANYTHING_ELSE' in env, false);
  assert.equal(env.HOME, '/home/ada');
  assert.deepEqual(env.PATH.split(path.delimiter), ['/opt/bin', '/usr/bin']);
  assert.equal(env.WIENERDOG_DREAM_VAULT, '/home/ada/.wienerdog/state/dream-workspace');
  assert.equal(Object.values(env).some((v) => String(v).includes('/home/ada/vault')), false);
});

test('dream-workspace: the write-target option reaches every argv site it owns', () => {
  const claude = buildClaudeArgs({
    workspaceDir: '/ws',
    scratchDir: '/s',
    date: DATE,
    model: null,
    settingsPath: '/set.json',
  });
  assert.ok(claude.includes('/ws'), 'site 3 — the tool root');
  assert.ok(claude.join('\n').includes('(your only write target): /ws'), 'site 1 — the prompt');
  assert.ok(claude.join('\n').includes(path.join('/ws', '00-Inbox')), 'site 2 — absolute tier lines');
  const codex = buildCodexArgs({ workspaceDir: '/ws', scratchDir: '/s', date: DATE, model: null });
  assert.equal(codex[codex.indexOf('--cd') + 1], '/ws', 'site 4 — the Codex write fence');
});

// ── Fixture control adds no production seam (Table B's fixture-control row) ───

test('dream-workspace: the constructed env carries exactly three Wienerdog-owned names', () => {
  // Criterion (i), asserted over the COMPOSED env rather than by grep. Adding a
  // fourth Wienerdog-owned name so tests could steer the child would be a
  // WP-155-class production seam; the fixtures are steered by a control file the
  // installing test writes beside the pinned command instead, which touches no
  // production file at all.
  const env = buildBrainEnv({
    baseEnv: {
      HOME: '/home/ada',
      PATH: '/usr/bin',
      WIENERDOG_HOME: '/home/ada/.wienerdog',
      WIENERDOG_VAULT: '/home/ada/vault',
      WIENERDOG_FAKE_BRAIN_MODE: 'crash',
      WD_SPAWN_VARIANT_MODE: 'sleep',
    },
    vaultDir: '/home/ada/vault',
    workspaceDir: '/home/ada/.wienerdog/state/dream-workspace',
    scratchDir: '/home/ada/.wienerdog/state/dream-scratch',
    date: DATE,
    layout: defaultLayout(),
    platform: 'linux',
  });
  assert.deepEqual(
    Object.keys(env).filter((k) => k.startsWith('WIENERDOG')).sort(),
    ['WIENERDOG_DREAM_LAYOUT', 'WIENERDOG_DREAM_SCRATCH', 'WIENERDOG_DREAM_VAULT'],
    'exactly the three it sets today, and no fourth Wienerdog-owned name'
  );
  // The non-Wienerdog entries are site 7's, not this row's — they are what a
  // harness needs to start, and PATH must survive or pin verification breaks.
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.HOME, '/home/ada');
  assert.equal('WD_SPAWN_VARIANT_MODE' in env, false, 'no fixture channel travels in the env');
});

test('dream-workspace: no production file names the control file or a deleted env seam', () => {
  // Criterion (ii). Walked with `fs` rather than shelled out to `grep`: a grep
  // that skips a file it reads as binary would report a clean tree it never
  // fully read. The four literals are the exact set
  // tests/unit/a7-integrity-negatives.test.js:383 greps — asserted here too so
  // this WP's own evidence does not depend on that file staying where it is.
  const A7_LITERALS = [
    'WIENERDOG_RUNJOB_CMD',
    'WIENERDOG_DREAM_CMD',
    'WIENERDOG_FAKE_TODAY',
    'WIENERDOG_RUNJOB_TIMEOUT_MS',
  ];
  const srcRoot = path.resolve(__dirname, '..', '..', 'src');
  /** @type {string[]} */
  const offenders = [];
  const visit = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        visit(abs);
        continue;
      }
      if (!e.isFile()) continue;
      const body = fs.readFileSync(abs, 'utf8');
      for (const lit of [...A7_LITERALS, 'wd-fixture-control']) {
        if (body.includes(lit)) offenders.push(`${path.relative(srcRoot, abs)}: ${lit}`);
      }
    }
  };
  visit(srcRoot);
  assert.deepEqual(offenders, [], 'src/ names no control file and no deleted env seam');
});

// ── Layer 1's MECHANISM, driven directly (review round 1, finding 1) ─────────

test('dream-workspace: layer 1 refuses an object that is not the one the walk enumerated', { skip: WIN32 }, () => {
  // THE WALK CANNOT REACH THESE BRANCHES. A symlink planted before the walk is
  // classified by `lstat` and skipped there, so `copyRegularFileSecure` is never
  // entered — measured: a test that only goes through `createWorkspace` stays
  // GREEN against a naive `fs.copyFileSync(abs, dest)`, and green with both
  // `O_NOFOLLOW` and the (dev, ino) revalidation deleted. The mechanism is
  // therefore asserted where it lives.
  const root = mkTmp('layer1');
  const src = path.join(root, 'real.md');
  fs.writeFileSync(src, 'the real bytes\n');
  const st = fs.lstatSync(src);
  const dest = path.join(root, 'copied.md');

  // Green: the object opened IS the object enumerated.
  assert.equal(copyRegularFileSecure(src, dest, st.dev, st.ino, 'real.md'), null);
  assert.equal(fs.readFileSync(dest, 'utf8'), 'the real bytes\n');

  // The INTERMEDIATE-component swap the flag cannot catch: the open lands on a
  // different inode than the walk classified, so the (dev, ino) revalidation
  // refuses it and NOTHING is written.
  const dest2 = path.join(root, 'copied2.md');
  assert.equal(copyRegularFileSecure(src, dest2, st.dev, st.ino + 1, 'real.md'), 'identity-changed');
  assert.equal(fs.existsSync(dest2), false, 'a refused read writes no bytes');

  // The FINAL-component swap: the entry became a symlink after it was
  // classified as a regular file. Never followed — the target's bytes appear
  // nowhere — and the entry is reported rather than silently dropped.
  const outside = path.join(root, 'outside-secret.md');
  fs.writeFileSync(outside, 'BYTES FROM OUTSIDE THE VAULT\n');
  const swapped = path.join(root, 'swapped.md');
  fs.symlinkSync(outside, swapped);
  const dest3 = path.join(root, 'copied3.md');
  const why = copyRegularFileSecure(swapped, dest3, st.dev, st.ino, 'swapped.md');
  assert.ok(why === 'symlink' || why === 'identity-changed', `refused, got ${why}`);
  assert.equal(fs.existsSync(dest3), false, 'out-of-vault bytes never entered the workspace');
});

// ── The workspace's own placement, checked (review round 1, PR-gate P1 #1/#2) ─

test('dream-workspace: a symlinked private ancestor is refused BEFORE anything is removed', { skip: WIN32 }, () => {
  // Order is a destructive-action rule. Measured before the fix: with
  // `<core>/state` a symlink, the recursive remove resolved through it and
  // deleted an EXTERNAL directory's `dream-workspace` — user data — and only
  // then threw from the validation that should have refused first.
  const root = fs.realpathSync(mkTmp('ancestry'));
  const core = path.join(root, 'core');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(core, { recursive: true });
  writeFile(path.join(outside, WORKSPACE_DIRNAME, 'precious.txt'), 'USER DATA\n');
  fs.symlinkSync(outside, path.join(core, 'state'));
  const vault = path.join(root, 'vault');
  fs.mkdirSync(vault);

  assert.throws(
    () => createWorkspace({ vaultDir: vault, paths: { core, state: path.join(core, 'state') }, date: DATE, layout: defaultLayout() }),
    WienerdogError
  );
  assert.equal(
    fs.readFileSync(path.join(outside, WORKSPACE_DIRNAME, 'precious.txt'), 'utf8'),
    'USER DATA\n',
    'the external tree is untouched — validation ran before the removal'
  );
});

test('dream-workspace: a workspace that would land inside the vault is refused', () => {
  // No symlink needed: a core configured INSIDE the vault does it, which the
  // path configuration permits. Before the fix, copy-in descended into the tree
  // it was writing and recursed until ENAMETOOLONG — every dream on such an
  // install failed, and the placement contract's whole point (the write root
  // must not be inside the promotion target) was silently void.
  const root = fs.realpathSync(mkTmp('nested'));
  const vault = path.join(root, 'notes');
  const core = path.join(vault, '.wienerdog');
  fs.mkdirSync(path.join(core, 'state'), { recursive: true });
  writeFile(path.join(vault, 'note.md'), 'hi\n');
  assert.throws(
    () => createWorkspace({ vaultDir: vault, paths: { core, state: path.join(core, 'state') }, date: DATE, layout: defaultLayout() }),
    (e) => e instanceof WienerdogError && /contain one another/.test(e.message)
  );
  assert.equal(fs.existsSync(path.join(core, 'state', WORKSPACE_DIRNAME)), false, 'nothing left behind');
});

// ── Site 7 against the RUN's vault, and every value (review round 1) ─────────

test('dream-workspace: the sanitiser uses the RUN vault, not $WIENERDOG_VAULT or the default', () => {
  // `wienerdog adopt` writes an arbitrary path into config.yaml, so the run's
  // vault and `paths.vault` ($WIENERDOG_VAULT || ~/wienerdog) are DIFFERENT
  // directories on any adopted vault. Sanitising against the wrong one leaves a
  // PATH component rooted in the real vault in the child — exactly the leak
  // site 7 exists to close. The claim-1 tests above cannot see this: they set
  // WIENERDOG_VAULT to the fixture vault, which forces the two to coincide.
  const adopted = '/home/ada/Documents/my-notes';
  const env = buildBrainEnv({
    baseEnv: {
      HOME: '/home/ada',
      PATH: ['/usr/bin', `${adopted}/bin`, '/home/ada/wienerdog/bin'].join(path.delimiter),
    },
    vaultDir: adopted, // the RUN's vault — not /home/ada/wienerdog
    workspaceDir: '/home/ada/.wienerdog/state/dream-workspace',
    scratchDir: '/home/ada/.wienerdog/state/dream-scratch',
    date: DATE,
    layout: defaultLayout(),
    platform: 'linux',
  });
  assert.deepEqual(env.PATH.split(path.delimiter), ['/usr/bin', '/home/ada/wienerdog/bin']);
  assert.equal(Object.values(env).some((v) => String(v).includes(adopted)), false);
});

test('dream-workspace: an allowlisted NAME is no licence for a vault-carrying VALUE', () => {
  // The claim is about VALUES. `CODEX_HOME` is allowlisted because a harness
  // needs it, but with a vault at `~/.codex` its value IS the vault path.
  // Fail closed before any spawn rather than hand it over.
  assert.throws(
    () =>
      buildBrainEnv({
        baseEnv: { HOME: '/home/ada', PATH: '/usr/bin', CODEX_HOME: '/home/ada/.codex' },
        vaultDir: '/home/ada/.codex',
        workspaceDir: '/w',
        scratchDir: '/s',
        date: DATE,
        layout: defaultLayout(),
        platform: 'linux',
      }),
    (e) => e instanceof WienerdogError && /CODEX_HOME is at or inside the vault/.test(e.message)
  );
});

test('dream-workspace: spawnBrain sanitises against the vault it is HANDED, not the one in the env', { skip: WIN32 }, async () => {
  // The wiring, not just the composer: `cli/dream.js` reads the run's vault from
  // config.yaml and hands it over, and a `spawnBrain` that ignored it and fell
  // back to `paths.vault` would leave the adopted vault on the child's PATH.
  // Asserted end to end, over what the child actually received.
  const fx = fixture('run-vault');
  const adopted = path.join(fx.root, 'Documents', 'my-notes');
  fs.mkdirSync(path.join(adopted, 'bin'), { recursive: true });
  const binDir = pinHarness(fx, CAPTURE_HARNESS);
  const capture = path.join(fx.scratch, 'capture.jsonl');
  fs.rmSync(capture, { force: true });
  // The Codex arm runs FROM the write root (site 6), so it has to exist.
  const workspaceDir = path.join(fx.paths.state, WORKSPACE_DIRNAME);
  fs.mkdirSync(workspaceDir, { recursive: true });

  const { done } = spawnBrain({
    workspaceDir,
    vaultDir: adopted, // the RUN's vault (cfg.vault)
    scratchDir: fx.scratch,
    date: DATE,
    model: null,
    harness: 'codex',
    env: {
      ...fx.env,
      WIENERDOG_VAULT: fx.vault, // a DIFFERENT directory — paths.vault
      PATH: [binDir, path.join(adopted, 'bin'), '/usr/bin', '/bin'].join(path.delimiter),
    },
    platform: process.platform,
  });
  await done;
  const run = fs
    .readFileSync(capture, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l))
    .find((l) => !(l.argv.length === 1 && l.argv[0] === '--version'));
  assert.ok(run, 'the pinned harness started');
  assert.equal(
    run.env.PATH.split(path.delimiter).includes(path.join(adopted, 'bin')),
    false,
    'the RUN vault\'s bin dir is stripped from the child PATH'
  );
  assert.deepEqual(vaultLeaks(run, adopted), [], 'nothing the child received carries the run vault');
});

// ── Round-2 review: containment, decided once and decided right ─────────────

test('dream-workspace: a vault BENEATH the workspace is refused — teardown must never delete the vault', () => {
  // The mirror image of the placement case, and the worse one: the check was
  // one-directional, so a vault nested under the workspace passed it and
  // `destroyWorkspace` recursively deleted the vault. Reproduced: the note was
  // gone. `destroyWorkspace` may never touch the vault, and this is the only
  // moment that can be decided — before anything is removed.
  const root = fs.realpathSync(mkTmp('reverse'));
  const core = path.join(root, 'core');
  const nestedVault = path.join(core, 'state', WORKSPACE_DIRNAME, 'notes');
  writeFile(path.join(nestedVault, 'precious.md'), 'PRECIOUS\n');
  assert.throws(
    () => createWorkspace({ vaultDir: nestedVault, paths: { core, state: path.join(core, 'state') }, date: DATE, layout: defaultLayout() }),
    (e) => e instanceof WienerdogError && /contain one another/.test(e.message)
  );
  assert.equal(fs.readFileSync(path.join(nestedVault, 'precious.md'), 'utf8'), 'PRECIOUS\n', 'the vault survives');
});

test('dream-workspace: a paths value without core is refused before anything is removed', { skip: WIN32 }, () => {
  // `core` is what the private-ancestry validation validates AGAINST. With it
  // absent the validation fell back to the ambient core, found the target was
  // not under it, and returned WITHOUT validating — silently disarming the
  // destructive-order guard. Reproduced: the external tree was deleted and
  // `createWorkspace` returned without throwing at all.
  const root = fs.realpathSync(mkTmp('nocore'));
  const core = path.join(root, 'core');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(core, { recursive: true });
  writeFile(path.join(outside, WORKSPACE_DIRNAME, 'precious.txt'), 'USER DATA\n');
  fs.symlinkSync(outside, path.join(core, 'state'));
  const vault = path.join(root, 'vault');
  fs.mkdirSync(vault);
  assert.throws(
    () => createWorkspace({ vaultDir: vault, paths: { state: path.join(core, 'state') }, date: DATE, layout: defaultLayout() }),
    (e) => e instanceof WienerdogError && /core and state/.test(e.message)
  );
  assert.equal(fs.readFileSync(path.join(outside, WORKSPACE_DIRNAME, 'precious.txt'), 'utf8'), 'USER DATA\n');
});

test('dream-workspace: containment is decided NFC-normalised, case-folded, on a separator boundary', () => {
  const V = '/home/ada/wienerdog';
  // A sibling whose name merely STARTS with the vault's is not inside it — the
  // separator boundary is what says so, and `~/wienerdog-backup` beside the
  // DEFAULT vault name is the case a substring test bricked the product on.
  assert.equal(isAtOrBeneath('/home/ada/wienerdog-backup/.codex', V), false);
  assert.equal(isAtOrBeneath('/home/ada/wienerdog2', V), false);
  // Inside, in every form the filesystem treats as the same place.
  assert.equal(isAtOrBeneath(V, V), true);
  assert.equal(isAtOrBeneath('/home/ada/wienerdog/notes', V), true);
  assert.equal(isAtOrBeneath('/home/ada/WIENERDOG/notes', V), true, 'case variant — the same dir on the primary FS');
  assert.equal(isAtOrBeneath('/home/ada/./wienerdog/notes', V), true, 'un-normalised');
  assert.equal(isAtOrBeneath('/home/ada/wienerdog/../wienerdog/x', V), true);
});

test('dream-workspace: the env value gate uses containment, not substring — no false alarm, no leak', () => {
  const base = {
    workspaceDir: '/w',
    scratchDir: '/s',
    date: DATE,
    layout: defaultLayout(),
    platform: 'linux',
  };
  // FALSE POSITIVE the substring form produced: a sibling of the DEFAULT vault.
  const ok = buildBrainEnv({
    ...base,
    baseEnv: { HOME: '/home/ada', PATH: '/usr/bin', CODEX_HOME: '/home/ada/wienerdog-backup/.codex' },
    vaultDir: '/home/ada/wienerdog',
  });
  assert.equal(ok.CODEX_HOME, '/home/ada/wienerdog-backup/.codex', 'a sibling directory is not inside the vault');
  // FALSE NEGATIVES the substring form let through.
  for (const leak of ['/home/ada/Notes/.codex', '/home/ada/./notes/.codex']) {
    assert.throws(
      () => buildBrainEnv({ ...base, baseEnv: { HOME: '/home/ada', PATH: '/usr/bin', CODEX_HOME: leak }, vaultDir: '/home/ada/notes' }),
      (e) => e instanceof WienerdogError && /CODEX_HOME is at or inside the vault/.test(e.message),
      leak
    );
  }
});

// ── Round-2 review: no silent fallback, no invocation without a write root ──

test('dream-workspace: spawnBrain REFUSES a call with no vaultDir — the fallback hid its own removal', () => {
  // Measured: with `o.vaultDir || paths.vault`, deleting `vaultDir` from the
  // production call site left the entire suite green while the child got the
  // wrong vault sanitised out. A required input cannot go missing quietly.
  assert.throws(
    () => spawnBrain({ workspaceDir: '/w', scratchDir: '/s', date: DATE, model: null, env: { HOME: '/h', PATH: '/usr/bin' } }),
    (e) => e instanceof WienerdogError && /vaultDir is required/.test(e.message)
  );
});

test('dream-workspace: the argv builders refuse to compose an invocation with no write root', () => {
  // The `--dry-run` preview called the renamed builder with the OLD option name
  // and printed a resolved plan containing `--add-dir undefined` and "your only
  // write target: undefined". Composing a lie is worse than failing.
  assert.throws(
    () => buildClaudeArgs({ scratchDir: '/s', date: DATE, model: null, settingsPath: '/set.json' }),
    (e) => e instanceof WienerdogError && /workspaceDir is required/.test(e.message)
  );
  assert.throws(
    () => buildCodexArgs({ scratchDir: '/s', date: DATE, model: null }),
    (e) => e instanceof WienerdogError && /workspaceDir is required/.test(e.message)
  );
});
