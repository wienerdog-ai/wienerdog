'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WienerdogError } = require('./errors');

/**
 * install-manifest.json shape:
 *   { version: 1, createdAt: ISO, entries: [
 *       {kind: 'dir'|'file', path: string, hash?: string}   // created by us
 *   ] }
 * hash (files only) is the sha256 of the content we wrote, used to detect
 * user modifications on uninstall.
 *
 * Adapters add three more kinds (WP-006), each with precise reverse semantics:
 *   {kind:'symlink', path, target?}                 — a symlink we created;
 *                                                     `target` is the source it
 *                                                     must still resolve to
 *                                                     (absent on legacy entries);
 *                                                     origin? is 'created' or
 *                                                     'adopted' — whether we made
 *                                                     the link or found it on
 *                                                     disk; dev?/ino? are the
 *                                                     link's lstat identity at
 *                                                     creation time, as decimal
 *                                                     strings (create site only)
 *   {kind:'managed-block', path, createdFile:bool,
 *    sepBefore?:string, sepAfter?:string,
 *    anchorBefore?:string}                          — a sentinel block we wrote
 *                                                     into a (maybe user-owned) file;
 *                                                     sepBefore/sepAfter (WP-147) are
 *                                                     the exact separator bytes the
 *                                                     last insertion added; anchorBefore
 *                                                     is the insertionAnchor() of the
 *                                                     content that preceded them
 *   {kind:'settings-entry', path, createdFile:bool, commands:string[]}
 *                                                   — hook commands we merged into
 *                                                     a JSON settings file
 *
 * Scheduler adds one more kind (WP-013):
 *   {kind:'scheduler-entry', path, unload?:string[]} — an OS-native schedule file
 *                                                     (launchd plist / systemd unit)
 *                                                     whose reverse runs the stored
 *                                                     `unload` argv (best-effort) then
 *                                                     removes the file. `unload` is
 *                                                     omitted/null when no OS
 *                                                     unregistration is needed.
 *
 * Vendoring adds one more kind (WP-042):
 *   {kind:'vendored-tree', path}                    — the vendored app tree
 *                                                     (~/.wienerdog/app), removed
 *                                                     recursively on uninstall.
 *
 * @typedef {{kind: string, path: string, hash?: string, createdFile?: boolean,
 *            commands?: string[], unload?: string[], sepBefore?: string,
 *            origin?: string, dev?: string, ino?: string,
 *            sepAfter?: string, anchorBefore?: string}} ManifestEntry
 * @typedef {{version: number, createdAt: string, entries: ManifestEntry[]}} Manifest
 */

const BEGIN_SENTINEL = '<!-- wienerdog:begin -->';
const END_SENTINEL = '<!-- wienerdog:end -->';

/** Table M (WP-147): the ONLY leading-separator values the forward step can
 *  emit ('' createdFile; '\n' append onto newline-terminated content; '\n\n'
 *  append onto unterminated content). The manifest is UNTRUSTED input, so
 *  reverseManagedBlock accepts sepBefore only from this allowlist (and sepAfter
 *  only as '\n'); anything else degrades to the legacy conservative strip. */
const SEP_BEFORE_OK = new Set(['', '\n', '\n\n']);

/** The bounded context window an insertion anchor covers, in JS string units
 *  (UTF-16 code units — both sides slice JS strings read with 'utf8'). Bounded
 *  ON PURPOSE: an unbounded/full-prefix anchor breaks on any edit anywhere above
 *  the block, which is the COMMON case; 256 is roughly three to four lines of
 *  markdown, enough to identify the block's neighbourhood and short enough that a
 *  distant edit does not disturb it. */
const ANCHOR_WINDOW = 256;
/** An anchor is a sha256 hex digest and nothing else. Read from the UNTRUSTED
 *  manifest, so the shape is checked before it is compared (Table N). */
const ANCHOR_HEX = /^[0-9a-f]{64}$/;

/** Hash of the last ANCHOR_WINDOW characters of the content that immediately
 *  preceded an inserted separator. HASHED, not stored raw: the manifest is a
 *  plaintext file and must never carry a copy of the user's document text.
 *  @param {string} prefix @returns {string} 64-char lowercase hex */
function insertionAnchor(prefix) {
  return crypto.createHash('sha256').update(String(prefix).slice(-ANCHOR_WINDOW), 'utf8').digest('hex');
}

/** Does the recorded anchor prove the block is still at its RECORDED POSITION?
 *  A hash match alone does NOT: it proves only that `candidate` ends with the
 *  same window we recorded, and a window that occurs twice in the user's own
 *  document has two positions that satisfy it (Table Q row Q10 — measured, no
 *  forgery and no hash collision needed). So the match is paired with a
 *  UNIQUENESS test. Both together are the position proof; either alone is not.
 *  @param {ManifestEntry} entry
 *  @param {string} candidate  the content that would remain in front of the block
 *  @param {string} userText   the RECONSTRUCTED user document: `candidate + after`,
 *    i.e. what uninstall is about to leave on disk. It must NOT be the whole
 *    `content`, nor `content` with only the block excised — both still hold
 *    Wienerdog's own separator bytes, which manufacture false ambiguity on
 *    newline-only content (Table Q row Q13, measured).
 *  @returns {boolean} */
function anchorProvesPosition(entry, candidate, userText) {
  const rec = entry.anchorBefore;
  // LEGACY (absent or not a sha256 hex digest) → shipped 0.12.0 behaviour.
  if (typeof rec !== 'string' || !ANCHOR_HEX.test(rec)) return true;
  if (insertionAnchor(candidate) !== rec) return false;
  const win = candidate.slice(-ANCHOR_WINDOW);
  // The empty prefix exists at exactly one offset (0), so it is self-locating.
  if (win === '') return true;
  const first = userText.indexOf(win);
  return first !== -1 && userText.indexOf(win, first + 1) === -1;
}

/** lstat identity of a SYMLINK, as decimal strings (bigint: a 64-bit inode
 *  exceeds Number.MAX_SAFE_INTEGER, and BigInt is not JSON-serializable).
 *  Returns null when the path is not a symlink, is unreadable, or the platform
 *  cannot supply a non-zero (dev, ino) pair — see Table P rule S-2.
 *  @param {string} linkPath @returns {{dev: string, ino: string}|null} */
function linkIdentity(linkPath) {
  try {
    const st = fs.lstatSync(linkPath, { bigint: true });
    if (!st.isSymbolicLink()) return null;
    if (st.dev === 0n || st.ino === 0n) return null;
    return { dev: String(st.dev), ino: String(st.ino) };
  } catch {
    return null;
  }
}

/** Locate the SINGLE managed block by FULL-LINE sentinel match (a line whose
 *  trimmed content equals the sentinel). Returns {begin, end} character offsets
 *  where `begin` = start of the BEGIN line and `end` = position just past the END
 *  sentinel text on its line (matching the historical slice offsets), OR null when
 *  no sentinel line exists. Throws WienerdogError when the markers are AMBIGUOUS:
 *  more than one BEGIN or END line, or an END line before the BEGIN line, or exactly
 *  one of the two present — refuse to edit rather than guess and swallow user text.
 *  Deliberately duplicated in src/adapters/shared.js — the two modules must not
 *  cross-depend (manifest.js is core; adapters/ sits above it).
 *  @param {string} content @param {string} what  file path, for the error message
 *  @returns {{begin:number, end:number}|null} */
function locateManagedBlock(content, what) {
  const lines = content.split('\n');
  const starts = []; let off = 0;
  for (const l of lines) { starts.push(off); off += l.length + 1; }
  const begins = []; const ends = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === BEGIN_SENTINEL) begins.push(i);
    else if (t === END_SENTINEL) ends.push(i);
  }
  if (begins.length === 0 && ends.length === 0) return null;
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0]) {
    throw new WienerdogError(`ambiguous wienerdog managed-block markers in ${what} — refusing to edit (resolve by hand)`);
  }
  const b = begins[0], e = ends[0];
  // `end` = right after the END sentinel text on its line (excludes trailing \n),
  // matching the historical `indexOf(END) + END.length` for a clean written block.
  const end = starts[e] + lines[e].indexOf(END_SENTINEL) + END_SENTINEL.length;
  return { begin: starts[b], end };
}

/** @param {string} p @returns {boolean} */
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** @param {string} p @returns {boolean} */
function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} p @returns {string} sha256 hex of the file's current content. */
function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

/** Deterministic sha256 fingerprint of a directory tree, over RAW BYTES.
 *  Every field is length-framed; node type is a 1-byte tag (d/f/l/s) from the
 *  Dirent (lstat semantics — never dereferenced). Any traversal/read error →
 *  return null (fail closed; null can never equal a recorded string hash).
 *  @param {string} root @returns {string|null} hex digest, or null if unreadable */
function hashDir(root) {
  const h = crypto.createHash('sha256');
  const SEP = Buffer.from('/'); // 0x2F — path join AND framed-path separator (raw byte)
  const walk = (dirBuf, prefixBuf) => {
    const ents = fs.readdirSync(dirBuf, { withFileTypes: true, encoding: 'buffer' });
    ents.sort((x, y) => Buffer.compare(x.name, y.name)); // deterministic byte-wise order
    for (const e of ents) {
      const nameBuf = e.name;                                  // RAW entry-name bytes (Buffer)
      const rpBuf = prefixBuf ? Buffer.concat([prefixBuf, SEP, nameBuf]) : nameBuf;
      const fullBuf = Buffer.concat([dirBuf, SEP, nameBuf]);   // Buffer path for on-disk reads
      if (e.isDirectory()) {
        h.update('d'); h.update(`${rpBuf.length}:`); h.update(rpBuf); walk(fullBuf, rpBuf);
      } else if (e.isFile()) {
        const dataBuf = fs.readFileSync(fullBuf);
        h.update('f'); h.update(`${rpBuf.length}:`); h.update(rpBuf);
        h.update(`${dataBuf.length}:`); h.update(dataBuf);
      } else if (e.isSymbolicLink()) {
        const linkBuf = fs.readlinkSync(fullBuf, { encoding: 'buffer' });
        h.update('l'); h.update(`${rpBuf.length}:`); h.update(rpBuf);
        h.update(`${linkBuf.length}:`); h.update(linkBuf);
      } else {
        h.update('s'); h.update(`${rpBuf.length}:`); h.update(rpBuf);
      }
    }
  };
  try { walk(Buffer.from(root), null); } catch { return null; }
  return h.digest('hex');
}

/** @param {string} p @returns {boolean} true if p is an existing symlink. */
function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Reverse a 'symlink' entry: unlink ONLY when the link still resolves to the
 * source we recorded. A legacy (target-less) entry and a target mismatch are
 * both PRESERVED and reported as skipped — never unlinked.
 * @param {ManifestEntry} entry  {kind:'symlink', path, target?}
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 * @param {string[]} skillsRoots the harness skills roots (row 4 OWNED gate)
 * @param {{identity?: function}} [opts]  test seam only — see D4
 */
function reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots, opts = {}) {
  const identityOf = opts.identity || linkIdentity;   // test seam only
  const L = entry.path;
  const T = entry.target;
  // Row 1: not a symlink (real file/dir, or already gone) — never ours to delete.
  if (!isSymlink(L)) {
    skipped.push(L);
    return;
  }
  // Row 2: LEGACY (target-less) entry — ownership is unprovable, preserve
  // unconditionally (owner ruling 2026-08-01). No backfill exists or ever will.
  if (typeof T !== 'string' || T === '') {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 3: the link must PROVE it still resolves to the source we recorded.
  // sameResolvedDir is realpath-based (semantic, follows the link) and is itself
  // fail-closed — an unresolvable side returns false, which lands HERE, in preserve.
  // There is deliberately NO second, link-text comparison: WP-153 shipped one, and
  // WP-symlink-lexical-fallback-removal dropped it because raw-text equality is the
  // weaker proof and the manifest is UNTRUSTED — a recorded target may narrow this
  // delete, never authorize one the semantic proof refuses (e.g. a relative recorded
  // target, which Wienerdog never writes, matched the link text while realpath did
  // not). Strictly narrowing: every input this now preserves was previously deleted.
  if (!sameResolvedDir(L, T)) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 4: a target match is NOT delete authority — the manifest is untrusted, so
  // an attacker can forge a (path, target) pair. Require the STRUCTURAL ownership
  // proof reverseCopiedSkill uses: wienerdog-* basename AND parent realpath-equal
  // to a harness skills root.
  const parentIsRoot = skillsRoots.some((root) => sameResolvedDir(path.dirname(L), root));
  if (!path.basename(L).startsWith('wienerdog-') || !parentIsRoot) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 4a: ADOPTED — the link was already on disk when we first recorded it, so
  // it is the USER's, not ours, however exactly it matches. Preserve.
  if (entry.origin === 'adopted') {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 4b: IDENTITY — when we recorded a (dev, ino) pair, the link on disk must
  // still BE that file object. A delete-and-recreate gets a new inode, so a user's
  // same-source replacement no longer passes for ours. Fail closed on any doubt.
  // A PARTIAL pair (one of the two) is a shape the forward step never writes, so
  // it is unverifiable, not absent — preserve (Table P rule S-4, Table S).
  const hasDev = typeof entry.dev === 'string';
  const hasIno = typeof entry.ino === 'string';
  if (hasDev || hasIno) {
    const id = hasDev && hasIno ? identityOf(L) : null;
    if (id === null || id.dev !== entry.dev || id.ino !== entry.ino) {
      process.stderr.write(
        `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
      );
      skipped.push(L);
      return;
    }
  }
  // Row 5: OWNED, in-namespace, and provably resolves to our recorded source.
  if (!dryRun) fs.unlinkSync(L);
  removedSet.add(L);
  removed.push(L);
}

/**
 * Reverse a 'managed-block' entry: strip the block plus ONLY the separator
 * bytes the forward step recorded on the entry (`sepBefore`/`sepAfter`;
 * legacy default one newline each side), and only when the strip preserves
 * a user line boundary — never fuse the user's surrounding lines (audit
 * A13, WP-147). The metadata is UNTRUSTED (Table M): values outside the
 * emittable vocabulary degrade to the same legacy conservative strip.
 * Delete the file only if we created it and nothing else remains.
 *
 * F30 (delete-time binding): the caller opens the O_NOFOLLOW-verified regular
 * file once and passes the fd + its canonical path `target`; read+modify+write
 * go through that SAME fd so the final-component identity cannot change between
 * read and write (a swap-to-symlink would already have tripped O_NOFOLLOW at
 * open). The `target` is a canonical parent + O_NOFOLLOW-checked basename, used
 * only for the createdFile delete (which needs a pathname, not an fd).
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 * @param {number} fd  open (O_RDWR|O_NOFOLLOW, or O_RDONLY under dryRun) fd
 * @param {string} target  canonical parent + O_NOFOLLOW-checked basename
 */
function reverseManagedBlock(entry, dryRun, removed, skipped, removedSet, fd, target) {
  let content;
  try {
    content = fs.readFileSync(fd, 'utf8'); // reads the whole file (fresh fd @ offset 0)
  } catch {
    skipped.push(entry.path);
    return;
  }
  let span;
  try {
    span = locateManagedBlock(content, entry.path); // may throw on ambiguity
  } catch (err) {
    // Ambiguous markers → do NOT guess and delete user text; skip this entry and
    // keep the uninstall going (the reverse loop has no try/catch of its own).
    process.stderr.write(`wienerdog: ${err.message}; leaving ${entry.path} in place\n`);
    skipped.push(entry.path);
    return;
  }
  if (span === null) {
    // User removed the block themselves — nothing to reverse.
    skipped.push(entry.path);
    return;
  }
  let before = content.slice(0, span.begin);
  let after = content.slice(span.end);

  // The manifest is UNTRUSTED (WP-144). Accept ONLY values the forward step can
  // actually emit; anything else is treated exactly as a legacy entry. Table M.
  let sepBefore = entry.sepBefore;
  let sepAfter = entry.sepAfter;
  if (!SEP_BEFORE_OK.has(sepBefore) || sepAfter !== '\n') {
    if (sepBefore !== undefined || sepAfter !== undefined) {
      process.stderr.write(
        `wienerdog: ignoring out-of-vocabulary separator metadata on ${entry.path} — ` +
        'stripping conservatively\n'
      );
    }
    sepBefore = '\n';
    sepAfter = '\n';
  }

  // Trailing terminator: the block's own line end is always Wienerdog's — remove it.
  if (after.startsWith(sepAfter)) after = after.slice(sepAfter.length);
  else if (after.startsWith('\n')) after = after.slice(1); // legacy fallback

  // Leading separator: remove ONLY the exact bytes we added, and ONLY when doing so
  // preserves a line boundary — otherwise we would fuse two user lines (the A13 bug).
  if (sepBefore.length > 0 && before.endsWith(sepBefore)) {
    const candidate = before.slice(0, before.length - sepBefore.length);
    // The at-EOF disjunct is GATED on sepBefore === '\n\n' — i.e. on the forward
    // step having supplied the file's terminator itself. When sepBefore is '\n'
    // the file was already newline-terminated by the USER, so that newline is
    // theirs and survives even with nothing after the block.
    const weSuppliedTerminator = sepBefore === '\n\n';

    // (1) OWNERSHIP RE-CHECK. We wrote '\n\n' ONLY because the content did not end
    //     with a newline. If `candidate` ends with one now, the block is NOT at its
    //     recorded append position — the user moved it — and that newline is theirs.
    const ownershipOk = !weSuppliedTerminator || !candidate.endsWith('\n');

    // (2) ANTI-FUSION. Never remove a newline that is the boundary between two user
    //     lines.
    const noFusion =
      candidate === '' ||
      candidate.endsWith('\n') ||
      (weSuppliedTerminator && after === '') ||
      after.startsWith('\n');

    // (3) INSERTION ANCHOR + UNIQUENESS. `candidate` is the content that would
    //     remain in front of the block. It must hash to the anchor we recorded
    //     when we wrote sepBefore, AND that window must occur exactly once in the
    //     user's document — otherwise a block moved to a second occurrence of the
    //     same window passes the hash at the wrong position. An ABSENT or
    //     malformed anchor is a LEGACY entry: shipped behaviour, never stricter.
    //     The corpus is `candidate + after` — the document uninstall is about to
    //     leave — NOT `content`, which still holds our own separator and makes
    //     newline-only files look ambiguous (Table Q row Q13).
    const anchorOk = anchorProvesPosition(entry, candidate, candidate + after);

    // ALL THREE are required, and the anchor is a CONJUNCT — never a disjunct.
    // It may only ever withhold a strip the other two would have allowed
    // (Table N); it may never authorise one they refused.
    if (anchorOk && ownershipOk && noFusion) before = candidate;
  }
  const remaining = before + after;

  if (entry.createdFile === true && remaining.trim() === '') {
    if (!dryRun) fs.rmSync(target, { force: true });
    removedSet.add(entry.path);
  } else if (!dryRun) {
    const buf = Buffer.from(remaining);
    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, buf, 0, buf.length, 0);
  }
  removed.push(entry.path);
}

/**
 * Reverse a 'settings-entry' entry: drop the hook commands we merged in, then
 * prune any now-empty groups / event arrays / the hooks key. Delete the file
 * only if we created it and it is now `{}`.
 *
 * F30 (delete-time binding): the caller opens the O_NOFOLLOW-verified regular
 * file once and passes the fd + its canonical path `target`; read+modify+write
 * go through that SAME fd (the delete needs the pathname `target`).
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 * @param {number} fd  open (O_RDWR|O_NOFOLLOW, or O_RDONLY under dryRun) fd
 * @param {string} target  canonical parent + O_NOFOLLOW-checked basename
 */
function reverseSettingsEntry(entry, dryRun, removed, skipped, removedSet, fd, target) {
  let raw;
  try {
    raw = fs.readFileSync(fd, 'utf8'); // reads the whole file (fresh fd @ offset 0)
  } catch {
    skipped.push(entry.path);
    return;
  }
  const settings = JSON.parse(raw);
  const commands = new Set(entry.commands || []);
  const hooks = settings && typeof settings === 'object' ? settings.hooks : null;
  if (hooks && typeof hooks === 'object') {
    for (const event of Object.keys(hooks)) {
      if (!Array.isArray(hooks[event])) continue;
      hooks[event] = hooks[event]
        .map((group) => {
          if (group && Array.isArray(group.hooks)) {
            group.hooks = group.hooks.filter((h) => !(h && commands.has(h.command)));
          }
          return group;
        })
        .filter((group) => !(group && Array.isArray(group.hooks) && group.hooks.length === 0));
      if (hooks[event].length === 0) delete hooks[event];
    }
    if (Object.keys(hooks).length === 0) delete settings.hooks;
  }

  if (entry.createdFile === true && Object.keys(settings).length === 0) {
    if (!dryRun) fs.rmSync(target, { force: true });
    removedSet.add(entry.path);
  } else if (!dryRun) {
    const buf = Buffer.from(`${JSON.stringify(settings, null, 2)}\n`);
    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, buf, 0, buf.length, 0);
  }
  removed.push(entry.path);
}

/**
 * Reverse a 'scheduler-entry' entry: RE-DERIVE the unregister argv from the
 * schedule file's basename identity + platform (never the stored `unload` —
 * audit A8, ADR-0027, WP-145), run it best-effort, then remove the file iff it
 * is a recognized Wienerdog schedule file inside a known scheduler root. The
 * stored `unload` remains on entries for scheduler/status.js display only.
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 * @param {{platform?:NodeJS.Platform, schedulerRoots?:string[]}} [opts]  computed
 *   once in reverse(); defaults keep the exported function directly callable.
 */
function reverseSchedulerEntry(entry, dryRun, removed, skipped, removedSet, opts = {}) {
  const platform = opts.platform || process.platform;
  const schedulerRoots = opts.schedulerRoots || [];
  // F33 (WP-145 fix-pass): VALIDATE BEFORE SPAWN. The first-pass derived the
  // unregister argv and fired `schedulerSpawn` BEFORE the root/basename gate, so
  // a recognized-but-out-of-root entry (e.g. /tmp/ai.wienerdog.evil.plist) ran
  // `launchctl bootout` anyway — violating this WP's own "out-of-root spawns
  // nothing". Bound the entry FIRST: only a recognized wienerdog schedule file
  // inside a known scheduler root (LaunchAgents / systemd user dir /
  // <core>/schedules) may be unregistered or removed. Out-of-root or an
  // unrecognized basename → preserve, derive nothing, spawn nothing.
  if (!withinSchedulerRoot(entry.path, schedulerRoots)) {
    process.stderr.write(`wienerdog: preserving ${entry.path} — not a recognized Wienerdog schedule file\n`);
    skipped.push(entry.path);
    return;
  }
  // Only now: audit A8 / ADR-0027 — the manifest is UNTRUSTED, so the stored
  // `entry.unload` argv is NEVER read or executed (a poisoned
  // {unload:['/bin/sh','-c','…']} spawns nothing). The unregister command is
  // re-derived, code-owned, from the file's basename identity + platform
  // (fully-anchored regexes; nothing from the manifest reaches the argv).
  // Required lazily to keep manifest.js free of a static scheduler dependency
  // (generators.js requires this module — a static import would cycle).
  const argv = require('../scheduler/generators').deriveUnloadArgv(entry.path, platform);
  if (argv) {
    if (dryRun) {
      process.stdout.write(`wienerdog: would run: ${argv.join(' ')}\n`);
    } else {
      // Best-effort: the entry may already be unloaded. Ignore non-zero/errors;
      // the goal is the file removal below. Routes through the single scheduler
      // mutation chokepoint (WP-071) so the test guard covers this path too.
      try {
        require('../scheduler/spawn').schedulerSpawn(argv);
      } catch {
        /* ignore — unregistration is best-effort */
      }
    }
  }
  if (!isFile(entry.path)) {
    skipped.push(entry.path);
    return;
  }
  if (!dryRun) fs.rmSync(entry.path, { force: true });
  removedSet.add(entry.path);
  removed.push(entry.path);
}

/**
 * Is `p` a Wienerdog-named schedule file inside one of the known scheduler
 * roots? Realpath-aware containment (via `contains`) plus a basename check —
 * both must hold, so a poisoned scheduler-entry pointing at an arbitrary file
 * (even inside a root, e.g. a foreign com.apple.*.plist) is preserved (WP-145).
 * @param {string} p @param {string[]} roots @returns {boolean}
 */
function withinSchedulerRoot(p, roots) {
  if (!roots.some((root) => contains(root, p))) return false;
  const base = path.basename(p);
  return /^ai\.wienerdog\..*\.plist$/.test(base) || /^wienerdog-.*\.(timer|service|xml)$/.test(base);
}

/**
 * Table R row R4 (WP-scheduler-replay-manifest-independent, owner item 1): what
 * happens to a recognized schedule file on disk that NO manifest entry records.
 * `'unload-and-remove'` unloads it and then deletes it; `'unload-only'` unloads
 * it and leaves the file. The cell is applied at exactly ONE site — phase D5b in
 * `reverse()` — plus the disclosure that mirrors it, so reversing the owner
 * recommendation is a one-token edit. It is a CEILING, not a floor: Table D row
 * D11 (another manifest record owns the file) and Table D row D12 (the file is
 * vault-resident) both override it toward preservation whatever it says.
 * @type {'unload-and-remove'|'unload-only'}
 */
const DISCOVERED_DISPOSITION = 'unload-and-remove';

/**
 * Table R row R9 — `R-preserved-reloadable-plist`, the residual the removal
 * narrowing leaves behind. macOS loads `~/Library/LaunchAgents` at every GUI
 * login, so a plist that was unloaded but PRESERVED comes back at the next login
 * and then fails forever against a core that is gone. The mitigation is
 * mandatory rather than optional: the user is told, in plain language and BEFORE
 * consenting, what will happen and what to do about it.
 * @type {string}
 */
const R9_LOGIN_RELOAD_WARNING =
  'This scheduled job will start again the next time you log in, until you delete that file yourself.';

/**
 * Table D row D15 — THE one resolution rule, over every path this package
 * resolves: each discovery root, each candidate, D12's vault path, and phase
 * D5b's removal re-check. `contains` (below) catches every realpath error and
 * returns `false`, which for a RECORDED entry means *preserve* (correct) but for
 * discovery would mean *silently drop a live job* — the opposite direction. So
 * discovery does not use it, and this resolver keeps the three outcomes apart:
 * `ENOENT`/`ENOTDIR` is ABSENT (contributes nothing, excludes nothing, not an
 * error); every other code is UNREADABLE and is REPORTED, aborting a non-dry-run
 * uninstall through Table D row D9 before anything is mutated; and only a
 * SUCCESSFUL resolution may classify a path as contained or external.
 * @param {string} p
 * @returns {{state:'resolved', real:string}|{state:'absent'}|{state:'unreadable', code:string}}
 */
function resolveOrReport(p) {
  try {
    return { state: 'resolved', real: fs.realpathSync(p) };
  } catch (err) {
    const code = (err && err.code) || 'UNKNOWN';
    if (code === 'ENOENT' || code === 'ENOTDIR') return { state: 'absent' };
    return { state: 'unreadable', code };
  }
}

/** Containment over two ALREADY-RESOLVED (canonical) paths — the comparison half
 *  of `contains`, without its error swallowing (Table D row D15).
 *  @param {string} outerReal @param {string} innerReal @returns {boolean} */
function resolvedContains(outerReal, innerReal) {
  const rel = path.relative(outerReal, innerReal);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Table D row D14, resolved through Table D row D15: which of `roots` are
 * DISCOVERY roots for this run — the ones that resolve inside `paths.home` or
 * `paths.core`. `reverse()`'s three roots are correct for replaying a RECORDED
 * entry, but the systemd user dir derives from the ambient `$XDG_CONFIG_HOME`,
 * which a redirected-`HOME` run does not move; without this bound a sandbox
 * could discover — and delete — a real developer's timers.
 *
 * Shared by `discoverSchedulesOnDisk` and by phase D5b's act-time re-check, so a
 * path is classified against the SAME bound at both sites rather than against
 * two rules that can drift.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {string[]} roots
 * @returns {{accepted: Array<{root:string, real:string}>,
 *            unreadable: Array<{root:string, code:string}>, anchorFailed: boolean}}
 *   An ANCHOR (`paths.home` / `paths.core`) that cannot be resolved makes EVERY
 *   root unreadable — never a silent exclusion of all of them.
 */
function discoveryRoots(paths, roots) {
  /** @type {Array<{root:string, code:string}>} */ const unreadable = [];
  /** @type {string[]} */ const bounds = [];
  for (const anchor of [paths.home, paths.core]) {
    const res = resolveOrReport(anchor);
    if (res.state === 'unreadable') {
      return { accepted: [], unreadable: roots.map((root) => ({ root, code: res.code })), anchorFailed: true };
    }
    if (res.state === 'resolved') bounds.push(res.real);
  }
  /** @type {Array<{root:string, real:string}>} */ const accepted = [];
  for (const root of roots) {
    const res = resolveOrReport(root);
    if (res.state === 'unreadable') {
      unreadable.push({ root, code: res.code });
      continue;
    }
    if (res.state === 'absent') continue; // a root we never wrote to is genuinely empty
    if (!bounds.some((b) => resolvedContains(b, res.real))) continue; // D14
    accepted.push({ root, real: res.real });
  }
  return { accepted, unreadable, anchorFailed: false };
}

/**
 * Schedule files present in this install's own scheduler roots (Table D rows D1,
 * D12). It reads NO manifest entry to decide what to unload (D10); it reads them
 * only to set each item's `remove` permission (D11). Read-only: a non-recursive
 * listing of each root plus one lstat per candidate. It never throws; an
 * enumeration failure is REPORTED in `unreadable` rather than swallowed (D9).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {Manifest} manifest
 * @param {{platform?:NodeJS.Platform, schedulerRoots?:string[],
 *          vaultPath?:string|null}} [opts]
 * @returns {{schedules: Array<{path:string, real:string, remove:boolean}>,
 *            unreadable: Array<{root:string, code:string}>,
 *            skippedForVault: string[]}}
 *   `schedules` — absolute paths, sorted lexicographically, deduplicated, each
 *     carrying `real` (ruling R-C′ — the D15-resolved path AS AT DISCOVERY TIME,
 *     which phase D5b compares against instead of re-deriving containment) and
 *     the deletion permission D11 decided HERE so `reverse()` never re-decides
 *     it. Ruling R-B′: nothing here records WHICH record owns a `remove:false`
 *     item — the plan reads that off the plan itself.
 *   `unreadable` — roots that exist but could not be enumerated (D9); a
 *     non-empty array MUST abort a non-dry-run uninstall before any disclosure.
 *   `skippedForVault` — candidates excluded by D12, disclosed not deleted.
 */
function discoverSchedulesOnDisk(paths, manifest, opts = {}) {
  // generators.js statically requires this module — a top-level import would
  // cycle (same lazy pattern as reverse() and reverseSchedulerEntry).
  const gen = require('../scheduler/generators');
  const roots = opts.schedulerRoots || [
    gen.launchAgentsDir(paths.home), // ~/Library/LaunchAgents
    gen.systemdUserDir(paths.home, process.env), // $XDG_CONFIG_HOME||~/.config + /systemd/user
    path.join(paths.core, 'schedules'), // Windows task XML
  ];
  const vaultPath = opts.vaultPath || null;
  /** @type {Array<{root:string, code:string}>} */ const unreadable = [];
  /** @type {string[]} */ const skippedForVault = [];

  // ── Table D row D12: the accepted vault path, resolved on the same D15 rule.
  //    An UNRESOLVABLE vault is unreadable — never "nothing to exclude".
  let vaultReal = null;
  if (vaultPath) {
    const res = resolveOrReport(vaultPath);
    if (res.state === 'unreadable') {
      unreadable.push({ root: vaultPath, code: res.code });
      return { schedules: [], unreadable, skippedForVault };
    }
    if (res.state === 'resolved') vaultReal = res.real;
  }

  // ── Table D row D14: the DISCOVERY root set, bounded to THIS run's own home
  //    and core, resolved through D15 and never through `contains`.
  const rootSet = discoveryRoots(paths, roots);
  unreadable.push(...rootSet.unreadable);
  if (rootSet.anchorFailed) return { schedules: [], unreadable, skippedForVault };

  // ── Table D row D11: the manifest's ONLY remaining influence — it NARROWS a
  //    removal, never an unload (D10/S7). Any entry `validateEntry` accepts that
  //    names a discovered path withholds that file's deletion for its own
  //    reverser, which may hold a proof-before-delete this pass cannot evaluate.
  //    Read here, used ONLY to set `remove` below — never to admit or exclude a
  //    candidate, which is the suppression channel D10 closed.
  const entries = manifest && Array.isArray(manifest.entries) ? manifest.entries : [];
  /** @type {Set<string>} */ const ownedLexical = new Set();
  /** @type {Set<string>} */ const ownedReal = new Set();
  for (const entry of entries) {
    if (!validateEntry(entry).ok) continue;
    ownedLexical.add(entry.path);
    const res = resolveOrReport(entry.path);
    if (res.state === 'resolved') ownedReal.add(res.real);
  }

  /** @type {Map<string, string>} candidate path -> its resolved canonical path */
  const candidates = new Map();
  for (const { root, real: rootReal } of rootSet.accepted) {
    /** @type {string[]} */ let names;
    try {
      names = fs.readdirSync(root); // NON-recursive (D1)
    } catch (err) {
      const code = (err && err.code) || 'UNKNOWN';
      // D9: a root that does not exist contributes nothing; ANY other failure is
      // an unreadable root, never an empty one.
      if (code !== 'ENOENT' && code !== 'ENOTDIR') unreadable.push({ root, code });
      continue;
    }
    for (const name of names) {
      // R2 — an enumeration of our OWN good, stricter than withinSchedulerRoot.
      if (!gen.recognizeScheduleBasename(name)) continue;
      const full = path.join(root, name);
      let st;
      try {
        st = fs.lstatSync(full);
      } catch (err) {
        const code = (err && err.code) || 'UNKNOWN';
        if (code !== 'ENOENT' && code !== 'ENOTDIR') unreadable.push({ root, code });
        continue;
      }
      if (!st.isFile()) continue; // S2: a symlink or directory is never a candidate
      const cRes = resolveOrReport(full); // D15, at the candidate site too
      if (cRes.state === 'unreadable') {
        unreadable.push({ root, code: cRes.code });
        continue;
      }
      if (cRes.state === 'absent') continue;
      if (!resolvedContains(rootReal, cRes.real)) continue;
      if (vaultReal && resolvedContains(vaultReal, cRes.real)) {
        skippedForVault.push(full); // D12 / S8 — disclosed, never deleted
        continue;
      }
      if (!candidates.has(full)) candidates.set(full, cRes.real);
    }
  }

  const schedules = [...candidates.keys()].sort().map((p) => {
    const real = /** @type {string} */ (candidates.get(p));
    return {
      path: p,
      // Ruling R-C′: the D15-resolved path AS AT DISCOVERY TIME. Phase D5b
      // compares against it rather than re-deriving containment, because
      // re-deriving re-asks a question an attacker can move the answer to.
      real,
      remove: !(ownedLexical.has(p) || ownedReal.has(real)),
    };
  });
  return { schedules, unreadable, skippedForVault };
}

/** True iff `a` and `b` resolve (via realpath) to the SAME directory. Fail-closed
 *  when either side is unresolvable. @param {string} a @param {string} b
 *  @returns {boolean} */
function sameResolvedDir(a, b) {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
}

/**
 * Reverse a 'vendored-tree' entry: recursively remove the vendored app tree
 * (entirely Wienerdog-authored, regenerable by `sync`) ONLY when the target
 * resolves EQUAL to the app root `paths.core/app` — the sole value `vendorSelf`
 * ever records. Equality rejects the equal-to-core case (core is app's PARENT,
 * never equal to app) and any manipulated descendant; anything else is preserved
 * with a refusal notice. Adds the path to removedSet so the enclosing core dir
 * still counts as empty. In dev mode the tree holds only the `current` symlink;
 * removing it never touches the checkout.
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 * @param {string} appRoot the app root `paths.core/app`
 */
function reverseVendoredTree(entry, dryRun, removed, skipped, removedSet, appRoot) {
  if (!isDir(entry.path)) { skipped.push(entry.path); return; }
  if (!sameResolvedDir(entry.path, appRoot)) {
    process.stderr.write(`wienerdog: refusing to remove ${entry.path} — not the Wienerdog app tree\n`);
    skipped.push(entry.path);
    return;
  }
  if (!dryRun) fs.rmSync(entry.path, { recursive: true, force: true });
  removedSet.add(entry.path);
  removed.push(entry.path);
}

/**
 * Reverse a 'copied-skill' entry: recursively remove the copied skill folder
 * ONLY when ALL of (a) its PARENT resolves equal to a harness skills root (a
 * strict child — not merely a descendant), (b) its basename is `wienerdog-*`,
 * (c) the path is itself a REAL directory (an `lstat`, which does NOT follow
 * symlinks — a symlink at this path is definitionally not the directory we
 * copied, even if it points at an identical tree), and (d) the on-disk tree
 * still fingerprints (via the shared `hashDir`) to the `hash` recorded at copy
 * time. A hash-less (legacy) entry, a fingerprint mismatch (user edited/replaced
 * our copy), an unreadable tree (`hashDir` → null, which can never === a recorded
 * string), or a symlink-at-the-path is PRESERVED with a notice, never deleted.
 * Adds the path to removedSet so the enclosing skills dir still counts as empty.
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 * @param {string[]} skillsRoots the harness skills roots
 */
function reverseCopiedSkill(entry, dryRun, removed, skipped, removedSet, skillsRoots) {
  if (!isDir(entry.path)) { skipped.push(entry.path); return; }
  const base = path.basename(entry.path);
  const parentIsRoot = skillsRoots.some((root) => sameResolvedDir(path.dirname(entry.path), root));
  if (!base.startsWith('wienerdog-') || !parentIsRoot) {
    process.stderr.write(`wienerdog: refusing to remove ${entry.path} — not a Wienerdog skill directly under a harness skills dir\n`);
    skipped.push(entry.path);
    return;
  }
  // Tighten the ownership proof: the root must be a REAL directory. isDir() above
  // FOLLOWS symlinks, so a user who moved our copied skill elsewhere and left a
  // SYMLINK to an identical tree at this path would otherwise pass the fingerprint
  // check (hashDir follows the link to the matching target) and have their symlink
  // deleted. lstat does NOT follow the link — a symlink here is not our directory.
  let isRealDir = false;
  try {
    isRealDir = fs.lstatSync(entry.path).isDirectory();
  } catch {
    isRealDir = false;
  }
  if (!isRealDir) {
    process.stderr.write(`wienerdog: keeping ${entry.path} — not the Wienerdog skill we recorded (modified, replaced, or unverifiable)\n`);
    skipped.push(entry.path);
    return;
  }
  if (typeof entry.hash !== 'string' || hashDir(entry.path) !== entry.hash) {
    process.stderr.write(`wienerdog: keeping ${entry.path} — not the Wienerdog skill we recorded (modified, replaced, or unverifiable)\n`);
    skipped.push(entry.path);
    return;
  }
  if (!dryRun) fs.rmSync(entry.path, { recursive: true, force: true });
  removedSet.add(entry.path);
  removed.push(entry.path);
}

/**
 * Load the install manifest. Returns a fresh empty manifest if none exists.
 * Throws (SyntaxError) if the file exists but is not valid JSON — callers that
 * need to distinguish "missing" from "corrupt" should check existence first.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {Manifest}
 */
function load(paths) {
  let raw;
  try {
    raw = fs.readFileSync(paths.manifest, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { version: 1, createdAt: new Date().toISOString(), entries: [] };
    }
    throw err;
  }
  return JSON.parse(raw);
}

/**
 * Append an entry to the manifest (mutates and returns it).
 * @param {Manifest} manifest
 * @param {ManifestEntry} entry
 * @returns {Manifest}
 */
function record(manifest, entry) {
  manifest.entries.push(entry);
  return manifest;
}

/**
 * Persist the manifest to disk.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {Manifest} manifest
 */
function save(paths, manifest) {
  fs.writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Reverse the manifest: remove files we created (kind 'file'), then dirs (kind
 * 'dir', only if empty), in reverse order. A `kind:'file'` entry that carries a
 * recorded `hash` which no longer matches on-disk content is kept with a notice
 * (prove-before-delete); hash-less entries keep the plain delete behavior.
 * Unknown kinds are skipped with a warning (forward compat for later WPs).
 *
 * The three deferred-deletion-set members — the manifest, the canonical core dir,
 * and config.yaml — are NEVER deleted/damaged here, enforced by a SINGLE GLOBAL
 * GUARD at the top of the entry loop, BEFORE the kind dispatch, so no reverser of
 * ANY kind can touch them via `entry.path` (realpath-aware, so a symlinked or
 * normalized alias is caught too). The manifest and core are deferred to
 * uninstall.js; an UNMODIFIED config.yaml is returned in `deferredConfig` (deleted
 * LAST by uninstall.js, after the manifest); a CUSTOMIZED config is kept forever
 * (ADR-0019). A crash at any point therefore leaves a replayable recovery ledger
 * AND the config.yaml `vault:` source a retry needs to protect a nested vault.
 *
 * `deferredConfigHash` carries the recorded hash forward so uninstall.js can
 * RE-VERIFY it immediately before the deferred delete (prove-before-delete at the
 * delete site): config was proven unmodified HERE, but is deleted much later —
 * after the mechanics sweep — so a user edit during that window must abort the
 * delete. Both are null when there is no deferred (unmodified) config.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {Manifest} manifest
 * @param {{dryRun?: boolean,
 *           discoveredSchedules?: Array<{path:string, real:string, remove:boolean}>}} [opts]
 *  `discoveredSchedules` defaults to `[]` — every caller that does not pass it
 *  behaves exactly as today. Each item carries the path AND the deletion
 *  permission Table D row D11 decided at discovery time, so `reverse()` never
 *  re-decides it.
 * @returns {{removed: string[], skipped: string[], preserved: string[],
 *            deferredConfig: string|null, deferredConfigHash: string|null,
 *            discoveredSchedules: string[], shelfGuarded: string[],
 *            shelfUnanswerable: Array<{path:string, code:string}>}}
 *            `discoveredSchedules` is the subset of the passed list's paths
 *            whose UNLOAD this call performed in phase D5a (Table D row D6);
 *            anything phase D5b deleted also appears in `removed`.
 *            `shelfGuarded` is the entries the PRE-DISPATCH SHELF GUARD skipped
 *            (Table X rows X16/X22). `skipped` keeps its contents and its
 *            rendering; `shelfGuarded` is a strict subset of it, exposed
 *            separately because Table W row W10 must distinguish a shelf-guard
 *            skip from an ordinary one. Empty on an ordinary install. An
 *            UNANSWERABLE protected set at guard initialisation ABORTS the live
 *            replay before any mutation (X22).
 */
function reverse(paths, manifest, { dryRun = false, discoveredSchedules = [] } = {}) {
  /** @type {string[]} */ const removed = [];
  /** @type {string[]} */ const skipped = [];
  /** @type {string[]} */ const preserved = [];
  /** @type {string|null} */ let deferredConfig = null; // unmodified config.yaml → deleted last by uninstall.js
  /** @type {string|null} */ let deferredConfigHash = null; // its recorded hash → re-verified before that delete
  // Seed with the manifest path so the core dir still counts as (virtually)
  // empty. The manifest FILE is NOT touched here — uninstall.js deletes it only
  // after the whole uninstall (reversal loop + mechanics sweep) has succeeded,
  // so a crash at any point leaves a replayable ledger (uninstall refuses
  // without it).
  const removedSet = new Set([paths.manifest]);
  // Containment anchors for the recursive-tree removers, computed inline from
  // `paths` (no vendor.js/adapter import — wrong dependency direction).
  const appRoot = path.join(paths.core, 'app');
  const skillsRoots = [path.join(paths.claudeDir, 'skills'), path.join(paths.codexDir, 'skills')];
  // Realpath-aware equality (string fallback when a side is unresolvable): true
  // iff `p` is `target` or resolves to it. Applies to files and dirs
  // (`sameResolvedDir` is just realpath equality). Catches symlinked/normalized
  // aliases of any deferred member.
  const resolvesTo = (p, target) => p === target || sameResolvedDir(p, target);
  // A8 containment roots (WP-144): every legit manifest target lives inside one
  // of these (owner-ratified root set). ~/.local/bin is shared with other tools,
  // so withinAllowedRoot additionally basename-allowlists the two shim names.
  const localBin = path.join(paths.home, '.local', 'bin');
  const allowedRoots = [paths.core, paths.claudeDir, paths.codexDir, localBin];
  // F30 (audit A8): refuse to follow a symlink on the FINAL component of a
  // read-then-write target. Undefined on win32 (no O_NOFOLLOW) → 0 (no-op there;
  // those platforms keep the realpath-canonical containment above as the bound).
  const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
  // Scheduler containment roots + platform for reverseSchedulerEntry (WP-145).
  // generators.js is required lazily — it statically requires this module, so a
  // top-level import would cycle; at reverse() call time both are fully loaded.
  const gen = require('../scheduler/generators');
  const schedulerOpts = {
    platform: process.platform,
    schedulerRoots: [
      gen.launchAgentsDir(paths.home), // ~/Library/LaunchAgents
      gen.systemdUserDir(paths.home, process.env), // $XDG_CONFIG_HOME||~/.config + /systemd/user
      path.join(paths.core, 'schedules'), // Windows task XML
    ],
  };
  /** The kinds whose reversers delete/rewrite — the root-bound gate applies to
   *  exactly these (scheduler-entry → WP-145; vault kinds are no-op-preserved). */
  const MUTATING_KINDS = new Set([
    'file', 'dir', 'symlink', 'managed-block', 'settings-entry', 'vendored-tree', 'copied-skill',
  ]);
  // ── THE PROTECTED SHELF SET (Table X rows X16/X17/X22) ────────────────────
  // The manifest is the SECOND deleter that reaches the secret quarantine: a
  // hash-less {kind:'file'} naming a shelf path passes validateEntry and
  // withinAllowedRoot and reaches rmSync, and a recursively-deleting kind can
  // take a shelf from ABOVE. Computed ONCE per call, before the entry loop.
  const shelfProt = shelfProtection(paths);
  if (shelfProt.unanswerable) {
    const { dir, code } = shelfProt.unanswerable;
    if (!dryRun) {
      // X22 (1) SET-LEVEL: an unanswerable set ABORTS the live replay BEFORE
      // any mutation, so the manifest and config.yaml are untouched and the
      // retry is clean. This is the cheap case — nothing has been deleted yet.
      throw new WienerdogError(
        'wienerdog uninstall stopped — nothing was removed. A folder on the secret quarantine\'s '
          + `path could not be read (${dir}: ${code}), so Wienerdog cannot tell which files a `
          + 'deletion would reach. Fix the permission or disk problem, then re-run: '
          + 'npx wienerdog@latest uninstall'
      );
    }
    // --dry-run REPORTS instead of aborting: it deletes nothing (Table K row K4).
    process.stderr.write(
      `wienerdog: could not read ${dir} (${code}) — a real uninstall stops here\n`
    );
  }
  /** Entries the shelf guard skipped — a strict subset of `skipped`, exposed
   *  separately because Table W row W10 must tell a shelf-guard skip from an
   *  ordinary one (X22). Empty on an ordinary install. */
  /** @type {string[]} */ const shelfGuarded = [];
  /** The subset of `shelfGuarded` whose OWN path failed to resolve for a
   *  non-`ENOENT` reason, with the code — Table W row **W10′** needs it to pick
   *  the stop message's form, and an unanswerable resolution is not a shelf. */
  /** @type {Array<{path: string, code: string}>} */ const shelfUnanswerable = [];
  /** The kinds whose reversers delete RECURSIVELY (Table V) — the FROM-ABOVE
   *  half of X16 applies to exactly these. `dir` is the provable exemption: its
   *  reverser removes only a virtually-empty directory, so it can neither
   *  destroy an original nor break a chain, and guarding it would add a
   *  `skipped` line to an ordinary uninstall (Table W row W6). */
  const RECURSIVE_KINDS = new Set(['vendored-tree', 'copied-skill']);
  /** Table X row **X16′**: `withinAllowedRoot`'s bound, asked of a path that
   *  need not EXIST yet — `contains()` realpaths both sides ands false on an
   *  absent target, which would exempt exactly the late-arriving copy the guard
   *  is for. Each root is compared in its lexical AND resolved form, against the
   *  entry's literal and resolved paths.
   *  @param {string} p @param {string|null} real @returns {boolean} */
  const shelfGuardBound = (p, real) => {
    const cands = real !== null && real !== p ? [p, real] : [p];
    const matching = allowedRoots.filter((root) => {
      const rr = resolveOne(root, shelfProt.dirs);
      const forms = rr.real !== null && rr.real !== root ? [root, rr.real] : [root];
      return forms.some((f) => cands.some((c) => lexicalContains(f, c)));
    });
    if (matching.length === 0) return false;
    if (matching.every((root) => root === localBin)) {
      return ['wienerdog', 'wienerdog.cmd'].includes(path.basename(p));
    }
    return true;
  };

  // ── PHASE D5a — THE WIDENED UNLOAD, BEFORE THE ENTRY LOOP ────────────────
  // WP-scheduler-replay-manifest-independent, Table D rows D5/D6/D10/D13.
  // Every DISCLOSED item's unregister command is attempted UNCONDITIONALLY, and
  // this phase touches the filesystem NOT AT ALL: the argv comes from
  // `path.basename(item.path)` alone (deriveUnloadArgv reads no fs), so no file
  // state, race or error can starve an unload the user consented to (S13). It
  // runs FIRST because a manifest reverser may delete a discovered file during
  // the loop below — on win32 `<core>/schedules` is inside withinAllowedRoot's
  // root set, so a `{kind:'file'}` record for `wienerdog-dream.xml` really is
  // deletable, and a single post-loop pass would find nothing to unload while
  // the Task Scheduler entry stayed registered (S9). Recorded paths are NOT
  // excluded (D10), so a normal install's jobs are unloaded twice; the second
  // attempt's result is discarded at :532-536 exactly as it already is (D13).
  /** @type {string[]} */ const discoveredUnloaded = [];
  for (const item of discoveredSchedules) {
    const argv = gen.deriveUnloadArgv(item.path, schedulerOpts.platform);
    // In dry-run nothing is spawned; the disclosed plan carries the
    // `would run:` line for this item (uninstall.js, Table D row D3) rather than
    // this phase printing a second copy of it.
    if (argv && !dryRun) {
      try {
        require('../scheduler/spawn').schedulerSpawn(argv);
      } catch {
        /* ignore — unregistration is best-effort, exactly as at :532-536 */
      }
    }
    discoveredUnloaded.push(item.path);
  }

  for (const entry of [...manifest.entries].reverse()) {
    // ── SCHEMA VALIDATION (audit A8, WP-144) — the manifest is UNTRUSTED ────
    // A malformed entry (unknown kind, bad path, wrong-typed field) is skipped
    // fail-safe with a visible notice and never reaches the guard arithmetic or
    // a reverser. Runs FIRST so everything downstream can assume the shape.
    const shape = validateEntry(entry);
    if (!shape.ok) {
      const kind = entry && typeof entry.kind === 'string' ? entry.kind : '?';
      const p = entry && typeof entry.path === 'string' && entry.path !== '' ? entry.path : '?';
      process.stderr.write(`wienerdog: skipping manifest entry with invalid ${kind} shape (${p})\n`);
      skipped.push(p);
      continue;
    }
    // ── GLOBAL DEFERRED-MEMBER GUARD (before kind dispatch) ──────────────────
    // reverse() must NEVER delete/damage the three deferred members — the
    // manifest, the core dir, and config.yaml — regardless of entry KIND or path
    // normalization. A malformed/hand-edited/adversarial manifest can point ANY
    // kind at a deferred member (e.g. {kind:'scheduler-entry', path: manifest}
    // deletes the ledger; a {kind:'file', path:'<core>/./config.yaml'} normalized
    // alias bypasses an exact-string config check; a symlink/managed-block/
    // settings-entry can unlink/rewrite one). This single guard blocks every
    // PATH-based route for every kind at once. (It does NOT police INDIRECT side
    // effects — e.g. a scheduler-entry's executable `unload` argv — which is an
    // out-of-scope, pre-existing residual; see the WP-088 spec Non-goals.)
    if (resolvesTo(entry.path, paths.manifest) || resolvesTo(entry.path, paths.core)) {
      // Manifest → retry ledger (uninstall.js deletes it LAST via the
      // rmSync-outcome gate); core → deferred to disposeCoreMechanics. Never
      // touched here by any kind. (removedSet already holds paths.manifest; a
      // normal manifest's sole core entry is {kind:'dir', path: paths.core} —
      // this is where it is skipped.)
      skipped.push(entry.path);
      continue;
    }
    if (resolvesTo(entry.path, paths.config)) {
      // config.yaml is deferred/kept here for EVERY kind — its `vault:` line is
      // what disposeCoreMechanics reads on every retry to protect a nested vault;
      // reverse() never deletes it. Decide defer-vs-keep from the recorded hash of
      // the LEGITIMATE file entry (Wienerdog records config only as
      // {kind:'file', path, hash}):
      if (entry.kind === 'file' && isFile(entry.path) && entry.hash) {
        // F30/F31 (audit A8): the config hash is read INSIDE its own try/catch —
        // this runs ABOVE the per-entry isolation try below, so an unreadable
        // config (EACCES / EISDIR-after-swap / ELOOP) must fail safe here rather
        // than throw past the sweep and wedge every uninstall retry.
        let currentHash;
        try {
          currentHash = sha256File(entry.path);
        } catch (err) {
          // Cannot verify → do NOT defer (leave config in place); keep sweeping.
          process.stderr.write(
            `wienerdog: could not verify ${entry.path} (${err.code || err.message}) — leaving config in place\n`
          );
          skipped.push(entry.path);
          continue;
        }
        if (currentHash === entry.hash) {
          // UNMODIFIED → deferred: uninstall.js deletes it LAST (after the sweep,
          // after the manifest). Store the CANONICAL path (not a normalized
          // alias); add to removedSet so the core still counts as empty. Carry the
          // recorded hash forward so uninstall.js can re-prove it unmodified at the
          // (much later) delete site — a user edit during the sweep aborts the delete.
          deferredConfig = paths.config;
          deferredConfigHash = entry.hash;
          removedSet.add(paths.config);
          continue; // the deferred member — not in removed/skipped
        }
        // CUSTOMIZED (hash mismatch) → kept forever (ADR-0019). Keeps the core alive.
        process.stderr.write(`wienerdog: keeping ${entry.path} — modified since install\n`);
      }
      // Customized config, OR any non-file/hash-less/adversarial entry targeting
      // config → PROTECT it: never delete/rewrite. (deferredConfig is set only by
      // the legitimate unmodified file entry above; if the manifest is too corrupt
      // to have one, config simply stays — safe, uninstall.js keeps the core.)
      skipped.push(entry.path);
      continue;
    }
    // ── end global guard ─────────────────────────────────────────────────────
    // ── SHELF GUARD (Table X row X16), STILL BEFORE KIND DISPATCH ────────────
    // Skip-and-report any entry whose LITERAL path is at or under a lexical
    // shelf anchor, or whose RESOLVED path is caught by X17 (1a)'s two-class
    // test. SYMMETRIC: from BELOW for every kind, and from ABOVE for the kinds
    // whose reversers delete recursively (Table V). A `symlink` entry naming a
    // link ON a protected shelf's chain is caught by the class (ii) equality —
    // removing it deletes REACHABILITY, which a later recursive delete then
    // turns into deleted bytes (X20). Fail-closed here means PRESERVE, so an
    // UNANSWERABLE resolution guards too (X17 (4), X22 (2)); mere ABSENCE never
    // does (X17 (3)) — that is the clause whose lack stranded ordinary installs.
    {
      const recursive = RECURSIVE_KINDS.has(entry.kind);
      const res = resolveOne(entry.path, shelfProt.dirs);
      // X16′: the guard covers only entries the ALLOWED-ROOT BOUND admits. One
      // it rejects is skipped exactly as it was before this package — no
      // `shelfGuarded` entry and no Table W row W10 stop — because no deleter
      // would have reached it, and blocking on it would be a permanent refusal
      // over a path this command never touches.
      let guarded = false;
      if (shelfGuardBound(entry.path, res.real)) {
        guarded = shelfBlocks(entry.path, shelfProt, recursive);
        if (!guarded && res.state === 'unanswerable') {
          guarded = true;
          shelfUnanswerable.push({ path: entry.path, code: /** @type {string} */ (res.code) });
        } else if (!guarded && res.real !== null) {
          guarded = shelfBlocks(res.real, shelfProt, recursive);
        }
      }
      if (guarded) {
        process.stderr.write(
          `wienerdog: preserving ${entry.path} — it is in, or on the path of, the secret quarantine (not deleting)\n`
        );
        skipped.push(entry.path);
        shelfGuarded.push(entry.path);
        continue;
      }
    }
    // ── end shelf guard ──────────────────────────────────────────────────────
    // ── PER-ENTRY ERROR ISOLATION + ROOT BOUND + DELETE-TIME BINDING (A8) ─────
    // One throwing reverser must never abort the whole uninstall (that made the
    // install permanently un-uninstallable — every retry hit the same entry).
    // The containment check + realpath resolution live INSIDE the try so an fs
    // error also fails safe (preserve, not crash).
    //
    // F30 (delete-time binding): the WP-144 gate canonicalized the entry path but
    // the reversers then acted on the LEXICAL path — a swapped intermediate
    // symlink could redirect the op out of root. Every mutating kind now
    // RE-VALIDATES containment on the realpath-RESOLVED target and performs its
    // fs ops on that canonical path (file/dir), or on a parent-canonicalized path
    // opened with O_NOFOLLOW on the final component (managed-block/settings-entry),
    // or unlinks the link itself after validating the canonical parent (symlink).
    // The STATIC symlink swap is closed here; the concurrent ancestor-replacement
    // race (realpath returns a string, path-based ops re-walk it; Node has no
    // openat/unlinkat and a native addon would violate ADR-0004) is an accepted
    // A12 residual (see ADR-0028 / WP-159), the same class as the launcher and
    // heal verify→use races. The per-kind ownership proofs (hash, isSymlink,
    // hashDir/lstat, surgical edits) are UNCHANGED.
    try {
      if (MUTATING_KINDS.has(entry.kind)) {
        // F32: an already-removed target (not even a dangling symlink) is skipped
        // SILENTLY as already-gone — BEFORE the containment gate, so an idempotent
        // re-run never prints the misleading "outside every root" line (realpath
        // on a missing path throws → contains=false → the wrong notice).
        if (!fs.existsSync(entry.path) && !isSymlink(entry.path)) {
          skipped.push(entry.path);
          continue;
        }
      }
      if (entry.kind === 'file' || entry.kind === 'dir'
        || entry.kind === 'vendored-tree' || entry.kind === 'copied-skill') {
        // F30: resolve once, re-validate containment on the RESOLVED (canonical,
        // symlink-free) path. An out-of-root resolution → PRESERVE.
        const resolved = fs.realpathSync(entry.path);
        if (!withinAllowedRoot(resolved, allowedRoots, localBin)) {
          process.stderr.write(
            `wienerdog: preserving ${entry.path} — outside every Wienerdog-owned root (not deleting)\n`
          );
          skipped.push(entry.path);
          continue;
        }
        if (entry.kind === 'file') {
          // (manifest/config already handled by the global guard above.)
          if (!isFile(resolved)) {
            skipped.push(entry.path);
            continue;
          }
          if (entry.hash && sha256File(resolved) !== entry.hash) {
            // We recorded this file's content at write time; it differs now → the
            // user (or another writer) changed it. Prove-before-delete: keep it,
            // don't destroy an edit.
            process.stderr.write(`wienerdog: keeping ${entry.path} — modified since install\n`);
            skipped.push(entry.path);
            continue;
          }
          if (!dryRun) fs.rmSync(resolved, { force: true });
          removedSet.add(entry.path);
          removed.push(entry.path);
        } else if (entry.kind === 'dir') {
          // (The core is handled by the global guard above and never reaches here.)
          if (!isDir(resolved)) {
            skipped.push(entry.path);
            continue;
          }
          // removedSet holds LEXICAL entry.path children, so build the child list
          // from entry.path (not resolved) to keep the "virtually empty" match.
          const remaining = fs
            .readdirSync(resolved)
            .map((child) => path.join(entry.path, child))
            .filter((child) => !removedSet.has(child));
          if (remaining.length > 0) {
            skipped.push(entry.path);
            continue;
          }
          if (!dryRun) fs.rmdirSync(resolved);
          removedSet.add(entry.path);
          removed.push(entry.path);
        } else if (entry.kind === 'vendored-tree') {
          // Ownership proof unchanged (sameResolvedDir === appRoot is realpath-based).
          reverseVendoredTree(entry, dryRun, removed, skipped, removedSet, appRoot);
        } else {
          // copied-skill: ownership proof unchanged (parent realpath + wienerdog-*
          // + lstat real-dir + hashDir fingerprint). lstat MUST stay on entry.path
          // — resolving it would defeat the anti-symlink gate.
          reverseCopiedSkill(entry, dryRun, removed, skipped, removedSet, skillsRoots);
        }
      } else if (entry.kind === 'symlink') {
        // F30: validate the canonical PARENT is in-bounds, then reverseSymlink
        // lstat+unlinks the LINK ITSELF (it must NOT resolve through the link).
        const target = path.join(fs.realpathSync(path.dirname(entry.path)), path.basename(entry.path));
        if (!withinAllowedRoot(target, allowedRoots, localBin)) {
          process.stderr.write(
            `wienerdog: preserving ${entry.path} — outside every Wienerdog-owned root (not deleting)\n`
          );
          skipped.push(entry.path);
          continue;
        }
        reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots);
      } else if (entry.kind === 'managed-block' || entry.kind === 'settings-entry') {
        // F30: canonicalize the PARENT, then open the final component with
        // O_NOFOLLOW so a symlink at the recorded path (a swap-to-symlink)
        // refuses (ELOOP) instead of letting the read+modify+write escape. All IO
        // goes through the ONE fd (read → modify → truncate+write).
        const target = path.join(fs.realpathSync(path.dirname(entry.path)), path.basename(entry.path));
        if (!withinAllowedRoot(target, allowedRoots, localBin)) {
          process.stderr.write(
            `wienerdog: preserving ${entry.path} — outside every Wienerdog-owned root (not deleting)\n`
          );
          skipped.push(entry.path);
          continue;
        }
        const flags = (dryRun ? fs.constants.O_RDONLY : fs.constants.O_RDWR) | O_NOFOLLOW;
        let fd;
        try {
          fd = fs.openSync(target, flags);
        } catch (err) {
          if (err.code === 'ELOOP') {
            // The recorded path is (now) a symlink — refuse to follow it.
            process.stderr.write(
              `wienerdog: preserving ${entry.path} — recorded path is a symlink (refusing to follow)\n`
            );
            skipped.push(entry.path);
            continue;
          }
          if (err.code === 'ENOENT') {
            skipped.push(entry.path);
            continue;
          }
          throw err;
        }
        try {
          if (entry.kind === 'managed-block') {
            reverseManagedBlock(entry, dryRun, removed, skipped, removedSet, fd, target);
          } else {
            reverseSettingsEntry(entry, dryRun, removed, skipped, removedSet, fd, target);
          }
        } finally {
          fs.closeSync(fd);
        }
      } else if (entry.kind === 'scheduler-entry') {
        // Not root-bounded here (WP-145 re-derives + bounds it via its own root set).
        reverseSchedulerEntry(entry, dryRun, removed, skipped, removedSet, schedulerOpts);
      } else if (entry.kind === 'vault-file' || entry.kind === 'vault-dir') {
        // The vault is the user's treasure — always preserved (ADR-0010, ADR-0019).
        // No filesystem action; NOT added to removedSet (it lives outside the core).
        // Counted so uninstall can print ONE plain-language reassurance line
        // instead of the former per-file 'unknown kind' stderr warnings.
        preserved.push(entry.path);
      } else {
        // Unreachable today (validateEntry rejects unknown kinds first); kept as
        // the belt-and-suspenders catch-all should the schema table and this
        // dispatch ever drift apart.
        process.stderr.write(
          `wienerdog: skipping unknown manifest entry kind '${entry.kind}' (${entry.path})\n`
        );
        skipped.push(entry.path);
      }
    } catch (err) {
      // Per-entry isolation: skip THIS entry, keep sweeping. The loop always
      // completes, so uninstall can delete the manifest and retry-ability is
      // never wedged on one bad file (e.g. malformed settings.json).
      process.stderr.write(
        `wienerdog: could not reverse ${entry.kind} entry ${entry.path} (${err.code || err.message}) — leaving it in place\n`
      );
      skipped.push(entry.path);
    }
  }

  // ── PHASE D5b — THE WIDENED REMOVAL, AFTER THE ENTRY LOOP ────────────────
  // Table D rows D5/D6/D11/D15 + Table R row R4. It acts ONLY on items phase
  // D5a processed — never re-admitting one by a check of its own — so the acted
  // set is a SUBSET of the disclosed set and never a superset (D7). It runs
  // after the loop so a recorded entry keeps priority over the widened
  // deletion. A skip here forgoes a DELETION only: the unload already happened
  // unconditionally above, which is why absence and unreadability are both safe
  // to skip on (D6).
  //
  // THE RE-CHECK ASSERTS IDENTITY WITH WHAT WAS DISCLOSED — ruling R-C′, which
  // replaced an act-time CONTAINMENT re-check at round 2 of the PR gate. The
  // disclosed path is an untrusted name by act time: the prompt has been open,
  // and a same-user process can replace the file, its parent, or the scheduler
  // root itself. Re-deriving containment re-asks a question the attacker can
  // move the answer to — a root swapped for a symlink INTO THE VAULT re-derives
  // as contained, because the vault is inside HOME, and the vault's same-named
  // file is then deleted. So the item must STILL be a regular file (S2), must
  // STILL resolve (D15), and must resolve to THE SAME canonical path discovery
  // recorded. That single comparison implies discovery-time containment AND
  // discovery-time vault exclusion, and closes every swap class — final
  // component, parent, root — without re-deriving anything. The deletion is then
  // aimed at the DISCLOSED path, never the resolved one.
  /** Table D row D6 + Table R row R9: a skipped REMOVAL says so, and a preserved
   *  launchd plist carries the login-reload warning. @param {string} p @param {string} why */
  const keepDiscovered = (p, why) => {
    if (dryRun) return; // D8 / ruling R-D: a plan pass prints nothing — D3 owns the disclosure
    process.stderr.write(`wienerdog: keeping ${p} — ${why}\n`);
    if (gen.recognizeScheduleBasename(path.basename(p)) === 'launchd') {
      process.stderr.write(`wienerdog: ${R9_LOGIN_RELOAD_WARNING}\n`);
    }
  };
  for (const item of discoveredSchedules) {
    if (DISCOVERED_DISPOSITION !== 'unload-and-remove') continue; // Table R row R4
    if (!item.remove) continue; // D11 — another manifest record owns this file
    if (removedSet.has(item.path)) continue; // a reverser already disposed of it
    let st;
    try {
      st = fs.lstatSync(item.path);
    } catch (err) {
      const code = (err && err.code) || 'UNKNOWN';
      if (code === 'ENOENT' || code === 'ENOTDIR') continue; // absent — nothing to remove
      keepDiscovered(item.path, `it is no longer the file that was shown to you (${code})`);
      continue;
    }
    if (!st.isFile()) {
      keepDiscovered(item.path, 'it is no longer the file that was shown to you (not a regular file)');
      continue;
    }
    const res = resolveOrReport(item.path); // D15, at the act-time site
    if (res.state === 'absent') continue; // nothing to remove
    if (res.state === 'unreadable') {
      keepDiscovered(item.path, `it is no longer the file that was shown to you (${res.code})`);
      continue;
    }
    if (res.real !== item.real) {
      keepDiscovered(item.path, 'it is no longer the file that was shown to you');
      continue;
    }
    try {
      if (!dryRun) fs.rmSync(item.path, { force: true });
    } catch (err) {
      // A swap landing between the checks above and this line still reaches
      // `rmSync` (a directory there throws ERR_FS_EISDIR). A widened REMOVAL
      // must never fail the uninstall — the unload already happened.
      keepDiscovered(item.path, `it could not be removed (${(err && err.code) || 'unknown error'})`);
      continue;
    }
    removedSet.add(item.path);
    removed.push(item.path);
  }

  return {
    removed, skipped, preserved, deferredConfig, deferredConfigHash,
    discoveredSchedules: discoveredUnloaded, shelfGuarded, shelfUnanswerable,
  };
}

/** Required/optional field types per manifest kind (audit A8, WP-144). Keys
 *  beyond these are ignored (forward-compat), never rejected; only the listed
 *  fields are type-enforced. `scheduler-entry` gets deep validation in WP-145. */
const ENTRY_FIELD_TYPES = {
  file: { hash: 'string' },
  dir: {},
  symlink: { target: 'string', origin: 'string', dev: 'string', ino: 'string' },
  // sepBefore/sepAfter (WP-147) are deliberately NOT type-gated here: a non-string
  // forgery must reach reverseManagedBlock so its SEP_BEFORE_OK allowlist degrades
  // to the legacy conservative strip and still removes the block (Table M:
  // "additive only, no rejection"). Type-gating would reject the entry upstream,
  // leaving the managed block installed — the disposition Table M explicitly rejects.
  'managed-block': { createdFile: 'boolean' },
  'settings-entry': { createdFile: 'boolean', commands: 'string[]' },
  'vendored-tree': {},
  'copied-skill': { hash: 'string' },
  'vault-file': {},
  'vault-dir': {},
  'scheduler-entry': {},
};

/**
 * Validate one manifest entry's shape (audit A8, WP-144): the manifest is a
 * plaintext user-editable file, so replay treats it as UNTRUSTED input. A
 * malformed entry is skipped fail-safe by reverse() — it must never reach a
 * reverser. Unknown kinds, a missing/empty/non-string `path`, or a wrong-typed
 * known field all fail; extra keys are ignored (forward-compat).
 * @param {any} entry
 * @returns {{ok:true}|{ok:false, why:string}}
 */
function validateEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, why: 'entry is not an object' };
  }
  const fields = Object.prototype.hasOwnProperty.call(ENTRY_FIELD_TYPES, entry.kind)
    ? ENTRY_FIELD_TYPES[entry.kind]
    : null;
  if (!fields) return { ok: false, why: `unknown kind ${JSON.stringify(entry.kind)}` };
  if (typeof entry.path !== 'string' || entry.path === '') {
    return { ok: false, why: 'missing/empty/non-string path' };
  }
  for (const [key, type] of Object.entries(fields)) {
    const value = entry[key];
    if (value === undefined) continue;
    const bad =
      (type === 'string' && typeof value !== 'string') ||
      (type === 'boolean' && typeof value !== 'boolean') ||
      (type === 'string[]' && !(Array.isArray(value) && value.every((c) => typeof c === 'string')));
    if (bad) return { ok: false, why: `${key} must be a ${type}` };
  }
  return { ok: true };
}

/**
 * The A8 containment layer (WP-144): is `targetPath` inside an allowed
 * Wienerdog-owned root? Containment uses the realpath-aware `contains` (both
 * sides canonicalized — a `..`/normalized/symlinked alias that resolves outside
 * every root fails). `~/.local/bin` is a USER-SHARED dir, so when it is the
 * only matching root the basename must additionally be one of the two shim
 * names — a planted `~/.local/bin/other-tool` entry is out-of-bounds. The
 * other roots need no basename filter: the per-kind ownership proofs (hash,
 * isSymlink, surgical block edits) already fence them.
 * @param {string} targetPath
 * @param {string[]} allowedRoots
 * @param {string} localBin
 * @returns {boolean}
 */
function withinAllowedRoot(targetPath, allowedRoots, localBin) {
  const matching = allowedRoots.filter((root) => contains(root, targetPath));
  if (matching.length === 0) return false;
  if (matching.every((root) => root === localBin)) {
    return ['wienerdog', 'wienerdog.cmd'].includes(path.basename(targetPath));
  }
  return true;
}

/**
 * True when `inner` is `outer` or lives inside it. Both sides are
 * realpath-canonicalized before comparing (a symlinked tmpdir or home would
 * otherwise false-negative — path.relative needs one symlink domain). An
 * unresolvable side means containment cannot be established.
 * @param {string} outer @param {string} inner @returns {boolean}
 */
function contains(outer, inner) {
  let o;
  let i;
  try {
    o = fs.realpathSync(outer);
    i = fs.realpathSync(inner);
  } catch {
    return false;
  }
  const rel = path.relative(o, i);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** The two secret-quarantine shelf directory names, as `quarantinePreserve`
 *  writes them (`src/core/dream/validate.js`): `<state>/quarantine` for a
 *  withheld note and `<state>/quarantine/redacted` for a pre-scrub original.
 *  Matched by ASCII case fold, never by byte equality (Table K row K8). */
const QUARANTINE_DIRNAME = 'quarantine';
const QUARANTINE_REDACTED_DIRNAME = 'redacted';

/**
 * ASCII case fold (Table K row K8): only `A`–`Z` map to `a`–`z`, every other
 * code unit matching exactly. Deliberately NOT `String.prototype.toLowerCase`,
 * whose Unicode mappings are broader than the property being tested — a
 * case-insensitive volume folds ASCII, and our own directory names are pure
 * ASCII with no combining marks, so their ASCII case variants are exactly the
 * closed set such a volume could collide with.
 * @param {string} name @returns {string}
 */
function asciiFold(name) {
  let out = '';
  for (let i = 0; i < name.length; i += 1) {
    const c = name.charCodeAt(i);
    out += c >= 0x41 && c <= 0x5a ? String.fromCharCode(c + 0x20) : name[i];
  }
  return out;
}

/** The ONE special case of Table K row K3: a path Wienerdog never wrote is
 *  genuinely absent, not unreadable. Every other code means the state is
 *  UNKNOWN and must never read as empty (K4, Table Y row Y5).
 *  @param {string} code @returns {boolean} */
function isAbsentCode(code) {
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Record a level whose state could not be determined — ONE entry per REPORTING
 * PATH. **Ruling R-Y1 (PR-gate round 3) is why `reportAs` is always a shelf root
 * or `<state>` itself:** every `unreadable[].dir` is printed verbatim by the
 * refusal and by `--dry-run`, and every path BELOW a shelf root — a file's
 * basename or a nested directory's name alike — is derived from the user's own
 * note paths. An unreadable object at any depth is therefore reported by the
 * shelf root it sits under and the error code, never by its own path.
 * De-duplicated for the same reason a directory listing is: one damaged
 * permission should not print one line per object under it.
 * @param {Array<{dir:string, code:string}>} unreadable
 * @param {string} reportAs a SHELF ROOT or `<state>` — never a path below one
 * @param {string} code @returns {void}
 */
function pushUnreadable(unreadable, reportAs, code) {
  if (unreadable.some((u) => u.dir === reportAs)) return;
  unreadable.push({ dir: reportAs, code });
}

/** Sorted child names of `dir`, or null when it is absent or could not be
 *  enumerated. An enumeration failure is recorded against `reportAs` (R-Y1),
 *  never against `dir`, which below a shelf root carries the user's own text.
 *  Sorted so the walk — and therefore the refusal it feeds — is deterministic
 *  across platforms.
 *  @param {string} dir @param {Array<{dir:string, code:string}>} unreadable
 *  @param {string} reportAs @returns {string[]|null} */
function readShelfNames(dir, unreadable, reportAs) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .map((d) => d.name)
      .sort();
  } catch (e) {
    const code = (e && /** @type {any} */ (e).code) || 'UNKNOWN';
    if (isAbsentCode(code)) return null; // ABSENT — not an error (K3)
    pushUnreadable(unreadable, reportAs, code); // UNREADABLE — state UNKNOWN (K3/K4)
    return null;
  }
}

/**
 * Count everything under one shelf directory into `row` (Table K row K2).
 * `lstat` throughout, so a symlink is counted as one entry and NEVER followed —
 * a planted link cannot make the walk leave the shelf or loop. A further
 * directory at any depth counts one entry and is descended. The only entries
 * that count nothing are the shelf roots themselves: at the top level of
 * `<state>/quarantine`, a real directory whose name folds to `redacted` becomes
 * its own row in `roots` instead.
 * @param {string} dir @param {{dir:string, entries:number, bytes:number}} row
 * @param {Array<{dir:string, code:string}>} unreadable
 * @param {Array<{dir:string, entries:number, bytes:number}>} roots
 * @param {boolean} top true only for `<state>/quarantine` itself
 * @param {string} shelfRoot the SHELF ROOT this level sits under — the only
 *   path an unreadable object at any depth is ever reported by (R-Y1)
 * @returns {void}
 */
function countShelfTree(dir, row, unreadable, roots, top, shelfRoot) {
  const names = readShelfNames(dir, unreadable, shelfRoot);
  if (names === null) return;
  /** @type {string[]} */ const ownRoots = [];
  for (const name of names) {
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.lstatSync(full);
    } catch (e) {
      const code = (e && /** @type {any} */ (e).code) || 'UNKNOWN';
      if (isAbsentCode(code)) continue; // vanished under the walk — absence again
      // The SHELF ROOT, never `full` and never `dir`: both carry the user's own
      // text below the root, and every unreadable entry is printed verbatim
      // (ruling R-Y1).
      pushUnreadable(unreadable, shelfRoot, code);
      row.entries += 1; // something IS there; we merely could not classify it
      continue;
    }
    if (top && st.isDirectory() && asciiFold(name) === QUARANTINE_REDACTED_DIRNAME) {
      ownRoots.push(full); // a shelf root — zero entries, its own row (K2)
      continue;
    }
    row.entries += 1;
    if (st.isFile()) row.bytes += st.size;
    else if (st.isDirectory()) countShelfTree(full, row, unreadable, roots, false, shelfRoot);
    // anything else (symlink, socket, fifo) — counted, never opened, never followed
  }
  for (const full of ownRoots) {
    /** @type {{dir:string, entries:number, bytes:number}} */
    const sub = { dir: full, entries: 0, bytes: 0 };
    roots.push(sub);
    // `redacted` is a shelf root in its own right, so it becomes the reporting
    // path for everything beneath it.
    countShelfTree(full, sub, unreadable, roots, false, full);
  }
}

/**
 * Inventory the secret quarantine under this core (Table K). READ-ONLY: a
 * non-following walk (`readdirSync({withFileTypes:true})` + `lstatSync`) of
 * <paths.state>/quarantine. It NEVER opens a file and never reads a byte of one
 * (K6), and it NEVER follows a symlink. It never throws: any enumeration or stat
 * failure is REPORTED in `unreadable` (K3/K4). The shelf directories are located
 * by ASCII CASE FOLD of their names (K8), never by byte equality.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {{roots: Array<{dir:string, entries:number, bytes:number}>,
 *            entries:number, bytes:number,
 *            unreadable: Array<{dir:string, code:string}>, blockers: string[]}}
 *   `roots` — the shelf directories that EXIST as directories, in the fixed
 *     order [<state>/quarantine, <state>/quarantine/redacted], each with the
 *     counts of what it holds; an absent root is omitted. **A root itself is
 *     never counted** (K2).
 *   `entries`/`bytes` — totals over the whole walk; `bytes` sums regular files'
 *     `size` only. Two empty shelf directories give `entries: 0`.
 *   `unreadable` — non-empty means the shelf's state is UNKNOWN, and at the gate
 *     that ABORTS a non-dry-run uninstall (K4). Every `dir` is a SHELF ROOT or
 *     `<state>` itself and the list is de-duplicated (ruling **R-Y1**): an
 *     unreadable object below a root, at any depth, is reported by the root it
 *     sits under and the code, never by its own path.
 *   `blockers` — `string[]`, the actual on-disk path of every non-directory
 *     found at a SHELF-ROOT POSITION (a file or symlink at
 *     `<state>/Quarantine`). Table K row **K2**: each counts as one entry and
 *     contributes 0 bytes, and none is a shelf directory, so none takes a
 *     `roots` row — the path is carried so Table W row **W4** item (3b) can
 *     name the thing the user must actually deal with (ruling **R-K**).
 */
function quarantineInventory(paths) {
  /** @type {Array<{dir:string, entries:number, bytes:number}>} */ const roots = [];
  /** @type {string[]} */ const blockers = [];
  /** @type {Array<{dir:string, code:string}>} */ const unreadable = [];

  const stateNames = readShelfNames(paths.state, unreadable, paths.state);
  for (const name of stateNames || []) {
    if (asciiFold(name) !== QUARANTINE_DIRNAME) continue;
    const qdir = path.join(paths.state, name);
    let st;
    try {
      st = fs.lstatSync(qdir);
    } catch (e) {
      const code = (e && /** @type {any} */ (e).code) || 'UNKNOWN';
      if (isAbsentCode(code)) continue;
      // `qdir` is safe to name: its basename already matched the closed ASCII
      // case-fold set, so it carries no user-derived text (Table Y rows Y1/Y4).
      pushUnreadable(unreadable, qdir, code);
      blockers.push(qdir);
      continue;
    }
    if (!st.isDirectory()) {
      // Not the product's directory — something else sitting where it should
      // be. One entry, no row, and the path is carried so it can be named (K2).
      blockers.push(qdir);
      continue;
    }
    /** @type {{dir:string, entries:number, bytes:number}} */
    const row = { dir: qdir, entries: 0, bytes: 0 };
    roots.push(row);
    countShelfTree(qdir, row, unreadable, roots, true, qdir);
  }

  let entries = blockers.length;
  let bytes = 0;
  for (const r of roots) {
    entries += r.entries;
    bytes += r.bytes;
  }
  return { roots, entries, bytes, unreadable, blockers };
}

/** Purely LEXICAL containment over two paths that have ALREADY been resolved by
 *  `walkChain`: true when `inner` IS `outer` or sits beneath it. Deliberately
 *  NOT `contains()` (Table X row X7): that helper realpaths both sides and
 *  returns a bare `false` on any resolution error, which is the wrong direction
 *  here — every resolution this package performs happens ONCE, in `walkChain`,
 *  which distinguishes ABSENT from UNANSWERABLE (Table X row X17 (3)/(4)).
 *  @param {string} outer @param {string} inner @returns {boolean} */
function lexicalContains(outer, inner) {
  const rel = path.relative(outer, inner);
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  // PR-gate round 2, finding 3: `startsWith('..')` also matched a COMPONENT
  // NAMED `..recovery`, so `<core>/logs/..recovery` read as an escape out of
  // `<core>/logs` and the guard let a recursive delete through. Only a segment
  // that IS `..` is parent traversal.
  return !rel.split(path.sep).includes('..');
}

/** Bound on the link hops one resolution may take, so a cycle answers
 *  UNANSWERABLE (`ELOOP`) instead of recursing forever. */
const MAX_LINK_HOPS = 40;

/** Marks the point in the pending-segment list at which a link's target has
 *  been fully resolved — `cur` is then that target, a class (ii) chain node. */
const CHAIN_TARGET = Object.freeze({ chainTarget: true });

/**
 * The ON-DISK spelling of `seg` inside `parent`, by Table X row **X12**'s ASCII
 * fold. PR-gate round 2, finding 1: `walkChain` used to keep the CALLER's
 * spelling, so on a case-insensitive filesystem a hash-less entry naming
 * `<state>/QUARANTINE/<name>` resolved to a path the anchors — built from the
 * stored `quarantine` — did not contain, and the guard let it through to
 * `rmSync`. A byte-exact match always wins (on a case-sensitive volume both
 * spellings can exist and they are different objects); otherwise a SINGLE
 * fold-equal entry is the canonical name. An unreadable parent keeps the
 * caller's spelling, which is what shipped before this rule.
 * Neither probe is a CLASSIFICATION — Table X row **X10**'s `lstat`-only rule
 * governs what may be descended or deleted and stands unchanged; `seg` has
 * already been classified by the caller's `lstat` before either runs.
 * @param {string} parent an ALREADY-RESOLVED directory
 * @param {string} seg
 * @param {{chain: Set<string>, dirs: Map<string, string[]|null>}} ctx
 * @param {boolean} isLink whether `parent/seg` is itself a symlink
 * @returns {string}
 */
function canonicalSegment(parent, seg, ctx, isLink) {
  // No ASCII letter ⇒ no fold variant can exist ⇒ the spelling is already the
  // stored one. Skips the probe for the overwhelming majority of components.
  if (!/[A-Za-z]/.test(seg)) return seg;
  const next = path.join(parent, seg);
  if (!isLink) {
    // `parent` is ALREADY resolved, and `seg` is not a symlink, so a native
    // realpath of `next` collapses no chain — it only reports the spelling the
    // filesystem stores. Cheaper than listing a crowded parent.
    try {
      const real = fs.realpathSync.native(next);
      if (path.dirname(real) === parent) return path.basename(real);
    } catch {
      /* fall through to the listing */
    }
    return seg;
  }
  // A SYMLINK's stored spelling cannot come from realpath (that would follow
  // it), so this is the one case that lists the parent — and symlinks are rare.
  let names = ctx.dirs.get(parent);
  if (names === undefined) {
    try {
      names = fs.readdirSync(parent);
    } catch {
      names = null;
    }
    ctx.dirs.set(parent, names);
  }
  if (names === null || names.includes(seg)) return seg;
  const folded = asciiFold(seg);
  const hits = names.filter((n) => asciiFold(n) === folded);
  return hits.length === 1 ? hits[0] : seg;
}

/**
 * Resolve `p` COMPONENT BY COMPONENT with `lstat`/`readlink`, recording every
 * link LOCATION and every intermediate TARGET in `ctx.chain` — Table X row
 * **X17 (1a)** class (ii). `fs.realpathSync` cannot be used: it collapses the
 * chain to its endpoint, and the chain is precisely what rows **X19** and
 * **X20** protect.
 *
 * THE ALGORITHM IS THE CLASSIC REALPATH ONE, over a PENDING SEGMENT LIST —
 * PR-gate round 2, finding 2. Resolving a link's target with `path.resolve`
 * collapsed its `..` segments LEXICALLY, before the links in front of them had
 * been resolved: `<state>/quarantine -> ../jump/../recovery` with
 * `<core>/jump -> <core>/logs/inner` resolves in the KERNEL to
 * `<core>/logs/recovery`, but collapsed lexically to `<core>/recovery`, so the
 * sweep deleted `<core>/logs` — with the copy in it — while reporting the link
 * preserved. A link's target is therefore pushed onto the pending list as RAW
 * segments, and each `..` is applied to `cur` only when it is reached, after
 * every preceding symlink has been resolved.
 *
 * The hop budget is per CALL, so one root's long-but-valid chain can never make
 * the NEXT root report `ELOOP` (PR-gate round 2, finding 4); `ctx.chain` and
 * `ctx.dirs` stay shared, which is what Table X row **X17 (1a)** needs.
 * @param {string} p an absolute path
 * @param {{chain: Set<string>, dirs: Map<string, string[]|null>}} ctx
 * @returns {{state:'ok'|'absent'|'unanswerable', real:string|null,
 *            dir:string|null, code:string|null}}
 *   `state` — `ok` the whole path exists; `absent` a level reported
 *   `ENOENT`/`ENOTDIR`, which is ABSENCE and not an error (**X17 (3)**), and
 *   `real` then carries the nearest existing ancestor's resolved path with the
 *   missing suffix appended LEXICALLY (**X17 (2)**), so a resolved anchor
 *   exists even when the shelf does not; `unanswerable` any other code
 *   (**X17 (4)**), with `dir`/`code` naming it.
 */
function walkChain(p, ctx) {
  if (!ctx.dirs) ctx.dirs = new Map();
  const root = path.parse(p).root;
  /** @type {Array<string|typeof CHAIN_TARGET>} */
  const pending = p.slice(root.length).split(path.sep).filter((s) => s !== '');
  /** Whatever is still pending, appended LEXICALLY for the absent case (X17 (2)). */
  const suffix = () => pending.filter((s) => typeof s === 'string');
  let cur = root;
  let hops = 0;
  while (pending.length > 0) {
    const seg = pending.shift();
    if (seg === CHAIN_TARGET) {
      ctx.chain.add(cur); // a link's fully-resolved target — class (ii)
      continue;
    }
    const name = /** @type {string} */ (seg);
    if (name === '.') continue;
    if (name === '..') {
      cur = path.dirname(cur); // applied AFTER the links in front of it resolved
      continue;
    }
    let next = path.join(cur, name);
    let st;
    try {
      st = fs.lstatSync(next);
    } catch (e) {
      const code = (e && /** @type {any} */ (e).code) || 'UNKNOWN';
      if (isAbsentCode(code)) {
        return { state: 'absent', real: path.join(next, ...suffix()), dir: null, code: null };
      }
      return { state: 'unanswerable', real: null, dir: next, code };
    }
    // The component EXISTS, so take its on-disk spelling (X12, finding 1).
    const canon = canonicalSegment(cur, name, ctx, st.isSymbolicLink());
    if (canon !== name) next = path.join(cur, canon);
    if (!st.isSymbolicLink()) {
      cur = next;
      continue;
    }
    if (hops >= MAX_LINK_HOPS) {
      return { state: 'unanswerable', real: null, dir: next, code: 'ELOOP' };
    }
    hops += 1;
    ctx.chain.add(next); // the link LOCATION — class (ii)
    let link;
    try {
      link = fs.readlinkSync(next);
    } catch (e) {
      const code = (e && /** @type {any} */ (e).code) || 'UNKNOWN';
      if (isAbsentCode(code)) {
        return { state: 'absent', real: path.join(next, ...suffix()), dir: null, code: null };
      }
      return { state: 'unanswerable', real: null, dir: next, code };
    }
    const absolute = path.isAbsolute(link);
    const body = absolute ? link.slice(path.parse(link).root.length) : link;
    const segs = body.split(path.sep).filter((s) => s !== '');
    cur = absolute ? path.parse(link).root : path.dirname(next);
    pending.unshift(...segs, CHAIN_TARGET);
  }
  return { state: 'ok', real: cur, dir: null, code: null };
}

/** One resolution, with a throwaway chain: the protected set must never be
 *  polluted by the links on a DELETION TARGET's own path. `dirs` is the
 *  CALLER's directory-listing cache for `canonicalSegment`, shared across the
 *  resolutions of one `reverse()` / `disposeCoreMechanics` invocation so a
 *  crowded ancestor is listed once rather than once per entry; it caches
 *  SPELLINGS, never a classification or an emptiness.
 *  @param {string} p @param {Map<string, string[]|null>} [dirs]
 *  @returns {ReturnType<typeof walkChain>} */
function resolveOne(p, dirs) {
  return walkChain(p, { chain: new Set(), dirs: dirs || new Map() });
}

/**
 * THE PROTECTED SHELF SET — Table X row **X17**, computed BEFORE any mutation
 * (**X1** step 0a). Three collections, and their reach differs:
 *   `lexical`  — the byte-exact `<state>/quarantine[/redacted]` joins PLUS every
 *                ASCII-fold-equal name actually found at those levels (**X12**).
 *                Retained whether or not the shelves exist (**X17 (1)**).
 *   `subtrees` — CLASS (i): the shelf roots' RESOLVED targets. These protect the
 *                node AND every descendant; a HYPOTHETICAL root (derived through
 *                the nearest existing ancestor for an absent shelf) keeps the
 *                same full class (i) reach (**X17 (1a)**, round 17).
 *   `chain`    — CLASS (ii): every link LOCATION and intermediate TARGET on a
 *                shelf's resolution chain. These protect the node and its
 *                ANCESTORS only — NOT their unrelated descendants, which is what
 *                keeps `secrets/` removable on a symlinked-core install.
 * `existing` is true when at least one shelf root actually exists; it is
 * consulted by exactly ONE decision in this package, Table X row **X19**'s alias
 * retention. `unanswerable` carries the first non-`ENOENT`/`ENOTDIR` failure,
 * and that level is added to BOTH classes so the question it left open fails
 * closed toward preservation without stranding anything it does not touch.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {{lexical:string[], subtrees:string[], chain:string[],
 *            existing:boolean, unanswerable:{dir:string, code:string}|null}}
 */
function shelfProtection(paths) {
  /** @type {string[]} */ const lexical = [];
  /** @type {string[]} */ const subtrees = [];
  /** @type {Set<string>} */ const chain = new Set();
  /** @type {{dir:string, code:string}|null} */ let unanswerable = null;
  let existing = false;
  // The hop budget lives inside each `walkChain` call, so one root's long chain
  // cannot make the NEXT root report ELOOP (PR-gate round 2, finding 4). The
  // chain-node set and the directory-listing cache stay SHARED across the roots.
  const ctx = { chain, dirs: new Map() };

  /** @param {string} dir @param {string} code */
  const note = (dir, code) => {
    if (!unanswerable) unanswerable = { dir, code };
    if (!subtrees.includes(dir)) subtrees.push(dir);
    chain.add(dir);
  };
  /** @param {string} dir @param {string} want @returns {string[]} */
  const foldNames = (dir, want) => {
    try {
      return fs.readdirSync(dir).filter((n) => asciiFold(n) === want);
    } catch (e) {
      const code = (e && /** @type {any} */ (e).code) || 'UNKNOWN';
      if (!isAbsentCode(code)) note(dir, code);
      return [];
    }
  };

  const qLex = path.join(paths.state, QUARANTINE_DIRNAME);
  /** @type {string[]} */ const roots = [qLex, path.join(qLex, QUARANTINE_REDACTED_DIRNAME)];
  for (const r of roots) lexical.push(r);
  for (const name of foldNames(paths.state, QUARANTINE_DIRNAME)) {
    const q = path.join(paths.state, name);
    if (!lexical.includes(q)) lexical.push(q);
    if (!roots.includes(q)) roots.push(q);
    for (const sub of foldNames(q, QUARANTINE_REDACTED_DIRNAME)) {
      const red = path.join(q, sub);
      if (!lexical.includes(red)) lexical.push(red);
      if (!roots.includes(red)) roots.push(red);
    }
  }
  for (const r of roots) {
    const res = walkChain(r, ctx);
    if (res.state === 'unanswerable') {
      note(/** @type {string} */ (res.dir), /** @type {string} */ (res.code));
      continue;
    }
    if (res.state === 'ok') existing = true;
    if (res.real && !subtrees.includes(res.real)) subtrees.push(res.real);
  }
  return { lexical, subtrees, chain: [...chain], existing, unanswerable, dirs: ctx.dirs };
}

/**
 * Table X row **X16**'s containment check, over Table X row **X17**'s set.
 * FROM BELOW (every caller): the target is at, under, or equal to a lexical
 * anchor or a class (i) subtree, or equals a class (ii) chain node. FROM ABOVE
 * (`recursive` only — Table **V**): the target CONTAINS any of them. The
 * asymmetry is load-bearing: a chain node's unrelated descendants stay
 * removable, which is what keeps `secrets/` deletable on a symlinked core.
 * @param {string} target an absolute path
 * @param {ReturnType<typeof shelfProtection>} prot
 * @param {boolean} recursive true when the deletion at hand is RECURSIVE
 * @returns {boolean} true ⇒ PRESERVE and report
 */
function shelfBlocks(target, prot, recursive) {
  for (const a of prot.lexical) {
    if (lexicalContains(a, target)) return true;
    if (recursive && lexicalContains(target, a)) return true;
  }
  for (const n of prot.subtrees) {
    if (lexicalContains(n, target)) return true;
    if (recursive && lexicalContains(target, n)) return true;
  }
  for (const n of prot.chain) {
    if (target === n) return true;
    if (recursive && lexicalContains(target, n)) return true;
  }
  return false;
}

/**
 * Dispose `paths.state` under Table X row **X1** — the LIVE arm, which never
 * calls `fs.rmSync(…, {recursive:true})` on `<state>`, on `<state>/quarantine`
 * or on `<state>/quarantine/redacted`, and never deletes a shelf file at all.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {ReturnType<typeof shelfProtection>} prot the set from step 0a
 * @param {string[]} removed @param {string[]} preservedQuarantine
 * @returns {void}
 */
function disposeStateTree(paths, prot, removed, preservedQuarantine) {
  const state = paths.state;
  // (0b) CLASSIFY WITH lstat — never statSync, never the isDir helper (X10).
  let st;
  try {
    st = fs.lstatSync(state);
  } catch (e) {
    const code = (e && /** @type {any} */ (e).code) || 'UNKNOWN';
    if (isAbsentCode(code)) return; // absent — nothing to dispose
    preservedQuarantine.push(state); // UNANSWERABLE — preserve and report (X17 (4))
    return;
  }
  if (st.isSymbolicLink()) {
    // X19: RETAIN when (a) an EXISTING shelf's chain passes through it, or
    // (b) its target overlaps ANY of withinAllowedRoot's four roots. Otherwise
    // unlink the link and stop — no enumeration, nothing below it is touched,
    // which is byte-for-byte what a single recursive rmSync already did.
    const res = resolveOne(state, prot.dirs);
    if (res.state === 'unanswerable') {
      preservedQuarantine.push(state);
      return;
    }
    const target = /** @type {string} */ (res.real);
    const localBin = path.join(paths.home, '.local', 'bin');
    const allowedRoots = [paths.core, paths.claudeDir, paths.codexDir, localBin];
    const onExistingChain = prot.existing && shelfBlocks(target, prot, true);
    // The roots are LEXICAL and `target` is RESOLVED, so each root is compared
    // in both forms: `withinAllowedRoot` gates every mutating replay kind, so
    // every path this command can delete lies under one of the four — and a
    // /tmp-style alias on the root's own path must not hide that.
    const overlapsAllowedRoot = allowedRoots.some((r) => {
      const rr = resolveOne(r, prot.dirs);
      const forms = rr.real !== null && rr.real !== r ? [r, rr.real] : [r];
      return forms.some((c) => lexicalContains(c, target) || lexicalContains(target, c));
    });
    if (onExistingChain || overlapsAllowedRoot) {
      preservedQuarantine.push(state);
      return;
    }
    fs.unlinkSync(state);
    removed.push(state); // X4: the whole of <state> is gone
    return;
  }
  if (!st.isDirectory()) return; // not a directory at all — do nothing
  // (1) ENUMERATE. A failure here PROPAGATES, exactly as before (X13).
  const children = fs.readdirSync(state);
  // (2) Remove every non-shelf child, each gated by X16's symmetric check (X18).
  for (const name of children) {
    const child = path.join(state, name);
    if (asciiFold(name) === QUARANTINE_DIRNAME) {
      // A name that folds equal but is NOT byte-equal is PRESERVED and reported:
      // nothing cheap can tell our shelf under another spelling from a
      // look-alike the user made (X12). The byte-exact one is step 3's.
      if (name !== QUARANTINE_DIRNAME) preservedQuarantine.push(child);
      continue;
    }
    const res = resolveOne(child, prot.dirs);
    if (
      res.state === 'unanswerable'
      || shelfBlocks(child, prot, true)
      || (res.real !== null && shelfBlocks(res.real, prot, true))
    ) {
      preservedQuarantine.push(child);
      continue;
    }
    fs.rmSync(child, { recursive: true, force: true }); // a failure PROPAGATES (X13)
  }
  // (3) VALIDATE TOP-DOWN, THEN REMOVE BOTTOM-UP — two passes, opposite
  //     directions (X11). lstat classifies only a path's FINAL component, so
  //     every ancestor is proven a real directory before any descendant is
  //     accessed at all.
  const levels = [
    state,
    path.join(state, QUARANTINE_DIRNAME),
    path.join(state, QUARANTINE_DIRNAME, QUARANTINE_REDACTED_DIRNAME),
  ];
  /** @type {string[]} */ const validated = [];
  for (const level of levels) {
    let ls;
    try {
      ls = fs.lstatSync(level);
    } catch (e) {
      const code = (e && /** @type {any} */ (e).code) || 'UNKNOWN';
      if (!isAbsentCode(code)) preservedQuarantine.push(level);
      break; // absent ⇒ nothing below it; unreadable ⇒ off-limits
    }
    if (!ls.isDirectory()) {
      preservedQuarantine.push(level); // a symlink, file or socket — never followed
      break;
    }
    validated.push(level);
  }
  for (let i = validated.length - 1; i >= 0; i -= 1) {
    const level = validated[i];
    try {
      // rmdirSync IS the whole mechanism: it removes a directory if and only if
      // it is empty, atomically, in the kernel — so the emptiness test and the
      // deletion are one syscall with no interval for anything to arrive in.
      fs.rmdirSync(level);
    } catch (e) {
      const code = (e && /** @type {any} */ (e).code) || 'UNKNOWN';
      if (isAbsentCode(code)) continue; // already gone — not an error
      preservedQuarantine.push(level);
      return; // PRESERVE and stop climbing (every ancestor is preserved with it)
    }
    // Success is INTERNAL bookkeeping except for <state> itself (X4).
    if (level === state) removed.push(state);
  }
}

/**
 * Dispose the canonical core's machine-generated-mechanics subdirs after a
 * manifest replay, then remove the now-empty core (ADR-0019). logs/,
 * schedules/, secrets/ hold only Wienerdog-authored runtime artifacts (alerts,
 * update-check, schedule.json, run-job logs, Windows Task Scheduler XML, OAuth
 * tokens) — none manifest-tracked, none user-authored. Remove each recursively,
 * then remove the now-empty core dir itself (best-effort; a core that is itself
 * a symlink has its link unlinked, leaving the emptied target dir in place). A
 * user-modified config.yaml (kept by reverse) keeps the core alive — the sole
 * exception to "uninstall leaves only the vault". Idempotent: subdirs already
 * gone are skipped.
 *
 * **`state/` IS THE ONE EXCEPTION TO "none user-authored"**, and it is why this
 * function no longer sweeps it whole: the dream gate copies the user's own note
 * text into `<state>/quarantine` and `<state>/quarantine/redacted` before
 * withholding or redacting it (`src/core/dream/validate.js`), under the
 * amendment to ADR-0019. Disposal of `paths.state` therefore follows Table X
 * row **X1** and takes NO inventory on the LIVE arm. EVERY path it classifies is
 * classified with `fs.lstatSync`, never `statSync` and never the `isDir` helper
 * (**X10**): a SYMLINKED `paths.state` is unlinked only when **X19** permits it
 * and is NEVER descended, and a shelf root that is not a real directory is
 * preserved untouched. Because `lstat` classifies only a path's FINAL
 * component, the shelf levels are VALIDATED top-down before any descendant is
 * accessed, and only the validated prefix is then removed bottom-up (**X11**).
 * The shelf directories are identified by ASCII CASE FOLD (**X12**). The
 * no-throw handling is SCOPED to the shelf levels and to the pre-existing
 * empty-core step (**X13**): a failure enumerating `paths.state`, or removing
 * any non-shelf child, `logs/`, `schedules/` or `secrets/`, still PROPAGATES
 * exactly as before, so `uninstall.js` never reaches its manifest and config
 * deletes and the install stays retryable.
 *
 * `dryRun: true` is a READ-ONLY PLANNER (**X15**), not a disposal with the
 * writes removed: it runs `quarantineInventory` — same fold, same top-down
 * validation — performs NO mutating filesystem call at all, and returns
 * `removed` as PREDICTED removals at the same granularity. The live arm stays
 * snapshot-free, and the carve-out takes NO option: no caller can disable it
 * (**X2**).
 *
 * Containment guard (defense in depth): `adopt` refuses a vault inside the
 * core, but this deleter does not trust that invariant — a legacy or
 * hand-edited install may have nested the vault under a mechanics dir. Any
 * swept dir that equals or contains the resolved `vaultPath` is skipped and
 * reported in `skippedForVault` so the caller can tell the truth about it.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{dryRun?: boolean, vaultPath?: string|null}} [opts]
 * @returns {{removed: string[], skippedForVault: string[],
 *            preservedQuarantine: string[]}} `removed` KEEPS ITS ORIGINAL
 *   MECHANICS-DIRECTORY GRANULARITY (**X4**): `paths.state` appears at most once
 *   and only when the whole of `<state>` is gone; the intermediate rmdirs of
 *   `quarantine` and `redacted` are internal and never appear; and when any
 *   shelf level was preserved `paths.state` does not appear at all. The caller
 *   sums `removed.length` and renders it, so this granularity is what keeps an
 *   empty-shelf uninstall byte-identical to before. `skippedForVault` is
 *   unchanged. `preservedQuarantine` lists the directories this call left in
 *   place, in the shape the caller already uses for `skippedForVault`.
 */
function disposeCoreMechanics(paths, { dryRun = false, vaultPath = null } = {}) {
  /** @type {string[]} */ const removed = [];
  /** @type {string[]} */ const skippedForVault = [];
  /** @type {string[]} */ const preservedQuarantine = [];
  const mechanics = [
    paths.state,
    paths.logs,
    path.join(paths.core, 'schedules'),
    paths.secrets,
  ];
  // (0a) THE PROTECTED SHELF TARGETS, FIRST — before step 0b, before step 2 and
  //      before step 3. Computing them later leaves the checks with nothing to
  //      check (X18) or lets the unlink erase the evidence they derive from
  //      (X19). The LIVE arm takes no inventory and holds no snapshot (X2).
  const prot = dryRun ? null : shelfProtection(paths);
  const plan = dryRun ? quarantineInventory(paths) : null;
  for (const dir of mechanics) {
    const isState = dir === paths.state;
    // `<state>` is classified by Table X row X1 step 0b, with `lstat`, INSIDE
    // `disposeStateTree` — never by `isDir`, which follows symlinks (X10).
    if (!isState && !isDir(dir)) continue;
    // The vault guard runs FIRST and is untouched (X8): a swept dir that equals
    // or contains the resolved vault is skipped whole and the carve-out never
    // runs on it. Both rules only ever PRESERVE, so their interaction cannot
    // delete anything either would have kept.
    if (vaultPath && isDir(dir) && contains(dir, vaultPath)) {
      skippedForVault.push(dir);
      continue;
    }
    if (isState) {
      if (plan) {
        // X15's READ-ONLY PLANNER. `<state>` is predicted removed IFF the shelf
        // is ABSENT or EMPTY and every level validated; otherwise the levels
        // that would be preserved are named instead. Being wrong costs a line
        // of output, never a byte — a planner has no deletion to race.
        if (!isDir(dir)) continue;
        const shelfClean = plan.entries === 0 && plan.unreadable.length === 0;
        if (shelfClean) {
          removed.push(dir);
        } else {
          for (const r of plan.roots) if (r.entries > 0) preservedQuarantine.push(r.dir);
          for (const u of plan.unreadable) {
            if (!preservedQuarantine.includes(u.dir)) preservedQuarantine.push(u.dir);
          }
          for (const b of plan.blockers || []) {
            if (!preservedQuarantine.includes(b)) preservedQuarantine.push(b);
          }
        }
        continue;
      }
      disposeStateTree(paths, /** @type {any} */ (prot), removed, preservedQuarantine);
      continue;
    }
    if (prot) {
      // X18/Table V: this recursive rmSync is NOT an exemption — `<core>/logs`
      // can be a real directory a shelf symlink resolves into.
      const res = resolveOne(dir, prot.dirs);
      if (
        res.state === 'unanswerable'
        || shelfBlocks(dir, prot, true)
        || (res.real !== null && shelfBlocks(res.real, prot, true))
      ) {
        preservedQuarantine.push(dir);
        continue;
      }
    }
    if (!dryRun) fs.rmSync(dir, { recursive: true, force: true });
    removed.push(dir);
  }
  let children = null;
  try {
    children = fs.readdirSync(paths.core);
  } catch {
    children = null; // core (or its symlink target) is gone / unreadable
  }
  if (children !== null && children.length === 0) {
    // Best-effort: never let this final cosmetic step crash the uninstall.
    // A core that is itself a symlink would make rmdirSync throw ENOTDIR —
    // unlink the user's link instead (the emptied target dir remains theirs).
    try {
      if (!dryRun) {
        if (isSymlink(paths.core)) fs.unlinkSync(paths.core);
        else fs.rmdirSync(paths.core);
      }
      removed.push(paths.core);
    } catch {
      /* ignore — leaving an empty core behind beats a nonzero uninstall */
    }
  }
  return { removed, skippedForVault, preservedQuarantine };
}

module.exports = { load, record, save, reverse, disposeCoreMechanics, quarantineInventory, discoverSchedulesOnDisk, DISCOVERED_DISPOSITION, R9_LOGIN_RELOAD_WARNING, reverseSchedulerEntry, reverseVendoredTree, reverseCopiedSkill, reverseSymlink, hashDir, insertionAnchor, linkIdentity, sha256File, validateEntry, withinAllowedRoot, withinSchedulerRoot };
