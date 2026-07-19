---
id: WP-144
title: Treat the install manifest as untrusted — strict per-kind schema, per-entry error isolation, root-bounded deletes
status: In-Review
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0019]
branch: wp/144-manifest-untrusted-schema-bounded-deletes
---

# WP-144: Manifest replay as untrusted input — schema + bounded deletes (audit A8, part 1 of 2)

## Context (read this, nothing else)

Wienerdog is an install-time tool that writes config files onto a user machine
and records every artifact it creates in an **install manifest**
(`~/.wienerdog/install-manifest.json`). `wienerdog uninstall` replays that
manifest in reverse to remove exactly what was created and nothing else.
**IRON RULE (ADR-0004): Wienerdog is just files** — no daemons, no telemetry;
uninstall is pure filesystem reversal.

The manifest is a plaintext JSON file on disk, editable by anyone with the
user's shell. The security audit (action **A8**, P1) requires the uninstall
reverser to **treat the manifest as untrusted input**: a poisoned or
hand-corrupted manifest must never let uninstall delete or rewrite an unrelated
user file, and one malformed entry must never make the whole install
**un-uninstallable** (a single throwing reverser today aborts the entire
uninstall). This WP is **part 1 of 2** for A8. It covers the non-scheduler
kinds: strict per-kind schema validation, per-entry error isolation, and a
**realpath/lstat-aware root bound** on every delete/rewrite. Part 2 (WP-145)
covers the `scheduler-entry` kind (re-deriving OS unregister commands instead of
executing stored argv) and showing the derived plan before confirmation.

A manifest **entry** is `{kind, path, ...}`. The kinds and their reversers live
in `src/core/manifest.js`. `reverse(paths, manifest, opts)` loops the entries in
reverse order and dispatches on `entry.kind`. Two protections already exist and
must be preserved: (1) a **global deferred-member guard** at the top of the loop
that refuses to touch the manifest file, the canonical core dir, or `config.yaml`
for any kind (realpath-aware); (2) per-kind ownership proofs inside each reverser
(a `file` entry with a recorded `hash` that no longer matches is kept; a
`copied-skill` is fingerprinted with `hashDir`; a `symlink` is removed only if it
is still a symlink; `managed-block`/`settings-entry` edit surgically). This WP
**adds a layer**, it does not replace those.

## Current state

`src/core/manifest.js` — the exact functions this WP changes:

- `reverse(paths, manifest, { dryRun })` — the entry loop. It already has the
  global deferred-member guard (manifest/core/config) using a local
  `resolvesTo(p, target)` and `sameResolvedDir`. Then it dispatches:
  `file` (delete if `!hash || sha256File===hash`), `dir` (rmdir if empty),
  `symlink`, `managed-block`, `settings-entry`, `scheduler-entry` (← WP-145,
  not this WP), `vendored-tree`, `copied-skill`, `vault-file`/`vault-dir`
  (preserved), else unknown → stderr warning + skip.
- The dispatch has **no try/catch per entry**. `reverseSettingsEntry` calls
  `JSON.parse(raw)` (line ~231) and `reverseManagedBlock`/others can throw; any
  throw propagates out of `reverse()`, aborts `uninstall`, and — because
  `uninstall` deletes the manifest only after a clean sweep — leaves the install
  **un-uninstallable** (every retry hits the same throwing entry). This is the
  A8 "one malformed settings file makes the install permanently
  un-uninstallable" defect.
- There is **no bound on the delete/rewrite target beyond the three deferred
  members**. A hand-added `{kind:'file', path:'/Users/me/taxes.pdf'}` (hash-less)
  passes the deferred-member guard and is deleted by the `file` branch. This is
  the A8 "deletes/rewrites unrelated user files" defect.

`reverse()` already computes, inline:
```js
const appRoot = path.join(paths.core, 'app');
const skillsRoots = [path.join(paths.claudeDir, 'skills'), path.join(paths.codexDir, 'skills')];
const resolvesTo = (p, target) => p === target || sameResolvedDir(p, target);
```
and a module-level helper exists:
```js
/** True when `inner` is `outer` or lives inside it. Both sides realpath-canonicalized. */
function contains(outer, inner) { /* returns rel==='' || (!rel.startsWith('..') && !isAbsolute(rel)) */ }
```

**Legit out-of-core targets the manifest records** (must NOT be preserved by the
new bound — the reference list for the allowed-root set):
- files under `paths.core` (hook scripts in `core/bin/`, vendored `core/app/`, skills)
- the PATH shim `~/.local/bin/wienerdog` and (win32) `~/.local/bin/wienerdog.cmd`
  (recorded `{kind:'file', path}` by `vendor.writeShim`)
- managed-block / settings-entry / symlink / copied-skill under `paths.claudeDir`
  and `paths.codexDir`
- `scheduler-entry` files (launchd plists, systemd units, Windows task XML) —
  **out of scope here; handled by WP-145**, so `scheduler-entry` is EXCLUDED from
  this WP's bound.

`paths` (from `src/core/paths.js`, `getPaths()`) exposes `home`, `core`,
`claudeDir`, `codexDir`, `config`, `manifest`, `state`, `logs`, `secrets`, `vault`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | Add per-kind schema validation, per-entry error isolation (try/catch), and the root-bound guard in `reverse()`. Do NOT touch `reverseSchedulerEntry` / the `scheduler-entry` branch (WP-145). Do NOT change existing per-kind ownership proofs. |
| modify | tests/unit/manifest.test.js | Add the adversarial cases below. |
| modify | tests/unit/uninstall.test.js | Add/extend a case proving a malformed entry no longer aborts the uninstall and a poisoned external path is preserved end-to-end. |

### Exact contracts

**1. Per-kind schema validation (fail-safe = skip + visible notice).**
Add a pure helper `validateEntry(entry)` returning `{ok:true} | {ok:false, why:string}`.
Rules (all keys beyond those listed are ignored, NOT rejected — forward-compat;
only REQUIRED keys/types are enforced):

| kind | required | types |
|------|----------|-------|
| `file` | `path` | `path`:string; `hash?`:string |
| `dir` | `path` | `path`:string |
| `symlink` | `path` | `path`:string |
| `managed-block` | `path` | `path`:string; `createdFile?`:boolean |
| `settings-entry` | `path` | `path`:string; `createdFile?`:boolean; `commands?`:string[] (array of strings) |
| `vendored-tree` | `path` | `path`:string |
| `copied-skill` | `path` | `path`:string; `hash?`:string |
| `vault-file` / `vault-dir` | `path` | `path`:string |
| `scheduler-entry` | `path` | `path`:string (deep validation deferred to WP-145) |

A missing/empty/non-string `path`, a wrong-typed field, or an **unknown kind**
→ `{ok:false}`. In `reverse()`, an entry that fails validation is **skipped**
(added to `skipped`) with a single stderr notice
`wienerdog: skipping manifest entry with invalid <kind> shape (<path-or-"?">)` —
it must never reach a reverser. This replaces the current bare "unknown kind"
branch (which stays as the catch-all for a validly-typed-but-unknown kind).

**2. Per-entry error isolation.** Wrap the per-entry dispatch body in the loop in
a `try/catch`. On a thrown error, push the entry path to `skipped`, write one
stderr line
`wienerdog: could not reverse <kind> entry <path> (<err.code||err.message>) — leaving it in place`,
and `continue`. The loop must always run to completion so every other entry is
reversed and `uninstall` can then delete the manifest (closing the retry gate).
The global deferred-member guard and schema validation run BEFORE this try so
they keep their own explicit skip semantics.

**3. Root-bounded deletes/rewrites (the containment layer).** Before dispatching
a mutating kind, verify the target resolves inside an allowed Wienerdog root.
Compute once at the top of `reverse()`:
```js
const localBin = path.join(paths.home, '.local', 'bin');
const allowedRoots = [paths.core, paths.claudeDir, paths.codexDir, localBin];
```
Add a helper `withinAllowedRoot(targetPath, allowedRoots, localBin)`:
- Resolve containment with the existing realpath-aware `contains(root, targetPath)`
  for each root; the target is in-bounds iff it is contained by at least one root.
  `contains` realpath-canonicalizes both sides, so a symlinked home/tmp is handled
  and a `..`/normalized alias cannot escape (a target that realpath-resolves
  outside every root fails).
- **Shared-dir basename allowlist:** `~/.local/bin` is a user-shared directory, so
  containment alone is not enough. When the ONLY matching root is `localBin`,
  additionally require `path.basename(targetPath)` ∈ `{'wienerdog','wienerdog.cmd'}`;
  otherwise treat as out-of-bounds. (core/claudeDir/codexDir need no basename
  filter — the per-kind ownership proofs below already fence those.)
- Return `true` in-bounds, `false` otherwise.

**Owner walkthrough (2026-07-18): Ready.** The owner ratified the containment
root-set `{paths.core, paths.claudeDir, paths.codexDir, ~/.local/bin}` (with the
`~/.local/bin` basename allowlist `{wienerdog, wienerdog.cmd}`) as the complete,
correct allowed-root set — every manifest-recorded legit target falls inside it,
and the three-layer design (schema-validate → per-entry try/catch → root-bound)
stands as written. The fingerprint follow-up remains deferred (above).

Apply this gate in `reverse()` to these kinds ONLY: `file`, `dir`, `symlink`,
`managed-block`, `settings-entry`, `vendored-tree`, `copied-skill`. When
`withinAllowedRoot` returns `false`, **preserve** the target: push to `skipped`,
write one stderr line
`wienerdog: preserving <path> — outside every Wienerdog-owned root (not deleting)`,
and `continue` (never call the reverser). `scheduler-entry`, `vault-file`,
`vault-dir` are NOT gated here (scheduler → WP-145; vault kinds are already
no-op-preserved). The gate runs AFTER the deferred-member guard and schema
validation, and its containment check must be inside the per-entry try/catch's
scope so an `fs` error during resolution also fails safe (preserve).

**Deliberate scope note on "require fingerprints for file deletion" (A8).** The
audit lists "require fingerprints for file deletion; unverifiable means keep."
Wienerdog today records most `file` entries **hash-less** (e.g. `sync.stageDir`,
`copyHookScript`). Making hash-less files "keep" would leave every skill/hook
file behind on a legitimate uninstall, and recording hashes for all of them is a
cross-cutting record-side change spanning `sync.js`, `shared.js`, `vendor.js`
(out of this WP's boundary). This WP therefore satisfies the underlying threat —
"Hashless external file path is preserved" — via the **root bound** (an external
hash-less path resolves outside every allowed root and is preserved), and keeps
the existing hash-verify-when-present behavior for in-bound files. The
record-side "hash every deletable file" hardening is flagged as a follow-up (see
Out of scope / the WP report open questions), not silently dropped.
**Owner decision (2026-07-18): deferred — recorded as a future item, not specced
now.** The root bound satisfies the audit's literal acceptance ("hashless
external file path is preserved"); the hash-every-deletable-file defense-in-depth
is a later WP to raise after the A8 core lands, not a scope expansion here.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Keep `manifest.js` free of any scheduler/adapter import (the module is core;
  adapters sit above it). All new helpers are pure or use only `fs`/`path`/`crypto`
  already required at the top.
- Do NOT alter the module's export list except as needed to export a new pure
  helper for tests (e.g. add `validateEntry` and `withinAllowedRoot` to
  `module.exports` — additive only; existing exports unchanged).
- Idempotence/behavior for a LEGITIMATE manifest must be byte-for-byte unchanged:
  every legit entry is in-bounds and schema-valid, so `removed`/`skipped`/
  `preserved`/`deferredConfig` for a normal install are identical to today. Prove
  this with an existing golden/round-trip uninstall test still passing.
- When uncertain, choose the simpler option and record it under "Decisions made"
  in the PR. Do NOT expand scope.

## Security checklist

- [ ] Every mutating manifest kind (`file`, `dir`, `symlink`, `managed-block`,
      `settings-entry`, `vendored-tree`, `copied-skill`) is gated by
      `withinAllowedRoot` before its reverser runs; an out-of-root target is
      preserved, never deleted/rewritten.
- [ ] Containment uses the realpath-aware `contains` (rejects `..`, normalized,
      and symlinked-alias escapes because both sides are canonicalized); an `fs`
      error while resolving fails safe (preserve).
- [ ] `~/.local/bin` targets are additionally basename-allowlisted to
      `wienerdog` / `wienerdog.cmd`.
- [ ] A thrown reverser is caught per-entry; the loop always completes so the
      manifest can be deleted and the install is never un-uninstallable.
- [ ] The existing deferred-member guard (manifest/core/config) and the per-kind
      ownership proofs (hash, isSymlink, surgical edits) are unchanged.

## Acceptance criteria

- [ ] A manifest with `{kind:'file', path:'<home>/taxes.pdf'}` (hash-less,
      outside all roots) reverses with `taxes.pdf` **preserved** and reported in
      `skipped`; zero bytes removed there.
- [ ] A `{kind:'file', path:'<claudeDir>/../evil.txt'}` (normalized/`..` alias
      pointing outside the roots) is preserved (realpath containment rejects it).
- [ ] A `{kind:'settings-entry', path:'<claudeDir>/settings.json'}` whose file
      contains **malformed JSON** no longer aborts uninstall: the entry is
      skipped with a notice and every other entry still reverses; `uninstall`
      completes and removes the manifest.
- [ ] An entry with an unknown kind, or a `file` entry with `path: 42`, is
      skipped with the invalid-shape notice and never reaches a reverser.
- [ ] The `~/.local/bin/wienerdog` shim entry is still removed (in-bounds,
      basename allowed); a planted `~/.local/bin/other-tool` file entry is
      preserved.
- [ ] A full legitimate install→uninstall (existing round-trip test) removes
      exactly the same set as before this WP and always preserves the vault.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "manifest|uninstall"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- `scheduler-entry` re-derivation and "show derived commands before confirm" —
  **WP-145** (A8 part 2). Do not touch `reverseSchedulerEntry` or the
  `scheduler-entry` dispatch branch.
- Recording content hashes for every deletable `file` entry (record-side change
  across `sync.js`/`shared.js`/`vendor.js`) — a separate follow-up; note it in
  the PR "Decisions made" and it is called out to the owner in this WP's report.
- The managed-block separator round-trip fidelity bug — **WP-147**.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/144-manifest-untrusted-schema-bounded-deletes`; conventional commits;
   PR titled `fix(uninstall): treat the manifest as untrusted — schema + root-bounded deletes (WP-144)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Fix-pass amendments (2026-07-19)

Review found a delete-time TOCTOU and an isolation gap. Full implementer contract
+ tests: `FIX-PLAN.md` cluster **C6**. No new files (all edits within
`src/core/manifest.js` + the two listed test files). Real file is
`src/core/manifest.js` (the report said `src/cli/manifest.js`).

### A1 — symlink-swap TOCTOU: bind mutations to the resolved path [Codex HIGH]

`withinAllowedRoot` validates the current realpath (L594), but the reversers then
act on the **lexical** `entry.path` — `sha256File(entry.path)` (L609),
`fs.rmSync(entry.path)` (L617), `reverseManagedBlock` read L176→write L210,
`reverseSettingsEntry` read L226→write L254. An actor who retargets an
intermediate directory symlink after the check redirects the op out of root.
**Corrected contract:** for every mutating kind, resolve once
(`resolved = fs.realpathSync(entry.path)`, inside the per-entry try), re-validate
`withinAllowedRoot(resolved, …)`, and perform all `fs` ops on **`resolved`** (a
canonical, symlink-free path — an intermediate swap can no longer affect it). For
read-then-write kinds (`managed-block`, `settings-entry`), open `resolved` once
with `O_NOFOLLOW` on the final component and read+modify+write through the **same
fd** (ELOOP ⇒ preserve+skip). `symlink` keeps `lstat`+`unlink` (must not resolve
through the link). Test: an intermediate directory symlink swapped to an
out-of-root target after the check ⇒ the external file is **preserved** (fails if
ops use lexical `entry.path`).

### A2 — deferred-config `sha256File` inside per-entry isolation [both, MED]

The config-guard `sha256File` at **L566** is **above** the per-entry `try`
(opens L593), so a read error (EACCES/EISDIR-after-swap/ELOOP) aborts the whole
sweep → retry-wedged uninstall. **Corrected contract:** wrap the deferred-config
hashing in its own try/catch; on error, do not defer that member (leave config in
place), write one notice, continue. The sweep must always complete. Test: a
config entry whose file is unreadable no longer aborts uninstall; the manifest is
still removed.

### A3 — crash-retry notice [impl, P2]

An idempotent re-run prints "outside every Wienerdog-owned root" for an
already-deleted in-bounds file (realpath throws ⇒ contains=false).
**Corrected contract:** existence-check before the containment gate — a
non-existent target is skipped silently as already-removed. Test: reversing twice
emits no false "outside every root" line.

### A4 — stale-symlink (target-match) — NOT this WP

The reviewer's stale-symlink finding (a stale entry deletes a user's in-root
replacement link; `reverseSymlink` proves only "is a symlink") is **owned by
WP-153 (Draft)** — dispositioned there, not designed here. WP-153's planned
`target` schema key is forward-compatible with this WP's `symlink` schema
(`{path}`).
