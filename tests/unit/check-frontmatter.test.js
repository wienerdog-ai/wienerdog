'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'check-frontmatter.js');

/** Builds a throwaway repo tree with real schemas and the given spec files.
 * @param {Record<string, string>} specs — relative path under docs/specs/ → file content
 * @returns {string} fixture root */
function makeFixture(specs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-cfm-'));
  fs.mkdirSync(path.join(root, 'tests/schemas'), { recursive: true });
  for (const schema of ['spec.schema.json', 'agent.schema.json']) {
    fs.copyFileSync(
      path.join(repoRoot, 'tests/schemas', schema),
      path.join(root, 'tests/schemas', schema)
    );
  }
  fs.mkdirSync(path.join(root, 'docs/specs/done'), { recursive: true });
  for (const [rel, content] of Object.entries(specs)) {
    fs.writeFileSync(path.join(root, 'docs/specs', rel), content);
  }
  return root;
}

/** @param {string} cwd @returns {{status: number, stdout: string, stderr: string}} */
function run(cwd) {
  try {
    const stdout = execFileSync('node', [scriptPath], { cwd, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

/** @param {Record<string, string>} overrides @returns {string} */
function spec(overrides) {
  const fields = {
    id: 'WP-example',
    title: 'Example spec',
    status: 'Draft',
    model: 'sonnet',
    size: 'S',
    depends_on: '[]',
    adrs: '[]',
    ...overrides,
  };
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return ['---', ...lines, '---', '', '# body', ''].join('\n');
}

test('valid slug spec plus valid numeric spec in done/ pass', () => {
  const root = makeFixture({
    'WP-roadmap-retirement.md': spec({ id: 'WP-roadmap-retirement' }),
    'done/WP-042-vendored-install.md': spec({ id: 'WP-042' }),
  });
  const result = run(root);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /2 spec\(s\)/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('duplicate id across docs/specs/ and done/ fails', () => {
  const root = makeFixture({
    'WP-thing.md': spec({ id: 'WP-thing' }),
    'done/WP-thing-old.md': spec({ id: 'WP-thing' }),
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate id/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('dangling depends_on fails', () => {
  const root = makeFixture({
    'WP-a.md': spec({ id: 'WP-a', depends_on: '[WP-nonexistent]' }),
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not resolve/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('depends_on resolving to a done/ spec passes', () => {
  const root = makeFixture({
    'WP-b.md': spec({ id: 'WP-b', depends_on: '[WP-042]' }),
    'done/WP-042-vendored-install.md': spec({ id: 'WP-042' }),
  });
  const result = run(root);
  assert.equal(result.status, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('non-kebab id fails the pattern', () => {
  const root = makeFixture({ 'WP-bad.md': spec({ id: 'WP-Bad_Slug' }) });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match pattern/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('epic must be kebab-case when present, optional otherwise', () => {
  const bad = makeFixture({ 'WP-c.md': spec({ id: 'WP-c', epic: 'Audit-A7' }) });
  const badResult = run(bad);
  assert.equal(badResult.status, 1);
  assert.match(badResult.stderr, /"epic"/);
  fs.rmSync(bad, { recursive: true, force: true });

  const good = makeFixture({ 'WP-d.md': spec({ id: 'WP-d', epic: 'audit-a7' }) });
  const goodResult = run(good);
  assert.equal(goodResult.status, 0);
  fs.rmSync(good, { recursive: true, force: true });
});

test('spec without branch field passes (branch retired by ADR-0029)', () => {
  const root = makeFixture({ 'WP-e.md': spec({ id: 'WP-e' }) });
  const result = run(root);
  assert.equal(result.status, 0);
  fs.rmSync(root, { recursive: true, force: true });
});
