'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validate } = require('../../src/gws/broker/schema');
const { createLimitsState } = require('../../src/gws/broker/limits');
const { VERBS } = require('../../src/gws/broker/verbs');
const { buildRegistry } = require('../../src/gws/broker/registry');
const { CAPABILITY_CLASS } = require('../../src/gws/broker/constants');
const gmail = require('../../src/gws/gmail');

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

test('broker-verbs: the frozen nine-verb table, classes and exact API methods', () => {
  const names = Object.keys(VERBS).sort();
  assert.deepEqual(names, [
    'calendar_list',
    'calendar_show',
    'create_draft_to_self',
    'create_reply_draft',
    'drive_read',
    'drive_search',
    'gmail_read',
    'gmail_search',
    'send_digest_to_self',
  ]);
  assert.equal(VERBS.gmail_search.capabilityClass, CAPABILITY_CLASS.READ);
  assert.equal(VERBS.create_draft_to_self.capabilityClass, CAPABILITY_CLASS.DRAFT);
  assert.equal(VERBS.create_reply_draft.capabilityClass, CAPABILITY_CLASS.DRAFT);
  assert.equal(VERBS.send_digest_to_self.capabilityClass, CAPABILITY_CLASS.SEND);
  assert.deepEqual([...VERBS.create_draft_to_self.extraClasses], ['READ']);
  assert.deepEqual([...VERBS.create_reply_draft.extraClasses], ['READ']);
  assert.equal(VERBS.create_draft, undefined, 'create_draft is deleted, not merely de-allowlisted');
  // No calendar mutation verb exists in v1 (ADR-0026 §2).
  for (const v of Object.values(VERBS)) {
    assert.ok(!/events\.(insert|update|delete|patch)/.test(v.apiMethod), `${v.name} must not mutate calendar`);
  }
  assert.match(VERBS.send_digest_to_self.apiMethod, /messages\.send/);
  // The send schema, and both draft schemas, have NO recipient field at all.
  const sendProps = Object.keys(VERBS.send_digest_to_self.inputSchema.properties);
  assert.deepEqual(sendProps.sort(), ['body', 'subject']);
  const selfDraftProps = Object.keys(VERBS.create_draft_to_self.inputSchema.properties);
  assert.deepEqual(selfDraftProps.sort(), ['body', 'subject']);
  const replyDraftProps = Object.keys(VERBS.create_reply_draft.inputSchema.properties);
  assert.deepEqual(replyDraftProps.sort(), ['body', 'id'], 'no address key, and no subject key');
  assert.ok(Object.isFrozen(VERBS), 'verb table is frozen');
});

test('broker-verbs: listTools advertises every verb with an inputSchema', () => {
  const { registry } = makeRegistry();
  const tools = registry.listTools();
  assert.equal(tools.length, 9);
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

/** hdrs({A:'x'}) -> Gmail's metadata headers array shape. */
function hdrs(obj) {
  return Object.entries(obj).map(([name, value]) => ({ name, value }));
}

/** Escape a literal string for embedding in a RegExp. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A recording fake purpose-built for create_reply_draft: messages.get returns
 *  the given metadata headers/threadId (or rejects, for the fetch-failure
 *  case); drafts.create records its request. */
function fakeReplyServices({ headers = [], threadId = 't1', getFails = false } = {}) {
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
        messages: {
          get: (p) => {
            if (getFails) {
              calls.push({ method: 'gmail.users.messages.get', params: p });
              return Promise.reject(new Error('500 internal at https://gmail.googleapis.com/x?key=SECRET'));
            }
            return log('gmail.users.messages.get', p, { id: p.id, threadId, payload: { headers } });
          },
        },
        drafts: {
          create: (p) => log('gmail.users.drafts.create', p, { id: 'd1', message: { id: 'dm1' } }),
        },
      },
    },
  };
}

const REPLY_REFUSAL_INPUT = 'could not determine one reply address on that message — no draft was created';
const REPLY_REFUSAL_OUTPUT = "the reply's headers would be too long to send — no draft was created";

/** N ASCII octets — chars and octets coincide, so byte-precise fixtures stay
 *  exact under both a character and an octet reading. */
const ascii = (n) => 'x'.repeat(n);

test('broker-verbs: create_draft_to_self calls drafts.create and NEVER messages.send; CR/LF rejected zero-call', async () => {
  const { services, registry } = makeRegistry();
  await registry.callTool('create_draft_to_self', { subject: 'hi', body: 'b' });
  assert.equal(services.called('gmail.users.drafts.create').length, 1);
  assert.equal(services.called('gmail.users.messages.send').length, 0);

  const { services: s2, registry: r2 } = makeRegistry();
  await assert.rejects(() => r2.callTool('create_draft_to_self', { subject: 'hi\r\nBcc: evil@x.y', body: 'b' }));
  assert.equal(s2.calls.length, 0, 'header injection rejected before any API call');
});

test('broker-verbs: [AUD-D1] create_draft_to_self addresses the server-resolved account and refuses when it cannot resolve one', async () => {
  const { services, registry } = makeRegistry();
  const res = await registry.callTool('create_draft_to_self', { subject: 'hi', body: 'b' });
  assert.equal(services.called('gmail.users.getProfile').length, 1, '[AUD-D1] resolves via getProfile');
  const created = services.called('gmail.users.drafts.create');
  assert.equal(created.length, 1, '[AUD-D1] exactly one draft created');
  const mime = Buffer.from(created[0].params.requestBody.message.raw, 'base64url').toString('utf8');
  assert.match(mime, /^To: me@example\.com\r\n/, '[AUD-D1] addressed to the getProfile-resolved account');
  assert.equal(services.called('gmail.users.messages.send').length, 0, '[AUD-D1] never sends');
  assert.equal(res.content[0].type, 'text', '[AUD-D1] returns text content');

  // An argument object carrying ANY address key is schema-rejected, zero calls.
  for (const extra of [{ to: 'evil@x.y' }, { cc: 'evil@x.y' }, { bcc: 'evil@x.y' }]) {
    const { services: s2, registry: r2 } = makeRegistry();
    await assert.rejects(() => r2.callTool('create_draft_to_self', { subject: 's', body: 'b', ...extra }));
    assert.equal(s2.calls.length, 0, `[AUD-D1] zero calls with a supplied ${Object.keys(extra)[0]}`);
  }

  // A getProfile result with no usable address creates no draft and raises
  // the fixed message.
  const services3 = fakeServices();
  services3.gmail.users.getProfile = (p) => {
    services3.calls.push({ method: 'gmail.users.getProfile', params: p });
    return Promise.resolve({ data: {} });
  };
  const { registry: r3 } = makeRegistry({ services: services3 });
  await assert.rejects(
    () => r3.callTool('create_draft_to_self', { subject: 's', body: 'b' }),
    (err) => err.message === 'could not determine your Google account address — no draft was created',
    '[AUD-D1] an unresolved self address refuses with the fixed message'
  );
  assert.equal(services3.called('gmail.users.drafts.create').length, 0, '[AUD-D1] no draft on an unresolved self address');
});

test("broker-verbs: [AUD-D2] create_reply_draft addresses exactly the one address Table B's order produces, over every accepted case", async () => {
  const cases = [
    { label: 'bare address', from: 'alice@example.org', expect: 'alice@example.org' },
    { label: 'angle address', from: '<alice@example.org>', expect: 'alice@example.org' },
    { label: 'phrase + angle', from: 'Alice Example <alice@example.org>', expect: 'alice@example.org' },
    { label: 'quoted phrase with angle-looking content', from: '"Team <east>" <alice@example.org>', expect: 'alice@example.org' },
    { label: 'quoted phrase with comma', from: '"Doe, Jane" <alice@example.org>', expect: 'alice@example.org' },
    { label: 'quoted phrase, no whitespace before <', from: '"Alice"<alice@example.org>', expect: 'alice@example.org' },
    { label: 'atom + quoted word', from: 'Alice "Team <east>" <alice@example.org>', expect: 'alice@example.org' },
    { label: 'empty quoted phrase', from: '"" <alice@example.org>', expect: 'alice@example.org' },
    { label: 'escaped quote in phrase', from: '"a\\"b" <alice@example.org>', expect: 'alice@example.org' },
    { label: 'phrase with a period and an apostrophe', from: "Dr. Alice O'Brien <alice@example.org>", expect: 'alice@example.org' },
    { label: 'tab before angle', from: 'Alice\t<alice@example.org>', expect: 'alice@example.org' },
    { label: 'surrounding horizontal whitespace', from: '   alice@example.org   ', expect: 'alice@example.org' },
    { label: 'many-dot domain', from: 'alice@a.b.c.example.org', expect: 'alice@a.b.c.example.org' },
    { label: 'raw value of exactly 998 characters', from: `${ascii(990)}<a@b.co>`, expect: 'a@b.co' },
  ];
  for (const c of cases) {
    const services = fakeReplyServices({ headers: hdrs({ From: c.from, Subject: 'hi' }) });
    const { registry } = makeRegistry({ services });
    await registry.callTool('create_reply_draft', { id: 'm1', body: 'a plain reply, naming no address' });
    const created = services.called('gmail.users.drafts.create');
    assert.equal(created.length, 1, `[AUD-D2] ${c.label}: exactly one draft created`);
    const mime = Buffer.from(created[0].params.requestBody.message.raw, 'base64url').toString('utf8');
    assert.match(mime, new RegExp(`^To: ${escapeRe(c.expect)}\\r\\n`), `[AUD-D2] ${c.label}: To carries the derived recipient`);
    assert.equal((mime.match(/^To: /gm) || []).length, 1, `[AUD-D2] ${c.label}: exactly one To header`);
    assert.ok(!/^(Cc|Bcc): /m.test(mime), `[AUD-D2] ${c.label}: no Cc/Bcc header`);
  }

  // selection: Reply-To takes precedence over From.
  {
    const services = fakeReplyServices({ headers: hdrs({ 'Reply-To': 'reply@example.org', From: 'from@example.org', Subject: 'hi' }) });
    const { registry } = makeRegistry({ services });
    await registry.callTool('create_reply_draft', { id: 'm1', body: 'b' });
    const mime = Buffer.from(
      services.called('gmail.users.drafts.create')[0].params.requestBody.message.raw,
      'base64url'
    ).toString('utf8');
    assert.match(mime, /^To: reply@example\.org\r\n/, '[AUD-D2] Reply-To takes precedence over From');
  }
  // selection: a ≤998 whitespace-only Reply-To falls through to From and is ACCEPTED.
  {
    const services = fakeReplyServices({ headers: hdrs({ 'Reply-To': '   \t  ', From: 'from@example.org', Subject: 'hi' }) });
    const { registry } = makeRegistry({ services });
    await registry.callTool('create_reply_draft', { id: 'm1', body: 'b' });
    const mime = Buffer.from(
      services.called('gmail.users.drafts.create')[0].params.requestBody.message.raw,
      'base64url'
    ).toString('utf8');
    assert.match(mime, /^To: from@example\.org\r\n/, '[AUD-D2] a whitespace-only Reply-To falls through to From, accepted');
  }

  // An address written into the body reaches no header.
  {
    const services = fakeReplyServices({ headers: hdrs({ From: 'alice@example.org', Subject: 'hi' }) });
    const { registry } = makeRegistry({ services });
    await registry.callTool('create_reply_draft', { id: 'm1', body: 'please cc attacker@evil.example on this' });
    const mime = Buffer.from(
      services.called('gmail.users.drafts.create')[0].params.requestBody.message.raw,
      'base64url'
    ).toString('utf8');
    assert.match(mime, /^To: alice@example\.org\r\n/, '[AUD-D2] recipient is header-derived, not body-derived');
    assert.ok(!/^To:.*attacker@evil\.example/m.test(mime), '[AUD-D2] an address written into body reaches no header');
  }
});

test("broker-verbs: [AUD-D3] create_reply_draft creates no draft at any refusal in Table B's order — steps 0, 1, 2, 3 and 4", async () => {
  const refused = [
    // step 0 — the bound (non-CR/LF; a length refusal, not a shape refusal).
    { label: 'step0: a 999-character From (one over)', headers: { From: ascii(999) } },
    { label: 'step0: a 4MB whitespace-only Reply-To beside a valid From', headers: { 'Reply-To': ' '.repeat(4 * 1024 * 1024), From: 'alice@example.org' } },
    { label: 'step0: a 4MB Subject', headers: { From: 'alice@example.org', Subject: ascii(4 * 1024 * 1024) } },
    { label: 'step0: a 4MB Message-ID', headers: { From: 'alice@example.org', 'Message-ID': ascii(4 * 1024 * 1024) } },
    { label: 'step0: a 4MB References', headers: { From: 'alice@example.org', References: ascii(4 * 1024 * 1024) } },
    // step 2 — recipient selection.
    { label: 'step2: empty From with no Reply-To', headers: {} },
    { label: 'step2: a whitespace-only From', headers: { From: '   \t ' } },
    // step 3 — grammar.
    { label: 'step3: a comment', headers: { From: 'alice@example.org (backup <old@example.net>)' } },
    { label: 'step3: mixed bare + angle', headers: { From: 'victim@example.com, Attacker <attacker@example.com>' } },
    { label: 'step3: several bracketed mailboxes', headers: { From: '<alice@example.org> <bob@example.org>' } },
    { label: 'step3: two bare mailboxes', headers: { From: 'alice@example.org bob@example.org' } },
    { label: 'step3: trailing text after >', headers: { From: '<alice@example.org> extra' } },
    { label: 'step3: trailing text on a bare value', headers: { From: 'alice@example.org extra' } },
    { label: 'step3: a group', headers: { From: 'undisclosed-recipients:;' } },
    { label: 'step3: a named group', headers: { From: 'Team: alice@example.org, bob@example.org;' } },
    { label: 'step3: an address literal', headers: { From: 'user@[192.0.2.1]' } },
    { label: 'step3: two @', headers: { From: 'alice@relay@example.org' } },
    { label: 'step3: a dotless domain', headers: { From: 'user@localhost' } },
    { label: 'step3: a quoted local part', headers: { From: '"john doe"@example.org' } },
    // step 4 — address bound.
    { label: 'step4: a captured address of 321 characters', headers: { From: `${'a'.repeat(316)}@b.co` } },
  ];
  for (const c of refused) {
    const services = fakeReplyServices({ headers: hdrs(c.headers) });
    const { registry } = makeRegistry({ services });
    await assert.rejects(
      () => registry.callTool('create_reply_draft', { id: 'm1', body: 'b' }),
      (err) => err.message === REPLY_REFUSAL_INPUT,
      `[AUD-D3] ${c.label}: the fixed refusal message`
    );
    assert.equal(services.called('gmail.users.drafts.create').length, 0, `[AUD-D3] ${c.label}: zero drafts.create calls`);
  }

  // Zero drafts.create calls and the fixed refusal message when messages.get fails.
  {
    const services = fakeReplyServices({ getFails: true });
    const { registry } = makeRegistry({ services });
    await assert.rejects(
      () => registry.callTool('create_reply_draft', { id: 'm1', body: 'b' }),
      (err) => err.message === REPLY_REFUSAL_INPUT && !/SECRET|googleapis\.com/.test(err.message),
      '[AUD-D3] a messages.get failure refuses with the fixed, secret-free message'
    );
    assert.equal(services.called('gmail.users.drafts.create').length, 0, '[AUD-D3] messages.get failure: zero drafts.create calls');
  }
});

test("broker-verbs: [AUD-D4] a reply draft is threaded to its source, its subject is the untruncated fixed-point derivation, and every emitted header line is within 998 octets", async () => {
  // Threading: threadId, In-Reply-To and References all present.
  {
    const services = fakeReplyServices({
      headers: hdrs({ From: 'alice@example.org', Subject: 'hi', 'Message-ID': '<mid1@x>', References: '<mid0@x>' }),
      threadId: 'thread-xyz',
    });
    const { registry } = makeRegistry({ services });
    await registry.callTool('create_reply_draft', { id: 'm1', body: 'b' });
    const call = services.called('gmail.users.drafts.create')[0];
    assert.equal(call.params.requestBody.message.threadId, 'thread-xyz', '[AUD-D4] threadId on the drafts.create request');
    const mime = Buffer.from(call.params.requestBody.message.raw, 'base64url').toString('utf8');
    assert.match(mime, /^In-Reply-To: <mid1@x>\r\n/m, '[AUD-D4] In-Reply-To carries the source Message-ID');
    assert.match(mime, /^References: <mid0@x> <mid1@x>\r\n/m, '[AUD-D4] References is the prior chain plus the source Message-ID');
    assert.match(mime, /^Subject: Re: hi\r\n/m, '[AUD-D4] Subject is Re: plus a space plus the source subject');
  }

  // No Message-ID -> both reply headers omitted, byte-identical to a non-reply draft.
  {
    const services = fakeReplyServices({ headers: hdrs({ From: 'alice@example.org', Subject: 'hi' }), threadId: '' });
    const { registry } = makeRegistry({ services });
    await registry.callTool('create_reply_draft', { id: 'm1', body: 'b' });
    const call = services.called('gmail.users.drafts.create')[0];
    assert.equal(call.params.requestBody.message.threadId, undefined, '[AUD-D4] no threadId when the source has none');
    const mime = Buffer.from(call.params.requestBody.message.raw, 'base64url').toString('utf8');
    assert.equal(
      mime,
      'To: alice@example.org\r\nSubject: Re: hi\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\nb',
      '[AUD-D4] no Message-ID: byte-identical in shape to a non-reply draft — no In-Reply-To/References line'
    );
  }

  // Subject rows: a 900-character subject, untruncated; an astral character straddling 512; idempotent Re:.
  {
    const s900 = ascii(900);
    const services = fakeReplyServices({ headers: hdrs({ From: 'a@b.co', Subject: s900 }) });
    const { registry } = makeRegistry({ services });
    await registry.callTool('create_reply_draft', { id: 'm1', body: 'b' });
    const mime = Buffer.from(
      services.called('gmail.users.drafts.create')[0].params.requestBody.message.raw,
      'base64url'
    ).toString('utf8');
    assert.match(mime, new RegExp(`^Subject: Re: ${s900}\\r\\n`, 'm'), '[AUD-D4] a 900-char subject, untruncated, byte-identical to Re: + space + source');
  }
  {
    const straddle = `${ascii(511)}\u{1F600}${ascii(50)}`;
    const services = fakeReplyServices({ headers: hdrs({ From: 'a@b.co', Subject: straddle }) });
    const { registry } = makeRegistry({ services });
    await registry.callTool('create_reply_draft', { id: 'm1', body: 'b' });
    const mime = Buffer.from(
      services.called('gmail.users.drafts.create')[0].params.requestBody.message.raw,
      'base64url'
    ).toString('utf8');
    assert.match(mime, new RegExp(`^Subject: Re: ${escapeRe(straddle)}\\r\\n`, 'm'), '[AUD-D4] astral char straddling 512 round-trips exactly');
    assert.ok(!mime.includes('�'), '[AUD-D4] no U+FFFD replacement character');
  }
  {
    const services = fakeReplyServices({ headers: hdrs({ From: 'a@b.co', Subject: 'Re: already' }) });
    const { registry } = makeRegistry({ services });
    await registry.callTool('create_reply_draft', { id: 'm1', body: 'b' });
    const mime = Buffer.from(
      services.called('gmail.users.drafts.create')[0].params.requestBody.message.raw,
      'base64url'
    ).toString('utf8');
    assert.match(mime, /^Subject: Re: already\r\n/m, '[AUD-D4] an already-Re:-prefixed subject is left unchanged (idempotent)');
  }

  // Subject fixed point: empty/spaces-only/tabs-only all derive the empty string.
  for (const [label, subj] of [['empty', ''], ['spaces-only', '   '], ['tabs-only', '\t\t']]) {
    const services = fakeReplyServices({ headers: hdrs({ From: 'a@b.co', Subject: subj }) });
    const { registry } = makeRegistry({ services });
    await registry.callTool('create_reply_draft', { id: 'm1', body: 'b' });
    const mime = Buffer.from(
      services.called('gmail.users.drafts.create')[0].params.requestBody.message.raw,
      'base64url'
    ).toString('utf8');
    assert.match(mime, /^Subject: \r\n/m, `[AUD-D4] a ${label} source subject derives the empty string`);
  }
  // Applying the derivation twice changes nothing (fixed point), for the empty case and 'Hello'.
  {
    const services1 = fakeReplyServices({ headers: hdrs({ From: 'a@b.co', Subject: '' }) });
    const target1 = await gmail.replyTarget(services1, { id: 'm1' });
    const services1b = fakeReplyServices({ headers: hdrs({ From: 'a@b.co', Subject: target1.subject }) });
    const target1b = await gmail.replyTarget(services1b, { id: 'm1' });
    assert.equal(target1b.subject, target1.subject, '[AUD-D4] fixed point: the empty case is stable under a second application');

    const services2 = fakeReplyServices({ headers: hdrs({ From: 'a@b.co', Subject: 'Hello' }) });
    const target2 = await gmail.replyTarget(services2, { id: 'm1' });
    assert.equal(target2.subject, 'Re: Hello', '[AUD-D4] Hello derives Re: Hello');
    const services2b = fakeReplyServices({ headers: hdrs({ From: 'a@b.co', Subject: target2.subject }) });
    const target2b = await gmail.replyTarget(services2b, { id: 'm1' });
    assert.equal(target2b.subject, target2.subject, '[AUD-D4] fixed point: Re: Hello is stable under a second application');
  }

  // Step 7 — the output bound, one-octet boundaries. Accepted at exactly 998; refused at 999.
  const accept = async (headers, label) => {
    const services = fakeReplyServices({ headers: hdrs(headers) });
    const { registry } = makeRegistry({ services });
    await registry.callTool('create_reply_draft', { id: 'm1', body: 'b' });
    assert.equal(services.called('gmail.users.drafts.create').length, 1, `[AUD-D4] ${label}: accepted at exactly 998 octets`);
  };
  const refuse = async (headers, label) => {
    const services = fakeReplyServices({ headers: hdrs(headers) });
    const { registry } = makeRegistry({ services });
    await assert.rejects(
      () => registry.callTool('create_reply_draft', { id: 'm1', body: 'b' }),
      (err) => err.message === REPLY_REFUSAL_OUTPUT,
      `[AUD-D4] ${label}: refused by step 7's fixed output-bound message`
    );
    assert.equal(services.called('gmail.users.drafts.create').length, 0, `[AUD-D4] ${label}: zero drafts.create calls`);
  };

  // Subject: already-Re:-prefixed.
  await refuse({ From: 'a@b.co', Subject: `Re:${ascii(987)}` }, 'Subject already-Re:-prefixed 990 octets -> line 999');
  await accept({ From: 'a@b.co', Subject: `Re:${ascii(986)}` }, 'Subject already-Re:-prefixed 989 octets -> line 998');
  // Subject: plain.
  await refuse({ From: 'a@b.co', Subject: ascii(986) }, 'Subject plain 986 octets, derived 990 -> line 999');
  await accept({ From: 'a@b.co', Subject: ascii(985) }, 'Subject plain 985 octets, derived 989 -> line 998');
  // References.
  await refuse(
    { From: 'a@b.co', 'Message-ID': ascii(46), References: ascii(940) },
    'References 940+46 octets, value 987 -> line 999'
  );
  await accept(
    { From: 'a@b.co', 'Message-ID': ascii(46), References: ascii(939) },
    'References 939+46 octets, value 986 -> line 998'
  );
  // References — non-boundary accumulation, labelled as such: not a boundary, just ordinary overshoot.
  await refuse(
    { From: 'a@b.co', 'Message-ID': ascii(46), References: ascii(974) },
    'References non-boundary accumulation 974+46 octets, value 1021 -> line 1033'
  );
  // In-Reply-To.
  await refuse({ From: 'a@b.co', 'Message-ID': ascii(986) }, 'In-Reply-To 986-octet Message-ID -> line 999');
  await accept({ From: 'a@b.co', 'Message-ID': ascii(985) }, 'In-Reply-To 985-octet Message-ID -> line 998');

  // Step 7 — the measure is octets, not code units.
  await refuse({ From: 'a@b.co', Subject: '€'.repeat(329) }, 'Subject 329 € — 329 UTF-16 units but 987 octets, derived 991 -> line 1000');
  await refuse(
    { From: 'a@b.co', Subject: '€'.repeat(998) },
    'Subject 998-char € = 2994 octets — passes step 0 (998 chars), refused at step 7'
  );

  // To — astral characters, under THIS implementation's step-4 convention
  // (UTF-16 .length, the simpler reading — Decisions made). Both astral
  // witnesses refuse at STEP 4 (the input-bound message), never reaching
  // step 7's output check for To.
  {
    const astralAddr = `${'\u{1F600}'.repeat(247)}aa@b.co`;
    const services = fakeReplyServices({ headers: hdrs({ From: `<${astralAddr}>` }) });
    const { registry } = makeRegistry({ services });
    await assert.rejects(
      () => registry.callTool('create_reply_draft', { id: 'm1', body: 'b' }),
      (err) => err.message === REPLY_REFUSAL_INPUT,
      '[AUD-D4] astral To: refused at step 4 (UTF-16 .length over 320), not step 7'
    );
    assert.equal(services.called('gmail.users.drafts.create').length, 0, '[AUD-D4] astral To: zero drafts.create calls');
  }
});

test('broker-verbs: [AUD-D5] a CR or LF anywhere in any of the five RAW header values, one field at a time, produces zero drafts.create calls and never reaches buildMime', async () => {
  // gmail.draft is buildMime's ONLY caller in this pipeline, and verbs.js
  // reaches it via a live property lookup on this same required module
  // object (`gmail.draft(...)`) — so spying here proves buildMime, reached
  // only from inside draft(), was never invoked.
  const originalDraft = gmail.draft;
  const draftCalls = [];
  gmail.draft = (...args) => {
    draftCalls.push(args);
    return originalDraft(...args);
  };
  try {
    const fields = ['Reply-To', 'From', 'Subject', 'Message-ID', 'References'];
    const positions = [
      ['leading \\r\\n', (v) => `\r\n${v}`],
      ['trailing \\r\\n', (v) => `${v}\r\n`],
      ['embedded \\n', (v) => `${v.slice(0, 2)}\n${v.slice(2)}`],
      ['a bare \\r smuggling Bcc:', (v) => `${v}\rBcc: evil@evil.example`],
    ];
    for (const field of fields) {
      for (const [posLabel, inject] of positions) {
        const base = field === 'Subject' || field === 'Message-ID' || field === 'References' ? 'hello world' : 'alice@example.org';
        const headers = { From: 'alice@example.org', Subject: 'hi' };
        headers[field] = inject(base);
        draftCalls.length = 0;
        const services = fakeReplyServices({ headers: hdrs(headers) });
        const { registry } = makeRegistry({ services });
        await assert.rejects(
          () => registry.callTool('create_reply_draft', { id: 'm1', body: 'b' }),
          (err) => err.message === REPLY_REFUSAL_INPUT,
          `[AUD-D5] ${field} with ${posLabel}: step 1's fixed refusal message, not assertHeaderSafe's`
        );
        assert.equal(services.called('gmail.users.drafts.create').length, 0, `[AUD-D5] ${field} with ${posLabel}: zero drafts.create calls`);
        assert.equal(draftCalls.length, 0, `[AUD-D5] ${field} with ${posLabel}: buildMime never invoked (draft, its only caller, never ran)`);
      }
    }

    // A CR/LF in Subject beyond character 512 (no truncation exists to hide it behind).
    {
      const services = fakeReplyServices({ headers: hdrs({ From: 'alice@example.org', Subject: `${'x'.repeat(520)}\r\nBcc: evil@evil.example` }) });
      const { registry } = makeRegistry({ services });
      draftCalls.length = 0;
      await assert.rejects(
        () => registry.callTool('create_reply_draft', { id: 'm1', body: 'b' }),
        (err) => err.message === REPLY_REFUSAL_INPUT,
        '[AUD-D5] a CR/LF in Subject beyond character 512: step 1 still refuses'
      );
      assert.equal(services.called('gmail.users.drafts.create').length, 0, '[AUD-D5] beyond-512 CR/LF: zero drafts.create calls');
      assert.equal(draftCalls.length, 0, '[AUD-D5] beyond-512 CR/LF: buildMime never invoked (draft, its only caller, never ran)');
    }

    // A CR/LF in a header step 2 will not select (From, when Reply-To has content).
    {
      const services = fakeReplyServices({ headers: hdrs({ 'Reply-To': 'reply@example.org', From: 'alice@example.org\r\nBcc: evil@evil.example', Subject: 'hi' }) });
      const { registry } = makeRegistry({ services });
      draftCalls.length = 0;
      await assert.rejects(
        () => registry.callTool('create_reply_draft', { id: 'm1', body: 'b' }),
        (err) => err.message === REPLY_REFUSAL_INPUT,
        '[AUD-D5] a CR/LF in From, which step 2 would not select: step 1 still scans and refuses it'
      );
      assert.equal(services.called('gmail.users.drafts.create').length, 0, '[AUD-D5] unselected-field CR/LF: zero drafts.create calls');
      assert.equal(draftCalls.length, 0, '[AUD-D5] unselected-field CR/LF: buildMime never invoked (draft, its only caller, never ran)');
    }
  } finally {
    gmail.draft = originalDraft;
  }
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
