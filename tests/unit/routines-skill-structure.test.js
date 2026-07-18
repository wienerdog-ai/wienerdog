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

test('wienerdog-daily-digest: references the exact broker verbs and the snapshot read (WP-141)', () => {
  assert.ok(dailyDigest.text.includes('calendar_list'), 'missing calendar_list verb');
  assert.ok(dailyDigest.text.includes('gmail_search'), 'missing gmail_search verb');
  assert.ok(dailyDigest.text.includes('gmail_read'), 'missing gmail_read verb');
  assert.ok(dailyDigest.text.includes('vault-snapshot/reports/dreams/'), 'missing snapshot reports/dreams read');
  assert.ok(dailyDigest.text.includes('send_digest_to_self'), 'missing send_digest_to_self verb');
  assert.ok(!dailyDigest.text.includes('wienerdog gws'), 'the gws Bash CLI is dead under A1 — no reference may remain');
});

test('wienerdog-daily-digest: states the ungranted send degrades to a visible notice (WP-141)', () => {
  const grantIdx = dailyDigest.flat.indexOf('granted send');
  assert.ok(grantIdx !== -1, 'missing mention of the send grant');
  const noticeIdx = dailyDigest.flat.indexOf('notice', grantIdx);
  assert.ok(
    noticeIdx !== -1 && noticeIdx - grantIdx < 400,
    '"notice" does not appear near the grant explanation'
  );
  assert.ok(
    !dailyDigest.flat.includes('WIENERDOG_JOB'),
    'identity comes from the trusted launch descriptor now, never env (F5)'
  );
});

test('wienerdog-daily-digest: states the send is self-only and grants can never be widened', () => {
  assert.ok(
    dailyDigest.flat.includes("can only go to the user's own address"),
    'missing send-to-self-only statement'
  );
  assert.ok(
    dailyDigest.flat.includes('add a recipient or widen a grant'),
    'missing never-add-recipient-or-widen-a-grant statement'
  );
});

test('wienerdog-inbox-triage: all mandatory ## headings are present verbatim', () => {
  const headings = ['## Your role', '## Gather', '## Draft', '## Never send'];
  for (const h of headings) {
    assert.ok(inboxTriage.text.includes(h), `missing heading: ${h}`);
  }
});

test('wienerdog-inbox-triage: references the create_draft verb and states it has no send tool', () => {
  assert.ok(inboxTriage.text.includes('create_draft'), 'missing create_draft verb');
  assert.ok(!inboxTriage.text.includes('wienerdog gws'), 'no gws Bash CLI reference may remain');
  const neverSendIdx = inboxTriage.text.indexOf('## Never send');
  assert.ok(neverSendIdx !== -1);
  const section = inboxTriage.text.slice(neverSendIdx);
  assert.ok(section.includes('no send tool'), 'missing no-send-tool statement');
});

test('wienerdog-weekly-review: all mandatory ## headings are present verbatim', () => {
  const headings = ['## Your role', '## Gather', '## Write the review', '## Never send'];
  for (const h of headings) {
    assert.ok(weeklyReview.text.includes(h), `missing heading: ${h}`);
  }
});

test('wienerdog-weekly-review: references the snapshot 07-Daily read and states it has no send tool', () => {
  assert.ok(weeklyReview.text.includes('vault-snapshot/07-Daily/'), 'missing snapshot 07-Daily read');
  assert.ok(!weeklyReview.text.includes('wienerdog gws'), 'no gws Bash CLI reference may remain');
  const neverSendIdx = weeklyReview.text.indexOf('## Never send');
  assert.ok(neverSendIdx !== -1);
  const section = weeklyReview.text.slice(neverSendIdx);
  assert.ok(section.includes('no send tool'), 'missing no-send-tool statement');
});

test('only wienerdog-routines mentions the grant command; the headless routines never invoke it', () => {
  assert.ok(!dailyDigest.text.includes('wienerdog grant send'), 'daily-digest must not contain wienerdog grant send');
  assert.ok(!inboxTriage.text.includes('wienerdog grant send'), 'inbox-triage must not contain wienerdog grant send');
  assert.ok(!weeklyReview.text.includes('wienerdog grant send'), 'weekly-review must not contain wienerdog grant send');
});
