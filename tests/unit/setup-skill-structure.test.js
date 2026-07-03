'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const skillPath = path.join(repoRoot, 'skills', 'wienerdog-setup', 'SKILL.md');
const text = fs.readFileSync(skillPath, 'utf8');
const lower = text.toLowerCase();

test('setup-skill: frontmatter has name and a non-empty description', () => {
  assert.match(text, /^---\n[\s\S]*?\bname:\s*wienerdog-setup\b[\s\S]*?\n---/m);
  const desc = text.match(/^description:\s*(.+)$/m);
  assert.ok(desc, 'description: key is present');
  assert.ok(desc[1].trim().length > 0, 'description is non-empty');
});

test('setup-skill: the two top-of-file hard rules are unchanged', () => {
  assert.ok(
    text.includes('Only ever write inside the vault and `config.yaml`'),
    'hard rule about only writing inside the vault/config.yaml is missing'
  );
  assert.ok(
    text.includes('Never touch `CLAUDE.md` or `AGENTS.md` yourself'),
    'hard rule about never touching CLAUDE.md/AGENTS.md is missing'
  );
});

test('setup-skill: Step 3 presents all three vault paths', () => {
  assert.ok(lower.includes('start fresh'), '"start fresh" option missing');
  assert.ok(lower.includes('import from it'), '"import from it" option missing');
  assert.ok(lower.includes('adopt it in place'), '"adopt it in place" option missing');
  assert.ok(text.includes('wienerdog adopt'), 'wienerdog adopt command missing');
});

test('setup-skill: Step 3 states the read-only guarantee', () => {
  assert.ok(lower.includes('read-only'), '"read-only" missing');
  assert.ok(
    lower.includes('never') && lower.includes('move, copy wholesale, edit, or delete'),
    'guarantee against moving/copying/editing/deleting the old vault missing'
  );
});

test('setup-skill: Step 3 requires origin: import provenance', () => {
  assert.ok(text.includes('origin:` to **`import`**'), 'origin: import provenance marker missing');
});

test('setup-skill: Step 3 requires a mandatory "what was taken" summary', () => {
  assert.ok(lower.includes('exactly what was taken'), '"what was taken" summary instruction missing');
  assert.ok(lower.includes('import is never silent'), 'mandatory-summary framing missing');
});

test('setup-skill: Step 3 seeds identity notes and project seeds on import', () => {
  for (const note of ['profile.md', 'preferences.md', 'goals.md', 'instructions.md']) {
    assert.ok(text.includes(note), `missing identity note reference: ${note}`);
  }
  assert.ok(text.includes('01-Projects/'), 'project seed path missing');
});

test('setup-skill: Step 3 references wienerdog init --fresh-vault', () => {
  assert.ok(
    text.includes('wienerdog init --fresh-vault'),
    'wienerdog init --fresh-vault command missing'
  );
});

test('setup-skill: Step 6 still references wienerdog sync', () => {
  assert.ok(text.includes('wienerdog sync'), 'wienerdog sync reference missing');
});
