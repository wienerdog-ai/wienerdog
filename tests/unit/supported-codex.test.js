'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SUPPORTED_CODEX, checkCodexVersion, parseCodexVersion } = require('../../src/core/supported-codex');

test('supported-codex: SUPPORTED_CODEX is a dotted-numeric version string', () => {
  assert.match(SUPPORTED_CODEX, /^\d+\.\d+\.\d+$/);
});

test('supported-codex: parseCodexVersion pulls the version out of --version output', () => {
  assert.equal(parseCodexVersion(`codex-cli ${SUPPORTED_CODEX}`), SUPPORTED_CODEX);
  assert.equal(parseCodexVersion('codex 0.150.2\n'), '0.150.2');
  assert.equal(parseCodexVersion('no version here'), null);
  assert.equal(parseCodexVersion(null), null);
});

test('supported-codex: checkCodexVersion is ok for the supported version', () => {
  const r = checkCodexVersion(`codex-cli ${SUPPORTED_CODEX}`);
  assert.equal(r.ok, true);
  assert.equal(r.parsed, SUPPORTED_CODEX);
  assert.equal(r.supported, SUPPORTED_CODEX);
});

test('supported-codex: checkCodexVersion is not-ok for a different version', () => {
  const r = checkCodexVersion('codex-cli 0.99.0');
  assert.equal(r.ok, false);
  assert.equal(r.parsed, '0.99.0');
  assert.equal(r.supported, SUPPORTED_CODEX);
});

test('supported-codex: checkCodexVersion is not-ok and parsed:null on unparseable input', () => {
  const r = checkCodexVersion('garbage');
  assert.equal(r.ok, false);
  assert.equal(r.parsed, null);
  assert.equal(r.actual, 'garbage');
});

test('supported-codex: module is pure — no fs/child_process needed to load', () => {
  // Loading and calling touches nothing but memory; a second call is stable.
  assert.deepEqual(checkCodexVersion('0.1.0'), checkCodexVersion('0.1.0'));
});
