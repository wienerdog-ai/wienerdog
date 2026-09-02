'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

// THE SHADOW'S EXPLOIT. This file registers a NAMESAKE test only once the
// mutation has landed, so BASELINE and CONTROL register NOTHING and RED
// registers a real test that fails. A parser that keeps the empty-file wrapper
// as a test reads the declared identity as having RUN and PASSED in both
// pristine phases, and the proof reaches PROVEN over two phases in which
// nothing ran at all.
if (subject.greeting !== 'hello') {
  test('tests/suite-conditional.js', () => {
    assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-CONDITIONAL');
  });
}
