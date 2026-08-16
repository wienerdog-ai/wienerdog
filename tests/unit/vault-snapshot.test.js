'use strict';

// The snapshot's per-file CONTENT gates (WP-gate-vault-snapshot, audit finding
// M3). Everything here goes through the public entry point — `makeVaultSnapshot`
// — because that is the surface a routine actually meets; the gate chain itself
// is deliberately not exported.
//
// Two slices, two different contracts, so most fixtures are written twice:
// `weekly-review`'s `07-Daily` is the NOTES slice (provenance-gated), while
// every `reports/dreams` slice is exempt by design.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  makeVaultSnapshot,
  SNAPSHOT_PLANS,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  MAX_FILE_BYTES,
} = require('../../src/core/vault-snapshot');
const { parseNoteResult } = require('../../src/core/digest');
const secretScan = require('../../src/core/secret-scan');
const { getPaths } = require('../../src/core/paths');

const POSIX = process.platform !== 'win32';
// A mode-000 file is still readable by root, so the unreadable-degrades-to-skip
// case is only meaningful as an unprivileged user.
const UNPRIVILEGED = POSIX && typeof process.getuid === 'function' && process.getuid() !== 0;

/** A credential the shared scanner flags at QUARANTINE severity. */
const SECRET = 'key: sk-ant-api03-AAAABBBBCCCCDDDDEEEE1234';
/** A high-entropy blob the shared scanner flags at REDACT severity — the
 *  lower of the two, present to prove ANY finding rejects the whole file. */
const SOFT_SECRET = 'blob Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MHF3ZXJ0eQ== end';

/** Isolated temp paths with a vault dir. */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-vaultsnap-'));
  return getPaths({
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'wd'),
    WIENERDOG_VAULT: path.join(root, 'vault'),
  });
}

function staging() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wd-staging-'));
}

/** Write one vault file (content may be a string or a Buffer). @returns {string} abs path */
function writeVault(paths, rel, content) {
  const dest = path.join(paths.vault, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  return dest;
}

/** @param {{file:string,reason:string}[]} skipped @param {string} rel */
function reasonFor(skipped, rel) {
  const hit = skipped.find((s) => s.file === rel);
  return hit ? hit.reason : undefined;
}

/** Run one routine's snapshot over a freshly-seeded vault. */
function snapshotOf(paths, routineId) {
  const dir = staging();
  const result = makeVaultSnapshot(paths, routineId, dir);
  return result;
}

/** @param {string|null} snapshotDir @param {string} rel @returns {boolean} */
function copied(snapshotDir, rel) {
  return snapshotDir !== null && fs.existsSync(path.join(snapshotDir, rel));
}

// ------------------------------------------------------------ gate 3: secrets

test('vault-snapshot: a file the secret scanner flags is skipped VISIBLY in EITHER slice, never copied', () => {
  const paths = tempPaths();
  writeVault(paths, '07-Daily/2026-07-07.md', `# 2026-07-07\n\n${SECRET}\n`);
  writeVault(paths, 'reports/dreams/2026-07-07.md', `# Dream report — 2026-07-07\n\n${SECRET}\n`);

  const { snapshotDir, skipped } = snapshotOf(paths, 'weekly-review');
  assert.equal(reasonFor(skipped, '07-Daily/2026-07-07.md'), 'appears to contain a secret');
  assert.equal(reasonFor(skipped, 'reports/dreams/2026-07-07.md'), 'appears to contain a secret');
  assert.ok(!copied(snapshotDir, '07-Daily/2026-07-07.md'));
  assert.ok(!copied(snapshotDir, 'reports/dreams/2026-07-07.md'));
});

test('vault-snapshot: ANY finding rejects the file — a redact-severity one too — and the redacted text is never copied', () => {
  const paths = tempPaths();
  writeVault(paths, 'reports/dreams/2026-07-07.md', `# Dream report\n\n${SOFT_SECRET}\n`);
  // Precondition: this fixture is the LOW severity, not the hard one.
  const findings = secretScan.scanAndRedact(`# Dream report\n\n${SOFT_SECRET}\n`).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, secretScan.SEVERITY.REDACT);

  const { snapshotDir, skipped } = snapshotOf(paths, 'daily-digest');
  assert.equal(reasonFor(skipped, 'reports/dreams/2026-07-07.md'), 'appears to contain a secret');
  assert.deepEqual(fs.readdirSync(snapshotDir), [], 'nothing copied — not even a [REDACTED] rewrite');
});

// ------------------------------------------------------- gate 1: decodability

test('vault-snapshot: bytes a utf8 decode does not represent faithfully are skipped, in any slice', () => {
  const paths = tempPaths();
  const bad = Buffer.from([0x41, 0xc3, 0x28, 0x0a]); // 0xc3 lead with an invalid continuation
  writeVault(paths, '07-Daily/2026-07-07.md', bad);
  writeVault(paths, 'reports/dreams/2026-07-07.md', bad);

  const { snapshotDir, skipped } = snapshotOf(paths, 'weekly-review');
  assert.equal(reasonFor(skipped, '07-Daily/2026-07-07.md'), 'not valid UTF-8 text');
  assert.equal(reasonFor(skipped, 'reports/dreams/2026-07-07.md'), 'not valid UTF-8 text');
  assert.ok(!copied(snapshotDir, '07-Daily/2026-07-07.md'));
  assert.ok(!copied(snapshotDir, 'reports/dreams/2026-07-07.md'));
});

test('vault-snapshot: legitimate multibyte UTF-8 passes the decodability gate untouched', () => {
  const paths = tempPaths();
  const text = '# Napló\n\nárvíztűrő tükörfúrógép — 🐕\r\nno trailing newline';
  writeVault(paths, '07-Daily/2026-07-07.md', text);
  const { snapshotDir, skipped } = snapshotOf(paths, 'weekly-review');
  assert.deepEqual(skipped, []);
  assert.ok(copied(snapshotDir, '07-Daily/2026-07-07.md'));
});

// --------------------------------------------- gate 2: provenance, notes half

test('vault-snapshot: on the NOTES slice each exclusion class skips and names itself in the reason', () => {
  const paths = tempPaths();
  const fixtures = {
    '2026-07-07.md': '---\ntags:\n  - work\n---\n# note\n', // indented line → malformed
    '2026-07-06.md': '---\nderived_from_untrusted: true\n---\n# note\n',
    '2026-07-05.md': '---\nderived_from_untrusted: True\n---\n# note\n', // not provably boolean
  };
  for (const [name, body] of Object.entries(fixtures)) writeVault(paths, `07-Daily/${name}`, body);

  const { snapshotDir, skipped } = snapshotOf(paths, 'weekly-review');
  assert.equal(reasonFor(skipped, '07-Daily/2026-07-07.md'), 'provenance gate: malformed');
  assert.equal(reasonFor(skipped, '07-Daily/2026-07-06.md'), 'provenance gate: untrusted-exact');
  assert.equal(reasonFor(skipped, '07-Daily/2026-07-05.md'), 'provenance gate: untrusted-invalid');
  assert.deepEqual(fs.readdirSync(snapshotDir), [], 'no 07-Daily dir was even created');
});

test('vault-snapshot: the notes gate TRACKS the digest\'s exported parseNoteResult, class for class', () => {
  const paths = tempPaths();
  // Six shapes spanning every class the shared parser produces, INCLUDING the
  // three fail-open openers. The expectation is not written down here: it is
  // computed from the digest's own function at run time, so a change in that
  // function shows up as a failure here rather than as silent drift.
  const fixtures = {
    '2026-07-07.md': '---\nmeta:\n  a: 1\n---\n# note\n',
    '2026-07-06.md': '---\nderived_from_untrusted: true\n---\n# note\n',
    '2026-07-05.md': '---\nderived_from_untrusted: "true"\n---\n# note\n',
    '2026-07-04.md': '﻿---\nderived_from_untrusted: true\n---\n# note\n', // leading BOM
    '2026-07-03.md': '\n---\nderived_from_untrusted: true\n---\n# note\n', // leading blank line
    '2026-07-02.md': ' ---\nderived_from_untrusted: true\n---\n# note\n', // leading space
  };
  for (const [name, body] of Object.entries(fixtures)) writeVault(paths, `07-Daily/${name}`, body);

  const { snapshotDir, skipped } = snapshotOf(paths, 'weekly-review');
  let sawExcluded = 0;
  let sawTrusted = 0;
  for (const [name, body] of Object.entries(fixtures)) {
    const rel = `07-Daily/${name}`;
    const { exclusion } = parseNoteResult(body);
    if (exclusion === null) {
      sawTrusted += 1;
      assert.equal(reasonFor(skipped, rel), undefined, `${rel} is trusted by the shared parser`);
      assert.ok(copied(snapshotDir, rel), `${rel} is copied`);
    } else {
      sawExcluded += 1;
      assert.equal(reasonFor(skipped, rel), `provenance gate: ${exclusion}`);
      assert.ok(!copied(snapshotDir, rel), `${rel} is not copied`);
    }
  }
  // Non-vacuity: both branches were exercised, and the three fail-open openers
  // are the trusted ones — the guarantee is "PARSER-RECOGNIZED frontmatter that
  // flags untrusted derivation is skipped", never "the flag is skipped".
  assert.equal(sawExcluded, 3);
  assert.equal(sawTrusted, 3);
});

test('vault-snapshot: trusted-by-default survives on the notes slice — no flag, or exactly false', () => {
  const paths = tempPaths();
  writeVault(paths, '07-Daily/2026-07-07.md', '# 2026-07-07\n\nwrote some code today.\n');
  writeVault(paths, '07-Daily/2026-07-06.md', '---\nderived_from_untrusted: false\n---\n# note\n');

  const { snapshotDir, skipped } = snapshotOf(paths, 'weekly-review');
  assert.deepEqual(skipped, []);
  assert.ok(copied(snapshotDir, '07-Daily/2026-07-07.md'));
  assert.ok(copied(snapshotDir, '07-Daily/2026-07-06.md'));
});

// ------------------------------------------------ the reports slice is exempt

test('vault-snapshot: on the REPORTS slice no exclusion class causes a skip', () => {
  const paths = tempPaths();
  const fixtures = {
    '2026-07-07.md': '---\nprose, not a key\n---\n# Dream report\n', // malformed
    '2026-07-06.md': '---\nderived_from_untrusted: true\n---\n# Dream report\n', // untrusted-exact
    '2026-07-05.md': '---\nderived_from_untrusted: TRUE\n---\n# Dream report\n', // untrusted-invalid
  };
  for (const [name, body] of Object.entries(fixtures)) {
    writeVault(paths, `reports/dreams/${name}`, body);
    // Precondition: the shared parser really does exclude each of these.
    assert.notEqual(parseNoteResult(body).exclusion, null, name);
  }

  const { snapshotDir, skipped } = snapshotOf(paths, 'weekly-review');
  assert.deepEqual(skipped, []);
  for (const name of Object.keys(fixtures)) {
    assert.ok(copied(snapshotDir, `reports/dreams/${name}`), `${name} is copied`);
  }
});

test('vault-snapshot: daily-digest\'s single input is not exposed to the provenance gate', () => {
  const paths = tempPaths();
  writeVault(paths, 'reports/dreams/2026-07-07.md', '---\ntags:\n  - dream\n---\n# Dream report\n');
  const { snapshotDir, skipped } = snapshotOf(paths, 'daily-digest');
  assert.deepEqual(skipped, []);
  assert.ok(copied(snapshotDir, 'reports/dreams/2026-07-07.md'));
});

// ---------------------------------------------------------------- gate order

test('vault-snapshot: the FIRST gate that fires owns the reason — decodability, then provenance, then secrets', () => {
  const paths = tempPaths();
  const malformedAndSecret = `---\ntags:\n  - work\n---\n# note\n\n${SECRET}\n`;
  const undecodableAndSecret = Buffer.concat([Buffer.from(`${SECRET}\n`), Buffer.from([0xff])]);
  // Decodability must lead: the other two gates decide on TEXT. This fixture is
  // BOTH provenance-excludable and undecodable, so it is the only one that can
  // tell "decodability first" from "provenance first".
  const undecodableAndMalformed = Buffer.concat([
    Buffer.from('---\ntags:\n  - work\n---\n# note\n'),
    Buffer.from([0xff]),
  ]);
  writeVault(paths, '07-Daily/2026-07-07.md', malformedAndSecret);
  writeVault(paths, '07-Daily/2026-07-06.md', undecodableAndSecret);
  writeVault(paths, '07-Daily/2026-07-05.md', undecodableAndMalformed);
  // The SAME malformed-and-secret bytes on the exempt slice fall through to the
  // scan, which shows the order is real and the exemption is slice-scoped.
  writeVault(paths, 'reports/dreams/2026-07-07.md', malformedAndSecret);

  const { skipped } = snapshotOf(paths, 'weekly-review');
  assert.equal(reasonFor(skipped, '07-Daily/2026-07-07.md'), 'provenance gate: malformed');
  assert.equal(reasonFor(skipped, '07-Daily/2026-07-06.md'), 'not valid UTF-8 text');
  // Not 'provenance gate: malformed', even though the shared parser would say so.
  assert.equal(parseNoteResult(undecodableAndMalformed.toString('utf8')).exclusion, 'malformed');
  assert.equal(reasonFor(skipped, '07-Daily/2026-07-05.md'), 'not valid UTF-8 text');
  assert.equal(reasonFor(skipped, 'reports/dreams/2026-07-07.md'), 'appears to contain a secret');
});

// ------------------------------------------------------- one read, same bytes

test('vault-snapshot: every copied file is byte-identical to its source', () => {
  const paths = tempPaths();
  const bodies = {
    '07-Daily/2026-07-07.md': Buffer.from('# Napló\r\n\r\nárvíztűrő 🐕\ntrailing spaces   \nno newline'),
    '07-Daily/2026-07-06.md': Buffer.from('---\nderived_from_untrusted: false\n---\n# note\n \n'),
    'reports/dreams/2026-07-07.md': Buffer.from('# Dream report — 2026-07-07\n\nbody\n'),
  };
  for (const [rel, buf] of Object.entries(bodies)) writeVault(paths, rel, buf);

  const { snapshotDir, skipped } = snapshotOf(paths, 'weekly-review');
  assert.deepEqual(skipped, []);
  for (const [rel, buf] of Object.entries(bodies)) {
    assert.ok(fs.readFileSync(path.join(snapshotDir, rel)).equals(buf), `${rel} is byte-identical`);
  }
});

// ------------------------------------------------------------ budget accounting

test('vault-snapshot: a gated-out file consumes NO byte budget, so it cannot displace a later file', { skip: !POSIX }, () => {
  const paths = tempPaths();
  const FILLER = 250000; // under the 262144-byte per-file cap
  const filler = (tag) => `# ${tag}\n\n${'a'.repeat(FILLER)}\n`;
  // 07-Daily is processed first: seven clean notes take 7 × ~250 KiB.
  for (let d = 1; d <= 7; d += 1) {
    writeVault(paths, `07-Daily/2026-07-0${d}.md`, filler(`day ${d}`));
  }
  // Then the reports. The NEWEST carries a secret, so the gate rejects it; the
  // next one only fits inside the 2 MiB total cap if those bytes were never
  // charged. Everything older is genuinely over the cap.
  writeVault(paths, 'reports/dreams/2026-07-07.md', `${filler('gated')}${SECRET}\n`);
  for (let d = 1; d <= 6; d += 1) {
    writeVault(paths, `reports/dreams/2026-07-0${d}.md`, filler(`report ${d}`));
  }

  const { snapshotDir, skipped } = snapshotOf(paths, 'weekly-review');
  assert.equal(reasonFor(skipped, 'reports/dreams/2026-07-07.md'), 'appears to contain a secret');
  assert.ok(
    copied(snapshotDir, 'reports/dreams/2026-07-06.md'),
    'the next report still fits — the gated file was never charged to the total'
  );
  // Non-vacuity: the cap IS binding here, so this is not a test that would pass
  // with an infinite budget.
  assert.equal(
    reasonFor(skipped, 'reports/dreams/2026-07-05.md'),
    `exceeds the ${MAX_TOTAL_BYTES}-byte total cap`
  );
});

// -------------------------------------------------- failure classes degrade

test('vault-snapshot: an unreadable file degrades to a visible skip and the run completes', { skip: !UNPRIVILEGED }, () => {
  const paths = tempPaths();
  const src = writeVault(paths, 'reports/dreams/2026-07-07.md', '# Dream report\n');
  fs.chmodSync(src, 0o000);
  try {
    const { snapshotDir, skipped } = snapshotOf(paths, 'daily-digest');
    assert.equal(reasonFor(skipped, 'reports/dreams/2026-07-07.md'), 'unreadable');
    assert.notEqual(snapshotDir, null);
  } finally {
    fs.chmodSync(src, 0o600);
  }
});

test('vault-snapshot: a DEGRADED scanner result skips the file rather than escaping the run', () => {
  const paths = tempPaths();
  writeVault(paths, 'reports/dreams/2026-07-07.md', '# Dream report\n\nharmless.\n');
  // scanAndRedact is total (WP-122): every degraded path returns a withheld
  // marker plus a finding instead of throwing. The gate is written against that
  // contract — it looks at `findings`, never at the returned text — so the
  // scan-error shape is the one degraded result a caller can actually stage.
  const real = secretScan.scanAndRedact;
  secretScan.scanAndRedact = () => ({
    text: '[wienerdog: secret scan failed — content withheld]',
    findings: [{ label: 'scan-error', severity: secretScan.SEVERITY.QUARANTINE, count: 1 }],
  });
  try {
    const { snapshotDir, skipped } = snapshotOf(paths, 'daily-digest');
    assert.equal(reasonFor(skipped, 'reports/dreams/2026-07-07.md'), 'appears to contain a secret');
    assert.deepEqual(fs.readdirSync(snapshotDir), [], 'the withheld marker is never copied either');
  } finally {
    secretScan.scanAndRedact = real;
  }
});

// ------------------------------------------------------------- gated-out run

test('vault-snapshot: when EVERYTHING is gated out the snapshot dir exists, is empty, and every absence is explained', () => {
  const paths = tempPaths();
  writeVault(paths, '07-Daily/2026-07-07.md', '---\nderived_from_untrusted: true\n---\n# note\n');
  writeVault(paths, '07-Daily/2026-07-06.md', `# note\n\n${SECRET}\n`);
  writeVault(paths, 'reports/dreams/2026-07-07.md', Buffer.from([0xff, 0xfe, 0x0a]));

  const { snapshotDir, skipped } = snapshotOf(paths, 'weekly-review');
  assert.notEqual(snapshotDir, null);
  assert.deepEqual(fs.readdirSync(snapshotDir), [], 'empty — no ungated fallback copy');
  if (POSIX) assert.equal(fs.statSync(snapshotDir).mode & 0o777, 0o700);
  assert.deepEqual(
    skipped.map((s) => s.file).sort(),
    ['07-Daily/2026-07-06.md', '07-Daily/2026-07-07.md', 'reports/dreams/2026-07-07.md']
  );
});

// -------------------------------------------------------- preserved unchanged

test('vault-snapshot: the caps, the plans and the empty-plan path are unchanged by the gates', () => {
  assert.equal(MAX_FILES, 32);
  assert.equal(MAX_TOTAL_BYTES, 2 * 1024 * 1024);
  assert.equal(MAX_FILE_BYTES, 256 * 1024);
  assert.deepEqual(
    SNAPSHOT_PLANS['daily-digest'].map((s) => [s.dir, s.newest]),
    [['reports/dreams', 1]]
  );
  assert.deepEqual(
    SNAPSHOT_PLANS['weekly-review'].map((s) => [s.dir, s.newest]),
    [['07-Daily', 7], ['reports/dreams', 7]]
  );
  assert.deepEqual(SNAPSHOT_PLANS['inbox-triage'], []);
  // The notes slice is marked in the PLAN, not matched by directory name at the
  // gate — and it is the only slice that carries the mark.
  assert.equal(SNAPSHOT_PLANS['weekly-review'][0].provenanceGated, true);
  assert.equal(SNAPSHOT_PLANS['weekly-review'][1].provenanceGated, undefined);
  assert.equal(SNAPSHOT_PLANS['daily-digest'][0].provenanceGated, undefined);
  assert.ok(Object.isFrozen(SNAPSHOT_PLANS['weekly-review'][0]));

  const paths = tempPaths();
  const { snapshotDir, skipped } = snapshotOf(paths, 'inbox-triage');
  assert.equal(snapshotDir, null);
  assert.deepEqual(skipped, []);
});

test('vault-snapshot: the pre-existing skip reasons and the newest-first pick still read exactly as before', { skip: !POSIX }, () => {
  const paths = tempPaths();
  fs.mkdirSync(path.join(paths.vault, 'reports', 'dreams'), { recursive: true });
  const outside = writeVault(paths, 'secret.txt', 'private');
  fs.symlinkSync(outside, path.join(paths.vault, 'reports', 'dreams', '2026-07-09.md'));
  writeVault(paths, 'reports/dreams/2026-07-08.md', 'x'.repeat(MAX_FILE_BYTES + 1));
  writeVault(paths, 'reports/dreams/2026-07-07.md', '# older, and clean\n');

  const { snapshotDir, skipped } = snapshotOf(paths, 'weekly-review');
  assert.equal(
    reasonFor(skipped, 'reports/dreams/2026-07-09.md'),
    'not a regular file (symlinks are never followed)'
  );
  assert.equal(
    reasonFor(skipped, 'reports/dreams/2026-07-08.md'),
    `exceeds the ${MAX_FILE_BYTES}-byte per-file cap`
  );
  // The over-cap file is rejected before any content gate runs, so no gate can
  // have decided it. (It IS opened and read up to the bound first — the caps
  // are decided on the bytes actually read, WP-snapshot-read-path-hardening
  // Table A — but those bytes reach nothing.)
  assert.ok(copied(snapshotDir, 'reports/dreams/2026-07-07.md'));
  assert.equal(fs.statSync(path.join(snapshotDir, 'reports/dreams/2026-07-07.md')).mode & 0o777, 0o600);
});

// ============================================================== the read path
// WP-snapshot-read-path-hardening. Everything below is about WHICH file the
// snapshot ends up reading and how much of it: the file opened is the file
// read, the caps are enforced against the bytes actually read, and the read is
// bounded. The race cases are staged deterministically by hooking `lstatSync`
// for the one candidate path — that reproduces the window's OUTCOME (the
// checked file is not the read file) without depending on timing.

/**
 * Run one snapshot with `fs` instrumented. The read primitive and the
 * descriptor lifecycle are only observable from here: Table A's bounds and the
 * close posture are properties of HOW the read is performed, not of the result.
 * @returns {{result?: object, threw?: Error, opens: number, closes: number,
 *            reads: Array<{requested: number, bufferLength: number, got: number}>,
 *            written: Buffer[]}}
 */
function instrumented(paths, routineId, hooks = {}) {
  const real = {
    openSync: fs.openSync,
    closeSync: fs.closeSync,
    readSync: fs.readSync,
    lstatSync: fs.lstatSync,
    writeFileSync: fs.writeFileSync,
  };
  const log = { opens: 0, closes: 0, leaked: 0, reads: [], written: [] };
  // Count ONLY descriptors on vault paths. The staging side (mkdirPrivate, the
  // copy) opens descriptors of its own, and counting those would make this
  // assertion pass for reasons that have nothing to do with the read path.
  const vaultFds = new Set();
  fs.openSync = (p, ...rest) => {
    const fd = real.openSync(p, ...rest);
    if (String(p).startsWith(paths.vault)) {
      log.opens += 1;
      vaultFds.add(fd);
    }
    return fd;
  };
  fs.closeSync = (fd, ...rest) => {
    if (vaultFds.has(fd)) {
      log.closes += 1;
      vaultFds.delete(fd);
    }
    return real.closeSync(fd, ...rest);
  };
  fs.readSync = (fd, buf, off, len, pos) => {
    if (hooks.readSync) hooks.readSync();
    const got = real.readSync(fd, buf, off, len, pos);
    // `buf.length` is the VIEW; `buf.buffer.byteLength` is what is actually
    // allocated. A subarray of a source-sized Buffer has the right view length
    // and the wrong allocation, which is the whole point of bound (c).
    log.reads.push({
      requested: len,
      bufferLength: buf.length,
      backing: buf.buffer.byteLength,
      got,
    });
    return got;
  };
  if (hooks.lstatSync) fs.lstatSync = (...a) => hooks.lstatSync(real.lstatSync, ...a);
  fs.writeFileSync = (dest, buf, opts) => {
    log.written.push(buf);
    if (hooks.writeFileSync) return hooks.writeFileSync();
    return real.writeFileSync(dest, buf, opts);
  };
  try {
    log.result = snapshotOf(paths, routineId);
  } catch (e) {
    log.threw = e;
  } finally {
    Object.assign(fs, real);
  }
  log.leaked = vaultFds.size;
  return log;
}

/** Stage the check→open window: `lstat` reports `size` for `src`, disk does not. */
const underReport = (src, size) => (real, p, ...rest) => {
  const st = real(p, ...rest);
  if (p === src) Object.defineProperty(st, 'size', { value: size });
  return st;
};

// ------------------------------------------------- the check→open window

test('vault-snapshot: a file that grows past the cap after its type check is refused BY THE CAP', () => {
  const paths = tempPaths();
  const rel = 'reports/dreams/2026-08-16.md';
  const src = writeVault(paths, rel, `# grown\n${'a'.repeat(MAX_FILE_BYTES + 1 - 9)}\n`);
  const { result } = instrumented(paths, 'daily-digest', { lstatSync: underReport(src, 100) });

  assert.equal(reasonFor(result.skipped, rel), `exceeds the ${MAX_FILE_BYTES}-byte per-file cap`);
  // Not `appears to contain a secret`, which is what today's code answers: the
  // scanner's oversized bail firing because the caps were enforced against the
  // size lstat reported. Nothing is copied, and nothing is copied truncated.
  assert.ok(!copied(result.snapshotDir, rel));
});

test('vault-snapshot: a symlink swapped in after the type check is never read through', { skip: !POSIX }, () => {
  const paths = tempPaths();
  const outside = writeVault(paths, 'outside.md', '# out-of-vault\n\nprose the gates accept.\n');
  const rel = 'reports/dreams/2026-08-16.md';
  const src = writeVault(paths, rel, '# innocent\n');
  const { result } = instrumented(paths, 'daily-digest', {
    lstatSync: (real, p, ...rest) => {
      const st = real(p, ...rest);
      if (p === src) {
        fs.unlinkSync(src);
        fs.symlinkSync(outside, src);
      }
      return st;
    },
  });

  assert.ok(!copied(result.snapshotDir, rel), 'the out-of-vault file is not copied');
  assert.equal(reasonFor(result.skipped, rel), 'unreadable', 'the open fails; one reason for every open failure');
});

test('vault-snapshot: a directory swapped in after the type check opens, and the DESCRIPTOR refuses it', { skip: !POSIX }, () => {
  const paths = tempPaths();
  const rel = 'reports/dreams/2026-08-16.md';
  const src = writeVault(paths, rel, '# innocent\n');
  const log = instrumented(paths, 'daily-digest', {
    lstatSync: (real, p, ...rest) => {
      const st = real(p, ...rest);
      if (p === src) {
        fs.unlinkSync(src);
        fs.mkdirSync(src);
      }
      return st;
    },
  });

  assert.equal(
    reasonFor(log.result.skipped, rel),
    'not a regular file (symlinks are never followed)'
  );
  // This is the path a `finally` around the READ alone would leak: a descriptor
  // exists, and nothing is ever read through it.
  assert.equal(log.reads.length, 0, 'the fstat refusal reads nothing');
  assert.equal(log.opens, 1);
  assert.equal(log.closes, 1, 'closed anyway');
  assert.equal(log.leaked, 0);
});

// ------------------------------------------------------------- the crossover

test('vault-snapshot: a failed open outranks a cap reason when both apply', { skip: !UNPRIVILEGED }, () => {
  const paths = tempPaths();
  const rel = 'reports/dreams/2026-08-16.md';
  const src = writeVault(paths, rel, 'x'.repeat(300 * 1024)); // over the per-file cap
  fs.chmodSync(src, 0o000); // and unopenable
  try {
    const { skipped } = snapshotOf(paths, 'daily-digest');
    // Today this reports the cap reason, because the cap is decided on the size
    // lstat reported, before any open. The owner accepted the crossover.
    assert.equal(reasonFor(skipped, rel), 'unreadable');
  } finally {
    fs.chmodSync(src, 0o600);
  }
});

test('vault-snapshot: a failed bounded read outranks a cap reason too', () => {
  const paths = tempPaths();
  const rel = 'reports/dreams/2026-08-16.md';
  writeVault(paths, rel, 'x'.repeat(300 * 1024));
  const log = instrumented(paths, 'daily-digest', {
    readSync: () => {
      throw Object.assign(new Error('staged read failure'), { code: 'EIO' });
    },
  });

  assert.equal(reasonFor(log.result.skipped, rel), 'unreadable');
  assert.ok(!copied(log.result.snapshotDir, rel));
  // The descriptor was acquired and must still be closed on this path — the
  // lifecycle test's fixtures never stage a read failure, so without this the
  // leak would only exist here and nothing would catch it.
  assert.equal(log.opens, 1);
  assert.equal(log.closes, 1);
  assert.equal(log.leaked, 0);
});

// -------------------------------------------------------------- boundedness

test('vault-snapshot: the read is bounded at the primitive — requested, accumulated, and the buffer itself', () => {
  const paths = tempPaths();
  const rel = 'reports/dreams/2026-08-16.md';
  const src = writeVault(paths, rel, 'x'.repeat(4 * 1024 * 1024)); // 16× the cap
  const log = instrumented(paths, 'daily-digest', { lstatSync: underReport(src, 100) });

  assert.ok(log.reads.length > 0, 'the file really was read');
  for (const r of log.reads) {
    assert.ok(r.requested <= MAX_FILE_BYTES + 1, `(a) requested ${r.requested} > the bound`);
    assert.equal(r.bufferLength, MAX_FILE_BYTES + 1, '(c) the read view is the bound');
    assert.equal(
      r.backing,
      MAX_FILE_BYTES + 1,
      '(c) and the ALLOCATION behind it is the bound too — not a view onto a source-sized buffer'
    );
  }
  const accumulated = log.reads.reduce((n, r) => n + r.got, 0);
  assert.ok(accumulated <= MAX_FILE_BYTES + 1, `(b) accumulated ${accumulated} > the bound`);
  assert.equal(
    reasonFor(log.result.skipped, rel),
    `exceeds the ${MAX_FILE_BYTES}-byte per-file cap`
  );
});

test('vault-snapshot: what is written is a COPY of the filled prefix, never a view onto a larger allocation', () => {
  const paths = tempPaths();
  const rel = 'reports/dreams/2026-08-16.md';
  const body = '# report\n\nshort.\n';
  writeVault(paths, rel, body);
  const log = instrumented(paths, 'daily-digest');

  assert.deepEqual(log.result.skipped, []);
  assert.equal(log.written.length, 1);
  const buf = log.written[0];
  assert.equal(buf.length, Buffer.byteLength(body));
  assert.ok(
    buf.buffer.byteLength < MAX_FILE_BYTES + 1,
    'a view onto the bounded read buffer would keep all of it alive'
  );
});

// ------------------------------------------------------ descriptor lifecycle

test('vault-snapshot: every successful open is paired with exactly one close, on every path', () => {
  const paths = tempPaths();
  // a copy, a gate skip, a cap skip and a read failure in one run
  writeVault(paths, '07-Daily/2026-07-09.md', '# clean\n');
  writeVault(paths, '07-Daily/2026-07-08.md', `# n\n\n${SECRET}\n`);
  writeVault(paths, '07-Daily/2026-07-07.md', 'x'.repeat(MAX_FILE_BYTES + 1));
  const log = instrumented(paths, 'weekly-review');

  assert.ok(log.opens >= 3, 'the run really opened files under the vault');
  assert.equal(log.closes, log.opens, 'one close per open');
  assert.equal(log.leaked, 0);
});

test('vault-snapshot: the descriptor is already closed when the write side throws', () => {
  const paths = tempPaths();
  writeVault(paths, 'reports/dreams/2026-08-16.md', '# report\n');
  const log = instrumented(paths, 'daily-digest', {
    writeFileSync: () => {
      throw new Error('staged write failure');
    },
  });

  assert.ok(log.threw, 'the write-side throw is pre-existing behaviour and still escapes');
  assert.equal(log.opens, 1);
  assert.equal(log.closes, 1, 'the descriptor did not leak past the read');
  assert.equal(log.leaked, 0);
});

// ------------------------------------------------------- the reason contract

test('vault-snapshot: the nine REACHABLE reasons are each produced by their own check', { skip: !POSIX }, () => {
  const seen = new Set();

  {
    const paths = tempPaths();
    const dreams = path.join(paths.vault, 'reports', 'dreams');
    fs.mkdirSync(dreams, { recursive: true });
    fs.symlinkSync(writeVault(paths, 'x.txt', 'p'), path.join(dreams, '2026-07-09.md'));
    writeVault(paths, '07-Daily/2026-07-08.md', 'x'.repeat(MAX_FILE_BYTES + 1));
    writeVault(paths, '07-Daily/2026-07-07.md', Buffer.from([0xff]));
    writeVault(paths, '07-Daily/2026-07-06.md', '---\ntags:\n  - w\n---\n# n\n');
    writeVault(paths, '07-Daily/2026-07-05.md', '---\nderived_from_untrusted: true\n---\n# n\n');
    writeVault(paths, '07-Daily/2026-07-04.md', '---\nderived_from_untrusted: True\n---\n# n\n');
    writeVault(paths, '07-Daily/2026-07-03.md', `# n\n\n${SECRET}\n`);
    snapshotOf(paths, 'weekly-review').skipped.forEach((s) => seen.add(s.reason));
  }
  {
    // `unreadable` without needing an unprivileged uid
    const paths = tempPaths();
    writeVault(paths, 'reports/dreams/2026-07-09.md', '# r\n');
    instrumented(paths, 'daily-digest', {
      readSync: () => {
        throw Object.assign(new Error('staged'), { code: 'EIO' });
      },
    }).result.skipped.forEach((s) => seen.add(s.reason));
  }
  {
    // the byte-total cap
    const paths = tempPaths();
    const filler = (t) => `# ${t}\n\n${'a'.repeat(250000)}\n`;
    for (let d = 1; d <= 7; d += 1) writeVault(paths, `07-Daily/2026-07-0${d}.md`, filler(`d${d}`));
    for (let d = 1; d <= 7; d += 1) {
      writeVault(paths, `reports/dreams/2026-07-0${d}.md`, filler(`r${d}`));
    }
    snapshotOf(paths, 'weekly-review').skipped.forEach((s) => seen.add(s.reason));
  }

  assert.deepEqual(
    [...seen].sort(),
    [
      'appears to contain a secret',
      // sorted: "2097152" precedes "262144" lexicographically
      `exceeds the ${MAX_TOTAL_BYTES}-byte total cap`,
      `exceeds the ${MAX_FILE_BYTES}-byte per-file cap`,
      'not a regular file (symlinks are never followed)',
      'not valid UTF-8 text',
      'provenance gate: malformed',
      'provenance gate: untrusted-exact',
      'provenance gate: untrusted-invalid',
      'unreadable',
    ]
  );
});

test('vault-snapshot: the file-count reason is VOCABULARY only — dormant under every frozen plan', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'core', 'vault-snapshot.js'),
    'utf8'
  );
  // Match the WHOLE frozen form as it appears in the source. `-file cap` alone
  // also matches `per-file cap`, so it would survive the literal's deletion;
  // and the tail alone would survive a re-wording of the prefix. Table C
  // freezes the whole string, and this is the one literal with no runtime
  // outcome behind it, so this match is its only guard.
  assert.ok(
    source.includes('exceeds the ${MAX_FILES}-file cap'),
    'the literal is still in the module, whole: the vocabulary is preserved'
  );
  // …and no valid plan can reach it, so no test can assert it as an outcome.
  for (const [id, plan] of Object.entries(SNAPSHOT_PLANS)) {
    const candidates = plan.reduce((n, s) => n + s.newest, 0);
    assert.ok(candidates <= MAX_FILES, `${id} exposes ${candidates} candidates against a ${MAX_FILES}-file cap`);
  }
});

test('vault-snapshot: the per-file cap never exceeds the scanner limit, so the oversized bail stays unreachable', () => {
  // Equal by coincidence, coupled in behaviour: every file that reaches the
  // secret scan passed the per-file cap on the bytes actually read, so raising
  // MAX_FILE_BYTES above SCAN_MAX_BYTES would start withholding
  // legitimately-sized files under `appears to contain a secret`.
  assert.ok(MAX_FILE_BYTES <= secretScan.ScanLimits.SCAN_MAX_BYTES);
});

test('vault-snapshot: a FIFO swapped in after the type check is refused, and does NOT hang the run', { skip: !POSIX }, () => {
  // Deliberately run in a CHILD process with a hard timeout. Without
  // `O_NONBLOCK` the open on a FIFO blocks the event loop SYNCHRONOUSLY while
  // it waits for a writer, so an in-process test timeout could never fire and a
  // regression would wedge the suite instead of failing it. `execFileSync`'s
  // timeout kills the child, which turns that regression into a red test.
  const paths = tempPaths();
  const root = path.dirname(paths.vault);
  const rel = 'reports/dreams/2026-08-16.md';
  const src = writeVault(paths, rel, '# innocent\n');
  const stage = staging();
  const child = path.join(root, 'fifo-probe.js');
  fs.writeFileSync(
    child,
    `'use strict';
const fs = require('node:fs');
const cp = require('node:child_process');
const { makeVaultSnapshot } = require(${JSON.stringify(require.resolve('../../src/core/vault-snapshot'))});
const { getPaths } = require(${JSON.stringify(require.resolve('../../src/core/paths'))});
const [, , root, stage, src] = process.argv;
const paths = getPaths({
  HOME: root,
  WIENERDOG_HOME: root + '/wd',
  WIENERDOG_VAULT: root + '/vault',
});
const real = fs.lstatSync;
fs.lstatSync = (p, ...rest) => {
  const st = real(p, ...rest);
  if (p === src) {
    fs.unlinkSync(src);
    cp.execFileSync('mkfifo', [src]);
  }
  return st;
};
const out = makeVaultSnapshot(paths, 'daily-digest', stage);
process.stdout.write(
  JSON.stringify({
    skipped: out.skipped,
    copied: out.snapshotDir !== null && fs.existsSync(out.snapshotDir + '/' + process.argv[5]),
  })
);
`
  );

  const out = JSON.parse(
    require('node:child_process').execFileSync(
      process.execPath,
      [child, root, stage, src, rel],
      { timeout: 10000, encoding: 'utf8' }
    )
  );
  assert.equal(
    reasonFor(out.skipped, rel),
    'not a regular file (symlinks are never followed)',
    'the descriptor refuses it — and the open returned at all, which is O_NONBLOCK doing its job'
  );
  assert.equal(out.copied, false, 'and nothing reached the snapshot');
});
