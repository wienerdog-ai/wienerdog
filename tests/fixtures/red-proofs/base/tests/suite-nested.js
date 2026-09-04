'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

// A DECLARED CHILD and a PEER under ONE parent. Mutating `shared` reddens both,
// so declaring only the child is an unlisted OWN-BODY failure (FAILED), while
// declaring both leaves the parent's `subtestsFailed` as attributable
// propagation (PROVEN).
test('fixture nest: outer', async (t) => {
  await t.test('inner-declared', () => {
    assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-NESTED');
  });
  await t.test('inner-peer', () => {
    assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-PEER');
  });
});
