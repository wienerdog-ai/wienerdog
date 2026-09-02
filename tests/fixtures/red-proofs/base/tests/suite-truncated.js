'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

// A CHILD THAT DIES AFTER EMITTING THE DECLARED FAILURE. The first test reddens
// exactly as declared; the second then tears the process down, so the TAP stream
// stops before its plan and summary. Every declared `not ok` is present and the
// equality rule would be satisfied on the fragment — which is why RED must
// refuse a run it did not see the end of.
test('fixture trunc: the greeting is hello', () => {
  assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
});

test('fixture trunc: cut the reporter off once the subject is mutated', () => {
  if (subject.greeting !== 'hello') process.exit(3);
  assert.ok(true);
});
