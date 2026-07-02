'use strict';

const fs = require('node:fs');
const http = require('node:http');

const { WienerdogError } = require('../core/errors');
const { SCOPES, persistToken, persistClientJson } = require('./client');

/**
 * @typedef {import('../core/paths').WienerdogPaths} WienerdogPaths
 */

const CLOSE_PAGE =
  '<!doctype html><html><body style="font-family:sans-serif">' +
  '<h2>Wienerdog is connected.</h2><p>You can close this tab and return to your terminal.</p>' +
  '</body></html>';

/**
 * Run the interactive OAuth loopback flow and persist the token.
 * @param {WienerdogPaths} paths
 * @param {{clientPath?: string, googleapis?: object, oauthClient?: object,
 *          openBrowser?: (url:string)=>void}} opts
 * @returns {Promise<{email:string|null, tokenPath:string}>}
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

  // 3. Start the loopback listener on an ephemeral port before building the URL.
  const { server, port, waitForCode } = await startLoopback();

  try {
    const redirectUri = `http://127.0.0.1:${port}/`;

    // 2. Build an OAuth2 client (injectable for tests).
    const oauth =
      opts.oauthClient ||
      new (opts.googleapis || require('googleapis')).google.auth.OAuth2(
        cfg.client_id,
        cfg.client_secret,
        redirectUri
      );

    // 4. Generate + present the consent URL.
    const authUrl = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });
    process.stdout.write(
      `\nOpen this URL in your browser to authorize Wienerdog:\n\n${authUrl}\n\n`
    );
    if (opts.openBrowser) opts.openBrowser(authUrl);

    // 5. Wait for the single loopback redirect carrying ?code=...
    const code = await waitForCode;

    // 6. Exchange the code for tokens and persist them.
    const token = (await oauth.getToken(code)).tokens;
    oauth.setCredentials(token);
    persistToken(paths, token);

    // 7. Best-effort account email for the confirmation line.
    const email = await fetchEmail(oauth, opts);

    return { email, tokenPath: require('./client').tokenPath(paths) };
  } finally {
    // No socket may outlive the command (ADR-0004).
    server.close();
  }
}

/**
 * Best-effort read of the signed-in account's email address. Returns null on
 * any failure (the confirmation line is cosmetic).
 * @param {object} oauth
 * @param {{googleapis?: object}} opts
 * @returns {Promise<string|null>}
 */
async function fetchEmail(oauth, opts) {
  try {
    const { google } = opts.googleapis || require('googleapis');
    const gmail = google.gmail({ version: 'v1', auth: oauth });
    const res = await gmail.users.getProfile({ userId: 'me' });
    return (res.data && res.data.emailAddress) || null;
  } catch {
    return null;
  }
}

/**
 * Start a one-shot loopback HTTP listener on 127.0.0.1:0. Resolves the code
 * from the first request's `?code=` query param; the listener is closed by the
 * caller's finally block.
 * @returns {Promise<{server:import('node:http').Server, port:number,
 *   waitForCode:Promise<string>}>}
 */
function startLoopback() {
  return new Promise((resolve, reject) => {
    let resolveCode;
    let rejectCode;
    const waitForCode = new Promise((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(CLOSE_PAGE);
      if (error) rejectCode(new WienerdogError(`Google denied authorization: ${error}`));
      else if (code) resolveCode(code);
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, waitForCode });
    });
  });
}

module.exports = { run };
