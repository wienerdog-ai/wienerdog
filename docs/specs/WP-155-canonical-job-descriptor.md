---
id: WP-155
title: Generate a canonical, digest-bound job descriptor at schedule/sync time
status: Draft
model: opus
size: M
depends_on: [WP-144, WP-145, WP-153]
adrs: [ADR-0004, ADR-0013, ADR-0027, ADR-00XX-a7-executable-integrity]
branch: wp/155-canonical-job-descriptor
---

# WP-155: Canonical digest-bound job descriptor (audit A7, part 3 of 6)

## Context (read this, nothing else)

Wienerdog schedules its nightly "dream" (and, later, routine) jobs with the
OS-native scheduler (launchd/systemd/schtasks). The registered OS entry is
**static** — it just runs `node <currentBin> run-job <name>`. What that fire
actually *does* is resolved at run time by reading the job's `run` action out of
`~/.wienerdog/config.yaml` and executing whatever code currently sits under
`~/.wienerdog/app/current`. Audit finding **F1**: neither of those mutable
inputs is integrity-checked, so any process that can write `config.yaml` (change
the `run` action) turns a pre-authorized nightly slot into persistent execution
**without registering its own scheduler entry**. **IRON RULE (ADR-0004):
Wienerdog is just files.**

This WP builds the first half of the fix (audit A7): a **canonical job
descriptor** — a code-owned, deterministic record of exactly what a scheduled
job is authorized to run: its `run` action, capability profile, prompt/skill
content hash, timeout, vault root, the **absolute executable identities** (from
WP-153's pins), and the **app release digest** (a content address of the
vendored `app/current` tree). The descriptor is serialized canonically and
reduced to a **descriptor digest** (sha256). It is written at schedule/sync time
and can be **re-derived from live inputs** so a later comparison reveals drift.

This WP produces the descriptor module and writes/records descriptors during
schedule registration. It does **not** yet bind the digest into the OS entry or
enforce it at fire time — that is WP-156 (the out-of-tree launcher that consumes
this descriptor). Keeping the descriptor a separate, independently-tested layer
mirrors how WP-145 (scheduler unload) builds on WP-144 (manifest schema).

**Honest boundary (state this; do not overclaim).** Same-user control of BOTH
the core and the OS scheduler can still replace both anchors. A7 protects
**scoped core writes** (e.g. a config/app write by a limited primitive that does
not re-register the OS scheduler entry) and **detects drift**; it is **NOT** a
claim against arbitrary same-user native malware — that is A12's territory. The
descriptor's value is that re-deriving it after a scoped `config.yaml`/app edit
yields a **different digest** than the one captured at authorization time.

> **ADR note:** `ADR-00XX-a7-executable-integrity` is a **placeholder — PENDING
> owner number assignment.** A7 (digest-bound descriptor + independent launcher +
> executable pinning) is a distinct architectural decision from ADR-0027 (A8's
> re-derived scheduler *unload*). The owner assigns the number (or decides to
> extend ADR-0027) before this spec goes Ready.

## Current state

**`src/cli/schedule.js`** registers per-job OS entries. `registerPlatform(paths,
manifest, {name, hour, minute}, loader, platform)` (~L158) renders the plist/
unit/xml via `src/scheduler/generators.js` and records a `scheduler-entry`
manifest entry per file (`ensureEntry`). `add(...)` (~L330) and
`repointSchedules(paths, manifest, opts)` (~L264, called from `sync.js`) are the
two register paths. Job definitions come from `src/scheduler/jobs.js`
(`{name, at, run, timeoutMinutes}`, `run` ∈ `builtin:dream` | `skill:<id>`).

**`src/scheduler/generators.js`** holds pure renderers and identity helpers:
`nodePath()` = `process.execPath`; `wienerdogBin(paths)` = `<core>/app/current/
bin/wienerdog.js` (the stable vendored bin, ADR-0013). The ProgramArguments/
ExecStart/Arguments today are `[node, bin, 'run-job', name]`.

**`src/core/vendor.js`**: `appDir(paths)` = `<core>/app`; `currentLink(paths)` =
`<core>/app/current`; `vendorSelf` copies the published tree into
`<core>/app/<version>/` (prod) or points `current` at the checkout root (dev),
recording a `vendored-tree` entry. `isDevCheckout(root, env)` returns true for a
`.git` dir or `WIENERDOG_DEV=1`.

**`src/core/exec-identity.js`** (WP-153, a dependency): `loadPins(paths)` returns
`{claude?, git?, codex?}` pins (`{realpath, version, sizeBytes, sha256, …}`) from
`<core>/state/exec-pins.json`.

**`src/core/dream/brain.js`** exposes `DREAM_PROMPT(scratch, vault, date, layout)`
(the builtin prompt template) and `loadVendoredSkill('wienerdog-dream')` (the
integrity-checked skill body used via `--append-system-prompt`); a routine's
skill body hash comes from the WP-131 hermetic composition.

**WP-144 / WP-145 (dependencies, separately Ready):** WP-144 makes uninstall
treat the manifest as untrusted (per-kind `validateEntry` schema, per-entry
error isolation, root-bounded deletes); a `file` entry needs only `{path}` and
resolves in-bounds under `<core>`. WP-145 re-derives the scheduler unload argv
from the schedule-file basename. **This WP writes the descriptor as a plain
`file` manifest entry under `<core>/state` — an existing, WP-144-valid kind — so
it introduces no new manifest kind and no `manifest.js` change.** The dependency
on WP-144/145 is because this WP edits `schedule.js` (the shared scheduler
register surface those WPs also govern) — see Implementation notes.

Nothing today builds a descriptor, hashes the app tree, or writes a per-job
authorization record.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/scheduler/descriptor.js | Build / canonicalize / digest / write / re-derive the job descriptor; hash the app-current tree. Pure + `fs`-only; lazy-requires `exec-identity`, `vendor`, `brain` (no static cycle). |
| modify | src/cli/schedule.js | In `registerPlatform` (thus `add` + `repointSchedules`): after the OS entry is ensured, `writeDescriptor` for the job (idempotent; record its `file` manifest entry). Do NOT change the entry's argv here (WP-156). |
| create | tests/unit/descriptor.test.js | Determinism + per-input digest-change + write/record + re-derive cases below. |
| modify | tests/unit/scheduler-schedule.test.js | Assert `add`/`repointSchedules` write a descriptor file (0600) and record it; a legit uninstall removes it. |

### Exact contracts

**Descriptor object** (canonical field order; all paths absolute):
```jsonc
{
  "schema": 1,
  "job": "dream",
  "run": "builtin:dream",                 // exact config `run` action string
  "profileId": "dream",                    // code-owned capability profile id
  "promptHash": "sha256:…",                // builtin: sha256(DREAM_PROMPT template) ⊕ vendored dream-skill body hash;
                                           //   skill: the WP-131 verified skill-body hash
  "timeoutMinutes": 20,
  "vaultRoot": "/Users/me/wienerdog",
  "node": "/opt/homebrew/opt/node/bin/node",   // process.execPath
  "exec": {                                 // from WP-153 pins (realpath+version+sha256)
    "claude": { "realpath": "…", "version": "…", "sha256": "…" },
    "git":    { "realpath": "…", "version": "…", "sha256": "…" }
  },
  "appRelease": {
    "version": "0.4.1",
    "treeDigest": "sha256:…",              // content address of app/current (below)
    "stance": "prod"                        // "prod" | "dev" (isDevCheckout of current's target)
  }
}
```

**`src/scheduler/descriptor.js` — pure/`fs`-only, zero deps, JSDoc types:**
```js
/** Content-address the vendored app tree: sha256 over the sorted list of
 *  `${relpath}\n${sha256(file bytes)}` for every regular file under the resolved
 *  target of <core>/app/current (symlinks/dirs excluded; relpath POSIX-normalized
 *  and sorted). Deterministic across machines for identical bytes.
 *  @param {import('../core/paths').WienerdogPaths} paths @returns {string} 'sha256:…' */
function appTreeDigest(paths) {}

/** Build the descriptor for a job from LIVE inputs (config run, pins, app tree,
 *  prompt/skill body). @param {import('../core/paths').WienerdogPaths} paths
 *  @param {{name, run, timeoutMinutes}} job
 *  @param {{env?, platform?, vaultRoot?:string}} [opts]  vaultRoot from readDreamConfig
 *  @returns {object} the descriptor (canonical field order). */
function buildDescriptor(paths, job, opts) {}

/** Stable serialization: recursively key-sorted JSON, no insignificant
 *  whitespace variance. @param {object} d @returns {string} */
function canonicalize(d) {}

/** @param {object} d @returns {string} 'sha256:' + sha256(canonicalize(d)). */
function descriptorDigest(d) {}

/** Absolute path of a job's descriptor file: <core>/state/descriptors/<name>.json.
 *  @returns {string} */
function descriptorPath(paths, name) {}

/** Build+write the descriptor 0600 (atomic temp+rename), record a {kind:'file'}
 *  manifest entry once. Idempotent: unchanged inputs ⇒ byte-identical file, no
 *  duplicate entry. @returns {{path:string, digest:string, changed:boolean}} */
function writeDescriptor(paths, job, opts) {}

/** Re-derive the digest from live inputs (buildDescriptor→descriptorDigest),
 *  WITHOUT reading the stored file — the drift-comparison primitive WP-156 uses.
 *  @returns {string} 'sha256:…' */
function deriveDescriptorDigest(paths, job, opts) {}

module.exports = { appTreeDigest, buildDescriptor, canonicalize, descriptorDigest,
  descriptorPath, writeDescriptor, deriveDescriptorDigest };
```

**`schedule.js` wiring.** In `registerPlatform`, after the platform entries are
ensured (and only when not a dry, unsupported-platform bail), call
`require('../scheduler/descriptor').writeDescriptor(paths, {name, run,
timeoutMinutes}, { platform })` for the job being registered. The `run` +
`timeoutMinutes` come from the job definition (`jobsLib.findJob`/the `add`
argv). `add` and `repointSchedules` both flow through `registerPlatform`, so both
write/refresh the descriptor. The descriptor file is saved with the manifest
(the existing `manifestLib.save` at the end of `add`/the sync flow). **Do not add
any argv/flag to the OS entry here** — the entry stays `[node, bin, run-job,
name]` until WP-156 rewrites it to invoke the launcher with the descriptor path +
digest.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only.
- **`descriptor.js` must not statically `require` `manifest.js`** or create an
  import cycle; lazy-`require` `exec-identity`/`vendor`/`brain` like the existing
  scheduler modules do. Record the manifest entry via `manifestLib.record` from
  `schedule.js` (which already holds the manifest), not from `descriptor.js`.
- **Determinism is the whole point.** `canonicalize` must sort keys and avoid
  locale/number/whitespace variance; `appTreeDigest` must sort relpaths with
  POSIX separators so the digest is machine-independent for identical bytes.
- **Dev stance:** when `current`'s target is a dev checkout (`isDevCheckout`),
  `appTreeDigest` over a live, edited checkout is not stable — record
  `stance:"dev"` and still compute the digest, but WP-156 will treat `dev`
  differently (integrity enforced only for `prod`). This WP only records the
  stance truthfully.
- **Why depend on WP-144/145:** this WP edits `schedule.js`, the shared scheduler
  register surface WP-145 also modifies (serialize), and the descriptor's
  persistence must respect WP-144's untrusted-manifest/root-bounded-delete model
  (the descriptor file is an in-bounds `<core>/state` `file` entry, valid under
  WP-144's `file` schema). It depends on **WP-153** for the exec pins embedded in
  `exec`.
- Idempotence: a second `sync`/`schedule add` with unchanged inputs rewrites the
  descriptor to byte-identical content (reuse the atomic temp+rename + equality
  short-circuit the codebase already uses for state files).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] The descriptor is **code-owned**: every field derives from live Wienerdog
      state (config `run`, pins, app tree, prompt/skill body), never from
      attacker-suppliable free-form input.
- [ ] Changing the job's `run` action, vault root, an exec pin, or the app tree
      bytes yields a **different** `descriptorDigest` (drift is detectable).
- [ ] The descriptor file is **0600** under `<core>/state/descriptors/`, recorded
      as an in-bounds `file` manifest entry (WP-144-valid; a legit uninstall
      removes it, the vault is preserved).
- [ ] `descriptor.js` introduces no new manifest kind and no static scheduler↔core
      import cycle.

## Acceptance criteria (mapped to the A7 acceptance bullets)

- [ ] **[A7 bullet 1/3 — precondition]** `deriveDescriptorDigest` is
      deterministic (same inputs ⇒ same digest) and changes when the config `run`
      action, the vault root, any embedded exec pin, or the app `treeDigest`
      changes — each proven by a unit test mutating exactly one input. (WP-156
      turns this into "config `run` rewrite ⇒ mismatch alert + zero model spawn"
      and "manifest+config rewrite cannot defeat the independent descriptor".)
- [ ] `appTreeDigest` over a fixture app dir is stable and changes on any file
      byte change or file add/remove within the tree.
- [ ] `schedule add dream` (and `repointSchedules` during `sync`) writes a
      `<core>/state/descriptors/dream.json` (mode 0600) and records its `file`
      manifest entry; a second run is a no-op (byte-identical, no duplicate entry).
- [ ] A legitimate uninstall (WP-144 reverser) removes the descriptor file and
      preserves the vault.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "descriptor|scheduler-schedule"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Binding the digest into the OS scheduler entry, the out-of-tree launcher, and
  fire-time enforcement — **WP-156** (depends on this WP; this WP changes no entry
  argv and enforces nothing at run time).
- Resolving/verifying/pinning executables — **WP-153** (this WP consumes its pins).
- Re-deriving the scheduler **unload** argv on uninstall — **WP-145** (A8, ADR-0027).
- Any change to `manifest.js` or a new manifest kind — the descriptor is a plain
  `file` entry by design.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/155-canonical-job-descriptor`; conventional commits; PR titled
   `feat(security): canonical digest-bound job descriptor at schedule/sync (WP-155)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
