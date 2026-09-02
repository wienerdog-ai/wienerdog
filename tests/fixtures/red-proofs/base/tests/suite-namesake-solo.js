'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

// THE SAME SHAPE AS THE SOLE ROOT, which is where a `roots.length === 1` rule
// alone would still unwrap. Its subtest carries the declared identity, so under
// a wrapper rule the declaration's nested path matches nothing at all and the
// lane is inoperative; kept, both identities are observed.
test('tests/suite-namesake-solo.js', async (t) => {
  await t.test('the declared subtest', () => {
    assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-GREETING');
  });
  assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-NAMESAKE-OWN-BODY');
});
