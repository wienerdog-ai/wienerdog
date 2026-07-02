'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const gmail = require('../../src/gws/gmail');
const alert = require('../../src/gws/alert');
const grant = require('../../src/gws/grant');
const { getPaths } = require('../../src/core/paths');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

/** Isolated temp core; init writes config + manifest so grants can be saved. */
function initPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-send-'));
  const core = path.join(root, 'wd');
  const env = {
    ...process.env,
    WIENERDOG_HOME: core,
    WIENERDOG_VAULT: path.join(root, 'vault'),
    CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
    CODEX_HOME: path.join(root, 'absent-codex'),
  };
  execFileSync('node', [bin, 'init', '--yes'], { env, stdio: 'ignore' });
  return getPaths(env);
}

/** Stub Gmail service: spies for send/drafts/getProfile, no network. */
function stubGmail(emailAddress = 'me@example.com') {
  const calls = { send: [], drafts: [], profile: 0 };
  const services = {
    gmail: {
      users: {
        messages: {
          send: async (args) => {
            calls.send.push(args);
            return { data: { id: 'sent-1' } };
          },
        },
        drafts: {
          create: async (args) => {
            calls.drafts.push(args);
            return { data: { id: 'r-9', message: { id: 'm-9' } } };
          },
        },
        getProfile: async () => {
          calls.profile++;
          return { data: { emailAddress } };
        },
      },
    },
  };
  return { calls, services };
}

/** @param {string} raw @returns {string} */
function decode(raw) {
  return Buffer.from(raw, 'base64url').toString('utf8');
}

test('send executes a real send under a matching grant', async () => {
  const paths = initPaths();
  grant.saveGrant(paths, { routine: 'daily-digest', to: ['me@example.com'] });
  const s = stubGmail();

  const res = await gmail.send(s.services, {
    to: 'me@example.com',
    subject: 'Digest',
    body: 'Morning.',
    routine: 'daily-digest',
    paths,
  });

  assert.deepEqual(res, { sent: true, degraded: false, messageId: 'sent-1' });
  assert.equal(s.calls.send.length, 1);
  assert.equal(s.calls.drafts.length, 0);
  assert.match(decode(s.calls.send[0].requestBody.raw), /To: me@example\.com/);
});

test('send matches the allowlist case-insensitively', async () => {
  const paths = initPaths();
  grant.saveGrant(paths, { routine: 'daily-digest', to: ['Me@Example.com'] });
  const s = stubGmail();
  const res = await gmail.send(s.services, {
    to: 'me@example.com',
    subject: 'x',
    body: 'y',
    routine: 'daily-digest',
    paths,
  });
  assert.equal(res.sent, true);
});

test('send degrades to a draft when a recipient is not granted (no throw)', async () => {
  const paths = initPaths();
  grant.saveGrant(paths, { routine: 'daily-digest', to: ['me@example.com'] });
  const s = stubGmail();

  const res = await gmail.send(s.services, {
    to: 'attacker@evil.com',
    subject: 'x',
    body: 'y',
    routine: 'daily-digest',
    paths,
  });

  assert.equal(res.sent, false);
  assert.equal(res.degraded, true);
  assert.equal(res.draftId, 'r-9');
  assert.equal(res.messageId, 'm-9');
  assert.match(res.notice, /recipient attacker@evil\.com not in allowlist/);
  assert.match(res.notice, /saved a draft instead/);
  assert.match(res.notice, /wienerdog grant send --routine <name> --to <recipients>/);
  assert.equal(s.calls.send.length, 0);
  assert.equal(s.calls.drafts.length, 1);
});

test('send degrades when only SOME recipients are granted', async () => {
  const paths = initPaths();
  grant.saveGrant(paths, { routine: 'daily-digest', to: ['me@example.com'] });
  const s = stubGmail();
  const res = await gmail.send(s.services, {
    to: 'me@example.com, stranger@evil.com',
    subject: 'x',
    body: 'y',
    routine: 'daily-digest',
    paths,
  });
  assert.equal(res.degraded, true);
  assert.equal(s.calls.send.length, 0);
  assert.equal(s.calls.drafts.length, 1);
});

test('a null routine always degrades to a draft (fail-safe)', async () => {
  const paths = initPaths();
  grant.saveGrant(paths, { routine: 'daily-digest', to: ['me@example.com'] });
  const s = stubGmail();
  const res = await gmail.send(s.services, {
    to: 'me@example.com',
    subject: 'x',
    body: 'y',
    routine: null,
    paths,
  });
  assert.equal(res.sent, false);
  assert.equal(res.degraded, true);
  assert.equal(s.calls.send.length, 0);
});

test('_alert sends only to the authenticated account with the fixed template', async () => {
  const s = stubGmail('owner@example.com');
  const res = await alert.run(s.services, { subject: 'watchdog failed', body: 'job X crashed' });

  assert.equal(res.sent, true);
  assert.equal(res.to, 'owner@example.com');
  assert.equal(res.messageId, 'sent-1');
  assert.equal(s.calls.send.length, 1);

  const decoded = decode(s.calls.send[0].requestBody.raw);
  assert.match(decoded, /To: owner@example\.com/);
  assert.match(decoded, /Subject: \[wienerdog alert\] watchdog failed/);
  assert.match(decoded, /job X crashed/);
  assert.match(decoded, /automated alert from Wienerdog/);
});

test('_alert throws (no fallback recipient) when the profile lookup fails', async () => {
  const calls = { send: 0 };
  const services = {
    gmail: {
      users: {
        getProfile: async () => {
          throw new Error('network down');
        },
        messages: {
          send: async () => {
            calls.send++;
            return { data: { id: 'x' } };
          },
        },
      },
    },
  };
  await assert.rejects(() => alert.run(services, { subject: 's', body: 'b' }), /account address/);
  assert.equal(calls.send, 0);
});
