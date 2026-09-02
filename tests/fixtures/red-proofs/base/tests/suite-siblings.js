'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

// TWO parents. Declaring a child of the first leaves the SECOND parent's
// `subtestsFailed` propagation unattributable to any declared descendant —
// which is an ERROR, not a FAILED.
test('fixture sib: outer-one', async (t) => {
  await t.test('inner-one', () => {
    assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-SIB-ONE');
  });
});

test('fixture sib: outer-two', async (t) => {
  await t.test('inner-two', () => {
    assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-SIB-TWO');
  });
});
