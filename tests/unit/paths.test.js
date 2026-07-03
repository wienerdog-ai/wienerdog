'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { getPaths } = require('../../src/core/paths');

test('paths: claudeDir precedence — WIENERDOG_CLAUDE_DIR > CLAUDE_CONFIG_DIR > <home>/.claude', () => {
  assert.equal(
    getPaths({ HOME: '/h', WIENERDOG_CLAUDE_DIR: '/wd', CLAUDE_CONFIG_DIR: '/cc' }).claudeDir,
    '/wd'
  );
  assert.equal(getPaths({ HOME: '/h', CLAUDE_CONFIG_DIR: '/cc' }).claudeDir, '/cc');
  assert.equal(getPaths({ HOME: '/h' }).claudeDir, '/h/.claude');
});
