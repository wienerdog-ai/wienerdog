'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { inferLayout } = require('../../src/core/layout-infer');
const { readVaultLayout } = require('../../src/core/layout');
const { scaffoldMappedDirs } = require('../../src/core/vault');

const POWERUSER_FIXTURE = path.resolve(__dirname, '../fixtures/poweruser-vault');

test('layout-infer: power-user fixture yields the nested-daily mapping', () => {
  const layout = inferLayout(POWERUSER_FIXTURE);
  assert.equal(layout.identity_dir, '06-Identity');
  assert.equal(layout.daily_dir, '05-Daily');
  assert.equal(layout.daily_filename, 'YYYY/MM/YYYY-MM-DD.md');
  assert.equal(layout.projects_dir, '01-Projects');
  // The fixture has no skills dir → default.
  assert.equal(layout.skills_dir, '05-Skills');
  assert.equal(layout.inbox_dir, '00-Inbox');
  assert.equal(layout.reports_dir, 'reports/dreams');
});

test('layout-infer: a flat daily dir yields a flat filename and the matched dir name', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-infer-'));
  try {
    fs.mkdirSync(path.join(root, 'Daily'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Daily', '2026-07-03.md'), '# today\n');
    const layout = inferLayout(root);
    assert.equal(layout.daily_dir, 'Daily');
    assert.equal(layout.daily_filename, 'YYYY-MM-DD.md');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('layout-infer: a whitespace-named folder is trimmed and round-trips config → scaffold to ONE dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-infer-ws-'));
  try {
    // A folder named with surrounding whitespace that matches the inbox keyword.
    fs.mkdirSync(path.join(root, '  Inbox  '), { recursive: true });

    // The proposal is trimmed and explicitly validated.
    const layout = inferLayout(root);
    assert.equal(layout.inbox_dir, 'Inbox');

    // Round-trip: write the proposal into a vault_layout block, read it back.
    const configPath = path.join(root, 'config.yaml');
    fs.writeFileSync(
      configPath,
      ['vault_layout:', `  inbox_dir: ${layout.inbox_dir}`, ''].join('\n')
    );
    const roundTripped = readVaultLayout(configPath);
    assert.equal(roundTripped.inbox_dir, layout.inbox_dir);

    // scaffoldMappedDirs, driven by the same proposal, creates that same dir —
    // config and scaffold agree on ONE directory.
    scaffoldMappedDirs(root, layout, {});
    assert.ok(fs.statSync(path.join(root, roundTripped.inbox_dir)).isDirectory());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
