'use strict';

/**
 * The ONE strict flat-frontmatter parser (audit A4, ADR-0022). NOT a YAML parser:
 * it reads a leading `---`…`---` block of top-level `key: value` scalars. It is
 * the single lexer every security-bearing note read must use, so a byte sequence
 * accepted as trusted at commit is never interpreted differently by the digest.
 * Never replace this with a YAML library — YAML's interpretation flexibility is
 * the attack surface (ADR-0022).
 *
 * Strictness — FORMATTING-TOLERANT on the separator/surrounding whitespace,
 * STRICT on value semantics and block structure (a security-bearing consumer
 * treats a malformed block as fail-closed):
 *  - The block MUST open with a line that is exactly `---` as the FIRST line and
 *    close with a later line that is exactly `---`. Missing open / missing close
 *    → { delimited:false } (no frontmatter present).
 *  - Between the delimiters: blank lines and lines whose first non-space char is
 *    `#` are ignored. Every OTHER line must be a top-level `key: value` line
 *    matching /^([A-Za-z0-9_-]+):[ \t]*(.*)$/ with NO leading whitespace. The
 *    space after the colon is OPTIONAL — `key:value` is accepted (owner decision
 *    2026-07-17: a missing separator space is a trivial formatting slip, not a
 *    trust anomaly). Any line that does not match (an indented line, a list
 *    item, junk) sets malformed = true.
 *  - A duplicate top-level key sets malformed = true (the first value is kept).
 *  - The stored value has SURROUNDING whitespace removed: leading spaces/tabs
 *    are consumed by the separator, trailing spaces/tabs and a trailing `\r`
 *    (CRLF tolerance) are stripped. INTERIOR content, quotes, and `#` are
 *    preserved verbatim — no comment stripping, no quote removal. Typed reads
 *    are done by the accessors below, which fail closed on any non-exact value.
 */

/**
 * @param {string} text
 * @returns {{delimited: boolean, malformed: boolean, fields: Map<string,string>, body: string}}
 *   delimited=false → no `---…---` block; fields empty, body = the whole text.
 *   ok-to-trust for a security consumer = delimited && !malformed (see readBool).
 */
function parse(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return { delimited: false, malformed: false, fields: new Map(), body: text };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { delimited: false, malformed: false, fields: new Map(), body: text };
  /** @type {Map<string, string>} */
  const fields = new Map();
  let malformed = false;
  for (const raw of lines.slice(1, end)) {
    // CRLF tolerance: strip one trailing \r before lexing (JS `.` never matches \r,
    // so a CRLF field line would otherwise read as junk).
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
    if (!m) {
      malformed = true;
      continue;
    }
    if (fields.has(m[1])) {
      malformed = true; // duplicate key; first value kept
      continue;
    }
    fields.set(m[1], m[2].replace(/[ \t\r]+$/, ''));
  }
  return { delimited: true, malformed, fields, body: lines.slice(end + 1).join('\n') };
}

/** Sentinel: the field is present but its value is not an exact literal of the
 *  requested type (quoted, case-varied, commented, or junk). A security consumer
 *  treats INVALID exactly like `true` — i.e. untrusted / fail closed. (A
 *  whitespace-padded `true`/`false` is NOT INVALID: the separator + trailing-trim
 *  normalize it to the exact literal — see parse.) */
const INVALID = Symbol('frontmatter.invalid');

/**
 * Typed boolean read. Fails closed on any non-exact form.
 * @param {Map<string,string>} fields
 * @param {string} key
 * @returns {true|false|undefined|typeof INVALID}
 *   undefined = key absent; false = stored value is exactly `false`; true =
 *   exactly `true`; INVALID = present but anything else (`True`, `TRUE`,
 *   `"true"`, `'false'`, `true # x`, `1`, ``).
 */
function readBool(fields, key) {
  if (!fields.has(key)) return undefined;
  const raw = fields.get(key);
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  return INVALID;
}

/**
 * Typed number read. Fails closed on any non-canonical numeric form.
 * @param {Map<string,string>} fields
 * @param {string} key
 * @returns {number|undefined|typeof INVALID}
 *   undefined = absent; a finite number when the stored value is an exact
 *   decimal (optional leading `-`, digits, optional single `.` + digits) with no
 *   quotes/comment/exponent; INVALID otherwise.
 */
function readNumber(fields, key) {
  if (!fields.has(key)) return undefined;
  const raw = fields.get(key);
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return INVALID;
  return Number(raw);
}

module.exports = { parse, readBool, readNumber, INVALID };
