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
const { allowAll } = require('../../src/core/safety-profile');

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

test('readVaultLayout rejects traversal values per-key (layout traversal safety)', () => {
  const body = [
    'vault_layout:',
    '  identity_dir: ../../../etc',
    '  daily_dir: 05-Daily', // safe key in the same block still applies
    '  projects_dir: a/../b',
  ].join('\n');
  const file = writeConfig(body);
  const l = readVaultLayout(file);
  assert.equal(l.identity_dir, '06-Identity', '`..` traversal falls back to default');
  assert.equal(l.projects_dir, '01-Projects', 'inner `..` segment falls back to default');
  assert.equal(l.daily_dir, '05-Daily', 'safe sibling key still applies');
});

test('readVaultLayout rejects absolute-path values (layout traversal safety)', () => {
  const file = writeConfig('vault_layout:\n  identity_dir: /etc\n  reports_dir: /var/tmp/x\n');
  const l = readVaultLayout(file);
  assert.equal(l.identity_dir, '06-Identity');
  assert.equal(l.reports_dir, 'reports/dreams');
});

test('readVaultLayout rejects empty and backslash values (layout traversal safety)', () => {
  const body = [
    'vault_layout:',
    '  identity_dir:',
    '  daily_dir: ""',
    '  skills_dir: notes\\skills',
  ].join('\n');
  const file = writeConfig(body);
  const l = readVaultLayout(file);
  assert.equal(l.identity_dir, '06-Identity', 'empty value falls back to default');
  assert.equal(l.daily_dir, '07-Daily', 'empty-after-quote-strip falls back to default');
  assert.equal(l.skills_dir, '05-Skills', 'backslash value falls back to default');
});

test('renderDigest with a hostile layout never reads outside the vault (layout traversal safety, end-to-end)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-hostile-'));
  const vault = path.join(tmp, 'vault');
  fs.mkdirSync(vault, { recursive: true });
  // Plant sentinel files OUTSIDE the vault, shaped so the digest would render
  // them if the traversal values were honored.
  const secretId = path.join(tmp, 'secret');
  fs.mkdirSync(secretId, { recursive: true });
  fs.writeFileSync(
    path.join(secretId, 'profile.md'),
    '# Profile\n\n## Role\n\nSENTINEL-OUT-OF-VAULT-SECRET\n'
  );
  const secretDaily = path.join(tmp, 'secret-daily');
  fs.mkdirSync(secretDaily, { recursive: true });
  fs.writeFileSync(
    path.join(secretDaily, '2026-07-01.md'),
    '# 2026-07-01\n\n## Summary\n\nSENTINEL-DAILY-SECRET\n'
  );
  // Hostile config → through the readVaultLayout chokepoint → renderDigest.
  const config = writeConfig(
    ['vault_layout:', '  identity_dir: ../secret', '  daily_dir: ../secret-daily', '  projects_dir: ..'].join('\n')
  );
  const layout = readVaultLayout(config);
  const digest = renderDigest(vault, layout);
  assert.ok(!digest.includes('SENTINEL-OUT-OF-VAULT-SECRET'), 'out-of-vault identity content absent');
  assert.ok(!digest.includes('SENTINEL-DAILY-SECRET'), 'out-of-vault daily content absent');
  assert.ok(!digest.includes('- secret'), 'out-of-vault dirs not listed as projects');
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

test('renderDigest with the power-user layout: frozen default omits the nested daily (identity + project still render)', () => {
  const powerUser = { ...defaultLayout(), daily_dir: '05-Daily', daily_filename: 'YYYY/MM/YYYY-MM-DD.md' };
  const digest = renderDigest(POWERUSER_FIXTURE, powerUser);
  // Identity content (distinct persona, cannot match the default golden).
  assert.ok(digest.includes('Priya Nair'), 'identity profile content present');
  assert.ok(digest.includes('## Preferences'), 'preferences section header present');
  // Project listed under Active projects.
  assert.ok(digest.includes('- field-study'), 'project listed');
  // A0 pre-use freeze (WP-109/WP-112): daily-summary-injection is blocked by
  // default, even though the recursive walk would otherwise find this nested daily.
  assert.ok(
    !digest.includes('Interviewed two coastal-town planners'),
    'nested daily summary omitted under the frozen default'
  );
  assert.ok(!digest.includes('## Latest daily log'), 'daily block omitted under the frozen default');
});

test('renderDigest with the power-user layout + { profile: allowAll() } finds the nested daily (gate, not removal)', () => {
  const powerUser = { ...defaultLayout(), daily_dir: '05-Daily', daily_filename: 'YYYY/MM/YYYY-MM-DD.md' };
  const digest = renderDigest(POWERUSER_FIXTURE, powerUser, { profile: allowAll() });
  assert.ok(
    digest.includes('Interviewed two coastal-town planners'),
    'nested daily summary present when the gate is allowed'
  );
  assert.ok(digest.includes('## Latest daily log (2026-07-02)'), 'daily date header present when allowed');
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
