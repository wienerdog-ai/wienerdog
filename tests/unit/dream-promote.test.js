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

/** The report body's path for every scenario built here: `reports_dir/<date>.md`. */
const REPORT = 'reports/dreams/2026-08-29.md';

/** The three headings the enforcement record is composed under. */
const H_ENFORCE = '## Refused by policy (promotion enforcement)';
const H_REDACT = '## Redacted in place (secret scan)';
const H_PRESERVED = '## Preserved copies (secret quarantine)';

/**
 * A hostile value: markdown-active text AND a CONTEXT-DEPENDENT secret. Both
 * halves matter. A prefix-shaped secret survives the sanitiser intact and is
 * caught in EITHER order, so a fixture built only from one goes green against
 * the leaking implementation — these two are the shapes that discriminate.
 */
const SECRET = 'abcdefghijkl';
const HOSTILE = `](evil)\`token=${SECRET}\` client_secret: ${SECRET}`;

/** @param {string} s @returns {boolean} */
const leaks = (s) => s.includes(SECRET);

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
    // Table R's fallback publishes this run's record on EVERY run — here the
    // brain wrote no report at all, which is one member of its trigger class —
    // and for `target === '..'` the "victim" IS the vault root, so it
    // legitimately gains the report's own top directory. The guarantee under
    // test is that the SYMLINKED ALIAS publishes nothing, so that one directory
    // is excluded BY NAME and the fallback's outcome is pinned beside it,
    // rather than the assertion being weakened to "roughly unchanged".
    assert.equal(res.report.outcome, 'fallback');
    const reportTop = sc.layout.reports_dir.split('/')[0];
    const notTheReport = (/** @type {string} */ e) => e !== reportTop;
    assert.deepEqual(
      fs.readdirSync(victim).filter(notTheReport).sort(),
      before.filter(notTheReport),
      'the victim directory gains nothing'
    );
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
        redaction: { lines: 1, labels: 'high-entropy' },
        preserved: [{ artifact: '2026-08-29-note.md', location: 'quarantine/redacted' }],
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
        redaction: { lines: 1, labels: 'high-entropy,aws-key' },
        preserved: [{ artifact: actual[rel], location: 'quarantine/redacted' }],
      }),
    }),
  });

  assert.equal(res.redacted.length, 2);
  for (const entry of res.redacted) {
    assert.equal(entry.preserved.length, 1);
    assert.equal(entry.preserved[0].artifact, actual[entry.rel], 'the collision-resolved name the gate reported');
    // `location` is READ off the record, never composed here — the module never
    // touches the state directory (Table Q, row Q7).
    assert.equal(entry.preserved[0].location, 'quarantine/redacted');
    // `remediation` is the MODULE's, filled at OUTCOME time: this path published
    // its sanitized bytes, so the copy is restorable (Table Q, rows Q9 and Q10).
    assert.equal(entry.preserved[0].remediation, 'restore-or-delete');
    assert.deepEqual(entry.redaction, { lines: 1, labels: 'high-entropy,aws-key' });
    assert.ok(Buffer.isBuffer(entry.bytes));
  }
  assert.notEqual(
    res.redacted[0].preserved[0].artifact,
    res.redacted[1].preserved[0].artifact,
    'a predicted name would collide'
  );
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
          secret: () => ({
            redact: true,
            sanitizedBytes: B('sanitized\n'),
            redaction: { lines: 1, labels: 'x' },
            preserved: [],
          }),
        }),
      }),
    (err) => err instanceof WienerdogError && /only-copy invariant is unsatisfied/.test(err.message)
  );
  assert.deepEqual(get(sc.vaultDir, NOTE), B('user bytes\nsaved mid-run\n'), 'the working copy is byte-unchanged');
});

test('dream-promote Q8: a redaction that is LATER refused carries its copy TYPED, and the reason names none', () => {
  // The prose mitigation this replaces was itself defective within one review
  // round: the pair refusal quoted its sibling's decorated reason and named the
  // WRONG file's copy first. A structured fact encoded into free text composes
  // badly. The record is the carrier; the reason carries no basename at all.
  const redactArm = {
    redact: true,
    sanitizedBytes: B('note\n[REDACTED]\n'),
    redaction: { lines: 1, labels: 'aws-key' },
    preserved: [{ artifact: '2026-08-29-n.md', location: 'quarantine/redacted' }],
  };

  /** Every refusal route must carry the record and keep the basename out of the reason. */
  const assertTyped = (res, rel, basename) => {
    const hit = res.refused.find((r) => r.rel === rel);
    assert.ok(hit, `expected \`${rel}\` refused`);
    assert.equal(hit.preserved.length, 1);
    assert.equal(hit.preserved[0].artifact, basename);
    assert.equal(hit.preserved[0].location, 'quarantine/redacted');
    // Filled by the MODULE at outcome time: nothing was promoted for this path.
    assert.equal(hit.preserved[0].remediation, 'delete');
    assert.ok(!hit.reason.includes(basename), `the reason must name no copy: ${hit.reason}`);
  };

  // (a) refused by a post-merge gate
  const byGate = scenario({ brain: { [NOTE]: 'note\nsecret\n' } });
  assertTyped(
    run(byGate, {
      gates: gates({ secret: () => redactArm, tier3: () => 'tier-3 floor: refused after redaction' }),
    }),
    NOTE,
    '2026-08-29-n.md'
  );
  assert.equal(get(byGate.vaultDir, NOTE), null);

  // (b) refused by pair atomicity, BOTH halves redacted — the case the prose
  // form got wrong. Each half carries its OWN copy and neither reason names either.
  const SKILL = '05-Skills/x/SKILL.md';
  const LEDGER = '05-Skills/x/LEARNINGS.md';
  const byPair = scenario({
    vault: { [SKILL]: 'v1\n', [LEDGER]: 'l1\n' },
    brain: { [SKILL]: 'v2\n', [LEDGER]: 'l2\n' },
  });
  const r2 = run(byPair, {
    gates: gates({
      secret: ({ rel }) => ({
        ...redactArm,
        preserved: [
          {
            artifact: rel.endsWith('SKILL.md') ? 'skill-copy.md' : 'ledger-copy.md',
            location: 'quarantine/redacted',
          },
        ],
      }),
      ledger: ({ rel }) => (rel.endsWith('LEARNINGS.md') ? 'ledger fails policy' : null),
    }),
  });
  assertTyped(r2, SKILL, 'skill-copy.md');
  assertTyped(r2, LEDGER, 'ledger-copy.md');
  const skillReason = r2.refused.find((r) => r.rel === SKILL).reason;
  assert.ok(!skillReason.includes('ledger-copy.md'), "the sibling's copy must not appear in this reason");

  // (c) refused by the primitive's expect guard, during the write phase
  const { writeIntoVault } = require('../../src/core/dream/vault-write');
  const byExpect = scenario({ vault: { [NOTE]: 'base\n' }, brain: { [NOTE]: 'base\nsecret\n' } });
  assertTyped(
    run(byExpect, {
      gates: gates({ secret: () => redactArm }),
      writeFile: (o) => {
        put(byExpect.vaultDir, NOTE, 'user saved after the decision\n');
        return writeIntoVault(o);
      },
    }),
    NOTE,
    '2026-08-29-n.md'
  );
});

test('dream-promote Q1/Q9: the HARD-WITHHOLD arm carries its record too', () => {
  // The gap that triggered the escalation: Table D says BOTH EP2 arms preserve,
  // and the refuse arm had no field to report it on. A hard secret is withheld
  // AFTER the gate wrote an unredacted copy.
  const sc = scenario({ brain: { [NOTE]: 'note\nAKIA_SECRET\n' } });
  const res = run(sc, {
    gates: gates({
      secret: () => ({
        refuse: true,
        reason: 'hard secret in added lines',
        preserved: [{ artifact: '2026-08-29-n.md', location: 'quarantine' }],
      }),
    }),
  });
  const hit = res.refused.find((r) => r.rel === NOTE);
  assert.ok(hit);
  assert.equal(hit.preserved.length, 1);
  assert.equal(hit.preserved[0].artifact, '2026-08-29-n.md');
  assert.equal(hit.preserved[0].location, 'quarantine', 'the withheld shelf, as the gate reported it');
  assert.equal(hit.preserved[0].remediation, 'delete');
  assert.ok(!hit.reason.includes('2026-08-29-n.md'));
  assert.equal(res.secretDisposition.withheld, 1);
  assert.equal(get(sc.vaultDir, NOTE), null);
});

test('dream-promote Q9: a path refused BEFORE EP2 ran carries an empty record, not a missing field', () => {
  // Positive absence: an optional field spanning "nothing preserved" and "not
  // asked" is the defect row S2 records one field over.
  const sc = scenario({ brain: { 'CLAUDE.md': 'steer\n', [NOTE]: 'fine\n' } });
  const res = run(sc);
  const denied = res.refused.find((r) => r.rel === 'CLAUDE.md');
  assert.ok(denied);
  assert.ok(Array.isArray(denied.preserved), '`preserved` is required on every refusal');
  assert.deepEqual(denied.preserved, []);
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
  const after = walkVault(sc.vaultDir);
  for (const rel of after) {
    const now = get(sc.vaultDir, rel);
    const was = vaultBefore.get(rel);
    if (was === undefined || !was.equals(now)) changed.push(rel);
  }
  // Both directions: a path that DISAPPEARED is a vault mutation too, and a
  // post-run walk alone cannot see one. Promotion never deletes (C2), so this
  // should always be empty — which is exactly why it is worth asserting.
  for (const rel of vaultBefore.keys()) {
    if (!after.includes(rel)) changed.push(rel);
  }
  assert.deepEqual(changed.sort(), throughSeam.sort(), 'every changed vault file went through the primitive');

  // THE REPORT WRITE IS IN THIS SET TOO, and that is the point of asserting it
  // here rather than only in the report's own tests: the security checklist's
  // "every report write goes through the primitive" is the same property this
  // oracle measures, and the fallback's publish is a vault write like any
  // other. The brain wrote no report, so Table R's row R1 fired.
  assert.equal(res.report.outcome, 'fallback');
  const published = [...res.promoted, ...res.redacted].map((p) => p.rel).concat(REPORT).sort();
  assert.deepEqual(throughSeam.sort(), published);
  assert.deepEqual(published, ['00-Inbox/new.md', NOTE, REPORT].sort());
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

test('dream-promote claim-2b-merge-cwd: a RELATIVE TMPDIR does not slip past the guard', () => {
  // Found by the PR-review gate (round 2, P1): the round-1 guard failed OPEN
  // here. `os.tmpdir()` returns TMPDIR as given, so a relative TMPDIR yields a
  // relative root — and `isAtOrBeneath` answers false for every non-absolute
  // candidate BY DESIGN, which is the right answer where it was written and a
  // fail-open in a guard that asks "am I outside?".
  const sc = scenario({
    vault: { [NOTE]: 'one\ntwo\nthree\nfour\nfive\n' },
    brain: { [NOTE]: 'ONE\ntwo\nthree\nfour\nfive\n' },
  });
  // The user diverges too, so a merge is actually required — without this the
  // path takes C5 and the guard is never reached, which would make the test
  // pass for the wrong reason.
  put(sc.vaultDir, NOTE, 'one\ntwo\nthree\nfour\nFIVE\n');
  const savedTmp = process.env.TMPDIR;
  const savedCwd = process.cwd();
  /** @type {string[]} */
  const cwds = [];
  try {
    // A cwd from which the workspace is reachable by a RELATIVE name.
    process.chdir(path.dirname(sc.workspaceDir));
    process.env.TMPDIR = path.basename(sc.workspaceDir);
    assert.ok(!path.isAbsolute(os.tmpdir()), 'the fixture must really make os.tmpdir() relative');
    assert.equal(
      isAtOrBeneath(os.tmpdir(), sc.workspaceDir),
      false,
      'and the helper must really answer false for it — that is the trap being guarded'
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
    process.chdir(savedCwd);
    if (savedTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = savedTmp;
  }
  assert.deepEqual(cwds, [], 'no merge ran from a relative path inside the workspace');
});

test('dream-promote M2: the merge env confines git\'s upward discovery to its own temp root', () => {
  // The other half of M2's cwd rule — "outside any repository". The config
  // switches neutralise SYSTEM and GLOBAL; none of them stops repository-local
  // discovery walking up from the cwd (PR-review gate, round 2, N2).
  const sc = scenario({
    vault: { [NOTE]: 'one\ntwo\nthree\nfour\nfive\n' },
    brain: { [NOTE]: 'ONE\ntwo\nthree\nfour\nfive\n' },
  });
  put(sc.vaultDir, NOTE, 'one\ntwo\nthree\nfour\nFIVE\n');

  /** @type {Array<Record<string,string>>} */
  const envs = [];
  run(sc, {
    spawnGit: (o) => {
      envs.push(o.env);
      return spawnGitForMerge(o);
    },
  });
  assert.equal(envs.length, 1);
  const env = envs[0];
  assert.equal(env.GIT_CEILING_DIRECTORIES, path.resolve(env.GIT_CEILING_DIRECTORIES), 'must be absolute');
  assert.equal(env.HOME.startsWith(env.GIT_CEILING_DIRECTORIES + path.sep), true, 'the ceiling IS the temp root');
  // The constructed switches are still all there — the ceiling is an addition.
  assert.equal(env.GIT_CONFIG_NOSYSTEM, '1');
  assert.equal(env.GIT_ATTR_NOSYSTEM, '1');
  assert.ok(env.GIT_CONFIG_GLOBAL);
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
          return {
            redact: true,
            sanitizedBytes: B('[REDACTED]\n'),
            redaction: { lines: 1, labels: 'entropy' },
            preserved: [{ artifact: 'a.md', location: 'quarantine/redacted' }],
          };
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
          ? {
              redact: true,
              sanitizedBytes: B('sanitized\n'),
              redaction: { lines: 1, labels: 'entropy' },
              preserved: [{ artifact: 'r.md', location: 'quarantine/redacted' }],
            }
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
  // The shape is the guarantee, not the prose: a refusal carries `rel`, its
  // `reason`, and the preservation record — and NO bytes. A field that could
  // hold the candidate would invite a consumer to commit bytes the vault never
  // took (Table S, row S3).
  assert.deepEqual(Object.keys(res.refused[0]).sort(), ['preserved', 'reason', 'rel']);
  assert.equal(res.refused[0].bytes, undefined);
  assert.deepEqual(res.refused[0].preserved, [], 'nothing was preserved for a path denied before EP2 ran');
});

// ── The dream report (WP-dream-promote-report) ───────────────────────────────
//
// The tables these mirror:
//   the report row — the body as an ordinary promotion candidate
//   Y — the report's SECOND write, and the accounting that must never be silent
//   N — the neutralisation contract: which channels, which transformation, in
//       which order
//   R — the report's publish decision, and its preserve-and-extend fallback
//
// THE REPORT IS NOT A MEMBER OF THE THREE ARRAYS. Its whole disposition travels
// on `report`, which is why every assertion below reads that field rather than
// looking for the path in `promoted[]`/`redacted[]`/`refused[]`.

/** The real primitive, for tests that wrap it in a fault-injecting seam. */
const { writeIntoVault: realWrite } = require('../../src/core/dream/vault-write');

/** @param {string} root @param {string} rel @returns {string} */
const abs = (root, rel) => path.join(root, ...rel.split('/'));

/** A brain-authored body carrying the one section no filesystem outcome can
 *  reconstruct (`skills/wienerdog-dream/SKILL.md:409-425`). */
const GATED_OUT = '## Gated out (and why)\n- alpha/plan — Tier 3 blocked: derived_from_untrusted\n';
/** @param {string} [tag] @returns {string} */
const body = (tag = 'one') => `# Dream report — 2026-08-29\n\nrun ${tag}\n\n${GATED_OUT}`;

/** The record as the section it is rendered into. @param {object} res */
const sectionOf = (res) => `${res.report.record.join('\n')}\n`;

test('dream-promote: the brain-authored report body survives end to end, and a same-date second run lands', () => {
  const sc = scenario({ brain: { [REPORT]: body('one') } });
  const res = run(sc);

  // The body is a promotion candidate like any other — C9 admits `reports_dir`
  // and the gates that match it judge it — but its outcome is `report`, never a
  // member of the three arrays.
  assert.equal(res.report.outcome, 'promoted');
  assert.deepEqual(res.report.accounting, { published: true });
  assert.equal(res.report.redaction, null, 'the gate did not redact the body — stated, not omitted');
  assert.deepEqual(res.report.preserved, []);
  assert.deepEqual([...res.promoted, ...res.redacted, ...res.refused], []);

  const published = get(sc.vaultDir, REPORT);
  // BYTE-FOR-BYTE. A code-composed report drops `## Gated out (and why)`
  // entirely, because it names candidates the brain did NOT write and no
  // filesystem outcome can reconstruct a file that never existed.
  assert.equal(String(published), `${body('one')}\n${sectionOf(res)}`);
  assert.ok(String(published).includes(GATED_OUT), "the brain's own accounting survives");
  // Table Y, row Y3 — on `published:true` the SECOND write's returned buffer.
  assert.deepEqual(res.report.bytes, published);

  // ── The same date, a second time ──────────────────────────────────────────
  // Run 1's report is in the baseline, so run 2 sees a MODIFIED note, not an
  // added one that C4 would refuse for existing.
  const sc2 = scenario({ vault: { [REPORT]: published }, brain: { [REPORT]: body('two') } });
  assert.equal(sc2.delta.records[0].status, 'modified');
  const res2 = run(sc2);
  assert.equal(res2.report.outcome, 'promoted');
  assert.deepEqual(res2.report.accounting, { published: true });
  // NO APPEND-IN-PLACE: the second run REPLACES the body through the primitive,
  // so run 1's record is gone. An implementation that appended to the file on
  // disk would leave it here, and that is the shape this assertion kills.
  assert.equal(String(get(sc2.vaultDir, REPORT)), `${body('two')}\n${sectionOf(res2)}`);
  assert.ok(!String(get(sc2.vaultDir, REPORT)).includes('run one'));
});

test('dream-promote report-fallback R1: with no report for the date, the code section alone is published', () => {
  const sc = scenario({ brain: { [NOTE]: 'fresh\n' } });
  const res = run(sc);
  assert.equal(res.report.outcome, 'fallback');
  assert.deepEqual(res.report.preserved, []);
  assert.equal(String(get(sc.vaultDir, REPORT)), sectionOf(res));
  assert.deepEqual(res.report.bytes, get(sc.vaultDir, REPORT));
  // The fallback publish is recorded as ITSELF, never as a normal promotion.
  assert.ok(!res.promoted.some((p) => p.rel === REPORT));
});

test('dream-promote report-fallback R2: run 1\'s report is byte-preserved and this run\'s section appended below it', () => {
  const run1 = '# Dream report — 2026-08-29\n\nrun one\n';
  const sc = scenario({ vault: { [REPORT]: run1 }, brain: { [REPORT]: body('two') } });
  const res = run(sc, { gates: gates({ secret: ({ rel }) => (rel === REPORT ? { refuse: true, reason: 'hard secret' } : { ok: true }) }) });

  assert.equal(res.report.outcome, 'fallback');
  const now = String(get(sc.vaultDir, REPORT));
  assert.ok(now.startsWith(run1), "run 1's report is preserved INTACT");
  assert.equal(now, `${run1}\n${sectionOf(res)}`);
  // Both values are preserved: neither the existing report nor this run's
  // record is lost, and the brain's body is accounted as refused with a reason.
  assert.ok(sectionOf(res).includes('hard secret'));
  assert.ok(sectionOf(res).includes('reports_dreams_2026-08-29.md'));
});

test('dream-promote report-fallback R3: a report the USER edited is preserved verbatim and appended to, never repaired', () => {
  // Diverged from anything this run could reconstruct: a hand-written note in
  // the middle of the file, and no trailing newline.
  const edited = '# my own report\n\nI deleted the machine section and wrote this instead.';
  const sc = scenario({ vault: { [REPORT]: edited }, brain: { [REPORT]: body('two') } });
  const res = run(sc, { gates: gates({ secret: ({ rel }) => (rel === REPORT ? { refuse: true, reason: 'hard secret' } : { ok: true }) }) });

  assert.equal(res.report.outcome, 'fallback');
  const now = String(get(sc.vaultDir, REPORT));
  // R3 IS THE SAME RULE AS R2. The instinct to repair a diverged file is what
  // would break it, so the assertion is on the user's bytes surviving EXACTLY.
  assert.equal(now, `${edited}\n${sectionOf(res)}`);
  assert.ok(!now.includes('Dream report — 2026-08-29'), 'nothing reconstructed the machine header');
});

test('dream-promote report-fallback R4: a report mutated between the read and the publish is refused, and the record goes to the caller', () => {
  const edited = '# my own report\n\nlive edit\n';
  const sc = scenario({ vault: { [REPORT]: edited }, brain: { [NOTE]: 'fresh\n' } });
  const res = run(sc, {
    writeFile: (o) => {
      // The user saves between the fallback's read and its publish, so the
      // primitive's `expect` guard (H5) abandons the write.
      if (o.rel === REPORT) fs.writeFileSync(abs(sc.vaultDir, REPORT), 'saved again\n');
      return realWrite(o);
    },
  });

  assert.equal(res.report.outcome, 'refused');
  assert.equal(typeof res.report.reason, 'string');
  assert.ok(res.report.reason.length > 0, 'the refusal NAMES ITS REASON');
  assert.equal(res.report.bytes, undefined, 'the refused arm cannot carry bytes');
  // In this narrow window an overwrite would be the WORSE failure: it would
  // clobber the user's live edit. The vault object is left untouched.
  assert.equal(String(get(sc.vaultDir, REPORT)), 'saved again\n');
  // And the record is not lost — it goes back to the caller for the run's log
  // and output. Returning it is not delivering it; the caller delivers.
  assert.ok(Array.isArray(res.report.record) && res.report.record.length > 0);
  assert.ok(res.report.record.includes(H_ENFORCE));
});

test('dream-promote report-fallback: EVERY unpublished-body path enters the fallback, not the gate-refusal case alone', () => {
  // (i) A C4 conflict — the USER creates a report at that path during the run.
  const user = '# the user got there first\n';
  const scC4 = scenario({ brain: { [REPORT]: body('two') } });
  put(scC4.vaultDir, REPORT, user);
  const resC4 = run(scC4);
  assert.equal(resC4.report.outcome, 'fallback', 'a promotion-decision refusal is in the trigger class');
  assert.equal(String(get(scC4.vaultDir, REPORT)), `${user}\n${sectionOf(resC4)}`);
  assert.ok(sectionOf(resC4).includes('already exists'), "the body's refusal is accounted, with its reason");

  // (ii) A PRIMITIVE refusal — the target changes between decision and publish,
  // so the body's own write is abandoned by H5 with no gate involved.
  const run1 = '# Dream report — 2026-08-29\n\nrun one\n';
  const scH5 = scenario({ vault: { [REPORT]: run1 }, brain: { [REPORT]: body('two') } });
  let reportWrites = 0;
  const resH5 = run(scH5, {
    writeFile: (o) => {
      if (o.rel === REPORT) {
        reportWrites += 1;
        // Only the BODY's write is sabotaged; the fallback's own write then
        // reads the intervening bytes and appends to them.
        if (reportWrites === 1) fs.writeFileSync(abs(scH5.vaultDir, REPORT), 'user saved mid-run\n');
      }
      return realWrite(o);
    },
  });
  assert.equal(resH5.report.outcome, 'fallback', 'a primitive refusal is in the trigger class too');
  assert.equal(String(get(scH5.vaultDir, REPORT)), `user saved mid-run\n\n${sectionOf(resH5)}`);
});

test('dream-promote report-fallback: the preserved region is not re-gated', () => {
  // The report ALREADY IN THE VAULT carries secret-shaped text. Gates guard
  // content ENTERING the vault, not content residing in it: re-scanning these
  // bytes protects nothing — that content is already exposed — while it can
  // destroy the enforcement record or mutate user-edited bytes.
  const existing = `# Dream report — 2026-08-29\n\ntoken=${SECRET}\nclient_secret: ${SECRET}\n`;
  const sc = scenario({ vault: { [REPORT]: existing }, brain: { [NOTE]: 'fresh\n' } });
  let scanned = 0;
  const res = run(sc, {
    gates: gates({
      secret: (o) => {
        scanned += 1;
        // A gate that DID see these bytes would withhold them.
        if (leaks(String(o.afterBytes))) return { refuse: true, reason: 'hard secret', preserved: [] };
        return { ok: true };
      },
    }),
  });

  assert.equal(res.report.outcome, 'fallback');
  assert.equal(scanned, 1, 'only the brain-written note was scanned; the vault-resident report was not');
  const now = String(get(sc.vaultDir, REPORT));
  assert.ok(now.startsWith(existing), 'republished byte-identical — no gate withheld, redacted or altered it');
  assert.equal(now, `${existing}\n${sectionOf(res)}`);
});

test('dream-promote report-fallback: the caller\'s `records` reach the report, neutralised like the module\'s own', () => {
  const sc = scenario({ brain: { [NOTE]: 'fresh\n' } });
  const res = run(sc, {
    records: [
      { path: `scratch/${HOSTILE}.md`, reason: `dropped from the scratch tree: ${HOSTILE}` },
      { path: 'scratch/ordinary.md', reason: 'dropped from the scratch tree' },
    ],
  });

  const text = String(get(sc.vaultDir, REPORT));
  assert.ok(text.includes('dropped from the scratch tree'), "the CALLER's accounting reaches the report");
  assert.ok(text.includes('scratch_ordinary.md'));
  // Neutralised by Table N's rules exactly as this module's own records are.
  assert.ok(!leaks(text), 'the caller\'s channels are not a bypass');
  assert.ok(!leaks(sectionOf(res)));
});

test('dream-promote report-fallback: a malformed `records` entry fails loud rather than reaching the report mangled', () => {
  const sc = scenario({ brain: { [NOTE]: 'fresh\n' } });
  for (const bad of ['not an array', [null], [{ path: 'a.md' }], [{ path: 1, reason: 'x' }]]) {
    assert.throws(
      () => run(sc, { records: bad }),
      (err) => err instanceof WienerdogError && /`records` must be an array/.test(err.message),
      `records of ${JSON.stringify(bad)} must fail loud`
    );
  }
});

// ── Table N — the neutralisation contract ────────────────────────────────────

test('dream-promote report-fallback: the code-authored section cannot carry refusable bytes, on the normal write AND on the fallback', () => {
  /**
   * Every channel Table N classifies as attacker-influenceable AND the composer
   * interpolates, exercised at once with a value carrying BOTH markdown-active
   * text and a context-dependent secret.
   * @param {'normal'|'fallback'} branch
   */
  const exercise = (branch) => {
    const hostileRel = `01-Projects/${HOSTILE}/note.md`;
    const brain = {
      [hostileRel]: 'refused content\n',
      '01-Projects/a/red.md': 'raw\n',
      // On the NORMAL branch the brain's body publishes and the section rides
      // its second write; on the FALLBACK branch there is no body at all.
      ...(branch === 'normal' ? { [REPORT]: body('one') } : {}),
    };
    const sc = scenario({ brain });
    return {
      sc,
      res: run(sc, {
        records: [{ path: `scratch/${HOSTILE}.md`, reason: `scratch: ${HOSTILE}` }],
        gates: gates({
          secret: ({ rel }) => {
            if (rel.endsWith('red.md')) {
              return {
                redact: true,
                sanitizedBytes: B('sanitized\n'),
                redaction: { lines: 1, labels: 'high-entropy' },
                preserved: [{ artifact: `${HOSTILE}.md`, location: 'quarantine/redacted' }],
              };
            }
            if (rel === hostileRel) {
              // A refusal whose REASON embeds brain-chosen text, and a preserved
              // copy whose basename derives from it.
              return { refuse: true, reason: `EP2 refused ${HOSTILE}`, preserved: [{ artifact: `${HOSTILE}.md`, location: 'quarantine/withheld' }] };
            }
            return { ok: true };
          },
        }),
      }),
    };
  };

  for (const branch of ['normal', 'fallback']) {
    const { sc, res } = exercise(/** @type {'normal'|'fallback'} */ (branch));
    assert.equal(res.report.outcome, branch === 'normal' ? 'promoted' : 'fallback', branch);
    const publishedText = String(get(sc.vaultDir, REPORT));

    // Every channel actually reached the report — an assertion that passed
    // because nothing was composed would prove nothing about neutralisation.
    assert.ok(publishedText.includes(H_ENFORCE), branch);
    assert.ok(publishedText.includes(H_REDACT), branch);
    assert.ok(publishedText.includes(H_PRESERVED), branch);
    assert.ok(publishedText.includes('scratch'), branch);

    // THE PROPERTY: the raw secret bytes appear NOWHERE in the published bytes.
    assert.ok(!leaks(publishedText), `${branch}: no raw secret in the published report`);
    assert.ok(!leaks(sectionOf(res)), `${branch}: nor in the record returned to the caller`);
    // And the placeholder IS there, so the value travelled and was transformed
    // rather than being dropped on the floor.
    assert.ok(publishedText.includes('REDACTED'), branch);
    // Table N, row N1's ORDER, observable in the output: a sanitiser running
    // FIRST would leave `token_abcdefghijkl` — both arms present and still
    // leaking, which is the round (c) implementation.
    assert.ok(!publishedText.includes(`token_${SECRET}`), `${branch}: sanitise-first would leave this`);
  }
});

// ── Table R — every preserved copy is announced, exactly once ────────────────

test('dream-promote report-fallback: EVERY preserved copy is announced — a redaction\'s, a refused path\'s, and the report body\'s', () => {
  const sc = scenario({
    brain: { '01-Projects/a/red.md': 'raw\n', '01-Projects/a/no.md': 'raw\n' },
  });
  const res = run(sc, {
    gates: gates({
      secret: ({ rel }) =>
        rel.endsWith('red.md')
          ? {
              redact: true,
              sanitizedBytes: B('sanitized\n'),
              redaction: { lines: 2, labels: 'high-entropy, aws-key' },
              preserved: [{ artifact: '2026-08-29-red.md', location: 'quarantine/redacted' }],
            }
          : { refuse: true, reason: 'hard secret', preserved: [{ artifact: '2026-08-29-no.md', location: 'quarantine/withheld' }] },
    }),
  });

  const text = String(get(sc.vaultDir, REPORT));
  // The REDACTION line: the path, the scrubbed-line count and the labels read
  // off `redaction`, plus the entry's `artifact`, `location` and `remediation`
  // read off the record. The values are READ, never recomputed: only the gate
  // held the pre-scrub bytes.
  assert.ok(
    text.includes(
      '- `01-Projects_a_red.md` — 2 line(s) scrubbed (high-entropy, aws-key); unredacted copy at ' +
        'state/quarantine/redacted/2026-08-29-red.md. If the redaction was wrong, restore from that copy ' +
        'while it is there; otherwise delete it.'
    ),
    text
  );
  // The REFUSED path's preserved-copy line, on the NORMAL branch — a refused
  // path with a preserved copy is the ORDINARY case and occurs on runs where
  // the report publishes perfectly well.
  assert.ok(
    text.includes(
      '- `01-Projects_a_no.md` — unredacted copy at state/quarantine/withheld/2026-08-29-no.md. ' +
        'Nothing was promoted for this path; delete that copy.'
    ),
    text
  );
  // The two guidances DIFFER, read from each entry's `remediation` rather than
  // hardcoded: an implementation that hardcodes one renders them identically.
  assert.ok(text.includes('restore from that copy') && text.includes('delete that copy.'));
  // EXACTLY ONCE each — the partition is over whether the path has a redaction
  // accounting, never over the outcome or where the entry sits.
  assert.equal(text.split('2026-08-29-red.md').length - 1, 1, 'the redacted copy is announced once');
  assert.equal(text.split('2026-08-29-no.md').length - 1, 1, 'the refused copy is announced once');
});

test('dream-promote report-fallback: the REPORT BODY\'s own preserved copies are announced on every arm of the union', () => {
  /** @param {object} verdict @param {object} [over] */
  const withBody = (verdict, over = {}) => {
    const sc = scenario({ brain: { [REPORT]: body('one') } });
    return { sc, res: run(sc, { gates: gates({ secret: ({ rel }) => (rel === REPORT ? verdict : { ok: true }) }), ...over }) };
  };

  // (i) `promoted` — EP2 redacts the body and the SANITIZED body publishes. The
  // copy rides the REDACTION line, not a second preserved-copy line.
  const redacted = withBody({
    redact: true,
    sanitizedBytes: B('# sanitized report\n'),
    redaction: { lines: 1, labels: 'high-entropy' },
    preserved: [{ artifact: '2026-08-29-report.md', location: 'quarantine/redacted' }],
  });
  assert.equal(redacted.res.report.outcome, 'promoted');
  assert.deepEqual(redacted.res.report.redaction, { lines: 1, labels: 'high-entropy' });
  assert.deepEqual(redacted.res.report.preserved, [
    { artifact: '2026-08-29-report.md', location: 'quarantine/redacted', remediation: 'restore-or-delete' },
  ]);
  const redactedText = String(get(redacted.sc.vaultDir, REPORT));
  assert.ok(redactedText.includes(H_REDACT) && redactedText.includes('2026-08-29-report.md'));
  // NOT double-announced: a composer that renders both rows for the same copy
  // announces it twice, and the partition exists to stop exactly that.
  assert.ok(!redactedText.includes(H_PRESERVED), 'no second preserved-copy line for the same copy');
  assert.equal(redactedText.split('2026-08-29-report.md').length - 1, 1);

  // (ii) `fallback` — a HARD secret: the gate skips the redact arm entirely, so
  // the record holds exactly ONE entry and one copy is named.
  const withheld = withBody({ refuse: true, reason: 'hard secret', preserved: [{ artifact: '2026-08-29-report.md', location: 'quarantine/withheld' }] });
  assert.equal(withheld.res.report.outcome, 'fallback');
  assert.deepEqual(withheld.res.report.preserved, [
    { artifact: '2026-08-29-report.md', location: 'quarantine/withheld', remediation: 'delete' },
  ]);
  const withheldText = String(get(withheld.sc.vaultDir, REPORT));
  assert.ok(withheldText.includes(H_PRESERVED) && withheldText.includes('state/quarantine/withheld/2026-08-29-report.md'));
  assert.ok(!withheldText.includes(H_REDACT), 'a withheld body has no accounting to name');

  // (iii) The redact arm's FALL-THROUGH: a soft finding whose scrub did not
  // complete, so the gate KEPT the redact-shelf copy and then wrote a withheld
  // one. TWO entries, BOTH named, each with its own `location`, rendered in the
  // record's own order.
  const fell = withBody({
    refuse: true,
    reason: 'the scrub did not complete',
    preserved: [
      { artifact: '2026-08-29-report.md', location: 'quarantine/redacted' },
      { artifact: '2026-08-29-report.md', location: 'quarantine/withheld' },
    ],
  });
  const fellText = String(get(fell.sc.vaultDir, REPORT));
  const iRedactShelf = fellText.indexOf('state/quarantine/redacted/2026-08-29-report.md');
  const iWithheld = fellText.indexOf('state/quarantine/withheld/2026-08-29-report.md');
  assert.ok(iRedactShelf > 0 && iWithheld > 0, 'BOTH entries are named');
  assert.ok(iRedactShelf < iWithheld, "in the record's own order — the redact-shelf copy first");

  // (iv) `refused` — a preserved body that the fallback write is then refused
  // for. The copies are on the arm the run actually took, or they leave the
  // return entirely: the body is not a member of `refused[]`.
  const sc = scenario({ brain: { [REPORT]: body('one') } });
  put(sc.vaultDir, REPORT, 'user got there first\n');
  const refusedRes = run(sc, {
    gates: gates({ secret: ({ rel }) => (rel === REPORT ? { refuse: true, reason: 'hard secret', preserved: [{ artifact: '2026-08-29-report.md', location: 'quarantine/withheld' }] } : { ok: true }) }),
    writeFile: (o) => {
      if (o.rel === REPORT) fs.writeFileSync(abs(sc.vaultDir, REPORT), 'saved again\n');
      return realWrite(o);
    },
  });
  assert.equal(refusedRes.report.outcome, 'refused');
  assert.deepEqual(refusedRes.report.preserved, [
    { artifact: '2026-08-29-report.md', location: 'quarantine/withheld', remediation: 'delete' },
  ]);
  // Nothing published, so the line reaches the user only through `record`.
  assert.ok(sectionOf(refusedRes).includes('state/quarantine/withheld/2026-08-29-report.md'));
  assert.equal(String(get(sc.vaultDir, REPORT)), 'saved again\n');
});

test('dream-promote report-fallback: no field of a preserved copy is recovered from a refusal reason', () => {
  // A skill/ledger PAIR refusal: the pair's reason embeds its sibling's, so an
  // implementation reading a basename back out of `reason` names the WRONG
  // file's copy first. Every field comes from the typed record instead.
  const SKILL = '05-Skills/alpha/SKILL.md';
  const LEDGER = '05-Skills/alpha/LEARNINGS.md';
  const sc = scenario({ brain: { [SKILL]: 'skill\n', [LEDGER]: 'ledger\n' } });
  const artifacts = { [SKILL]: '2026-08-29-SKILL.md', [LEDGER]: '2026-08-29-LEARNINGS.md' };
  const res = run(sc, {
    gates: gates({
      secret: ({ rel }) => ({
        redact: true,
        sanitizedBytes: B('sanitized\n'),
        redaction: { lines: 1, labels: 'high-entropy' },
        preserved: [{ artifact: artifacts[rel], location: 'quarantine/redacted' }],
      }),
      skillBody: ({ rel }) => (rel === SKILL ? 'the skill body is not authorized' : null),
    }),
  });

  const text = String(get(sc.vaultDir, REPORT));
  // Each path names ITS OWN copy, once.
  assert.ok(text.includes('`05-Skills_alpha_SKILL.md` — unredacted copy at state/quarantine/redacted/2026-08-29-SKILL.md.'), text);
  assert.ok(text.includes('`05-Skills_alpha_LEARNINGS.md` — unredacted copy at state/quarantine/redacted/2026-08-29-LEARNINGS.md.'), text);
  assert.equal(text.split('2026-08-29-SKILL.md').length - 1, 1);
  assert.equal(text.split('2026-08-29-LEARNINGS.md').length - 1, 1);
  // Both were refused, so both copies are deletes — read from `remediation`.
  assert.equal(res.refused.length, 2);
  for (const entry of res.refused) assert.equal(entry.preserved[0].remediation, 'delete');
});

// ── Table Y — the second write, and the accounting that must never be silent ──

test('dream-promote report-fallback: the second write is refused after the first published — `promoted` with `accounting.published === false`', () => {
  for (const cause of ['expect-conflict', 'symlink']) {
    const sc = scenario({ brain: { [REPORT]: body('one') } });
    const other = '01-Projects/alpha/other.md';
    put(sc.vaultDir, other, 'a different user note\n');
    /** @type {Buffer|null} */
    let firstPublished = null;
    let reportWrites = 0;

    const res = run(sc, {
      writeFile: (o) => {
        if (o.rel !== REPORT) return realWrite(o);
        reportWrites += 1;
        const out = realWrite(o);
        if (reportWrites === 1 && out.written) {
          firstPublished = out.bytes;
          // Between the two writes the target stops holding the first write's
          // buffer — by a user save, or by becoming a symlink.
          const target = abs(sc.vaultDir, REPORT);
          if (cause === 'expect-conflict') fs.writeFileSync(target, 'the user saved over it\n');
          else {
            fs.rmSync(target);
            fs.symlinkSync(abs(sc.vaultDir, other), target);
          }
        }
        return out;
      },
    });

    assert.equal(reportWrites, 2, `${cause}: the normal path makes TWO report writes`);
    // NOT `fallback` — the body DID publish; NOT `refused` — something published.
    // The ground of the classification is the PUBLISH EVENT.
    assert.equal(res.report.outcome, 'promoted', cause);
    assert.equal(res.report.accounting.published, false, cause);
    assert.equal(typeof res.report.accounting.reason, 'string', cause);
    assert.ok(res.report.accounting.reason.length > 0, `${cause}: the primitive's reason, carried unchanged`);
    // Row Y3/Y5 — `bytes` is the FIRST write's returned buffer, never the
    // composed-but-unpublished section and never a fresh read.
    assert.deepEqual(res.report.bytes, firstPublished, cause);
    assert.equal(String(res.report.bytes), body('one'), `${cause}: the body THIS RUN PUBLISHED`);
    assert.ok(!String(res.report.bytes).includes(H_ENFORCE), `${cause}: the section never reached the vault`);
    // The COMPLETE record still reaches the caller — the redaction line and
    // every preserved-copy line the unpublished section would have carried.
    assert.ok(res.report.record.includes(H_ENFORCE), cause);

    // ROW Y4 — WHAT THE TARGET HOLDS IS REFUSAL-CAUSE-SPECIFIC, and nothing
    // this arm carries represents it. Byte-equality with the live vault is
    // asserted NOWHERE on this form.
    if (cause === 'expect-conflict') {
      // The vault RETAINS the intervening user bytes that caused the refusal.
      assert.equal(String(get(sc.vaultDir, REPORT)), 'the user saved over it\n');
      assert.notDeepEqual(res.report.bytes, get(sc.vaultDir, REPORT), 'the two are UNEQUAL');
    } else {
      assert.ok(fs.lstatSync(abs(sc.vaultDir, REPORT)).isSymbolicLink(), 'still a symlink');
      assert.equal(String(get(sc.vaultDir, other)), 'a different user note\n', 'not written through');
    }
  }
});

test('dream-promote report-fallback: a symlinked report target refuses the FALLBACK\'s write and delivers the record', () => {
  const other = '01-Projects/alpha/other.md';
  const sc = scenario({ brain: { [NOTE]: 'fresh\n' } });
  put(sc.vaultDir, other, 'a different user note\n');
  fs.mkdirSync(path.dirname(abs(sc.vaultDir, REPORT)), { recursive: true });
  fs.symlinkSync(abs(sc.vaultDir, other), abs(sc.vaultDir, REPORT));

  const res = run(sc);
  // Rejected for the record: writing THROUGH the symlink would overwrite a
  // different user note, and this assertion is what goes red on it.
  assert.equal(res.report.outcome, 'refused');
  assert.ok(res.report.reason.length > 0);
  assert.equal(String(get(sc.vaultDir, other)), 'a different user note\n', 'the vault object is byte-unchanged');
  assert.ok(fs.lstatSync(abs(sc.vaultDir, REPORT)).isSymbolicLink(), 'the symlink is not replaced');
  assert.ok(res.report.record.includes(H_ENFORCE), 'the COMPLETE record still reaches the caller');
});

// ── Idempotence's stand-in: a run that writes nothing promotes nothing ───────

test('dream-promote: a run in which the brain writes nothing promotes nothing and changes no existing note', () => {
  const sc = scenario({ vault: { [NOTE]: 'v1\n' } });
  assert.equal(sc.delta.records.length, 0);
  const res = run(sc);
  assert.deepEqual(
    { promoted: res.promoted, redacted: res.redacted, refused: res.refused, secretDisposition: res.secretDisposition },
    { promoted: [], redacted: [], refused: [], secretDisposition: { withheld: 0, redactions: 0 } }
  );
  assert.deepEqual(get(sc.vaultDir, NOTE), B('v1\n'));
  // THE RECORD LANDS EVEN ON A RUN THAT PROMOTED NOTHING, which is what the
  // report half adds to the module half's no-op: Table R's row R1, with no
  // report for the date, publishes the code section alone.
  assert.equal(res.report.outcome, 'fallback');
  assert.deepEqual(res.report.record, ['## Refused by policy (promotion enforcement)', '- none']);
  assert.deepEqual(get(sc.vaultDir, REPORT), res.report.bytes);
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
  // `date` is validated like the other six inputs, and against a SHAPE rather
  // than mere non-emptiness (Table D's `date` row). It reaches the EP2 gate,
  // which names the preserved copy `<date>-<sanitized-basename>` — only the
  // basename half is sanitized, so `date` is an unsanitized path component.
  // A caller bug therefore becomes a quarantine artifact called
  // `undefined-note.md`, or one written somewhere else entirely, and that
  // artifact is the user's ONLY route back to the unredacted original.
  // The separator cases are the reason the row chose a positive allowlist over
  // "no path separators": nobody has to enumerate what a separator is.
  for (const bad of [undefined, '', 0, null, {}, '2026-8-3', '2026/08/30', '../etc', '2026-08-29 ']) {
    assert.throws(
      () => run(sc, { date: bad }),
      (err) => err instanceof WienerdogError && /`date` must be a run date of the form YYYY-MM-DD/.test(err.message),
      `a date of ${JSON.stringify(bad)} must fail loud`
    );
  }
  assert.throws(
    () => run(sc, { gates: gates({ secret: () => ({ maybe: true }) }) }),
    (err) => err instanceof WienerdogError && /unrecognised disposition/.test(err.message)
  );
});
