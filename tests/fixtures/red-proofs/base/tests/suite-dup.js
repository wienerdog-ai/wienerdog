'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

// TWO NESTED TESTS SHARING A NAME. Their hierarchical identities are
// indistinguishable, so a declaration naming one is ambiguous and the runner
// refuses rather than picking one.
test('fixture dup: outer', async (t) => {
  await t.test('twin', () => {
    assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-TWIN-A');
  });
  await t.test('twin', () => {
    assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-TWIN-B');
  });
});
