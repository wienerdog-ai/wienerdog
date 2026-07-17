'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const {
  appendAlert,
  readAlerts,
  clearAlerts,
  ALERTS_FILE,
  MAX_ALERTS,
  MAX_FIELD_CHARS,
  MAX_FILE_BYTES,
} = require('../../src/core/alerts');
const { renderDigest } = require('../../src/core/digest');

/** Isolated temp core; state/ is created lazily by appendAlert. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-alerts-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  return { root, paths };
}

/** @param {string} job */
function rec(job, at, reason) {
  return { job, at, reason, log_hint: `~/.wienerdog/logs/${job}/` };
}

// -------------------------------------------------------------------------
// alerts module
// -------------------------------------------------------------------------

test('alerts: appendAlert creates state/alerts.jsonl and appends one line each', () => {
  const { paths } = setup();
  assert.deepEqual(readAlerts(paths), [], 'missing file → []');

  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'));
  appendAlert(paths, rec('dream', '2026-07-04T02:00:00.000Z', 'exited 1'));

  const file = path.join(paths.state, ALERTS_FILE);
  assert.ok(fs.existsSync(file), 'alerts.jsonl created');
  assert.equal(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length, 2, 'two lines');

  const got = readAlerts(paths);
  assert.equal(got.length, 2);
  assert.equal(got[0].at, '2026-07-04T01:00:00.000Z', 'oldest first');
  assert.equal(got[1].at, '2026-07-04T02:00:00.000Z');
});

test('alerts: readAlerts skips malformed lines and blank lines', () => {
  const { paths } = setup();
  fs.mkdirSync(paths.state, { recursive: true });
  const file = path.join(paths.state, ALERTS_FILE);
  fs.writeFileSync(
    file,
    [
      JSON.stringify(rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1')),
      'not json at all',
      '',
      '   ',
      JSON.stringify(rec('digest', '2026-07-04T07:00:00.000Z', 'exited 2')),
    ].join('\n') + '\n'
  );
  const got = readAlerts(paths);
  assert.equal(got.length, 2, 'malformed and blank lines skipped');
  assert.deepEqual(
    got.map((a) => a.job),
    ['dream', 'digest']
  );
});

test('alerts: clearAlerts removes only that job and deletes the file when empty', () => {
  const { paths } = setup();
  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'));
  appendAlert(paths, rec('digest', '2026-07-04T07:00:00.000Z', 'exited 2'));
  appendAlert(paths, rec('dream', '2026-07-04T02:00:00.000Z', 'exited 1'));

  clearAlerts(paths, 'dream');
  const after = readAlerts(paths);
  assert.deepEqual(
    after.map((a) => a.job),
    ['digest'],
    "only the cleared job's lines removed"
  );
  assert.ok(fs.existsSync(path.join(paths.state, ALERTS_FILE)), 'file remains while other alerts exist');

  clearAlerts(paths, 'digest');
  assert.deepEqual(readAlerts(paths), []);
  assert.ok(!fs.existsSync(path.join(paths.state, ALERTS_FILE)), 'file deleted when no alerts remain');

  // Clearing a job with no alerts / a missing file is a no-op that never throws.
  assert.doesNotThrow(() => clearAlerts(paths, 'ghost'));
});

// -------------------------------------------------------------------------
// bound + schema-cap (WP-096)
// -------------------------------------------------------------------------

test('alerts: appending past MAX_ALERTS keeps only the newest N, in chronological order', () => {
  const { paths } = setup();
  const total = MAX_ALERTS + 5;
  for (let i = 0; i < total; i += 1) {
    appendAlert(paths, rec('dream', `2026-01-01T00:00:${String(i).padStart(4, '0')}Z`, `failure ${i}`));
  }
  const got = readAlerts(paths);
  assert.equal(got.length, MAX_ALERTS, 'exactly MAX_ALERTS retained');
  assert.equal(got[0].reason, 'failure 5', 'oldest surviving record is the 6th appended (0-indexed 5)');
  assert.equal(got[got.length - 1].reason, `failure ${total - 1}`, 'newest record retained');
  const ats = got.map((a) => a.at);
  const sorted = [...ats].sort();
  assert.deepEqual(ats, sorted, 'chronological order preserved');
});

test('alerts: a field longer than MAX_FIELD_CHARS is stored/returned truncated', () => {
  const { paths } = setup();
  const longReason = 'r'.repeat(MAX_FIELD_CHARS + 500);
  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z', longReason));
  const got = readAlerts(paths);
  assert.equal(got.length, 1);
  assert.equal(got[0].reason.length, MAX_FIELD_CHARS);
  assert.equal(got[0].reason, longReason.slice(0, MAX_FIELD_CHARS));
});

test('alerts: unknown keys are dropped and missing fields read back as empty string', () => {
  const { paths } = setup();
  fs.mkdirSync(paths.state, { recursive: true });
  const file = path.join(paths.state, ALERTS_FILE);
  fs.writeFileSync(file, `${JSON.stringify({ job: 'dream', extra: 'nope' })}\n`);
  const got = readAlerts(paths);
  assert.equal(got.length, 1);
  assert.deepEqual(got[0], { job: 'dream', at: '', reason: '', log_hint: '' });
});

test('alerts: a valid-JSON primitive line does not crash and reads back as an empty-fields record', () => {
  const { paths } = setup();
  fs.mkdirSync(paths.state, { recursive: true });
  const file = path.join(paths.state, ALERTS_FILE);
  fs.writeFileSync(file, ['null', '42', '"x"', '[]'].join('\n') + '\n');
  const got = readAlerts(paths);
  assert.equal(got.length, 4, 'all four primitive lines parse without throwing');
  for (const a of got) {
    assert.deepEqual(a, { job: '', at: '', reason: '', log_hint: '' });
  }
});

test('alerts: a huge malformed line is compacted away on the next append (byte bound)', () => {
  const { paths } = setup();
  fs.mkdirSync(paths.state, { recursive: true });
  const file = path.join(paths.state, ALERTS_FILE);
  const garbage = 'x'.repeat(MAX_FILE_BYTES + 1000); // not valid JSON, terminated
  fs.writeFileSync(file, `${garbage}\n`);
  assert.ok(fs.statSync(file).size > MAX_FILE_BYTES, 'precondition: file already over the byte bound');

  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z', 'fresh failure'));

  const size = fs.statSync(file).size;
  assert.ok(size <= MAX_FILE_BYTES, 'file compacted back under the byte bound');
  const got = readAlerts(paths);
  assert.equal(got.length, 1, 'the malformed line is gone; only the just-appended record remains');
  assert.equal(got[0].reason, 'fresh failure');
});

test('alerts: appending onto an oversized malformed UNTERMINATED tail survives and is the single retained record', () => {
  const { paths } = setup();
  fs.mkdirSync(paths.state, { recursive: true });
  const file = path.join(paths.state, ALERTS_FILE);
  const garbage = 'x'.repeat(MAX_FILE_BYTES + 1000); // no trailing newline
  fs.writeFileSync(file, garbage);
  assert.ok(fs.statSync(file).size > MAX_FILE_BYTES, 'precondition: file already over the byte bound');
  assert.notEqual(fs.readFileSync(file, 'utf8').slice(-1), '\n', 'precondition: unterminated');

  appendAlert(paths, rec('dream', '2026-07-04T02:00:00.000Z', 'newest survives'));

  const got = readAlerts(paths);
  assert.equal(got.length, 1, 'the just-appended alert is the single retained record');
  assert.equal(got[0].reason, 'newest survives');
  assert.ok(fs.statSync(file).size <= MAX_FILE_BYTES);
});

test('alerts: large-field records drive bytes over MAX_FILE_BYTES; compaction keeps fewer than MAX_ALERTS and stays within MAX_FILE_BYTES', () => {
  const { paths } = setup();
  const bigField = 'y'.repeat(MAX_FIELD_CHARS - 20);
  const count = 100; // 100 * ~6KB records (job/reason/log_hint all near MAX_FIELD_CHARS) ≈ 600KB, over the 512KB bound, well under MAX_ALERTS
  for (let i = 0; i < count; i += 1) {
    appendAlert(paths, {
      job: bigField,
      at: `2026-07-04T${String(i).padStart(3, '0')}:00:00.000Z`,
      reason: bigField,
      log_hint: bigField,
    });
  }
  const file = path.join(paths.state, ALERTS_FILE);
  const size = fs.statSync(file).size;
  assert.ok(size <= MAX_FILE_BYTES, 'rewritten file never exceeds MAX_FILE_BYTES');
  const got = readAlerts(paths);
  assert.ok(got.length < count, 'some older large-field records were dropped');
  assert.ok(got.length < MAX_ALERTS, 'byte budget bites well before the count budget');
  assert.equal(got[got.length - 1].at, `2026-07-04T${String(count - 1).padStart(3, '0')}:00:00.000Z`, 'newest record retained');
});

test('alerts: readAlerts tail window beginning exactly on a line boundary keeps the first complete record', () => {
  const { paths } = setup();
  fs.mkdirSync(paths.state, { recursive: true });
  const file = path.join(paths.state, ALERTS_FILE);

  // Build N fixed-length lines (each exactly LINE_LEN bytes including its trailing
  // newline) such that LINE_LEN divides MAX_FILE_BYTES. Then any file made of these
  // lines whose total size exceeds MAX_FILE_BYTES puts the tail-read boundary exactly
  // on a newline — precedingIsNewline is true, and the first line inside the window
  // is a complete record that must be kept.
  const LINE_LEN = 1024;
  assert.equal(MAX_FILE_BYTES % LINE_LEN, 0, 'LINE_LEN must divide MAX_FILE_BYTES for this construction');
  const base = JSON.stringify({ job: 'j', at: '000', reason: '', log_hint: 'h' });
  const padLen = LINE_LEN - 1 - base.length; // -1 for the trailing '\n'
  const lineFor = (i) =>
    JSON.stringify({ job: 'j', at: String(i).padStart(3, '0'), reason: 'x'.repeat(padLen), log_hint: 'h' }) + '\n';

  const windowLines = MAX_FILE_BYTES / LINE_LEN; // 512
  const total = windowLines + 1; // 513: guarantees size > MAX_FILE_BYTES and boundary alignment
  let content = '';
  for (let i = 0; i < total; i += 1) {
    const line = lineFor(i);
    assert.equal(Buffer.byteLength(line), LINE_LEN, 'sanity: every line is exactly LINE_LEN bytes');
    content += line;
  }
  fs.writeFileSync(file, content);
  assert.ok(fs.statSync(file).size > MAX_FILE_BYTES, 'precondition: oversized file');

  const got = readAlerts(paths);
  assert.equal(got.length, windowLines, 'the whole aligned window of complete records is kept');
  assert.equal(got[0].at, '001', 'first complete record in the window (line index 1) is kept, not dropped');
  assert.equal(got[got.length - 1].at, String(total - 1).padStart(3, '0'), 'last line kept');
});

test('alerts: readAlerts returns [] and does not throw when alerts.jsonl is a directory (fstat/read error after open)', () => {
  const { paths } = setup();
  fs.mkdirSync(paths.state, { recursive: true });
  // Create alerts.jsonl AS A DIRECTORY: openSync('r') succeeds on a dir, but the
  // subsequent fstat-driven readSync throws EISDIR. The read logic must catch that
  // and return [] (resilient), not crash digest generation.
  fs.mkdirSync(path.join(paths.state, ALERTS_FILE), { recursive: true });
  let got;
  assert.doesNotThrow(() => {
    got = readAlerts(paths);
  }, 'a read error after a successful open must not escape');
  assert.deepEqual(got, [], 'unreadable path → []');
});

test('alerts: atomic-append ordering keeps the appending process\'s own record after compaction (concurrency mitigation)', () => {
  const { paths } = setup();
  // Fill to the count bound so the NEXT append takes the compaction (read-rewrite-rename)
  // path. Because the record is appended atomically BEFORE the compaction rewrite, the
  // just-appended record must be present (and newest) after append-then-compact.
  for (let i = 0; i < MAX_ALERTS; i += 1) {
    appendAlert(paths, rec('dream', `2026-01-01T00:00:${String(i).padStart(4, '0')}Z`, `old ${i}`));
  }
  appendAlert(paths, rec('digest', '2026-02-02T00:00:00.000Z', 'the newest failure'));
  const got = readAlerts(paths);
  assert.equal(got.length, MAX_ALERTS, 'compaction ran (still capped at MAX_ALERTS)');
  const newest = got[got.length - 1];
  assert.equal(newest.job, 'digest', "the appending process's own record survives compaction");
  assert.equal(newest.reason, 'the newest failure');
  assert.ok(
    got.some((a) => a.job === 'digest' && a.reason === 'the newest failure'),
    'newest record present in the rewritten file'
  );
});

test('alerts: appendAlert does NOT empty the log when the post-append read-back fails (empty-read guard)', () => {
  const { paths } = setup();
  fs.mkdirSync(paths.state, { recursive: true });
  const file = path.join(paths.state, ALERTS_FILE);

  // Pre-fill with an OVERSIZED but valid log so that, were compaction to run, the
  // `size > MAX_FILE_BYTES` branch would fire. Without the guard, a failed read-back
  // (readAlerts → []) would serialize the empty set to "\n" and rename it over the log,
  // silently deleting every alert. The guard must leave the atomically-appended file
  // intact instead.
  const priorLine = JSON.stringify(rec('dream', '2026-07-04T01:00:00.000Z', 'y'.repeat(MAX_FIELD_CHARS - 20))) + '\n';
  let prior = '';
  while (Buffer.byteLength(prior) <= MAX_FILE_BYTES) prior += priorLine;
  fs.writeFileSync(file, prior);
  assert.ok(fs.statSync(file).size > MAX_FILE_BYTES, 'precondition: oversized file (compaction branch would fire)');

  // Simulate an appendable-but-unreadable file: fstatSync (called ONLY by readAlerts,
  // on its open fd) throws, so the post-append read-back returns []. append/statSync/
  // writeFileSync are untouched. Deterministic and portable (no root/chmod dependence).
  const realFstatSync = fs.fstatSync;
  fs.fstatSync = () => {
    throw Object.assign(new Error('simulated I/O error'), { code: 'EIO' });
  };
  try {
    appendAlert(paths, rec('digest', '2026-07-04T07:00:00.000Z', 'newest fail-loud alert'));
  } finally {
    fs.fstatSync = realFstatSync;
  }

  const raw = fs.readFileSync(file, 'utf8');
  assert.notEqual(raw.trim(), '', 'log must NOT be emptied by a failed read-back');
  assert.ok(raw.includes('newest fail-loud alert'), 'the just-appended alert survived on disk');
  assert.ok(raw.includes('2026-07-04T01:00:00.000Z'), 'prior alerts were not clobbered');
  // With the read restored, the file reads back and contains the newest alert.
  const got = readAlerts(paths);
  assert.ok(
    got.some((a) => a.job === 'digest' && a.reason === 'newest fail-loud alert'),
    'newest alert readable after the transient read failure clears'
  );
});

// -------------------------------------------------------------------------
// digest alert-block render (renderDigest opts.alerts)
// -------------------------------------------------------------------------

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'identity-filled');

test('alerts: renderDigest with empty/absent alerts equals the plain digest (golden unchanged)', () => {
  const plain = renderDigest(FIXTURE);
  assert.equal(renderDigest(FIXTURE, undefined, { alerts: [] }), plain, 'empty alerts → unchanged');
  assert.equal(renderDigest(FIXTURE, undefined, {}), plain, 'absent alerts → unchanged');
});

test('alerts: renderDigest prepends one plain-text warning line per failing job', () => {
  const alerts = [
    rec('dream', '2026-07-04T01:30:05.551Z', 'job "dream" exited 1'),
    rec('dream', '2026-07-04T02:30:05.551Z', 'job "dream" exited 1'),
    { job: 'dream', at: '2026-07-04T03:30:05.551Z', reason: 'job "dream" timed out', log_hint: '~/.wienerdog/logs/dream/' },
  ];
  const out = renderDigest(FIXTURE, undefined, { alerts });
  const plain = renderDigest(FIXTURE);
  assert.ok(out.endsWith(plain), 'the plain digest body is preserved below the block');

  const firstLine = out.split('\n')[0];
  assert.match(firstLine, /^> \[!warning\] Wienerdog: the "dream" job has failed 3 times since 2026-07-04T01:30:05\.551Z\./);
  assert.match(firstLine, /Latest error: job "dream" timed out\./, 'latest reason wins');
  assert.match(firstLine, /Details in ~\/\.wienerdog\/logs\/dream\/\./);
  assert.match(firstLine, /clears automatically when the job next succeeds\.$/);
});

test('alerts: renderDigest groups multiple failing jobs, one line each, singular vs plural', () => {
  const alerts = [
    rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'),
    rec('digest', '2026-07-04T07:00:00.000Z', 'exited 2'),
  ];
  const block = renderDigest(FIXTURE, undefined, { alerts }).split('\n\n')[0];
  const lines = block.split('\n');
  assert.equal(lines.length, 2, 'one line per job');
  assert.match(lines[0], /the "dream" job has failed\. Latest error: exited 1\./, 'single failure → singular "has failed"');
  assert.match(lines[1], /the "digest" job has failed\. Latest error: exited 2\./);
});

// -------------------------------------------------------------------------
// EP3 secret scrub (WP-124, ADR-0024)
// -------------------------------------------------------------------------

test('alerts: a reason carrying a secret is stored redacted in alerts.jsonl and reads back redacted (WP-124)', () => {
  const { paths } = setup();
  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z',
    'dream brain exited 1: fatal: OPENAI_API_KEY=sk-proj-ABCDEF0123456789abcdef rejected'));

  const raw = fs.readFileSync(path.join(paths.state, ALERTS_FILE), 'utf8');
  assert.ok(!raw.includes('sk-proj-ABCDEF0123456789abcdef'), 'raw secret must not persist to disk');
  assert.ok(raw.includes('[REDACTED:'), raw);

  const got = readAlerts(paths);
  assert.equal(got.length, 1);
  assert.ok(!got[0].reason.includes('sk-proj-ABCDEF0123456789abcdef'));
  assert.ok(got[0].reason.includes('dream brain exited 1'), 'code-owned prefix preserved');
});

test('alerts: renderDigest built from a secret-bearing alert carries no secret (WP-124)', () => {
  const { paths } = setup();
  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z',
    'dream brain exited 1: token ghp_a1B2a1B2a1B2a1B2a1B2a1B2a1B2a1B2a1B2 invalid'));
  const out = renderDigest(FIXTURE, undefined, { alerts: readAlerts(paths) });
  assert.ok(!out.includes('ghp_a1B2a1B2a1B2a1B2a1B2a1B2a1B2a1B2a1B2'), 'digest banner must not carry the secret');
  assert.ok(out.includes('[REDACTED:'), 'redaction marker visible in the latest-error line');
});

test('alerts: alerts.jsonl ends 0600 after append and after compaction (WP-126)', { skip: process.platform === 'win32' }, () => {
  const { paths } = setup();
  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'));
  const file = path.join(paths.state, ALERTS_FILE);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'first append leaves 0600');
  assert.equal(fs.statSync(paths.state).mode & 0o777, 0o700, 'state dir is 0700');

  fs.chmodSync(file, 0o644); // legacy mode; the next compaction pass re-hardens
  for (let i = 0; i < MAX_ALERTS + 1; i += 1) {
    appendAlert(paths, rec('dream', `2026-07-04T01:00:${String(i % 60).padStart(2, '0')}.000Z`, 'exited 1'));
  }
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'compaction rewrite leaves 0600');
  assert.equal(readAlerts(paths).length, MAX_ALERTS, 'compaction bound unchanged');
});
