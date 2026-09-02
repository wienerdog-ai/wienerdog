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

/**
 * THE LANE'S HOST REFUSAL MUST NOT TAKE THE UNIT SUITE WITH IT. `runAll` refuses
 * win32 and uid 0 (mode bits cannot enforce Table B row 2b there), so on a
 * Windows dev box or in a root container EVERY functional test below would
 * short-circuit to UNSUPPORTED and `npm test` would fail wholesale rather than
 * confirming the refusal — criterion 13. Functional tests therefore inject a
 * SUPPORTED host description; the dedicated refusal tests inject an unsupported
 * one, and the few cases that must run the real CLI skip with a reason.
 */
const SUPPORTED_HOST = { platform: 'linux', uid: 501 };

/** Non-null when THIS host cannot enforce the lane; the reason is the skip text. */
const HOST_REASON = rp.unsupportedHostReason();
const SKIP_ON_UNSUPPORTED_HOST = HOST_REASON
  ? { skip: `this host cannot enforce the lane, which the runner refuses by design: ${HOST_REASON}` }
  : {};

/**
 * INJECTING A SUPPORTED HOST BYPASSES THE REFUSAL, NOT THE FILESYSTEM. Under
 * uid 0 or on win32 a 0500 directory does not actually stop a child — root
 * ignores the permission check and Windows has no POSIX mode — so the cases
 * that assert an EACCES from the phase isolation would get no error and fail
 * for a reason that is the HOST's, not the code's. Those cases are gated on the
 * REAL host; every other functional case keeps the injected one and stays
 * meaningful everywhere.
 */
/**
 * CAPABILITIES ARE PROBED, NOT INFERRED — and the host refusal is ORed in so the
 * gate is demonstrable. A probe tells the truth about THIS filesystem (a share
 * that cannot symlink, a mount that ignores modes); the refusal predicate covers
 * the hosts the lane declines, including a real uid 0 where these probes would
 * pass under a stub but fail in production. Either one skips.
 */
function probe(fn) {
  try {
    return fn();
  } catch {
    return false;
  }
}

const CAP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-cap-'));

/** chmod can establish an executable bit — false on win32. */
const EXEC_BIT_OK = probe(() => {
  const f = path.join(CAP_DIR, 'exec-probe');
  fs.writeFileSync(f, 'x');
  fs.chmodSync(f, 0o755);
  return (fs.statSync(f).mode & 0o111) !== 0;
});

/** mode bits are ENFORCED against this process — false as uid 0, false on win32. */
const MODE_ENFORCED_OK = probe(() => {
  const d = path.join(CAP_DIR, 'enforce-probe');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'f'), 'x');
  fs.chmodSync(d, 0o000);
  try {
    fs.readdirSync(d);
    return false; // readable anyway: not enforced against us
  } catch {
    return true;
  } finally {
    try { fs.chmodSync(d, 0o700); } catch { /* best effort */ }
  }
});

/** symlinks can be created — false on a standard unprivileged win32 host. */
const SYMLINKS_OK = probe(() => {
  const l = path.join(CAP_DIR, 'link-probe');
  fs.symlinkSync(path.join(CAP_DIR, 'exec-probe'), l);
  return fs.lstatSync(l).isSymbolicLink();
});

/** @param {boolean} ok @param {string} what @returns {Object} a node:test options object */
function skipUnless(ok, what) {
  if (HOST_REASON) {
    return { skip: `this host cannot enforce the lane, which the runner refuses by design: ${HOST_REASON}` };
  }
  return ok ? {} : { skip: `this host cannot ${what}, so the case cannot be exercised here` };
}

const SKIP_WITHOUT_MODE_ENFORCEMENT = skipUnless(MODE_ENFORCED_OK, 'have mode bits enforced against it');
const SKIP_WITHOUT_EXEC_BIT = skipUnless(EXEC_BIT_OK, 'set an executable mode bit');
const SKIP_WITHOUT_SYMLINKS = skipUnless(SYMLINKS_OK, 'create symbolic links');

/** `mkfifo` is POSIX-only, and absent on a standard Windows development host. */
const MKFIFO_OK = (() => {
  if (process.platform === 'win32') return false;
  const probe = spawnSync('mkfifo', ['--version'], { encoding: 'utf8' });
  // BSD `mkfifo` has no `--version` and exits non-zero; ENOENT is the only
  // answer that means "not installed".
  return !(probe.error && probe.error.code === 'ENOENT');
})();
const SKIP_WITHOUT_MKFIFO = MKFIFO_OK
  ? {}
  : { skip: 'mkfifo is unavailable on this host, so a FIFO cannot be created to refuse' };

/** @param {string} root @param {Object} [opts] @returns {Object} */
const run = (root, opts = {}) => rp.runAll({ host: SUPPORTED_HOST, root, ...opts });

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

test('red-proofs: a suite-level failure at BASELINE is an ERROR, and V3 records that no mutation was applied (criteria 3, 6)', SKIP_WITHOUT_MODE_ENFORCEMENT, () => {
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

test('red-proofs: the manifest rejects a MISSING FILE, a MODE DRIFT and a MISSING EMPTY DIRECTORY (criterion 5, Table E1)', SKIP_WITHOUT_EXEC_BIT, () => {
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

test('red-proofs: resolveInside refuses `..`, an absolute path and a SYMLINK escape, on the RESOLVED path (criterion 7a)', SKIP_WITHOUT_SYMLINKS, () => {
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
  const r = run(newRoot({ proofs: [proof({ file: '../../../snapshot/subject/subject.js' })] }));
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

test('red-proofs: a SYMLINK anywhere in the source tree is an ERROR naming its path (criteria 7a, 7b2)', SKIP_WITHOUT_SYMLINKS, () => {
  const root = newRoot();
  fs.symlinkSync(path.join(root, 'subject', 'subject.js'), path.join(root, 'subject', 'alias.js'));
  const r = run(root);
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('symbolic link at subject/alias.js'), r.report);
});

test('red-proofs: a suite that plants a symlink at the mutation target AND at a parent of it reaches nothing — the write goes into a FRESH copy (criterion 7b)', SKIP_WITHOUT_SYMLINKS, () => {
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

test('red-proofs: NO TWO PHASES SHARE A WRITABLE PATH THE RUNNER PROVIDES — temp, HOME, the common parent and an ambient override (criterion 7b2)', SKIP_WITHOUT_MODE_ENFORCEMENT, () => {
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

test('red-proofs: the copies\' common parent is held NON-WRITABLE, so a suite writing `../sentinel` FAILS during BASELINE (criterion 7b2)', SKIP_WITHOUT_MODE_ENFORCEMENT, () => {
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

test('red-proofs: a FIFO in the source tree is an ERROR naming its path, with a verdict and the REACH footer (Table E1)', SKIP_WITHOUT_MKFIFO, () => {
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

test('red-proofs: a `node_modules` that is itself a SYMLINK is an ERROR — the type is decided BEFORE the exclusion (Table B row 2a)', SKIP_WITHOUT_SYMLINKS, () => {
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

test('red-proofs: an UNREADABLE or MISSING declaration directory is an ERROR, never VACUOUS V1 (Table E2)', SKIP_WITHOUT_MODE_ENFORCEMENT, () => {
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

test('red-proofs: a MODE DRIFT introduced into a phase copy is caught the same way (Table E1)', SKIP_WITHOUT_EXEC_BIT, () => {
  const r = run(newRoot(), {
    onPhaseCopy: (phase, dir) => {
      if (phase === 'baseline') fs.chmodSync(path.join(dir, 'bin', 'rp-exec.js'), 0o644);
    },
  });
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('mode differs: bin/rp-exec.js (755 -> 644)'), r.report);
});

test('red-proofs: NO SIBLING COPY EXISTS while a child runs, and neither the sandbox nor the snapshot is writable from it (criterion 7b2)', SKIP_WITHOUT_MODE_ENFORCEMENT, () => {
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
    // A file that registers nothing emits a childless record named for the file
    // and no inner zero plan — the ambiguous shape the wrapper rule KEEPS — so
    // the declared identity is reported missing rather than as zero tests run.
    // Either way the CONTROL is refused, which is what row 6 requires.
    assert.ok(r.report.includes('did not RUN'), r.report);
  } finally {
    for (const [k, v] of [['RP_DRIFT_COUNTER', saved.c], ['RP_DRIFT_AFTER', saved.a], ['RP_DRIFT_MODE', saved.m]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('red-proofs: THIS host can enforce the lane (skipped, with its reason, where it cannot)', SKIP_ON_UNSUPPORTED_HOST, () => {
  assert.equal(HOST_REASON, null);
});

test('red-proofs: the lane REFUSES a host whose mode bits cannot enforce isolation — win32 and uid 0 (Table B row 2b)', () => {
  assert.match(rp.unsupportedHostReason({ platform: 'win32', uid: 501 }), /win32 does not implement them/);
  assert.match(rp.unsupportedHostReason({ platform: 'linux', uid: 0 }), /uid 0 \(root\) bypasses/);
  assert.match(rp.unsupportedHostReason({ platform: 'darwin', uid: 0 }), /uid 0 \(root\) bypasses/);
  assert.equal(rp.unsupportedHostReason({ platform: 'linux', uid: 501 }), null);
  assert.equal(rp.unsupportedHostReason({ platform: 'darwin', uid: 1 }), null);
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

test('red-proofs: a declaration entry is CLASSIFIED before it is opened — a FIFO must not block, a symlink must not be followed (Table E1)', MKFIFO_OK ? SKIP_ON_UNSUPPORTED_HOST : SKIP_WITHOUT_MKFIFO, () => {
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

test('red-proofs: a report larger than the pipe buffer reaches its REACH footer intact (criterion 10)', SKIP_ON_UNSUPPORTED_HOST, () => {
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

// ── ROUND-3 FINDINGS — each one's RED

/** A mutation of the value all three namesake-suite assertions observe. */
const SHARED_MUTATION = {
  find: "const shared = 'shared-ok';",
  replace: "const shared = 'RP_MUT_S';",
  marker: 'RP_MUT_S',
};

test('red-proofs: a top-level test NAMED LIKE THE SUITE is a test, not the reporter\'s wrapper — its undeclared failure is FAILED, never dropped (Table A)', () => {
  // `tests/suite-namesake.js` and `suite-namesake.js` are real top-level tests.
  // A name-only wrapper rule replaced each with its children — none, being
  // leaves — so both vanished from the identity set and their own-body failures
  // never reached RED's equality rule. Declaring only the third test then
  // reported PROVEN over two undeclared reds.
  const r = run(newRoot({
    suite: 'tests/suite-namesake.js',
    proofs: [proof({
      ...SHARED_MUTATION,
      expectRed: [{ test: ['fixture namesake: the declared test'], signal: 'RP-SIGNAL-GREETING' }],
    })],
  }));
  assert.equal(r.verdict, 'FAILED', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('failed in its OWN BODY but is not declared'), r.report);
  assert.ok(/suite-namesake\.js/.test(r.report), r.report);
});

test('red-proofs: the same namesake tests, DECLARED, are observed and the proof is PROVEN (Table A)', () => {
  // The other direction: the identities must be reachable, not merely un-dropped.
  const r = run(newRoot({
    suite: 'tests/suite-namesake.js',
    proofs: [proof({
      ...SHARED_MUTATION,
      expectRed: [
        { test: ['tests/suite-namesake.js'], signal: 'RP-SIGNAL-NAMESAKE-PATH' },
        { test: ['suite-namesake.js'], signal: 'RP-SIGNAL-NAMESAKE-BASE' },
        { test: ['fixture namesake: the declared test'], signal: 'RP-SIGNAL-GREETING' },
      ],
    })],
  }));
  assert.equal(r.verdict, 'PROVEN', r.report);
  assert.equal(r.exitCode, 0);
});

test('red-proofs: the wrapper is recognised by REPORTER STRUCTURE, not by name (Table A)', () => {
  const suite = 'tests/suite-basic.js';
  // (a) the no-match shape: an INNER `1..0` plan, then a childless record named
  //     for the file. That record is the wrapper, and it is unwrapped.
  const noMatch = [
    'TAP version 13', '1..0', '# Subtest: tests/suite-basic.js', 'ok 1 - tests/suite-basic.js',
    '  ---', "  type: 'test'", '  ...', '1..1', '# tests 1', '',
  ].join('\n');
  assert.deepEqual(rp.parseTap(noMatch, suite), [], 'the file wrapper is not an identity');

  // (b) the SAME name, childless, with no inner zero plan: a real test, kept.
  const realTest = [
    'TAP version 13', '# Subtest: tests/suite-basic.js', 'not ok 1 - tests/suite-basic.js',
    '  ---', "  failureType: 'testCodeFailure'", "  error: 'RP-SIGNAL-X'", "  code: 'ERR_ASSERTION'", '  ...',
    '# Subtest: other', 'ok 2 - other', '1..2', '# tests 2', '',
  ].join('\n');
  const kept = rp.flattenTap(rp.parseTap(realTest, suite));
  assert.deepEqual(kept.map((n) => n.path.join('>')), ['tests/suite-basic.js', 'other']);

  // (c) THE AMBIGUOUS SHAPE — a file that registered no test emits exactly what a
  //     real childless namesake test emits. The tie is broken FAIL-SAFE: keep it,
  //     because a kept wrapper only makes the equality rule stricter while a
  //     dropped test makes it weaker.
  const registeredNothing = [
    'TAP version 13', '# Subtest: tests/suite-basic.js', 'ok 1 - tests/suite-basic.js',
    '  ---', "  type: 'test'", '  ...', '1..1', '# tests 1', '',
  ].join('\n');
  assert.deepEqual(
    rp.flattenTap(rp.parseTap(registeredNothing, suite)).map((n) => n.path.join('>')),
    ['tests/suite-basic.js'],
    'the ambiguous shape is KEPT — dropping it is how an undeclared own-body failure vanishes'
  );

  // (e) THE NODE 20 SPELLING — measured on v20.20.2, a wrapper carries the
  //     ABSOLUTE path while v25.9.0 carries the path as given. Childless, sole
  //     root, inner zero plan: the unmatched-pattern wrapper, unwrapped.
  const node20Absolute = [
    'TAP version 13', '1..0',
    '# Subtest: /home/runner/work/wienerdog/wienerdog/tests/suite-basic.js',
    'ok 1 - /home/runner/work/wienerdog/wienerdog/tests/suite-basic.js',
    '  ---', "  type: 'test'", '  ...',
    '1..1', '# tests 1', '',
  ].join('\n');
  assert.deepEqual(rp.parseTap(node20Absolute, suite), [],
    'the absolutely-spelled wrapper is recognised and unwrapped');

  // (d) A NAME-MATCHING NODE **WITH CHILDREN** IS A TEST, NEVER THE WRAPPER.
  //     Measured on v25.9.0 and v20.20.2, isolated and not: no reporter wrapper
  //     ever carries children. Treating "name + children" as a wrapper is what
  //     swallowed a namesake parent's own-body failure (PR #204 round 6).
  const namesakeParent = [
    'TAP version 13', '# Subtest: tests/suite-basic.js',
    '    # Subtest: inner', '    ok 1 - inner', '    1..1',
    'not ok 1 - tests/suite-basic.js',
    '  ---', "  failureType: 'testCodeFailure'", "  code: 'ERR_ASSERTION'", '  ...',
    '1..1', '# tests 1', '',
  ].join('\n');
  assert.deepEqual(
    rp.flattenTap(rp.parseTap(namesakeParent, suite)).map((n) => n.path.join('>')),
    ['tests/suite-basic.js', 'tests/suite-basic.js>inner'],
    'the namesake parent is kept WITH its subtest, so its own-body failure stays in the equality set'
  );

  // (f1) THE CHILDLESS CONJUNCT, pinned on the one stream that isolates it: a
  //      SOLE, NAME-MATCHING root WITH CHILDREN and an inner `1..0`. Every other
  //      condition for unwrapping holds, so only `children.length === 0` stands
  //      between this shape and a swallowed own-body failure — the dangerous
  //      direction of the round-6 defect.
  const zeroPlanWithChildren = [
    'TAP version 13', '1..0',
    '# Subtest: tests/suite-basic.js',
    '    # Subtest: inner', '    ok 1 - inner', '    1..1',
    'not ok 1 - tests/suite-basic.js',
    '  ---', "  failureType: 'testCodeFailure'", "  code: 'ERR_ASSERTION'", '  ...',
    '1..1', '# tests 1', '',
  ].join('\n');
  assert.deepEqual(
    rp.flattenTap(rp.parseTap(zeroPlanWithChildren, suite)).map((n) => n.path.join('>')),
    ['tests/suite-basic.js', 'tests/suite-basic.js>inner'],
    'a node WITH CHILDREN is a test even when every other wrapper condition holds'
  );

  // (f2) THE SOLE-ROOT GUARD, pinned on a synthetic stream. No measured Node
  //      emits an inner zero plan alongside sibling roots — a zero plan means
  //      nothing ran — so this is defence in depth, and it is asserted rather
  //      than left as an unpinned intention: if a reporter ever did, a
  //      name-matching sibling is still a test.
  const zeroPlanWithSibling = [
    'TAP version 13', '1..0',
    '# Subtest: tests/suite-basic.js', 'ok 1 - tests/suite-basic.js',
    '  ---', "  type: 'test'", '  ...',
    '# Subtest: sibling', 'ok 2 - sibling', '1..2', '# tests 2', '',
  ].join('\n');
  assert.deepEqual(
    rp.flattenTap(rp.parseTap(zeroPlanWithSibling, suite)).map((n) => n.path.join('>')),
    ['tests/suite-basic.js', 'sibling'],
    'a name-matching node with siblings is a test, inner zero plan or not'
  );

  // (f) a name-matching node that is one of SEVERAL roots is a test.
  const withSibling = [
    'TAP version 13', '# Subtest: tests/suite-basic.js', 'ok 1 - tests/suite-basic.js',
    '  ---', "  type: 'test'", '  ...',
    '# Subtest: sibling', 'ok 2 - sibling', '1..2', '# tests 2', '',
  ].join('\n');
  assert.deepEqual(
    rp.flattenTap(rp.parseTap(withSibling, suite)).map((n) => n.path.join('>')),
    ['tests/suite-basic.js', 'sibling']
  );
});

test('red-proofs: a declaration ADDED between LOAD and SNAPSHOT is an ERROR naming the file (Table B row 2)', () => {
  const root = newRoot();
  const r = run(root, {
    afterLoad: () => fs.writeFileSync(
      path.join(root, 'tests', 'red-proofs', 'b-added.proofs.json'),
      JSON.stringify({ suite: 'tests/suite-basic.js', proofs: [proof({ id: 'added-in-the-window' })] })
    ),
  });
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('ADDED between LOAD and SNAPSHOT'), r.report);
  assert.ok(r.report.includes('tests/red-proofs/b-added.proofs.json'), r.report);
  // Without the set comparison the added file is copied, manifest-verified and
  // ignored — its proofs never run while their criterion rolls up as complete.
  assert.equal(r.proofs.length, 0, 'nothing runs once the declaration set is untrustworthy');
});

// ── ROUND-4 FINDINGS — each one's RED

test('red-proofs: a suite path that a command line reads as an OPTION is refused at LOAD, before any argv is built (Table A `suite`)', () => {
  const root = newRoot({ suite: '--test-name-pattern=target' });
  // The file really exists, so nothing here rests on it being missing.
  fs.writeFileSync(path.join(root, '--test-name-pattern=target'),
    "'use strict';\nrequire('node:test')('fixture dash: ran the declared file', () => {});\n");
  const r = run(root);
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('must not begin with "-"'), r.report);
  assert.equal(r.proofs.length, 0, 'nothing runs, so default discovery is never reached');
});

test('red-proofs: `runSuite` refuses the same shape, so no internal caller can reach the measured HANG (Table A `suite`)', () => {
  // MEASURED on v25.9.0, in a tree whose fixture suites are not discoverable:
  //   node --test --test-reporter=tap '--test-name-pattern=target'  -> 1..0, exit 0
  //     (the path was read as an OPTION and DEFAULT DISCOVERY ran instead)
  //   node --test --test-reporter=tap -- '--test-name-pattern=target' -> HANGS
  //     (Node waits for a script on stdin; killed at 20 s)
  // The terminator alone therefore does not rescue this path — it converts a
  // wrong run into an unreportable one — so the path is refused at both layers.
  // OUT OF PROCESS, WITH A TIMEOUT, for the round-2 reason: without the guard
  // this call BLOCKS SYNCHRONOUSLY inside spawnSync, and a synchronous block
  // cannot be interrupted by a test timeout — in-process, a regression here
  // would hang the suite and CI rather than failing them.
  const probe = spawnSync(process.execPath, ['-e', `
    const rp = require(process.argv[1]);
    try { rp.runSuite(process.argv[2], '--test-name-pattern=target', undefined); console.log('NO-REFUSAL'); }
    catch (e) { console.log(e.verdict + ':' + e.message); }
  `, RUNNER_SRC, BASE], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(probe.signal, null, 'runSuite must refuse the path, never block on it');
  assert.ok(/^ERROR:.*begins with "-"/.test(probe.stdout.trim()), probe.stdout + probe.stderr);
});

test('red-proofs: a `suite` that is not a REGULAR FILE is an ERROR naming that, not a suite-level failure (Table A `suite`)', () => {
  // `tests` is a directory inside the copy: it resolves, it is inside, and it
  // would send Node back to default discovery. Without the lstat the run still
  // ERRORs — but as "the pristine suite was not green", which names the wrong
  // cause and sends a reader looking at their tests. The message is the assertion.
  const r = run(newRoot({ suite: 'tests' }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('is not a regular file in the copy'), r.report);
  assert.equal(r.report.includes('the pristine suite was not green'), false, r.report);
});

test('red-proofs: the option terminator is present and harmless for a legal path (Table A `suite`)', () => {
  const src = fs.readFileSync(RUNNER_SRC, 'utf8');
  assert.ok(src.includes("args.push('--', suiteRel)"), 'the suite path follows an option terminator');
  // And a normal path still runs its own file through it — measured, 2 tests.
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-term-'));
  fs.cpSync(BASE, copy, { recursive: true });
  for (const d of ['.red-proofs-tmp', '.red-proofs-home', '.red-proofs-xdg/config',
    '.red-proofs-xdg/cache', '.red-proofs-xdg/data', '.red-proofs-xdg/state']) {
    fs.mkdirSync(path.join(copy, d), { recursive: true });
  }
  const out = rp.runSuite(copy, 'tests/suite-basic.js', undefined);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(
    rp.flattenTap(rp.parseTap(out.stdout, 'tests/suite-basic.js')).map((n) => n.path.join('>')),
    ['fixture basic: the greeting is hello', 'fixture basic: the arity is two']
  );
});

test('red-proofs: a target that does not round-trip through UTF-8 is an ERROR — bytes outside the match may not change (Table B row 4)', () => {
  const root = newRoot();
  const target = path.join(root, 'subject', 'subject.js');
  const pristine = Buffer.concat([
    fs.readFileSync(target),
    Buffer.from('// a lone continuation byte, outside every match: '),
    Buffer.from([0xff, 0xfe]),
    Buffer.from('\n'),
  ]);
  fs.writeFileSync(target, pristine);
  // Reading with 'utf8' would replace those two bytes with U+FFFD and the write
  // would re-encode the replacement — `written === expected` on both sides while
  // bytes OUTSIDE the declared mutation silently changed.
  const naive = Buffer.from(fs.readFileSync(target, 'utf8'), 'utf8');
  assert.equal(naive.equals(pristine), false, 'precondition: a text round-trip loses these bytes');

  const r = run(root);
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('does not round-trip through UTF-8'), r.report);
  assert.ok(fs.readFileSync(target).equals(pristine), 'and the file itself is untouched');
});

test('red-proofs: legal multi-byte UTF-8 outside the match is preserved byte-for-byte and still PROVEN (Table B row 4)', () => {
  // The other direction: the guard must refuse malformed bytes, not non-ASCII.
  const root = newRoot();
  const target = path.join(root, 'subject', 'subject.js');
  const decorated = `${fs.readFileSync(target, 'utf8')}// über — 日本語 — 🐕\n`;
  fs.writeFileSync(target, decorated);
  const r = run(root);
  assert.equal(r.verdict, 'PROVEN', r.report);
  assert.equal(r.exitCode, 0);
  assert.ok(fs.readFileSync(target, 'utf8').includes('// über — 日本語 — 🐕'),
    'the decorated source is unchanged in the checkout — the runner mutates copies');
});

// ── ROUND-5 FINDINGS — each one's RED

test('red-proofs: a declaration that does not round-trip through UTF-8 is an ERROR naming the file (Table B row 2)', () => {
  const root = newRoot();
  const decl = path.join(root, 'tests', 'red-proofs', 'a.proofs.json');
  const doc = JSON.parse(fs.readFileSync(decl, 'utf8'));
  // A malformed byte INSIDE a quoted string. Decoding with 'utf8' replaces it
  // with U+FFFD, so `JSON.parse` accepts data that is not valid UTF-8 JSON and
  // the digest would be taken over the normalised string rather than the file.
  const text = JSON.stringify(doc, null, 2);
  const at = text.indexOf('"why"');
  assert.ok(at > 0, 'precondition: the declaration carries a why');
  const malformed = Buffer.concat([
    Buffer.from(text.slice(0, text.indexOf(':', at) + 3), 'utf8'),
    Buffer.from([0xff]),
    Buffer.from(text.slice(text.indexOf(':', at) + 3), 'utf8'),
  ]);
  assert.equal(Buffer.from(malformed.toString('utf8'), 'utf8').equals(malformed), false,
    'precondition: these bytes do not survive a utf8 round-trip');
  fs.writeFileSync(decl, malformed);

  const r = run(root);
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('does not round-trip through UTF-8'), r.report);
  assert.ok(r.report.includes('tests/red-proofs/a.proofs.json'), r.report);
  assert.equal(r.proofs.length, 0, 'nothing runs on a declaration set that cannot be tied to the snapshot');
});

test('red-proofs: the declaration digest is over RAW BYTES — two files that decode alike hash differently (Table B row 2)', () => {
  const body = Buffer.from('{"suite":"tests/suite-basic.js","proofs":[]}\n// ', 'utf8');
  const a = Buffer.concat([body, Buffer.from([0xff]), Buffer.from('\n')]);
  const b = Buffer.concat([body, Buffer.from([0xfe]), Buffer.from('\n')]);
  assert.equal(a.equals(b), false, 'the two files differ by one byte');

  // THE DEFECT, shown first: both decode to the SAME string, because each stray
  // byte becomes U+FFFD — so a digest over the decoded text cannot tell them
  // apart, and an edit in the LOAD -> SNAPSHOT window would evade the tie.
  assert.equal(a.toString('utf8'), b.toString('utf8'), 'they decode identically');
  const overText = (buf) => require('node:crypto').createHash('sha256')
    .update(buf.toString('utf8'), 'utf8').digest('hex');
  assert.equal(overText(a), overText(b), 'a digest over the DECODED string collides');

  // The shipped digest is over the bytes, so it does not.
  assert.notEqual(rp.declarationDigest(a), rp.declarationDigest(b));
  assert.equal(rp.declarationDigest(a), rp.declarationDigest(Buffer.from(a)));
});

test('red-proofs: a declaration carrying legal multi-byte UTF-8 still loads, and its digest is stable (Table B row 2)', () => {
  // The other direction: the guard must refuse malformed bytes, not non-ASCII.
  const root = newRoot();
  const decl = path.join(root, 'tests', 'red-proofs', 'a.proofs.json');
  const doc = JSON.parse(fs.readFileSync(decl, 'utf8'));
  doc.proofs[0].why = 'a why with über — 日本語 — 🐕 in it';
  fs.writeFileSync(decl, JSON.stringify(doc, null, 2));
  const r = run(root);
  assert.equal(r.verdict, 'PROVEN', r.report);
  assert.ok(r.report.includes('日本語'), r.report);
});

// ── ROUND-6 FINDINGS — each one's RED

test('red-proofs: a NAMESAKE PARENT WITH SUBTESTS is a test — its undeclared own-body failure is FAILED, never swallowed (Table B row 5)', () => {
  // The subtests stay GREEN under the mutation, so unwrapping the parent leaves
  // only passing children behind and its own red disappears entirely. Both gate
  // channels reproduced PROVEN, exit 0, over that shape.
  const r = run(newRoot({
    suite: 'tests/suite-namesake-nested.js',
    proofs: [proof({
      ...SHARED_MUTATION,
      expectRed: [{ test: ['fixture nested-namesake: the declared test'], signal: 'RP-SIGNAL-GREETING' }],
    })],
  }));
  assert.equal(r.verdict, 'FAILED', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('failed in its OWN BODY but is not declared'), r.report);
  assert.ok(r.report.includes('tests/suite-namesake-nested.js'), r.report);
});

test('red-proofs: the same namesake parent, DECLARED with its subtest identity, is observed and PROVEN (Table B row 5)', () => {
  // Sole root, name-matching, WITH children — the shape a `roots.length === 1`
  // rule alone would still unwrap, and then the declaration's nested path would
  // match nothing at all.
  const r = run(newRoot({
    suite: 'tests/suite-namesake-solo.js',
    proofs: [proof({
      ...SHARED_MUTATION,
      expectRed: [
        { test: ['tests/suite-namesake-solo.js'], signal: 'RP-SIGNAL-NAMESAKE-OWN-BODY' },
        { test: ['tests/suite-namesake-solo.js', 'the declared subtest'], signal: 'RP-SIGNAL-GREETING' },
      ],
    })],
  }));
  assert.equal(r.verdict, 'PROVEN', r.report);
  assert.equal(r.exitCode, 0);
});

test('red-proofs: a SYMLINKED `--root` is refused, and the real tree it points at is untouched (Table B rows 2, 2a)', SKIP_WITHOUT_SYMLINKS, () => {
  // `path.resolve` leaves a link intact, so the manifest walked the TARGET while
  // `cpSync` reproduced the LINK — and the mutation was written THROUGH it into
  // the real tree, outside the sandbox, while the run reported normally.
  const real = newRoot();
  const before = fs.readFileSync(path.join(real, 'subject', 'subject.js'));
  const linkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-rootlink-'));
  const link = path.join(linkDir, 'linked-root');
  fs.symlinkSync(real, link);

  const r = run(link);
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('--root is a SYMBOLIC LINK'), r.report);
  assert.equal(r.proofs.length, 0, 'nothing runs through a root that aliases another tree');
  assert.ok(fs.readFileSync(path.join(real, 'subject', 'subject.js')).equals(before),
    'the real tree behind the link is byte-identical after the run');
  assert.equal(fs.existsSync(path.join(real, 'subject', 'subject.js.orig')), false);
});

test('red-proofs: a `--root` that is not a directory is refused too (Table B row 2)', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-rootfile-')), 'not-a-dir');
  fs.writeFileSync(file, 'x');
  const r = run(file);
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.ok(r.report.includes('--root is not a directory'), r.report);
});

test('red-proofs: a legal root whose ANCESTOR is a symlink still runs, and the root is RESOLVED once (Table B row 2)', () => {
  // macOS hands every `os.tmpdir()` path an ancestor symlink (`/var` ->
  // `/private/var`), so refusing on an ancestor would refuse every fixture here;
  // Linux usually does not, so the expectation is computed from the host rather
  // than assumed. Either way exactly ONE root value reaches the manifest, the
  // copies and the containment checks — mixing a link with its target is what
  // created the alias the symlinked-root finding exploited.
  const root = newRoot();
  const resolved = fs.realpathSync(root);
  const r = run(root);
  assert.equal(r.verdict, 'PROVEN', r.report);
  if (resolved !== root) {
    assert.ok(r.report.includes(`root resolves to ${resolved}`), r.report);
  } else {
    assert.equal(r.report.includes('root resolves to '), false, r.report);
  }
  assert.ok(r.report.includes(`RED proofs — root ${root}`), r.report);
});

// ── ROUND-7 FINDINGS — each one's RED

test('red-proofs: a TMPDIR INSIDE `--root` is refused — the snapshot destination may not descend from its source (Table B rows 2, 2a)', () => {
  const root = newRoot();
  // The manifest is taken BEFORE the temp directory exists, so the comparison
  // afterwards is against the tree as the run found it.
  const before = rp.buildManifest(root);
  const inside = path.join(root, '.tmp');
  fs.mkdirSync(inside, { recursive: true });
  const saved = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP };
  process.env.TMPDIR = inside;
  process.env.TMP = inside;
  process.env.TEMP = inside;
  try {
    const r = run(root);
    assert.equal(r.verdict, 'ERROR', r.report);
    assert.notEqual(r.exitCode, 0);
    assert.ok(r.report.includes('the sandbox would be created inside the tree it snapshots'), r.report);
    assert.ok(r.report.includes(fs.realpathSync(root)), 'the ERROR names --root');
    assert.equal(r.proofs.length, 0, 'nothing runs once the sandbox would nest inside the source');
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
  // And the tree is byte-identical: nothing was copied, mutated or deleted.
  fs.rmSync(inside, { recursive: true, force: true });
  rp.verifyCopy(root, before);
});

test('red-proofs: a proof id of `snapshot` is a legal kebab slug and reaches PROVEN (Table A `id`)', () => {
  // As a sibling of the snapshot directory this id made the proof's parent EQUAL
  // `ctx.snapshot`: the first phase copied the snapshot into itself and the
  // cleanup deleted the shared snapshot. Proof directories now have their own
  // namespace, so no legal id can collide with runner state.
  const r = run(newRoot({ proofs: [proof({ id: 'snapshot' })] }));
  assert.equal(r.verdict, 'PROVEN', r.report);
  assert.equal(r.exitCode, 0);
  assert.equal(r.proofs[0].id, 'snapshot');

  // The other reserved-looking names are fine too, and two of them coexist.
  const both = run(newRoot({
    proofs: [
      proof({ id: 'snapshot' }),
      proof({ id: 'proofs', find: 'const arity = 2;', replace: 'const arity = 3; /* RP_MUT_A */', marker: 'RP_MUT_A',
        expectRed: [{ test: ['fixture basic: the arity is two'], signal: 'RP-SIGNAL-ARITY' }] }),
    ],
  }));
  assert.equal(both.verdict, 'PROVEN', both.report);
});

test('red-proofs: an argv error ends with the REACH footer and carries the ERROR verdict word (criterion 10)', () => {
  const r = spawnSync(process.execPath, [RUNNER_SRC, '--bogus'], {
    encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.startsWith('ERROR: unknown argument "--bogus"'), r.stdout);
  assert.ok(r.stdout.includes('usage: node scripts/red-proofs.js'), r.stdout);
  assert.ok(r.stdout.endsWith(`${rp.REACH}\n`), `the footer must end an argv error too; got …${JSON.stringify(r.stdout.slice(-80))}`);
  // A flag missing its value goes the same way.
  const missing = spawnSync(process.execPath, [RUNNER_SRC, '--root'], {
    encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(missing.status, 1);
  assert.ok(missing.stdout.endsWith(`${rp.REACH}\n`), missing.stdout.slice(-80));
});

test('red-proofs: `why` is printed on EVERY verdict, not only on PROVEN (Table A `why`)', () => {
  const why = 'the arity assertion observes the subject, so changing it must redden';
  // A FAILED proof: the note carries the phase diagnostic, and `why` is what
  // tells a reader what the proof was FOR.
  const failed = run(newRoot({
    proofs: [proof({
      why,
      expectRed: [{ test: ['fixture basic: the arity is two'], signal: 'RP-SIGNAL-ARITY' }],
    })],
  }));
  assert.equal(failed.verdict, 'FAILED', failed.report);
  assert.ok(failed.report.includes(`why: ${why}`), failed.report);
  assert.ok(failed.report.includes('did not fail under the mutation'), failed.report);
  assert.equal(failed.proofs[0].why, why);

  // An ERROR proof carries it too.
  const errored = run(newRoot({ proofs: [proof({ why, occurrences: 2 })] }));
  assert.equal(errored.verdict, 'ERROR', errored.report);
  assert.ok(errored.report.includes(`why: ${why}`), errored.report);
  assert.equal(errored.proofs[0].why, why);

  // And PROVEN prints it exactly once, not twice.
  const proven = run(newRoot({ proofs: [proof({ why })] }));
  assert.equal(proven.verdict, 'PROVEN', proven.report);
  assert.equal(proven.report.split(`why: ${why}`).length - 1, 1, proven.report);
});

// ── ROUND-8 FINDING — its RED

test('red-proofs: test identities are BYTE-EXACT — a name ending in whitespace is declared as written and reaches PROVEN (Table A)', () => {
  // Under a trimming parser `'case '` and `'case'` collapse onto one identity:
  // the run is not merely wrong, it is AMBIGUOUS, and the runner refuses.
  const r = run(newRoot({
    suite: 'tests/suite-whitespace.js',
    proofs: [proof({
      ...SHARED_MUTATION,
      expectRed: [
        { test: ['case '], signal: 'RP-SIGNAL-TRAILING-SPACE' },
        { test: ['case'], signal: 'RP-SIGNAL-BARE' },
        { test: ['  padded  '], signal: 'RP-SIGNAL-PADDED' },
      ],
    })],
  }));
  assert.equal(r.verdict, 'PROVEN', r.report);
  assert.equal(r.exitCode, 0);
});

test('red-proofs: the TRIMMED spelling of a padded name does not RUN — identities are not normalised on either side (Table A)', () => {
  const r = run(newRoot({
    suite: 'tests/suite-whitespace.js',
    proofs: [proof({
      ...SHARED_MUTATION,
      expectRed: [{ test: ['  padded'], signal: 'RP-SIGNAL-PADDED' }],
    })],
  }));
  assert.equal(r.verdict, 'ERROR', r.report);
  assert.notEqual(r.exitCode, 0);
  assert.ok(r.report.includes('did not RUN'), r.report);
});

test('red-proofs: the parser preserves a name\'s own whitespace and strips only the directive and the line terminator (Table A)', () => {
  const suite = 'tests/suite-basic.js';
  // MEASURED on v25.9.0 and v20.20.2 — these are the reporter's own bytes.
  const stream = [
    'TAP version 13',
    '# Subtest: case ', 'ok 1 - case ',
    '# Subtest: case', 'ok 2 - case',
    '# Subtest:   padded  ', 'ok 3 -   padded  ',
    '# Subtest: skipped ', 'ok 4 - skipped  # SKIP why',
    '# Subtest: todo ', 'ok 5 - todo  # TODO',
    '# Subtest: plain\\#hash ', 'ok 6 - plain\\#hash ',
    '1..6', '# tests 6', '',
  ].join('\n');
  const nodes = rp.flattenTap(rp.parseTap(stream, suite));
  assert.deepEqual(nodes.map((n) => n.path[0]),
    ['case ', 'case', '  padded  ', 'skipped ', 'todo ', 'plain#hash ']);
  // The directive is recognised without eating the name's own trailing space.
  assert.equal(nodes[3].node.directive, 'SKIP');
  assert.equal(nodes[4].node.directive, 'TODO');
  assert.equal(nodes[5].node.directive, null, 'an escaped # inside a name is not a directive');
  // `'case '` and `'case'` stay two identities, so neither is ambiguous.
  assert.equal(nodes.filter((n) => n.path[0] === 'case').length, 1);
  assert.equal(nodes.filter((n) => n.path[0] === 'case ').length, 1);
  // A CRLF stream loses only the terminator.
  const crlf = ['TAP version 13', 'ok 1 - case ', '1..1', '# tests 1', ''].join('\r\n');
  assert.deepEqual(rp.flattenTap(rp.parseTap(crlf, suite)).map((n) => n.path[0]), ['case ']);
  // And the completeness gate reads the same stream — it splits lines too, so
  // both call sites must strip the terminator or a CRLF run reads as truncated.
  rp.assertCompleteRun({ status: 0, signal: null, spawnError: null, stdout: crlf }, 'unit', 'BASELINE');
});

// ── ROUND-9 FINDINGS — each one's RED

test('red-proofs: PWD names the phase copy, and no phase sees another\'s sentinel through it (criterion 7b2)', SKIP_WITHOUT_MODE_ENFORCEMENT, () => {
  // The fixture writes `${PWD}/pwd-sentinel` in every phase and asserts no
  // earlier phase's sentinel is visible. Before the redirect, PWD was the real
  // checkout in all three phases: the write landed in the source tree and RED
  // saw BASELINE's file.
  const root = newRoot({
    suite: 'tests/suite-pwd.js',
    proofs: [proof({ expectRed: [{ test: ['fixture pwd: the greeting is hello'], signal: 'RP-SIGNAL-GREETING' }] })],
  });
  const before = rp.buildManifest(root);
  const r = run(root);
  assert.equal(r.verdict, 'PROVEN', r.report);
  assert.equal(r.exitCode, 0);
  // And the source tree gained nothing — no sentinel, no drift.
  rp.verifyCopy(root, before);
  assert.equal(fs.existsSync(path.join(root, 'pwd-sentinel')), false);
});

test('red-proofs: phaseEnv sets PWD into the copy and drops OLDPWD (Table B row 2b)', () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-rp-pwd-'));
  const saved = { PWD: process.env.PWD, OLDPWD: process.env.OLDPWD };
  process.env.PWD = '/the/real/checkout';
  process.env.OLDPWD = '/somewhere/else';
  try {
    const env = rp.phaseEnv(copy);
    assert.equal(env.PWD, copy, 'PWD is the phase copy, never the inherited path');
    assert.equal(env.OLDPWD, undefined, 'OLDPWD is not left pointing at a real directory');
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('red-proofs: a declared identity carrying a RAW CONTROL CHARACTER is refused at LOAD, naming it (Table A)', () => {
  // MEASURED on v25.9.0 and v20.20.2: `test('nl\nb')` is emitted as the bytes
  // `nl\\nb`, which is byte-for-byte what `test('nl\\nb')` emits. The two are
  // indistinguishable in the stream, so a raw control character in a declaration
  // can never be observed — and the runner refuses rather than guessing which
  // of the two names an escaped spelling meant.
  for (const [label, name, code] of [
    ['newline', 'nl\nb', '\\u000a'],
    ['tab', 'ta\tb', '\\u0009'],
    ['carriage return', 'cr\rb', '\\u000d'],
  ]) {
    const r = run(newRoot({ proofs: [proof({ expectRed: [{ test: [name], signal: 'x' }] })] }));
    assert.equal(r.verdict, 'ERROR', `${label}: ${r.report}`);
    assert.notEqual(r.exitCode, 0);
    assert.ok(r.report.includes('contains a raw control character'), r.report);
    assert.ok(r.report.includes(code), `${label}: the code point is named — ${r.report}`);
    assert.ok(r.report.includes('can never be observed'), r.report);
    assert.equal(r.proofs.length, 0);
  }
  // A nested position is named by its index.
  const nested = run(newRoot({ proofs: [proof({ expectRed: [{ test: ['outer', 'in\nner'], signal: 'x' }] })] }));
  assert.ok(nested.report.includes('"expectRed[].test[1]"'), nested.report);
});

test('red-proofs: the TAP escape set is decoded exactly, and the ambiguity is refused rather than guessed (Table A)', () => {
  const suite = 'tests/suite-basic.js';
  // The reporter's own bytes, measured. `\\` is one literal backslash here.
  const stream = [
    'TAP version 13',
    'ok 1 - bs\\\\d',      // source name: bs<backslash>d
    'ok 2 - hash\\#e',     // source name: hash#e
    'ok 3 - nl\\\\na',     // source name: EITHER a real newline OR backslash+n
    '1..3', '# tests 3', '',
  ].join('\n');
  assert.deepEqual(
    rp.flattenTap(rp.parseTap(stream, suite)).map((n) => n.path[0]),
    ['bs\\d', 'hash#e', 'nl\\na'],
    'the TAP layer is inverted exactly: \\\\ -> \\ and \\# -> #'
  );
  // The third is the irreducible one: a real newline and a literal backslash+n
  // produce this same spelling, so it decodes to the spelling, not to a guess.
  // A declaration may name it as the reporter prints it — and a raw newline is
  // refused at LOAD instead of silently never matching.
  const ok = run(newRoot({ proofs: [proof({ expectRed: [{ test: ['fixture basic: the greeting is hello'], signal: 'RP-SIGNAL-GREETING' }] })] }));
  assert.equal(ok.verdict, 'PROVEN', ok.report);
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
