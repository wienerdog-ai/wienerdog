'use strict';

/**
 * Baseline capture and delta — the git-free primitive (WP-dream-baseline-delta-primitive).
 *
 * WHAT THIS IS. `captureBaseline` records the exact bytes of every regular file
 * under a directory; `computeDelta` differences that recording against the SAME
 * directory as it stands at call time. The pair exists so a consumer can say
 * which bytes appeared, changed or vanished between two moments, and attribute
 * them, without asking git anything.
 *
 * WHAT THIS IS NOT — three disclaimers that are contract, not modesty:
 *
 *  1. NO FRESHNESS CLAIM. `computeDelta` describes the directory at the instant
 *     it read it and nothing more. It does not lock, re-check, or promise the
 *     answer still holds when the caller acts on it. The superseded predecessor
 *     (docs/specs/done/WP-dream-gate-inputs-baseline-delta.md) assumed the
 *     opposite and was measured wrong twice. A consumer that needs liveness must
 *     obtain it by construction — e.g. by being the only writer of the tree.
 *
 *  2. NO CONTAINMENT GUARANTEE (owner-ruled 2026-08-21). This module does not
 *     establish, and its caller may not assume, that every byte it returns came
 *     from an object inside `rootDir`. Portable Node cannot close that class
 *     without per-component `openat`, which no `fs` API exposes. The obligation
 *     is the caller's and is checkable: for the duration of each call the caller
 *     must either (i) prevent an untrusted actor from replacing the ROOT ENTRY
 *     ITSELF, or any ancestor or directory entry used to reach an enumerated
 *     path — not merely entries BENEATH the tree — or (ii) supply a platform
 *     mechanism that demonstrably binds every returned object beneath the
 *     intended root. Guarding only the subtree is NOT sufficient: moving the
 *     root directory out of its parent and symlinking the old root path to it
 *     changes nothing beneath the tree, yet every check below still passes.
 *     The accuracy mechanisms in `readRegularFileSecure` are cheap hygiene and
 *     are explicitly NOT offered as a defense to rely on.
 *
 *  3. NO POLICY. The module owns no opinion about which files matter — no ignore
 *     rules, no notion of git-tracked, no dot-prefix rule. Scope is the caller's
 *     `include` predicate, and it travels with the baseline.
 *
 * TWO NAMED CALLER INVARIANTS. Neither can be enforced from inside, so both are
 * stated rather than checked, and both are pinned by tests that record what
 * happens when they are broken:
 *
 *  A. The returned baseline is CALLER-IMMUTABLE. Mutating `files`' buffers (or
 *     the Map) between capture and delta makes `computeDelta` compare against
 *     the caller's edit rather than what was on disk. `Object.freeze` cannot
 *     help: it THROWS on a non-empty Buffer ("Cannot freeze array buffer views
 *     with elements") and a frozen Map still accepts `set`.
 *
 *  B. `include` is a PURE function of the path — same input, same answer, for
 *     the lifetime of the baseline. One and the same function object answering
 *     `false` at capture and `true` at delta makes a pre-existing excluded file
 *     surface as `added`, which is exactly the false accusation this module
 *     exists to prevent. Carrying the predicate on the baseline removes the
 *     other failure mode (a caller handing the second walk a DIFFERENT
 *     function); it does not make scope mismatch impossible.
 *
 * ADR-0004: just files. This module starts nothing, holds nothing beyond its
 * call, spawns no process, and does not require Node's process-spawning module.
 * (It cannot even NAME that module: the verification gate for this package is a
 * `grep` over this file, which cannot tell a comment from a call.) Its
 * equivalence to git is proved TEST-side, by calling git as a pure function over
 * bytes the test hands it; the product code here is a byte check, because a byte
 * check has no configuration channel and git has several.
 *
 * Consumed by nothing at merge time, by ruling.
 */

const fs = require('node:fs');
const path = require('node:path');
const { WienerdogError } = require('../errors');

/** Absent on platforms that lack them; `| 0` makes the flag a no-op there. */
const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const O_NONBLOCK = fs.constants.O_NONBLOCK || 0;

/**
 * Git inspects a BOUNDED PREFIX for its binary verdict, not the whole file.
 * Measured on git 2.50.1: a NUL at byte 7999 stages `-\t-` (binary), the same
 * file with the NUL at 8000 stages `1\t0` (text). A naive "any NUL anywhere"
 * predicate therefore disagrees with git on the second file — in the
 * fail-CLOSED direction, but wrongly. The window is not the contract: the tests
 * locate it by search against git itself, so they follow git if git moves.
 */
const GIT_BINARY_PREFIX_BYTES = 8000;

/**
 * The sentinel a baseline carries in `include` when the capture ran unfiltered.
 * A distinct value (rather than `undefined`) so a consumer reading
 * `baseline.include` can tell "everything" from "a predicate that happens to be
 * missing".
 */
const INCLUDE_ALL = Symbol('wienerdog.delta.includeAll');

/**
 * @typedef {{rel: string, kind: string}} Anomaly  a path the walk refused to
 *   treat as a regular file, surfaced instead of silently dropped.
 * @typedef {((rel: string) => boolean) | typeof INCLUDE_ALL} Scope
 * @typedef {{files: Map<string, Buffer>, anomalies: Anomaly[], include: Scope}} Baseline
 * @typedef {{rel: string, status: 'added'|'modified'|'deleted',
 *            baselineBytes: Buffer|null, afterBytes: Buffer|null,
 *            binary: boolean, addedLineNumbers: number[]}} DeltaRecord
 */

/**
 * Byte-wise ascending comparison of two relative paths. NOT `String#localeCompare`
 * and not `<`: JavaScript compares strings by UTF-16 code unit, which orders
 * non-BMP paths differently from their UTF-8 bytes. Sorted output is not
 * cosmetic — it is what lets a consumer's report and a test's expectation be
 * compared without re-sorting at every call site.
 * @param {string} a @param {string} b @returns {number}
 */
function byteCompare(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * Name the kind of a non-regular, non-directory entry for the anomaly list.
 * @param {import('fs').Stats} st @returns {string}
 */
function entryKind(st) {
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isFIFO()) return 'fifo';
  if (st.isSocket()) return 'socket';
  if (st.isCharacterDevice()) return 'characterDevice';
  if (st.isBlockDevice()) return 'blockDevice';
  return 'unknown';
}

/**
 * Read a regular file's bytes with classification and read BOUND TO ONE OPENED
 * OBJECT. The obvious shape — `lstatSync(p)` to classify, `readFileSync(p)` to
 * read — passes every test that places a symlink before the walk starts and
 * still follows one substituted in between; `src/core/private-fs.js`'s
 * `applyModeSecure` is the in-repo precedent for doing it properly.
 *
 * Three mechanisms, each doing something the others cannot:
 *  - `O_NOFOLLOW`, where the platform supplies it, atomically refuses a
 *    FINAL-COMPONENT symlink before the target is opened. The (dev, ino)
 *    comparison CANNOT reproduce this: a symlink pointing at the same relocated
 *    inode passes the identity check. Measured — with the flag the open fails
 *    ELOOP; without it the open succeeds, `fstat` reports a regular file,
 *    (dev, ino) matches, and the bytes are read.
 *  - `O_NONBLOCK` is load-bearing independently. `O_NOFOLLOW` refuses a final
 *    symlink but not a FIFO, and a BLOCKING open of a FIFO with no writer waits
 *    forever: measured, it never returns and never reaches `fstat`, so the run
 *    HANGS instead of failing loudly. With the flag the open returns at once and
 *    `fstat` reports the FIFO, which this function then refuses.
 *  - the `fstat` regular-file check and the (dev, ino) comparison catch what
 *    `O_NOFOLLOW` cannot — notably an INTERMEDIATE directory component swapped
 *    between enumeration and open, which redirects the open to another inode.
 *
 * This is an ACCURACY mechanism, not a containment guarantee (see the file
 * header, disclaimer 2). Its purpose is that the bytes recorded under `rel` are
 * the bytes of the object this walk enumerated at `rel`, so the baseline
 * describes what it says it describes.
 *
 * Error messages name only `rel` — never the absolute path — so a failure does
 * not leak where the tree lives.
 *
 * @param {string} abs absolute path to open
 * @param {number} expectedDev  `dev` captured when the walk classified this path
 * @param {number} expectedIno  `ino` captured when the walk classified this path
 * @param {string} rel the relative path, for diagnostics
 * @returns {Buffer}
 */
function readRegularFileSecure(abs, expectedDev, expectedIno, rel) {
  let fd;
  try {
    fd = fs.openSync(abs, fs.constants.O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  } catch (err) {
    // ELOOP here is the O_NOFOLLOW refusal; EACCES an unreadable file; ENOENT a
    // path that vanished after enumeration. All are read failures, and a read
    // failure is fatal: a baseline that silently omits a file would report that
    // file as `added` later, which is a false accusation against whoever wrote it.
    throw new WienerdogError(`dream delta: cannot read ${rel} (${(err && err.code) || 'open failed'})`);
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) {
      throw new WienerdogError(
        `dream delta: ${rel} was a regular file when enumerated and is a ${entryKind(st)} when opened`
      );
    }
    if (st.dev !== expectedDev || st.ino !== expectedIno) {
      throw new WienerdogError(`dream delta: ${rel} changed identity between enumeration and read`);
    }
    return fs.readFileSync(fd);
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* best-effort close; the read result stands either way */
    }
  }
}

/**
 * Reject a root that is not a real, in-place directory before walking it.
 * A SYMLINKED root is refused rather than followed: `rootDir` is documented as
 * an existing real directory, and following it would silently relocate the whole
 * walk. (An unreadable-but-real root is not rejected here — it fails loudly at
 * the first `readdirSync`, which is the same outcome by a clearer route.)
 * @param {string} rootDir
 */
function assertRealDirectory(rootDir) {
  if (typeof rootDir !== 'string' || rootDir === '' || !path.isAbsolute(rootDir)) {
    throw new WienerdogError('dream delta: rootDir must be an absolute path');
  }
  let st;
  try {
    st = fs.lstatSync(rootDir);
  } catch (err) {
    throw new WienerdogError(`dream delta: cannot read the root directory (${(err && err.code) || 'lstat failed'})`);
  }
  if (!st.isDirectory()) {
    throw new WienerdogError('dream delta: rootDir is not a real directory');
  }
}

/**
 * Walk `rootDir` under `scope`, returning every included regular file's bytes
 * and every entry the walk refused to treat as a regular file.
 *
 * THERE IS NO PARTIAL RESULT. A directory that cannot be ENUMERATED at any
 * depth throws, deliberately unlike the walk idiom this module otherwise
 * follows: `listNames` (src/core/private-fs.js) swallows a `readdirSync`
 * failure and returns `[]`, so an implementer copying it would silently omit
 * every file beneath an unreadable nested directory — measured, `readdirSync`
 * on a mode-000 nested directory fails EACCES — and each of those pre-existing
 * files would then be reported `added` once the directory became readable. That
 * is precisely the false attribution this module exists to prevent, arriving
 * through its own precedent.
 *
 * ORDER OF OPERATIONS, and it matters: each entry is classified with `lstat`
 * (which never follows), THEN filtered by `scope`, THEN opened and read. The
 * scope call therefore sits in the classify/read gap — which is also the only
 * seam a test has for substituting an object into that gap without this module
 * growing a test-only parameter.
 *
 * @param {string} rootDir @param {Scope} scope
 * @returns {{files: Map<string, Buffer>, anomalies: Anomaly[]}}
 */
function walk(rootDir, scope) {
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  /** @type {Anomaly[]} */
  const anomalies = [];
  const includeAll = scope === INCLUDE_ALL;

  /** @param {string} absDir @param {string} relDir */
  const visit = (absDir, relDir) => {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      const where = relDir === '' ? 'the root directory' : relDir;
      throw new WienerdogError(
        `dream delta: cannot enumerate ${where} (${(err && err.code) || 'readdir failed'}); ` +
          'a baseline that omitted its files would later report them as added'
      );
    }
    // Deterministic traversal: two captures of the same unchanged state must
    // produce byte-identical output, and `readdir` order is not guaranteed.
    entries.sort((a, b) => byteCompare(a.name, b.name));
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      // POSIX separators on every platform — the shape `git status` yields, so a
      // consumer's prefix tests keep working unchanged. Built only from directory
      // entries, never from file content, so this module introduces no `..` or
      // absolute segment of its own.
      const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      let st;
      try {
        st = fs.lstatSync(abs);
      } catch (err) {
        throw new WienerdogError(
          `dream delta: cannot classify ${rel} (${(err && err.code) || 'lstat failed'})`
        );
      }
      if (st.isDirectory()) {
        visit(abs, rel);
        continue;
      }
      if (!st.isFile()) {
        // A symlink (to a file OR a directory), a device, a socket or a FIFO is
        // never captured as content and never recursed into — it is surfaced.
        anomalies.push({ rel, kind: entryKind(st) });
        continue;
      }
      if (!includeAll && !scope(rel)) continue;
      files.set(rel, readRegularFileSecure(abs, st.dev, st.ino, rel));
    }
  };

  visit(rootDir, '');
  anomalies.sort((a, b) => byteCompare(a.rel, b.rel));
  return { files, anomalies };
}

/**
 * Split bytes into LINE RECORDS, each carrying its own trailing LF when it has
 * one. Keeping the terminator on the record is what makes the last line's
 * newline status part of its identity, which is how git treats it: measured,
 * `"a\n"` → `"a"` is `1\t1`, a change, not a no-op. A CR is ordinary content, so
 * a CRLF line is `"a\r\n"`. An empty buffer has zero records, and a trailing
 * newline does not create a final empty one.
 * @param {Buffer} buf @returns {Buffer[]}
 */
function splitLineRecords(buf) {
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
 * Does git call these bytes binary? A NUL inside git's bounded prefix window.
 * @param {Buffer} buf @returns {boolean}
 */
function hasBinaryMarker(buf) {
  return buf.subarray(0, GIT_BINARY_PREFIX_BYTES).includes(0);
}

/**
 * The binary verdict is about the PAIR, not about the after side alone.
 * Measured: git answers `-\t-` when EITHER side is binary — binary-before with
 * text-after, text-before with binary-after, and a binary deletion all return
 * it. A definition taken from the after content alone therefore could not equal
 * git's judgment for the `modified` and `deleted` categories at all. A `null`
 * side is the empty operand git diffs against, which is text.
 * @param {Buffer|null} before @param {Buffer|null} after @returns {boolean}
 */
function isBinaryPair(before, after) {
  return (before !== null && hasBinaryMarker(before)) || (after !== null && hasBinaryMarker(after));
}

/**
 * 1-based line numbers IN `after` that this delta adds.
 *
 * The algorithm is: drop the common leading records, drop the common trailing
 * records, and report everything left in `after`. That is deliberately NOT a
 * full Myers diff, and the trade is stated rather than hidden:
 *
 *  - On every shape the equivalence corpus mandates — added, deleted, empty,
 *    empty-to-content, CRLF, missing trailing newline, appended lines, an
 *    interior change, and a duplicated block — it is measured EQUAL to what git
 *    reports. The differential test proves that, and goes red if it stops being
 *    true.
 *  - Where it diverges (two or more separate changes with unchanged lines
 *    between them) it reports a strict SUPERSET of git's answer: the unchanged
 *    interior lines are included too. That direction is fail-closed for the
 *    consumer this exists for — a secret scan reads MORE lines, never fewer —
 *    and it is proved as a superset by a test rather than assumed.
 *
 * The honest reason not to chase exact equality everywhere: git's hunk placement
 * is heuristic (the indent heuristic shifts boundaries inside runs of similar
 * lines), so no pure-Node reimplementation reaches universal agreement anyway.
 * Corpus-exact plus provably-conservative is a claim that can be kept.
 *
 * @param {Buffer|null} before @param {Buffer} after @returns {number[]}
 */
function addedLineNumbers(before, after) {
  const a = before === null ? [] : splitLineRecords(before);
  const b = splitLineRecords(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head].equals(b[head])) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail].equals(b[b.length - 1 - tail])
  ) {
    tail += 1;
  }
  /** @type {number[]} */
  const out = [];
  for (let i = head; i < b.length - tail; i += 1) out.push(i + 1);
  return out;
}

/**
 * Capture a directory's content as a baseline. Pure read.
 *
 * THE CALLER MUST NOT MUTATE WHAT IT GETS BACK — see the file header, invariant
 * A. The representation cannot enforce it.
 *
 * A content hash was considered and cut: `computeDelta` has to read the current
 * bytes anyway, so no consumer would ever read the hash.
 *
 * @param {string} rootDir absolute path to an existing real directory
 * @param {(rel: string) => boolean} [include] optional filter over relative
 *   paths; omitted means every regular file under `rootDir`. Must be a PURE
 *   function of the path for the lifetime of the baseline (invariant B).
 * @returns {Baseline} `{files, anomalies, include}`
 * @throws {WienerdogError} on an unreadable root, an unenumerable directory at
 *   any depth, or an unreadable file. There is no partial baseline.
 */
function captureBaseline(rootDir, include) {
  assertRealDirectory(rootDir);
  if (include !== undefined && typeof include !== 'function') {
    throw new WienerdogError('dream delta: include must be a function when supplied');
  }
  const scope = include === undefined ? INCLUDE_ALL : include;
  const { files, anomalies } = walk(rootDir, scope);
  // Scope travels WITH the baseline. Without it a path absent from `files` is
  // ambiguous — excluded at capture, or genuinely new — and the primitive would
  // report a pre-existing excluded file as `added`.
  return { files, anomalies, include: scope };
}

/**
 * Difference the SAME root, as it stands at call time, against a baseline.
 *
 * MAKES NO FRESHNESS CLAIM (file header, disclaimer 1).
 *
 * Re-applies the baseline's OWN scope predicate. It is deliberately not a
 * parameter here, so a caller cannot hand the second walk a different function.
 *
 * @param {string} rootDir @param {Baseline} baseline
 * @returns {{records: DeltaRecord[], anomalies: Anomaly[]}} `records` sorted by
 *   `rel`, byte-wise ascending; `anomalies` are the ones seen NOW, not the ones
 *   the baseline carries.
 * @throws {WienerdogError} on the same conditions as capture. A file that was in
 *   the baseline and is gone now is `deleted`, not a failure — that is the
 *   normal case; any other read failure throws.
 */
function computeDelta(rootDir, baseline) {
  assertRealDirectory(rootDir);
  if (!baseline || typeof baseline !== 'object' || !(baseline.files instanceof Map)) {
    throw new WienerdogError('dream delta: baseline must be a value returned by captureBaseline()');
  }
  const scope = baseline.include;
  if (scope !== INCLUDE_ALL && typeof scope !== 'function') {
    throw new WienerdogError('dream delta: baseline.include must be a function or the INCLUDE_ALL sentinel');
  }

  const now = walk(rootDir, scope);
  const rels = [...new Set([...baseline.files.keys(), ...now.files.keys()])].sort(byteCompare);

  /** @type {DeltaRecord[]} */
  const records = [];
  for (const rel of rels) {
    const before = baseline.files.has(rel) ? baseline.files.get(rel) : null;
    const after = now.files.has(rel) ? now.files.get(rel) : null;
    // Unchanged bytes produce NO record.
    if (before !== null && after !== null && before.equals(after)) continue;
    const status = before === null ? 'added' : after === null ? 'deleted' : 'modified';
    const binary = isBinaryPair(before, after);
    records.push({
      rel,
      status,
      baselineBytes: before,
      afterBytes: after,
      binary,
      // A consumer withholds what it cannot scan, so a binary record carries no
      // line numbers — which is what makes the conservative binary verdict
      // coherent instead of self-contradicting.
      addedLineNumbers: binary || after === null ? [] : addedLineNumbers(before, after),
    });
  }
  return { records, anomalies: now.anomalies };
}

module.exports = { captureBaseline, computeDelta, INCLUDE_ALL };
