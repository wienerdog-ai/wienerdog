'use strict';

// Regression guard (NOT a containment proof) for the pure MCP-inventory filter
// the live negative harness (tests/scenarios/negative/run-negative.js) uses to
// classify observed mcp__ tools. It asserts the classification logic only: a
// routine's own declared broker verbs are allowed, undeclared/rogue mcp__ tools
// are rejected (fail-closed). The real containment proof is the LIVE run
// (`npm run scenarios:negative` under WIENERDOG_RUN_SCENARIOS=1); this test never
// spawns claude.

const test = require('node:test');
const assert = require('node:assert/strict');

const { undeclaredMcpFailures } = require('../scenarios/negative/run-negative');
const { BROKER_SERVER_NAME } = require('../../src/gws/broker/constants');

const verb = (v) => `mcp__${BROKER_SERVER_NAME}__${v}`;

test('undeclaredMcpFailures: declared broker verbs + non-mcp tools produce no failures', () => {
  const inventory = [verb('gmail_search'), 'Read', verb('gmail_read')];
  const failures = undeclaredMcpFailures('daily-digest', inventory, ['gmail_search', 'gmail_read']);
  assert.deepEqual(failures, []);
});

test('undeclaredMcpFailures: an UNDECLARED broker verb is rejected', () => {
  const inventory = [verb('gmail_search'), verb('gmail_send')];
  const failures = undeclaredMcpFailures('daily-digest', inventory, ['gmail_search', 'gmail_read']);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /UNDECLARED MCP tool "mcp__wienerdog-broker__gmail_send"/);
  assert.match(failures[0], /daily-digest/);
});

test('undeclaredMcpFailures: the rogue user MCP is rejected', () => {
  const failures = undeclaredMcpFailures('inbox-triage', ['mcp__rogue__x'], ['gmail_search']);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /UNDECLARED MCP tool "mcp__rogue__x"/);
});

test('undeclaredMcpFailures: undeclared and rogue tools are each reported', () => {
  const inventory = [verb('gmail_search'), verb('gmail_send'), 'mcp__rogue__x', 'Read'];
  const failures = undeclaredMcpFailures('daily-digest', inventory, ['gmail_search']);
  assert.equal(failures.length, 2);
});

test('undeclaredMcpFailures: no broker verbs declared rejects every mcp__ tool', () => {
  const failures = undeclaredMcpFailures('x', [verb('gmail_read'), 'Read'], []);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /mcp__wienerdog-broker__gmail_read/);
});

test('undeclaredMcpFailures: a missing brokerVerbs list is treated as none declared', () => {
  const failures = undeclaredMcpFailures('x', [verb('gmail_read')], undefined);
  assert.equal(failures.length, 1);
});
