'use strict';

const { getPaths } = require('../paths');

/** win32-only keys CARRIED from the launch environment, when present (Table U row U4). */
const WIN32_CARRIED = [
  'SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'PATHEXT',
  'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP',
];

/**
 * The dream run's git environment: Table U's CARRIED rows and nothing else.
 * Values come from Table U, not from the launching environment: `HOME` is taken
 * from `getPaths().home` AT CALL TIME — this module calls `getPaths()` itself,
 * which is why it may `require('../paths')` and why neither this signature nor
 * `gitIn`'s grows a paths parameter (row U2) — `PATH` is inherited (row U1),
 * and `XDG_CONFIG_HOME` is NOT carried (row U3, owner item O3).
 * @param {string} [indexFile] absolute path for GIT_INDEX_FILE (Table U row U5).
 *   Omitted for every shape whose declared disposition is `unset`.
 * @returns {Record<string,string>} a FRESH object, built KEY BY KEY — never
 *   `process.env` itself, never a spread of it, and never a DENYLIST over it
 *   (spread, then delete named keys). Key-by-key construction is the required
 *   SOURCE FORM, not merely a way of reaching the right map: see AC1's canary
 *   paragraph for what a runtime check can and cannot tell apart.
 */
function buildGitEnv(indexFile) {
  /** @type {Record<string,string>} */
  const env = {};
  env.PATH = process.env.PATH;
  env.HOME = getPaths().home;
  if (process.platform === 'win32') {
    for (const key of WIN32_CARRIED) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    // USERPROFILE is SET BY THE RUN to the bound home, not carried (row U4b) —
    // exactly as `run-job.js`'s `buildCleanEnv` does for the scheduled child.
    env.USERPROFILE = getPaths().home;
  }
  if (indexFile !== undefined) env.GIT_INDEX_FILE = indexFile;
  return env;
}

module.exports = { buildGitEnv };
