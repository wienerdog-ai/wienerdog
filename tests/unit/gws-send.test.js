'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const alert = require('../../src/gws/alert');

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
