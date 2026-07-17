'use strict';

// Audit A4 / WP-115: after the unification there is exactly ONE scalar-value
// coercer (frontmatter.coerceScalar), one key-line lexer, and one `---` body
// splitter; the FOUR consumers (validator, config, layout, skill-body split)
// must route through them and reproduce their pre-migration behavior
// byte-for-byte.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parse, coerceScalar } = require('../../src/core/frontmatter');
const { parseFrontmatter } = require('../../src/core/dream/validate');
const { readScalar } = require('../../src/core/dream/config');
const { readVaultLayout } = require('../../src/core/layout');

// [raw value, expected coerced value, expected quoted flag] — the expected
// values are what BOTH old consumers produced for these bytes.
const CORPUS = [
  ['plain', 'plain', false],
  ['"quoted"', 'quoted', true],
  ["'quoted'", 'quoted', true],
  ['val # comment', 'val', false],
  ['"has # inside"', 'has # inside', true],
  ['true', 'true', false],
  ['false', 'false', false],
  ['  padded  ', 'padded', false],
  ['[a, b]', '[a, b]', false],
];

test('coerceScalar reproduces the old consumers’ value handling on the shared corpus', () => {
  for (const [raw, value, quoted] of CORPUS) {
    const r = coerceScalar(raw);
    assert.equal(r.value, value, `value for ${JSON.stringify(raw)}`);
    assert.equal(r.quoted, quoted, `quoted for ${JSON.stringify(raw)}`);
  }
});

test('validate.parseFrontmatter round-trips the corpus through the one coercer', () => {
  for (const [raw, value] of CORPUS) {
    const doc = `---\nk: ${raw}\n---\nbody`;
    const got = parseFrontmatter(doc).k;
    // Unquoted exact booleans coerce to booleans (pre-migration behavior);
    // everything else is the coerced string.
    const expected = raw === 'true' ? true : raw === 'false' ? false : value;
    assert.equal(got, expected, `parseFrontmatter value for ${JSON.stringify(raw)}`);
  }
});

test('config.readScalar round-trips the corpus through the one coercer', () => {
  for (const [raw, value] of CORPUS) {
    // config.yaml is a bare scalar document (no --- delimiters); booleans stay strings.
    assert.equal(readScalar(`k: ${raw}`, 'k'), value, `readScalar value for ${JSON.stringify(raw)}`);
  }
});

test('a no-separator-space line agrees with the spaced form on both consumers', () => {
  assert.deepEqual(parseFrontmatter('---\nk:v\n---\n'), { k: 'v' });
  assert.deepEqual(parseFrontmatter('---\nk:v\n---\n'), parseFrontmatter('---\nk: v\n---\n'));
  assert.equal(readScalar('k:v', 'k'), 'v');
  assert.equal(readScalar('k:v', 'k'), readScalar('k: v', 'k'));
});

test('layout scalars round-trip through the one coercer (via readVaultLayout)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-unify-'));
  const configFile = path.join(tmp, 'config.yaml');
  fs.writeFileSync(
    configFile,
    'vault: /tmp/v\nvault_layout:\n  identity_dir: "07-Custom"\n  daily_dir: 07-Daily # note\n'
  );
  const layout = readVaultLayout(configFile);
  // Quoted and comment-carrying values yield the exact coerceScalar outputs.
  assert.equal(layout.identity_dir, coerceScalar('"07-Custom"').value);
  assert.equal(layout.identity_dir, '07-Custom');
  assert.equal(layout.daily_dir, coerceScalar('07-Daily # note').value);
  assert.equal(layout.daily_dir, '07-Daily');
});

test('the skill-body split matches the shared parser body rule', () => {
  // Mirrors validate.js skillBody's delegation: body after the closing ---,
  // whole text when the block is missing or unclosed.
  assert.equal(parse('---\nk: v\n---\nBODY').body, 'BODY');
  assert.equal(parse('plain text').body, 'plain text');
  assert.equal(parse('---\nk: v\n(unclosed)').body, '---\nk: v\n(unclosed)');
});

test('validator semantics preserved: quoted booleans stay strings, absent block is {}', () => {
  assert.equal(parseFrontmatter('---\nk: "true"\n---\n').k, 'true');
  assert.equal(parseFrontmatter('---\nk: \'false\'\n---\n').k, 'false');
  assert.deepEqual(parseFrontmatter('no frontmatter'), {});
  assert.deepEqual(parseFrontmatter('---\nunclosed: 1\n'), {});
});
