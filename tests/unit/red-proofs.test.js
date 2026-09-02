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
  ['a wp that is not a WP id', [proof({ wp: 'nope' })], '"wp" must be a WP id'],
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

test('red-proofs: a testNamePattern matching nothing exits 0 with a pass count in Node — and is still an ERROR here (criterion 3)', () => {
  // The measured trap, reproduced first: an unmatched pattern prints an inner
  // `1..0` under an outer file-level `ok` and EXITS 0.
  const bare = tapOf(BASE, 'tests/suite-basic.js', 'zzz-matches-nothing');
  assert.equal(bare.status, 0, 'precondition: Node exits 0 on an unmatched pattern');
  assert.ok(/^1\.\.0$/m.test(bare.stdout), bare.stdout);
  assert.ok(/^ok \d+ - tests[\\/]suite-basic\.js$/m.test(bare.stdout), bare.stdout);
  // And the file-level wrapper is not a test identity: stripping it leaves none.
  assert.deepEqual(rp.parseTap(bare.stdout, 'tests/suite-basic.js'), []);

  const r = run(newRoot({ proofs: [proof({ testNamePattern: 'zzz-matches-nothing' })] }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('did not RUN'), r.report);
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

  // (5) a pattern matching nothing yields NO identities at all
  const none = tapOf(root, 'tests/suite-basic.js', 'zzz-matches-nothing');
  assert.deepEqual(rp.parseTap(none.stdout, 'tests/suite-basic.js'), []);
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

test('red-proofs: a `..` file escaping into a SIBLING phase copy is an ERROR before any write (criterion 7a)', () => {
  const r = run(newRoot({ proofs: [proof({ file: '../baseline/subject/subject.js' })] }));
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
  assert.deepEqual(
    [...Buffer.from(src)].map((b, i) => [i, b]).filter(([, b]) => b < 9 || (b > 13 && b < 32)),
    [], 'scripts/red-proofs.js must hold no control byte, or the verification greps read as binary');
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
