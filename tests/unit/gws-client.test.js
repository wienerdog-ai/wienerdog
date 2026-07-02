'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');
const client = require('../../src/gws/client');

/** Create a fresh temp core with an existing secrets/ (0700) and return paths. */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-gws-'));
  const core = path.join(root, 'wd');
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: core });
  fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
  return paths;
}

test('SCOPES is exactly the four consented scopes, in order', () => {
  assert.deepEqual(client.SCOPES, [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/drive.readonly',
  ]);
});

test('persistToken writes google-token.json at mode 0600 and loadToken round-trips', () => {
  const paths = tempPaths();
  const token = { access_token: 'a', refresh_token: 'r', expiry_date: 123 };
  client.persistToken(paths, token);

  const file = client.tokenPath(paths);
  assert.equal(file, path.join(paths.secrets, 'google-token.json'));
  const mode = fs.statSync(file).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
  assert.deepEqual(client.loadToken(paths), token);
});

test('persistToken creates secrets/ at 0700 when absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-gws-'));
  const core = path.join(root, 'wd');
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: core });
  assert.equal(fs.existsSync(paths.secrets), false);

  client.persistToken(paths, { access_token: 'x' });
  const dirMode = fs.statSync(paths.secrets).mode & 0o777;
  assert.equal(dirMode, 0o700, `expected 0700, got ${dirMode.toString(8)}`);
});

test('persistClientJson writes google-client.json at mode 0600 and loadClientJson round-trips', () => {
  const paths = tempPaths();
  const cj = { installed: { client_id: 'id', client_secret: 'sec', redirect_uris: ['http://x'] } };
  client.persistClientJson(paths, cj);

  const file = client.clientJsonPath(paths);
  assert.equal(file, path.join(paths.secrets, 'google-client.json'));
  const mode = fs.statSync(file).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
  assert.deepEqual(client.loadClientJson(paths), cj);
});

test('loadToken throws a WienerdogError telling the user to run gws auth when missing', () => {
  const paths = tempPaths();
  assert.throws(
    () => client.loadToken(paths),
    (err) => err instanceof WienerdogError && /wienerdog gws auth/.test(err.message)
  );
});

test('loadToken throws a WienerdogError on corrupt JSON', () => {
  const paths = tempPaths();
  fs.writeFileSync(client.tokenPath(paths), 'not json', { mode: 0o600 });
  assert.throws(
    () => client.loadToken(paths),
    (err) => err instanceof WienerdogError
  );
});

test('getServices with opts.factory returns the factory object and loads no real googleapis', () => {
  const paths = tempPaths();
  const token = { access_token: 'a' };
  client.persistToken(paths, token);
  client.persistClientJson(paths, { installed: { client_id: 'id', client_secret: 's' } });

  const stub = { gmail: {}, calendar: {}, drive: {} };
  let seenToken;
  const services = client.getServices(paths, {
    factory: (t) => {
      seenToken = t;
      return stub;
    },
  });

  assert.equal(services, stub);
  assert.deepEqual(seenToken, token);
  // The real googleapis package must not have been loaded by the factory path.
  // (Robust whether or not googleapis is installed: if it can't even resolve,
  // it certainly wasn't loaded.)
  let resolved;
  try {
    resolved = require.resolve('googleapis');
  } catch {
    resolved = null;
  }
  if (resolved) assert.equal(require.cache[resolved], undefined);
});
