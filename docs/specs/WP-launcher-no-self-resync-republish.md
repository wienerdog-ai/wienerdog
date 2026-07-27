---
id: WP-launcher-no-self-resync-republish
title: Stop a self-resync from re-publishing the out-of-tree launcher out of the app tree
status: Ready
model: sonnet
size: S
depends_on: [WP-stance-authority-containment]
adrs: [ADR-0004, ADR-0013, ADR-0028, ADR-0031]
epic: audit-a7
---

# WP-launcher-no-self-resync-republish: a self-resync carries the launcher forward

> **DISPATCH STATUS — 2026-07-27: READY and DISPATCHABLE.** `depends_on` is now
> satisfied: `WP-stance-authority-containment` merged (`86d069e`, PR #113) and is
> `Done`. Both adversarial review legs returned APPROVE — **wd-reviewer at
> round 2, Codex at round 3** — with no class-(a) or class-(b) findings
> outstanding.
> **Amended 2026-07-27 (round 6), after a first dispatch was stopped by a
> confirmed spec bug.** The dependency's merge added a test —
> `tests/unit/vendor.test.js`'s **T12** — whose fixture hand-builds
> `<core>/app/current` and calls `vendorSelf` **through** it with no
> `sourceRoot`. That is a self-resync under D9, so D1/D2/D3 as written send it
> down the carry arm, whose single read of `<core>/launcher/launch.js` throws
> `ENOENT` because that fixture never published a launcher. Current state §4's
> claim that no existing test is a self-resync was **read at `d2b1981`, before
> the dependency landed, and is false on today's `main`**; §4 is corrected below
> and re-verified at `d1c96e1`. The amendment adds **one** deliverable —
> `tests/unit/vendor.test.js`, with a fixture-setup-only edit spelled out
> verbatim in Implementation notes → **D4** — and re-derives AC4, AC9, V2, V6 and
> the Test index note that rested on the false claim. **D1, D2 and D3 are
> unchanged**: the fix is still a pure subtraction, and no guard was added to the
> carry arm. Measured with D1+D2+D3 verbatim plus D4 on `d1c96e1`:
> `tests 1681 / pass 1676 / fail 0 / skipped 5`.
> Four items are **routed to the owner and non-blocking**, reviewed and accepted
> as such by both legs: **Residual R-dev**, the carried-forward-corrupt-launcher
> disclosure, the refused-`adopt` manifest-ordering disclosure, and the cross-WP
> constraint on `WP-refusal-remedy-discriminator`. All four ride along in the PR
> body (Definition of done item 7); none is a precondition for starting.

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
`docs/specs/WP-stance-authority-containment.md` (status `Done` since `d1c96e1`;
it was `Ready` when this WP was drafted) records this
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

§1, §2, §3 and §5 were read at commit `d2b1981` and, where they are behavioural
claims, **executed** during drafting. Their line numbers are that commit's — i.e.
**before** `WP-stance-authority-containment` landed. That WP edits `vendorSelf`'s
body, so the line numbers inside `vendorSelf` have shifted; the anchors you need
are the function names and the literal code below, not the numbers.

**§4 is different and you must read it.** It was rewritten in round 6 at commit
`d1c96e1` — `main` **with** the dependency merged — because its `d2b1981`
version made a claim about the test suite that the dependency's own merge
falsified. Everything in §4 was re-executed at `d1c96e1`.

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

### 4. Existing tests: exactly ONE goes red, and its fixture is the reason

**This section replaces a false claim. Read the correction, not the memory of
it.** The `d2b1981` draft said, "verified by grep over all `vendorSelf(` call
sites in `tests/`: every one of them passes an explicit `sourceRoot` … so no
existing test is a self-resync," and concluded that no existing test file is a
deliverable. **That is false on `main` today.** It was true of the tree it was
read on and the dependency's own merge falsified it — the very test that trips is
one `WP-stance-authority-containment` added. The spec was never re-verified
against its dependency's merged tree; this section is that re-verification.

**The grep, re-run at `d1c96e1`.** `grep -rn "vendorSelf(" tests/` returns **27**
call sites. **Four** pass no `sourceRoot`, and all four are therefore
`root = packageRoot()`, `require`d **through** `<core>/app/current`, so
`realpath(current) === realpath(root)`. **All four are self-resyncs under D9's
predicate in every execution**, and **each of the four reaches Table L's carry
arm in at least one execution** once D2 ships. Executed, not reasoned: a probe
`throw` planted in the carry arm fires from every one of the four.

**Static call sites are not executions, and the difference matters here.**
Three of the four are prod in **every** execution and so always take the carry
arm. The fourth — `tests/unit/vendor.test.js:673` — is a **single** call site
that T12 executes **five** times through its `run()` helper, and those five
executions split:

| T12 shape | `app/current` resolves | `installStance` | `carryForward` | Arm |
|---|---|---|---|---|
| `contained-clean`, `contained-plant-git`, `contained-bad-version` | inside `<core>/app` | `prod` | `selfResync && !dev` = **true** | **carry** — the blocker |
| `outside-clean`, `outside-plant-git` | **outside** `<core>/app` (a `<base>/checkout`) | `dev` | **false** | **publish** (Table L row 1) |

So "all four take the carry arm" is true of call sites, **not** of every
execution: T12 additionally has two **dev / publish-arm** executions, and the
probe result above is a per-call-site result, not a per-execution one. This is
also why **D4 publishes the launcher for all five shapes rather than only the
contained three** — the two dev executions must keep taking the publish arm
undisturbed, and they do, because the publish arm simply overwrites the file D4
placed (Implementation notes → D4, first bullet).

| Call site | Test / case it belongs to | Does the carry arm trip? | Why |
|---|---|---|---|
| `tests/unit/vendor.test.js:673` | **T12** — *"vendor: an attended sync carries containment forward or refuses — no DATA-shaped A7 write moves it"* (`:636`), inside its `run()` fixture helper (`:650-679`) | **YES — this is the blocker** (in its **three prod executions**; its two dev executions take the publish arm — see the shape table above) | `run()` hand-builds the core: it `copyTree`s the repo into `start`, `fs.symlinkSync(start, <core>/app/current)`, and calls `vendorSelf` — **without ever performing a first install**. Nothing has published `<core>/launcher/launch.js`, so the carry arm's single `fs.readFileSync(dest)` throws `ENOENT`, `vendorSelf` throws `WienerdogError`, `run()`'s `catch` records `after = 'REFUSED'`, and `:697` (`assert.equal(base.after, base.before, 'contained-clean is carried forward unchanged')`) fails with `'REFUSED' !== true` on the `contained-clean` shape |
| `tests/unit/launcher.test.js:161` | **T8** — *"launcher: plant .git + one attended sync ⇒ still prod, and an app-code tamper is refused with a durable C3 alert"* (`:155`) | no | Its fixture `setupProd()` (`:44-65`) runs a **real first install** at `:50` — `vendor.vendorSelf(paths, { sourceRoot: prodSource(), env: {} })` — which takes Table L row 1 and publishes `<core>/launcher/launch.js`. The carry arm's read then succeeds |
| `tests/scenarios/a7-integrity/fixtures/cases.js:151` | case **`3a-plant-git-prod`** | no | Its fixture `buildInstall()` (`tests/scenarios/a7-integrity/fixtures/build.js:108`) runs the same real first install with an explicit `sourceRoot`, publishing the launcher before the case's `mutate` ever self-resyncs |
| `tests/scenarios/a7-integrity/fixtures/cases.js:163` | case **`3b-plant-git-tamper`** | no | Identical shape and identical fixture to `3a` |

The distinction is not "self-resync or not" — all four are, in every execution.
Nor is it "carry arm or not" — every one of the four reaches it. It is **"does
the fixture model a real installed core"**: three of them do, because a real
install always has an out-of-tree launcher, and the fourth does not.

**Measured at `d1c96e1`, three ways. All three are `node tests/run.js` WITHOUT
this WP's new test file**, so the totals are directly comparable and the only
moving number is the failure:

| Tree | Result |
|---|---|
| `main`, unmodified | `tests 1681 / pass 1676 / fail 0 / skipped 5` |
| `main` + D1 + D2 + D3 verbatim, **no** fixture change | `tests 1681 / pass 1675 / fail 1 / skipped 5` — the single failure is `tests/unit/vendor.test.js:697`, `'REFUSED' !== true` |
| `main` + D1 + D2 + D3 verbatim + **D4** | `tests 1681 / pass 1676 / fail 0 / skipped 5` — identical to unmodified `main` |

Add T1–T4 and every total rises by four; that is what the first dispatch
measured on its own branch (`tests 1685 / pass 1679 / fail 1 / skipped 5`, the
same single failure).

The **scenario** suite is a separate gate — `.github/workflows/scenarios.yml`
sets `WIENERDOG_RUN_SCENARIOS=1`, which `node tests/run.js` does **not** — so it
was run separately. `WIENERDOG_RUN_SCENARIOS=1 node
tests/scenarios/a7-integrity/run-a7-integrity.js` with D1+D2+D3 applied prints
`PASS` and exits `0`, cases `3a`/`3b` included. **The scenario suite needs no
fixture change.**

Two consequences, and they are the whole of the amendment:

1. **`tests/unit/vendor.test.js` IS a deliverable** — with one tightly scoped,
   fixture-setup-only edit, spelled out verbatim in Implementation notes →
   **D4** and permitted by **Deliverables row 3**. No assertion in that file may
   change.
2. **No code change follows from this.** `D1`, `D2` and `D3` are unchanged, and
   **no guard was added to the carry arm**. This was checked, not assumed: the
   third row above is D1/D2/D3 exactly as this spec writes them. The fix stays a
   subtraction.

**The `EISDIR` half of the same shape was checked too**, because "the carry arm
throws" is not by itself the failure — a fixture whose `<core>/launcher` is
occupied would fail the same way. It is not: `run()` creates nothing at that path
at all.

`tests/unit/vendor.test.js:397` (*"vendor: writeLauncher places launch.js OUTSIDE
app/, records dir+file, idempotent (WP-157)"*) is **not** the test that moves and
must still pass **unmodified** — it is this WP's proof that the non-self-resync
path is untouched, including the first-install placement (Table L row 1) and the
`dir`-before-`file` manifest order. D4's edit lands at roughly `:659`, after it,
so `:397` and `:412-413` do not even shift.

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
| modify | tests/unit/vendor.test.js | **D4 — a FIXTURE-SETUP-ONLY edit inside T12's `run()` helper, and nothing else in the file.** Added round 6 because D1/D2/D3 redden this file's T12 (Current state §4); it is the only existing test they redden. The verbatim edit — seven added lines, zero removed, zero changed — is in Implementation notes → **D4**, which is the single place it is decided; this cell defers to it and must not restate it. **The hard limit, gated by V8:** this file at `HEAD` must be **byte-for-byte `main`'s file plus D4's block, inserted once at D4's anchor** — V8 reconstructs it and `diff`s. Nothing else, anywhere in the file, may move: not an assertion, not a helper, not a comment, not an import, and not an *added* line outside the block. Every assertion in T12 — including `:697`'s `contained-clean is carried forward unchanged`, `:700`–`:702`, and the `before`-shape oracle guards at `:688-693` — stays byte-identical, so what T12 proves is unchanged (Implementation notes → D4, "What D4 must not weaken"). Do **not** touch any other test in this file: `:397` and its `:412-413` assertion are AC4's proof and must pass unmodified. **V8 is deliberately not a diff-shape check** — "purely additive and `assert`-free" was V8's round-6-rejected first form, and a purely additive, `assert`-free line can make T12 vacuous (V8, red arm (a)). |

Not deliverables, deliberately: `src/scheduler/launcher.js` (a sibling WP owns
its refusal banner — do not open it), `src/cli/sync.js`, `src/cli/adopt.js`,
`src/cli/update.js`, `src/core/manifest.js`, `tests/unit/launcher.test.js`,
`tests/scenarios/a7-integrity/**` (including its `fixtures/`),
`docs/THREAT-MODEL.md`, `docs/GLOSSARY.md`, `docs/adr/**`,
`docs/specs/WP-stance-authority-containment.md`, and **`memory/lessons/inbox.md`**.
See Out of scope for each. Several of them contain tests that must pass
**unmodified** — that is this WP's proof that nothing else moved. In particular
`tests/unit/launcher.test.js:161` and
`tests/scenarios/a7-integrity/fixtures/cases.js:151,163` **are** self-resyncs and
**do** take the carry arm, and they pass **without any edit** because their
fixtures perform a real first install first (Current state §4). If you find
yourself wanting to change one of them, the implementation is wrong — stop and
say so.

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
| **Recomputation** | forbidden — `writeLauncher`'s body must not mention `selfResync`, `currentLink`, `installStance`, `isDevCheckout` or `realpath`. **V3 screens the source text for this; the wd-reviewer diff read ESTABLISHES it.** **T1–T4 do not** — a behaviour-preserving recomputation (bindings threaded through `opts`) leaves all four green, measured. See "V3 and V4 are TEXT-LEVEL SCREENS" |
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

- [ ] **Deliverables-table cells** — the `src/core/vendor.js` row (D1/D2/D3),
      the `tests/unit/vendor-selfresync.test.js` row, and the
      `tests/unit/vendor.test.js` row (**D4**, registered in round 6).
- [ ] **D4, the T12 fixture amendment** — registered in round 6. Its one
      canonical locus is **Implementation notes → D4**, which holds the verbatim
      edit, the option-weighing, and the non-vacuity measurements. It has
      **six** mirrors, all citation-only: (1) the Deliverables `tests/unit/vendor.test.js`
      row, (2) **Current state §4**, (3) **AC4**, (4) **AC9**, (5) **V6 + V8**,
      (6) **Table M row M7**. The dispatch-status banner names it without
      operative wording — a name-only citation, not a seventh mirror. A genuine
      seventh gets registered here on the spot rather than restated.
      **Mirror (5) carries D4's block verbatim a second time**, inside V8's
      heredoc — unavoidable, because V8 must *compute* the expected file to
      assert the invariant rather than a proxy for it. **The verbatim block
      exists in exactly two places — D4's snippet and V8's heredoc — and a change
      to either is a change to both in the same pass.** A round-6 review found a
      **third** copy (a "so that the region reads…" example inside D4) that this
      registration had omitted; it was **deleted**, not registered, so the count
      here is now the whole truth. Anyone adding a third copy must delete it or
      register it here instead. The duplication is safe in the one direction that
      matters: if the copies disagree, V8 fails on a *correct* implementation
      rather than passing on a wrong one.
- [ ] **Exact contracts** — the `writeLauncher` JSDoc block and the call-site
      snippet.
- [ ] **Acceptance criteria** — AC1–AC12 (AC12 is the carry arm's manifest
      recording, registered in round 2; **AC4 and AC9 were re-derived in round 6**
      and now defer to D4 for what "unmodified" excludes).
- [ ] **Verification commands / greps** — **V0 (the Step-0 clean-tree
      precondition, added round 6 — it is the gate that makes every other one
      describe `HEAD` rather than the working tree)**, V1 (the four tests),
      **V3 and V4 — TEXT-LEVEL SCREENS since round 11, NOT proofs of AC10 or the
      call-site contract. Since round 12 the attribution is narrower still: the
      establishing evidence is the **wd-reviewer diff read alone**, because
      **T1–T4 establish behavioural arm semantics only** and stay green under a
      behaviour-preserving recomputation (measured). The registered mirrors of
      that qualification are **eight**, enumerated because a round-13 review
      found this list short at seven and the missed surface was contradicting the
      round-12 table: (1) **AC10**, (2) **AC11**, (3) **Table L's
      "Recomputation" row**, (4) **Table M row M5**, (5) the
      **Security-checklist** V3 citation, (6) the Implementation-notes
      "V3 screens…" line, (7) the **V3/V4 PASS-line texts** that ship inside the
      blocks, and (8) **V4's red-arm row for the string/template-literal
      residual** — the one that was missed, registered here on the spot. A ninth
      gets registered here rather than left to drift; any surface claiming a
      behavioural test proves a source-form contract is a defect** — **V8 (the
      `tests/unit/vendor.test.js` HEAD-blob reconstruction, added round 6)**.
      V0's requirement is mirrored in **Definition of done item 1** and in the
      **mutation-sweep caveat in item 2**; V8's local path-scoped clean check is
      a registered *backstop* for V0, not a second source of the rule.
      **Every one of them is
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
- [ ] **Residual R-dev** — its own block above, plus **seven** citing surfaces,
      enumerated because a round-3 review found the count stale at "four":
      (1) Table L's "Why `!dev`" row, (2) Table L's "Not closed by this WP" row,
      (3) Implementation notes → **D3**, (4) the Out-of-scope
      **`docs/THREAT-MODEL.md`** bullet, (5) the Out-of-scope **dev-side guard**
      bullet, (6) **Definition of done item 7**, (7) the **dispatch-status
      banner** at the head of this spec, registered at the `Ready` flip — a
      name-only citation that carries no part of R-dev's treatment. An eighth
      gets registered here on the spot.
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
      three. The **dispatch-status banner** names this constraint as a routed,
      non-blocking item and deliberately carries **no** operative wording; it is
      a name-only citation, registered here at the `Ready` flip so it is not
      mistaken for a fourth copy.

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
inputs. V3 **screens** the source text for a recomputation; the **wd-reviewer
diff read** is what establishes it. T1–T4 do **not** — a recomputation that
threads D9's bindings through `opts` preserves every behaviour they observe and
leaves all four green (measured; see "V3 and V4 are TEXT-LEVEL SCREENS").

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

### D4 — the T12 fixture amendment (`tests/unit/vendor.test.js`)

**This subsection is the single place D4 is decided.** The Deliverables row, AC4,
AC9, V6, V8, M7 and the Mirrored Surface Checklist all defer to it; none of them
restates the edit.

**Why it exists.** D1/D2/D3 redden exactly one existing test —
`tests/unit/vendor.test.js`'s **T12**, at `:697` on its `contained-clean` shape,
with `'REFUSED' !== true`. Current state §4 has the full mechanism and the three
measured suite runs. In one line: T12's `run()` helper hand-builds
`<core>/app/current` and self-resyncs through it **without ever performing a
first install**, so nothing has published `<core>/launcher/launch.js` and the
carry arm's single read throws `ENOENT`.

**Why the fixture is what moves, and not the spec or the code.** Three options
were weighed and the choice is recorded here rather than left open:

1. **Except the failing shape in AC9/V2's expectations.** **Not viable.** `npm
   test` runs the whole suite in CI on every PR and on `main`; a red test cannot
   be excepted by spec prose. Rejected.
2. **Add a guard to the carry arm** — e.g. fall back to publishing when `dest` is
   absent. **Rejected, and it is the one thing this WP must never do**: it is
   precisely the one-line bypass the fail-closed paragraph above exists to
   refuse (delete the file, wait for the next attended sync). It would also
   contradict Table L row 3, AC5 and T2. The subtraction stays a subtraction.
3. **Amend the fixture so its "contained" shapes model a REAL installed core.**
   **Chosen.** T12's own intent — from its own WP, `WP-stance-authority-containment`
   AC16 — is *"an attended `sync` carries containment forward, or refuses"*. An
   **attended sync of an installed core** is what it models, and a real installed
   core **always** has an out-of-tree launcher, because the first install
   published one. The fixture was simply missing a piece of the shape it claims
   to build. Fixing that is a correction to the fixture, not a concession by the
   test.

**The verbatim edit.** In `run()`, insert these **seven** lines **immediately
after** the anchor line

```js
    fs.symlinkSync(start, path.join(app, 'current'));
```

(which is `run()`'s only occurrence, and V8 gates that it occurs exactly once),
so they land between it and `const before = contained(core);`:

```js
    // A real installed core always has the out-of-tree launcher a first install
    // published. This fixture hand-builds the core, so publish it by hand.
    fs.mkdirSync(path.join(core, 'launcher'), { recursive: true });
    fs.copyFileSync(
      path.join(REPO, 'src', 'scheduler', 'launcher.js'),
      path.join(core, 'launcher', 'launch.js')
    );
```

*(Round 6 review note: a "so that the region reads…" example block used to
follow, showing the anchor and the block together. It was **deleted** — it was a
**third** verbatim copy of the block, and the spec's own drift argument only
accounted for two. The anchor line above plus V8's exactly-once check pin the
location without it. Subtraction over addition, which is this WP's whole thesis.)*

Six details in it are deliberate:

- **It is in `run()`, so it applies to all five shapes**, not only the contained
  ones. A real dev install also has a published launcher (Table L row 1 publishes
  on dev), so making only the contained shapes realistic would be a new asymmetry.
  On the `outside-*` shapes `carryForward` is falsy and the publish arm overwrites
  this file anyway — harmless either way.
- **`REPO` is `run()`'s enclosing `const REPO = vendor.packageRoot();`** (`:637`),
  already in scope. Add no new binding, no new `require`, no new helper.
- **The bytes are `packageRoot()`'s `src/scheduler/launcher.js`** — byte-identical
  to what `writeLauncher`'s publish arm would have written on a real first
  install in this same process, since that arm also reads `packageRoot()`
  (Current state §3, bytes-provenance). So the fixture models the real thing, not
  a stand-in.
- **`fs.mkdirSync(..., { recursive: true })` first**, because `<core>/launcher`
  does not exist; `copyFileSync` would throw `ENOENT` on the directory.
- **No mode is set.** T12 never executes or stats this file — the carry arm only
  reads it. Do not add a `chmod`; it would be unused ceremony.
- **Placed before `const before = contained(core)`** for readability only.
  `contained()` inspects `<core>/app` and `<core>/app/current` and can never see
  `<core>/launcher`, so the placement is not load-bearing — but keep it there so
  the whole core-construction block reads as one unit.

**What D4 must not weaken — checked by execution, not by argument.** T12 proves
three things and D4 changes none of them, because **no assertion in the file
moves**: the two clean baselines are carried forward unchanged (`:697`, `:698`),
a planted `.git` does not move containment (`:700`, `:702`), and a tampered
version refuses rather than moving it (`:701`); the `before`-shape oracle guards
at `:688-693` are likewise untouched. Non-vacuity was re-measured against
`WP-stance-authority-containment`'s **own** mutation rows for T12 — its row 9
(`readVersion`: delete the validation) and row 10 (`vendorSelf`: delete the
`selfResync` branch, falling through to `isDevCheckout`) — applied to
**unmodified `main`**, each run twice, with and without D4:

| Dependency mutation | `main`, no D4 | `main` + D4 |
|---|---|---|
| row 9 — `readVersion` validation deleted | `pass 29 / fail 1`, the failure being `tests/unit/vendor.test.js:636` (T12) | **identical** |
| row 10 — `selfResync` branch deleted | `pass 29 / fail 1`, same test | **identical** |

D4 also leaves T12 **green on unmodified `main`** (`tests 30 / pass 30 / fail 0`
for the whole file), so the edit is behaviour-neutral without this WP and is not
smuggling in a second change.

**Nothing else in the file may change.** No assertion, no other test, no import,
no helper — **and no added line outside the block either**. V8 is the exit-code
gate, and it does not check the *shape* of the diff: it reconstructs
`main`'s file plus this block at this anchor and requires `HEAD`'s file to equal
it byte for byte. A purely additive, `assert`-free line is still a V8 failure —
deliberately, because such a line is exactly what can make T12 vacuous (V8, red
arm (a), measured).

**V8 carries this block verbatim a second time**, in its heredoc, because it has
to compute the expected file. **Those are the only two copies, and that is now
true rather than merely asserted**: a round-6 review counted **three** — the two
above plus a "so that the region reads…" example block that used to sit right
here — so the third was deleted rather than registered. Both survivors are
registered in the Mirrored Surface Checklist. **Change one and you change the
other in the same pass** — including the comment lines and the indentation,
which are part of the byte comparison. The duplication is safe in the one
direction that matters: if the copies drift, V8 goes red on a *correct*
implementation rather than green on a wrong one.

### General constraints

- **ADR-0004 (IRON RULE): Wienerdog is just files.** This WP starts nothing, and
  V5 greps for it. No retry timer, no watcher, no "repair later" queue.
- No new npm dependency, no new `require` in any file, no new export.
- Do not touch `src/scheduler/launcher.js`. A sibling WP owns its refusal banner
  and is in flight; opening that file is an automatic REQUEST-CHANGES here.
- Do not edit `docs/specs/WP-stance-authority-containment.md`. Recording that
  its Table G row S1 is closed is the owner's act — and now that that spec is
  `Done`, editing it is doubly not an implementer's call.
- Scratch fixtures live in `fs.mkdtempSync(path.join(os.tmpdir(), …))` — never a
  fixed `/tmp` path, never inside the repo, never touching `~/.wienerdog`,
  launchd, or `gui/501`. The four tests below already follow this, and so does
  **D4**: its two writes land under `core`, which T12's `run()` derives from that
  test's own `fs.mkdtempSync(path.join(os.tmpdir(), 'wd-syncinv-'))` root.
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
  where `writeLauncher` records a manifest entry on the carry arm. **The reason
  was restated in round 6, because the original one was false** — it said "every
  other `vendorSelf(` call site in `tests/` passes a fixture `sourceRoot`, so
  every one of them takes the publish arm", and Current state §4 shows four call
  sites take the **carry** arm. The claim survives on a different and verified
  fact: **none of those four passes a `manifest`.** Re-checked at `d1c96e1` —
  `tests/unit/vendor.test.js:673` passes `{}`, `tests/unit/launcher.test.js:161`
  passes `{ env }`, and `tests/scenarios/a7-integrity/fixtures/cases.js:151,163`
  pass `{ env: fx.env }`. With no `manifest`, `writeLauncher`'s
  `if (opts.manifest)` block never runs, so none of them reaches the recording
  and none of them can catch **M6**. Delete this block and the mutation Table M
  **M6** describes ships green. Do not "simplify" it into the earlier idempotence
  check.
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
      `packageRoot()`. T1 establishes the **observable** half — a marker planted
      in the app tree never reaches `launch.js` — which is what this checklist
      item is about. The **source-form** half ("the body mentions neither") is
      screened by V3 and established by the reviewer diff read, not by any test.
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
      executable, with the `dir`-before-`file` manifest pair. The test that
      proves it — `tests/unit/vendor.test.js:397`, *"vendor: writeLauncher places
      launch.js OUTSIDE app/, records dir+file, idempotent (WP-157)"*, including
      its `:412-413` assertion that the published bytes are `packageRoot()`'s —
      passes **unmodified**. *(re-derived in round 6)* "Unmodified" now means
      **unmodified except the T12 fixture change specified in Deliverables row 3
      (Implementation notes → D4)**, which is a different test in the same file
      and lands after `:397`, so that test's lines do not even shift. The
      **file** is a deliverable; **this test** is not permitted to move, and V8
      gates that no assertion anywhere in the file moves. (Table L row 1)
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
- [ ] **AC9** — *(re-derived in round 6 — it used to read "Zero existing tests
      change", which D1/D2/D3 make impossible; see Current state §4.)* **Exactly
      one** existing test file changes — `tests/unit/vendor.test.js` — and only
      in the way Deliverables row 3 licenses: the T12 fixture-setup edit of
      Implementation notes → **D4**, purely additive, with **no assertion added,
      removed or altered** anywhere in the file — V8 proves the stronger form,
      that `HEAD`'s file **is** `main`'s file plus D4's block and nothing else.
      No other existing test file
      changes at all; in particular `tests/unit/launcher.test.js` and
      `tests/scenarios/a7-integrity/**` are self-resyncs that pass **unedited**
      (Current state §4). `node tests/run.js` reports `fail 0`, and the diff
      touches only the **three** deliverable paths. (V2, V6, V8)
- [ ] **AC10** — `writeLauncher`'s body does not recompute the self-resync
      predicate: no `selfResync`, `currentLink`, `installStance`, `isDevCheckout`
      or `realpath` inside it. *(Evidence re-derived in round 11 and **corrected
      again in round 12**, after a review showed the round-11 attribution was
      still too generous.)* This is a **source-form** contract, and its violation
      can be **behaviour-preserving** — threading D9's bindings through `opts`
      and branching inside the function leaves **T1–T4 green**, measured
      (`tests 4 / pass 4 / fail 0`). So:
      **T1–T4 establish the behavioural arm semantics ONLY and do not establish
      this criterion.** The **establishing evidence is the wd-reviewer
      merge-gate diff read**, which this repo's double gate makes mandatory and
      which confirms `selfResync` and `dev` are D9's bindings, not new ones.
      **V3 is a text-level SCREEN**: it caught that exact mutation (measured,
      FAIL exit 1) but cannot see syntax, so a token inside a string literal is
      invisible to it. Do not cite V3 alone, and do not cite T1–T4, for this
      criterion.
- [ ] **AC11** — ADR-0004 holds: `src/core/vendor.js` contains no
      `setInterval`, `setTimeout`, `spawn`, `fs.watch` or daemon. Also a
      **source-form** criterion: **V5 is a text-level screen** and **T1–T4 do not
      establish it** — a daemon started outside the arms the tests exercise would
      leave them green. The establishing evidence is the same **wd-reviewer diff
      read**.
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
| M5 | recompute the predicate inside `writeLauncher` instead of taking `opts.carryForward` | **V3 as a screen** (match count `0` → non-zero, **and its exit status `0` → `1`**), and **the reviewer's diff read** as the establishing evidence. **NOT T1–T4** | *(row corrected in round 12 — it previously claimed T1–T4 must redden, and its recorded measurement had only ever run V3.)* Executed on the canonical behaviour-preserving shape — `writeLauncher(paths, { manifest: opts.manifest, selfResync, dev })` with `if (opts.selfResync && !opts.dev)` inside: **T1–T4 stay GREEN**, `tests 4 / pass 4 / fail 0`. **V3 FAIL, `$?` = 1**, naming `if (opts.selfResync && !opts.dev) {`; **V4 FAIL, `$?` = 1**, call-site literal count `0`. A recomputation written so the screens cannot see it leaves *every* automated gate green — only the diff read catches that class |
| M6 | move the whole `if (opts.manifest) { … }` block **into** the `else` arm, next to the source read | **T1 only** — and that is the entire point: V1's other three tests, V2–V7, AC1–AC11 and M1–M5 all stay **green**, so T1's fresh-manifest assertion is the only thing standing between this mutation and a shipped uninstall bug | expected red (AC12 is its only assertion); the implementer confirms both halves — T1 red **and** everything else green |
| M7 | revert **D4** — remove the seven lines from T12's `run()` helper **in the working tree, uncommitted**, leaving D1/D2/D3 in place | **V2 red and V8 red — for two different reasons, and the difference is the whole point of this cell.** **V2** is the real signal: `tests/unit/vendor.test.js:636` (**T12**) fails at `:697` with `'REFUSED' !== true`, which is what proves D4 load-bearing. **V8** goes red at its **dirty-path guard** (`… has uncommitted changes`), because M7 is by procedure an *uncommitted* edit — V8 never reaches a blob comparison, so **that red is NOT evidence about the reconstruction invariant** and must not be reported as if it were. **V0 is red too**, for the same procedural reason. V1, V3, V4, V5 and V7 stay green. The committed-state reconstruction failure is **V8 red arm (e)**, which is spec-validation evidence collected under the scratch-worktree procedure beside that arm — **not** something M7 produces. **M7 is also NOT a substitute for V8's red arm (a)**: a vacuity line added alongside D4 keeps M7 green (V8's "Does M7 catch it?" row) | **measured on `d1c96e1`**: `tests 1681 / pass 1675 / fail 1 / skipped 5` without D4, versus `1681 / 1676 / 0 / 5` with it (both counts taken without T1–T4) |

M1, M2 and M4 were run end to end; M5's grep was run against both shapes; **M7
was run end to end in round 6**, and its counterpart — D4's non-vacuity against
`WP-stance-authority-containment`'s own T12 mutation rows 9 and 10 — is measured
in Implementation notes → D4. M3 and M6 are listed with their expected reddening
and are the implementer's to confirm.
For **M6, confirming that everything *else* stays green is as load-bearing as
confirming T1 goes red** — paste both.

## Verification steps (run these; paste output in the PR)

All commands are read-only except the test runs, which write only inside
`mkdtemp` directories. None touches `~/.wienerdog`, launchd, `gui/501` or a
fixed `/tmp` path. Run from the repo root.

### V0 — Step 0: the tree must be clean before ANY evidence is collected

**Run this first, and re-run everything below it if it ever fails.** It is not
hygiene; it is the precondition that makes every other step mean what it says.

```bash
node <<'V0EOF'
'use strict';
// V0 — every gate below must describe the COMMITTED HEAD.
// execFileSync THROWS on a nonzero exit and on a missing binary, and there is no
// shell and no pipeline here, so a failed probe cannot read as a benign result.
// An uncaught throw IS the fail-closed path. There are no catch blocks by design.
const { execFileSync } = require('node:child_process');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 });

// (1) Index flags first: `git status` deliberately ignores worktree changes to
// files marked assume-unchanged or skip-worktree, so a clean status proves
// nothing while any tracked file carries one. Tag letters, verified by execution
// on git 2.39.5: `h` assume-unchanged, `S` skip-worktree, `s` both.
const flagged = git('ls-files', '-v').split('\n').filter((l) => /^([a-z]|S) /.test(l));
if (flagged.length) {
  console.error("V0 FAIL — tracked files carry assume-unchanged / skip-worktree index flags. git status cannot see edits to them, so a clean tree would prove nothing. Clear them with 'git update-index --no-assume-unchanged <path>' / '--no-skip-worktree <path>', then re-run ALL steps. Flagged:");
  console.error(flagged.join('\n'));
  process.exit(1);
}

// (2) Untracked files count as dirty: porcelain reports them as `??`, and an
// untracked replacement is another way to make a gate read what HEAD lacks.
const st = git('status', '--porcelain').trim();
if (st !== '') {
  console.error('V0 FAIL — the tree has uncommitted or untracked changes; every verification result below must describe the committed HEAD. Commit or stash, then re-run ALL steps.');
  console.error(st);
  process.exit(1);
}

console.log(`V0 PASS — no index flags, index and worktree clean; every result below describes ${git('rev-parse', 'HEAD').trim()}`);
V0EOF
rc=$?; echo "V0 exit=$rc"; (exit $rc)
```

**Why this exists — the hole it closes, measured.** V1–V5, V2b and V7 all
**execute or inspect working-tree code**; only V8 reads a committed blob, and
until round 6 its clean-tree guard was scoped to `tests/unit/vendor.test.js`
alone. That leaves a bypass which was **executed end to end**: commit a bad
`src/core/vendor.js` — Table M's **M2** (`carryForward: selfResync`, dropping the
`!dev` gate) — then restore that one file in the working tree **without
committing**, leaving `vendor.test.js` clean. Measured on that exact state:

| Gate | Result on the masked bad `HEAD` |
|---|---|
| **V0** | **FAIL, exit 1** — it prints the porcelain line for `src/core/vendor.js` (status `M`) |
| V1 | `tests 4 / pass 4 / fail 0` — green |
| V2 | `tests 1685 / pass 1680 / fail 0 / skipped 5` — green |
| V3 | `0` matches — green |
| V4 | both counts `1` — green |
| V5 | `0` matches — green |
| V6 | exactly the four allowed paths — green |
| V7 | `lint exit=0` — green |
| V8 | `V8 PASS`, exit 0 — green (HEAD's **test** blob really is `main` + D4) |

Every gate but V0 passes while `HEAD` is broken. That the `HEAD` is genuinely
broken was confirmed separately: checked out unmasked, the same commit gives
`tests 4 / pass 3 / fail 1`, the failure being T4 — M2's exact signature. Without
V0 that `HEAD` is pushable with a full sheet of green evidence.

**The index-flag check, and why it comes first.** `git status` **deliberately
ignores** worktree changes to files marked `assume-unchanged` or `skip-worktree`,
so an empty porcelain proves nothing while any tracked file carries one. That
turns the whole of V0 into a formality, and it was **measured**: on the same
masked-M2 shape as above, but with `git update-index --skip-worktree
src/core/vendor.js` set after committing M2 and restoring the good bytes,
`git status --porcelain` printed **nothing** and the round-5-interim V0 (porcelain
only) printed `V0 PASS` and exited **0** over a `HEAD` carrying M2.

| State | V0 without the flag check | V0 with it |
|---|---|---|
| M2 committed, good bytes restored locally, `--skip-worktree` set | `V0 PASS`, exit **0** | `V0 FAIL … Flagged:` / `S src/core/vendor.js`, exit **1** |
| same, but `--assume-unchanged` set instead | `V0 PASS`, exit **0** | `V0 FAIL … Flagged:` / `h src/core/vendor.js`, exit **1** |
| flags cleared, tree clean (worktree really *is* the bad `HEAD`) | `V0 PASS`, exit 0 | `V0 PASS`, exit **0** — correctly, and V1 then goes red (`pass 3 / fail 1`, T4) |

**A degraded `git` cannot read as "no flags".** `execFileSync` throws on any
non-zero exit and on a missing binary, so the probe's failure and its benign
result are not the same event. Measured with a `git` shim that fails **only**
`ls-files` while `git status` keeps working — the decisive shape, because a
blanket failure would be caught later anyway — and with `git` broken outright:

| Degraded dependency | The shell forms this replaced | Current Node form |
|---|---|---|
| `git ls-files -v` fails, `git status` fine, tree clean | `V0 PASS — no index flags, index and worktree clean…`, exit **0** — a false claim | throws `Command failed: git ls-files -v`, exit **1** |
| `git` broken outright | — | throws, exit **1** |
| not a git repository at all | — | throws `fatal: not a git repository`, exit **1** |

There is no filter process to break: the flag scan is a `String.split` and a
regex inside the same process, so there is no second status to lose. This is the
round-9 language change (see the "Why the five multi-stage gates are Node"
section above) — two successive shell forms of this exact check false-PASSed,
first by `|| true` over a pipeline and then by an unchecked `printf` feeding a
`grep` that returned 1 on empty input.

The tag letters were **verified by execution on git 2.39.5**, not recalled:
`git ls-files -v` prints `h` for assume-unchanged, `S` for skip-worktree, and
`s` when both are set — hence the `^([a-z]|S)` alternation plus a literal space,
where the lowercase class also covers `s`. `H` (normal) and the other uppercase
tags are states `git status` can already see, so they are deliberately not
matched.

**Two more details are deliberate.** `git status --porcelain` reports
**untracked** files as `??`, so a stray new file counts as dirty — correct,
because an untracked replacement is another way to make a gate read something
`HEAD` does not contain. And a **failure of `git status` itself** fails closed
rather than reading as "clean" — structurally now, because `execFileSync` throws
rather than returning a status somebody has to remember to inspect.

### What V0 defends, and what it explicitly does not — read this before filing another bypass

**V0 and V8 defend the ACCIDENTAL failure classes**: a dirty tree, a forgotten
commit, a stale run, a mutation left in place after a sweep, an index flag set
weeks ago for an unrelated reason. Those are the classes that have **actually
occurred in this repository's history**, and they are the ones the measured red
arms above reproduce.

**They do not, and cannot, defend against an implementer deliberately
constructing evasive local state.** Index flags are one instance; a
`.git/info/exclude` entry, a doctored `diff` on the PATH, a filesystem overlay,
or simply a fabricated paste are others, and the list has no end. **Self-collected
evidence is inherently defeasible by its collector** — no gate an implementer
runs on their own machine can close that, because the gate and the adversary are
the same process. Hardening V0 further is a race with no fixed point, and this
project has already paid for learning that twice.

**The structural defence is elsewhere in the process, and it is mandatory**: the
**wd-reviewer merge-gate leg independently re-runs every gate in a fresh
checkout materialised from the pushed branch.** Index flags live in
`.git/index`, which is **not** pushed; `.git/info/exclude` is not pushed; a
local PATH is not pushed. None of the masked states above can survive into the
reviewer's run — in each of them the pushed `HEAD` is the broken one, and a
fresh checkout of it fails V1/V2 immediately.

So, by declaration: **findings of the form "here is a more exotic way an
implementer could evade V0 locally" are out of scope for V0.** They are not
denied — they are real, and they are all real — they are *dispositioned*: the
remedy is the independent re-run, which already exists and is not optional. A
reviewer who wants assurance about `HEAD` should read the reviewer's run, not
the implementer's paste. Do not add a further local guard for this class without
an ADR that first explains what changed about that disposition.

**Everything below assumes V0 passed in the same session.** If you commit
anything after running V0 — including the spec's own `status:` flip — re-run V0
and every step under it. Evidence collected before a later commit describes a
`HEAD` that no longer exists.

### The exit-status discipline every other step follows

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

Sweep of all steps, for both defects, done across rounds 2 and 3 and extended in
round 6 to the two steps that round added (**V2b** and **V8**):

| Step | Kind of gate | Round-1 inversion? | Round-2 masking? |
|---|---|---|---|
| V0 | no tracked file may carry an `assume-unchanged` / `skip-worktree` index flag, `git status --porcelain` must be empty, and any `git` failure must fail closed. **Added round 6**; index-flag check added round 7; **rewritten in Node round 9** | **no — structurally.** It is a Node script: `execFileSync` throws on any `git` failure, and the flag scan is an in-process regex, so there is no second status to capture and none to swallow | no — ends `rc=$?; … (exit $rc)` |
| V1 | `node tests/run.js` — nonzero exit on any failure | no | **yes — fixed below** |
| V2 | `node tests/run.js` — nonzero exit on any failure | no | n/a (no `exit=` line was appended) |
| V3 | was `grep -c`, "expect 0" | **yes — fixed round 2** | **yes — fixed below** |
| V4 | `grep -n`, "expect one line" — correct polarity, but the *count* was ungated | no inversion; count gated in round 2 | **yes — fixed below** |
| V5 | was `grep -c`, "expect 0" | **yes — fixed round 2** | **yes — fixed below** |
| V6 | `git diff --name-only` — always exits 0; a **list comparison**, not an exit-code gate. Stated as such so no one mistakes its exit 0 for a pass. The enforcing gate is CI's `boundary-check` | n/a | n/a |
| V7 | `npm run lint` — nonzero exit on any violation | no | **yes — fixed below** |
| V2b | `run-a7-integrity.js` — nonzero exit on any failure. **Added round 6** (the scenario gate `node tests/run.js` does not run) | no — written in the fixed form from the start | no — ends `rc=$?; … (exit $rc)` |
| V8 | exact in-process reconstruction of `HEAD`'s blob, behind a clean-tree precondition. **Four forms across rounds 6–9**: (1) two `grep -c` diff-shape counts — admits the vacuity counterexample, red arm (a); (2) asserted the invariant but compared the **working tree**, so a bad `HEAD` masked by an uncommitted edit passed — red arm (f); (3) read `git show HEAD:…` and refused a dirty tree, but its heredoc `cat` and reconstruction `awk` were unchecked, so a failing `cat` made a missing-D4 `HEAD` compare equal; (4) **Node** — blobs via `execFileSync`, D4's block a literal array, reconstruction and comparison in-process | **no — structurally.** Every external call throws on failure; there is no temp file, no filter process, and no status to forget | no — ends `rc=$?; … (exit $rc)` |

### The third defect class: a probe whose failure is indistinguishable from a benign result

**A sweep claim in this spec has now been falsified once, and the correction is
recorded rather than quietly replaced.** An earlier round asserted that "no
status-swallowing construct remains" after grepping the page for `|| true`. That
searched for a **construct**; the defect is a **property**, and a review then
found five more instances the grep could not see. What follows is the sweep
**method**, so the claim below is checkable rather than asserted.

**The property.** A step is defective when a *failure of one of its own probes*
produces the same output and status as a *benign result*. Three concrete shapes
were searched for, block by block, over **every** fenced `bash` block on this
page:

| | Shape | Why it false-PASSes |
|---|---|---|
| **(a)** | a command substitution whose status is never read — including one written **inside `[ … ]`**, e.g. `[ -n "$(git status …)" ]` | the command fails with empty stdout, the test reads "empty", the guard is skipped |
| **(b)** | a pipeline where an upstream stage's failure surfaces only as a downstream **count or empty string**, e.g. `awk … \| grep -c …` | `awk` dies, `grep` counts `0` over nothing, the step reports "0 matches" and passes |
| **(c)** | a numeric test on a possibly-empty variable, e.g. `[ "$n" -ne 1 ]` with `n=""` | bash errors `integer expression expected` and returns 2; **inside an `if` that reads as FALSE**, so the guard is skipped |

**Result of the sweep, block by block. All twelve fenced `bash` blocks were
examined; nothing was skipped.** *(Round 9 note: the five blocks marked "found,
fixed" below were subsequently **rewritten in Node** — the shell fixes described
in their Detail cells are the history that motivated the language change, not the
code that ships. See "Why the five multi-stage gates are Node" immediately after
this table.)*

| Block | Verdict | Detail |
|---|---|---|
| **V0** | **1 found, fixed** | `$(git rev-parse HEAD)` interpolated into the PASS line, status unread — shape (a). Now assigned to `head` with `hrc` checked. (Its two earlier probes were already split.) |
| *form template* | clean — not executable | the `…logic…` illustration of the `rc=$?; … (exit $rc)` shape |
| **V1** | clean | a bare `node tests/run.js …` whose status *is* the gate |
| **V2** | clean | bare `node tests/run.js`; its exit is the gate |
| **V2b** | clean | bare scenario runner + `rc=$?` |
| **V3** | **3 found, fixed** | shape (b): `awk … \| grep -c` — an `awk` failure became `0 matches`; shape (c): an unrunnable `grep` left `hits` empty; **and a vacuity hole neither Codex nor the `\|\| true` grep names** — an `awk` range that *succeeds* but extracts **nothing** also yields `0 matches`, which is not evidence. Now: `awk` status checked, extraction asserted **non-empty**, `grep` status split, count validated numeric |
| *awk sanity block* | clean — not a gate | the human-read `awk … \| wc -l` range check. It stays: it is the reader's cross-check on the same vacuity V3 now closes structurally |
| **V4** | **1 found, fixed** | shape (c): an unrunnable `grep` left `n` empty and the loop continued to PASS. Now `grc` split (`>1` fails closed) and `n` validated numeric |
| **V5** | **1 found, fixed** | shape (c), identical to V4 — and it also covers a **missing file**, which makes `grep` exit 2 with empty stdout |
| **V6** | clean — not a gate | `git diff --name-only`, a list comparison; the enforcing gate is CI `boundary-check` |
| **V8** | **4 found, fixed** | shape (a): `[ -n "$(git status --porcelain -- …)" ]` discarded the status, so a failing `git status` with empty stdout bypassed the **clean-tree precondition entirely** — the instance the round-6 review cited. Plus `mktemp -d`, and **both** `git show` redirections, whose statuses were unread. All now assigned-then-checked; the anchor count is additionally validated numeric |
| **V7** | clean | bare `npm run lint` + `rc=$?` |

**Ten defects across five blocks**, every one of them measured red-then-green
(the degraded-probe table under each step). The two blocks that are *not*
exit-code gates — the `awk` sanity check and V6 — are called out as such rather
than counted clean by omission.

### Why the five multi-stage gates are Node, not shell

**A sweep claim on this page has now been falsified three times, each by
execution, and the third one ended the approach rather than patching it.**

1. A claim based on grepping for `|| true` missed five instances that wore other
   constructs.
2. The shape-based sweep above fixed those — and its own fixes introduced new
   producers: `printf '%s\n' "$lsout" | grep …` saved only `grep`'s status, so a
   failing `printf` fed `grep` empty input, `grep` returned 1, and V0 read that
   as "no flags" — **executed: `V0 PASS`, exit 0, with a flagged file present.**
   The identical shape reappeared in V3.
3. V8's reconstruction had the same defect one layer down: the heredoc `cat` and
   the reconstruction `awk` were unchecked, so a failing `cat` left an empty
   block file, `awk` inserted nothing, the reconstruction equalled `main`, and a
   `HEAD` missing D4 compared **equal** — **executed on real blobs: `V8 PASS`.**

The pattern is the finding. **In shell, fail-open is the default**: every stage
added to satisfy the last review is a new producer whose failure reads as a
benign value, so the class regenerates from its own fixes. Per this project's
rule — *when a check keeps drawing findings, it is testing a proxy; ask what fact
it stands for* — the fact is: **any probe failure must be indistinguishable from
nothing except a loud non-zero exit.** That is the *default semantics of a real
language*, not something to assemble stage-by-stage in `sh`.

So the five gates that do multi-stage probing — **V0, V3, V4, V5, V8** — are now
**Node scripts**, fed to `node` on **stdin via a quoted heredoc** (no temp file,
no `cat`, no intermediate producer; if the heredoc cannot be set up the command
itself fails). Node ≥ 18 is already this repo's floor. They use only
`child_process.execFileSync` — which **throws** on a nonzero exit and on a
missing binary, with **no shell and no pipeline** — plus `fs.readFileSync` and
plain string/regex work. **An uncaught exception IS the fail-closed path**: every
degraded-tool scenario from the rounds above becomes a thrown error and a
non-zero exit *by construction*, not by bookkeeping.

**Semantics, messages and red/green meanings are unchanged.** V1, V2, V2b and V7
stay bare commands — their own exit status is already the gate — and V6 stays a
list comparison.

**The review obligation for future edits to these five blocks is now small and
checkable:** *no `catch` clause, and no default-on-error fallback.* As written
they contain neither a `try` nor a `catch`. Measured over all five block bodies
concatenated:

```
grep -cE 'catch[[:space:]]*[({]'  →  0
grep -cE 'try[[:space:]]*\{'      →  0
```

(A plain `grep -c catch` returns **5** — every hit is the comment line that says
there are no catch blocks. The bare word is not the check; the clause is. Stating
that distinction because an earlier round on this page shipped a sweep claim that
matched comments and called it evidence.) Do **not** reintroduce a pipeline, a
temp file written by a separate command, or a `try` that swallows. If you need a
new probe, call it and let it throw.

**The claim, restated as an outcome rather than an assertion:** **no block on
this page has a probe whose failure is indistinguishable from a benign result.**
For V1/V2/V2b/V7 that holds because the command's own status is the gate; for V6
because it is explicitly not a gate; for V0/V3/V4/V5/V8 because a failed probe
throws. Verified by executing every one of the five with its tools shimmed to
fail, its input removed, and its semantic violations applied — the arm tables
under each step.

No further inversion and no further masking exists in the steps below; the sweep
that produced this table was re-run in round 3 over every block on the page,
again in round 6 over the two blocks that round added, and **exhaustively in
round 8 under the definition above**.

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

Expect `fail 0`. Do not assert a literal test count. For orientation only:
`main` at `d1c96e1` is `tests 1681 / pass 1676 / fail 0 / skipped 5`, and adding
T1–T4 takes the total to `1685`.

**The one existing test you must watch here is T12**, `tests/unit/vendor.test.js:636`
(*"vendor: an attended sync carries containment forward or refuses — no
DATA-shaped A7 write moves it"*). **Without D4 it is RED** — measured
`fail 1` at `:697`, `'REFUSED' !== true` — and that is not a regression to debug,
it is the fixture gap Current state §4 documents and D4 closes. With D4 it is
green. If it is red on your tree, apply D4 before looking anywhere else; if it is
still red **with** D4, that is a real finding — stop and report it.

**The scenario suite is a separate gate that `node tests/run.js` does not run.**
`.github/workflows/scenarios.yml` sets `WIENERDOG_RUN_SCENARIOS=1`. Run it too:

```bash
WIENERDOG_RUN_SCENARIOS=1 node tests/scenarios/a7-integrity/run-a7-integrity.js
rc=$?; echo "V2b exit=$rc"; (exit $rc)
```

Expect `PASS` and `V2b exit=0` **and block exit 0**. Its cases `3a-plant-git-prod`
and `3b-plant-git-tamper` are self-resyncs that take the carry arm, and they need
**no** fixture change — measured green with D1+D2+D3 applied. **Red input:** M4
(always carry forward) breaks the fixture's own first install and the harness
aborts.

**Red input for V2 proper:** any change that reaches a non-self-resync path —
e.g. M4 — reddens `tests/unit/vendor.test.js:397`, the WP-157 launcher test,
whose very first `vendorSelf` is a first install that must publish and whose
assertion at `:412-413` requires the published bytes to equal `packageRoot()`'s
launcher. Under M4 it throws before reaching that assertion; either way it goes
red.

### V3 and V4 are TEXT-LEVEL SCREENS, not proofs — read this before citing them

**A review executed the shipped V3/V4 bodies and produced false-PASSes**, and
the honest fix was to change what they *claim*, not to keep escalating the
regex. Both scan **source text**. Neither parses JavaScript, so neither can tell
executable syntax from a token that merely appears in the file. Measured:

| Shape | Before round 11 | After |
|---|---|---|
| V3: the sole `function writeLauncher(` line sits inside a **block comment**, the real implementation is an arrow function that recomputes the predicate | `range: 2 lines` / `matches: 0` / **`V3 PASS`**, exit 0 | **FAIL**, exit 1 |
| V3: same, inside a **template literal** | `range: 2 lines` / `matches: 0` / **`V3 PASS`**, exit 0 | **FAIL**, exit 1 |
| V4: `/*` and `*/` inside two separate `//` comments blank an intervening **duplicate executable** `if (opts.carryForward)` | `1 in code (2 incl. comments)` / **`V4 PASS`**, exit 0 | **FAIL**, exit 1 |
| V4: both required tokens occur **only inside string / template literals** | `1 in code (1 incl. comments)` / **`V4 PASS`**, exit 0 | **still `V4 PASS`, exit 0 — NOT closed** |

Three of the four are closed. **The fourth is not, and cannot be by any text
scan** — that is the point of this subsection. AST parsing was considered and
rejected: this repo has **zero runtime dependencies**, Node's stdlib ships no
JavaScript parser, and a devDependency-based gate would break the copy-paste
verification contract these steps exist to honour.

**Exact-blob reconstruction — V8's technique — was assessed and does not apply
here**, because D1/D2/D3 are **not byte-determined by this spec**. The evidence,
stated so the judgement is checkable rather than asserted:

1. **D3's replacement is a JSDoc *fragment*.** It shows neither the `/**`
   opener, the `*/` closer, nor any `@param` / `@returns` / `@throws` line. The
   complete final JSDoc appears **nowhere** in this spec.
2. **Exact contracts shows a *different* partial JSDoc** — only the tag lines,
   with no description. How the two fragments compose (order, blank lines,
   whether `main`'s existing tags survive) is unspecified.
3. **D1's snippet carries an explicit elision**:
   `// …existing comment and the two recordOnce calls, UNCHANGED…`. It is a
   template, not a literal.
4. **Operator placement in the multi-line message is unconstrained** — the
   snippet shows a trailing `+`; nothing in the spec forbids a leading `+`, and
   both render identical behaviour.

A reconstruction gate over `src/core/vendor.js` would therefore go **red on a
correct implementation**, which is worse than a screen that is honest about its
reach. D4 is different — seven literal lines at a literal anchor — which is
exactly why **V8** can and does reconstruct.

**So: V3 and V4 do not establish AC10 or the exact call-site contract.** They are
cheap, fail-closed screens that catch the ordinary and accidental shapes.

**And neither do T1–T4 — a round-12 correction, measured.** The round-11 text
said the establishing evidence was "T1–T4 plus the reviewer's diff read". That
over-attributed, and a review demonstrated it: **a behaviour-preserving
recomputation leaves all four tests green.** Thread D9's bindings through `opts`
and branch on them inside the function —

```js
// call site
writeLauncher(paths, { manifest: opts.manifest, selfResync, dev });
// inside writeLauncher
if (opts.selfResync && !opts.dev) {
```

— and every arm behaves exactly as before, so **T1–T4 report `tests 4 / pass 4 /
fail 0`** (executed). AC10 and the call-site contract are **source-form**
contracts, and a source-form contract whose violation can be behaviour-preserving
is not provable by tests that only observe behaviour.

**The correct attribution, and the one every mirror of this now carries:**

| Evidence | What it establishes |
|---|---|
| **T1–T4** | the **behavioural arm semantics** — which arm runs, that the carry arm carries forward, that the publish arm publishes, that row 3 fails closed. Nothing about the *form* of the source |
| **The wd-reviewer merge-gate diff read** | the **syntax-level contracts** — AC10 and the exact call site. This repo's double gate makes that read mandatory, and it is the **only** establishing evidence for them |
| **V3 / V4** | **screens.** They catch literal forms cheaply — including the mutation above (measured: **V3 FAIL exit 1**, naming `if (opts.selfResync && !opts.dev) {`; **V4 FAIL exit 1**, call-site literal count `0`) — but they cannot see syntax, so they miss shape C |

Cite them that way. Do not write "V3 proves AC10", and do not write "T1–T4
prove AC10" either — neither does.

**V3 — text screen: `writeLauncher` does not recompute the predicate (Table L, AC10).**

```bash
node <<'V3EOF'
'use strict';
// V3 — a TEXT-LEVEL SCREEN over writeLauncher's source range. It does NOT
// establish AC10 by itself: it reads text, not syntax, so a token inside a
// string literal is invisible to it. AC10 is established by the wd-reviewer
// merge-gate DIFF READ. T1-T4 do NOT establish it either — a
// behaviour-preserving recomputation (D9's bindings threaded through opts)
// leaves all four green, measured. See the prose above.
// What it does do, cheaply and fail-closed:
//   - anchors on the EXACT signature `function writeLauncher(` (the paren is
//     load-bearing: `writeLauncherHelper(` cannot select the range) and requires
//     EXACTLY ONE such line — zero is unlocatable, more than one is ambiguous;
//   - requires the extracted range to contain writeLauncher's own return
//     statement, which D1 leaves untouched. A signature quoted inside a block
//     comment or a template literal yields a range without it, so the screen
//     refuses instead of reporting a vacuous "0 matches";
//   - then scans the range for the forbidden identifiers.
// readFileSync throws if the file is gone. No catch blocks.
const fs = require('node:fs');
const lines = fs.readFileSync('src/core/vendor.js', 'utf8').split('\n');

const SIG = 'function writeLauncher(';
const RET = 'return { path: dest, changed };';
const sigs = lines.reduce((a, l, i) => (l.startsWith(SIG) ? a.concat(i) : a), []);
console.log(`V3 '${SIG}' signature lines: ${sigs.length}`);
if (sigs.length !== 1) {
  console.error(`V3 FAIL — expected EXACTLY ONE line starting '${SIG}' in src/core/vendor.js, found ${sigs.length}; the range is unlocatable or ambiguous, so a count of 0 would be meaningless`);
  process.exit(1);
}
const from = sigs[0];
const rel = lines.slice(from).findIndex((l) => /^}/.test(l));
if (rel < 0) {
  console.error(`V3 FAIL — no closing '}' after '${SIG}'; the range does not terminate, so a count of 0 would be meaningless`);
  process.exit(1);
}
const body = lines.slice(from, from + rel + 1);
console.log(`V3 range: ${body.length} lines`);

if (!body.some((l) => l.includes(RET))) {
  console.error(`V3 FAIL — the extracted range does not contain writeLauncher's return statement ('${RET}', which D1 leaves unchanged), so it is not the function body — most likely the signature was matched inside a comment or a string. A count of 0 over it would be meaningless`);
  process.exit(1);
}

const hits = body.filter((l) => /selfResync|currentLink|installStance|isDevCheckout|realpath/.test(l));
console.log(`V3 matches: ${hits.length}`);
if (hits.length !== 0) {
  console.error('V3 FAIL — writeLauncher recomputes the predicate');
  console.error(hits.join('\n'));
  process.exit(1);
}
console.log('V3 PASS (text-level screen only — AC10 is established by the reviewer diff read, not by this step and not by T1-T4)');
V3EOF
rc=$?; echo "V3 exit=$rc"; (exit $rc)
```

**Green, transcribed from a real run** (on `main`'s `src/core/vendor.js`; the
range grows once D1 lands):

```
V3 'function writeLauncher(' signature lines: 1
V3 range: 28 lines
V3 matches: 0
V3 PASS (text-level screen only — AC10 is established by the reviewer diff read, not by this step and not by T1-T4)
V3 exit=0
```

and the block itself exits **0**. Six red arms, all measured:

| Red input | V3 prints | Block `$?` |
|---|---|---|
| a recompute inside `writeLauncher` — `const cur = fs.realpathSync(currentLink(paths));` | `signature lines: 1` / `range: 29 lines` / `matches: 1` / `V3 FAIL — writeLauncher recomputes the predicate` / the offending line, indented | **1** |
| **prefix collision** — a `function writeLauncherHelper() {` declared *before* the real function, which recomputes the predicate | `V3 FAIL — writeLauncher recomputes the predicate` / the offending line. **The earlier prefix-regex form selected the helper and printed `V3 matches: 0` / `V3 PASS` at exit 0** — that is why the anchor is the exact signature `function writeLauncher(`, paren included | **1** |
| **two** `function writeLauncher(` signatures | `V3 'function writeLauncher(' signature lines: 2` / `V3 FAIL — expected EXACTLY ONE line starting 'function writeLauncher(' … found 2; the range is unlocatable or ambiguous …` | **1** |
| **zero** signatures (function renamed away) | same message with `found 0` | **1** |
| **signature inside a BLOCK COMMENT**, real implementation an arrow function that recomputes the predicate *(round-11 arm)* | `signature lines: 1` / `range: 2 lines` / `V3 FAIL — the extracted range does not contain writeLauncher's return statement ('return { path: dest, changed };', which D1 leaves unchanged), so it is not the function body — most likely the signature was matched inside a comment or a string …`. **Before round 11 this printed `matches: 0` / `V3 PASS` at exit 0** | **1** |
| **signature inside a TEMPLATE LITERAL**, same real implementation *(round-11 arm)* | identical output and message | **1** |

**The return-statement check is what closes the last two**, and it is a screen,
not a proof: it asserts the extracted range contains `return { path: dest,
changed };` — the line D1 explicitly leaves in place — so a range harvested from
a comment or a string cannot satisfy it. A sufficiently determined construction
could still defeat it; that is why the heading above says *screen*.

**V3 now reports its own range length**, so the vacuity this next command used to
guard against — a range that matched nothing while still printing `0` — is
covered by the gate itself (`V3 range: 28 lines` on `main`, `41` after D1).
Keep this as an independent human cross-check if you want a second opinion from a
different tool; it is **not** a gate and its output is not required in the PR:

```bash
awk '/^function writeLauncher/,/^}/' src/core/vendor.js | wc -l
```

Measured `28` on `main` today; after D1 it grows to roughly 40. It must be a
plausible function length — not `0`, not `1`, and not the file's line count.

**V4 — text screen: the call site is exactly the specified one (one occurrence each).**

```bash
node <<'V4EOF'
'use strict';
// V4 — a TEXT-LEVEL SCREEN over the call site. It does NOT establish the exact
// call-site contract by itself: a token inside a string or template literal is
// indistinguishable from executable code to any text scan. The establishing
// evidence is the wd-reviewer merge-gate DIFF READ. T1-T4 do NOT establish it —
// threading D9's bindings through opts preserves every behaviour they observe.
// It is deliberately CONSERVATIVE: both the raw line count and the
// comments-blanked count must be exactly 1. Requiring both means the comment
// blanker can only ever cause a FAILURE, never a pass — an earlier form let
// `/*` and `*/` sitting inside two separate `//` comments blank an intervening
// duplicate call site (raw 2, code 1) and printed PASS.
// Comments are blanked with newlines preserved, so line-counting semantics are
// unchanged. readFileSync throws if the file is gone. No catch blocks.
const fs = require('node:fs');
const raw = fs.readFileSync('src/core/vendor.js', 'utf8');
const blank = (m) => m.replace(/[^\n]/g, ' ');
const code = raw.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);

const rawLines = raw.split('\n');
const codeLines = code.split('\n');
for (const pat of ['carryForward: selfResync && !dev', 'if (opts.carryForward)']) {
  const all = rawLines.filter((l) => l.includes(pat)).length;
  const n = codeLines.filter((l) => l.includes(pat)).length;
  console.log(`V4 [${pat}] = ${n} in code, ${all} raw`);
  if (n !== 1 || all !== 1) {
    console.error(`V4 FAIL — expected exactly 1 occurrence, both in code and raw; got ${n} in code and ${all} raw.${all !== n ? ' A raw count above the code count means the literal also appears in a comment, or a comment delimiter is hiding an executable occurrence — either way this screen refuses.' : ''}`);
    process.exit(1);
  }
}
console.log('V4 PASS (text-level screen only — the call-site contract is established by the reviewer diff read, not by this step and not by T1-T4)');
V4EOF
rc=$?; echo "V4 exit=$rc"; (exit $rc)
```

Each pattern must count **exactly one — in code AND raw**. The match is a plain
`String.includes` on each line, so `&&` and `!` are literal — no regex, no shell.
**Requiring both counts is the round-11 correction**: with only the
comments-blanked count gated, the blanker could *cause* a pass, and did (arm
"delimiter blanking" below). Requiring both means the blanker can only ever
produce a **failure**, never a pass — it is now strictly a tightening.

**Green, transcribed from a real run on a tree carrying D1+D2:**

```
V4 [carryForward: selfResync && !dev] = 1 in code, 1 raw
V4 [if (opts.carryForward)] = 1 in code, 1 raw
V4 PASS (text-level screen only — the call-site contract is established by the reviewer diff read, not by this step and not by T1-T4)
V4 exit=0
```

and the block exits **0**. Red arms, measured:

| Red input | V4 prints | Block `$?` |
|---|---|---|
| M2 — the call site passes `carryForward: selfResync` | `V4 [carryForward: selfResync && !dev] = 0 in code, 0 raw` / `V4 FAIL — expected exactly 1 occurrence, both in code and raw; got 0 in code and 0 raw.` | **1** |
| **comment-only literals** — D1/D2 reverted to `main`'s shape while both literals appear only inside a `//` line comment and a `/* … */` block | `= 0 in code, 1 raw` / `V4 FAIL — … got 0 in code and 1 raw. A raw count above the code count means the literal also appears in a comment, or a comment delimiter is hiding an executable occurrence — either way this screen refuses.` **The raw line-count form printed `V4 PASS` at exit 0 on this state** | **1** |
| **delimiter blanking** *(round-11 arm)* — `/*` and `*/` inside two separate `//` comments, blanking an intervening **duplicate executable** `if (opts.carryForward)` | `= 1 in code, 2 raw` / same FAIL message. **Before round 11 this printed `1 in code (2 incl. comments)` / `V4 PASS` at exit 0** — the blanker itself manufacturing the pass | **1** |
| a duplicated call site | counts `2`, same FAIL path | **1** |
| **tokens only inside string / template literals** *(round-11 arm)* | `= 1 in code, 1 raw` / **`V4 PASS`, exit 0 — NOT CAUGHT.** Recorded here deliberately: no text scan can distinguish a string literal from executable code, which is precisely why this step is labelled a **screen** and why the exact call-site contract is **established by the wd-reviewer diff read alone**. **T1–T4 do not establish it** — the behaviour-preserving `opts`-threading mutation leaves all four green (measured; "V3 and V4 are TEXT-LEVEL SCREENS", Table M **M5**) | **0** |

**V5 — ADR-0004 (AC11).**

```bash
node <<'V5EOF'
'use strict';
// V5 — ADR-0004 (AC11): this WP starts nothing. readFileSync throws if the file
// is gone, so "no matches" can never come from "no file". No catch blocks.
const fs = require('node:fs');
const lines = fs.readFileSync('src/core/vendor.js', 'utf8').split('\n');

const hits = lines.filter((l) => /setInterval|setTimeout|spawn|fs\.watch|daemon/.test(l));
console.log(`V5 scanned: ${lines.length} lines`);
console.log(`V5 matches: ${hits.length}`);
if (hits.length !== 0) {
  console.error('V5 FAIL — ADR-0004: this WP starts nothing');
  console.error(hits.join('\n'));
  process.exit(1);
}
console.log('V5 PASS');
V5EOF
rc=$?; echo "V5 exit=$rc"; (exit $rc)
```

**Green, transcribed from a real run** on `main`'s `src/core/vendor.js` (the line
count grows once D1 lands):

```
V5 scanned: 454 lines
V5 matches: 0
V5 PASS
V5 exit=0
```

and the block exits **0**. `V5 scanned:` is printed deliberately: a gate that
reports "0 matches" without saying how much it looked at is one bad path away
from being vacuous, and this is the cheapest way to make that visible.
**Red input** — any retry timer or watcher. Measured with
`setTimeout(() => {}, 0);` inserted into `writeLauncher`:

```
V5 scanned: 455 lines
V5 matches: 1
V5 FAIL — ADR-0004: this WP starts nothing
  setTimeout(() => {}, 0);
V5 exit=1
```

block exit **1**.

**V6 — the permission boundary (AC9).** This one is a **list comparison, not an
exit-code gate**: `git diff --name-only` exits `0` whatever it prints, so its
exit status proves nothing. Read the list. The enforcing gate is CI's
`boundary-check`.

```bash
git diff --name-only main...HEAD
```

Expect exactly — **four** paths since round 6, `tests/unit/vendor.test.js` being
the one D4 added:

```
docs/specs/WP-launcher-no-self-resync-republish.md
src/core/vendor.js
tests/unit/vendor-selfresync.test.js
tests/unit/vendor.test.js
```

**Red input:** touching `src/scheduler/launcher.js` or `docs/THREAT-MODEL.md`
adds a line here and `boundary-check` rejects the PR. `tests/unit/vendor.test.js`
appearing in this list is **necessary but not sufficient** — V8 is what bounds
*how* it changed.

**V8 — `tests/unit/vendor.test.js` at `HEAD` IS `main`'s file plus exactly D4's
block at D4's anchor (AC9, Deliverables row 3).** This is the gate that turns
"the file is a deliverable" into "only the fixture moved". It is an exit-code
gate.

**Read this before editing V8.** V8 was rewritten in **round 6** after a Codex
review found the first version unsound, and the failure is worth naming because
it is a class this project keeps paying for. The first version asserted
**properties of the diff** — "no removed line", "no line containing `assert`" —
as a *proxy* for "only the fixture moved". Proxies admit counterexamples. The
measured one is below: a purely additive, `assert`-free line that makes T12
**vacuous**. V8 now asserts the **invariant itself** — the file at `HEAD` is
byte-for-byte reconstructible from `main`'s file plus D4's block — which has no
gap to slip through, because there is exactly one permitted file content and V8
computes it.

```bash
node <<'V8EOF'
'use strict';
// V8 — HEAD's tests/unit/vendor.test.js IS main's file plus exactly D4's block at
// D4's anchor. Both blobs come from execFileSync (throws on any git failure), the
// expected content is COMPUTED IN THIS PROCESS from a literal array — there is no
// temp file, no heredoc, no external filter, and therefore no producer whose
// failure could look like agreement. No catch blocks.
const { execFileSync } = require('node:child_process');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 });
const P = 'tests/unit/vendor.test.js';

// Clean-tree precondition: V8 verifies the COMMITTED HEAD, and an uncommitted
// local edit can otherwise mask a bad HEAD (red arm (f)).
const dirty = git('status', '--porcelain', '--', P).trim();
if (dirty !== '') {
  console.error(`V8 FAIL — ${P} has uncommitted changes. V8 verifies the COMMITTED HEAD; commit or stash first, then re-run.`);
  console.error(dirty);
  process.exit(1);
}

const base = git('show', `main:${P}`);
const head = git('show', `HEAD:${P}`);

const anchor = "    fs.symlinkSync(start, path.join(app, 'current'));";
const block = [
  '    // A real installed core always has the out-of-tree launcher a first install',
  '    // published. This fixture hand-builds the core, so publish it by hand.',
  "    fs.mkdirSync(path.join(core, 'launcher'), { recursive: true });",
  '    fs.copyFileSync(',
  "      path.join(REPO, 'src', 'scheduler', 'launcher.js'),",
  "      path.join(core, 'launcher', 'launch.js')",
  '    );',
];

const bl = base.split('\n');
const at = bl.reduce((acc, l, i) => (l === anchor ? acc.concat(i) : acc), []);
console.log(`V8 anchor occurrences in main: ${at.length}`);
if (at.length !== 1) {
  console.error(`V8 FAIL — D4's anchor must occur EXACTLY once in main's ${P} (found ${at.length}). Zero matches is a FAILURE, not agreement.`);
  process.exit(1);
}

const expected = bl.slice(0, at[0] + 1).concat(block, bl.slice(at[0] + 1)).join('\n');
if (expected !== head) {
  console.error(`V8 FAIL — HEAD's ${P} is NOT main plus exactly D4's block at D4's anchor`);
  const e = expected.split('\n');
  const h = head.split('\n');
  const i = e.findIndex((l, k) => l !== h[k]);
  if (i < 0) console.error(`  lines agree pairwise but the files differ in length: expected ${e.length}, HEAD ${h.length}`);
  else {
    console.error(`  first divergence at line ${i + 1} (expected ${e.length} lines, HEAD ${h.length}):`);
    console.error(`    expected: ${JSON.stringify(e[i])}`);
    console.error(`    HEAD:     ${JSON.stringify(h[i])}`);
  }
  process.exit(1);
}
console.log(`V8 PASS — HEAD's ${P} is byte-for-byte main + D4's block at D4's anchor`);
V8EOF
rc=$?; echo "V8 exit=$rc"; (exit $rc)
```

Correct state must print `V8 anchor occurrences in main: 1` /
`V8 PASS — HEAD's tests/unit/vendor.test.js is byte-for-byte main + D4's block at
D4's anchor` / `V8 exit=0` **and the block itself must exit 0** — measured on a
committed, clean tree. **Run V8 after you commit**, not before: the first thing
it does is refuse a dirty tree. Five details are deliberate:

- **V8 reads `HEAD`'s blob, not the working tree.** `git show
  HEAD:tests/unit/vendor.test.js` is compared in-process; the path
  `tests/unit/vendor.test.js` is never read as a file. **This is a round-6
  correction and reverting it re-opens a real hole** — see red arm (f).
- **V8 keeps its own path-scoped clean check** — `git status --porcelain --
  tests/unit/vendor.test.js` must be empty — even though **V0 strictly subsumes
  it** and it can therefore never fire in a run where V0 passed. It is kept
  deliberately, and the reasoning is stated rather than left implied: V8 is the
  one gate a reviewer is likely to run **standalone** to spot-check the fixture
  claim, and in that run V0 has not necessarily been run at all. Its message
  names the offending file, which is higher-signal than V0's tree-wide list. It
  guards a *different* failure than V0 does for V8's own claim — V8 reads
  `HEAD`'s blob regardless, so what the local check adds is a warning that
  `HEAD` and the working tree disagree *about this file*, which is exactly the
  shape of red arm (f). **If you ever find yourself removing one, remove this
  one, not V0**: V0 is the sequence-level invariant and covers every gate; this
  is a local backstop for one gate.
- **D4's block is a literal array in the script, and the reconstruction is a
  `slice`/`concat` in the same process.** There is no temp file, no heredoc `cat`
  writing one, and no `awk` inserting into it — so there is no producer whose
  failure could leave the block empty and make the reconstruction equal `main`.
  That was a real, executed false-PASS in the shell form: `cat` fails, the block
  file is empty, `awk` inserts nothing, and a `HEAD` missing D4 compares
  **equal**. It cannot be expressed in this form.
- **The zero-match guard is the trap this construction exists to avoid.** If the
  anchor ever stops matching — a whitespace change on `main`, a re-indent — an
  insertion that silently does nothing produces a reconstruction *identical to
  `main`*, which then compares **equal** to a `HEAD` that never applied D4. The
  anchor occurrences are counted explicitly and **must be exactly 1**; `0` and
  `>1` both fail loudly. Measured on the worst case — anchor absent **and** a
  `HEAD` that lacks D4, i.e. the state where a skipped guard would pass
  vacuously: `V8 anchor occurrences in main: 0` / `V8 FAIL … Zero matches is a
  FAILURE, not agreement.`, exit **1**.
- **The comparison is `expected !== head` on two strings**, not an external
  `diff`, so there is no third tool to fail. On mismatch V8 prints the **first
  diverging line number with both sides quoted** — more precise than a diff hunk
  and deterministic across platforms.

**Red inputs — six, all measured, all with the block's own `$?`.** Arms (a)–(d)
are committed-state violations; (e) and (f) are the round-6 pair.

**These arms are SPEC-VALIDATION evidence, already collected — they are not work
the implementer repeats.** Every one of them requires a **committed** bad state,
which the Table M mutation procedure forbids (Definition of done item 2: a
mutation is a deliberately dirty tree and must never be committed). The two
procedures do not conflict because they are not the same activity, and this
paragraph exists so nobody tries to satisfy one with the other:

- **Implementer, M7**: uncommitted revert of D4 ⇒ **V2 red at T12**, **V8 red at
  its dirty-path guard**, V0 red. Paste those. Do not commit the mutation, and
  do not claim V8 observed a missing-D4 reconstruction — it did not.
- **Spec validation, arms (a)–(f)**: collected in a **disposable scratch
  worktree** — `git worktree add` (or a throwaway branch), commit the violating
  state there, run V8, record, then delete the branch/worktree so nothing
  reaches the PR. That is how these six were measured, and the scratch branches
  were deleted after. **Do not run this on your WP branch**, and never push a
  commit created for it. If a reviewer wants arm (e) re-confirmed, it is
  re-confirmed the same way — in a scratch worktree, not by committing a
  mutation onto the branch under review.

**All six were re-run against the Node gate in round 10 and the cells below are
its ACTUAL output.** They previously recorded `diff` hunks — output the shell
forms produced and the current script *cannot*, because it compares strings
in-process and reports the first divergent line. That staleness was a review
finding, and the fix was to re-run rather than reword.

| # | Violating state | V8 prints | Block `$?` |
|---|---|---|---|
| a | **The Codex counterexample** — `if (fs.existsSync(path.join(core, 'launcher', 'launch.js'))) after = before;` added before `run()`'s `return`. Purely additive, contains no `assert` | `anchor occurrences in main: 1` / `V8 FAIL — … is NOT main plus exactly D4's block …` / `first divergence at line 685 (expected 711 lines, HEAD 712)` / `expected: "    return { before, after };"` / `HEAD:     "    if (fs.existsSync(path.join(core, 'launcher', 'launch.js'))) after = before;"` | **1** |
| b | `:697` weakened from `assert.equal(base.after, base.before, …)` to `assert.ok(base.after === base.before \|\| base.after === 'REFUSED', …)` | `first divergence at line 704 (expected 711 lines, HEAD 711)` / `expected: "  assert.equal(base.after, base.before, 'contained-clean is carried forward unchanged');"` / `HEAD:     "  assert.ok(base.after === base.before \|\| base.after === 'REFUSED', …);"` | **1** |
| c | an extra `assert.ok(true, …)` merely *added* | `first divergence at line 705 (expected 711 lines, HEAD 712)` / `expected: "  assert.equal(outB.after, outB.before, 'outside-clean is carried forward unchanged');"` / `HEAD:     "  assert.ok(true, 'an extra assertion this WP does not own');"` | **1** |
| d | the anchor absent from `main`'s file (probed by pointing the block at a non-existent anchor string) | `V8 anchor occurrences in main: 0` / `V8 FAIL — … Zero matches is a FAILURE, not agreement.` | **1** |
| e | **`HEAD` lacks D4 entirely** — the shape a missing fixture edit produces. *Scratch-worktree spec validation; **not** what M7 produces — see the note above the table* | `anchor occurrences in main: 1` / `first divergence at line 660 (expected 711 lines, HEAD 704)` / `expected: "    // A real installed core always has the out-of-tree launcher a first install"` / `HEAD:     "    const before = contained(core);"` | **1** |
| f | **bad `HEAD`, masked by the working tree** — an uncommitted local edit to the target path. This is the shape the round-6 review constructed | `V8 FAIL — tests/unit/vendor.test.js has uncommitted changes. V8 verifies the COMMITTED HEAD; commit or stash first, then re-run.` / `M tests/unit/vendor.test.js` | **1** |

The **green** arm, re-run in the same pass: `V8 anchor occurrences in main: 1` /
`V8 PASS — HEAD's tests/unit/vendor.test.js is byte-for-byte main + D4's block at
D4's anchor`, block exit **0**.

**Arm (f) is why V8 reads `HEAD`, and it is measured, not hypothetical.** On
exactly that state the **round-6-interim** V8 — same reconstruction, but
`diff`ing the *working-tree* path — printed `V8 anchor occurrences in main: 1` /
`V8 PASS` and exited **0**, while `HEAD` carried the vacuity line
(`git show HEAD:tests/unit/vendor.test.js | grep -c "after = before;"` → `1`).
Local `V2` would agree with it, `boundary-check` only inspects the *path* list,
and the bad `HEAD` pushes. The current form refuses at the first guard.

**Why arm (a) is the one that started this, stated so no one "simplifies" V8
back.** That single added line overwrites every measured outcome with the
expected starting stance, so T12 asserts nothing. It was measured three ways:

| Question | Measured |
|---|---|
| Does the **first**, proxy-based V8 catch it? | **No.** `V8 removed lines: 0  assert-touching lines: 0` / `V8 PASS`, block exit **0** |
| Does it actually make T12 vacuous? | **Yes.** With it present, `WP-stance-authority-containment`'s **T12 mutation row 10** — deleting the `selfResync` branch, which *must* redden T12 — leaves the file at `pass 30 / fail 0`. Without it, the same mutation gives `pass 29 / fail 1` |
| Does **M7** catch it? | **No.** With D4 reverted and the line still present, `contained-clean` has no launcher, stays `REFUSED`, and T12 goes red exactly as M7 requires: `pass 29 / fail 1` |

So V2, M7 and the proxy V8 could **all** be green while T12 proved nothing. Only
the exact-reconstruction form closes that, and only the `HEAD`-reading, clean-tree
variant of it closes arm (f) as well.

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
  is the owner's act, and that spec is now `Done` — an implementer never edits a
  `Done` spec.
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

1. **V0 passes FIRST, and every other gate's output comes from a run in which it
   did.** Paste V0's own output — including the `HEAD` sha it prints — at the top
   of the verification block in the PR body. **A V0 failure invalidates
   everything below it**: if V0 is red, no V1–V8 result collected in that state
   counts as evidence, because V1–V5, V2b and V7 all execute or inspect
   working-tree code and a dirty tree makes them describe something other than
   the commit you are asking a reviewer to merge (V0's measured table shows all
   of them green over a broken `HEAD`). Commit or stash, then re-run **all** of
   them. The same applies if you commit anything *after* collecting evidence —
   including this spec's `status:` flip: re-run V0 and every step under it.
   Then: all verification steps **V0–V8, including V2b**, pass locally; output pasted
   into the PR body, including the V3, V4, V5 and V8 counts **with their `exit=`
   lines**, and the V6 file list. A step pasted without its exit status does not
   count as run. **Each of V0, V1, V2b, V3, V4, V5, V7 and V8 must be pasted with
   the block's own `$?`, not only its printed `exit=` line** — those two
   disagreed in round 2 (the printed line said `1` while the block exited `0`),
   and the block's `$?` is the gate. Run each block, then
   `echo "block \$? = $?"` on the following line and paste that too. V2 and V6
   are exempt: V2's status is the bare `node tests/run.js` exit, and V6 is a list
   comparison whose exit status proves nothing.
   **Run V8 only after committing.** It verifies `HEAD`'s blob and refuses to run
   against a dirty `tests/unit/vendor.test.js` — deliberately, because an
   uncommitted local edit can otherwise mask a bad `HEAD` (V8, red arm (f)). A
   pasted V8 result taken on a dirty tree is not evidence; it is the failure
   message.
2. Table M's M1, M2, **M6 and M7** run and reverted, with their measured
   pass/fail counts pasted into the PR body under "Mutation checks".
   **The mutation checks are the one thing V0 does not gate, and that is not an
   exception to it — it is what V0 is for.** A mutation check *is* a deliberately
   dirty tree; its whole purpose is to measure a state that must never be
   committed. So: run the mutations, record the counts, **revert**, and then
   confirm V0 is green again before collecting or re-collecting any V-gate
   evidence. If V0 is red after your mutation sweep, you left a mutation in the
   tree — that is precisely the accident V0 exists to catch, and the numbers you
   pasted above it are now describing the wrong commit.
   **Never commit a mutation**, and in particular do not commit one to make a
   gate produce a committed-state failure: V8's red arms (a)–(f) are
   **spec-validation evidence already collected in scratch worktrees** (see the
   note above V8's arms table), not implementer work. For M6,
   paste both halves: T1 red, and V1's other three tests plus V2–V7 still green.
   For **M7**, paste both halves too — and note **which** gates move and **why**,
   because two successive round-6 reviews found this item wrong: first
   contradicting Table M, then demanding evidence its own no-commit rule makes
   unobtainable. The single executable procedure is:
   revert D4 **in the working tree, uncommitted**; then
   **V2 is red** — T12 fails at `tests/unit/vendor.test.js:697` with
   `'REFUSED' !== true`, and this is the signal that matters;
   **V8 is red at its dirty-path guard**, not at the reconstruction — it never
   reaches a blob comparison, so **do not paste it as evidence that `HEAD` lacks
   D4**; **V0 is red** for the same procedural reason; and
   **V1, V3, V4, V5 and V7 stay green** — those are the ones to paste as
   unaffected. The committed-state reconstruction failure is **V8 red arm (e)**,
   which is spec-validation evidence collected in a scratch worktree and is
   **not** yours to reproduce. **M7 does not substitute for V8's red arm (a)**
   either: a vacuity line added *alongside* D4 leaves M7 green.
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
8. The PR body states, under "Decisions made", that
   `tests/unit/vendor.test.js` is a deliverable **because D1/D2/D3 redden its
   T12**, and that the fix is the fixture (**D4**) and **not** a guard in the
   carry arm — with M7's two halves as the evidence. This exists because the
   first dispatch of this WP was stopped by exactly that question, and a reviewer
   seeing an existing test file in the diff is entitled to see the answer without
   reading the spec. One line plus M7's numbers; do not restate D4.
