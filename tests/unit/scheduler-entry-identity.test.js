'use strict';

// WP-scheduler-entry-identity — a scheduler entry's health is the IDENTITY of the
// program the OS will actually execute, not the fact that a record exists.
//
// AUTHORITATIVE ARTIFACT for every assertion in this file: the OS scheduler's own
// record of what it will run (`launchctl print` / `schtasks /query … /xml`
// output), fed in as canned stdout through the read seam. The schedule FILE on
// disk is deliberately never read as evidence — in the incident the file was
// perfectly correct for weeks while the loaded record was poisoned, so a file
// check is exactly the wrong artifact.
//
// No test here deletes WIENERDOG_TEST_NO_REAL_SCHEDULER (Table C R1): injecting
// `opts.run` is what gets past defaultProbe's neutralizer steps, so schedulerSpawn's
// throw stays armed for every test and an un-stubbed heal fails loudly instead of
// mutating the maintainer's per-user-global launchd.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { getPaths } = require('../../src/core/paths');
const manifestLib = require('../../src/core/manifest');
const jobsLib = require('../../src/scheduler/jobs');
const gen = require('../../src/scheduler/generators');
const status = require('../../src/scheduler/status');
const schedule = require('../../src/cli/schedule');

const isPosix = process.platform !== 'win32';

// Hermeticity: CI may set XDG_CONFIG_HOME to the real ~/.config, which
// systemdUserDir() prefers over $HOME.
delete process.env.XDG_CONFIG_HOME;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** An isolated temp core + manifest. No real ~/.wienerdog is touched.
 *  @param {(home:string)=>object[]} [makeEntries] */
function setup(makeEntries = () => []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-entry-identity-'));
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  manifestLib.save(paths, {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [{ kind: 'dir', path: paths.core }, ...makeEntries(root)],
  });
  return { root, paths };
}

/** Minimal config so jobsLib can read/upsert jobs. */
function withConfig(paths, jobs = []) {
  fs.writeFileSync(paths.config, 'version: 1\nvault: /x/vault\n');
  for (const j of jobs) jobsLib.saveJob(paths, { at: '03:30', run: 'builtin:dream', timeoutMinutes: 20, ...j });
}

const laPath = (paths, name) => path.join(gen.launchAgentsDir(paths.home), `ai.wienerdog.${name}.plist`);

/** A canned `launchctl print` record. The `arguments` block is TAB-indented on a
 *  real machine and every line must be trimmed by the parser, so it is rendered
 *  that way here. args[0] is the EXECUTION position, args[1] the LAUNCHER. */
function printOut(args) {
  return [
    'com.apple.xpc.launchd.user.domain.501.100.Aqua/ai.wienerdog.dream = {',
    '\tactive count = 0',
    '\targuments = {',
    ...args.map((a) => `\t\t${a}`),
    '\t}',
    '\truns = 76',
    '\tlast exit code = 1',
    '}',
    '',
  ].join('\n');
}

/** A read seam that answers BOTH the presence query and the identity query with
 *  the same canned record (on darwin the two argvs are byte-identical). */
const cannedRun = (stdout, exitStatus = 0) => () => ({ status: exitStatus, stdout });

// Windows fixture constants — every "must match" argline is built by the REAL
// writer (gen.windowsCmdArguments), never hand-written, so a checker that drifts
// from the writer breaks a test instead of passing quietly.
const WIN_CORE = 'C:\\Users\\bob\\.wienerdog';
const WIN_LAUNCHER = path.win32.join(WIN_CORE, 'launcher', 'launch.js');
const WIN_NODE = 'C:\\Program Files\\nodejs\\node.exe';
const WIN_HOME = 'C:\\Users\\bob';
const WIN_LAUNCH_ARGS = [
  'dream',
  '--descriptor',
  'C:\\Users\\bob\\.wienerdog\\state\\descriptors\\dream.json',
  '--expect-digest',
  'sha256:5ab9a40deadbeef',
];

/** Canonical `<Arguments>` from the shipping writer. */
function argline(o = {}) {
  const core = o.core === undefined ? WIN_CORE : o.core;
  return gen.windowsCmdArguments({
    node: o.node || WIN_NODE,
    launcher: o.launcher || path.win32.join(core, 'launcher', 'launch.js'),
    home: o.home || WIN_HOME,
    core,
    launchArgs: o.launchArgs || WIN_LAUNCH_ARGS,
  });
}

const innerOf = (a) => a.match(/^\/d \/s \/v:off \/c "([\s\S]*)"$/)[1];
const wrapInner = (inner) => `/d /s /v:off /c "${inner}"`;

/** Split a canonical argline into its bind chain and its exec segment. */
function parts(a) {
  const inner = innerOf(a);
  const i = inner.lastIndexOf(' & "');
  return { binds: inner.slice(0, i), exec: inner.slice(i + 3) };
}
const rebuild = (binds, exec) => wrapInner(`${binds} & ${exec}`);

/** A `schtasks /query /tn … /xml` document. Every <Command>/<Arguments> value is
 *  XML-ESCAPED, because that is what the real tool prints and what
 *  parseWindowsTaskExec unescapes on the way back in. */
function taskXml(command, args, extra) {
  const exec = (c, a) =>
    `    <Exec>\n      <Command>${gen.windowsXmlEscape(c)}</Command>\n` +
    `      <Arguments>${gen.windowsXmlEscape(a)}</Arguments>\n    </Exec>`;
  const actions = extra ? `${exec(extra.command, extra.arguments)}\n${exec(command, args)}` : exec(command, args);
  return `<?xml version="1.0" encoding="UTF-16"?>\n<Task version="1.2">\n  <Actions Context="Author">\n${actions}\n  </Actions>\n</Task>\n`;
}

const winTargets = (command, args, expectLauncher = WIN_LAUNCHER, extra) =>
  gen.loadedEntryTargets(taskXml(command, args, extra), 'schtasks', expectLauncher);

/** A recording loader (Table C R2): pushes its argv and returns a canned status
 *  WITHOUT spawning. It also records whether state/scheduler-status.json existed
 *  and parsed AT THE MOMENT OF THE CALL, so the pre-destructive-marker criteria
 *  are assertions about the file at the first call, never about it afterwards. */
function recordingLoader(paths, exitStatus = 0) {
  /** @type {string[][]} */ const calls = [];
  /** @type {Array<{exists:boolean, parsed:object|null}>} */ const seen = [];
  const loader = (a) => {
    calls.push(a);
    let parsed = null;
    try { parsed = JSON.parse(fs.readFileSync(status.statusPath(paths), 'utf8')); } catch { parsed = null; }
    seen.push({ exists: fs.existsSync(status.statusPath(paths)), parsed });
    return { status: exitStatus };
  };
  return { calls, seen, loader };
}

// ---------------------------------------------------------------------------
// generators.loadedEntryTargets — launchd
// ---------------------------------------------------------------------------

test("entry-identity: launchd mismatch when arguments[1] is not this install's launcher", () => {
  // Reads the OS's OWN loaded record (launchctl print stdout) — the artifact that
  // was poisoned in the incident while the .plist on disk stayed correct.
  const mine = '/Users/u/.wienerdog/launcher/launch.js';
  const poisoned = printOut(['/opt/node/bin/node', '/var/folders/x/T/wd-negative/core/launcher/launch.js', 'dream']);
  const bad = gen.loadedEntryTargets(poisoned, 'launchd', mine);
  assert.equal(bad.verdict, 'mismatch');
  assert.equal(bad.exec, '/opt/node/bin/node', 'the execution position is REPORTED even alongside a mismatch');

  const good = gen.loadedEntryTargets(printOut(['/opt/node/bin/node', mine, 'dream']), 'launchd', mine);
  assert.equal(good.verdict, 'match');
  assert.equal(good.exec, '/opt/node/bin/node');

  // Indeterminate shapes: no block, no closing brace, fewer than two arguments.
  assert.deepEqual(gen.loadedEntryTargets('no arguments block here', 'launchd', mine), { verdict: 'indeterminate', exec: null });
  const truncated = '\targuments = {\n\t\t/opt/node/bin/node\n';
  assert.deepEqual(gen.loadedEntryTargets(truncated, 'launchd', mine), { verdict: 'indeterminate', exec: null });
  const oneArg = gen.loadedEntryTargets(printOut(['/opt/node/bin/node']), 'launchd', mine);
  assert.equal(oneArg.verdict, 'indeterminate');
  assert.equal(oneArg.exec, '/opt/node/bin/node');

  // systemd is never called (defaultProbe step 6 returns unknown first); if it is,
  // it must still be inert.
  assert.deepEqual(gen.loadedEntryTargets(printOut(['/a', mine]), 'systemd', mine), { verdict: 'indeterminate', exec: null });
});

// ---------------------------------------------------------------------------
// generators.loadedEntryTargets — schtasks
// ---------------------------------------------------------------------------

test('entry-identity: schtasks does NOT match a task whose Command is not our cmd.exe and whose launcher token is only inside the set-chain', () => {
  // The executed hijack shape (AC-1 (i)): powershell as <Command>, our launcher
  // MENTIONED in a set "VAR=…" value, a different launcher actually executed. A
  // substring test for the launcher token matches this; identity must not.
  const hijack = argline({ home: WIN_LAUNCHER, launcher: 'C:\\evil\\launch.js' });
  assert.ok(hijack.includes(WIN_LAUNCHER), 'the fixture really does mention our launcher inside the chain');
  const r = winTargets('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', hijack);
  assert.equal(r.verdict, 'indeterminate', '(a) fails: the executed program is not our cmd.exe');

  // (iii) two <Exec> actions — parseWindowsTaskExec pairs independently, so a
  // multi-action task is refused by condition (0) BEFORE the parser is consulted.
  const two = winTargets(gen.windowsCmdExePath(), argline(), WIN_LAUNCHER, {
    command: 'C:\\evil\\first.exe',
    arguments: '/c whatever',
  });
  assert.equal(two.verdict, 'indeterminate');

  // (iv) an odd double-quote count in the inner string is unparseable → fail closed.
  const odd = wrapInner(`${innerOf(argline())}"`);
  assert.equal(winTargets(gen.windowsCmdExePath(), odd).verdict, 'indeterminate');

  // Never throws, even when cmdQuotedToken would (a `"` in the expectation).
  assert.deepEqual(
    winTargets(gen.windowsCmdExePath(), argline(), 'C:\\ev"il\\launch.js'),
    { verdict: 'indeterminate', exec: null }
  );
});

test('entry-identity: schtasks (c0) binds to the canonical set, and (d) outranks it', () => {
  const cmd = gen.windowsCmdExePath();
  const canonical = argline();
  assert.equal(winTargets(cmd, canonical).verdict, 'match', 'control: the writer\'s own output matches');

  const { binds, exec } = parts(canonical);

  // rule 3 — the poisoned-binding shape. A SHAPE-based (c0) scores this `match`
  // while node loads the attacker's module inside the launcher's OWN process
  // before launch.js runs, ahead of every WP-157 check.
  const poisonedBind = binds.replace('set "NODE_OPTIONS="', 'set "NODE_OPTIONS=--require C:\\evil.js"');
  assert.notEqual(poisonedBind, binds, 'the fixture really was rewritten');
  assert.equal(winTargets(cmd, rebuild(poisonedBind, exec)).verdict, 'indeterminate');

  // rule 2 — an EXTRA bind, and a MISSING one.
  assert.equal(winTargets(cmd, rebuild(`${binds} & set "FOO=1"`, exec)).verdict, 'indeterminate');
  const dropped = binds.replace(' & set "CODEX_HOME="', '');
  assert.notEqual(dropped, binds);
  assert.equal(winTargets(cmd, rebuild(dropped, exec)).verdict, 'indeterminate');

  // rule 1 — a PREPENDED command (AC-1 (ii)). cmd.exe runs it FIRST, and every
  // other condition still passes, so only a by-name bind check catches it.
  assert.equal(winTargets(cmd, rebuild(`evil.exe & ${binds}`, exec)).verdict, 'indeterminate');
  assert.equal(winTargets(cmd, rebuild(`"evil.exe" & ${binds}`, exec)).verdict, 'indeterminate');

  // EVALUATION ORDER: a foreign launcher in the launcher position AND a foreign
  // core in the bind (the incident's temp-core shape) is `mismatch`, not
  // `indeterminate` — (d) is evaluated before (c0) so a hijack stays the loudest
  // verdict the taxonomy has.
  const foreignCore = 'C:\\Temp\\wd-negative-UezlJP\\core';
  const hijacked = winTargets(cmd, argline({ core: foreignCore }), WIN_LAUNCHER);
  assert.equal(hijacked.verdict, 'mismatch');

  // rule 4c — a HEALTHY non-default core. assertSafeOverride returns WIENERDOG_HOME
  // verbatim while launcherPath normalizes, so these two skews are real installs;
  // a raw comparison would warn forever and re-register on every sync.
  for (const core of ['C:\\Users\\bob\\.wienerdog\\', 'C:/Users/bob/.wienerdog']) {
    const launcher = path.win32.join(core, 'launcher', 'launch.js');
    assert.equal(winTargets(cmd, argline({ core, launcher }), launcher).verdict, 'match', `healthy core ${core}`);
  }

  // rule 4a — NON-CANONICAL SPELLINGS of the right directory. resolve() alone
  // accepts these; our own writer provably cannot emit them (getPaths throws on
  // the first and collapses the second), so `indeterminate` is the honest grade.
  for (const core of ['C:\\Users\\bob\\.wienerdog\\child\\..', 'C:\\Users\\bob\\.wienerdog\\.\\']) {
    const launcher = path.win32.join(core, 'launcher', 'launch.js');
    assert.equal(launcher, WIN_LAUNCHER, 'path.win32.join collapses the component, so the EXPECTATION is canonical');
    assert.equal(winTargets(cmd, argline({ core, launcher }), launcher).verdict, 'indeterminate', `spelling ${core}`);
  }
});

test("entry-identity: schtasks exec grammar shares cmdArgToken's bare alphabet and rejects every unquoted operator", () => {
  const cmd = gen.windowsCmdExePath();
  const canonical = argline();
  const { binds, exec } = parts(canonical);

  // The CONVERSE direction: every token the writer really emits BARE (dream,
  // --expect-digest, sha256:…) must still be accepted, so tightening BARE away
  // from cmdArgToken breaks this rather than passing quietly.
  assert.equal(winTargets(cmd, canonical).verdict, 'match');
  for (const t of ['dream', '--expect-digest', 'sha256:5ab9a40deadbeef']) {
    assert.equal(gen.cmdArgToken(t), t, `the writer emits ${t} bare`);
    assert.ok(canonical.includes(` ${t}`), 'the canonical fixture really carries it');
  }

  // THE CLOSURE FAMILY. `"` is excluded — it is the region delimiter the split
  // walk consumes. For every metacharacter: (1) the SHIPPING writer would never
  // emit it bare, and (2) injecting it unquoted is rejected in both positions.
  for (const ch of ['&', '|', '<', '>', '(', ')', '^', '%']) {
    assert.ok(gen.cmdArgToken(ch).startsWith('"'), `cmdArgToken double-quotes ${ch} — it is outside the bare charset`);
    assert.equal(
      winTargets(cmd, rebuild(binds, `${exec}${ch}C:\\evil.exe`)).verdict,
      'indeterminate',
      `${ch} appended to the exec segment`
    );
    assert.equal(
      winTargets(cmd, rebuild(binds.replace('set "CODEX_HOME="', `set "CODEX_HOME="${ch}evil`), exec)).verdict,
      'indeterminate',
      `${ch} injected between two binds`
    );
  }

  // (viii) the three executed append vectors, by name. The THIRD has no operator
  // character at all — it is what proves the fix is the END ANCHOR and not an
  // operator filter, so it must not be dropped.
  for (const tail of ['&C:\\evil.exe', '|C:\\evil.exe', ' C:\\evil.exe']) {
    assert.equal(winTargets(cmd, rebuild(binds, `${exec}${tail}`)).verdict, 'indeterminate', `append ${tail}`);
  }

  // (v) a launcher AND a home containing ' & ' still match — the quote-aware split
  // is the whole reason, and the shipping windowsLoadedTaskMatches gets this right
  // today, so a regression here would be strictly worse than main.
  const ampCore = 'C:\\Users\\Bob & Alice\\.wienerdog';
  const ampLauncher = path.win32.join(ampCore, 'launcher', 'launch.js');
  assert.equal(
    winTargets(cmd, argline({ core: ampCore, launcher: ampLauncher, home: 'C:\\Users\\Bob & Alice' }), ampLauncher).verdict,
    'match'
  );

  // (vi) node legitimately moves on upgrade: a DIFFERENT node path still matches,
  // and its value is what step 8b consumes.
  const moved = winTargets(cmd, argline({ node: 'C:\\nvm\\v22\\node.exe' }));
  assert.equal(moved.verdict, 'match');
  assert.equal(moved.exec, 'C:\\nvm\\v22\\node.exe');
});

test('entry-identity: schtasks reports a substituted execution position instead of judging it (Residual 9)', () => {
  // RESIDUAL 9, stated as an executable boundary: loadedEntryTargets decides the
  // verdict from the LAUNCHER position only. A substituted-but-existing executable
  // in the node position still grades `match`; whether it may run is step 8b's
  // question (existence) and nothing more. An implementer who "fixes" this to
  // `mismatch` has silently taken a design decision routed to
  // WP-scheduler-stable-exec-position.
  const r = winTargets(gen.windowsCmdExePath(), argline({ node: 'C:\\evil\\fake-node.exe' }));
  assert.deepEqual(r, { verdict: 'match', exec: 'C:\\evil\\fake-node.exe' });
});

// ---------------------------------------------------------------------------
// generators.deriveIdentityArgv
// ---------------------------------------------------------------------------

test('entry-identity: deriveIdentityArgv returns a per-kind identity query, and null for a foreign basename', { skip: !isPosix }, () => {
  const uid = process.getuid();
  assert.deepEqual(gen.deriveIdentityArgv('/h/Library/LaunchAgents/ai.wienerdog.dream.plist', 'darwin'), {
    kind: 'launchd',
    argv: ['launchctl', 'print', `gui/${uid}/ai.wienerdog.dream`],
  });
  // systemd is RECOGNIZED but its identity query is declared unimplemented — that
  // is what distinguishes it from a fourth scheduler someone forgot to add.
  assert.deepEqual(gen.deriveIdentityArgv('/h/.config/systemd/user/wienerdog-dream.timer', 'linux'), {
    kind: 'systemd',
    argv: null,
  });
  assert.deepEqual(gen.deriveIdentityArgv('C:\\c\\schedules\\wienerdog-dream.xml', 'win32'), {
    kind: 'schtasks',
    argv: ['schtasks', '/query', '/tn', '\\Wienerdog\\dream', '/xml'],
  });
  assert.equal(gen.deriveIdentityArgv('/h/Library/LaunchAgents/com.apple.thing.plist', 'darwin'), null);
  assert.equal(gen.deriveIdentityArgv('/h/.config/systemd/user/wienerdog-dream.service', 'linux'), null);
  assert.equal(gen.deriveIdentityArgv('/x/foreign.txt', 'darwin'), null);
});

// ---------------------------------------------------------------------------
// status.defaultProbe — the taxonomy
// ---------------------------------------------------------------------------

const dreamExpect = (launcher) => ({
  launcher,
  kind: 'launchd',
  identityArgv: ['launchctl', 'print', 'gui/501/ai.wienerdog.dream'],
});
const PRESENCE = ['launchctl', 'print', 'gui/501/ai.wienerdog.dream'];

test('entry-identity: defaultProbe returns mismatched for an exit-0 record naming a foreign launcher', () => {
  const mine = '/Users/u/.wienerdog/launcher/launch.js';
  const expect = dreamExpect(mine);

  // The incident: launchctl print EXITS 0 for a hijacked record, so a presence
  // probe reports `loaded`. Identity reports the truth.
  const foreign = printOut([process.execPath, '/var/folders/x/T/wd-negative/core/launcher/launch.js', 'dream']);
  assert.equal(status.defaultProbe(PRESENCE, expect, { run: cannedRun(foreign) }), 'mismatched');

  // A match on a record whose execution position exists → loaded.
  const good = printOut([process.execPath, mine, 'dream']);
  assert.equal(status.defaultProbe(PRESENCE, expect, { run: cannedRun(good) }), 'loaded');

  // A non-zero PRESENCE exit is still `missing` (unchanged semantics), and a spawn
  // error likewise.
  assert.equal(status.defaultProbe(PRESENCE, expect, { run: () => ({ status: 3 }) }), 'missing');
  assert.equal(status.defaultProbe(PRESENCE, expect, { run: () => ({ status: null, error: new Error('x') }) }), 'missing');

  // A FAILING identity query, and an indeterminate one, are both `unverified` —
  // never a health claim.
  let n = 0;
  const failIdentity = () => (n++ === 0 ? { status: 0, stdout: '' } : { status: 1, stdout: '' });
  assert.equal(status.defaultProbe(PRESENCE, expect, { run: failIdentity }), 'unverified');
  assert.equal(status.defaultProbe(PRESENCE, expect, { run: cannedRun('no arguments block') }), 'unverified');

  // SEAM GATING: the SAME input yields `unknown` with no run seam (the suite guard
  // var is set, and never deleted here) and a real verdict with one.
  assert.equal(status.defaultProbe(PRESENCE, expect, {}), 'unknown');
  const saved = process.env.WIENERDOG_LOADER_NOOP;
  process.env.WIENERDOG_LOADER_NOOP = '1';
  try {
    assert.equal(status.defaultProbe(PRESENCE, expect, {}), 'unknown');
  } finally {
    // Restore to ABSENT: spawn.js returns {status:0} for this var BEFORE the
    // guard var's throw, so leaking it would disarm the backstop for every test
    // that follows.
    if (saved === undefined) delete process.env.WIENERDOG_LOADER_NOOP;
    else process.env.WIENERDOG_LOADER_NOOP = saved;
  }
});

test('entry-identity: defaultProbe with NO expectation returns unverified, never loaded', () => {
  const good = printOut([process.execPath, '/Users/u/.wienerdog/launcher/launch.js', 'dream']);
  const run = cannedRun(good);
  // A probe that cannot say WHAT will run must not claim health — this is the
  // fail-CLOSED default, and it also covers a derivation skew (a basename
  // deriveProbeArgv recognizes and deriveIdentityArgv does not).
  assert.equal(status.defaultProbe(PRESENCE, undefined, { run }), 'unverified');
  assert.equal(status.defaultProbe(PRESENCE, null, { run }), 'unverified');
  assert.equal(status.defaultProbe(PRESENCE, { kind: 'launchd', identityArgv: PRESENCE }, { run }), 'unverified');
  assert.equal(status.defaultProbe(PRESENCE, { launcher: '/a/b', identityArgv: PRESENCE }, { run }), 'unverified');
});

test('entry-identity: a systemd entry yields unknown, not a health claim', () => {
  // The scheduler kind is RECOGNIZED and its identity query is declared
  // unimplemented (Residual 1) — no line, no callout, no heal, no churn.
  const expect = { launcher: '/Users/u/.wienerdog/launcher/launch.js', kind: 'systemd', identityArgv: null };
  assert.equal(status.defaultProbe(['systemctl', '--user', 'is-active', 'wienerdog-dream.timer'], expect, {
    run: () => ({ status: 0, stdout: 'active\n' }),
  }), 'unknown');
});

test('entry-identity: defaultProbe grades a record whose execution position no longer exists as mismatched', () => {
  // Reads the OS's own record of what it will START. A `brew upgrade node && brew
  // cleanup` deletes the version-pinned execPath the entry was registered with:
  // the plist stays correct, args[1] stays our launcher, launchctl print still
  // exits 0 — and every fire dies in posix_spawn before a line of our code runs.
  const mine = '/Users/u/.wienerdog/launcher/launch.js';
  const expect = dreamExpect(mine);
  const gone = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-gone-node-'));
  const goneNode = path.join(gone, 'node');
  fs.writeFileSync(goneNode, '#!/bin/sh\n');
  fs.rmSync(gone, { recursive: true, force: true });
  assert.equal(fs.existsSync(goneNode), false, 'the execution position really is absent');

  assert.equal(status.defaultProbe(PRESENCE, expect, { run: cannedRun(printOut([goneNode, mine, 'dream'])) }), 'mismatched');
  // The SAME fixture with an existing execution position → loaded, so this
  // criterion discriminates on existence alone.
  assert.equal(status.defaultProbe(PRESENCE, expect, { run: cannedRun(printOut([process.execPath, mine, 'dream'])) }), 'loaded');
});

test('entry-identity: defaultProbe reaches the identity query with NO run seam (subprocess)', () => {
  // Every other identity assertion runs through an injected opts.run, so all of
  // them stay green if step 7 calls a bare `run(…)` — which is null on every
  // PRODUCTION call. This drives the production path in a child whose env omits
  // both neutralizers.
  const statusModule = path.resolve(__dirname, '..', '..', 'src', 'scheduler', 'status.js');
  const mine = '/Users/u/.wienerdog/launcher/launch.js';
  const foreign = path.join(os.tmpdir(), 'wd-foreign', 'launcher', 'launch.js');

  const build = (launcherInRecord) => {
    const record = printOut([process.execPath, launcherInRecord, 'dream']);
    // The child requires no CLI module, and both argvs are node one-liners, so no
    // scheduler client is ever spawned and no mutation is reachable — which is
    // what makes running it without the backstop inert BY CONSTRUCTION rather
    // than by luck. (spawn.js IS in the child's require.cache, reached through
    // status.js -> generators.js; it is loaded but never called.)
    const SCRIPT = [
      `const s = require(${JSON.stringify(statusModule)});`,
      `const expect = { launcher: ${JSON.stringify(mine)}, kind: 'launchd',`,
      `  identityArgv: [process.execPath, '-e', ${JSON.stringify(`process.stdout.write(${JSON.stringify(record)})`)}] };`,
      "process.stdout.write(s.defaultProbe([process.execPath, '-e', 'process.exit(0)'], expect));",
    ].join('\n');
    const { WIENERDOG_LOADER_NOOP: _a, WIENERDOG_TEST_NO_REAL_SCHEDULER: _b, ...childEnv } = process.env;
    return spawnSync(process.execPath, ['-e', SCRIPT], { env: childEnv, encoding: 'utf8' });
  };

  const ok = build(mine);
  assert.equal(ok.status, 0, `child exited ${ok.status}: ${ok.stderr}`);
  assert.equal(ok.stdout, 'loaded');
  const bad = build(foreign);
  assert.equal(bad.status, 0, `child exited ${bad.status}: ${bad.stderr}`);
  assert.equal(bad.stdout, 'mismatched');
});

// ---------------------------------------------------------------------------
// probeAll / doctor / digest
// ---------------------------------------------------------------------------

test('entry-identity: probeAll reports mismatched end-to-end for a poisoned loaded record', { skip: !isPosix }, () => {
  // THE INCIDENT REGRESSION. The entry lives under the TEST's own LaunchAgents
  // root (probeAll gates on lexical containment derived from paths.home), and the
  // file itself need not exist — only the manifest record.
  const { paths } = setup((home) => [{
    kind: 'scheduler-entry',
    path: path.join(gen.launchAgentsDir(home), 'ai.wienerdog.dream.plist'),
    unload: ['launchctl', 'bootout', 'gui/501/ai.wienerdog.dream'],
  }]);
  const foreign = path.join(os.tmpdir(), 'wd-negative', 'core', 'launcher', 'launch.js');

  const poisoned = status.probeAll(paths, { platform: 'darwin', run: cannedRun(printOut([process.execPath, foreign, 'dream'])) });
  assert.equal(poisoned.length, 1, 'the entry is in root and IS probed');
  assert.equal(poisoned[0].status, 'mismatched');

  const healthy = status.probeAll(paths, {
    platform: 'darwin',
    run: cannedRun(printOut([process.execPath, gen.launcherPath(paths), 'dream'])),
  });
  assert.equal(healthy.length, 1);
  assert.equal(healthy[0].status, 'loaded');
});

test('entry-identity: doctorSchedulerChecks maps mismatched to fail', { skip: !isPosix }, () => {
  const names = ['dream', 'catchup', 'digest', 'weekly', 'triage'];
  const { paths } = setup((home) => names.map((n) => ({
    kind: 'scheduler-entry',
    path: path.join(gen.launchAgentsDir(home), `ai.wienerdog.${n}.plist`),
    unload: ['launchctl', 'bootout', `gui/501/ai.wienerdog.${n}`],
  })));
  const byName = { dream: 'loaded', catchup: 'missing', digest: 'mismatched', weekly: 'unverified', triage: 'unknown' };
  const probe = (argv) => byName[argv[2].replace('gui/', '').split('/')[1].replace('ai.wienerdog.', '')];

  const out = status.doctorSchedulerChecks(paths, { platform: 'darwin', probe });
  assert.deepEqual(out, [
    { status: 'ok', msg: "scheduled job 'dream' is loaded (launchd)" },
    {
      status: 'warn',
      msg: "scheduled job 'catchup' is configured but NOT loaded in launchd — run 'wienerdog sync' to reload it",
    },
    {
      status: 'fail',
      msg: "scheduled job 'digest' is registered in launchd but the program it would run is not this Wienerdog "
        + "install's, or no longer exists on this computer, so it cannot work — run 'wienerdog sync' to re-register "
        + 'it from this install',
    },
    {
      status: 'warn',
      msg: "scheduled job 'weekly' is registered in launchd but Wienerdog could not read back the program it runs, "
        + "so it cannot confirm the entry belongs to this install — run 'wienerdog sync' to re-register it, then "
        + "'wienerdog doctor' again",
    },
  ], "'unknown' emits no line at all");
});

test('entry-identity: digest emits template F for a mismatched entry', { skip: !isPosix }, () => {
  const names = ['dream', 'catchup', 'digest'];
  const { paths } = setup((home) => names.map((n) => ({
    kind: 'scheduler-entry',
    path: path.join(gen.launchAgentsDir(home), `ai.wienerdog.${n}.plist`),
    unload: ['launchctl', 'bootout', `gui/501/ai.wienerdog.${n}`],
  })));
  const byName = { dream: 'mismatched', catchup: 'unverified', digest: 'missing' };
  const probe = (argv) => byName[argv[2].split('/')[2].replace('ai.wienerdog.', '')];
  status.refreshSchedulerStatus(paths, { platform: 'darwin', probe });

  const line = status.renderSchedulerStatusLine(paths);
  const blocks = line.split('\n\n');
  assert.equal(blocks.length, 3, 'three distinct callouts, blank-line separated (a single \\n would merge them)');
  assert.match(blocks[0], /^> \[!warning\] Wienerdog: the scheduled job "dream" is registered in your computer's scheduler, but the program it would run is either not part of this Wienerdog installation or no longer on this computer, so it cannot run\. Run 'wienerdog sync' to re-register it from this installation\.$/);
  assert.match(blocks[1], /^> \[!warning\] Wienerdog: Wienerdog could not read back what your computer's scheduler will actually run for the scheduled job "catchup", so it cannot confirm it is still wired to this installation\. Run 'wienerdog sync' to re-register it, then run 'wienerdog doctor'\.$/);
  assert.match(blocks[2], /^> \[!warning\] Wienerdog: the scheduled job "digest" is set up but not currently active/);

  // The single-missing output stays BYTE-IDENTICAL to today's.
  const { paths: p2 } = setup((home) => [{
    kind: 'scheduler-entry',
    path: path.join(gen.launchAgentsDir(home), 'ai.wienerdog.dream.plist'),
    unload: ['launchctl', 'bootout', 'gui/501/ai.wienerdog.dream'],
  }]);
  status.refreshSchedulerStatus(p2, { platform: 'darwin', probe: () => 'missing' });
  assert.equal(
    status.renderSchedulerStatusLine(p2),
    '> [!warning] Wienerdog: the scheduled job "dream" is set up but not currently active in your computer\'s '
    + "scheduler. Run 'wienerdog sync' to reactivate it. (This can happen after some system updates.)"
  );

  // Empty when every bucket is empty.
  status.refreshSchedulerStatus(p2, { platform: 'darwin', probe: () => 'loaded' });
  assert.equal(status.renderSchedulerStatusLine(p2), '');
});

// ---------------------------------------------------------------------------
// The darwin replacement (Table E)
// ---------------------------------------------------------------------------

test('entry-identity: reloadJob replaces a bootstrap-blocked label (darwin)', { skip: !isPosix }, () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const uid = process.getuid();
  const plistPath = laPath(paths, 'dream');

  // launchd REFUSES a bootstrap for an already-loaded label; without a teardown a
  // hijacked record can never be replaced and the `mismatched` remediation
  // ("run wienerdog sync") would be a lie.
  /** @type {string[][]} */ const calls = [];
  const loader = (a) => (calls.push(a), { status: a[1] === 'bootstrap' && calls.length === 1 ? 1 : 0 });
  const ok = schedule.reloadJob(paths, { name: 'dream', at: '03:30' }, loader, 'darwin');
  assert.equal(ok, true, 'the SECOND bootstrap decides the result');
  assert.deepEqual(calls, [
    ['launchctl', 'bootstrap', `gui/${uid}`, plistPath],
    ['launchctl', 'bootout', `gui/${uid}/ai.wienerdog.dream`],
    ['launchctl', 'bootstrap', `gui/${uid}`, plistPath],
  ]);

  // repairCatchup's darwin branch uses the same replacement.
  const cuPath = laPath(paths, 'catchup');
  /** @type {string[][]} */ const cu = [];
  const cuLoader = (a) => (cu.push(a), { status: a[1] === 'bootstrap' && cu.length === 1 ? 1 : 0 });
  schedule.repairCatchup(paths, manifestLib.load(paths), { loader: cuLoader, platform: 'darwin', probe: () => 'missing' });
  assert.deepEqual(cu, [
    ['launchctl', 'bootstrap', `gui/${uid}`, cuPath],
    ['launchctl', 'bootout', `gui/${uid}/ai.wienerdog.catchup`],
    ['launchctl', 'bootstrap', `gui/${uid}`, cuPath],
  ]);
});

test('entry-identity: reloadJob issues NO bootout when the first bootstrap succeeds', { skip: !isPosix }, () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  // BOOTSTRAP FIRST: the `missing` case costs one spawn and never reaches a
  // destructive step, so a working-but-unverifiable entry is never destroyed by a
  // heal that then fails.
  const { calls, loader } = recordingLoader(paths, 0);
  assert.equal(schedule.reloadJob(paths, { name: 'dream', at: '03:30' }, loader, 'darwin'), true);
  assert.deepEqual(calls, [['launchctl', 'bootstrap', `gui/${process.getuid()}`, laPath(paths, 'dream')]]);
});

// ---------------------------------------------------------------------------
// reloadMissing — heal set, expect construction, pre-destructive marker
// ---------------------------------------------------------------------------

/** A run seam that answers with a canned launchd record naming `launcher`. */
const recordRun = (launcher, exec = process.execPath) => cannedRun(printOut([exec, launcher, 'dream']));

test('entry-identity: reloadMissing heals a configured job whose loaded record names a foreign launcher', { skip: !isPosix }, () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const foreign = path.join(os.tmpdir(), 'wd-negative', 'core', 'launcher', 'launch.js');
  const { calls, loader } = recordingLoader(paths, 0);

  const res = status.reloadMissing(paths, { loader, platform: 'darwin', run: recordRun(foreign) });

  assert.deepEqual(calls, [['launchctl', 'bootstrap', `gui/${process.getuid()}`, laPath(paths, 'dream')]]);
  // The return value is the RUNTIME check that opts.loader was really injected:
  // an omitted loader hits schedulerSpawn's throw, which reloadMissing swallows
  // into `failed`, leaving the recorded list empty rather than raising.
  assert.deepEqual(res, { reloaded: ['dream'], failed: [] });
});

test('entry-identity: reloadMissing heals NOTHING when the loaded record names this install\'s launcher (no opts.probe)', { skip: !isPosix }, () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const { calls, loader } = recordingLoader(paths, 0);

  const res = status.reloadMissing(paths, { loader, platform: 'darwin', run: recordRun(gen.launcherPath(paths)) });

  // Passing a null expectation would make every entry `unverified` — which is IN
  // the heal set — so only this NEGATIVE assertion can redden that mutation.
  assert.deepEqual(calls, []);
  assert.deepEqual(res, { reloaded: [], failed: [] });
});

test('entry-identity: reloadMissing heals an unverified entry', { skip: !isPosix }, () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const { calls, loader } = recordingLoader(paths, 0);
  // opts.probe is permitted here: this exercises HEAL_SET membership, not the
  // expectation construction.
  const res = status.reloadMissing(paths, { loader, platform: 'darwin', probe: () => 'unverified' });
  assert.deepEqual(calls, [['launchctl', 'bootstrap', `gui/${process.getuid()}`, laPath(paths, 'dream')]]);
  assert.deepEqual(res, { reloaded: ['dream'], failed: [] });
});

test('entry-identity: reloadMissing writes the durable marker even for an observed missing entry', { skip: !isPosix }, () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const { calls, seen, loader } = recordingLoader(paths, 0);
  assert.equal(fs.existsSync(status.statusPath(paths)), false, 'no cache before the call');

  // Observed `missing` (a non-zero PRESENCE exit). The marker is written anyway,
  // because that verdict can be a TRANSIENT presence-query failure on a label the
  // very next bootout will destroy (Table E row 2).
  const res = status.reloadMissing(paths, { loader, platform: 'darwin', run: () => ({ status: 1 }) });

  assert.equal(calls.length, 1, 'the replacement really happened');
  assert.equal(seen[0].exists, true, 'the durable marker was written BEFORE the first replacement call');
  assert.ok(seen[0].parsed && typeof seen[0].parsed.checked_at === 'string');
  assert.ok(seen[0].parsed && Array.isArray(seen[0].parsed.entries));
  assert.deepEqual(res, { reloaded: ['dream'], failed: [] });
});

test('entry-identity: reloadMissing writes no marker when nothing enters the heal set', { skip: !isPosix }, () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const { calls, loader } = recordingLoader(paths, 0);
  status.reloadMissing(paths, { loader, platform: 'darwin', probe: () => 'loaded' });
  assert.deepEqual(calls, []);
  // The marker is tied to a REACHABLE replacement call, not to the act of calling
  // reloadMissing.
  assert.equal(fs.existsSync(status.statusPath(paths)), false);
});

test('entry-identity: reloadMissing issues zero loader calls for a healthy entry', { skip: !isPosix }, () => {
  // A gate assertion, NOT an idempotence proof: this never runs `wienerdog sync`,
  // and the real CLI's second-run behaviour is not exercised anywhere in this WP.
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }, { name: 'digest', at: '07:00' }]);
  const { calls, loader } = recordingLoader(paths, 0);
  const res = status.reloadMissing(paths, { loader, platform: 'darwin', probe: () => 'loaded' });
  assert.deepEqual(calls, []);
  assert.deepEqual(res, { reloaded: [], failed: [] });
});

// ---------------------------------------------------------------------------
// repairCatchup — the SECOND destructive site (the entry that was hijacked)
// ---------------------------------------------------------------------------

test('entry-identity: repairCatchup writes the durable marker before its first replacement call', { skip: !isPosix }, () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const { calls, seen, loader } = recordingLoader(paths, 0);
  assert.equal(fs.existsSync(status.statusPath(paths)), false, 'no cache before the call');

  // Called DIRECTLY (not through repointSchedules, which prepends per-job loader
  // calls and registers the catch-up entry twice, so "the first loader call" would
  // not be an assertion about repairCatchup at all).
  schedule.repairCatchup(paths, manifestLib.load(paths), { loader, platform: 'darwin', run: () => ({ status: 1 }) });

  assert.equal(calls.length, 1, 'the replacement really happened');
  assert.equal(seen[0].exists, true, 'the durable marker was written BEFORE the first replacement call');
  assert.ok(seen[0].parsed && typeof seen[0].parsed.checked_at === 'string');
});

test('entry-identity: repairCatchup repairs a poisoned loaded catchup record', { skip: !isPosix }, () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const foreign = path.join(os.tmpdir(), 'wd-negative', 'core', 'launcher', 'launch.js');
  const { calls, loader } = recordingLoader(paths, 0);

  schedule.repairCatchup(paths, manifestLib.load(paths), { loader, platform: 'darwin', run: recordRun(foreign) });

  assert.deepEqual(calls, [['launchctl', 'bootstrap', `gui/${process.getuid()}`, laPath(paths, 'catchup')]]);
});

test("entry-identity: repairCatchup repairs NOTHING when the loaded catchup record names this install's launcher (no opts.probe)", { skip: !isPosix }, () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const { calls, loader } = recordingLoader(paths, 0);

  const r = schedule.repairCatchup(paths, manifestLib.load(paths), {
    loader, platform: 'darwin', run: recordRun(gen.launcherPath(paths)),
  });

  assert.deepEqual(r, {});
  assert.deepEqual(calls, [], 'the catch-up entry is the exact one that was hijacked 76 times — this is its gate');
});

test('entry-identity: repairCatchup heals every member of the heal set and nothing else', { skip: !isPosix }, () => {
  const run = (member) => {
    const { paths } = setup();
    withConfig(paths, [{ name: 'dream' }]);
    const { calls, loader } = recordingLoader(paths, 0);
    schedule.repairCatchup(paths, manifestLib.load(paths), { loader, platform: 'darwin', probe: () => member });
    return calls;
  };
  for (const member of ['missing', 'mismatched', 'unverified']) {
    assert.equal(run(member).length, 1, `${member} is healed`);
  }
  for (const member of ['loaded', 'unknown']) {
    assert.deepEqual(run(member), [], `${member} is left alone`);
  }

  // The win32 branch gates identically.
  const runWin = (member) => {
    const { paths } = setup();
    withConfig(paths, [{ name: 'dream' }]);
    const { calls, loader } = recordingLoader(paths, 0);
    schedule.repairCatchup(paths, manifestLib.load(paths), { loader, platform: 'win32', probe: () => member });
    return calls;
  };
  for (const member of ['missing', 'mismatched', 'unverified']) {
    assert.equal(runWin(member).length, 1, `win32: ${member} is healed`);
  }
  for (const member of ['loaded', 'unknown']) {
    assert.deepEqual(runWin(member), [], `win32: ${member} is left alone`);
  }
});

test('entry-identity: repairCatchup emits the "restored the missing" notice only for an observed missing entry', { skip: !isPosix }, () => {
  const repair = (member, exitStatus) => {
    const { paths } = setup();
    withConfig(paths, [{ name: 'dream' }]);
    const { calls, loader } = recordingLoader(paths, exitStatus);
    const r = schedule.repairCatchup(paths, manifestLib.load(paths), { loader, platform: 'darwin', probe: () => member });
    return { r, calls };
  };

  // A SUCCESSFUL repair. The shipped string names "the MISSING catch-up
  // registration" — emitting it for a hijacked or unreadable entry states
  // something false, and adopt.js turns ANY notice into a user-facing adoption
  // failure, which on Windows (where any round-trip deviation grades unverified)
  // would report failure on a healthy install.
  const ok = repair('missing', 0);
  assert.deepEqual(ok.r, { notice: 'restored the missing catch-up registration.' });
  assert.ok(ok.calls.length > 0);
  for (const member of ['mismatched', 'unverified']) {
    const q = repair(member, 0);
    assert.deepEqual(q.r, {}, `${member}: no notice`);
    assert.equal('notice' in q.r, false);
    assert.ok(q.calls.length > 0, `${member}: the repair still HAPPENED — only the notice differs`);
  }

  // FAILURE notices are unchanged for every member: a repair the OS rejected is a
  // real failure and adopt should still flag it.
  for (const member of ['missing', 'mismatched', 'unverified']) {
    assert.deepEqual(repair(member, 1).r, {
      notice: "catch-up entry rewritten but the OS scheduler did not accept it — run 'wienerdog doctor'.",
    });
  }
});

// ---------------------------------------------------------------------------
// Drift prevention
// ---------------------------------------------------------------------------

test('entry-identity: launcherPathFor delegates to generators.launcherPath (no drift)', () => {
  // The health probe's EXPECTATION and the path the entry is REGISTERED with must
  // be the same string by construction — a hand-copied second join is exactly how
  // a checker and a writer drift apart.
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const registered = schedule.reloadJob(paths, { name: 'dream', at: '03:30' }, () => ({ status: 0 }), 'darwin');
  assert.equal(registered, true);
  const written = fs.readFileSync(laPath(paths, 'dream'), 'utf8');
  assert.ok(written.includes(gen.launcherPath(paths)), 'the REGISTERED entry carries generators.launcherPath');
  assert.equal(gen.launcherPath(paths), path.join(paths.core, 'launcher', 'launch.js'));
});
