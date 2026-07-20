'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { maybeRefresh } = require('../core/update-check');
const { appendAlert, clearAlerts } = require('../core/alerts');
const { redactOnly } = require('../core/secret-scan');
const { readDreamConfig } = require('../core/dream/config');
const jobsLib = require('../scheduler/jobs');
const gen = require('../scheduler/generators');
const tccguard = require('../scheduler/tccguard');
const { requireCapability, CAPABILITY } = require('../core/safety-profile');
const { detectPolicyHooks } = require('../core/policy-hooks');
const { recordRunEvidence } = require('../core/run-evidence');
const { settingsDigest } = require('../core/runtime-settings');

/**
 * `wienerdog run-job <name>` is the short-lived wrapper the OS scheduler launches
 * (WP-013's launchd plist / systemd unit). It turns a raw scheduled fire into a
 * safe job run: explicit clean env, macOS TCC-guard, a hard kill-tree watchdog,
 * teed+rotated logs, a fail-loud alert, and a `last_success` watermark. Nothing
 * it starts outlives the job (ADR-0004).
 */

/** How many per-run *.log files to keep in a job's log dir. */
const LOG_KEEP = 14;
/** Env vars carried through from the launching env into the clean job env. */
const ENV_PASSTHROUGH = [
  'WIENERDOG_HOME',
  'WIENERDOG_VAULT',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'ANTHROPIC_API_KEY',
];

/** Windows-essential env vars carried through (on win32 only) in addition to
 *  ENV_PASSTHROUGH. A Task-Scheduler child gets almost nothing; the Claude brain
 *  needs USERPROFILE/APPDATA for its config+credentials, os.homedir() needs
 *  USERPROFILE, and PowerShell/Git-Bash tools need SystemRoot/ComSpec/PATHEXT.
 *  USERPROFILE is deliberately absent — buildCleanEnv sets it explicitly to
 *  paths.home so the passthrough can never overwrite the deterministic homedir. */
const WIN_ENV_PASSTHROUGH = [
  'APPDATA',
  'LOCALAPPDATA',
  'SystemRoot',
  'windir',
  'TEMP',
  'TMP',
  'PATHEXT',
  'ComSpec',
  'SystemDrive',
  'HOMEDRIVE',
  'HOMEPATH',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'PUBLIC',
  'USERNAME',
  'USERDOMAIN',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
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
 * @param {NodeJS.Platform} [platform] the run's platform (never mock process.platform)
 * @returns {NodeJS.ProcessEnv}
 */
function buildCleanEnv(paths, name, platform = process.platform) {
  if (platform === 'win32') {
    /** @type {NodeJS.ProcessEnv} */
    const env = {
      HOME: paths.home, // harmless on Windows; Git-Bash respects it
      USERPROFILE: paths.home, // deterministic homedir for children / os.homedir()
      PATH: [
        path.dirname(process.execPath), // node — MUST stay first
        path.join(paths.home, '.local', 'bin'), // Claude Code native install (Windows)
        // npm-global claude.cmd lives under %APPDATA%\npm.
        path.join(process.env.APPDATA || path.join(paths.home, 'AppData', 'Roaming'), 'npm'),
        path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'),
        process.env.SystemRoot || 'C:\\Windows',
        path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0'),
        // git — the clean PATH must cover EVERY binary Wienerdog itself spawns (node,
        // claude, powershell, git). Windows has no standard bin dir, so name git's install
        // dirs explicitly: an all-users (admin) Git-for-Windows install lands in
        // %ProgramFiles%\Git\cmd; a per-user ("only for me") install lands in
        // %LOCALAPPDATA%\Programs\Git\cmd. Without these the nightly dream's
        // spawnSync('git', …) ENOENTs and every dream exits 1 (WP-076). A PATH dir that
        // doesn't exist on a given machine is simply ignored by the OS, so listing both is
        // safe. The POSIX branch already covers git via /usr/bin, /opt/homebrew/bin, etc.
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd'),
        path.join(
          process.env.LOCALAPPDATA || path.join(paths.home, 'AppData', 'Local'),
          'Programs',
          'Git',
          'cmd'
        ),
      ].join(';'),
      WIENERDOG_JOB: name,
      // WP-141: the run-job supervisor is the SINGLE timeout authority for a
      // routine; disable the Claude client's >2min MCP auto-backgrounding.
      CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0',
    };
    // USERPROFILE is set explicitly above and absent from WIN_ENV_PASSTHROUGH, so
    // neither passthrough loop overwrites the deterministic homedir. No USER on
    // win32 (that's a POSIX/Keychain concern); USERNAME/USERDOMAIN pass through.
    for (const k of WIN_ENV_PASSTHROUGH) {
      if (process.env[k]) env[k] = process.env[k];
    }
    for (const k of ENV_PASSTHROUGH) {
      if (process.env[k]) env[k] = process.env[k];
    }
    return env;
  }
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
    // WP-141: the run-job supervisor is the SINGLE timeout authority for a
    // routine; disable the Claude client's >2min MCP auto-backgrounding.
    CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0',
  };
  const user = resolveUsername();
  if (user) env.USER = user;
  for (const k of ENV_PASSTHROUGH) {
    if (process.env[k]) env[k] = process.env[k];
  }
  return env;
}

/** Kill a job's child process tree. POSIX: signal the process GROUP (negative
 *  pid). Windows: taskkill /PID <pid> /T /F (no POSIX process groups exist, and
 *  a negative-PID kill throws EINVAL/ESRCH there). Best-effort — never throws
 *  (the child may already be gone).
 *  @param {number} pid child.pid
 *  @param {NodeJS.Platform} platform
 *  @param {{kill?: typeof process.kill, spawnSync?: typeof spawnSync}} [seams] test injection */
function killProcessTree(pid, platform, seams = {}) {
  const kill = seams.kill || process.kill;
  const sspawn = seams.spawnSync || spawnSync;
  try {
    if (platform === 'win32') {
      sspawn('taskkill', ['/PID', String(pid), '/T', '/F']);
    } else {
      kill(-pid, 'SIGKILL'); // kill the process GROUP → whole tree
    }
  } catch {
    // already gone / not killable — best-effort
  }
}

/**
 * Resolve the child command + args from a job's `run` field. Reads NO
 * environment variable (audit A7/F5, WP-155): the old fake-command env seam —
 * the sole shell:true dispatch in the scheduler — is deleted; tests inject a
 * replacement via `runJob`'s `opts.resolveCommand` instead.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{name:string, run:string}} job
 * @param {Record<string,string>} [profile] code seam for tests only (see
 *   safety-profile.js); `runJob` never passes one, so production stays frozen.
 * @returns {{command:string, args:string[], shell:false, cwd?:string}}
 *   `cwd` is set only by the hermetic routine composition (the staging dir);
 *   absent → the caller keeps its default (the vault).
 */
function resolveCommand(paths, job, profile) {
  const sep = job.run.indexOf(':');
  const kind = sep === -1 ? job.run : job.run.slice(0, sep);
  const rest = sep === -1 ? '' : job.run.slice(sep + 1);
  if (kind === 'builtin') {
    if (rest === 'dream') {
      return { command: gen.nodePath(), args: [gen.wienerdogBin(paths), 'dream', '--yes'], shell: false };
    }
    throw new WienerdogError(`unknown builtin job: ${rest}`);
  }
  if (kind === 'skill') {
    // A0 pre-use freeze FIRST: refuse an external-content routine (audit A1)
    // before ANY composition/staging — fail closed even for a hand-edited
    // config.yaml job. Still BLOCKED in production (no profile arg → frozen).
    requireCapability(CAPABILITY.EXTERNAL_CONTENT_ROUTINE, profile);
    // Hermetic routine composition (WP-131, ADR-0025): code-owned profile
    // lookup (unknown skill → fail closed), staging cwd as the only writable
    // root, hook-free settings, verified skill body, broker MCP seam (A2).
    return require('../core/routine-runtime').composeRoutineRun(paths, job);
  }
  throw new WienerdogError(`unknown job run kind in "${job.run}"`);
}

/** The value that follows a flag in an argv, or undefined.
 *  @param {string[]} args @param {string} flag @returns {string|undefined} */
function argvFlagValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

/**
 * Capture `claude --version` for the run-evidence record. ONLY probes when the
 * resolved command IS claude (basename check on the raw path — never a test fake
 * that may have side effects, never codex). A7 (WP-154, R12/R13): the actual
 * execution goes through the ENCAPSULATED pinned exec API — a node-shebang claude
 * runs `process.execPath <script> --version`; a PATH-resolving non-node claude
 * ⇒ 'unknown' WITHOUT executing (spawnPinnedSync throws before any spawn). The
 * raw `command` path is kept ONLY for the basename label check. Bounded,
 * best-effort: 'unknown' on any failure (D-EVIDENCE: version + path, no hash).
 * @param {string} command @param {NodeJS.ProcessEnv} env
 * @param {import('../core/paths').WienerdogPaths} paths @returns {string}
 */
function captureClaudeVersion(command, env, paths) {
  const base = path.basename(command).replace(/\.(cmd|exe)$/i, '');
  if (base !== 'claude') return 'unknown';
  try {
    const { spawnPinnedSync } = require('../core/exec-identity');
    const r = spawnPinnedSync('claude', paths, { args: ['--version'], env, timeout: 10_000, encoding: 'utf8' });
    const out = (r.stdout || '').trim().slice(0, 200);
    return r.status === 0 && out ? out : 'unknown';
  } catch {
    return 'unknown';
  }
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
    [gen.wienerdogBin(paths), 'gws', '_alert', '--subject', subject, '--body', body],
    { env }
  );
  return { status: r.status == null ? 1 : r.status };
}

/**
 * Fail loud: append a DURABLE alert to state/alerts.jsonl (re-rendered into the
 * digest until the job next succeeds — ADR-0012 part 3), then attempt the
 * best-effort email. The durable record is independent of email delivery.
 * Wrapped so it can NEVER throw — the original job failure must stay surfaced.
 *
 * EP3 (audit A5 / ADR-0024 / WP-124, OWNER-APPROVED 2026-07-17): the email
 * body is built from code-owned status fields ONLY — the reason (whose
 * embedded stderr tail is redacted at source in brain.js) plus the log_hint
 * pointer. NO raw log tail: email leaves the machine and is durably stored by
 * the mail provider, so a detector miss there would be unrecoverable; the
 * user opens the local private log for the tail.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {string} name @param {string} reason
 * @param {{sendAlert?: typeof defaultSendAlert}} opts
 * @returns {Promise<void>}
 */
async function failLoud(paths, name, reason, opts = {}) {
  try {
    const logHint = `${tilde(paths.home, path.join(paths.logs, name))}/`;
    appendAlert(paths, {
      job: name,
      at: nowIso(),
      reason,
      log_hint: logHint,
    });
    const send = opts.sendAlert || defaultSendAlert;
    const subject = `job ${name} failed`;
    const body = `${reason}\n\nDetails: ${logHint}`.trim();
    try {
      send(paths, name, subject, body);
    } catch {
      /* email best-effort */
    }
  } catch {
    // Fail-loud is best-effort; never mask the original failure.
  }
}

/** Split an absolute path into its non-empty components, keeping '.' and '..'.
 *  @param {string} p @returns {{root:string, comps:string[]}} */
function splitAbsolute(p) {
  const root = path.parse(p).root || path.sep;
  const comps = p.slice(root.length).split(path.sep).filter((s) => s.length > 0);
  return { root, comps };
}

/**
 * Fully resolve a path's symlinks with a component-wise, check-BEFORE-access walk, so
 * NO path that lexically resolves into a protected dir is ever stat-ed. This is the
 * definitive TCC-safe resolver: a single fs.lstatSync/fs.realpathSync on the whole
 * vault path lets the OS traverse a symlinked ANCESTOR (e.g. ~/alias/vault where
 * `alias -> ~/Documents`) or a trailing-slash final symlink INTO the protected folder
 * before any guard runs — the exact hang this guard exists to prevent. Here we walk one
 * component at a time from the root: `resolved` is the fully-real, already-guarded
 * prefix built so far (invariant: never an unresolved symlink, never protected), and
 * each next component is guarded LEXICALLY (pure path.relative, no FS) BEFORE it is ever
 * lstat-ed. Because every ancestor of a candidate is already real, lstat can never
 * traverse an unresolved symlink into a protected dir, and a candidate that lexically
 * lands in one is refused before the lstat happens. Symlinks (ancestor, final, chained,
 * absolute or relative target) are expanded by pushing the target's components back onto
 * the work queue and re-walking them; a symlink-hop cap fails CLOSED on a cycle.
 * Best-effort: an lstat error on a candidate that is not protected treats it as a plain
 * (non-symlink) component, so a missing/odd vault never crashes the guard.
 * @param {string} input           absolute path to resolve
 * @param {(candidate:string) => ({offending:string, prefix:string}|null)} guard
 *        called on each candidate BEFORE any lstat; return a hit to refuse, else null
 * @param {number} [hopCap=40]      max symlink resolutions (ELOOP-style, fail closed)
 * @returns {{ok:true, resolved:string} | {ok:false, offending:string, prefix:string}}
 */
function safeResolvePath(input, guard, hopCap = 40) {
  let { root: resolved, comps } = splitAbsolute(input);
  /** @type {string[]} */
  const queue = comps;
  let hops = 0;
  while (queue.length > 0) {
    const component = queue.shift();
    if (component === '.') continue;
    if (component === '..') {
      resolved = path.dirname(resolved);
      continue;
    }
    const candidate = path.join(resolved, component);
    // GUARD BEFORE ANY FS ACCESS: never lstat a path that lexically resolves into a
    // protected dir (its ancestors are all already real, so this is exact).
    const hit = guard(candidate);
    if (hit) return { ok: false, offending: hit.offending, prefix: hit.prefix };
    let st;
    try {
      st = fs.lstatSync(candidate); // safe: ancestors are real, candidate is not protected
    } catch {
      resolved = candidate; // absent/odd → treat as a plain component (best-effort)
      continue;
    }
    if (!st.isSymbolicLink()) {
      resolved = candidate;
      continue;
    }
    if (++hops > hopCap) {
      // Probable symlink cycle → fail closed rather than resolve indefinitely.
      return { ok: false, offending: input, prefix: 'unresolved symlink chain' };
    }
    let target;
    try {
      target = fs.readlinkSync(candidate); // reads the link node, not the target's contents
    } catch {
      resolved = candidate;
      continue;
    }
    if (path.isAbsolute(target)) {
      const t = splitAbsolute(target);
      resolved = t.root; // restart at the target's root; re-walk its components + the rest
      queue.unshift(...t.comps);
    } else {
      // Relative target resolves from the LINK's own dir (= resolved); re-walk from here.
      queue.unshift(...target.split(path.sep).filter((s) => s.length > 0));
    }
  }
  return { ok: true, resolved };
}

/**
 * Run ONE job now: clean env, TCC-guard, watchdog, teed+rotated logs, fail-loud,
 * watermark. Throws WienerdogError (→ exit 1) on failure/timeout/guard-refusal.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{name:string, at:string, run:string, timeoutMinutes:number}} job
 * @param {{sendAlert?: typeof defaultSendAlert, loader?: (argv:string[])=>{status:number},
 *          platform?: NodeJS.Platform,
 *          detectPolicyHooks?: typeof detectPolicyHooks,
 *          resolveCommand?: typeof resolveCommand,
 *          profile?: Record<string,string>}} [opts] `opts.profile` is the
 *   WP-142 harness code seam (see safety-profile.js): reachable ONLY by a JS
 *   caller — the CLI entry never passes one, so production stays frozen.
 *   `opts.resolveCommand` (WP-155) is the same idiom: a code seam for tests
 *   only, replacing the deleted fake-command env seam — `run(argv)` never
 *   sets it, so production always uses the module resolveCommand.
 * @returns {Promise<void>}
 */
async function runJob(paths, job, opts = {}) {
  const name = job.name;
  const platform = opts.platform || process.platform;
  const vaultDir = readDreamConfig(paths.config).vault; // throws if no vault configured
  const cwd = vaultDir;

  // 1. TCC-guard: refuse (fail-loud) rather than hang on a protected folder.
  //
  // Order matters for TCC-safety. Run the LITERAL guard FIRST: tccguard.checkPath is
  // pure string arithmetic (path.relative) with ZERO filesystem access, so a
  // directly-configured protected vault (~/Documents/vault) is refused without ever
  // touching the disk. Only if the literal path is clean do we resolve symlinks — via a
  // component-wise, check-BEFORE-access walk (safeResolvePath), NEVER fs.realpathSync or
  // a whole-path fs.lstatSync: both let the OS traverse a symlinked ANCESTOR (or a
  // trailing-slash final symlink) INTO a protected folder before any guard runs, which
  // could trigger the exact TCC prompt this guard exists to prevent (scheduler #3, the
  // "4-hour hang"). The walk guards each component before it is ever stat-ed.
  const gLiteral = tccguard.guard([vaultDir, cwd], paths.home, platform);
  let g = gLiteral;
  if (g.ok) {
    // Canonicalize home the same safe way (home is never TCC-protected, so its walk
    // never refuses) so a symlinked home component (e.g. a real /var/home -> /home) is
    // followed too; the vault is then compared in BOTH the literal-home and resolved-
    // home domains, catching a symlink target spelled through either home.
    const homeRes = safeResolvePath(paths.home, () => null);
    const resolvedHome = homeRes.ok ? homeRes.resolved : paths.home;
    const vaultGuard = (candidate) => {
      for (const h of [paths.home, resolvedHome]) {
        const c = tccguard.checkPath(candidate, h, platform);
        if (c.protected) return { offending: candidate, prefix: c.prefix };
      }
      return null;
    };
    const r = safeResolvePath(vaultDir, vaultGuard);
    if (!r.ok) {
      g = { ok: false, offending: r.offending, prefix: r.prefix };
    } else {
      // Redundant with the per-component guards, but keep the final belt-and-suspenders
      // check on the fully-resolved vault in both home domains.
      g = tccguard.guard([r.resolved], paths.home, platform);
      if (g.ok) g = tccguard.guard([r.resolved], resolvedHome, platform);
    }
  }
  if (!g.ok) {
    const reason =
      `refused: ${g.offending} is under a macOS protected folder (${g.prefix}) — ` +
      'move the vault to ~/wienerdog';
    jobsLib.writeScheduleState(paths, name, { last_status: 'error', last_error_at: nowIso() });
    await failLoud(paths, name, reason, opts);
    throw new WienerdogError(`job "${name}" ${reason}`);
  }

  // 2. Clean env + command. A hermetic routine composition returns its own
  //    cwd (the fresh staging dir); everything else keeps the vault cwd.
  const env = buildCleanEnv(paths, name, platform);
  const resolveCmd = opts.resolveCommand || resolveCommand;
  const { command, args, shell, cwd: composedCwd } = resolveCmd(paths, job, opts.profile);
  const spawnCwd = composedCwd || cwd;

  // 2b. Managed-policy hook preflight (WP-132, D-POLICY-HOOK): a managed/admin
  //     policy can inject hooks disableAllHooks cannot override. That is the
  //     admin's own trusted config (trusted-computing-base residual, not an
  //     attacker vector), so WARN loudly + durably and PROCEED — no throw, no
  //     error watermark. The state is also captured in the evidence record.
  const policyDetect = opts.detectPolicyHooks || detectPolicyHooks;
  let policyHooks = { present: false, sources: [] };
  try {
    policyHooks = policyDetect(paths, process.env);
  } catch {
    policyHooks = { present: true, sources: [] }; // detection must never fail the job; fail closed
  }
  if (policyHooks.present) {
    appendAlert(paths, {
      job: name,
      at: nowIso(),
      reason:
        `warning: a managed/admin policy defines Claude Code hooks that cannot be disabled ` +
        `(${policyHooks.sources.join(', ') || 'unknown source'}) — this run is NOT fully hermetic ` +
        `under that policy. Managed hooks are your administrator's config (trusted-computing-base ` +
        `residual, see the threat model), not an attacker vector; the run continues. ADR-0025.`,
      log_hint: '',
    });
  }

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
      cwd: spawnCwd,
      // POSIX: detach into its own process group so the watchdog can kill the
      // whole tree via a negative-PID signal. Windows has no process groups —
      // detached only spawns a visible console window and buys nothing (the
      // tree-kill uses taskkill's PID table); windowsHide suppresses the flash.
      detached: platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      shell,
    });
    // EP3 (audit A5 / ADR-0024 / WP-124): redact each chunk before it reaches
    // the durable run log — the child (a routine brain too) is
    // attacker-influenceable. Bounded per-chunk scan; a boundary-split secret
    // may be partially redacted (accepted residual, see brain.js). The tee
    // never closes the stream (the old pipe's { end:false } semantics).
    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        logStream.write(redactOnly(chunk.toString('utf8')));
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        logStream.write(redactOnly(chunk.toString('utf8')));
      });
    }

    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (c) => resolve(c));
    });
    let timer = null;
    const watchdog = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        killProcessTree(child.pid, platform, opts); // POSIX group-kill / win32 taskkill /T /F
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

  // 5a. Run evidence (WP-132, audit A1 point 8): record what actually ran for
  //     a skill: routine, success or failure — best-effort, never affects the
  //     job outcome. builtin:dream's evidence is recorded by spawnBrain (the
  //     dream layer) so the record is not duplicated here.
  if (job.run.startsWith('skill:')) {
    try {
      const skillId = job.run.slice(job.run.indexOf(':') + 1);
      let profileId = 'unknown';
      try {
        profileId = require('../core/routine-runtime').profileIdForSkill(skillId);
      } catch {
        /* unmapped skill under the fake seam → 'unknown' */
      }
      const settingsFile = argvFlagValue(args, '--settings');
      const mcpFile = argvFlagValue(args, '--mcp-config');
      recordRunEvidence(paths, {
        at: nowIso(),
        job: name,
        profileId,
        claudeVersion: captureClaudeVersion(command, env, paths),
        execPath: command,
        argv: args,
        settingsDigest: settingsFile ? settingsDigest(settingsFile) : 'missing',
        mcpDigest: mcpFile ? settingsDigest(mcpFile) : 'none',
        policyHooks,
      });
    } catch {
      /* evidence is best-effort — never affects the job */
    }
  }

  const secs = Math.round((Date.now() - started) / 1000);

  // 6. Success → watermark + (darwin) ensure the catch-up entry exists.
  if (!failure && code === 0) {
    jobsLib.writeScheduleState(paths, name, { last_success: nowIso(), last_status: 'ok' });
    clearAlerts(paths, name);
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
  await failLoud(paths, name, reason, opts);
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
 *           platform?: NodeJS.Platform, now?: Date,
 *           fetchLatest?: (t:number)=>Promise<string>}} [opts]
 *  @returns {Promise<void>} */
async function run(argv, opts = {}) {
  const paths = getPaths();
  // Bounded, once/24h, opt-out, silent on failure (ADR-0015). Never blocks/fails
  // the job. Fetch seam is injectable for hermetic tests. maybeRefresh already
  // never throws (WP-045); the try/catch is belt-and-suspenders and must never
  // alter the job's exit code.
  try {
    await maybeRefresh(paths, { fetchLatest: opts.fetchLatest });
  } catch {
    /* never affects the job */
  }
  // Keep the scheduler-load cache fresh on every run (esp. the hourly catch-up) so
  // the digest can surface a configured-but-not-loaded job. Read-only probe;
  // bounded, swallows its own errors — MUST never alter the job's exit code.
  try {
    require('../scheduler/status').refreshSchedulerStatus(paths, { probe: opts.probe });
  } catch {
    /* never affects the job */
  }
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
  killProcessTree,
  resolveUsername,
  resolveCommand,
  rotateLogs,
  failLoud,
  todaysFire,
  // Exported for the WP-154 R12 zero-execution test only (marker-exec driven,
  // not a spawn seam): captures `claude --version` via the encapsulated pinned
  // exec API — never a raw spawn of a resolved path.
  captureClaudeVersion,
};
