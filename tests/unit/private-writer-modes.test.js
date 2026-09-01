'use strict';

// WP-private-state-writers-mode-pin: the three mode-dropping writers
// (writeScheduleState, writeWatermarks, clearAlerts) now write their
// private-listed file through `writeFilePrivate`, and appendAlert's
// compaction branch (Table D) is migrated onto it too, wrapped so it can
// never throw. This file exercises the REAL writers end to end (no
// reimplementation of their logic) against the contracts in Tables B/C/D/D2.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const { insecureEntries, writeFilePrivate } = require('../../src/core/private-fs');
const { WienerdogError } = require('../../src/core/errors');
const jobsLib = require('../../src/scheduler/jobs');
const wmLib = require('../../src/core/dream/watermarks');
const { appendAlert, readAlerts, clearAlerts, MAX_FILE_BYTES } = require('../../src/core/alerts');

const POSIX = process.platform !== 'win32';

const PRIVATE_FS_ID = require.resolve('../../src/core/private-fs');
const ALERTS_ID = require.resolve('../../src/core/alerts');
const JOBS_ID = require.resolve('../../src/scheduler/jobs');
const WATERMARKS_ID = require.resolve('../../src/core/dream/watermarks');

/** @param {string} p @returns {number} */
function modeOf(p) {
  return fs.statSync(p).mode & 0o777;
}

/** Run `fn` under a permissive umask, restoring the previous one. */
function withUmask(mask, fn) {
  const prev = process.umask(mask);
  try {
    return fn();
  } finally {
    process.umask(prev);
  }
}

/** Isolated temp core, state/ pre-created 0700. The root (and state/) are
 *  created under a known-safe umask BEFORE the caller lowers it for its own
 *  probe — `mkdtempSync`'s requested 0700 is itself umask-masked, so creating
 *  it under an already-lowered umask can lock the fixture out with EACCES
 *  before the writer under test is ever called. */
function freshFixture() {
  return withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-pwm-'));
    const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
    fs.mkdirSync(paths.state, { recursive: true, mode: 0o700 });
    return { root, paths };
  });
}

/** @param {import('../../src/core/paths').WienerdogPaths} paths @returns {string} */
function scheduleFile(paths) {
  return path.join(paths.state, 'schedule.json');
}
/** @param {import('../../src/core/paths').WienerdogPaths} paths @returns {string} */
function watermarksFile(paths) {
  return path.join(paths.state, 'watermarks.json');
}
/** @param {import('../../src/core/paths').WienerdogPaths} paths @returns {string} */
function alertsFile(paths) {
  return path.join(paths.state, 'alerts.jsonl');
}

/** @param {string} job @returns {{job:string, at:string, reason:string, log_hint:string}} */
function rec(job) {
  return { job, at: '2026-01-01T00:00:00Z', reason: 'r', log_hint: 'h' };
}

/** Replace private-fs's `writeFilePrivate` export with `stubFn`, then
 *  re-require `moduleId` FRESH so its own destructured reference picks up the
 *  stub (mirrors the `stubCollaborators` idiom in dream-validate.test.js). The
 *  module-level references this file already imported at the top are a
 *  SEPARATE, earlier-loaded instance and are unaffected — they keep using the
 *  real `writeFilePrivate` throughout.
 *  @param {string} moduleId a `require.resolve(...)`'d module path
 *  @param {Function} stubFn
 *  @returns {{mod: object, restore: () => void}} */
function stubWriteFilePrivateFor(moduleId, stubFn) {
  const privateFsExports = require.cache[PRIVATE_FS_ID].exports;
  const orig = privateFsExports.writeFilePrivate;
  privateFsExports.writeFilePrivate = stubFn;
  delete require.cache[moduleId];
  // eslint-disable-next-line global-require
  const mod = require(moduleId);
  return {
    mod,
    restore() {
      require.cache[PRIVATE_FS_ID].exports.writeFilePrivate = orig;
      delete require.cache[moduleId];
    },
  };
}

/** `stubWriteFilePrivateFor` specialized to alerts.js, keeping the `alerts`-
 *  named return the existing Table D tests already destructure.
 *  @param {Function} stubFn
 *  @returns {{alerts: object, restore: () => void}} */
function stubAlertsWriteFilePrivate(stubFn) {
  const { mod, restore } = stubWriteFilePrivateFor(ALERTS_ID, stubFn);
  return { alerts: mod, restore };
}

/** Capture `process.stderr.write` calls during `fn()`. @returns {number} call count */
function countStderrWrites(fn) {
  const orig = process.stderr.write;
  let calls = 0;
  process.stderr.write = (...a) => {
    calls += 1;
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = orig;
  }
  return calls;
}

// ---------------------------------------------------------------------------
// Table C — the mode contract (10 applicable cells across both umasks)
// ---------------------------------------------------------------------------

for (const um of [0o000, 0o777]) {
  const tag = um.toString(8).padStart(4, '0');

  test(`private-writer-modes: umask ${tag} — schedule.json, watermarks.json, alerts.jsonl land exactly 0600 and the predicate agrees`, { skip: !POSIX }, () => {
    const { paths } = freshFixture();
    withUmask(um, () => {
      jobsLib.writeScheduleState(paths, 'dream', { last_status: 'ok' }); // absent
      assert.equal(modeOf(scheduleFile(paths)), 0o600, `schedule.json absent, umask ${tag}`);
      jobsLib.writeScheduleState(paths, 'dream', { last_status: 'ok' }); // present
      assert.equal(modeOf(scheduleFile(paths)), 0o600, `schedule.json present, umask ${tag}`);

      wmLib.writeWatermarks(paths.state, { claude: 1, codex: 2 }); // absent
      assert.equal(modeOf(watermarksFile(paths)), 0o600, `watermarks.json absent, umask ${tag}`);
      wmLib.writeWatermarks(paths.state, { claude: 3, codex: 4 }); // present
      assert.equal(modeOf(watermarksFile(paths)), 0o600, `watermarks.json present, umask ${tag}`);

      appendAlert(paths, rec('a'));
      appendAlert(paths, rec('b'));
      clearAlerts(paths, 'a'); // leaves b's record -> rewrite branch (present-only)
      assert.equal(modeOf(alertsFile(paths)), 0o600, `alerts.jsonl present, umask ${tag}`);

      const flagged = insecureEntries(paths).filter((p) =>
        ['schedule.json', 'watermarks.json', 'alerts.jsonl'].includes(path.basename(p))
      );
      assert.deepEqual(flagged, [], `insecureEntries reports none of the three under umask ${tag}`);
    });
  });
}

test('private-writer-modes: clearAlerts on a destination that ends up absent still takes the delete branch and writes no file', () => {
  const { paths } = freshFixture();
  appendAlert(paths, rec('only-job'));
  assert.equal(clearAlerts(paths, 'only-job'), undefined, 'return value unchanged');
  assert.equal(fs.existsSync(alertsFile(paths)), false, 'no records remain -> file removed, not rewritten');
});

// ---------------------------------------------------------------------------
// Delegation — each fixed writer calls writeFilePrivate with the right shape.
// Table C above observes only the FINAL mode: a regression that swapped
// writeFilePrivate back out for a mode-less temp+chmod+rename would still pass
// every mode cell if the chmod happened to land 0600. These spy on the call
// itself instead, so the primitive's OWN tests (pre-rename fchmod, O_EXCL
// temp, etc — private-fs.test.js) are what's relied on for the security
// properties, not re-derived here.
// ---------------------------------------------------------------------------

test('private-writer-modes: writeScheduleState delegates to writeFilePrivate with the destination, body, and { core: paths.core }', () => {
  const { paths } = freshFixture();
  const calls = [];
  const stub = (dest, data, opts) => calls.push([dest, data, opts]);
  const { mod: stubbedJobs, restore } = stubWriteFilePrivateFor(JOBS_ID, stub);
  try {
    stubbedJobs.writeScheduleState(paths, 'dream', { last_status: 'ok' });
  } finally {
    restore();
  }
  assert.equal(calls.length, 1, 'writeFilePrivate called exactly once');
  const [dest, data, opts] = calls[0];
  assert.equal(dest, scheduleFile(paths), 'destination is schedule.json');
  assert.equal(
    data,
    `${JSON.stringify({ dream: { last_status: 'ok' } }, null, 2)}\n`,
    'body is the merged state, pretty-printed with a trailing newline'
  );
  assert.deepEqual(opts, { core: paths.core }, 'threaded with { core: paths.core } (Table B core-threading row)');
});

test('private-writer-modes: writeWatermarks delegates to writeFilePrivate with the destination, body, and NO override (Table B no-override row)', () => {
  const { paths } = freshFixture();
  const calls = [];
  const stub = (dest, data, opts) => calls.push([dest, data, opts]);
  const { mod: stubbedWm, restore } = stubWriteFilePrivateFor(WATERMARKS_ID, stub);
  try {
    stubbedWm.writeWatermarks(paths.state, { claude: 1, codex: 2 });
  } finally {
    restore();
  }
  assert.equal(calls.length, 1, 'writeFilePrivate called exactly once');
  const [dest, data, opts] = calls[0];
  assert.equal(dest, watermarksFile(paths), 'destination is watermarks.json');
  assert.equal(
    data,
    JSON.stringify({ version: 1, claude: 1, codex: 2 }, null, 2),
    'body is the watermarks payload'
  );
  assert.equal(opts, undefined, 'no opts argument — writeWatermarks has no paths.core to thread (Table B no-override row)');
});

test('private-writer-modes: clearAlerts delegates to writeFilePrivate with the destination, body, and { core: paths.core }', () => {
  const { paths } = freshFixture();
  appendAlert(paths, rec('a'));
  appendAlert(paths, rec('b'));
  const expectedBody = readAlerts(paths)
    .filter((a) => a.job !== 'a')
    .map((a) => JSON.stringify(a))
    .join('\n') + '\n';
  const calls = [];
  const stub = (dest, data, opts) => calls.push([dest, data, opts]);
  const { alerts: stubbedAlerts, restore } = stubAlertsWriteFilePrivate(stub);
  try {
    stubbedAlerts.clearAlerts(paths, 'a');
  } finally {
    restore();
  }
  assert.equal(calls.length, 1, 'writeFilePrivate called exactly once');
  const [dest, data, opts] = calls[0];
  assert.equal(dest, alertsFile(paths), 'destination is alerts.jsonl');
  assert.equal(data, expectedBody, 'body is the surviving (non-cleared) records, one JSON line each');
  assert.deepEqual(opts, { core: paths.core }, 'threaded with { core: paths.core } (Table B core-threading row)');
});

// ---------------------------------------------------------------------------
// Stale / symlinked predictable temp path is harmless (the old hazard closed)
// ---------------------------------------------------------------------------

test('private-writer-modes: a symlink at the OLD predictable schedule.json temp path is never opened', { skip: !POSIX }, () => {
  const { paths } = freshFixture();
  const file = scheduleFile(paths);
  const predictableTemp = `${file}.${process.pid}.tmp`;
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-pwm-ext-'));
  const externalTarget = path.join(external, 'attacker-target');
  fs.writeFileSync(externalTarget, 'ATTACKER', { mode: 0o644 });
  fs.symlinkSync(externalTarget, predictableTemp);

  jobsLib.writeScheduleState(paths, 'dream', { last_status: 'ok' });

  assert.equal(fs.readFileSync(externalTarget, 'utf8'), 'ATTACKER', 'symlink target byte-identical — never written through');
  assert.equal(modeOf(externalTarget), 0o644, 'symlink target mode unchanged');
  assert.equal(modeOf(file), 0o600, 'schedule.json still lands at 0600');
  assert.equal(jobsLib.readScheduleState(paths).dream.last_status, 'ok', 'contents unaffected');
});

// ---------------------------------------------------------------------------
// A pre-existing symlink at the destination is refused, not written through
// ---------------------------------------------------------------------------

test('private-writer-modes: a pre-existing symlink at schedule.json is refused; the symlink and its target are unmodified', { skip: !POSIX }, () => {
  const { paths } = freshFixture();
  const file = scheduleFile(paths);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-pwm-sym-'));
  const externalTarget = path.join(external, 'target.json');
  fs.writeFileSync(externalTarget, '{"pwn":true}', { mode: 0o644 });
  fs.symlinkSync(externalTarget, file);

  assert.throws(() => jobsLib.writeScheduleState(paths, 'dream', { last_status: 'ok' }), WienerdogError);
  assert.ok(fs.lstatSync(file).isSymbolicLink(), 'destination still a symlink');
  assert.equal(fs.readFileSync(externalTarget, 'utf8'), '{"pwn":true}', 'target content unchanged');
  assert.equal(modeOf(externalTarget), 0o644, 'target mode unchanged');
});

test('private-writer-modes: a pre-existing symlink at watermarks.json is refused; the symlink and its target are unmodified', { skip: !POSIX }, () => {
  const { paths } = freshFixture();
  const file = watermarksFile(paths);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-pwm-sym2-'));
  const externalTarget = path.join(external, 'target.json');
  fs.writeFileSync(externalTarget, '{"pwn":true}', { mode: 0o644 });
  fs.symlinkSync(externalTarget, file);

  assert.throws(() => wmLib.writeWatermarks(paths.state, { claude: 1, codex: 2 }), WienerdogError);
  assert.ok(fs.lstatSync(file).isSymbolicLink(), 'destination still a symlink');
  assert.equal(fs.readFileSync(externalTarget, 'utf8'), '{"pwn":true}', 'target content unchanged');
  assert.equal(modeOf(externalTarget), 0o644, 'target mode unchanged');
});

test('private-writer-modes: a pre-existing symlink at alerts.jsonl is refused by clearAlerts; that call itself makes no further modification (the append already wrote through it — named residual)', { skip: !POSIX }, () => {
  const { paths } = freshFixture();
  const file = alertsFile(paths);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-pwm-sym3-'));
  const externalTarget = path.join(external, 'alerts-target.jsonl');
  fs.symlinkSync(externalTarget, file);
  // appendAlert follows a DESTINATION symlink (the named residual, alerts.js:89-90) —
  // this is what seeds the file; not asserted pristine, per the spec's bounded claim.
  appendAlert(paths, rec('a'));
  appendAlert(paths, rec('b'));
  const beforeContent = fs.readFileSync(externalTarget, 'utf8');
  const beforeMode = modeOf(externalTarget);

  assert.throws(() => clearAlerts(paths, 'a'), WienerdogError);

  assert.ok(fs.lstatSync(file).isSymbolicLink(), 'destination still a symlink');
  assert.equal(fs.readFileSync(externalTarget, 'utf8'), beforeContent, 'the REFUSED clearAlerts call made no further content change');
  assert.equal(modeOf(externalTarget), beforeMode, 'the REFUSED clearAlerts call made no further mode change');
});

// ---------------------------------------------------------------------------
// Repeat runs (Table C repeat-runs row)
// ---------------------------------------------------------------------------

test('private-writer-modes: a second consecutive call to each fixed writer leaves the same 0600 (POSIX) and the same content (cross-platform)', () => {
  const { paths } = freshFixture();

  jobsLib.writeScheduleState(paths, 'dream', { last_status: 'ok' });
  const c1 = fs.readFileSync(scheduleFile(paths), 'utf8');
  jobsLib.writeScheduleState(paths, 'dream', { last_status: 'ok' });
  // Mode assertions are POSIX-only: writeFilePrivate takes the win32 branch
  // (private-fs.js:283-288, a plain {mode:0o600} temp+rename) before the POSIX
  // fchmod logic this WP's fix relies on — win32 has no POSIX mode bits to
  // assert exactly 0600 against. Content/idempotence hold on every platform.
  if (POSIX) assert.equal(modeOf(scheduleFile(paths)), 0o600);
  assert.equal(fs.readFileSync(scheduleFile(paths), 'utf8'), c1);

  wmLib.writeWatermarks(paths.state, { claude: 1, codex: 2 });
  const wc1 = fs.readFileSync(watermarksFile(paths), 'utf8');
  wmLib.writeWatermarks(paths.state, { claude: 1, codex: 2 });
  if (POSIX) assert.equal(modeOf(watermarksFile(paths)), 0o600);
  assert.equal(fs.readFileSync(watermarksFile(paths), 'utf8'), wc1);

  appendAlert(paths, rec('a'));
  appendAlert(paths, rec('b'));
  clearAlerts(paths, 'a'); // present -> rewrite, leaves b
  const ac1 = fs.readFileSync(alertsFile(paths), 'utf8');
  clearAlerts(paths, 'no-such-job'); // still leaves b -> rewrites again with identical content
  if (POSIX) assert.equal(modeOf(alertsFile(paths)), 0o600);
  assert.equal(fs.readFileSync(alertsFile(paths), 'utf8'), ac1);
});

// ---------------------------------------------------------------------------
// Table D2 — the F10 throw carries the discriminator code
// ---------------------------------------------------------------------------

test('private-writer-modes: private-fs.js tags the F10 post-rename throw with code WD_F10_POST_RENAME (Table D2)', { skip: !POSIX }, () => {
  const { paths } = freshFixture();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-pwm-f10-'));
  const externalTarget = path.join(external, 'attacker-target');
  fs.writeFileSync(externalTarget, 'ATTACKER', { mode: 0o644 });
  const dest = path.join(paths.state, 'f10-probe.json');
  const renameSync = (t, d) => {
    try {
      fs.rmSync(t, { force: true });
    } catch {
      /* our temp */
    }
    fs.symlinkSync(externalTarget, d); // substituted target
  };

  let caught;
  try {
    writeFilePrivate(dest, '{"x":1}', { core: paths.core, renameSync });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof WienerdogError, 'still a WienerdogError');
  assert.equal(caught.code, 'WD_F10_POST_RENAME', 'the post-rename detection throw carries the discriminator code');
});

// ---------------------------------------------------------------------------
// Table D — the compaction migration: hazard closed, Case 1, Case 2, and the
// discrimination rule (both directions).
// ---------------------------------------------------------------------------

/** Force the NEXT appendAlert call to take the compaction branch cheaply: an
 *  oversized malformed line already puts the file over MAX_FILE_BYTES, so a
 *  single append (no need for 200+ records) triggers `size > MAX_FILE_BYTES`.
 *  Mirrors the existing "huge malformed line" pattern in alerts.test.js.
 *  @param {import('../../src/core/paths').WienerdogPaths} paths @returns {string} the file path */
function seedOversizedAlerts(paths) {
  fs.mkdirSync(paths.state, { recursive: true, mode: 0o700 });
  const file = alertsFile(paths);
  fs.writeFileSync(file, `${'x'.repeat(MAX_FILE_BYTES + 1000)}\n`);
  return file;
}

test('private-writer-modes: Table D hazard closed — a symlink at the OLD predictable compaction temp path no longer intercepts the rewrite', { skip: !POSIX }, () => {
  const { paths } = freshFixture();
  const file = seedOversizedAlerts(paths);
  const predictableTemp = `${file}.${process.pid}.tmp`;
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-pwm-ext3-'));
  const externalTarget = path.join(external, 'attacker-target');
  fs.writeFileSync(externalTarget, 'ATTACKER', { mode: 0o644 });
  fs.symlinkSync(externalTarget, predictableTemp);

  appendAlert(paths, rec('newjob')); // over budget -> triggers compaction

  assert.equal(fs.readFileSync(externalTarget, 'utf8'), 'ATTACKER', 'symlink target byte-identical — the crypto-random temp was never opened');
  assert.equal(modeOf(externalTarget), 0o644, 'symlink target mode unchanged');
  assert.equal(modeOf(file), 0o600, 'alerts.jsonl at 0600 after compaction');
  assert.ok(readAlerts(paths).some((a) => a.job === 'newjob'), 'the compacted file holds the new record');
});

test('private-writer-modes: Table D Case 1 — a pre-rename compaction refusal does not throw, is diagnosed once, and the :89 record survives', { skip: !POSIX }, () => {
  const { paths } = freshFixture();
  const file = seedOversizedAlerts(paths);
  const before = fs.readFileSync(file, 'utf8');

  let stubCalls = 0;
  const stub = () => {
    stubCalls += 1;
    throw new WienerdogError('injected: could not create the private temp file (simulated ENOSPC)');
  };
  const { alerts: stubbed, restore } = stubAlertsWriteFilePrivate(stub);
  let result;
  let stderrCalls;
  try {
    stderrCalls = countStderrWrites(() => {
      result = stubbed.appendAlert(paths, rec('newjob'));
    });
  } finally {
    restore();
  }

  assert.equal(stubCalls, 1, 'the compaction rewrite was attempted exactly once');
  assert.equal(result, undefined, 'Case 1 returns undefined — same as success, the record is durable');
  assert.equal(stderrCalls, 1, 'exactly one non-alert diagnostic emitted');
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.startsWith(before), 'alerts.jsonl is untouched by the refused rewrite — the pre-compaction bytes are unchanged');
  assert.ok(readAlerts(paths).some((a) => a.job === 'newjob'), 'the record appended at :89 is still readable afterward');
});

test('private-writer-modes: Table D Case 2 — a post-rename F10 refusal returns false, does not throw, and is diagnosed once', { skip: !POSIX }, () => {
  const { paths } = freshFixture();
  seedOversizedAlerts(paths);

  const stub = () => {
    const e = new WienerdogError('injected: temp was substituted between the private open and the rename');
    e.code = 'WD_F10_POST_RENAME';
    throw e;
  };
  const { alerts: stubbed, restore } = stubAlertsWriteFilePrivate(stub);
  let result;
  let stderrCalls;
  try {
    stderrCalls = countStderrWrites(() => {
      result = stubbed.appendAlert(paths, rec('newjob'));
    });
  } finally {
    restore();
  }

  assert.equal(result, false, 'Case 2 signals not-persisted — the record may be lost');
  assert.equal(stderrCalls, 1, 'exactly one non-alert diagnostic emitted');
  // Deliberately no assertion on alerts.jsonl's contents here: Table D makes no
  // claim about dest's contents on Case 2 — they are whatever a concurrent
  // process installed.
});

test('private-writer-modes: Table D discrimination — a refusal carrying a DIFFERENT code (e.g. a real errno) is still Case 1, not Case 2', { skip: !POSIX }, () => {
  const { paths } = freshFixture();
  seedOversizedAlerts(paths);

  const stub = () => {
    const e = new Error('EXDEV: cross-device link not permitted');
    e.code = 'EXDEV'; // a real Node errno — NOT the F10 discriminator
    throw e;
  };
  const { alerts: stubbed, restore } = stubAlertsWriteFilePrivate(stub);
  let result;
  let stderrCalls;
  try {
    stderrCalls = countStderrWrites(() => {
      result = stubbed.appendAlert(paths, rec('newjob'));
    });
  } finally {
    restore();
  }

  assert.equal(result, undefined, 'only WD_F10_POST_RENAME triggers the not-persisted signal — any other code, even a real errno, is Case 1');
  assert.equal(stderrCalls, 1, 'exactly one non-alert diagnostic emitted — no leak into the suite output');
});
