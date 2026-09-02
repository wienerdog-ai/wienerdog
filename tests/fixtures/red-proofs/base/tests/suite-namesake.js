'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

// TOP-LEVEL TESTS NAMED LIKE THE SUITE ITSELF — legal, and previously invisible.
// A wrapper-detection rule keyed on the NAME alone classified these as the
// reporter's file record and replaced them with their children; being leaves,
// they had none, so they were dropped from the identity set entirely. An
// undeclared own-body failure in one of them then vanished from RED's equality
// rule and the proof reported PROVEN (PR #204 round 3).
//
// All three assertions observe the SAME value, so one mutation reddens all three
// and the equality rule is what decides.
test('tests/suite-namesake.js', () => {
  assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-NAMESAKE-PATH');
});

test('suite-namesake.js', () => {
  assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-NAMESAKE-BASE');
});

test('fixture namesake: the declared test', () => {
  assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-GREETING');
});
