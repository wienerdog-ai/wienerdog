'use strict';

const { spawnSync } = require('node:child_process');
const { WienerdogError } = require('../core/errors');

/**
 * The ONE chokepoint for spawning a real OS-scheduler MUTATION (launchctl
 * bootstrap/bootout, systemctl enable/disable, schtasks /create /delete, and the
 * uninstall `unload` argv). Ordering:
 *   1. WIENERDOG_LOADER_NOOP set → return {status:0} (existing neutralizer; a test
 *      that has deliberately opted out of real scheduling).
 *   2. WIENERDOG_TEST_NO_REAL_SCHEDULER set → THROW loudly. The hard guard: a test
 *      reached a real scheduler mutation without neutralizing it. Fail the test with
 *      a message that names the argv and the fix, instead of mutating the real
 *      per-user-global scheduler (launchd/systemd/schtasks identifiers are NOT
 *      HOME-scoped — a temp-HOME test still hits the real agent).
 *   3. Otherwise → real spawnSync (production).
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
  const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
  return { status: r.status == null ? 1 : r.status, stdout: typeof r.stdout === 'string' ? r.stdout : '' };
}

module.exports = { schedulerSpawn };
