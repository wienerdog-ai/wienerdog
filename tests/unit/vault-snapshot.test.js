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
  // The over-cap file is rejected on its lstat size — it is never read, so no
  // content gate can have decided it.
  assert.ok(copied(snapshotDir, 'reports/dreams/2026-07-07.md'));
  assert.equal(fs.statSync(path.join(snapshotDir, 'reports/dreams/2026-07-07.md')).mode & 0o777, 0o600);
});
