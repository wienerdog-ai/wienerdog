'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { WienerdogError } = require('../core/errors');
const { loadGoogleapis } = require('./deps');

/**
 * @typedef {import('../core/paths').WienerdogPaths} WienerdogPaths
 */

// The combined `SCOPES` constant is retired (WP-138): scopes now live in
// per-capability least-scope sets. Re-exported here so client.js remains the
// one-stop credential module for callers.
const { SCOPE_SETS } = require('./scope-sets');

/** Per-capability token file names (D-CRED-STORAGE: separate 0600 files, so a
 *  compromise/rotation of one credential is isolated and the broker opens only
 *  the one file it needs). */
const TOKEN_FILE_BY_CLASS = Object.freeze({
  READ: 'google-token-read.json',
  DRAFT: 'google-token-draft.json',
  SEND: 'google-token-send.json',
  CALENDAR_WRITE: 'google-token-calendar.json',
});

/** Which Google services each capability class may construct — the minimal
 *  set (least privilege at the client-object layer, not only the scope layer). */
const SERVICES_BY_CLASS = Object.freeze({
  READ: Object.freeze(['gmail', 'calendar', 'drive']),
  DRAFT: Object.freeze(['gmail']),
  SEND: Object.freeze(['gmail']),
  CALENDAR_WRITE: Object.freeze(['calendar']),
});

/**
 * Absolute path of the LEGACY combined OAuth token file. Retained only for
 * migration detection (token-migration.js) and legacy tooling; the broker
 * never loads it.
 * @param {WienerdogPaths} paths
 * @returns {string}
 */
function tokenPath(paths) {
  return path.join(paths.secrets, 'google-token.json');
}

/**
 * Absolute path of one capability class's token file.
 * @param {WienerdogPaths} paths
 * @param {string} capabilityClass
 * @returns {string}
 */
function tokenPathForClass(paths, capabilityClass) {
  const file = TOKEN_FILE_BY_CLASS[capabilityClass];
  if (!file) {
    throw new WienerdogError(`unknown capability class: ${String(capabilityClass).slice(0, 32)}`);
  }
  return path.join(paths.secrets, file);
}

/**
 * Absolute path of the saved Cloud-Console client JSON.
 * @param {WienerdogPaths} paths
 * @returns {string}
 */
function clientJsonPath(paths) {
  return path.join(paths.secrets, 'google-client.json');
}

/**
 * Load and JSON.parse a JSON file from secrets, throwing a plain-language
 * WienerdogError if it is missing, unreadable, or invalid.
 * @param {string} file
 * @param {string} what
 * @returns {object}
 */
function loadJsonOrThrow(file, what) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    throw new WienerdogError(
      `no Google ${what} found — run \`wienerdog gws auth\` first`
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new WienerdogError(
      `Google ${what} file is corrupted (${file}) — run \`wienerdog gws auth\` again`
    );
  }
}

/**
 * Load and JSON.parse the LEGACY combined token file (migration/legacy tooling
 * only — the broker path uses loadTokenForClass).
 * @param {WienerdogPaths} paths
 * @returns {object}
 */
function loadToken(paths) {
  return loadJsonOrThrow(tokenPath(paths), 'sign-in');
}

/**
 * Load and JSON.parse one capability class's token file.
 * @param {WienerdogPaths} paths
 * @param {string} capabilityClass
 * @returns {object}
 */
function loadTokenForClass(paths, capabilityClass) {
  return loadJsonOrThrow(tokenPathForClass(paths, capabilityClass), 'sign-in');
}

/**
 * Load and JSON.parse the saved client JSON ({ installed } or { web }).
 * @param {WienerdogPaths} paths
 * @returns {object}
 */
function loadClientJson(paths) {
  return loadJsonOrThrow(clientJsonPath(paths), 'app credentials');
}

/**
 * Atomically write a JSON payload at mode 0600 (temp file + rename + chmod).
 * Creates paths.secrets (mode 0700) if absent.
 * @param {WienerdogPaths} paths
 * @param {string} dest
 * @param {object} payload
 */
function writeSecretJson(paths, dest, payload) {
  fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
  const tmp = path.join(
    paths.secrets,
    `.${path.basename(dest)}.${crypto.randomBytes(6).toString('hex')}.tmp`
  );
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, dest);
  fs.chmodSync(dest, 0o600);
}

/**
 * Write the LEGACY combined token file atomically at mode 0600 (kept for
 * migration tests/tooling; production auth writes per-class tokens).
 * @param {WienerdogPaths} paths
 * @param {object} token
 */
function persistToken(paths, token) {
  writeSecretJson(paths, tokenPath(paths), token);
}

/**
 * Write one capability class's token file atomically at mode 0600.
 * @param {WienerdogPaths} paths
 * @param {string} capabilityClass
 * @param {object} token
 */
function persistTokenForClass(paths, capabilityClass, token) {
  writeSecretJson(paths, tokenPathForClass(paths, capabilityClass), token);
}

/**
 * Write the client JSON to clientJsonPath at mode 0600.
 * @param {WienerdogPaths} paths
 * @param {object} clientJson
 */
function persistClientJson(paths, clientJson) {
  writeSecretJson(paths, clientJsonPath(paths), clientJson);
}

/**
 * THE INJECTION SEAM. Build authenticated Google service objects from ONE
 * capability class's least-scope token — the minimal services object for that
 * class (READ → gmail+calendar+drive; DRAFT/SEND → gmail; CALENDAR_WRITE →
 * calendar). A class can never obtain a service outside its set.
 * @param {WienerdogPaths} paths
 * @param {string} capabilityClass
 * @param {{factory?: (token:object, capabilityClass:string)=>object,
 *          googleapis?: object}} [opts]
 * @returns {{gmail?:object, calendar?:object, drive?:object}}
 */
function getServicesForClass(paths, capabilityClass, opts = {}) {
  const token = loadTokenForClass(paths, capabilityClass);
  const client = loadClientJson(paths);
  const allowed = SERVICES_BY_CLASS[capabilityClass];
  if (!allowed) {
    throw new WienerdogError(`unknown capability class: ${String(capabilityClass).slice(0, 32)}`);
  }

  // Unit-test seam: return the fake factory's object, touching no real googleapis.
  if (opts.factory) {
    return opts.factory(token, capabilityClass);
  }

  const { google } = opts.googleapis || loadGoogleapis(paths);
  const cfg = client.installed || client.web;
  const oauth = new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    cfg.redirect_uris ? cfg.redirect_uris[0] : undefined
  );
  oauth.setCredentials(token);

  const builders = {
    gmail: () => google.gmail({ version: 'v1', auth: oauth }),
    calendar: () => google.calendar({ version: 'v3', auth: oauth }),
    drive: () => google.drive({ version: 'v3', auth: oauth }),
  };
  const services = {};
  for (const name of allowed) services[name] = builders[name]();
  return services;
}

/**
 * RETIRED combined-token services (WP-138). GWS is frozen and no production
 * path reaches this; any legacy caller gets a clear migration error instead
 * of a broad-scope client.
 * @returns {never}
 */
function getServices() {
  throw new WienerdogError(
    'Google access now uses split, least-scope credentials — run `wienerdog gws auth` to re-connect'
  );
}

module.exports = {
  SCOPE_SETS,
  TOKEN_FILE_BY_CLASS,
  SERVICES_BY_CLASS,
  tokenPath,
  tokenPathForClass,
  clientJsonPath,
  loadToken,
  loadTokenForClass,
  loadClientJson,
  persistToken,
  persistTokenForClass,
  persistClientJson,
  getServices,
  getServicesForClass,
};
