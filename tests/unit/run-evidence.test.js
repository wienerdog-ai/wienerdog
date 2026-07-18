'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { recordRunEvidence, EVIDENCE_FILE, MAX_RECORDS } = require('../../src/core/run-evidence');

const POSIX = process.platform !== 'win32';

/** @returns {{state:string}} minimal paths over a fresh temp root */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-evidence-'));
  return { state: path.join(root, 'state') };
}

/** A representative evidence record. @returns {object} */
function sampleRecord(overrides = {}) {
  return {
    at: '2026-07-18T02:00:00.000Z',
    job: 'dream',
    profileId: 'dream',
    claudeVersion: '2.1.214 (Claude Code)',
    execPath: 'claude',
    argv: ['-p', '/wienerdog-dream\nprompt text', '--tools', 'Read,Write', '--settings', '/s.json',
      '--append-system-prompt', '# skill body'],
    settingsDigest: 'a'.repeat(64),
    mcpDigest: 'none',
    policyHooks: { present: false, sources: [] },
    ...overrides,
  };
}

/** @param {{state:string}} paths @returns {object[]} parsed evidence records */
function readRecords(paths) {
  const text = fs.readFileSync(path.join(paths.state, EVIDENCE_FILE), 'utf8');
  return text.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
}

test('run-evidence: appends a complete record with every contract field', () => {
  const paths = tempPaths();
  recordRunEvidence(paths, sampleRecord());
  const [rec] = readRecords(paths);
  assert.equal(rec.job, 'dream');
  assert.equal(rec.profileId, 'dream');
  assert.equal(rec.claudeVersion, '2.1.214 (Claude Code)');
  assert.equal(rec.execPath, 'claude');
  assert.equal(rec.settingsDigest, 'a'.repeat(64));
  assert.equal(rec.mcpDigest, 'none');
  assert.deepEqual(rec.policyHooks, { present: false, sources: [] });
  // No field is (or implies) a content hash of the claude binary (A7's job).
  assert.ok(!('binaryHash' in rec) && !('execDigest' in rec));
});

test('run-evidence: free-text argv values are reduced to sha256 — never stored raw', () => {
  const paths = tempPaths();
  const secretPrompt = '/wienerdog-dream staged content with sk-ant-abcdefghijklmnopqrstuvwx0123 inside';
  const skillBody = '# skill body with OPENAI_API_KEY=sk-proj-ABCDEF0123456789abcdef';
  recordRunEvidence(paths, sampleRecord({ argv: ['-p', secretPrompt, '--tools', 'Read', '--append-system-prompt', skillBody] }));

  const raw = fs.readFileSync(path.join(paths.state, EVIDENCE_FILE), 'utf8');
  assert.ok(!raw.includes('sk-ant-abcdefghijklmnopqrstuvwx0123'), 'prompt secret never reaches the file');
  assert.ok(!raw.includes('sk-proj-ABCDEF0123456789abcdef'), 'skill-body secret never reaches the file');
  assert.ok(!raw.includes('staged content'), 'prompt text never stored raw');

  const [rec] = readRecords(paths);
  const expectPrompt = `sha256:${crypto.createHash('sha256').update(secretPrompt).digest('hex')}`;
  const expectBody = `sha256:${crypto.createHash('sha256').update(skillBody).digest('hex')}`;
  assert.equal(rec.argv[rec.argv.indexOf('-p') + 1], expectPrompt);
  assert.equal(rec.argv[rec.argv.indexOf('--append-system-prompt') + 1], expectBody);
  // Code-owned flags/values are recorded verbatim.
  assert.equal(rec.argv[rec.argv.indexOf('--tools') + 1], 'Read');
});

test('run-evidence: the file is 0600 and its dir 0700 under a permissive umask', { skip: !POSIX }, () => {
  const prev = process.umask(0o000);
  try {
    const paths = tempPaths();
    recordRunEvidence(paths, sampleRecord());
    const file = path.join(paths.state, EVIDENCE_FILE);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(paths.state).mode & 0o777, 0o700);
  } finally {
    process.umask(prev);
  }
});

test('run-evidence: bounded — the oldest records are dropped over the cap', () => {
  const paths = tempPaths();
  for (let i = 0; i < MAX_RECORDS + 10; i++) {
    recordRunEvidence(paths, sampleRecord({ at: `run-${i}` }));
  }
  const records = readRecords(paths);
  assert.equal(records.length, MAX_RECORDS);
  assert.equal(records[0].at, 'run-10', 'oldest dropped');
  assert.equal(records[records.length - 1].at, `run-${MAX_RECORDS + 9}`, 'newest kept');
});

test('run-evidence: never throws — a bad paths target or a garbage record is swallowed', () => {
  // state path collides with an existing FILE → mkdir fails → swallowed.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-evidence-'));
  const blocker = path.join(root, 'state');
  fs.writeFileSync(blocker, 'i am a file, not a dir');
  assert.doesNotThrow(() => recordRunEvidence({ state: blocker + '/sub' }, sampleRecord()));
  // Garbage records are coerced, never thrown on.
  const paths = tempPaths();
  assert.doesNotThrow(() => recordRunEvidence(paths, null));
  assert.doesNotThrow(() => recordRunEvidence(paths, { argv: 'not-an-array', policyHooks: 42 }));
  const records = readRecords(paths);
  assert.equal(records.length, 2);
  assert.deepEqual(records[1].argv, []);
  assert.deepEqual(records[1].policyHooks, { present: false, sources: [] });
});
