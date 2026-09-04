'use strict';
const test = require('node:test');
const assert = require('node:assert');
const subject = require('../subject/subject.js');

test('fixture basic: the greeting is hello', () => {
  assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
});

test('fixture basic: the arity is two', () => {
  assert.equal(subject.arity, 2, 'RP-SIGNAL-ARITY');
});
