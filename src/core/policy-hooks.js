'use strict';

/**
 * Read-only detection of enterprise/admin MANAGED-policy Claude Code hooks
 * (audit A1 point 7, ADR-0025, WP-132). A managed policy can inject hooks
 * that a user/project/local `disableAllHooks` cannot override — that is the
 * admin's own trusted config (trusted-computing-base residual, same shelf as
 * A12/A7), not an attacker vector, so callers WARN and PROCEED; they never
 * STOP a run on this report (D-POLICY-HOOK, OWNER-APPROVED 2026-07-18).
 *
 * Never writes, never spawns, never throws.
 */

const fs = require('node:fs');
const path = require('node:path');

/** @typedef {{present:boolean, sources:string[]}} PolicyHookReport */

/**
 * The KNOWN managed-settings locations per platform (research-confirmed
 * 2026-07-18 against the official docs; no env var redirects them). Each
 * `managed-settings.json` has a sibling `managed-settings.d/` drop-in dir.
 * @param {NodeJS.Platform} platform
 * @returns {string[]}
 */
function defaultLocations(platform) {
  if (platform === 'darwin') {
    return [
      '/Library/Application Support/ClaudeCode/managed-settings.json',
      '/Library/Application Support/ClaudeCode/managed-settings.d',
    ];
  }
  if (platform === 'win32') {
    return [
      'C:\\Program Files\\ClaudeCode\\managed-settings.json',
      'C:\\Program Files\\ClaudeCode\\managed-settings.d',
    ];
  }
  return ['/etc/claude-code/managed-settings.json', '/etc/claude-code/managed-settings.d'];
}

/**
 * Does a managed-settings JSON body define hooks? A non-empty `hooks` object
 * or array counts; anything unparseable is the caller's fail-closed case.
 * @param {string} text
 * @returns {'hooks'|'clean'|'malformed'}
 */
function classifyBody(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'malformed';
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'malformed';
  const hooks = parsed.hooks;
  if (Array.isArray(hooks)) return hooks.length > 0 ? 'hooks' : 'clean';
  if (hooks && typeof hooks === 'object') return Object.keys(hooks).length > 0 ? 'hooks' : 'clean';
  return 'clean';
}

/**
 * Detect whether an enterprise/admin MANAGED policy defines Claude Code hooks
 * that a model-run cannot disable. Reads only the KNOWN managed-settings
 * locations for the platform, parses defensively (a malformed or unreadable
 * policy file → cannot prove absence → present:true, fail closed with the
 * path noted), and returns the source paths that carried (or hid) a hook.
 * NEVER throws; an absent file/dir is simply "no policy there".
 * @param {import('./paths').WienerdogPaths} paths
 * @param {NodeJS.ProcessEnv} env  (no env var redirects the managed paths;
 *   kept in the signature for contract stability)
 * @param {{platform?:NodeJS.Platform, readFile?:(p:string)=>string, locations?:string[]}} [seams] test injection
 * @returns {PolicyHookReport}
 */
function detectPolicyHooks(paths, env, seams = {}) {
  try {
    const platform = seams.platform || process.platform;
    const read = seams.readFile || ((p) => fs.readFileSync(p, 'utf8'));
    const locations = seams.locations || defaultLocations(platform);
    /** @type {string[]} */
    const sources = [];

    /** Check one settings FILE; push it onto sources when it proves (or hides) a hook. */
    const checkFile = (file) => {
      let text;
      try {
        text = read(file);
      } catch (err) {
        if (err && err.code === 'ENOENT') return; // absent → no policy there
        sources.push(file); // unreadable → cannot prove absence → fail closed
        return;
      }
      const kind = classifyBody(text);
      if (kind === 'hooks' || kind === 'malformed') sources.push(file);
    };

    for (const loc of locations) {
      if (loc.endsWith('.d')) {
        let entries;
        try {
          entries = fs.readdirSync(loc);
        } catch (err) {
          if (err && err.code === 'ENOENT') continue; // no drop-in dir → nothing there
          sources.push(loc); // unreadable drop-in dir → fail closed
          continue;
        }
        for (const name of entries.filter((n) => n.endsWith('.json')).sort()) {
          checkFile(path.join(loc, name));
        }
      } else {
        checkFile(loc);
      }
    }
    return { present: sources.length > 0, sources };
  } catch {
    // Detection itself must never throw; an unexpected failure cannot prove
    // absence → fail closed (present, no source to name).
    return { present: true, sources: [] };
  }
}

module.exports = { detectPolicyHooks };
