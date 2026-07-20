'use strict';

// WP-catchup-per-job-authorization — catch-up per-job authorization.
//
// Catch-up is authorized against a per-job digest MAP bound (base64url) into the
// LOADED catch-up OS registration (macOS + Windows) and forwarded by the launcher
// as an opaque `--job-digests` token — never re-read from an editable per-job entry
// file or config.yaml. The run-job catch-up runner decodes it (strict, bounded) and
// union-authorizes bound ∪ configured job names BEFORE due-filtering. Every negative
// here is mutation-sensitive: deleting the guard it covers turns the assertion red.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { getPaths } = require('../../src/core/paths');
const manifestLib = require('../../src/core/manifest');
const jobsLib = require('../../src/scheduler/jobs');
const gen = require('../../src/scheduler/generators');
const runjob = require('../../src/cli/run-job');
const schedule = require('../../src/cli/schedule');
const status = require('../../src/scheduler/status');
const { readAlerts } = require('../../src/core/alerts');

// systemd user dir hermeticity (mirrors scheduler-schedule.test.js): CI may set
// XDG_CONFIG_HOME to the real ~/.config — unset it so nothing resolves outside temp.
delete process.env.XDG_CONFIG_HOME;

/** @param {string} c @returns {string} */
function sha256(c) {
  return crypto.createHash('sha256').update(c).digest('hex');
}

/** Deterministic descriptor-digest FAKE for the catchUp `deriveDigest` seam: a
 *  content-addressed sha256 over the authorization-relevant job fields. Any edit to
 *  run/at/timeout drifts it (mirrors the real digest covering those fields). */
function fakeDerive(job) {
  return `sha256:${sha256(JSON.stringify([job.name, job.run, job.at, job.timeoutMinutes]))}`;
}

/** Isolated temp core with a config (vault under HOME → TCC-safe) + manifest. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-catchup-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  const vault = path.join(root, 'wienerdog');
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.mkdirSync(vault, { recursive: true });
  const config = `# Wienerdog configuration
version: 1
vault: ${vault}
update_check: false
`;
  fs.writeFileSync(paths.config, config);
  manifestLib.save(paths, {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [
      { kind: 'dir', path: paths.core },
      { kind: 'file', path: paths.config, hash: sha256(config) },
    ],
  });
  return { root, env, paths, vault };
}

/** A `now` after both a 09:00 fire (overdue) — used across authorization tests. */
function tenAm() {
  const now = new Date();
  now.setHours(10, 0, 0, 0);
  return now;
}

/** Mint the bound base64url token over the CURRENT configured jobs, using the fake
 *  deriver — the same code path a real attended mint uses, just with the seam. */
function mintToken(paths) {
  const map = {};
  for (const job of jobsLib.listJobs(paths)) map[job.name] = fakeDerive(job);
  return gen.encodeJobDigests(map);
}

/** A spy standing in for runJob: records which jobs actually spawned. */
function runSpy() {
  const ran = [];
  return { spy: async (_paths, job) => { ran.push(job.name); }, ran };
}

// -------------------------------------------------------------------------
// [bypass closed] — a config drift a normal fire refuses is also refused here.
// -------------------------------------------------------------------------

test('catchup-auth: a config `run`/descriptor drift on the dream job ⇒ DRIFT refusal (zero spawn, durable alert)', async () => {
  const { paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 });
  const token = mintToken(paths); // bound from the ORIGINAL descriptor

  // Statically rewrite the job's `run` — a normal fire would drift + refuse.
  jobsLib.saveJob(paths, { name: 'dream', at: '09:00', run: 'skill:evil', timeoutMinutes: 20 });

  const { spy, ran } = runSpy();
  await runjob.catchUp(paths, {
    jobDigests: token, deriveDigest: fakeDerive, runJob: spy,
    now: tenAm(), platform: 'darwin', sendAlert: () => ({ status: 0 }),
  });

  assert.deepEqual(ran, [], 'the drifted job was NOT run');
  const alerts = readAlerts(paths).filter((a) => a.job === 'dream');
  assert.equal(alerts.length >= 1, true, 'a durable refusal alert was written');
  assert.match(alerts[alerts.length - 1].reason, /descriptor changed/);
});

// -------------------------------------------------------------------------
// [due-time, R4:#1] — an at-rewrite-to-future ALERTS (never silently suppressed).
// -------------------------------------------------------------------------

test('catchup-auth: an `at`-only rewrite to a FUTURE time ⇒ DRIFT alert + zero spawn (authorized BEFORE due-filtering)', async () => {
  const { paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 });
  const token = mintToken(paths);

  // Rewrite `at` to 23:59 — at 10:00 this makes the job "not due"; the naive
  // "due-filter then digest" would silently suppress it with NO alert. Because
  // authorization precedes due-filtering AND `at` is in the digest, it DRIFTS.
  jobsLib.saveJob(paths, { name: 'dream', at: '23:59', run: 'builtin:dream', timeoutMinutes: 20 });

  const { spy, ran } = runSpy();
  await runjob.catchUp(paths, {
    jobDigests: token, deriveDigest: fakeDerive, runJob: spy,
    now: tenAm(), platform: 'darwin', sendAlert: () => ({ status: 0 }),
  });

  assert.deepEqual(ran, [], 'the at-rewritten job was NOT run');
  const alerts = readAlerts(paths).filter((a) => a.job === 'dream');
  assert.equal(alerts.length >= 1, true, 'the at-rewrite ALERTED, not silently suppressed');
});

// -------------------------------------------------------------------------
// [removal, R4:#1] — a removed authorized job ALERTS; an added job is refused.
// -------------------------------------------------------------------------

test('catchup-auth: a bound job REMOVED from config ⇒ REMOVAL alert + zero spawn; the surviving job still runs', async () => {
  const { paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 });
  jobsLib.saveJob(paths, { name: 'backup', at: '09:00', run: 'skill:wienerdog-weekly-review', timeoutMinutes: 15 });
  const token = mintToken(paths); // binds BOTH dream + backup

  // Remove `backup` from config (only dream remains).
  jobsLib.removeJob(paths, 'backup');

  const { spy, ran } = runSpy();
  await runjob.catchUp(paths, {
    jobDigests: token, deriveDigest: fakeDerive, runJob: spy,
    now: tenAm(), platform: 'darwin', sendAlert: () => ({ status: 0 }),
  });

  assert.deepEqual(ran, ['dream'], 'only the surviving, authorized, overdue job ran');
  const removed = readAlerts(paths).filter((a) => a.job === 'backup');
  assert.equal(removed.length >= 1, true, 'the removed authorized job ALERTED (not silent)');
  assert.match(removed[removed.length - 1].reason, /no longer in your config/);
});

test('catchup-auth: an ADDED unauthorized job (not in the bound map) ⇒ alert + zero spawn', async () => {
  const { paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 });
  const token = mintToken(paths); // binds ONLY dream

  // Statically add job B AFTER the mint — it is not in the loaded map.
  jobsLib.saveJob(paths, { name: 'evil', at: '09:00', run: 'skill:evil', timeoutMinutes: 15 });

  const { spy, ran } = runSpy();
  await runjob.catchUp(paths, {
    jobDigests: token, deriveDigest: fakeDerive, runJob: spy,
    now: tenAm(), platform: 'darwin', sendAlert: () => ({ status: 0 }),
  });

  assert.equal(ran.includes('evil'), false, 'the unauthorized added job was NOT run');
  assert.deepEqual(ran, ['dream'], 'only the authorized job ran');
  const added = readAlerts(paths).filter((a) => a.job === 'evil');
  assert.equal(added.length >= 1, true, 'the added job ALERTED');
  assert.match(added[added.length - 1].reason, /not in the authorized job map/);
});

// -------------------------------------------------------------------------
// [transport, R4:#3 / R8:#2] — base64url round-trip (macOS + Windows) + malformed.
// -------------------------------------------------------------------------

for (const platform of ['darwin', 'win32']) {
  test(`catchup-auth: [${platform}] the bound base64url map round-trips and authorizes a matching overdue job`, async () => {
    const { paths } = setup();
    jobsLib.saveJob(paths, { name: 'dream', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 });
    const token = mintToken(paths);
    // The token the launcher forwards decodes to the bound map (base64url → JSON → shape).
    assert.deepEqual(gen.decodeJobDigests(token).map, { dream: fakeDerive({ name: 'dream', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 }) });

    const { spy, ran } = runSpy();
    await runjob.catchUp(paths, {
      jobDigests: token, deriveDigest: fakeDerive, runJob: spy,
      now: tenAm(), platform, sendAlert: () => ({ status: 0 }),
    });
    assert.deepEqual(ran, ['dream'], 'the authorized, overdue job ran');
  });

  test(`catchup-auth: [${platform}] a MALFORMED map token ⇒ durable alert + ZERO spawn (no crash)`, async () => {
    const { paths } = setup();
    jobsLib.saveJob(paths, { name: 'dream', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 });

    const { spy, ran } = runSpy();
    await runjob.catchUp(paths, {
      jobDigests: 'this is !!! not base64url', deriveDigest: fakeDerive, runJob: spy,
      now: tenAm(), platform, sendAlert: () => ({ status: 0 }),
    });
    assert.deepEqual(ran, [], 'nothing ran under an unreadable map');
    const alerts = readAlerts(paths).filter((a) => a.job === 'catchup');
    assert.equal(alerts.length >= 1, true, 'a durable refusal alert was written');
  });

  test(`catchup-auth: [${platform}] an OVERSIZED map token ⇒ durable alert + ZERO spawn`, async () => {
    const { paths } = setup();
    jobsLib.saveJob(paths, { name: 'dream', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 });

    const { spy, ran } = runSpy();
    await runjob.catchUp(paths, {
      jobDigests: 'A'.repeat(gen.JOB_DIGESTS_MAX_BYTES + 1), deriveDigest: fakeDerive, runJob: spy,
      now: tenAm(), platform, sendAlert: () => ({ status: 0 }),
    });
    assert.deepEqual(ran, [], 'nothing ran under an oversized map');
    assert.equal(readAlerts(paths).filter((a) => a.job === 'catchup').length >= 1, true);
  });
}

// -------------------------------------------------------------------------
// [Linux, R8:#2 / R9:#4] — no all-job map; Persistent per-job .service replays,
// authorized by its OWN --expect-digest; no duplicate all-job dispatch.
// -------------------------------------------------------------------------

test('catchup-auth: Linux binds NO all-job map — Persistent .timer replays the per-job .service (its own --expect-digest)', () => {
  // The per-job timer gives native catch-up (Persistent=true) — no separate entry.
  assert.match(gen.systemdTimer({ name: 'dream', hour: 3, minute: 30 }), /Persistent=true/);
  // The per-job service carries the NORMAL per-job --expect-digest and NO all-job map.
  const svc = gen.systemdService({
    name: 'dream', node: '/usr/bin/node', launcher: '/wd/launch.js',
    descriptor: '/wd/d.json', expectDigest: 'sha256:beef', home: '/home/ada',
  });
  assert.match(svc, /--expect-digest sha256:beef/, 'per-job service is descriptor-authorized');
  assert.doesNotMatch(svc, /--job-digests/, 'Linux introduces no all-job map / duplicate dispatch');
  // There is no separate Linux catch-up registration to tear down.
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  assert.deepEqual(gen.teardownCatchup(paths, manifest, { platform: 'linux' }), { removed: false });
});

// -------------------------------------------------------------------------
// [runtime-mint, R5] — a nightly success must NOT re-register/re-mint the map.
// -------------------------------------------------------------------------

test('catchup-auth: a runJob SUCCESS does NOT register or re-mint the catch-up entry (attended-only mint)', { skip: process.platform !== 'darwin' }, async () => {
  const { paths } = setup();
  const job = { name: 'dream', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 };
  jobsLib.saveJob(paths, job);

  const plistPath = path.join(gen.launchAgentsDir(paths.home), 'ai.wienerdog.catchup.plist');
  assert.equal(fs.existsSync(plistPath), false, 'no catch-up entry before the run');

  const loaderCalls = [];
  await runjob.runJob(paths, job, {
    platform: 'darwin',
    resolveCommand: () => ({ command: process.execPath, args: ['-e', ''], shell: false }),
    loader: (argv) => { loaderCalls.push(argv); return { status: 0 }; },
    sendAlert: () => ({ status: 0 }),
  });

  // The success path may emit a read-only "missing" notice, but MUST NOT write the
  // entry or call the loader to register it. Re-adding the removed runtime
  // ensureCatchup would create the plist and bootstrap it here → this fails.
  assert.equal(fs.existsSync(plistPath), false, 'success did NOT create the catch-up entry');
  const catchupBootstraps = loaderCalls.filter((a) => a.join(' ').includes('ai.wienerdog.catchup'));
  assert.deepEqual(catchupBootstraps, [], 'success did NOT register/re-mint the catch-up entry');
});

test('catchup-auth: after adding B statically, A succeeding does not authorize B — a later catch-up REFUSES B', { skip: process.platform !== 'darwin' }, async () => {
  const { paths } = setup();
  const a = { name: 'a', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 };
  jobsLib.saveJob(paths, a);
  const token = mintToken(paths); // binds ONLY a

  // Statically add B to config, no re-sync.
  jobsLib.saveJob(paths, { name: 'b', at: '09:00', run: 'skill:evil', timeoutMinutes: 15 });

  // A fires and succeeds — its post-success path must NOT re-mint the loaded map.
  await runjob.runJob(paths, a, {
    platform: 'darwin',
    resolveCommand: () => ({ command: process.execPath, args: ['-e', ''], shell: false }),
    loader: () => ({ status: 0 }),
    sendAlert: () => ({ status: 0 }),
  });

  // A subsequent catch-up fired from the STILL-A-only loaded map refuses B.
  const { spy, ran } = runSpy();
  await runjob.catchUp(paths, {
    jobDigests: token, deriveDigest: fakeDerive, runJob: spy,
    now: tenAm(), platform: 'darwin', sendAlert: () => ({ status: 0 }),
  });
  assert.equal(ran.includes('b'), false, "B was never authorized by A's success");
  const bAlerts = readAlerts(paths).filter((al) => al.job === 'b');
  assert.equal(bAlerts.length >= 1, true, 'B was refused with a durable alert');
});

// -------------------------------------------------------------------------
// [missing-registration heal, R6] — repointSchedules repairs a dropped LOADED
// catch-up registration; reloadMissing never touches the catch-up entry.
// -------------------------------------------------------------------------

test('catchup-auth: repointSchedules RESTORES a missing loaded catch-up registration with a bound map; reloadMissing never touches it', { skip: process.platform !== 'darwin' }, () => {
  const { paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const manifest = manifestLib.load(paths);
  const plistPath = path.join(gen.launchAgentsDir(paths.home), 'ai.wienerdog.catchup.plist');

  // 1) Attended mint: the source file + manifest entry now exist (probe 'loaded').
  schedule.repointSchedules(paths, manifest, {
    loader: () => ({ status: 0 }), platform: 'darwin', probe: () => 'loaded',
  });
  assert.equal(fs.existsSync(plistPath), true, 'catch-up plist minted');
  assert.ok(manifest.entries.some((e) => e.path === plistPath), 'catch-up manifest entry recorded');

  // 2) The OS silently drops the LOADED registration (file + manifest stay intact).
  //    ONE attended sync (repointSchedules) with the probe reporting 'missing'
  //    force-restores it — ensureCatchup no-ops on identical bytes, so only the
  //    repair path can reload it.
  const calls = [];
  schedule.repointSchedules(paths, manifest, {
    loader: (a) => { calls.push(a); return { status: 0 }; }, platform: 'darwin', probe: () => 'missing',
  });
  const restore = calls.filter((a) => a.join(' ').includes('bootstrap') && a.join(' ').includes('ai.wienerdog.catchup'));
  assert.equal(restore.length >= 1, true, 'repointSchedules force-restored the missing catch-up registration');
  // The restored entry carries a decodable --job-digests map (loaded-state anchor).
  const text = fs.readFileSync(plistPath, 'utf8');
  const bound = text.slice(text.indexOf('--job-digests')).match(/<string>([A-Za-z0-9_-]+)<\/string>/);
  assert.ok(bound && gen.decodeJobDigests(bound[1]).ok, 'the restored entry carries a valid bound map');

  // 3) The generic reloadMissing heal, run alone, NEVER creates/reloads the catch-up
  //    entry — it enumerates configured jobs only (dream), never 'catchup'.
  const healCalls = [];
  status.reloadMissing(paths, {
    loader: (a) => { healCalls.push(a); return { status: 0 }; }, platform: 'darwin', probe: () => 'missing',
  });
  assert.equal(
    healCalls.some((a) => a.join(' ').includes('ai.wienerdog.catchup')),
    false,
    'reloadMissing is excluded from the catch-up entry entirely'
  );
});
