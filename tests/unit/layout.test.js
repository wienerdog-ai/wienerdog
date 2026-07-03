'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  defaultLayout,
  readVaultLayout,
  resolveDailyPath,
  layoutPromptLines,
} = require('../../src/core/layout');
const { renderDigest } = require('../../src/core/digest');

const POWERUSER_FIXTURE = path.join(__dirname, '..', 'fixtures', 'poweruser-vault');

/** The block WP-026 writes for a nested-daily power-user vault. */
const POWERUSER_BLOCK = [
  'vault_layout:',
  '  identity_dir: 06-Identity',
  '  daily_dir: 05-Daily',
  '  daily_filename: YYYY/MM/YYYY-MM-DD.md',
  '  projects_dir: 01-Projects',
  '  skills_dir: 05-Skills',
  '  reports_dir: reports/dreams',
  '  inbox_dir: 00-Inbox',
].join('\n');

/** @param {string} body @returns {string} path to a temp config.yaml */
function writeConfig(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-layout-'));
  const file = path.join(dir, 'config.yaml');
  fs.writeFileSync(file, body);
  return file;
}

test('defaultLayout returns the seven documented defaults', () => {
  const l = defaultLayout();
  assert.deepEqual(l, {
    identity_dir: '06-Identity',
    daily_dir: '07-Daily',
    daily_filename: 'YYYY-MM-DD.md',
    projects_dir: '01-Projects',
    skills_dir: '05-Skills',
    reports_dir: 'reports/dreams',
    inbox_dir: '00-Inbox',
  });
});

test('defaultLayout returns independent objects (no shared mutation)', () => {
  const a = defaultLayout();
  const b = defaultLayout();
  a.identity_dir = 'MUTATED';
  assert.equal(b.identity_dir, '06-Identity');
});

test('readVaultLayout with no vault_layout block returns all defaults', () => {
  const file = writeConfig('version: 1\nvault: /Users/x/wienerdog\nmemory_mode: standard\n');
  assert.deepEqual(readVaultLayout(file), defaultLayout());
});

test('readVaultLayout on an unreadable/absent file returns defaults', () => {
  assert.deepEqual(readVaultLayout('/no/such/config.yaml'), defaultLayout());
});

test('readVaultLayout maps the power-user block, defaulting unspecified keys', () => {
  const file = writeConfig(`version: 1\nvault: /Users/x/vault\n${POWERUSER_BLOCK}\n`);
  const l = readVaultLayout(file);
  assert.equal(l.daily_dir, '05-Daily');
  assert.equal(l.daily_filename, 'YYYY/MM/YYYY-MM-DD.md');
  assert.equal(l.identity_dir, '06-Identity');
  assert.equal(l.projects_dir, '01-Projects');
  assert.equal(l.reports_dir, 'reports/dreams');
  assert.equal(l.inbox_dir, '00-Inbox');
});

test('readVaultLayout with a partial block defaults the missing keys', () => {
  const file = writeConfig('vault_layout:\n  daily_dir: 05-Daily\n');
  const l = readVaultLayout(file);
  assert.equal(l.daily_dir, '05-Daily');
  assert.equal(l.identity_dir, '06-Identity'); // still defaulted
  assert.equal(l.daily_filename, 'YYYY-MM-DD.md'); // still defaulted
});

test('readVaultLayout ignores unknown nested keys and stops at a dedented line', () => {
  const body = [
    'version: 1',
    'vault_layout:',
    '  identity_dir: 09-Me',
    '  bogus_key: should-be-ignored',
    '  daily_dir: 05-Daily',
    'memory_mode: eager', // dedented — must NOT be swallowed
  ].join('\n');
  const file = writeConfig(body);
  const l = readVaultLayout(file);
  assert.equal(l.identity_dir, '09-Me');
  assert.equal(l.daily_dir, '05-Daily');
  assert.ok(!('bogus_key' in l), 'unknown key must not be present on the layout');
  // The dedented memory_mode line was not consumed; its value did not leak in.
  assert.equal(l.projects_dir, '01-Projects');
});

test('readVaultLayout strips quotes and inline comments like readScalar', () => {
  const body = [
    'vault_layout:',
    '  identity_dir: "06-Identity"',
    '  daily_dir: 05-Daily # nested layout',
    '  projects_dir: \'01-Projects\'',
  ].join('\n');
  const file = writeConfig(body);
  const l = readVaultLayout(file);
  assert.equal(l.identity_dir, '06-Identity');
  assert.equal(l.daily_dir, '05-Daily');
  assert.equal(l.projects_dir, '01-Projects');
});

test('resolveDailyPath: default and power-user layouts', () => {
  assert.equal(resolveDailyPath(defaultLayout(), '2026-07-03'), '07-Daily/2026-07-03.md');
  const powerUser = { ...defaultLayout(), daily_dir: '05-Daily', daily_filename: 'YYYY/MM/YYYY-MM-DD.md' };
  assert.equal(resolveDailyPath(powerUser, '2026-07-03'), '05-Daily/2026/07/2026-07-03.md');
});

test('layoutPromptLines names the daily path and identity dir', () => {
  const powerUser = { ...defaultLayout(), daily_dir: '05-Daily', daily_filename: 'YYYY/MM/YYYY-MM-DD.md' };
  const lines = layoutPromptLines(powerUser, '2026-07-03');
  assert.ok(lines.some((l) => l.includes('05-Daily/2026/07/2026-07-03.md')));
  assert.ok(lines.some((l) => /identity/i.test(l) && l.includes('06-Identity')));
});

test('renderDigest with the power-user layout finds nested daily, identity, and project', () => {
  const powerUser = { ...defaultLayout(), daily_dir: '05-Daily', daily_filename: 'YYYY/MM/YYYY-MM-DD.md' };
  const digest = renderDigest(POWERUSER_FIXTURE, powerUser);
  // Identity content (distinct persona, cannot match the default golden).
  assert.ok(digest.includes('Priya Nair'), 'identity profile content present');
  assert.ok(digest.includes('## Preferences'), 'preferences section header present');
  // Project listed under Active projects.
  assert.ok(digest.includes('- field-study'), 'project listed');
  // Nested daily summary found via the recursive walk.
  assert.ok(
    digest.includes('Interviewed two coastal-town planners'),
    'nested daily summary present'
  );
  assert.ok(digest.includes('## Latest daily log (2026-07-02)'), 'daily date header present');
});

test('renderDigest with the default layout omits the nested daily (layout routes the lookup)', () => {
  // Default layout looks in 07-Daily, which the fixture lacks → no daily section.
  const digest = renderDigest(POWERUSER_FIXTURE);
  assert.ok(!digest.includes('Interviewed two coastal-town planners'), 'daily omitted under default layout');
  assert.ok(!digest.includes('## Latest daily log'), 'no daily-log section under default layout');
  // Identity/projects still render (same dir names as default).
  assert.ok(digest.includes('Priya Nair'), 'identity still rendered');
  assert.ok(digest.includes('- field-study'), 'project still rendered');
});
