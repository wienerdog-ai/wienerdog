---
id: WP-088
title: Uninstall crash-safety — defer the deferred-deletion set (manifest, core, config.yaml) until the sweep succeeds; hash-guard file deletes; contain vendored-tree removal; fingerprint-guard copied-skill removal
status: Done
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

**The coherent principle behind this WP — the deferred-deletion set.** Making
uninstall *retryable* (deleting the ledger last) exposed a class of bug: anything a
safe RETRY needs to COMPLETE uninstall, but that `reverse()` deletes early, becomes
unrecoverable on the retry. Everything in that "must survive until the crash-prone
`disposeCoreMechanics` sweep succeeds" set must be deferred and deleted LAST. That
set is exactly **three** things, all physically inside the canonical core:
(1) `install-manifest.json` — the retry ledger (uninstall refuses without it);
(2) the canonical core dir `paths.core` — `reverse()`'s `dir` branch never rmdirs it,
uninstall.js disposes it post-manifest; and
(3) `config.yaml` when UNMODIFIED — its `vault:` line is the **only** source of the
vault path `disposeCoreMechanics` needs to protect a vault nested inside the core, on
**every** retry. A CUSTOMIZED `config.yaml` (recorded-hash mismatch) is kept forever
(ADR-0019) and is never in the deferred-delete set. **Holistic check (see the
dedicated note below): config.yaml is the ONLY remaining member beyond the manifest
and the core** — `disposeCoreMechanics`'s single external input is `vaultPath`, sourced
solely from config.yaml, and the default vault lives outside the core (never swept).

Five verified gaps in `src/core/manifest.js` `reverse()` (and its `uninstall.js`
orchestration) undermine the reversibility promise:

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

5. **Nested-vault path unrecoverable on retry — config.yaml deleted too early (P1,
   the reason for this amendment):** `uninstall.js` reads the configured vault path from
   `config.yaml` (`readVaultPath`, line ~57) and passes it as `vaultPath` to
   `disposeCoreMechanics`, which uses it to PROTECT a vault nested inside the core (a
   supported legacy / hand-edited install: ADR-0019's containment guard). But
   `config.yaml` is recorded as an ordinary `kind:'file'` entry with a hash
   (`init.js:141`), so when it is UNMODIFIED `reverse()` **deletes it** during the
   reversal loop — before the mechanics sweep. Within a single process this is
   survivable (uninstall.js captures `vaultPath` at line 57 *before* `reverse()` runs).
   But on a **retry after a partial crash** (attempt 1 deleted config.yaml then crashed
   during/after the sweep; the manifest survived by design so the retry proceeds), the
   fresh process re-reads `config.yaml`, finds it gone, and `readVaultPath` returns
   `null` → falls back to the DEFAULT `paths.vault`. `disposeCoreMechanics` no longer
   knows the vault is nested → it **recursively deletes the user's nested vault**.
   **User-data loss on retry — the exact failure the manifest-last design was meant to
   make impossible.** config.yaml is therefore a member of the deferred-deletion set:
   it must survive `reverse()` and be deleted LAST (only when unmodified), after the
   sweep and after the manifest.

**Product invariants that bound this WP:** Wienerdog is just files (ADR-0004);
`reverse()` is synchronous filesystem code. The vault is always preserved
(ADR-0019) — including a legacy vault nested inside the core. This WP does not
change the vault-file/vault-dir preservation logic; it only ensures the
*information* needed to protect a nested vault (config.yaml's `vault:` path)
survives long enough to do so on every retry, and it never deletes the vault
itself.

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

**config.yaml, and how uninstall.js gets the vault path (the P1 above).**
`config.yaml` lives at `paths.config = path.join(paths.core, 'config.yaml')`
(`paths.js:39`) and is recorded by `init` as a hashed file entry
`{kind:'file', path: paths.config, hash: sha256(content)}` (`init.js:141`, re-synced
to the current content whenever init/adopt rewrite it, so a clean install's on-disk
hash MATCHES the recorded hash → `reverse()` currently deletes it). `uninstall.js`
derives the vault path exactly once per process:
`const vaultPath = readVaultPath(paths.config) || paths.vault;` (line 57) —
`readVaultPath` greps the `vault:` line out of config.yaml, returning `null` when the
file is missing/unreadable or the value is `null`, in which case the DEFAULT
`paths.vault` (`~/wienerdog`, outside the core) is used. `vaultPath` is the ONLY
input `disposeCoreMechanics` uses to decide whether a swept mechanics dir contains the
vault. **Nothing else in the whole uninstall reads config.yaml or otherwise sources a
vault path** (verified: `readVaultPath` is the single caller; `disposeCoreMechanics`
takes `vaultPath` as a parameter and reads no file). That is what makes config.yaml —
and config.yaml alone, besides the manifest and the core dir — a member of the
deferred-deletion set.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | (1) `reverse()` NO LONGER deletes the manifest (keep `removedSet` seeded with `paths.manifest`); **(1b) add a SINGLE GLOBAL deferred-member guard at the TOP of the entry loop, BEFORE the kind dispatch, that protects all three deferred members — `paths.manifest`, `paths.core`, `paths.config` — from EVERY kind and from path normalization (realpath-aware via a 1-line `resolvesTo` closure: `p` string-equals target, or `sameResolvedDir` to it). Manifest/core → skip. config → decide inline: unmodified `kind:'file'` (recorded hash matches) → `deferredConfig = paths.config` + `removedSet.add`; customized → keep-forever notice + skip; any other/adversarial kind targeting config → protect (skip). REMOVE the now-redundant per-branch `paths.core` dir-skip and `paths.manifest` file-skip and the file-branch config-defer;** (2) generalize the config-only `sha256File` hash-mismatch preservation to every `kind:'file'` with a `hash` (the generic guard now covers only OTHER files — config is handled in the global guard); (3) **`reverse()`'s return shape becomes `{removed, skipped, preserved, deferredConfig, deferredConfigHash}`; `deferredConfig` is the canonical `paths.config` for an unmodified config (else `null`), and `deferredConfigHash` carries that config's recorded hash forward so uninstall.js can re-verify it at the (later) delete site (else `null`); also export `sha256File` for that re-verify;** (4) add ONE local `sameResolvedDir` helper; require `reverseVendoredTree`'s target to resolve EQUAL to `paths.core/app`, and `reverseCopiedSkill`'s target to be a strict child (parent EQUALS a harness skills root) in the `wienerdog-*` namespace whose on-disk tree still fingerprints (via the WP-089 `hashDir`) to `entry.hash`; pass `appRoot` and `skillsRoots` in from `reverse()`; (5) the `dir` branch body is UNCHANGED (core is handled by the global guard, never reaches the `dir` branch). Do NOT redefine `hashDir` (WP-089 defines it in this module). No new `require`/top-level import. |
| modify | src/cli/uninstall.js | consume `deferredConfig` from `reverse()`; on the live path delete the deferred-deletion set LAST — **manifest first, then `deferredConfig` (unmodified config.yaml)** — only after both `reverse()` and the first `disposeCoreMechanics()` complete. **The manifest delete must be CONFIRMED GONE before touching config, using rmSync's OWN outcome (NOT `fs.existsSync`, which is ambiguous on a lookup error): with `{force:true}`, ENOENT is success and a real failure throws, so `rmSync` returning without throwing proves the manifest is gone. On a throw, `throw new WienerdogError(...)` (already imported) and do NOT delete config — leaving both files present keeps a retry vault-safe.** **Prove-before-delete AT THE DELETE SITE: before `rmSync(deferredConfig)`, RE-VERIFY the carried-forward `deferredConfigHash` against a fresh `sha256File(deferredConfig)` — delete only if it STILL matches; if config was edited during the (slow) sweep (mismatch) or is missing/unreadable, PRESERVE it with a keep-notice and do not count it removed. This closes the TOCTOU the deferral opened (check in `reverse()`, delete much later).** Then sweep the now-empty core (idempotent second `disposeCoreMechanics`); count `deferredConfig` in the live removed total ONLY when the re-verify passed (`configDeleted`); add it to the dry-run headline count (headline count is not claimed to equal the live total — mechanics/core stay separate disclosure lines). Do not change `readVaultPath`, the confirmation prompt, or the vault messaging. |
| modify | tests/unit/manifest.test.js | tests for reverse-does-not-delete-manifest, **GLOBAL-GUARD cross-kind regression (write a REAL manifest JSON file, load it via `manifestLib.load`, run `reverse()` on the REAL filesystem with NO fs stubs, then assert the target deferred member still exists on disk and is NOT in `removed`): (i) a self-referential `{kind:'file', path: paths.manifest}` entry → real ledger intact; (ii) `{kind:'scheduler-entry', path: paths.manifest}` → ledger intact; (iii) `{kind:'symlink', path: <symlinked deferred member>}` → not unlinked; (iv) a `settings-entry` at `paths.config` → config not rewritten/deleted; (iv-b) a `managed-block` entry at `paths.config` → config not rewritten/deleted (BOTH mutation branches tested explicitly, not one-or-the-other); (v) `{kind:'file', path: '<core>/./config.yaml'}` normalized alias → config NOT deleted and (when hash matches) returned as `deferredConfig === paths.config`; (vi) `{kind:'scheduler-entry', path: paths.config}` → config intact; (vii) DOCUMENTED-RESIDUAL regression: a `{kind:'scheduler-entry', path: <a non-deferred path>, unload: <argv that would touch a deferred member>}` → assert the `unload` argv IS invoked (via the schedulerSpawn chokepoint / a spy) as designed and that this is the ACCEPTED out-of-scope residual — the test pins the behavior + scoping, NOT a false "guard blocks it"**, **reverse-does-not-delete an unmodified config.yaml but returns it in `deferredConfig`; reverse KEEPS a customized (hash-mismatched) config.yaml (in `skipped`, `deferredConfig` null)**, hashed-file preserve-on-mismatch, equal-to-core vendored-tree refusal, out-of-app vendored-tree refusal, copied-skill refusal for a deeper descendant (parent ≠ skills root) / outside the `wienerdog-*` namespace / a copy whose on-disk fingerprint DIFFERS from `entry.hash` (preserved) / a legacy hash-less entry (preserved) / an unreadable copy (hashDir null → preserved), and a legitimate copied-skill removal (parent equals a harness skills root + `wienerdog-*` + fingerprint matches `entry.hash`) |
| modify | tests/unit/uninstall.test.js | tests: (a) the manifest AND config.yaml both survive a throw during `disposeCoreMechanics` (recovery ledger + vault-path source intact for retry); (b) **NEW retry-with-nested-vault: with config.yaml pointing at a vault nested under a mechanics dir, attempt 1 crashes in `disposeCoreMechanics`; a real retry re-reads the still-present config.yaml, derives the nested vault path, and the nested vault SURVIVES the crashed-then-retried uninstall (reported via `skippedForVault`)**; (c) a clean uninstall deletes the manifest last, then the unmodified config, and removes the empty core; (d) a clean uninstall with a CUSTOMIZED config keeps config.yaml and the core (existing customized-config-kept rule still holds); (e) **NEW manifest-delete-FAILURE injection: stub ONLY the manifest deletion to throw — e.g. wrap `fs.rmSync` so it throws (with a real `err.code`) when called for `paths.manifest` and delegates to the real `rmSync` otherwise — while the REAL manifest file remains on disk and the real filesystem is observed. Do NOT stub any verification (there is no separate existence check to stub — the gate is rmSync's own outcome, so stubbing it would be tautological). Assert `run()` rejects with `WienerdogError`, config.yaml is NOT deleted (still on disk with `deferredConfig`'s content), and a subsequent real retry with a nested vault leaves the nested vault intact (vault-safe on the delete-failure path)**; (f) **NEW deferred-config TOCTOU re-verify: config.yaml is unmodified at `reverse()` time (deferred), but is MUTATED after `reverse()` and before the deferred delete (simulate by editing it inside an instrumented `disposeCoreMechanics`) → the delete-site hash re-verify PRESERVES it (file survives with the new content, keep-notice emitted), NOT deleted; the unchanged-config happy path (test (c)) still deletes it** |
| modify | tests/unit/scheduler-schedule.test.js | **Collateral (implementation review, 2026-07-13):** the "add then manifest.reverse still removes config.yaml" test asserted the SUPERSEDED behavior (reverse() deleting config inline). Config is now a deferred-deletion-set member — reverse() returns it in `deferredConfig` and never deletes it. Update the single assertion to the new contract (`deferredConfig === paths.config`, config still on disk after `reverse()`); intent (a re-synced hash is recognized as our unmodified file, not a user edit) is preserved. |
| modify | tests/unit/gws-grant.test.js | **Collateral (implementation review, 2026-07-13):** same as above — the `saveGrant ... uninstall stays clean` test asserted `reverse()` deletes config.yaml. Update its single assertion to the deferred-deletion contract (`deferredConfig === paths.config`, config still on disk after `reverse()`), preserving intent. |

### Exact contracts

**(1) Defer the deferred-deletion set — delete manifest, then config.yaml, LAST in
`uninstall.js`, after the mechanics sweep.** `reverse()` must not DIRECTLY delete or damage
any of the three deferred members — the manifest, the core dir, and config.yaml — via an
entry's PATH, and this is **enforced structurally by a SINGLE GLOBAL GUARD at the top of the
entry loop, BEFORE the kind dispatch**. The guard covers **every entry kind** (file / dir /
symlink / managed-block / settings-entry / scheduler-entry / …) and **path normalization**
(a `<core>/./config.yaml` alias, a symlinked manifest, etc.) — because it screens
`entry.path` before any reverser runs. This replaces the previous per-branch skips, which
were incomplete: a malformed/hand-edited/adversarial manifest can point ANY kind's PATH at a
deferred member — e.g. `{kind:'scheduler-entry', path: paths.manifest}` reaches
`reverseSchedulerEntry` and `rmSync`s the ledger; a `symlink` entry unlinks a symlink-valued
core/manifest/config; a `managed-block`/`settings-entry` can rewrite or (created-empty)
delete a deferred file; a `{kind:'file'}` with a normalized config path bypasses an
exact-string config check. The global guard closes ALL of these path-based routes at once.
It is realpath-aware (`resolvesTo` = string-equality OR `sameResolvedDir`) and handles
config's defer-vs-keep decision inline (from the recorded hash), so config protection does
not depend on the entry being a `kind:'file'`. The precise, defensible invariant:
**the global guard prevents any entry from DIRECTLY deleting/damaging a deferred member via
its `entry.path`, for every entry kind and for normalized/symlink path aliases.** It does
NOT (and cannot) police INDIRECT side effects such as a `scheduler-entry`'s executable
`unload` argv — that is an explicitly out-of-scope, pre-existing residual (see Non-goals /
Residuals below); it is not a WP-088 regression and does not weaken the crash-safety
guarantees for a Wienerdog-authored (non-adversarial) manifest.

*In `reverse()`:* remove the eager `fs.rmSync(paths.manifest, …)` block entirely
(already done on the branch), KEEP `removedSet` seeded with `paths.manifest`, add the
GLOBAL deferred-member guard at the top of the entry loop (and REMOVE the now-redundant
per-branch `paths.core` dir-skip and `paths.manifest` file-skip),
and add a `deferredConfig` slot. The return shape gains `deferredConfig`. The guard's
config handling is the subtle part: it defers an unmodified config (sets `deferredConfig`
to the CANONICAL `paths.config`), keeps a customized one (ADR-0019), and protects config
from any non-file/adversarial kind — all inline, realpath-aware:

```js
function reverse(paths, manifest, { dryRun = false } = {}) {
  const removed = []; const skipped = []; const preserved = [];
  let deferredConfig = null;                 // unmodified config.yaml → deleted last by uninstall.js
  // Seed with the manifest path so the core dir still counts as (virtually) empty.
  // The manifest FILE is NOT touched here — uninstall.js deletes it only after the
  // whole uninstall (reversal loop + mechanics sweep) has succeeded, so a crash at
  // any point leaves a replayable ledger (uninstall refuses without it).
  const removedSet = new Set([paths.manifest]);
  // …appRoot / skillsRoots as today…
  // Realpath-aware equality (string fallback when a side is unresolvable): true iff `p`
  // is `target` or resolves to it. Applies to files and dirs (`sameResolvedDir` is just
  // realpath equality). Catches symlinked/normalized aliases of any deferred member.
  const resolvesTo = (p, target) => p === target || sameResolvedDir(p, target);

  for (const entry of [...manifest.entries].reverse()) {
    // ── GLOBAL DEFERRED-MEMBER GUARD (before kind dispatch) ──────────────────────────
    // reverse() must NEVER delete/damage the three deferred members — the manifest, the
    // core dir, and config.yaml — regardless of entry KIND or path normalization. A
    // malformed/hand-edited/adversarial manifest can point ANY kind at a deferred member
    // (e.g. {kind:'scheduler-entry', path: paths.manifest} deletes the ledger; a
    // {kind:'file', path:'<core>/./config.yaml'} normalized alias bypasses an exact-string
    // config check; a symlink/managed-block/settings-entry can unlink/rewrite one). This
    // single guard blocks every PATH-based route for every kind at once. (It does NOT
    // police INDIRECT side effects — e.g. a scheduler-entry's executable `unload` argv —
    // which is an out-of-scope, pre-existing residual; see Non-goals / Residuals.)
    if (resolvesTo(entry.path, paths.manifest) || resolvesTo(entry.path, paths.core)) {
      // Manifest → retry ledger (uninstall.js deletes it LAST via the rmSync-outcome gate);
      // core → deferred to disposeCoreMechanics. Never touched here by any kind. (removedSet
      // already holds paths.manifest; a normal manifest's sole core entry is {kind:'dir',
      // path: paths.core} — this is where it is skipped.)
      skipped.push(entry.path); continue;
    }
    if (resolvesTo(entry.path, paths.config)) {
      // config.yaml is deferred/kept here for EVERY kind — its `vault:` line is what
      // disposeCoreMechanics reads on every retry to protect a nested vault; reverse()
      // never deletes it. Decide defer-vs-keep from the recorded hash of the LEGITIMATE
      // file entry (Wienerdog records config only as {kind:'file', path, hash}):
      if (entry.kind === 'file' && isFile(entry.path) && entry.hash) {
        if (sha256File(entry.path) === entry.hash) {
          // UNMODIFIED → deferred: uninstall.js deletes it LAST (after the sweep, after the
          // manifest). Store the CANONICAL path (not a normalized alias); add to removedSet.
          deferredConfig = paths.config;
          removedSet.add(paths.config);
          continue;                          // the deferred member — not in removed/skipped
        }
        // CUSTOMIZED (hash mismatch) → kept forever (ADR-0019). Keeps the core alive.
        process.stderr.write(`wienerdog: keeping ${entry.path} — modified since install\n`);
      }
      // Customized config, OR any non-file/hash-less/adversarial entry targeting config →
      // PROTECT it: never delete/rewrite. (deferredConfig is set only by the legitimate
      // unmodified file entry above; if the manifest is too corrupt to have one, config
      // simply stays — safe, uninstall.js keeps the core — a bounded degraded outcome.)
      skipped.push(entry.path); continue;
    }
    // ── end global guard ─────────────────────────────────────────────────────────────
    if (entry.kind === 'file') {
      if (!isFile(entry.path)) { skipped.push(entry.path); continue; }
      if (entry.hash && sha256File(entry.path) !== entry.hash) {   // contract (2): keep a modified hashed file
        process.stderr.write(`wienerdog: keeping ${entry.path} — modified since install\n`);
        skipped.push(entry.path); continue;
      }
      if (!dryRun) fs.rmSync(entry.path, { force: true });
      removedSet.add(entry.path); removed.push(entry.path);
    } else if (/* …dir / symlink / managed-block / settings-entry / scheduler-entry /
                  vendored-tree / copied-skill / vault-* … */) { /* unchanged */ }
  }
  return { removed, skipped, preserved, deferredConfig };
}
```

Note `deferredConfig` is set even under `dryRun` (reverse never deletes it either way);
uninstall.js decides what to physically delete.

**The per-branch skips are REMOVED, superseded by the global guard.** The prior
file-branch `paths.manifest` skip and dir-branch `paths.core` skip are deleted — the
global guard is the single enforcement point, so the `dir` branch no longer needs a core
special-case (a `{kind:'dir', path: paths.core}` entry never reaches it), and the file
branch no longer needs a manifest special-case or the exact-string config-defer branch
(both handled globally, realpath-aware). One guard, one source of truth: this avoids the
false impression that per-branch protection suffices and prevents divergence between
branches. `resolvesTo` is a 1-line local closure over the existing `sameResolvedDir`
(no new import). `removedSet` stays seeded with `paths.manifest` (accounting unchanged).

*In `src/cli/uninstall.js` `run()`, LIVE (non-dry-run) path.* The ordering is
**reverse → first sweep → delete manifest → delete config.yaml → second sweep**, and
within the deferred set the **manifest is deleted BEFORE config.yaml** — a hard
ordering constraint, see the rationale below:

```js
const { removed, skipped, preserved, deferredConfig } =
  manifestLib.reverse(paths, manifest, { dryRun: false });
// First sweep: removes state/logs/schedules/secrets, protecting a nested vault via
// vaultPath (read from the STILL-PRESENT config.yaml at line 57). The core is NOT
// removed yet — manifest + config.yaml still sit in it, so its emptiness check fails.
const { removed: mech, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
  dryRun: false,
  vaultPath,
});
// Delete the deferred set LAST — MANIFEST FIRST, then config.yaml. Every crash-prone
// step above has completed. Manifest-before-config is load-bearing (see rationale), and
// the manifest delete must be CONFIRMED before config is touched. The confirmation is
// rmSync's OWN outcome: `{force:true}` does NOT throw on ENOENT (already-gone = success)
// but DOES throw on a real failure (EACCES/EPERM/IO). So "rmSync returned without
// throwing" is proof the manifest is gone — no post-hoc existence check (which would be
// ambiguous: fs.existsSync returns false on a LOOKUP ERROR — EACCES on the path, or a
// dangling symlink it follows — even while the manifest actually persists, which would
// reopen the exact P1: manifest-present + config-gone → retry reads no config → default
// vault → nested vault deleted).
try {
  fs.rmSync(paths.manifest, { force: true });
} catch (e) {
  // Real deletion failure, manifest still present → ABORT before touching config, leaving
  // BOTH files present so every retry stays vault-safe. Loud, actionable error.
  throw new WienerdogError(
    `could not remove the install manifest (${e?.code || 'unknown error'}) — uninstall partially completed; ` +
      `left config.yaml and ${paths.core} in place so a retry stays safe. ` +
      `Fix the permission/IO issue, then re-run: npx wienerdog@latest uninstall`
  );
}
// rmSync returned without throwing ⇒ the manifest is gone (or was already absent). The
// retry gate is now closed → only now is it safe to delete an unmodified config.
// PROVE-BEFORE-DELETE AT THE DELETE SITE (re-verify hash): config was proven unmodified
// in reverse(), but is deleted here AFTER the (slow, recursive) sweep — a TOCTOU window.
// Re-hash config.yaml and delete ONLY if it STILL matches the carried-forward
// `deferredConfigHash`; if it was edited during the sweep (mismatch) or is missing/
// unreadable, PRESERVE it with a keep-notice and do not count it removed.
let configDeleted = false;
if (deferredConfig) {
  let currentHash = null;
  try { currentHash = manifestLib.sha256File(deferredConfig); } catch { currentHash = null; }
  if (currentHash !== null && currentHash === deferredConfigHash) {
    try { fs.rmSync(deferredConfig, { force: true }); configDeleted = true; } catch { /* best-effort */ }
  } else {
    process.stderr.write(`wienerdog: keeping ${deferredConfig} — modified since install\n`);
  }
}
// Second sweep: mechanics already gone (idempotent); with manifest + unmodified config
// deleted the core is now empty, so this removes it (symlink-aware, vault-aware). A
// kept CUSTOMIZED config leaves the core non-empty → core preserved (unchanged).
const { removed: coreSwept } = manifestLib.disposeCoreMechanics(paths, {
  dryRun: false,
  vaultPath,
});
```

`WienerdogError` is already imported in `uninstall.js` (line 6) — no new import. The
abort leaves the mechanics already swept (the first `disposeCoreMechanics` completed and
protected any nested vault), the manifest and config.yaml present, and the core present:
a subsequent `npx wienerdog@latest uninstall` re-reads the intact config, re-derives the
correct vault path, and completes once the permission cause is fixed.

**Why manifest BEFORE config.yaml AND confirmed-gone (the invariant "manifest-present ⟹
config-present").** A retry proceeds only while the manifest exists (uninstall refuses
without it). A retry that proceeds to a sweep needs config.yaml to derive the
nested-vault path. So config.yaml must exist at *every* point where the manifest still
exists — whether that point is reached by a crash OR by a failed manifest delete.
Ordering alone is not enough: `rmSync(paths.manifest, {force:true})` can THROW on a
permission/IO error and leave the file, so a naive `try { rmSync(manifest) } catch {}`
followed by an unconditional config delete would yield manifest-present + config-gone —
the exact P1 data-loss window (retry reads `null` → default vault → nested vault
deleted). Two guarantees close it: (1) delete the manifest FIRST, before config.yaml is
touched; (2) gate the config delete on **rmSync returning without throwing** — with
`{force:true}`, ENOENT (already gone) is success and any real failure throws, so a clean
return is proof the manifest is gone. On a throw, ABORT with a loud `WienerdogError`,
leaving both files present. Do NOT use a post-hoc `fs.existsSync(paths.manifest)` as the
gate: `existsSync` returns `false` on a LOOKUP error too (EACCES on the path, or a
dangling symlink it follows), so "existsSync === false" does not prove absence — it could
report the manifest gone while it actually persists, deleting config and reopening the P1.
The rmSync-outcome gate has no such ambiguity. Together these make "manifest-present ⟹
config-present" hold at every crash point AND every failure point. A crash between the two deletions likewise leaves
the manifest gone → the retry refuses → no sweep runs → the nested vault is never at risk
from a stale/default vault path. Within the current process `vaultPath` was captured at
line 57 and is unaffected by deleting the file, so the second sweep still protects the
nested vault correctly.

**Every retry re-reads config.yaml.** `vaultPath` is derived at the top of each process
(`readVaultPath(paths.config) || paths.vault`, line 57). Because config.yaml is never
deleted while the manifest exists, any legitimate retry (manifest present) re-reads the
real (possibly nested) vault path. That is the whole point of deferring it.

*Summary count.* Total removed = `removed.length + mech.length + coreSwept.length +
(configDeleted ? 1 : 0)` — `configDeleted` is true only when the delete-site hash
re-verify passed and the `rmSync` succeeded (a config edited during the sweep is
preserved and NOT counted). The existing `!fs.existsSync(paths.core)` / `skippedForVault`
branches at the end of `run()` still work unchanged (the second sweep removes the core
exactly when the first would have). **The printed "Skipped" filter is unchanged and
remains correct:** an unmodified config is in `deferredConfig` (deleted → never in
`skipped`); a customized config is in `skipped` and still exists after the final sweep →
shown as "a customized config … kept"; the swept `<core>`/`<core>/state` in `skipped` no
longer exist → dropped. `reverse()`'s `skipped` RETURN value is unchanged — only the
CLI's printed summary filters.

*Dry-run path.* Still deletes nothing (both the manifest and config.yaml remain on disk
after a dry-run). Its headline "would be removed" count MUST now include the deferred
config, which moved out of `reverse()`'s `removed`, so it is not silently dropped from the
plan: `removed.length + (deferredConfig ? 1 : 0)` (destructure `deferredConfig` in the
dry-run branch too). **This headline count is NOT the full live "Removed N" total, and the
spec does not claim it is.** The two use different bases by existing design: the dry-run
*headline* counts the manifest-tracked items `reverse()` would remove (now including the
deferred config), while the mechanics dirs (`mech`) and the core-removal are disclosed as
**separate prose lines** (the ADR-0019 dry-run disclosure requirement), NOT folded into
the headline number. The live run instead reports one combined `Removed N` =
`removed + mech + coreSwept + deferredConfig`. What dry-run guarantees (M1 exactness) is
that every item it *lists* — the reverse-removed set incl. config, each mechanics dir,
and the core line — is exactly what the live run removes; it does not guarantee the
headline integer equals the live integer. `deferredConfig` is counted exactly once (a
customized config has `deferredConfig === null` and stays in `skipped`, never counted as
removed). Everything else in the dry-run branch is unchanged — it prints the core line
manually and does a single `disposeCoreMechanics(dryRun:true)` for reporting.

Rationale for the second `disposeCoreMechanics` call: it is idempotent by design
("subdirs already gone are skipped") and already contains the symlink-aware,
vault-aware empty-core removal. Calling it again after the manifest + config are gone
reuses that logic verbatim instead of duplicating ~10 lines of core-removal in
`uninstall.js`. `disposeCoreMechanics` itself is **not modified**.

**Holistic check — is config.yaml the only remaining deferred member?** Yes. A safe
retry of the whole uninstall depends on: the manifest (retry gate — deferred), the core
dir (deferred), and the vault path. `disposeCoreMechanics`'s sole external input is
`vaultPath`, and `vaultPath` is sourced ONLY from config.yaml's `vault:` line
(`readVaultPath` is its single caller; nothing else in uninstall reads config or a vault
path). Everything else `reverse()` deletes — shims, hook scripts, symlinks,
managed-block edits, settings-entries, scheduler-entries, the vendored app tree, copied
skills, empty authored dirs — feeds neither the retry gate nor the vault protection. The
DEFAULT vault (`~/wienerdog`) is outside the core and never swept; `vault-file`/
`vault-dir` entries are preserved, not deleted. So **config.yaml is the only member of
the deferred-deletion set beyond the manifest and the core dir.**

**How a crashed uninstall is retried (the retry-launch mechanism).** "Retryable" here
means the *state* on disk lets a fresh uninstall complete safely — it does NOT mean the
local `wienerdog` command still exists. `reverse()` removes the shim (`writeShim`) and the
vendored app tree (`reverseVendoredTree`) as part of its normal job, so after a crash the
local executable is very likely gone. **The retry is therefore launched via
`npx wienerdog@latest uninstall`** — npx fetches the package code, and the on-disk retry
gate (the manifest) plus config.yaml still drive a correct, vault-safe run. (If the crash
happened before `reverse()` reached the shim, a local `wienerdog uninstall` also works,
but `npx` is the reliable path and is what the abort error message and docs point to.)
This is deliberately option (a): we do NOT defer the shim/app tree into the
deferred-deletion set, because removing them is uninstall's actual job — deferring them
would defeat the purpose. Only state that a retry must READ (manifest, core, config.yaml)
is deferred; the executable is re-obtained out-of-band via npx.

*Accepted caveat.* `npx wienerdog@latest uninstall` is a reliable retry ONLY under the
same user/environment as the crashed install AND a package version whose path/manifest
resolution matches it. `@latest` alone does not guarantee that — a newer version could, in
principle, resolve `paths`/the manifest differently. In practice the crashed install and
the retry run as the same user on the same machine, and `getPaths()` is stable across
versions, so this holds; we accept it as a caveat rather than pinning a version. A user who
hit a version skew can instead re-run the exact installed version (or simply
`rm -rf ~/.wienerdog` — the residual is Wienerdog's own folder).

**Accepted residual windows (vault-safe, non-data-loss).** Deferring config introduces two
narrow post-gate windows. Both are **vault-safe** (a retry refuses once the manifest is
gone, so no default-vault sweep can run) and are accepted, not silently ignored:

1. *Manifest deleted, then config delete throws/crashes, OR a crash lands after config
   deletion but before/inside the second sweep.* State: manifest gone → normal `uninstall`
   (and `npx` retry) hard-refuses ("no install manifest found"). Any nested vault already
   survived the FIRST sweep (which completed before the manifest was deleted). The leftover
   is at most `~/.wienerdog/` holding an unmodified `config.yaml` and/or an otherwise-empty
   core — Wienerdog-authored mechanics, no user data. `disposeCoreMechanics` already
   suppresses its own core-removal errors (best-effort), so within a single process this is
   only reachable by process termination between two adjacent unlink/rmdir calls.
2. *The manifest-delete-FAILURE abort (P1 guard).* State: manifest present, config present,
   core present, mechanics already swept. A retry proceeds normally (manifest gate passes),
   re-reads the intact config, and completes once the permission/IO cause is fixed. No
   residual beyond the (recoverable) failed run.

**Resolution:** window (1)'s leftover is removed by the user with a plain
`rm -rf ~/.wienerdog` (it is just Wienerdog's own folder, and the reassurance line already
tells users the vault lives elsewhere). We do NOT relax uninstall's refuse-without-manifest
invariant to auto-clean an orphaned core — that invariant is load-bearing (a manifest-less
recursive core delete is exactly what ADR-0019 guards against), so a self-healing
orphan-core sweep is explicitly **out of scope** for this WP (a candidate future WP). The
point of documenting these is that they are bounded (a leftover empty-ish core dir), never
a lost vault.

**(2) Generalized hash-guard for file deletes.** Replace the config-only condition
with a general one: any `kind:'file'` entry that has a recorded `hash` which no
longer matches the on-disk content is **preserved** with a notice; entries with no
`hash` keep today's delete behavior.

The deferred members (manifest and config) never reach this branch — the contract-(1)
GLOBAL guard intercepts them before the kind dispatch, realpath-aware, so the file branch
needs NO manifest skip and NO config special-case. It is purely the generic hashed-file
guard for every OTHER file:

```js
if (entry.kind === 'file') {
  // (manifest/config already handled by the contract-(1) global guard above.)
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

This generic guard extends the prove-before-delete fail-safe to any FUTURE hashed file
(a hashed file the user edited is kept, not deleted). `config.yaml`'s own defer/keep is
NOT here — the global guard (contract (1)) owns it, so its ADR-0019 "customized kept
forever / unmodified deferred" behavior is centralized and realpath-aware. Every un-hashed
machine-generated file (shims, hook scripts) is unchanged. `sha256File` is the existing
single-file hash helper (`manifest.js:64`) — untouched by this WP.

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
(a deeper descendant) is refused; (b) its basename is `wienerdog-*`; (b2) **the path
is itself a REAL directory via `lstat` (which does NOT follow symlinks) — a symlink at
the copied-skill path is definitionally not the directory we copied even when it points
at an identical tree, so it must fail the ownership proof and be preserved (else `isDir`,
which follows symlinks, would let a user's replacement symlink pass the fingerprint and
be deleted)**; and (c) the
on-disk tree still fingerprints (via the WP-089 `hashDir`) to `entry.hash`
(delete-only-if-fingerprint-matches). A hash-less entry, a fingerprint mismatch,
a symlink at the path, or
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
  `symlink`/`managed-block`/`settings-entry`/`scheduler-entry` reversers, the `dir`
  reverser body, the `contains` helper, or `sha256File`. Deferred-member protection is
  NOT added inside any of these reversers — it lives entirely in the ONE global guard at
  the top of the loop, which `continue`s before any reverser runs for a deferred member.
- `reverse()` must keep `removedSet` seeded with `paths.manifest` so the
  enclosing-core "is it empty?" accounting inside the loop is byte-for-byte the same
  as today; only the real manifest deletion moves OUT of `reverse()` (into
  `uninstall.js`, after mechanics disposal).
- **GLOBAL deferred-member guard (P1, spec-review round 5, 2026-07-13):** the FIRST thing
  in the entry loop, BEFORE the kind dispatch, is a guard that protects all three deferred
  members (`paths.manifest`, `paths.core`, `paths.config`) from EVERY kind and from path
  normalization. It supersedes and REPLACES the earlier per-branch skips (the round-4
  file-branch manifest skip and the dir-branch core skip). Rationale: the per-branch skips
  covered only `kind:'file'`/`dir`; a malformed/hand-edited/adversarial manifest can point
  ANY kind at a deferred member — `{kind:'scheduler-entry', path: paths.manifest}` reaches
  `reverseSchedulerEntry` and `rmSync`s the ledger; a `symlink` entry unlinks a
  symlink-valued core/manifest/config; a `managed-block`/`settings-entry` can rewrite/delete
  a deferred file; a `{kind:'file', path:'<core>/./config.yaml'}` normalized alias bypasses
  an exact-string config check. The single guard closes all of these. It uses `resolvesTo`
  (a 1-line local closure: `p === target || sameResolvedDir(p, target)`) so a symlinked or
  normalized alias of ANY member is caught regardless of kind. `sameResolvedDir` is plain
  realpath equality (works for files too); the string fallback covers an unresolvable side.
- **config.yaml defer/keep is INSIDE the global guard (realpath-aware):** when an entry
  resolves to `paths.config`, the guard — not the file branch — decides: a `kind:'file'`
  entry carrying the recorded `hash` that MATCHES on disk is UNMODIFIED → set `deferredConfig
  = paths.config` (the CANONICAL path, never a normalized alias), `removedSet.add(paths.config)`,
  then `continue` (uninstall.js deletes it LAST, after the manifest, never before); a hash
  MISMATCH is CUSTOMIZED → keep-forever notice + `skipped`; any non-file / hash-less /
  config-missing / adversarial entry targeting config is simply PROTECTED (`skipped`, never
  deleted or rewritten). `deferredConfig` is set only by the legitimate unmodified file
  entry; if a corrupt manifest lacks one, config just stays (safe: uninstall.js keeps the
  core — a bounded degraded outcome). `reverse()`'s return shape becomes
  `{removed, skipped, preserved, deferredConfig, deferredConfigHash}` (the unmodified
  config's recorded hash, carried forward for uninstall.js's delete-site re-verify);
  update every caller (uninstall.js live +
  dry-run branches) and every test that destructures it. Guard `sha256File` with `isFile`
  so a missing/normalized-missing config path never throws.
- **`reverse()` must NEVER `rmdirSync(paths.core)` — now enforced by the global guard.**
  Why it must not: with the manifest deferred, the `removedSet` seed makes the core look
  virtually empty once its other entries are reversed, so an unguarded `dir` branch would
  `rmdirSync(paths.core)` while the ledger is still physically present → `ENOTEMPTY`. Not
  merely cosmetic: on a **retry after a partial mechanics sweep** (attempt 1 removed
  `state/` then crashed before deleting the manifest), `state/` is gone, the tracked files
  are gone, so the core IS virtually empty and the rmdir throws **before**
  `disposeCoreMechanics`/manifest-deletion — wedging every retry forever. Enforcement: the
  global deferred-member guard `continue`s on any entry resolving to `paths.core` (the
  normal manifest's sole core entry, `{kind:'dir', path: paths.core}`, is skipped there)
  BEFORE the `dir` branch runs, so the `dir` branch never meets the core and needs no
  special-case of its own. Core disposal belongs **entirely** to `uninstall.js`'s
  post-manifest step. The `--dry-run` core line is unaffected (`uninstall.js` prints it
  manually, not from `reverse()`'s `removed` list).
- In `uninstall.js`, do not change the confirmation prompt, the vault-preservation
  messaging, or `readVaultPath`. What DOES change: (a) the live-path ordering — reverse
  → dispose → **delete manifest → (confirm manifest gone; else throw) → delete
  `deferredConfig`** → dispose-again; (b) the live summary count adds
  `(deferredConfig ? 1 : 0)`; (c) the **dry-run branch must destructure `deferredConfig`
  and add it to its headline "would be removed" count** (the unmodified config moved out
  of `reverse()`'s `removed`) so config is not silently dropped from the plan — the
  dry-run headline is NOT claimed to equal the live `Removed N` total (mechanics dirs and
  the core stay separate disclosure lines, as today). No other dry-run change.
- **Manifest-delete-failure guard (P1, spec-review 2026-07-13):** `uninstall.js` must
  delete config ONLY after the manifest delete is CONFIRMED by rmSync's own outcome —
  `fs.rmSync(paths.manifest, {force:true})` returning WITHOUT throwing (`force:true` ⇒
  ENOENT/already-gone is success; a real EACCES/EPERM/IO failure throws). Do NOT gate on a
  post-hoc `fs.existsSync(paths.manifest)`: `existsSync` returns `false` on a lookup error
  (EACCES on the path, dangling symlink it follows) too, so it can falsely report the
  manifest gone while it persists → deletes config → manifest-present + config-gone → the
  exact P1 data-loss window on retry. On an rmSync throw, `throw new WienerdogError(...)`
  (already imported) leaving both files intact. Never delete config while the manifest may
  still be present.
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
      `<codexDir>/skills`), which is itself a REAL directory (`lstat`, not following
      symlinks), AND whose on-disk tree still fingerprints (via the WP-089
      `hashDir`) to `entry.hash`; a deeper descendant (`skills/user-content/wienerdog-x`),
      a non-`wienerdog-*` name, a SYMLINK at the path (even to an identical tree),
      a hash-less entry, a fingerprint mismatch, or an
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
- [ ] An UNMODIFIED `config.yaml` is NOT deleted by `reverse()`; it is deleted by
      `uninstall.js` LAST, AFTER the manifest. A crash during the sweep leaves BOTH the
      manifest and config.yaml on disk, so a retry re-derives the correct (possibly
      nested) vault path. There is no crash window in which the manifest exists but
      config.yaml is gone (manifest-before-config ordering).
- [ ] With a vault nested inside the core (config.yaml `vault:` points under a mechanics
      dir), a crashed-then-retried uninstall NEVER deletes the nested vault: `vaultPath`
      is re-read from the surviving config.yaml on every attempt, and
      `disposeCoreMechanics` skips the containing dir (`skippedForVault`).
- [ ] config.yaml is deleted ONLY after the manifest delete is confirmed by rmSync's OWN
      outcome — `rmSync(paths.manifest, {force:true})` returning without throwing (NOT a
      `fs.existsSync` check, which is ambiguous on a lookup error and could falsely report
      the manifest gone). If the delete throws (permission/IO, file remains),
      `uninstall.js` throws `WienerdogError` and does NOT delete config — leaving
      manifest-present + config-present, so a retry stays vault-safe. There is no code path
      (crash OR delete-failure OR lookup-error) that yields manifest-present + config-gone.
- [ ] The post-gate residual windows (manifest-gone/config-throws;
      crash-after-config-before-second-sweep) are vault-safe and documented as accepted
      residuals: the leftover is at most an empty-ish `~/.wienerdog` the user removes with
      `rm -rf`; no nested vault is ever lost. A crashed uninstall is retried via
      `npx wienerdog@latest uninstall` (the local shim/app tree are gone by design).
- [ ] The global guard prevents any entry from DIRECTLY deleting/damaging a deferred member
      (manifest, core, config) via its `entry.path`, for every entry kind and for
      normalized/symlink path aliases: a SINGLE guard before the kind dispatch `continue`s on
      any entry resolving (string-or-realpath) to `paths.manifest`, `paths.core`, or
      `paths.config`. Proven by cross-kind regression tests — scheduler-entry / symlink /
      settings-entry / managed-block / normalized-path file entries each with `path` at a
      deferred member do NOT delete/damage it. (INDIRECT side effects via a scheduler-entry's
      executable `unload` argv are an explicit out-of-scope residual — see Non-goals /
      Residuals — not covered by this guard and not a WP-088 regression.)

## Acceptance criteria

- [ ] `reverse()` alone does NOT delete `install-manifest.json` (a unit test asserts
      the file remains after `reverse()` returns).
- [ ] Cross-kind global-guard regression: for a REAL manifest JSON file (written to disk,
      loaded via `manifestLib.load`, `reverse()` run on the real filesystem with NO stubs),
      each of a self-referential `{kind:'file', path: paths.manifest}`, a
      `{kind:'scheduler-entry', path: paths.manifest}`, a `{kind:'symlink'}` at a symlinked
      deferred member, a `settings-entry` at `paths.config` AND (separately) a `managed-block`
      at `paths.config` (BOTH mutation branches, not one-or-the-other), a normalized
      `{kind:'file', path: '<core>/./config.yaml'}`, and a `{kind:'scheduler-entry', path:
      paths.config}` leaves that deferred member intact on disk and NOT in `removed`; the
      normalized unmodified-config alias additionally yields `deferredConfig === paths.config`
      (canonical).
- [ ] Documented-residual regression (scheduler `unload`): a `scheduler-entry` with a
      non-deferred `path` and an `unload` argv that would touch a deferred member has its
      `unload` INVOKED as designed (asserted via the schedulerSpawn chokepoint / spy); the test
      documents this as the ACCEPTED out-of-scope residual (the guard screens `entry.path`, not
      `unload`), NOT a guard-blocks-it assertion.
- [ ] After a full `uninstall.js run()` (live), `install-manifest.json` is gone, an
      unmodified `config.yaml` is gone, and the empty core is removed; but if
      `disposeCoreMechanics` throws mid-sweep, BOTH the manifest and config.yaml still
      exist (proved by a test that injects a throwing dispose and asserts both files
      remain — recovery ledger + vault-path source intact for retry).
- [ ] `reverse()` alone does NOT delete an unmodified `config.yaml`; it returns it in
      `deferredConfig` (a unit test asserts the file remains after `reverse()` returns and
      `deferredConfig === paths.config`). A customized (hash-mismatched) `config.yaml` is
      kept in `skipped` with `deferredConfig === null` (ADR-0019 rule intact), and a
      clean live uninstall with a customized config keeps config.yaml and the core.
- [ ] A crashed-then-retried uninstall with a nested vault preserves the nested vault
      (the config-deferral regression test): attempt 1 crashes in `disposeCoreMechanics`;
      a real retry re-reads config.yaml, derives the nested vault path, and the nested
      vault (and its files) survive.
- [ ] Manifest-delete-FAILURE injection: a test stubs ONLY the manifest deletion to throw
      (wrap `fs.rmSync` to throw with a real `err.code` for `paths.manifest`, delegate
      otherwise) while the real manifest file remains and the real filesystem is observed;
      it does NOT stub any verification (the gate is rmSync's own outcome). Assert `run()`
      rejects with `WienerdogError`, config.yaml is NOT deleted (untouched on disk), and a
      subsequent real retry with a nested vault leaves the nested vault intact.
- [ ] Deferred-config TOCTOU re-verify: a config.yaml unmodified at `reverse()` time but
      EDITED during the mechanics sweep (mutated inside an instrumented
      `disposeCoreMechanics`) is PRESERVED at the delete site (the carried-forward
      `deferredConfigHash` no longer matches) — it survives with the new content and a
      keep-notice, is NOT deleted, and is not counted removed; an unchanged deferred config
      is still deleted (happy path).
- [ ] A `kind:'file'` entry with a `hash` that mismatches current content is kept
      (in `skipped`, not `removed`) with the "modified since install" notice; the
      same entry with a matching hash is removed (and, for `config.yaml` specifically, a
      matching hash means DEFERRED — reported in `deferredConfig`, removed by uninstall.js).
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
- [ ] `dryRun` still removes nothing (config.yaml and the manifest both remain on disk
      after a dry-run) and its headline "would be removed" count INCLUDES the deferred
      config so config is not dropped from the plan. The dry-run headline is NOT claimed
      to equal the live `Removed N` total — the mechanics dirs and the core-removal are
      disclosed as separate lines (ADR-0019). M1 exactness = every item dry-run LISTS
      (reverse-removed incl. config, each mechanics dir, the core line) is exactly what
      the live run removes; `deferredConfig` is counted once (customized config → null →
      stays in `skipped`, never counted as removed).
- [ ] Existing uninstall/manifest tests pass (adjust the two helper call sites/tests
      for the new `appRoot`/`skillsRoots` params).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "manifest|uninstall"
npm test
npm run lint
```

## Out of scope / Non-goals / Residuals (do NOT do these)

- **RESIDUAL (accepted, out of scope): a `scheduler-entry`'s executable `unload` argv.**
  The manifest stores an `unload` argv for each `scheduler-entry`, and `reverseSchedulerEntry`
  EXECUTES it by design to unregister the OS schedule (launchctl bootout / schtasks /delete;
  `manifest.js:227-236`). This pre-dates WP-088 (WP-013 / WP-075). A fully adversarial manifest
  could therefore put an arbitrary command — including one that deletes the manifest or
  config — into `unload`, an INDIRECT route the global deferred-member guard (which screens
  `entry.path`) cannot see. WP-088 does **not** police `unload` commands: that is impossible to
  do soundly (it is an arbitrary argv) and is the wrong scope. **Defensible invariant:** forging
  an `unload` argv requires WRITE access to `~/.wienerdog` (the user's home), which already grants
  arbitrary code execution by many means — so an attacker who can forge the manifest is already
  game-over. Manifest-integrity against a home-dir-write adversary is a separate, pre-existing
  concern, not a WP-088 regression. WP-088's crash-safety guarantees hold for the NON-adversarial
  (Wienerdog-authored) manifest and for every DIRECT path-based deletion route. The cross-kind
  tests PIN this residual (the `unload` runs as designed; the test documents it as accepted, not
  as something the guard blocks).
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

Deferred-deletion-set redesign (2026-07-13) — rationale and the two P1s:

- **Redesign rationale.** WP-088's manifest-last change made uninstall *retryable*.
  Retryability exposed a class of bug: anything a safe RETRY needs to COMPLETE uninstall,
  but that `reverse()` deletes before the crash-prone `disposeCoreMechanics` sweep,
  becomes unrecoverable on the retry. The coherent fix is to treat this as a single
  **deferred-deletion set** — the manifest, the core dir, AND config.yaml — all deferred
  until the sweep succeeds, rather than patching each leak point in isolation. Two P1s
  are instances of this one class:
- **P1 (core rmdir → ENOTEMPTY wedge; already fixed on the branch, c0f32de):**
  `reverse()`'s `dir` branch rmdir'd `paths.core` while the deferred manifest was still
  physically inside it → `ENOTEMPTY`, wedging every retry after a partial sweep. FIXED —
  the `dir` branch never rmdirs `paths.core`; core disposal is uninstall.js's
  post-manifest job. (See Implementation notes, 2026-07-13.)
- **P1 (nested-vault path unrecoverable on retry; RESOLVED by this amendment):**
  `uninstall.js` reads the vault path from config.yaml (`readVaultPath`) to protect a
  vault nested inside the core, but `reverse()` deleted config.yaml when unmodified. On a
  retry (fresh process, config.yaml gone) `readVaultPath` returned `null` → the DEFAULT
  vault path → `disposeCoreMechanics` recursively deleted the user's nested vault.
  RESOLVED — config.yaml joins the deferred-deletion set: `reverse()` returns an
  unmodified config in `deferredConfig` (never deletes it); `uninstall.js` deletes it
  LAST, AFTER the manifest, so the invariant "manifest-present ⟹ config-present" holds at
  every crash point and every retry re-derives the correct (possibly nested) vault path.
  A customized config.yaml is still kept forever (ADR-0019), never in the deferred set.
- **Holistic check (2026-07-13):** config.yaml is the ONLY member of the deferred set
  beyond the manifest and core. `disposeCoreMechanics`'s sole external input is
  `vaultPath`, sourced solely from config.yaml (`readVaultPath` is its only caller);
  nothing else `reverse()` deletes feeds the retry gate or the vault protection, and the
  default vault lives outside the core (never swept).

Codex spec-review of the redesign (2026-07-13, round 2) — one P1 + three P2s:

- **P1 (swallowed manifest-delete failure recreated the data-loss window):** RESOLVED
  (final gate settled in round 3, below). The first draft did
  `try { rmSync(manifest) } catch {}` then unconditionally deleted config.
  `rmSync(force:true)` throws (leaving the file) on a permission/IO error, so this could
  yield manifest-present + config-gone → a retry passes the manifest gate, reads no config
  → default vault → nested vault deleted — the exact P1 the redesign exists to close. FIX:
  `uninstall.js` deletes config ONLY after the manifest delete is CONFIRMED gone; if it is
  not, throw `WienerdogError` leaving BOTH files present (retry-safe). Added a
  manifest-delete-failure injection acceptance test.
- **P2 (operational retryability — command re-entry):** RESOLVED (option a). `reverse()`
  removes the shim + vendored app tree, so after a crash there is no local executable. The
  spec now states the retry is launched via `npx wienerdog@latest uninstall` (npx supplies
  the code; the on-disk manifest gate + config still drive a correct run) and makes the
  "retryable" claims precise: only READ-state (manifest, core, config) is deferred, not the
  executable. Deferring the shim/app tree was rejected — removing them is uninstall's job.
- **P2 (post-gate cleanup-wedge windows):** RESOLVED by explicit documentation as accepted
  residuals. manifest-gone/config-throws and crash-after-config-before-second-sweep are
  vault-safe (retry refuses without the manifest); the leftover is at most an empty-ish
  `~/.wienerdog` the user removes with `rm -rf`. Relaxing uninstall's refuse-without-manifest
  invariant to auto-clean an orphaned core is explicitly out of scope (a manifest-less
  recursive core delete is what ADR-0019 guards against).
- **P2 (dry-run count exactness):** RESOLVED by correcting the claim. The dry-run headline
  counts reverse-removed + `deferredConfig`; the mechanics dirs and the core are disclosed
  as separate lines (as today), so the headline is NOT claimed to equal the live
  `Removed N` total. M1 exactness is redefined precisely: every item dry-run LISTS equals
  what the live run removes; `deferredConfig` is counted once.
- **Probes (b) second-sweep uses in-process captured `vaultPath`, and (e)
  customized-config-kept:** confirmed SOUND by the reviewer — left as-is.

Codex spec-review round 3 (2026-07-13) — P1 confirmation-gate hole:

- **P1 (confirmation gate conflated "absent" with "could-not-verify"):** RESOLVED. Round 2
  gated config deletion on `!fs.existsSync(paths.manifest)` after the delete. `existsSync`
  returns `false` not only on genuine absence but on a LOOKUP error (EACCES on the path, a
  dangling symlink it follows), so "existsSync === false" does not prove the manifest is
  gone — if it could not verify while the manifest persists, config would still be deleted
  → manifest-present + config-gone → the exact P1 reopens. FIX: drop `existsSync`; gate on
  `rmSync`'s OWN outcome — `fs.rmSync(paths.manifest, {force:true})` returning WITHOUT
  throwing (with `{force:true}`, ENOENT/already-gone is success, and a real EACCES/EPERM/IO
  failure throws). On a throw, `throw new WienerdogError(...)` leaving both files present.
  No `existsSync`, no symlink/lookup-error ambiguity. Tightened the failure-injection test
  to stub ONLY the manifest deletion (never the verification, which no longer exists as a
  separate step). All round-2 resolutions (P2 command re-entry, cleanup-wedge residuals,
  dry-run count, and the SOUND probes b/e) confirmed still in force by round 3.
- **Accepted caveat (npx retry):** `npx wienerdog@latest uninstall` is a reliable retry
  only under the same user/environment AND a version whose `paths`/manifest resolution
  matches the crashed install; `@latest` alone does not guarantee that. Accepted (same
  user/machine, `getPaths()` stable) rather than pinning a version; documented in the
  crash-recovery note.

Codex spec-review round 4 (2026-07-13) — P1 defensive deferred-set invariant:

- **P1 (`reverse()` could delete the ledger via a self-referential manifest entry):**
  RESOLVED. The contract said `reverse()` defers the manifest, but its `kind:'file'`
  pseudocode did not EXCLUDE `entry.path === paths.manifest`. A malformed/hand-edited/
  adversarial manifest carrying `{kind:'file', path: paths.manifest}` (a valid JSON entry,
  processed first by `[...entries].reverse()`) would be deleted inline by the generic
  hashless-file branch — bypassing the manifest-last deferral AND the confirmation gate; a
  crash then leaves the manifest absent → retry refuses at the top-level gate → the exact
  wedge deferral exists to eliminate. FIX (round 4): a file-branch `paths.manifest` skip —
  **superseded in round 5 by a global guard** (the per-branch skip covered only
  `kind:'file'`; see below). Added a unit test. The reviewer confirmed the round-3
  rmSync-outcome gate is genuinely closed across every target-type and crash interleaving,
  and the failure-injection test faithful.

Codex spec-review round 5 (2026-07-13) — P1 the per-branch skips were incomplete:

- **P1 (other reverse() branches can still delete/damage a deferred member):** RESOLVED.
  The round-4 per-branch skips (`paths.core` in the `dir` branch, `paths.manifest` in the
  `file` branch) covered only those two kinds. A manifest entry of a DIFFERENT kind pointing
  at a deferred member still hit the danger: `{kind:'scheduler-entry', path: paths.manifest}`
  → `reverseSchedulerEntry` `rmSync`s the ledger (retry wedge); the same targeting
  `paths.config` recreates manifest-present + config-gone (nested-vault data loss); a
  `symlink` unlinks a symlink-valued member; `managed-block`/`settings-entry` rewrite/delete
  a deferred file; and even within `kind:'file'`, config's protection was exact-string only,
  so a normalized `<core>/./config.yaml` alias reached the generic `rmSync`. FIX: replace the
  per-branch skips with a SINGLE GLOBAL GUARD at the top of the entry loop, before the kind
  dispatch, that `continue`s on any entry resolving (string-or-realpath, via `resolvesTo`) to
  `paths.manifest`, `paths.core`, or `paths.config` — covering ALL kinds and normalized
  paths at once. config's defer-vs-keep decision moves INTO the guard (realpath-aware, from
  the recorded hash; canonical `deferredConfig`). Per-branch skips removed (single source of
  truth). Tightened the round-4 test to a real-JSON/no-stub observation and added cross-kind
  regression coverage (scheduler-entry / symlink / settings-entry / managed-block /
  normalized-path file each targeting a deferred member). Also applied `e?.code ||
  'unknown error'` in the abort message (cosmetic diagnostics). Everything else (rmSync-outcome
  gate, ordering, cleanup-wedge residuals, dry-run count, customized-config-kept, in-process
  vaultPath, npx-retry caveat) confirmed SOUND and unchanged. After this, the global guard
  blocks every DIRECT path-based route for every kind and for normalized/symlink aliases
  (right-sized in round 6; the earlier "regardless of entry kind" phrasing was scoped down
  to exclude indirect `unload` side effects — see round 6).

Codex spec-review round 6 (2026-07-13) — right-size the claim + document the one residual:

- **P1 (as stated: scope, not mechanism) — indirect `scheduler-entry` `unload` route:**
  The global guard screens `entry.path`, so it closes every DIRECT path-based deletion for
  every kind and alias — CONFIRMED SOUND by the reviewer. But a `scheduler-entry` also carries
  an executable `unload` argv that `reverseSchedulerEntry` RUNS by design (launchctl bootout /
  schtasks /delete; `manifest.js:227-236`, pre-dates WP-088 — WP-013/075). An adversarial
  manifest could put a command that deletes the manifest/config in `unload`, an INDIRECT route
  the path guard cannot see. RESOLUTION (per the reviewer's "contain OR explicitly exclude with
  a defensible invariant"): we do NOT try to police `unload` (impossible and wrong scope).
  Instead the claim is right-sized everywhere from "structurally incapable regardless of entry
  kind" to the accurate **"the global guard prevents any entry from DIRECTLY deleting/damaging a
  deferred member via its PATH, for every kind and for normalized/symlink aliases"**, and the
  `unload` route is recorded as an explicit out-of-scope residual (see Non-goals / Residuals)
  with a defensible invariant: forging `unload` requires WRITE access to `~/.wienerdog`, which
  ALREADY grants arbitrary code execution by many means — so a home-dir-write adversary is
  already game-over, and manifest-integrity against such an adversary is a separate, pre-existing
  concern. WP-088's crash-safety holds for the Wienerdog-authored manifest and for all direct
  path-based deletion. This is a documentation/scoping change only; the guard is unchanged.
- **P2 (test wording):** the cross-kind tests now name BOTH mutation branches explicitly (a
  `settings-entry` AND a `managed-block`, each targeting a deferred member) and add a
  scheduler-`unload` regression that PINS the documented residual (the `unload` runs as designed
  and the test asserts it is the accepted out-of-scope behavior, not a false "guard blocks it").

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
   `fix(manifest): defer manifest+config deletion, hash-guard file deletes, contain tree removal (WP-088)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
</content>

## Done record (2026-07-13)

Merged to main as `c314317` (PR #92, squash). The hardest WP of the batch: **6 spec-review rounds + 2 implementation P2 rounds** (architect holistic redesign after a second P1). Converged on a deferred-deletion set (manifest + core + config.yaml when unmodified), a global `reverse()` guard, and an rmSync-outcome confirmation gate (config deleted only once the manifest is verifiably gone — `existsSync` was rejected because it conflates "gone" with "could-not-verify"). The scheduler-`unload` residual is documented out-of-scope with a defensible invariant. Double gate: wd-reviewer APPROVE + Codex clean; CI green. Shipped in v0.8.0.
