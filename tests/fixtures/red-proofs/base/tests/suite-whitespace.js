'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

// LEGAL NAMES THAT END — OR BEGIN — IN WHITESPACE. Node's TAP reporter preserves
// them verbatim (measured on v25.9.0 and v20.20.2), so an identity that is
// trimmed on the observed side but not on the declared side stops matching, and
// `'case '` and `'case'` collapse onto one identity and read as ambiguous.
// All three observe the same value, so one mutation reddens all three and the
// equality rule is what decides.
test('case ', () => {
  assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-TRAILING-SPACE');
});

test('case', () => {
  assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-BARE');
});

test('  padded  ', () => {
  assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-PADDED');
});
