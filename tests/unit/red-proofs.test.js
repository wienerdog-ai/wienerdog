'use strict';
/**
 * THE RED-PROOF RUNNER'S OWN SUITE.
 *
 * It exercises `scripts/red-proofs.js` against the disposable fixture trees
 * under `tests/fixtures/red-proofs/`, via `--root`, and NEVER against a real
 * suite: nothing here loads a declaration from the repository's own
 * `tests/red-proofs/`, so `npm test` starts no real suite through the runner
 * (criterion 11) and stays a fast, side-effect-free regression signal.
 *
 * The TAP-shape fixtures below are real runs under whatever Node executes
 * `npm test` — which makes CI's existing ubuntu/macOS matrix the parser's
 * compatibility evidence at no extra lane cost (criterion 4b).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rp = require('../../scripts/red-proofs.js');
// CRITERION 8b: the TEST imports `paths.js`; the RUNNER does not — which is why
// criterion 8's grep over the runner's source is unchanged.
const { OVERRIDE_VARS } = require('../../src/core/paths');

const BASE = path.resolve(__dirname, '../fixtures/red-proofs/base');
const RUNNER_SRC = path.resolve(__dirname, '../../scripts/red-proofs.js');

const GREETING_FIND = "const greeting = 'hello';";
const GREETING_ID = ['fixture basic: the greeting is hello'];

/** @param {Object} [over] @returns {Object} a valid proof over the fixture subject */
function proof(over = {}) {
  return {
    id: 'p-one',
    wp: 'WP-fixture',
    criterion: '1',
    why: 'the greeting assertion observes the subject, so changing it must redden',
    file: 'subject/subject.js',
    find: GREETING_FIND,
    replace: "const greeting = 'RP_MUT_G';",
    marker: 'RP_MUT_G',
    expectRed: [{ test: GREETING_ID, signal: 'RP-SIGNAL-GREETING' }],
    ...over,
  };
}

/**
 * A disposable copy of the committed fixture tree with a declaration directory
 * of this test's own making. `tests/with-temp-root.js` scopes and deletes the
 * run's temp root, so nothing here needs its own teardown.
 *
 * @param {{suite?:string, proofs?:Object[], declText?:string|null, files?:Object}} [o]
 * @returns {string} the root path
 */
function newRoot(o = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-root-'));
  fs.cpSync(BASE, dir, { recursive: true });
  const declDir = path.join(dir, 'tests', 'red-proofs');
  fs.rmSync(declDir, { recursive: true, force: true });
  fs.mkdirSync(declDir, { recursive: true });
  if (o.declText === null) {
    // deliberately empty declaration directory
  } else if (o.declText !== undefined) {
    fs.writeFileSync(path.join(declDir, 'a.proofs.json'), o.declText);
  } else {
    fs.writeFileSync(path.join(declDir, 'a.proofs.json'), JSON.stringify({
      suite: o.suite || 'tests/suite-basic.js',
      proofs: o.proofs || [proof()],
    }, null, 2));
  }
  for (const [rel, body] of Object.entries(o.files || {})) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return dir;
}

/** @param {string} root @param {Object} [opts] @returns {Object} */
const run = (root, opts = {}) => rp.runAll({ root, ...opts });

/**
 * Real TAP from the fixture tree, under whatever Node runs `npm test`.
 * @param {string} root @param {string} suiteRel @param {string} [pattern]
 * @returns {{status:number|null, stdout:string}}
 */
function tapOf(root, suiteRel, pattern) {
  const args = [path.join(root, 'tests', 'run.js'), '--test-reporter=tap'];
  if (pattern) args.push(`--test-name-pattern=${pattern}`);
  args.push(suiteRel);
  // Node's own test-runner marks would make this grandchild emit the
  // v8-serialized reporter stream instead of TAP — the same measured trap the
  // runner strips in `phaseEnv`.
  const env = { ...process.env };
  for (const name of rp.NODE_TEST_RUNNER_VARS) delete env[name];
  const r = spawnSync(process.execPath, args, {
    cwd: root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: r.status, stdout: r.stdout || '' };
}

/** @param {string} root @param {string} findText @param {string} replaceText */
function mutateSubject(root, findText, replaceText) {
  const p = path.join(root, 'subject', 'subject.js');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(findText, replaceText));
}

// ── criterion 1 — the declaration format is Table A, and a violation is an ERROR

const SCHEMA_CASES = [
  ['a missing id', [{ ...proof(), id: undefined }], '"id" must be a non-empty kebab slug'],
  ['an id that is not a kebab slug', [proof({ id: 'Not A Slug' })], '"id" must be a non-empty kebab slug'],
  ['a missing wp', [proof({ wp: undefined })], '"wp" must be a non-empty string'],
  ['a wp that is not a WP id', [proof({ wp: 'nope' })], '"wp" must be a kebab-case WP id'],
  ['a wp with a TRAILING segment separator', [proof({ wp: 'WP-bad-' })], '"wp" must be a kebab-case WP id'],
  ['a wp with a DOUBLED separator', [proof({ wp: 'WP-a--b' })], '"wp" must be a kebab-case WP id'],
  ['a wp with an EMPTY slug', [proof({ wp: 'WP-' })], '"wp" must be a kebab-case WP id'],
  ['a missing criterion', [proof({ criterion: undefined })], '"criterion" must be a non-empty string'],
  ['an empty criterion', [proof({ criterion: '' })], '"criterion" must be a non-empty string'],
  ['a missing why', [proof({ why: undefined })], '"why" must be a non-empty string'],
  ['a missing file', [proof({ file: undefined })], '"file" must be a non-empty string'],
  ['an EMPTY find', [proof({ find: '' })], '"find" must be a non-empty string'],
  ['a missing marker', [proof({ marker: undefined })], '"marker" must be a non-empty string'],
  ['replace equal to find', [proof({ replace: GREETING_FIND, marker: GREETING_FIND })], '"replace" must differ from "find"'],
  ['replace not containing marker', [proof({ replace: "const greeting = 'x';" })], '"replace" must contain "marker"'],
  ['a duplicate id', [proof(), proof({ find: 'const arity = 2;', replace: 'const arity = 3; /* RP_MUT_G */' })], 'duplicate proof id'],
  ['occurrences 0', [proof({ occurrences: 0 })], '"occurrences" must be a positive integer'],
  ['occurrences 1.5', [proof({ occurrences: 1.5 })], '"occurrences" must be a positive integer'],
  ['occurrences as a string', [proof({ occurrences: '1' })], '"occurrences" must be a positive integer'],
  ['file equal to suite', [proof({ file: 'tests/suite-basic.js' })], '"file" must not be the suite'],
  ['file naming the runner', [proof({ file: 'scripts/red-proofs.js' })], '"file" must not be the RED-proof runner'],
  ['file naming a declaration', [proof({ file: 'tests/red-proofs/a.proofs.json' })], '"file" must not be a declaration'],
  ['an empty expectRed', [proof({ expectRed: [] })], '"expectRed" must be a non-empty array'],
  ['a BARE test name', [proof({ expectRed: [{ test: 'fixture basic: the greeting is hello', signal: 'x' }] })], 'never a bare name'],
  ['an EMPTY signal', [proof({ expectRed: [{ test: GREETING_ID, signal: '' }] })], '"expectRed[].signal" must be a non-empty substring'],
  ['a duplicate test identity', [proof({
    expectRed: [{ test: GREETING_ID, signal: 'a' }, { test: GREETING_ID, signal: 'b' }],
  })], 'duplicate "expectRed" identity'],
];

for (const [label, proofs, needle] of SCHEMA_CASES) {
  test(`red-proofs: ${label} is an ERROR naming the declaration file and the proof id (criterion 1)`, () => {
    const r = run(newRoot({ proofs }));
    assert.equal(r.verdict, 'ERROR', r.report);
    assert.notEqual(r.exitCode, 0);
    assert.ok(r.report.includes(needle), `expected ${JSON.stringify(needle)} in:\n${r.report}`);
    assert.ok(/tests[\\/]red-proofs[\\/]a\.proofs\.json/.test(r.report), r.report);
  });
}

test('red-proofs: an EMPTY proofs array is an ERROR, not a clean run over nothing (criterion 1)', () => {
  const r = run(newRoot({ declText: JSON.stringify({ suite: 'tests/suite-basic.js', proofs: [] }) }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('"proofs" is empty'), r.report);
});

test('red-proofs: a missing suite field is an ERROR (criterion 1)', () => {
  const r = run(newRoot({ declText: JSON.stringify({ proofs: [proof()] }) }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('"suite" must be a non-empty string'), r.report);
});

// ── criterion 1a — declarations are INERT

test('red-proofs: a declaration whose bytes would EXIT and WRITE under an executing loader is rejected as invalid JSON, and nothing is written (criterion 1a)', () => {
  const attack = [
    "'use strict';",
    "require('node:fs').writeFileSync(require('node:path').join(__dirname, '..', '..', 'PWNED'), 'x');",
    'process.exit(0);',
    'module.exports = { suite: "tests/suite-basic.js", proofs: [] };',
  ].join('\n');
  const root = newRoot({ declText: attack });
  const r = run(root);
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('not valid JSON'), r.report);
  assert.equal(fs.existsSync(path.join(root, 'PWNED')), false, 'the declaration must never execute');
  // The process is still here, which is the other half: an executing loader
  // would have ended the run successfully before a single proof was counted.
  assert.equal(typeof r.exitCode, 'number');
});

// ── criterion 2 / 2a — APPLY is exact, and RED cannot be reached without it

test('red-proofs: the whole lane is green on the fixture set and every phase ran (criteria 2, 5, 6)', () => {
  const r = run(BASE);
  assert.equal(r.verdict, 'PROVEN', r.report);
  assert.equal(r.exitCode, 0);
  assert.equal(r.proofs.length, 2);
  assert.ok(r.proofs.every((p) => p.verdict === 'PROVEN'), r.report);
});

test('red-proofs: occurrences are counted and replaced LEFT-TO-RIGHT and NON-OVERLAPPING (criterion 2a)', () => {
  assert.equal(rp.countOccurrences('aaa', 'aa'), 1);
  assert.equal(rp.replaceOccurrences('aaa', 'aa', 'X'), 'Xa');
  assert.equal(rp.countOccurrences('aaaa', 'aa'), 2);
  assert.equal(rp.replaceOccurrences('aaaa', 'aa', 'X'), 'XX');
  assert.equal(rp.countOccurrences('abab', 'ab'), 2);
  assert.equal(rp.replaceOccurrences('abab', 'ab', 'Z'), 'ZZ');
});

test('red-proofs: an occurrences count that disagrees with the counted number is an ERROR at APPLY, and RED never runs (criteria 2, 2a)', () => {
  const r = run(newRoot({ proofs: [proof({ occurrences: 2 })] }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('"occurrences" declares 2'), r.report);
  assert.ok(r.report.includes('APPLY'), r.report);
});

test('red-proofs: a marker ALREADY PRESENT in the pristine file is an ERROR — a marker already there proves nothing (criteria 1, 2)', () => {
  const r = run(newRoot({ proofs: [proof({ marker: 'greeting', replace: "const greeting = 'x'; /* greeting */" })] }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('ALREADY present'), r.report);
});

test('red-proofs: applyMutation writes bytes EQUAL to the computed expected bytes, and proves the marker landed (criterion 2)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-apply-'));
  fs.writeFileSync(path.join(dir, 'x.js'), 'a aa aaa\n');
  const p = { file: 'x.js', find: 'aa', replace: 'MRK', marker: 'MRK', occurrences: 2 };
  const got = rp.applyMutation(dir, p, 'unit');
  assert.equal(got.occurrences, 2);
  assert.equal(fs.readFileSync(path.join(dir, 'x.js'), 'utf8'), 'a MRK MRKa\n');
});

// ── criterion 3 — BASELINE

test('red-proofs: a declared identity that does not RUN is an ERROR, not a pass (criterion 3)', () => {
  const r = run(newRoot({ proofs: [proof({ expectRed: [{ test: ['fixture basic: renamed away'], signal: 'x' }] })] }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('did not RUN'), r.report);
});

test('red-proofs: an unmatched testNamePattern exits 0 with no `not ok` on EVERY Node — and is still an ERROR here (criterion 3)', () => {
  // THE INVARIANTS, NOT THE SHAPE. The reporter's answer to "nothing matched" is
  // version-dependent — an inner `1..0` plan on Node >= 25, every test
  // `ok N - <name> # SKIP test name does not match pattern` on Node 20.x — and a
  // deep-equal against either tree is red on the other. What holds on BOTH, and
  // what the runner's rule is over, is asserted here.
  const bare = tapOf(BASE, 'tests/suite-basic.js', 'zzz-matches-nothing');
  assert.equal(bare.status, 0, 'precondition: Node exits 0 on an unmatched pattern');
  assert.equal(/^ *not ok\b/m.test(bare.stdout), false, 'no `not ok` is emitted under either shape');
  const observed = rp.flattenTap(rp.parseTap(bare.stdout, 'tests/suite-basic.js'));
  assert.deepEqual(rp.ranNodes(observed), [], 'ZERO TESTS RAN once SKIP-directive records are excluded');

  const r = run(newRoot({ proofs: [proof({ testNamePattern: 'zzz-matches-nothing' })] }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('ZERO TESTS RAN'), r.report);
});

test('red-proofs: the NODE 20 unmatched-pattern shape — every test `ok … # SKIP` — is ZERO TESTS RAN, simulated verbatim (criterion 3)', () => {
  // The exact stream Node v20.20.2 produced on CI run 33627135545, on ubuntu and
  // macOS alike. Simulated here so the Node-20 branch of the rule is exercised on
  // whatever Node runs this suite, and not only when CI happens to run it.
  const node20 = [
    'TAP version 13',
    '# Subtest: fixture basic: the greeting is hello',
    'ok 1 - fixture basic: the greeting is hello # SKIP test name does not match pattern',
    '  ---',
    '  duration_ms: 0.1',
    '  type: \'test\'',
    '  ...',
    '# Subtest: fixture basic: the arity is two',
    'ok 2 - fixture basic: the arity is two # SKIP test name does not match pattern',
    '  ---',
    '  duration_ms: 0.1',
    '  type: \'test\'',
    '  ...',
    '1..2',
    '# tests 2',
    '# pass 0',
    '# fail 0',
    '# skipped 2',
    '',
  ].join('\n');
  const observed = rp.flattenTap(rp.parseTap(node20, 'tests/suite-basic.js'));
  assert.equal(observed.length, 2, 'both records are parsed');
  assert.ok(observed.every((n) => n.node.directive === 'SKIP'), 'both carry a SKIP directive');
  assert.equal(/^ *not ok\b/m.test(node20), false);
  assert.deepEqual(rp.ranNodes(observed), [], 'ZERO TESTS RAN');
  assert.throws(
    () => rp.evaluateBaseline(observed, proof({ testNamePattern: 'zzz' }), 'unit'),
    (e) => e.verdict === 'ERROR' && /ZERO TESTS RAN/.test(e.message)
  );
  // And the completeness gate accepts this stream: it is complete, not truncated.
  rp.assertCompleteRun({ status: 0, signal: null, spawnError: null, stdout: node20 }, 'unit', 'BASELINE');
});

test('red-proofs: an ALL-SKIP suite is ZERO TESTS RAN end-to-end, on whatever Node runs this (criterion 3)', () => {
  const r = run(newRoot({
    suite: 'tests/suite-allskip.js',
    proofs: [proof({ expectRed: [{ test: ['fixture allskip: the greeting is hello'], signal: 'RP-SIGNAL-GREETING' }] })],
  }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('ZERO TESTS RAN'), r.report);
});

test('red-proofs: a declared identity observed as SKIP is an ERROR, not a terminal PASS (criterion 3)', () => {
  const r = run(newRoot({
    suite: 'tests/suite-kinds.js',
    proofs: [proof({ expectRed: [{ test: ['fixture kinds: skipped'], signal: 'RP-SIGNAL-SKIPPED' }] })],
  }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('observed as SKIP'), r.report);
});

test('red-proofs: a suite-level failure at BASELINE is an ERROR, and V3 records that no mutation was applied (criteria 3, 6)', () => {
  const r = run(newRoot({ suite: 'tests/suite-parent-write.js', proofs: [proof({
    expectRed: [{ test: ['fixture parent: writes ../rp-parent-sentinel'], signal: 'RP-SIGNAL-GREETING' }],
  })] }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('BASELINE: the pristine suite was not green'), r.report);
  assert.ok(r.report.includes('VACUOUS: V3'), r.report);
});

// ── criterion 4 — RED is an ASSERTION failure of the named test, and the cell's own

test('red-proofs: a mutation that leaves the named assertion GREEN is FAILED (criterion 4)', () => {
  const r = run(newRoot({ proofs: [proof({
    expectRed: [{ test: ['fixture basic: the arity is two'], signal: 'RP-SIGNAL-ARITY' }],
  })] }));
  assert.equal(r.verdict, 'FAILED', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('did not fail under the mutation'), r.report);
});

test('red-proofs: an UNLISTED own-body failure — a PEER — is FAILED, not ERROR (criteria 4, 4a)', () => {
  const r = run(newRoot({
    suite: 'tests/suite-nested.js',
    proofs: [proof({
      find: "const shared = 'shared-ok';",
      replace: "const shared = 'RP_MUT_S';",
      marker: 'RP_MUT_S',
      expectRed: [{ test: ['fixture nest: outer', 'inner-declared'], signal: 'RP-SIGNAL-NESTED' }],
    })],
  }));
  assert.equal(r.verdict, 'FAILED', r.report);
  assert.ok(r.report.includes('failed in its OWN BODY but is not declared'), r.report);
  assert.ok(r.report.includes('inner-peer'), r.report);
});

test('red-proofs: a diagnostic missing the declared signal is FAILED (criterion 4)', () => {
  const r = run(newRoot({ proofs: [proof({
    expectRed: [{ test: GREETING_ID, signal: 'RP-SIGNAL-THIS-IS-NOT-IN-THE-DIAGNOSTIC' }],
  })] }));
  assert.equal(r.verdict, 'FAILED', r.report);
  assert.ok(r.report.includes('does not carry its signal'), r.report);
});

test('red-proofs: a THROWN error is not an assertion failure — FAILED on the code, since failureType alone cannot tell them apart (criterion 4)', () => {
  const r = run(newRoot({
    suite: 'tests/suite-kinds.js',
    proofs: [proof({
      expectRed: [{ test: ['fixture kinds: throws rather than asserts'], signal: 'RP-SIGNAL-THROWN' }],
    })],
  }));
  assert.equal(r.verdict, 'FAILED', r.report);
  assert.ok(r.report.includes('ERR_TEST_FAILURE'), r.report);
  assert.ok(r.report.includes('not ERR_ASSERTION'), r.report);
});

test('red-proofs: a mutation that makes the MODULE FAIL TO LOAD reddens the named test without reaching its assertion — FAILED (criterion 4)', () => {
  const r = run(newRoot({ proofs: [proof({
    replace: "const greeting = ('RP_MUT_BROKEN'; // unbalanced on purpose",
    marker: 'RP_MUT_BROKEN',
  })] }));
  assert.equal(r.verdict, 'FAILED', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('did not fail under the mutation'), r.report);
});

// ── criterion 4a — nested failures, ancestors and ambiguity, by rule

test('red-proofs: a nested declared child is satisfied and its parent\'s propagation is attributed, not counted (criterion 4a)', () => {
  const r = run(newRoot({
    suite: 'tests/suite-nested.js',
    proofs: [proof({
      find: "const shared = 'shared-ok';",
      replace: "const shared = 'RP_MUT_S';",
      marker: 'RP_MUT_S',
      expectRed: [
        { test: ['fixture nest: outer', 'inner-declared'], signal: 'RP-SIGNAL-NESTED' },
        { test: ['fixture nest: outer', 'inner-peer'], signal: 'RP-SIGNAL-PEER' },
      ],
    })],
  }));
  assert.equal(r.verdict, 'PROVEN', r.report);
  assert.equal(r.exitCode, 0);
});

test('red-proofs: propagation the runner cannot attribute to a declared descendant is an ERROR (criterion 4a)', () => {
  const r = run(newRoot({
    suite: 'tests/suite-siblings.js',
    proofs: [proof({
      find: "const shared = 'shared-ok';",
      replace: "const shared = 'RP_MUT_S';",
      marker: 'RP_MUT_S',
      expectRed: [{ test: ['fixture sib: outer-one', 'inner-one'], signal: 'RP-SIGNAL-SIB-ONE' }],
    })],
  }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('cannot attribute'), r.report);
  assert.ok(r.report.includes('outer-two'), r.report);
});

test('red-proofs: a declared identity matching MORE THAN ONE observed node is an ERROR — the runner refuses rather than picking one (criterion 4a)', () => {
  const r = run(newRoot({
    suite: 'tests/suite-dup.js',
    proofs: [proof({
      find: "const shared = 'shared-ok';",
      replace: "const shared = 'RP_MUT_S';",
      marker: 'RP_MUT_S',
      expectRed: [{ test: ['fixture dup: outer', 'twin'], signal: 'RP-SIGNAL-TWIN-A' }],
    })],
  }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('matches 2 observed tests'), r.report);
  assert.ok(r.report.includes('refuses rather than picking one'), r.report);
});

test('red-proofs: an expected TAP field the running Node does not emit is a LOUD ERROR, never an assumption (criterion 4a)', () => {
  const nodeNoType = [{ node: { name: 't', ok: false, directive: null, diag: { raw: 'sig' }, children: [] }, path: ['t'] }];
  assert.throws(
    () => rp.evaluateRed(nodeNoType, proof({ expectRed: [{ test: ['t'], signal: 'sig' }] }), 'unit'),
    (e) => e.verdict === 'ERROR' && /emits no "failureType"/.test(e.message)
  );
  const nodeNoCode = [{ node: { name: 't', ok: false, directive: null, diag: { raw: 'sig', failureType: 'testCodeFailure' }, children: [] }, path: ['t'] }];
  assert.throws(
    () => rp.evaluateRed(nodeNoCode, proof({ expectRed: [{ test: ['t'], signal: 'sig' }] }), 'unit'),
    (e) => e.verdict === 'ERROR' && /emits no error "code"/.test(e.message)
  );
});

// ── criterion 4b — the TAP parser's compatibility evidence is a real run

test('red-proofs: the pinned TAP shapes are observed on the Node running this suite (criterion 4b)', () => {
  const root = newRoot();
  mutateSubject(root, GREETING_FIND, "const greeting = 'mutated';");
  mutateSubject(root, "const shared = 'shared-ok';", "const shared = 'mutated';");

  // (1) an own-body ASSERTION failure
  const basic = rp.flattenTap(rp.parseTap(tapOf(root, 'tests/suite-basic.js').stdout, 'tests/suite-basic.js'));
  const g = basic.find((n) => n.path[0] === GREETING_ID[0]);
  assert.equal(g.node.diag.failureType, 'testCodeFailure');
  assert.equal(g.node.diag.code, 'ERR_ASSERTION');

  // (2) a THROWN error: the SAME failureType, a different code
  const kinds = rp.flattenTap(rp.parseTap(tapOf(root, 'tests/suite-kinds.js').stdout, 'tests/suite-kinds.js'));
  const thrown = kinds.find((n) => n.path[0] === 'fixture kinds: throws rather than asserts');
  assert.equal(thrown.node.diag.failureType, 'testCodeFailure');
  assert.equal(thrown.node.diag.code, 'ERR_TEST_FAILURE');

  // (3) a SKIP directive, and it is never a pass
  const skipped = kinds.find((n) => n.path[0] === 'fixture kinds: skipped');
  assert.equal(skipped.node.directive, 'SKIP');

  // (4) nested propagation
  const nested = rp.flattenTap(rp.parseTap(tapOf(root, 'tests/suite-nested.js').stdout, 'tests/suite-nested.js'));
  const parent = nested.find((n) => n.path.length === 1 && n.path[0] === 'fixture nest: outer');
  assert.equal(parent.node.diag.failureType, 'subtestsFailed');
  assert.ok(nested.some((n) => n.path.join(' > ') === 'fixture nest: outer > inner-declared'));

  // (5) THE NO-MATCH FIXTURE, as the three invariants criterion 4b requires and
  // no fourth — a deep-equal against one Node's parse tree is exactly what failed
  // on CI's Node 20 while passing on the author's Node 25.
  const none = tapOf(root, 'tests/suite-basic.js', 'zzz-matches-nothing');
  const noneNodes = rp.flattenTap(rp.parseTap(none.stdout, 'tests/suite-basic.js'));
  assert.equal(none.status, 0, '(i) the run exits 0 — zero tests RAN is not a failure to the reporter');
  assert.equal(/^ *not ok\b/m.test(none.stdout), false, '(ii) no `not ok` record appears');
  assert.deepEqual(rp.ranNodes(noneNodes), [],
    '(iii) the observed identity set is EMPTY once every SKIP-directive record is excluded');
});

test('red-proofs: the report names the Node version it ran on (criterion 4b)', () => {
  const r = run(BASE, { proof: 'no-such-proof' });
  assert.ok(r.report.includes(`Node ${process.versions.node}`), r.report);
});

// ── criterion 5 — the CONTROL closes the loop, and the manifest sees what a
//    path/size/digest manifest was measured to miss

test('red-proofs: a run offering only BASELINE\'s earlier green is UNCONTROLLED and is NOT PROVEN (criterion 5)', () => {
  const r = run(newRoot(), { control: false });
  assert.equal(r.verdict, 'UNCONTROLLED', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('no fresh post-RED pristine control'), r.report);
});

test('red-proofs: a post-RED pristine copy that is RED is an ERROR — the red was ambient, not the mutation\'s (criterion 5)', () => {
  const counter = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-ctr-')), 'runs');
  const saved = { c: process.env.RP_COUNTER_FILE, l: process.env.RP_AMBIENT_LIMIT };
  process.env.RP_COUNTER_FILE = counter;
  process.env.RP_AMBIENT_LIMIT = '2';
  try {
    const r = run(newRoot({
      suite: 'tests/suite-ambient.js',
      proofs: [proof({ expectRed: [{ test: ['fixture ambient: the greeting is hello'], signal: 'RP-SIGNAL-GREETING' }] })],
    }));
    assert.equal(r.verdict, 'ERROR', r.report);
    assert.ok(r.report.includes('CONTROL: the post-RED pristine copy was NOT green'), r.report);
  } finally {
    if (saved.c === undefined) delete process.env.RP_COUNTER_FILE; else process.env.RP_COUNTER_FILE = saved.c;
    if (saved.l === undefined) delete process.env.RP_AMBIENT_LIMIT; else process.env.RP_AMBIENT_LIMIT = saved.l;
  }
});

test('red-proofs: the manifest rejects a MISSING FILE, a MODE DRIFT and a MISSING EMPTY DIRECTORY (criterion 5, Table E1)', () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-man-'));
  fs.mkdirSync(path.join(src, 'empty'));
  fs.mkdirSync(path.join(src, 'sub'));
  fs.writeFileSync(path.join(src, 'sub', 'a.txt'), 'a\n');
  fs.writeFileSync(path.join(src, 'run.sh'), '#!/bin/sh\n');
  fs.chmodSync(path.join(src, 'run.sh'), 0o755);
  const manifest = rp.buildManifest(src);
  assert.equal(manifest.get('empty').type, 'dir');
  assert.equal(manifest.get('run.sh').mode & 0o777, 0o755);

  const mkCopy = () => {
    const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-cpy-'));
    fs.rmSync(dst, { recursive: true, force: true });
    rp.copyTree(src, dst);
    rp.verifyCopy(dst, manifest); // the untouched copy verifies
    return dst;
  };

  const missing = mkCopy();
  fs.rmSync(path.join(missing, 'sub', 'a.txt'));
  assert.throws(() => rp.verifyCopy(missing, manifest), (e) => e.verdict === 'ERROR' && /missing: sub\/a\.txt/.test(e.message));

  const drifted = mkCopy();
  fs.chmodSync(path.join(drifted, 'run.sh'), 0o644);
  assert.throws(() => rp.verifyCopy(drifted, manifest), (e) => e.verdict === 'ERROR' && /mode differs: run\.sh \(755 -> 644\)/.test(e.message));

  const noEmpty = mkCopy();
  fs.rmdirSync(path.join(noEmpty, 'empty'));
  assert.throws(() => rp.verifyCopy(noEmpty, manifest), (e) => e.verdict === 'ERROR' && /missing: empty/.test(e.message));

  const edited = mkCopy();
  fs.writeFileSync(path.join(edited, 'sub', 'a.txt'), 'b\n');
  assert.throws(() => rp.verifyCopy(edited, manifest), (e) => e.verdict === 'ERROR' && /digest differs|size differs/.test(e.message));
});

// ── criterion 6 / 6a — the vacuity guard and the roll-up

test('red-proofs: an EMPTY declaration directory is VACUOUS and exits non-zero (criterion 6, V1)', () => {
  const r = run(newRoot({ declText: null }));
  assert.equal(r.verdict, 'VACUOUS', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('V1: no declaration files'), r.report);
});

test('red-proofs: a selection matching nothing is VACUOUS, not an empty success (criterion 6, V2)', () => {
  const r = run(BASE, { proof: 'no-such-proof-exists' });
  assert.equal(r.verdict, 'VACUOUS', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('V2'), r.report);

  const byWp = run(BASE, { wp: 'WP-no-such-work-package' });
  assert.equal(byWp.verdict, 'VACUOUS', byWp.report);
});

test('red-proofs: a FILTERED criterion exits non-zero even though every proof it ran PASSED (criterion 6a)', () => {
  const filtered = run(BASE, { proof: 'fixture-greeting' });
  assert.equal(filtered.proofs.length, 1);
  assert.equal(filtered.proofs[0].verdict, 'PROVEN', filtered.report);
  assert.equal(filtered.verdict, 'FILTERED', filtered.report);
  assert.notEqual(filtered.exitCode, 0);
  assert.ok(filtered.report.includes('left out: fixture-arity'), filtered.report);

  const whole = run(BASE);
  assert.equal(whole.verdict, 'PROVEN', whole.report);
  assert.equal(whole.exitCode, 0);
});

test('red-proofs: a criterion is reported as BOTH when a filtered run also failed (Table E2 precedence)', () => {
  const rolled = rp.rollUp(
    [{ proof: { id: 'a', wp: 'WP-x', criterion: '1' } }, { proof: { id: 'b', wp: 'WP-x', criterion: '1' } }],
    [{ proof: { id: 'a', wp: 'WP-x', criterion: '1' } }],
    [{ id: 'a', verdict: 'FAILED' }]
  );
  assert.equal(rolled[0].verdict, 'FAILED');
  assert.ok(rolled[0].note.includes('left out: b'));
  assert.ok(rolled[0].note.includes('a=FAILED'));
});

test('red-proofs: the verdict precedence is total and UNSUPPORTED wins over VACUOUS (Table E2)', () => {
  assert.deepEqual(rp.VERDICT_ORDER, ['UNSUPPORTED', 'ERROR', 'VACUOUS', 'FAILED', 'UNCONTROLLED', 'FILTERED', 'PROVEN']);
  assert.equal(rp.worstVerdict('UNSUPPORTED', 'VACUOUS'), 'UNSUPPORTED');
  assert.equal(rp.worstVerdict('FILTERED', 'PROVEN'), 'FILTERED');
  assert.equal(rp.worstVerdict('PROVEN', 'UNCONTROLLED'), 'UNCONTROLLED');
  assert.equal(rp.worstVerdict('ERROR', 'FAILED'), 'ERROR');
});

test('red-proofs: the lane refuses below its Node floor rather than passing vacuously (Table D, UNSUPPORTED)', () => {
  assert.equal(rp.nodeFloorOk('18.14.0'), false);
  assert.equal(rp.nodeFloorOk('18.10.5'), false);
  assert.equal(rp.nodeFloorOk('18.15.0'), true);
  assert.equal(rp.nodeFloorOk('20.0.0'), true);
  assert.equal(rp.nodeFloorOk('25.9.0'), true);
  assert.deepEqual(rp.NODE_FLOOR, [18, 15, 0]);
});

// ── criterion 7 — containment is a property of the phase order

test('red-proofs: resolveInside refuses `..`, an absolute path and a SYMLINK escape, on the RESOLVED path (criterion 7a)', () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-esc-'));
  const inside = path.join(outer, 'copy');
  fs.mkdirSync(inside);
  fs.writeFileSync(path.join(inside, 'ok.txt'), 'ok\n');
  fs.writeFileSync(path.join(outer, 'outside.txt'), 'out\n');
  fs.symlinkSync(path.join(outer, 'outside.txt'), path.join(inside, 'link.txt'));

  assert.equal(rp.resolveInside(inside, 'ok.txt', 'unit'), fs.realpathSync(path.join(inside, 'ok.txt')));
  for (const rel of ['../outside.txt', 'a/../../outside.txt', path.join(outer, 'outside.txt'), 'link.txt']) {
    assert.throws(
      () => rp.resolveInside(inside, rel, 'unit'),
      (e) => e.verdict === 'ERROR' && /canonicalises OUTSIDE|does not resolve/.test(e.message),
      `expected ${rel} to be refused`
    );
  }
});

test('red-proofs: a `..` file escaping into the runner\'s own SNAPSHOT is an ERROR before any write (criterion 7a)', () => {
  const r = run(newRoot({ proofs: [proof({ file: '../../snapshot/subject/subject.js' })] }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('canonicalises OUTSIDE'), r.report);
});

test('red-proofs: an ABSOLUTE file outside the copy is an ERROR before any write (criterion 7a)', () => {
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-abs-')), 'target.js');
  fs.writeFileSync(outside, `${GREETING_FIND}\n`);
  const r = run(newRoot({ proofs: [proof({ file: outside })] }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('canonicalises OUTSIDE'), r.report);
  assert.equal(fs.readFileSync(outside, 'utf8'), `${GREETING_FIND}\n`, 'nothing outside the copy is written');
});

test('red-proofs: a SYMLINK anywhere in the source tree is an ERROR naming its path (criteria 7a, 7b2)', () => {
  const root = newRoot();
  fs.symlinkSync(path.join(root, 'subject', 'subject.js'), path.join(root, 'subject', 'alias.js'));
  const r = run(root);
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('symbolic link at subject/alias.js'), r.report);
});

test('red-proofs: a suite that plants a symlink at the mutation target AND at a parent of it reaches nothing — the write goes into a FRESH copy (criterion 7b)', () => {
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-plant-')), 'checkout.js');
  fs.writeFileSync(outside, 'THE REAL CHECKOUT\n');
  const saved = process.env.RP_PLANT_TARGET;
  process.env.RP_PLANT_TARGET = outside;
  try {
    const r = run(newRoot({
      suite: 'tests/suite-plant.js',
      proofs: [proof({
        expectRed: [{ test: ['fixture plant: replace the mutation target and its parent with symlinks'], signal: 'RP-SIGNAL-GREETING' }],
      })],
    }));
    assert.equal(r.verdict, 'PROVEN', r.report);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'THE REAL CHECKOUT\n', 'the plant reached nothing');
  } finally {
    if (saved === undefined) delete process.env.RP_PLANT_TARGET; else process.env.RP_PLANT_TARGET = saved;
  }
});

test('red-proofs: NO TWO PHASES SHARE A WRITABLE PATH THE RUNNER PROVIDES — temp, HOME, the common parent and an ambient override (criterion 7b2)', () => {
  const ambient = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-ambient-'));
  const saved = { w: process.env.WIENERDOG_CLAUDE_DIR, a: process.env.RP_AMBIENT_CLAUDE_DIR };
  process.env.WIENERDOG_CLAUDE_DIR = ambient;
  process.env.RP_AMBIENT_CLAUDE_DIR = ambient;
  try {
    const root = newRoot({
      suite: 'tests/suite-isolation.js',
      proofs: [proof({ expectRed: [{ test: ['fixture iso: the greeting is hello'], signal: 'RP-SIGNAL-GREETING' }] })],
      files: { 'node_modules/should-not-be-copied.js': 'module.exports = 1;\n' },
    });
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    const r = run(root);
    assert.equal(r.verdict, 'PROVEN', r.report);
  } finally {
    if (saved.w === undefined) delete process.env.WIENERDOG_CLAUDE_DIR; else process.env.WIENERDOG_CLAUDE_DIR = saved.w;
    if (saved.a === undefined) delete process.env.RP_AMBIENT_CLAUDE_DIR; else process.env.RP_AMBIENT_CLAUDE_DIR = saved.a;
  }
});

test('red-proofs: the copies\' common parent is held NON-WRITABLE, so a suite writing `../sentinel` FAILS during BASELINE (criterion 7b2)', () => {
  const r = run(newRoot({
    suite: 'tests/suite-parent-write.js',
    proofs: [proof({ expectRed: [{ test: ['fixture parent: writes ../rp-parent-sentinel'], signal: 'RP-SIGNAL-GREETING' }] })],
  }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('BASELINE: the pristine suite was not green'), r.report);
  assert.ok(/EACCES|EPERM|EROFS/.test(r.report), r.report);
});

test('red-proofs: the snapshot domain excludes `.git/` and `node_modules/` (Table E1)', () => {
  const root = newRoot({ files: { 'node_modules/x.js': 'x\n', '.git/HEAD': 'ref\n' } });
  const manifest = rp.buildManifest(root);
  assert.ok([...manifest.keys()].every((k) => !k.startsWith('node_modules') && !k.startsWith('.git')), [...manifest.keys()].join(','));
  assert.ok(manifest.has('subject/subject.js'));
});

// ── ROUND-1 FINDINGS — each one's RED, kept beside the criterion it serves

/** The self-mutation the alias made possible: it edits the assertion's EXPECTED
 *  LITERAL, so the named test reddens with its own declared signal, restores
 *  cleanly, and the proof reports PROVEN while nothing under test ever moved. */
const SELF_MUTATION = {
  file: 'tests/../tests/suite-basic.js',
  find: "subject.greeting, 'hello', 'RP-SIGNAL-GREETING'",
  replace: "subject.greeting, 'RP_MUT_ALIAS', 'RP-SIGNAL-GREETING'",
  marker: 'RP_MUT_ALIAS',
};

test('red-proofs: an ALIAS of the suite (`tests/../tests/suite-basic.js`) is an ERROR — a proof may not mutate its own assertion host (Table A `file`)', () => {
  // Without the two layers this declaration reaches PROVEN: it reddens the named
  // test with its declared signal by rewriting that test's own expected literal,
  // certifying only that an assertion can be edited (PR #204 round 1).
  const r = run(newRoot({ proofs: [proof(SELF_MUTATION)] }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(/must not be the suite|resolves to tests\/suite-basic\.js/.test(r.report), r.report);
});

test('red-proofs: normaliseRel COLLAPSES `..` and `.`, which is the first of the two layers (Table A `file`)', () => {
  assert.equal(rp.normaliseRel('tests/../tests/suite-basic.js'), 'tests/suite-basic.js');
  assert.equal(rp.normaliseRel('./tests/./run.js'), 'tests/run.js');
  assert.equal(rp.normaliseRel('a/b/../../scripts/red-proofs.js'), 'scripts/red-proofs.js');
  assert.equal(rp.normaliseRel('tests\\red-proofs\\a.proofs.json'), 'tests/red-proofs/a.proofs.json');
  // A path that genuinely leaves the tree keeps its lead, for APPLY to refuse.
  assert.equal(rp.normaliseRel('../outside.js'), '../outside.js');
});

test('red-proofs: `tests/run.js` — a path the runner NEEDS to operate — is a protected target (Table A `file`)', () => {
  const r = run(newRoot({ proofs: [proof({ file: 'tests/run.js' })] }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('tests/run.js'), r.report);
});

test('red-proofs: the protected-target check is over CANONICAL paths inside the copy, not literals (Table A `file`)', () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-prot-'));
  fs.cpSync(BASE, copy, { recursive: true });
  const suiteRel = 'tests/suite-basic.js';
  const target = fs.realpathSync(path.join(copy, suiteRel));
  // Every alias of the suite resolves to the same canonical path, and each is
  // refused on that path rather than on the string the declaration wrote.
  assert.throws(() => rp.assertNotProtected(copy, target, suiteRel, 'unit'),
    (e) => e.verdict === 'ERROR' && /may not edit the assertion/.test(e.message));
  assert.throws(() => rp.assertNotProtected(copy, fs.realpathSync(path.join(copy, 'tests/run.js')), suiteRel, 'unit'),
    (e) => e.verdict === 'ERROR' && /tests\/run\.js/.test(e.message));
  assert.throws(() => rp.assertNotProtected(copy, fs.realpathSync(path.join(copy, 'tests/red-proofs/base.proofs.json')), suiteRel, 'unit'),
    (e) => e.verdict === 'ERROR' && /resolves to a declaration/.test(e.message));
  // A legitimate target is untouched.
  rp.assertNotProtected(copy, fs.realpathSync(path.join(copy, 'subject/subject.js')), suiteRel, 'unit');
  // And applyMutation refuses the alias before writing a byte. The `find` here
  // really occurs in the suite, so without this layer the write would LAND —
  // an "occurs 0 times" ERROR would prove nothing about the protection.
  const before = fs.readFileSync(path.join(copy, suiteRel), 'utf8');
  assert.ok(before.includes(SELF_MUTATION.find), 'precondition: the self-mutation would otherwise apply');
  assert.throws(
    () => rp.applyMutation(copy, proof(SELF_MUTATION), 'unit APPLY', suiteRel),
    (e) => e.verdict === 'ERROR' && /may not edit the assertion/.test(e.message)
  );
  assert.equal(fs.readFileSync(path.join(copy, suiteRel), 'utf8'), before, 'the assertion host is untouched');
});

test('red-proofs: a child killed or cut short is an ERROR, even when every declared `not ok` was already emitted (Table B row 5)', () => {
  // End-to-end: the suite reddens exactly as declared, then tears the process
  // down before the plan and summary are written.
  const r = run(newRoot({
    suite: 'tests/suite-truncated.js',
    proofs: [proof({ expectRed: [{ test: ['fixture trunc: the greeting is hello'], signal: 'RP-SIGNAL-GREETING' }] })],
  }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('a test file exited 3'), r.report);
  assert.ok(r.report.includes('its TAP is a prefix'), r.report);
});

test('red-proofs: the completeness gate names every way a run can fail to finish (Table B row 5)', () => {
  const complete = 'TAP version 13\nok 1 - a\n1..1\n# tests 1\n# fail 0\n';
  rp.assertCompleteRun({ status: 0, signal: null, spawnError: null, stdout: complete }, 'unit', 'RED');
  const cases = [
    [{ status: null, signal: 'SIGKILL', spawnError: null, stdout: complete }, /KILLED by SIGKILL/],
    [{ status: null, signal: null, spawnError: null, stdout: complete }, /did not exit normally/],
    [{ status: null, signal: null, spawnError: Object.assign(new Error('x'), { code: 'ENOBUFS' }), stdout: complete }, /could not be run \(ENOBUFS\)/],
    [{ status: 3, signal: null, spawnError: null, stdout: complete }, /exited 3/],
    [{ status: 1, signal: null, spawnError: null, stdout: 'TAP version 13\nnot ok 1 - a\n' }, /INCOMPLETE/],
    [{ status: 1, signal: null, spawnError: null, stdout: 'TAP version 13\nnot ok 1 - a\n1..2\n# tests 2\n' }, /announces 2 top-level result\(s\) but 1 were emitted/],
    [{ status: 1, signal: null, spawnError: null, stdout: 'TAP version 13\nnot ok 1 - f\n  ---\n  exitCode: 3\n  ...\n1..1\n# tests 1\n' }, /a test file exited 3/],
  ];
  // exitCode 1 is the reporter's OWN failure code — a file that merely failed,
  // including a module that would not parse — and must pass the gate so RED's
  // equality rule decides it (criterion 4's load-failure outcome is FAILED).
  rp.assertCompleteRun(
    { status: 1, signal: null, spawnError: null, stdout: 'TAP version 13\nnot ok 1 - f\n  ---\n  exitCode: 1\n  ...\n1..1\n# tests 1\n' },
    'unit', 'RED');
  for (const [run_, needle] of cases) {
    assert.throws(() => rp.assertCompleteRun(run_, 'unit', 'RED'),
      (e) => e.verdict === 'ERROR' && needle.test(e.message), needle.source);
  }
});

test('red-proofs: a FIFO in the source tree is an ERROR naming its path, with a verdict and the REACH footer (Table E1)', () => {
  const root = newRoot();
  const fifo = path.join(root, 'a-fifo');
  const mk = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  assert.equal(mk.status, 0, `precondition: mkfifo is available (${mk.stderr || mk.error})`);
  const r = run(root);
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('unsupported entry type: FIFO at a-fifo'), r.report);
  assert.ok(r.report.endsWith(`${rp.REACH}\n`), 'the footer is printed even on a snapshot ERROR');
});

test('red-proofs: a `node_modules` that is itself a SYMLINK is an ERROR — the type is decided BEFORE the exclusion (Table B row 2a)', () => {
  const root = newRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-deps-'));
  fs.writeFileSync(path.join(outside, 'index.js'), 'module.exports = 1;\n');
  fs.symlinkSync(outside, path.join(root, 'node_modules'));
  const r = run(root);
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('symbolic link at node_modules'), r.report);
  assert.ok(r.report.includes('dependency links included'), r.report);
  // The same holds for an excluded `.git` symlink, by the same ordering.
  const root2 = newRoot();
  fs.symlinkSync(outside, path.join(root2, '.git'));
  const r2 = run(root2);
  assert.equal(r2.verdict, 'ERROR', r2.report);
  assert.ok(r2.report.includes('symbolic link at .git'), r2.report);
});

test('red-proofs: `.git` and `node_modules` are excluded by BASENAME whatever their type — a linked worktree `.git` is a FILE (Table E1)', () => {
  const root = newRoot();
  fs.writeFileSync(path.join(root, '.git'), 'gitdir: /somewhere/else\n');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'x.js'), 'x\n');
  const manifest = rp.buildManifest(root);
  assert.equal(manifest.has('.git'), false, 'a `.git` FILE is excluded, not recorded');
  assert.ok([...manifest.keys()].every((k) => !k.startsWith('node_modules')));
  // copyTree agrees, so the two cannot drift apart by call-site ordering.
  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-cp-')), 'copy');
  rp.copyTree(root, dest);
  assert.equal(fs.existsSync(path.join(dest, '.git')), false);
  assert.equal(fs.existsSync(path.join(dest, 'node_modules')), false);
  rp.verifyCopy(dest, manifest);
  const r = run(root);
  assert.equal(r.verdict, 'PROVEN', r.report);
});

test('red-proofs: an UNREADABLE or MISSING declaration directory is an ERROR, never VACUOUS V1 (Table E2)', () => {
  const missing = newRoot({ declText: null });
  fs.rmSync(path.join(missing, 'tests', 'red-proofs'), { recursive: true, force: true });
  const r1 = run(missing);
  assert.equal(r1.verdict, 'ERROR', r1.report);
  assert.ok(r1.report.includes('could not be scanned'), r1.report);
  assert.ok(r1.report.includes('never V1'), r1.report);

  const unreadable = newRoot();
  const dir = path.join(unreadable, 'tests', 'red-proofs');
  fs.chmodSync(dir, 0o000);
  try {
    const r2 = run(unreadable);
    assert.equal(r2.verdict, 'ERROR', r2.report);
    assert.ok(/EACCES|EPERM/.test(r2.report), r2.report);
  } finally {
    fs.chmodSync(dir, 0o700);
  }

  // And the successfully-scanned empty directory is still V1, not ERROR.
  const empty = run(newRoot({ declText: null }));
  assert.equal(empty.verdict, 'VACUOUS', empty.report);
  assert.ok(empty.report.includes('V1: no declaration files'), empty.report);
});

test('red-proofs: a phase copy corrupted after creation is caught by the manifest BEFORE the phase uses it (Table B row 2)', () => {
  // The verification call site is the thing under test: with it deleted, the
  // runner\'s whole suite stayed green (measured by the reviewer at round 1).
  const seen = [];
  const r = run(newRoot(), {
    onPhaseCopy: (phase, dir) => {
      seen.push(phase);
      if (phase === 'baseline') fs.rmSync(path.join(dir, 'subject', 'subject.js'));
    },
  });
  assert.deepEqual(seen, ['baseline'], 'the run stops at the corrupted copy');
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('does not match the snapshot manifest'), r.report);
  assert.ok(r.report.includes('missing: subject/subject.js'), r.report);

  // Both directions: the same run with the hook absent is PROVEN.
  const control = run(newRoot());
  assert.equal(control.verdict, 'PROVEN', control.report);
});

test('red-proofs: a MODE DRIFT introduced into a phase copy is caught the same way (Table E1)', () => {
  const r = run(newRoot(), {
    onPhaseCopy: (phase, dir) => {
      if (phase === 'baseline') fs.chmodSync(path.join(dir, 'bin', 'rp-exec.js'), 0o644);
    },
  });
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('mode differs: bin/rp-exec.js (755 -> 644)'), r.report);
});

test('red-proofs: NO SIBLING COPY EXISTS while a child runs, and neither the sandbox nor the snapshot is writable from it (criterion 7b2)', () => {
  const r = run(newRoot({
    suite: 'tests/suite-traversal.js',
    proofs: [proof({ expectRed: [{ test: ['fixture trav: the greeting is hello'], signal: 'RP-SIGNAL-GREETING' }] })],
  }));
  assert.equal(r.verdict, 'PROVEN', r.report);
  assert.equal(r.exitCode, 0);
});

// ── ROUND-2 FINDINGS — each one's RED

test('red-proofs: a CONTROL that SKIPS every declared test exits 0 and must NOT be accepted (Table B row 6)', () => {
  // The drift a post-RED control exists to catch. BASELINE and RED register the
  // test normally; the third run — the CONTROL — registers it as SKIP and the
  // process still exits 0. A status-only check reports PROVEN over it.
  const counter = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-drift-')), 'runs');
  const saved = { c: process.env.RP_DRIFT_COUNTER, a: process.env.RP_DRIFT_AFTER, m: process.env.RP_DRIFT_MODE };
  process.env.RP_DRIFT_COUNTER = counter;
  process.env.RP_DRIFT_AFTER = '3';
  process.env.RP_DRIFT_MODE = 'skip';
  try {
    const r = run(newRoot({
      suite: 'tests/suite-drift.js',
      proofs: [proof({ expectRed: [{ test: ['fixture drift: the greeting is hello'], signal: 'RP-SIGNAL-GREETING' }] })],
    }));
    assert.equal(r.verdict, 'ERROR', r.report);
    assert.notEqual(r.exitCode, 0);
    assert.ok(r.report.includes('CONTROL(post-RED)'), r.report);
    assert.ok(r.report.includes('observed as SKIP'), r.report);
  } finally {
    for (const [k, v] of [['RP_DRIFT_COUNTER', saved.c], ['RP_DRIFT_AFTER', saved.a], ['RP_DRIFT_MODE', saved.m]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('red-proofs: a CONTROL that REGISTERS NOTHING exits 0 and must NOT be accepted either (Table B row 6)', () => {
  const counter = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-drift2-')), 'runs');
  const saved = { c: process.env.RP_DRIFT_COUNTER, a: process.env.RP_DRIFT_AFTER, m: process.env.RP_DRIFT_MODE };
  process.env.RP_DRIFT_COUNTER = counter;
  process.env.RP_DRIFT_AFTER = '3';
  process.env.RP_DRIFT_MODE = 'omit';
  try {
    const r = run(newRoot({
      suite: 'tests/suite-drift.js',
      proofs: [proof({ expectRed: [{ test: ['fixture drift: the greeting is hello'], signal: 'RP-SIGNAL-GREETING' }] })],
    }));
    assert.equal(r.verdict, 'ERROR', r.report);
    assert.notEqual(r.exitCode, 0);
    assert.ok(r.report.includes('CONTROL(post-RED)'), r.report);
    assert.ok(r.report.includes('did not RUN'), r.report);
  } finally {
    for (const [k, v] of [['RP_DRIFT_COUNTER', saved.c], ['RP_DRIFT_AFTER', saved.a], ['RP_DRIFT_MODE', saved.m]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('red-proofs: a CONTROL that registers NO TEST AT ALL exits 0 and must NOT be accepted either (Table B row 6)', () => {
  const counter = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-drift3-')), 'runs');
  const saved = { c: process.env.RP_DRIFT_COUNTER, a: process.env.RP_DRIFT_AFTER, m: process.env.RP_DRIFT_MODE };
  process.env.RP_DRIFT_COUNTER = counter;
  process.env.RP_DRIFT_AFTER = '3';
  process.env.RP_DRIFT_MODE = 'none';
  try {
    const r = run(newRoot({
      suite: 'tests/suite-drift.js',
      proofs: [proof({ expectRed: [{ test: ['fixture drift: the greeting is hello'], signal: 'RP-SIGNAL-GREETING' }] })],
    }));
    assert.equal(r.verdict, 'ERROR', r.report);
    assert.notEqual(r.exitCode, 0);
    assert.ok(r.report.includes('CONTROL(post-RED)'), r.report);
    assert.ok(r.report.includes('ZERO TESTS RAN'), r.report);
  } finally {
    for (const [k, v] of [['RP_DRIFT_COUNTER', saved.c], ['RP_DRIFT_AFTER', saved.a], ['RP_DRIFT_MODE', saved.m]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('red-proofs: the lane REFUSES a host whose mode bits cannot enforce isolation — win32 and uid 0 (Table B row 2b)', () => {
  assert.match(rp.unsupportedHostReason({ platform: 'win32', uid: 501 }), /win32 does not implement them/);
  assert.match(rp.unsupportedHostReason({ platform: 'linux', uid: 0 }), /uid 0 \(root\) bypasses/);
  assert.match(rp.unsupportedHostReason({ platform: 'darwin', uid: 0 }), /uid 0 \(root\) bypasses/);
  assert.equal(rp.unsupportedHostReason({ platform: 'linux', uid: 501 }), null);
  assert.equal(rp.unsupportedHostReason({ platform: 'darwin', uid: 1 }), null);
  // CI's own hosts are supported, so this refusal changes nothing there.
  assert.equal(rp.unsupportedHostReason(), null, 'this host must be able to enforce the isolation');

  // And the refusal is UNSUPPORTED, in the same class and shape as the Node floor.
  // Injecting the HOST, not the answer: this exercises `runAll`'s own call site.
  const r = run(BASE, { host: { platform: 'win32', uid: 501 } });
  assert.equal(r.verdict, 'UNSUPPORTED', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('UNSUPPORTED:'), r.report);
  assert.ok(r.report.includes('Table B row 2b'), r.report);
  assert.equal(r.proofs.length, 0, 'nothing is run on a host that cannot enforce the lane');
  assert.ok(r.report.endsWith(`${rp.REACH}\n`), 'the footer still ends the run');

  const asRoot = run(BASE, { host: { platform: 'linux', uid: 0 } });
  assert.equal(asRoot.verdict, 'UNSUPPORTED', asRoot.report);
  assert.ok(asRoot.report.includes('uid 0 (root) bypasses'), asRoot.report);

  // And a supported host is NOT refused — the guard must not be a blanket no.
  const ok = run(BASE, { host: { platform: 'linux', uid: 501 }, proof: 'no-such-proof' });
  assert.equal(ok.verdict, 'VACUOUS', ok.report);
});

test('red-proofs: a declaration edited between LOAD and SNAPSHOT is an ERROR naming the file (Table B row 2)', () => {
  const root = newRoot();
  const decl = path.join(root, 'tests', 'red-proofs', 'a.proofs.json');
  const r = run(root, {
    afterLoad: () => {
      const doc = JSON.parse(fs.readFileSync(decl, 'utf8'));
      doc.proofs[0].why = 'edited under the run';
      fs.writeFileSync(decl, JSON.stringify(doc, null, 2));
    },
  });
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('changed between LOAD and SNAPSHOT'), r.report);
  assert.ok(r.report.includes('tests/red-proofs/a.proofs.json'), r.report);

  // Both directions: the same run with no edit in the window is PROVEN.
  const control = run(newRoot(), { afterLoad: () => {} });
  assert.equal(control.verdict, 'PROVEN', control.report);

  // A declaration DELETED in the window is named too.
  const gone = newRoot();
  const r2 = run(gone, { afterLoad: () => fs.rmSync(path.join(gone, 'tests', 'red-proofs', 'a.proofs.json')) });
  assert.equal(r2.verdict, 'ERROR', r2.report);
  assert.ok(/not readable in the snapshot|could not be read/.test(r2.report), r2.report);
});

test('red-proofs: a declaration entry is CLASSIFIED before it is opened — a FIFO must not block, a symlink must not be followed (Table E1)', () => {
  const fifoRoot = newRoot();
  const fifo = path.join(fifoRoot, 'tests', 'red-proofs', 'b.proofs.json');
  const mk = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  assert.equal(mk.status, 0, `precondition: mkfifo is available (${mk.stderr || mk.error})`);
  // RUN OUT OF PROCESS, WITH A TIMEOUT, ON PURPOSE. `readFileSync` on a FIFO
  // BLOCKS SYNCHRONOUSLY waiting for a writer, and a synchronous block cannot be
  // interrupted by a test timeout — in-process, a regression here would hang the
  // whole suite (and CI) instead of failing it. A killed child fails loudly.
  const r = spawnSync(process.execPath, [RUNNER_SRC, '--root', fifoRoot], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(r.signal, null, 'the runner must classify the FIFO, never block on it');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('unsupported entry type: FIFO'), r.stdout);
  assert.ok(r.stdout.includes('tests/red-proofs/b.proofs.json'), r.stdout);

  const linkRoot = newRoot();
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-decl-')), 'evil.proofs.json');
  fs.writeFileSync(outside, JSON.stringify({ suite: 'tests/suite-basic.js', proofs: [proof()] }));
  fs.symlinkSync(outside, path.join(linkRoot, 'tests', 'red-proofs', 'c.proofs.json'));
  const r2 = run(linkRoot);
  assert.equal(r2.verdict, 'ERROR', r2.report);
  assert.ok(r2.report.includes('unsupported entry type: symbolic link'), r2.report);
  assert.ok(r2.report.includes('tests/red-proofs/c.proofs.json'), r2.report);
});

test('red-proofs: a report larger than the pipe buffer reaches its REACH footer intact (criterion 10)', () => {
  // `process.exit` discards what is still queued on a pipe. The footer is the
  // tail of the report, so it is exactly what a truncating exit loses.
  const root = newRoot({ proofs: [proof({ why: `${'why '.repeat(40000)}END-OF-WHY` })] });
  const r = spawnSync(process.execPath, [RUNNER_SRC, '--root', root], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ok(r.stdout.length > 160000, `the report must exceed the pipe buffer (got ${r.stdout.length} bytes)`);
  assert.ok(r.stdout.includes('END-OF-WHY'), 'the long note survived');
  assert.ok(r.stdout.endsWith(`${rp.REACH}\n`), `the REACH footer must end the report; got …${JSON.stringify(r.stdout.slice(-120))}`);
  assert.equal(r.status, 0, r.stderr);
});

// ── criterion 8 / 8b — no production seam, and the provided set cannot rot

test('red-proofs: the runner borrows no production seam and starts every suite through the sandbox\'s tests/run.js (criterion 8)', () => {
  const src = fs.readFileSync(RUNNER_SRC, 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*\*/.test(l)).join('\n');
  assert.equal(/require\('(\.\.\/)+src\//.test(code), false, 'the runner must import nothing from src/');
  assert.equal(/require\(['"][^'"]*src\/core/.test(code), false, 'the runner must import nothing from src/');
  assert.equal(/spawnSync\(\s*['"]git['"]/.test(code), false, 'the runner must spawn no git');
  assert.ok(code.includes("path.join(copyDir, 'tests', 'run.js')"), 'the runner spawns the sandbox\'s tests/run.js');
  assert.equal(/'--test'\s*,/.test(code), false, 'the runner must not spawn `node --test` directly');
  // AND THE GREP MUST BE ABLE TO READ IT. A single control byte makes `grep`
  // classify the file as BINARY and report no match, which is exactly how a
  // negated grep goes vacuously green. MEASURED: the runner carried two NUL
  // bytes — from a template literal separator — and criterion 8's verification
  // command passed on a deliberately violating copy.
  // BOTH files the two guarded greps read, not only this one: criterion 11's
  // negated grep runs over package.json and is defeated by a control byte there
  // in exactly the same way.
  for (const rel of ['scripts/red-proofs.js', 'package.json']) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '../..', rel));
    assert.deepEqual(
      [...bytes].map((b, i) => [i, b]).filter(([, b]) => b < 9 || (b > 13 && b < 32)),
      [], `${rel} must hold no control byte, or the verification greps read as binary`);
  }
  // That the guard really reaches the child — which only `tests/run.js` sets —
  // is asserted inside the phase itself, by tests/suite-isolation.js.
});

test('red-proofs: the redirected-variable constant still covers paths.js\'s OVERRIDE_VARS, and drift is red (criterion 8b)', () => {
  const covered = new Set(rp.REDIRECTED_ENV_VARS);
  const missing = OVERRIDE_VARS.filter((v) => !covered.has(v));
  assert.deepEqual(missing, [],
    `scripts/red-proofs.js REDIRECTED_ENV_VARS does not cover src/core/paths.js OVERRIDE_VARS.\n`
    + `  OVERRIDE_VARS:        ${OVERRIDE_VARS.join(', ')}\n`
    + `  REDIRECTED_ENV_VARS:  ${rp.REDIRECTED_ENV_VARS.join(', ')}`);

  // THE DRIFT CASE, RED: a local copy of the export carrying one extra name.
  const drifted = [...OVERRIDE_VARS, 'WIENERDOG_SOMETHING_NEW'];
  assert.deepEqual(drifted.filter((v) => !covered.has(v)), ['WIENERDOG_SOMETHING_NEW']);

  // The phase environment strips every one of them, and points the rest inside
  // the copy — whose HOME is what their defaults derive from.
  const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-env-'));
  const saved = process.env.WIENERDOG_CLAUDE_DIR;
  process.env.WIENERDOG_CLAUDE_DIR = '/ambient/claude';
  try {
    const env = rp.phaseEnv(copyDir);
    for (const name of rp.REDIRECTED_ENV_VARS) assert.equal(env[name], undefined, name);
    for (const name of ['TMPDIR', 'TMP', 'TEMP', 'HOME', ...rp.XDG_VARS]) {
      assert.ok(String(env[name]).startsWith(copyDir), `${name} must live inside the phase copy (got ${env[name]})`);
    }
  } finally {
    if (saved === undefined) delete process.env.WIENERDOG_CLAUDE_DIR; else process.env.WIENERDOG_CLAUDE_DIR = saved;
  }
});

// ── criterion 10 — the report states its own reach

test('red-proofs: every run — green or red — ends with the REACH footer, naming completeness, relevance and the LANE LIMIT (criterion 10)', () => {
  const green = run(BASE);
  const red = run(newRoot({ declText: null }));
  for (const r of [green, red]) {
    assert.ok(r.report.endsWith(`${rp.REACH}\n`), r.report.slice(-200));
    assert.ok(r.report.includes('DOES NOT establish that the declared set is COMPLETE'), r.report);
    assert.ok(r.report.includes('SEMANTICALLY RELEVANT'), r.report);
    assert.ok(r.report.includes('LANE LIMIT'), r.report);
    assert.ok(r.report.includes('UNSUPPORTED BY THE LANE'), r.report);
    // The footer states the MECHANISM it actually has: the override names are
    // REMOVED, and their roots land inside the copy through the redirected HOME.
    assert.ok(r.report.includes('are REMOVED from the phase'), r.report);
    assert.ok(r.report.includes('redirected HOME they all default under'), r.report);
    assert.ok(r.report.includes('locked immediately before its own phase'), r.report);
    // It describes the SELECTED evidence, never "each declared mutation".
    assert.ok(r.report.includes('each SELECTED declared mutation'), r.report);
  }
});

// ── criterion 11 — npm test does not enter the proof lane

test('red-proofs: this suite loads no declaration from the repository\'s own tests/red-proofs/ (criterion 11)', () => {
  assert.equal(fs.existsSync(path.join(BASE, 'tests', 'red-proofs', 'dream-pipeline.proofs.json')), false);
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
  assert.equal(/red-proofs/.test(pkg.scripts.test), false, 'npm test must not run the RED-proof lane');
  assert.equal(pkg.scripts['red-proofs'], 'node tests/with-temp-root.js scripts/red-proofs.js');
});

// ── criterion 12 — idempotency

test('red-proofs: two consecutive runs give the same verdict and leave the fixture tree byte-identical (criterion 12)', () => {
  const before = rp.buildManifest(BASE);
  const first = run(BASE);
  const second = run(BASE);
  assert.equal(first.verdict, 'PROVEN', first.report);
  assert.equal(second.verdict, first.verdict);
  assert.equal(second.exitCode, first.exitCode);
  rp.verifyCopy(BASE, before); // the runner's only writes go into copies it deletes
});
