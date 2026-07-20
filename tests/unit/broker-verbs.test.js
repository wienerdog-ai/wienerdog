'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validate } = require('../../src/gws/broker/schema');
const { createLimitsState } = require('../../src/gws/broker/limits');
const { VERBS } = require('../../src/gws/broker/verbs');
const { buildRegistry } = require('../../src/gws/broker/registry');
const { CAPABILITY_CLASS } = require('../../src/gws/broker/constants');

/**
 * A recording fake of the getServices `{gmail, calendar, drive}` shape: every
 * Google method logs its exact call path + params and returns canned data.
 */
function fakeServices() {
  const calls = [];
  const log = (method, params, data) => {
    calls.push({ method, params });
    return Promise.resolve({ data });
  };
  return {
    calls,
    called: (method) => calls.filter((c) => c.method === method),
    gmail: {
      users: {
        getProfile: (p) => log('gmail.users.getProfile', p, { emailAddress: 'me@example.com' }),
        messages: {
          list: (p) => log('gmail.users.messages.list', p, { messages: [{ id: 'm1', threadId: 't1' }] }),
          get: (p) =>
            log('gmail.users.messages.get', p, {
              id: 'm1',
              threadId: 't1',
              snippet: 'snip',
              payload: {
                mimeType: 'text/plain',
                headers: [
                  { name: 'From', value: 'a@b.c' },
                  { name: 'To', value: 'me@example.com' },
                  { name: 'Subject', value: 'hi' },
                  { name: 'Date', value: 'today' },
                ],
                body: { data: Buffer.from('hello body').toString('base64url') },
              },
            }),
          send: (p) => log('gmail.users.messages.send', p, { id: 'sent1' }),
        },
        drafts: {
          create: (p) => log('gmail.users.drafts.create', p, { id: 'd1', message: { id: 'dm1' } }),
        },
      },
    },
    calendar: {
      events: {
        list: (p) =>
          log('calendar.events.list', p, {
            items: [{ id: 'e1', summary: 's', start: { date: '2026-07-18' }, end: { date: '2026-07-18' } }],
          }),
        get: (p) =>
          log('calendar.events.get', p, {
            id: 'e1',
            summary: 's',
            start: { date: '2026-07-18' },
            end: { date: '2026-07-18' },
          }),
      },
    },
    drive: {
      files: {
        list: (p) => log('drive.files.list', p, { files: [{ id: 'f1', name: 'n', mimeType: 'text/plain' }] }),
        get: (p) =>
          p.alt === 'media'
            ? log('drive.files.get', p, 'file text')
            : log('drive.files.get', p, { id: 'f1', name: 'n', mimeType: 'text/plain' }),
        export: (p) => log('drive.files.export', p, 'exported text'),
      },
    },
  };
}

/** Registry over fresh fakes; grant allowed unless overridden. These verb-dispatch
 *  tests exercise the whole verb table, so the server-side allowlist (ADR-0026
 *  amendment 1) is opened to every verb unless a test overrides it. */
function makeRegistry(overrides = {}) {
  const services = overrides.services || fakeServices();
  const registry = buildRegistry({
    services,
    routineId: 'daily-digest',
    allowedVerbs: overrides.allowedVerbs || Object.keys(VERBS),
    grantCheck: overrides.grantCheck || (() => true),
    limitsState: overrides.limitsState,
  });
  return { services, registry };
}

// ---------------------------------------------------------------- schema.js

test('broker-verbs schema: accepts exact shape, rejects extra fields fail-closed', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: { query: { type: 'string', maxLength: 8 }, max: { type: 'integer', min: 1, max: 20 } },
  };
  assert.equal(validate(schema, { query: 'ok', max: 5 }).ok, true);
  assert.equal(validate(schema, { query: 'ok', extra: 'x' }).ok, false);
  assert.equal(validate(schema, { max: 5 }).ok, false, 'missing required');
  assert.equal(validate(schema, { query: 'too long here' }).ok, false, 'maxLength');
  assert.equal(validate(schema, { query: 'ok', max: 0 }).ok, false, 'min');
  assert.equal(validate(schema, { query: 'ok', max: 21 }).ok, false, 'max');
  assert.equal(validate(schema, { query: 'ok', max: 2.5 }).ok, false, 'integer');
  assert.equal(validate(schema, 'not an object').ok, false);
  assert.equal(validate(schema, null).ok, false);
  assert.equal(validate(schema, [1]).ok, false);
});

test('broker-verbs schema: anchored pattern enforced; unknown schema keyword throws (fail closed)', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', maxLength: 16, pattern: '^[A-Za-z0-9_-]+$' } },
  };
  assert.equal(validate(schema, { id: 'abc_DEF-123' }).ok, true);
  assert.equal(validate(schema, { id: 'nope!' }).ok, false);
  assert.throws(() =>
    validate(
      { type: 'object', additionalProperties: false, required: [], properties: { x: { type: 'string', format: 'email' } } },
      { x: 'a' }
    )
  );
});

// ---------------------------------------------------------------- verb table

test('broker-verbs: the frozen eight-verb table, classes and exact API methods', () => {
  const names = Object.keys(VERBS).sort();
  assert.deepEqual(names, [
    'calendar_list',
    'calendar_show',
    'create_draft',
    'drive_read',
    'drive_search',
    'gmail_read',
    'gmail_search',
    'send_digest_to_self',
  ]);
  assert.equal(VERBS.gmail_search.capabilityClass, CAPABILITY_CLASS.READ);
  assert.equal(VERBS.create_draft.capabilityClass, CAPABILITY_CLASS.DRAFT);
  assert.equal(VERBS.send_digest_to_self.capabilityClass, CAPABILITY_CLASS.SEND);
  // No calendar mutation verb exists in v1 (ADR-0026 §2).
  for (const v of Object.values(VERBS)) {
    assert.ok(!/events\.(insert|update|delete|patch)/.test(v.apiMethod), `${v.name} must not mutate calendar`);
  }
  assert.match(VERBS.send_digest_to_self.apiMethod, /messages\.send/);
  // The send schema has NO recipient field at all.
  const sendProps = Object.keys(VERBS.send_digest_to_self.inputSchema.properties);
  assert.deepEqual(sendProps.sort(), ['body', 'subject']);
  assert.ok(Object.isFrozen(VERBS), 'verb table is frozen');
});

test('broker-verbs: listTools advertises every verb with an inputSchema', () => {
  const { registry } = makeRegistry();
  const tools = registry.listTools();
  assert.equal(tools.length, 8);
  for (const t of tools) {
    assert.equal(typeof t.name, 'string');
    assert.equal(typeof t.description, 'string');
    assert.equal(t.inputSchema.additionalProperties, false);
  }
});

// ---------------------------------------------------------------- read verbs

test('broker-verbs: gmail_search calls messages.list (+ per-hit metadata get); over-length query = zero calls', async () => {
  const { services, registry } = makeRegistry();
  const res = await registry.callTool('gmail_search', { query: 'is:unread', max: 5 });
  assert.equal(services.called('gmail.users.messages.list').length, 1);
  assert.equal(services.called('gmail.users.messages.list')[0].params.maxResults, 5);
  assert.equal(res.content[0].type, 'text');

  const { services: s2, registry: r2 } = makeRegistry();
  await assert.rejects(() => r2.callTool('gmail_search', { query: 'x'.repeat(513) }));
  assert.equal(s2.calls.length, 0, 'zero API calls on schema reject');
});

test('broker-verbs: gmail_read calls messages.get format:full; bad id chars rejected with zero calls', async () => {
  const { services, registry } = makeRegistry();
  await registry.callTool('gmail_read', { id: 'm1' });
  const got = services.called('gmail.users.messages.get');
  assert.equal(got.length, 1);
  assert.equal(got[0].params.format, 'full');

  const { services: s2, registry: r2 } = makeRegistry();
  await assert.rejects(() => r2.callTool('gmail_read', { id: '../etc/passwd' }));
  assert.equal(s2.calls.length, 0);
});

test('broker-verbs: calendar_list/calendar_show hit exactly events.list/events.get on primary', async () => {
  const { services, registry } = makeRegistry();
  await registry.callTool('calendar_list', { from: '2026-07-18T00:00:00Z', max: 3 });
  assert.equal(services.called('calendar.events.list').length, 1);
  assert.equal(services.called('calendar.events.list')[0].params.calendarId, 'primary');

  await registry.callTool('calendar_show', { id: 'e1' });
  assert.equal(services.called('calendar.events.get').length, 1);
  assert.equal(services.called('calendar.events.get')[0].params.calendarId, 'primary');

  const { services: s2, registry: r2 } = makeRegistry();
  await assert.rejects(() => r2.callTool('calendar_list', { from: 'not-a-date' }));
  assert.equal(s2.calls.length, 0);
});

test('broker-verbs: drive_search wraps the term as a safe fullText query; drive_read reads one file', async () => {
  const { services, registry } = makeRegistry();
  await registry.callTool('drive_search', { term: "bob's plan" });
  const q = services.called('drive.files.list')[0].params.q;
  assert.match(q, /^fullText contains /);
  assert.ok(q.includes("\\'"), 'quote escaped');

  await registry.callTool('drive_read', { id: 'f1' });
  assert.ok(services.called('drive.files.get').length >= 1);
});

// ------------------------------------------------------------------- drafts

test('broker-verbs: create_draft calls drafts.create and NEVER messages.send; CR/LF rejected zero-call', async () => {
  const { services, registry } = makeRegistry();
  await registry.callTool('create_draft', { to: 'x@y.z', subject: 'hi', body: 'b' });
  assert.equal(services.called('gmail.users.drafts.create').length, 1);
  assert.equal(services.called('gmail.users.messages.send').length, 0);

  const { services: s2, registry: r2 } = makeRegistry();
  await assert.rejects(() => r2.callTool('create_draft', { to: 'x@y.z', subject: 'hi\r\nBcc: evil@x.y', body: 'b' }));
  assert.equal(s2.calls.length, 0, 'header injection rejected before any API call');
});

// ------------------------------------------------------- send_digest_to_self

test('broker-verbs: send_digest_to_self resolves self and sends to it (acceptance point 2)', async () => {
  const { services, registry } = makeRegistry();
  const res = await registry.callTool('send_digest_to_self', { subject: 'digest', body: 'today: all good' });
  assert.equal(services.called('gmail.users.getProfile').length, 1);
  const sends = services.called('gmail.users.messages.send');
  assert.equal(sends.length, 1);
  const mime = Buffer.from(sends[0].params.requestBody.raw, 'base64url').toString('utf8');
  assert.match(mime, /To: me@example\.com/);
  assert.equal(res.content[0].type, 'text');
});

test('broker-verbs: send_digest_to_self with ANY recipient field is schema-rejected, zero API calls', async () => {
  for (const extra of [{ to: 'evil@x.y' }, { cc: 'evil@x.y' }, { bcc: 'evil@x.y' }]) {
    const { services, registry } = makeRegistry();
    await assert.rejects(() => registry.callTool('send_digest_to_self', { subject: 's', body: 'b', ...extra }));
    assert.equal(services.calls.length, 0, `zero calls with ${Object.keys(extra)[0]}`);
  }
});

test('broker-verbs: send_digest_to_self without a grant returns the fixed notice, zero send calls', async () => {
  const seen = [];
  const { services, registry } = makeRegistry({
    grantCheck: (routineId, kind) => {
      seen.push([routineId, kind]);
      return false;
    },
  });
  const res = await registry.callTool('send_digest_to_self', { subject: 's', body: 'b' });
  assert.deepEqual(seen, [['daily-digest', 'send_self']]);
  assert.equal(services.called('gmail.users.messages.send').length, 0);
  assert.match(res.content[0].text, /no.*grant/i);
  assert.match(res.content[0].text, /not sent/i);
});

// ------------------------------------------------------------------- limits

test('broker-verbs: exceeding the per-run call cap fails closed with zero further API calls', async () => {
  const limitsState = createLimitsState();
  const { services, registry } = makeRegistry({ limitsState });
  const cap = VERBS.send_digest_to_self.limits.maxCallsPerRun;
  for (let i = 0; i < cap; i++) {
    await registry.callTool('send_digest_to_self', { subject: 's', body: 'b' });
  }
  const sendsBefore = services.called('gmail.users.messages.send').length;
  await assert.rejects(() => registry.callTool('send_digest_to_self', { subject: 's', body: 'b' }));
  assert.equal(services.called('gmail.users.messages.send').length, sendsBefore, 'no further sends');
});

test('broker-verbs: gmail_read body is byte-capped per the verb limit', async () => {
  const services = fakeServices();
  const big = 'x'.repeat(70 * 1024);
  services.gmail.users.messages.get = (p) => {
    services.calls.push({ method: 'gmail.users.messages.get', params: p });
    return Promise.resolve({
      data: {
        id: 'm1',
        payload: {
          mimeType: 'text/plain',
          headers: [],
          body: { data: Buffer.from(big).toString('base64url') },
        },
      },
    });
  };
  const { registry } = makeRegistry({ services });
  const res = await registry.callTool('gmail_read', { id: 'm1' });
  const payload = JSON.parse(res.content[0].text);
  assert.ok(Buffer.byteLength(payload.body, 'utf8') <= 64 * 1024, 'body capped at 64 KB');
});

// -------------------------------------------------------------- fail closed

test('broker-verbs: unknown verb fails closed with a fixed error and zero side effect', async () => {
  const { services, registry } = makeRegistry();
  await assert.rejects(() => registry.callTool('gmail_delete_everything', {}), /unknown/i);
  assert.equal(services.calls.length, 0);
});

test('broker-verbs: a throwing Google call surfaces as a fixed secret-free error', async () => {
  const services = fakeServices();
  services.gmail.users.messages.list = () =>
    Promise.reject(new Error('401 token ya29.VERY-SECRET rejected at https://gmail.googleapis.com/x?key=abc'));
  const { registry } = makeRegistry({ services });
  await assert.rejects(
    () => registry.callTool('gmail_search', { query: 'q' }),
    (err) => !/SECRET|ya29|googleapis\.com/.test(err.message)
  );
});

test('broker-verbs: a verb whose backing service is missing is refused before any call', async () => {
  const services = fakeServices();
  delete services.drive;
  const { registry } = makeRegistry({ services });
  await assert.rejects(() => registry.callTool('drive_search', { term: 'x' }));
});
