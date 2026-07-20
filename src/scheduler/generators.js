'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { WienerdogError } = require('../core/errors');
const manifestLib = require('../core/manifest');
const { schedulerSpawn } = require('./spawn');

/**
 * Pure text renderers and path helpers for the OS-native scheduler entries.
 * Every path that lands in a generated plist/unit MUST be absolute — launchd
 * does not expand `$HOME`, `~`, or `$PATH`, and systemd runs with no cwd. The
 * absolute paths are computed here and passed into the renderers by the caller.
 */

/**
 * Absolute path to the node binary that will run wienerdog under the scheduler.
 * @returns {string} process.execPath (already absolute).
 */
function nodePath() {
  return process.execPath;
}

/**
 * Absolute path to the STABLE vendored bin (ADR-0013). Survives version bumps:
 * only the `current` symlink's target changes, so scheduler entries are
 * version-independent. @param {import('../core/paths').WienerdogPaths} paths
 * @returns {string}
 */
function wienerdogBin(paths) {
  return require('../core/vendor').currentBin(paths);
}

/**
 * macOS LaunchAgents dir.
 * @param {string} home
 * @returns {string}
 */
function launchAgentsDir(home) {
  return path.join(home, 'Library', 'LaunchAgents');
}

/**
 * systemd user unit dir: $XDG_CONFIG_HOME/systemd/user, else ~/.config/systemd/user.
 * @param {string} home
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
function systemdUserDir(home, env) {
  const xdg = env && env.XDG_CONFIG_HOME;
  const base = xdg && xdg !== '' ? xdg : path.join(home, '.config');
  return path.join(base, 'systemd', 'user');
}

/**
 * launchd Label for a job. 'daily-digest' → 'ai.wienerdog.daily-digest'.
 * @param {string} name
 * @returns {string}
 */
function launchdLabel(name) {
  return `ai.wienerdog.${name}`;
}

/**
 * systemd unit base for a job. 'daily-digest' → 'wienerdog-daily-digest'
 * (the .timer / .service suffix is appended by the caller).
 * @param {string} name
 * @returns {string}
 */
function systemdUnitBase(name) {
  return `wienerdog-${name}`;
}

/**
 * Re-derive a schedule file's unregister argv from its basename identity +
 * platform (audit A8, ADR-0027, WP-145). The install manifest is an editable
 * plaintext file, so a stored `entry.unload` argv is UNTRUSTED and is never
 * executed; the uninstall reverser calls this instead. Reads ONLY
 * `path.basename(schedulePath)` and the platform; the regexes are fully
 * anchored, so `/`, `\`, `..`, or spaces in a poisoned filename can never
 * reach the derived argv.
 * @param {string} schedulePath
 * @param {NodeJS.Platform} platform  injected — never mock process.platform
 * @param {NodeJS.ProcessEnv} [env]  reserved (defaults to process.env)
 * @returns {string[]|null}  the code-owned unregister argv, or null when
 *   nothing must (or can) be unregistered — a `.service` unit, a foreign
 *   basename, an unknown platform, or a uid-less darwin. null still lets the
 *   caller remove the schedule file itself (fail safe).
 */
function deriveUnloadArgv(schedulePath, platform, env = process.env) {
  // Basename semantics must follow the INJECTED platform, not the host's —
  // a win32 path uses backslashes even when this code is unit-tested on POSIX.
  const base = (platform === 'win32' ? path.win32 : path.posix).basename(schedulePath);
  if (platform === 'darwin') {
    const m = base.match(/^(ai\.wienerdog\.[a-z0-9][a-z0-9-]*)\.plist$/);
    if (!m) return null;
    if (typeof process.getuid !== 'function') return null; // no uid → no bootout target
    return ['launchctl', 'bootout', `gui/${process.getuid()}/${m[1]}`];
  }
  if (platform === 'linux') {
    const m = base.match(/^(wienerdog-[a-z0-9][a-z0-9-]*)\.timer$/);
    if (!m) return null; // .service units (and anything else) need no unregister
    return ['systemctl', '--user', 'disable', '--now', `${m[1]}.timer`];
  }
  if (platform === 'win32') {
    const m = base.match(/^wienerdog-([a-z0-9][a-z0-9-]*)\.xml$/);
    if (!m) return null;
    return ['schtasks', '/delete', '/tn', `\\Wienerdog\\${m[1]}`, '/f'];
  }
  return null;
}

/**
 * Re-derive a schedule file's READ-ONLY probe argv from its basename identity
 * (audit A8, ADR-0027 amendment, WP-145 fix-pass F34). Mirrors deriveUnloadArgv
 * but produces a NON-mutating "is this job registered?" query — the sync-time
 * heal (`status.js`) and doctor read it back instead of executing the untrusted
 * stored `entry.unload`. The scheduler kind is inferred from the basename SHAPE
 * (`*.plist` → launchd, `wienerdog-*.timer` → systemd, `wienerdog-*.xml` →
 * schtasks), which is disjoint across schedulers and therefore host-agnostic —
 * `platform` only selects the basename separator flavor. Fully-anchored regexes
 * keep `/`, `\`, `..`, and spaces in a poisoned filename out of the argv.
 * @param {string} schedulePath
 * @param {NodeJS.Platform} [platform]  basename separator flavor (default host)
 * @param {NodeJS.ProcessEnv} [env]  reserved (defaults to process.env)
 * @returns {string[]|null}  the read-only probe argv, or null for a foreign
 *   basename or a uid-less darwin (no probe target).
 */
function deriveProbeArgv(schedulePath, platform = process.platform, env = process.env) {
  const base = (platform === 'win32' ? path.win32 : path.posix).basename(schedulePath);
  let m;
  if ((m = base.match(/^(ai\.wienerdog\.[a-z0-9][a-z0-9-]*)\.plist$/))) {
    if (typeof process.getuid !== 'function') return null;
    return ['launchctl', 'print', `gui/${process.getuid()}/${m[1]}`];
  }
  if ((m = base.match(/^(wienerdog-[a-z0-9][a-z0-9-]*)\.timer$/))) {
    return ['systemctl', '--user', 'is-active', `${m[1]}.timer`];
  }
  if ((m = base.match(/^wienerdog-([a-z0-9][a-z0-9-]*)\.xml$/))) {
    return ['schtasks', '/query', '/tn', `\\Wienerdog\\${m[1]}`];
  }
  return null;
}

/**
 * Parse a 24-hour "HH:MM" clock string.
 * @param {string} at
 * @returns {{hour:number, minute:number}}
 */
function parseAt(at) {
  if (typeof at !== 'string' || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(at)) {
    throw new WienerdogError(`invalid --at ${JSON.stringify(at)} — expected 24-hour HH:MM (00:00–23:59)`);
  }
  const [h, m] = at.split(':');
  return { hour: Number(h), minute: Number(m) };
}

/**
 * The launcher argv AFTER the node executable, for a per-job entry (WP-157):
 * `[launcher, name, --descriptor, descriptor, --expect-digest, expectDigest]`.
 * The OS entry invokes the out-of-tree launcher (not the app bin directly), so
 * it verifies app + descriptor integrity before any spawn.
 * @param {{launcher:string, name:string, descriptor:string, expectDigest:string}} o
 * @returns {string[]}
 */
function jobLaunchArgs(o) {
  return [o.launcher, o.name, '--descriptor', o.descriptor, '--expect-digest', o.expectDigest];
}

/** The launcher argv AFTER node for a catch-up entry (WP-157 + WP-catchup-per-job-authorization):
 *  no per-job descriptor — `[launcher, --catch-up, --expect-digest, expectDigest]`
 *  where expectDigest is the app-tree digest bound at register time. When a per-job
 *  digest MAP is bound (macOS + Windows — the two platforms with a separate catch-up
 *  registration), `--job-digests <base64url(canonicalJSON)>` is appended as ONE opaque
 *  token; the catch-up runner decodes it and union-authorizes every job BEFORE running
 *  any. The token is minted under registration privilege from the loaded/registered
 *  state — never re-read from an editable per-job entry file (the WP-catchup-per-job-authorization anchor).
 *  @param {{launcher:string, expectDigest:string, jobDigests?:string}} o
 *  @returns {string[]} */
function catchupLaunchArgs(o) {
  const args = [o.launcher, '--catch-up', '--expect-digest', o.expectDigest];
  if (typeof o.jobDigests === 'string' && o.jobDigests !== '') args.push('--job-digests', o.jobDigests);
  return args;
}

/** Canonical JSON for the flat per-job digest map bound into the catch-up entry:
 *  keys sorted, no whitespace variance — deterministic (WP-catchup-per-job-authorization). One entry per
 *  authorized job, value = deriveDescriptorDigest.
 *  @param {Record<string,string>} map @returns {string} */
function canonicalJobDigestsJson(map) {
  /** @type {Record<string,string>} */ const sorted = {};
  for (const k of Object.keys(map).sort()) sorted[k] = map[k];
  return JSON.stringify(sorted);
}

/** base64url(canonical JSON) transport token for the catch-up entry argv
 *  (WP-catchup-per-job-authorization [R4:#3]). base64url carries no shell/XML metacharacters, so it
 *  survives Windows `CommandLineToArgvW` and systemd `ExecStart` quoting where raw
 *  JSON does not. @param {Record<string,string>} map @returns {string} */
function encodeJobDigests(map) {
  return Buffer.from(canonicalJobDigestsJson(map || {}), 'utf8').toString('base64url');
}

/** Max bytes accepted for a `--job-digests` token (and its decoded JSON). */
const JOB_DIGESTS_MAX_BYTES = 64 * 1024;

/** Strict, BOUNDED decoder for the catch-up `--job-digests` token (WP-catchup-per-job-authorization
 *  [R4:#3]): length cap → base64url decode → JSON.parse → shape-validate (a plain
 *  object of `<jobName> → "sha256:<64 hex>"`). Any malformed / oversized / shape-
 *  invalid input ⇒ `{ok:false}` — NEVER a thrown crash; the caller turns that into
 *  a durable alert + zero spawn.
 *  @param {unknown} token @param {{maxBytes?:number}} [opts]
 *  @returns {{ok:true, map:Record<string,string>}|{ok:false, reason:string}} */
function decodeJobDigests(token, opts = {}) {
  const maxBytes = opts.maxBytes || JOB_DIGESTS_MAX_BYTES;
  try {
    if (typeof token !== 'string' || token === '') return { ok: false, reason: 'no --job-digests token bound' };
    if (token.length > maxBytes) return { ok: false, reason: '--job-digests token exceeds the size cap' };
    if (!/^[A-Za-z0-9_-]+$/.test(token)) return { ok: false, reason: '--job-digests token is not base64url' };
    const json = Buffer.from(token, 'base64url').toString('utf8');
    if (json.length > maxBytes) return { ok: false, reason: 'decoded --job-digests exceeds the size cap' };
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: '--job-digests is not a JSON object' };
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(k)) return { ok: false, reason: `--job-digests has an invalid job name ${JSON.stringify(k)}` };
      if (typeof v !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(v)) {
        return { ok: false, reason: `--job-digests has an invalid digest for "${k}"` };
      }
    }
    return { ok: true, map: /** @type {Record<string,string>} */ (parsed) };
  } catch (err) {
    return { ok: false, reason: `--job-digests decode failed: ${err.message}` };
  }
}

/**
 * The COMPLETE environment binding every scheduled OS entry sets (WP-157 F8 +
 * A10/R4). Ordered [key, value] pairs:
 *  - NODE_OPTIONS / NODE_PATH → '' : neutralize the code-loading Node vars. An
 *    inherited `NODE_OPTIONS=--require <evil>` would otherwise run attacker code
 *    in the launcher's OWN node process BEFORE launch.js — bypassing every check.
 *  - HOME → the bound authorized home : a hostile ambient/`environment.d` HOME
 *    must not relocate the credential/config account (its parent).
 *  - CLAUDE_CONFIG_DIR / CODEX_HOME / ANTHROPIC_API_KEY → '' : drop ambient
 *    credential/config overrides; run-job's buildCleanEnv reconstructs the config
 *    roots deterministically beneath the bound home and the scheduled dream is
 *    subscription-authed (ADR-0009), never an inherited API key.
 * @param {string} home  the absolute bound home @returns {Array<[string,string]>}
 */
function scheduledEnvPairs(home) {
  return [
    ['HOME', home],
    ['NODE_OPTIONS', ''],
    ['NODE_PATH', ''],
    ['CLAUDE_CONFIG_DIR', ''],
    ['CODEX_HOME', ''],
    ['ANTHROPIC_API_KEY', ''],
  ];
}

/** Escape a value for insertion into XML character data (plist <string>). Order
 *  matters: & first. @param {string} s @returns {string} */
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Render the launchd `EnvironmentVariables` dict block (2-space indented under
 *  the plist <dict>) that binds the scheduled env (WP-157 F8/A10). launchd sets
 *  these for the job, overriding whatever the user session inherited.
 *  @param {string} home @returns {string} */
function launchdEnvDict(home) {
  const rows = scheduledEnvPairs(home)
    .map(([k, v]) => `    <key>${k}</key>\n    <string>${xmlEscape(v)}</string>`)
    .join('\n');
  return `  <key>EnvironmentVariables</key>\n  <dict>\n${rows}\n  </dict>\n`;
}

/** Render systemd `[Service]` `Environment=` lines binding the scheduled env
 *  (WP-157 F8/A10). A quoted value covers spaces/`%`; an empty value clears the
 *  inherited one. @param {string} home @returns {string} */
function systemdEnvLines(home) {
  return scheduledEnvPairs(home)
    .map(([k, v]) => `Environment=${k}=${v === '' ? '' : systemdQuote(v)}`)
    .join('\n');
}

/**
 * Render a per-job launchd plist. All paths ABSOLUTE (no $HOME/~). The entry
 * invokes the out-of-tree launcher with the descriptor path + expect-digest
 * (WP-157) — NOT the app bin directly.
 * @param {{name:string, hour:number, minute:number, node:string, launcher:string,
 *          descriptor:string, expectDigest:string, home:string, logDir:string}} o
 *   logDir = <core>/logs/<name> (absolute); home = the bound authorized home
 * @returns {string} the full plist XML
 */
function launchdPlist(o) {
  const args = jobLaunchArgs(o);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${launchdLabel(o.name)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(o.node)}</string>
${args.map((a) => `    <string>${xmlEscape(a)}</string>`).join('\n')}
  </array>
${launchdEnvDict(o.home)}  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${o.hour}</integer>
    <key>Minute</key>
    <integer>${o.minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${xmlEscape(path.join(o.logDir, 'launchd.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(path.join(o.logDir, 'launchd.err.log'))}</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`;
}

/**
 * Render the single macOS catch-up plist (login + hourly). It invokes the
 * out-of-tree launcher with `--catch-up` + the app-tree expect-digest (WP-157).
 * RunAtLoad true, plus hourly at :00. When `jobDigests` is present it is bound into
 * the entry argv as `--job-digests <base64url>` (WP-catchup-per-job-authorization) — the loaded per-job
 * authorization map the catch-up runner union-authorizes against.
 * @param {{node:string, launcher:string, expectDigest:string, home:string, logDir:string,
 *          jobDigests?:string}} o
 *   logDir = <core>/logs/catchup; home = the bound authorized home
 * @returns {string} plist XML with Label 'ai.wienerdog.catchup'
 */
function catchupPlist(o) {
  const args = catchupLaunchArgs(o);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.wienerdog.catchup</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(o.node)}</string>
${args.map((a) => `    <string>${xmlEscape(a)}</string>`).join('\n')}
  </array>
${launchdEnvDict(o.home)}  <key>RunAtLoad</key>
  <true/>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${xmlEscape(path.join(o.logDir, 'launchd.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(path.join(o.logDir, 'launchd.err.log'))}</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`;
}

/**
 * @param {number} n
 * @returns {string} zero-padded to two digits.
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Render a systemd .timer unit. Persistent=true gives native catch-up.
 * @param {{name:string, hour:number, minute:number}} o
 * @returns {string} .timer unit text
 */
function systemdTimer(o) {
  return `[Unit]
Description=Wienerdog job: ${o.name}

[Timer]
OnCalendar=*-*-* ${pad2(o.hour)}:${pad2(o.minute)}:00
Persistent=true

[Install]
WantedBy=timers.target
`;
}

/** Quote a path as a single systemd ExecStart argument: escape the systemd
 *  specifier char (% → %%) so a literal % is not expanded, then double-quote,
 *  escaping \ and ". Order: \ first (so added \" is not re-escaped), then %, then ".
 *  @param {string} s @returns {string} */
function systemdQuote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/%/g, '%%').replace(/"/g, '\\"')}"`;
}

/**
 * Render a systemd oneshot .service unit. All paths ABSOLUTE. ExecStart invokes
 * the out-of-tree launcher with the descriptor + expect-digest (WP-157). Paths
 * (launcher, descriptor) are systemd-quoted; the name/flags/digest are a safe
 * charset (`sha256:`+hex, `--…`, `^[a-z0-9-]+$`).
 * The `Environment=` lines bind the scheduled env (WP-157 F8/A10): clear
 * NODE_OPTIONS/NODE_PATH + the ambient credential/config roots and bind HOME.
 * @param {{name:string, node:string, launcher:string, descriptor:string,
 *          expectDigest:string, home:string}} o
 * @returns {string} .service unit text
 */
function systemdService(o) {
  const execArgs = `${systemdQuote(o.launcher)} ${o.name} --descriptor ${systemdQuote(o.descriptor)} --expect-digest ${o.expectDigest}`;
  return `[Unit]
Description=Wienerdog job: ${o.name}

[Service]
Type=oneshot
${systemdEnvLines(o.home)}
ExecStart=${systemdQuote(o.node)} ${execArgs}
`;
}

/**
 * Namespaced Task Scheduler path for a job. 'dream' → '\Wienerdog\dream'.
 * Validates `name` (defense in depth — it flows into schtasks argv and the XML
 * <URI>): must match /^[a-z0-9][a-z0-9-]*$/, else throw WienerdogError, so `/`,
 * `\`, `..`, spaces, and quotes can never reach the task path or argv.
 * @param {string} name
 * @returns {string} e.g. '\\Wienerdog\\dream' (single backslash separators)
 */
function windowsTaskName(name) {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new WienerdogError(`invalid task name ${JSON.stringify(name)} — expected /^[a-z0-9][a-z0-9-]*$/`);
  }
  return `\\Wienerdog\\${name}`;
}

/**
 * Directory holding the Task Scheduler XML artifacts (manifest-tracked; reversed
 * with the entry).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @returns {string} <core>/schedules
 */
function windowsTasksDir(paths) {
  return path.join(paths.core, 'schedules');
}

/**
 * Basename of the XML artifact for a job (WP-064's remove() matches on this).
 * @param {string} name
 * @returns {string} e.g. 'wienerdog-dream.xml'
 */
function windowsTaskFileName(name) {
  return `wienerdog-${name}.xml`;
}

/**
 * Absolute path to the XML artifact for a job.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {string} name
 * @returns {string}
 */
function windowsTaskFile(paths, name) {
  return path.join(windowsTasksDir(paths), windowsTaskFileName(name));
}

/**
 * Basename of a job's cmd wrapper (WP-157 F8): Task Scheduler XML has NO per-task
 * environment element, so a fully-controlled `.cmd` clears the code-loading Node
 * vars + ambient credential/config roots and binds HOME/USERPROFILE before it
 * invokes node+launcher. 'dream' → 'wienerdog-dream.cmd'.
 * @param {string} name @returns {string}
 */
function windowsWrapperFileName(name) {
  return `wienerdog-${name}.cmd`;
}

/**
 * Absolute path to a job's cmd wrapper (under <core>/schedules, manifest-tracked
 * as a regular non-symlink file, reversed with the entry).
 * @param {import('../core/paths').WienerdogPaths} paths @param {string} name
 * @returns {string}
 */
function windowsWrapperFile(paths, name) {
  return path.join(windowsTasksDir(paths), windowsWrapperFileName(name));
}

/**
 * Render the Windows `.cmd` wrapper the scheduled task invokes (WP-157 F8/A10).
 * Batch content is authored ENTIRELY here (not interpolated from hostile argv),
 * CRLF line-endings. It `set "VAR="`-clears NODE_OPTIONS/NODE_PATH and the ambient
 * credential/config roots (run-job reconstructs them deterministically), binds
 * HOME/USERPROFILE to the authorized home, THEN runs `"<node>" "<launcher>"
 * <launchArgs>`. Node/launcher/paths are double-quoted; the safe-charset
 * flags/name/digest are bare.
 * RESIDUAL (recorded): a literal `%` in an absolute core path is still batch-
 * expandable on the final exec line — accepted (core paths live under the user
 * home, not attacker-chosen); the security-critical clears use quoted empty
 * assignments that are `%`-safe.
 * @param {{node:string, launcher:string, home:string, launchArgs:string[]}} o
 * @returns {string} the .cmd file content (CRLF)
 */
function windowsLauncherWrapper(o) {
  const line = (s) => `${s}\r\n`;
  const clears = ['NODE_OPTIONS', 'NODE_PATH', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'ANTHROPIC_API_KEY'];
  let out = line('@echo off');
  for (const k of clears) out += line(`set "${k}="`);
  out += line(`set "HOME=${o.home}"`);
  out += line(`set "USERPROFILE=${o.home}"`);
  const argStr = o.launchArgs.map((a) => (/^[A-Za-z0-9:._-]+$/.test(a) ? a : `"${a}"`)).join(' ');
  out += line(`"${o.node}" "${o.launcher}" ${argStr}`);
  return out;
}

/**
 * The XML <UserId> for the current user: 'DOMAIN\\user' when both USERDOMAIN and
 * USERNAME are present, else the bare USERNAME (Task Scheduler resolves a bare
 * username to the local account; the domain-qualified form is preferred).
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
function windowsCurrentUserId(env = process.env) {
  if (env.USERDOMAIN && env.USERNAME) return `${env.USERDOMAIN}\\${env.USERNAME}`;
  return env.USERNAME || '';
}

/**
 * Escape XML text/attribute content. Apply to every interpolated path, user id,
 * and description before it enters the XML.
 * @param {string} s
 * @returns {string}
 */
function windowsXmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Render the daily Windows dream task XML. The task's <Command> is the cmd
 * wrapper (WP-157 F8), which scrubs/binds the scheduled env before invoking
 * node+launcher — the XML has no per-task env element, so the wrapper is the only
 * fully-controlled place to clear NODE_OPTIONS/NODE_PATH. The wrapper path is
 * XML-escaped.
 * @param {{name:string, hour:number, minute:number, wrapper:string, userId:string}} o
 * @returns {string} the full Task Scheduler XML
 */
function windowsDreamTaskXml(o) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Wienerdog</Author>
    <Description>Wienerdog nightly dream (memory consolidation).</Description>
    <URI>\\Wienerdog\\${o.name}</URI>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2020-01-01T${pad2(o.hour)}:${pad2(o.minute)}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${windowsXmlEscape(o.userId)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <Enabled>true</Enabled>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${windowsXmlEscape(o.wrapper)}</Command>
    </Exec>
  </Actions>
</Task>
`;
}

/**
 * Render the Windows catch-up task XML (ONLOGON + hourly). The <Command> is the
 * catch-up cmd wrapper (WP-157 F8), which scrubs/binds the scheduled env before
 * invoking node+launcher with `--catch-up` + the app-tree expect-digest. Task
 * name is the fixed literal 'catchup'.
 * @param {{wrapper:string, userId:string}} o
 * @returns {string} the full Task Scheduler XML
 */
function windowsCatchupTaskXml(o) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Wienerdog</Author>
    <Description>Wienerdog catch-up: runs any dream missed while off or logged off.</Description>
    <URI>\\Wienerdog\\catchup</URI>
  </RegistrationInfo>
  <Triggers>
    <TimeTrigger>
      <StartBoundary>2020-01-01T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <Repetition>
        <Interval>PT1H</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${windowsXmlEscape(o.userId)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <Enabled>true</Enabled>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${windowsXmlEscape(o.wrapper)}</Command>
    </Exec>
  </Actions>
</Task>
`;
}

/** Encode a Task Scheduler XML string as the bytes schtasks accepts from a file:
 *  UTF-16 LE with a leading BOM (0xFF 0xFE). The declaration must already read
 *  encoding="UTF-16". @param {string} xml @returns {Buffer} */
function windowsTaskXmlBytes(xml) {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);
}

/** @param {string} p @returns {boolean} */
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Default loader: register the catch-up plist with real launchd. Tests inject a
 * spy via opts.loader so they never touch the real scheduler.
 * @param {string[]} argv
 * @returns {{status:number}}
 */
function defaultCatchupLoader(argv) {
  return schedulerSpawn(argv);
}

/**
 * Ensure the macOS catch-up plist exists and is registered. Idempotent: if the
 * plist file already exists with identical content AND a manifest entry tracks
 * it, nothing is written or loaded. Darwin only (no-op on other platforms).
 * Records a `scheduler-entry` manifest entry (with the catch-up unload argv) the
 * first time it writes the file, mirroring schedule.js. This is a runtime
 * backstop invoked by run-job after a job succeeds; the primary installer of the
 * entry is WP-013's `schedule add`.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{loader?: (argv:string[])=>{status:number}}} opts
 * @returns {{changed:boolean}}
 */
function ensureCatchup(paths, opts = {}) {
  if (process.platform !== 'darwin') return { changed: false };
  const loader = opts.loader || defaultCatchupLoader;
  const uid = process.getuid();
  const logDir = path.join(paths.logs, 'catchup');
  // F14: catchupPlist takes {node, launcher, expectDigest, home, logDir} — the
  // removed `bin` field rendered a "undefined" argv. The launcher + app-tree
  // expect-digest are best-effort (empty when no vendored app yet → the launcher
  // fails closed at fire time).
  let expectDigest = '';
  try {
    expectDigest = require('./descriptor').appTreeDigest(paths);
  } catch {
    expectDigest = '';
  }
  const content = catchupPlist({
    node: nodePath(),
    launcher: require('../core/vendor').launcherPath(paths),
    expectDigest,
    home: paths.home,
    logDir,
  });
  const label = 'ai.wienerdog.catchup';
  const plistPath = path.join(launchAgentsDir(paths.home), `${label}.plist`);
  const unload = ['launchctl', 'bootout', `gui/${uid}/${label}`];

  const manifest = manifestLib.load(paths);
  const identical = isFile(plistPath) && fs.readFileSync(plistPath, 'utf8') === content;
  const hasEntry = manifest.entries.some(
    (e) => e.kind === 'scheduler-entry' && e.path === plistPath
  );
  if (identical && hasEntry) return { changed: false };

  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, content);
  if (!hasEntry) {
    manifestLib.record(manifest, { kind: 'scheduler-entry', path: plistPath, unload });
    manifestLib.save(paths, manifest);
  }
  loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]);
  return { changed: true };
}

/**
 * TEARDOWN PRIMITIVE (WP-catchup-per-job-authorization [R5/R8]): remove the catch-up OS entry + its
 * bound map when NO jobs remain. Invoked ONLY by `repointSchedules` (the sole
 * catch-up repair/teardown owner) on final-job removal — never runtime. Best-effort
 * + idempotent: unregisters via the loader, deletes the entry file(s), and drops the
 * matching manifest entries. macOS (catchupPlist) + Windows (schtasks task + wrapper)
 * only; other platforms have no separate catch-up registration to tear down.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/manifest').Manifest} manifest
 * @param {{loader?: (argv:string[])=>{status:number}, platform?: NodeJS.Platform}} [opts]
 * @returns {{removed:boolean}}
 */
function teardownCatchup(paths, manifest, opts = {}) {
  const platform = opts.platform || process.platform;
  const loader = opts.loader || defaultCatchupLoader;
  /** @type {string[]} */ const files = [];
  if (platform === 'darwin') {
    const label = 'ai.wienerdog.catchup';
    const plistPath = path.join(launchAgentsDir(paths.home), `${label}.plist`);
    if (typeof process.getuid === 'function') {
      try {
        loader(['launchctl', 'bootout', `gui/${process.getuid()}/${label}`]);
      } catch {
        /* best-effort unregister */
      }
    }
    files.push(plistPath);
  } else if (platform === 'win32') {
    try {
      loader(['schtasks', '/delete', '/tn', windowsTaskName('catchup'), '/f']);
    } catch {
      /* best-effort unregister */
    }
    files.push(windowsTaskFile(paths, 'catchup'), windowsWrapperFile(paths, 'catchup'));
  } else {
    return { removed: false };
  }
  let removed = false;
  const targets = new Set(files);
  const before = manifest.entries.length;
  manifest.entries = manifest.entries.filter((e) => !targets.has(e.path));
  if (manifest.entries.length !== before) removed = true;
  for (const f of files) {
    try {
      fs.rmSync(f, { force: true });
      removed = true;
    } catch {
      /* best-effort */
    }
  }
  return { removed };
}

module.exports = {
  nodePath,
  wienerdogBin,
  launchAgentsDir,
  systemdUserDir,
  launchdLabel,
  systemdUnitBase,
  deriveUnloadArgv,
  deriveProbeArgv,
  parseAt,
  xmlEscape,
  launchdPlist,
  catchupPlist,
  systemdTimer,
  systemdService,
  systemdQuote,
  windowsTaskName,
  windowsTasksDir,
  windowsTaskFileName,
  windowsTaskFile,
  windowsWrapperFileName,
  windowsWrapperFile,
  windowsLauncherWrapper,
  windowsCurrentUserId,
  windowsXmlEscape,
  windowsDreamTaskXml,
  windowsCatchupTaskXml,
  windowsTaskXmlBytes,
  catchupLaunchArgs,
  encodeJobDigests,
  decodeJobDigests,
  canonicalJobDigestsJson,
  JOB_DIGESTS_MAX_BYTES,
  scheduledEnvPairs,
  ensureCatchup,
  teardownCatchup,
  defaultCatchupLoader,
};
