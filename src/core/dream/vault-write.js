'use strict';

/**
 * The vault-write primitive (WP-dream-vault-write-primitive).
 *
 * WHAT THIS IS. One function, `writeIntoVault`, through which this family
 * writes a vault CONTENT file. The family owns exactly two such writers — each
 * promoted note, and the dream report (whose body the brain authors and to
 * which code appends its own accounting section, so it is two calls rather than
 * one). Git's writes to the vault's own `.git` directory are not content files
 * and are outside this contract.
 *
 * WHY IT EXISTS, AND WHY IT IS SHAPED LIKE THIS. Three defects measured on
 * shipped code share one shape: the barrier was expressed in PATHS while every
 * way past it arrived by IDENTITY — one name and another inode, one lexical
 * path and another resolved destination, one approved path and other bytes.
 *
 *   1. A path a policy admits can RESOLVE somewhere else. A pre-existing
 *      symlink inside the vault makes a lexically admitted path land in a
 *      directory the policy denies, and a containment check that asks only
 *      "still inside the vault?" cannot see it, because it still is.
 *   2. A temp file written beside the target can BE a symlink. A predictable
 *      temp name plus a following write means a planted link is followed and
 *      its victim is overwritten before the publish ever happens.
 *   3. Approved bytes and committed bytes can differ, when what gets committed
 *      is whatever a later read of the path returns rather than the bytes the
 *      decision was made against.
 *
 * So this module asks one question in one place: what object am I actually
 * about to write, and is THAT object allowed? It answers on the RESOLVED
 * destination, it refuses to write on or through a symlink, it publishes
 * without any instant at which the target holds a prefix, it makes the publish
 * conditional on the caller's premise still holding, and it hands the caller
 * back the exact bytes it published so nothing downstream has to re-read a path
 * another writer may since have changed.
 *
 * WHAT IT DOES NOT ESTABLISH — three named residuals, stated because a barrier
 * that overstates itself is worse than one that does not exist:
 *
 *   A. COMPONENT SWAP. Portable Node cannot bind a path's component chain
 *      against concurrent replacement; there is no per-component `openat` in
 *      `fs`. The same limit is already carried, owner-ruled, by this family's
 *      delta primitive. The symlink refusal here DETECTS and NARROWS; it does
 *      not prevent. Nothing discharges this by ordering either: the user's own
 *      editor is a live vault writer throughout — that is precisely why the
 *      conditional publish exists — so a spec cannot rely on that concurrency
 *      in one place and deny it in another.
 *   B. CHECK-TO-PUBLISH WINDOW. The conditional publish compares immediately
 *      before the rename, so the window is small; a write landing inside it is
 *      still lost. Narrowed, not closed.
 *   C. UNWIND IDENTITY. A refusal removes the directories this call created and
 *      that are still empty. The removal is by PATH, and portable Node cannot
 *      bind it to the object the call created, so a directory concurrently
 *      substituted at that path can be removed instead. Damage is bounded to an
 *      EMPTY directory: removing a non-empty one fails by construction
 *      (`rmdirSync` reports `ENOTEMPTY` and the content survives — measured on
 *      Node 24.18), so concurrent user work is protected by shape, not by care.
 *
 * ADR-0004: just files. Nothing here starts a process, holds anything beyond
 * its call, or keeps state between calls.
 *
 * NO POLICY LIVES HERE. This module knows nothing about destinations, file
 * kinds or naming rules. It owns the filesystem discipline; the caller's
 * `admit` owns the rules. That separation is the point of the extraction: the
 * rules can be argued about and changed in one place, and none of those
 * arguments can weaken the filesystem discipline by accident.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { WienerdogError } = require('../errors');

/**
 * Flags for the temp file's ONE create-open.
 *
 * `O_EXCL | O_CREAT` is what closes defect 2 above: POSIX requires the open to
 * FAIL when the name already exists, and that includes a symlink, dangling or
 * not — so nothing planted at the name is followed, and a random name means
 * nothing can be planted there in the first place.
 *
 * `O_NOFOLLOW` is added when the platform has it, and `O_NOFOLLOW` DOES NOT
 * EXIST ON win32. The fallback is an explicit branch that names what is lost,
 * deliberately not the `fs.constants.X || 0` idiom, which makes a missing flag
 * look like a present one. Here what is lost is small — `O_EXCL` already
 * carries the refusal — but the platform condition is stated rather than
 * hidden, and no cross-platform equivalence is claimed.
 */
const TEMP_OPEN_FLAGS =
  fs.constants.O_WRONLY |
  fs.constants.O_CREAT |
  fs.constants.O_EXCL |
  (typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0);

/** How many random temp names to try before giving up. */
const TEMP_NAME_ATTEMPTS = 8;

/** @param {string} p @returns {import('node:fs').Stats|null} */
function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

/**
 * Split `rel` into segments and reject everything that is not a plain relative
 * path of plain names. A segment equal to `.` or `..`, an empty one (which is
 * what a leading, trailing or doubled separator produces, and what an absolute
 * path produces), or one containing the other platform's separator is a
 * CALLER-CONTRACT violation and throws — this is the caller handing over
 * something it should never have built, not a policy question.
 * @param {string} rel @returns {string[]}
 */
function splitRel(rel) {
  if (typeof rel !== 'string' || rel === '') {
    throw new WienerdogError('vault write: `rel` must be a non-empty string');
  }
  const segments = rel.split('/');
  for (const seg of segments) {
    if (seg === '') {
      throw new WienerdogError(`vault write: \`rel\` has an empty path segment: ${JSON.stringify(rel)}`);
    }
    if (seg === '.' || seg === '..') {
      throw new WienerdogError(`vault write: \`rel\` has a "${seg}" path segment: ${JSON.stringify(rel)}`);
    }
    if (seg.includes('\\')) {
      throw new WienerdogError(`vault write: \`rel\` has a path segment containing a separator: ${JSON.stringify(rel)}`);
    }
  }
  return segments;
}

/**
 * The vault-relative form `admit` is called with, and the form refusal reasons
 * name: always `/`-separated, so a caller's policy reads the same on every
 * platform.
 * @param {string} vaultReal @param {string} abs @returns {string}
 */
function toVaultRel(vaultReal, abs) {
  return path.relative(vaultReal, abs).split(path.sep).join('/');
}

/**
 * Resolve the target's parent by walking DOWN from the vault's resolved root,
 * following each component that exists. This is the step that sees defect 1: a
 * symlinked component resolves to wherever it actually points, so the path
 * handed to `admit` is where the write would LAND, not where it was addressed.
 * Components that do not exist yet cannot be symlinks and are joined lexically.
 * @param {string} vaultReal @param {string[]} dirSegments @returns {string}
 */
function resolveParent(vaultReal, dirSegments) {
  let resolved = vaultReal;
  for (const seg of dirSegments) {
    const next = path.join(resolved, seg);
    try {
      resolved = fs.realpathSync(next);
    } catch {
      resolved = next;
    }
  }
  return resolved;
}

/**
 * Write one file into the vault, deciding on the object rather than the name.
 *
 * The ONLY sanctioned way for this family to write a vault CONTENT file —
 * promoted notes and the dream report alike. (Git writes the vault's own `.git`
 * internals; that is not a content file and not this module's subject.)
 * Refuses a symlink it can see, refuses a destination its caller's policy
 * denies, and returns the bytes it published.
 *
 * @param {{vaultDir:string, rel:string, bytes:Buffer,
 *          admit:(resolvedRel:string)=>string|null,
 *          expect?:Buffer}} o
 *   vaultDir the vault root
 *   rel      vault-relative candidate path, segment-validated before use
 *   bytes    the content to publish
 *   admit    the caller's policy, applied to the RESOLVED vault-relative path,
 *            not to `rel`; returns a refusal reason or null. Injected so this
 *            module owns no policy and the caller owns no filesystem
 *   expect   the bytes the caller's decision was made against. TWO states only,
 *            never three: present, or OMITTED. Present means the write is
 *            abandoned unless the target still holds exactly these bytes at
 *            publish time; omitted means the caller asserts the target must not
 *            exist. An explicit `null` is rejected rather than guessed at,
 *            because it reads as either "must be absent" or "check nothing",
 *            and the second reading turns an intended create-only publish into
 *            an overwrite
 * @returns {{written:true, bytes:Buffer, sha256:string}
 *          |{written:false, reason:string}}
 *   bytes  the exact buffer published — the caller acts on THESE, never on a
 *          fresh read of the path
 *   sha256 a verification digest over the returned bytes. It is this module's
 *          own integrity value and carries no meaning in any other system
 *
 * Refusal is by RETURN, never by exception: every policy, containment, symlink
 * and `expect` failure — and every unexpected filesystem error — yields
 * `{written:false, reason}`. The only throw is a caller-contract violation: a
 * `rel` that is not segment-valid, a missing `admit`, a `bytes` that is not a
 * Buffer, an `expect` that is present and is not a Buffer.
 */
function writeIntoVault(o) {
  const opts = o || {};
  if (typeof opts.vaultDir !== 'string' || opts.vaultDir === '') {
    throw new WienerdogError('vault write: `vaultDir` must be a non-empty string');
  }
  if (typeof opts.admit !== 'function') {
    throw new WienerdogError('vault write: `admit` must be a function (this module owns no policy)');
  }
  if (!Buffer.isBuffer(opts.bytes)) {
    throw new WienerdogError('vault write: `bytes` must be a Buffer');
  }
  const conditional = opts.expect !== undefined;
  if (conditional && !Buffer.isBuffer(opts.expect)) {
    throw new WienerdogError(
      'vault write: `expect` must be a Buffer or be OMITTED — omission is how a caller says the target must not exist'
    );
  }
  const segments = splitRel(opts.rel);

  // The caller's buffer is copied ONCE, here. What is written and what is
  // returned are the same object, so a caller that mutates its own buffer after
  // the call cannot make the return disagree with what landed on disk.
  const payload = Buffer.from(opts.bytes);

  /** @type {string[]} directories this call created, shallowest first */
  const created = [];
  /** @type {string|null} */
  let tmp = null;
  /** @type {string} */
  let vaultReal;

  /**
   * Total refusal (H7): nothing this call made survives it, and where something
   * does, the reason SAYS SO. The staging file goes first, so a directory this
   * call created is not held non-empty by our own leftover.
   *
   * Three buckets, and the split exists because a refusal reason that asserts
   * more than the platform said is exactly the overclaiming this package exists
   * to stop:
   *
   *   - The staging file could not be removed. Measured: with the parent
   *     directory concurrently made unwritable between the staging open and the
   *     refusal, `rmSync` fails and the staged bytes stay in the vault. An
   *     earlier form swallowed that error on the theory that "the rmdir below
   *     reports the consequence" — but when no directory was created there IS
   *     no rmdir, so nothing reported it, and what stayed behind was the
   *     REFUSED payload, sitting where a consumer's later `git add -A` would
   *     sweep it into a commit. It is named now.
   *   - `ENOTEMPTY` (`EEXIST` where a platform spells it that way) is the case
   *     H9's rule is about: the directory holds something, so it is LEFT IN
   *     PLACE. Note that this states WHAT IS TRUE, not why — the usual cause is
   *     a concurrent writer's work, which must not be deleted, but our own
   *     unremovable staging file can produce it too, and the bucket above is
   *     what tells those apart.
   *   - Any OTHER error means the removal failed for a reason we do not know,
   *     and saying "no longer empty" there would be a guess stated as a fact.
   *
   * `ENOENT` is in none of them: it is already gone, so nothing is retained.
   * @param {string} reason @returns {{written:false, reason:string}}
   */
  const refuse = (reason) => {
    /** @type {string|null} */
    let staleStaging = null;
    if (tmp) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch (e) {
        staleStaging = `${toVaultRel(vaultReal, tmp)} (${(e && e.code) || (e && e.message)})`;
      }
      tmp = null;
    }
    /** @type {string[]} */
    const acquiredContent = [];
    /** @type {string[]} */
    const unremovable = [];
    for (let i = created.length - 1; i >= 0; i -= 1) {
      try {
        fs.rmdirSync(created[i]);
      } catch (e) {
        const code = e && e.code;
        if (code === 'ENOENT') continue;
        if (code === 'ENOTEMPTY' || code === 'EEXIST') acquiredContent.push(created[i]);
        else unremovable.push(`${toVaultRel(vaultReal, created[i])} (${code || (e && e.message)})`);
      }
    }
    /** @param {string[]} list */
    const rel = (list) => list.map((p) => toVaultRel(vaultReal, p)).join(', ');
    let suffix = '';
    if (staleStaging) {
      suffix += ` (a file this write staged could not be removed and was left in the vault: ${staleStaging})`;
    }
    if (acquiredContent.length) {
      suffix += ` (a directory this write created is no longer empty and was left in the vault: ${rel(acquiredContent)})`;
    }
    if (unremovable.length) {
      suffix += ` (a directory this write created could not be removed and was left in the vault: ${unremovable.join(', ')})`;
    }
    return { written: false, reason: `${reason}${suffix}` };
  };

  try {
    try {
      vaultReal = fs.realpathSync(opts.vaultDir);
    } catch (e) {
      return refuse(`the vault root could not be resolved (${(e && e.code) || (e && e.message)})`);
    }
    const vaultStat = lstatOrNull(vaultReal);
    if (!vaultStat || !vaultStat.isDirectory()) {
      return refuse('the vault root is not a directory');
    }

    const dirSegments = segments.slice(0, -1);
    const leaf = segments[segments.length - 1];
    const targetLexical = path.join(vaultReal, ...segments);

    // ── Decide on the RESOLVED destination ──────────────────────────────────
    const resolvedAbs = path.join(resolveParent(vaultReal, dirSegments), leaf);
    const resolvedRel = toVaultRel(vaultReal, resolvedAbs);

    // Containment is NECESSARY and never SUFFICIENT: it rejects escapes from
    // the vault, not writes into a denied part of it. `admit` below is what
    // admits.
    if (resolvedRel === '' || resolvedRel.startsWith('../') || resolvedRel === '..' || path.isAbsolute(resolvedRel)) {
      return refuse(`${opts.rel} resolves outside the vault (to ${resolvedAbs})`);
    }

    // The caller's policy judges where the write would LAND. Called before any
    // filesystem mutation, so a denied write changes nothing at all.
    const denial = opts.admit(resolvedRel);
    if (denial) return refuse(`${resolvedRel} was refused by the caller's policy: ${denial}`);

    // ── Refuse to write on or through a symlink ─────────────────────────────
    // DETECTION AND NARROWING, not prevention: a component replaced between
    // this walk and the open is followed, and portable Node cannot close that
    // class. See residual A in the module header.
    /** @type {string[]} */
    const missing = [];
    let cursor = vaultReal;
    for (const seg of dirSegments) {
      cursor = path.join(cursor, seg);
      const ls = lstatOrNull(cursor);
      if (ls === null) {
        missing.push(cursor);
        continue;
      }
      if (ls.isSymbolicLink()) {
        return refuse(`${toVaultRel(vaultReal, cursor)} is a symlink; nothing is written through one`);
      }
      if (!ls.isDirectory()) {
        return refuse(`${toVaultRel(vaultReal, cursor)} is not a directory`);
      }
    }
    const targetBefore = lstatOrNull(targetLexical);
    if (targetBefore && targetBefore.isSymbolicLink()) {
      return refuse(`${resolvedRel} is a symlink; nothing is written onto one`);
    }
    if (targetBefore && !targetBefore.isFile()) {
      return refuse(`${resolvedRel} is not a regular file`);
    }

    // ── Create the missing parent chain ─────────────────────────────────────
    // A promoted note may be the first file in a new subdirectory, and a caller
    // that pre-created parents would be writing the vault outside this
    // primitive.
    for (const dir of missing) {
      try {
        fs.mkdirSync(dir);
        created.push(dir);
      } catch (e) {
        if (!e || e.code !== 'EEXIST') {
          return refuse(`${toVaultRel(vaultReal, dir)} could not be created (${(e && e.code) || (e && e.message)})`);
        }
        // Someone else created it first, so it is not ours to remove — and it
        // has to pass the same check every pre-existing component passed.
        const ls = lstatOrNull(dir);
        if (!ls || ls.isSymbolicLink() || !ls.isDirectory()) {
          return refuse(`${toVaultRel(vaultReal, dir)} is not a directory`);
        }
      }
    }

    // ── Stage the bytes in a temp nothing can have planted ──────────────────
    const parentDir = path.dirname(targetLexical);
    let fd = null;
    for (let attempt = 0; ; attempt += 1) {
      const candidate = path.join(parentDir, `.wienerdog-vault-write.${crypto.randomBytes(8).toString('hex')}.tmp`);
      try {
        // The mode is Node's ordinary default for a new file, so the umask
        // decides: a note this call creates is neither more restricted nor more
        // exposed than one the user creates in the same directory by hand.
        fd = fs.openSync(candidate, TEMP_OPEN_FLAGS, 0o666);
        tmp = candidate;
        break;
      } catch (e) {
        if (e && e.code === 'EEXIST' && attempt < TEMP_NAME_ATTEMPTS) continue;
        return refuse(`${resolvedRel} could not be staged (${(e && e.code) || (e && e.message)})`);
      }
    }
    try {
      let off = 0;
      while (off < payload.length) off += fs.writeSync(fd, payload, off, payload.length - off, null);
    } catch (e) {
      try {
        fs.closeSync(fd);
      } catch {
        /* the failure above is what gets reported */
      }
      return refuse(`${resolvedRel} could not be staged (${(e && e.code) || (e && e.message)})`);
    }
    try {
      fs.closeSync(fd);
    } catch (e) {
      return refuse(`${resolvedRel} could not be staged (${(e && e.code) || (e && e.message)})`);
    }

    // ── The conditional publish ─────────────────────────────────────────────
    // The last acts before the rename, in this order and as close to it as this
    // layer can put them. The window between them and the rename is NARROWED,
    // not closed (residual B).
    const targetNow = lstatOrNull(targetLexical);
    if (targetNow && targetNow.isSymbolicLink()) {
      return refuse(`${resolvedRel} is a symlink; nothing is written onto one`);
    }
    if (targetNow && !targetNow.isFile()) {
      return refuse(`${resolvedRel} is not a regular file`);
    }
    if (conditional) {
      if (!targetNow) {
        return refuse(`${resolvedRel} no longer holds the bytes this write was decided against (it does not exist)`);
      }
      let onDisk;
      try {
        onDisk = fs.readFileSync(targetLexical);
      } catch (e) {
        return refuse(`${resolvedRel} could not be re-read before publishing (${(e && e.code) || (e && e.message)})`);
      }
      if (Buffer.compare(onDisk, opts.expect) !== 0) {
        return refuse(`${resolvedRel} no longer holds the bytes this write was decided against`);
      }
    } else if (targetNow) {
      return refuse(`${resolvedRel} already exists and this write asserted it would not`);
    }

    // The rename is the publish. A reader of the target sees the previous
    // content or the complete new content, never a prefix: the bytes are all in
    // the temp object before the name ever points at it.
    try {
      fs.renameSync(tmp, targetLexical);
    } catch (e) {
      return refuse(`${resolvedRel} could not be published (${(e && e.code) || (e && e.message)})`);
    }
    tmp = null; // the rename IS the removal on this path

    return {
      written: true,
      bytes: payload,
      sha256: crypto.createHash('sha256').update(payload).digest('hex'),
    };
  } catch (e) {
    // An unexpected filesystem error is a REFUSAL, not a throw: a caller has
    // exactly one failure shape to handle, and the unwind still runs.
    //
    // The rethrow below rests on an ORDERING INVARIANT, written down because it
    // is not visible from here: every `WienerdogError` this module raises is
    // raised during argument validation, before a single byte of the vault is
    // touched, and the one piece of CALLER code that runs inside this `try` —
    // `admit` — is called before the first `mkdir`. So there is never anything
    // to unwind on this path. Move `admit` (or any throw) after the chain
    // creation and that stops being true: the throw would then escape past the
    // unwind, leaving directories behind and handing the caller a second
    // failure shape H7 says it does not have.
    if (e instanceof WienerdogError) throw e;
    return refuse(`the write failed unexpectedly (${(e && e.code) || (e && e.message)})`);
  }
}

module.exports = { writeIntoVault };
