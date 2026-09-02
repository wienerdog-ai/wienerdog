'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

// A NON-ASSERTION THROW. Under the greeting mutation this test fails with
// `code: ERR_TEST_FAILURE`, not `ERR_ASSERTION` — the same `failureType` an
// assertion failure carries, which is why the CODE is what decides.
test('fixture kinds: throws rather than asserts', () => {
  if (subject.greeting !== 'hello') throw new Error('RP-SIGNAL-THROWN');
  assert.ok(true);
});

// Observed as a terminal SKIP, never as a PASS.
test('fixture kinds: skipped', { skip: 'RP fixture: always skipped' }, () => {
  assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-SKIPPED');
});
