'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const { appendAlert, readAlerts, clearAlerts, ALERTS_FILE } = require('../../src/core/alerts');
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
