'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');

/** @param {string} name @returns {string} */
function skillPath(name) {
  return path.join(repoRoot, 'skills', name, 'SKILL.md');
}

/**
 * Read a SKILL.md and return both its raw text and a whitespace-flattened
 * version (all runs of whitespace, including newlines from prose line-wrap,
 * collapsed to a single space). Headings are checked against `text` (they
 * live on their own line); multi-line prose phrases are checked against
 * `flat` so line-wrapping in the source doesn't break a substring match.
 * @param {string} name
 * @returns {{text:string, flat:string}}
 */
function read(name) {
  const text = fs.readFileSync(skillPath(name), 'utf8');
  const flat = text.replace(/\s+/g, ' ');
  return { text, flat };
}

const routines = read('wienerdog-routines');
const dailyDigest = read('wienerdog-daily-digest');
const inboxTriage = read('wienerdog-inbox-triage');
const weeklyReview = read('wienerdog-weekly-review');

/**
 * @param {string} text
 * @param {string} name
 */
function assertFrontmatter(text, name) {
  assert.match(
    text,
    new RegExp(`^---\\n[\\s\\S]*?\\bname:\\s*${name}\\b[\\s\\S]*?\\n---`, 'm'),
    `${name}: frontmatter name: field`
  );
  const desc = text.match(/^description:\s*(.+)$/m);
  assert.ok(desc, `${name}: description: key is present`);
  assert.ok(desc[1].trim().length > 0, `${name}: description is non-empty`);
}

test('all four routine skills: frontmatter has correct name and a non-empty description', () => {
  assertFrontmatter(routines.text, 'wienerdog-routines');
  assertFrontmatter(dailyDigest.text, 'wienerdog-daily-digest');
  assertFrontmatter(inboxTriage.text, 'wienerdog-inbox-triage');
  assertFrontmatter(weeklyReview.text, 'wienerdog-weekly-review');
});

test('wienerdog-routines: all five mandatory ## headings are present verbatim', () => {
  const headings = [
    '## What routines are',
    '## The menu',
    '## Setting up a routine',
    '## Removing or changing a routine',
    '## Safety',
  ];
  for (const h of headings) {
    assert.ok(routines.text.includes(h), `missing heading: ${h}`);
  }
});

test('wienerdog-routines: mentions all three routine display names', () => {
  for (const name of ['Daily digest', 'Inbox triage', 'Weekly review']) {
    assert.ok(routines.text.includes(name), `missing routine display name: ${name}`);
  }
});

test('wienerdog-routines: contains the exact grant command form', () => {
  assert.ok(
    routines.text.includes('wienerdog grant send --routine daily-digest --to'),
    'exact grant command form missing'
  );
});

test('wienerdog-routines: states the model must not run the grant for the user', () => {
  assert.ok(routines.flat.includes('type the word "grant"'), 'missing: type the word "grant"');
  assert.ok(
    routines.flat.includes('they run it themselves'),
    'missing a "you run it yourself"-style phrase'
  );
});

test('wienerdog-routines: states nothing is scheduled by default, and that triage/weekly-review never send', () => {
  assert.ok(
    routines.flat.toLowerCase().includes('nothing is scheduled'),
    'missing "nothing is scheduled" phrasing'
  );
  assert.ok(routines.text.includes('Never sends'), 'missing "Never sends" for the draft-only routines');
});

test('wienerdog-daily-digest: all mandatory ## headings are present verbatim', () => {
  const headings = ['## Your role', '## Gather', '## Compose', '## Send', '## If something is missing'];
  for (const h of headings) {
    assert.ok(dailyDigest.text.includes(h), `missing heading: ${h}`);
  }
});

test('wienerdog-daily-digest: references the exact gws/vault reads and the send command', () => {
  assert.ok(dailyDigest.text.includes('wienerdog gws cal list'), 'missing wienerdog gws cal list');
  assert.ok(dailyDigest.text.includes('wienerdog gws gmail search'), 'missing wienerdog gws gmail search');
  assert.ok(dailyDigest.text.includes('reports/dreams/'), 'missing reports/dreams/');
  assert.ok(dailyDigest.text.includes('wienerdog gws gmail send'), 'missing wienerdog gws gmail send');
});

test('wienerdog-daily-digest: states ungranted-send-degrades-to-draft and references WIENERDOG_JOB', () => {
  assert.ok(dailyDigest.flat.includes('WIENERDOG_JOB'), 'missing WIENERDOG_JOB');
  const grantIdx = dailyDigest.flat.indexOf('granted send');
  assert.ok(grantIdx !== -1, 'missing mention of the send grant');
  const draftIdx = dailyDigest.flat.indexOf('draft', grantIdx);
  assert.ok(
    draftIdx !== -1 && draftIdx - grantIdx < 400,
    '"draft" does not appear near the grant explanation'
  );
});

test('wienerdog-daily-digest: states it only sends to the user\'s own address and never creates/widens a grant', () => {
  assert.ok(
    dailyDigest.flat.includes("Never send to any address other than the user's own"),
    'missing send-to-self-only statement'
  );
  assert.ok(
    dailyDigest.flat.includes('never attempt to create or widen a grant'),
    'missing never-create-or-widen-a-grant statement'
  );
});

test('wienerdog-inbox-triage: all mandatory ## headings are present verbatim', () => {
  const headings = ['## Your role', '## Gather', '## Draft', '## Never send'];
  for (const h of headings) {
    assert.ok(inboxTriage.text.includes(h), `missing heading: ${h}`);
  }
});

test('wienerdog-inbox-triage: references gws gmail draft and states it never sends', () => {
  assert.ok(inboxTriage.text.includes('wienerdog gws gmail draft'), 'missing wienerdog gws gmail draft');
  const neverSendIdx = inboxTriage.text.indexOf('## Never send');
  const section = inboxTriage.text.slice(neverSendIdx);
  assert.ok(section.includes('never runs `wienerdog gws gmail send`'), 'missing never-runs-send statement');
  assert.ok(section.toLowerCase().includes('send grant'), 'missing send grant mention');
});

test('wienerdog-weekly-review: all mandatory ## headings are present verbatim', () => {
  const headings = ['## Your role', '## Gather', '## Write the review', '## Never send'];
  for (const h of headings) {
    assert.ok(weeklyReview.text.includes(h), `missing heading: ${h}`);
  }
});

test('wienerdog-weekly-review: references reading 07-Daily/ and states it never sends', () => {
  assert.ok(weeklyReview.text.includes('07-Daily/'), 'missing 07-Daily/');
  const neverSendIdx = weeklyReview.text.indexOf('## Never send');
  const section = weeklyReview.text.slice(neverSendIdx);
  assert.ok(section.includes('never runs `wienerdog gws gmail send`'), 'missing never-runs-send statement');
});

test('only wienerdog-routines mentions the grant command; the headless routines never invoke it', () => {
  assert.ok(!dailyDigest.text.includes('wienerdog grant send'), 'daily-digest must not contain wienerdog grant send');
  assert.ok(!inboxTriage.text.includes('wienerdog grant send'), 'inbox-triage must not contain wienerdog grant send');
  assert.ok(!weeklyReview.text.includes('wienerdog grant send'), 'weekly-review must not contain wienerdog grant send');
});
