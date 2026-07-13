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

/** Escape a value for insertion into XML character data (plist <string>). Order
 *  matters: & first. @param {string} s @returns {string} */
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render a per-job launchd plist. All paths ABSOLUTE (no $HOME/~).
 * @param {{name:string, hour:number, minute:number, node:string, bin:string,
 *          logDir:string}} o  logDir = <core>/logs/<name> (absolute)
 * @returns {string} the full plist XML
 */
function launchdPlist(o) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${launchdLabel(o.name)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(o.node)}</string>
    <string>${xmlEscape(o.bin)}</string>
    <string>run-job</string>
    <string>${o.name}</string>
  </array>
  <key>StartCalendarInterval</key>
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
 * Render the single macOS catch-up plist (login + hourly). It invokes
 * `wienerdog run-job --catch-up` (WP-020). RunAtLoad true, plus hourly at :00.
 * @param {{node:string, bin:string, logDir:string}} o  logDir = <core>/logs/catchup
 * @returns {string} plist XML with Label 'ai.wienerdog.catchup'
 */
function catchupPlist(o) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.wienerdog.catchup</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(o.node)}</string>
    <string>${xmlEscape(o.bin)}</string>
    <string>run-job</string>
    <string>--catch-up</string>
  </array>
  <key>RunAtLoad</key>
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
 * Render a systemd oneshot .service unit. All paths ABSOLUTE.
 * @param {{name:string, node:string, bin:string}} o
 * @returns {string} .service unit text
 */
function systemdService(o) {
  return `[Unit]
Description=Wienerdog job: ${o.name}

[Service]
Type=oneshot
ExecStart=${systemdQuote(o.node)} ${systemdQuote(o.bin)} run-job ${o.name}
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
 * Render the daily Windows dream task XML. All interpolated paths/userId are
 * XML-escaped; the bin path is additionally double-quoted inside <Arguments>.
 * @param {{name:string, hour:number, minute:number, node:string, bin:string,
 *          userId:string}} o
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
      <Command>${windowsXmlEscape(o.node)}</Command>
      <Arguments>"${windowsXmlEscape(o.bin)}" run-job ${o.name}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

/**
 * Render the Windows catch-up task XML (ONLOGON + hourly). Invokes
 * `wienerdog run-job --catch-up`. Task name is the fixed literal 'catchup'.
 * @param {{node:string, bin:string, userId:string}} o
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
      <Command>${windowsXmlEscape(o.node)}</Command>
      <Arguments>"${windowsXmlEscape(o.bin)}" run-job --catch-up</Arguments>
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
  const content = catchupPlist({ node: nodePath(), bin: wienerdogBin(paths), logDir });
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

module.exports = {
  nodePath,
  wienerdogBin,
  launchAgentsDir,
  systemdUserDir,
  launchdLabel,
  systemdUnitBase,
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
  windowsCurrentUserId,
  windowsXmlEscape,
  windowsDreamTaskXml,
  windowsCatchupTaskXml,
  windowsTaskXmlBytes,
  ensureCatchup,
  defaultCatchupLoader,
};
