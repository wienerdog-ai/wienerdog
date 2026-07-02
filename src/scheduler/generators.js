'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { WienerdogError } = require('../core/errors');
const manifestLib = require('../core/manifest');

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
 * Absolute path to this install's bin/wienerdog.js. Resolved from __dirname so
 * it is never a relative path (launchd/systemd do not resolve cwd).
 * @returns {string}
 */
function wienerdogBin() {
  return path.resolve(__dirname, '..', '..', 'bin', 'wienerdog.js');
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
    <string>${o.node}</string>
    <string>${o.bin}</string>
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
  <string>${path.join(o.logDir, 'launchd.out.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(o.logDir, 'launchd.err.log')}</string>
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
    <string>${o.node}</string>
    <string>${o.bin}</string>
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
  <string>${path.join(o.logDir, 'launchd.out.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(o.logDir, 'launchd.err.log')}</string>
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
ExecStart=${o.node} ${o.bin} run-job ${o.name}
`;
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
  const r = spawnSync(argv[0], argv.slice(1));
  return { status: r.status == null ? 1 : r.status };
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
  const content = catchupPlist({ node: nodePath(), bin: wienerdogBin(), logDir });
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
  launchdPlist,
  catchupPlist,
  systemdTimer,
  systemdService,
  ensureCatchup,
};
