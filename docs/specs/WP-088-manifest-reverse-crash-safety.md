---
id: WP-088
title: Uninstall crash-safety — delete the manifest last, hash-guard file deletes, contain vendored-tree removal, fingerprint-guard copied-skill removal
status: Draft
model: opus
size: M
depends_on: [WP-089]
adrs: [ADR-0019]
branch: wp/088-manifest-reverse-crash-safety
---

# WP-088: Uninstall crash-safety + prove-before-delete

## Context (read this, nothing else)

Wienerdog's promise is **reversibility**: everything the installer writes is
recorded in `~/.wienerdog/install-manifest.json`, and `wienerdog uninstall`
replays that manifest in reverse to remove exactly what was added, leaving the
user's memory **vault** untouched (THREAT-MODEL T5; ADR-0019). `uninstall`
**refuses to run without the manifest** (`src/cli/uninstall.js` checks it exists).

Four verified gaps in `src/core/manifest.js` `reverse()` (and its `uninstall.js`
orchestration) undermine that promise:

1. **Crash-consistency (P0):** `reverse()` deletes `install-manifest.json`
   **first**, before the reversal loop runs. A crash / power loss / thrown error
   partway through the loop leaves shims, hooks, scheduler registrations, managed
   blocks, or the vendored tree in place with **no manifest to retry** — and
   uninstall then refuses to run at all. The recovery ledger must survive **every**
   crash-prone step of the whole uninstall — both the `reverse()` reversal loop AND
   the `disposeCoreMechanics` sweep that runs AFTER it in `uninstall.js`. Deleting
   the manifest at the end of `reverse()` is **not enough**: a crash during the
   later mechanics sweep would still lose the ledger and wedge retry. The manifest
   must be deleted only after BOTH `reverse()` and `disposeCoreMechanics` complete —
   which lives in `src/cli/uninstall.js`, the orchestrator of both.

2. **Delete-without-ownership-proof for HASHED files (P0, partial):** the
   `kind:'file'` reversal removes any recorded file with no content check **except**
   `config.yaml` (the sole hash-guarded entry). A hashed file the user hand-edited
   after install is deleted, destroying user content. `config.yaml` already
   demonstrates the correct fail-safe: *keep the file with a notice when its recorded
   hash no longer matches.* This WP generalizes that mechanism to **every**
   `kind:'file'` entry that carries a recorded `hash`. **Scope limit (do not
   over-claim):** the shims (`writeShim`) and hook scripts (`copyHookScript`) record
   **no** hash today, so a user edit to *those* files is still deletable after this
   WP — the generalized guard only protects entries that HAVE a hash. Making those
   writers record hashes is the follow-up that fully closes delete-without-proof for
   them (see Out of scope). *(This per-FILE `sha256File` hash-guard is a separate
   mechanism from the copied-skill directory-tree fingerprint in gap 4 below.)*

3. **Unbounded recursive-tree removal — vendored tree (P0):** `reverseVendoredTree`
   recursively deletes the entry's path with **no containment proof**.
   `contains(paths.core, x)` returns true when `x` **equals** `paths.core`
   (`manifest.js:386` → `path.relative` yields `''`), so a manipulated `vendored-tree`
   entry pointing at `paths.core` itself would recursively delete config, secrets,
   state, and any nested legacy vault. The only legitimate value `vendorSelf` ever
   records is the app root `paths.core/app` (`appDir`). Removal must be contained to
   that app root — resolve **EQUAL** to `paths.core/app` — which **rejects the
   equal-to-core case** (core is the *parent* of app, so it is never inside/equal to
   app) and every descendant. `contains(core, x)` is wrong here precisely because it
   accepts `x === core`.

4. **Unbounded recursive-tree removal — copied skill (P0):** `reverseCopiedSkill`
   likewise recursively deletes with no containment or ownership proof. Copied
   skills live **outside** `paths.core`, under the harness skills dirs
   (`<claudeDir>/skills/wienerdog-*`, `<codexDir>/skills/wienerdog-*`), so core
   containment would reject **every legitimate** copied-skill uninstall. Removal
   must instead prove ALL of:
   - (a) the target's **parent directory EQUALS** one of those harness skills roots —
     a *strict child*, not merely a descendant, so
     `<claudeDir>/skills/user-content/wienerdog-x` is refused;
   - (b) its basename is in Wienerdog's `wienerdog-*` namespace; AND
   - (c) the on-disk directory still **fingerprints (via the shared `hashDir`,
     WP-089) to the `hash` recorded on the `copied-skill` manifest entry** — proof
     it is our own unmodified copy. A hash-less (legacy) entry, a fingerprint
     mismatch (the user edited/replaced Wienerdog's copy at that path), or an
     unreadable tree (`hashDir` → `null`, which can never `===` a string) is
     **preserved with a notice**, never deleted.
   `contains(root, path)` is WRONG for (a): it accepts any depth AND is reflexive
   (accepts the root itself).

**Product invariants that bound this WP:** Wienerdog is just files (ADR-0004);
`reverse()` is synchronous filesystem code. The vault is always preserved
(ADR-0019); this WP does not change vault handling.

## Current state

`src/core/manifest.js` `reverse(paths, manifest, {dryRun})` (lines ~301–377):

```js
function reverse(paths, manifest, { dryRun = false } = {}) {
  const removed = []; const skipped = []; const preserved = [];
  const removedSet = new Set([paths.manifest]);
  if (!dryRun) {
    try { fs.rmSync(paths.manifest, { force: true }); } catch { /* ignore */ }  // ← deleted FIRST
  }
  for (const entry of [...manifest.entries].reverse()) {
    if (entry.kind === 'file') {
      if (!isFile(entry.path)) { skipped.push(entry.path); continue; }
      if (entry.path === paths.config && entry.hash && sha256File(entry.path) !== entry.hash) {
        process.stderr.write(`wienerdog: keeping ${entry.path} — modified since install\n`);
        skipped.push(entry.path); continue;                                     // ← config.yaml ONLY
      }
      if (!dryRun) fs.rmSync(entry.path, { force: true });
      removedSet.add(entry.path); removed.push(entry.path);
    } else if (entry.kind === 'dir') { /* remove if empty */ }
    // …symlink / managed-block / settings-entry / scheduler-entry / vendored-tree /
    //   copied-skill / vault-file|vault-dir / unknown…
  }
  return { removed, skipped, preserved };
}
```

`reverseVendoredTree` / `reverseCopiedSkill` (`manifest.js:227-247`) each do
`if (!isDir(entry.path)) { skipped… } else fs.rmSync(entry.path, {recursive:true,
force:true})` — no containment check, no ownership check.

`contains(outer, inner)` already exists (`manifest.js:386-397`): realpath-
canonicalizes both sides and returns true iff `inner` is `outer` **or** inside it
(so it returns true when they are equal — the P0 above); an unresolvable side
returns false (fail-safe). `path`, `fs`, `crypto` are already imported in
`manifest.js` (`manifest.js:1-5`); this WP adds **no** new `require` and no new
top-level import.

**`hashDir` is provided by WP-089 (this WP's dependency).** WP-089 defines and
exports `hashDir(root)` in `manifest.js` — the raw-byte, length-framed, node-type-
tagged sha256 tree fingerprint that returns `null` on any read/traversal error.
This WP **calls that same function** (same module — no import needed, no
redefinition) for the copied-skill ownership check, so the forward recorder and the
reverse checker use one identical serializer. WP-089 also makes the `copied-skill`
entry carry a `hash` field (`{kind:'copied-skill', path, hash}`); this WP reads
`entry.hash`. That shared function + field is exactly why this WP `depends_on:
[WP-089]`.

**Expected legitimate paths (the containment anchors):**
- vendored-tree: `vendorSelf` (`src/core/vendor.js`) records exactly
  `{kind:'vendored-tree', path: appDir}` where `appDir = path.join(paths.core, 'app')`.
  So the app root is `path.join(paths.core, 'app')` — computable inline in
  `manifest.js` without importing `vendor.js`.
- copied-skill: `applySkillLinks` (`src/adapters/shared.js`) records
  `{kind:'copied-skill', path: <targetSkillsDir>/wienerdog-<name>, hash}`. The two
  harness skills roots are `path.join(paths.claudeDir, 'skills')` and
  `path.join(paths.codexDir, 'skills')` (both derivable from `paths`).

`src/cli/uninstall.js` `run()` orchestrates uninstall: it loads the manifest,
calls `manifestLib.reverse(paths, manifest)`, then
`manifestLib.disposeCoreMechanics(paths, {vaultPath})` (which sweeps the
machine-generated `state/logs/schedules/secrets` dirs and, when the core is empty,
removes the core itself, symlink-aware and vault-aware). `disposeCoreMechanics` is
idempotent (already-gone subdirs are skipped). `disposeCoreMechanics` does NOT
remove `<core>/skills/`; that dir is removed by `reverse()`'s own `dir`/`file`
entries. `uninstall.js` refuses to run when `paths.manifest` is absent (`fileExists`
check at the top). `fs` is imported there.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | (1) `reverse()` NO LONGER deletes the manifest (keep `removedSet` seeded with `paths.manifest`); (2) generalize the config-only `sha256File` hash-mismatch preservation to every `kind:'file'` with a `hash`; (3) add ONE local `sameResolvedDir` helper; require `reverseVendoredTree`'s target to resolve EQUAL to `paths.core/app`, and `reverseCopiedSkill`'s target to be a strict child (parent EQUALS a harness skills root) in the `wienerdog-*` namespace whose on-disk tree still fingerprints (via the WP-089 `hashDir`) to `entry.hash`; pass `appRoot` and `skillsRoots` in from `reverse()`. Do NOT redefine `hashDir` (WP-089 defines it in this module). No new `require`/top-level import. |
| modify | src/cli/uninstall.js | delete the manifest ONLY after both `reverse()` and `disposeCoreMechanics()` complete, then sweep the now-empty core (idempotent second `disposeCoreMechanics`); merge its removed-core into the summary |
| modify | tests/unit/manifest.test.js | tests for reverse-does-not-delete-manifest, hashed-file preserve-on-mismatch, equal-to-core vendored-tree refusal, out-of-app vendored-tree refusal, copied-skill refusal for a deeper descendant (parent ≠ skills root) / outside the `wienerdog-*` namespace / a copy whose on-disk fingerprint DIFFERS from `entry.hash` (preserved) / a legacy hash-less entry (preserved) / an unreadable copy (hashDir null → preserved), and a legitimate copied-skill removal (parent equals a harness skills root + `wienerdog-*` + fingerprint matches `entry.hash`) |
| modify | tests/unit/uninstall.test.js | tests: the manifest survives a throw during `disposeCoreMechanics` (recovery ledger intact for retry); a clean uninstall deletes the manifest last and removes the empty core |

### Exact contracts

**(1) Delete the manifest last — in `uninstall.js`, after mechanics disposal.**
`reverse()` must **no longer delete the manifest at all**. Remove the eager
`fs.rmSync(paths.manifest, …)` block (current lines ~308–314) entirely, but KEEP
`removedSet` seeded with `paths.manifest` so the enclosing-core "is it empty?"
accounting inside the reversal loop is byte-for-byte unchanged:

```js
function reverse(paths, manifest, { dryRun = false } = {}) {
  const removed = []; const skipped = []; const preserved = [];
  // Seed with the manifest path so the core dir still counts as (virtually) empty.
  // The manifest FILE is NOT touched here — uninstall.js deletes it only after the
  // whole uninstall (reversal loop + mechanics sweep) has succeeded, so a crash at
  // any point leaves a replayable ledger (uninstall refuses without it).
  const removedSet = new Set([paths.manifest]);
  for (const entry of [...manifest.entries].reverse()) { /* …reversal loop, unchanged… */ }
  return { removed, skipped, preserved };
}
```

Then in `src/cli/uninstall.js` `run()`, on the LIVE (non-dry-run) path, delete the
manifest only after both `reverse()` and the first `disposeCoreMechanics()` return,
then sweep the emptied core with a second (idempotent) `disposeCoreMechanics()`:

```js
const { removed, skipped, preserved } = manifestLib.reverse(paths, manifest, { dryRun: false });
// First sweep: removes state/logs/schedules/secrets. The core is NOT removed yet —
// the manifest file still sits in it, so its emptiness check fails (correct).
const { removed: mech, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
  dryRun: false,
  vaultPath,
});
// Recovery ledger removed ONLY now — every crash-prone step above has completed.
try { fs.rmSync(paths.manifest, { force: true }); } catch { /* already gone */ }
// Second sweep: mechanics are already gone (idempotent); with the manifest deleted
// the core is now empty, so this removes it (symlink-aware, vault-aware). Reuses
// the vetted removal logic rather than duplicating it.
const { removed: coreSwept } = manifestLib.disposeCoreMechanics(paths, {
  dryRun: false,
  vaultPath,
});
```

Update the printed summary to count `coreSwept` (the removed core) alongside
`removed`/`mech`; the existing `!fs.existsSync(paths.core)` / `skippedForVault`
branches at the end of `run()` still work unchanged (the second sweep removes the
core exactly when the first would have). The **dry-run** path is unchanged: it
already prints the core line manually and never deletes anything — leave it as-is
(a single `disposeCoreMechanics(dryRun:true)` for reporting).

Rationale for the second `disposeCoreMechanics` call: it is idempotent by design
("subdirs already gone are skipped") and already contains the symlink-aware,
vault-aware empty-core removal. Calling it again after the manifest is gone reuses
that logic verbatim instead of duplicating ~10 lines of core-removal in
`uninstall.js`. `disposeCoreMechanics` itself is **not modified**.

**(2) Generalized hash-guard for file deletes.** Replace the config-only condition
with a general one: any `kind:'file'` entry that has a recorded `hash` which no
longer matches the on-disk content is **preserved** with a notice; entries with no
`hash` keep today's delete behavior.

```js
if (entry.kind === 'file') {
  if (!isFile(entry.path)) { skipped.push(entry.path); continue; }
  if (entry.hash && sha256File(entry.path) !== entry.hash) {
    // We recorded this file's content at write time; it differs now → the user (or
    // another writer) changed it. Prove-before-delete: keep it, don't destroy an edit.
    process.stderr.write(`wienerdog: keeping ${entry.path} — modified since install\n`);
    skipped.push(entry.path); continue;
  }
  if (!dryRun) fs.rmSync(entry.path, { force: true });
  removedSet.add(entry.path); removed.push(entry.path);
}
```

This preserves the exact `config.yaml` behavior (it has a hash) and extends the
same fail-safe to any future hashed file. Un-hashed machine-generated files
(shims, hook scripts) are unchanged. `sha256File` is the existing single-file hash
helper (`manifest.js:64`) — it is untouched by this WP.

**(3) Contain recursive-tree removals — per kind, NOT to `paths.core`.**

Add ONE small local helper. `sameResolvedDir` anchors both kinds' containment to an
EXACT directory rather than "somewhere beneath". (Do NOT add `dirsEqual` — this WP
uses `hashDir` from WP-089 for the ownership check, not a live tree comparison.)

```js
/** True iff `a` and `b` resolve (via realpath) to the SAME directory. Fail-closed
 *  when either side is unresolvable. @param {string} a @param {string} b */
function sameResolvedDir(a, b) {
  try { return fs.realpathSync(a) === fs.realpathSync(b); } catch { return false; }
}
```

**vendored-tree → target must resolve EQUAL to the app root `paths.core/app`.**
`vendorSelf` records exactly `appDir` and nothing else, so the correct check is
equality — stricter than `contains` (which would also accept `appDir`'s parent via
reflexivity, and any descendant of `appDir`). Equality rejects the P0 equal-to-core
case (core is app's PARENT, never equal to app) and any manipulated descendant:

```js
function reverseVendoredTree(entry, dryRun, removed, skipped, removedSet, appRoot) {
  if (!isDir(entry.path)) { skipped.push(entry.path); return; }
  if (!sameResolvedDir(entry.path, appRoot)) {
    // The only legitimate vendored-tree value is the app root itself. Refuse anything
    // else — including paths.core (app's parent) and any descendant of the app root.
    process.stderr.write(`wienerdog: refusing to remove ${entry.path} — not the Wienerdog app tree\n`);
    skipped.push(entry.path); return;
  }
  if (!dryRun) fs.rmSync(entry.path, { recursive: true, force: true });
  removedSet.add(entry.path); removed.push(entry.path);
}
```

**copied-skill → parent EQUALS a harness skills root + `wienerdog-*` namespace +
fingerprint matches the recorded hash.** Copied skills are OUTSIDE `paths.core`.
Require ALL of: (a) the target's **parent directory resolves equal to** one of the
harness skills roots — a strict child, so `<claudeDir>/skills/user-content/wienerdog-x`
(a deeper descendant) is refused; (b) its basename is `wienerdog-*`; and (c) the
on-disk tree still fingerprints (via the WP-089 `hashDir`) to `entry.hash`
(delete-only-if-fingerprint-matches). A hash-less entry, a fingerprint mismatch, or
an unreadable tree (`hashDir` → `null`) is preserved, not deleted:

```js
function reverseCopiedSkill(entry, dryRun, removed, skipped, removedSet, skillsRoots) {
  if (!isDir(entry.path)) { skipped.push(entry.path); return; }
  const base = path.basename(entry.path);
  // (a) parent-EQUALS-root (strict child), NOT `contains` (which accepts any depth
  //     and, being reflexive, even the skills root itself).
  const parentIsRoot = skillsRoots.some((root) => sameResolvedDir(path.dirname(entry.path), root));
  if (!base.startsWith('wienerdog-') || !parentIsRoot) {
    process.stderr.write(`wienerdog: refusing to remove ${entry.path} — not a Wienerdog skill directly under a harness skills dir\n`);
    skipped.push(entry.path); return;
  }
  // (c) delete-only-if-fingerprint-matches: only remove a dir whose on-disk tree
  //     STILL hashes to the value we recorded at copy time. A hash-less (legacy)
  //     entry, a mismatch (user edited/replaced it), or an unreadable tree
  //     (hashDir → null, which can never === a recorded string) is PRESERVED.
  if (typeof entry.hash !== 'string' || hashDir(entry.path) !== entry.hash) {
    process.stderr.write(`wienerdog: keeping ${entry.path} — not the Wienerdog skill we recorded (modified, replaced, or unverifiable)\n`);
    skipped.push(entry.path); return;
  }
  if (!dryRun) fs.rmSync(entry.path, { recursive: true, force: true });
  removedSet.add(entry.path); removed.push(entry.path);
}
```

(A legitimately-installed copied skill still fingerprints to its recorded `hash` at
uninstall time — the copy fallback recorded exactly the copied tree's hash and
WP-089 refuses to refresh a drifted copy — so the normal uninstall still removes it.
Preserving a differing/unverifiable copy is fail-safe: Wienerdog never recursively
deletes a directory that is not, by fingerprint, its own recorded skill.)

Update the two call sites in `reverse()`:

```js
const appRoot = path.join(paths.core, 'app'); // = vendor.appDir(paths), inlined to avoid a vendor.js import
const skillsRoots = [path.join(paths.claudeDir, 'skills'), path.join(paths.codexDir, 'skills')];
// …
} else if (entry.kind === 'vendored-tree') {
  reverseVendoredTree(entry, dryRun, removed, skipped, removedSet, appRoot);
} else if (entry.kind === 'copied-skill') {
  reverseCopiedSkill(entry, dryRun, removed, skipped, removedSet, skillsRoots);
}
```

The exported signatures of `reverseVendoredTree`/`reverseCopiedSkill` change
(`reverseVendoredTree` gains `appRoot`; `reverseCopiedSkill` gains `skillsRoots`).
They are exported (`module.exports`) and called only from within `reverse()` and
this repo's tests — update the tests accordingly.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md). This WP
  adds **no** new `require` and no new top-level import to `manifest.js` — the local
  `sameResolvedDir` uses only the already-imported `fs`/`path`, and `hashDir` is
  already present in the module (defined by WP-089).
- Do NOT redefine `hashDir` — WP-089 defines and exports it in `manifest.js`; call
  it. A single serializer guarantees the forward recorder (WP-089) and this reverse
  checker agree byte-for-byte.
- Do NOT change vault-file/vault-dir preservation, the **body** of
  `disposeCoreMechanics` (it is only CALLED a second time, not edited), the
  `dir`/`symlink`/`managed-block`/`settings-entry`/`scheduler-entry` reversers, the
  `contains` helper, or `sha256File`.
- `reverse()` must keep `removedSet` seeded with `paths.manifest` so the
  enclosing-core "is it empty?" accounting inside the loop is byte-for-byte the same
  as today; only the real manifest deletion moves OUT of `reverse()` (into
  `uninstall.js`, after mechanics disposal).
- In `uninstall.js`, do not change the dry-run branch, the confirmation prompt, the
  vault-preservation messaging, or `readVaultPath`; only the live-path ordering
  (reverse → dispose → delete manifest → dispose-again) and the summary count change.
- Compute `appRoot`/`skillsRoots` inline in `manifest.js` from `paths`
  (`path.join(paths.core,'app')`, `paths.claudeDir`, `paths.codexDir`) — do NOT add
  a `require('./vendor')` or `require('../adapters/…')` to `manifest.js` (wrong
  dependency direction).
- The `copied-skill` entry shape is exactly `{kind:'copied-skill', path, hash}`
  (what WP-089's forward path records). This WP reads `entry.path` (for containment)
  and `entry.hash` (for the fingerprint guard).

## Security checklist

- [ ] `reverseVendoredTree` recursively deletes ONLY a path that resolves EQUAL to
      the app root `paths.core/app`; a `vendored-tree` entry equal to `paths.core` (the
      P0 core-deletion), a descendant of the app root, or any other path is refused
      (fail closed).
- [ ] `reverseCopiedSkill` recursively deletes ONLY a `wienerdog-*`-named path whose
      PARENT resolves equal to a harness skills root (`<claudeDir>/skills` or
      `<codexDir>/skills`) AND whose on-disk tree still fingerprints (via the WP-089
      `hashDir`) to `entry.hash`; a deeper descendant (`skills/user-content/wienerdog-x`),
      a non-`wienerdog-*` name, a hash-less entry, a fingerprint mismatch, or an
      unreadable tree (`hashDir` → `null`) is preserved — and every LEGITIMATE
      copied-skill uninstall (fingerprint matches) still succeeds (the guard does not
      reject the normal case).
- [ ] The copied-skill ownership decision uses the single shared `hashDir`
      serializer, so the reverse checker cannot diverge from WP-089's forward
      recorder; `hashDir`'s fail-closed `null` can never `===` a recorded string, so
      an unreadable copy is never deleted.
- [ ] A `kind:'file'` entry whose recorded `hash` no longer matches on-disk content
      is preserved, not deleted. NOTE (no over-claim): this closes
      delete-without-proof only for HASHED entries (today: `config.yaml`); un-hashed
      shims/hook scripts are still deletable until their writers record hashes
      (follow-up, Out of scope).
- [ ] The install manifest is deleted only AFTER both `reverse()` and
      `disposeCoreMechanics()` complete, so a crash during the mechanics sweep leaves
      a replayable recovery ledger (uninstall can be re-run).

## Acceptance criteria

- [ ] `reverse()` alone does NOT delete `install-manifest.json` (a unit test asserts
      the file remains after `reverse()` returns).
- [ ] After a full `uninstall.js run()` (live), `install-manifest.json` is gone and
      the empty core is removed; but if `disposeCoreMechanics` throws mid-sweep, the
      manifest still exists (proved by a test that injects a throwing dispose and
      asserts the manifest file remains — recovery ledger intact for retry).
- [ ] A `kind:'file'` entry with a `hash` that mismatches current content is kept
      (in `skipped`, not `removed`) with the "modified since install" notice; the
      same entry with a matching hash is removed. `config.yaml` behavior is unchanged.
- [ ] A `vendored-tree` entry equal to `paths.core`, or a descendant of (not equal to)
      `paths.core/app`, is skipped with the refusal notice and not removed; the
      legitimate `paths.core/app` entry is removed.
- [ ] A `copied-skill` entry whose parent is NOT a harness skills root (e.g.
      `<claudeDir>/skills/user-content/wienerdog-x`), or not `wienerdog-*`-named, is
      skipped with the refusal notice; a `copied-skill` entry whose on-disk tree does
      NOT fingerprint to `entry.hash`, a hash-less entry, or an unreadable copy is
      preserved (in `skipped`) with the "keeping … not the Wienerdog skill we recorded"
      notice; a legitimate `<claudeDir>/skills/wienerdog-x` entry whose on-disk tree
      fingerprints to `entry.hash` is removed.
- [ ] `dryRun` still removes nothing and reports the same `removed`/`skipped` shape.
- [ ] Existing uninstall/manifest tests pass (adjust the two helper call sites/tests
      for the new `appRoot`/`skillsRoots` params).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "manifest|uninstall"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Making `writeShim` / `copyHookScript` / `sync stageDir` **record hashes** and
  refuse to OVERWRITE a pre-existing non-Wienerdog file at write time — a separate
  follow-up (the write-time half of prove-before-overwrite). This WP only makes the
  reverse path honor a hash when one is present.
- Adapter skill-dir ownership on the forward path, and defining/exporting `hashDir` —
  that is **WP-089** (this WP's dependency). Do not redefine `hashDir` here.
- Managed-block marker robustness — **WP-091** (shares this file; sequence after).
  WP-091 adds a `require('./errors')` import to `manifest.js`; this WP adds no import,
  so WP-091's "manifest.js does not import WienerdogError today, and WP-088 does not
  add it" assumption holds.
- `init` secrets chmod — **WP-092**.
- Any change to the **body** of `disposeCoreMechanics` or to vault preservation
  (it is only called a second time by `uninstall.js`, not edited).

## Superseded review dispositions

Crash-safety / containment dispositions (in force):

- **Round-2 P0 (equal-to-core deletion):** RESOLVED. vendored-tree is contained to
  `paths.core/app` (equality), rejecting the equal-to-core P0.
- **Round-2 P1 (copied-skill containment breaks legitimate uninstall):** RESOLVED.
  Copied-skill is contained to the harness skills roots + `wienerdog-*` namespace,
  not core-containment.
- **Round-2 P1 (manifest-last still loses retryability if mechanics crash):**
  RESOLVED. `reverse()` no longer deletes the manifest; `uninstall.js` deletes it
  only after both `reverse()` and `disposeCoreMechanics()` succeed, then sweeps the
  emptied core via a second idempotent `disposeCoreMechanics()`.
- **Round-2 P2 (hash guard over-claim):** RESOLVED by narrowing — the per-FILE
  `sha256File` guard closes delete-without-proof only for HASHED entries; un-hashed
  shims/hook scripts remain a follow-up.
- **Round-3 P1 (claimed strict-child accepted arbitrary-depth descendants):**
  RESOLVED. Copied-skill removal requires the target's PARENT to resolve EQUAL to a
  harness skills root (`sameResolvedDir`), a true strict-child test; the same
  equality tightening applies to vendored-tree (equal to `paths.core/app`).

Fingerprint (copied-skill ownership) dispositions (in force):

- **Round-3 P0 (reverse ignored WP-089's fingerprint):** RESOLVED. `reverseCopiedSkill`
  deletes only when `typeof entry.hash === 'string' && hashDir(entry.path) ===
  entry.hash`, using the value WP-089 records.
- **Round-5 P0 (partial-framing collision), Round-7 P0 (file↔symlink node-type
  collision), Round-8 P0 (fail-open on unreadable subtree), Round-9 P0 (invalid-UTF-8
  raw-byte name collision):** RESOLVED in the shared `hashDir` (WP-089) — decimal
  length-framing, per-node `d/f/l/s` tags, fail-closed `null`, and raw-Buffer names
  end-to-end. Because forward and reverse call the SAME exported `hashDir`, the
  reverse check inherits every one of those closures.
- **Simplification (compare-to-live-source) evaluated and REJECTED (2026-07-12):**
  a proposal to delete `hashDir` and decide copied-skill ownership with a live
  `dirsEqual(source, on-disk)` byte comparison was rejected — `dirsEqual` re-opened
  the file↔symlink/special node-type collision, failed OPEN on unreadable trees, and
  (fatally on the reverse path) introduced a **manifest-ordering false-delete**:
  `recordOnce` leaves a historical `copied-skill` entry positioned before newer
  staged-skill `file` entries, so `reverse()` (reverse-insertion order) could prune
  the live source before the comparison ran, making an edited user copy compare equal
  to a pruned source and be **deleted** (and, conversely, preserving an untouched
  copy). It also relaxed the "leave only the vault" guarantee. The recorded
  fingerprint proves ownership against a value tied to THIS object at copy time —
  independent of the live source and of manifest ordering — so none of those failure
  modes exist. This is the round-10-verified design.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/088-manifest-reverse-crash-safety`; conventional commits; PR titled
   `fix(manifest): delete manifest last, hash-guard file deletes, contain tree removal (WP-088)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
</content>
