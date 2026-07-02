'use strict';

/**
 * Gmail verb functions. Each takes `(services, opts)` and returns plain data;
 * they perform no console I/O (that is index.js's job). `services` is the
 * object from getServices; tests pass a stub with just the methods used.
 */

/**
 * Pull a header value (case-insensitive) from a Gmail headers array.
 * @param {Array<{name:string,value:string}>} headers
 * @param {string} name
 * @returns {string}
 */
function header(headers, name) {
  const lower = name.toLowerCase();
  const hit = (headers || []).find((h) => h.name.toLowerCase() === lower);
  return hit ? hit.value : '';
}

/**
 * Decode a base64url string (Gmail body encoding) to a UTF-8 string.
 * @param {string} data
 * @returns {string}
 */
function decodeBody(data) {
  return Buffer.from(data, 'base64url').toString('utf8');
}

/**
 * Depth-first search a payload tree for the first text/plain body.
 * @param {object} payload
 * @returns {string|null}
 */
function findPlainText(payload) {
  if (!payload) return null;
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBody(payload.body.data);
  }
  for (const part of payload.parts || []) {
    const found = findPlainText(part);
    if (found !== null) return found;
  }
  return null;
}

/**
 * gmail search — list message headers matching a Gmail query.
 * @param {{gmail:object}} services
 * @param {{query:string, max?:number}} opts
 * @returns {Promise<Array<{id:string, threadId:string, from:string,
 *   subject:string, date:string, snippet:string}>>}
 */
async function search(services, opts) {
  const listRes = await services.gmail.users.messages.list({
    userId: 'me',
    q: opts.query,
    maxResults: opts.max || 20,
  });
  const messages = (listRes.data && listRes.data.messages) || [];
  const out = [];
  for (const m of messages) {
    const res = await services.gmail.users.messages.get({
      userId: 'me',
      id: m.id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });
    const data = res.data || {};
    const headers = (data.payload && data.payload.headers) || [];
    out.push({
      id: data.id || m.id,
      threadId: data.threadId || m.threadId,
      from: header(headers, 'From'),
      subject: header(headers, 'Subject'),
      date: header(headers, 'Date'),
      snippet: data.snippet || '',
    });
  }
  return out;
}

/**
 * gmail read — full plaintext of one message.
 * @param {{gmail:object}} services
 * @param {{id:string}} opts
 * @returns {Promise<{id:string, from:string, to:string, subject:string,
 *   date:string, body:string}>}
 */
async function read(services, opts) {
  const res = await services.gmail.users.messages.get({
    userId: 'me',
    id: opts.id,
    format: 'full',
  });
  const data = res.data || {};
  const headers = (data.payload && data.payload.headers) || [];
  const body = findPlainText(data.payload);
  return {
    id: data.id || opts.id,
    from: header(headers, 'From'),
    to: header(headers, 'To'),
    subject: header(headers, 'Subject'),
    date: header(headers, 'Date'),
    body: body !== null ? body : data.snippet || '',
  };
}

/**
 * gmail draft — create a draft (NO send; safe, ungated).
 * @param {{gmail:object}} services
 * @param {{to:string, subject:string, body:string}} opts
 * @returns {Promise<{draftId:string, messageId:string}>}
 */
async function draft(services, opts) {
  const raw = buildMime(opts);
  const res = await services.gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw } },
  });
  const data = res.data || {};
  return {
    draftId: data.id || '',
    messageId: (data.message && data.message.id) || '',
  };
}

/**
 * gmail send — grant-gated (ADR-0007). Sends ONLY under a matching send grant;
 * otherwise degrades to a draft + notice (never throws for a missing grant).
 * @param {{gmail:object}} services
 * @param {{to:string, subject:string, body:string, routine:string|null,
 *          paths:import('../core/paths').WienerdogPaths}} opts
 * @returns {Promise<{sent:boolean, degraded:boolean, draftId?:string,
 *   messageId?:string, notice?:string}>}
 */
async function send(services, opts) {
  const { findGrant, isSendAllowed } = require('./grant');
  const recipients = String(opts.to)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const routine = opts.routine || null;
  const grant = findGrant(opts.paths, routine);
  const decision = isSendAllowed(grant, recipients);

  if (decision.allowed) {
    const raw = buildMime(opts);
    const res = await services.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    return { sent: true, degraded: false, messageId: (res.data && res.data.id) || '' };
  }

  // Fail-safe, fail-visible: no/insufficient grant → draft instead of send.
  const d = await draft(services, opts);
  return {
    sent: false,
    degraded: true,
    draftId: d.draftId,
    messageId: d.messageId,
    notice:
      `No matching send grant (${decision.reason}); saved a draft instead. ` +
      'Run: wienerdog grant send --routine <name> --to <recipients>',
  };
}

/**
 * Build an RFC-2822 message, base64url-encoded (no padding, '+/'→'-_').
 * Exported for reuse by gmail send (WP-018).
 * @param {{to:string, subject:string, body:string, from?:string}} m
 * @returns {string}
 */
function buildMime(m) {
  const lines = [];
  if (m.from) lines.push(`From: ${m.from}`);
  lines.push(`To: ${m.to}`);
  lines.push(`Subject: ${m.subject}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('');
  lines.push(m.body);
  const mime = lines.join('\r\n');
  return Buffer.from(mime).toString('base64url');
}

module.exports = { search, read, draft, send, buildMime };
