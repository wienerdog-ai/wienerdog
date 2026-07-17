'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { renderDigest, DigestCaps } = require('../../src/core/digest');
const { allowAll } = require('../../src/core/safety-profile');
const { approvalsFromVault } = require('../../src/core/identity-approvals');
const { defaultLayout } = require('../../src/core/layout');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'identity-filled');
const GOLDEN = path.join(__dirname, '..', 'golden', 'digest-default.md');

/** The A3 hash-gate approvals map for a vault's CURRENT bytes (trust-what-is-here). */
function approvals(vaultDir) {
  return approvalsFromVault(vaultDir, defaultLayout());
}

test('renderDigest on the fixture equals the golden byte-for-byte (frozen: no daily block)', () => {
  const actual = renderDigest(FIXTURE, undefined, { identityApprovals: approvals(FIXTURE) });
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  assert.equal(actual, golden);
  assert.ok(!actual.includes('## Latest daily log'), 'daily-summary-injection gate is frozen by default');
});

test('renderDigest with NO approvals map injects no identity (A3 fail closed)', () => {
  const digest = renderDigest(FIXTURE);
  assert.ok(!digest.includes("# Who you're working with"), 'profile header absent');
  assert.ok(!digest.includes('## Preferences'), 'preferences header absent');
  assert.ok(!digest.includes('Ada Kovács'), 'identity content absent');
  // Silent: a bare render (tests) shows no banner either.
  assert.ok(!digest.includes('some identity notes were left out'), 'no banner on a bare render');
});

test('renderDigest with { profile: allowAll() } re-enables the daily Summary block', () => {
  const out = renderDigest(FIXTURE, undefined, { profile: allowAll() });
  assert.match(out, /## Latest daily log \(2026-07-01\)/);
});

test('renderDigest is deterministic (pure): same input, identical bytes', () => {
  const opts = () => ({ identityApprovals: approvals(FIXTURE) });
  assert.equal(renderDigest(FIXTURE, undefined, opts()), renderDigest(FIXTURE, undefined, opts()));
});

test('renderDigest prepends opts.updateLine; empty leaves the golden byte-identical', () => {
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  // No update line (and no alerts) → unchanged from the golden.
  assert.equal(
    renderDigest(FIXTURE, undefined, { updateLine: '', identityApprovals: approvals(FIXTURE) }),
    golden
  );
  // A non-empty update line is prepended, then a blank line, then the body.
  const line = '> [!note] A newer Wienerdog is available (0.2.1 → 0.3.0). Update with: npx wienerdog@latest sync';
  const withLine = renderDigest(FIXTURE, undefined, { updateLine: line, identityApprovals: approvals(FIXTURE) });
  assert.equal(withLine, `${line}\n\n${golden}`);
});

test('renderDigest prepends opts.schedulerLine; empty leaves the golden byte-identical', () => {
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  // No scheduler line (and no alerts/update) → unchanged from the golden.
  assert.equal(
    renderDigest(FIXTURE, undefined, { schedulerLine: '', identityApprovals: approvals(FIXTURE) }),
    golden
  );
  // A non-empty scheduler line is prepended, then a blank line, then the body.
  const line = "> [!warning] Wienerdog: the scheduled job \"dream\" is set up but not currently active in your computer's scheduler. Run 'wienerdog sync' to reactivate it. (This can happen after some system updates.)";
  const withLine = renderDigest(FIXTURE, undefined, { schedulerLine: line, identityApprovals: approvals(FIXTURE) });
  assert.equal(withLine, `${line}\n\n${golden}`);
});

test('renderDigest prepends opts.quarantineLine; empty/absent leaves the golden byte-identical', () => {
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  // No quarantine line (and no alerts) → unchanged from the golden.
  assert.equal(
    renderDigest(FIXTURE, undefined, { quarantineLine: '', identityApprovals: approvals(FIXTURE) }),
    golden
  );
  // A non-empty quarantine line is prepended, then a blank line, then the body.
  const line =
    '> [!warning] Wienerdog: 1 session transcript(s) could not be read and were skipped — huge.jsonl (over-ceiling). ' +
    'Dreaming continues over your other sessions; a skipped file is retried automatically if it changes.';
  const withLine = renderDigest(FIXTURE, undefined, { quarantineLine: line, identityApprovals: approvals(FIXTURE) });
  assert.equal(withLine, `${line}\n\n${golden}`);
});

test('renderDigest places quarantineLine after alerts and before schedulerLine/updateLine', () => {
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  const quarantineLine = '> [!warning] Wienerdog: 1 session transcript(s) could not be read and were skipped — huge.jsonl (over-ceiling).';
  const schedulerLine = '> [!warning] Wienerdog: the scheduled job "dream" is set up but not currently active';
  const updateLine = '> [!note] update available';
  const alerts = [{ job: 'dream', at: '2026-07-04T03:30:00.000Z', reason: 'boom', log_hint: 'logs/dream/' }];
  const out = renderDigest(FIXTURE, undefined, { alerts, quarantineLine, schedulerLine, updateLine, identityApprovals: approvals(FIXTURE) });
  const alertIdx = out.indexOf('has failed');
  const quarIdx = out.indexOf(quarantineLine);
  const schedIdx = out.indexOf(schedulerLine);
  const updIdx = out.indexOf(updateLine);
  const bodyIdx = out.indexOf("# Who you're working with");
  assert.ok(alertIdx !== -1 && quarIdx !== -1 && schedIdx !== -1 && updIdx !== -1 && bodyIdx !== -1, 'all five blocks present');
  assert.ok(
    alertIdx < quarIdx && quarIdx < schedIdx && schedIdx < updIdx && updIdx < bodyIdx,
    'order is alerts → quarantineLine → schedulerLine → updateLine → body'
  );
  assert.ok(out.endsWith(golden), 'body is the unchanged golden');
});

test('renderDigest orders the prefix alerts → schedulerLine → updateLine → body', () => {
  const golden = fs.readFileSync(GOLDEN, 'utf8');
  const schedulerLine = '> [!warning] Wienerdog: the scheduled job "dream" is set up but not currently active';
  const updateLine = '> [!note] update available';
  const alerts = [{ job: 'dream', at: '2026-07-04T03:30:00.000Z', reason: 'boom', log_hint: 'logs/dream/' }];
  const out = renderDigest(FIXTURE, undefined, { alerts, schedulerLine, updateLine, identityApprovals: approvals(FIXTURE) });
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

  // Approvals computed AFTER the taint: the hash gate passes; the WP-114
  // provenance gate does the excluding.
  const digest = renderDigest(tmp, undefined, { identityApprovals: approvals(tmp) });
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

    const digest = renderDigest(tmp, undefined, { identityApprovals: approvals(tmp) });
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

  const digest = renderDigest(tmp, undefined, { identityApprovals: approvals(tmp) });
  assert.ok(!digest.includes('Ada Kovács'), 'malformed profile content must be omitted');
  assert.ok(digest.includes('profile.md (malformed frontmatter)'), 'banner must name the malformed file');
  assert.ok(digest.includes('## Preferences'), 'other identity sections still render');
});

test('derived_from_untrusted: false renders normally with no banner', () => {
  const tmp = tmpVault();
  taintProfile(tmp, 'derived_from_untrusted: false');

  const digest = renderDigest(tmp, undefined, { identityApprovals: approvals(tmp) });
  assert.ok(digest.includes('Ada Kovács'), 'explicitly-false profile renders');
  assert.ok(!digest.includes(BANNER), 'no banner for a trusted note');
});

test('the identity-exclusion banner is placed FIRST in the prefix, before alerts', () => {
  const tmp = tmpVault();
  taintProfile(tmp, 'derived_from_untrusted: True');
  const alerts = [{ job: 'dream', at: '2026-07-04T03:30:00.000Z', reason: 'boom', log_hint: 'logs/dream/' }];

  const digest = renderDigest(tmp, undefined, { alerts, identityApprovals: approvals(tmp) });
  const bannerIdx = digest.indexOf(BANNER);
  const alertIdx = digest.indexOf('has failed');
  assert.ok(bannerIdx !== -1 && alertIdx !== -1, 'both blocks present');
  assert.ok(bannerIdx < alertIdx, 'identity banner comes before the alert block');
});

// ── A3 exact-byte hash gate (WP-116, ADR-0021) ───────────────────────────────

test('tamper after approval: a one-byte change stops injection and is warned', () => {
  const tmp = tmpVault();
  const approved = approvals(tmp); // "human-approved" baseline
  fs.appendFileSync(path.join(tmp, '06-Identity', 'profile.md'), 'x');

  const digest = renderDigest(tmp, undefined, { identityApprovals: approved });
  assert.ok(!digest.includes("# Who you're working with"), 'tampered profile omitted');
  assert.ok(!digest.includes('Ada Kovács'), 'tampered content absent');
  assert.ok(
    digest.includes('profile.md (changed since you last approved it)'),
    'banner names the mismatched file'
  );
  // The untampered files still match their approved hashes and render.
  assert.ok(digest.includes('## Preferences'), 'still-approved sections render');
});

test('the same mismatch with NO approvals map omits silently (bare test render)', () => {
  const tmp = tmpVault();
  fs.appendFileSync(path.join(tmp, '06-Identity', 'profile.md'), 'x');
  const digest = renderDigest(tmp);
  assert.ok(!digest.includes('Ada Kovács'), 'identity omitted (fail closed)');
  assert.ok(!digest.includes(BANNER), 'no banner without a supplied map');
});

test('case-fold: Profile.md (capital P) shares one approval slot with profile.md', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-digest-case-'));
  const idDir = path.join(tmp, '06-Identity');
  fs.mkdirSync(idDir, { recursive: true });
  // Only a capital-P Profile.md exists (plus one normal file for contrast).
  fs.copyFileSync(path.join(FIXTURE, '06-Identity', 'preferences.md'), path.join(idDir, 'preferences.md'));
  fs.copyFileSync(path.join(FIXTURE, '06-Identity', 'profile.md'), path.join(idDir, 'Profile.md'));

  // On a case-insensitive FS the digest's literal profile.md read resolves to the
  // same inode; the approvals map holds only FOLDED keys, so the one slot covers
  // both spellings. approvalsFromVault folds — assert that directly.
  const map = approvals(tmp);
  assert.ok(map['06-identity/profile.md'], 'folded key present for the capital-P file');
  assert.ok(!Object.keys(map).some((k) => /[A-Z]/.test(k)), 'no case-carrying keys in the map');

  const digest = renderDigest(tmp, undefined, { identityApprovals: map });
  // Case-insensitive FS (macOS default): Profile.md is read as profile.md and
  // injected iff the folded slot matches. On a case-sensitive FS the literal read
  // misses → silent omission — either way, never two slots.
  if (digest.includes("# Who you're working with")) {
    assert.ok(digest.includes('Ada Kovács'), 'capital-P profile injected via the folded slot');
  }
  assert.ok(digest.includes('## Preferences'), 'control file renders');
});

test('missing identity files are omitted, not errored', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-digest-'));
  const idDir = path.join(tmp, '06-Identity');
  fs.mkdirSync(idDir, { recursive: true });
  fs.copyFileSync(path.join(FIXTURE, '06-Identity', 'goals.md'), path.join(idDir, 'goals.md'));

  const digest = renderDigest(tmp, undefined, { identityApprovals: approvals(tmp) });
  assert.ok(digest.includes('## Goals'));
  assert.ok(!digest.includes('## Preferences'));
  assert.ok(!digest.includes("# Who you're working with"));
  assert.ok(!digest.includes(BANNER), 'absent files are normal — no banner');
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
  const digest = renderDigest(tmp, undefined, { identityApprovals: approvals(tmp) });
  assert.ok(digest.includes('## Preferences'), 'injected section header present');
  assert.ok(!/^# Preferences$/m.test(digest), "note's own leading H1 dropped");
  assert.ok(digest.includes('Direct and concise'), 'content under the H1 preserved');
});

// ── Digest size caps (audit A6, F3/F5, WP-120) ───────────────────────────────

test('renderDigest truncates over-MAX_LINES content at a line boundary with the marker', () => {
  const tmp = tmpVault();
  // Many short lines: well under MAX_NOTE_BYTES for the note itself, but pushes
  // the assembled digest well past MAX_LINES — isolates the LINE cap.
  const items = [];
  for (let i = 0; i < 200; i++) items.push(`- item ${i}`);
  const note =
    '---\nid: i\ntype: identity\norigin: interview\nstatus: active\n---\n\n' +
    `# Standing instructions\n\n${items.join('\n')}\n`;
  fs.writeFileSync(path.join(tmp, '06-Identity', 'instructions.md'), note);

  const digest = renderDigest(tmp, undefined, { identityApprovals: approvals(tmp) });
  const lines = digest.split('\n');
  assert.ok(
    lines.length <= DigestCaps.MAX_LINES + 1,
    `expected <= ${DigestCaps.MAX_LINES + 1} lines (cap + marker), got ${lines.length}`
  );
  assert.equal(lines[lines.length - 1], DigestCaps.TRUNCATION_MARKER, 'last line is the marker');
  // Line-boundary safety: every kept "- item N" line is verbatim from the source
  // (never a partial line split mid-content).
  for (const l of lines) {
    if (l.startsWith('- item ')) assert.ok(items.includes(l), `unexpected partial line: ${JSON.stringify(l)}`);
  }
});

test('renderDigest byte-caps a ~1,000,000-char single line within MAX_BYTES, no split UTF-8 codepoint', () => {
  const tmp = tmpVault();
  const dailyDir = path.join(tmp, '07-Daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  // A single line of 1,000,000 multi-byte (2-byte UTF-8) characters — one line,
  // well under MAX_LINES, but far over MAX_BYTES. Not per-note capped (that cap
  // only applies to identity notes), so it exercises the digest-wide byte pass.
  const huge = 'é'.repeat(1_000_000);
  fs.writeFileSync(
    path.join(dailyDir, '2026-07-01.md'),
    `---\nid: d\ntype: daily\n---\n\n## Summary\n${huge}\n`
  );

  const digest = renderDigest(tmp, undefined, {
    identityApprovals: approvals(tmp),
    profile: allowAll(),
  });

  const byteLen = Buffer.byteLength(digest, 'utf8');
  assert.ok(byteLen <= DigestCaps.MAX_BYTES, `expected <= ${DigestCaps.MAX_BYTES} bytes, got ${byteLen}`);
  assert.ok(digest.includes(DigestCaps.TRUNCATION_MARKER), 'marker present');
  assert.ok(!digest.includes('�'), 'no split UTF-8 codepoint (no dangling replacement char)');
});

test('an identity note over MAX_NOTE_BYTES contributes at most MAX_NOTE_BYTES, line-bounded, no per-note marker', () => {
  const tmp = tmpVault();
  const line1 = 'a'.repeat(5000);
  const line2 = 'b'.repeat(5000);
  const line3 = 'c'.repeat(5000);
  const note =
    '---\nid: p\ntype: identity\norigin: interview\nstatus: active\n---\n\n' +
    `## Preferences\n\n${line1}\n${line2}\n${line3}\n`;
  fs.writeFileSync(path.join(tmp, '06-Identity', 'preferences.md'), note);

  const digest = renderDigest(tmp, undefined, { identityApprovals: approvals(tmp) });

  assert.ok(digest.includes(line1), 'first line (fits under the per-note cap) is kept whole');
  assert.ok(!digest.includes(line2), 'second line (would exceed the per-note cap) is dropped whole');
  assert.ok(!digest.includes(line3), 'third line is dropped whole too');
  assert.ok(!digest.includes(DigestCaps.TRUNCATION_MARKER), 'no overall marker — purely the per-note bound at work');

  const start = digest.indexOf('## Preferences');
  const afterHeading = digest.slice(start);
  const sectionEnd = afterHeading.indexOf('\n\n');
  const section = sectionEnd === -1 ? afterHeading : afterHeading.slice(0, sectionEnd);
  assert.ok(
    Buffer.byteLength(section, 'utf8') <= DigestCaps.MAX_NOTE_BYTES,
    'note contribution stays within MAX_NOTE_BYTES'
  );
});

test('more than MAX_PROJECTS project dirs render at most MAX_PROJECTS lines plus a deterministic "…and N more" line', () => {
  const tmp = tmpVault();
  const projDir = path.join(tmp, '01-Projects');
  fs.mkdirSync(projDir, { recursive: true });
  const total = DigestCaps.MAX_PROJECTS + 7;
  for (let i = 0; i < total; i++) {
    fs.mkdirSync(path.join(projDir, `proj-${String(i).padStart(3, '0')}`));
  }

  const digest = renderDigest(tmp, undefined, { identityApprovals: approvals(tmp) });
  assert.ok(digest.includes('## Active projects'), 'projects section present');
  const overflowLine = `- …and ${total - DigestCaps.MAX_PROJECTS} more`;
  assert.ok(digest.includes(overflowLine), `expected deterministic overflow line ${JSON.stringify(overflowLine)}`);

  const start = digest.indexOf('## Active projects');
  const afterHeading = digest.slice(start);
  const sectionEnd = afterHeading.indexOf('\n\n');
  const section = sectionEnd === -1 ? afterHeading : afterHeading.slice(0, sectionEnd);
  const projectLines = section.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(
    projectLines.length,
    DigestCaps.MAX_PROJECTS + 1,
    'MAX_PROJECTS name lines + exactly one overflow line'
  );
});

test('with over-cap content AND active banners, all banner lines are still present (prefix preserved)', () => {
  const tmp = tmpVault();
  const items = [];
  for (let i = 0; i < 300; i++) items.push(`- item ${i}`);
  const note =
    '---\nid: i\ntype: identity\norigin: interview\nstatus: active\n---\n\n' +
    `# Standing instructions\n\n${items.join('\n')}\n`;
  fs.writeFileSync(path.join(tmp, '06-Identity', 'instructions.md'), note);

  const alerts = [{ job: 'dream', at: '2026-07-04T03:30:00.000Z', reason: 'boom', log_hint: 'logs/dream/' }];
  const updateLine = '> [!note] update available';
  const digest = renderDigest(tmp, undefined, {
    identityApprovals: approvals(tmp),
    alerts,
    updateLine,
  });

  assert.ok(digest.includes('has failed'), 'alert banner preserved under over-cap content');
  assert.ok(digest.includes(updateLine), 'update banner preserved under over-cap content');
  assert.ok(digest.includes(DigestCaps.TRUNCATION_MARKER), 'truncation marker present');
  const lines = digest.split('\n');
  assert.ok(lines.length <= DigestCaps.MAX_LINES + 1, 'overall line cap still enforced with banners active');
});
