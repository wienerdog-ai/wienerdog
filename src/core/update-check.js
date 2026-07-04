'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const UPDATE_CHECK_FILE = 'update-check.json';
const TTL_MS = 24 * 60 * 60 * 1000;   // refresh at most once per 24h
const TIMEOUT_MS = 3000;              // bounded network timeout
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/wienerdog/dist-tags';

/** @param {import('./paths').WienerdogPaths} paths @returns {string} */
function updateCheckPath(paths) { return path.join(paths.state, UPDATE_CHECK_FILE); }

/** This build's version (the running package.json). @returns {string} */
function currentVersion() { return require('../../package.json').version; }

/** Strict semver shape (rejects anything shell-injectable). Length-guarded.
 *  @param {unknown} v @returns {boolean} */
function isSemver(v) {
  return typeof v === 'string' && v.length <= 256 &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v);
}

/** Compare release cores (major.minor.patch); prerelease/build ignored.
 *  @param {string} a @param {string} b @returns {number} -1|0|1 */
function cmpRelease(a, b) {
  const pa = a.split('+')[0].split('-')[0].split('.').map(Number);
  const pb = b.split('+')[0].split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

/** Read config.yaml `update_check:` (default true; absent/unset → true).
 *  @param {import('./paths').WienerdogPaths} paths @returns {boolean} */
function isEnabled(paths) {
  let text;
  try { text = fs.readFileSync(paths.config, 'utf8'); } catch { return true; }
  const m = text.match(/^update_check:[ \t]*(.*)$/m);
  if (!m) return true;
  return m[1].split('#')[0].trim() !== 'false';
}

/** Read state/update-check.json. Missing/corrupt → {}.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @returns {{last_check?:string, current?:string, latest?:string}} */
function readState(paths) {
  try { return JSON.parse(fs.readFileSync(updateCheckPath(paths), 'utf8')); } catch { return {}; }
}

/** Write state/update-check.json atomically (temp+rename; creates state/).
 *  @param {import('./paths').WienerdogPaths} paths @param {object} state */
function writeState(paths, state) {
  fs.mkdirSync(paths.state, { recursive: true });
  const file = updateCheckPath(paths);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

/** Default fetch of the `latest` dist-tag. Env seam: WIENERDOG_UPDATE_FETCH_CMD
 *  (single-token exec whose stdout is the version) short-circuits the network so
 *  tests never hit the registry. Bounded timeout; throws on any failure.
 *  @param {number} timeoutMs @returns {Promise<string>} */
function defaultFetchLatest(timeoutMs) {
  const cmd = process.env.WIENERDOG_UPDATE_FETCH_CMD;
  if (cmd) {
    const r = spawnSync(cmd, [], { timeout: timeoutMs, encoding: 'utf8' });
    if (r.status !== 0 || r.error) throw new Error('update fetch cmd failed');
    return Promise.resolve((r.stdout || '').trim());
  }
  return new Promise((resolve, reject) => {
    const req = https.get(DIST_TAGS_URL, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`status ${res.statusCode}`)); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > 65536) req.destroy(); });
      res.on('end', () => {
        try { resolve(String(JSON.parse(body).latest)); } catch { reject(new Error('bad body')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/**
 * At most once per 24h, refresh the cached latest version. No-op when disabled or
 * fresh. Stamps last_check on every attempt (bounds retries). Stores `latest`
 * only when the response is a valid semver. NEVER throws; never blocks beyond the
 * bounded timeout. ADR-0015.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{fetchLatest?: (t:number)=>Promise<string>, now?: number}} [opts]
 * @returns {Promise<{skipped?:string, refreshed?:boolean, latest?:string}>}
 */
async function maybeRefresh(paths, opts = {}) {
  if (!isEnabled(paths)) return { skipped: 'disabled' };
  const now = opts.now || Date.now();
  const state = readState(paths);
  if (state.last_check && now - Date.parse(state.last_check) < TTL_MS) return { skipped: 'fresh' };
  const nowIso = new Date(now).toISOString();
  const current = currentVersion();
  writeState(paths, { ...state, last_check: nowIso, current }); // stamp the attempt
  try {
    const latest = await (opts.fetchLatest || defaultFetchLatest)(TIMEOUT_MS);
    if (isSemver(latest)) { writeState(paths, { last_check: nowIso, current, latest }); return { refreshed: true, latest }; }
    return { skipped: 'invalid' };
  } catch {
    return { skipped: 'error' };
  }
}

/** Cache-only notice (no network). @param {import('./paths').WienerdogPaths} paths
 *  @param {string} [current] @returns {{available:boolean, current:string, latest:string|null}} */
function getUpdateNotice(paths, current = currentVersion()) {
  const { latest } = readState(paths);
  const available = isSemver(latest) && isSemver(current) && cmpRelease(latest, current) > 0;
  return { available, current, latest: available ? latest : null };
}

/** Fixed-template digest callout, or '' when no newer version is cached.
 *  Declarative control-plane text only (never an instruction) — ADR-0015 / WP-041.
 *  @param {import('./paths').WienerdogPaths} paths @param {string} [current] @returns {string} */
function renderUpdateLine(paths, current = currentVersion()) {
  const n = getUpdateNotice(paths, current);
  if (!n.available) return '';
  return `> [!note] A newer Wienerdog is available (${n.current} → ${n.latest}). ` +
    `Update with: npx wienerdog@latest sync`;
}

module.exports = {
  UPDATE_CHECK_FILE, updateCheckPath, currentVersion, isSemver, cmpRelease,
  isEnabled, readState, writeState, defaultFetchLatest, maybeRefresh,
  getUpdateNotice, renderUpdateLine,
};
