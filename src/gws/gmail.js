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
 * @param {{to:string, subject:string, body:string, threadId?:string,
 *   inReplyTo?:string, references?:string}} opts
 * @returns {Promise<{draftId:string, messageId:string}>}
 */
async function draft(services, opts) {
  const raw = buildMime(opts);
  const message = opts.threadId ? { raw, threadId: opts.threadId } : { raw };
  const res = await services.gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message },
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
 * @param {{to:string, subject:string, body:string, from?:string,
 *   inReplyTo?:string, references?:string}} m
 * @returns {string}
 */
function buildMime(m) {
  const lines = [];
  if (m.from) lines.push(`From: ${assertHeaderSafe(m.from, 'From')}`);
  lines.push(`To: ${assertHeaderSafe(m.to, 'To')}`);
  lines.push(`Subject: ${assertHeaderSafe(m.subject, 'Subject')}`);
  if (m.inReplyTo) lines.push(`In-Reply-To: ${assertHeaderSafe(m.inReplyTo, 'In-Reply-To')}`);
  if (m.references) lines.push(`References: ${assertHeaderSafe(m.references, 'References')}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('');
  lines.push(m.body);           // body unchanged — content, not a header
  const mime = lines.join('\r\n');
  return Buffer.from(mime).toString('base64url');
}

// ---------------------------------------------------- create_reply_draft

/** Table B step 0/1: the five raw metadata headers a reply draft derives from. */
const REPLY_METADATA_HEADERS = ['Reply-To', 'From', 'Subject', 'Message-ID', 'References'];

/** Table B step 0's bound — characters, not octets (owner item 8). */
const RAW_VALUE_MAX_CHARS = 998;

/** Table B step 4's bound on the captured address. Deliberately NOT pinned by
 *  the spec between code points and UTF-16 code units — this implementation
 *  reads it as `.length` (UTF-16 code units), the simpler of the two (recorded
 *  under "Decisions made"). */
const ADDRESS_MAX_CHARS = 320;

/** Table B step 7's bound — UTF-8 octets, ruled by the owner 2026-09-05. */
const OUTPUT_LINE_MAX_OCTETS = 998;

/** Table B step 3's single-mailbox grammar, derived from the ABNF (Exact
 *  contracts). ATEXT excludes whitespace and SPECIALS; DLABEL additionally
 *  excludes "." so the domain's dot structure is deterministic. */
const BARE_RE = /^([^\s<>,;:"\\@[\]()]+@[^\s<>,;:"\\@[\]().]+(?:\.[^\s<>,;:"\\@[\]().]+)+)$/;
const MAILBOX_RE =
  /^(?:(?:[^\s<>,;:"\\@()]|[ \t]|"(?:[^"\\\r\n]|\\.)*")+)?<[ \t]*([^\s<>,;:"\\@[\]()]+@[^\s<>,;:"\\@[\]().]+(?:\.[^\s<>,;:"\\@[\]().]+)+)[ \t]*>$/;

/** Table B's "content" predicate — the prescribed linear form (R4-B ruling):
 *  one character class, no quantifier, no alternation. @param {string} v */
const hasContent = (v) => /[^ \t]/.test(v);

/** Horizontal-whitespace-only trim ([ \t]), never CR/LF (step 1 already
 *  refused any). @param {string} v @returns {string} */
const trimHorizontal = (v) => v.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');

const REPLY_REFUSAL_INPUT = 'could not determine one reply address on that message — no draft was created';
const REPLY_REFUSAL_OUTPUT = "the reply's headers would be too long to send — no draft was created";

/**
 * Derive a reply's recipient, subject and threading from the message it
 * replies to — Table B's steps 0 through 7, in that order. Reads only the
 * fetched message; the verb's own arguments never reach this function except
 * WHICH message is fetched.
 * @param {{gmail:object}} services
 * @param {{id:string}} opts
 * @returns {Promise<{to:string, subject:string, threadId:string,
 *   inReplyTo:string, references:string}>}
 */
async function replyTarget(services, opts) {
  let res;
  try {
    res = await services.gmail.users.messages.get({
      userId: 'me',
      id: opts.id,
      format: 'metadata',
      metadataHeaders: REPLY_METADATA_HEADERS,
    });
  } catch {
    throw new WienerdogError(REPLY_REFUSAL_INPUT);
  }
  const data = res.data || {};
  const headers = (data.payload && data.payload.headers) || [];
  const threadId = data.threadId || '';

  const rawReplyTo = header(headers, 'Reply-To');
  const rawFrom = header(headers, 'From');
  const rawSubject = header(headers, 'Subject');
  const rawMessageId = header(headers, 'Message-ID');
  const rawReferences = header(headers, 'References');
  const raw = [rawReplyTo, rawFrom, rawSubject, rawMessageId, rawReferences];

  // Step 0 — THE BOUND, first, on every raw value, whether or not a later
  // step uses it: no operation whose cost grows with input length runs
  // before this.
  for (const v of raw) {
    if (v.length > RAW_VALUE_MAX_CHARS) throw new WienerdogError(REPLY_REFUSAL_INPUT);
  }

  // Step 1 — CR/LF, on the raw values, before any trim.
  for (const v of raw) {
    if (/[\r\n]/.test(v)) throw new WienerdogError(REPLY_REFUSAL_INPUT);
  }

  // Step 2 — recipient selection: Reply-To when it has content, else From.
  const selected = hasContent(rawReplyTo) ? rawReplyTo : rawFrom;
  if (!hasContent(selected)) throw new WienerdogError(REPLY_REFUSAL_INPUT);

  // Step 3 — grammar, on the horizontally trimmed selected value.
  const trimmedSelected = trimHorizontal(selected);
  const match = BARE_RE.exec(trimmedSelected) || MAILBOX_RE.exec(trimmedSelected);
  if (!match) throw new WienerdogError(REPLY_REFUSAL_INPUT);
  const address = match[1];

  // Step 4 — address bound.
  if (address.length > ADDRESS_MAX_CHARS) throw new WienerdogError(REPLY_REFUSAL_INPUT);

  // Step 5 — subject: derived, never truncated. A fixed point: empty stays
  // empty, and an already-`Re:`-prefixed subject is left unchanged.
  const trimmedSubject = trimHorizontal(rawSubject);
  const subject = trimmedSubject === '' ? '' : /^re:/i.test(trimmedSubject) ? trimmedSubject : `Re: ${trimmedSubject}`;

  // Step 6 — threading: no Message-ID means both reply headers are omitted.
  let inReplyTo = '';
  let references = '';
  if (rawMessageId) {
    inReplyTo = rawMessageId;
    references = rawReferences ? `${rawReferences} ${rawMessageId}` : rawMessageId;
  }

  // Step 7 — THE OUTPUT BOUND: every header line this verb would have
  // buildMime emit, except the fixed Content-Type, must be ≤998 UTF-8 octets.
  const outputLines = [`To: ${address}`, `Subject: ${subject}`];
  if (inReplyTo) outputLines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) outputLines.push(`References: ${references}`);
  for (const line of outputLines) {
    if (Buffer.byteLength(line, 'utf8') > OUTPUT_LINE_MAX_OCTETS) {
      throw new WienerdogError(REPLY_REFUSAL_OUTPUT);
    }
  }

  return { to: address, subject, threadId, inReplyTo, references };
}

module.exports = { search, read, draft, buildMime, replyTarget };
