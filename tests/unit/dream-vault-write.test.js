'use strict';

/**
 * Coverage for src/core/dream/vault-write.js (WP-dream-vault-write-primitive).
 *
 * The primitive exists because three defects measured on shipped code shared
 * one shape: the barrier was expressed in PATHS while every way past it arrived
 * by IDENTITY. So the three defects are the red side of this file, built as
 * real filesystem situations rather than as mocks — a planted symlink is a
 * planted symlink.
 *
 * TWO THINGS THIS FILE DELIBERATELY DOES.
 *
 *  1. IT PROVES ITS OWN PROBES DISCRIMINATE. Several criteria in the spec are
 *     of the form "proven RED against an implementation that does X". A probe
 *     that cannot fail proves nothing, so wherever a criterion names a wrong
 *     implementation, this file BUILDS that wrong implementation in-test and
 *     shows the same probe rejecting it (`assertDiscriminates`). The control is
 *     the evidence; the green run alone is not.
 *
 *  2. IT SIMULATES CONCURRENCY DETERMINISTICALLY. Two of the criteria are about
 *     what happens when another writer — the user's editor, which this whole
 *     design expects to be live — acts between two steps of one call. A racing
 *     thread would make those tests flaky and prove nothing on a fast machine,
 *     so the concurrent act is injected at the exact instant it matters, by
 *     patching one `fs` call for the duration of one test and restoring it in a
 *     `finally`. The injection stands in for the editor; the behaviour under
 *     test is the product's.
 *
 * WHAT IS NOT ASSERTED, and the omission is the contract: no test claims a
 * component swapped concurrently is caught, because portable Node cannot
 * deliver that, and no test claims the concurrently substituted empty directory
 * is protected, because it is a named residual with a stated damage bound. Both
 * are asserted AS residuals instead — a test that claimed prevention would be
 * asserting something the platform does not provide.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeIntoVault } = require('../../src/core/dream/vault-write');
const { WienerdogError } = require('../../src/core/errors');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'core', 'dream', 'vault-write.js');
const POSIX = process.platform !== 'win32';

/** A policy that admits everything — used where the test's subject is not policy. */
const ADMIT_ALL = () => null;

/** @returns {string} a fresh vault root, realpath'd so comparisons are stable */
function makeVault() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-vault-write-')));
  fs.mkdirSync(path.join(dir, 'notes'));
  return dir;
}

/**
 * A recording policy: `calls` is every argument `admit` was handed, in order.
 * @param {(rel:string)=>string|null} [decide]
 */
function recordingAdmit(decide = () => null) {
  /** @type {string[]} */
  const calls = [];
  /** @type {((rel:string)=>string|null) & {calls:string[]}} */
  const admit = Object.assign(
    /** @param {string} rel */ (rel) => {
      calls.push(rel);
      return decide(rel);
    },
    { calls }
  );
  return admit;
}

/**
 * Every regular file and directory under `root`, as a sorted, comparable
 * snapshot: relative path, kind, and content for files. This is what "the vault
 * is byte-identical to its pre-call state" is measured with.
 * @param {string} root @returns {string[]}
 */
function snapshot(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isSymbolicLink()) out.push(`link ${rel} -> ${fs.readlinkSync(full)}`);
      else if (entry.isDirectory()) {
        out.push(`dir  ${rel}`);
        walk(full);
      } else out.push(`file ${rel} = ${fs.readFileSync(full).toString('hex')}`);
    }
  };
  walk(root);
  return out;
}

/**
 * Run `probe` and require that it FAILS. This is how a criterion's "proven RED
 * against an implementation that does X" is discharged: the wrong state is
 * built, the same probe is pointed at it, and the probe must reject it. A probe
 * that passes here is not a probe.
 * @param {() => void} probe @param {string} why
 */
function assertDiscriminates(probe, why) {
  let failed = false;
  try {
    probe();
  } catch (e) {
    if (!(e instanceof assert.AssertionError)) throw e;
    failed = true;
  }
  assert.ok(failed, `this probe does not discriminate: ${why}`);
}

/**
 * Compare two buffers WITHOUT handing a mismatch to `deepEqual`. On large
 * buffers `deepEqual`'s failure message is built element by element, which is
 * ruinous for a probe whose whole job is to be pointed at a deliberate
 * mismatch: measured, one such control turned a millisecond test into 155
 * seconds. The digest says the same thing in one line.
 * @param {Buffer} actual @param {Buffer} expected @param {string} why
 */
function assertSameBytes(actual, expected, why) {
  assert.ok(
    Buffer.compare(actual, expected) === 0,
    `${why} (expected ${expected.length} bytes, ${digest(expected)}; got ${actual.length} bytes, ${digest(actual)})`
  );
}

/** @param {Buffer} buf @returns {string} */
function digest(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Read a descriptor from position 0 to EOF, independently of where its file
 * position happens to be.
 * @param {number} fd @returns {Buffer}
 */
function readAllFrom(fd) {
  /** @type {Buffer[]} */
  const chunks = [];
  const buf = Buffer.alloc(64 * 1024);
  let pos = 0;
  for (;;) {
    const got = fs.readSync(fd, buf, 0, buf.length, pos);
    if (got === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, got)));
    pos += got;
  }
  return Buffer.concat(chunks);
}

/**
 * Replace one `fs` function for the duration of `body`, then restore it. The
 * module under test reaches its `fs` calls through the shared module object, so
 * this is how a concurrent act is placed at an exact instant inside one call.
 * `makeImpl` receives the original function, so the replacement can do the real
 * thing and then act — which is what makes the injection an ADDITION to the
 * call under test rather than a replacement of it.
 * @param {string} name @param {(original:Function)=>Function} makeImpl @param {() => void} body
 */
function withPatchedFs(name, makeImpl, body) {
  const original = fs[name];
  fs[name] = makeImpl(original);
  try {
    body();
  } finally {
    fs[name] = original;
  }
}

// ===========================================================================
// H1 / H2 — what the policy judges, and what containment is worth
// ===========================================================================

test('dream-vault-write: H1 — the policy judges the RESOLVED path, not the one it was given', { skip: !POSIX }, () => {
  const vault = makeVault();
  fs.mkdirSync(path.join(vault, 'shared'));
  // The measured defect: a pre-existing symlink inside the vault. The lexical
  // path `notes/alias/x.txt` is one a policy would admit; where it LANDS is a
  // directory the same policy denies.
  fs.symlinkSync('../shared', path.join(vault, 'notes', 'alias'));

  const admit = recordingAdmit((rel) => (rel.startsWith('shared/') ? 'that destination is closed' : null));
  const result = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/alias/x.txt',
    bytes: Buffer.from('new'),
    admit,
  });

  const seesResolved = () => assert.deepEqual(admit.calls, ['shared/x.txt']);
  seesResolved();
  assert.equal(result.written, false);
  assert.match(result.reason, /refused by the caller's policy/);
  assert.deepEqual(fs.readdirSync(path.join(vault, 'shared')), [], 'nothing landed in the denied directory');

  // RED: an implementation that hands `admit` the path it was GIVEN would have
  // recorded the lexical path, and this probe rejects that.
  assertDiscriminates(() => {
    const lexical = recordingAdmit();
    lexical('notes/alias/x.txt');
    assert.deepEqual(lexical.calls, ['shared/x.txt']);
  }, 'it would accept a policy call made with the given path');
});

test('dream-vault-write: H2 — containment alone admits nothing', () => {
  const vault = makeVault();
  const admit = recordingAdmit((rel) => (rel === 'notes/x.txt' ? 'not this one' : null));

  const result = writeIntoVault({ vaultDir: vault, rel: 'notes/x.txt', bytes: Buffer.from('new'), admit });

  assert.deepEqual(admit.calls, ['notes/x.txt'], 'the path is plainly inside the vault');
  assert.equal(result.written, false);
  assert.match(result.reason, /not this one/);
  assert.deepEqual(fs.readdirSync(path.join(vault, 'notes')), [], 'a contained but denied path is still refused');
});

test('dream-vault-write: H2 — a path that resolves outside the vault is refused before any policy runs', { skip: !POSIX }, () => {
  const vault = makeVault();
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-outside-')));
  fs.symlinkSync(outside, path.join(vault, 'notes', 'elsewhere'));

  const admit = recordingAdmit();
  const result = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/elsewhere/x.txt',
    bytes: Buffer.from('new'),
    admit,
  });

  assert.equal(result.written, false);
  assert.match(result.reason, /resolves outside the vault/);
  assert.deepEqual(admit.calls, [], 'containment is necessary, so it runs first');
  assert.deepEqual(fs.readdirSync(outside), [], 'nothing was written outside the vault');
});

// ===========================================================================
// H3 — nothing is written on or through a symlink
// ===========================================================================

test('dream-vault-write: H3 — a symlink in the parent chain refuses, and its target is byte-unchanged', { skip: !POSIX }, () => {
  const vault = makeVault();
  fs.mkdirSync(path.join(vault, 'shared'));
  fs.writeFileSync(path.join(vault, 'shared', 'x.txt'), 'victim');
  fs.symlinkSync('../shared', path.join(vault, 'notes', 'alias'));

  // The policy admits the resolved destination here, so the ONLY thing that can
  // refuse this write is the symlink rule.
  const result = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/alias/x.txt',
    bytes: Buffer.from('attacker'),
    admit: ADMIT_ALL,
    expect: Buffer.from('victim'),
  });

  assert.equal(result.written, false);
  assert.match(result.reason, /is a symlink; nothing is written through one/);
  assert.equal(fs.readFileSync(path.join(vault, 'shared', 'x.txt'), 'utf8'), 'victim');
});

test('dream-vault-write: H3 — a symlink AT the target refuses, and its target is byte-unchanged', { skip: !POSIX }, () => {
  const vault = makeVault();
  fs.writeFileSync(path.join(vault, 'victim.txt'), 'victim');
  fs.symlinkSync('../victim.txt', path.join(vault, 'notes', 'link.txt'));

  const result = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/link.txt',
    bytes: Buffer.from('attacker'),
    admit: ADMIT_ALL,
    expect: Buffer.from('victim'),
  });

  assert.equal(result.written, false);
  assert.match(result.reason, /is a symlink; nothing is written onto one/);
  assert.equal(fs.readFileSync(path.join(vault, 'victim.txt'), 'utf8'), 'victim');
  assert.ok(fs.lstatSync(path.join(vault, 'notes', 'link.txt')).isSymbolicLink(), 'the link itself is untouched too');
});

// ===========================================================================
// H4 — no partial content is ever observable at the target
// ===========================================================================

test('dream-vault-write: H4 — a reader holding the target open across the publish sees the complete previous content, never a prefix', () => {
  const vault = makeVault();
  const target = path.join(vault, 'notes', 'x.txt');
  const OLD = Buffer.alloc(64 * 1024, 0x41);
  const NEW = Buffer.alloc(128 * 1024, 0x42);
  fs.writeFileSync(target, OLD);

  // The probe: a reader that already holds the target open. It is deterministic
  // where a sampling loop is not — no timing decides the outcome — and it is
  // exactly the observation the row is about, because an implementation that
  // rewrites the existing object in place shows this reader the new bytes (or a
  // prefix of them) through the very same descriptor.
  const reader = fs.openSync(target, 'r');
  try {
    const result = writeIntoVault({ vaultDir: vault, rel: 'notes/x.txt', bytes: NEW, admit: ADMIT_ALL, expect: OLD });
    assert.equal(result.written, true);
    assertSameBytes(readAllFrom(reader), OLD, 'the open reader still sees the complete previous content');
  } finally {
    fs.closeSync(reader);
  }
  assertSameBytes(fs.readFileSync(target), NEW, 'and a fresh reader sees the complete new content');

  // RED: the same probe pointed at an implementation that writes the target in
  // place. It must reject it — otherwise the green above means nothing.
  const control = path.join(vault, 'notes', 'control.txt');
  fs.writeFileSync(control, OLD);
  const controlReader = fs.openSync(control, 'r');
  try {
    const fd = fs.openSync(control, 'w'); // truncate-and-write, the wrong shape
    fs.writeSync(fd, NEW, 0, NEW.length, null);
    fs.closeSync(fd);
    assertDiscriminates(
      () => assertSameBytes(readAllFrom(controlReader), OLD, 'in-place control'),
      'it would accept an implementation that writes the target in place'
    );
  } finally {
    fs.closeSync(controlReader);
  }
});

/**
 * Plant a symlink at EVERY path this call opens for creation inside the vault,
 * pointing at `victim`. Name-agnostic on purpose: it never guesses what
 * the staging object is called, it uses whatever path the implementation itself
 * chose, which is what keeps this a behaviour probe rather than a mechanism
 * assertion.
 * @param {string} vault @param {string} victim @param {() => void} body
 */
function plantSymlinkAtEveryCreateOpen(vault, victim, body) {
  let planted = false;
  withPatchedFs(
    'openSync',
    (original) =>
      /** @param {any[]} args */ (...args) => {
        const [target, flags] = args;
        const creating = typeof flags === 'number' && (flags & fs.constants.O_CREAT) !== 0;
        if (creating && typeof target === 'string' && target.startsWith(vault + path.sep)) {
          planted = true;
          fs.symlinkSync(victim, target);
        }
        return Reflect.apply(original, fs, args);
      },
    body
  );
  // Arming is not optional. An earlier form armed only ONCE, on the first
  // create-open, and an implementation that made a single throwaway open before
  // staging burned the arming on the decoy and then staged with the measured
  // defect's exact shape, green.
  assert.ok(planted, 'the probe never armed — no create-open happened inside the vault');
}

test('dream-vault-write: the second measured defect — a staged write never lands on something planted at its own path', { skip: !POSIX }, () => {
  const vault = makeVault();
  const victim = path.join(vault, 'notes', 'precious.txt');
  fs.writeFileSync(victim, 'the user’s only copy');

  // The measured defect this replaces, from the repo's own publish path: a
  // PREDICTABLE staging name plus a FOLLOWING write, so anything planted at
  // that name is followed and its victim is overwritten before the publish ever
  // happens. The criterion here is behavioural and says nothing about how the
  // staging object is named or opened: whatever path this call stages through,
  // a file it was not asked to write must come out byte-unchanged.
  let result;
  plantSymlinkAtEveryCreateOpen(vault, victim, () => {
    result = writeIntoVault({ vaultDir: vault, rel: 'notes/x.txt', bytes: Buffer.from('payload'), admit: ADMIT_ALL });
  });

  assert.equal(fs.readFileSync(victim, 'utf8'), 'the user’s only copy', 'the planted link’s victim is untouched');
  if (result.written) {
    assert.equal(fs.readFileSync(path.join(vault, 'notes', 'x.txt'), 'utf8'), 'payload');
  } else {
    assert.equal(fs.existsSync(path.join(vault, 'notes', 'x.txt')), false, 'a refusal publishes nothing');
  }

  // RED: the same probe against the defect's own shape — a following create
  // open. It must reject it, or the green above is worth nothing.
  const controlVault = makeVault();
  const controlVictim = path.join(controlVault, 'notes', 'precious.txt');
  fs.writeFileSync(controlVictim, 'the user’s only copy');
  assertDiscriminates(() => {
    plantSymlinkAtEveryCreateOpen(controlVault, controlVictim, () => {
      const staging = path.join(controlVault, 'notes', '.x.txt.tmp');
      const fd = fs.openSync(staging, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC, 0o666);
      fs.writeSync(fd, Buffer.from('payload'), 0, 7, null);
      fs.closeSync(fd);
    });
    assert.equal(fs.readFileSync(controlVictim, 'utf8'), 'the user’s only copy');
  }, 'it would accept a staging open that follows whatever is planted at its path');
});

// ===========================================================================
// H5 / H6 — the conditional publish, and what the caller gets back
// ===========================================================================

test('dream-vault-write: H5 — with `expect` present the publish is abandoned unless the target still holds those bytes', () => {
  const vault = makeVault();
  const target = path.join(vault, 'notes', 'x.txt');
  fs.writeFileSync(target, 'decided-against');

  const ok = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/x.txt',
    bytes: Buffer.from('published'),
    admit: ADMIT_ALL,
    expect: Buffer.from('decided-against'),
  });
  assert.equal(ok.written, true);
  assert.equal(fs.readFileSync(target, 'utf8'), 'published');

  // The measured hazard: a save lands between the decision and the publish.
  fs.writeFileSync(target, 'the user just saved this');
  const abandoned = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/x.txt',
    bytes: Buffer.from('would have clobbered'),
    admit: ADMIT_ALL,
    expect: Buffer.from('decided-against'),
  });
  assert.equal(abandoned.written, false);
  assert.match(abandoned.reason, /no longer holds the bytes this write was decided against/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'the user just saved this', 'the concurrent write survives');
});

test('dream-vault-write: H5 — with `expect` omitted the target must not exist', () => {
  const vault = makeVault();
  const target = path.join(vault, 'notes', 'x.txt');

  const created = writeIntoVault({ vaultDir: vault, rel: 'notes/x.txt', bytes: Buffer.from('first'), admit: ADMIT_ALL });
  assert.equal(created.written, true);
  assert.equal(fs.readFileSync(target, 'utf8'), 'first');

  const refused = writeIntoVault({ vaultDir: vault, rel: 'notes/x.txt', bytes: Buffer.from('second'), admit: ADMIT_ALL });
  assert.equal(refused.written, false);
  assert.match(refused.reason, /already exists and this write asserted it would not/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'first', 'an omitted `expect` is never a silent overwrite');
});

test('dream-vault-write: H6 — the return carries the published bytes, so no caller re-reads the path', () => {
  const vault = makeVault();
  const target = path.join(vault, 'notes', 'x.txt');
  const bytes = Buffer.from('the approved content');

  const result = writeIntoVault({ vaultDir: vault, rel: 'notes/x.txt', bytes, admit: ADMIT_ALL });
  assert.equal(result.written, true);
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.sha256, digest(bytes), 'the digest is over the returned bytes');

  // Another writer changes the path after the call returned. A caller acting on
  // the RETURN is unaffected; a caller re-reading the path would now be acting
  // on content no gate ever saw — the third measured defect.
  fs.writeFileSync(target, 'somebody else wrote this');
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.sha256, digest(bytes));
  assertDiscriminates(
    () => assert.deepEqual(fs.readFileSync(target), bytes),
    'it would accept a caller that learns what it published by re-reading the path'
  );
});

test('dream-vault-write: H6 — a target mutated IMMEDIATELY AFTER the publish changes neither the returned bytes nor the digest', () => {
  const vault = makeVault();
  const target = path.join(vault, 'notes', 'x.txt');
  const bytes = Buffer.from('the approved content');

  // The criterion says "immediately after the publish", and the distance
  // between that and "after the call returned" is the whole finding: by the
  // time the call has returned, the result object is already built, so a
  // mutation then cannot discriminate. Measured — an implementation whose
  // return read the path instead of carrying the payload passed the suite
  // untouched. So the concurrent write goes in at the ONLY instant that can
  // catch it: after the rename has published the bytes, before the return is
  // composed. Then the module re-reading the path would report the OTHER
  // writer's content as what it published.
  let result;
  let injected = false;
  withPatchedFs(
    'renameSync',
    (original) =>
      /** @param {any[]} args */ (...args) => {
        const out = Reflect.apply(original, fs, args);
        fs.writeFileSync(target, 'somebody else wrote this, right after the publish');
        injected = true;
        return out;
      },
    () => {
      result = writeIntoVault({ vaultDir: vault, rel: 'notes/x.txt', bytes, admit: ADMIT_ALL });
    }
  );

  // Without this the probe is vacuous, and vacuous is the exact defect it was
  // written to close. Measured: a module that reaches `renameSync` through a
  // destructured binding never sees the patch, the concurrent write never
  // happens, and every assertion below passes while H6 is violated.
  assert.ok(injected, 'the probe never armed — the publish did not go through fs.renameSync');
  assert.equal(result.written, true);
  assert.deepEqual(result.bytes, bytes, 'the return carries what this call published, not what the path holds now');
  assert.equal(result.sha256, digest(bytes), 'and the digest is over those same bytes');
});

// ===========================================================================
// H9 — the parent chain, and what a refusal unwinds
// ===========================================================================

test('dream-vault-write: H9 — a missing parent chain is created and the note is published', () => {
  const vault = makeVault();
  const result = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/new-project/note.txt',
    bytes: Buffer.from('body'),
    admit: ADMIT_ALL,
  });

  assert.equal(result.written, true);
  assert.equal(fs.readFileSync(path.join(vault, 'notes', 'new-project', 'note.txt'), 'utf8'), 'body');
});

test('dream-vault-write: H9 — a symlink planted as one of the missing segments refuses and follows nothing', { skip: !POSIX }, () => {
  const vault = makeVault();
  fs.mkdirSync(path.join(vault, 'shared'));
  fs.symlinkSync('../shared', path.join(vault, 'notes', 'new-project'));

  const result = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/new-project/deeper/note.txt',
    bytes: Buffer.from('body'),
    admit: ADMIT_ALL,
  });

  assert.equal(result.written, false);
  assert.match(result.reason, /is a symlink; nothing is written through one/);
  assert.deepEqual(fs.readdirSync(path.join(vault, 'shared')), [], 'no directory was created through the link');
});

test('dream-vault-write: H9 — a refusal after the chain was created removes the directories it created and still empty', () => {
  const vault = makeVault();
  const before = snapshot(vault);

  const result = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/new-project/note.txt',
    bytes: Buffer.from('body'),
    admit: ADMIT_ALL,
    // The target cannot hold these — it does not exist — so this refuses AFTER
    // the chain has been created, which is the state the row is about.
    expect: Buffer.from('bytes that are not there'),
  });

  assert.equal(result.written, false);
  const unwound = () => assert.deepEqual(snapshot(vault), before);
  unwound();
  // Nothing was retained, so the reason must not say anything was: a directory
  // that is already gone is not a directory left in the vault.
  assert.doesNotMatch(result.reason, /left in the vault/);

  // RED: an implementation that leaves its created directories behind.
  fs.mkdirSync(path.join(vault, 'notes', 'new-project'));
  assertDiscriminates(unwound, 'it would accept an implementation that leaves the directories it created');
  fs.rmdirSync(path.join(vault, 'notes', 'new-project'));
});

test('dream-vault-write: H9 — prohibition (ii): a directory that PRE-EXISTED the call survives a refusal', () => {
  const vault = makeVault();
  fs.mkdirSync(path.join(vault, 'notes', 'existing'));
  const before = snapshot(vault);

  const result = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/existing/note.txt',
    bytes: Buffer.from('body'),
    admit: ADMIT_ALL,
    expect: Buffer.from('bytes that are not there'),
  });

  assert.equal(result.written, false);
  assert.ok(fs.existsSync(path.join(vault, 'notes', 'existing')), 'the call removes only what it created');
  assert.deepEqual(snapshot(vault), before);
});

test('dream-vault-write: H9 — prohibition (i): a created directory that acquired content is LEFT and NAMED', () => {
  const vault = makeVault();
  const acquired = path.join(vault, 'notes', 'new-project', 'the-user-saved-this.txt');

  // The concurrent act, placed exactly where it matters: the user's editor
  // lands a file in the directory this call created, after the call created it
  // and before the unwind reaches it. `rmSync` is the temp's removal, the first
  // step of the unwind, so this is the last instant at which the directory is
  // still empty.
  let result;
  withPatchedFs(
    'rmSync',
    (original) =>
      /** @param {any[]} args */ (...args) => {
        const out = Reflect.apply(original, fs, args);
        fs.writeFileSync(acquired, 'work in progress');
        return out;
      },
    () => {
      result = writeIntoVault({
        vaultDir: vault,
        rel: 'notes/new-project/note.txt',
        bytes: Buffer.from('body'),
        admit: ADMIT_ALL,
        expect: Buffer.from('bytes that are not there'),
      });
    }
  );

  assert.equal(result.written, false);
  assert.equal(
    fs.readFileSync(acquired, 'utf8'),
    'work in progress',
    'the absolute prohibition: content is never removed, and the empty-only rule makes that structural'
  );
  assert.match(result.reason, /no longer empty and was left in the vault: notes\/new-project/);
});

test('dream-vault-write: H7 — a staging file that cannot be removed is LEFT and NAMED, never left silently', { skip: !POSIX }, () => {
  const vault = makeVault();
  const target = path.join(vault, 'notes', 'x.txt');
  fs.writeFileSync(target, 'on disk');

  // No fault is injected into the module. The concurrent actor simply takes
  // write permission off the parent between the staging open and the refusal —
  // the same class of concurrent act the rest of this file uses, and the same
  // class (EACCES on an unwind step) the directory buckets already handle.
  let armed = false;
  let result;
  withPatchedFs(
    'readFileSync',
    (original) =>
      /** @param {any[]} args */ (...args) => {
        if (!armed) {
          armed = true;
          fs.chmodSync(path.join(vault, 'notes'), 0o500);
        }
        return Reflect.apply(original, fs, args);
      },
    () => {
      result = writeIntoVault({
        vaultDir: vault,
        rel: 'notes/x.txt',
        bytes: Buffer.from('REFUSED PAYLOAD'),
        admit: ADMIT_ALL,
        expect: Buffer.from('what the decision was made against'),
      });
    }
  );
  fs.chmodSync(path.join(vault, 'notes'), 0o700);

  assert.ok(armed, 'the probe never armed — the conditional publish did not re-read the target');
  assert.equal(result.written, false);

  const leftovers = fs.readdirSync(path.join(vault, 'notes')).filter((n) => n !== 'x.txt');
  // What must NEVER happen is a leftover that nothing reports: the staged bytes
  // are the REFUSED payload, and they sit where a consumer's later `git add -A`
  // would sweep them into a commit.
  for (const name of leftovers) {
    assert.match(
      result.reason,
      /a file this write staged could not be removed and was left in the vault/,
      `${name} was left behind and the refusal says nothing about it`
    );
    assert.ok(result.reason.includes(name), `${name} was left behind but is not named in the refusal`);
  }
});

test('dream-vault-write: H9 — a directory that cannot be removed for an unknown reason is named WITHOUT claiming it holds content', () => {
  const vault = makeVault();

  // The refusal reason must say what the platform said, not what would be a
  // tidy story. An EACCES rmdir is not evidence that a concurrent writer put
  // something in the directory, and reporting it as such is the overclaiming
  // this package exists to stop.
  let armed = false;
  let result;
  withPatchedFs(
    'rmdirSync',
    (original) =>
      /** @param {any[]} args */ (...args) => {
        if (!armed) {
          armed = true;
          const e = new Error('synthetic: the platform refused this removal');
          // @ts-expect-error — a synthetic errno, which is the whole point
          e.code = 'EACCES';
          throw e;
        }
        return Reflect.apply(original, fs, args);
      },
    () => {
      result = writeIntoVault({
        vaultDir: vault,
        rel: 'notes/new-project/note.txt',
        bytes: Buffer.from('body'),
        admit: ADMIT_ALL,
        expect: Buffer.from('bytes that are not there'),
      });
    }
  );

  assert.ok(armed, 'the probe never armed — no directory removal was attempted');
  assert.equal(result.written, false);
  assert.match(result.reason, /could not be removed and was left in the vault: notes\/new-project \(EACCES\)/);
  assert.doesNotMatch(
    result.reason,
    /no longer empty/,
    'an EACCES is not evidence that the directory acquired content, and must not be reported as if it were'
  );
});

test('dream-vault-write: H9 — the unwind identity gap is a RESIDUAL, not a guarantee', { skip: !POSIX }, () => {
  const vault = makeVault();
  const createdPath = path.join(vault, 'notes', 'new-project');
  const movedPath = path.join(vault, 'notes', 'moved-away');

  // The substitution, at the same instant as above: the directory this call
  // created is renamed away and a DIFFERENT empty directory is put at its path.
  let result;
  withPatchedFs(
    'rmSync',
    (original) =>
      /** @param {any[]} args */ (...args) => {
        const out = Reflect.apply(original, fs, args);
        fs.renameSync(createdPath, movedPath);
        fs.mkdirSync(createdPath);
        return out;
      },
    () => {
      result = writeIntoVault({
        vaultDir: vault,
        rel: 'notes/new-project/note.txt',
        bytes: Buffer.from('body'),
        admit: ADMIT_ALL,
        expect: Buffer.from('bytes that are not there'),
      });
    }
  );

  assert.equal(result.written, false);
  // This is what the platform actually does, recorded as the residual it is.
  // The removal is by PATH, so the REPLACEMENT is what goes and the directory
  // the call created survives under its new name. No assertion here claims this
  // case is prevented — it is not, and the damage bound is what makes it
  // acceptable: an empty directory, never content.
  assert.equal(fs.existsSync(createdPath), false, 'the substituted empty directory was removed');
  assert.equal(fs.existsSync(movedPath), true, 'and the directory the call created survives under its new name');
});

// ===========================================================================
// H10 / H7 / H8 — permissions, total refusal, and the absence of policy
// ===========================================================================

test('dream-vault-write: H9 — a created directory that is already GONE at unwind time is not reported as left behind', { skip: !POSIX }, () => {
  const vault = makeVault();
  const createdPath = path.join(vault, 'notes', 'new-project');
  const movedPath = path.join(vault, 'notes', 'moved-away');

  // Same concurrent act as the identity residual, minus the replacement: the
  // directory this call created is renamed away and nothing is put back, so the
  // removal finds nothing there. Nothing was retained, so the refusal must not
  // say anything was — a directory that is already gone is not a directory left
  // in the vault, and a reason that claims otherwise is the same overclaiming
  // the buckets above exist to prevent.
  let armed = false;
  let result;
  withPatchedFs(
    'rmSync',
    (original) =>
      /** @param {any[]} args */ (...args) => {
        const out = Reflect.apply(original, fs, args);
        if (!armed) {
          armed = true;
          fs.renameSync(createdPath, movedPath);
        }
        return out;
      },
    () => {
      result = writeIntoVault({
        vaultDir: vault,
        rel: 'notes/new-project/note.txt',
        bytes: Buffer.from('body'),
        admit: ADMIT_ALL,
        expect: Buffer.from('bytes that are not there'),
      });
    }
  );

  assert.ok(armed, 'the probe never armed — the staging file was never removed');
  assert.equal(result.written, false);
  assert.equal(fs.existsSync(createdPath), false);
  assert.doesNotMatch(result.reason, /left in the vault/, 'nothing was retained, so nothing may be reported as retained');
});

test('dream-vault-write: H10 — a published note carries the same permissions as one the user creates by hand', { skip: !POSIX }, () => {
  const vault = makeVault();

  const result = writeIntoVault({ vaultDir: vault, rel: 'notes/ours.txt', bytes: Buffer.from('ours'), admit: ADMIT_ALL });
  assert.equal(result.written, true);

  // The comparison is against a file made by ordinary means in the same
  // directory under the same umask — the row's own wording.
  fs.writeFileSync(path.join(vault, 'notes', 'theirs.txt'), 'theirs');

  assert.equal(
    fs.statSync(path.join(vault, 'notes', 'ours.txt')).mode & 0o777,
    fs.statSync(path.join(vault, 'notes', 'theirs.txt')).mode & 0o777,
    'neither widened nor narrowed'
  );
});

test('dream-vault-write: H7 — every refusal leaves nothing of this call’s making', { skip: !POSIX }, () => {
  const vault = makeVault();
  fs.mkdirSync(path.join(vault, 'shared'));
  fs.writeFileSync(path.join(vault, 'notes', 'kept.txt'), 'kept');
  fs.symlinkSync('../shared', path.join(vault, 'notes', 'alias'));
  fs.symlinkSync('../notes/kept.txt', path.join(vault, 'shared', 'link.txt'));

  const before = snapshot(vault);
  /** @type {Array<{why:string, o:object}>} */
  const refusals = [
    { why: 'policy', o: { rel: 'notes/x.txt', admit: () => 'no' } },
    { why: 'a symlink in the parent chain', o: { rel: 'notes/alias/x.txt', admit: ADMIT_ALL } },
    { why: 'symlink at the target', o: { rel: 'shared/link.txt', admit: ADMIT_ALL, expect: Buffer.from('kept') } },
    { why: 'target exists, `expect` omitted', o: { rel: 'notes/kept.txt', admit: ADMIT_ALL } },
    { why: '`expect` mismatch', o: { rel: 'notes/kept.txt', admit: ADMIT_ALL, expect: Buffer.from('stale') } },
    {
      why: '`expect` mismatch after a chain was created',
      o: { rel: 'notes/fresh/deeper/x.txt', admit: ADMIT_ALL, expect: Buffer.from('stale') },
    },
  ];

  for (const { why, o } of refusals) {
    const result = writeIntoVault({ vaultDir: vault, bytes: Buffer.from('attempt'), ...o });
    assert.equal(result.written, false, `expected a refusal for: ${why}`);
    assert.equal(typeof result.reason, 'string');
    assert.ok(result.reason.length > 0, `a refusal must say why (${why})`);
    assert.deepEqual(snapshot(vault), before, `the vault is unchanged after a refusal for: ${why}`);
  }
});

test('dream-vault-write: H7 — refusal is by RETURN; only a caller-contract violation throws', () => {
  const vault = makeVault();
  const base = { vaultDir: vault, bytes: Buffer.from('x'), admit: ADMIT_ALL };

  // A policy refusal is a value, not an exception.
  assert.equal(writeIntoVault({ ...base, rel: 'notes/x.txt', admit: () => 'no' }).written, false);

  for (const rel of ['', '.', '..', 'notes/../escape.txt', '/absolute.txt', 'notes//x.txt', 'notes/', 'notes\\x.txt']) {
    assert.throws(
      () => writeIntoVault({ ...base, rel }),
      WienerdogError,
      `a rel that is not segment-valid is a caller-contract violation: ${JSON.stringify(rel)}`
    );
  }
  assert.throws(() => writeIntoVault({ vaultDir: vault, rel: 'notes/x.txt', bytes: Buffer.from('x') }), WienerdogError);
  assert.throws(() => writeIntoVault({ ...base, rel: 'notes/x.txt', bytes: 'not a buffer' }), WienerdogError);
  // TWO states only, never three: an explicit `null` is rejected rather than
  // guessed at, because it reads as either "must be absent" or "check nothing".
  assert.throws(() => writeIntoVault({ ...base, rel: 'notes/x.txt', expect: null }), WienerdogError);
  assert.deepEqual(fs.readdirSync(path.join(vault, 'notes')), [], 'no throw path wrote anything');
});

test('dream-vault-write: H8 — this module holds no policy and starts no process', () => {
  const src = fs.readFileSync(MODULE_PATH, 'utf8');

  // Pin the whole require set rather than blocklisting spellings: a new
  // dependency of any kind has to be argued for.
  const required = [...src.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(required, ['../errors', 'node:crypto', 'node:fs', 'node:path']);

  for (const forbidden of ['child_process', 'spawnSync', 'execFile', 'execSync', 'process.binding']) {
    assert.ok(!src.includes(forbidden), `vault-write.js must not contain ${forbidden}, not even in a comment`);
  }
  // No destination, file-kind or naming rule may appear here — those belong to
  // the caller's `admit`, and the extraction is worthless if they leak back in.
  const lower = src.toLowerCase();
  for (const policyish of [
    '00-inbox',
    '01-projects',
    '02-areas',
    '03-resources',
    '04-archive',
    '05-skills',
    '06-identity',
    'reports/dreams',
    '.md',
    'tier',
    'frontmatter',
    'extension',
  ]) {
    assert.ok(!lower.includes(policyish), `vault-write.js must contain no policy; found ${JSON.stringify(policyish)}`);
  }
});

test('dream-vault-write: idempotence is N/A — the `expect` guard is what ships in its place', () => {
  const vault = makeVault();
  const bytes = Buffer.from('body');
  const target = path.join(vault, 'notes', 'x.txt');
  fs.writeFileSync(target, 'original');

  const first = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/x.txt',
    bytes,
    admit: ADMIT_ALL,
    expect: Buffer.from('original'),
  });
  assert.equal(first.written, true);

  // A vault write is not a repeatable command. Running the same call again is
  // REFUSED, because the premise it was decided under no longer holds.
  const second = writeIntoVault({
    vaultDir: vault,
    rel: 'notes/x.txt',
    bytes,
    admit: ADMIT_ALL,
    expect: Buffer.from('original'),
  });
  assert.equal(second.written, false);
  assert.match(second.reason, /no longer holds the bytes this write was decided against/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'body');
});
