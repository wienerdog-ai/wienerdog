'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { WienerdogError } = require('../../src/core/errors');
const { getPaths, assertSafeOverride, OVERRIDE_VARS } = require('../../src/core/paths');

test('paths: claudeDir precedence — WIENERDOG_CLAUDE_DIR > CLAUDE_CONFIG_DIR > <home>/.claude', () => {
  assert.equal(
    getPaths({ HOME: '/h', WIENERDOG_CLAUDE_DIR: '/wd', CLAUDE_CONFIG_DIR: '/cc' }).claudeDir,
    '/wd'
  );
  assert.equal(getPaths({ HOME: '/h', CLAUDE_CONFIG_DIR: '/cc' }).claudeDir, '/cc');
  assert.equal(getPaths({ HOME: '/h' }).claudeDir, '/h/.claude');
});

// ── WP-150: path-defining env overrides are validated (audit A13) ─────────────

test('paths: a relative override is rejected with a WienerdogError naming the variable', () => {
  assert.throws(
    () => getPaths({ HOME: '/h', WIENERDOG_HOME: '../evil' }),
    (err) => {
      assert.ok(err instanceof WienerdogError);
      assert.match(err.message, /WIENERDOG_HOME/);
      assert.match(err.message, /absolute path/);
      return true;
    }
  );
});

test('paths: an absolute override containing a ".." segment is rejected', () => {
  assert.throws(() => getPaths({ HOME: '/h', WIENERDOG_VAULT: 'notes/../../x' }), WienerdogError);
  assert.throws(() => getPaths({ HOME: '/h', WIENERDOG_VAULT: '/notes/../x' }), WienerdogError);
  assert.throws(() => getPaths({ HOME: '/h', CODEX_HOME: '/a/./b' }), WienerdogError);
});

test('paths: every override var in OVERRIDE_VARS is enforced by getPaths', () => {
  for (const name of OVERRIDE_VARS) {
    assert.throws(
      () => getPaths({ HOME: '/h', [name]: 'relative/path' }),
      (err) => {
        assert.ok(err instanceof WienerdogError, `${name}: throws WienerdogError`);
        assert.match(err.message, new RegExp(name), `${name}: message names the variable`);
        return true;
      }
    );
  }
});

test('paths: a backslash-separated ".." segment is rejected (cross-engine check)', () => {
  assert.throws(() => assertSafeOverride('CODEX_HOME', '/a\\..\\b'), WienerdogError);
});

test('paths: a legitimate absolute override still works unchanged', () => {
  assert.equal(getPaths({ HOME: '/h', WIENERDOG_HOME: '/tmp/wd' }).core, '/tmp/wd');
  assert.equal(getPaths({ HOME: '/h', WIENERDOG_VAULT: '/tmp/v' }).vault, '/tmp/v');
});

test('paths: unset overrides keep the home-relative defaults with no validation error', () => {
  const p = getPaths({ HOME: '/h' });
  assert.equal(p.core, '/h/.wienerdog');
  assert.equal(p.vault, '/h/wienerdog');
  assert.equal(p.codexDir, '/h/.codex');
});

test('paths: an empty-string override falls through to the default (treated as unset)', () => {
  assert.equal(getPaths({ HOME: '/h', WIENERDOG_HOME: '' }).core, '/h/.wienerdog');
});
