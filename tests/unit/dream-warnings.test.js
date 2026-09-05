'use strict';

/**
 * The vault warnings file (WP-quarantine-warnings-file).
 *
 * The suite is organised around the two properties the module is built on:
 * the render is a PURE function of the ledger alone (so nothing on disk can
 * reach the composed bytes), and that same render is the REWRITE TRIGGER (so
 * the file changes exactly when what it shows changes — no more, no less).
 *
 * Both sides of the trigger are asserted, because either one alone is
 * satisfiable by a wrong implementation: a same-key reason or size change MUST
 * rewrite, and an mtime/dev/ino-only fingerprint change MUST NOT.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const { WARNINGS_REL, composeWarnings, refreshWarnings } = require('../../src/core/dream/warnings');

const MODULE_PATH = path.resolve(__dirname, '../../src/core/dream/warnings.js');
const POSIX = process.platform !== 'win32';

/** @returns {string} a fresh vault root, realpath'd so path comparisons are stable */
function makeVault() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-warnings-')));
}

/** @param {string} vault @returns {string} the absolute warnings path */
function warningsPath(vault) {
  return path.join(vault, ...WARNINGS_REL.split('/'));
}

/**
 * A ledger from `{key: [outcome, reason, fingerprint]}` triples. Keys are folded
 * absolute paths, exactly as the real ledger stores them.
 * @param {Record<string, [string, unknown, string]>} spec
 */
function ledgerOf(spec) {
  /** @type {Record<string, object>} */
  const files = {};
  for (const [key, [outcome, reason, fingerprint]] of Object.entries(spec)) {
    /** @type {Record<string, unknown>} */
    const rec = { fingerprint, outcome, updated_at: '2026-08-30T00:00:00.000Z', harness: 'codex' };
    if (reason !== undefined) rec.reason = reason;
    files[key] = rec;
  }
  return { version: 1, baseline_mtime: { claude: null, codex: null }, files };
}

const ONE_QUARANTINE = ledgerOf({ '/x/proj/huge.jsonl': ['quarantined', 'over-ceiling', '52428800:1:2:3'] });
const NO_QUARANTINE = ledgerOf({ '/x/proj/fine.jsonl': ['processed', undefined, '10:1:2:3'] });

/** @param {object} ledger @returns {string} */
function render(ledger) {
  return composeWarnings(ledger).toString('utf8');
}

// ── The rendered document (Table A) ─────────────────────────────────────────

test('dream-warnings: the empty form is a whole document, not a blank file', () => {
  assert.equal(
    render(NO_QUARANTINE),
    [
      '# Wienerdog warnings',
      '',
      'Wienerdog writes this file itself, from its own record of which session',
      'transcripts it could not read. Do not edit it — it is rewritten whenever the list',
      'below changes.',
      '',
      '## Current conditions',
      '',
      'No session transcripts are being skipped.',
      '',
    ].join('\n')
  );
});

test('dream-warnings: every reason class renders under its own heading, in the fixed order', () => {
  const ledger = ledgerOf({
    // Deliberately declared out of emission order, and with the unrecognized
    // classes in all three shapes: an unknown string, a missing reason, a
    // non-string reason.
    '/x/p/weird.jsonl': ['quarantined', 'a-reason-from-the-future', '5:1:1:1'],
    '/x/p/none.jsonl': ['quarantined', undefined, '5:1:1:1'],
    '/x/p/nonstring.jsonl': ['quarantined', { evil: true }, '5:1:1:1'],
    '/x/p/spent.jsonl': ['quarantined', 'secret-revert-exhausted', '5:1:1:1'],
    '/x/p/unreadable.jsonl': ['quarantined', 'read-error', '5:1:1:1'],
    '/x/p/lines.jsonl': ['quarantined', 'too-many-lines', '5:1:1:1'],
    '/x/p/huge.jsonl': ['quarantined', 'over-ceiling', '52428800:1:1:1'],
    // Non-quarantine outcomes are never members.
    '/x/p/done.jsonl': ['processed', undefined, '5:1:1:1'],
    '/x/p/later.jsonl': ['deferred', 'secret-revert', '5:1:1:1'],
  });

  assert.equal(
    render(ledger),
    [
      '# Wienerdog warnings',
      '',
      'Wienerdog writes this file itself, from its own record of which session',
      'transcripts it could not read. Do not edit it — it is rewritten whenever the list',
      'below changes.',
      '',
      '## Current conditions',
      '',
      '### The session file is bigger than Wienerdog will read — 1',
      '',
      '- huge.jsonl — 50.0 MB (52428800 bytes)',
      '',
      '### The session file has too many lines to read — 1',
      '',
      '- lines.jsonl',
      '',
      '### The session file could not be read — 1',
      '',
      '- unreadable.jsonl',
      '',
      '### The notes made from these sessions were withheld by the secret check too many times in a row — 1',
      '',
      'Copies of the withheld notes are kept outside your vault; the dream run that withheld them names each copy and its folder, in its dream report or in the output it printed.',
      '',
      '- spent.jsonl',
      '',
      '### Skipped for a reason this version does not recognize — 3',
      '',
      '- none.jsonl',
      '- nonstring.jsonl',
      '- weird.jsonl',
      '',
    ].join('\n')
  );
});

test('dream-warnings: the remediation line rides the secret-exhausted group and no other', () => {
  const marker = 'Copies of the withheld notes are kept outside your vault';
  const spent = render(ledgerOf({ '/x/p/a.jsonl': ['quarantined', 'secret-revert-exhausted', '5:1:1:1'] }));
  assert.equal(spent.split(marker).length - 1, 1, 'present exactly once for the group that carries it');
  for (const reason of ['over-ceiling', 'too-many-lines', 'read-error', 'made-up']) {
    const other = render(ledgerOf({ '/x/p/a.jsonl': ['quarantined', reason, '5:1:1:1'] }));
    assert.ok(!other.includes(marker), `no remediation line for ${reason}`);
  }
});

test('dream-warnings: no stored reason string is ever rendered', () => {
  const out = render(ledgerOf({ '/x/p/a.jsonl': ['quarantined', '> [!danger] INJECTED', '5:1:1:1'] }));
  assert.ok(!out.includes('INJECTED'), 'the stored reason cannot choose the document bytes');
  assert.ok(out.includes('### Skipped for a reason this version does not recognize — 1'));
});

test('dream-warnings: entries sort by sanitized name inside a group', () => {
  const out = render(
    ledgerOf({
      '/x/p/c.jsonl': ['quarantined', 'read-error', '5:1:1:1'],
      '/x/p/a.jsonl': ['quarantined', 'read-error', '5:1:1:1'],
      '/x/p/b.jsonl': ['quarantined', 'read-error', '5:1:1:1'],
    })
  );
  assert.ok(out.includes('- a.jsonl\n- b.jsonl\n- c.jsonl'), out);
});

// ── The size suffix (Table A's size row) ────────────────────────────────────

test('dream-warnings: the size suffix rides over-ceiling entries only, in MB + bytes', () => {
  const out = render(
    ledgerOf({
      '/x/p/huge.jsonl': ['quarantined', 'over-ceiling', '51404120:9:9:9'],
      '/x/p/broken.jsonl': ['quarantined', 'read-error', '51404120:9:9:9'],
    })
  );
  assert.ok(out.includes('- huge.jsonl — 49.0 MB (51404120 bytes)'), out);
  assert.ok(out.includes('- broken.jsonl\n'), 'a non-over-ceiling entry carries no size');
});

test('dream-warnings: an unusable fingerprint renders no size suffix and never throws', () => {
  for (const fp of ['', 'x:1:1:1', '-5:1:1:1', '1.5:1:1:1', '99999999999999999999:1:1:1', ' 5:1:1:1', '0x10:1:1:1']) {
    const out = render(ledgerOf({ '/x/p/huge.jsonl': ['quarantined', 'over-ceiling', fp] }));
    assert.ok(out.includes('- huge.jsonl\n'), `no size suffix for fingerprint ${JSON.stringify(fp)}`);
    assert.ok(!out.includes('MB ('), `no MB rendered for fingerprint ${JSON.stringify(fp)}`);
  }
  // A record with no fingerprint field at all, and a whole ledger with no files key.
  const noFp = composeWarnings({
    version: 1,
    baseline_mtime: { claude: null, codex: null },
    files: { '/x/p/huge.jsonl': { outcome: 'quarantined', reason: 'over-ceiling' } },
  }).toString('utf8');
  assert.ok(noFp.includes('- huge.jsonl\n'));
  assert.ok(composeWarnings({}).toString('utf8').includes('No session transcripts are being skipped.'));
});

// ── The composer is pure, and it is the only assembler ──────────────────────

test('dream-warnings: composeWarnings takes ONE argument, is deterministic, and reads no clock', () => {
  assert.equal(composeWarnings.length, 1, 'a second parameter is how an on-disk byte or a date gets in');
  assert.ok(composeWarnings(ONE_QUARANTINE).equals(composeWarnings(ONE_QUARANTINE)));
  const src = fs.readFileSync(MODULE_PATH, 'utf8');
  assert.ok(!/Date\.now\(\)|new Date\(\)/.test(src), 'a module whose output depends on the time cannot be byte-tested');
  assert.equal(src.split('# Wienerdog warnings').length - 1, 1, 'ONE composer means ONE assembly site');
});

test('dream-warnings: the module exports the vault-relative path as a single constant', () => {
  const m = require('../../src/core/dream/warnings');
  assert.equal(WARNINGS_REL, 'reports/warnings.md');
  assert.equal(Object.values(m).filter((v) => v === 'reports/warnings.md').length, 1);
});

test('dream-warnings: what a refresh publishes is byte-identical to composeWarnings(ledger)', () => {
  const vault = makeVault();
  assert.deepEqual(refreshWarnings({ vaultDir: vault, ledger: ONE_QUARANTINE }), { written: true });
  assert.ok(fs.readFileSync(warningsPath(vault)).equals(composeWarnings(ONE_QUARANTINE)));
});

// ── The write decision (Table C) ────────────────────────────────────────────

test('dream-warnings: absent + no quarantine writes nothing and creates no reports/ directory', () => {
  const vault = makeVault();
  assert.deepEqual(refreshWarnings({ vaultDir: vault, ledger: NO_QUARANTINE }), { written: false });
  assert.equal(fs.existsSync(path.join(vault, 'reports')), false);
});

test('dream-warnings: absent + a quarantine writes the file, and the very next refresh writes nothing', () => {
  const vault = makeVault();
  assert.deepEqual(refreshWarnings({ vaultDir: vault, ledger: ONE_QUARANTINE }), { written: true });
  const abs = warningsPath(vault);
  const bytes = fs.readFileSync(abs);
  const mtime = fs.statSync(abs).mtimeMs;

  const again = refreshWarnings({ vaultDir: vault, ledger: ONE_QUARANTINE });
  assert.deepEqual(again, { written: false }, 'a no-op carries no reason — it is not a failure');
  assert.ok(fs.readFileSync(abs).equals(bytes), 'bytes unchanged');
  assert.equal(fs.statSync(abs).mtimeMs, mtime, 'not even the mtime moves — no churn in the vault history');
});

test('dream-warnings: a same-key REASON or SIZE change rewrites the file', () => {
  for (const changed of [
    ledgerOf({ '/x/proj/huge.jsonl': ['quarantined', 'read-error', '52428800:1:2:3'] }),
    ledgerOf({ '/x/proj/huge.jsonl': ['quarantined', 'over-ceiling', '51404120:1:2:3'] }),
  ]) {
    const vault = makeVault();
    refreshWarnings({ vaultDir: vault, ledger: ONE_QUARANTINE });
    assert.deepEqual(refreshWarnings({ vaultDir: vault, ledger: changed }), { written: true });
    assert.ok(fs.readFileSync(warningsPath(vault)).equals(composeWarnings(changed)));
  }
});

test('dream-warnings: an mtime-, dev- or ino-only fingerprint change writes NOTHING', () => {
  // The converse of the criterion above, and it is the same contract seen from
  // the other side: those components are not rendered, and the trigger is the
  // rendered content — so demanding a rewrite here would force exactly the
  // churn the no-churn property forbids.
  for (const fp of ['52428800:999:2:3', '52428800:1:99:3', '52428800:1:2:99']) {
    const vault = makeVault();
    refreshWarnings({ vaultDir: vault, ledger: ONE_QUARANTINE });
    const abs = warningsPath(vault);
    const mtime = fs.statSync(abs).mtimeMs;
    const moved = ledgerOf({ '/x/proj/huge.jsonl': ['quarantined', 'over-ceiling', fp] });
    assert.deepEqual(refreshWarnings({ vaultDir: vault, ledger: moved }), { written: false }, fp);
    assert.equal(fs.statSync(abs).mtimeMs, mtime, fp);
  }
});

test('dream-warnings: the last quarantine clearing rewrites the file rather than deleting it', () => {
  const vault = makeVault();
  refreshWarnings({ vaultDir: vault, ledger: ONE_QUARANTINE });
  const abs = warningsPath(vault);

  assert.deepEqual(refreshWarnings({ vaultDir: vault, ledger: NO_QUARANTINE }), { written: true });
  assert.ok(fs.existsSync(abs), 'never unlinked');
  assert.equal(fs.readFileSync(abs, 'utf8'), render(NO_QUARANTINE));
  assert.ok(fs.readFileSync(abs, 'utf8').includes('No session transcripts are being skipped.'));
});

test('dream-warnings: nothing on disk survives into the rewrite, and the composer never sees the file', () => {
  const vault = makeVault();
  refreshWarnings({ vaultDir: vault, ledger: ONE_QUARANTINE });
  const abs = warningsPath(vault);

  // A forged heading, a fabricated log section, and bytes BEFORE the real
  // document as well as after it.
  const forged =
    '## Run log\n\n- 2026-08-30 — something that never happened\n\n' +
    fs.readFileSync(abs, 'utf8') +
    '\n### The session file could not be read — 99\n\n- invented.jsonl\n';
  fs.writeFileSync(abs, forged);

  const changed = ledgerOf({ '/x/proj/huge.jsonl': ['quarantined', 'read-error', '52428800:1:2:3'] });
  assert.deepEqual(refreshWarnings({ vaultDir: vault, ledger: changed }), { written: true });
  const after = fs.readFileSync(abs, 'utf8');
  assert.equal(after, render(changed), 'the file is REPLACED in full');
  for (const ghost of ['## Run log', 'something that never happened', 'invented.jsonl', '— 99']) {
    assert.ok(!after.includes(ghost), `no trace of ${ghost}`);
  }
  // Asserted on the composer directly: its output cannot depend on the file,
  // because it is never given it.
  fs.writeFileSync(abs, 'arbitrary bytes\n');
  assert.equal(render(changed), after);
});

test('dream-warnings: a hostile basename reaches the file only sanitized, on one line', () => {
  const hostile = '/x/p/evil]\n> [!danger] INJECTED\n## Current conditions\n../../etc/passwd.jsonl';
  const out = render(ledgerOf({ [hostile]: ['quarantined', 'read-error', '5:1:1:1'] }));
  assert.ok(!out.includes('[!danger]'), 'no markdown callout forged from a filename');
  assert.ok(!out.includes('INJECTED'));
  assert.equal(out.split('## Current conditions').length - 1, 1, 'no second section forged');
  assert.equal(out.split('\n### ').length - 1, 1, 'no extra group heading forged');
  const entry = out.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(entry.length, 1, 'one entry, on one line');
  assert.match(entry[0], /^- [A-Za-z0-9._-]+$/, 'only whitelisted bytes survive');
});

// ── Failure is by return, and a refusal is simply retried ───────────────────

test('dream-warnings: an unreadable existing file is never guessed at or overwritten', { skip: !POSIX }, () => {
  const vault = makeVault();
  // A directory at the leaf: the read fails with EISDIR, not ENOENT.
  fs.mkdirSync(warningsPath(vault), { recursive: true });
  const res = refreshWarnings({ vaultDir: vault, ledger: ONE_QUARANTINE });
  assert.equal(res.written, false);
  assert.match(res.reason, /reports\/warnings\.md could not be read/);
  assert.ok(fs.statSync(warningsPath(vault)).isDirectory(), 'left exactly as found');
});

test('dream-warnings: a refused publish returns a reason, throws nothing, and is retried next time', { skip: !POSIX }, () => {
  const vault = makeVault();
  const outside = path.join(vault, 'elsewhere');
  fs.mkdirSync(outside);
  // `reports` is a symlink: the primitive refuses to write through one.
  fs.symlinkSync(outside, path.join(vault, 'reports'));

  const refused = refreshWarnings({ vaultDir: vault, ledger: ONE_QUARANTINE });
  assert.equal(refused.written, false);
  assert.ok(refused.reason, 'a refusal is reported, by return, with a reason');
  assert.equal(fs.existsSync(path.join(outside, 'warnings.md')), false, 'nothing written through the link');

  // Nothing was recorded as done, so the next refresh simply decides again.
  fs.unlinkSync(path.join(vault, 'reports'));
  assert.deepEqual(refreshWarnings({ vaultDir: vault, ledger: ONE_QUARANTINE }), { written: true });
});

test('dream-warnings: a symlinked warnings FILE is refused rather than written through', { skip: !POSIX }, () => {
  const vault = makeVault();
  const victim = path.join(vault, 'victim.md');
  fs.writeFileSync(victim, 'user content\n');
  fs.mkdirSync(path.join(vault, 'reports'));
  fs.symlinkSync(victim, warningsPath(vault));

  const res = refreshWarnings({ vaultDir: vault, ledger: ONE_QUARANTINE });
  assert.equal(res.written, false);
  assert.ok(res.reason);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'user content\n', 'the link target is untouched');
});

test('dream-warnings: a symlink to a FIFO is refused by return — the read must never block', { skip: !POSIX }, () => {
  // THE DEFECT THIS PINS. A plain readFileSync on the leaf follows the link and
  // opens the FIFO, which blocks forever waiting for a writer: the dream never
  // returns, the process never exits, and that night's consolidation is lost
  // silently — the fail-loud-instead-of-fail-safe outcome ADR-0023 exists to
  // prevent. The earlier symlink tests cannot catch it, because they point the
  // link at a REGULAR file, where the read returns and the primitive refuses.
  //
  // The call runs in a CHILD process with a hard kill, because what is being
  // guarded is a HANG. An in-process assertion could not fail cleanly here: a
  // blocked synchronous read starves the event loop, so no test timeout could
  // ever fire, and the whole suite would wedge instead of reporting.
  const vault = makeVault();
  fs.mkdirSync(path.join(vault, 'reports'));
  const fifo = path.join(vault, 'blocking-fifo');
  execFileSync('mkfifo', [fifo]);
  fs.symlinkSync(fifo, warningsPath(vault));

  const child = `
    const { refreshWarnings } = require(${JSON.stringify(MODULE_PATH)});
    const ledger = ${JSON.stringify(ONE_QUARANTINE)};
    process.stdout.write(JSON.stringify(refreshWarnings({ vaultDir: ${JSON.stringify(vault)}, ledger })));
  `;
  const res = spawnSync(process.execPath, ['-e', child], { encoding: 'utf8', timeout: 15000, killSignal: 'SIGKILL' });

  assert.equal(res.signal, null, 'refreshWarnings BLOCKED on the FIFO and had to be killed');
  assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.equal(out.written, false);
  assert.match(out.reason, /could not be read/);
  // The link is untouched and nothing was published through it.
  assert.ok(fs.lstatSync(warningsPath(vault)).isSymbolicLink(), 'the leaf is left exactly as found');
});

test('dream-warnings: a broken vault root is reported by return, never by exception', () => {
  const res = refreshWarnings({ vaultDir: path.join(makeVault(), 'no-such-dir'), ledger: ONE_QUARANTINE });
  assert.equal(res.written, false);
  assert.ok(res.reason);
  // Missing arguments are reported the same way — the dream must never die here.
  assert.equal(refreshWarnings({}).written, false);
  assert.equal(refreshWarnings().written, false);
});
