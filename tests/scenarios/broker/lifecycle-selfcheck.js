#!/usr/bin/env node
'use strict';

// LIVE broker lifecycle self-check (WP-136, SPIKE-stdio-lifecycle). The broker
// is a per-job stdio child and MUST NOT outlive its parent (ADR-0004: no
// process outlives its job). The crash case has NO signal delivery — the
// child's exit-on-stdin-EOF is the SOLE orphan guard — so this proof is
// load-bearing and re-run on the implementer's installed Node/Claude versions.
//
// It spawns a parent that starts the REAL broker (`wienerdog gws _broker`) as
// a child writing its PID to a temp file, then asserts the broker is GONE
// after (a) parent normal exit, (b) parent SIGKILL, (c) parent crash (throw).
// If any case leaves an orphan, this FAILS LOUD: the ADR-0026 §1
// supervisor-reap follow-up is required (a spec-gap to record, never to patch
// over here).
//
// Env guard (WP-023/WP-133 pattern): refuses to run unless
// WIENERDOG_RUN_SCENARIOS=1, so `npm test` and accidental runs stay inert.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const WIENERDOG_BIN = path.join(REPO_ROOT, 'bin', 'wienerdog.js');

if (process.env.WIENERDOG_RUN_SCENARIOS !== '1') {
  process.stdout.write('broker lifecycle self-check: SKIPPED (set WIENERDOG_RUN_SCENARIOS=1 to run live)\n');
  process.exit(0);
}

/** @param {number} pid @returns {boolean} */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** @param {number} ms @returns {Promise<void>} */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Wait until `pid` is gone, up to `timeoutMs`. @returns {Promise<boolean>} gone? */
async function waitGone(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
    await sleep(100);
  }
  return !alive(pid);
}

/**
 * The parent program each case runs: it spawns the real broker with piped
 * stdio (holding the pipe ends, exactly like an MCP host), writes the broker's
 * PID to PIDFILE, then dies per MODE.
 */
const PARENT_SRC = `
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
// Spawn a REAL broker routine (daily-digest): since WP-141 the broker refuses
// an unregistered '--routine', so an invalid id would exit before any handshake
// and this proof would pass vacuously. The disposable WIENERDOG_HOME has no
// credentials, so the registry's verbs advertise-but-refuse — which does NOT
// block the initialize handshake, and the handshake is what puts the child
// mid-session for the parent-death cases below.
const broker = spawn(process.execPath, [process.env.WD_BIN, 'gws', '_broker', '--routine', 'daily-digest'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, WIENERDOG_HOME: process.env.WD_HOME },
});
fs.writeFileSync(process.env.WD_PIDFILE, String(broker.pid));
// Complete a real handshake so the broker is mid-session, not just idle.
broker.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'selfcheck', version: '0' } } }) + '\\n');
broker.stdout.once('data', () => {
  const mode = process.env.WD_MODE;
  if (mode === 'normal') process.exit(0);
  if (mode === 'crash') throw new Error('deliberate parent crash');
  // mode === 'kill': signal readiness and wait to be SIGKILLed from outside.
  fs.writeFileSync(process.env.WD_PIDFILE + '.ready', 'ready');
  setTimeout(() => {}, 60000);
});
`;

/**
 * Run one parent-death case; return whether the broker child died.
 * @param {string} mode 'normal' | 'kill' | 'crash'
 * @param {string} dir temp dir for pid files
 * @returns {Promise<{gone: boolean, pid: number}>}
 */
async function runCase(mode, dir) {
  const pidFile = path.join(dir, `broker-${mode}.pid`);
  // A disposable core so the broker reads no real credentials — its verbs then
  // advertise-but-refuse, which does not block the handshake this proof needs.
  const wdHome = path.join(dir, `core-${mode}`);
  fs.mkdirSync(wdHome, { recursive: true });
  const parent = spawn(process.execPath, ['-e', PARENT_SRC], {
    env: { ...process.env, WD_BIN: WIENERDOG_BIN, WD_PIDFILE: pidFile, WD_MODE: mode, WD_HOME: wdHome },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  // Attach BEFORE any await: a fast parent can close while we poll for the
  // pid file, and a listener added after 'close' fired would hang forever.
  const parentClosed = new Promise((resolve) => parent.on('close', resolve));

  // Wait for the broker PID to appear.
  const pidDeadline = Date.now() + 10_000;
  while (!fs.existsSync(pidFile) && Date.now() < pidDeadline) await sleep(50);
  if (!fs.existsSync(pidFile)) throw new Error(`case ${mode}: broker never started`);
  const brokerPid = Number(fs.readFileSync(pidFile, 'utf8'));

  if (mode === 'kill') {
    // Kill only after the handshake completed (readiness marker).
    const readyDeadline = Date.now() + 10_000;
    while (!fs.existsSync(`${pidFile}.ready`) && Date.now() < readyDeadline) await sleep(50);
    parent.kill('SIGKILL');
  }

  await parentClosed;
  const gone = await waitGone(brokerPid, 10_000);
  if (!gone) {
    try {
      process.kill(brokerPid, 'SIGKILL'); // never leave the orphan behind
    } catch {
      /* already gone */
    }
  }
  return { gone, pid: brokerPid };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-broker-selfcheck-'));
  const claude = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 15_000 });
  process.stdout.write(`broker lifecycle self-check — node ${process.version}, ` +
    `claude ${(claude.stdout || '').trim() || 'unknown'}\n`);

  let failed = false;
  for (const mode of ['normal', 'kill', 'crash']) {
    const { gone, pid } = await runCase(mode, dir);
    process.stdout.write(`  parent-${mode}: broker pid ${pid} ${gone ? 'GONE (ok)' : 'STILL ALIVE (ORPHAN)'}\n`);
    if (!gone) failed = true;
  }
  fs.rmSync(dir, { recursive: true, force: true });

  if (failed) {
    process.stdout.write(
      'FAIL: an orphan broker survived its parent — record the ADR-0026 §1 supervisor-reap\n' +
        'follow-up as a spec-gap; do NOT patch around it here.\n'
    );
    process.exit(1);
  }
  process.stdout.write('PASS: no broker process outlives its parent in any of the three cases.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
