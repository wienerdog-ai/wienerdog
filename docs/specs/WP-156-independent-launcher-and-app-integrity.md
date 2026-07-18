---
id: WP-156
title: Independent launcher outside the app tree — verify current containment, app digest, descriptor digest, and prod/dev stance before spawn
status: Draft
model: opus
size: M
depends_on: [WP-144, WP-145, WP-155]
adrs: [ADR-0004, ADR-0013, ADR-0027, ADR-00XX-a7-executable-integrity]
branch: wp/156-independent-launcher-and-app-integrity
---

# WP-156: Independent launcher + fire-time app/descriptor integrity (audit A7, part 4 of 6)

## Context (read this, nothing else)

Wienerdog's OS scheduler entries run `node <core>/app/current/bin/wienerdog.js
run-job <name>` — i.e. whatever Node code currently sits under the vendored
`app/current` tree. Audit findings **F2/F3**: any process that can write
`app/<version>/**` or repoint the `app/current` symlink replaces the code the
scheduler runs — **persistent nightly execution as the user**, needing only a
file write under `~/.wienerdog` and no scheduler-registration privilege. **IRON
RULE (ADR-0004): Wienerdog is just files** — the scheduled fire must run only the
authorized, unmodified app.

This WP completes A7's core: a **minimal launcher that lives OUTSIDE the mutable
app tree**. WP-155 produced the canonical, digest-bound job descriptor; this WP
(1) writes a small launcher to `<core>/launcher/launch.js` (not under
`app/current`), (2) rewrites every OS scheduler entry to invoke the launcher with
the descriptor path + its expected digest bound into the entry arguments, and (3)
makes the launcher **verify before it spawns Node or the model**:

- **current containment + ownership** — `app/current` resolves *inside* `<core>/
  app/`, is owned by the user, and is not a symlink pointing out of root;
- **app content address** — the live `app/current` tree hashes to the descriptor's
  `appRelease.treeDigest`;
- **descriptor digest** — the re-derived descriptor digest equals the
  `--expect-digest` value bound into the OS entry (catches a `config.yaml` `run`
  rewrite);
- **prod/dev stance** — a `prod` entry must resolve to a prod app tree and a `dev`
  entry to a dev checkout (an attacker cannot plant a `.git` to downgrade a prod
  install to unverified `dev`).

Any mismatch ⇒ a fixed durable alert and **zero model/Node-app spawn**. It also
hardens the vendored update: the version dir is made read-only after the atomic
publish, and an interrupted update leaves the previous valid `current` intact.

**Honest boundary (state this; do not overclaim).** Same-user control of BOTH
the core and the OS scheduler can still replace both anchors: an actor who can
rewrite the OS entry file (`~/Library/LaunchAgents/…`, a systemd unit) AND the
launcher/app can defeat this. A7 protects **scoped core writes** (a limited
primitive that writes `app/current`/`config.yaml` but does not re-register the OS
entry) and **detects drift** (the entry's bound digest, a different file from the
app tree, still names the authorized state). It is **NOT** a claim against
arbitrary same-user native malware — that is A12's territory. The launcher being
outside `app/current` is what lets a scoped write to the app tree be *caught*
rather than silently executed.

> **ADR note:** `ADR-00XX-a7-executable-integrity` is a **placeholder — PENDING
> owner number assignment.** The owner assigns the number (or extends ADR-0027)
> before this spec goes Ready.

## Current state

**`src/scheduler/generators.js`** renders the OS entries. The command/args are
`[node, bin, 'run-job', name]` where `node = nodePath()` (`process.execPath`) and
`bin = wienerdogBin(paths)` (`<core>/app/current/bin/wienerdog.js`):
- launchd `launchdPlist(o)` — `ProgramArguments` array (~L110-116);
- systemd `systemdService(o)` — `ExecStart=…node… …bin… run-job <name>` (~L218);
- Windows `windowsDreamTaskXml(o)` — `<Arguments>"…bin…" run-job <name></Arguments>`
  (~L336). `windowsCatchupTaskXml` / `catchupPlist` invoke `run-job --catch-up`.

**`src/cli/schedule.js`** `registerPlatform(...)` builds `node`/`bin` and passes
them into the renderers (~L159-246). WP-155 added a `writeDescriptor(...)` call
here and left the entry argv unchanged.

**`src/core/vendor.js`**: `vendorSelf(paths, opts)` (~L121) copies the published
tree into `<core>/app/<version>/` via a `.staging.<pid>` dir + atomic rename, then
`repointCurrent(paths, target)` (~L68) swaps the `current` symlink atomically
(POSIX rename; Windows junction fallback). `isDevCheckout(root, env)` (~L27),
`appDir`/`currentLink`/`currentBin` (~L17-23). The version dir is currently left
writable; `current` containment/ownership is not checked.

**`src/scheduler/descriptor.js`** (WP-155, a dependency): `descriptorPath`,
`writeDescriptor`, `deriveDescriptorDigest`, `appTreeDigest`, `buildDescriptor`,
plus the descriptor's `appRelease.{treeDigest, stance}`.

**`src/core/alerts.js`** `appendAlert(paths, {job, at, reason, log_hint})` — the
durable fail-loud sink re-rendered into the digest until the job next succeeds.

**WP-145** (dependency) re-derives the scheduler **unload** argv from the schedule
FILE basename — unaffected by changing the entry's *ProgramArguments* (the
filename does not change), so unload still works after this WP.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/scheduler/launcher.js | The out-of-tree launcher: `verifyAndResolve(...)` (pure, testable) + `main(argv)` (verify → exec run-job, or alert+exit non-zero with zero app spawn). |
| modify | src/core/vendor.js | `writeLauncher(paths, {manifest})` places `<core>/launcher/launch.js` (idempotent, records a `file` entry); called from `vendorSelf`. Make the published `app/<version>/` read-only after the atomic rename. Add `verifyCurrentContainment(paths)` (resolves inside `<core>/app`, user-owned). |
| modify | src/scheduler/generators.js | Entry command/args become `[node, launcherPath, name, --descriptor, descPath, --expect-digest, digest]` for per-job entries; catch-up entries invoke the launcher with `--catch-up` (no per-job descriptor). New render params, fully escaped as today. |
| modify | src/cli/schedule.js | Compute `descPath` + `descriptorDigest` (via `descriptor.js`) and the `launcherPath`, and pass them into the renderers in `registerPlatform`. |
| create | tests/unit/launcher.test.js | `verifyAndResolve` pass + every mismatch (out-of-root current, app byte mutation, repoint, wrong descriptor digest, prod/dev mismatch) ⇒ refuse + zero spawn. |
| modify | tests/unit/vendor.test.js | Assert the launcher is placed outside `app/`, the version dir is read-only, interrupted publish keeps old `current`, `verifyCurrentContainment` rejects an out-of-root symlink. |
| modify | tests/unit/scheduler-generators.test.js | Assert entries invoke the launcher with the descriptor path + expect-digest; catch-up entries use `--catch-up`. |

### Exact contracts

**Launcher location.** `<core>/launcher/launch.js`, a small self-contained Node
file placed by `writeLauncher` at vendor time (like the PATH shim). It is a
**secondary anchor**: distinct from `app/current`, so a scoped write to the app
tree cannot disable it. (A write that reaches *both* the launcher and the OS entry
is outside the boundary — see the boundary paragraph.) Recorded as a `file`
manifest entry (WP-144-valid, in-bounds under `<core>`).

**`src/scheduler/launcher.js`:**
```js
/** Pure verifier. Reads live state; performs NO spawn.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {string} name  job name (or '--catch-up' sentinel handled by main)
 *  @param {{descriptorPath:string, expectDigest:string, env?:NodeJS.ProcessEnv,
 *           platform?:NodeJS.Platform}} o
 *  @returns {{ok:true, command:string, args:string[]}
 *          | {ok:false, reason:string}}
 *   On ok, command = process.execPath (node), args = [currentBin, 'run-job', name].
 *   Refuses (ok:false, fixed reason) when ANY of:
 *   - verifyCurrentContainment(paths) fails (current not inside <core>/app, not
 *     user-owned, or resolves out of root);
 *   - appTreeDigest(paths) !== descriptor.appRelease.treeDigest;
 *   - the descriptor's stance does not match the live stance (prod entry over a
 *     dev-looking tree, or vice versa);
 *   - deriveDescriptorDigest(paths, job, …) !== o.expectDigest (config `run`/pin/
 *     app drift, and the entry-bound digest is the independent anchor). */
function verifyAndResolve(paths, name, o) {}

/** CLI entry the OS scheduler invokes:
 *    node <core>/launcher/launch.js <name|--catch-up> --descriptor <p> --expect-digest <d>
 *  - ok  ⇒ spawn node currentBin run-job <name|--catch-up> (inherit stdio; exit
 *          with the child's code). This is the ONLY place a model/app spawn happens.
 *  - refuse ⇒ appendAlert(paths, {job:name, reason:'wienerdog: refusing to run
 *          "<name>" — <reason> (integrity mismatch); no job was run. Run
 *          `wienerdog doctor`.'}), write the reason to stderr, exit NON-ZERO,
 *          and spawn NOTHING.
 *  @param {string[]} argv @returns {Promise<void>} */
async function main(argv) {}

module.exports = { verifyAndResolve, main };
```
The `--catch-up` invocation has no per-job descriptor: `main` verifies only
current containment + app treeDigest against a **catch-up descriptor** (a
descriptor with `job:"--catch-up"`, `run:"builtin:catch-up"`, no vault/exec/
prompt fields — or, simpler, verify containment + a standalone `appTreeDigest`
bound as `--expect-digest`; implementer's choice, recorded under "Decisions
made"). Either way a mutated app tree ⇒ refuse + zero spawn for catch-up too.

**`src/core/vendor.js` additions:**
```js
/** Verify <core>/app/current resolves INSIDE <core>/app (realpath-canonical, no
 *  out-of-root symlink) and is owned by the current user (POSIX; win32 reduced).
 *  @returns {{ok:true, target:string}|{ok:false, why:string}} */
function verifyCurrentContainment(paths) {}

/** Place <core>/launcher/launch.js from the packaged src/scheduler/launcher.js
 *  (bundle-free: write a tiny bootstrap that requires the vendored module by
 *  absolute path is FORBIDDEN — that would re-enter the app tree; instead copy the
 *  self-contained launcher source out-of-tree). Idempotent (skip if byte-identical);
 *  record a {kind:'file'} manifest entry once; mode 0755 (POSIX).
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {{manifest?:object}} [opts] @returns {{path:string, changed:boolean}} */
function writeLauncher(paths, opts) {}
```
- `vendorSelf` calls `writeLauncher(paths, { manifest })` after `repointCurrent`.
- After the `fs.renameSync(staging, target)` atomic publish (prod only), make the
  version dir read-only: `chmod -R a-w` equivalent (recursive, best-effort;
  re-vendoring the same version is already skipped, so this does not fight
  idempotence). Dev checkout: never chmod the checkout. Record the choice.
- **Interrupted update:** the existing staging→rename already guarantees an
  interrupted copy leaves `current` pointing at the prior valid version; this WP
  adds a test asserting it and must not weaken it.

**`generators.js` + `schedule.js` binding.** `registerPlatform` computes:
`launcherPath = path.join(paths.core, 'launcher', 'launch.js')`,
`descPath = descriptor.descriptorPath(paths, name)`,
`digest = descriptor.deriveDescriptorDigest(paths, job, {platform})`, and passes
them to the renderers. The renderers emit, per platform, argv equivalent to:
`[nodePath(), launcherPath, name, '--descriptor', descPath, '--expect-digest', digest]`
(escaped exactly as the current path interpolation is: `xmlEscape`/`systemdQuote`/
`windowsXmlEscape`, absolute paths only — launchd/systemd do not expand `~`).
Catch-up entries: `[node, launcherPath, '--catch-up', '--descriptor',
<catchupDescPath>, '--expect-digest', <digest>]`.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only.
- **The launcher must be self-contained and out-of-tree.** It may `require` core
  modules only from a location that is NOT `app/current` — the simplest correct
  design is a single-file launcher that inlines (or lazy-requires from the
  vendored tree *only after* verifying its integrity) the small amount it needs:
  `getPaths`, `appTreeDigest`, `deriveDescriptorDigest`, `verifyCurrentContainment`,
  `appendAlert`. Requiring those from `app/current` **before** verification would
  defeat the purpose — resolve this explicitly and record the approach under
  "Decisions made" (e.g. vendor a minimal verification bundle next to
  `launch.js`, or inline the digest/containment helpers into `launch.js`). This is
  the single hardest design call; flag any residual to the reviewer, do not paper
  over it.
- **prod/dev stance is security-relevant:** a prod entry that resolves to a
  dev-looking tree (planted `.git`) must **refuse**, not silently downgrade to the
  unverified dev path. In dev, integrity of a live checkout is not enforceable —
  the stance match is the guard, not a treeDigest over an edited checkout.
- **Depends on WP-155** for the descriptor API/files and **WP-144/145** because it
  edits `generators.js` (serialize after WP-145) and `schedule.js` (serialize
  after WP-155), and the launcher file + read-only version dir must remain
  consistent with WP-144's untrusted-manifest/root-bounded-delete uninstall (the
  launcher `file` entry is in-bounds; the read-only version dir must still be
  removable by uninstall — restore write mode before delete if needed; note it).
- **WP-145 unload unaffected:** the entry ProgramArguments change does not alter
  the plist/unit/xml **filename**, so `deriveUnloadArgv` (WP-145) still derives the
  correct unregister command. Add a test note asserting this.
- Idempotence: re-`sync` with unchanged app + config rewrites entries only when the
  bound digest/argv actually changed (the existing `ensureEntry` content-equality
  short-circuit handles the reload); `writeLauncher` skips a byte-identical launcher.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] The launcher lives **outside** `app/current`; a write to the app tree cannot
      disable the verification.
- [ ] Before any Node-app/model spawn the launcher verifies: current containment +
      user ownership, app `treeDigest` == descriptor, re-derived descriptor digest
      == the entry-bound `--expect-digest`, and prod/dev stance match. Any failure
      ⇒ fixed durable alert + **zero** spawn + non-zero exit.
- [ ] The entry-bound `--expect-digest` is the independent anchor: a
      `config.yaml`/manifest rewrite that does not also change the OS entry cannot
      make a drifted state verify.
- [ ] The published version dir is read-only after publish; an interrupted update
      retains the previous valid `current`; a legit uninstall can still remove both.
- [ ] `deriveUnloadArgv` (WP-145) still derives correctly — the entry filename is
      unchanged.

## Acceptance criteria (mapped to the A7 acceptance bullets)

- [ ] **[A7 bullet 1 — "Config `run` rewrite produces mismatch alert and zero
      model spawn."]** Rewriting the job's `run` action in `config.yaml` makes the
      re-derived descriptor digest ≠ the entry-bound digest ⇒ `verifyAndResolve`
      refuses; `main` appends a fixed alert and spawns nothing.
- [ ] **[A7 bullet 2 — "App byte mutation, `current` repoint, or out-of-root
      symlink produces zero model/network spawn."]** Mutating a file under
      `app/current`, repointing `current` to another dir, or making `current` a
      symlink resolving outside `<core>/app` each makes `verifyAndResolve` refuse ⇒
      zero spawn.
- [ ] **[A7 bullet 3 — "Manifest+config rewrite cannot defeat an unchanged
      independent descriptor."]** With the OS entry's `--expect-digest` unchanged,
      rewriting `config.yaml` and the manifest does not make a drifted state verify.
- [ ] **[A7 bullet 6 — app-update half]** A valid re-vendor switches `current`
      atomically and re-binds the entry digest; an interrupted publish (staging
      removed before rename) leaves the previous valid `current` and its entry
      intact (still verifies + runs).
- [ ] Entries invoke `<core>/launcher/launch.js` (outside `app/`) with the
      descriptor path + expect-digest; catch-up entries verify the app tree too.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "launcher|vendor|scheduler-generators"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Building/writing the descriptor and hashing the app tree — **WP-155** (this WP
  consumes `descriptor.js`).
- Executable pinning — **WP-153**; the launcher verifies the *app*, the pins guard
  the *external* executables.
- The end-to-end negative harness that drives real scheduled runs — **WP-157**.
- Content-addressed **renaming** of the version dir (`app/<hash>/`): out of scope;
  this WP content-addresses the *verification* (treeDigest), not the dir name
  (keeps ADR-0013's version-dir layout). Flag it to the ADR if the owner wants the
  stronger form.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/156-independent-launcher-and-app-integrity`; conventional commits; PR
   titled `feat(security): out-of-tree launcher verifies app + descriptor integrity before spawn (WP-156)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
