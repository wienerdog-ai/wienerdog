'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

// A NAMESAKE PARENT **WITH SUBTESTS**, whose OWN BODY reddens. Measured: no
// reporter file wrapper ever carries children, so this is unambiguously a test —
// but a rule that took "matches the suite name AND has children" for a wrapper
// replaced it with its subtests, and because THEY stay green the parent's own
// undeclared red vanished from RED's equality set. The proof then reported
// PROVEN (PR #204 round 6).
test('tests/suite-namesake-nested.js', async (t) => {
  await t.test('inner-one', () => { assert.ok(true); });
  await t.test('inner-two', () => { assert.ok(true); });
  // The parent's OWN body — this is the failure a wrapper rule would swallow.
  assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-NAMESAKE-OWN-BODY');
});

test('fixture nested-namesake: the declared test', () => {
  assert.equal(subject.shared, 'shared-ok', 'RP-SIGNAL-GREETING');
});
