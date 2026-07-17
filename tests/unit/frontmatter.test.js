'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parse, readBool, readNumber, INVALID } = require('../../src/core/frontmatter');

/** Build a note with the given frontmatter block body. */
function note(fmBody, body = 'body text') {
  return `---\n${fmBody}\n---\n${body}`;
}

test('parse: text without a frontmatter block is not delimited; body is the whole text', () => {
  const r = parse('no frontmatter here');
  assert.equal(r.delimited, false);
  assert.equal(r.malformed, false);
  assert.equal(r.fields.size, 0);
  assert.equal(r.body, 'no frontmatter here');
});

test('parse: an unclosed block is not delimited; body is the whole text', () => {
  const text = '---\na: 1\n(no closing)';
  const r = parse(text);
  assert.equal(r.delimited, false);
  assert.equal(r.fields.size, 0);
  assert.equal(r.body, text);
});

test('parse: the opening --- must be the FIRST line', () => {
  const text = '\n---\na: 1\n---\nbody';
  const r = parse(text);
  assert.equal(r.delimited, false);
  assert.equal(r.body, text);
});

test('parse: basic key: value fields', () => {
  const r = parse(note('a: 1\nb: two'));
  assert.equal(r.delimited, true);
  assert.equal(r.malformed, false);
  assert.equal(r.fields.get('a'), '1');
  assert.equal(r.fields.get('b'), 'two');
  assert.equal(r.body, 'body text');
});

test('parse: key:value with NO separator space is accepted (not malformed)', () => {
  const r = parse(note('a:1'));
  assert.equal(r.malformed, false);
  assert.equal(r.fields.get('a'), '1');
});

test('parse: separator absorbs leading value padding; trailing whitespace is stripped', () => {
  // Leading pad: `key:  true` lexes to the exact literal.
  const lead = parse(note('derived_from_untrusted:  true'));
  assert.equal(lead.fields.get('derived_from_untrusted'), 'true');
  // Trailing pad: `key: false ` (trailing space) lexes to the exact literal.
  const trail = parse(note('derived_from_untrusted: false '));
  assert.equal(trail.fields.get('derived_from_untrusted'), 'false');
  // CRLF tolerance: a trailing \r on the value line is stripped.
  const crlf = parse('---\na: 1\r\n---\nbody');
  assert.equal(crlf.fields.get('a'), '1');
});

test('parse: interior content, quotes, and # are preserved verbatim (no comment/quote stripping)', () => {
  const r = parse(note('a: value # not-a-comment'));
  assert.equal(r.fields.get('a'), 'value # not-a-comment');
  const q = parse(note('b: "quoted"'));
  assert.equal(q.fields.get('b'), '"quoted"');
});

test('parse: blank lines and comment lines inside the block are ignored', () => {
  const r = parse(note('# a comment\n\na: 1'));
  assert.equal(r.malformed, false);
  assert.equal(r.fields.get('a'), '1');
});

test('parse: an indented line sets malformed', () => {
  const r = parse(note('a: 1\n  nested: x'));
  assert.equal(r.malformed, true);
  assert.equal(r.fields.get('a'), '1');
});

test('parse: a duplicate top-level key sets malformed; the FIRST value is kept', () => {
  const r = parse(note('a: 1\na: 2'));
  assert.equal(r.malformed, true);
  assert.equal(r.fields.get('a'), '1');
});

test('parse: junk lines (list item, no colon) set malformed', () => {
  assert.equal(parse(note('- list item')).malformed, true);
  assert.equal(parse(note('just some junk')).malformed, true);
});

test('readBool: exact literals, absent, and every other form is INVALID', () => {
  const fields = (v) => parse(note(`flag: ${v}`)).fields;
  assert.equal(readBool(fields('false'), 'flag'), false);
  assert.equal(readBool(fields('true'), 'flag'), true);
  assert.equal(readBool(new Map(), 'flag'), undefined);
  for (const v of ['True', 'TRUE', '"true"', "'false'", 'true # x', '1', 'yes', 'no']) {
    assert.equal(readBool(fields(v), 'flag'), INVALID, `expected INVALID for ${JSON.stringify(v)}`);
  }
  // Empty value → INVALID (present but not a boolean literal).
  assert.equal(readBool(parse(note('flag:')).fields, 'flag'), INVALID);
  // Whitespace-padded booleans never reach readBool as padded — parse normalized them.
  assert.equal(readBool(fields(' true'), 'flag'), true);
  assert.equal(readBool(parse(note('flag: false ')).fields, 'flag'), false);
});

test('readNumber: exact decimals only; everything else is INVALID', () => {
  const fields = (v) => parse(note(`n: ${v}`)).fields;
  assert.equal(readNumber(fields('42'), 'n'), 42);
  assert.equal(readNumber(fields('-3.5'), 'n'), -3.5);
  assert.equal(readNumber(fields('0'), 'n'), 0);
  assert.equal(readNumber(new Map(), 'n'), undefined);
  for (const v of ['1e3', '"1"', '1 # x', '1.2.3', 'NaN', '0.9x', '.5', '1.']) {
    assert.equal(readNumber(fields(v), 'n'), INVALID, `expected INVALID for ${JSON.stringify(v)}`);
  }
  assert.equal(readNumber(parse(note('n:')).fields, 'n'), INVALID);
});
