'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { WienerdogError } = require('../core/errors');
const { loadGoogleapis } = require('./deps');

/**
 * @typedef {import('../core/paths').WienerdogPaths} WienerdogPaths
 */

/**
 * The exact OAuth scopes the user consents to. Order is a tested contract.
 * `gmail.compose` permits sending at the Google layer, but Wienerdog never
 * calls `messages.send` here — sending is gated by a send grant (ADR-0007,
 * WP-018). Draft is the only write verb in this WP and is inherently safe.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
];

/**
 * Absolute path of the OAuth token file.
 * @param {WienerdogPaths} paths
 * @returns {string}
 */
function tokenPath(paths) {
  return path.join(paths.secrets, 'google-token.json');
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
 * Load and JSON.parse the token file.
 * @param {WienerdogPaths} paths
 * @returns {object}
 */
function loadToken(paths) {
  return loadJsonOrThrow(tokenPath(paths), 'sign-in');
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
 * Write the token file atomically at mode 0600.
 * @param {WienerdogPaths} paths
 * @param {object} token
 */
function persistToken(paths, token) {
  writeSecretJson(paths, tokenPath(paths), token);
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
 * THE INJECTION SEAM. Build authenticated Google service objects.
 * @param {WienerdogPaths} paths
 * @param {{factory?: (auth:object)=>{gmail:object,calendar:object,drive:object},
 *          googleapis?: object}} [opts]
 * @returns {{gmail:object, calendar:object, drive:object}}
 */
function getServices(paths, opts = {}) {
  const token = loadToken(paths);
  const client = loadClientJson(paths);

  // Unit-test seam: return the fake factory's object, touching no real googleapis.
  if (opts.factory) {
    return opts.factory(token);
  }

  const { google } = opts.googleapis || loadGoogleapis(paths);
  const cfg = client.installed || client.web;
  const oauth = new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    cfg.redirect_uris ? cfg.redirect_uris[0] : undefined
  );
  oauth.setCredentials(token);
  return {
    gmail: google.gmail({ version: 'v1', auth: oauth }),
    calendar: google.calendar({ version: 'v3', auth: oauth }),
    drive: google.drive({ version: 'v3', auth: oauth }),
  };
}

module.exports = {
  SCOPES,
  tokenPath,
  clientJsonPath,
  loadToken,
  loadClientJson,
  persistToken,
  persistClientJson,
  getServices,
};
