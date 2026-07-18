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
 *   {kind:'symlink', path}                          — a symlink we created
 *   {kind:'managed-block', path, createdFile:bool}  — a sentinel block we wrote
 *                                                     into a (maybe user-owned) file
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
 *            commands?: string[], unload?: string[]}} ManifestEntry
 * @typedef {{version: number, createdAt: string, entries: ManifestEntry[]}} Manifest
 */

const BEGIN_SENTINEL = '<!-- wienerdog:begin -->';
const END_SENTINEL = '<!-- wienerdog:end -->';

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
 * Reverse a 'symlink' entry: unlink only if it is still a symlink we created.
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 */
function reverseSymlink(entry, dryRun, removed, skipped, removedSet) {
  if (!isSymlink(entry.path)) {
    // User replaced it with a real file/dir, or it is already gone.
    skipped.push(entry.path);
    return;
  }
  if (!dryRun) fs.unlinkSync(entry.path);
  removedSet.add(entry.path);
  removed.push(entry.path);
}

/**
 * Reverse a 'managed-block' entry: strip the exact span the forward step
 * introduced — the block plus one leading newline (the blank-line separator)
 * and the one trailing newline after the end sentinel — so a pre-existing
 * file round-trips byte-identically through sync → uninstall. A block the
 * user relocated mid-file uninstalls to exactly one blank line between the
 * surrounding regions. Delete the file only if we created it and nothing
 * else remains.
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 */
function reverseManagedBlock(entry, dryRun, removed, skipped, removedSet) {
  let content;
  try {
    content = fs.readFileSync(entry.path, 'utf8');
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
  // The forward step wrote '\n' + block + '\n' after the prior content's own
  // trailing newline: one newline forming the blank-line separator, one
  // terminating the end sentinel. Remove exactly those two characters along
  // with the block itself.
  if (before.endsWith('\n')) before = before.slice(0, -1);
  if (after.startsWith('\n')) after = after.slice(1);
  const remaining = before + after;

  if (entry.createdFile === true && remaining.trim() === '') {
    if (!dryRun) fs.rmSync(entry.path, { force: true });
    removedSet.add(entry.path);
  } else if (!dryRun) {
    fs.writeFileSync(entry.path, remaining);
  }
  removed.push(entry.path);
}

/**
 * Reverse a 'settings-entry' entry: drop the hook commands we merged in, then
 * prune any now-empty groups / event arrays / the hooks key. Delete the file
 * only if we created it and it is now `{}`.
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 */
function reverseSettingsEntry(entry, dryRun, removed, skipped, removedSet) {
  let raw;
  try {
    raw = fs.readFileSync(entry.path, 'utf8');
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
    if (!dryRun) fs.rmSync(entry.path, { force: true });
    removedSet.add(entry.path);
  } else if (!dryRun) {
    fs.writeFileSync(entry.path, `${JSON.stringify(settings, null, 2)}\n`);
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
  // Audit A8 / ADR-0027 (WP-145): the manifest is UNTRUSTED, so the stored
  // `entry.unload` argv is NEVER read or executed — a poisoned
  // {unload:['/bin/sh','-c','…']} must spawn nothing. The unregister command is
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
  // Bound the file removal (WP-145): only a recognized wienerdog schedule file
  // inside a known scheduler root (LaunchAgents / systemd user dir /
  // <core>/schedules) may be deleted; anything else is preserved.
  if (!withinSchedulerRoot(entry.path, schedulerRoots)) {
    process.stderr.write(`wienerdog: preserving ${entry.path} — not a recognized Wienerdog schedule file\n`);
    skipped.push(entry.path);
    return;
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
 * @param {{dryRun?: boolean}} [opts]
 * @returns {{removed: string[], skipped: string[], preserved: string[], deferredConfig: string|null, deferredConfigHash: string|null}}
 */
function reverse(paths, manifest, { dryRun = false } = {}) {
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
        if (sha256File(entry.path) === entry.hash) {
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
    // ── PER-ENTRY ERROR ISOLATION + ROOT BOUND (audit A8, WP-144) ────────────
    // One throwing reverser must never abort the whole uninstall (that made the
    // install permanently un-uninstallable — every retry hit the same entry).
    // The containment check lives INSIDE the try so an fs error during realpath
    // resolution also fails safe (preserve, not crash).
    try {
      if (MUTATING_KINDS.has(entry.kind) && !withinAllowedRoot(entry.path, allowedRoots, localBin)) {
        // A poisoned/hand-edited entry pointing outside every Wienerdog-owned
        // root (e.g. {kind:'file', path:'~/taxes.pdf'}) — PRESERVE, never delete.
        process.stderr.write(
          `wienerdog: preserving ${entry.path} — outside every Wienerdog-owned root (not deleting)\n`
        );
        skipped.push(entry.path);
        continue;
      }
      if (entry.kind === 'file') {
        // (manifest/config already handled by the global guard above.)
        if (!isFile(entry.path)) {
          skipped.push(entry.path);
          continue;
        }
        if (entry.hash && sha256File(entry.path) !== entry.hash) {
          // We recorded this file's content at write time; it differs now → the
          // user (or another writer) changed it. Prove-before-delete: keep it,
          // don't destroy an edit.
          process.stderr.write(`wienerdog: keeping ${entry.path} — modified since install\n`);
          skipped.push(entry.path);
          continue;
        }
        if (!dryRun) fs.rmSync(entry.path, { force: true });
        removedSet.add(entry.path);
        removed.push(entry.path);
      } else if (entry.kind === 'dir') {
        // (The core is handled by the global guard above and never reaches here.)
        if (!isDir(entry.path)) {
          skipped.push(entry.path);
          continue;
        }
        const remaining = fs
          .readdirSync(entry.path)
          .map((child) => path.join(entry.path, child))
          .filter((child) => !removedSet.has(child));
        if (remaining.length > 0) {
          skipped.push(entry.path);
          continue;
        }
        if (!dryRun) fs.rmdirSync(entry.path);
        removedSet.add(entry.path);
        removed.push(entry.path);
      } else if (entry.kind === 'symlink') {
        reverseSymlink(entry, dryRun, removed, skipped, removedSet);
      } else if (entry.kind === 'managed-block') {
        reverseManagedBlock(entry, dryRun, removed, skipped, removedSet);
      } else if (entry.kind === 'settings-entry') {
        reverseSettingsEntry(entry, dryRun, removed, skipped, removedSet);
      } else if (entry.kind === 'scheduler-entry') {
        reverseSchedulerEntry(entry, dryRun, removed, skipped, removedSet, schedulerOpts);
      } else if (entry.kind === 'vendored-tree') {
        reverseVendoredTree(entry, dryRun, removed, skipped, removedSet, appRoot);
      } else if (entry.kind === 'copied-skill') {
        reverseCopiedSkill(entry, dryRun, removed, skipped, removedSet, skillsRoots);
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

  return { removed, skipped, preserved, deferredConfig, deferredConfigHash };
}

/** Required/optional field types per manifest kind (audit A8, WP-144). Keys
 *  beyond these are ignored (forward-compat), never rejected; only the listed
 *  fields are type-enforced. `scheduler-entry` gets deep validation in WP-145. */
const ENTRY_FIELD_TYPES = {
  file: { hash: 'string' },
  dir: {},
  symlink: {},
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

/**
 * Dispose the canonical core's machine-generated-mechanics subdirs after a
 * manifest replay, then remove the now-empty core (ADR-0019). state/, logs/,
 * schedules/, secrets/ hold only Wienerdog-authored runtime artifacts (digest,
 * watermarks, alerts, update-check, schedule.json, scratch, run-job logs,
 * Windows Task Scheduler XML, OAuth tokens) — none manifest-tracked, none
 * user-authored. Remove each recursively, then remove the now-empty core dir
 * itself (best-effort; a core that is itself a symlink has its link unlinked,
 * leaving the emptied target dir in place). A user-modified config.yaml (kept
 * by reverse) keeps the core alive — the sole exception to "uninstall leaves
 * only the vault". Idempotent: subdirs already gone are skipped. In dry-run
 * nothing is removed (the caller lists what it reports).
 *
 * Containment guard (defense in depth): `adopt` refuses a vault inside the
 * core, but this deleter does not trust that invariant — a legacy or
 * hand-edited install may have nested the vault under a mechanics dir. Any
 * swept dir that equals or contains the resolved `vaultPath` is skipped and
 * reported in `skippedForVault` so the caller can tell the truth about it.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{dryRun?: boolean, vaultPath?: string|null}} [opts]
 * @returns {{removed: string[], skippedForVault: string[]}} dirs recursively
 *   removed (+ the core if removed), and dirs left alive to protect the vault.
 */
function disposeCoreMechanics(paths, { dryRun = false, vaultPath = null } = {}) {
  /** @type {string[]} */ const removed = [];
  /** @type {string[]} */ const skippedForVault = [];
  const mechanics = [
    paths.state,
    paths.logs,
    path.join(paths.core, 'schedules'),
    paths.secrets,
  ];
  for (const dir of mechanics) {
    if (!isDir(dir)) continue;
    if (vaultPath && contains(dir, vaultPath)) {
      skippedForVault.push(dir);
      continue;
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
  return { removed, skippedForVault };
}

module.exports = { load, record, save, reverse, disposeCoreMechanics, reverseSchedulerEntry, reverseVendoredTree, reverseCopiedSkill, hashDir, sha256File, validateEntry, withinAllowedRoot, withinSchedulerRoot };
