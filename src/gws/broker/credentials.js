'use strict';

// The broker's credential loader (WP-138, ADR-0026): load the least-scope
// token for one capability class, VERIFY the actually-granted scopes are
// exactly the required set (audit point 7 — never trust the requested
// constants), and return the minimal services object. Fails closed on a
// missing token, a scope superset (bleed), a missing scope, or an
// expired/revoked refresh token (the testing-mode 7-day case gets a DISTINCT
// loud alert). The model never receives the returned services or any token
// byte — this module runs only inside the broker process.

const { WienerdogError } = require('../../core/errors');
const { requiredScopesFor } = require('../scope-sets');
const { loadTokenForClass, loadClientJson, getServicesForClass } = require('../client');
const { hasLegacyToken } = require('../token-migration');
const { loadGoogleapis } = require('../deps');

/**
 * The real tokeninfo path: refresh an access token off the stored credential
 * and ask Google which scopes it actually carries.
 * @param {import('../../core/paths').WienerdogPaths} paths
 * @param {object} token
 * @param {{googleapis?: object}} opts
 * @returns {Promise<{scopes: string[]}>}
 */
async function realTokenInfo(paths, token, opts) {
  const { google } = opts.googleapis || loadGoogleapis(paths);
  const cj = loadClientJson(paths);
  const cfg = cj.installed || cj.web;
  const oauth = new google.auth.OAuth2(cfg.client_id, cfg.client_secret);
  oauth.setCredentials(token);
  const accessTokenRes = await oauth.getAccessToken();
  const accessToken = typeof accessTokenRes === 'string' ? accessTokenRes : accessTokenRes.token;
  return oauth.getTokenInfo(accessToken);
}

/**
 * Load the least-scope services for a capability class with live granted-scope
 * verification. The returned object carries `verifiedScopes` (metadata only,
 * never a token byte) for run evidence.
 * @param {import('../../core/paths').WienerdogPaths} paths
 * @param {string} capabilityClass
 * @param {{ googleapis?: object, factory?: Function,
 *           getTokenInfo?: (token:object, capabilityClass:string)=>Promise<{scopes:string[]}> }} [opts]
 * @returns {Promise<{gmail?:object, calendar?:object, drive?:object, verifiedScopes:string[]}>}
 * @throws {WienerdogError} fixed, secret-free messages
 */
async function loadCredentialServices(paths, capabilityClass, opts = {}) {
  const required = requiredScopesFor(capabilityClass);

  let token;
  try {
    token = loadTokenForClass(paths, capabilityClass);
  } catch (err) {
    if (hasLegacyToken(paths)) {
      throw new WienerdogError(
        'the Google credential model changed (split, least-scope credentials) — ' +
          'run `wienerdog gws auth` to re-connect; the old combined credential is not reused'
      );
    }
    throw err;
  }

  let info;
  try {
    info = await (opts.getTokenInfo
      ? opts.getTokenInfo(token, capabilityClass)
      : realTokenInfo(paths, token, opts));
  } catch (err) {
    if (err instanceof WienerdogError) throw err;
    // Pinned vendored-library shape (SPIKE-scope-verify-shape): detect on
    // e.response.data.error, NEVER on e.message (the library rewrites it).
    if (err && err.response && err.response.data && err.response.data.error === 'invalid_grant') {
      throw new WienerdogError(
        `Google refresh token for ${capabilityClass} is expired or revoked ` +
          '(testing-mode OAuth clients expire tokens after 7 days) — ' +
          'run `wienerdog gws auth` to re-connect'
      );
    }
    throw new WienerdogError(
      `could not verify the granted Google scopes for ${capabilityClass} — run \`wienerdog gws auth\` to re-connect`
    );
  }

  const granted = new Set((info && info.scopes) || []);
  const missing = required.filter((s) => !granted.has(s));
  const extra = [...granted].filter((s) => !required.includes(s));
  if (missing.length > 0) {
    throw new WienerdogError(
      `the ${capabilityClass} credential is missing a required scope — run \`wienerdog gws auth\` to re-consent`
    );
  }
  if (extra.length > 0) {
    // Exact-set check, deliberately stricter than "has what I need": a
    // superset is scope bleed and defeats the split (audit point 7).
    throw new WienerdogError(
      `the ${capabilityClass} credential carries more scopes than its least-scope set (scope bleed) — ` +
        'run `wienerdog gws auth` to re-consent'
    );
  }

  const services = getServicesForClass(paths, capabilityClass, opts);
  return Object.assign({}, services, { verifiedScopes: required.slice() });
}

module.exports = { loadCredentialServices };
