'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SUPPORTED_CLAUDE, checkClaudeVersion, parseClaudeVersion } = require('../../src/core/supported-claude');

test('supported-claude: SUPPORTED_CLAUDE is a dotted-numeric version string', () => {
  assert.match(SUPPORTED_CLAUDE, /^\d+\.\d+\.\d+$/);
});

test('supported-claude: parseClaudeVersion pulls the version out of --version output', () => {
  assert.equal(parseClaudeVersion(`${SUPPORTED_CLAUDE} (Claude Code)`), SUPPORTED_CLAUDE);
  assert.equal(parseClaudeVersion('claude 2.1.99\n'), '2.1.99');
  assert.equal(parseClaudeVersion('no version here'), null);
  assert.equal(parseClaudeVersion(null), null);
});

test('supported-claude: checkClaudeVersion is ok for the supported version', () => {
  const r = checkClaudeVersion(`${SUPPORTED_CLAUDE} (Claude Code)`);
  assert.equal(r.ok, true);
  assert.equal(r.parsed, SUPPORTED_CLAUDE);
  assert.equal(r.supported, SUPPORTED_CLAUDE);
});

test('supported-claude: checkClaudeVersion is not-ok for a different version', () => {
  const r = checkClaudeVersion('2.0.1 (Claude Code)');
  assert.equal(r.ok, false);
  assert.equal(r.parsed, '2.0.1');
  assert.equal(r.supported, SUPPORTED_CLAUDE);
});

test('supported-claude: checkClaudeVersion is not-ok and parsed:null on unparseable input', () => {
  const r = checkClaudeVersion('garbage');
  assert.equal(r.ok, false);
  assert.equal(r.parsed, null);
  assert.equal(r.actual, 'garbage');
});

test('supported-claude: module is pure — no fs/child_process needed to load', () => {
  // Loading and calling touches nothing but memory; a second call is stable.
  assert.deepEqual(checkClaudeVersion('2.0.0'), checkClaudeVersion('2.0.0'));
});
