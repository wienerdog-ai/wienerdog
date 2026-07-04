'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { readDreamConfig } = require('../core/dream/config');
const jobsLib = require('../scheduler/jobs');
const gen = require('../scheduler/generators');
const tccguard = require('../scheduler/tccguard');

/**
 * `wienerdog run-job <name>` is the short-lived wrapper the OS scheduler launches
 * (WP-013's launchd plist / systemd unit). It turns a raw scheduled fire into a
 * safe job run: explicit clean env, macOS TCC-guard, a hard kill-tree watchdog,
 * teed+rotated logs, a fail-loud alert, and a `last_success` watermark. Nothing
 * it starts outlives the job (ADR-0004).
 */

/** How many per-run *.log files to keep in a job's log dir. */
const LOG_KEEP = 14;
/** Bytes of the run log to attach to a fail-loud alert. */
const LOG_TAIL_BYTES = 2048;
/** Env vars carried through from the launching env into the clean job env. */
const ENV_PASSTHROUGH = [
  'WIENERDOG_HOME',
  'WIENERDOG_VAULT',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'ANTHROPIC_API_KEY',
];

/** @returns {string} ISO timestamp for right now. */
function nowIso() {
  return new Date().toISOString();
}

/** @param {Date} [d] @returns {string} filesystem-safe run stamp, e.g. 2026-07-03T14-05-09-123Z. */
function runStamp(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-');
}

/** Display an absolute path under home as ~/... .
 *  @param {string} home @param {string} p @returns {string} */
function tilde(home, p) {
  if (p === home) return '~';
  if (p.startsWith(home + path.sep)) return `~${p.slice(home.length)}`;
  return p;
}

/** Resolve the login username for the clean env. claude's Keychain credential
 *  lookup fails ("Not logged in") without USER. os.userInfo() throws on exotic
 *  environments (a UID with no passwd entry); fall back to env, then omit.
 *  @returns {string|null} */
function resolveUsername() {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USER || process.env.LOGNAME || null;
  }
}

/**
 * Build the explicit clean env for a job child. launchd/systemd children inherit
 * almost nothing, so we construct PATH (node + common claude/codex dirs) and HOME
 * from scratch and carry through only a small allowlist (claude-os L5/L6 lesson).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {string} name
 * @returns {NodeJS.ProcessEnv}
 */
function buildCleanEnv(paths, name) {
  /** @type {NodeJS.ProcessEnv} */
  const env = {
    HOME: paths.home,
    PATH: [
      path.dirname(process.execPath), // node — MUST stay first so the right node resolves
      path.join(paths.home, '.local/bin'), // Claude Code native installer default (per-user)
      // A native `curl … | bash` claude install lands in ~/.local/bin and carries
      // the logged-in subscription credentials ADR-0009 relies on; placing the
      // per-user native path ahead of Homebrew/system makes that install
      // authoritative (matching the incident's manual symlink-into-Homebrew
      // workaround). Absolute path — launchd/systemd do not expand `~`.
      '/opt/homebrew/bin',
      '/usr/local/bin', // common claude/codex install dirs
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ].join(':'),
    WIENERDOG_JOB: name, // WP-018's send resolves the routine from this
  };
  const user = resolveUsername();
  if (user) env.USER = user;
  for (const k of ENV_PASSTHROUGH) {
    if (process.env[k]) env[k] = process.env[k];
  }
  return env;
}

/**
 * Resolve the child command + args from a job's `run` field. A test may replace
 * the resolved command with WIENERDOG_RUNJOB_CMD (mirrors WP-017's DREAM_CMD).
 * @param {{name:string, run:string}} job
 * @returns {{command:string, args:string[], shell:boolean}}
 */
function resolveCommand(job) {
  const fake = process.env.WIENERDOG_RUNJOB_CMD;
  if (fake) return { command: fake, args: [], shell: true };

  const sep = job.run.indexOf(':');
  const kind = sep === -1 ? job.run : job.run.slice(0, sep);
  const rest = sep === -1 ? '' : job.run.slice(sep + 1);
  if (kind === 'builtin') {
    if (rest === 'dream') {
      return { command: gen.nodePath(), args: [gen.wienerdogBin(), 'dream', '--yes'], shell: false };
    }
    throw new WienerdogError(`unknown builtin job: ${rest}`);
  }
  if (kind === 'skill') {
    // Claude is the v1 default headless brain for routine skills.
    return { command: 'claude', args: ['-p', `/${rest}`], shell: false };
  }
  throw new WienerdogError(`unknown job run kind in "${job.run}"`);
}

/** Resolve the watchdog timeout in ms (WIENERDOG_RUNJOB_TIMEOUT_MS is a test seam).
 *  @param {{timeoutMinutes:number}} job @returns {number} */
function resolveTimeoutMs(job) {
  const override = Number(process.env.WIENERDOG_RUNJOB_TIMEOUT_MS);
  if (Number.isFinite(override) && override > 0) return override;
  const min = job.timeoutMinutes > 0 ? job.timeoutMinutes : 15;
  return min * 60_000;
}

/** Per-run log basename shape produced by runStamp(): 2026-07-04T08-00-04-514Z.log */
const RUN_STAMP_LOG_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.log$/;

/** Keep only the newest LOG_KEEP per-run stamp logs in `dir`. The dream daily log
 *  (YYYY-MM-DD.log) and launchd.*.log are the brain's error-evidence sink and are
 *  NEVER rotated (that lexical-sort deletion destroyed evidence mid-incident).
 *  @param {string} dir */
function rotateLogs(dir) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return;
  }
  const candidates = files.filter((f) => RUN_STAMP_LOG_RE.test(f));
  candidates.sort().reverse(); // ISO run stamps: lexical == chronological, newest first
  for (const f of candidates.slice(LOG_KEEP)) {
    try {
      fs.rmSync(path.join(dir, f), { force: true });
    } catch {
      // best-effort rotation
    }
  }
}

/** @param {string} file @returns {string} the last ~2 KB of a log file, or ''. */
function readLogTail(file) {
  try {
    const buf = fs.readFileSync(file);
    return buf.slice(Math.max(0, buf.length - LOG_TAIL_BYTES)).toString('utf8');
  } catch {
    return '';
  }
}

/** Close a write stream and wait for its flush.
 *  @param {NodeJS.WritableStream} stream @returns {Promise<void>} */
function endStream(stream) {
  return new Promise((resolve) => stream.end(resolve));
}

/**
 * Default fail-loud email: a best-effort `wienerdog gws _alert` subprocess. Works
 * only when Google is configured (WP-018). Tests inject a stub via opts.sendAlert
 * so they never spawn the real command.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {string} name @param {string} subject @param {string} body
 * @returns {{status:number}}
 */
function defaultSendAlert(paths, name, subject, body) {
  const env = buildCleanEnv(paths, name);
  const r = spawnSync(
    gen.nodePath(),
    [gen.wienerdogBin(), 'gws', '_alert', '--subject', subject, '--body', body],
    { env }
  );
  return { status: r.status == null ? 1 : r.status };
}

/**
 * Prepend a transient failure banner to the injected session digest so the next
 * session surfaces it. Creates state/digest.md if absent (atomic temp+rename).
 * @param {import('../core/paths').WienerdogPaths} paths @param {string} name @param {string} reason
 */
function writeDigestBanner(paths, name, reason) {
  const logHint = `${tilde(paths.home, path.join(paths.logs, name))}/`;
  const banner = `> [!warning] Wienerdog job "${name}" failed at ${nowIso()} — ${reason}. See ${logHint}.`;
  fs.mkdirSync(paths.state, { recursive: true });
  const dest = path.join(paths.state, 'digest.md');
  let existing = '';
  try {
    existing = fs.readFileSync(dest, 'utf8');
  } catch {
    existing = '';
  }
  const next = existing ? `${banner}\n${existing}` : `${banner}\n`;
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, dest);
}

/**
 * Fail loud: try the email alert; on any failure fall back to the digest banner.
 * Wrapped so it can NEVER throw — the original job failure must stay surfaced.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {string} name @param {string} reason @param {string} logTail
 * @param {{sendAlert?: typeof defaultSendAlert}} opts
 * @returns {Promise<void>}
 */
async function failLoud(paths, name, reason, logTail, opts = {}) {
  try {
    const send = opts.sendAlert || defaultSendAlert;
    const subject = `job ${name} failed`;
    const body = `${reason}\n\n${logTail || ''}`.trim();
    let sent = false;
    try {
      const r = send(paths, name, subject, body);
      sent = !!(r && r.status === 0);
    } catch {
      sent = false;
    }
    if (sent) return;
    writeDigestBanner(paths, name, reason);
  } catch {
    // Fail-loud is best-effort; never mask the original failure.
  }
}

/**
 * Run ONE job now: clean env, TCC-guard, watchdog, teed+rotated logs, fail-loud,
 * watermark. Throws WienerdogError (→ exit 1) on failure/timeout/guard-refusal.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{name:string, at:string, run:string, timeoutMinutes:number}} job
 * @param {{sendAlert?: typeof defaultSendAlert, loader?: (argv:string[])=>{status:number},
 *          platform?: NodeJS.Platform}} [opts]
 * @returns {Promise<void>}
 */
async function runJob(paths, job, opts = {}) {
  const name = job.name;
  const vaultDir = readDreamConfig(paths.config).vault; // throws if no vault configured
  const cwd = vaultDir;

  // 1. TCC-guard: refuse (fail-loud) rather than hang on a protected folder.
  const g = tccguard.guard([vaultDir, cwd], paths.home, opts.platform);
  if (!g.ok) {
    const reason =
      `refused: ${g.offending} is under a macOS protected folder (${g.prefix}) — ` +
      'move the vault to ~/wienerdog';
    jobsLib.writeScheduleState(paths, name, { last_status: 'error', last_error_at: nowIso() });
    await failLoud(paths, name, reason, '', opts);
    throw new WienerdogError(`job "${name}" ${reason}`);
  }

  // 2. Clean env + command.
  const env = buildCleanEnv(paths, name);
  const { command, args, shell } = resolveCommand(job);

  // 3. Per-run log file (mkdir -p the job's log dir).
  const logDir = path.join(paths.logs, name);
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${runStamp()}.log`);
  const logStream = fs.createWriteStream(logFile);

  // 4. Watchdog: detached child (own process group), race exit vs timeout, kill
  //    the whole tree on timeout, always clear the timer (reuse dream.js's shape).
  const timeoutMs = resolveTimeoutMs(job);
  const started = Date.now();
  let code = null;
  let failure = null;
  try {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      shell,
    });
    if (child.stdout) child.stdout.pipe(logStream, { end: false });
    if (child.stderr) child.stderr.pipe(logStream, { end: false });

    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (c) => resolve(c));
    });
    let timer = null;
    const watchdog = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL'); // kill the process GROUP → whole tree
        } catch {
          // already gone
        }
        reject(new WienerdogError(`job "${name}" timed out after ${job.timeoutMinutes} min`));
      }, timeoutMs);
    });
    try {
      code = await Promise.race([done, watchdog]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (err) {
    failure = err;
  } finally {
    await endStream(logStream);
  }

  // 5. Rotate logs after the run.
  rotateLogs(logDir);

  const secs = Math.round((Date.now() - started) / 1000);

  // 6. Success → watermark + (darwin) ensure the catch-up entry exists.
  if (!failure && code === 0) {
    jobsLib.writeScheduleState(paths, name, { last_success: nowIso(), last_status: 'ok' });
    if (process.platform === 'darwin') {
      try {
        gen.ensureCatchup(paths, { loader: opts.loader });
      } catch {
        // Non-fatal: the primary installer of the catch-up entry is `schedule add`.
      }
    }
    process.stdout.write(
      `wienerdog: job "${name}" ok (${job.run}) in ${secs}s; logged to ${tilde(paths.home, logDir)}/.\n`
    );
    return;
  }

  // 7. Failure/timeout → watermark, fail-loud, throw.
  const reason = failure
    ? failure instanceof WienerdogError
      ? failure.message
      : `job "${name}" failed: ${failure.message}`
    : `job "${name}" exited ${code}`;
  jobsLib.writeScheduleState(paths, name, { last_status: 'error', last_error_at: nowIso() });
  await failLoud(paths, name, reason, readLogTail(logFile), opts);
  throw new WienerdogError(reason);
}

/** Today's scheduled fire time for a job (local).
 *  @param {string} at HH:MM @param {Date} now @returns {Date} */
function todaysFire(at, now) {
  const [h, m] = at.split(':').map(Number);
  const fire = new Date(now);
  fire.setHours(h, m, 0, 0);
  return fire;
}

/**
 * run-job --catch-up: run every job overdue vs today's fire time (machine was
 * off when it should have fired). A single job's failure does not abort the rest.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{now?:Date, sendAlert?: typeof defaultSendAlert,
 *          loader?: (argv:string[])=>{status:number}, platform?: NodeJS.Platform}} [opts]
 * @returns {Promise<void>}
 */
async function catchUp(paths, opts = {}) {
  const now = opts.now || new Date();
  const jobs = jobsLib.listJobs(paths);
  const state = jobsLib.readScheduleState(paths);
  /** @type {string[]} */ const ran = [];
  /** @type {string[]} */ const notOverdue = [];

  for (const job of jobs) {
    const fire = todaysFire(job.at, now);
    const last = state[job.name] && state[job.name].last_success;
    const overdue = now >= fire && (!last || new Date(last) < fire);
    if (!overdue) {
      notOverdue.push(job.name);
      continue;
    }
    try {
      await runJob(paths, job, opts);
      ran.push(`${job.name} (ok)`);
    } catch {
      // runJob already recorded the error watermark and failed loud.
      ran.push(`${job.name} (failed)`);
    }
  }

  if (ran.length === 0) {
    process.stdout.write('wienerdog: catch-up — nothing overdue.\n');
    return;
  }
  const tail = notOverdue.length ? ` ${notOverdue.join(', ')} not overdue.` : '';
  const plural = ran.length === 1 ? '' : 's';
  process.stdout.write(`wienerdog: catch-up ran ${ran.length} overdue job${plural}: ${ran.join(', ')}.${tail}\n`);
}

/** wienerdog run-job <name>        run one job now
 *  wienerdog run-job --catch-up    run every job overdue vs its schedule
 *  Exit 0 = success or "nothing overdue". Exit 1 = the job failed / timed out /
 *           was refused by the TCC-guard (WienerdogError, after fail-loud).
 *  @param {string[]} argv
 *  @param {{sendAlert?: typeof defaultSendAlert, loader?: (argv:string[])=>{status:number},
 *           platform?: NodeJS.Platform, now?: Date}} [opts]
 *  @returns {Promise<void>} */
async function run(argv, opts = {}) {
  const paths = getPaths();
  if (argv[0] === '--catch-up') {
    await catchUp(paths, opts);
    return;
  }
  const name = argv[0];
  if (!name) {
    throw new WienerdogError('usage: wienerdog run-job <name> | wienerdog run-job --catch-up');
  }
  const job = jobsLib.findJob(paths, name);
  if (!job) throw new WienerdogError(`unknown job: ${name}`);
  await runJob(paths, job, opts);
}

module.exports = {
  run,
  runJob,
  catchUp,
  buildCleanEnv,
  resolveUsername,
  resolveCommand,
  rotateLogs,
  readLogTail,
  failLoud,
  writeDigestBanner,
  todaysFire,
};
