'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { renderDigest } = require('../../src/core/digest');
const { allowAll } = require('../../src/core/safety-profile');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'identity-filled');
const GOLDEN = path.join(__dirname, '..', 'golden', 'digest-default.md');

test('renderDigest on the fixture equals the golden byte-for-byte (frozen: no daily block)', () => {
  const actual = renderDigest(FIXTURE);
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  assert.equal(actual, golden);
  assert.ok(!actual.includes('## Latest daily log'), 'daily-summary-injection gate is frozen by default');
});

test('renderDigest with { profile: allowAll() } re-enables the daily Summary block', () => {
  const out = renderDigest(FIXTURE, undefined, { profile: allowAll() });
  assert.match(out, /## Latest daily log \(2026-07-01\)/);
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

/** Copy the four identity fixtures into a fresh tmp vault; return its root. */
function tmpVault() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-digest-'));
  const idDir = path.join(tmp, '06-Identity');
  fs.mkdirSync(idDir, { recursive: true });
  for (const f of ['profile.md', 'preferences.md', 'goals.md', 'instructions.md']) {
    fs.copyFileSync(path.join(FIXTURE, '06-Identity', f), path.join(idDir, f));
  }
  return tmp;
}

/** Insert a line into profile.md's frontmatter after `status: active`. */
function taintProfile(vaultDir, line) {
  const profilePath = path.join(vaultDir, '06-Identity', 'profile.md');
  const tainted = fs
    .readFileSync(profilePath, 'utf8')
    .replace('status: active', `status: active\n${line}`);
  fs.writeFileSync(profilePath, tainted);
}

const BANNER = 'some identity notes were left out of your session context';

test('a note flagged derived_from_untrusted: true (exact) is excluded SILENTLY', () => {
  const tmp = tmpVault();
  taintProfile(tmp, 'derived_from_untrusted: true');

  const digest = renderDigest(tmp);
  assert.ok(!digest.includes("# Who you're working with"), 'profile section header must be omitted');
  assert.ok(!digest.includes('Ada Kovács'), 'tainted profile content must be omitted');
  // Untainted sections still render.
  assert.ok(digest.includes('## Preferences'), 'other identity sections still render');
  // Exact `true` is normal policy — no banner.
  assert.ok(!digest.includes(BANNER), 'exact true excludes silently (no banner)');
});

test('an INVALID derived_from_untrusted form is excluded AND warned (old fail-open closed)', () => {
  for (const v of ['True', '"true"', "'true'", 'true # x']) {
    const tmp = tmpVault();
    taintProfile(tmp, `derived_from_untrusted: ${v}`);

    const digest = renderDigest(tmp);
    assert.ok(!digest.includes('Ada Kovács'), `content must be omitted for ${JSON.stringify(v)}`);
    assert.ok(
      digest.includes('profile.md (unclear derived_from_untrusted value)'),
      `banner must name profile.md for ${JSON.stringify(v)}`
    );
    assert.ok(digest.includes('## Preferences'), 'other identity sections still render');
  }
});

test('a malformed frontmatter block WITHOUT the flag is excluded AND warned', () => {
  const tmp = tmpVault();
  // An indented line makes the block malformed; no derived_from_untrusted anywhere.
  taintProfile(tmp, '  nested: x');

  const digest = renderDigest(tmp);
  assert.ok(!digest.includes('Ada Kovács'), 'malformed profile content must be omitted');
  assert.ok(digest.includes('profile.md (malformed frontmatter)'), 'banner must name the malformed file');
  assert.ok(digest.includes('## Preferences'), 'other identity sections still render');
});

test('derived_from_untrusted: false renders normally with no banner', () => {
  const tmp = tmpVault();
  taintProfile(tmp, 'derived_from_untrusted: false');

  const digest = renderDigest(tmp);
  assert.ok(digest.includes('Ada Kovács'), 'explicitly-false profile renders');
  assert.ok(!digest.includes(BANNER), 'no banner for a trusted note');
});

test('the identity-exclusion banner is placed FIRST in the prefix, before alerts', () => {
  const tmp = tmpVault();
  taintProfile(tmp, 'derived_from_untrusted: True');
  const alerts = [{ job: 'dream', at: '2026-07-04T03:30:00.000Z', reason: 'boom', log_hint: 'logs/dream/' }];

  const digest = renderDigest(tmp, undefined, { alerts });
  const bannerIdx = digest.indexOf(BANNER);
  const alertIdx = digest.indexOf('has failed');
  assert.ok(bannerIdx !== -1 && alertIdx !== -1, 'both blocks present');
  assert.ok(bannerIdx < alertIdx, 'identity banner comes before the alert block');
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
