---
id: WP-157
title: Independent launcher outside the app tree — verify current containment, app digest, descriptor digest, and prod/dev stance before spawn
status: In-Review
model: opus
size: M
depends_on: [WP-144, WP-145, WP-156]
adrs: [ADR-0004, ADR-0013, ADR-0027, ADR-0028]
branch: wp/157-independent-launcher-and-app-integrity
---

# WP-157: Independent launcher + fire-time app/descriptor integrity (audit A7, part 4 of 6)

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
app tree**. WP-156 produced the canonical, digest-bound job descriptor; this WP
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

> **RESOLVED (OWNER-APPROVED 2026-07-18, A7 walkthrough) — fail-closed sync
> authorization (this is where it is enforced).** Runtime edits to `config.yaml`
> (or the app tree) do **not** change what the scheduled job runs until an explicit
> `wienerdog sync` re-binds the descriptor digest into the OS entry. At fire time,
> **any** descriptor-digest mismatch ⇒ a durable alert + **zero model/Node-app
> spawn**. To be unambiguous: there is **no soft fallback** to the stored
> descriptor and **no "run anyway"** path — the launcher refuses and exits
> non-zero. The single remedy is `wienerdog sync`. Accepted UX cost, stated
> plainly: a legitimate hand-edit of `config.yaml` **without** a follow-up `sync`
> makes the next scheduled dream refuse with a clear mismatch alert — one skipped
> night, not silent degradation.

**Honest boundary (state this; do not overclaim).**
> **RESOLVED (OWNER-APPROVED 2026-07-18, A7 walkthrough) — corrected boundary: the
> launcher is itself a core file.** The earlier draft claimed an attacker needs to
> rewrite "the OS entry file AND the launcher/app" to defeat this — that was
> **wrong**. The entry-bound `--expect-digest` is interpreted BY the launcher, and
> the launcher lives at `<core>/launcher/launch.js` — the SAME write surface as the
> app tree it guards. So **rewriting the launcher ALONE defeats this layer**: a
> replaced launcher simply ignores the bound digest and spawns anything, **no
> OS-entry write required**.

The precise, honest claim: a **core-wide write primitive** — anything that can
overwrite `<core>/launcher/launch.js` (arbitrary same-user write anywhere under
`<core>`) — defeats this layer **alone**, and that class of adversary is **A12's
territory**, not A7's. What A7 protects is the **strictly narrower** class of
**scoped writes that reach `config.yaml`, the app tree, and/or the install
manifest but NOT the launcher file** — e.g. an agent session with vault/config
write access, a subverted routine, or a config-only primitive. Against that class
the guarantee is precise and holds: because the launcher (a *different* file from
both the app tree and `config.yaml`) re-derives and checks the descriptor digest
against the value bound into the OS entry, a **`config.yaml` + manifest rewrite
alone can never make a drifted state verify** — the launcher catches the drift and
refuses. The launcher living outside `app/current` is exactly what lets a scoped
write *to the app tree* be *caught* rather than silently executed; it does **not**
defend the launcher file against a write that reaches the launcher itself.

> **Documented strengthening path ("2b") — owner-considered, DEFERRED to A12, NOT
> implemented in this WP.** The residual above (a core-wide write to the launcher
> file defeats this layer without touching the OS entry) has a known, deliberately
> deferred hardening: move the trust anchor off the on-disk launcher file and into
> the OS entry the scheduler already treats as authoritative. Inline a ~10-line
> bootstrap into the OS entry argv itself (`node -e '<bootstrap>'`) that:
> reads `<core>/launcher/launch.js` **once** into memory, computes `sha256` over
> that buffer, compares it to a **launcher-digest embedded in the entry**, and on
> match executes the launcher **from that same in-memory buffer** (no second disk
> read — **TOCTOU-free**); on mismatch it writes to stderr and exits non-zero with
> **zero spawn**. This raises the bar so overwriting `launch.js` alone no longer
> suffices — an attacker would ALSO have to rewrite the OS entry (which, unlike the
> old wrong sentence, this design would then legitimately require).
> **Costs, recorded so the deferral is honest:**
> - every launcher change requires an OS-entry rewrite + scheduler reload (entry
>   churn on each `sync` that touches the launcher);
> - the refuse path **cannot** append the durable alert (the alert code lives in
>   the unverified launcher/app files it is refusing to trust) — stderr + non-zero
>   exit only, no `appendAlert`;
> - the run-from-buffer pattern (executing a module from an in-memory buffer
>   without re-reading disk) needs careful review;
> - the inline code must be escaped per-platform (launchd plist array vs systemd
>   `ExecStart` vs Windows XML `<Arguments>`) — small but real.
>
> This path is to be **carried into ADR-0028** (written at the A7 walkthrough's
> conclusion) as the documented next increment; its **revisit trigger is A12** (the
> audit item that owns arbitrary same-user native-malware defenses). It is **not**
> built now.

<!-- -->

> **ADR note:** `ADR-0028` records the A7 architectural decision — a **new ADR**
> (owner-assigned 2026-07-18), distinct from ADR-0027 (A8's re-derived scheduler
> *unload*). The ADR-0028 file is written as the A7 spec walkthrough concludes;
> until then this spec set is the design-of-record.

## Current state

**`src/scheduler/generators.js`** renders the OS entries. The command/args are
`[node, bin, 'run-job', name]` where `node = nodePath()` (`process.execPath`) and
`bin = wienerdogBin(paths)` (`<core>/app/current/bin/wienerdog.js`):
- launchd `launchdPlist(o)` — `ProgramArguments` array (~L110-116);
- systemd `systemdService(o)` — `ExecStart=…node… …bin… run-job <name>` (~L218);
- Windows `windowsDreamTaskXml(o)` — `<Arguments>"…bin…" run-job <name></Arguments>`
  (~L336). `windowsCatchupTaskXml` / `catchupPlist` invoke `run-job --catch-up`.

**`src/cli/schedule.js`** `registerPlatform(...)` builds `node`/`bin` and passes
them into the renderers (~L159-246). WP-156 added a `writeDescriptor(...)` call
here and left the entry argv unchanged.

**`src/core/vendor.js`**: `vendorSelf(paths, opts)` (~L121) copies the published
tree into `<core>/app/<version>/` via a `.staging.<pid>` dir + atomic rename, then
`repointCurrent(paths, target)` (~L68) swaps the `current` symlink atomically
(POSIX rename; Windows junction fallback). `isDevCheckout(root, env)` (~L27),
`appDir`/`currentLink`/`currentBin` (~L17-23). The version dir is currently left
writable; `current` containment/ownership is not checked.

**`src/scheduler/descriptor.js`** (WP-156, a dependency): `descriptorPath`,
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
| modify | src/cli/run-job.js | Fix-pass (2026-07-19, [R3:#4]): scheduled-env allowlist — drop `CLAUDE_CONFIG_DIR`/`CODEX_HOME`/`ANTHROPIC_API_KEY` from `ENV_PASSTHROUGH`; reconstruct the config roots deterministically in `buildCleanEnv`; ensure Windows `APPDATA`/`LOCALAPPDATA` cannot override the bound config root (A10). (Catch-up per-job verification moved to **WP-160**.) |
| modify | tests/unit/scheduler-schedule.test.js | Fix-pass: entry-argv + digest-binding change (boundary reconciliation, A9). |
| modify | tests/unit/sync-repoint.test.js | Fix-pass: entry-argv reconciliation on repoint (boundary, A9). |

### Exact contracts

**Launcher location.** `<core>/launcher/launch.js`, a small self-contained Node
file placed by `writeLauncher` at vendor time (like the PATH shim). It is a
**secondary anchor**: distinct from `app/current`, so a scoped write to the app
tree cannot disable it. (A write that can overwrite the launcher file itself — a
core-wide write primitive — is outside this layer's boundary; the launcher is a
core file and does not defend itself. See the boundary paragraph.) Recorded as a
`file` manifest entry (WP-144-valid, in-bounds under `<core>`).

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
 *   - deriveDescriptorDigest(paths, job, …) !== o.expectDigest (config `run`/
 *     `model`/`timeout`/pin/app drift, and the entry-bound digest is the
 *     independent anchor). */
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
- **Depends on WP-156** for the descriptor API/files and **WP-144/145** because it
  edits `generators.js` (serialize after WP-145) and `schedule.js` (serialize
  after WP-156), and the launcher file + read-only version dir must remain
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

- Building/writing the descriptor and hashing the app tree — **WP-156** (this WP
  consumes `descriptor.js`).
- Executable pinning — **WP-154**; the launcher verifies the *app*, the pins guard
  the *external* executables.
- The end-to-end negative harness that drives real scheduled runs — **WP-158**.
- Content-addressed **renaming** of the version dir (`app/<hash>/`): out of scope;
  this WP content-addresses the *verification* (treeDigest), not the dir name
  (keeps ADR-0013's version-dir layout). **RESOLVED (OWNER-APPROVED 2026-07-18, A7
  walkthrough) — REJECTED:** version-named dirs stay. Content-addressing already
  lives in the fire-time check (treeDigest vs descriptor — the dir NAME decides
  nothing at verify time); renaming to `app/<hash>/` would churn uninstall/manifest
  paths and destroy at-a-glance debuggability ("which version am I running") for no
  meaningful attacker cost.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/157-independent-launcher-and-app-integrity`; conventional commits; PR
   titled `feat(security): out-of-tree launcher verifies app + descriptor integrity before spawn (WP-157)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.

## Fix-pass amendments (2026-07-19)

Adversarial review found 1 critical + several high defects — the launcher is
bypassable. Full implementer contract + tests: `FIX-PLAN.md` cluster **C3**.

### A1 — neutralize code-loading env for the scheduled node [Codex CRITICAL]

The OS entries run `node <launcher> …` with no env scrubbing, and the launcher
forwards `process.env` unchanged to its child spawn (launcher.js:334). An
inherited `NODE_OPTIONS=--require <evil>` runs attacker code **in the launcher's
own node process, before `launch.js`** — bypassing every check. Env writes
(`~/.config/environment.d/*.conf`, `launchctl setenv`) are in-scope for A7.
**Corrected contract:** neutralize `NODE_OPTIONS` and `NODE_PATH` at BOTH layers:
- **OS entry (primary):** launchd — `EnvironmentVariables` dict with
  `NODE_OPTIONS`→`""`, `NODE_PATH`→`""` (in `launchdPlist` + `catchupPlist`);
  systemd — `Environment=NODE_OPTIONS=` and `Environment=NODE_PATH=` under
  `[Service]`; **Windows — [R2:F8] do NOT use inline `cmd /c` with XML escaping**
  (XML escaping does not stop cmd `%VAR%` expansion / AutoRun). Use a non-shell or
  fully-controlled bootstrap with a proven encoder: a generated wrapper *file*
  (recorded `file` entry, regular non-symlink, `.cmd` with batch `%%` rules or
  `.ps1` via `powershell -NoProfile -ExecutionPolicy Bypass -File`), or — only if
  inline is unavoidable — absolute `System32\cmd.exe /d /s /v:off /c` with a
  dedicated cmd-token encoder (`% ! ^ & | < > ( ) "` + trailing backslashes) and
  execution tests over hostile-but-valid paths/env. Record the choice.
- **Launcher child spawn (defense-in-depth):** `main` spawns with a scrubbed copy
  of the env (`delete childEnv.NODE_OPTIONS; delete childEnv.NODE_PATH`).

Add to the Security checklist: "no code-loading Node env var reaches the launcher
process or its child." Tests: generators emit the clearing per platform; `main`
spawns without those vars even when `process.env` has them.

### A2 — schema-aware argv parse [Codex HIGH, verified]

`parseArgv` treats every `--x` as value-taking, so the generator-emitted
`--catch-up --expect-digest <d>` makes `--catch-up` swallow `--expect-digest`
(→ `undefined`), refusing every prod catch-up. **Corrected contract:**
`--catch-up` is boolean; `--descriptor`/`--expect-digest` are value-taking; an
unknown `--flag` refuses (fail closed). Test: `parseArgv(['--catch-up',
'--expect-digest','D'])` → `{'catch-up':true,'expect-digest':'D'}`.

### A3 — dev branches must not fail open [Codex HIGH]

`isDev` trusts `WIENERDOG_DEV=1` from the inherited env; the dev-stance path
(L210-215) and catch-up path (L268) return `ok:true` before any digest check.
**Corrected contract:**
1. Fire-time dev authority is the descriptor's **digest-bound** `appRelease.stance`
   + the on-disk `.git` liveness check; **remove `env.WIENERDOG_DEV` as a
   fire-time trigger** (bind stance at registration, not at fire).
2. Catch-up performs no dev early-return before containment (+ per-job
   verification, A5). A `prod` entry over a `.git` tree still refuses.

**[R2:F10] The dev path needs a separate descriptor — "skip tree digest but
compare the full descriptor digest" is self-contradictory.** Three confirmed
defects: (a) `deriveDescriptorDigest` INCLUDES `appRelease.treeDigest`, so any
checkout edit changes the full digest ⇒ refuse (dev unusable); (b) dev vendoring
points `app/current` OUTSIDE `<core>/app`, so `verifyCurrentContainment` rejects
it; (c) `.git` is a **file** in git worktrees (our worktree + Gyula's dev
machine), so a dir-only check makes dev permanently non-runnable.
**Corrected fire-time dev path:**
- Compare the **config-fields-only dev digest** (WP-156 A5:
  `appRelease`→`{stance:'dev', root}`, excluding `treeDigest`/`version`) against
  the dev `--expect-digest`. A tracked-source edit does not drift it; a
  `config.yaml` `run`/`model`/`vault_layout`/… edit does ⇒ refuse.
- **Dev containment:** verify the live `app/current` realpath **equals the bound
  checkout `root`** (from the descriptor), not that it resolves inside
  `<core>/app`. Catches a repoint while legitimizing the out-of-`<core>/app` dev
  target.
- **Dev liveness accepts a `.git` directory OR a worktree gitfile** (regular
  file).
Tests (add a **git-worktree** case): (i) dev worktree (`.git` is a file), edit a
tracked file ⇒ still **runs**; (ii) dev + `config.yaml` `run` rewrite ⇒ refuse;
(iii) dev `app/current` repointed off the bound root ⇒ refuse; (iv)
`WIENERDOG_DEV=1` in env + prod descriptor ⇒ does not flip to dev; (v) prod +
planted `.git` ⇒ refuse.

### A4 — every verification exception → alert, never a bare throw [Codex MED]

`appTreeDigestOf` (and the lazy `require`s) run outside try/catch, so an
unreadable/renamed entry throws past the sole `appendRefuseAlert` site →
non-zero exit with **no durable alert** (tamper looks like a missed job).
**Corrected contract:** wrap the whole verdict computation; any exception ⇒
`{ok:false, reason:'integrity check errored: …'}`; `main` converts every non-ok
verdict (incl. thrown) to alert + stderr + non-zero exit + **zero spawn**. No
path exits without spawning (ok) or alerting (refuse). Test: an unreadable file
under `app/current` ⇒ refuse with an appended `alerts.jsonl` record + zero spawn.

### A5 — catch-up must enforce per-job descriptors [Codex HIGH via WP-159]

Catch-up verifies only the app-tree digest; `run-job --catch-up` then reads jobs
from **mutable** `config.yaml` and calls `runJob` directly, so a config change a
normal fire *refused* is *executed* by the next catch-up. **Corrected contract:**
catch-up must not run a job whose live descriptor digest ≠ its authorized digest.

**[R2:F12] The anchor is the LOADED/registered catch-up entry, NEVER an editable
per-job source file.** The first draft read each per-job entry **file**
(plist/unit/retained XML) — a user-writable SOURCE artifact, not the loaded
registration. An attacker edits `config.yaml` + the per-job source file to carry
the newly-derived digest **without reloading** (reloading = re-registering =
outside A7 scope); normal fires stay bound to the old *loaded* registration and
refuse, but catch-up reads the forged FILE and runs. **Corrected:** at
**registration** (registration privilege) bind a **canonical per-job digest map**
into the **catch-up OS entry's own arguments** (the args launchd/systemd fire from
and schtasks stores in the task DB — loaded state, not re-read from the editable
file). **[R3:#2] SPLIT — materialized as `docs/specs/WP-160-catchup-per-job-
authorization.md`** (Draft, `depends_on:[WP-156, WP-157]`), with the full
contract (per-job digest map bound into the catch-up registration argv,
`run-job --catch-up` comparison, macOS/Windows negatives). **WP-157 lands as an
explicitly-incomplete intermediate for the catch-up path**: it ships the normal
per-job fire enforcement but NOT catch-up authorization. Machine-visible: WP-158
and WP-159 now `depends_on: WP-160`, so the harness/docs cannot ship claiming
catch-up is covered before WP-160 lands. ADR-0028 states catch-up authorization
is **PENDING until WP-160**. (See WP-160 for the anchor rule + tests.)

### A6 — `ensureCatchup` signature [Codex MED]

`generators.ensureCatchup` passes a removed `bin` field and no
`launcher`/`expectDigest` → `catchupPlist` renders `"undefined"` argv. Pass
`{node, launcher, expectDigest, logDir}`. Test: backstop plist args contain the
launcher + a real digest, never `"undefined"`.

### A7 — hash-then-reopen / verify-to-use TOCTOU: documented A12 residual [Codex HIGH]

The launcher hashes the tree then reopens the same mutable `target` to `require`
verifier modules (L235-237) and spawn `bin/wienerdog.js` (L249/L334). Spawning
`node` against an on-disk tree is intrinsically reopen-based; TOCTOU-freedom
needs the deferred **"2b" in-memory-bootstrap** (already recorded, revisit
trigger A12). The in-scope A7 model is "static write, caught at fire" (a static
write **is** caught at hash time); winning a sub-fire-time race needs an active
concurrent writer at 03:30 = A12. **Action:** keep `makeTreeFilesReadOnly`,
minimize the hash→exec window, and **add the verify-to-use race to this WP's
Honest boundary, ADR-0028 residuals, and WP-159 THREAT-MODEL** — do **not** claim
TOCTOU-freedom. No full A7 code fix; a cheap sound tightening is welcome but not
required.

### A8 — `makeTreeFilesReadOnly` is files-only (by design) [wd P3]

The helper clears write bits on files, not dirs. **Amended contract:** the
version dir is made **files-read-only** (not `chmod -R a-w`) — dir read-only
would fight uninstall/re-vendor and is defeated by a same-user `chmod`; the
**app-tree digest is the real guard**, read-only files are best-effort friction.
Spec wording now matches the impl; no code change.

### A9 — boundary + refuse text [wd P2 / Codex P2]

- Deliverables add `tests/unit/scheduler-schedule.test.js` +
  `tests/unit/sync-repoint.test.js` (the entry-argv/digest-binding change
  legitimately touches both) and `src/cli/run-job.js` (A5, unless split to
  WP-160). All added to the table above.
- Refuse text points to `wienerdog doctor`, which reads no A7 state
  (`alerts.jsonl`/pins/descriptor). Change the message to point at the real
  surface — the alert appears in the **next digest banner**; remedy is
  `wienerdog sync`. Do **not** wire `doctor` here (see WP-159 amendment; a
  follow-up WP-162 may add a doctor A7 reader).

### A10 — the scheduled execution environment is a defined allowlist [Codex HIGH, R3:#4]

Ambient credential/config env is an uncovered spawn-shaper. `ENV_PASSTHROUGH`
(run-job.js:33) copies `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and `ANTHROPIC_API_KEY`
into the clean job env, and (win32) `APPDATA`/`LOCALAPPDATA` are passed through.
An `environment.d` / `launchctl setenv` write (an in-scope A7 write) changes the
**model account, credential root, or config root** with **no digest drift** —
this is the authentication trust boundary, and the "everything shaping the spawn
is authorized" invariant is still false. F8's child scrub removes only Node vars.
**Corrected contract — define the COMPLETE allowed scheduled environment (do not
inherit ambient credential/config overrides):**
- **Config roots reconstructed deterministically.** Remove `CLAUDE_CONFIG_DIR`
  and `CODEX_HOME` from `ENV_PASSTHROUGH`; `buildCleanEnv` sets them explicitly to
  the **canonical wienerdog-owned paths** (code-derived, like it already does for
  `HOME`/`USERPROFILE`). Because they are code-derived constants (not read from
  attacker env), they need no digest field. **If a custom config root must be
  honored, bind its SOURCE/path in the descriptor at sync** (never the secret
  value) so a later ambient override drifts the digest.
- **No inherited API key on the scheduled path.** Remove `ANTHROPIC_API_KEY` from
  `ENV_PASSTHROUGH`; the scheduled dream is subscription-authed (ADR-0009) and
  must not depend on an inherited API key. (If a key path is ever genuinely
  required, bind its approved source in the descriptor — not the value.)
- **Windows.** Keep `APPDATA`/`LOCALAPPDATA` (needed for PATH/tooling) but ensure
  they **cannot override the bound config root** (the config root is set
  explicitly, so `APPDATA` never determines it).
- **Clear at the OS-entry boundary too** (same layer as the A1 NODE_OPTIONS
  scrub) and in the launcher child-env scrub, so an inherited
  `CLAUDE_CONFIG_DIR`/`CODEX_HOME`/`ANTHROPIC_API_KEY` never even reaches the
  launcher's node.
Add `src/cli/run-job.js` to Deliverables (done). **Tests:** an `environment.d` /
`launchctl` change to `CLAUDE_CONFIG_DIR`/`CODEX_HOME`/`ANTHROPIC_API_KEY` (+
Windows `APPDATA`) does **not** alter the authorized execution context (the child
sees the canonical wienerdog config roots; no ambient key). **Size note:** if
this exceeds WP-157's budget, split to a materialized `WP-163-scheduled-env-
allowlist` (depending on WP-157; WP-158/WP-159 then also depend on it) — do not
ship it as prose-only (the WP-160 lesson). The deterministic-reconstruction
approach is compact and expected to fit WP-157.
