'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { renderDigest } = require('../../src/core/digest');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'identity-filled');
const GOLDEN = path.join(__dirname, '..', 'golden', 'digest-default.md');

test('renderDigest on the fixture equals the golden byte-for-byte', () => {
  const actual = renderDigest(FIXTURE);
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  assert.equal(actual, golden);
});

test('renderDigest is deterministic (pure): same input, identical bytes', () => {
  assert.equal(renderDigest(FIXTURE), renderDigest(FIXTURE));
});

test('renderDigest prepends opts.updateLine; empty leaves the golden byte-identical', () => {
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  // No update line (and no alerts) → unchanged from the golden.
  assert.equal(renderDigest(FIXTURE, undefined, { updateLine: '' }), golden);
  // A non-empty update line is prepended, then a blank line, then the body.
  const line = '> [!note] A newer Wienerdog is available (0.2.1 → 0.3.0). Update with: npx wienerdog@latest sync';
  const withLine = renderDigest(FIXTURE, undefined, { updateLine: line });
  assert.equal(withLine, `${line}\n\n${golden}`);
});

test('renderDigest prepends opts.schedulerLine; empty leaves the golden byte-identical', () => {
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  // No scheduler line (and no alerts/update) → unchanged from the golden.
  assert.equal(renderDigest(FIXTURE, undefined, { schedulerLine: '' }), golden);
  // A non-empty scheduler line is prepended, then a blank line, then the body.
  const line = "> [!warning] Wienerdog: the scheduled job \"dream\" is set up but not currently active in your computer's scheduler. Run 'wienerdog sync' to reactivate it. (This can happen after some system updates.)";
  const withLine = renderDigest(FIXTURE, undefined, { schedulerLine: line });
  assert.equal(withLine, `${line}\n\n${golden}`);
});

test('renderDigest orders the prefix alerts → schedulerLine → updateLine → body', () => {
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  const schedulerLine = '> [!warning] Wienerdog: the scheduled job "dream" is set up but not currently active';
  const updateLine = '> [!note] update available';
  const alerts = [{ job: 'dream', at: '2026-07-04T03:30:00.000Z', reason: 'boom', log_hint: 'logs/dream/' }];
  const out = renderDigest(FIXTURE, undefined, { alerts, schedulerLine, updateLine });
  const alertIdx = out.indexOf('has failed'); // alert block body (distinct from scheduler warning)
  const schedIdx = out.indexOf(schedulerLine);
  const updIdx = out.indexOf(updateLine);
  const bodyIdx = out.indexOf("# Who you're working with");
  assert.ok(alertIdx !== -1 && schedIdx !== -1 && updIdx !== -1 && bodyIdx !== -1, 'all four blocks present');
  assert.ok(alertIdx < schedIdx && schedIdx < updIdx && updIdx < bodyIdx,
    'order is alerts → schedulerLine → updateLine → body');
  assert.ok(out.endsWith(golden), 'body is the unchanged golden');
});

test('a note flagged derived_from_untrusted is excluded from the digest', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-digest-'));
  const idDir = path.join(tmp, '06-Identity');
  fs.mkdirSync(idDir, { recursive: true });
  for (const f of ['profile.md', 'preferences.md', 'goals.md', 'instructions.md']) {
    fs.copyFileSync(path.join(FIXTURE, '06-Identity', f), path.join(idDir, f));
  }
  // Taint the profile note.
  const profilePath = path.join(idDir, 'profile.md');
  const tainted = fs
    .readFileSync(profilePath, 'utf8')
    .replace('status: active', 'status: active\nderived_from_untrusted: true');
  fs.writeFileSync(profilePath, tainted);

  const digest = renderDigest(tmp);
  assert.ok(!digest.includes("# Who you're working with"), 'profile section header must be omitted');
  assert.ok(!digest.includes('Ada Kovács'), 'tainted profile content must be omitted');
  // Untainted sections still render.
  assert.ok(digest.includes('## Preferences'), 'other identity sections still render');
});

test('missing identity files are omitted, not errored', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-digest-'));
  const idDir = path.join(tmp, '06-Identity');
  fs.mkdirSync(idDir, { recursive: true });
  fs.copyFileSync(path.join(FIXTURE, '06-Identity', 'goals.md'), path.join(idDir, 'goals.md'));

  const digest = renderDigest(tmp);
  assert.ok(digest.includes('## Goals'));
  assert.ok(!digest.includes('## Preferences'));
  assert.ok(!digest.includes("# Who you're working with"));
});

test("compaction drops a note's own leading H1 (no duplicate under the section header)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-digest-h1-'));
  const idDir = path.join(tmp, '06-Identity');
  fs.mkdirSync(idDir, { recursive: true });
  fs.writeFileSync(
    path.join(idDir, 'preferences.md'),
    '---\nid: p\ntype: identity\norigin: interview\nstatus: active\n---\n\n' +
      '# Preferences\n\nDirect and concise. Lead with the recommendation.\n'
  );
  const digest = renderDigest(tmp);
  assert.ok(digest.includes('## Preferences'), 'injected section header present');
  assert.ok(!/^# Preferences$/m.test(digest), "note's own leading H1 dropped");
  assert.ok(digest.includes('Direct and concise'), 'content under the H1 preserved');
});
