'use strict';

// The frozen broker verb table (WP-137, ADR-0026 §2, D-VERB-SET): the ONE
// place a broker verb is defined. Every verb maps to exactly one named Google
// API method — no generic send, no delete/update, no arbitrary URL. Read
// verbs reuse the existing pure `(services, opts)` functions; only the send
// path is new (server-side self-resolve; gmail.js `send` is CLI-grant-coupled
// and is deliberately NOT called here).
//
// `apiMethod` is the exact human-readable Google method for docs/evidence and
// the unit-test assertion; the handler calls exactly that method.

const gmail = require('../gmail');
const calendar = require('../calendar');
const drive = require('../drive');
const { CAPABILITY_CLASS } = require('./constants');
const { capBytes } = require('./limits');
const { WienerdogError } = require('../../core/errors');

const KB = 1024;
const NO_CRLF = '^[^\\r\\n]*$';

/**
 * Wrap a plain term as a Drive full-text query with `\` and `'` escaped
 * (single-quoted Drive string literal); `raw:true` passes the term as literal
 * Drive query language. Duplicated from drive.js's un-exported helper — the
 * WP-137 spec lists `buildDriveQuery` as reusable, but drive.js does not
 * export it and is outside this WP's deliverables (recorded as a spec bug).
 * @param {string} term @param {{raw?: boolean}} [opts] @returns {string}
 */
function buildDriveQuery(term, opts = {}) {
  if (opts.raw) return term;
  const escaped = term.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `fullText contains '${escaped}'`;
}
const ISO_TS = '^\\d{4}-\\d{2}-\\d{2}([T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:?\\d{2})?)?$';

/** Exported for drive.js reuse assertion parity in tests. */
const VERBS = Object.freeze({
  gmail_search: Object.freeze({
    name: 'gmail_search',
    capabilityClass: CAPABILITY_CLASS.READ,
    description: 'Search Gmail messages; returns id/from/subject/date/snippet per hit.',
    service: 'gmail',
    apiMethod: 'gmail.users.messages.list (+ per-hit messages.get metadata)',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', maxLength: 512 },
        max: { type: 'integer', min: 1, max: 20 },
      },
    },
    limits: { maxCallsPerRun: 50 },
    handler: (services, args) => gmail.search(services, { query: args.query, max: args.max }),
  }),

  gmail_read: Object.freeze({
    name: 'gmail_read',
    capabilityClass: CAPABILITY_CLASS.READ,
    description: 'Read one Gmail message as plaintext (body capped at 64 KB).',
    service: 'gmail',
    apiMethod: 'gmail.users.messages.get (format full)',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string', maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' } },
    },
    limits: { maxCallsPerRun: 50, maxResultBytes: 64 * KB },
    handler: async (services, args) => {
      const msg = await gmail.read(services, { id: args.id });
      return { ...msg, body: capBytes(msg.body, 64 * KB) };
    },
  }),

  calendar_list: Object.freeze({
    name: 'calendar_list',
    capabilityClass: CAPABILITY_CLASS.READ,
    description: 'List upcoming events on the primary calendar.',
    service: 'calendar',
    apiMethod: 'calendar.events.list (primary)',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {
        from: { type: 'string', maxLength: 40, pattern: ISO_TS },
        to: { type: 'string', maxLength: 40, pattern: ISO_TS },
        max: { type: 'integer', min: 1, max: 20 },
      },
    },
    limits: { maxCallsPerRun: 50 },
    handler: (services, args) => calendar.list(services, { from: args.from, to: args.to, max: args.max }),
  }),

  calendar_show: Object.freeze({
    name: 'calendar_show',
    capabilityClass: CAPABILITY_CLASS.READ,
    description: "Show one primary-calendar event's details.",
    service: 'calendar',
    apiMethod: 'calendar.events.get (primary)',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string', maxLength: 1024 } },
    },
    limits: { maxCallsPerRun: 50 },
    handler: (services, args) => calendar.show(services, { id: args.id }),
  }),

  drive_search: Object.freeze({
    name: 'drive_search',
    capabilityClass: CAPABILITY_CLASS.READ,
    description: 'Search Drive files by full-text term (or raw Drive query with raw:true).',
    service: 'drive',
    apiMethod: 'drive.files.list',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['term'],
      properties: {
        term: { type: 'string', maxLength: 512 },
        raw: { type: 'boolean' },
        max: { type: 'integer', min: 1, max: 20 },
      },
    },
    limits: { maxCallsPerRun: 50 },
    handler: (services, args) =>
      drive.search(services, { query: buildDriveQuery(args.term, { raw: args.raw }), max: args.max }),
  }),

  drive_read: Object.freeze({
    name: 'drive_read',
    capabilityClass: CAPABILITY_CLASS.READ,
    description: 'Read one Drive file as text (capped at 256 KB).',
    service: 'drive',
    apiMethod: 'drive.files.get / drive.files.export',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string', maxLength: 128 } },
    },
    limits: { maxCallsPerRun: 50, maxResultBytes: 256 * KB },
    handler: async (services, args) => {
      const file = await drive.read(services, { id: args.id });
      return { ...file, text: capBytes(file.text, 256 * KB) };
    },
  }),

  create_draft: Object.freeze({
    name: 'create_draft',
    capabilityClass: CAPABILITY_CLASS.DRAFT,
    description: 'Create a Gmail draft (never sends).',
    service: 'gmail',
    apiMethod: 'gmail.users.drafts.create',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['to', 'subject', 'body'],
      properties: {
        to: { type: 'string', maxLength: 320, pattern: NO_CRLF },
        subject: { type: 'string', maxLength: 512, pattern: NO_CRLF },
        body: { type: 'string', maxLength: 64 * KB },
      },
    },
    limits: { maxCallsPerRun: 10 },
    handler: (services, args) => gmail.draft(services, { to: args.to, subject: args.subject, body: args.body }),
  }),

  send_digest_to_self: Object.freeze({
    name: 'send_digest_to_self',
    capabilityClass: CAPABILITY_CLASS.SEND,
    description:
      'Send a digest email to your OWN address (server-resolved; takes no recipient).',
    service: 'gmail',
    apiMethod: 'gmail.users.messages.send (recipient = server-resolved self)',
    // ZERO-address-input by construction (ADR-0026 §4): no to/cc/bcc field
    // exists; additionalProperties:false rejects any supplied address with
    // zero API calls.
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['subject', 'body'],
      properties: {
        subject: { type: 'string', maxLength: 512, pattern: NO_CRLF },
        body: { type: 'string', maxLength: 64 * KB },
      },
    },
    limits: { maxCallsPerRun: 2 },
    handler: async (services, args) => {
      // Self-resolve exactly like gws _alert: the authenticated account is the
      // ONLY possible recipient; no address ever comes from the arguments.
      const res = await services.gmail.users.getProfile({ userId: 'me' });
      const self = res && res.data && res.data.emailAddress;
      if (!self || !String(self).includes('@')) {
        throw new WienerdogError('could not determine your Google account address — digest not sent');
      }
      const raw = gmail.buildMime({ to: self, subject: args.subject, body: args.body });
      const sendRes = await services.gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
      return { sent: true, to: self, messageId: (sendRes.data && sendRes.data.id) || '' };
    },
  }),
});

module.exports = { VERBS };
