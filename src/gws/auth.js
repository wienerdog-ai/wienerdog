'use strict';

const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');

const { WienerdogError } = require('../core/errors');
const { persistTokenForClass, tokenPathForClass, persistClientJson } = require('./client');
const { requiredScopesFor } = require('./scope-sets');
const { CAPABILITY_CLASS } = require('./broker/constants');
const { hasLegacyToken, retireLegacyToken, MIGRATION_NOTICE } = require('./token-migration');
const { loadGoogleapis, ensureGoogleapis } = require('./deps');

/**
 * @typedef {import('../core/paths').WienerdogPaths} WienerdogPaths
 */

const CLOSE_PAGE =
  '<!doctype html><html><body style="font-family:sans-serif">' +
  '<h2>Wienerdog is connected.</h2><p>You can close this tab and return to your terminal.</p>' +
  '</body></html>';

// 5 min — a generous OAuth-consent window. Injectable so tests can drive the
// abort path with a tiny value instead of waiting on the real default.
const CONSENT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Run the interactive OAuth flows — ONE consent per capability class
 * (WP-138): each flow requests only that class's least-scope set with
 * `include_granted_scopes:false` (the scope-bleed guard), verifies the
 * actually-granted scopes are exactly the requested set, and persists the
 * token to its own 0600 file. A pre-split combined token is retired first
 * (renamed aside, never reused — D-TOKEN-MIGRATION).
 * @param {WienerdogPaths} paths
 * @param {{clientPath?: string, googleapis?: object, oauthClient?: object,
 *          openBrowser?: (url:string)=>void,
 *          startLoopback?: (expectedState:string, timeoutMs?:number)=>Promise<{server:object,port:number,waitForCode:Promise<string>}>}} opts
 * @returns {Promise<{email:string|null, tokenPath:string, tokenPaths:string[]}>}
 */
async function run(paths, opts = {}) {
  if (!opts.clientPath) {
    throw new WienerdogError(
      'missing --client <path> — download the OAuth client JSON from Google Cloud Console first'
    );
  }

  // 1. Read and persist a copy of the Desktop-app client JSON.
  let clientJson;
  try {
    clientJson = JSON.parse(fs.readFileSync(opts.clientPath, 'utf8'));
  } catch {
    throw new WienerdogError(
      `could not read the client JSON at ${opts.clientPath}`
    );
  }
  const cfg = clientJson.installed || clientJson.web;
  if (!cfg || !cfg.client_id || !cfg.client_secret) {
    throw new WienerdogError(
      `${opts.clientPath} is not a valid Google OAuth client JSON`
    );
  }
  persistClientJson(paths, clientJson);

  // 1b. Retire a pre-split combined token: set aside, tell the user, never reuse.
  if (hasLegacyToken(paths)) {
    retireLegacyToken(paths);
    process.stdout.write(`\n${MIGRATION_NOTICE}`);
  }

  // 2b. Ensure Google's client library is installed (on-demand, with consent —
  // ADR-0013/ADR-0011). No-op if already present; consent seams pass through.
  await ensureGoogleapis(paths, {
    yes: opts.yes,
    confirm: opts.confirm,
    runInstall: opts.runInstall,
  });

  const classes = Object.values(CAPABILITY_CLASS);
  const tokenPaths = [];
  let email = null;

  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    const label = `[${i + 1}/${classes.length}] ${cls}`;
    const { token, oauth } = await runFlowForClass(paths, cfg, cls, label, opts);

    // Verify BEFORE persisting: a token whose granted scopes are not exactly
    // the requested least-scope set never lands on disk.
    await verifyGrantedScopes(oauth, token, cls);
    persistTokenForClass(paths, cls, token);
    tokenPaths.push(tokenPathForClass(paths, cls));

    // Best-effort account email off the READ credential (gmail.readonly).
    if (cls === CAPABILITY_CLASS.READ) email = await fetchEmail(oauth, opts, paths);
  }

  return { email, tokenPath: paths.secrets, tokenPaths };
}

/**
 * One PKCE + state loopback consent flow for one capability class. Unchanged
 * per-flow security posture: PKCE, high-entropy `state`, 5-min timeout, and
 * the loopback socket never outlives the flow (ADR-0004).
 * @param {WienerdogPaths} paths
 * @param {{client_id:string, client_secret:string}} cfg
 * @param {string} cls capability class
 * @param {string} label progress label for the consent prompt
 * @param {object} opts injection seams (oauthClient, googleapis, startLoopback, openBrowser)
 * @returns {Promise<{token: object, oauth: object}>}
 */
async function runFlowForClass(paths, cfg, cls, label, opts) {
  // A random, high-entropy state correlates the callback to the request we made.
  const state = crypto.randomBytes(32).toString('base64url');

  const startLoopbackFn = opts.startLoopback || startLoopback;
  const { server, port, waitForCode } = await startLoopbackFn(state);

  try {
    const redirectUri = `http://127.0.0.1:${port}/`;
    const oauth =
      opts.oauthClient ||
      new (opts.googleapis || loadGoogleapis(paths)).google.auth.OAuth2(
        cfg.client_id,
        cfg.client_secret,
        redirectUri
      );

    // PKCE (RFC 8252 MUST for this client shape). Opt-in in google-auth-library.
    const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();

    const authUrl = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: requiredScopesFor(cls),
      state,
      // Measured (SPIKE-include-granted-scopes-default): the library has NO
      // default — omitting the param leaves Google's server-side default in
      // charge. Always pass false explicitly (the scope-bleed guard).
      include_granted_scopes: false,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    process.stdout.write(
      `\n${label}: open this URL in your browser to authorize Wienerdog:\n\n${authUrl}\n\n`
    );
    if (opts.openBrowser) opts.openBrowser(authUrl);

    const code = await waitForCode;
    const token = (await oauth.getToken({ code, codeVerifier })).tokens;
    oauth.setCredentials(token);
    return { token, oauth };
  } finally {
    // No socket may outlive the command (ADR-0004).
    server.close();
  }
}

/**
 * Assert the freshly-granted scopes are EXACTLY the class's least-scope set
 * (tokeninfo). A superset is scope bleed; a subset is an incomplete consent —
 * both fail the flow before the token is persisted.
 * @param {object} oauth the flow's oauth client (carries getTokenInfo)
 * @param {object} token the freshly-exchanged token
 * @param {string} cls capability class
 * @returns {Promise<void>}
 */
async function verifyGrantedScopes(oauth, token, cls) {
  const required = requiredScopesFor(cls);
  let info;
  try {
    info = await oauth.getTokenInfo(token.access_token);
  } catch {
    throw new WienerdogError(
      `could not verify the granted Google scopes for ${cls} — re-run \`wienerdog gws auth\``
    );
  }
  const granted = new Set((info && info.scopes) || []);
  const exact =
    granted.size === required.length && required.every((s) => granted.has(s));
  if (!exact) {
    throw new WienerdogError(
      `the Google consent for ${cls} did not grant exactly the requested least-scope set — ` +
        're-run `wienerdog gws auth` and approve exactly the requested access'
    );
  }
}

/**
 * Best-effort read of the signed-in account's email address. Returns null on
 * any failure (the confirmation line is cosmetic).
 * @param {object} oauth
 * @param {{googleapis?: object}} opts
 * @param {WienerdogPaths} paths
 * @returns {Promise<string|null>}
 */
async function fetchEmail(oauth, opts, paths) {
  try {
    const { google } = opts.googleapis || loadGoogleapis(paths);
    const gmail = google.gmail({ version: 'v1', auth: oauth });
    const res = await gmail.users.getProfile({ userId: 'me' });
    return (res.data && res.data.emailAddress) || null;
  } catch {
    return null;
  }
}

/**
 * One-shot loopback listener on 127.0.0.1:0. Resolves the `code` ONLY from a
 * request whose `state` matches `expectedState`; a request with a missing or
 * mismatched `state` is answered with the close page but IGNORED (the listener
 * keeps waiting for the correct one) — this drops a raced/CSRF callback instead
 * of failing on it. An `error=` is honored only when its `state` matches. After
 * `timeoutMs` with no matching callback the flow ABORTS: `waitForCode` rejects
 * with a plain-language error (the caller's `finally` closes the server).
 * @param {string} expectedState
 * @param {number} [timeoutMs]
 * @returns {Promise<{server:import('node:http').Server, port:number, waitForCode:Promise<string>}>}
 */
function startLoopback(expectedState, timeoutMs = CONSENT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let resolveCode; let rejectCode; let timer;
    const waitForCode = new Promise((res, rej) => {
      resolveCode = (v) => { clearTimeout(timer); res(v); };
      rejectCode = (e) => { clearTimeout(timer); rej(e); };
    });
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(CLOSE_PAGE);
      if (state !== expectedState) return; // ignore raced/unrelated callbacks; keep listening
      if (error) rejectCode(new WienerdogError(`Google denied authorization: ${error}`));
      else if (code) resolveCode(code);
    });
    timer = setTimeout(() => {
      rejectCode(new WienerdogError(
        'Timed out waiting for Google authorization. Re-run `wienerdog gws auth` and complete the consent in your browser.'
      ));
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, waitForCode }));
  });
}

module.exports = { run, startLoopback };
