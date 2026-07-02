'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const skillPath = path.join(repoRoot, 'skills', 'wienerdog-google-setup', 'SKILL.md');
const text = fs.readFileSync(skillPath, 'utf8');
const lower = text.toLowerCase();

test('google-setup-skill: frontmatter has name and a non-empty description', () => {
  assert.match(text, /^---\n[\s\S]*?\bname:\s*wienerdog-google-setup\b[\s\S]*?\n---/m);
  const desc = text.match(/^description:\s*(.+)$/m);
  assert.ok(desc, 'description: key is present');
  assert.ok(desc[1].trim().length > 0, 'description is non-empty');
});

test('google-setup-skill: all mandatory ## headings are present verbatim', () => {
  const headings = [
    '## What this does and what you\'ll need',
    '## Before you start: the plain-language picture',
    '## Step 1 — Create a Google Cloud project',
    '## Step 2 — Turn on the Gmail, Calendar, and Drive APIs',
    '## Step 3 — Set up the OAuth consent screen',
    '## Step 4 — Create a Desktop-app client and download the JSON',
    '## Step 5 — Hand the file to Wienerdog',
    '## Step 6 — Verify the connection',
    '## If something goes wrong',
  ];
  for (const h of headings) {
    assert.ok(text.includes(h), `missing heading: ${h}`);
  }
});

test('google-setup-skill: console URL is present', () => {
  assert.ok(text.includes('console.cloud.google.com'), 'console.cloud.google.com missing');
});

test('google-setup-skill: all three API names are present', () => {
  for (const api of ['Gmail API', 'Google Calendar API', 'Google Drive API']) {
    assert.ok(text.includes(api), `missing API name: ${api}`);
  }
});

test('google-setup-skill: publishing and client-type instructions are present', () => {
  assert.ok(text.includes('In production'), '"In production" publishing phrase missing');
  assert.ok(text.includes('Desktop app'), '"Desktop app" client type missing');
});

test('google-setup-skill: drives the auth command', () => {
  assert.ok(text.includes('wienerdog gws auth --client'), 'auth command missing');
});

test('google-setup-skill: drives the read-only verify command', () => {
  assert.ok(text.includes('wienerdog gws gmail search'), 'verify command missing');
  assert.ok(text.includes('--max 1'), '--max 1 flag missing');
});

test('google-setup-skill: states drafting works but sending needs a separate grant, and never runs a grant', () => {
  assert.ok(lower.includes('draft'), '"draft" missing');
  assert.ok(lower.includes('send'), '"send" missing');
  assert.ok(lower.includes('grant'), '"grant" missing');
  assert.ok(!text.includes('wienerdog grant send'), 'skill must not invoke a grant command');
});
