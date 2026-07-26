---
id: WP-launcher-no-self-resync-republish
title: Stop a self-resync from re-publishing the out-of-tree launcher out of the app tree
status: Draft
model: sonnet
size: S
depends_on: [WP-stance-authority-containment]
adrs: [ADR-0004, ADR-0013, ADR-0028, ADR-0031]
epic: audit-a7
---

# WP-launcher-no-self-resync-republish: a self-resync carries the launcher forward

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly `dream`, later routines) with the OS-native
scheduler (launchd / systemd / schtasks). The registered OS entry never invokes
the app directly: it invokes the **independent launcher** at
`<core>/launcher/launch.js` — a Node file placed **outside** the mutable app tree
— which verifies integrity and only then spawns
`node <app>/bin/wienerdog.js run-job <name>`. Any verification failure is a
durable alert plus **zero** spawn (ADR-0028). **IRON RULE (ADR-0004): Wienerdog
is just files.** The launcher runs and exits with each fire. This WP adds no
daemon, no watcher, no poller, no timer, no telemetry, and no new state file.

An install has one of two **stances**. In **prod** the published files are copied
into `<core>/app/<version>/` and `<core>/app/current` symlinks there; the
launcher demands a byte-exact **app release digest** over that tree. In **dev**
`app/current` points at a live git checkout and the descriptor binds a reduced
digest that excludes the tree hash (ADR-0028 amendment #7), because a dev tree is
edited constantly by definition.

`<core>/launcher/launch.js` is placed by `writeLauncher` in `src/core/vendor.js`,
called at the end of `vendorSelf` — the function `wienerdog sync` and
`wienerdog adopt` run to vendor the package and repoint `app/current`. The whole
point of that file living outside `app/current` is that it is a **secondary
anchor**: the verifier must not be a member of the set it verifies.

**The defect this WP closes.** `vendorSelf` ends at `src/core/vendor.js:195` with
`writeLauncher(paths, { manifest: opts.manifest })` — **passing no `sourceRoot`**.
`writeLauncher` (`:259`) therefore falls back to `packageRoot()`, and (`:260`)
reads `<root>/src/scheduler/launcher.js`. On a prod install reached through the
PATH shim (`~/.local/bin/wienerdog` execs `<core>/app/current/bin/wienerdog.js`,
`vendor.js:311-314`), Node resolves module filenames through symlinks, so
`packageRoot()` **is** `realpath(<core>/app/current)` — the A7-writable app tree.
So **every attended `wienerdog sync` copies the app tree's own `launcher.js` over
the out-of-tree verifier.** One A7-scoped write into the app tree becomes the
fire-time verifier at the next attended sync. Executed and confirmed three times
(twice by independent reviewers, once again while drafting this WP — Current
state §2).

**Its amplification.** `launcher.js`'s refusal banner (`:442-443`) reads
verbatim: *"If the change was intentional, run `wienerdog sync`; otherwise
investigate."* Combined with the defect, a C3 integrity refusal instructs the
user to perform the exact act that installs the attacker's `launch.js`. **Do not
edit that banner in this WP** — a sibling WP owns `launcher.js`'s refusal banner
and this WP touches no file under `src/scheduler/`.

**Where this WP comes from, and why the dependency is real.**
`docs/specs/WP-stance-authority-containment.md` (status `Ready`) records this
defect as **Table G row S1** — *known-open, out of scope, owner-routed* — with an
explicit Out-of-scope bullet forbidding a fix inside that WP, and records the
shipped comment at `vendor.js:249-250` (*"a scoped write to the app tree cannot
disable the fire-time verification"*) as **known false**. This WP is the
owner-approved close of that routing. Cite that spec's Table G row S1 by name;
**do not paraphrase its wording** — it took nine review rounds to make true, and
paraphrasing it is the exact drift class it fought.

The fix is that WP's own subtraction, applied one line further down. Its **D9**
gives `vendorSelf` a **self-resync** branch: when
`realpath(<core>/app/current) === realpath(sourceRoot)`, `target` is carried
forward and **no signal inside that tree selects it**. This WP applies the same
rule to the launcher: **on a prod self-resync, do not re-publish `launch.js` from
the tree — carry the existing one forward.**

Why that loses nothing: a self-resync is, by definition, re-vendoring the tree
the install already runs from — **it has no newer launcher to offer**. A
legitimate upgrade normally is not a self-resync, because its source root differs
— an npx cache, or a newer `<core>/app/<version>` spawned by `wienerdog update`
— and those republish exactly as they do today. The behaviour change is confined
to the case where re-publishing was pure risk with zero benefit.

One shape deserves a footnote so a later reader does not file it as a defect.
After `npm i -g wienerdog`, whether the following `wienerdog sync` is a
self-resync depends on PATH order: where `~/.local/bin` precedes the npm global
bin, the PATH shim wins and still execs `<core>/app/current/bin/wienerdog.js`
(`vendor.js:311-314`), so that `sync` **is** a self-resync — of the **old**
app — and correctly carries the old launcher forward. Nothing is wrong there: it
never reached the new package's code at all, so it has no new launcher to publish
either way. The user reaches the new version through the npm global bin directly
(or through `wienerdog update`, Current state §5), and that run is not a
self-resync and republishes.

**The dependency is real, not notional.** This WP does not compute the
self-resync predicate; it **consumes D9's**. D9 introduces `selfResync` and the
containment-derived `dev` inside `vendorSelf`. **`selfResync` is bound *before*
D9's `if (selfResync) / else if (isDevCheckout)` branch — i.e. before
`repointCurrent`, not immediately above the `writeLauncher` call**; `dev` is
bound after `repointCurrent` and before `writeLauncher` (Exact contracts states
both again). That placement of `selfResync` is load-bearing, not incidental, and
**T3 is its gate** — see the last note under the Test index. Recomputing either
would create a second copy of a
canonical predicate — the mirror proliferation ADR-0031 forbids, and the failure
class that cost `WP-stance-authority-containment` five review rounds. On a tree
without D9 there is nothing to consume: `vendorSelf` has no `selfResync` binding
and its `dev` is `.git`-derived rather than containment-derived, which would make
the gate forgeable by the very A7 write this WP removes. **Do not start this WP
until `WP-stance-authority-containment` is `Done`.**

## Current state

Everything below was read at commit `d2b1981` and, where it is a behavioural
claim, **executed** during drafting. Line numbers are that commit's — i.e.
**before** `WP-stance-authority-containment` lands. That WP edits `vendorSelf`'s
body, so the line numbers inside `vendorSelf` will have shifted by the time you
start; the anchors you need are the function names and the literal code below,
not the numbers.

### 1. The two functions, verbatim

`src/core/vendor.js:190-196` — the tail of `vendorSelf` **on `main` today**:

```js
  repointCurrent(paths, target);
  // A7/F1/F2/F3 (WP-157): place the out-of-tree launcher the scheduler invokes.
  // Its source is the RUNNING installer (packageRoot), not the vendored
  // `root` — the launcher is the installer's own verifier and always ships with
  // the package (a synthetic test `sourceRoot` need not carry it).
  writeLauncher(paths, { manifest: opts.manifest });
  return { version, target, dev, copied };
```

`src/core/vendor.js:246-285` — `writeLauncher` in full:

```js
/**
 * Place the out-of-tree launcher at `<core>/launcher/launch.js` by copying the
 * self-contained `src/scheduler/launcher.js` bytes OUT of the app tree (WP-157).
 * It is a SECONDARY anchor: distinct from `app/current`, so a scoped write to
 * the app tree cannot disable the fire-time verification. Idempotent (skip when
 * byte-identical); records a `file` manifest entry once; mode 0755 (POSIX).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{manifest?: object, sourceRoot?: string}} [opts]  sourceRoot defaults
 *   to packageRoot() — the launcher is the installer's own file, not vendored
 *   app content.
 * @returns {{path:string, changed:boolean}}
 */
function writeLauncher(paths, opts = {}) {
  const root = opts.sourceRoot || packageRoot();
  const src = path.join(root, 'src', 'scheduler', 'launcher.js');
  const dest = launcherPath(paths);
  const content = fs.readFileSync(src);
  let same = false;
  try {
    same = fs.readFileSync(dest).equals(content);
  } catch {
    same = false;
  }
  let changed = false;
  if (!same) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, { mode: 0o755 });
    if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
    changed = true;
  }
  if (opts.manifest) {
    // Record the dir BEFORE the file: reverse() replays in reverse order, so the
    // file (launch.js) is removed first and the now-empty launcher/ dir is
    // rmdir'd after — otherwise the lingering dir keeps <core> non-empty and
    // uninstall cannot remove the core.
    recordOnce(opts.manifest, { kind: 'dir', path: path.dirname(dest) });
    recordOnce(opts.manifest, { kind: 'file', path: dest });
  }
  return { path: dest, changed };
}
```

Two facts from that body you will need. **(a)** `writeLauncher` is the **only**
recorder of the `<core>/launcher` dir entry and the `launch.js` file entry —
verified by `grep -n "kind: 'dir'\|kind: 'file'" src/core/vendor.js`, which
returns `:281`, `:282` (this pair), `:324` and `:352` (both `writeShim`'s
`~/.local/bin` entries). Nothing in `src/core/manifest.js` or the uninstall path
records them. **(b)** its own comment says what is lost if those entries are
missing: *"the lingering dir keeps `<core>` non-empty and uninstall cannot remove
the core."*

### 2. The defect, executed (not asserted)

Run at `d2b1981` in a `mktemp -d` scratch core, with a fake published package
built from the repo's own `bin/`, `src/` and `package.json`, then re-entered
through the shim path (`require('<core>/app/current/src/core/vendor.js')`), which
is exactly how `wienerdog sync` reaches `vendorSelf` on a real install:

```
install target        : <T>/core/app/0.10.0 dev= false copied= true
launch.js placed      : true
packageRoot() via shim: /private<T>/core/app/0.10.0
realpath(app/current) : /private<T>/core/app/0.10.0
self-resync predicate : true
marker in <core>/launcher/launch.js BEFORE sync: false
self-resync vendorSelf: target=<T>/core/app/0.10.0 dev=false copied=false
marker in <core>/launcher/launch.js AFTER  sync: true
```

The only write between the two marker readings was `chmod +w` plus an appended
`// A7-MARKER-b9f2` comment on `<core>/app/0.10.0/src/scheduler/launcher.js` —
one A7-scoped write into the app tree. The `chmod` is necessary and sufficient:
`makeTreeFilesReadOnly` (`vendor.js:127-150`) clears the write bits on published
**files** but the owner can always restore them, and it leaves directories
writable by design.

### 3. What the fixed behaviour is, executed on a prototype

A scratch copy of the repo with a minimal `WP-stance-authority-containment`
D1+D9 (`installStance`, `selfResync`, containment-derived `dev`) plus this WP's
change was run through a **seven**-shape matrix. Measured results:

| shape | after the change |
|---|---|
| first install (no `app/current` yet) | `launch.js` placed, stance `prod`, `copied=true` |
| prod self-resync, marker planted in the tree | marker **absent**; `launch.js` bytes **byte-identical** to before; stance still `prod`; sync succeeds |
| prod self-resync, run twice | still byte-identical (idempotent) |
| prod self-resync, `launch.js` deleted first | `WienerdogError` thrown, nothing published; a later run from a different source root republishes a marker-free copy — **from `packageRoot()`, not from that source root** (see the bytes-provenance note below) |
| prod self-resync, `launch.js` replaced by a **directory** | `WienerdogError` thrown, nothing published — **and** the recovery run from a different source root throws too |
| upgrade: `<core>/app/9.9.9` spawned as its own source root | `current` repointed to `9.9.9`, the **new** launcher published |
| dev self-resync, maintainer edits the checkout's `launcher.js` | edit **is** published (workflow preserved) |

The same matrix on **unmodified `main`** reports the marker present in
`<core>/launcher/launch.js` after one prod self-resync — the red input.

**Provenance of the "`launch.js` replaced by a directory" row, stated so it is
not read as more than it is** — named by content rather than by position, because
the matrix has been reordered once and an ordinal is a mirror waiting to drift.
Six of the seven rows are prototype runs. That one was added in round 2 and its
two halves come from a direct `mktemp -d` probe of the filesystem primitives
`writeLauncher` uses, not from a full prototype run: `fs.readFileSync` on a
directory gives `EISDIR` (so the carry arm's single read throws → row 3), and
`fs.writeFileSync` on that same directory also gives `EISDIR` (so the publish arm
cannot complete the recovery either). The same probe measured `EACCES` on both
calls for a mode-`000` file owned by a non-root user. T2 is what turns this from
a probe into a gate.

**Bytes-provenance of a recovery run, because two roots diverge here and the
divergence is invisible unless stated.** `vendorSelf` binds
`root = opts.sourceRoot || packageRoot()` (`vendor.js:165`) and uses it for the
version, the stance and the copied tree — but it **never forwards `sourceRoot` to
`writeLauncher`** (`vendor.js:195` on `main`; D2's replacement call at Exact
contracts does not add it either). So `writeLauncher`'s publish arm always falls
back to `packageRoot()` (`vendor.js:259`). Executed: `vendorSelf(paths,
{sourceRoot: alt})` with a marker planted in `alt`'s `src/scheduler/launcher.js`
publishes a `launch.js` **without** that marker. Consequence for the wording
everywhere in this spec: a recovery run from a different source root is
marker-free because its **`carryForward` is falsy and the bytes come from
`packageRoot()`** — *not* because the source root was clean. Say it that way in
AC6 and in T2's comments; the two coincide in the tests only because the test
process's `packageRoot()` is the repo. **Do not "fix" this by forwarding
`sourceRoot`** — that would be an out-of-scope behaviour change on the arm this
WP does not touch, and it is already caught: `tests/unit/vendor.test.js:412-413`
asserts the published bytes equal `packageRoot()`'s launcher, and AC4 requires
that test to pass unmodified.

### 4. Existing tests: zero go red

The full suite was run on two scratch trees — one with D1+D9 only, one with
D1+D9 plus this WP's change. Both reported `tests 1671 / pass 1666 / fail 0 /
skipped 5`. **This change reddens no existing test**, so no existing test file is
a deliverable. The reason, verified by grep over all `vendorSelf(` call sites in
`tests/`: every one of them passes an explicit `sourceRoot` that is a separate
fixture directory, so `current` never resolves to the source root and no existing
test is a self-resync. `tests/unit/vendor.test.js:397` (*"writeLauncher places
launch.js OUTSIDE app/, records dir+file, idempotent (WP-157)"*) must therefore
pass **unmodified** — it is this WP's proof that the non-self-resync path is
untouched, including the first-install placement (Table L row 1) and the
`dir`-before-`file` manifest order.

### 5. The two callers, and which of them this reaches

`vendorSelf` has exactly two attended production callers (`grep -rn vendorSelf
src bin`): `src/cli/sync.js:204` and `src/cli/adopt.js:392`. Neither is a
deliverable and neither needs an edit — the change is entirely inside
`vendorSelf` and `writeLauncher`. `wienerdog update` is not a third caller: it
spawns the **new** version's `bin/wienerdog.js sync` (`src/cli/update.js:45-48`),
whose `packageRoot()` is `<core>/app/<newver>` while `current` still points at
the old version, so it is not a self-resync and it republishes normally
(Table L **row 1**, executed).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/vendor.js | **D1** — `writeLauncher` gains the `carryForward` option and the carry-forward arm (Table L). The `if (opts.manifest)` block stays **below both arms**, shared — moving it into the `else` is the one mutation that passes every gate but AC12/T1 (Implementation notes → D1; Table M **M6**). **D2** — the `writeLauncher(…)` call at the end of `vendorSelf` passes `carryForward: selfResync && !dev`, reusing `WP-stance-authority-containment` D9's two existing bindings, and the call-site comment above it is corrected. **D3** — the false clause in `writeLauncher`'s JSDoc is **deleted** (Implementation notes → D3; it is a deletion, not a repair). Nothing else in the file: `vendorSelf`'s branch structure, `installStance`, `isDevCheckout`, `readVersion`, `repointCurrent`, `copyTree`, `makeTreeFilesReadOnly`, `writeShim`, `verifyCurrentContainment`, `launcherPath`, `recordOnce`, `COPY_INCLUDE` and the module's `require`s are untouched. |
| create | tests/unit/vendor-selfresync.test.js | **T1–T4** (Test index). Four tests — no more, no fewer — verbatim in this spec. T1 additionally carries the **carry-arm manifest** assertion (AC12), the only gate on Table L's "both arms" row for that arm; T2 covers **both** accepted row-3 failure shapes and gates all three required message fields (AC5/AC6). Picked up automatically — `tests/run.js` shells out to `node --test` with no path filter, so `tests/unit/*.test.js` is auto-discovered. |

Not deliverables, deliberately: `src/scheduler/launcher.js` (a sibling WP owns
its refusal banner — do not open it), `src/cli/sync.js`, `src/cli/adopt.js`,
`src/cli/update.js`, `src/core/manifest.js`, `tests/unit/vendor.test.js`,
`tests/unit/launcher.test.js`, `tests/scenarios/a7-integrity/**`,
`docs/THREAT-MODEL.md`, `docs/GLOSSARY.md`, `docs/adr/**`,
`docs/specs/WP-stance-authority-containment.md`, and **`memory/lessons/inbox.md`**.
See Out of scope for each. Several of them contain tests that must pass
**unmodified** — that is this WP's proof that nothing else moved.

### Exact contracts

```js
// src/core/vendor.js — CHANGED signature (one new option; no new export)
/**
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{manifest?: object, sourceRoot?: string, carryForward?: boolean}} [opts]
 *   carryForward: when true, DO NOT read `sourceRoot`/`packageRoot()` at all —
 *   keep the launcher already at `<core>/launcher/launch.js`. Throws a
 *   WienerdogError if that file is missing or unreadable. `sourceRoot` is
 *   ignored when `carryForward` is true.
 * @returns {{path:string, changed:boolean}}   changed is false on the carry arm
 * @throws {WienerdogError} carryForward with no readable existing launcher. The
 *   message MUST carry three fields: the absolute destination path, the failing
 *   `err.code` (e.g. ENOENT / EISDIR / EACCES), and the recovery command
 *   `npx wienerdog@latest sync`. All three are gated by T2.
 */
function writeLauncher(paths, opts = {})
```

```js
// src/core/vendor.js — the CALL SITE, at the end of vendorSelf, replacing
// `writeLauncher(paths, { manifest: opts.manifest });`
writeLauncher(paths, { manifest: opts.manifest, carryForward: selfResync && !dev });
```

`selfResync` and `dev` are `WP-stance-authority-containment` D9's own bindings,
already in scope at that point in `vendorSelf`: `selfResync` is the
`realpath(app/current) === realpath(root)` test D9 inserts before the branch, and
`dev` is D9's `installStance(paths) === 'dev'`, computed after
`repointCurrent(paths, target)` and before `writeLauncher`. **Compute neither
again.**

`WienerdogError` is already required at the top of `vendor.js` after
`WP-stance-authority-containment` D8 (`const { WienerdogError } =
require('./errors');`). **This WP adds no `require` to any file.**

Worked examples (all five map onto acceptance criteria):

```
prod install, sync through the shim, tree launcher tampered  ⇒ launch.js unchanged
prod install, sync through the shim, launch.js deleted       ⇒ WienerdogError (ENOENT), nothing written;
                                                               a run from a clean source root republishes
prod install, sync through the shim, launch.js is a DIRECTORY ⇒ WienerdogError (EISDIR), nothing written;
                                                               the clean-source-root run does NOT auto-repair —
                                                               the path must be removed first
prod install, `wienerdog update` spawns app/<newver>/bin      ⇒ the NEW launcher published
dev install, sync through the shim, checkout launcher edited ⇒ the edit IS published
```

No schema change, no new field, no new file on a user's disk, no migration
command, no CLI flag. The returned shape of `writeLauncher` and `vendorSelf` is
unchanged.

## Contract reference

**Activation (ADR-0031, 2-of-7): three triggers fire, so the discipline is on.**
(i) an **interface shape** changes — `writeLauncher`'s `opts` gains a member that
changes which arm runs; (iv) **error / fallback / precedence** behavior changes —
a new fail-closed throw, and a new precedence rule (`carryForward` wins over
`sourceRoot`); (v) the task **crosses an authority boundary** — `vendor.js`
decides whether the fire-time verifier is replaced, and `src/scheduler/launcher.js`
(a self-contained file outside the app tree) is what that decision arms or
disarms.

One canonical table carries it: **Table L**, the single place `writeLauncher`'s
publish decision is decided. Every statement about when the launcher is
re-published — in Deliverables cells, in the JSDoc, in acceptance criteria, in
verification greps and in the tests — defers to Table L. The self-resync
predicate itself is deliberately **not** given a table here: it is
`WP-stance-authority-containment` D9's contract and this WP consumes it, so
there is no predicate literal in this spec to drift.

### Table L — `writeLauncher`'s publish decision (canonical)

| # | Condition (`opts.carryForward`) | What `writeLauncher` reads | What it writes | Returns / throws |
|---|---|---|---|---|
| 1 | **falsy** — first install, upgrade, adopt from an npx/temp root, any non-self-resync, **or any dev install** | `<sourceRoot ‖ packageRoot()>/src/scheduler/launcher.js` | the source bytes, mode `0755`, skipped when byte-identical | `{path, changed}` — **unchanged behaviour from `main`** |
| 2 | **true** — prod self-resync only | `<core>/launcher/launch.js` itself, once, to prove it is readable; **never** `sourceRoot` and **never** `packageRoot()` | nothing | `{path, changed:false}` |
| 3 | **true**, and `<core>/launcher/launch.js` is missing or unreadable — any `readFileSync` failure, whatever the code (`ENOENT` absent, `EISDIR` a directory at that path, `EACCES` mode `000`) | the same single read, which throws | nothing | **throws `WienerdogError`** (fail closed) whose message carries **all three** of: the absolute `dest` path, the failing `err.code`, and the literal recovery command `npx wienerdog@latest sync` (T2 gates each) |
| — | **both arms** | — | the `dir`-then-`file` manifest pair via `recordOnce`, exactly as today — **exactly one** `dir` entry for `<core>/launcher` and **exactly one** `file` entry for `launch.js`, the `dir` first. The carry arm's recording is verified by **AC12 / T1** (a `vendorSelf` call with a fresh empty manifest that takes the carry arm); the publish arm's by `tests/unit/vendor.test.js:397` | idempotent; `recordOnce` never duplicates |

| Fact | Value |
|------|-------|
| **Who decides `carryForward`** | `vendorSelf`, as `selfResync && !dev` — both bindings are `WP-stance-authority-containment` D9's, already in scope |
| **Recomputation** | forbidden — `writeLauncher`'s body must not mention `selfResync`, `currentLink`, `installStance`, `isDevCheckout` or `realpath` (V3 greps for this) |
| **Precedence** | `carryForward: true` wins over `sourceRoot`; `sourceRoot` is ignored, not merged |
| **Why `!dev`** | **a workflow requirement, not a security claim.** A dev install's `app/current` **is** the maintainer's checkout; carrying forward would mean a maintainer's edit to `src/scheduler/launcher.js` never reaches the file the scheduler invokes, so the launcher could not be developed at all (T4 proves this, and T4 is the *only* thing this gate buys). It costs little because a dev descriptor binds the reduced digest that never hashes app code (ADR-0028 amendment #7). It is **not** true that nothing is defended by carrying forward on dev — see **Residual R-dev** below, which is accepted, not closed. The gate is at least not self-forging: `dev` is containment-derived (D9), and D8+D9 make containment unreachable by an A7-scoped **data** write |
| **First install** | `carryForward` is falsy — D9's `selfResync` catches the unresolvable `app/current` and yields `false`. Row 1 applies; placement is unchanged (T-existing, `tests/unit/vendor.test.js:397`) |
| **Manifest** | recorded on **both** arms. Skipping the call instead of passing the flag would drop the only recorder of the `<core>/launcher` dir + `launch.js` file entries (Current state §1a), and an install whose manifest lacks them leaves `<core>` non-empty at uninstall (`vendor.js:277-280`) |
| **Recovery from row 3** | any attended run whose source root is not the install's own tree — e.g. `npx wienerdog@latest sync`. That is not a self-resync, so row 1 applies. It **completes** the recovery only for the **absent** (`ENOENT`) shape. When `dest` exists but is unreadable, row 1's publish also fails: `fs.writeFileSync(dest, …)` (`vendor.js:272`) throws the **same** code — executed: a directory at `dest` gives `EISDIR` on both read and write; a mode-`000` file gives `EACCES` on both, as a non-root owner. The user must **remove `dest` first**, which is why row 3's message reports `err.code`. Gated by T2 |
| **Not closed by this WP** | `WP-stance-authority-containment` **Table G row S2** and the general form recorded in that spec's Current state §10 (cited, never restated); **Residual R-dev** below; and the disclosure gap named in the fail-closed paragraph of Implementation notes → D1 (a readable-but-corrupt `launch.js` is carried forward silently) |

### Residual R-dev — accepted, owner-routed (the `!dev` gate's real cost)

Registered here in the shape `WP-stance-authority-containment` uses for its
Table G rows S1/S2: **stated once, accepted, and routed to the owner** — the
treatment below is this spec's; the *authority* to accept it is the owner's, and
the PR body must carry it forward (Definition of done item 7).

| | |
|---|---|
| **R-dev** | On a **dev** install, `carryForward` is false and Table L row 1 runs, so `<checkout>/src/scheduler/launcher.js` is published as `<core>/launcher/launch.js` at every attended `sync`. An actor whose write primitive is limited to **that one file inside the dev checkout** therefore still has its bytes become the fire-time verifier at the maintainer's next attended sync — the same end state this WP removes on prod. |
| **Why it is not closed** | Closing it means not publishing the launcher on dev, which makes the launcher undevelopable (Table L, "Why `!dev`"). The gate is kept for the workflow. |
| **Why it is accepted** | (a) A dev checkout is **mutable by design** — it is the tree the maintainer edits, and Wienerdog's dev stance already declines to bind it: the reduced descriptor never hashes app code (ADR-0028 amendment #7), so there is no integrity claim over the checkout to break. (b) *Typically*, an actor who can write inside the checkout is not path-limited and already owns `bin/wienerdog.js run-job`, which an honest launcher spawns anyway — so carrying forward would defend nothing against them. **That is a typical-case argument, not a universal one**, and R-dev is exactly the narrower adversary it does not cover. |
| **Status** | **Known-open, accepted, out of scope.** Do not add a dev-side guard in this WP (Out of scope, last bullet). Disposition beyond acceptance — e.g. a publisher-anchored launcher — is ADR-0028-level and the owner's. |

The shipped code says none of this. Neither the D2 call-site comment nor the D3
JSDoc asserts any security property for the dev arm; both state only what the
code does. Do not add one.

### Mirrored Surface Checklist

Table L is the single place `writeLauncher`'s publish decision is decided. Every
surface below mirrors it; a review finding updates Table L **and every mirror in
the same pass**, and any new mirror found in review is registered here on the
spot.

- [ ] **Deliverables-table cells** — the `src/core/vendor.js` row (D1/D2/D3) and
      the `tests/unit/vendor-selfresync.test.js` row.
- [ ] **Exact contracts** — the `writeLauncher` JSDoc block and the call-site
      snippet.
- [ ] **Acceptance criteria** — AC1–AC12 (AC12 is the carry arm's manifest
      recording, registered in round 2).
- [ ] **Verification commands / greps** — V1 (the four tests), V3 (the
      no-recomputation greps), V4 (the call-site grep). **Every one of them is
      an exit-code gate**, not an eyeball check, and the gate is the **whole
      pasted block's** `$?`, not a printed line inside it. Two distinct failures
      have already shipped here: round 1 inverted V3/V5 (`grep -c` printing `0`
      while exiting `1`), and round 2 **masked** V1/V3/V4/V5/V7 by ending each
      block with `echo "… exit=$?"`, so the block reported `exit=1` to a human
      and exited `0` to anything checking status. The fixed form ends every
      block with `rc=$?; echo "… exit=$rc"; (exit $rc)`. Any new or edited step
      must be proven by running it in both the correct and the violating state
      and pasting **the block's own `$?`** for each.
- [ ] **Current-state description** — §3's **seven**-shape matrix table (the
      seventh row landed in round 2; the count is itself a mirror and drifted,
      so it is spelled out here, at §3's lead-in and in §3's provenance
      paragraph — all three must agree), plus §3's bytes-provenance note, whose
      claim about `sourceRoot` never reaching `writeLauncher` is mirrored in AC6
      and in T2's comments.
- [ ] **Operative prose steps** — Implementation notes D1, D2, D3, and the
      fail-closed paragraph (its recovery claim mirrors Table L's "Recovery from
      row 3" row).
- [ ] **Test bodies** — T1–T4 in the Test index (each asserts one Table L row;
      T1 additionally asserts the "both arms" row's carry-arm half, T2 the row-3
      message fields and both accepted failure shapes, T3 the placement of D9's
      `selfResync` binding — mirrored in AC7 and in Context's dependency
      paragraph, which must all name the same placement: *before* D9's branch).
- [ ] **Table M mutation rows** — every Table L row and every AC needs a
      mutation partner; M6 is the "both arms" row's, added in round 2.
- [ ] **Residual R-dev** — its own block above, plus **six** citing surfaces,
      enumerated because a round-3 review found the count stale at "four":
      (1) Table L's "Why `!dev`" row, (2) Table L's "Not closed by this WP" row,
      (3) Implementation notes → **D3**, (4) the Out-of-scope
      **`docs/THREAT-MODEL.md`** bullet, (5) the Out-of-scope **dev-side guard**
      bullet, (6) **Definition of done item 7**. A seventh gets registered here
      on the spot.
- [ ] **Shipped JSDoc prose in `src/`** — the `carryForward` `@param` text and
      the corrected call-site comment; these ship to users' disks and are the
      mirror most likely to drift.
- [ ] **The citation of `WP-stance-authority-containment` Table G rows S1/S2** —
      registered per that spec's own discipline, in **six** places, enumerated
      because a round-3 review found the count stale at "four": (1) Context,
      (2) Table L's "Not closed by this WP" row, (3) Implementation notes → D3's
      prose, (4) **the D3 JSDoc replacement block that ships in `src/`**,
      (5) Out of scope, (6) **Definition of done item 6**. Every one is a
      **citation by name**, never a restatement; a seventh gets registered here
      rather than paraphrased again. Note that (4) and (6) cite **row S2 only**,
      deliberately — this WP closes S1 and neither surface may outlive that.
- [ ] **The cross-WP constraint on `WP-refusal-remedy-discriminator`** —
      registered in round 3 after all three surfaces drifted to a universal
      "on a prod install at all". Canonical wording lives in the fail-closed
      paragraph of Implementation notes → D1: *sync no longer refreshes
      `<core>/launcher/launch.js` **on a prod self-resync entered through
      `app/current`***. Mirrored in (1) the Out-of-scope
      **`src/scheduler/launcher.js`** bullet and (2) **Definition of done item 7,
      bullet 3**. The operative instruction — "must not promise launcher
      repair" — is unchanged by the narrowing and must read identically in all
      three.

## Implementation notes & constraints

### Why the decision is passed in, not branched at the call site

Both shapes were considered. **Passing `carryForward` into `writeLauncher`
wins**, for three reasons, and the choice is recorded here rather than left to
the implementer:

1. **The manifest stays single-sourced.** Branching at the call site means either
   duplicating `writeLauncher`'s two `recordOnce` calls into `vendorSelf` — a new
   mirror of a contract that already exists — or skipping them. Skipping is
   wrong: `writeLauncher` is the **only** recorder of the `<core>/launcher` dir
   and `launch.js` file entries (Current state §1a), and `manifest.load` returns
   a **fresh empty manifest** when `install-manifest.json` is absent
   (`src/core/manifest.js:446-457`), so a prod install that re-syncs after losing
   its manifest would record neither entry and `wienerdog uninstall` would leave
   `<core>` non-empty — the failure `vendor.js:277-280` exists to prevent.
2. **The fail-closed decision belongs next to the path it guards.** `dest` is
   computed inside `writeLauncher` from `launcherPath(paths)`; the readability
   check and its error message need it.
3. **`writeLauncher` is exported and separately tested**, so the behaviour must
   be reachable through it, not only through `vendorSelf`.

The predicate is still computed **exactly once**, in `vendorSelf`, by
`WP-stance-authority-containment` D9. This WP passes the **decision**, not the
inputs. V3 gates that by grep.

### D1 — `writeLauncher` gains `carryForward`

Restructure the body so the source read lives on the else arm. Nothing else in
the function moves: the manifest block and the `return` stay exactly where they
are and stay shared by both arms.

**The one thing you can get wrong here and still pass every other gate.** The
`if (opts.manifest) { … }` block must stay **outside** both arms, below them.
Moving it into the `else` alongside the source read is the natural-looking
tidy-up and it is the bug this WP's argument #1 exists to prevent: the carry arm
would then record nothing, so a prod install that re-syncs through the shim
after losing `install-manifest.json` — `manifest.load` hands back a **fresh empty
manifest** in that case (`src/core/manifest.js:446-457`) — ends up with a
manifest naming neither `<core>/launcher` nor `launch.js`. `writeLauncher` is
their only recorder (Current state §1a), so `wienerdog uninstall` then leaves
`<core>` non-empty and prints `Kept ~/.wienerdog …` (`src/cli/uninstall.js:211-216`)
with the launcher still on disk. **AC12 / T1 is the only gate that catches this**
— every other gate stays green under that mutation, which is precisely what
Table M's **M6** measures. Keep the block where the snippet shows it.

```js
function writeLauncher(paths, opts = {}) {
  const dest = launcherPath(paths);
  let changed = false;
  if (opts.carryForward) {
    // Table L row 2/3: a self-resync has no newer launcher to offer, and the
    // only tree it could take one from is the tree it is re-vendoring. Prove
    // the existing launcher is readable, then leave it alone. Fail CLOSED if it
    // is not — re-publishing from the app tree is precisely what this arm exists
    // to remove (WP-launcher-no-self-resync-republish).
    try {
      fs.readFileSync(dest);
    } catch (err) {
      throw new WienerdogError(
        `the out-of-tree launcher at ${dest} is missing or unreadable (${err.code || err.message}), ` +
        'and it is deliberately NOT re-published from the app tree this sync is re-vendoring. ' +
        'If something else occupies that path, remove it first; then reinstall from a clean ' +
        'source: `npx wienerdog@latest sync`.'
      );
    }
  } else {
    const root = opts.sourceRoot || packageRoot();
    const src = path.join(root, 'src', 'scheduler', 'launcher.js');
    const content = fs.readFileSync(src);
    let same = false;
    try {
      same = fs.readFileSync(dest).equals(content);
    } catch {
      same = false;
    }
    if (!same) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content, { mode: 0o755 });
      if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
      changed = true;
    }
  }
  if (opts.manifest) {
    // …existing comment and the two recordOnce calls, UNCHANGED…
  }
  return { path: dest, changed };
}
```

Use `fs.readFileSync(dest)` and discard the result, not `fs.existsSync` and not
`fs.accessSync`: it is the strongest single check, it rejects a directory at that
path, and its `err.code` is what the message reports. Executed in a `mktemp -d`
scratch: a missing path gives `ENOENT`, a directory gives `EISDIR`, a mode-`000`
file gives `EACCES` to its non-root owner. All three take row 3.

**The fail-closed choice, made deliberately and stated.** The alternative —
re-publish from the tree when the destination is gone — would hand an attacker a
one-line bypass of this entire WP (delete the file, then wait for the next
attended sync), turning the fix into a speed bump. The cost is that a prod
install whose `<core>/launcher/launch.js` is gone now fails its `sync` with a
clear message instead of silently self-repairing. That cost is acceptable: the
file's absence already breaks every scheduled fire (the OS entry invokes a path
that does not exist), so the install is broken either way.

**How complete the named recovery is — stated precisely, because it differs by
failure shape.** For the **absent** (`ENOENT`) shape the recovery in the message
is complete: a run from a source root that is not the install's own tree takes
Table L row 1 and republishes (executed; T2 first half). For the two
**present-but-unreadable** shapes it is not, and this WP does not make it so: row
1's publish ends at `fs.writeFileSync(dest, …)` (`vendor.js:272`), which throws
the **same** `EISDIR` / `EACCES` the read did, so the user must remove `dest`
before the recovery run (executed; T2 second half). That is why the message
reports `err.code` and tells the user to clear the path first. Fixing the publish
arm to survive an occupied `dest` — unlink-then-write, or tmp+rename — would be a
change to behaviour this WP does not otherwise touch, on the arm it does not
otherwise touch, and it is deliberately **not** in scope; raise it as a
discovered issue if you think it should be.

**A third shape this WP deliberately does not detect — a disclosure, not a
defect.** `writeLauncher` writes with a bare `fs.writeFileSync` (`vendor.js:272`,
no tmp+rename), so a **readable but corrupt or truncated** `launch.js` is
reachable — an interrupted publish, a partial write, a byte-level tamper. Row 2's
single read proves only that the file is **readable**, which is all it honestly
claims. On `main` today the next attended `sync` silently overwrites such a file
and repairs it by accident. After this WP a prod self-resync **carries it forward
silently**: no error, no repair, `sync` reports success, and every scheduled fire
keeps failing. This is forced, not chosen — the only comparison source available
on the carry arm is the very tree the arm exists to distrust, so there is nothing
honest to compare against. The recovery is the same one row 3 names:
`npx wienerdog@latest sync` from a clean source root republishes. **Related
cross-WP constraint (stated in its exact scope — this is the canonical wording,
mirrored in Out of scope and in Definition of done item 7):** after this WP
`wienerdog sync` no longer refreshes `<core>/launcher/launch.js` **on a prod
self-resync entered through `app/current`** — it still refreshes it on every
other shape, which is exactly why `npx wienerdog@latest sync` is the recovery
this spec names. The consequence for the sibling is unchanged by that narrowing:
because the refusal banner's remedy is reached by a user running the shim'd
`wienerdog sync`, which **is** that self-resync,
`WP-refusal-remedy-discriminator`'s replacement remedy text **must not promise
launcher repair**. Recorded here because this WP is what makes it true; that
spec's own revision carries it, and this WP does not open it.

**What a refused sync leaves behind — scoped to the caller, because the two
production callers differ.** The throw happens **after** `repointCurrent`, which
on a self-resync resolves to the same target, so **`app/current`'s resolved
target is unchanged** — that, and not "the install is exactly as it found it", is
the true claim. Two things do move and neither is harmful: `repointCurrent`
sweeps orphaned `current.tmp.*` entries on both its no-op and its rewrite path
(`vendor.js:104-112`), and the real `sync` rewrites the executable pins **before**
it ever calls `vendorSelf` (`createPins` at `src/cli/sync.js:186-194`,
`vendorSelf` at `:204`), so with a stale pin and a missing launcher the pin is
rewritten and then the sync throws.

**Through `wienerdog sync`, nothing un-uninstallable is left.** The throw precedes
`writeLauncher`'s `if (opts.manifest)` block, and `sync.js` saves the manifest
only at `:339` — *after* `vendorSelf` — so the refused run persists **no manifest
at all**, and the pins `createPins` wrote land under `paths.state`, which
`disposeCoreMechanics` sweeps unconditionally whether or not the manifest knows
about them (`src/core/manifest.js:917-935`).

**Through `wienerdog adopt` that ordering is reversed, so the claim above does
not carry.** `adopt` calls `manifestLib.save(paths, manifest)` at
`src/cli/adopt.js:387` and only then `vendorSelf(paths, { manifest })` at `:392`
(the second `save` at `:394` is never reached). A refused adopt therefore
**persists a manifest** — one that already names the vendored tree
(`recordOnce(… kind: 'vendored-tree' …)`, `vendor.js:170`, which runs before the
throw) but **lacks the `<core>/launcher` dir and `launch.js` file entries**, while
`repointCurrent` has already created `<core>/app/current`. `wienerdog uninstall`
would then remove the app tree and leave a stray `<core>/launcher/…` behind if one
exists at that path (`vendor.js:277-280` names that failure). This is **not a
regression in kind** — on `main` today `writeLauncher`'s own `readFileSync(src)`
throws from the identical position for a source root with no launcher — but this
WP makes that throw far more reachable, so it is recorded rather than implied.
It is **not** in scope to reorder `adopt.js`: that file is not a deliverable, the
reordering is a behaviour change on a path this WP does not otherwise touch, and
the recovery (`npx wienerdog@latest sync`, then `wienerdog adopt` again) is the
same one row 3 already names. Raise it as a discovered issue in the PR body; do
not fix it here.

### D2 — the call site

Replace the call at the end of `vendorSelf` and correct the comment above it. The
existing comment (`vendor.js:191-194` on `main`) asserts *"Its source is the
RUNNING installer (packageRoot), not the vendored `root`"* — true as a statement
about which variable is read, and misleading as a security statement, because on
a shim-reached prod install `packageRoot()` **is** the vendored tree. Replace the
whole comment with:

```js
  // A7/F1/F2/F3 (WP-157): place the out-of-tree launcher the scheduler invokes.
  // On a NON-self-resync its source is the running installer (`packageRoot()`),
  // which is a different tree from the one `app/current` resolves to — a real
  // upgrade, so publish. On a PROD self-resync `packageRoot()` IS that tree
  // (the shim enters through `app/current`), so there is no newer launcher to
  // offer and re-publishing would let one app-tree write become the fire-time
  // verifier: carry the existing one forward instead
  // (WP-launcher-no-self-resync-republish, Table L). A DEV self-resync still
  // publishes — its `app/current` is the maintainer's checkout and its
  // descriptor binds the reduced digest anyway (ADR-0028 amendment #7).
  writeLauncher(paths, { manifest: opts.manifest, carryForward: selfResync && !dev });
```

### D3 — delete the false clause in `writeLauncher`'s JSDoc

`vendor.js:249-250` currently reads *"It is a SECONDARY anchor: distinct from
`app/current`, so a scoped write to the app tree cannot disable the fire-time
verification."* `WP-stance-authority-containment` records that sentence as
**known false**, and **this WP does not make it true.** Say so precisely: the
sentence is unqualified, and after this change an app-tree write can still reach
`<core>/launcher/launch.js` through the channels that spec records as **Table G
row S2** and its general form (a **code** substitution inside the app tree; the
mint executes out of the tree it is vendoring) — and, on a dev install, through
**Residual R-dev** above. Those remain open and owner-routed.

So do **not** repair the sentence — repairing it means writing the residual's
positive statement, which is an ADR-level decision the owner owns and which this
WP must not paraphrase (Out of scope). **Delete the false causal clause** and
leave a factual, non-claiming replacement plus a citation:

```js
 * Place the out-of-tree launcher at `<core>/launcher/launch.js` by copying the
 * self-contained `src/scheduler/launcher.js` bytes OUT of the app tree (WP-157).
 * It is a SECONDARY anchor: it lives outside `app/current`. It is NOT by itself
 * a complete defence against a write into the app tree — the bytes' honest
 * source is `packageRoot()`, which on a shim-reached prod install IS that tree,
 * which is why `carryForward` exists. Channels that remain open are owner-routed:
 * see WP-stance-authority-containment, Table G row S2 (row S1 is the one
 * `carryForward` closes), and this function's dev arm, which always publishes.
 * Idempotent (skip when byte-identical); records the `<core>/launcher` dir entry
 * and then the `launch.js` file entry, once each, on BOTH arms; mode 0755 (POSIX).
```

That replacement asserts no security property. Do not add one. Two details in it
are deliberate and a reviewer will check both: it cites **row S2**, not "rows
S1/S2", because this WP closes S1 and the shipped comment must not outlive that
(Definition of done item 6); and it says the `dir`-then-`file` **pair**, matching
Table L's "both arms" row, not `main`'s singular "a `file` manifest entry".

### General constraints

- **ADR-0004 (IRON RULE): Wienerdog is just files.** This WP starts nothing, and
  V5 greps for it. No retry timer, no watcher, no "repair later" queue.
- No new npm dependency, no new `require` in any file, no new export.
- Do not touch `src/scheduler/launcher.js`. A sibling WP owns its refusal banner
  and is in flight; opening that file is an automatic REQUEST-CHANGES here.
- Do not edit `docs/specs/WP-stance-authority-containment.md`. Recording that
  its Table G row S1 is closed is the owner's act on a `Ready` spec, not an
  implementer's.
- Scratch fixtures live in `fs.mkdtempSync(path.join(os.tmpdir(), …))` — never a
  fixed `/tmp` path, never inside the repo, never touching `~/.wienerdog`,
  launchd, or `gui/501`. The four tests below already follow this.
- Never run bare `node --test`; the suite entry point is `node tests/run.js`,
  which sets `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` for every child process.
- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope to resolve it.

### Test index (what to write, and where)

One new file, `tests/unit/vendor-selfresync.test.js`, verbatim. It was executed
green against a D1+D9+this-WP prototype and red (2 of 4) against a D1+D9-only
prototype.

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const vendor = require('../../src/core/vendor');

function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-vendor-'));
  const core = path.join(root, 'wd');
  fs.mkdirSync(core, { recursive: true });
  return getPaths({ HOME: root, WIENERDOG_HOME: core });
}

/** A .git-free copy of the running package: a real `src/` so the vendored tree
 *  can be required THROUGH `app/current` the way the PATH shim does. */
let FULL_SOURCE = null;
function fullSource() {
  if (FULL_SOURCE) return FULL_SOURCE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-vendor-full-'));
  vendor.copyTree(vendor.packageRoot(), dir);
  FULL_SOURCE = dir;
  return dir;
}

/** Load vendor.js the way `wienerdog sync` does on a real install: through the
 *  PATH shim, i.e. through `<core>/app/current`. `packageRoot()` inside the
 *  returned module is therefore `realpath(app/current)` — the app tree itself. */
function shimVendor(paths) {
  return require(path.join(paths.core, 'app', 'current', 'src', 'core', 'vendor.js'));
}

/** One A7-scoped write: append a marker to the app tree's launcher source. */
function plantMarker(file, marker) {
  fs.chmodSync(file, 0o644);
  fs.appendFileSync(file, `\n// ${marker}\n`);
}

const readsMarker = (f, m) => {
  try { return fs.readFileSync(f, 'utf8').includes(m); } catch { return false; }
};

test('vendor: a prod self-resync does NOT re-publish launch.js from the app tree', () => {
  const paths = tempPaths();
  const r = vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  const launcher = vendor.launcherPath(paths);
  const before = fs.readFileSync(launcher);

  plantMarker(path.join(paths.core, 'app', r.version, 'src', 'scheduler', 'launcher.js'), 'A7-PLANT-PROD');

  const out = shimVendor(paths).vendorSelf(paths, {});
  assert.equal(readsMarker(launcher, 'A7-PLANT-PROD'), false, 'the app tree cannot reach launch.js');
  assert.ok(fs.readFileSync(launcher).equals(before), 'launch.js bytes carried forward verbatim');
  assert.equal(vendor.installStance(paths), 'prod', 'containment carried forward');
  assert.equal(out.version, r.version);

  // Idempotent: a second self-resync changes nothing either.
  shimVendor(paths).vendorSelf(paths, {});
  assert.ok(fs.readFileSync(launcher).equals(before));

  // Table L "both arms": the CARRY arm still records the launcher's manifest
  // pair. writeLauncher is their only recorder, and manifest.load hands back a
  // FRESH EMPTY manifest when install-manifest.json is gone — so a carry arm
  // that skipped the recording would leave <core> non-empty at uninstall. A
  // fresh empty manifest is exactly that scenario. This is the only gate on it.
  const fresh = { version: 1, createdAt: '', entries: [] };
  shimVendor(paths).vendorSelf(paths, { manifest: fresh });
  const dirs = fresh.entries.filter((e) => e.kind === 'dir' && e.path === path.dirname(launcher));
  const files = fresh.entries.filter((e) => e.kind === 'file' && e.path === launcher);
  assert.equal(dirs.length, 1, 'exactly one <core>/launcher dir entry on the carry arm');
  assert.equal(files.length, 1, 'exactly one launch.js file entry on the carry arm');
  assert.ok(
    fresh.entries.indexOf(dirs[0]) < fresh.entries.indexOf(files[0]),
    'dir recorded BEFORE file on the carry arm too (uninstall replays in reverse)'
  );
  assert.ok(fs.readFileSync(launcher).equals(before), 'still carried forward when a manifest is passed');
});

test('vendor: a prod self-resync with launch.js missing or unreadable fails closed', () => {
  const paths = tempPaths();
  const r = vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  const launcher = vendor.launcherPath(paths);
  plantMarker(path.join(paths.core, 'app', r.version, 'src', 'scheduler', 'launcher.js'), 'A7-PLANT-DELETED');

  // --- Shape A: ABSENT (ENOENT). Fails closed; the named recovery completes it.
  fs.rmSync(launcher);
  assert.throws(
    () => shimVendor(paths).vendorSelf(paths, {}),
    // Table L row 3 requires all three fields in the message; gate all three.
    (e) => e.name === 'WienerdogError'
      && e.message.includes(launcher)
      && /ENOENT/.test(e.message)
      && /npx wienerdog@latest sync/.test(e.message),
    'refuses rather than re-publishing from the tree it is re-vendoring'
  );
  assert.equal(fs.existsSync(launcher), false, 'nothing was published');

  // Recovery: a run from a DIFFERENT source root is not a self-resync and restores it.
  // A different source root makes carryForward FALSY, so Table L row 1 runs. The
  // bytes come from packageRoot() — vendorSelf never forwards sourceRoot to
  // writeLauncher (Current state §3, bytes-provenance) — so the marker planted in
  // the APP TREE cannot appear. The second assertion is belt-and-braces: under
  // every implementation this spec contemplates the bytes are packageRoot()'s and
  // it cannot fail. Keep it anyway — it is the tripwire if someone later forwards
  // sourceRoot, which AC4 / vendor.test.js:412-413 also forbid.
  vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  assert.ok(fs.statSync(launcher).isFile(), 'a non-self-resync run republishes launch.js');
  assert.equal(readsMarker(launcher, 'A7-PLANT-DELETED'), false, 'republished from packageRoot(), not the app tree');

  // --- Shape B: PRESENT BUT UNREADABLE (EISDIR). A directory is used rather
  // than a mode-000 file because root can read mode 000 and CI may run as root.
  // The carry arm fails closed the same way, and the documented recovery is
  // NOT complete for this shape: row 1's own fs.writeFileSync(dest) throws the
  // same code, so the path must be removed first. Both halves are the claim
  // made in Implementation notes → D1, so both are asserted.
  fs.rmSync(launcher);
  fs.mkdirSync(launcher);
  assert.throws(
    () => shimVendor(paths).vendorSelf(paths, {}),
    (e) => e.name === 'WienerdogError'
      && e.message.includes(launcher)
      && /EISDIR/.test(e.message)
      && /npx wienerdog@latest sync/.test(e.message),
    'an occupied destination also fails closed, with its own err.code'
  );
  assert.ok(fs.statSync(launcher).isDirectory(), 'nothing was published over it');
  assert.throws(
    () => vendor.vendorSelf(paths, { sourceRoot: fullSource() }),
    /EISDIR/,
    'the publish arm does not auto-repair an occupied destination either (unchanged from main)'
  );
  fs.rmSync(launcher, { recursive: true });
  vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  assert.ok(fs.statSync(launcher).isFile(), 'clearing the path first completes the recovery');
});

test('vendor: an upgrade (different source root) still publishes the new launcher', () => {
  const paths = tempPaths();
  vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  const launcher = vendor.launcherPath(paths);

  // What `wienerdog update` does: unpack <core>/app/<newver>, then run ITS bin.
  const newDir = path.join(paths.core, 'app', '9.9.9');
  vendor.copyTree(fullSource(), newDir);
  const pkg = JSON.parse(fs.readFileSync(path.join(newDir, 'package.json'), 'utf8'));
  pkg.version = '9.9.9';
  fs.writeFileSync(path.join(newDir, 'package.json'), JSON.stringify(pkg));
  fs.appendFileSync(path.join(newDir, 'src', 'scheduler', 'launcher.js'), '\n// NEW-LAUNCHER-9.9.9\n');

  const out = require(path.join(newDir, 'src', 'core', 'vendor.js')).vendorSelf(paths, {});
  assert.equal(out.version, '9.9.9');
  assert.equal(path.basename(fs.realpathSync(vendor.currentLink(paths))), '9.9.9');
  assert.equal(readsMarker(launcher, 'NEW-LAUNCHER-9.9.9'), true, 'the new version publishes its launcher');
});

test('vendor: a dev self-resync still re-publishes launch.js from the checkout', () => {
  const paths = tempPaths();
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-vendor-dev-'));
  vendor.copyTree(fullSource(), checkout);
  fs.writeFileSync(path.join(checkout, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
  vendor.vendorSelf(paths, { sourceRoot: checkout });
  assert.equal(vendor.installStance(paths), 'dev');

  fs.appendFileSync(path.join(checkout, 'src', 'scheduler', 'launcher.js'), '\n// DEV-EDIT\n');
  shimVendor(paths).vendorSelf(paths, {});
  assert.equal(readsMarker(vendor.launcherPath(paths), 'DEV-EDIT'), true, 'a maintainer edit still reaches launch.js');
});
```

Eight notes on that file, so nothing in it reads as accidental:

- `fullSource()` copies the **real** package (via the existing `copyTree`, the
  same idiom `tests/unit/launcher.test.js:36-42` uses) rather than a stub,
  because T1/T2/T4 must `require` `vendor.js` back **through** `app/current`.
  That is the whole mechanism under test; a stub source with no `src/core/` could
  not exercise it.
- `vendor.installStance` is `WP-stance-authority-containment` D1's export. T1 and
  T4 assert on it so the `!dev` gate is pinned to the canonical stance authority
  rather than to a local guess.
- `plantMarker` chmods before appending because `makeTreeFilesReadOnly` clears
  the write bits at publish. That is not a workaround — it is the attacker's
  actual step, and it is why the read-only publish is defence in depth rather
  than a boundary.
- Node's module cache is keyed by resolved realpath, and every test uses a fresh
  `mkdtemp` core, so `shimVendor` never returns another test's module.
- **T1's fresh-manifest block is the file's most load-bearing assertion and the
  easiest to mistake for redundancy.** It is the *only* place in the whole suite
  where `writeLauncher` records a manifest entry on the carry arm: every other
  `vendorSelf(` call site in `tests/` passes a fixture `sourceRoot`, so every one
  of them takes the publish arm. Delete it and the mutation Table M **M6**
  describes ships green. Do not "simplify" it into the earlier idempotence check.
- **T2's shape B uses a directory, not a mode-`000` file, on purpose.** `root`
  can read a mode-`000` file, so an `EACCES` fixture is flaky wherever CI runs as
  root; `EISDIR` is deterministic for every uid. Shape B's third assertion pins
  the publish arm's *unchanged* `EISDIR` throw — that is intentional, because
  "the recovery does not auto-repair an occupied destination" is a claim this
  spec makes in prose, and an unasserted claim is how the round-1 draft got the
  recovery wrong in the first place.
- **T2's `assert.throws` predicates gate the message fields, not just the error
  class.** `e.name === 'WienerdogError' && /launcher/.test(...)` would pass for
  `throw new WienerdogError('launcher')`, which carries none of the three fields
  Table L row 3 requires. Each predicate therefore checks the destination path,
  the `err.code`, and the literal recovery command separately.
- **T3 is not only an upgrade test — it is the live gate on *where* D9 binds
  `selfResync`.** D9 binds it **before** its `if (selfResync) / else if
  (isDevCheckout)` branch, i.e. before `repointCurrent`. Bind it *after*
  `repointCurrent` instead and the predicate is computed against the link this
  same call has just rewritten, so `wienerdog update`'s hand-off sync — which
  spawns `<core>/app/<newver>/bin/wienerdog.js sync` (`src/cli/update.js:45-48`)
  and repoints `current` to `<newver>` — becomes a self-resync, carries the old
  launcher forward, and `<core>/launcher/launch.js` freezes at the
  first-install version **forever**. Measured: a prototype with that placement
  turns T3 **red** and leaves T1, T2 and T4 green. So if T3 fails and nothing
  else does, look at the binding's position before you look at `writeLauncher`.
  Do not "simplify" T3's separate `<core>/app/9.9.9` source root away.

## Security checklist

- [ ] No untrusted identifier introduced by this WP flows into a filesystem path
      or a shell command. `carryForward` is a boolean computed in-process from
      two `realpath` comparisons; `dest` is `launcherPath(paths)`, built from
      `paths.core` by `path.join` with two literal segments and no user input.
      The one untrusted value in this region — `package.json`'s `version`,
      which reaches `path.join(appDir(paths), version)` — is validated by
      `WP-stance-authority-containment` D8 and is **not** touched here.
- [ ] The carry-forward arm reads exactly one path and it is not attacker-chosen:
      `<core>/launcher/launch.js`. It reads **nothing** from `sourceRoot` or
      `packageRoot()` (V3 greps for this).
- [ ] Fail-closed direction confirmed: an unreadable destination **throws**; it
      never falls back to the app tree (Table L row 3, AC5, T2).

## Acceptance criteria

Every criterion below has a mutation partner in Table M that reddens it.

- [ ] **AC1** — On a prod self-resync reached through `app/current`, an
      A7-scoped write to `<app tree>/src/scheduler/launcher.js` does **not**
      change `<core>/launcher/launch.js`; its bytes are identical before and
      after. (T1; Table L row 2)
- [ ] **AC2** — That same self-resync still succeeds: it returns a version and
      leaves `installStance(paths) === 'prod'`. The fix refuses nothing on the
      normal path. (T1)
- [ ] **AC3** — Running the self-resync twice is idempotent: `launch.js` bytes
      unchanged, no duplicate manifest entries. (T1; the existing
      `tests/unit/vendor.test.js:397` covers the duplicate-entry half on the
      publish arm and must pass unmodified)
- [ ] **AC4** — A **first install** still places `<core>/launcher/launch.js`,
      executable, with the `dir`-before-`file` manifest pair.
      `tests/unit/vendor.test.js:397` passes **unmodified**. (Table L row 1)
- [ ] **AC5** — On a prod self-resync with `<core>/launcher/launch.js`
      **unreadable for any reason**, `vendorSelf` throws a `WienerdogError` and
      **nothing** is written to that path. Both accepted shapes are covered:
      **absent** (`ENOENT`) and **present-but-unreadable** (a directory at that
      path, `EISDIR`). The message carries **all three** required fields — the
      absolute destination path, the `err.code`, and the literal
      `npx wienerdog@latest sync` — and each is asserted separately, not implied
      by the error class. (T2; Table L row 3)
- [ ] **AC6** — After AC5's `ENOENT` refusal, a `vendorSelf` from a **different**
      source root republishes `launch.js`, marker-free. **The bytes come from
      `packageRoot()`, not from that source root** — `vendorSelf` never forwards
      `sourceRoot` to `writeLauncher` (Current state §3, bytes-provenance note),
      so what the different source root buys is a falsy `carryForward` and
      therefore Table L row 1, not a change of byte source. Do not reword this
      as "restores it from the clean source": that reading is false, and
      *making* it true by forwarding `sourceRoot` is out of scope and would
      redden `tests/unit/vendor.test.js:412-413` (AC4). For the `EISDIR` shape
      that same run **also throws** — the recovery requires clearing the path
      first, and clearing it then completes. Both halves are asserted, because
      both are claimed in prose (Implementation notes → D1, Table L "Recovery
      from row 3"). (T2)
- [ ] **AC7** — A genuine upgrade — `<core>/app/9.9.9` acting as its own source
      root, the shape `src/cli/update.js:45-48` produces — repoints `current` to
      `9.9.9` and publishes the **new** launcher. This also pins **where D9 binds
      `selfResync`**: bound after `repointCurrent` instead of before its branch,
      this exact shape becomes a self-resync and `launch.js` would freeze at the
      first-install version forever (Test index, last note — measured red on a
      prototype with that placement). (T3; Table L row 1)
- [ ] **AC8** — A **dev** self-resync still publishes: a maintainer's edit to the
      checkout's `src/scheduler/launcher.js` reaches `<core>/launcher/launch.js`.
      (T4; Table L row 1, the `!dev` gate)
- [ ] **AC9** — Zero existing tests change. `node tests/run.js` reports `fail 0`
      and the diff touches only the two deliverable paths. (V2, V6)
- [ ] **AC10** — `writeLauncher`'s body does not recompute the self-resync
      predicate: no `selfResync`, `currentLink`, `installStance`, `isDevCheckout`
      or `realpath` inside it. (V3) — **review-enforced in addition**: a
      reviewer confirms `selfResync` and `dev` are D9's bindings, not new ones.
- [ ] **AC11** — ADR-0004 holds: `src/core/vendor.js` contains no
      `setInterval`, `setTimeout`, `spawn`, `fs.watch` or daemon. (V5)
- [ ] **AC12** — The **carry** arm records the launcher's manifest pair. Calling
      `vendorSelf` on a prod self-resync with a **fresh empty** manifest
      (`{version:1, createdAt:'', entries:[]}` — the shape `manifest.load`
      returns when `install-manifest.json` is absent,
      `src/core/manifest.js:446-457`) leaves **exactly one** `dir` entry for
      `<core>/launcher` and **exactly one** `file` entry for `launch.js`, with
      the `dir` at a lower index than the `file`. This is the only gate on the
      carry arm's recording anywhere in the suite; without it the manifest block
      can be moved onto the publish arm with every other gate staying green.
      (T1; Table L "both arms" row; mutation partner **M6**)

### Table M — mutation checks (apply to the FIXED tree; the named test must turn RED)

Each mutation was executed against the prototype; the measured result is in the
last column. Run these to prove the gates are not vacuous, then revert.

| # | Mutation | Must redden | Measured |
|---|---|---|---|
| M1 | `carryForward: selfResync && !dev` → `carryForward: false` | T1 **and** T2 | `pass 2 / fail 2`; T3 and T4 stay green |
| M2 | drop the gate: `carryForward: selfResync` | T4 only | `pass 3 / fail 1` |
| M3 | replace the `throw` in the carry arm with a fall-through to the publish arm | T2 | expected red (row 3 is the only assertion of it) |
| M4 | delete the `else` and always carry forward | **all four** — T3 and T4 are the *diagnostic* pair (they are the two that assert a publish must happen), but T1 and T2 fail too: their fixtures' **first install** then has no launcher to carry, so `writeLauncher` throws `ENOENT` before either test reaches its own assertion | **measured `pass 0 / fail 4`** |
| M5 | recompute the predicate inside `writeLauncher` instead of taking `opts.carryForward` | V3 (match count `0` → non-zero, **and its exit status `0` → `1`**) | executed on the equivalent shape: count `1`, `$?` = `1` |
| M6 | move the whole `if (opts.manifest) { … }` block **into** the `else` arm, next to the source read | **T1 only** — and that is the entire point: V1's other three tests, V2–V7, AC1–AC11 and M1–M5 all stay **green**, so T1's fresh-manifest assertion is the only thing standing between this mutation and a shipped uninstall bug | expected red (AC12 is its only assertion); the implementer confirms both halves — T1 red **and** everything else green |

M1, M2 and M4 were run end to end; M5's grep was run against both shapes. M3 and
M6 are listed with their expected reddening and are the implementer's to confirm.
For **M6, confirming that everything *else* stays green is as load-bearing as
confirming T1 goes red** — paste both.

## Verification steps (run these; paste output in the PR)

All commands are read-only except the test runs, which write only inside
`mkdtemp` directories. None touches `~/.wienerdog`, launchd, `gui/501` or a
fixed `/tmp` path. Run from the repo root.

**Read this before running any of them.** A verification step is the **exit
status of the whole pasted block**, not its printed output, and not the status of
some command inside it. This spec has now had that wrong twice, in two different
ways, and both survived a review:

1. **Round 1 — inversion.** `grep -c` prints `0` and exits **1** when it finds
   nothing, and prints `1` and exits **0** when it finds a match, so a naked
   `grep -cE …` "expect 0" gate failed on the correct state and passed on the
   violation, exactly backwards. V3 and V5 shipped that.
2. **Round 2 — masking.** The fix wrapped the logic in `bash -c '… exit 1 …'`
   and then appended `echo "V3 exit=$?"`. That **reads** correctly — a human sees
   `V3 exit=1` — but `echo` is the block's last command and it succeeds, so the
   block's own status is **`0` on a failing gate**. Measured on a red tree: the
   block printed `V4 exit=1` and exited `0`. V1, V3, V4, V5 and V7 all had it.
   It is the round-1 defect one level up: correct to a reader, **vacuous to
   anything checking status** — including a reviewer's `&&` chain, a CI step, and
   Definition of done item 1, which asks for pasted output a reviewer may trust
   *because* it says `exit=1`.

**The form every exit-code step below now uses**, and the form any new or edited
step must use — capture the status, print it, then **return it as the block's
final command**:

```bash
bash -c '
  …logic…
  if <violation>; then echo "Vn FAIL — …"; exit 1; fi
  echo "Vn PASS"
'
rc=$?; echo "Vn exit=$rc"; (exit $rc)
```

`(exit $rc)` is a subshell, so it sets the block's `$?` **without** killing an
interactive shell the way a bare `exit $rc` would. Each block below was
**executed in both the correct and the violating state**, and what was recorded
is the **block's own `$?`**, not the printed line. `! grep -q …` is deliberately
avoided: `set -e` does not abort on `! cmd`, a gotcha this project has already
been bitten by. **When you paste, paste the block's own `$?` too** — e.g. run it,
then `echo "block \$? = $?"` on the next line.

Sweep of all seven steps, for both defects, done across rounds 2 and 3:

| Step | Kind of gate | Round-1 inversion? | Round-2 masking? |
|---|---|---|---|
| V1 | `node tests/run.js` — nonzero exit on any failure | no | **yes — fixed below** |
| V2 | `node tests/run.js` — nonzero exit on any failure | no | n/a (no `exit=` line was appended) |
| V3 | was `grep -c`, "expect 0" | **yes — fixed round 2** | **yes — fixed below** |
| V4 | `grep -n`, "expect one line" — correct polarity, but the *count* was ungated | no inversion; count gated in round 2 | **yes — fixed below** |
| V5 | was `grep -c`, "expect 0" | **yes — fixed round 2** | **yes — fixed below** |
| V6 | `git diff --name-only` — always exits 0; a **list comparison**, not an exit-code gate. Stated as such so no one mistakes its exit 0 for a pass. The enforcing gate is CI's `boundary-check` | n/a | n/a |
| V7 | `npm run lint` — nonzero exit on any violation | no | **yes — fixed below** |

No eighth inversion and no further masking exists in the steps below; the sweep
that produced this table was re-run in round 3 over every block on the page.

**V1 — the four new tests pass.**

```bash
node tests/run.js tests/unit/vendor-selfresync.test.js
rc=$?; echo "V1 exit=$rc"; (exit $rc)
```

Expect `tests 4 / pass 4 / fail 0`, `V1 exit=0`, **and the block's own `$?` = 0**.
`tests/run.js` exits nonzero on any failure, so here the status and the counts
agree, unlike V3/V5. Measured both ways: against a passing file the block printed
`V1 exit=0` and exited **0**; against a deliberately failing test file it printed
`V1 exit=1` and exited **1**. It is still **four** tests: round 2 added
assertions to T1 and T2 rather than a fifth test, precisely so this count and
M1's measured `pass 2 / fail 2` stay literally true.

**Red inputs, three of them, each proving a different gate is live:** Table M's
M1 gives `pass 2 / fail 2`, the two failures being T1 and T2 by name; M4 gives
`pass 0 / fail 4` — T3 and T4 are the diagnostic pair, but T1 and T2 fail too
because their first install then has no launcher to carry (Table M, M4), so a
`writeLauncher` that simply never publishes does not satisfy V1 either; and
**M6 reddens T1 alone while every other gate in this spec stays green** — that is
the only signal separating a correct implementation from the uninstall bug
described in Implementation notes → D1.

**V2 — the whole suite still passes.**

```bash
node tests/run.js
```

Expect `fail 0`. Do not assert a literal test count: it depends on
`WP-stance-authority-containment`'s own test edits, which land first. **Red
input:** any change that reaches a non-self-resync path — e.g. M4 — reddens
`tests/unit/vendor.test.js:397`, the WP-157 launcher test, whose very first
`vendorSelf` is a first install that must publish and whose assertion at
`:412-413` requires the published bytes to equal `packageRoot()`'s launcher.
Under M4 it throws before reaching that assertion; either way it goes red.

**V3 — `writeLauncher` does not recompute the predicate (Table L, AC10).**

```bash
bash -c '
hits=$(awk "/^function writeLauncher/,/^}/" src/core/vendor.js \
  | grep -cE "selfResync|currentLink|installStance|isDevCheckout|realpath")
echo "V3 matches: $hits"
if [ "$hits" -ne 0 ]; then echo "V3 FAIL — writeLauncher recomputes the predicate"; exit 1; fi
echo "V3 PASS"
'
rc=$?; echo "V3 exit=$rc"; (exit $rc)
```

Correct state must print `V3 matches: 0` / `V3 PASS` / `V3 exit=0` **and the
block itself must exit 0**. **Red input:** an implementation that recomputes
`realpathSync(currentLink(paths))` inside `writeLauncher`. Executed against
exactly that shape — a scratch copy of `vendor.js` carrying D1+D2 plus a
`const cur = fs.realpathSync(currentLink(paths));` line inside the carry arm — the
block printed `V3 matches: 1` / `V3 FAIL` / `V3 exit=1` **and exited 1**. On the
same tree with that line removed it printed `V3 matches: 0` / `V3 PASS` /
`V3 exit=0` **and exited 0**. Both of the block's own statuses were measured;
that is what makes this a gate. For contrast, the round-2 form — identical but
ending `echo "V3 exit=$?"` — printed `V3 exit=1` on the red tree and **exited
0**.

Sanity-check the range extraction separately, because an awk range that silently
matched nothing would also print `0`:

```bash
awk '/^function writeLauncher/,/^}/' src/core/vendor.js | wc -l
```

Measured `28` on `main` today; after D1 it grows to roughly 40. It must be a
plausible function length — not `0`, not `1`, and not the file's line count.

**V4 — the call site is exactly the specified one (one occurrence each).**

```bash
bash -c '
for pat in "carryForward: selfResync && !dev" "if (opts.carryForward)"; do
  n=$(grep -cF "$pat" src/core/vendor.js)
  echo "V4 [$pat] = $n"
  if [ "$n" -ne 1 ]; then echo "V4 FAIL — expected exactly 1"; exit 1; fi
done
echo "V4 PASS"
'
rc=$?; echo "V4 exit=$rc"; (exit $rc)
```

Each pattern must count **exactly one**. `grep -cF` is fixed-string, so `&&` and
`!` are literal. Measured on a scratch tree carrying D1+D2: both counts `1`,
`V4 PASS`, `V4 exit=0`, **block exit 0**. **Red input:** a call site that passes
`carryForward: selfResync` (Table M's M2) makes the first count `0` — measured:
`V4 [carryForward: selfResync && !dev] = 0` / `V4 FAIL` / `V4 exit=1`, **block
exit 1**. A duplicated call site makes it `2` and fails the same way. This is the
block on which the round-2 masking was first measured: the same red tree with the
old `echo "V4 exit=$?"` ending printed `V4 exit=1` and **exited 0**.

**V5 — ADR-0004 (AC11).**

```bash
bash -c '
hits=$(grep -cE "setInterval|setTimeout|spawn|fs\.watch|daemon" src/core/vendor.js)
echo "V5 matches: $hits"
if [ "$hits" -ne 0 ]; then echo "V5 FAIL — ADR-0004: this WP starts nothing"; exit 1; fi
echo "V5 PASS"
'
rc=$?; echo "V5 exit=$rc"; (exit $rc)
```

Correct state must print `V5 matches: 0` / `V5 PASS` / `V5 exit=0` **and the
block must exit 0** — measured on `main`'s `src/core/vendor.js` and again on a
D1+D2 scratch tree. **Red input:** any retry timer or watcher added to the carry
arm. Measured with a `setTimeout(() => {}, 0);` inserted into the carry arm:
`V5 matches: 1` / `V5 FAIL` / `V5 exit=1`, **block exit 1**. As with V3, the
round-1 form exited `1` on the clean tree, and the round-2 form exited `0` on the
violating one.

**V6 — the permission boundary (AC9).** This one is a **list comparison, not an
exit-code gate**: `git diff --name-only` exits `0` whatever it prints, so its
exit status proves nothing. Read the list. The enforcing gate is CI's
`boundary-check`.

```bash
git diff --name-only main...HEAD
```

Expect exactly:

```
docs/specs/WP-launcher-no-self-resync-republish.md
src/core/vendor.js
tests/unit/vendor-selfresync.test.js
```

**Red input:** touching `src/scheduler/launcher.js` or `docs/THREAT-MODEL.md`
adds a line here and `boundary-check` rejects the PR.

**V7 — lint.**

```bash
npm run lint
rc=$?; echo "V7 exit=$rc"; (exit $rc)
```

Expect `V7 exit=0` **and block exit 0**. Measured both ways on this repo: clean
tree → `V7 exit=0`, block exit **0**; with a single markdownlint violation
introduced into this spec file → `V7 exit=1`, block exit **1**. Under the round-2
form the violating run printed `V7 exit=1` and exited **0**.

## Out of scope (do NOT do these)

- **`WP-stance-authority-containment` Table G row S2** (a module-level symlink or
  directory junction inside the app tree relocating `packageRoot()`, because Node
  resolves `__dirname` through symlinks) **and its general form** (the attended
  mint executes code out of the A7-writable tree). Both remain open. Cite that
  spec's row S2 and its Current state §10 by name; **do not restate them here or
  anywhere else** — nine review rounds went into that wording and paraphrasing it
  is the drift class it fought. Their disposition is structural and
  ADR-0028-level: **the owner's**, in an ADR this WP does not write.
- **`docs/THREAT-MODEL.md`.** Its A7 paragraph (`:370-373`) says the class A7
  covers "can neither re-register the OS scheduler entry nor **overwrite the
  launcher file**". That sentence is false before this WP and — because row S2,
  the code-substitution form, and **Residual R-dev** all survive it — **still
  false after it**. Leaving it false is the correct restraint, not an evasion:
  no edit this WP could make would be a correction, it would be a paraphrase of
  an unratified residual. Routed to the owner with the ADR above.
- **`docs/GLOSSARY.md`.** The **independent launcher** entry (`:28`) states where
  the file lives and what it verifies. Nothing in it is falsified by this WP.
- **`src/scheduler/launcher.js`**, including the `refuse()` banner at `:442-443`
  whose remedy text amplifies this defect. The sibling
  `WP-refusal-remedy-discriminator` is in flight on that file. Do not open it —
  not even to read. One consequence of *this* WP lands in *that* one and is
  recorded in the fail-closed paragraph of Implementation notes → D1 (which holds
  the canonical wording): after this change `wienerdog sync` no longer refreshes
  `<core>/launcher/launch.js` **on a prod self-resync entered through
  `app/current`** — and the banner's remedy is reached by exactly that run — so
  that WP's replacement remedy text must not promise launcher repair. Carrying
  that across is the owner's, not this implementer's.
- **Any dev-side guard for Residual R-dev.** It is stated, accepted and
  owner-routed in its own block above. Adding a guard here would be exactly the
  additive move the last bullet forbids, and it would break T4.
- **`docs/specs/WP-stance-authority-containment.md`.** Do not flip a status, do
  not mark row S1 closed, do not add a note. Recording that the routing is closed
  is the owner's act on a `Ready` spec.
- **`src/cli/sync.js`, `src/cli/adopt.js`, `src/cli/update.js`.** All three reach
  this code path and none needs an edit; the returned shapes are unchanged.
- **`memory/lessons/inbox.md`.** `CLAUDE.md` forbids editing it on a WP branch
  (parallel branches conflict on merge). Report your lessons as bullets in the PR
  body instead. `scripts/boundary-check.js:48` currently allows the path anyway —
  that is a boundary-check bug, not permission; do not rely on it, and do not fix
  it here.
- **Any additional guard** on the app tree. The project's record is that additive
  guards relocate this defect class and subtractive ones close it; this WP is a
  subtraction and must stay one. If you find another route, raise it as a
  discovered issue — do not defend it here.

## Definition of done

1. All verification steps V1–V7 pass locally; output pasted into the PR body,
   including the V3, V4 and V5 counts **with their `exit=` lines**, and the V6
   file list. A step pasted without its exit status does not count as run.
   **Each of V1, V3, V4, V5 and V7 must be pasted with the block's own `$?`, not
   only its printed `exit=` line** — those two disagreed in round 2 (the printed
   line said `1` while the block exited `0`), and the block's `$?` is the gate.
   Run each block, then `echo "block \$? = $?"` on the following line and paste
   that too. V2 and V6 are exempt: V2's status is the bare `node tests/run.js`
   exit, and V6 is a list comparison whose exit status proves nothing.
2. Table M's M1, M2 **and M6** run and reverted, with their measured pass/fail
   counts pasted into the PR body under "Mutation checks". For M6, paste both
   halves: T1 red, and V1's other three tests plus V2–V7 still green.
3. Conventional commits; PR titled
   `fix(vendor): carry the launcher forward on a self-resync (WP-launcher-no-self-resync-republish)`.
4. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.
6. The PR body states, in one line and without paraphrasing that spec's wording:
   *"Closes `WP-stance-authority-containment` Table G row S1. Row S2 and its
   general form remain open and owner-routed."* Whether row S1 is then marked
   closed on that `Ready` spec is the owner's call, not this PR's.
7. The PR body carries **Residual R-dev** and the three disclosures below forward
   to the owner, verbatim from this spec, under "Discovered issues" — they are
   accepted here but not ratified anywhere, and this PR is where they enter the
   owner's queue (four bullets in total):
   - **R-dev** — on a dev install the launcher is still published from the
     checkout, so an actor limited to writing that one file still becomes the
     fire-time verifier at the next attended sync. Accepted for the workflow
     (T4); disposition beyond acceptance is ADR-0028-level and the owner's.
   - **The carried-forward corrupt launcher** — after this WP a prod self-resync
     silently carries a readable-but-corrupt `launch.js` forward; `sync` reports
     success while every scheduled fire keeps failing. Forced by the design, not
     chosen. Recovery is `npx wienerdog@latest sync`.
   - **The cross-WP consequence** — `wienerdog sync` no longer refreshes
     `<core>/launcher/launch.js` **on a prod self-resync entered through
     `app/current`** (it still refreshes it on every other shape, which is why
     `npx wienerdog@latest sync` is the recovery). Since the refusal banner's
     remedy is reached by the shim'd `wienerdog sync`, which **is** that
     self-resync, `WP-refusal-remedy-discriminator`'s remedy text must not
     promise launcher repair.
   - **A refused `adopt` persists a launcher-less manifest** — `adopt` saves the
     manifest at `src/cli/adopt.js:387` *before* calling `vendorSelf` at `:392`,
     so unlike `sync` a refused run leaves a manifest on disk that names the
     vendored tree but not `<core>/launcher`. Not a regression in kind (`main`
     throws from the same call site), but this WP makes the throw far more
     reachable. Recorded, not fixed — `adopt.js` is not a deliverable.
