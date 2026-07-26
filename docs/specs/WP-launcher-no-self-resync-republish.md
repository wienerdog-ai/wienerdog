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
legitimate upgrade is not a self-resync (its source root differs: an npx cache, a
newer `<core>/app/<version>` spawned by `wienerdog update`, a global install, a
reinstall), and those republish exactly as they do today. The behaviour change is
confined to the case where re-publishing was pure risk with zero benefit.

**The dependency is real, not notional.** This WP does not compute the
self-resync predicate; it **consumes D9's**. D9 introduces `selfResync` and the
containment-derived `dev` inside `vendorSelf`, immediately above the
`writeLauncher` call. Recomputing either would create a second copy of a
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
change was run through a six-shape matrix. Measured results:

| shape | after the change |
|---|---|
| first install (no `app/current` yet) | `launch.js` placed, stance `prod`, `copied=true` |
| prod self-resync, marker planted in the tree | marker **absent**; `launch.js` bytes **byte-identical** to before; stance still `prod`; sync succeeds |
| prod self-resync, run twice | still byte-identical (idempotent) |
| prod self-resync, `launch.js` deleted first | `WienerdogError` thrown, nothing published; a later run from a different source root restores a marker-free copy |
| upgrade: `<core>/app/9.9.9` spawned as its own source root | `current` repointed to `9.9.9`, the **new** launcher published |
| dev self-resync, maintainer edits the checkout's `launcher.js` | edit **is** published (workflow preserved) |

The same matrix on **unmodified `main`** reports the marker present in
`<core>/launcher/launch.js` after one prod self-resync — the red input.

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
(Table L row 3, executed).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/vendor.js | **D1** — `writeLauncher` gains the `carryForward` option and the carry-forward arm (Table L). **D2** — the `writeLauncher(…)` call at the end of `vendorSelf` passes `carryForward: selfResync && !dev`, reusing `WP-stance-authority-containment` D9's two existing bindings, and the call-site comment above it is corrected. **D3** — the false clause in `writeLauncher`'s JSDoc is **deleted** (Implementation notes → D3; it is a deletion, not a repair). Nothing else in the file: `vendorSelf`'s branch structure, `installStance`, `isDevCheckout`, `readVersion`, `repointCurrent`, `copyTree`, `makeTreeFilesReadOnly`, `writeShim`, `verifyCurrentContainment`, `launcherPath`, `recordOnce`, `COPY_INCLUDE` and the module's `require`s are untouched. |
| create | tests/unit/vendor-selfresync.test.js | **T1–T4** (Test index). Four tests, verbatim in this spec. Picked up automatically — `tests/run.js` shells out to `node --test` with no path filter, so `tests/unit/*.test.js` is auto-discovered. |

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
 * @throws {WienerdogError} carryForward with no readable existing launcher
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

Worked examples (all four are acceptance criteria):

```
prod install, sync through the shim, tree launcher tampered  ⇒ launch.js unchanged
prod install, sync through the shim, launch.js deleted       ⇒ WienerdogError, nothing written
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
| 3 | **true**, and `<core>/launcher/launch.js` is missing or unreadable | the same single read, which throws | nothing | **throws `WienerdogError`** (fail closed) |
| — | **both arms** | — | the `dir`-then-`file` manifest pair via `recordOnce`, exactly as today | idempotent; `recordOnce` never duplicates |

| Fact | Value |
|------|-------|
| **Who decides `carryForward`** | `vendorSelf`, as `selfResync && !dev` — both bindings are `WP-stance-authority-containment` D9's, already in scope |
| **Recomputation** | forbidden — `writeLauncher`'s body must not mention `selfResync`, `currentLink`, `installStance`, `isDevCheckout` or `realpath` (V3 greps for this) |
| **Precedence** | `carryForward: true` wins over `sourceRoot`; `sourceRoot` is ignored, not merged |
| **Why `!dev`** | a dev install's `app/current` **is** the maintainer's checkout, and its descriptor binds the reduced digest that never hashes app code (ADR-0028 amendment #7), so nothing is defended by carrying forward and a real workflow is broken by it. The gate is safe because `dev` is containment-derived (D9), and D8+D9 make containment unreachable by an A7-scoped **data** write |
| **First install** | `carryForward` is falsy — D9's `selfResync` catches the unresolvable `app/current` and yields `false`. Row 1 applies; placement is unchanged (T-existing, `tests/unit/vendor.test.js:397`) |
| **Manifest** | recorded on **both** arms. Skipping the call instead of passing the flag would drop the only recorder of the `<core>/launcher` dir + `launch.js` file entries (Current state §1a), and an install whose manifest lacks them leaves `<core>` non-empty at uninstall (`vendor.js:277-280`) |
| **Recovery from row 3** | any attended run whose source root is not the install's own tree — e.g. `npx wienerdog@latest sync`. That is not a self-resync, so row 1 applies and a clean `launch.js` is published |
| **Not closed by this WP** | `WP-stance-authority-containment` **Table G row S2** and the general form recorded in that spec's Current state §10. Cited, never restated |

### Mirrored Surface Checklist

Table L is the single place `writeLauncher`'s publish decision is decided. Every
surface below mirrors it; a review finding updates Table L **and every mirror in
the same pass**, and any new mirror found in review is registered here on the
spot.

- [ ] **Deliverables-table cells** — the `src/core/vendor.js` row (D1/D2/D3) and
      the `tests/unit/vendor-selfresync.test.js` row.
- [ ] **Exact contracts** — the `writeLauncher` JSDoc block and the call-site
      snippet.
- [ ] **Acceptance criteria** — AC1–AC8.
- [ ] **Verification commands / greps** — V1 (the four tests), V3 (the
      no-recomputation greps), V4 (the call-site grep).
- [ ] **Current-state description** — §3's six-shape matrix table.
- [ ] **Operative prose steps** — Implementation notes D1, D2, D3.
- [ ] **Test bodies** — T1–T4 in the Test index (each asserts one Table L row).
- [ ] **Shipped JSDoc prose in `src/`** — the `carryForward` `@param` text and
      the corrected call-site comment; these ship to users' disks and are the
      mirror most likely to drift.
- [ ] **The citation of `WP-stance-authority-containment` Table G rows S1/S2** —
      registered per that spec's own discipline. It appears in Context, in
      Table L's last row, in Implementation notes D3, and in Out of scope. Every
      one of those four is a **citation by name**, never a restatement; if a
      review finds a fifth, register it here rather than paraphrasing again.

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
        'Reinstall from a clean source, e.g. `npx wienerdog@latest sync`.'
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
path, and its `err.code` is what the message reports. Executed: a missing path
gives `ENOENT`, a directory gives `EISDIR`.

**The fail-closed choice, made deliberately and stated.** The alternative —
re-publish from the tree when the destination is gone — would hand an attacker a
one-line bypass of this entire WP (delete the file, then wait for the next
attended sync), turning the fix into a speed bump. The cost is that a prod
install whose `<core>/launcher/launch.js` was deleted now fails its `sync` with a
clear message instead of silently self-repairing. That cost is acceptable and
recoverable: the file's absence already breaks every scheduled fire (the OS entry
invokes a path that does not exist), so the install is broken either way, and the
message names a recovery that works — a run from a source root that is not the
install's own tree takes Table L row 1 and republishes (executed, T2's second
half). The throw happens **after** `repointCurrent`, which on a self-resync
carries the same target forward, so a refused sync leaves the install exactly as
it found it.

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
mint executes out of the tree it is vendoring). Those remain open and
owner-routed.

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
 * which is why `carryForward` exists. The residual channels are known-open and
 * owner-routed: see WP-stance-authority-containment, Table G rows S1/S2.
 * Idempotent (skip when byte-identical); records a `file` manifest entry once;
 * mode 0755 (POSIX).
```

That replacement asserts no security property. Do not add one.

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
});

test('vendor: a prod self-resync with launch.js missing fails closed and publishes nothing', () => {
  const paths = tempPaths();
  const r = vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  const launcher = vendor.launcherPath(paths);
  plantMarker(path.join(paths.core, 'app', r.version, 'src', 'scheduler', 'launcher.js'), 'A7-PLANT-DELETED');
  fs.rmSync(launcher);

  assert.throws(
    () => shimVendor(paths).vendorSelf(paths, {}),
    (e) => e.name === 'WienerdogError' && /launcher/.test(e.message),
    'refuses rather than re-publishing from the tree it is re-vendoring'
  );
  assert.equal(fs.existsSync(launcher), false, 'nothing was published');

  // Recovery: a run from a DIFFERENT source root is not a self-resync and restores it.
  vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  assert.ok(fs.statSync(launcher).isFile(), 'a clean source root restores launch.js');
  assert.equal(readsMarker(launcher, 'A7-PLANT-DELETED'), false, 'restored from the clean source');
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

Four notes on that file, so nothing in it reads as accidental:

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
- [ ] **AC5** — On a prod self-resync with `<core>/launcher/launch.js` deleted,
      `vendorSelf` throws a `WienerdogError` whose message mentions the launcher,
      and **no** file is written to that path. (T2; Table L row 3)
- [ ] **AC6** — After AC5's refusal, a `vendorSelf` from a **different** source
      root restores `launch.js` from that clean source, marker-free. (T2)
- [ ] **AC7** — A genuine upgrade — `<core>/app/9.9.9` acting as its own source
      root, the shape `src/cli/update.js:45-48` produces — repoints `current` to
      `9.9.9` and publishes the **new** launcher. (T3; Table L row 1)
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

### Table M — mutation checks (apply to the FIXED tree; the named test must turn RED)

Each mutation was executed against the prototype; the measured result is in the
last column. Run these to prove the gates are not vacuous, then revert.

| # | Mutation | Must redden | Measured |
|---|---|---|---|
| M1 | `carryForward: selfResync && !dev` → `carryForward: false` | T1 **and** T2 | `pass 2 / fail 2`; T3 and T4 stay green |
| M2 | drop the gate: `carryForward: selfResync` | T4 only | `pass 3 / fail 1` |
| M3 | replace the `throw` in the carry arm with a fall-through to the publish arm | T2 | expected red (row 3 is the only assertion of it) |
| M4 | delete the `else` and always carry forward | T3 **and** T4 | expected red |
| M5 | recompute the predicate inside `writeLauncher` instead of taking `opts.carryForward` | V3's grep (prints `0` → prints non-zero) | executed on the mutated shape: `4` |

M1 and M2 were run end to end; M5's grep was run against both shapes. M3 and M4
are listed with their expected reddening and are the implementer's to confirm.

## Verification steps (run these; paste output in the PR)

All commands are read-only except the test runs, which write only inside
`mkdtemp` directories. None touches `~/.wienerdog`, launchd, `gui/501` or a
fixed `/tmp` path. Run from the repo root.

**V1 — the four new tests pass.**

```bash
node tests/run.js tests/unit/vendor-selfresync.test.js
```

Expect `tests 4 / pass 4 / fail 0`. **Red input:** apply Table M's M1 — measured
`pass 2 / fail 2`, with the two failures being T1 and T2 by name. This gate
cannot pass vacuously: T3 and T4 fail under M4, so a `writeLauncher` that simply
never publishes does not satisfy V1.

**V2 — the whole suite still passes.**

```bash
node tests/run.js
```

Expect `fail 0`. Do not assert a literal test count: it depends on
`WP-stance-authority-containment`'s own test edits, which land first. **Red
input:** any change that reaches a non-self-resync path — e.g. M4 — reddens
`tests/unit/vendor.test.js`'s WP-157 launcher test, which asserts the published
bytes equal `packageRoot()`'s launcher.

**V3 — `writeLauncher` does not recompute the predicate (Table L, AC10).**

```bash
awk '/^function writeLauncher/,/^}/' src/core/vendor.js \
  | grep -cE "selfResync|currentLink|installStance|isDevCheckout|realpath"
```

Expect `0`. **Red input:** an implementation that recomputes
`realpathSync(currentLink(paths))` inside `writeLauncher` prints a non-zero count
— measured `4` against the equivalent shape (the same grep over `vendorSelf`'s
body, which legitimately does contain the predicate, prints `4`). Sanity-check
the range extraction with `awk '/^function writeLauncher/,/^}/' src/core/vendor.js | wc -l`,
which must be a plausible function length (≈40), not `1` and not the whole file.

**V4 — the call site is exactly the specified one.**

```bash
grep -n "carryForward: selfResync && !dev" src/core/vendor.js
grep -n "if (opts.carryForward)" src/core/vendor.js
```

Each must print **exactly one** line. **Red input:** a call site that passes
`carryForward: selfResync` (M2) prints nothing for the first grep.

**V5 — ADR-0004 (AC11).**

```bash
grep -cE "setInterval|setTimeout|spawn|fs\.watch|daemon" src/core/vendor.js
```

Expect `0` (measured `0` on `main` and on the fixed prototype). **Red input:**
adding any retry timer to the carry arm prints a non-zero count.

**V6 — the permission boundary (AC9).**

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
```

Expect a clean exit.

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
  launcher file**". That sentence is false before this WP and — because row S2
  and the code-substitution form survive it — **still false after it**. No edit
  this WP could make would be a correction; it would be a paraphrase of an
  unratified residual. Routed to the owner with the ADR above.
- **`docs/GLOSSARY.md`.** The **independent launcher** entry (`:28`) states where
  the file lives and what it verifies. Nothing in it is falsified by this WP.
- **`src/scheduler/launcher.js`**, including the `refuse()` banner at `:442-443`
  whose remedy text amplifies this defect. A sibling WP is in flight on that
  file. Do not open it.
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
   including the V3, V4 and V5 counts and the V6 file list.
2. At least Table M's M1 and M2 run and reverted, with their measured
   pass/fail counts pasted into the PR body under "Mutation checks".
3. Conventional commits; PR titled
   `fix(vendor): carry the launcher forward on a self-resync (WP-launcher-no-self-resync-republish)`.
4. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.
6. The PR body states, in one line and without paraphrasing that spec's wording:
   *"Closes `WP-stance-authority-containment` Table G row S1. Row S2 and its
   general form remain open and owner-routed."* Whether row S1 is then marked
   closed on that `Ready` spec is the owner's call, not this PR's.
