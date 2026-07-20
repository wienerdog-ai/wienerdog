'use strict';

const { WienerdogError } = require('../core/errors');

/**
 * Gmail verb functions. Each takes `(services, opts)` and returns plain data;
 * they perform no console I/O (that is index.js's job). `services` is the
 * object from getServices; tests pass a stub with just the methods used.
 */

/** Reject a header field value that contains a CR or LF (RFC-2822 header
 *  injection — a bare/paired CR/LF would smuggle an extra header such as Bcc:,
 *  defeating the send-grant allowlist, ADR-0007). Header fields are single-line
 *  by construction (addresses, a subject); a legitimate value never contains a
 *  line break, so rejecting is safe and is the fail-closed choice.
 *  @param {string} value @param {string} field  e.g. 'Subject'
 *  @returns {string} the value unchanged when safe; throws otherwise. */
function assertHeaderSafe(value, field) {
  if (/[\r\n]/.test(String(value))) {
    throw new WienerdogError(`refusing to build email: ${field} contains a line break (possible header injection)`);
  }
  return String(value);
}

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
 * Build an RFC-2822 message, base64url-encoded (no padding, '+/'→'-_').
 * Exported for reuse by the broker send verb and `_alert` (WP-018).
 * @param {{to:string, subject:string, body:string, from?:string}} m
 * @returns {string}
 */
function buildMime(m) {
  const lines = [];
  if (m.from) lines.push(`From: ${assertHeaderSafe(m.from, 'From')}`);
  lines.push(`To: ${assertHeaderSafe(m.to, 'To')}`);
  lines.push(`Subject: ${assertHeaderSafe(m.subject, 'Subject')}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('');
  lines.push(m.body);           // body unchanged — content, not a header
  const mime = lines.join('\r\n');
  return Buffer.from(mime).toString('base64url');
}

module.exports = { search, read, draft, buildMime };
