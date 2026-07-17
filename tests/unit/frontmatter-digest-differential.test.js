'use strict';

// Audit A4 differential gate: the digest-side strict parser and the dream
// validator must give the SAME trust classification to every byte form of the
// security field — "no byte sequence is accepted as trusted at commit and
// interpreted differently by the digest" (ADR-0022).

const test = require('node:test');
const assert = require('node:assert/strict');

const { parse, readBool } = require('../../src/core/frontmatter');
const { parseFrontmatter } = require('../../src/core/dream/validate');

// Values that must classify as trusted on BOTH sides: exactly the forms that
// normalize to the boolean `false` (exact + whitespace-padded — the separator
// and trailing-trim restore parity with the old validator's `:\s*` + trim).
// Everything else (padded `true` included, since it normalizes to exact `true`)
// is not-trusted on both sides.
const CORPUS = ['false', 'true', 'True', 'TRUE', 'False', '"true"', "'false'",
  ' true', ' false', 'false ', 'true ', 'true # note', 'no', '0', '1', 'yes',
  'FALSE', ''];
const TRUSTED = new Set(['false', ' false', 'false ']);

/** @param {string} noteText @returns {boolean} digest-side: trusted iff provably false */
function digestTrusts(noteText) {
  return readBool(parse(noteText).fields, 'derived_from_untrusted') === false;
}

/** @param {string} noteText @returns {boolean} validator-side: trusted iff boolean false */
function validatorTrusts(noteText) {
  return parseFrontmatter(noteText).derived_from_untrusted === false;
}

test('digest and validator agree on the trust classification of every corpus byte form', () => {
  for (const v of CORPUS) {
    const noteText = `---\nderived_from_untrusted: ${v}\n---\nbody`;
    const d = digestTrusts(noteText);
    const val = validatorTrusts(noteText);
    assert.equal(d, val, `digest and validator disagree on ${JSON.stringify(v)}`);
    assert.equal(d, TRUSTED.has(v), `unexpected classification for ${JSON.stringify(v)}`);
  }
});

test('a no-separator-space line agrees on both sides', () => {
  const trusted = '---\nderived_from_untrusted:false\n---\nbody';
  assert.equal(digestTrusts(trusted), true);
  assert.equal(validatorTrusts(trusted), true);
  const untrusted = '---\nderived_from_untrusted:true\n---\nbody';
  assert.equal(digestTrusts(untrusted), false);
  assert.equal(validatorTrusts(untrusted), false);
});
