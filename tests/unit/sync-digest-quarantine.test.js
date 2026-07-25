'use strict';

// WP-secret-revert-defers-ledger: ADR-0023 requires the transcript-quarantine
// banner to be re-rendered in EVERY digest while a quarantine is active, but
// `sync` re-rendered state/digest.md without passing `quarantineLine` at all —
// so any `wienerdog sync` silently erased the banner until the next dream. This
// is the executable regression: a grep proving a call site exists does not prove
// the banner survives a sync. Fully hermetic (the sync-repoint harness): temp
// HOME + WIENERDOG_HOME, WIENERDOG_LOADER_NOOP=1 so no launchctl/systemctl
// spawns, harness dirs pointed at absent paths, a saved manifest, stdout
// silenced, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { getPaths } = require('../../src/core/paths');
const manifestLib = require('../../src/core/manifest');
const ledgerLib = require('../../src/core/dream/ledger');
const sync = require('../../src/cli/sync');

// Hermeticity: CI sets XDG_CONFIG_HOME to the real ~/.config, which
// systemdUserDir() prefers over $HOME. Unset it (this file runs in its own
// `node --test` process) so nothing resolves under a real dir.
delete process.env.XDG_CONFIG_HOME;

/** @param {string} c @returns {string} */
function sha256(c) {
  return crypto.createHash('sha256').update(c).digest('hex');
}

/** Isolated temp core + an existing vault + matching manifest + absent harness dirs. */
function setup() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-syncq-')));
  const vault = path.join(root, 'vault');
  fs.mkdirSync(vault, { recursive: true });
  const env = {
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'wd'),
    CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
    CODEX_HOME: path.join(root, 'absent-codex'),
  };
  const paths = getPaths(env);
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  const cfg = `version: 1\nvault: ${vault}\n`;
  fs.writeFileSync(paths.config, cfg);
  manifestLib.save(paths, {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [{ kind: 'dir', path: paths.core }, { kind: 'file', path: paths.config, hash: sha256(cfg) }],
  });
  return { root, env, paths, vault };
}

/** Run sync.run with process.env pointed at the temp core and the loader no-op set. */
async function runSync(env, argv = []) {
  const savedKeys = ['HOME', 'WIENERDOG_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'WIENERDOG_LOADER_NOOP'];
  const saved = Object.fromEntries(savedKeys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, env, { WIENERDOG_LOADER_NOOP: '1' });
  const origWrite = process.stdout.write.bind(process.stdout);
  const origLog = console.log;
  console.log = () => {};
  process.stdout.write = () => true;
  try {
    await sync.run(argv, { interactive: false });
  } finally {
    process.stdout.write = origWrite;
    console.log = origLog;
    for (const k of savedKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

/** A discovery record for a synthetic transcript path. @param {string} p @returns {object} */
function disc(p) {
  return { harness: 'claude', path: p, mtimeMs: 1000, size: 64, dev: 7, ino: 42 };
}

test('sync-digest-quarantine: sync re-renders BOTH transcript-quarantine banners into the digest', async () => {
  const { env, paths } = setup();

  // One intake quarantine and one secret-revert exhaustion, as a machine that
  // hit the 2026-07-24/25 bug would carry.
  let ledger = ledgerLib.recordQuarantined(ledgerLib.readLedger(paths.state), disc('/tmp/proj/huge.jsonl'), 'over-ceiling');
  ledger = ledgerLib.recordSecretExhausted(ledger, disc('/tmp/proj/spent.jsonl'));
  ledgerLib.writeLedger(paths.state, ledger);

  // Pre-write a digest carrying NEITHER banner, so the assertions below prove
  // sync REGENERATED it rather than left it alone — the direct regression for
  // the erased-banner bug.
  const digestPath = path.join(paths.state, 'digest.md');
  fs.writeFileSync(digestPath, '# stale digest with no banner\n');

  await runSync(env);

  const digest = fs.readFileSync(digestPath, 'utf8');
  assert.ok(!digest.includes('stale digest'), 'sync regenerated the digest');
  assert.ok(digest.includes('could not be read and were skipped'), 'the intake banner survives a sync');
  assert.ok(digest.includes('huge.jsonl (over-ceiling)'), 'it names the sanitized basename + reason');
  assert.ok(digest.includes('are no longer being dreamed over'), 'the exhausted banner survives a sync');
  assert.ok(digest.includes('spent.jsonl'), 'it names the sanitized basename');
  // Ledger-derived only: no full path, no content, no matched value.
  assert.ok(!digest.includes('/tmp/proj/'), 'the banner carries no full path');
});

test('sync-digest-quarantine: sync reads the ledger and never writes it (nothing clears the bound)', async () => {
  const { env, paths } = setup();
  let ledger = ledgerLib.recordSecretDeferred(ledgerLib.readLedger(paths.state), disc('/tmp/proj/pending.jsonl'), 2);
  ledger = ledgerLib.recordSecretExhausted(ledger, disc('/tmp/proj/spent.jsonl'));
  ledgerLib.writeLedger(paths.state, ledger);
  const ledgerPath = ledgerLib.ledgerPath(paths.state);
  const before = fs.readFileSync(ledgerPath);

  await runSync(env);
  await runSync(env); // and a second, scripted-looking run

  assert.ok(fs.readFileSync(ledgerPath).equals(before), 'transcript-ledger.json is byte-identical after sync');
  const back = ledgerLib.readLedger(paths.state);
  assert.equal(back.files[ledgerLib.foldKey('/tmp/proj/pending.jsonl')].deferrals, 2, 'the deferral counter is untouched');
  assert.equal(
    back.files[ledgerLib.foldKey('/tmp/proj/spent.jsonl')].reason,
    ledgerLib.SECRET_REVERT_EXHAUSTED_REASON,
    'the exhausted quarantine is untouched'
  );
});

test('sync-digest-quarantine: a missing or corrupt ledger renders no banner and never fails the sync', async () => {
  // readLedger is total: missing/corrupt → an empty ledger → an empty banner,
  // which renderDigest's filter drops. A sync must never throw on it.
  const a = setup();
  assert.equal(fs.existsSync(ledgerLib.ledgerPath(a.paths.state)), false);
  await runSync(a.env);
  const missing = fs.readFileSync(path.join(a.paths.state, 'digest.md'), 'utf8');

  const b = setup();
  fs.writeFileSync(ledgerLib.ledgerPath(b.paths.state), '{ broken');
  await runSync(b.env);
  const corrupt = fs.readFileSync(path.join(b.paths.state, 'digest.md'), 'utf8');

  for (const digest of [missing, corrupt]) {
    assert.ok(!digest.includes('could not be read and were skipped'));
    assert.ok(!digest.includes('are no longer being dreamed over'));
  }
});
