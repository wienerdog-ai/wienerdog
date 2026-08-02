'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');
const manifestLib = require('../../src/core/manifest');
const jobsLib = require('../../src/scheduler/jobs');
const gen = require('../../src/scheduler/generators');
const vendor = require('../../src/core/vendor');
const schedule = require('../../src/cli/schedule');
const { allowAll } = require('../../src/core/safety-profile');

// A fully-blocked profile (the pre-0.10.0 frozen shape). The released profile now
// defaults to all-allowed, so a bare `add --skill` is no longer refused. Passing this
// via the `profile` seam still exercises the A0 fail-closed refusal.
const BLOCKED = Object.freeze(Object.fromEntries(
  ['google-setup', 'gws-use', 'external-content-routine', 'daily-summary-injection', 'identity-auto-activation']
    .map((g) => [g, 'blocked'])
));

// Hermeticity: CI sets XDG_CONFIG_HOME to the real ~/.config, which
// systemdUserDir() prefers over $HOME. Unset it (this file runs in its own
// `node --test` process) so systemd units resolve under the temp HOME, never a
// real dir — and so parallel test files never collide on a shared unit path.
delete process.env.XDG_CONFIG_HOME;

/** @param {string} c @returns {string} */
function sha256(c) {
  return crypto.createHash('sha256').update(c).digest('hex');
}

const BASE_CONFIG = `# Wienerdog configuration
version: 1
vault: /Users/ada/wienerdog
harnesses:
  claude: true
  codex: false
memory_mode: standard
`;

/** Build an isolated temp core with a config + matching manifest. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sched-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.writeFileSync(paths.config, BASE_CONFIG);
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [
      { kind: 'dir', path: paths.core },
      { kind: 'file', path: paths.config, hash: sha256(BASE_CONFIG) },
    ],
  };
  manifestLib.save(paths, manifest);
  return { root, env, paths };
}

/**
 * Run schedule.run with process.env pointed at the temp core (getPaths reads env).
 * @param {{HOME:string, WIENERDOG_HOME:string}} env
 * @param {string[]} argv
 * @param {(a:string[])=>{status:number}} loader
 * @param {Record<string,string>} [profile] code seam (see safety-profile.js); a plain
 *   `undefined` preserves the frozen behavior for every existing caller byte-for-byte.
 */
async function runSchedule(env, argv, loader, profile) {
  const saved = { HOME: process.env.HOME, WIENERDOG_HOME: process.env.WIENERDOG_HOME };
  process.env.HOME = env.HOME;
  process.env.WIENERDOG_HOME = env.WIENERDOG_HOME;
  try {
    await schedule.run(argv, { loader, profile });
  } finally {
    process.env.HOME = saved.HOME;
    process.env.WIENERDOG_HOME = saved.WIENERDOG_HOME;
  }
}

/**
 * Run `fn` with the single scheduler mutation chokepoint (schedulerSpawn)
 * replaced by a recording spy — reverseSchedulerEntry re-requires the module,
 * so mutating its export is observed. WP-145 re-derives unregister argvs from
 * the schedule file identity, which can produce REAL launchctl/systemctl/
 * schtasks commands even in tests; the spy guarantees nothing ever actually
 * spawns (the old marker-unload trick died with the stored-unload seam).
 * Await it even for synchronous `fn`.
 * @template T @param {() => (T | Promise<T>)} fn
 * @returns {Promise<{result:T, calls:string[][]}>}
 */
async function withSpawnSpy(fn) {
  const spawnMod = require('../../src/scheduler/spawn');
  const orig = spawnMod.schedulerSpawn;
  /** @type {string[][]} */ const calls = [];
  spawnMod.schedulerSpawn = (argv) => {
    calls.push(argv);
    return { status: 0 };
  };
  try {
    const result = await fn();
    return { result, calls };
  } finally {
    spawnMod.schedulerSpawn = orig;
  }
}

// -------------------------------------------------------------------------
// WP-scheduler-register-replaces-loaded-record: synthetic `launchctl print`
// stdout + a stateful fake launchd, shared by the new verified-register tests
// AND by every pre-existing darwin-path test whose loader was a blind
// `() => ({status:0})` — ADR-0037 now requires a LIVE readback before any
// register can report success, so a mock that never answers `print` truthfully
// can no longer be treated as "loaded" (see the WP's PR body, Decisions made).
// -------------------------------------------------------------------------

/** Reverse `xmlEscape` (generators.js) — `&` LAST so an already-decoded
 *  `<`/`>` is not re-processed. @param {string} s @returns {string} */
function xmlUnescapeSimple(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * Build synthetic `launchctl print` stdout matching the shape
 * darwinLoadedVerdict / launchdLoadedCalendar / launchdLoadedEnv / the
 * top-level single-line reader parse (Current state §7b/§7c). Every field is
 * directly overridable so tests can construct deliberately-stale/foreign/
 * malformed records; `omit` drops a named single-line field entirely
 * (simulating an incomplete readback), and the `malformed*`/`triggerCount`/
 * `foreignStreamTrigger` knobs construct the parser-edge fixtures.
 * @param {{argv:string[], program?:string, env:Array<[string,string]>,
 *   hour:number|null, minute:number, path:string, stdoutPath:string,
 *   stderrPath:string, spawnType:string, omit?:string[],
 *   triggerCount?:number, foreignStreamTrigger?:boolean,
 *   malformedArgs?:boolean, malformedEnv?:boolean, malformedCalendar?:boolean,
 *   noHourEvenIfExpected?:boolean}} o
 * @returns {string}
 */
function buildPrintStdout(o) {
  const omit = new Set(o.omit || []);
  const lines = ['gui/501/some.label = {'];
  if (!omit.has('path')) lines.push(`\tpath = ${o.path}`);
  lines.push('\ttype = LaunchAgent');
  if (!omit.has('program')) lines.push(`\tprogram = ${o.program != null ? o.program : o.argv[0]}`);
  lines.push('\targuments = {');
  if (o.malformedArgs) {
    // Deliberately never closed, AND nothing follows — launchdLoadedArgs scans
    // for the NEXT trimmed '}' with no depth-tracking, so a later block's own
    // closing brace would otherwise be picked up as if it closed this one,
    // producing a garbled non-null array rather than a genuine parse failure.
    lines.push(`\t\t${o.argv[0] || ''}`);
    return `${lines.join('\n')}\n`;
  }
  for (const a of o.argv) lines.push(`\t\t${a}`);
  lines.push('\t}');
  if (!omit.has('stdoutPath')) lines.push(`\tstdout path = ${o.stdoutPath}`);
  if (!omit.has('stderrPath')) lines.push(`\tstderr path = ${o.stderrPath}`);
  // Real `launchctl print` output precedes the real `environment = {` block
  // with `inherited environment = {` and `default environment = {` (§7b fact
  // 2) — both empty here, and both end with the same characters as the real
  // anchor, which is exactly what pins that the anchor must be a TRIMMED
  // EXACT-LINE match, never a suffix match.
  lines.push('\tinherited environment = {');
  lines.push('\t}');
  lines.push('\tdefault environment = {');
  lines.push('\t}');
  lines.push('\tenvironment = {');
  if (o.malformedEnv) {
    // Never closed, and truncated here for the same reason as malformedArgs.
    return `${lines.join('\n')}\n`;
  }
  for (const [k, v] of o.env) lines.push(`\t\t${k} => ${v}`);
  lines.push('\t\tOSLogRateLimit => 64');
  lines.push('\t\tXPC_SERVICE_NAME => some.label');
  lines.push('\t}');
  lines.push('\tevent triggers = {');
  if (o.malformedCalendar) {
    // Never closed, and truncated here for the same reason as malformedArgs.
    return `${lines.join('\n')}\n`;
  }
  {
    const count = o.triggerCount != null ? o.triggerCount : 1;
    for (let i = 0; i < count; i += 1) {
      const isCalendar = !o.foreignStreamTrigger || i === 0;
      lines.push(`\t\tsome.label.${i} => {`);
      lines.push(`\t\t\tstream = ${isCalendar ? 'com.apple.launchd.calendarinterval' : 'com.apple.notifyd.matching'}`);
      if (isCalendar) {
        lines.push('\t\t\tdescriptor = {');
        if (o.hour !== null && !o.noHourEvenIfExpected) lines.push(`\t\t\t\t"Hour" => ${o.hour}`);
        lines.push(`\t\t\t\t"Minute" => ${o.minute}`);
        lines.push('\t\t\t}');
      }
      lines.push('\t\t}');
    }
    lines.push('\t}');
  }
  if (!omit.has('spawnType')) lines.push(`\tspawn type = ${o.spawnType} (5)`);
  lines.push('\tproperties = inferred program');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

/**
 * Parse OUR OWN rendered plist XML (launchdPlist/catchupPlist) back into
 * `buildPrintStdout`'s input shape, so a test can simulate "launchd loaded
 * exactly the bytes on disk" without hand-writing a fixture. @param {string} xml
 * @param {string} plistPath @returns {string} */
function printStdoutFromPlistXml(xml, plistPath) {
  const argsM = xml.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  const argv = argsM
    ? Array.from(argsM[1].matchAll(/<string>([\s\S]*?)<\/string>/g)).map((m) => xmlUnescapeSimple(m[1]))
    : [];
  const envM = xml.match(/<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/);
  const env = [];
  if (envM) {
    const re = /<key>([^<]*)<\/key>\s*<string>([\s\S]*?)<\/string>/g;
    let m;
    while ((m = re.exec(envM[1]))) env.push([xmlUnescapeSimple(m[1]), xmlUnescapeSimple(m[2])]);
  }
  const calM = xml.match(/<key>StartCalendarInterval<\/key>\s*<dict>([\s\S]*?)<\/dict>/);
  let hour = null;
  let minute = 0;
  if (calM) {
    const hm = calM[1].match(/<key>Hour<\/key>\s*<integer>(-?\d+)<\/integer>/);
    const mm = calM[1].match(/<key>Minute<\/key>\s*<integer>(-?\d+)<\/integer>/);
    if (hm) hour = Number(hm[1]);
    if (mm) minute = Number(mm[1]);
  }
  const outM = xml.match(/<key>StandardOutPath<\/key>\s*<string>([\s\S]*?)<\/string>/);
  const errM = xml.match(/<key>StandardErrorPath<\/key>\s*<string>([\s\S]*?)<\/string>/);
  return buildPrintStdout({
    argv,
    program: argv[0] || '',
    env,
    hour,
    minute,
    path: plistPath,
    stdoutPath: outM ? xmlUnescapeSimple(outM[1]) : '',
    stderrPath: errM ? xmlUnescapeSimple(errM[1]) : '',
    spawnType: 'background',
  });
}

/**
 * A minimal STATEFUL fake launchd for tests that do not exercise this WP's
 * readback mechanics directly — every pre-existing darwin-path test whose
 * purpose is "does add()/repointSchedules() succeed", not "what does the
 * verified-registration postcondition do". Tracks which labels are "loaded"
 * and the exact plist bytes each was loaded with: `print` reports absent
 * (status 113, mirroring the measured exit code — Current state §7) for a
 * label never bootstrapped, or a synthetic stdout built from the bytes at its
 * last successful `bootstrap`; `bootstrap` "loads" the label from whatever is
 * CURRENTLY on disk at the given plist path and succeeds; `bootout` unloads
 * it. Every non-`launchctl` call (systemctl/schtasks/plutil) succeeds, so this
 * is also a safe drop-in on a systemd Linux host. @param {import('../../src/core/paths').WienerdogPaths} paths
 * @returns {(argv:string[])=>{status:number, stdout?:string}} */
function fakeLaunchd(paths) {
  /** @type {Map<string,string>} */ const loaded = new Map(); // label -> plist XML at load time
  const labelOf = (gui) => (/^gui\/\d+\/(.+)$/.exec(gui || '') || [])[1] || null;
  const plistPathFor = (label) => path.join(paths.home, 'Library', 'LaunchAgents', `${label}.plist`);
  return (argv) => {
    if (argv[0] !== 'launchctl') return { status: 0 };
    if (argv[1] === 'print') {
      const label = labelOf(argv[2]);
      if (!label || !loaded.has(label)) return { status: 113 };
      return { status: 0, stdout: printStdoutFromPlistXml(loaded.get(label), plistPathFor(label)) };
    }
    if (argv[1] === 'bootstrap') {
      let xml;
      try {
        xml = fs.readFileSync(argv[3], 'utf8');
      } catch {
        return { status: 1 };
      }
      const labelM = xml.match(/<key>Label<\/key>\s*<string>([^<]*)<\/string>/);
      if (!labelM) return { status: 1 };
      loaded.set(labelM[1], xml);
      return { status: 0 };
    }
    if (argv[1] === 'bootout') {
      const label = labelOf(argv[2]);
      if (label) loaded.delete(label);
      return { status: 0 };
    }
    return { status: 0 };
  };
}

// Whether `schedule add` can register on this host (skip integration otherwise).
const SCHED_SUPPORTED =
  process.platform === 'darwin' ||
  (process.platform === 'linux' &&
    (fs.existsSync('/run/systemd/system') || !spawnSync('systemctl', ['--version']).error));

// Mirrors schedule.js's internal (unexported) hasSystemd() probe: registerPlatform's
// Linux branch throws on a host without systemd regardless of the injected `platform`
// param, so the WP-098 secondary-call-warning tests (which force platform:'linux' to
// exercise that branch directly) only run where the real host actually has systemd.
const LINUX_SYSTEMD =
  process.platform === 'linux' &&
  (fs.existsSync('/run/systemd/system') || !spawnSync('systemctl', ['--version']).error);

// -------------------------------------------------------------------------
// jobs.js: parseJobs / renderConfigWithJobs round-trip + coexistence
// -------------------------------------------------------------------------

test('scheduler-schedule: renderConfigWithJobs round-trips through parseJobs', () => {
  const jobs = [
    { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 },
    { name: 'daily-digest', at: '07:00', run: 'skill:wienerdog-daily-digest', timeoutMinutes: 15 },
  ];
  const withJobs = jobsLib.renderConfigWithJobs(BASE_CONFIG, jobs);
  assert.deepEqual(jobsLib.parseJobs(withJobs), jobs);
  // Exactly one blank line before the managed section.
  assert.match(withJobs, /memory_mode: standard\n\n# --- wienerdog:jobs/);
});

test('scheduler-schedule: content outside the jobs sentinels is byte-identical (grants coexist)', () => {
  const GRANTS = `# --- wienerdog:grants (managed) ---
grants:
  - gmail
# --- end wienerdog:grants ---
`;
  const configWithGrants = `${BASE_CONFIG}\n${GRANTS}`;
  const jobs = [{ name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 }];
  const withJobs = jobsLib.renderConfigWithJobs(configWithGrants, jobs);
  // Grants block survives verbatim.
  assert.ok(withJobs.includes(GRANTS));
  // Removing all jobs restores the exact input.
  const back = jobsLib.renderConfigWithJobs(withJobs, []);
  assert.equal(back, configWithGrants);
});

test('scheduler-schedule: removing all jobs removes the whole section', () => {
  const jobs = [{ name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 }];
  const withJobs = jobsLib.renderConfigWithJobs(BASE_CONFIG, jobs);
  const back = jobsLib.renderConfigWithJobs(withJobs, []);
  assert.equal(back, BASE_CONFIG);
  assert.ok(!back.includes('wienerdog:jobs'));
});

test('scheduler-schedule: saveJob upserts and re-syncs the manifest hash', () => {
  const { paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  assert.deepEqual(jobsLib.findJob(paths, 'dream'), {
    name: 'dream',
    at: '03:30',
    run: 'builtin:dream',
    timeoutMinutes: 20,
  });
  // Upsert (replace) same name.
  jobsLib.saveJob(paths, { name: 'dream', at: '04:00', run: 'builtin:dream', timeoutMinutes: 30 });
  assert.equal(jobsLib.listJobs(paths).length, 1);
  assert.equal(jobsLib.findJob(paths, 'dream').at, '04:00');
  // Manifest hash re-synced → matches on-disk config.
  const manifest = manifestLib.load(paths);
  const entry = manifest.entries.find((e) => e.path === paths.config);
  assert.equal(entry.hash, sha256(fs.readFileSync(paths.config, 'utf8')));
});

test('scheduler-schedule: removeJob is a no-op when the job is absent', () => {
  const { paths } = setup();
  const before = fs.readFileSync(paths.config, 'utf8');
  jobsLib.removeJob(paths, 'ghost');
  assert.equal(fs.readFileSync(paths.config, 'utf8'), before);
});

test('scheduler-schedule: schedule.json watermark read/write', () => {
  const { paths } = setup();
  assert.deepEqual(jobsLib.readScheduleState(paths), {});
  jobsLib.writeScheduleState(paths, 'dream', { last_success: '2026-07-03T03:30:12.000Z', last_status: 'ok' });
  jobsLib.writeScheduleState(paths, 'dream', { last_status: 'ok' });
  const state = jobsLib.readScheduleState(paths);
  assert.equal(state.dream.last_success, '2026-07-03T03:30:12.000Z');
  assert.equal(state.dream.last_status, 'ok');
});

// -------------------------------------------------------------------------
// manifest.js: scheduler-entry reverse (harmless marker command as the "spy")
// -------------------------------------------------------------------------

test('scheduler-schedule: reverseSchedulerEntry DERIVES the unregister argv — the stored unload never runs (WP-145)', async () => {
  const { root } = setup();
  const file = path.join(root, 'wienerdog-zz-test.timer');
  fs.writeFileSync(file, '[Timer]\n');
  const marker = path.join(root, 'unload-ran');
  const entry = {
    kind: 'scheduler-entry',
    path: file,
    unload: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
  };
  const removed = [];
  const skipped = [];
  const { calls } = await withSpawnSpy(() =>
    manifestLib.reverseSchedulerEntry(entry, false, removed, skipped, new Set(), {
      platform: 'linux',
      schedulerRoots: [root],
    })
  );
  assert.ok(!fs.existsSync(marker), 'the stored unload argv is NEVER executed (ADR-0027)');
  assert.deepEqual(calls, [['systemctl', '--user', 'disable', '--now', 'wienerdog-zz-test.timer']]);
  assert.ok(!fs.existsSync(file), 'file removed');
  assert.deepEqual(removed, [file]);
});

test('scheduler-schedule: reverseSchedulerEntry --dry-run runs nothing but reports', async () => {
  const { root } = setup();
  const file = path.join(root, 'wienerdog-zz-dry.timer');
  fs.writeFileSync(file, '[Timer]\n');
  const marker = path.join(root, 'dry-marker');
  const entry = {
    kind: 'scheduler-entry',
    path: file,
    unload: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
  };
  const removed = [];
  const { calls } = await withSpawnSpy(() =>
    manifestLib.reverseSchedulerEntry(entry, true, removed, [], new Set(), {
      platform: 'linux',
      schedulerRoots: [root],
    })
  );
  assert.ok(!fs.existsSync(marker), 'dry-run did not run the stored unload');
  assert.equal(calls.length, 0, 'dry-run spawns nothing');
  assert.ok(fs.existsSync(file), 'dry-run did not remove the file');
  assert.deepEqual(removed, [file]);
});

test('scheduler-schedule: manifest.reverse handles scheduler-entry (derived unregister + rm)', async () => {
  const { paths } = setup();
  // A platform-correct schedule file inside the REAL scheduler root, so both
  // the derivation and the WP-145 root bound fire on this host.
  let file;
  let expected;
  if (process.platform === 'darwin') {
    file = path.join(paths.home, 'Library', 'LaunchAgents', 'ai.wienerdog.zz-wd-test.plist');
    expected = ['launchctl', 'bootout', `gui/${process.getuid()}/ai.wienerdog.zz-wd-test`];
  } else if (process.platform === 'win32') {
    file = path.join(paths.core, 'schedules', 'wienerdog-zz-wd-test.xml');
    expected = ['schtasks', '/delete', '/tn', '\\Wienerdog\\zz-wd-test', '/f'];
  } else {
    file = path.join(paths.home, '.config', 'systemd', 'user', 'wienerdog-zz-wd-test.timer');
    expected = ['systemctl', '--user', 'disable', '--now', 'wienerdog-zz-wd-test.timer'];
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  const marker = path.join(paths.home, 'reverse-ran');
  const manifest = manifestLib.load(paths);
  manifestLib.record(manifest, {
    kind: 'scheduler-entry',
    path: file,
    unload: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
  });
  manifestLib.save(paths, manifest);
  const savedXdg = process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_CONFIG_HOME; // reverse() derives the systemd root from paths.home
  let out;
  try {
    out = await withSpawnSpy(() => manifestLib.reverse(paths, manifestLib.load(paths)));
  } finally {
    if (savedXdg !== undefined) process.env.XDG_CONFIG_HOME = savedXdg;
  }
  assert.ok(!fs.existsSync(marker), 'the stored unload argv never ran');
  assert.deepEqual(out.calls, [expected], 'the DERIVED unregister command reached the chokepoint');
  assert.ok(!fs.existsSync(file), 'reverse removed the entry file');
  assert.ok(out.result.removed.includes(file));
});

// -------------------------------------------------------------------------
// schedule.js: add / list / remove with a stubbed loader
// -------------------------------------------------------------------------

test('scheduler-schedule: add validates name, --at, and exactly-one-of skill/job', async () => {
  const { env } = setup();
  const loader = () => ({ status: 0 });
  await assert.rejects(runSchedule(env, ['add', 'Bad_Name', '--at', '07:00', '--job', 'dream'], loader));
  await assert.rejects(runSchedule(env, ['add', 'dream', '--at', '99:99', '--job', 'dream'], loader));
  await assert.rejects(runSchedule(env, ['add', 'dream', '--at', '07:00'], loader)); // neither skill nor job
  await assert.rejects(
    runSchedule(env, ['add', 'dream', '--at', '07:00', '--job', 'dream', '--skill', 's'], loader)
  ); // both
});

// -------------------------------------------------------------------------
// A0 pre-use freeze (WP-109/111): `--skill` routines are disabled — a fresh
// install cannot create or execute an external-content routine headlessly.
// -------------------------------------------------------------------------

test('scheduler-schedule: add --skill is refused under a blocked profile — no job written, no OS registration', async () => {
  const { env, paths } = setup();
  /** @type {string[][]} */ const calls = [];
  const loader = (argv) => {
    calls.push(argv);
    return { status: 0 };
  };

  await assert.rejects(
    runSchedule(env, ['add', 'daily-digest', '--at', '07:00', '--skill', 'x'], loader, BLOCKED),
    /disabled in this release/
  );

  assert.equal(jobsLib.listJobs(paths).find((j) => j.name === 'daily-digest'), undefined, 'no job was written');
  assert.equal(calls.length, 0, 'the OS scheduler was never registered');
});

test('scheduler-schedule: add registers the platform entry, records manifest, saves the job', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  /** @type {string[][]} */ const calls = [];
  const fake = fakeLaunchd(paths);
  const loader = (argv) => {
    calls.push(argv);
    return fake(argv);
  };

  await runSchedule(env, ['add', 'daily-digest', '--at', '07:00', '--skill', 'wienerdog-daily-digest'], loader, allowAll());

  // Job persisted with skill:<...> run and default timeout 15.
  assert.deepEqual(jobsLib.findJob(paths, 'daily-digest'), {
    name: 'daily-digest',
    at: '07:00',
    run: 'skill:wienerdog-daily-digest',
    timeoutMinutes: 15,
  });

  const manifest = manifestLib.load(paths);
  const schedEntries = manifest.entries.filter((e) => e.kind === 'scheduler-entry');
  // Every recorded scheduler file exists on disk.
  for (const e of schedEntries) assert.ok(fs.existsSync(e.path), `${e.path} exists`);
  // At least one loader call happened (bootstrap / enable).
  assert.ok(calls.length >= 1);

  if (process.platform === 'darwin') {
    const uid = process.getuid();
    const label = 'ai.wienerdog.daily-digest';
    const plistPath = path.join(paths.home, 'Library', 'LaunchAgents', `${label}.plist`);
    const jobEntry = schedEntries.find((e) => e.path === plistPath);
    assert.ok(jobEntry, 'per-job plist entry recorded');
    assert.deepEqual(jobEntry.unload, ['launchctl', 'bootout', `gui/${uid}/${label}`]);
    // ADR-0037: the readback now precedes the register — calls[0] is the
    // `print` (nothing loaded yet), and the bootstrap moves to calls[1].
    assert.deepEqual(calls[0], ['launchctl', 'print', `gui/${uid}/${label}`]);
    assert.deepEqual(calls[1], ['launchctl', 'bootstrap', `gui/${uid}`, plistPath]);
    // Catch-up plist ensured once.
    const catchPath = path.join(paths.home, 'Library', 'LaunchAgents', 'ai.wienerdog.catchup.plist');
    assert.ok(schedEntries.some((e) => e.path === catchPath), 'catch-up entry recorded');
    // WP-157: the entry invokes the out-of-tree launcher with the descriptor +
    // expect-digest, not the app bin's `run-job` directly.
    const plistText = fs.readFileSync(plistPath, 'utf8');
    assert.ok(plistText.includes(path.join(paths.core, 'launcher', 'launch.js')), 'entry invokes the out-of-tree launcher');
    assert.ok(plistText.includes('<string>--expect-digest</string>'), 'entry binds an expect-digest');
    assert.ok(!plistText.includes('<string>run-job</string>'), 'entry no longer invokes run-job directly');
  } else {
    const base = 'wienerdog-daily-digest';
    const dir = gen.systemdUserDir(paths.home, process.env);
    const timerPath = path.join(dir, `${base}.timer`);
    const servicePath = path.join(dir, `${base}.service`);
    const timerEntry = schedEntries.find((e) => e.path === timerPath);
    const serviceEntry = schedEntries.find((e) => e.path === servicePath);
    assert.ok(timerEntry && serviceEntry);
    assert.deepEqual(timerEntry.unload, ['systemctl', '--user', 'disable', '--now', `${base}.timer`]);
    assert.equal(serviceEntry.unload, undefined, 'the .service entry carries no unload');
    assert.deepEqual(calls[0], ['systemctl', '--user', 'daemon-reload']);
  }
});

// ADR-0037 (AC6 item 4): a register that cannot verify what the OS now holds
// must not skip the OS call without evidence — so an unchanged re-add is no
// longer a ZERO-call no-op. It costs exactly its per-platform verified-skip
// readback (Table A's third column, AC5(iii)): darwin ⇒ one read-only `print`
// per site (job + catch-up); linux ⇒ the idempotent `daemon-reload` +
// `enable --now`. Neither ever MUTATES.
test('scheduler-schedule: a second identical add is idempotent (no MUTATING OS call)', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  const fake = fakeLaunchd(paths);
  const calls1 = [];
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], (a) => (calls1.push(a), fake(a)));
  assert.ok(calls1.length >= 1);
  const calls2 = [];
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], (a) => (calls2.push(a), fake(a)));
  assert.equal(calls2.length, 2, 'the unchanged re-add costs exactly its per-platform verified-skip check, no more');
  assert.ok(
    calls2.every((a) => (a[0] === 'launchctl' ? a[1] === 'print' : a[0] === 'systemctl')),
    'no MUTATING OS call (no bootstrap/bootout, no schtasks /create) on an unchanged re-add'
  );
});

test('scheduler-schedule: add then manifest.reverse DEFERS config.yaml (hash re-synced, not mistaken for a user edit) (WP-088)', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], fakeLaunchd(paths));
  assert.ok(fs.existsSync(paths.config));
  // WP-088: config.yaml is a deferred-deletion-set member — reverse() NO LONGER
  // deletes it. A re-synced (unmodified) hash means it is recognized as our own
  // file and returned in deferredConfig (uninstall.js deletes it LAST), NOT kept
  // as a customized edit. The spawn spy is LOAD-BEARING here (WP-145): reverse
  // now DERIVES real launchctl/systemctl unregister argvs from the registered
  // schedule files' identities (ai.wienerdog.dream, ai.wienerdog.catchup — the
  // labels are per-user-global, NOT HOME-scoped), so without the spy this test
  // would bootout the developer's REAL agents when run outside the suite guard.
  const {
    result: { deferredConfig },
  } = await withSpawnSpy(() => manifestLib.reverse(paths, manifestLib.load(paths)));
  assert.equal(deferredConfig, paths.config, 'unmodified config is deferred (recognized), not mistaken for a user edit');
  assert.ok(fs.existsSync(paths.config), 'reverse() defers config.yaml; uninstall.js deletes it last');
});

test('scheduler-schedule: remove runs the unload, deletes files, drops entries and the job', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths, root } = setup();
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], fakeLaunchd(paths));

  // WP-145: poison the stored unloads with marker commands to prove they are
  // IGNORED; the remove flow derives the real unregister argv instead (the spy
  // captures it, so nothing ever actually spawns).
  const marker = path.join(root, 'remove-unload-ran');
  const manifest = manifestLib.load(paths);
  const jobBasenames = new Set([
    'ai.wienerdog.dream.plist',
    'wienerdog-dream.timer',
    'wienerdog-dream.service',
  ]);
  const jobFiles = [];
  for (const e of manifest.entries) {
    if (e.kind === 'scheduler-entry' && jobBasenames.has(path.basename(e.path))) {
      jobFiles.push(e.path);
      if (e.unload) {
        e.unload = [process.execPath, '-e', `require('fs').appendFileSync(${JSON.stringify(marker)}, 'x')`];
      }
    }
  }
  manifestLib.save(paths, manifest);

  const { calls } = await withSpawnSpy(() => runSchedule(env, ['remove', 'dream'], () => ({ status: 0 })));

  assert.ok(!fs.existsSync(marker), 'the stored (poisoned) unload never ran — the argv is derived (WP-145)');
  assert.ok(
    calls.every((argv) => ['launchctl', 'systemctl', 'schtasks'].includes(argv[0])),
    'only code-derived scheduler commands reach the chokepoint'
  );
  for (const f of jobFiles) assert.ok(!fs.existsSync(f), `${f} deleted`);
  assert.equal(jobsLib.findJob(paths, 'dream'), null, 'job dropped from config');
  const after = manifestLib.load(paths);
  const remainingJob = after.entries.filter(
    (e) => e.kind === 'scheduler-entry' && jobBasenames.has(path.basename(e.path))
  );
  assert.equal(remainingJob.length, 0, 'per-job scheduler entries removed from manifest');
});

test('scheduler-schedule: remove of an unknown job is a no-op notice', async () => {
  const { env } = setup();
  await runSchedule(env, ['remove', 'nope'], () => ({ status: 0 })); // must not throw
});

// -------------------------------------------------------------------------
// WP-098: secondary systemd calls (daemon-reload / enable-linger) warn to
// stderr on a nonzero OR missing result, without affecting `loaded` (still
// gated only on `enable --now`).
// -------------------------------------------------------------------------

/**
 * Capture process.stderr.write during `fn`, restoring it afterwards.
 * @template T @param {() => T} fn @returns {{result:T, stderr:string}}
 */
function captureStderr(fn) {
  let out = '';
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => ((out += s), true);
  try {
    return { result: fn(), stderr: out };
  } finally {
    process.stderr.write = orig;
  }
}

test('scheduler-schedule: registerPlatform warns on a NONZERO daemon-reload and a MISSING (undefined) enable-linger result', { skip: !LINUX_SYSTEMD }, () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const savedUser = process.env.USER;
  process.env.USER = 'ada';
  try {
    const loader = (argv) => {
      if (argv[0] === 'systemctl' && argv.includes('daemon-reload')) return { status: 1 }; // nonzero
      if (argv[0] === 'systemctl' && argv.includes('enable')) return { status: 0 }; // primary succeeds
      if (argv[0] === 'loginctl') return undefined; // MISSING result
      return { status: 0 };
    };
    const { result: res, stderr } = captureStderr(() =>
      schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'linux')
    );
    // ADR-0037: `loaded` is now `reloadOk && enableOk` — a degraded reload
    // fails the register even though `enable --now` itself succeeded.
    assert.equal(res.loaded, false, '`loaded` is `reloadOk && enableOk`; a degraded daemon-reload fails it');
    assert.match(stderr, /'systemctl --user daemon-reload' returned 1/, 'nonzero daemon-reload warns with its status');
    assert.match(stderr, /'loginctl enable-linger ada' returned no result/, 'a MISSING (undefined) result warns as "no result", not silence');
  } finally {
    if (savedUser === undefined) delete process.env.USER;
    else process.env.USER = savedUser;
  }
});

test('scheduler-schedule: registerPlatform warns on a MISSING ({status:null}) daemon-reload and a NONZERO enable-linger result', { skip: !LINUX_SYSTEMD }, () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const savedUser = process.env.USER;
  process.env.USER = 'ada';
  try {
    const loader = (argv) => {
      if (argv[0] === 'systemctl' && argv.includes('daemon-reload')) return { status: null }; // MISSING (null status)
      if (argv[0] === 'systemctl' && argv.includes('enable')) return { status: 0 }; // primary succeeds
      if (argv[0] === 'loginctl') return { status: 2 }; // nonzero
      return { status: 0 };
    };
    const { result: res, stderr } = captureStderr(() =>
      schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'linux')
    );
    // ADR-0037: `loaded` is now `reloadOk && enableOk` — a MISSING (null
    // status) reload also fails the register.
    assert.equal(res.loaded, false, '`loaded` is `reloadOk && enableOk`; a missing daemon-reload result fails it');
    assert.match(stderr, /'systemctl --user daemon-reload' returned no result/, 'a {status:null} result warns as "no result", not success');
    assert.match(stderr, /'loginctl enable-linger ada' returned 2/, 'nonzero enable-linger warns with its status');
  } finally {
    if (savedUser === undefined) delete process.env.USER;
    else process.env.USER = savedUser;
  }
});

test('scheduler-schedule: registerPlatform emits no secondary-call warnings when daemon-reload and enable-linger both succeed', { skip: !LINUX_SYSTEMD }, () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const savedUser = process.env.USER;
  process.env.USER = 'ada';
  try {
    const { stderr } = captureStderr(() =>
      schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, () => ({ status: 0 }), 'linux')
    );
    assert.equal(stderr, '', 'no warnings when every secondary call reports status 0');
  } finally {
    if (savedUser === undefined) delete process.env.USER;
    else process.env.USER = savedUser;
  }
});

// -------------------------------------------------------------------------
// WP-098: `remove()` reports the truthful outcome — removed.length in every
// branch, and a qualified "ran any recorded OS-unregister command(s)
// best-effort" statement, never "unloaded" / "already gone".
// -------------------------------------------------------------------------

test('scheduler-schedule: remove reports the zero-removal wording (nothing present, no "unloaded") and SPAWNS NOTHING for an out-of-root entry (F33 validate-before-spawn)', async () => {
  const { env, paths, root } = setup();
  const manifest = manifestLib.load(paths);
  // A recorded scheduler-entry with a RECOGNIZED basename but OUT of every
  // scheduler root (directly in HOME, not LaunchAgents). Post-F33, remove()
  // (via the shared reverser) validates containment BEFORE deriving/spawning, so
  // NO unregister command runs and the file is preserved — never the first-pass
  // "spawn then check" behavior.
  const file = path.join(root, `${gen.launchdLabel('ghost-job')}.plist`);
  fs.writeFileSync(file, 'x'); // exists, but out-of-root
  const marker = path.join(root, 'zero-removal-unload-ran');
  manifestLib.record(manifest, {
    kind: 'scheduler-entry',
    path: file,
    unload: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
  });
  manifestLib.save(paths, manifest);
  jobsLib.saveJob(paths, { name: 'ghost-job', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });

  let out = '';
  const origOut = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => ((out += s), true);
  let spyCalls;
  try {
    ({ calls: spyCalls } = await withSpawnSpy(() => runSchedule(env, ['remove', 'ghost-job'], () => ({ status: 0 }))));
  } finally {
    process.stdout.write = origOut;
  }

  assert.ok(!fs.existsSync(marker), 'the stored unload argv never runs (WP-145 derives instead)');
  assert.equal(spyCalls.length, 0, 'an out-of-root entry unregisters NOTHING (validate-before-spawn, F33)');
  assert.ok(fs.existsSync(file), 'the out-of-root file is preserved, not deleted');
  assert.match(out, /no schedule file was present to unregister or delete \(already absent\)/);
  assert.ok(!/unloaded/.test(out), 'never claims "unloaded"');
  assert.ok(!/already gone/i.test(out), 'never claims the OS entry was "already gone"');
  assert.equal(jobsLib.findJob(paths, 'ghost-job'), null, 'job definition still dropped');
});

test('scheduler-schedule: a normal removal reports removed.length (N=2), not the singular "its schedule file"', async () => {
  const { env, paths } = setup();
  const manifest = manifestLib.load(paths);
  // Two scheduler-entries (mirrors the Linux timer+service pair) whose files
  // exist inside the REAL systemd user root — WP-145's root bound requires it.
  const systemdDir = path.join(paths.home, '.config', 'systemd', 'user');
  fs.mkdirSync(systemdDir, { recursive: true });
  const timerPath = path.join(systemdDir, `${gen.systemdUnitBase('two-files')}.timer`);
  const servicePath = path.join(systemdDir, `${gen.systemdUnitBase('two-files')}.service`);
  fs.writeFileSync(timerPath, '[Timer]\n');
  fs.writeFileSync(servicePath, '[Service]\n');
  const marker = path.join(paths.home, 'two-files-unload-ran');
  manifestLib.record(manifest, {
    kind: 'scheduler-entry',
    path: timerPath,
    unload: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
  });
  manifestLib.record(manifest, { kind: 'scheduler-entry', path: servicePath, unload: null });
  manifestLib.save(paths, manifest);
  jobsLib.saveJob(paths, { name: 'two-files', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });

  const savedXdg = process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_CONFIG_HOME; // the systemd root must derive from paths.home
  let out = '';
  const origOut = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => ((out += s), true);
  try {
    await withSpawnSpy(() => runSchedule(env, ['remove', 'two-files'], () => ({ status: 0 })));
  } finally {
    process.stdout.write = origOut;
    if (savedXdg !== undefined) process.env.XDG_CONFIG_HOME = savedXdg;
  }

  assert.ok(!fs.existsSync(marker), 'the stored unload argv never runs (WP-145 derives instead)');
  assert.ok(!fs.existsSync(timerPath) && !fs.existsSync(servicePath), 'both files deleted');
  assert.match(out, /unregistered and deleted 2 schedule files best-effort/);
  assert.ok(!/its schedule file/.test(out), 'does not misreport with the singular "its schedule file"');
  assert.ok(!/unloaded/.test(out), 'never claims "unloaded"');
});

// -------------------------------------------------------------------------
// schedule.js: win32 dispatch via the injected `platform` seam (no real
// schtasks; POSIX-runnable). Covers the owner amendment (validator-before-
// renderer), the two-task registration/argv, idempotency, and remove().
// -------------------------------------------------------------------------

test('scheduler-schedule: win32 dispatch rejects a hostile job name BEFORE rendering XML or writing a file', () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  /** @type {string[][]} */ const calls = [];
  const loader = (a) => (calls.push(a), { status: 0 });
  const schedulesDir = gen.windowsTasksDir(paths);

  assert.throws(
    () => schedule.registerPlatform(paths, manifest, { name: 'foo&<bar>', hour: 3, minute: 30 }, loader, 'win32'),
    (err) => err instanceof WienerdogError
  );
  // Validator ran before any side effect: no XML written, no manifest entry, no loader call.
  const wrote = fs.existsSync(schedulesDir) && fs.readdirSync(schedulesDir).length > 0;
  assert.ok(!wrote, 'no XML file was written for the hostile name');
  assert.equal(
    manifest.entries.filter((e) => e.kind === 'scheduler-entry').length,
    0,
    'no scheduler-entry recorded for the hostile name'
  );
  assert.equal(calls.length, 0, 'the loader was never invoked');
});

test('scheduler-schedule: win32 dispatch writes both XMLs, records reversible entries, calls loader, returns schtasks', () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  /** @type {string[][]} */ const calls = [];
  const loader = (a) => (calls.push(a), { status: 0 });

  const res = schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'win32');
  assert.deepEqual(res, { platform: 'schtasks', changed: true, loaded: true });

  const dreamXml = gen.windowsTaskFile(paths, 'dream');
  const catchupXml = gen.windowsTaskFile(paths, 'catchup');
  assert.equal(path.dirname(dreamXml), gen.windowsTasksDir(paths));
  assert.ok(fs.existsSync(dreamXml) && fs.existsSync(catchupXml), 'both XML artifacts written under <core>/schedules');
  // Both files are UTF-16 LE with a BOM (schtasks rejects UTF-8): leading 0xFF 0xFE.
  const dreamBytes = fs.readFileSync(dreamXml);
  const catchupBytes = fs.readFileSync(catchupXml);
  assert.equal(dreamBytes[0], 0xff);
  assert.equal(dreamBytes[1], 0xfe);
  assert.equal(catchupBytes[0], 0xff);
  assert.equal(catchupBytes[1], 0xfe);
  // Decoding past the BOM yields the renderer strings (UTF-16 declaration, no LogonTrigger).
  const dreamText = dreamBytes.slice(2).toString('utf16le');
  const catchupText = catchupBytes.slice(2).toString('utf16le');
  assert.ok(dreamText.startsWith('<?xml version="1.0" encoding="UTF-16"?>'));
  assert.ok(dreamText.includes('<URI>\\Wienerdog\\dream</URI>'));
  // A7 hardening pass (ADR-0028 R16): both tasks' <Command> is the absolute
  // cmd.exe and the COMPLETE authorization command (env scrub/bind incl.
  // WIENERDOG_HOME/NODE_OPTIONS + node+launcher with the bound descriptor/digest)
  // is bound INLINE in the REGISTERED <Arguments> — never a reopened wrapper file.
  const cmdExe = gen.windowsCmdExePath();
  assert.ok(dreamText.includes(`<Command>${gen.windowsXmlEscape(cmdExe)}</Command>`), dreamText);
  assert.ok(catchupText.includes(`<Command>${gen.windowsXmlEscape(cmdExe)}</Command>`), catchupText);
  // The auth args are inline in <Arguments>, not a separate .cmd file. (This bare
  // test install has no vendored app yet, so --expect-digest is empty — the
  // launcher fails closed until a real `sync` binds a digest; the point is the
  // flag+descriptor are bound INLINE in the registered arguments.)
  assert.match(dreamText, /<Arguments>.*--descriptor.*--expect-digest/, dreamText);
  assert.match(dreamText, /set &quot;WIENERDOG_HOME=/, 'binds WIENERDOG_HOME inline (fix #2)');
  assert.match(dreamText, /set &quot;NODE_OPTIONS=&quot;/, 'clears NODE_OPTIONS inline before node');
  assert.match(catchupText, /<Arguments>.*--catch-up.*--expect-digest/, catchupText);
  assert.ok(!catchupText.includes('<LogonTrigger>'), 'catchup task carries no LogonTrigger');
  // No wrapper .cmd file is written or recorded — the trust anchor is the
  // registered <Arguments>, not a mutable file.
  assert.ok(!dreamText.includes('.cmd'), 'no wrapper .cmd referenced in the dream task');
  assert.ok(!catchupText.includes('.cmd'), 'no wrapper .cmd referenced in the catch-up task');
  assert.equal(manifest.entries.filter((e) => e.kind === 'file' && /\.cmd$/.test(e.path)).length, 0, 'no wrapper .cmd file manifest entry');

  const schedEntries = manifest.entries.filter((e) => e.kind === 'scheduler-entry');
  const dreamEntry = schedEntries.find((e) => e.path === dreamXml);
  const catchupEntry = schedEntries.find((e) => e.path === catchupXml);
  assert.ok(dreamEntry && catchupEntry, 'two scheduler entries recorded');
  assert.deepEqual(dreamEntry.unload, ['schtasks', '/delete', '/tn', '\\Wienerdog\\dream', '/f']);
  assert.deepEqual(catchupEntry.unload, ['schtasks', '/delete', '/tn', '\\Wienerdog\\catchup', '/f']);

  assert.deepEqual(calls, [
    ['schtasks', '/create', '/tn', '\\Wienerdog\\dream', '/xml', dreamXml, '/f'],
    ['schtasks', '/create', '/tn', '\\Wienerdog\\catchup', '/xml', catchupXml, '/f'],
  ]);
});

// A7 hardening 2 (ADR-0028): verified idempotency. An unchanged re-register no
// longer skips on the source-XML match alone — it QUERIES the LOADED task and
// skips `/create` ONLY when the loaded Command/Arguments verifiably equal
// canonical. A loader that reports the canonical loaded task ⇒ query, no /create,
// no file rewrite.
test('scheduler-schedule: a second win32 dispatch verifies the loaded task and skips /create when it matches (no rewrite)', () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, () => ({ status: 0 }), 'win32');
  manifestLib.save(paths, manifest);

  const dreamXml = gen.windowsTaskFile(paths, 'dream');
  const mtimeBefore = fs.statSync(dreamXml).mtimeMs;

  // A loader that answers `/query /xml` with the canonical on-disk task XML — i.e.
  // the LOADED task matches canonical, so the verified postcondition skips /create.
  const loadedXmlFor = (name) => {
    const buf = fs.readFileSync(gen.windowsTaskFile(paths, name));
    return buf.slice(2).toString('utf16le'); // past the UTF-16 BOM
  };
  /** @type {string[][]} */ const calls = [];
  const loader = (a) => {
    calls.push(a);
    if (a[1] === '/query') {
      const name = a[a.indexOf('/tn') + 1].split('\\').pop();
      try {
        return { status: 0, stdout: loadedXmlFor(name) };
      } catch {
        return { status: 1 };
      }
    }
    return { status: 0 };
  };
  const manifest2 = manifestLib.load(paths);
  const res = schedule.registerPlatform(paths, manifest2, { name: 'dream', hour: 3, minute: 30 }, loader, 'win32');
  assert.equal(res.changed, false, 'unchanged re-register reports changed:false');
  assert.ok(
    calls.every((a) => a[1] === '/query'),
    'the only loader calls are read-only /query verifications'
  );
  assert.equal(calls.filter((a) => a[1] === '/create').length, 0, 'no /create on a verified match');
  assert.equal(fs.statSync(dreamXml).mtimeMs, mtimeBefore, 'the XML file was not rewritten');
});

// The security-critical inverse (mutation-sensitive): when the LOADED task's args
// do NOT match canonical — a stale legacy-.cmd-wrapper task, a --job-digests-
// stripped catch-up task, or a prior /create that failed while an old task stayed
// loaded — an unchanged re-register RE-ISSUES `/create /f` (does not skip). Revert
// the fix to skip-on-XML-match and this assertion goes red.
test('scheduler-schedule: a second win32 dispatch RE-REGISTERS (/create /f) when the loaded task args do not match canonical', () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, () => ({ status: 0 }), 'win32');
  manifestLib.save(paths, manifest);

  const dreamXml = gen.windowsTaskFile(paths, 'dream');
  const catchupXml = gen.windowsTaskFile(paths, 'catchup');
  const mtimeBefore = fs.statSync(dreamXml).mtimeMs;

  // A stale/tampered loaded task for BOTH the dream and the catch-up: the query
  // returns a task whose <Arguments> were rewritten (here: the whole authorization
  // command replaced with an attacker payload). Neither matches canonical.
  const staleTaskXml =
    '<?xml version="1.0" encoding="UTF-16"?>\n<Task>\n  <Actions>\n    <Exec>\n' +
    '      <Command>C:\\Windows\\System32\\cmd.exe</Command>\n' +
    '      <Arguments>/c "start evil.exe"</Arguments>\n' +
    '    </Exec>\n  </Actions>\n</Task>\n';
  /** @type {string[][]} */ const calls = [];
  const loader = (a) => {
    calls.push(a);
    if (a[1] === '/query') return { status: 0, stdout: staleTaskXml };
    return { status: 0 };
  };
  const manifest2 = manifestLib.load(paths);
  const res = schedule.registerPlatform(paths, manifest2, { name: 'dream', hour: 3, minute: 30 }, loader, 'win32');

  assert.equal(res.changed, false, 'source XML unchanged (changed:false) — the skip path is what is under test');
  const creates = calls.filter((a) => a[1] === '/create');
  // Both the per-job dream AND the catch-up task are force-replaced with /create /f.
  assert.deepEqual(
    creates.map((a) => a[a.indexOf('/tn') + 1]).sort(),
    ['\\Wienerdog\\catchup', '\\Wienerdog\\dream'],
    'BOTH the stale dream and catch-up loaded tasks were force re-registered'
  );
  assert.ok(
    creates.every((a) => a.includes('/f')),
    'the force-replace flag /f is present on every re-register'
  );
  assert.equal(res.loaded, true, 'a successful force re-register reports loaded:true');
  assert.equal(fs.statSync(dreamXml).mtimeMs, mtimeBefore, 'the canonical XML file itself was not rewritten (only re-registered)');
});

// A7 hardening 2: a dead legacy .cmd/.ps1 wrapper (file + its manifest `file`
// entry) under <core>/schedules is removed on (re)register — it was a live mutable
// execution surface after the inline-<Arguments> switch. Mutation: drop the sweep
// and the wrapper file/entry survive → this fails.
test('scheduler-schedule: win32 register removes a legacy .cmd wrapper file AND its manifest entry', () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const dir = gen.windowsTasksDir(paths);
  fs.mkdirSync(dir, { recursive: true });
  const wrapper = path.join(dir, 'wienerdog-dream.cmd');
  fs.writeFileSync(wrapper, '@echo off\r\nnode evil.js %*\r\n');
  manifestLib.record(manifest, { kind: 'file', path: wrapper });
  assert.ok(fs.existsSync(wrapper), 'legacy wrapper seeded');

  schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, () => ({ status: 0 }), 'win32');

  assert.equal(fs.existsSync(wrapper), false, 'the legacy .cmd wrapper file was deleted');
  assert.equal(
    manifest.entries.some((e) => e.kind === 'file' && e.path === wrapper),
    false,
    'the legacy wrapper manifest entry was dropped'
  );
});

test('scheduler-schedule: ensureDreamSchedule(platform:win32) schedules the dream (not "unsupported")', () => {
  const { paths } = setup();
  /** @type {string[][]} */ const calls = [];
  const res = schedule.ensureDreamSchedule(paths, { loader: (a) => (calls.push(a), { status: 0 }), platform: 'win32' });
  assert.deepEqual(res, { scheduled: true, at: '03:30' });
  assert.deepEqual(jobsLib.findJob(paths, 'dream'), {
    name: 'dream',
    at: '03:30',
    run: 'builtin:dream',
    timeoutMinutes: 20,
  });
  const manifest = manifestLib.load(paths);
  const schedEntries = manifest.entries.filter((e) => e.kind === 'scheduler-entry');
  assert.ok(schedEntries.some((e) => e.path === gen.windowsTaskFile(paths, 'dream')), 'dream task registered');
  assert.ok(schedEntries.some((e) => e.path === gen.windowsTaskFile(paths, 'catchup')), 'catch-up task registered');
  assert.ok(calls.length >= 2, 'both schtasks /create argvs issued');

  // Second call is idempotent at the job level.
  const res2 = schedule.ensureDreamSchedule(paths, { loader: () => ({ status: 0 }), platform: 'win32' });
  assert.deepEqual(res2, { scheduled: false, reason: 'exists' });
});

test('scheduler-schedule: registerPlatform reports loaded:false when the schtasks /create is rejected', () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  // Reject only the PRIMARY create (dream); the catch-up create succeeds — loaded
  // must still be false because ONE mutation failed.
  const loader = (a) => ({ status: a.includes('\\Wienerdog\\dream') ? 1 : 0 });
  const res = schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'win32');
  assert.deepEqual(res, { platform: 'schtasks', changed: true, loaded: false });
});

test('scheduler-schedule: ensureDreamSchedule returns reason:load-failed when the OS scheduler rejects the task', () => {
  const { paths } = setup();
  const loader = () => ({ status: 1 }); // every schtasks /create is rejected
  const res = schedule.ensureDreamSchedule(paths, { loader, platform: 'win32' });
  assert.deepEqual(res, { scheduled: false, reason: 'load-failed', at: '03:30' });
  // The job definition is still persisted (it can be retried via sync/doctor).
  assert.ok(jobsLib.findJob(paths, 'dream'), 'dream job persisted despite the load failure');
});

// A7 hardening (re-verify #2): a FAILED forced re-registration must be reported
// even when the source XML is UNCHANGED (changed:false). A stale loaded task whose
// `/create /f` is rejected returns {changed:false, loaded:false}; the reporting
// gate keys off `!res.loaded`, NOT `res.changed && !res.loaded`. Mutation: restore
// the `res.changed &&` gate and the notice disappears (a scoped writer could then
// recreate the swept wrapper against a still-loaded stale task, silently). Verified
// at both repointSchedules and the schedule-add (ensureDreamSchedule) callers.
test('scheduler-schedule: a failed forced re-register with UNCHANGED source XML is surfaced (changed:false, loaded:false)', () => {
  const { paths } = setup();
  // Seed a configured dream + canonical XML + manifest entry with a success loader.
  schedule.ensureDreamSchedule(paths, { loader: () => ({ status: 0 }), platform: 'win32' });

  // A stale loaded task (query returns non-canonical) whose forced /create /f is REJECTED.
  const staleTaskXml =
    '<?xml version="1.0" encoding="UTF-16"?>\n<Task>\n  <Actions>\n    <Exec>\n' +
    '      <Command>C:\\Windows\\System32\\cmd.exe</Command>\n' +
    '      <Arguments>/c "start evil.exe"</Arguments>\n' +
    '    </Exec>\n  </Actions>\n</Task>\n';
  const loader = (a) => {
    if (a[1] === '/query') return { status: 0, stdout: staleTaskXml };
    if (a[1] === '/create') return { status: 1 }; // forced re-register rejected
    return { status: 0 };
  };

  // registerPlatform reaches the precise bug state: source unchanged, load failed.
  const m1 = manifestLib.load(paths);
  const rp = schedule.registerPlatform(paths, m1, { name: 'dream', hour: 3, minute: 30 }, loader, 'win32');
  assert.equal(rp.changed, false, 'source XML unchanged');
  assert.equal(rp.loaded, false, 'the forced /create /f was rejected');

  // repointSchedules must SURFACE it (the `!res.loaded` gate), not swallow it.
  const m2 = manifestLib.load(paths);
  const r = schedule.repointSchedules(paths, m2, { loader, platform: 'win32' });
  assert.ok(
    r.notices.some((n) => /"dream".*did not accept it/.test(n)),
    'a failed forced re-register is reported even though the source XML did not change'
  );

  // schedule-add path (ensureDreamSchedule on a fresh install) fails loud on the same state.
  const { paths: paths2 } = setup();
  const res2 = schedule.ensureDreamSchedule(paths2, { loader, platform: 'win32' });
  assert.equal(res2.scheduled, false, 'schedule-add reports failure, not unqualified success');
  assert.equal(res2.reason, 'load-failed');
});

test('scheduler-schedule: add fails loud (throws) when the OS scheduler rejects the new task', { skip: !SCHED_SUPPORTED }, async () => {
  const { env } = setup();
  const loader = () => ({ status: 1 }); // schtasks/launchctl/systemctl rejects it
  await assert.rejects(
    runSchedule(env, ['add', 'daily-digest', '--at', '07:00', '--skill', 'wienerdog-daily-digest'], loader, allowAll()),
    (err) => err instanceof WienerdogError && /NOT active/.test(err.message)
  );
});

test('scheduler-schedule: remove after a win32 register reverses the dream entry, leaves the shared catch-up', async () => {
  const { env, paths, root } = setup();
  const manifest = manifestLib.load(paths);
  schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, () => ({ status: 0 }), 'win32');
  manifestLib.save(paths, manifest);
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });

  const dreamXml = gen.windowsTaskFile(paths, 'dream');
  const catchupXml = gen.windowsTaskFile(paths, 'catchup');

  // WP-145: poison the dream entry's stored unload with a marker to prove it is
  // ignored; the spy guarantees nothing real spawns on any host platform.
  const marker = path.join(root, 'win32-remove-unload-ran');
  const m2 = manifestLib.load(paths);
  for (const e of m2.entries) {
    if (e.kind === 'scheduler-entry' && e.path === dreamXml) {
      e.unload = [process.execPath, '-e', `require('fs').appendFileSync(${JSON.stringify(marker)}, 'x')`];
    }
  }
  manifestLib.save(paths, m2);

  await withSpawnSpy(() => runSchedule(env, ['remove', 'dream'], () => ({ status: 0 })));

  assert.ok(!fs.existsSync(marker), 'the stored unload never ran — the unregister argv is derived (WP-145)');
  assert.ok(!fs.existsSync(dreamXml), 'the dream XML was deleted');
  assert.ok(fs.existsSync(catchupXml), 'the shared catch-up XML remains until uninstall');
  assert.equal(jobsLib.findJob(paths, 'dream'), null, 'the dream job was dropped from config');
  const after = manifestLib.load(paths);
  assert.ok(!after.entries.some((e) => e.kind === 'scheduler-entry' && e.path === dreamXml), 'dream entry gone');
  assert.ok(after.entries.some((e) => e.kind === 'scheduler-entry' && e.path === catchupXml), 'catch-up entry kept');
});

// -------------------------------------------------------------------------
// WP-145 fix-pass (F34): reloadJob REGENERATES canonical content from validated
// config and never trusts a found-on-disk artifact.
// -------------------------------------------------------------------------

test('scheduler-schedule: reloadJob regenerates the canonical plist (attacker bytes overwritten) then registers it; a symlink is refused (F34)', { skip: process.platform === 'win32' }, () => {
  const { paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const laDir = path.join(paths.home, 'Library', 'LaunchAgents');
  fs.mkdirSync(laDir, { recursive: true });
  const plistPath = path.join(laDir, 'ai.wienerdog.dream.plist');
  // A found-on-disk plist with attacker-chosen ProgramArguments — must NOT be
  // registered as-is; the heal regenerates the canonical content first.
  fs.writeFileSync(plistPath, '<plist>ATTACKER ProgramArguments</plist>\n');

  /** @type {string[][]} */ const calls = [];
  const ok = schedule.reloadJob(paths, { name: 'dream', at: '03:30' }, (a) => (calls.push(a), { status: 0 }), 'darwin');
  assert.equal(ok, true);
  assert.deepEqual(calls, [['launchctl', 'bootstrap', `gui/${process.getuid()}`, plistPath]]);
  const after = fs.readFileSync(plistPath, 'utf8');
  assert.ok(!after.includes('ATTACKER'), 'the found file is regenerated from canonical config, not trusted');
  assert.ok(after.includes('<key>Label</key>') && after.includes('ai.wienerdog.dream'), 'canonical plist rendered');

  // A planted symlink at the canonical path is refused (fail closed, zero register).
  fs.rmSync(plistPath);
  const target = path.join(paths.home, 'evil-target');
  fs.writeFileSync(target, 'x');
  fs.symlinkSync(target, plistPath);
  /** @type {string[][]} */ const calls2 = [];
  const ok2 = schedule.reloadJob(paths, { name: 'dream', at: '03:30' }, (a) => (calls2.push(a), { status: 0 }), 'darwin');
  assert.equal(ok2, false, 'a symlink at the canonical path is not healed');
  assert.equal(calls2.length, 0, 'nothing is registered');
  assert.equal(fs.lstatSync(plistPath).isSymbolicLink(), true, 'the symlink is left as-is');
});

// -------------------------------------------------------------------------
// schedule.js: repointSchedules (ADR-0013 migration) — idempotent re-register,
// stale-path rewrite, unsupported-platform degrade.
// -------------------------------------------------------------------------

/**
 * The primary scheduler-entry file for a job on the current platform whose
 * content embeds the wienerdog bin path: the launchd plist on darwin, the
 * systemd .service on Linux.
 * @param {import('../../src/core/paths').WienerdogPaths} paths
 * @param {string} name
 * @returns {string}
 */
function primaryEntryFile(paths, name) {
  if (process.platform === 'darwin') {
    return path.join(gen.launchAgentsDir(paths.home), `${gen.launchdLabel(name)}.plist`);
  }
  return path.join(gen.systemdUserDir(paths.home, process.env), `${gen.systemdUnitBase(name)}.service`);
}

// ADR-0037: an unchanged repoint is no longer a ZERO-call no-op — it still
// costs its per-platform verified-skip readback (Table A's third column,
// AC5(iii)): darwin ⇒ two read-only `print`s (job + catch-up); linux ⇒ the
// idempotent `daemon-reload` + `enable --now`. `fake` is reused across the
// setup `add()` and the repoint under test so the live record it registered
// is what the repoint's readback re-reads (a fresh mock would see nothing
// loaded and force a spurious re-bootstrap).
test('scheduler-schedule: repointSchedules after add is a no-op (changed:0, no MUTATING OS call)', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  const fake = fakeLaunchd(paths);
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], fake);

  const calls = [];
  const manifest = manifestLib.load(paths);
  const res = schedule.repointSchedules(paths, manifest, { loader: (a) => (calls.push(a), fake(a)) });

  assert.equal(res.repointed, 1, 'the one defined job was re-registered');
  assert.equal(res.changed, 0, 'content already targets the stable bin — nothing rewritten');
  assert.deepEqual(res.notices, []);
  assert.equal(calls.length, 2, 'the verified-skip readback still runs (Table A) even when nothing changed');
  assert.ok(
    calls.every((a) => (a[0] === 'launchctl' ? a[1] === 'print' : a[0] === 'systemctl')),
    'no MUTATING OS call on an unchanged repoint'
  );
});

test('scheduler-schedule: repointSchedules rewrites a stale embedded node path (changed:1)', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], fakeLaunchd(paths));

  // Simulate an older version's entry: hand-edit the embedded node (the entry's
  // <Command>/first arg) to a stale path. WP-157: the entry now invokes the
  // stable out-of-tree launcher (<core>/launcher/launch.js) rather than a
  // version-scoped bin, so the node path is the absolute value repoint migrates.
  const file = primaryEntryFile(paths, 'dream');
  // ENTRY-role value — the node path the renderer embeds (Table H site 1).
  const stableNode = gen.entryNodePath();
  const oldNode = '/old/versions/node/v1.0.0/bin/node';
  const stale = fs.readFileSync(file, 'utf8').split(stableNode).join(oldNode);
  assert.ok(stale.includes(oldNode) && !stale.includes(stableNode), 'seeded a stale entry');
  fs.writeFileSync(file, stale);

  const calls = [];
  const manifest = manifestLib.load(paths);
  const res = schedule.repointSchedules(paths, manifest, { loader: (a) => (calls.push(a), { status: 0 }) });

  assert.equal(res.changed, 1, 'the stale entry was rewritten');
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.includes(stableNode) && !after.includes(oldNode), 'entry now targets the current node');
  assert.ok(calls.length >= 1, 'the OS scheduler was reloaded');
});

test('scheduler-schedule: repointSchedules degrades on an unsupported platform (notice, no throw)', async () => {
  const { paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });

  const orig = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'sunos', configurable: true });
  try {
    const manifest = manifestLib.load(paths);
    const res = schedule.repointSchedules(paths, manifest, { loader: () => ({ status: 0 }) });
    assert.equal(res.repointed, 0, 'nothing registered on an unschedulable platform');
    assert.equal(res.changed, 0);
    assert.equal(res.notices.length, 1, 'the job is collected as a notice, not a throw');
    assert.match(res.notices[0], /could not repoint "dream"/);
  } finally {
    Object.defineProperty(process, 'platform', orig);
  }
});

// -------------------------------------------------------------------------
// schedule.js: ensureDreamSchedule (ADR-0014) — schedules once at 03:30,
// idempotent, degrades on an unsupported platform without throwing.
// -------------------------------------------------------------------------

test('scheduler-schedule: ensureDreamSchedule schedules dream once at 03:30', { skip: !SCHED_SUPPORTED }, () => {
  const { paths } = setup();
  /** @type {string[][]} */ const calls = [];
  const fake = fakeLaunchd(paths);
  const res = schedule.ensureDreamSchedule(paths, { loader: (a) => (calls.push(a), fake(a)) });

  assert.deepEqual(res, { scheduled: true, at: '03:30' });
  // Job persisted with builtin:dream + 20-minute timeout.
  assert.deepEqual(jobsLib.findJob(paths, 'dream'), {
    name: 'dream',
    at: '03:30',
    run: 'builtin:dream',
    timeoutMinutes: 20,
  });
  // config.yaml gained the managed jobs block.
  assert.match(fs.readFileSync(paths.config, 'utf8'), /wienerdog:jobs/);
  // A scheduler-entry was recorded, and the OS loader was called at least once.
  const manifest = manifestLib.load(paths);
  assert.ok(manifest.entries.some((e) => e.kind === 'scheduler-entry'), 'scheduler-entry recorded');
  assert.ok(calls.length >= 1, 'the OS scheduler was invoked');
});

test('scheduler-schedule: ensureDreamSchedule is idempotent (second call no-ops)', { skip: !SCHED_SUPPORTED }, () => {
  const { paths } = setup();
  schedule.ensureDreamSchedule(paths, { loader: () => ({ status: 0 }) });
  /** @type {string[][]} */ const calls = [];
  const res = schedule.ensureDreamSchedule(paths, { loader: (a) => (calls.push(a), { status: 0 }) });
  assert.deepEqual(res, { scheduled: false, reason: 'exists' });
  assert.equal(calls.length, 0, 'no OS call when the dream job already exists');
  assert.equal(jobsLib.listJobs(paths).filter((j) => j.name === 'dream').length, 1, 'still exactly one dream job');
});

test('scheduler-schedule: ensureDreamSchedule degrades on an unsupported platform (no throw)', () => {
  const { paths } = setup();
  const orig = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'sunos', configurable: true });
  let res;
  try {
    res = schedule.ensureDreamSchedule(paths, { loader: () => ({ status: 0 }) });
  } finally {
    Object.defineProperty(process, 'platform', orig);
  }
  assert.equal(res.scheduled, false);
  assert.equal(res.reason, 'unsupported');
  assert.ok(res.message, 'a plain-language reason is surfaced');
  // The job definition is retained so the user can schedule it later once supported.
  assert.ok(jobsLib.findJob(paths, 'dream'), 'dream job definition kept despite the unschedulable platform');
});

test('scheduler-schedule: list --json reports jobs with watermarks', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  const fake = fakeLaunchd(paths);
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], fake);
  await runSchedule(env, ['add', 'daily-digest', '--at', '07:00', '--skill', 'wienerdog-daily-digest'], fake, allowAll());
  jobsLib.writeScheduleState(paths, 'dream', { last_success: '2026-07-03T03:30:12.000Z', last_status: 'ok' });

  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => ((out += s), true);
  try {
    await runSchedule(env, ['list', '--json'], () => ({ status: 0 }));
  } finally {
    process.stdout.write = orig;
  }
  const parsed = JSON.parse(out);
  const dream = parsed.find((j) => j.name === 'dream');
  const digest = parsed.find((j) => j.name === 'daily-digest');
  assert.equal(dream.last_success, '2026-07-03T03:30:12.000Z');
  assert.equal(dream.last_status, 'ok');
  assert.equal(digest.last_success, null);
  assert.equal(digest.last_status, null);
});

// ── WP-156: canonical digest-bound job descriptor at schedule/sync time ──────

/** Plant a minimal vendored app tree (app/current → app/0.0.1) so
 *  buildDescriptor's appTreeDigest/readVersion resolve in this temp core. */
function plantAppTree(paths) {
  const versionDir = path.join(paths.core, 'app', '0.0.1');
  fs.mkdirSync(path.join(versionDir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(versionDir, 'package.json'), '{"version":"0.0.1"}\n');
  fs.writeFileSync(path.join(versionDir, 'bin', 'wienerdog.js'), '// app\n');
  fs.symlinkSync(versionDir, path.join(paths.core, 'app', 'current'));
}

/** Plant claude+git exec pins so the dream descriptor's WP-156 A1b required-pin
 *  gate is satisfied (buildDescriptor refuses to bind the dream job otherwise). */
function plantPins(paths) {
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(
    path.join(paths.state, 'exec-pins.json'),
    JSON.stringify({
      schema: 1,
      pins: {
        claude: { commandPath: '/x/bin/claude', installDir: '/x/share/claude', version: '9', pinnedAt: 't' },
        git: { commandPath: '/usr/bin/git', installDir: '/usr/bin', version: 'g', pinnedAt: 't' },
      },
    }),
    { mode: 0o600 }
  );
}

test('scheduler-schedule: add writes a 0600 job descriptor, records it once, and re-add is a no-op (WP-156)', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  plantAppTree(paths);
  plantPins(paths);
  const fake = fakeLaunchd(paths);
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], fake);

  const descPath = path.join(paths.state, 'descriptors', 'dream.json');
  assert.ok(fs.existsSync(descPath), 'descriptor written during add');
  assert.equal(fs.statSync(descPath).mode & 0o777, 0o600);
  const bytes = fs.readFileSync(descPath);
  const d = JSON.parse(bytes.toString('utf8'));
  assert.equal(d.job, 'dream');
  assert.equal(d.run, 'builtin:dream');
  assert.match(d.appRelease.treeDigest, /^sha256:/);
  const entries = manifestLib.load(paths).entries.filter((e) => e.kind === 'file' && e.path === descPath);
  assert.equal(entries.length, 1, 'exactly one manifest file entry for the descriptor');

  // Second add: byte-identical descriptor, still exactly one manifest entry.
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], fake);
  assert.ok(fs.readFileSync(descPath).equals(bytes), 'unchanged inputs ⇒ byte-identical descriptor');
  const entries2 = manifestLib.load(paths).entries.filter((e) => e.kind === 'file' && e.path === descPath);
  assert.equal(entries2.length, 1, 'no duplicate manifest entry on re-add');
});

test('scheduler-schedule: repointSchedules surfaces a non-zero descriptor-write-failure count (WP-156 A4/F7)', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  // A dream job with NO pins (and no app tree) → writeDescriptor throws inside
  // registerPlatform → the failure is COUNTED, not swallowed silently.
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const saved = { HOME: process.env.HOME, WIENERDOG_HOME: process.env.WIENERDOG_HOME };
  process.env.HOME = env.HOME;
  process.env.WIENERDOG_HOME = env.WIENERDOG_HOME;
  let r;
  try {
    const manifest = manifestLib.load(paths);
    r = schedule.repointSchedules(paths, manifest, { loader: () => ({ status: 0 }) });
  } finally {
    process.env.HOME = saved.HOME;
    process.env.WIENERDOG_HOME = saved.WIENERDOG_HOME;
  }
  assert.ok(r.descriptorFailures >= 1, 'a failed descriptor write is counted (drops to 0 if the count is not tracked)');
});

test('scheduler-schedule: repointSchedules refreshes the descriptor; a legit uninstall reverse removes it (WP-156)', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  plantAppTree(paths);
  plantPins(paths);
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], fakeLaunchd(paths));
  const descPath = path.join(paths.state, 'descriptors', 'dream.json');
  fs.rmSync(descPath); // simulate a lost descriptor — sync's repoint restores it

  const saved = { HOME: process.env.HOME, WIENERDOG_HOME: process.env.WIENERDOG_HOME };
  process.env.HOME = env.HOME;
  process.env.WIENERDOG_HOME = env.WIENERDOG_HOME;
  let manifest;
  try {
    manifest = manifestLib.load(paths);
    schedule.repointSchedules(paths, manifest, { loader: () => ({ status: 0 }) });
    manifestLib.save(paths, manifest);
  } finally {
    process.env.HOME = saved.HOME;
    process.env.WIENERDOG_HOME = saved.WIENERDOG_HOME;
  }
  assert.ok(fs.existsSync(descPath), 'repointSchedules (the sync path) rewrote the descriptor');

  // A legitimate uninstall reverse removes the in-bounds descriptor file.
  const { result } = await withSpawnSpy(() => manifestLib.reverse(paths, manifestLib.load(paths)));
  assert.ok(result.removed.includes(descPath), 'the descriptor file entry reverses');
  assert.equal(fs.existsSync(descPath), false);
});

// =========================================================================
// WP-scheduler-register-replaces-loaded-record: verified registration
// (ADR-0037). darwinLoadedVerdict + ensureDarwinEntryRegistered are
// non-exported by design (D1) — every test below drives them THROUGH
// `schedule.registerPlatform` (darwin/linux, platform injected) or through the
// CLI `add()` path (T7), never by importing them directly.
// =========================================================================

const PLUTIL_PATH = '/usr/bin/plutil';

/** Identify which launchd LABEL an argv targets, for `scriptedDarwinLoader`.
 *  @param {string[]} argv @returns {string|null} */
function labelForArgv(argv) {
  if (argv[0] === 'launchctl' && (argv[1] === 'print' || argv[1] === 'bootout')) {
    return (/^gui\/\d+\/(.+)$/.exec(argv[2] || '') || [])[1] || null;
  }
  if (argv[0] === 'launchctl' && argv[1] === 'bootstrap') {
    const m = /([^/]+)\.plist$/.exec(argv[3] || '');
    return m ? m[1] : null;
  }
  if (argv[0] === PLUTIL_PATH && argv[1] === '-lint') {
    const m = /([^/]+)\.plist$/.exec(argv[2] || '');
    return m ? m[1] : null;
  }
  return null;
}

/** Stub `fs.existsSync` for exactly `/usr/bin/plutil` during `fn`, delegating
 *  every other path to the real implementation — makes the `plutil` preflight
 *  deterministic regardless of whether THIS test host has it. Only T2c/T2d
 *  exercise the preflight itself; every other fixture stubs it `false` (skip)
 *  so it never adds an unscripted call to an otherwise-pinned sequence.
 *  @template T @param {boolean} exists @param {() => (T|Promise<T>)} fn
 *  @returns {Promise<T>} */
async function withPlutilExists(exists, fn) {
  const orig = fs.existsSync;
  fs.existsSync = (p) => (p === PLUTIL_PATH ? exists : orig(p));
  try {
    return await fn();
  } finally {
    fs.existsSync = orig;
  }
}

/**
 * A darwin loader for THIS WP's own tests: calls targeting `scriptedLabel`
 * return the SCRIPTED `responses` in order (one per call OBSERVED for that
 * label; an entry may be a function `(argv)=>response` for a fixture that
 * needs a side effect, e.g. simulating a concurrent write). Every other call
 * (typically the catch-up site's OWN registration, running alongside the
 * per-job one under test) falls through to a shared `fakeLaunchd`
 * passthrough, so it succeeds harmlessly and never interferes with the
 * assertions under test.
 * @param {import('../../src/core/paths').WienerdogPaths} paths
 * @param {string} scriptedLabel
 * @param {Array<{status:number,stdout?:string}|((argv:string[])=>{status:number,stdout?:string})>} responses
 * @returns {{loader:(argv:string[])=>{status:number,stdout?:string}, calls:string[][]}}
 */
function scriptedDarwinLoader(paths, scriptedLabel, responses) {
  const fallback = fakeLaunchd(paths);
  /** @type {string[][]} */ const calls = [];
  let i = 0;
  const loader = (argv) => {
    calls.push(argv);
    if (labelForArgv(argv) === scriptedLabel && i < responses.length) {
      const r = responses[i];
      i += 1;
      return typeof r === 'function' ? r(argv) : r;
    }
    return fallback(argv);
  };
  return { loader, calls };
}

/** Compute the SAME `expect`-shape values `registerPlatformEntries`'s darwin
 *  arm derives for job `name` (no job saved ⇒ expectDigest degrades to '',
 *  matching what the register site itself computes for an unfindable job).
 *  @param {import('../../src/core/paths').WienerdogPaths} paths
 *  @param {string} name @param {number} hour @param {number} minute */
function darwinJobExpect(paths, name, hour, minute) {
  // ENTRY-role value: mirrors the value the register site now hoists
  // (WP-scheduler-node-path-durability, Table B row 1 / Table H site 2).
  const node = gen.entryNodePath();
  const launcher = gen.launcherPath(paths);
  const descriptorPath = require('../../src/scheduler/descriptor').descriptorPath(paths, name);
  const label = gen.launchdLabel(name);
  const plistPath = path.join(paths.home, 'Library', 'LaunchAgents', `${label}.plist`);
  const logDir = path.join(paths.logs, name);
  return {
    label,
    plistPath,
    argv: [node, ...gen.jobLaunchArgs({ launcher, name, descriptor: descriptorPath, expectDigest: '' })],
    hour,
    minute,
    env: gen.scheduledEnvPairs(paths.home, paths.core),
    path: plistPath,
    stdoutPath: path.join(logDir, 'launchd.out.log'),
    stderrPath: path.join(logDir, 'launchd.err.log'),
    spawnType: 'background',
  };
}

/** The catch-up analogue of `darwinJobExpect`. */
function darwinCatchupExpect(paths) {
  // ENTRY-role value — see darwinJobExpect (Table H site 3).
  const node = gen.entryNodePath();
  const launcher = gen.launcherPath(paths);
  const label = 'ai.wienerdog.catchup';
  const plistPath = path.join(paths.home, 'Library', 'LaunchAgents', `${label}.plist`);
  const logDir = path.join(paths.logs, 'catchup');
  return {
    label,
    plistPath,
    argv: [node, ...gen.catchupLaunchArgs({ launcher, expectDigest: '', jobDigests: gen.encodeJobDigests({}) })],
    hour: null,
    minute: 0,
    env: gen.scheduledEnvPairs(paths.home, paths.core),
    path: plistPath,
    stdoutPath: path.join(logDir, 'launchd.out.log'),
    stderrPath: path.join(logDir, 'launchd.err.log'),
    spawnType: 'background',
  };
}

/** The exact plist bytes `registerPlatformEntries`'s darwin arm renders for an
 *  unfindable job `name` (expectDigest ''), so a test can pre-plant an
 *  UNCHANGED (`changed:false`) fixture. */
function canonicalJobPlistContent(paths, name, hour, minute) {
  // ENTRY-role value — see darwinJobExpect (Table H site 4).
  const node = gen.entryNodePath();
  const launcher = gen.launcherPath(paths);
  const descriptorPath = require('../../src/scheduler/descriptor').descriptorPath(paths, name);
  const logDir = path.join(paths.logs, name);
  return gen.launchdPlist({
    name, hour, minute, node, launcher, descriptor: descriptorPath, expectDigest: '',
    home: paths.home, core: paths.core, logDir,
  });
}

/** A `launchctl print` stdout that matches `expect` exactly (Table A2). */
function matchingStdout(expect) {
  return buildPrintStdout({ ...expect, program: expect.argv[0] });
}

/** Pre-plant an UNCHANGED per-job entry: canonical bytes already on disk plus
 *  a matching manifest entry, so `ensureEntry` returns `changed:false` and the
 *  ONLY thing under test is the verified-skip/attempt decision (T3). */
function unchangedJobFixture(name, hour, minute) {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, name, hour, minute);
  const content = canonicalJobPlistContent(paths, name, hour, minute);
  fs.mkdirSync(path.dirname(expect.plistPath), { recursive: true });
  fs.writeFileSync(expect.plistPath, content);
  manifestLib.record(manifest, { kind: 'scheduler-entry', path: expect.plistPath });
  return { paths, manifest, expect };
}

/** Path to the pre-destructive marker file `onBeforeTeardown` writes
 *  (`refreshSchedulerStatus`'s target — `status.js`'s STATUS_FILE). */
function statusMarkerPath(paths) {
  return path.join(paths.state, 'scheduler-status.json');
}

/**
 * Run ONE T3 verified-skip/attempt case: an unchanged 'dream' entry, a SINGLE
 * scripted `print` response, and an assertion on whether the register skips
 * (exactly one read-only `print`, `loaded:true`) or attempts (a `bootstrap`
 * follows). `buildResponse` is either a fixed `{status,stdout?}` or a function
 * `(expect) => {status,stdout?}` — the function form is what lets a case build
 * its stdout from the SAME `expect` (paths, argv, env, …) the fixture under
 * test actually uses, rather than from a throwaway fixture whose paths would
 * never match (a real bug an earlier draft of this file had).
 * @param {{status:number,stdout?:string}|((expect:object)=>{status:number,stdout?:string})} buildResponse
 * @param {'skip'|'attempt'} expectation
 */
async function runT3Case(buildResponse, expectation) {
  const { paths, manifest, expect } = unchangedJobFixture('dream', 3, 30);
  const printResponse = typeof buildResponse === 'function' ? buildResponse(expect) : buildResponse;
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [printResponse]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  if (expectation === 'skip') {
    assert.equal(jobCalls.length, 1, 'a verified skip costs exactly one read-only print, nothing more');
    assert.deepEqual(jobCalls[0], ['launchctl', 'print', `gui/${process.getuid()}/${expect.label}`]);
    assert.equal(res.loaded, true);
  } else {
    assert.ok(jobCalls.length >= 2, 'a non-matching/unreadable record must be ATTEMPTED, never skipped');
    assert.equal(jobCalls[1][1], 'bootstrap', 'the non-destructive bootstrap attempt runs');
  }
  return { paths, manifest, expect, calls, jobCalls, res };
}

// -------------------------------------------------------------------------
// T1 — darwin replace ordering + `loaded` (AC1)
// -------------------------------------------------------------------------

test('verified-register: T1 — darwin replace: print → bootstrap → bootout → bootstrap → print, marker precedes bootout (AC1)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const staleStdout = buildPrintStdout({ ...expect, argv: [...expect.argv.slice(0, -1), 'sha256:' + '0'.repeat(64)], program: expect.argv[0] });
  let statusExistedAtBootout = null;
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: staleStdout }, // (1) print — a STALE record IS loaded
    { status: 1 }, // (2) bootstrap — the non-destructive attempt fails (already loaded)
    (argv) => { // (3) bootout — the marker must already exist by now (AC8 ordering)
      statusExistedAtBootout = fs.existsSync(statusMarkerPath(paths));
      return { status: 0 };
    },
    { status: 0 }, // (4) bootstrap — the replacement succeeds
    { status: 0, stdout: matchingStdout(expect) }, // (5) print — post-bootstrap verify: matches
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  const uid = process.getuid();
  assert.deepEqual(jobCalls, [
    ['launchctl', 'print', `gui/${uid}/${expect.label}`],
    ['launchctl', 'bootstrap', `gui/${uid}`, expect.plistPath],
    ['launchctl', 'bootout', `gui/${uid}/${expect.label}`],
    ['launchctl', 'bootstrap', `gui/${uid}`, expect.plistPath],
    ['launchctl', 'print', `gui/${uid}/${expect.label}`],
  ]);
  assert.equal(res.loaded, true, 'the replacement verified-loaded');
  assert.equal(statusExistedAtBootout, true, "ADR-0018 decision 2's pre-destructive marker precedes the bootout");
});

test('verified-register: T1 — Table A1: a live match SKIPS even when changed=true (AC1)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  // `changed:true` is forced by pre-planting DIFFERENT on-disk bytes, so
  // ensureEntry rewrites the file — but the LOADED record already matches
  // the NEW canonical values, so the live match must still win.
  fs.mkdirSync(path.dirname(expect.plistPath), { recursive: true });
  fs.writeFileSync(expect.plistPath, 'not yet canonical');
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: matchingStdout(expect) },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.equal(jobCalls.length, 1, 'zero mutating calls — the live match wins over `changed`');
  assert.equal(res.loaded, true);
  assert.equal(fs.existsSync(statusMarkerPath(paths)), false, 'the skip path calls no launchctl verb of any kind and no onBeforeTeardown — nothing but the one print');
});

test("verified-register: T1 — Codex fixture: changed=true only because the manifest entry is missing (AC1)", async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths); // no scheduler-entry recorded yet
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const content = canonicalJobPlistContent(paths, 'dream', 3, 30);
  fs.mkdirSync(path.dirname(expect.plistPath), { recursive: true });
  fs.writeFileSync(expect.plistPath, content); // disk already canonical
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: matchingStdout(expect) },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  // `changed` is true (the manifest entry was missing), but the live record
  // already matches canonical — Table A1's live match wins regardless, costing
  // exactly its one read-only readback and ZERO mutating calls.
  assert.deepEqual(jobCalls, [['launchctl', 'print', `gui/${process.getuid()}/${expect.label}`]]);
  assert.equal(res.loaded, true);
  const entry = manifest.entries.find((e) => e.kind === 'scheduler-entry' && e.path === expect.plistPath);
  assert.ok(entry, 'the manifest entry is still recorded (ensureEntry\'s own bookkeeping runs regardless)');
});

// -------------------------------------------------------------------------
// T2 — teardown guard: no bootout when nothing is loaded; marker non-firing (AC2, AC8)
// -------------------------------------------------------------------------

test('verified-register: T2 — nothing loaded + bootstrap failure ⇒ no bootout anywhere, loaded:false, no marker (AC2, AC8)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 113 }, // (1) print — nothing loaded
    { status: 1 },   // (2) bootstrap — a transient/permissions/invalid-plist failure
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.ok(!jobCalls.some((a) => a[1] === 'bootout'), 'no bootout in the call list at all');
  assert.equal(res.loaded, false);
  assert.equal(fs.existsSync(statusMarkerPath(paths)), false, 'the pre-destructive marker never fires without a teardown');
});

// -------------------------------------------------------------------------
// T2b — the rollback set (AC2)
// -------------------------------------------------------------------------

test('verified-register: T2b — rollback restores the prior plist + re-bootstraps it, reports loaded:false (AC2 a-d,g)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const priorBytes = Buffer.from('PRIOR-PLIST-BYTES-MARKER');
  fs.mkdirSync(path.dirname(expect.plistPath), { recursive: true });
  fs.writeFileSync(expect.plistPath, priorBytes);
  const staleStdout = buildPrintStdout({ ...expect, argv: [...expect.argv.slice(0, -1), 'sha256:' + '1'.repeat(64)], program: expect.argv[0] });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: staleStdout }, // (1) print — a healthy but stale record IS loaded
    { status: 1 }, // (2) bootstrap — fails (already loaded)
    { status: 0 }, // (3) bootout
    { status: 1 }, // (4) bootstrap — the REPLACEMENT also fails (unbootstrappable)
    { status: 1 }, // (5) bootstrap — the RESTORE; its result is never checked
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  const uid = process.getuid();
  assert.deepEqual(jobCalls.map((a) => a.slice(0, 2)), [
    ['launchctl', 'print'],
    ['launchctl', 'bootstrap'],
    ['launchctl', 'bootout'],
    ['launchctl', 'bootstrap'],
    ['launchctl', 'bootstrap'],
  ], '(a) call order: print → bootstrap → bootout → bootstrap → bootstrap again (the restore)');
  assert.deepEqual(jobCalls[4], ['launchctl', 'bootstrap', `gui/${uid}`, expect.plistPath], '(c) the restoring bootstrap targets the restored file');
  assert.ok(fs.readFileSync(expect.plistPath).equals(priorBytes), '(b) the file holds the PRIOR bytes, byte for byte');
  assert.equal(res.loaded, false, '(d)/(g) rollback never reports success, even when its own restore-bootstrap fails');
});

test('verified-register: T2b — priorBytes===null (no plist existed) ⇒ no restore attempt, still loaded:false (AC2 e)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30); // nothing pre-planted on disk
  const staleStdout = buildPrintStdout({ ...expect, argv: [...expect.argv.slice(0, -1), 'sha256:' + '2'.repeat(64)], program: expect.argv[0] });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: staleStdout },
    { status: 1 },
    { status: 0 },
    { status: 1 },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.equal(jobCalls.length, 4, 'no restoring bootstrap — priorBytes was null, nothing to restore');
  assert.equal(res.loaded, false);
});

test('verified-register: T2b — the divergence case (CX-2): changed=false, disk canonical, loaded record older (AC2 f)', async () => {
  const { paths, manifest, expect } = unchangedJobFixture('dream', 3, 30); // changed:false; priorBytes === canonical
  const staleStdout = buildPrintStdout({ ...expect, argv: [...expect.argv.slice(0, -1), 'sha256:' + '3'.repeat(64)], program: expect.argv[0] });
  const canonicalBytes = fs.readFileSync(expect.plistPath);
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: staleStdout },
    { status: 1 },
    { status: 0 },
    { status: 1 },
    { status: 0 },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.ok(jobCalls.some((a) => a[1] === 'bootout'), 'the divergent record IS torn down — it is already stale');
  assert.ok(fs.readFileSync(expect.plistPath).equals(canonicalBytes), 'the restore re-writes canonical — priorBytes WAS canonical here (the bound this fixture pins)');
  assert.equal(res.loaded, false, 'rollback cannot restore the destroyed record — it never claims success');
});

// T2f — the interleaved-write fixture (CX14-2): a concurrent write lands
// between this invocation's canonical write and the rollback's staleness
// read; the guard must DECLINE to restore over it.
test('verified-register: T2f — rollback staleness guard declines to overwrite a concurrent write (AC2 g2)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const priorBytes = Buffer.from('PRIOR-BYTES');
  const concurrentBytes = Buffer.from('CONCURRENT-WRITER-BYTES');
  fs.mkdirSync(path.dirname(expect.plistPath), { recursive: true });
  fs.writeFileSync(expect.plistPath, priorBytes);
  const staleStdout = buildPrintStdout({ ...expect, argv: [...expect.argv.slice(0, -1), 'sha256:' + '4'.repeat(64)], program: expect.argv[0] });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: staleStdout },
    { status: 1 },
    { status: 0 },
    (argv) => { // the REPLACEMENT bootstrap: a concurrent invocation writes here first
      fs.writeFileSync(expect.plistPath, concurrentBytes);
      return { status: 1 };
    },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.equal(jobCalls.length, 4, 'the guard declines — no restoring bootstrap is issued');
  assert.ok(fs.readFileSync(expect.plistPath).equals(concurrentBytes), 'the concurrent bytes are left in place, byte for byte');
  assert.equal(res.loaded, false);
});

// T2g — the binding fixture (CX15-1): canonicalBytes is bound at both call
// sites, so a rollback reaching the staleness guard must not throw.
test('verified-register: T2g — a rollback reaching the staleness guard does not throw (AC2 g1)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  fs.mkdirSync(path.dirname(expect.plistPath), { recursive: true });
  fs.writeFileSync(expect.plistPath, Buffer.from('PRIOR'));
  const staleStdout = buildPrintStdout({ ...expect, argv: [...expect.argv.slice(0, -1), 'sha256:' + '5'.repeat(64)], program: expect.argv[0] });
  const { loader } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: staleStdout },
    { status: 1 },
    { status: 0 },
    { status: 1 },
    { status: 0 },
  ]);
  await assert.doesNotReject(
    withPlutilExists(false, () =>
      schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
    )
  );
});

// -------------------------------------------------------------------------
// T2c / T2d — the `plutil` preflight (AC2 h,i,j)
// -------------------------------------------------------------------------

test('verified-register: T2c — the preflight rejects: no bootout anywhere, absolute /usr/bin/plutil argv (AC2 h)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const staleStdout = buildPrintStdout({ ...expect, argv: [...expect.argv.slice(0, -1), 'sha256:' + '6'.repeat(64)], program: expect.argv[0] });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: staleStdout },
    { status: 1 },
  ]);
  const res = await withPlutilExists(true, () => {
    const wrapped = (argv) => (argv[0] === PLUTIL_PATH ? { status: 1 } : loader(argv));
    return schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, wrapped, 'darwin');
  });
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.ok(!jobCalls.some((a) => a[1] === 'bootout'), 'no bootout — the replacement is KNOWN-bad, never destroy for it');
  assert.equal(res.loaded, false);
});

test('verified-register: T2c — the preflight passes: the replace path proceeds exactly as AC1 (AC2 j)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const staleStdout = buildPrintStdout({ ...expect, argv: [...expect.argv.slice(0, -1), 'sha256:' + '7'.repeat(64)], program: expect.argv[0] });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: staleStdout },
    { status: 1 },
    { status: 0 }, // bootout
    { status: 0 }, // replacement bootstrap succeeds
    { status: 0, stdout: matchingStdout(expect) }, // verify
  ]);
  const res = await withPlutilExists(true, () => {
    const wrapped = (argv) => (argv[0] === PLUTIL_PATH ? { status: 0 } : loader(argv));
    return schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, wrapped, 'darwin');
  });
  assert.equal(res.loaded, true);
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.ok(jobCalls.some((a) => a[1] === 'bootout'), 'a passed preflight still allows the teardown');
});

test('verified-register: T2d — existsSync(PLUTIL) false ⇒ no plutil argv is issued at all, register proceeds (AC2 i)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const staleStdout = buildPrintStdout({ ...expect, argv: [...expect.argv.slice(0, -1), 'sha256:' + '8'.repeat(64)], program: expect.argv[0] });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: staleStdout },
    { status: 1 },
    { status: 0 },
    { status: 0 },
    { status: 0, stdout: matchingStdout(expect) },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  assert.ok(!calls.some((a) => a[0] === PLUTIL_PATH), 'existence false ⇒ the preflight never even calls the loader');
  assert.equal(res.loaded, true, 'the register proceeds normally — absence of the linter is the true fail-open');
});

// -------------------------------------------------------------------------
// T2e — the post-bootstrap verify on the ABSENT-label path (AC2 k,l; CX9-1)
// -------------------------------------------------------------------------

test('verified-register: T2e — absent label, bootstrap succeeds, trailing print mismatches ⇒ loaded:false, no bootout (AC2 k)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const foreignStdout = buildPrintStdout({ ...expect, argv: ['/foreign/node', ...expect.argv.slice(1)], program: '/foreign/node' });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 113 }, // print — nothing loaded
    { status: 0 },   // bootstrap succeeds
    { status: 0, stdout: foreignStdout }, // trailing print — FOREIGN bytes, not ours
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.equal(res.loaded, false, 'a bootstrap exit 0 is NOT evidence of what got loaded');
  assert.ok(!jobCalls.some((a) => a[1] === 'bootout'), 'no bootout — nothing was loaded to tear down');
  assert.deepEqual(jobCalls.map((a) => a[1]), ['print', 'bootstrap', 'print']);
});

test('verified-register: T2e — absent label, bootstrap succeeds, trailing print UNPARSEABLE ⇒ loaded:false (AC2 k)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const { loader } = scriptedDarwinLoader(paths, expect.label, [
    { status: 113 },
    { status: 0 },
    { status: 0, stdout: 'not a launchctl print record at all' },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  assert.equal(res.loaded, false);
});

test('verified-register: T2e — absent label, bootstrap succeeds, trailing print MATCHES ⇒ loaded:true (AC2 l)', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 113 },
    { status: 0 },
    { status: 0, stdout: matchingStdout(expect) },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.equal(res.loaded, true);
  assert.deepEqual(jobCalls.map((a) => a[1]), ['print', 'bootstrap', 'print']);
});

// -------------------------------------------------------------------------
// T3 — the verified skip, cases (i)-(xxii) (AC3, AC8)
// -------------------------------------------------------------------------

test('verified-register: T3 case (i) — argv matches element for element ⇒ zero mutating calls, loaded:true', async () => {
  await runT3Case((expect) => ({ status: 0, stdout: matchingStdout(expect) }), 'skip');
});

test('verified-register: T3 case (ii) — the record names a foreign launcher ⇒ attempted', async () => {
  await runT3Case((expect) => ({
    status: 0,
    stdout: buildPrintStdout({ ...expect, argv: [expect.argv[0], '/foreign/launcher.js', ...expect.argv.slice(2)], program: expect.argv[0] }),
  }), 'attempt');
});

test('verified-register: T3 case (iii) — the arguments block is unparseable ⇒ attempted', async () => {
  await runT3Case((expect) => ({ status: 0, stdout: buildPrintStdout({ ...expect, malformedArgs: true }) }), 'attempt');
});

test('verified-register: T3 case (iv) — print exits non-zero (nothing loaded) ⇒ attempted (crash-recovery criterion)', async () => {
  // The stdout carries a fully MATCHING record (gate 1's own regression bait —
  // pins the `isLoaded` guard, not just the empty-stdout case): a non-zero exit
  // must be decisive on its own, never overridden by parseable-looking text.
  await runT3Case((expect) => ({ status: 113, stdout: matchingStdout(expect) }), 'attempt');
});

test('verified-register: T3 case (v) — the stale-tail fixture: same node+launcher, different --expect-digest ⇒ attempted, not skipped', async () => {
  await runT3Case((expect) => ({
    status: 0,
    stdout: buildPrintStdout({ ...expect, argv: [...expect.argv.slice(0, -1), 'sha256:' + '9'.repeat(64)], program: expect.argv[0] }),
  }), 'attempt');
});

test('verified-register: T3 case (vi) — the loaded argv is a strict prefix of canonical ⇒ attempted', async () => {
  await runT3Case((expect) => ({
    status: 0,
    stdout: buildPrintStdout({ ...expect, argv: expect.argv.slice(0, -1), program: expect.argv[0] }),
  }), 'attempt');
});

test('verified-register: T3 case (vii) — the CX-1 regression fixture: argv matches, calendar Hour/Minute differs ⇒ attempted', async () => {
  await runT3Case((expect) => ({ status: 0, stdout: buildPrintStdout({ ...expect, minute: 45, program: expect.argv[0] }) }), 'attempt');
});

test('verified-register: T3 case (viii) — argv+calendar match but a canonical env pair differs ⇒ attempted', async () => {
  await runT3Case((expect) => {
    const env = expect.env.map(([k, v]) => (k === 'WIENERDOG_HOME' ? [k, '/some/other/core'] : [k, v]));
    return { status: 0, stdout: buildPrintStdout({ ...expect, env, program: expect.argv[0] }) };
  }, 'attempt');
});

test('verified-register: T3 case (ix) — every canonical env pair present alongside launchd-injected keys ⇒ skipped (containment)', async () => {
  // buildPrintStdout always adds OSLogRateLimit/XPC_SERVICE_NAME on top of `env`
  // — this case pins that containment (not set-equality) is what is checked.
  await runT3Case((expect) => ({ status: 0, stdout: buildPrintStdout({ ...expect, program: expect.argv[0] }) }), 'skip');
});

test('verified-register: T3 case (x) — the environment block is unparseable ⇒ attempted', async () => {
  await runT3Case((expect) => ({ status: 0, stdout: buildPrintStdout({ ...expect, malformedEnv: true }) }), 'attempt');
});

test('verified-register: T3 case (xi) — the catch-up shape: Minute-only, NO Hour key, matched against hour:null ⇒ skipped', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinCatchupExpect(paths);
  const content = gen.catchupPlist({
    node: gen.entryNodePath(), launcher: gen.launcherPath(paths), expectDigest: '', jobDigests: gen.encodeJobDigests({}),
    home: paths.home, core: paths.core, logDir: path.join(paths.logs, 'catchup'),
  });
  fs.mkdirSync(path.dirname(expect.plistPath), { recursive: true });
  fs.writeFileSync(expect.plistPath, content);
  manifestLib.record(manifest, { kind: 'scheduler-entry', path: expect.plistPath });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [{ status: 0, stdout: matchingStdout(expect) }]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const cuCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.equal(cuCalls.length, 1, 'the catch-up entry gets its own verified skip: one print, zero mutating calls');
  assert.equal(res.loaded, true);
});

test('verified-register: T3 case (xii) — the same catch-up record but carrying "Hour" => 0 ⇒ attempted', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinCatchupExpect(paths);
  const content = gen.catchupPlist({
    node: gen.entryNodePath(), launcher: gen.launcherPath(paths), expectDigest: '', jobDigests: gen.encodeJobDigests({}),
    home: paths.home, core: paths.core, logDir: path.join(paths.logs, 'catchup'),
  });
  fs.mkdirSync(path.dirname(expect.plistPath), { recursive: true });
  fs.writeFileSync(expect.plistPath, content);
  manifestLib.record(manifest, { kind: 'scheduler-entry', path: expect.plistPath });
  const stdout = buildPrintStdout({ ...expect, hour: 0, program: expect.argv[0] });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [{ status: 0, stdout }]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const cuCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.ok(cuCalls.length >= 2 && cuCalls[1][1] === 'bootstrap', 'hour:null REFUSES a present Hour key — Hour 0 + Minute 0 is a different schedule than Minute 0 alone');
  void res;
});

test('verified-register: T3 case (xiii) — the empty-value fixture: the record omits the whole ambient scrub ⇒ attempted', async () => {
  await runT3Case((expect) => {
    const env = expect.env.filter(([k]) => k === 'HOME' || k === 'WIENERDOG_HOME'); // drop the 5 scrub pairs
    return { status: 0, stdout: buildPrintStdout({ ...expect, env, program: expect.argv[0] }) };
  }, 'attempt');
});

test("verified-register: T3 case (xiii)'s pair — a HEALTHY record's five valueless `KEY =>` lines ARE the scrub, and must be parsed as present ⇒ skipped", async () => {
  // §7b fact 4: five of the seven canonical pairs render as `KEY =>` with
  // NOTHING after the arrow — that IS their intended (empty-string) value on a
  // genuinely healthy record. A parser that skips a valueless line instead of
  // recording `['KEY','']` would drop these five keys from the parsed map and
  // wrongly force an attempt on a record that is doing exactly its authorized
  // job — the C2 defect named in AC3 case (xiii).
  await runT3Case((expect) => ({ status: 0, stdout: matchingStdout(expect) }), 'skip');
});

test('verified-register: T3 case (xiv) — the indeterminate fixture (CX-1): print exits 0 but degraded, changed=true, bootstrap fails ⇒ no bootout anywhere', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: 'degraded / truncated output, no arguments block at all' },
    { status: 1 },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.equal(jobCalls.length, 2, 'stops after the failed bootstrap — indeterminate authorizes no further step');
  assert.ok(!jobCalls.some((a) => a[1] === 'bootout'), 'parse degradation must never destroy a possibly-healthy record');
  assert.equal(res.loaded, false);
});

test('verified-register: T3 case (xv) — path drift: the loaded record was read from a different plist file ⇒ attempted', async () => {
  await runT3Case((expect) => ({
    status: 0,
    stdout: buildPrintStdout({ ...expect, path: '/some/other/ai.wienerdog.dream.plist', program: expect.argv[0] }),
  }), 'attempt');
});

test('verified-register: T3 case (xvi) — program drift ⇒ attempted', async () => {
  await runT3Case((expect) => ({ status: 0, stdout: buildPrintStdout({ ...expect, program: '/some/other/node' }) }), 'attempt');
});

test('verified-register: T3 case (xvii) — a log path drifts ⇒ attempted', async () => {
  await runT3Case((expect) => ({
    status: 0,
    stdout: buildPrintStdout({ ...expect, stdoutPath: '/some/other/launchd.out.log', program: expect.argv[0] }),
  }), 'attempt');
});

test('verified-register: T3 case (xviii) — spawn type is not background ⇒ attempted', async () => {
  await runT3Case((expect) => ({
    status: 0,
    stdout: buildPrintStdout({ ...expect, spawnType: 'foreground', program: expect.argv[0] }),
  }), 'attempt');
});

test('verified-register: T3 case (xix) — the extra-trigger fixture (CX10-1): a SECOND calendarinterval trigger ⇒ attempted, not skipped', async () => {
  await runT3Case((expect) => ({
    status: 0,
    stdout: buildPrintStdout({ ...expect, triggerCount: 2, program: expect.argv[0] }),
  }), 'attempt');
});

test('verified-register: T3 case (xx) — the foreign-stream fixture (CX11-2): our calendar trigger PLUS a foreign-stream one ⇒ attempted, not skipped', async () => {
  await runT3Case((expect) => ({
    status: 0,
    stdout: buildPrintStdout({ ...expect, triggerCount: 2, foreignStreamTrigger: true, program: expect.argv[0] }),
  }), 'attempt');
});

test('verified-register: T3 case (xxi) — an absent path/program/log-path/spawn-type line ⇒ indeterminate, attempted, no bootout', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const stdout = buildPrintStdout({ ...expect, program: expect.argv[0], omit: ['program'] });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout },
    { status: 1 },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.ok(!jobCalls.some((a) => a[1] === 'bootout'), 'an absent line is a readback we could not complete — never a divergence');
  assert.equal(res.loaded, false);
});

test('verified-register: T3 case (xxii) — benign-only drift (stale stdout path): no bootout, existing record stays loaded, loaded:false + notice', async () => {
  const { paths } = setup();
  // Table N row 2: the notice's ONLY push site is inside `repointSchedules`, and
  // `repointSchedules` iterates CONFIGURED jobs (`jobsLib.listJobs`), not the
  // manifest — so the job must be saved for the repoint leg to reach it at all.
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  fs.mkdirSync(path.dirname(expect.plistPath), { recursive: true });
  fs.writeFileSync(expect.plistPath, 'not yet canonical'); // forces changed:true
  const benignStdout = buildPrintStdout({ ...expect, stdoutPath: '/old/logs/launchd.out.log', program: expect.argv[0] });
  // Four scripted responses: the direct `registerPlatform` leg below consumes
  // the first pair; `repointSchedules`'s OWN internal `registerPlatform` call
  // (driven through the SAME loader) consumes the second pair, reproducing the
  // identical benign-drift mismatch so it reaches the same `loaded:false`.
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: benignStdout },
    { status: 1 }, // the non-destructive bootstrap fails (the label is loaded)
    { status: 0, stdout: benignStdout },
    { status: 1 },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.ok(!jobCalls.some((a) => a[1] === 'bootout'), 'BENIGN-only mismatch ⇒ no skip AND no teardown — the record is still doing its authorized job');
  assert.equal(jobCalls.length, 2, 'print + the single failed non-destructive attempt, nothing more');
  assert.equal(res.loaded, false);

  // Table N row 2 — the darwin leg's ONLY notice proof: a `registerPlatform`-
  // only fixture proves `loaded:false` and nothing about §8's notice, because
  // the notice's single push site is inside `repointSchedules` (schedule.js:583).
  const r = await withPlutilExists(false, () => schedule.repointSchedules(paths, manifest, { loader, platform: 'darwin' }));
  assert.ok(
    r.notices.some((n) => /"dream".*did not accept it/.test(n)),
    'repointSchedules pushes §8\'s notice for the still-benign-drifted, still-unloaded entry'
  );
});

test("verified-register: T3 case (xxii)'s sibling — a FATAL field (stale env) still reaches the replace path", async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  fs.mkdirSync(path.dirname(expect.plistPath), { recursive: true });
  fs.writeFileSync(expect.plistPath, 'not yet canonical');
  const env = expect.env.map(([k, v]) => (k === 'WIENERDOG_HOME' ? [k, '/stale/core'] : [k, v]));
  const fatalStdout = buildPrintStdout({ ...expect, env, program: expect.argv[0] });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: fatalStdout },
    { status: 1 }, // non-destructive attempt fails
    { status: 0 }, // bootout
    { status: 0 }, // replacement bootstrap succeeds
    { status: 0, stdout: matchingStdout(expect) }, // verify
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const jobCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.ok(jobCalls.some((a) => a[1] === 'bootout'), 'a FATAL env mismatch DOES reach the replace path');
  assert.equal(res.loaded, true);
});

// -------------------------------------------------------------------------
// T4 — catch-up entry through the same helper (AC4)
// -------------------------------------------------------------------------

test('verified-register: T4 — catch-up goes through ensureDarwinEntryRegistered: AC1 ordering + AC2 teardown guard both hold', async () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const expect = darwinCatchupExpect(paths);
  const staleStdout = buildPrintStdout({ ...expect, argv: [...expect.argv.slice(0, -1), 'sha256:' + 'a'.repeat(64)], program: expect.argv[0] });
  const { loader, calls } = scriptedDarwinLoader(paths, expect.label, [
    { status: 0, stdout: staleStdout },
    { status: 1 },
    { status: 0 },
    { status: 0 },
    { status: 0, stdout: matchingStdout(expect) },
  ]);
  const res = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'darwin')
  );
  const cuCalls = calls.filter((a) => labelForArgv(a) === expect.label);
  assert.deepEqual(cuCalls.map((a) => a[1]), ['print', 'bootstrap', 'bootout', 'bootstrap', 'print']);
  assert.equal(res.loaded, true);

  // The teardown guard also holds for catch-up: nothing loaded + a failed
  // bootstrap must never reach a bootout.
  const { paths: paths2 } = setup();
  const manifest2 = manifestLib.load(paths2);
  const expect2 = darwinCatchupExpect(paths2);
  const { loader: loader2, calls: calls2 } = scriptedDarwinLoader(paths2, expect2.label, [
    { status: 113 },
    { status: 1 },
  ]);
  const res2 = await withPlutilExists(false, () =>
    schedule.registerPlatform(paths2, manifest2, { name: 'dream', hour: 3, minute: 30 }, loader2, 'darwin')
  );
  const cuCalls2 = calls2.filter((a) => labelForArgv(a) === expect2.label);
  assert.ok(!cuCalls2.some((a) => a[1] === 'bootout'));
  assert.equal(res2.loaded, false);
});

// -------------------------------------------------------------------------
// T5 / T6 — linux (AC5)
// -------------------------------------------------------------------------

test('verified-register: T5 — linux degraded reload ⇒ loaded:false + notice, even though enable --now succeeds', { skip: !LINUX_SYSTEMD }, () => {
  const { paths } = setup();
  // Table N row 3: the notice's ONLY push site is inside `repointSchedules`,
  // which iterates CONFIGURED jobs — the job must be saved for the repoint leg
  // to reach it.
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const manifest = manifestLib.load(paths);
  const loader = (argv) => {
    if (argv[0] === 'systemctl' && argv.includes('daemon-reload')) return { status: 1 };
    return { status: 0 };
  };
  const res = schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'linux');
  assert.equal(res.loaded, false, 'reloadOk && enableOk — a degraded reload fails the register even though enable --now succeeded');

  // Table N row 3 — the linux leg's ONLY notice proof: a `registerPlatform`-only
  // fixture proves `loaded:false` and nothing about §8's notice, since the
  // notice's single push site is inside `repointSchedules` (schedule.js:583).
  const r = schedule.repointSchedules(paths, manifest, { loader, platform: 'linux' });
  assert.ok(
    r.notices.some((n) => /"dream".*did not accept it/.test(n)),
    'repointSchedules pushes §8\'s notice for the still-degraded-reload, still-unloaded entry'
  );
});

test('verified-register: T5 — linux daemon-reload {status:null} / missing result also counts as failure', { skip: !LINUX_SYSTEMD }, () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const loader = (argv) => {
    if (argv[0] === 'systemctl' && argv.includes('daemon-reload')) return { status: null };
    return { status: 0 };
  };
  const res = schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'linux');
  assert.equal(res.loaded, false);
});

test('verified-register: T6 — linux unchanged bytes still reload + enable, exactly two calls', { skip: !LINUX_SYSTEMD }, () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  const calls1 = [];
  schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, (a) => (calls1.push(a), { status: 0 }), 'linux');
  const calls2 = [];
  const res = schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, (a) => (calls2.push(a), { status: 0 }), 'linux');
  assert.equal(res.changed, false, 'the second register sees identical bytes');
  assert.deepEqual(calls2, [
    ['systemctl', '--user', 'daemon-reload'],
    ['systemctl', '--user', 'enable', '--now', 'wienerdog-dream.timer'],
  ], 'exactly reload + enable — no verified skip exists on this leg (Table A row 3)');
});

// -------------------------------------------------------------------------
// T7 — the CLI path: add() throws on an unloaded outcome for an UNCHANGED
// entry, on both fixed legs (AC11, D5)
// -------------------------------------------------------------------------

test('verified-register: T7 — darwin: add() throws when an unchanged entry\'s readback mismatches then fails to register', { skip: process.platform !== 'darwin' }, async () => {
  const { env, paths } = setup();
  const fake = fakeLaunchd(paths);
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], fake);

  // Drift the loaded record's spawn type (a BENIGN-tier field, Table A2b) so a
  // re-add's readback mismatches without authorizing a teardown, and make every
  // bootstrap fail so the register cannot heal itself.
  const label = 'ai.wienerdog.dream';
  const expect = darwinJobExpect(paths, 'dream', 3, 30);
  const badStdout = buildPrintStdout({ ...expect, spawnType: 'foreground', program: expect.argv[0] });
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => ((out += s), true);
  try {
    await assert.rejects(
      runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], (argv) => {
        if (labelForArgv(argv) === label && argv[1] === 'print') return { status: 0, stdout: badStdout };
        if (labelForArgv(argv) === label && argv[1] === 'bootstrap') return { status: 1 };
        return fake(argv);
      }),
      WienerdogError
    );
  } finally {
    process.stdout.write = orig;
  }
  assert.ok(!/already scheduled/.test(out), 'the "already scheduled … unchanged" string must never print over an unloaded outcome');
});

test('verified-register: T7 — linux: add() throws when an unchanged entry\'s hoisted daemon-reload is degraded', { skip: !LINUX_SYSTEMD }, async () => {
  const { env } = setup();
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], () => ({ status: 0 }));
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => ((out += s), true);
  try {
    await assert.rejects(
      runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], (argv) =>
        argv[0] === 'systemctl' && argv.includes('daemon-reload') ? { status: 1 } : { status: 0 }
      ),
      WienerdogError
    );
  } finally {
    process.stdout.write = orig;
  }
  assert.ok(!/already scheduled/.test(out), 'the "already scheduled … unchanged" string must never print over an unloaded outcome');
});

