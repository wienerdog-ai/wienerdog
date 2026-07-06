'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

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
  const begin = content.indexOf(BEGIN_SENTINEL);
  const end = content.indexOf(END_SENTINEL);
  if (begin === -1 || end === -1 || end < begin) {
    // User removed the block themselves — nothing to reverse.
    skipped.push(entry.path);
    return;
  }
  let before = content.slice(0, begin);
  let after = content.slice(end + END_SENTINEL.length);
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
 * Reverse a 'scheduler-entry' entry: run the stored `unload` argv best-effort to
 * unregister the entry from the OS scheduler, then remove the file. Keeps
 * manifest.js free of any launchd/systemd knowledge — the platform-specific
 * `unload` argv is computed at add time (schedule.js) and stored on the entry.
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 */
function reverseSchedulerEntry(entry, dryRun, removed, skipped, removedSet) {
  if (Array.isArray(entry.unload) && entry.unload.length > 0) {
    if (dryRun) {
      process.stdout.write(`wienerdog: would run: ${entry.unload.join(' ')}\n`);
    } else {
      // Best-effort: the entry may already be unloaded. Ignore non-zero/errors;
      // the goal is the file removal below.
      try {
        spawnSync(entry.unload[0], entry.unload.slice(1));
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
 * Reverse a 'vendored-tree' entry: recursively remove the vendored app tree
 * (entirely Wienerdog-authored, regenerable by `sync`). Adds the path to
 * removedSet so the enclosing core dir still counts as empty. In dev mode the
 * tree holds only the `current` symlink; removing it never touches the checkout.
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 */
function reverseVendoredTree(entry, dryRun, removed, skipped, removedSet) {
  if (!isDir(entry.path)) { skipped.push(entry.path); return; }
  if (!dryRun) fs.rmSync(entry.path, { recursive: true, force: true });
  removedSet.add(entry.path);
  removed.push(entry.path);
}

/**
 * Reverse a 'copied-skill' entry: recursively remove the copied skill folder
 * (entirely Wienerdog-authored, regenerable by `sync`). Adds the path to
 * removedSet so the enclosing skills dir still counts as empty.
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 */
function reverseCopiedSkill(entry, dryRun, removed, skipped, removedSet) {
  if (!isDir(entry.path)) { skipped.push(entry.path); return; }
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
 * 'dir', only if empty), in reverse order. Files that changed since install are
 * still ours to remove EXCEPT config.yaml, which is kept with a notice when it
 * was modified after install (recorded hash mismatch). Unknown kinds are
 * skipped with a warning (forward compat for later WPs). The manifest file
 * itself is removed as bookkeeping.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {Manifest} manifest
 * @param {{dryRun?: boolean}} [opts]
 * @returns {{removed: string[], skipped: string[], preserved: string[]}}
 */
function reverse(paths, manifest, { dryRun = false } = {}) {
  /** @type {string[]} */ const removed = [];
  /** @type {string[]} */ const skipped = [];
  /** @type {string[]} */ const preserved = [];
  // The manifest file is our own bookkeeping: treat it as (virtually) removed
  // so the core dir counts as empty, and delete it for real on a live run.
  const removedSet = new Set([paths.manifest]);
  if (!dryRun) {
    try {
      fs.rmSync(paths.manifest, { force: true });
    } catch {
      /* ignore — already gone */
    }
  }

  for (const entry of [...manifest.entries].reverse()) {
    if (entry.kind === 'file') {
      if (!isFile(entry.path)) {
        skipped.push(entry.path);
        continue;
      }
      if (
        entry.path === paths.config &&
        entry.hash &&
        sha256File(entry.path) !== entry.hash
      ) {
        process.stderr.write(`wienerdog: keeping ${entry.path} — modified since install\n`);
        skipped.push(entry.path);
        continue;
      }
      if (!dryRun) fs.rmSync(entry.path, { force: true });
      removedSet.add(entry.path);
      removed.push(entry.path);
    } else if (entry.kind === 'dir') {
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
      reverseSchedulerEntry(entry, dryRun, removed, skipped, removedSet);
    } else if (entry.kind === 'vendored-tree') {
      reverseVendoredTree(entry, dryRun, removed, skipped, removedSet);
    } else if (entry.kind === 'copied-skill') {
      reverseCopiedSkill(entry, dryRun, removed, skipped, removedSet);
    } else if (entry.kind === 'vault-file' || entry.kind === 'vault-dir') {
      // The vault is the user's treasure — always preserved (ADR-0010, ADR-0019).
      // No filesystem action; NOT added to removedSet (it lives outside the core).
      // Counted so uninstall can print ONE plain-language reassurance line
      // instead of the former per-file 'unknown kind' stderr warnings.
      preserved.push(entry.path);
    } else {
      process.stderr.write(
        `wienerdog: skipping unknown manifest entry kind '${entry.kind}' (${entry.path})\n`
      );
      skipped.push(entry.path);
    }
  }

  return { removed, skipped, preserved };
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

module.exports = { load, record, save, reverse, disposeCoreMechanics, reverseSchedulerEntry, reverseVendoredTree, reverseCopiedSkill };
