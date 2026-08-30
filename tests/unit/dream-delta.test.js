'use strict';

/**
 * Coverage for src/core/dream/delta.js (WP-dream-baseline-delta-primitive).
 *
 * Two halves, and the split is the point:
 *
 *  1. THE MODULE'S OWN CONTRACT — the walk, the scope round trip, the anomaly
 *     list, the record shape, the two named caller invariants (whose VIOLATED
 *     behaviour is pinned here rather than assumed), and the accuracy mechanisms
 *     that bind classification and read to one opened object.
 *
 *  2. THE GIT-AGREEMENT DIFFERENTIAL. The primitive replaces evidence git
 *     produces today, so equivalence to git is the contract, not an
 *     implementation detail. Git is used HERE, never in the product module, and
 *     it is used as a PURE FUNCTION OVER BYTES THIS TEST HANDS IT — never as a
 *     source of state.
 *
 * WHY THE ENVIRONMENT IS BUILT AND NOT SANITIZED. Git's binary and diff answers
 * are steerable through configuration, and this program's record at ENUMERATING
 * those channels is 0 for 4: the self-hiding `.gitignore`, the fake `.git`
 * marker, `diff.external`, and then two more that survived the ruled switch list
 * (a `git/attributes` file under `XDG_CONFIG_HOME`, and
 * `GIT_CONFIG_COUNT`/`core.attributesFile`). A fifth blocklist would be a fifth
 * guess. So the child's environment is BUILT FROM NOTHING, its config and
 * attribute roots point at directories this run created empty, and git is
 * invoked as a verified absolute realpath. A constructed thing's contents are
 * known by construction, so channels nobody enumerated are closed without being
 * named.
 *
 * That guarantee decomposes into THREE constructed things — the environment, the
 * roots, and the executable — and the third is weaker than the other two.
 * Resolving from FIXED locations (see `WELL_KNOWN_GIT`) is what prevents PATH
 * SELECTION of an impostor; an earlier version merely FILTERED a PATH hit, which
 * a review round showed is not the same thing. Even so, nothing here constructs
 * or freezes the executable's BYTES, and a PATH fallback re-opens selection
 * where no fixed location verifies. The claim made here is exactly that much,
 * no more, and `gitProvenance` is asserted so the weaker case cannot pass
 * unremarked.
 *
 * `hostile-environment control` below is the PROOF rather than the claim: each
 * armed channel is shown RED without its construction and GREEN with it. A
 * control that is green either way proves nothing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { captureBaseline, computeDelta, INCLUDE_ALL } = require('../../src/core/dream/delta');
const { WienerdogError } = require('../../src/core/errors');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DELTA_PATH = path.join(REPO_ROOT, 'src', 'core', 'dream', 'delta.js');
const VALIDATE_PATH = path.join(REPO_ROOT, 'src', 'core', 'dream', 'validate.js');

const POSIX = process.platform !== 'win32';
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
/** A mode-000 guard does nothing for root, so those cases are skipped there. */
const PERM_SKIP = !POSIX ? 'POSIX only' : IS_ROOT ? 'root ignores mode bits' : false;
const NOFOLLOW_SKIP = !POSIX
  ? 'POSIX only'
  : !fs.constants.O_NOFOLLOW
    ? 'platform does not supply O_NOFOLLOW'
    : false;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const EMPTY = Buffer.alloc(0);
/** @param {string} s @returns {Buffer} */
const B = (s) => Buffer.from(s, 'utf8');

/** @param {string} name @returns {string} a fresh temp directory */
function tmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `wd-delta-${name}-`));
}

/** @param {string} root @param {string} rel @param {Buffer} bytes @returns {string} abs path */
function put(root, rel, bytes) {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, bytes);
  return abs;
}

/** @param {{records: any[]}} delta @returns {Map<string, any>} */
function byRel(delta) {
  return new Map(delta.records.map((r) => [r.rel, r]));
}

/**
 * The consumer's line split, mirroring Table B: a record keeps its own trailing
 * LF, a trailing newline creates no final empty line, and a CR is content.
 * @param {Buffer} buf @returns {Buffer[]}
 */
function lineRecords(buf) {
  /** @type {Buffer[]} */
  const out = [];
  let start = 0;
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0x0a) {
      out.push(buf.subarray(start, i + 1));
      start = i + 1;
    }
  }
  if (start < buf.length) out.push(buf.subarray(start));
  return out;
}

/**
 * THE CONSUMER'S ONE-LINE DERIVATION, per Table B: the scan text is
 * `afterBytes`' lines at `addedLineNumbers`, joined with LF. It is deliberately
 * not a field of the record, and it is derived here as BYTES — never via a
 * string — because that is what the byte-identity obligation compares.
 * @param {{afterBytes: Buffer|null, addedLineNumbers: number[]}} record
 * @returns {Buffer}
 */
function derivedScanText(record) {
  if (record.afterBytes === null) return EMPTY;
  const recs = lineRecords(record.afterBytes);
  /** @type {Buffer[]} */
  const parts = [];
  record.addedLineNumbers.forEach((n, i) => {
    if (i) parts.push(Buffer.from([0x0a]));
    const line = recs[n - 1];
    assert.ok(line !== undefined, `addedLineNumbers points at line ${n}, which afterBytes does not have`);
    // Strip the record's own terminator: git's `+` lines carry none.
    parts.push(line[line.length - 1] === 0x0a ? line.subarray(0, line.length - 1) : line);
  });
  return Buffer.concat(parts);
}

/**
 * Drive the module over one before/after pair and return its single record.
 * @param {Buffer|null} before @param {Buffer|null} after @returns {any}
 */
function moduleRecord(before, after) {
  const root = tmp('pair');
  const abs = path.join(root, 'f.dat');
  if (before !== null) fs.writeFileSync(abs, before);
  const baseline = captureBaseline(root);
  if (after === null) {
    if (before !== null) fs.rmSync(abs);
  } else {
    fs.writeFileSync(abs, after);
  }
  const { records } = computeDelta(root, baseline);
  assert.equal(records.length, 1, 'a corpus member must produce exactly one record');
  return records[0];
}

// ===========================================================================
// PART 1 — the module's own contract (Tables A and B)
// ===========================================================================

test('dream-delta: a round trip over an unchanged directory produces zero records, and every capture of the same state is identical', () => {
  const root = tmp('unchanged');
  put(root, 'a.txt', B('alpha\n'));
  put(root, 'nested/deep/b.txt', B('beta\n'));
  put(root, 'nested/c.txt', B('gamma\n'));

  const first = captureBaseline(root);
  const second = captureBaseline(root);

  assert.deepEqual([...first.files.keys()], ['a.txt', 'nested/c.txt', 'nested/deep/b.txt']);
  assert.deepEqual([...second.files.keys()], [...first.files.keys()], 'capture order must be deterministic');
  for (const [rel, bytes] of first.files) {
    assert.ok(bytes.equals(second.files.get(rel)), `${rel} must capture identical bytes`);
  }
  assert.deepEqual(first.anomalies, []);
  assert.equal(first.include, INCLUDE_ALL, 'an unfiltered capture carries the everything sentinel');

  assert.deepEqual(computeDelta(root, first).records, []);
});

test('dream-delta: status, baselineBytes and afterBytes follow Table B, including a file that becomes empty and one that starts empty', () => {
  const root = tmp('statuses');
  put(root, 'keep.txt', B('unchanged\n'));
  put(root, 'change.txt', B('before\n'));
  put(root, 'drop.txt', B('doomed\n'));
  put(root, 'becomes-empty.txt', B('has content\n'));
  put(root, 'starts-empty.txt', EMPTY);

  const baseline = captureBaseline(root);

  put(root, 'change.txt', B('after\n'));
  fs.rmSync(path.join(root, 'drop.txt'));
  put(root, 'becomes-empty.txt', EMPTY);
  put(root, 'starts-empty.txt', B('now has content\n'));
  put(root, 'appeared.txt', B('brand new\n'));

  const records = byRel(computeDelta(root, baseline));
  assert.ok(!records.has('keep.txt'), 'unchanged bytes produce NO record');
  assert.deepEqual([...records.keys()].sort(), [
    'appeared.txt',
    'becomes-empty.txt',
    'change.txt',
    'drop.txt',
    'starts-empty.txt',
  ]);

  const added = records.get('appeared.txt');
  assert.equal(added.status, 'added');
  assert.equal(added.baselineBytes, null, 'baselineBytes is null iff status is added');
  assert.ok(added.afterBytes.equals(B('brand new\n')));
  assert.deepEqual(added.addedLineNumbers, [1], 'every line, when added and not binary');

  const modified = records.get('change.txt');
  assert.equal(modified.status, 'modified');
  assert.ok(modified.baselineBytes.equals(B('before\n')));
  assert.ok(modified.afterBytes.equals(B('after\n')));

  const deleted = records.get('drop.txt');
  assert.equal(deleted.status, 'deleted');
  assert.ok(deleted.baselineBytes.equals(B('doomed\n')));
  assert.equal(deleted.afterBytes, null, 'afterBytes is null iff status is deleted');
  assert.deepEqual(deleted.addedLineNumbers, [], 'a deletion adds no lines');

  const emptied = records.get('becomes-empty.txt');
  assert.equal(emptied.status, 'modified');
  assert.equal(emptied.afterBytes.length, 0, 'an emptied file is modified, not deleted');
  assert.deepEqual(emptied.addedLineNumbers, []);

  const filled = records.get('starts-empty.txt');
  assert.equal(filled.status, 'modified');
  assert.equal(filled.baselineBytes.length, 0);
  assert.deepEqual(filled.addedLineNumbers, [1]);
});

test('dream-delta: records are sorted by rel byte-wise ascending, on a set whose insertion order differs from its sorted order', () => {
  const root = tmp('sorted');
  // Deliberately created in an order that is neither sorted nor reverse-sorted.
  for (const rel of ['zulu.txt', 'mike/2.txt', 'alpha.txt', 'Bravo.txt', 'mike/1.txt']) {
    put(root, rel, B(`${rel}\n`));
  }
  // An empty baseline: everything under `root` is therefore `added`.
  const { records } = computeDelta(root, { files: new Map(), anomalies: [], include: INCLUDE_ALL });
  const rels = records.map((r) => r.rel);
  assert.deepEqual(rels, ['Bravo.txt', 'alpha.txt', 'mike/1.txt', 'mike/2.txt', 'zulu.txt']);
  const resorted = [...rels].sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
  assert.deepEqual(rels, resorted);
});

test('dream-delta: ordering is BYTE-wise, not the UTF-16 order a bare JavaScript string compare gives', () => {
  // U+FF5E encodes as ef bd 9e and U+1F600 as f0 9f 98 80, so UTF-8 puts the
  // tilde first. In UTF-16 the emoji's lead surrogate (D83D) sorts BEFORE FF5E,
  // so a `<` comparison would put the emoji first. The two orders disagree, which
  // is what makes this a real discriminator rather than decoration.
  const tilde = '～.txt';
  const emoji = '\u{1F600}.txt';
  assert.ok(emoji < tilde, 'precondition: JavaScript string order puts the emoji first');

  const root = tmp('byteorder');
  try {
    put(root, emoji, B('emoji\n'));
    put(root, tilde, B('tilde\n'));
  } catch {
    return; // a filesystem that refuses these names cannot exercise the point
  }
  const seen = fs.readdirSync(root);
  if (!seen.includes(emoji) || !seen.includes(tilde)) return; // name normalisation; skip

  const { records } = computeDelta(root, { files: new Map(), anomalies: [], include: INCLUDE_ALL });
  assert.deepEqual(
    records.map((r) => r.rel),
    [tilde, emoji],
    'byte-wise order puts U+FF5E before U+1F600, the opposite of the UTF-16 order'
  );
});

test('dream-delta: symlinks are reported as anomalies, are captured nowhere, and their targets bytes never appear', {
  skip: POSIX ? false : 'POSIX only',
}, () => {
  const outside = tmp('outside');
  const secretPath = put(outside, 'secret.txt', B('OUTSIDE-SECRET-BYTES\n'));

  const root = tmp('symlinks');
  put(root, 'real.txt', B('real\n'));
  put(root, 'sub/inner.txt', B('inner\n'));
  fs.symlinkSync(path.join(root, 'real.txt'), path.join(root, 'link-to-file'));
  fs.symlinkSync(path.join(root, 'sub'), path.join(root, 'link-to-dir'));
  fs.symlinkSync(secretPath, path.join(root, 'link-outside'));

  const baseline = captureBaseline(root);

  assert.deepEqual(baseline.anomalies, [
    { rel: 'link-outside', kind: 'symlink' },
    { rel: 'link-to-dir', kind: 'symlink' },
    { rel: 'link-to-file', kind: 'symlink' },
  ]);
  assert.deepEqual(
    [...baseline.files.keys()],
    ['real.txt', 'sub/inner.txt'],
    'a symlink to a directory is surfaced, never recursed into'
  );
  for (const bytes of baseline.files.values()) {
    assert.ok(!bytes.includes(B('OUTSIDE-SECRET-BYTES')), 'a symlink target’s bytes must appear nowhere');
  }

  const delta = computeDelta(root, baseline);
  assert.deepEqual(delta.records, [], 'anomalies produce no records');
  assert.deepEqual(delta.anomalies, baseline.anomalies, 'computeDelta reports the anomalies it sees NOW');
});

test('dream-delta: capture throws WienerdogError on an unreadable root', { skip: PERM_SKIP }, () => {
  const root = tmp('unreadable-root');
  put(root, 'a.txt', B('x\n'));
  fs.chmodSync(root, 0o000);
  try {
    assert.throws(() => captureBaseline(root), (err) => err instanceof WienerdogError && /cannot enumerate/.test(err.message));
  } finally {
    fs.chmodSync(root, 0o700);
  }
});

test('dream-delta: capture throws WienerdogError on an unreadable FILE', { skip: PERM_SKIP }, () => {
  const root = tmp('unreadable-file');
  const abs = put(root, 'locked.txt', B('x\n'));
  fs.chmodSync(abs, 0o000);
  try {
    assert.throws(
      () => captureBaseline(root),
      (err) => err instanceof WienerdogError && /cannot read locked\.txt \(EACCES\)/.test(err.message)
    );
  } finally {
    fs.chmodSync(abs, 0o600);
  }
});

test('dream-delta: capture throws on a NESTED directory that cannot be enumerated, and omits nothing silently', { skip: PERM_SKIP }, () => {
  // The failure this guards is the one the walk idiom in private-fs.js gets
  // wrong: `listNames` swallows a readdir failure and returns [], which would
  // omit every file beneath the locked directory — and each of them would be
  // reported `added` once the directory became readable again.
  const root = tmp('unenumerable-nested');
  put(root, 'top.txt', B('top\n'));
  const locked = path.join(root, 'locked');
  fs.mkdirSync(locked);
  fs.writeFileSync(path.join(locked, 'hidden.txt'), B('pre-existing user content\n'));
  fs.chmodSync(locked, 0o000);
  try {
    assert.throws(
      () => captureBaseline(root),
      (err) => err instanceof WienerdogError && /cannot enumerate locked/.test(err.message),
      'there is no partial baseline'
    );
  } finally {
    fs.chmodSync(locked, 0o700);
  }
  // Proof the file was never merely "skipped": once readable, it is captured —
  // so had capture returned a partial baseline, this file would have surfaced as
  // `added` and been attributed to whoever wrote next.
  const baseline = captureBaseline(root);
  assert.ok(baseline.files.has('locked/hidden.txt'));
});

test('dream-delta: scope survives the round trip and computeDelta takes no filter of its own', () => {
  const root = tmp('scope');
  put(root, 'keep.txt', B('kept\n'));
  put(root, 'old.skip', B('pre-existing excluded content\n'));

  const include = (rel) => !rel.endsWith('.skip');
  const baseline = captureBaseline(root, include);
  assert.deepEqual([...baseline.files.keys()], ['keep.txt']);
  assert.equal(baseline.include, include, 'the predicate travels WITH the baseline');

  put(root, 'new.skip', B('newly created excluded\n'));
  put(root, 'new.txt', B('newly created included\n'));

  const { records } = computeDelta(root, baseline);
  assert.deepEqual(
    records.map((r) => [r.rel, r.status]),
    [['new.txt', 'added']],
    'a pre-existing excluded file is NEVER reported added; a newly created excluded file produces no record'
  );

  assert.equal(computeDelta.length, 2, 'computeDelta accepts (rootDir, baseline) only — no second filter to mismatch');
});

test('dream-delta: a stateful include — one function object answering differently on the two walks — produces the false attribution the caller invariant names', () => {
  // PINNED, not endorsed. Table A names `include`'s purity as a caller
  // invariant precisely because carrying the predicate on the baseline cannot
  // enforce it: the same function object can read mutable closure state.
  const root = tmp('stateful-include');
  put(root, 'excluded.txt', B('pre-existing user content\n'));
  put(root, 'kept.txt', B('kept\n'));

  let phase = 'capture';
  const include = (rel) => (rel === 'excluded.txt' ? phase !== 'capture' : true);

  const baseline = captureBaseline(root, include);
  assert.deepEqual([...baseline.files.keys()], ['kept.txt']);

  phase = 'delta';
  const { records } = computeDelta(root, baseline);
  assert.deepEqual(
    records.map((r) => [r.rel, r.status]),
    [['excluded.txt', 'added']],
    'an impure include makes a pre-existing file look added — the caller owns this, and here is what it costs'
  );
});

test('dream-delta: mutating the returned baseline between capture and delta produces the behaviour the caller invariant names', () => {
  const root = tmp('mutated-baseline');
  put(root, 'f.txt', B('on disk\n'));
  const baseline = captureBaseline(root);

  // The representation CANNOT enforce immutability, measured both ways:
  assert.throws(
    () => Object.freeze(baseline.files.get('f.txt')),
    (err) => err instanceof TypeError && /freeze array buffer views/.test(err.message),
    'Object.freeze THROWS on a non-empty Buffer, so the bytes stay writable'
  );
  Object.freeze(baseline.files);
  baseline.files.set('ghost.txt', B('never existed on disk\n'));
  assert.ok(baseline.files.has('ghost.txt'), 'a frozen Map still accepts set');

  baseline.files.get('f.txt')[0] = 0x58; // 'X'

  const records = byRel(computeDelta(root, baseline));
  // PINNED: the delta now describes the caller's edit, not the disk. This is the
  // false attribution the module exists to prevent, arriving WITHOUT any
  // filesystem race — which is exactly why the invariant is named.
  assert.equal(records.get('f.txt').status, 'modified', 'the file on disk never changed');
  assert.equal(records.get('ghost.txt').status, 'deleted', 'a file that never existed is reported deleted');
});

// --- Accuracy mechanisms: classification and read bound to ONE opened object ---
//
// The seam used below is `include` itself. The walk classifies an entry with
// `lstat`, then calls `include`, then opens and reads — so a test's predicate
// runs inside the classify/read gap. That is the only injection point the
// documented two-parameter surface offers, and using it keeps this module free
// of a test-only parameter.

test('dream-delta: a path whose (dev, ino) no longer matches the pair captured at enumeration yields a throw, not bytes', () => {
  const root = tmp('devino');
  const abs = put(root, 'f.txt', B('original\n'));
  const originalIno = fs.lstatSync(abs).ino;

  let swapped = false;
  const include = (rel) => {
    if (rel === 'f.txt' && !swapped) {
      swapped = true;
      // rename() over the entry repoints it at a DIFFERENT inode deterministically
      // (unlike unlink+create, which a filesystem is free to satisfy by reuse).
      const impostor = path.join(root, '.impostor');
      fs.writeFileSync(impostor, B('impostor\n'));
      fs.renameSync(impostor, abs);
      assert.notEqual(fs.lstatSync(abs).ino, originalIno, 'precondition: the swap must change the inode');
    }
    return true;
  };

  assert.throws(
    () => captureBaseline(root, include),
    (err) => err instanceof WienerdogError && /f\.txt changed identity between enumeration and read/.test(err.message)
  );
});

test('dream-delta: O_NOFOLLOW refuses a SAME-INODE final-component symlink substituted into the classify/read gap', { skip: NOFOLLOW_SKIP }, () => {
  // THE DISCRIMINATOR. The (dev, ino) comparison cannot catch this: the symlink
  // points at the very inode the walk classified, so the identity check passes.
  // Measured — with the flag the open fails ELOOP; without it the open succeeds,
  // fstat reports a regular file, (dev, ino) matches and the bytes are read. So
  // an implementation that silently dropped the flag would pass every other
  // criterion and fail only here.
  const root = tmp('nofollow');
  const abs = put(root, 'f.txt', B('followed content\n'));
  const originalStat = fs.lstatSync(abs);
  // Its own scoped directory, NOT the shared temp root: run directly (rather
  // than through tests/with-temp-root.js) this file would otherwise leak it.
  const relocated = path.join(tmp('nofollow-relocated'), 'relocated.txt');

  let swapped = false;
  const include = (rel) => {
    if (rel === 'f.txt' && !swapped) {
      swapped = true;
      fs.renameSync(abs, relocated);
      fs.symlinkSync(relocated, abs);
      const moved = fs.lstatSync(relocated);
      assert.equal(moved.ino, originalStat.ino, 'precondition: the relocation must preserve the inode');
      assert.equal(moved.dev, originalStat.dev);
    }
    return true;
  };

  assert.throws(
    () => captureBaseline(root, include),
    (err) => err instanceof WienerdogError && /cannot read f\.txt \(ELOOP\)/.test(err.message),
    'the open must fail rather than yield a descriptor'
  );
});

test('dream-delta: a regular file replaced by a FIFO between classification and open completes in BOUNDED time with a throw, never a hang', {
  skip: POSIX ? false : 'POSIX only',
}, () => {
  const mkfifo = spawnSync('mkfifo', ['--version']);
  if (mkfifo.error) return; // no mkfifo on this box; nothing to exercise

  // Run in a CHILD so that a regression is loud and bounded instead of wedging
  // the whole suite. The assertion is the POSITIVE outcome — a specific throw —
  // and `signal === null` proves the child ended on its own rather than being
  // killed, which is what "a test whose timeout is the only thing that ends the
  // run does not satisfy this" rules out.
  const dir = tmp('fifo');
  const script = path.join(dir, 'probe.js');
  fs.writeFileSync(
    script,
    `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { captureBaseline } = require(${JSON.stringify(DELTA_PATH)});
const root = ${JSON.stringify(dir)};
const abs = path.join(root, 'f.txt');
fs.writeFileSync(abs, 'regular content\\n');
let swapped = false;
const include = (rel) => {
  if (rel === 'f.txt' && !swapped) {
    swapped = true;
    fs.rmSync(abs);
    const r = spawnSync('mkfifo', [abs]);
    if (r.status !== 0) { process.stdout.write('MKFIFO-FAILED'); process.exit(0); }
  }
  return true;
};
const started = Date.now();
try {
  captureBaseline(root, include);
  process.stdout.write('NO-THROW');
} catch (err) {
  process.stdout.write('THREW:' + err.name + ':' + err.message + ':' + (Date.now() - started));
}
`
  );

  const started = Date.now();
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 20000 });
  const elapsed = Date.now() - started;

  assert.equal(run.signal, null, `the child must end on its own, not be killed (stdout: ${run.stdout})`);
  assert.equal(run.status, 0, run.stderr);
  if (run.stdout === 'MKFIFO-FAILED') return;
  assert.match(
    run.stdout,
    /^THREW:WienerdogError:dream delta: f\.txt was a regular file when enumerated and is not one when opened \(kind: fifo\):\d+$/,
    `expected a bounded refusal, got: ${run.stdout}`
  );
  assert.ok(elapsed < 15000, `the probe took ${elapsed}ms; a blocking open would never have returned at all`);
});

test('dream-delta: src/core/dream/delta.js neither requires Node’s process-spawning module nor spawns any process', () => {
  const src = fs.readFileSync(DELTA_PATH, 'utf8');
  // Stronger than the shell gate in the spec: enumerate EVERY require and pin
  // the whole set, so a new dependency of any kind has to be argued for rather
  // than merely avoid three blocklisted spellings.
  const required = [...src.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(required, ['../errors', 'node:fs', 'node:path']);
  for (const forbidden of ['child_process', 'spawnSync', 'execFile', 'execSync', 'process.binding']) {
    assert.ok(!src.includes(forbidden), `delta.js must not contain ${forbidden}, not even in a comment`);
  }
});

// ===========================================================================
// PART 2 — the reference judgment (Table C)
// ===========================================================================

/**
 * Verify a realpath is a safe executable to spawn, with the checks
 * `src/core/exec-identity.js`'s `verifyExecutable` applies to this project's
 * product git calls. Reimplemented here rather than imported because that
 * module exports only `spawnPinnedSync`/`spawnPinned` (and those want a pins
 * file and a paths object, which a unit test has no business building) — and
 * this package may not add an export to an existing file.
 *
 * The checks that matter, and why each one is not decoration: a regular file
 * with an execute bit; owned by the current user or by root; and NO ancestor
 * directory up to `/` that is group- or other-writable unless root owns it.
 * The last is the one that catches a real scenario — a `git` planted in a
 * world-writable directory that happens to sit early on PATH.
 * @param {string} realpath @returns {{ok: true} | {ok: false, why: string}}
 */
function verifySpawnable(realpath) {
  let st;
  try {
    st = fs.statSync(realpath);
  } catch (err) {
    return { ok: false, why: `cannot stat ${realpath}: ${err.message}` };
  }
  if (!st.isFile()) return { ok: false, why: `${realpath} is not a regular file` };
  if (process.platform === 'win32') return { ok: true }; // no POSIX mode/owner semantics
  if ((st.mode & 0o111) === 0) return { ok: false, why: `${realpath} has no execute bit` };
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  if (st.uid !== uid && st.uid !== 0) {
    return { ok: false, why: `${realpath} is owned by uid ${st.uid}, not ${uid} or root` };
  }
  for (let dir = path.dirname(realpath); ; ) {
    let ds;
    try {
      ds = fs.statSync(dir);
    } catch (err) {
      return { ok: false, why: `cannot stat ancestor ${dir}: ${err.message}` };
    }
    if ((ds.mode & 0o022) !== 0 && ds.uid !== 0) {
      return { ok: false, why: `ancestor ${dir} is group/other-writable and not root-owned` };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { ok: true };
}

/**
 * Well-known absolute locations for git, tried IN THIS ORDER before the
 * inherited PATH is consulted at all. This is the difference between filtering
 * a PATH hit and not letting PATH choose: a round-2 review placed a shim in a
 * user-owned mode-0700 directory ahead of `/usr/bin`, and it passed every
 * structural check while taking all 502 oracle invocations. Structural
 * verification says a candidate is ACCEPTABLE; it never says it is the INTENDED
 * installation, and the two were being conflated.
 *
 * These are fixed paths, so PATH ORDER cannot steer the choice — which is
 * exactly the channel Table C names. It is NOT a claim that the binary sitting
 * at a well-known path is genuine git: nothing test-side can establish that, and
 * the spec already bounds the executable leg the same way.
 */
const WELL_KNOWN_GIT =
  process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Program Files\\Git\\bin\\git.exe']
    : ['/usr/bin/git', '/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'];

/**
 * Resolve `git` to a VERIFIED ABSOLUTE REALPATH, once, and report HOW it was
 * found. Every invocation below uses that path; the NAME `git` is never handed
 * to a spawn except in the hostile-PATH control, where being fooled is the point.
 *
 * Two stages, and the order is the whole point:
 *  1. the fixed locations above, so PATH ORDER cannot select the oracle;
 *  2. only if none of them verifies, a PATH scan — recorded as such, never
 *     silently substituted, because a PATH-resolved oracle is a weaker oracle
 *     and a reader is entitled to know which one ran.
 *
 * THE RESIDUAL, BOUNDED HONESTLY. This closes PATH SELECTION *where stage 1
 * succeeds*, and the returned provenance says whether it did. It does not
 * establish executable IDENTITY: a rewritten binary at a well-known path is
 * accepted, exactly as the spec says of its own cited precedent. And where stage
 * 2 is reached, PATH selection is back — which is why stage 2 is reported rather
 * than treated as equivalent.
 * @returns {{path: string, provenance: 'well-known'|'path-fallback'|'none',
 *            rejected: string[]}}
 */
function resolveVerifiedGit() {
  /** @type {string[]} */
  const rejected = [];
  for (const candidate of WELL_KNOWN_GIT) {
    let st;
    try {
      st = fs.statSync(candidate);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const real = fs.realpathSync(candidate);
    const verdict = verifySpawnable(real);
    if (!verdict.ok) {
      rejected.push(`well-known ${candidate}: ${verdict.why}`);
      continue;
    }
    return { path: real, provenance: 'well-known', rejected };
  }

  const exts = process.platform === 'win32' ? ['.exe', '.cmd'] : [''];
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, `git${ext}`);
      let st;
      try {
        st = fs.statSync(candidate);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      if (process.platform !== 'win32' && (st.mode & 0o111) === 0) continue;
      const real = fs.realpathSync(candidate);
      const verdict = verifySpawnable(real);
      if (!verdict.ok) {
        rejected.push(`PATH ${candidate}: ${verdict.why}`);
        continue;
      }
      return { path: real, provenance: 'path-fallback', rejected };
    }
  }
  return { path: '', provenance: 'none', rejected };
}

/** Resolution provenance, kept module-level so a test can assert it rather than
 *  letting a weaker oracle pass unremarked. */
let gitProvenance = null;

/** @type {{git:string, env:Record<string,string>, cwd:string, hostileXdg:string, hostileAttrFile:string, forgedDir:string}|null} */
let REF = null;

/** Build the constructed environment, roots, neutral CWD and hostile fixtures once. */
function ref() {
  if (REF) return REF;

  const resolved = resolveVerifiedGit();
  const git = resolved.path;
  gitProvenance = resolved;
  // Deliberately a FAILURE, not a skip: git is already a hard dependency of this
  // project (src/core/dream/validate.js spawns it), and a silently skipped
  // differential is the one outcome this obligation cannot tolerate. Any
  // rejected candidate is named in the failure so a verification refusal never
  // looks like an absent binary. A rejection on the SUCCESS path is not covered
  // here — it is asserted by the provenance test at the end of this file,
  // because a fallback that quietly absorbs a rejection normalises a
  // contaminated PATH, which is the opposite of reporting it.
  assert.ok(
    git,
    `git must resolve to a VERIFIED absolute executable to run the differential${
      resolved.rejected.length ? ` (rejected: ${resolved.rejected.join('; ')})` : ''
    }`
  );
  const version = spawnSync(git, ['--version'], { encoding: 'utf8' });
  assert.match(String(version.stdout), /^git version /, 'the resolved executable must answer as git');

  // THREE CONSTRUCTED THINGS. Each root is a directory this run created EMPTY,
  // so its contents are known by construction rather than by enumeration.
  const home = tmp('ref-home');
  const xdg = tmp('ref-xdg');
  const pathDir = tmp('ref-path');
  const cwd = tmp('ref-cwd');
  const emptyConfig = path.join(home, 'constructed-empty-config');
  fs.writeFileSync(emptyConfig, EMPTY); // a created empty file, not /dev/null: portable

  // The neutral CWD is asserted, not assumed. A CWD inside a repository applies
  // that repository's .gitattributes even to operands that live OUTSIDE it, so
  // `--no-index` alone does not isolate.
  for (let dir = cwd; ; ) {
    assert.ok(!fs.existsSync(path.join(dir, '.git')), `${dir} must not be inside a repository`);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  /** @type {Record<string,string>} */
  const env = {
    // BUILT FROM NOTHING: nothing is inherited, so GIT_CONFIG_COUNT and friends
    // cannot arrive even though this list never names them.
    PATH: pathDir,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
    // The ruled switch list stays as the RECIPE; the construction above is the
    // guarantee. Keeping both costs nothing.
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_ATTR_NOSYSTEM: '1',
  };
  if (process.platform === 'win32' && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;

  // Hostile fixtures for the control below.
  const hostileXdg = tmp('hostile-xdg');
  fs.mkdirSync(path.join(hostileXdg, 'git'));
  fs.writeFileSync(path.join(hostileXdg, 'git', 'attributes'), B('* binary\n'));
  const hostileAttrDir = tmp('hostile-attr');
  const hostileAttrFile = path.join(hostileAttrDir, 'attributes');
  fs.writeFileSync(hostileAttrFile, B('* binary\n'));
  const forgedDir = tmp('forged-path');
  const forged = path.join(forgedDir, 'git');
  fs.writeFileSync(forged, "#!/bin/sh\nprintf -- '-\\t-\\tforged\\n'\n");
  fs.chmodSync(forged, 0o755);

  REF = { git, env, cwd, hostileXdg, hostileAttrFile, forgedDir };
  return REF;
}

/**
 * Byte-level equivalent of the validator's `+`-line join
 * (src/core/dream/validate.js). Done on BYTES on purpose: the production helper
 * decodes git's output as `utf8`, and a regular file containing invalid UTF-8
 * and no NUL is TEXT to git — so a comparison that round-trips through a string
 * can claim byte identity while having silently replaced 0xff with U+FFFD.
 * @param {Buffer} diffBytes @returns {Buffer}
 */
function plusLineJoinBytes(diffBytes) {
  /** @type {Buffer[]} */
  const lines = [];
  let start = 0;
  for (let i = 0; i <= diffBytes.length; i += 1) {
    if (i === diffBytes.length || diffBytes[i] === 0x0a) {
      lines.push(diffBytes.subarray(start, i));
      start = i + 1;
    }
  }
  const PLUS = 0x2b;
  const kept = lines.filter(
    (l) => l.length > 0 && l[0] === PLUS && !(l.length >= 3 && l[1] === PLUS && l[2] === PLUS)
  );
  /** @type {Buffer[]} */
  const parts = [];
  kept.forEach((l, i) => {
    if (i) parts.push(Buffer.from([0x0a]));
    parts.push(l.subarray(1));
  });
  return Buffer.concat(parts);
}

/**
 * Load TODAY'S `addedLineNumbersFromDiff` out of validate.js WITHOUT modifying
 * that file (this package touches no existing file). The obligation names that
 * exact function, and the function is not exported — so the choice is between
 * comparing against the real thing and comparing against a copy that can drift.
 * The function is self-contained (no closures, no requires), which is asserted
 * here rather than assumed, and the extraction is proved on a known input.
 * @returns {(diff: string) => number[]}
 */
function loadAddedLineNumbersFromDiff() {
  const src = fs.readFileSync(VALIDATE_PATH, 'utf8');
  const marker = 'function addedLineNumbersFromDiff(';
  const start = src.indexOf(marker);
  assert.ok(start !== -1, 'validate.js no longer declares addedLineNumbersFromDiff; the obligation needs re-pointing');
  const end = src.indexOf('\n}\n', start);
  assert.ok(end !== -1, 'could not find the end of addedLineNumbersFromDiff');
  const source = src.slice(start, end + 3);
  assert.ok(!source.includes('require('), 'the extracted function must be self-contained');
  const fn = new Function(`${source}\nreturn addedLineNumbersFromDiff;`)();
  assert.deepEqual(fn('@@ -2,0 +3,2 @@ b\n'), [3, 4], 'extraction self-check');
  assert.deepEqual(fn('@@ -1 +1 @@\n'), [1], 'extraction self-check');
  return fn;
}

const addedLineNumbersFromDiff = loadAddedLineNumbersFromDiff();

/**
 * THE REFERENCE JUDGMENT. Git as a pure function over two byte strings: outside
 * any repository, in a constructed environment with constructed roots, as a
 * verified absolute executable, with `--no-ext-diff`, over two plain files via
 * `--no-index`.
 * @param {Buffer|null} before @param {Buffer|null} after
 * @param {{env?: Record<string,string>, command?: string}} [opts] control arms only
 */
function referenceJudgment(before, after, opts = {}) {
  const r = ref();
  const dir = fs.mkdtempSync(path.join(r.cwd, 'pair-'));
  const a = path.join(dir, 'A');
  const b = path.join(dir, 'B');
  fs.writeFileSync(a, before === null ? EMPTY : before);
  fs.writeFileSync(b, after === null ? EMPTY : after);

  const env = { ...r.env, ...(opts.env || {}) };
  const command = opts.command || r.git;
  const spawn = (args) => spawnSync(command, ['diff', '--no-index', '--no-ext-diff', ...args, '--', a, b], { env, cwd: r.cwd });

  const numstat = spawn(['--numstat', '-z']);
  // THE ORACLE MUST HAVE RUN. `binary` is computed from stdout, and a git that
  // never executed yields empty stdout — which reads as `false`, identical to a
  // healthy "this is text". Measured: a broken executable gives status=null,
  // ENOENT, empty stdout, binary=false. Without this guard every GREEN arm of
  // the hostile-environment control below would pass on a dead oracle, which is
  // the same class of defect as a verification gate that cannot go red.
  // `--no-index` exits 0 when the operands match and 1 when they differ;
  // anything else — including the forged-PATH arm's own exit code — is checked
  // by the caller that armed it, so only the unforged path is asserted here.
  if (!opts.command || opts.command === r.git) {
    assert.ok(
      numstat.status === 0 || numstat.status === 1,
      `the reference judgment must actually run git (status=${numstat.status}, ` +
        `error=${numstat.error ? numstat.error.code : 'none'})`
    );
  }
  // `--numstat -z` is the production shape, and `/^-\t-\t/` is the production
  // test (src/core/dream/validate.js). Kept identical so the differential
  // measures the same signal the validator reads today.
  const binary = /^-\t-\t/.test(numstat.stdout.toString('utf8'));

  const diff = spawn(['-U0']);
  // THE SECOND SPAWN NEEDS THE SAME GUARD, and it did not have one. Measured by
  // the round-2 gate with a proxy that delegated `--numstat` to real git and
  // exited 2 for `-U0`: the failed process's empty stdout reads as "no added
  // lines, no added bytes", which is indistinguishable from the honest answer
  // for the `deleted` and `becomes empty` corpus members — so those members
  // would have passed vacuously. Guarding one of two spawns is guarding neither.
  if (!opts.command || opts.command === r.git) {
    assert.ok(
      diff.status === 0 || diff.status === 1,
      `the reference -U0 diff must actually run git (status=${diff.status}, ` +
        `error=${diff.error ? diff.error.code : 'none'})`
    );
  }
  return {
    binary,
    // Decoding for the HUNK HEADER parse only, and safe: 0x0a never occurs
    // inside a multi-byte UTF-8 sequence, so line boundaries survive a lossy
    // decode, and the headers themselves are ASCII. The `+` CONTENT is taken
    // from the raw bytes just below, never from this string.
    addedLineNumbers: addedLineNumbersFromDiff(diff.stdout.toString('utf8')),
    addedTextBytes: plusLineJoinBytes(diff.stdout),
  };
}

test('dream-delta: hostile-environment control: each armed channel moves the judgment WITHOUT its construction and cannot WITH it', () => {
  const r = ref();
  const before = B('plain ascii\n');
  const after = B('plain ascii, edited\n');

  // Baseline: fully constructed, nothing armed. Plain ASCII is text.
  assert.equal(referenceJudgment(before, after).binary, false, 'GREEN baseline');

  // ARM 1 — a git/attributes file under XDG_CONFIG_HOME.
  assert.equal(
    referenceJudgment(before, after, { env: { XDG_CONFIG_HOME: r.hostileXdg } }).binary,
    true,
    'RED: without the constructed XDG root, attributes flip plain ASCII to binary'
  );

  // ARM 2 — GIT_CONFIG_COUNT / core.attributesFile. Note this survives
  // GIT_CONFIG_NOSYSTEM and GIT_CONFIG_GLOBAL: only NOT INHERITING it closes it.
  const injected = {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.attributesFile',
    GIT_CONFIG_VALUE_0: r.hostileAttrFile,
  };
  assert.equal(
    referenceJudgment(before, after, { env: injected }).binary,
    true,
    'RED: the ruled switches do not close this channel; construction does'
  );

  // ARM 3 — a forged executable named `git` first on PATH. This is the channel
  // that survived the other two constructions, and it is NOT optional: neither
  // an empty environment nor an empty config root can reach it.
  if (POSIX) {
    assert.equal(
      referenceJudgment(before, after, { command: 'git', env: { PATH: r.forgedDir } }).binary,
      true,
      'RED: resolving the NAME git through a hostile PATH returns a forged verdict'
    );
    assert.equal(
      referenceJudgment(before, after, { command: r.git, env: { PATH: r.forgedDir } }).binary,
      false,
      'GREEN: the verified absolute path is immune to PATH SELECTION — the hostile PATH is still armed here'
    );
  }

  // All three armed at once, full construction applied: still text.
  assert.equal(referenceJudgment(before, after).binary, false, 'GREEN with every construction in place');
});

test('dream-delta: the boundary fixtures locate git’s prefix window BY SEARCH and the module agrees on both sides of it', () => {
  const SIZE = 20000;
  /** @param {number} n @returns {Buffer} all-ASCII except a single NUL at byte n */
  const fixture = (n) => {
    const buf = Buffer.alloc(SIZE, 0x61);
    buf[n] = 0;
    return buf;
  };
  const refBinaryAt = (n) => referenceJudgment(null, fixture(n)).binary;

  // Bounded search — the window is NOT hardcoded here, so this test follows git
  // if git moves the boundary. A single far-beyond fixture would be
  // insufficient: it passes an implementation using any shorter cutoff.
  let lastBinary = 0;
  let firstText = 16000;
  assert.equal(refBinaryAt(lastBinary), true, 'precondition: a NUL at byte 0 is binary');
  assert.equal(refBinaryAt(firstText), false, 'precondition: a NUL at byte 16000 is text');
  while (firstText - lastBinary > 1) {
    const mid = Math.floor((lastBinary + firstText) / 2);
    if (refBinaryAt(mid)) lastBinary = mid;
    else firstText = mid;
  }
  assert.equal(firstText, lastBinary + 1, 'the search must land on adjacent offsets');

  assert.equal(moduleRecord(null, fixture(lastBinary)).binary, true, 'a shorter cutoff than git’s fails here');
  assert.equal(moduleRecord(null, fixture(firstText)).binary, false, 'a longer cutoff than git’s fails here');
});

/**
 * THE CORPUS. Built and judged by the test; the module is never given git.
 * @type {Array<{name: string, before: Buffer|null, after: Buffer|null}>}
 */
const CORPUS = [
  { name: 'added', before: null, after: B('hello\nworld\n') },
  { name: 'deleted', before: B('goodbye\n'), after: null },
  { name: 'modified, whole file rewritten', before: B('one\ntwo\n'), after: B('ONE\nTWO\nTHREE\n') },
  { name: 'becomes empty', before: B('had content\n'), after: EMPTY },
  { name: 'empty to content', before: EMPTY, after: B('now has content\n') },
  { name: 'binary after', before: B('text before\n'), after: Buffer.concat([B('bin'), Buffer.from([0]), B('ary\n')]) },
  {
    name: 'binary BEFORE, text after (pairwise)',
    before: Buffer.concat([B('bin'), Buffer.from([0]), B('ary\n')]),
    after: B('plain text now\n'),
  },
  { name: 'binary deletion', before: Buffer.concat([B('bin'), Buffer.from([0]), B('ary\n')]), after: null },
  { name: 'CRLF content', before: B('a\r\nb\r\n'), after: B('a\r\nB\r\n') },
  { name: 'no trailing newline (gains one)', before: B('a\nb'), after: B('a\nb\n') },
  { name: 'no trailing newline (loses one)', before: B('a\nb\n'), after: B('a\nb') },
  { name: 'appended lines only', before: B('a\nb\n'), after: B('a\nb\nc\nd\n') },
  { name: 'interior change only', before: B('a\nb\nc\n'), after: B('a\nZ\nc\n') },
  { name: 'duplicated block (ambiguous placement)', before: B('a\nb\n'), after: B('a\nb\na\nb\n') },
  {
    name: 'invalid UTF-8, no NUL — text to git',
    before: Buffer.from([0xff, 0x0a]),
    after: Buffer.from([0xff, 0xfe, 0x0a]),
  },
];

test('dream-delta: the git-agreement differential over the corpus (Table C)', () => {
  for (const member of CORPUS) {
    const record = moduleRecord(member.before, member.after);
    const judgment = referenceJudgment(member.before, member.after);

    assert.equal(record.binary, judgment.binary, `${member.name}: binary must equal the reference --numstat signal`);

    if (record.binary) {
      assert.deepEqual(record.addedLineNumbers, [], `${member.name}: a binary record carries no line numbers`);
      continue;
    }
    assert.deepEqual(
      record.addedLineNumbers,
      judgment.addedLineNumbers,
      `${member.name}: addedLineNumbers must equal addedLineNumbersFromDiff on the reference -U0 hunk headers`
    );
    const derived = derivedScanText(record);
    assert.ok(
      derived.equals(judgment.addedTextBytes),
      `${member.name}: derived scan text must be BYTE-identical to the reference +-line join ` +
        `(got ${derived.toString('hex')}, want ${judgment.addedTextBytes.toString('hex')})`
    );
  }
});

test('dream-delta: the byte-preserving comparison is not decorative: the invalid-UTF-8 member really does survive a decode differently', () => {
  const member = CORPUS.find((m) => m.name.startsWith('invalid UTF-8'));
  const judgment = referenceJudgment(member.before, member.after);
  assert.equal(judgment.binary, false, 'a non-NUL invalid-UTF-8 file is TEXT to git');
  assert.ok(judgment.addedTextBytes.includes(0xff), 'the raw reference output retains the 0xff byte');
  const roundTripped = Buffer.from(judgment.addedTextBytes.toString('utf8'), 'utf8');
  assert.ok(
    !roundTripped.equals(judgment.addedTextBytes),
    'a utf8 round trip REPLACES the byte — so a helper that decodes could claim byte identity falsely'
  );
});

test('dream-delta: a .gitattributes that WOULD flip the judgment inside a repository does not flip it with no repository in scope', () => {
  const r = ref();
  const content = B('plain ascii, definitely text\n');

  // Module side: the walked directory contains a potent .gitattributes.
  const root = tmp('attrs');
  fs.writeFileSync(path.join(root, '.gitattributes'), B('*.dat binary\n'));
  const baseline = captureBaseline(root);
  fs.writeFileSync(path.join(root, 'f.dat'), content);
  const record = byRel(computeDelta(root, baseline)).get('f.dat');
  assert.equal(record.binary, false, 'the module owns no attribute policy');

  // Reference side: a .gitattributes merely PRESENT in a non-repository
  // directory is ignored.
  assert.equal(referenceJudgment(null, content).binary, false);

  // POTENCY — without this the fixture could be inert and nobody would know.
  const repo = tmp('attrs-repo');
  fs.writeFileSync(path.join(repo, '.gitattributes'), B('*.dat binary\n'));
  fs.writeFileSync(path.join(repo, 'f.dat'), content);
  const inRepo = (args) => spawnSync(r.git, args, { env: r.env, cwd: repo });
  assert.equal(inRepo(['init', '-q', '.']).status, 0);
  assert.equal(inRepo(['add', '-A']).status, 0);
  const staged = inRepo(['diff', '--cached', '--numstat', '-z', '--', 'f.dat']).stdout.toString('utf8');
  assert.match(staged, /^-\t-\t/, 'the SAME attributes file DOES flip the judgment once a repository is in scope');
});

test('dream-delta: the module is NOT a superset of git’s added lines — the counterexample is pinned, not papered over', () => {
  // An earlier version of this package claimed a strict superset and the PR
  // review gate refuted it. The refutation is kept as a test so the claim cannot
  // come back: where duplicate lines admit two equally minimal alignments,
  // neither answer contains the other.
  const before = B('a\na\n');
  const after = B('b\na\na\nb\na\n');

  const record = moduleRecord(before, after);
  const judgment = referenceJudgment(before, after);

  assert.deepEqual(judgment.addedLineNumbers, [1, 4, 5], 'git aligns the two before-lines with after lines 2 and 3');
  assert.deepEqual(record.addedLineNumbers, [1, 2, 3, 4], 'the trim aligns the last before-line with after line 5');
  assert.ok(
    !judgment.addedLineNumbers.every((n) => record.addedLineNumbers.includes(n)),
    'this pair is the live refutation of the superset claim; if it ever starts holding, the claim needs re-deriving, not re-asserting'
  );

  // What IS true, and what the consumer is actually protected by: the omitted
  // line carries no content the baseline did not already have.
  const omitted = judgment.addedLineNumbers.filter((n) => !record.addedLineNumbers.includes(n));
  assert.deepEqual(omitted, [5]);
  const beforeLines = lineRecords(before).map((l) => l.toString('hex'));
  for (const n of omitted) {
    const line = lineRecords(after)[n - 1];
    assert.ok(beforeLines.includes(line.toString('hex')), `omitted line ${n} must carry content the baseline already had`);
  }
});

test('dream-delta: CONTENT SAFETY — exhaustively against git, no line carrying content absent from the baseline is ever omitted', () => {
  // The provable property, verified rather than argued. Alphabet {a, b}, every
  // before and after of 0..3 lines: 225 pairs, each judged by the REFERENCE
  // JUDGMENT and by the module, with the module driven through its public API.
  //
  // Two things are asserted per pair. (1) Every git-added line the module omits
  // carries content the baseline already held — that is the guarantee a secret
  // scan rests on: content the writer introduced is always scanned. (2) The
  // module never omits a line whose content is new.
  //
  // SCOPE: both statements are about SCANNABLE records. A record classified
  // `binary` carries no line numbers at all, by Table B, and the consumer
  // withholds the whole note rather than scanning it line by line — so content
  // safety is the guarantee for records a scan can read, not for every record.
  // Every member of this sweep is text, so the distinction never arises inside
  // it; it is written down because the unqualified sentence would overclaim.
  /** @param {number} n @returns {Buffer[]} every sequence of n lines over {a, b} */
  const seqs = (n) => {
    if (n === 0) return [EMPTY];
    /** @type {Buffer[]} */
    const out = [];
    for (let mask = 0; mask < 1 << n; mask += 1) {
      let text = '';
      for (let i = 0; i < n; i += 1) text += (mask >> i) & 1 ? 'b\n' : 'a\n';
      out.push(B(text));
    }
    return out;
  };
  /** @type {Buffer[]} */
  const corpus = [];
  for (let n = 0; n <= 3; n += 1) corpus.push(...seqs(n));

  // One reused directory: 225 mkdtemp calls would dominate the runtime and add
  // nothing, since each pair is independent and the file is rewritten in place.
  const root = tmp('content-safety');
  const abs = path.join(root, 'f.dat');

  let pairs = 0;
  let nonSuperset = 0;
  for (const before of corpus) {
    for (const after of corpus) {
      if (before.equals(after)) continue; // no record, nothing to judge
      pairs += 1;

      fs.writeFileSync(abs, before);
      const baseline = captureBaseline(root);
      fs.writeFileSync(abs, after);
      const records = computeDelta(root, baseline).records;
      assert.equal(records.length, 1);
      const mine = records[0].addedLineNumbers;

      const theirs = referenceJudgment(before, after).addedLineNumbers;
      const afterLines = lineRecords(after);
      const beforeHexes = lineRecords(before).map((l) => l.toString('hex'));

      const omitted = theirs.filter((n) => !mine.includes(n));
      if (omitted.length) nonSuperset += 1;
      for (const n of omitted) {
        assert.ok(
          beforeHexes.includes(afterLines[n - 1].toString('hex')),
          `before=${JSON.stringify(before.toString())} after=${JSON.stringify(after.toString())}: ` +
            `git added line ${n} and the module omitted it, and its content is NOT in the baseline — ` +
            'this is a fail-OPEN hole, not a conservative divergence'
        );
      }
      // The same guarantee stated from the module's side: every line the module
      // omits — whether or not git named it — carries known-old content.
      for (let n = 1; n <= afterLines.length; n += 1) {
        if (mine.includes(n)) continue;
        assert.ok(
          beforeHexes.includes(afterLines[n - 1].toString('hex')),
          `the module omitted line ${n} whose content is absent from the baseline`
        );
      }
    }
  }

  assert.ok(pairs > 200, `the sweep must actually cover the space (covered ${pairs} pairs)`);
  // NON-VACUITY, both directions: the sweep must contain real non-superset
  // cases, or it would be proving content-safety on a corpus where the dead
  // superset claim happened to hold and nobody would learn anything.
  // Measured margin: 2 non-superset pairs. Pinned at the measured value rather
  // than at `> 0`, so a change that silently narrows the sweep's reach — a
  // shorter alphabet, a smaller bound — is caught instead of still passing on
  // one surviving pair. The proof of content safety is by CONSTRUCTION (see
  // delta.js); this sweep is corroboration, which is why it is not widened
  // further for its own sake.
  assert.ok(
    nonSuperset >= 2,
    `the sweep must keep reaching pairs where the module is not a superset of git (reached ${nonSuperset})`
  );
});

test('dream-delta: the git oracle comes from a FIXED location, and a rejected candidate is never silently normalised away', () => {
  ref(); // resolution happens once, inside; this asserts what it chose
  assert.ok(gitProvenance, 'ref() must record how the oracle was resolved');

  // PATH ORDER MUST NOT BE ABLE TO SELECT THE ORACLE. Round 2 measured a shim in
  // a user-owned mode-0700 directory ahead of /usr/bin passing every structural
  // check and taking all 502 oracle invocations — structural acceptability is
  // not identity. Trying fixed locations first is what closes that channel.
  assert.equal(
    gitProvenance.provenance,
    'well-known',
    `the oracle was resolved by ${gitProvenance.provenance}; a PATH-resolved oracle is a WEAKER oracle and this ` +
      'assertion exists so that never passes unremarked'
  );

  // A rejection absorbed by a successful fallback is a silent normalisation of a
  // contaminated PATH. The resolver records every rejection; this is what makes
  // "never silent" true rather than merely claimed.
  assert.deepEqual(
    gitProvenance.rejected,
    [],
    `a git candidate was rejected and the run continued anyway: ${gitProvenance.rejected.join('; ')}`
  );
});

test('dream-delta: a symlinked root is refused even when it carries a TRAILING SEPARATOR', {
  skip: POSIX ? false : 'POSIX only',
}, () => {
  // POSIX makes a trailing separator force directory resolution, so `lstat`
  // follows it. Measured before the fix: captureBaseline(link) threw, and
  // captureBaseline(link + '/') walked the symlink's TARGET and returned its
  // bytes — so the refusal this module advertises was false for one character.
  const target = tmp('sep-target');
  fs.writeFileSync(path.join(target, 'target.txt'), B('BEYOND-THE-LINK\n'));
  const holder = tmp('sep-holder');
  const link = path.join(holder, 'link');
  fs.symlinkSync(target, link);

  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'precondition: the entry itself is a symlink');
  assert.equal(
    fs.lstatSync(link + path.sep).isDirectory(),
    true,
    'precondition: with a trailing separator lstat FOLLOWS — this is the whole trap'
  );

  const emptyBaseline = { files: new Map(), anomalies: [], include: INCLUDE_ALL };
  for (const candidate of [link, link + path.sep, `${link}${path.sep}${path.sep}`]) {
    const refuses = (err) => err instanceof WienerdogError && /rootDir is not a real directory/.test(err.message);
    assert.throws(() => captureBaseline(candidate), refuses, `captureBaseline must refuse ${JSON.stringify(candidate)}`);
    assert.throws(() => computeDelta(candidate, emptyBaseline), refuses, `computeDelta must refuse ${JSON.stringify(candidate)}`);
  }

  // And the target's bytes are not reachable through the refused root by any of
  // those spellings — asserted, because the point of the refusal is the bytes.
  const real = tmp('sep-real');
  fs.writeFileSync(path.join(real, 'ok.txt'), B('inside\n'));
  const captured = captureBaseline(real + path.sep);
  assert.deepEqual([...captured.files.keys()], ['ok.txt'], 'a REAL directory still works with a trailing separator');
});
