'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const gmail = require('../../src/gws/gmail');
const alert = require('../../src/gws/alert');

/** base64url-encode a plain string the way Gmail returns body data. */
function b64url(s) {
  return Buffer.from(s, 'utf8').toString('base64url');
}

test('search returns the mapped header array (list + per-message metadata get)', async () => {
  const calls = [];
  const services = {
    gmail: {
      users: {
        messages: {
          list: async (args) => {
            calls.push(['list', args]);
            return { data: { messages: [{ id: 'm1', threadId: 't1' }] } };
          },
          get: async (args) => {
            calls.push(['get', args]);
            return {
              data: {
                id: 'm1',
                threadId: 't1',
                snippet: 'Can you review the deck before...',
                payload: {
                  headers: [
                    { name: 'From', value: 'Boss <boss@acme.com>' },
                    { name: 'Subject', value: 'Q3 plan' },
                    { name: 'Date', value: 'Wed, 2 Jul 2026 09:12:00 +0000' },
                  ],
                },
              },
            };
          },
        },
      },
    },
  };

  const result = await gmail.search(services, { query: 'from:boss is:unread', max: 2 });
  assert.deepEqual(result, [
    {
      id: 'm1',
      threadId: 't1',
      from: 'Boss <boss@acme.com>',
      subject: 'Q3 plan',
      date: 'Wed, 2 Jul 2026 09:12:00 +0000',
      snippet: 'Can you review the deck before...',
    },
  ]);
  // maxResults passthrough and metadata format.
  assert.equal(calls[0][1].q, 'from:boss is:unread');
  assert.equal(calls[0][1].maxResults, 2);
  assert.equal(calls[1][1].format, 'metadata');

  // JSON output shape is valid JSON.
  const json = JSON.stringify(result);
  assert.deepEqual(JSON.parse(json), result);
});

test('read returns decoded plaintext from a nested multipart payload', async () => {
  const services = {
    gmail: {
      users: {
        messages: {
          get: async () => ({
            data: {
              id: 'm2',
              snippet: 'fallback snippet',
              payload: {
                mimeType: 'multipart/alternative',
                headers: [
                  { name: 'From', value: 'a@x.com' },
                  { name: 'To', value: 'me@x.com' },
                  { name: 'Subject', value: 'Hi' },
                  { name: 'Date', value: 'Wed, 2 Jul 2026 09:12:00 +0000' },
                ],
                parts: [
                  { mimeType: 'text/html', body: { data: b64url('<p>ignored</p>') } },
                  { mimeType: 'text/plain', body: { data: b64url('Hello, world.') } },
                ],
              },
            },
          }),
        },
      },
    },
  };

  const result = await gmail.read(services, { id: 'm2' });
  assert.deepEqual(result, {
    id: 'm2',
    from: 'a@x.com',
    to: 'me@x.com',
    subject: 'Hi',
    date: 'Wed, 2 Jul 2026 09:12:00 +0000',
    body: 'Hello, world.',
  });
});

test('read falls back to the snippet when no text/plain part exists', async () => {
  const services = {
    gmail: {
      users: {
        messages: {
          get: async () => ({
            data: {
              id: 'm3',
              snippet: 'only a snippet',
              payload: { headers: [], parts: [{ mimeType: 'text/html', body: {} }] },
            },
          }),
        },
      },
    },
  };
  const result = await gmail.read(services, { id: 'm3' });
  assert.equal(result.body, 'only a snippet');
});

test('draft calls drafts.create with a base64url raw message and returns ids', async () => {
  let seen;
  const services = {
    gmail: {
      users: {
        drafts: {
          create: async (args) => {
            seen = args;
            return { data: { id: 'r-482', message: { id: '18f' } } };
          },
        },
      },
    },
  };

  const result = await gmail.draft(services, {
    to: 'ada@acme.com',
    subject: 'Re: deck',
    body: 'On it.',
  });
  assert.deepEqual(result, { draftId: 'r-482', messageId: '18f' });

  // The raw message decodes back to a well-formed MIME message.
  assert.equal(seen.userId, 'me');
  const raw = seen.requestBody.message.raw;
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(decoded, /^To: ada@acme\.com\r\n/);
  assert.match(decoded, /Subject: Re: deck\r\n/);
  assert.match(decoded, /Content-Type: text\/plain; charset="UTF-8"\r\n\r\nOn it\.$/);

  // JSON output shape.
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('buildMime produces base64url with To/Subject/Content-Type headers and body', () => {
  const raw = gmail.buildMime({ to: 't@x.com', subject: 'S', body: 'B', from: 'f@x.com' });
  assert.doesNotMatch(raw, /[+/=]/); // base64url, no padding
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  assert.equal(
    decoded,
    'From: f@x.com\r\nTo: t@x.com\r\nSubject: S\r\n' +
      'Content-Type: text/plain; charset="UTF-8"\r\n\r\nB'
  );
});

test('buildMime throws WienerdogError when subject contains a CRLF (header injection)', () => {
  assert.throws(
    () => gmail.buildMime({ to: 'a@b.com', subject: 'x\r\nBcc: evil@evil.com', body: 'hi' }),
    (err) => err.name === 'WienerdogError' && /Subject/.test(err.message)
  );
});

test('buildMime throws WienerdogError when to contains a bare LF', () => {
  assert.throws(
    () => gmail.buildMime({ to: 'a@b.com\nBcc: evil@evil.com', subject: 'x', body: 'hi' }),
    (err) => err.name === 'WienerdogError' && /To/.test(err.message)
  );
});

test('buildMime throws WienerdogError when from contains a CR', () => {
  assert.throws(
    () => gmail.buildMime({ from: 'a@b.com\rBcc: evil@evil.com', to: 'c@d.com', subject: 'x', body: 'hi' }),
    (err) => err.name === 'WienerdogError' && /From/.test(err.message)
  );
});

test('_alert (via alert.run) throws when opts.subject contains a CRLF', async () => {
  const calls = { send: 0 };
  const services = {
    gmail: {
      users: {
        getProfile: async () => ({ data: { emailAddress: 'owner@example.com' } }),
        messages: {
          send: async () => {
            calls.send++;
            return { data: { id: 'x' } };
          },
        },
      },
    },
  };

  await assert.rejects(
    () => alert.run(services, { subject: 'watchdog failed\r\nBcc: evil@evil.com', body: 'job X crashed' }),
    (err) => err.name === 'WienerdogError' && /Subject/.test(err.message)
  );
  assert.equal(calls.send, 0);
});
