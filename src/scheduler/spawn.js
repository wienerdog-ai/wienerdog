'use strict';

const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { WienerdogError } = require('../core/errors');
const { getPaths } = require('../core/paths');
const { sameDir } = require('../core/sandbox-guard');

/**
 * Is this process allowed to mutate the REAL per-user-global OS scheduler?
 * (ADR-0041, Table B.) Two ORDERED arms — the first that grants wins, and
 * nothing later can take that grant away:
 *   1. `WIENERDOG_ALLOW_REAL_SCHEDULER === '1'` — the explicit opt-in, an EXACT
 *      string compare, never truthiness ('0'/'false'/'no' are what people set to
 *      DISABLE things and must not enable the dangerous path). It SHORT-CIRCUITS:
 *      the coherence arm is not evaluated, so no lookup can throw and nothing
 *      about the environment can revoke the grant.
 *   2. Home coherence — the core this run operates on IS the default core of the
 *      OS user whose scheduler domain the argv would land in. `os.userInfo()
 *      .homedir` is the passwd home and, unlike `os.homedir()`, does NOT follow a
 *      redirected $HOME on POSIX; that is the entire point, since redirecting HOME
 *      sandboxes every Wienerdog FILE path and none of the scheduler namespace.
 * A throw in either lookup (`getPaths()` rejects an unsafe WIENERDOG_HOME;
 * `os.userInfo()` can throw when the uid has no passwd entry) disables ONLY arm 2
 * and is reported through `error` — never crash the chokepoint, never re-run a
 * failing lookup to fill a blank.
 *
 * This is a MISTAKE-GUARD, not a security control: it defends against the
 * developer accident of a sandbox that isolates every file and forgets that
 * `gui/501` is not a file. The same user can set the opt-in.
 *
 * Never throws.
 * @returns {{ok:boolean, core:string|null, home:string|null, error:string|null}}
 *   `ok` is the authority. `core` is the resolved core dir and `home` the passwd
 *   home dir, or `null` when that lookup threw OR was never evaluated (arm 1
 *   short-circuit); `error` is the failing lookup's message (the first, when both
 *   threw), else null. Callers read `core`/`home` only when `ok` is false.
 */
function realSchedulerAuthority() {
  if (process.env.WIENERDOG_ALLOW_REAL_SCHEDULER === '1') {
    return { ok: true, core: null, home: null, error: null };
  }
  /** @type {string|null} */ let core = null;
  /** @type {string|null} */ let home = null;
  /** @type {string|null} */ let error = null;
  try {
    core = getPaths().core;
  } catch (e) {
    error = (e && e.message) || String(e);
  }
  try {
    home = os.userInfo().homedir;
  } catch (e) {
    if (error === null) error = (e && e.message) || String(e);
  }
  if (error !== null) return { ok: false, core, home, error };
  return { ok: sameDir(core, path.join(home, '.wienerdog')), core, home, error: null };
}

/** The single refusal line for Table A row 4 (Table R). Two forms: the
 *  namespaces-differ form when both lookups resolved, and the
 *  evaluation-failure form when one did not — that one cannot name a path it
 *  never got, so an unresolved value renders as the literal `<unavailable>`.
 *  Cannot itself throw.
 *  @param {{core:string|null, home:string|null, error:string|null}} auth
 *  @param {string[]} argv @returns {string} */
function refusalLine(auth, argv) {
  const tail =
    `Not run: ${argv.join(' ')}. Set WIENERDOG_ALLOW_REAL_SCHEDULER=1 to allow it.\n`;
  if (auth.error !== null) {
    const core = auth.core === null ? '<unavailable>' : auth.core;
    const home = auth.home === null ? '<unavailable>' : auth.home;
    return (
      'wienerdog: skipping a real OS-scheduler command — could not establish which ' +
      `user's scheduler this run belongs to (core: ${core}, home: ${home}; ${auth.error}). ${tail}`
    );
  }
  return (
    `wienerdog: skipping a real OS-scheduler command — this run's core is ${auth.core}, ` +
    `not ${path.join(auth.home, '.wienerdog')}, and launchd/systemd/Task Scheduler names ` +
    `are per-user-global, so this would hit the live user's jobs. ${tail}`
  );
}

/**
 * The ONE chokepoint for spawning a real OS-scheduler MUTATION (launchctl
 * bootstrap/bootout, systemctl enable/disable, schtasks /create /delete, and the
 * uninstall `unload` argv). Four branches, evaluated on EVERY call against
 * `process.env` (never cached at module load — tests and the CLI both mutate the
 * environment after load):
 *   1. WIENERDOG_LOADER_NOOP set → return {status:0} (existing neutralizer; a test
 *      that has deliberately opted out of real scheduling).
 *   2. WIENERDOG_TEST_NO_REAL_SCHEDULER set → THROW loudly. The hard guard: a test
 *      reached a real scheduler mutation without neutralizing it. Fail the test with
 *      a message that names the argv and the fix, instead of mutating the real
 *      per-user-global scheduler (launchd/systemd/schtasks identifiers are NOT
 *      HOME-scoped — a temp-HOME test still hits the real agent).
 *   3. Authority present (realSchedulerAuthority, ADR-0041) → real spawnSync.
 *   4. Otherwise → REFUSE: spawn nothing, write one Table R line to stderr, and
 *      return a non-zero status. This is the default (ADR-0041 inverts what row 3
 *      used to do unconditionally), so every dev checkout, test wrapper, scenario
 *      harness and CI script that redirects HOME fails safe by construction.
 * @param {string[]} argv  e.g. ['launchctl','bootout','gui/501/ai.wienerdog.dream']
 * @returns {{status:number, stdout?:string}} `stdout` (best-effort UTF-8) is
 *   surfaced so the Windows verified-registration postcondition can read a
 *   `schtasks /query /xml` back and compare the LOADED task's Command/Arguments to
 *   canonical (A7 hardening 2, ADR-0028). Mutation callers ignore it.
 */
function schedulerSpawn(argv) {
  if (process.env.WIENERDOG_LOADER_NOOP) return { status: 0 };
  if (process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER) {
    throw new WienerdogError(
      `refusing to invoke the real OS scheduler in a test: ${argv.join(' ')} — ` +
        'inject a loader or set WIENERDOG_LOADER_NOOP. (launchd/systemd/schtasks ' +
        'identifiers are per-user-global, not HOME-scoped: a temp-HOME test would ' +
        'still mutate the real user agent.)'
    );
  }
  const auth = realSchedulerAuthority();
  if (!auth.ok) {
    process.stderr.write(refusalLine(auth, argv));
    return { status: 1, stdout: '' };
  }
  const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
  return { status: r.status == null ? 1 : r.status, stdout: typeof r.stdout === 'string' ? r.stdout : '' };
}

module.exports = { schedulerSpawn, realSchedulerAuthority };
