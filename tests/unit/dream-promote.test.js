'use strict';

/**
 * Deliverable tests for the promotion module (WP-dream-promote-module).
 *
 * The tables these mirror:
 *   C — the promotion decision (rows C1–C9, M1–M3)
 *   D — the four gates: input and order
 *   E — the promotion write, and the one new window
 *   Q — the EP2 gate's result, and the quarantine lifecycle behind it
 *   S — the decided bytes, and what may be derived from them
 *
 * THE GATES ARE INJECTED, so these tests use fakes. That is the point of the
 * injection: the order, the input routing and the ADR-0034 taxonomy are
 * provable here without `validate.js` in the picture, and the module carries no
 * dependency on it. Extracting the four real gates into this input shape is
 * `WP-dream-promote-in-workspace`'s work.
 *
 * THE MERGE USES REAL GIT. Its exit code is a security decision (clean means
 * promote), so a fake that returns a canned status would assert nothing about
 * the property the spec measured — that `git merge-file` writes conflict
 * markers INTO its first operand. `git` is spawned through the production
 * default seam, which requires a pin store; one is built here at an isolated
 * `WIENERDOG_HOME`. A missing git is a FAILURE, not a skip: git is already a
 * hard dependency of this project.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { promote, makeAdmit, spawnGitForMerge, isLosslessUtf8 } = require('../../src/core/dream/promote');
const { isAtOrBeneath } = require('../../src/core/dream/workspace');
const { captureBaseline, computeDelta } = require('../../src/core/dream/delta');
const { defaultLayout } = require('../../src/core/layout');
const { getPaths } = require('../../src/core/paths');
const { createPins } = require('../../src/core/exec-identity');
const { WienerdogError } = require('../../src/core/errors');

const POSIX = process.platform !== 'win32';

// ── Pins: the production merge seam spawns git by its verified absolute path ──
//
// Set once for the whole file. `spawnGitForMerge` calls `getPaths()`, which
// reads `process.env`, so the isolated core has to be visible for the duration.
const PIN_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-promote-pins-'));
process.env.WIENERDOG_HOME = path.join(PIN_ROOT, 'wd');
createPins(getPaths(process.env), { env: { PATH: process.env.PATH }, platform: process.platform });

test('dream-promote: the merge seam can spawn a verified git (fixture precondition)', () => {
  const probe = spawnGitForMerge({ args: ['--version'], cwd: PIN_ROOT, env: { PATH: process.env.PATH } });
  assert.equal(probe.error, undefined, 'git must resolve to a VERIFIED absolute executable');
  assert.equal(probe.status, 0);
});

// ── Fixtures ────────────────────────────────────────────────────────────────

/** @param {string} s @returns {Buffer} */
const B = (s) => Buffer.from(s, 'utf8');

/** @param {string} prefix @returns {string} */
function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `wd-promote-${prefix}-`));
}

/** @param {string} root @param {string} rel @param {Buffer|string} bytes */
function put(root, rel, bytes) {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.isBuffer(bytes) ? bytes : B(bytes));
}

/** @param {string} root @param {string} rel @returns {Buffer|null} */
function get(root, rel) {
  try {
    return fs.readFileSync(path.join(root, ...rel.split('/')));
  } catch {
    return null;
  }
}

/** Every regular file in the tree, as `/`-separated relative paths.
 *  @param {string} root @param {string} [rel] @returns {string[]} */
function walkVault(root, rel = '') {
  const dir = rel === '' ? root : path.join(root, ...rel.split('/'));
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walkVault(root, childRel));
    else if (entry.isFile()) out.push(childRel);
  }
  return out;
}

/**
 * Build a run: a vault, a workspace filled with the vault's readable content,
 * a CONSTRUCTED baseline over those bytes, then the brain's writes, then the
 * real delta. The primitives are the real ones — a hand-rolled delta record
 * would let these tests agree with an implementation that misreads the real
 * shape (the `binary` flag and the empty `addedLineNumbers` in particular).
 * @param {{vault?:Record<string,Buffer|string>, seed?:Record<string,Buffer|string>,
 *          brain?:Record<string,Buffer|string|null>, layout?:object}} o
 */
function scenario(o = {}) {
  const vaultDir = tmp('vault');
  const workspaceDir = tmp('ws');
  const layout = o.layout || defaultLayout();

  for (const [rel, bytes] of Object.entries(o.vault || {})) put(vaultDir, rel, bytes);
  // By default the workspace is seeded with exactly what the vault holds, which
  // is what `createWorkspace` does in the run.
  const seed = o.seed || o.vault || {};
  for (const [rel, bytes] of Object.entries(seed)) put(workspaceDir, rel, bytes);

  const baseline = captureBaseline(workspaceDir);

  for (const [rel, bytes] of Object.entries(o.brain || {})) {
    if (bytes === null) fs.rmSync(path.join(workspaceDir, ...rel.split('/')), { force: true });
    else put(workspaceDir, rel, bytes);
  }

  const delta = computeDelta(workspaceDir, baseline);
  return { vaultDir, workspaceDir, baseline, delta, layout, date: '2026-08-29' };
}

/** All four gates pass. Overridable per gate. @param {object} [over] */
function gates(over = {}) {
  return {
    secret: () => ({ ok: true }),
    skillBody: () => null,
    tier3: () => null,
    ledger: () => null,
    ...over,
  };
}

/** @param {ReturnType<typeof scenario>} sc @param {object} [over] */
function run(sc, over = {}) {
  return promote({
    vaultDir: sc.vaultDir,
    workspaceDir: sc.workspaceDir,
    date: sc.date,
    baseline: sc.baseline,
    delta: sc.delta,
    layout: sc.layout,
    gates: gates(),
    ...over,
  });
}

/** @param {{refused:Array<{rel:string,reason:string}>}} res @param {string} rel */
function refusalFor(res, rel) {
  const hit = res.refused.find((r) => r.rel === rel);
  assert.ok(hit, `expected \`${rel}\` to be refused; refused: ${JSON.stringify(res.refused)}`);
  assert.ok(typeof hit.reason === 'string' && hit.reason.length > 0, 'a refusal must record a reason');
  return hit.reason;
}

/** @param {object} res @param {string} rel */
function promotionFor(res, rel) {
  const hit = res.promoted.find((r) => r.rel === rel);
  assert.ok(hit, `expected \`${rel}\` to be promoted; promoted: ${res.promoted.map((p) => p.rel).join(', ')}`);
  return hit;
}

const NOTE = '01-Projects/alpha/note.md';

// ── Table C — the decision matrix, one case per row ──────────────────────────

test('dream-promote C1: a path outside the promotion allowlist is refused and publishes nothing', () => {
  const sc = scenario({ brain: { 'CLAUDE.md': 'be evil\n' } });
  const res = run(sc);
  refusalFor(res, 'CLAUDE.md');
  assert.equal(res.promoted.length, 0);
  assert.equal(get(sc.vaultDir, 'CLAUDE.md'), null, 'no content is PUBLISHED to the vault');
});

test('dream-promote C2: a deleted note is refused — promotion never deletes', () => {
  const sc = scenario({ vault: { [NOTE]: 'keep me\n' }, brain: { [NOTE]: null } });
  const res = run(sc);
  assert.match(refusalFor(res, NOTE), /never deletes/);
  assert.deepEqual(get(sc.vaultDir, NOTE), B('keep me\n'), 'the vault keeps the note');
});

test('dream-promote C3: an added note with no vault path is promoted', () => {
  const sc = scenario({ brain: { [NOTE]: 'brand new\n' } });
  const res = run(sc);
  assert.deepEqual(promotionFor(res, NOTE).bytes, B('brand new\n'));
  assert.deepEqual(get(sc.vaultDir, NOTE), B('brand new\n'));
});

test('dream-promote C4: an added note whose path the USER created during the run is refused', () => {
  const sc = scenario({ brain: { [NOTE]: 'brain version\n' } });
  // The user creates the note after the workspace was seeded.
  put(sc.vaultDir, NOTE, 'user version\n');
  const res = run(sc);
  assert.match(refusalFor(res, NOTE), /already exists/);
  assert.deepEqual(get(sc.vaultDir, NOTE), B('user version\n'), "the brain's version does not displace it");
});

test('dream-promote C5: a modified note the user did not touch is promoted, unmerged', () => {
  const sc = scenario({ vault: { [NOTE]: 'a\nb\nc\n' }, brain: { [NOTE]: 'a\nB\nc\n' } });
  const res = run(sc);
  assert.deepEqual(promotionFor(res, NOTE).bytes, B('a\nB\nc\n'));
  assert.deepEqual(get(sc.vaultDir, NOTE), B('a\nB\nc\n'));
});

test('dream-promote C6: a divergent edit that merges clean promotes the MERGED bytes', () => {
  const sc = scenario({ vault: { [NOTE]: 'one\ntwo\nthree\nfour\nfive\n' }, brain: { [NOTE]: 'ONE\ntwo\nthree\nfour\nfive\n' } });
  // The user edits the far end of the file during the run.
  put(sc.vaultDir, NOTE, 'one\ntwo\nthree\nfour\nFIVE\n');
  const res = run(sc);
  const merged = promotionFor(res, NOTE).bytes;
  assert.deepEqual(merged, B('ONE\ntwo\nthree\nfour\nFIVE\n'), "both sides' edits survive");
  assert.deepEqual(get(sc.vaultDir, NOTE), merged);
});

test('dream-promote C7: a conflicting merge is refused and the USER\'s live version is untouched', () => {
  const sc = scenario({ vault: { [NOTE]: 'base\n' }, brain: { [NOTE]: 'brain wrote this\n' } });
  put(sc.vaultDir, NOTE, 'user wrote this\n');
  const res = run(sc);
  assert.match(refusalFor(res, NOTE), /conflict/i);
  // M1's trap, asserted: `git merge-file` writes conflict markers INTO its
  // first operand, so an implementation that merged on the live note would
  // leave them here.
  const live = get(sc.vaultDir, NOTE);
  assert.deepEqual(live, B('user wrote this\n'), 'byte-identical to its vault-now version');
  assert.ok(!/^<<<<<<<|^=======|^>>>>>>>/m.test(String(live)), 'no conflict marker in the live note');
});

test('dream-promote C8: modify/delete is a conflict and the user\'s deletion wins', () => {
  const sc = scenario({ vault: { [NOTE]: 'base\n' }, brain: { [NOTE]: 'brain edit\n' } });
  fs.rmSync(path.join(sc.vaultDir, ...NOTE.split('/')));
  const res = run(sc);
  assert.match(refusalFor(res, NOTE), /deleted in the vault/);
  assert.equal(get(sc.vaultDir, NOTE), null, 'the deletion stands');
});

test('dream-promote C1: the allowlist is evaluated FIRST — top to bottom, first match decides', () => {
  // Table C: "Rows C1-C8 are the evaluated conditions, top to bottom, first
  // match decides." A DELETED non-admitted path must therefore report C1's
  // reason, not C2's. Found by the PR-review gate (round 1, F5a).
  const sc = scenario({ vault: { 'CLAUDE.md': 'steer\n' }, brain: { 'CLAUDE.md': null } });
  const res = run(sc);
  const reason = refusalFor(res, 'CLAUDE.md');
  assert.match(reason, /not admitted/, 'C1 decides before C2');
  assert.ok(!/never deletes/.test(reason), 'C2 must not be the reported reason');
});

test('dream-promote C1: a never-admissible path does not feed the transcript-deferral signal', () => {
  // C1 running before the secret gate is the other half of the ordering. Per
  // Table E only `withheld` defers a transcript, so counting a path the
  // allowlist can never admit would hold a transcript back to re-refuse the
  // same note every run. Found by the PR-review gate (round 1, F5b).
  const sc = scenario({ brain: { '.gitignore': Buffer.from([0x2a, 0x00, 0xff, 0x0a]) } });
  let secretGateSaw = 0;
  const res = run(sc, {
    gates: gates({
      secret: () => {
        secretGateSaw += 1;
        return { refuse: true, reason: 'hard secret' };
      },
    }),
  });
  assert.match(refusalFor(res, '.gitignore'), /not admitted/);
  assert.equal(secretGateSaw, 0, 'a never-admissible path never reaches the secret gate');
  assert.deepEqual(res.secretDisposition, { withheld: 0, redactions: 0 });
});

// ── Row C9 — the promotion allowlist ────────────────────────────────────────

test('dream-promote: M7\'s mechanism — the current instruction-file conventions never enter the vault', () => {
  const hostile = {
    'CLAUDE.md': 'root steer\n',
    'AGENTS.md': 'root steer\n',
    '01-Projects/x/AGENTS.md': 'nested steer\n',
    '01-Projects/x/CLAUDE.local.md': 'nested steer\n',
    '01-Projects/x/AGENTS.override.md': 'nested steer\n',
    '.gitignore': '*\n',
    '01-Projects/x/.claude/rules/evil.md': 'nested steer\n',
    '01-Projects/x/.claude/settings.json': '{}\n',
  };
  const sc = scenario({ brain: hostile });
  const res = run(sc);

  assert.equal(res.promoted.length, 0, 'none of them promotes');
  assert.equal(res.redacted.length, 0);
  for (const rel of Object.keys(hostile)) {
    refusalFor(res, rel);
    assert.equal(get(sc.vaultDir, rel), null, `the vault must not contain ${rel}`);
  }
});

test('dream-promote: spelling does not decide admission — RED side', () => {
  const admit = makeAdmit(defaultLayout());
  // Case: the primary filesystem is case-insensitive, so a literal comparison
  // would admit these while the harness still loads them as instruction files.
  assert.ok(admit('01-Projects/x/agents.override.md'), 'lowercased AGENTS.override.md is refused');
  assert.ok(admit('01-Projects/x/claude.local.md'), 'lowercased CLAUDE.local.md is refused');
  assert.ok(admit('01-Projects/x/.CLAUDE/rules/evil.md'), 'an uppercased .CLAUDE segment is refused');
  // Normal form: the same basename spelled decomposed is the same file.
  const nfd = 'AGENTS.override.md'.normalize('NFD');
  assert.ok(admit(`01-Projects/x/${nfd}`), 'a decomposed instruction basename is refused');
});

test('dream-promote: spelling does not decide admission — GREEN side, one directory not two', () => {
  // `reports_dir` is the worked example because it is ADMITTED: the shipped
  // skill requires the BRAIN to author the dream report, so the report is brain
  // content and promotion is how it reaches the vault.
  const composed = 'reports/dreáms'; // á as one code point
  const decomposed = 'reports/dreáms'; // a + combining acute
  assert.notEqual(composed, decomposed, 'the fixture must really be two spellings');

  const layoutComposed = { ...defaultLayout(), reports_dir: composed };
  const admitComposed = makeAdmit(layoutComposed);
  assert.equal(admitComposed(`${composed}/2026-08-29.md`), null, 'composed on disk ADMITS');
  assert.equal(admitComposed(`${decomposed}/2026-08-29.md`), null, 'decomposed on disk ADMITS');

  const admitDecomposed = makeAdmit({ ...defaultLayout(), reports_dir: decomposed });
  assert.equal(admitDecomposed(`${composed}/2026-08-29.md`), null, 'and the same in the other direction');
  assert.equal(admitDecomposed(`${decomposed}/2026-08-29.md`), null);

  // No false refusal for ordinary admitted content either.
  assert.equal(admitComposed('01-Projects/x/note.md'), null);
  assert.equal(admitComposed('02-Areas/health.md'), null);
  assert.equal(admitComposed('03-Resources/ref.md'), null);
});

test('dream-promote: policy is judged on the RESOLVED path, not the candidate', { skip: !POSIX }, () => {
  for (const target of ['../.claude', '..']) {
    const sc = scenario({ brain: { '01-Projects/alias/evil.md': 'steer\n' } });
    // A PRE-EXISTING vault symlink: a lexically admitted path lands somewhere
    // the policy denies, and vault containment alone cannot see it because the
    // resolved target is still inside the vault.
    const victim = path.join(sc.vaultDir, target === '..' ? '.' : '.claude');
    fs.mkdirSync(path.join(sc.vaultDir, '01-Projects'), { recursive: true });
    if (target === '../.claude') fs.mkdirSync(victim, { recursive: true });
    fs.symlinkSync(target, path.join(sc.vaultDir, '01-Projects', 'alias'));
    const before = fs.readdirSync(victim).sort();

    const res = run(sc);
    const reason = refusalFor(res, '01-Projects/alias/evil.md');
    // THE MECHANISM, not just the outcome: the refusal must come from `admit`
    // applied to the RESOLVED rel. Asserting only "some refusal happened" would
    // stay green if the primitive's symlink refusal (H3) fired instead, which
    // is a different guarantee on a different rule.
    assert.match(reason, /not admitted/, 'the caller POLICY refused it, not the symlink guard');
    assert.ok(
      !reason.includes('01-Projects/alias/'),
      `the policy judged the resolved path, not the candidate: ${reason}`
    );
    assert.equal(res.promoted.length, 0);
    assert.deepEqual(fs.readdirSync(victim).sort(), before, 'the victim directory gains nothing');
  }
});

// ── Table D — the four gates: order and input ────────────────────────────────

test('dream-promote D: the secret gate runs BEFORE the merge and a withheld path never reaches it', () => {
  const sc = scenario({ vault: { [NOTE]: 'base\n' }, brain: { [NOTE]: 'base\nAKIA_SECRET\n' } });
  put(sc.vaultDir, NOTE, 'base\nuser line\n');

  const seen = [];
  const res = run(sc, {
    gates: gates({ secret: () => ({ refuse: true, reason: 'hard secret in added lines' }) }),
    spawnGit: (o) => {
      seen.push(o);
      return spawnGitForMerge(o);
    },
  });

  assert.match(refusalFor(res, NOTE), /^EP2: hard secret/);
  assert.equal(seen.length, 0, 'the merge never ran, so no merged candidate ever existed');
  assert.equal(res.secretDisposition.withheld, 1);
  assert.deepEqual(get(sc.vaultDir, NOTE), B('base\nuser line\n'));
});

test('dream-promote D: the three post-merge gates judge the MERGED bytes', () => {
  const sc = scenario({
    vault: { [NOTE]: 'one\ntwo\nthree\nfour\nfive\n' },
    brain: { [NOTE]: 'ONE\ntwo\nthree\nfour\nfive\n' },
  });
  // The user's own edit is what carries the forbidden content, so it exists
  // ONLY in the merged bytes.
  put(sc.vaultDir, NOTE, 'one\ntwo\nthree\nfour\nFORBIDDEN\n');

  /** @type {Buffer[]} */
  const judged = [];
  const res = run(sc, {
    gates: gates({
      tier3: ({ candidateBytes }) => {
        judged.push(candidateBytes);
        // The brain's pre-merge bytes would PASS this gate; the merged bytes
        // must not.
        return String(candidateBytes).includes('FORBIDDEN') ? 'tier-3 floor: forbidden content' : null;
      },
    }),
  });

  assert.equal(judged.length, 1);
  assert.deepEqual(judged[0], B('ONE\ntwo\nthree\nfour\nFORBIDDEN\n'), 'the gate saw the merged bytes');
  assert.ok(
    !String(sc.delta.records[0].afterBytes).includes('FORBIDDEN'),
    'and the pre-merge bytes it would otherwise have judged do not contain it'
  );
  assert.match(refusalFor(res, NOTE), /tier-3 floor/);
  assert.deepEqual(
    get(sc.vaultDir, NOTE),
    B('one\ntwo\nthree\nfour\nFORBIDDEN\n'),
    "the note stays in the user's live version"
  );
});

test('dream-promote D: ADR-0020 — the skill guard is handed the BASELINE ledger, not the post-brain one', () => {
  const SKILL = '05-Skills/wienerdog-x/SKILL.md';
  const LEDGER = '05-Skills/wienerdog-x/LEARNINGS.md';
  const sc = scenario({
    vault: { [SKILL]: 'body v1\n', [LEDGER]: 'authorized: no\n' },
    brain: { [SKILL]: 'body v2\n', [LEDGER]: 'authorized: yes\n' },
  });

  const res = run(sc, {
    gates: gates({
      skillBody: ({ rel, baselineLedgerBytes }) => {
        if (!rel.endsWith('SKILL.md')) return null;
        // The brain rewrote the ledger to authorize itself in the same run. The
        // guard must not see that rewrite.
        return String(baselineLedgerBytes).includes('authorized: yes')
          ? null
          : 'skill-body change is not authorized by the committed ledger';
      },
    }),
  });

  assert.match(refusalFor(res, SKILL), /not authorized/);
  assert.deepEqual(get(sc.vaultDir, SKILL), B('body v1\n'), 'the brain did not rewrite its own skill');
});

test('dream-promote D: the gates receive the evidence Table D enumerates, not bytes alone', () => {
  const SKILL = '05-Skills/wienerdog-x/SKILL.md';
  const LEDGER = '05-Skills/wienerdog-x/LEARNINGS.md';

  // Case 1: IDENTICAL candidate ledger bytes, opposite outcomes, decided solely
  // by whether the named session is in THIS RUN's extracts.
  const ledgerGate = ({ rel, extractsBySession }) => {
    if (!rel.endsWith('LEARNINGS.md')) return null;
    return extractsBySession.has('sess-1') ? null : 'ledger names a session this run did not extract';
  };
  const mk = () =>
    scenario({ vault: { [LEDGER]: 'v1\n' }, brain: { [LEDGER]: 'counted: sess-1\n' } });

  const present = mk();
  const resPresent = run(present, {
    gates: gates({ ledger: ledgerGate }),
    extractsBySession: new Map([['sess-1', { invoked: true }]]),
  });
  assert.deepEqual(promotionFor(resPresent, LEDGER).bytes, B('counted: sess-1\n'));

  const absent = mk();
  const resAbsent = run(absent, { gates: gates({ ledger: ledgerGate }), extractsBySession: new Map() });
  assert.match(refusalFor(resAbsent, LEDGER), /did not extract/);

  // Case 2: a skill revision refused solely because the ownership registry does
  // not name it.
  const sc = scenario({ vault: { [SKILL]: 'v1\n' }, brain: { [SKILL]: 'v2\n' } });
  const res = run(sc, {
    gates: gates({
      skillBody: ({ rel, registry }) =>
        registry && registry.skills && registry.skills[rel]
          ? null
          : 'skill-body change on a skill not in the ownership registry (fail closed)',
    }),
    registry: { skills: {} },
  });
  assert.match(refusalFor(res, SKILL), /ownership registry/);

  // And the pair is judged from the pair's candidate and BASELINE bytes, never
  // from the live vault.
  const pair = scenario({
    vault: { [SKILL]: 'head\nb\nc\nd\ntail\n', [LEDGER]: 'ledger v1\n' },
    brain: { [SKILL]: 'BRAIN\nb\nc\nd\ntail\n', [LEDGER]: 'ledger v2\n' },
  });
  put(pair.vaultDir, SKILL, 'head\nb\nc\nd\nLIVE\n');
  /** @type {Buffer[]} */
  const pairedSeen = [];
  run(pair, {
    gates: gates({
      ledger: ({ rel, pairedSkillBytes }) => {
        if (rel.endsWith('LEARNINGS.md')) pairedSeen.push(pairedSkillBytes);
        return null;
      },
    }),
  });
  assert.equal(pairedSeen.length, 1);
  assert.deepEqual(pairedSeen[0], B('BRAIN\nb\nc\nd\nLIVE\n'), "the pair's MERGED candidate, never the live vault");
});

test('dream-promote D: unscannable content is refused, even by a gate that passes the empty scan', () => {
  // A `.md` whose delta record is BINARY. The delta primitive returns no line
  // numbers for it, so a gate defined only over added lines sees an empty scan.
  const binary = Buffer.from([0x23, 0x20, 0x00, 0xff, 0xfe, 0x0a]);
  const sc = scenario({ brain: { [NOTE]: binary } });
  const record = sc.delta.records.find((r) => r.rel === NOTE);
  assert.equal(record.binary, true, 'the fixture must really produce a binary record');
  assert.deepEqual(record.addedLineNumbers, [], 'and therefore an empty scan');

  // The injected gate treats the empty scan as a pass — the module must refuse
  // anyway. This is the RED side: an implementation that delegated the decision
  // to the gate would promote it raw.
  const res = run(sc, { gates: gates({ secret: () => ({ ok: true }) }) });
  assert.match(refusalFor(res, NOTE), /EP2: content is binary/);
  assert.equal(get(sc.vaultDir, NOTE), null, 'it does not reach the vault');
  assert.equal(res.secretDisposition.withheld, 1);
});

test('dream-promote D: content that is not lossless UTF-8 is refused for the same reason', () => {
  assert.equal(isLosslessUtf8(B('ok\n')), true);
  assert.equal(isLosslessUtf8(Buffer.from([0xc3, 0x28])), false, 'an invalid sequence does not round-trip');

  // No NUL, so the delta calls it text; the bytes are still unscannable.
  const sc = scenario({ brain: { [NOTE]: Buffer.from([0x61, 0xc3, 0x28, 0x0a]) } });
  assert.equal(sc.delta.records.find((r) => r.rel === NOTE).binary, false);
  const res = run(sc);
  assert.match(refusalFor(res, NOTE), /not lossless UTF-8/);
  assert.equal(get(sc.vaultDir, NOTE), null);
});

test('dream-promote D: the skill ↔ ledger pair promotes atomically AT THE DECISION', () => {
  const SKILL = '05-Skills/wienerdog-x/SKILL.md';
  const LEDGER = '05-Skills/wienerdog-x/LEARNINGS.md';
  const sc = scenario({
    vault: { [SKILL]: 'v1\n', [LEDGER]: 'l1\n' },
    brain: { [SKILL]: 'v2\n', [LEDGER]: 'l2\n' },
  });

  const res = run(sc, {
    gates: gates({ ledger: ({ rel }) => (rel.endsWith('LEARNINGS.md') ? 'ledger fails policy' : null) }),
  });

  assert.equal(res.promoted.length, 0, 'a policy failure on one refuses BOTH');
  assert.match(refusalFor(res, LEDGER), /ledger fails policy/);
  assert.match(refusalFor(res, SKILL), /paired with/);
  assert.deepEqual(get(sc.vaultDir, SKILL), B('v1\n'));
  assert.deepEqual(get(sc.vaultDir, LEDGER), B('l1\n'));
});

// ── Table Q — the EP2 result and the quarantine lifecycle behind it ──────────

test('dream-promote Q: the redact disposition promotes the SANITIZED candidate and counts separately', () => {
  const sc = scenario({ brain: { [NOTE]: 'note\nentropy=Zm9vYmFyYmF6cXV4\n' } });
  const res = run(sc, {
    gates: gates({
      secret: () => ({
        redact: true,
        sanitizedBytes: B('note\nentropy=[REDACTED]\n'),
        lines: 1,
        labels: 'high-entropy',
        artifact: '2026-08-29-note.md',
      }),
    }),
  });

  assert.equal(res.promoted.length, 0, 'a redaction is not an ordinary promotion');
  assert.equal(res.refused.length, 0, 'and it is not a hard refusal');
  assert.equal(res.redacted.length, 1);
  assert.equal(res.redacted[0].rel, NOTE);
  assert.deepEqual(res.redacted[0].bytes, B('note\nentropy=[REDACTED]\n'));
  assert.deepEqual(get(sc.vaultDir, NOTE), B('note\nentropy=[REDACTED]\n'));
  assert.deepEqual(res.secretDisposition, { withheld: 0, redactions: 1 });
});

test('dream-promote Q1–Q3: a redaction carries the artifact the gate RETURNED, never a predicted name', () => {
  // A deliberate basename COLLISION: two notes on one date whose predicted name
  // would be identical, so a line built by predicting from the date and path
  // names a file that does not exist for one of them.
  const A = '01-Projects/alpha/note.md';
  const C = '01-Projects/beta/note.md';
  const sc = scenario({ brain: { [A]: 'a\nsecret\n', [C]: 'c\nsecret\n' } });

  const actual = { [A]: '2026-08-29-note.md', [C]: '2026-08-29-note-1.md' };
  const res = run(sc, {
    gates: gates({
      secret: ({ rel }) => ({
        redact: true,
        sanitizedBytes: B(`${rel[12]}\n[REDACTED]\n`),
        lines: 1,
        labels: 'high-entropy,aws-key',
        artifact: actual[rel],
      }),
    }),
  });

  assert.equal(res.redacted.length, 2);
  for (const entry of res.redacted) {
    assert.equal(entry.artifact, actual[entry.rel], 'the collision-resolved name the gate reported');
    assert.equal(entry.lines, 1);
    assert.equal(entry.labels, 'high-entropy,aws-key');
    assert.ok(Buffer.isBuffer(entry.bytes));
  }
  assert.notEqual(res.redacted[0].artifact, res.redacted[1].artifact, 'a predicted name would collide');
});

test('dream-promote Q1: a redact arm carrying only {redact, sanitizedBytes} is refused fail-loud', () => {
  const sc = scenario({ brain: { [NOTE]: 'note\nsecret\n' } });
  assert.throws(
    () => run(sc, { gates: gates({ secret: () => ({ redact: true, sanitizedBytes: B('note\n[REDACTED]\n') }) }) }),
    (err) => err instanceof WienerdogError && /no preserved copy/.test(err.message)
  );
  assert.equal(get(sc.vaultDir, NOTE), null, 'nothing was published');
});

test('dream-promote Q4: the only-copy invariant — no artifact means nothing is promoted', () => {
  const sc = scenario({ vault: { [NOTE]: 'user bytes\n' }, brain: { [NOTE]: 'user bytes\nsecret\n' } });
  // The user saved the note mid-run, so a copy of what it USED to be is not a
  // copy of what they wrote. Here the preservation failed outright: the gate
  // reports no artifact, and the module must not weaken the invariant to "a
  // copy was attempted".
  put(sc.vaultDir, NOTE, 'user bytes\nsaved mid-run\n');

  assert.throws(
    () =>
      run(sc, {
        gates: gates({
          secret: () => ({ redact: true, sanitizedBytes: B('sanitized\n'), lines: 1, labels: 'x', artifact: '' }),
        }),
      }),
    (err) => err instanceof WienerdogError && /only-copy invariant is unsatisfied/.test(err.message)
  );
  assert.deepEqual(get(sc.vaultDir, NOTE), B('user bytes\nsaved mid-run\n'), 'the working copy is byte-unchanged');
});

test('dream-promote Q3: a redaction that is LATER refused still names the preserved copy', () => {
  // Found by the PR-review gate (round 1, F1) and reproduced. By the time a
  // post-merge gate refuses, the secret gate has ALREADY written an unredacted
  // copy into the quarantine — and `state/quarantine/redacted/` carries no
  // digest banner, so if nothing announces the file, the copy is lost in
  // practice. The refusal reason is the only channel a non-promoted path has.
  //
  // PARTIAL BY DESIGN: this keeps the name reachable inside the `{rel, reason}`
  // shape Table S row S3 fixes. A TYPED carrier on the refused arm is a
  // contract change and is the owner's, so it is not asserted here.
  const redactArm = {
    redact: true,
    sanitizedBytes: B('note\n[REDACTED]\n'),
    lines: 1,
    labels: 'aws-key',
    artifact: '2026-08-29-n.md',
  };

  // (a) refused by a post-merge gate
  const byGate = scenario({ brain: { [NOTE]: 'note\nsecret\n' } });
  const r1 = run(byGate, {
    gates: gates({ secret: () => redactArm, tier3: () => 'tier-3 floor: refused after redaction' }),
  });
  assert.match(refusalFor(r1, NOTE), /preserved as `2026-08-29-n\.md`/);
  assert.equal(get(byGate.vaultDir, NOTE), null);

  // (b) refused by pair atomicity — the sibling's refusal must not swallow it
  const SKILL = '05-Skills/x/SKILL.md';
  const LEDGER = '05-Skills/x/LEARNINGS.md';
  const byPair = scenario({
    vault: { [SKILL]: 'v1\n', [LEDGER]: 'l1\n' },
    brain: { [SKILL]: 'v2\n', [LEDGER]: 'l2\n' },
  });
  const r2 = run(byPair, {
    gates: gates({
      secret: ({ rel }) => (rel.endsWith('SKILL.md') ? { ...redactArm, artifact: 'skill-copy.md' } : { ok: true }),
      ledger: ({ rel }) => (rel.endsWith('LEARNINGS.md') ? 'ledger fails policy' : null),
    }),
  });
  assert.match(refusalFor(r2, SKILL), /preserved as `skill-copy\.md`/);

  // (c) refused by the primitive's expect guard, during the write phase
  const { writeIntoVault } = require('../../src/core/dream/vault-write');
  const byExpect = scenario({ vault: { [NOTE]: 'base\n' }, brain: { [NOTE]: 'base\nsecret\n' } });
  const r3 = run(byExpect, {
    gates: gates({ secret: () => redactArm }),
    writeFile: (o) => {
      put(byExpect.vaultDir, NOTE, 'user saved after the decision\n');
      return writeIntoVault(o);
    },
  });
  assert.match(refusalFor(r3, NOTE), /preserved as `2026-08-29-n\.md`/);
});

// ── Table E — the write, the seam, the window, the accounting ────────────────

test('dream-promote E: every vault content write goes through the primitive', () => {
  const sc = scenario({
    vault: { [NOTE]: 'base\n' },
    brain: { [NOTE]: 'edited\n', '00-Inbox/new.md': 'fresh\n', 'CLAUDE.md': 'denied\n' },
  });

  /** @type {Map<string, Buffer>} the vault exactly as it stood before the run */
  const vaultBefore = new Map(walkVault(sc.vaultDir).map((rel) => [rel, get(sc.vaultDir, rel)]));

  /** @type {string[]} */
  const throughSeam = [];
  const { writeIntoVault } = require('../../src/core/dream/vault-write');
  const res = run(sc, {
    writeFile: (o) => {
      const out = writeIntoVault(o);
      if (out.written) throughSeam.push(o.rel);
      return out;
    },
  });

  // THE ORACLE IS THE VAULT, not the return value. Comparing the seam calls
  // against `res.promoted`/`res.redacted` would stay green against a bypass
  // write that ALSO omitted its outcome — both sides would move together. So
  // walk the tree and take the set of paths whose bytes actually changed.
  const changed = [];
  for (const rel of walkVault(sc.vaultDir)) {
    const now = get(sc.vaultDir, rel);
    const was = vaultBefore.get(rel);
    if (was === undefined || !was.equals(now)) changed.push(rel);
  }
  assert.deepEqual(changed.sort(), throughSeam.sort(), 'every changed vault file went through the primitive');

  const published = [...res.promoted, ...res.redacted].map((p) => p.rel).sort();
  assert.deepEqual(throughSeam.sort(), published);
  assert.deepEqual(published, ['00-Inbox/new.md', NOTE].sort());
  assert.equal(get(sc.vaultDir, 'CLAUDE.md'), null);
});

test('dream-promote claim-2b-merge-cwd: the merge is never given a cwd at or beneath the workspace', () => {
  const sc = scenario({
    vault: { [NOTE]: 'one\ntwo\nthree\nfour\nfive\n' },
    brain: { [NOTE]: 'ONE\ntwo\nthree\nfour\nfive\n' },
  });
  put(sc.vaultDir, NOTE, 'one\ntwo\nthree\nfour\nFIVE\n');

  // The cwd is resolved INSIDE the seam: the merge's temp directory is removed
  // when the merge returns, so a realpath taken afterwards would fail rather
  // than assert.
  /** @type {Array<{given:string, real:string}>} */
  const cwds = [];
  const res = run(sc, {
    spawnGit: (o) => {
      cwds.push({ given: o.cwd, real: fs.realpathSync(o.cwd) });
      return spawnGitForMerge(o);
    },
  });

  assert.ok(cwds.length > 0, 'the merge must actually have run, or this asserts nothing');
  const wsReal = fs.realpathSync(sc.workspaceDir);
  for (const { given, real } of cwds) {
    for (const [candidate, root] of [
      [real, wsReal],
      [given, sc.workspaceDir],
    ]) {
      assert.notEqual(candidate, root, `merge cwd must not BE the workspace root: ${given}`);
      assert.ok(
        !candidate.startsWith(root + path.sep),
        `merge cwd must not be beneath the workspace root: ${given}`
      );
    }
  }
  // A test asserting the workspace "is not a git repository" would be asserting
  // something the sibling's Table F measures to be unestablishable. The
  // criterion is the cwd assertion, and this is it.
  promotionFor(res, NOTE);
});

test('dream-promote claim-2b-merge-cwd: an ambient TMPDIR inside the workspace is refused, not obeyed', () => {
  // FOUND BY THE PR-REVIEW GATE (round 1, P1) and reproduced. `os.tmpdir()`
  // honours the ambient TMPDIR, which the dream already passes through to the
  // brain, so an environment pointing it into the workspace put the merge's cwd
  // inside the directory CLAIM 2b excludes. The claim is now checked rather
  // than assumed, and the failure is loud — a per-path refusal would have
  // reached the user as "your edit conflicted", which is false.
  const sc = scenario({
    vault: { [NOTE]: 'one\ntwo\nthree\nfour\nfive\n' },
    brain: { [NOTE]: 'ONE\ntwo\nthree\nfour\nfive\n' },
  });
  put(sc.vaultDir, NOTE, 'one\ntwo\nthree\nfour\nFIVE\n');

  /** @type {string[]} */
  const cwds = [];
  const saved = process.env.TMPDIR;
  try {
    process.env.TMPDIR = sc.workspaceDir;
    assert.ok(
      isAtOrBeneath(os.tmpdir(), sc.workspaceDir),
      'the fixture must really point the temp root into the workspace, or this asserts nothing'
    );
    assert.throws(
      () =>
        run(sc, {
          spawnGit: (o) => {
            cwds.push(o.cwd);
            return { status: 0 };
          },
        }),
      (err) => err instanceof WienerdogError && /outside the workspace/.test(err.message)
    );
  } finally {
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
  }

  // The refusal happens BEFORE the spawn, so the offending cwd never reaches git.
  assert.deepEqual(cwds, [], 'no merge ran from inside the workspace');
  // And it happens in the decision phase, so nothing was half-published.
  assert.deepEqual(get(sc.vaultDir, NOTE), B('one\ntwo\nthree\nfour\nFIVE\n'));
});

test('dream-promote E: the compare→promote window is narrowed — a change at the re-read abandons the write', () => {
  const sc = scenario({ vault: { [NOTE]: 'base\n' }, brain: { [NOTE]: 'brain edit\n' } });

  const { writeIntoVault } = require('../../src/core/dream/vault-write');
  const res = run(sc, {
    writeFile: (o) => {
      // The user saves BETWEEN the decision and the primitive's re-read.
      put(sc.vaultDir, NOTE, 'user saved after the decision\n');
      return writeIntoVault(o);
    },
  });

  refusalFor(res, NOTE);
  assert.equal(res.promoted.length, 0);
  assert.deepEqual(get(sc.vaultDir, NOTE), B('user saved after the decision\n'), 'the vault keeps the changed bytes');
});

test('dream-promote E: promotion accounting partitions the delta exactly', () => {
  const sc = scenario({
    vault: { '01-Projects/a/keep.md': 'v1\n', '01-Projects/a/gone.md': 'v1\n' },
    brain: {
      '01-Projects/a/keep.md': 'v2\n',
      '01-Projects/a/gone.md': null,
      '01-Projects/a/new.md': 'fresh\n',
      '01-Projects/a/secret.md': 'leak\n',
      '01-Projects/a/entropy.md': 'hit\n',
      'CLAUDE.md': 'denied\n',
    },
  });

  const res = run(sc, {
    gates: gates({
      secret: ({ rel }) => {
        if (rel.endsWith('secret.md')) return { refuse: true, reason: 'hard secret' };
        if (rel.endsWith('entropy.md')) {
          return { redact: true, sanitizedBytes: B('[REDACTED]\n'), lines: 1, labels: 'entropy', artifact: 'a.md' };
        }
        return { ok: true };
      },
    }),
  });

  const all = [...res.promoted, ...res.redacted, ...res.refused].map((r) => r.rel);
  assert.equal(all.length, sc.delta.records.length, 'the counts sum to the record count');
  assert.equal(new Set(all).size, all.length, 'every record has EXACTLY one outcome');
  assert.deepEqual(all.sort(), sc.delta.records.map((r) => r.rel).sort());
  assert.deepEqual(res.secretDisposition, { withheld: 1, redactions: 1 });
});

// ── Table S — the decided bytes ─────────────────────────────────────────────

test('dream-promote S: every published outcome carries BOTH rel and the primitive\'s bytes', () => {
  const sc = scenario({
    brain: { '01-Projects/a/plain.md': 'plain\n', '01-Projects/a/red.md': 'raw\n', 'CLAUDE.md': 'denied\n' },
  });

  /** @type {Map<string, Buffer>} */
  const returnedByPrimitive = new Map();
  const { writeIntoVault } = require('../../src/core/dream/vault-write');
  const res = run(sc, {
    gates: gates({
      secret: ({ rel }) =>
        rel.endsWith('red.md')
          ? { redact: true, sanitizedBytes: B('sanitized\n'), lines: 1, labels: 'entropy', artifact: 'r.md' }
          : { ok: true },
    }),
    writeFile: (o) => {
      const out = writeIntoVault(o);
      if (out.written) returnedByPrimitive.set(o.rel, out.bytes);
      return out;
    },
  });

  for (const entry of [...res.promoted, ...res.redacted]) {
    assert.equal(typeof entry.rel, 'string', 'the PATH half is required');
    assert.ok(entry.rel.length > 0);
    assert.ok(Buffer.isBuffer(entry.bytes), 'the BYTES half is required');
    // The exact buffer the primitive published, byte-equal to what the vault
    // then holds — never a fresh read and never a digest of one.
    assert.deepEqual(entry.bytes, returnedByPrimitive.get(entry.rel));
    assert.deepEqual(entry.bytes, get(sc.vaultDir, entry.rel));
  }

  // A refused path carries no bytes at all: nothing was published, so there is
  // nothing to carry, and a field that could hold the candidate would invite a
  // consumer to commit bytes the vault never took.
  assert.equal(res.refused.length, 1);
  assert.deepEqual(Object.keys(res.refused[0]).sort(), ['reason', 'rel']);
  assert.equal(res.refused[0].bytes, undefined);
});

// ── Idempotence's stand-in: a run that writes nothing promotes nothing ───────

test('dream-promote: a run in which the brain writes nothing promotes nothing and changes no note', () => {
  const sc = scenario({ vault: { [NOTE]: 'v1\n' } });
  assert.equal(sc.delta.records.length, 0);
  const res = run(sc);
  assert.deepEqual(res, { promoted: [], redacted: [], refused: [], secretDisposition: { withheld: 0, redactions: 0 } });
  assert.deepEqual(get(sc.vaultDir, NOTE), B('v1\n'));
});

// ── Caller-contract violations fail loud rather than degrading ───────────────

test('dream-promote: a missing gate or malformed input throws rather than promoting', () => {
  const sc = scenario({ brain: { [NOTE]: 'x\n' } });
  assert.throws(() => run(sc, { gates: { secret: () => ({ ok: true }) } }), WienerdogError);
  assert.throws(() => promote({ ...sc, gates: gates(), vaultDir: '' }), WienerdogError);
  // `layout` is validated like the other five inputs. Unvalidated, a malformed
  // layout refuses EVERY path with a policy-shaped reason and the run looks
  // like a quiet no-op rather than a caller bug (PR-review gate, round 1, F8).
  for (const bad of [undefined, {}, { ...defaultLayout(), projects_dir: '' }]) {
    assert.throws(
      () => run(sc, { layout: bad }),
      (err) => err instanceof WienerdogError && /`layout` must be a vault layout/.test(err.message),
      `a layout of ${JSON.stringify(bad)} must fail loud`
    );
  }
  assert.throws(
    () => run(sc, { gates: gates({ secret: () => ({ maybe: true }) }) }),
    (err) => err instanceof WienerdogError && /unrecognised disposition/.test(err.message)
  );
});
