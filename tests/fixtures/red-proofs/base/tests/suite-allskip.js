'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

// ZERO TESTS RAN, reported the way Node 20 reports an unmatched
// `--test-name-pattern`: every record is `ok N - <name> # SKIP`, the process
// exits 0, and no `not ok` appears anywhere. This fixture reproduces that shape
// natively on ANY Node, so the runner's rule can be exercised on a machine whose
// Node emits the other shape.
test('fixture allskip: the greeting is hello', { skip: 'RP fixture: never runs' }, () => {
  assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
});

test('fixture allskip: the arity is two', { skip: 'RP fixture: never runs' }, () => {
  assert.equal(subject.arity, 2, 'RP-SIGNAL-ARITY');
});
