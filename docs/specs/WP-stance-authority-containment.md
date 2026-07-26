---
id: WP-stance-authority-containment
title: Bind the prod/dev stance to containment, not to a signal an app-tree write can produce
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0013, ADR-0028, ADR-0031]
epic: audit-a7
---

# WP-stance-authority-containment: containment decides the stance

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly `dream`, later routines) with the OS-native
scheduler (launchd / systemd / schtasks). The registered OS entry never invokes
the app directly: it invokes the **independent launcher** at
`<core>/launcher/launch.js` — a file placed OUTSIDE the mutable app tree — which
verifies integrity and only then spawns `node <app>/bin/wienerdog.js run-job
<name>`. Any verification failure is a durable alert plus **zero** spawn
(ADR-0028). **IRON RULE (ADR-0004): Wienerdog is just files.** The launcher runs
and exits with each fire. This WP adds no daemon, no watcher, no poller, no
telemetry, and no new state file.

An install has one of two **stances**. In **prod** the published files are copied
into `<core>/app/<version>/` and `<core>/app/current` symlinks there; that tree
is immutable between updates, so the launcher demands a byte-exact **app release
digest** (a sha256 content address over the sorted per-file hashes of everything
under `app/current`). In **dev** `app/current` points at a live git checkout —
the maintainer's own install is dev: `~/.wienerdog/app/current ->
/Users/gyulafeher/Documents/Claude_Projects/wienerdog` (verified this session).
A dev tree is edited constantly by definition, so ADR-0028 amendment #7 ruled
that a dev install binds a **reduced** descriptor digest: `appRelease` collapses
to `{stance:'dev', root}`, excluding `treeDigest` and `version`, while every
other field (run, model, timeouts, vaultLayout, vaultRoot, home, schedule, node,
exec pins) stays digest-covered. So on dev a tracked-source edit stays runnable
but a `config.yaml`/schedule/home edit still drifts and refuses.

**The defect this WP fixes.** The choice between those two paths — enforced vs
reduced — is currently made by reading a signal that lives **inside the tree the
attacker can write**. `src/scheduler/descriptor.js:186` mints the stance with
`isDevCheckout(appRoot, env)`, which returns true for a `.git` directory, a
`.git` regular file, or `env.WIENERDOG_DEV === '1'` (`src/core/vendor.js:30-36`).
An **A7-scoped write** — write access into the app tree, not scheduler-
registration privilege — can therefore create a `.git` inside a *prod* install's
`<core>/app/<version>/`, and the next attended `wienerdog sync` mints a
`dev`-stance descriptor for a genuine prod tree. From that moment every fire
takes the dev arm, and **app code is never hashed again**. The dev arm's own
comment states the consequence (`launcher.js:291-293`): *"the reduction excludes
only treeDigest+version, so a tracked-source edit stays runnable but ANY
config-field edit … drifts and refuses."* Tracked-source, on a prod install,
means the attacker's payload.

**Two defences that do NOT close it, and this WP must not rely on either.**
(1) The launcher cross-checks stance against on-disk `.git` in both directions
(`launcher.js:282` and `:302`), which kills the `WIENERDOG_DEV`-only variant
because the env var alone leaves no `.git` at fire time — but **planting `.git`
satisfies the mint and the liveness check simultaneously**. (2) `reDeriveDigest`
(`launcher.js:240-248`) is not independent enforcement: it `require`s the
derivation modules **from the live dev-classified tree**, so it executes
attacker-controlled code, and it compares config fields, not tree content.
`makeTreeFilesReadOnly` (`src/core/vendor.js:127-150`) chmods **files** only, so
the published version directories keep their write bit and a new entry can be
created inside them; `vendorSelf` never cleans one up (`vendor.js:178` skips the
re-copy when the version dir already exists, and its `isDevCheckout` call at
`:167` tests the *installer's* package root, never `app/current`).

**Do not conflate this with the catch-up anchor finding.** That finding concerns
the raw `appTreeDigest` bound into the catch-up entry, where plant-then-sync
*does* re-mint a `sha256:` anchor that **covers** the planted file — the tree is
pinned from that moment and any further tamper refuses. On the **per-job** path
`reduceForDigest` (`descriptor.js:249-254`) strips `treeDigest` for dev, so
nothing pins the tree at all. Both statements are true, about different paths.
That is precisely why this survived several review rounds, and why an argument
of the form "but plant-then-sync pins the tree" is only valid on the catch-up
path. **Catch-up is out of scope here and its behaviour does not change.**

**The governing rule** (ADR-0028's 2026-07-25 amendment, still `Proposed`,
section *"3. The durable rule — stance is never selected by a signal inside the
A7-writable tree"*, quoted verbatim so you need not open it):

> **No mechanism may choose between the enforced (prod) and reduced (dev)
> verification paths on the basis of a signal that an A7-scoped write can
> produce.** `env.WIENERDOG_DEV` and an on-disk `.git` are both such signals.
> This holds at **mint** time as well as at fire time: binding the decision into
> a registration only moves the attack one attended `sync` earlier, it does not
> remove it, because the mint reads the same tree the attacker can write.

The same amendment's section *"4. Containment is the stance authority — specced,
not deferred"* names the authority to bind to and names this WP as the work that
does it: *"The discriminator this codebase actually relies on to tell the two
stances apart is **containment**, not `.git`: a prod `app/current` realpaths
**inside** `<core>/app` and a dev one legitimately does not
(`src/core/vendor.js:200-206` states this in its own words; the prod-path use of
it is `verifyContainment` at `src/scheduler/launcher.js:305`). Unlike `.git` and
`WIENERDOG_DEV`, that property cannot be forged by writing *into* the app tree,
which is why it is the authority §3's violation must be resolved against.
**`WP-stance-authority-containment`** … owns that work."* That amendment also
records the shipped per-job dev path as an **unresolved** rule violation whose
prerequisite is this WP. **Do not edit ADR-0028** — it is another architect's
surface and is `Proposed`, pending owner ratification.

## Current state

Everything below was read and, where it is a behavioural claim, **executed** at
commit `efd1489` during this session. Line numbers are that commit's.

### 1. The mint — `src/scheduler/descriptor.js:175-186`

```js
  const { currentLink, readVersion, isDevCheckout } = require('../core/vendor');
  let appRoot;
  try {
    appRoot = fs.realpathSync(currentLink(paths));
  } catch (err) {
    throw new WienerdogError(`cannot resolve the vendored app at ${currentLink(paths)}: ${err.message}`);
  }
  …
  const stance = isDevCheckout(appRoot, env) ? 'dev' : 'prod';
```

`env` is bound once at `descriptor.js:135` (`const env = opts.env || process.env;`)
and — verified by reading the whole of `buildDescriptor`, lines 134-220 — **line
186 is its only use**. Nothing else in the descriptor is env-derived.

### 2. The oracle — `src/core/vendor.js:25-36`

```js
function isDevCheckout(root, env = process.env) {
  if (env.WIENERDOG_DEV === '1') return true;
  try {
    const st = fs.statSync(path.join(root, '.git'));
    return st.isDirectory() || st.isFile();
  } catch { return false; }
}
```

It has exactly **two** call sites in `src/` (verified by
`grep -rn isDevCheckout src bin`): `vendor.js:167` inside `vendorSelf`, and
`descriptor.js:186`. `vendorSelf`'s call passes `packageRoot()` — the root of the
**running installer package**, not `app/current` — and decides copy-vs-link:
dev ⇒ `target = root` (no copy), prod ⇒ `target = <core>/app/<version>`
(`vendor.js:163-197`). Its return value's `dev` field is consumed in exactly one
place, a console message: `src/cli/sync.js:206`
`` `wienerdog: vendored app ${v.version}${v.dev ? ' (dev checkout — linked in place)' : ''}.` ``.

### 3. The containment asymmetry already in the tree — `src/core/vendor.js:199-239`

`verifyCurrentContainment(paths, platform)` realpaths `<core>/app` and
`<core>/app/current`, rejects when `path.relative` is `..`-prefixed or absolute,
and **additionally** checks POSIX ownership (`st.uid !== uid && st.uid !== 0` ⇒
`ok:false`). Its own doc comment (lines 204-206) states the asymmetry this WP
promotes to the authority: *"a DEV install's `current` legitimately points at the
checkout OUTSIDE `<core>/app`, so this returns ok:false for dev — callers gate it
on the prod stance"*. **It has no caller in `src/` or `bin/`** (verified by grep);
it exists for doctor/tests. The launcher inlines an equivalent `containedIn` +
`verifyContainment` (`launcher.js:75-117`) because it cannot require code from
the tree it is verifying (`launcher.js:16-26`).

### 4. The fire-time probe — `src/scheduler/launcher.js:141-155, 275, 281-302`

```js
function isDev(root) {                        // :148
  try {
    const st = fs.statSync(path.join(root, '.git'));
    return st.isDirectory() || st.isFile();
  } catch { return false; }
}
```

`isDev` has exactly one call site, `launcher.js:275` (`const liveDev =
isDev(target);`), consumed at `:282` (dev arm: `if (!liveDev) return {ok:false,
reason:'descriptor stance is dev but the live app is not a dev checkout'}`) and
`:302` (prod arm: `if (liveDev) return {ok:false, reason:'descriptor stance is
prod but the live app looks like a dev checkout (.git present)'}`). The prod
arm's containment check, `verifyContainment(p, platform)`, runs immediately after
at `:305`. `verifyCatchup` (`:352-371`) does **not** use `isDev`.

### 5. The defect, executed against `main` (not asserted — run)

Both scripts below are reproduced verbatim as V1 and V2 in Verification steps.
Their real output at `efd1489`:

```
$ node scripts/v1-mint.js                      # the MINT oracle
app/current contained in <core>/app : true
mint stance, clean prod tree        : prod
mint stance, WIENERDOG_DEV=1        : dev
mint stance, planted .git FILE      : dev
mint stance, planted .git DIR       : dev
FAIL: an A7-scoped signal decided the stance      (exit 1)

$ node scripts/v2-e2e.js plant                 # the FULL attack, end to end
mode                               : plant
descriptor stance after plant+sync : dev
launcher exit code                 : 0
spawn count                        : 1
spawn argv                         : ["run-job","dream"]
alert reason                       : (none)
FAIL: app-code tamper reached a spawn (or the stance downgraded)   (exit 1)

$ node scripts/v2-e2e.js control               # same, WITHOUT the .git plant
mode                               : control
descriptor stance after plant+sync : prod
launcher exit code                 : 1
spawn count                        : 0
spawn argv                         : (none)
alert reason                       : {"job":"dream",…,"reason":"wienerdog: refusing to run \"dream\" — the live app tree does not match the descriptor (app files chang…
PASS: app-code tamper refused, zero spawn         (exit 0)
```

The control is the non-vacuity proof: the same script, same tamper, same
assertions, **passes** when the `.git` is not planted. The plant is the whole
difference between "refused, zero spawn" and "spawned `run-job dream` from a tree
whose `src/core/errors.js` had just been rewritten".

### 6. Existing tests that this change MUST turn red (five, by design)

These are not collateral damage — each one asserts the behaviour being removed.
Convert each deliberately; **do not delete any of them.**

| # | Test | Why it goes red |
|---|------|-----------------|
| R1 | `tests/unit/descriptor.test.js:138-147` *"a dev descriptor digest ignores tracked-source edits…"* — builds its dev fixture with `fs.mkdirSync(path.join(paths.core,'app','0.0.1','.git'))` | that path is **inside** `<core>/app` ⇒ the fixture becomes prod ⇒ `treeDigest` is digested ⇒ the tracked-source edit now drifts ⇒ its `assert.equal(...)` fails |
| R2 | `tests/unit/descriptor.test.js:256-261` *"a dev-checkout app records stance dev"* — same idiom | `d.appRelease.stance` becomes `'prod'` |
| R3 | `tests/unit/launcher.test.js:120-127` *"a prod descriptor over a dev-looking tree (planted .git) ⇒ refuse"* — plants an **empty `.git` directory** | an empty directory contributes **zero** pairs to `appTreeDigestOf` (it pushes only `isFile()` entries, `launcher.js:133`), so the tree digest is unchanged and `verifyAndResolve` now returns `ok:true` |
| R4 | `tests/scenarios/a7-integrity/fixtures/cases.js:130-137` case `3-stance` — the same empty-`.git`-dir plant, expecting `refuse` | same as R3; surfaces through `tests/unit/a7-integrity-negatives.test.js`'s shared loop |
| R5 | `tests/unit/vendor.test.js:266-…` *"dev mode via WIENERDOG_DEV links current at the checkout, copies nothing"* | `WIENERDOG_DEV` becomes inert ⇒ `vendorSelf` copies into `<core>/app/<version>` |

R3's mechanism is the subtlest fact in this WP. **An empty `.git` directory does
not change the app release digest.** Do not write any test or case that relies on
planting an empty directory to cause a refusal.

### 7. Tests and fixtures that already survive unchanged (do not "fix" them)

- `tests/unit/launcher.test.js:230-262` `setupDev()` copies a checkout to a temp
  dir **outside `<core>/app`** and vendors it, so its `current` is already
  non-contained ⇒ still `dev` under the new rule. Its `.git` writes must **stay**
  — `vendorSelf` still needs them to choose link-over-copy. Only its comment
  changes.
- `tests/scenarios/a7-integrity/fixtures/build.js:55-62` `devSource()` — same
  shape, same conclusion. **`build.js` is NOT a deliverable.**
- `tests/unit/launcher.test.js:300-308` *"WIENERDOG_DEV=1 in the scheduler env +
  a PROD descriptor does NOT flip to dev"* — passes before and after; it becomes
  doubly true. Preservation check, leave it alone.
- `tests/unit/launcher.test.js:100-111` *"repointing current OUT of `<core>/app`
  ⇒ refuse"* and case `2c-escape` — preservation checks for Table B row 2.

### 8. Prose that this change falsifies

- `docs/GLOSSARY.md:30` **production/dev stance** — *"The launcher refuses a prod
  entry that resolves to a dev-looking tree, so a planted `.git` cannot downgrade
  verification"*. After this WP the launcher does not refuse; the plant simply
  never selects the reduced path.
- `docs/THREAT-MODEL.md:277-279` — *"the **production/dev stance** matches (a prod
  entry over a dev-looking tree — e.g. a planted `.git` — is refused, never
  silently downgraded to the unverified dev path)"*. Same falsification.
- `tests/scenarios/a7-integrity/README.md:52` — the `3-stance` matrix row
  (*"plant `.git` (prod→dev downgrade) | stance | refuse, \"looks like a dev
  checkout\""*), which must track `cases.js`.

`docs/GLOSSARY.md:25` (**job descriptor**) and `:27` (**app release digest**) are
**not** falsified by this WP and are not to be touched — `:25` is
`WP-dev-descriptor-no-tree-hash`'s deliverable.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing, recorded rather than left implicit.** Ten paths, of which three are
one-to-three-line prose corrections mechanically implied by Table A, and four are
test files that this change **forces** red (Current state §6) rather than
optional additions. New non-test source is ≈ 55 lines (one added function per
side of the trust boundary, one deleted function, three edited branches); new
test content ≈ 190 lines. Zero "and also" clauses: every path exists to make one
sentence true — *the stance is decided by containment*. This is **M**, one
session. It exceeds `docs/specs/README.md:11`'s ≤ 8-file heuristic by two, and
that is deliberate: `docs/THREAT-MODEL.md` and the harness README state the
security claim this WP inverts, and shipping code that falsifies a shipped threat
model in order to hit a file count is the wrong trade. It is well under the same
line's ≤ ~400-line bound.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/vendor.js | **D1** — add + export `installStance(paths)` (Table A). **D2** — `isDevCheckout` loses its `env` parameter and the `WIENERDOG_DEV` branch (Table D). Nothing else: `verifyCurrentContainment`, `vendorSelf`'s structure, `repointCurrent`, `makeTreeFilesReadOnly`, `writeLauncher`, `writeShim`, `COPY_INCLUDE` are untouched. |
| modify | src/scheduler/descriptor.js | **D3** — `stance` comes from `installStance(paths)` (Table A); the now-unused `const env` at `:135` and the `env?` entry in the `opts` JSDoc are deleted. No other change: `appTreeDigestOf`, `appTreeDigest`, both `appRelease` arms, `reduceForDigest`, `descriptorDigest`, `canonicalize`, `writeDescriptor`, `deriveDescriptorDigest` are untouched. |
| modify | src/scheduler/launcher.js | **D4** — delete `isDev` (`:141-155`); add + **export** `liveStance(p)` (Table A); rewrite the dev-arm cross-check and **delete** the prod-arm one (Table B, Table C); update the header bullet 3 (`:11-12`) and the `derivationEnv` comment (`:211-213`). `verifyCatchup`, `verifyContainment`, `containedIn`, `appTreeDigestOf`, `appendRefuseAlert`, `parseArgv`, `main` bodies unchanged. |
| modify | tests/unit/vendor.test.js | **T1**, **T2**, **T3**, **T4** (Test index). Converts R5. |
| modify | tests/unit/descriptor.test.js | **T5**, **T6**. Converts R1 and R2. The prod assertions at `:208-209` must stay **unmodified**. |
| modify | tests/unit/launcher.test.js | **T7**, **T8**, **T9**. Converts R3. `setupDev`'s comment only; its `.git` writes stay. The tests at `:100-111`, `:211`, `:224` and `:300-308` must stay **unmodified**. |
| modify | tests/scenarios/a7-integrity/fixtures/cases.js | **T10** — case `3-stance` is replaced by `3a`/`3b`/`3c` and `REASON.stance` is re-pointed (Table C). No other case, no other `REASON` key. |
| modify | tests/scenarios/a7-integrity/README.md | **D5** — the single `3-stance` matrix row at `:52` becomes three rows matching `cases.js`. No other line. |
| modify | docs/GLOSSARY.md | **D6** — the **production/dev stance** entry (`:30`) only; exact wording in Implementation notes. |
| modify | docs/THREAT-MODEL.md | **D7** — the stance clause at `:277-279` only; exact wording in Implementation notes. |

Not deliverables, deliberately: `src/cli/sync.js`, `src/cli/schedule.js`,
`src/cli/run-job.js`, `src/cli/doctor.js`, `src/core/manifest.js`,
`tests/scenarios/a7-integrity/fixtures/build.js`,
`tests/unit/a7-integrity-negatives.test.js`,
`tests/unit/scheduler-schedule.test.js`,
`tests/scenarios/a7-integrity/run-a7-integrity.js`,
`docs/adr/0028-scheduler-app-executable-integrity.md`,
`docs/specs/WP-dev-descriptor-no-tree-hash.md`. See Out of scope for each.
Several of them contain tests that must pass **unmodified** — that is this WP's
proof that nothing else moved.

### Exact contracts

```js
// src/core/vendor.js — NEW, exported
/**
 * The install's STANCE, decided by CONTAINMENT of `<core>/app/current` inside
 * `<core>/app` — the one property an A7-scoped write INTO the app tree cannot
 * forge (ADR-0028 amendment §3/§4, WP-stance-authority-containment). Consults
 * NO signal inside the tree: not `.git`, not `env.WIENERDOG_DEV`, not any file
 * under `app/current`. Fails CLOSED: any unresolvable path ⇒ 'prod', the
 * ENFORCED path. MUST stay behaviourally identical to the launcher's inlined
 * `liveStance` (a cross-implementation test pins that).
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {'prod'|'dev'}
 */
function installStance(paths)

// src/core/vendor.js — CHANGED signature
/** Dev checkout? A `.git` at `root` that is a DIRECTORY (normal clone) OR a
 *  regular FILE (git worktree). Decides copy-vs-link in `vendorSelf` ONLY — it
 *  is NOT the stance authority (that is `installStance`) and it deliberately
 *  takes no `env`: no environment variable may select a verification path.
 *  @param {string} root @returns {boolean} */
function isDevCheckout(root)          // was: isDevCheckout(root, env = process.env)

// src/scheduler/launcher.js — NEW, exported (self-contained copy; the launcher
// cannot require vendor.js from the tree it is verifying — launcher.js:16-26)
/** @param {{appDir:string, appCurrent:string}} p @returns {'prod'|'dev'} */
function liveStance(p)
```

Worked examples (all four are acceptance criteria):

```
<core>/app/current -> <core>/app/0.4.1                      ⇒ 'prod'
<core>/app/current -> <core>/app/0.4.1  (+ a planted .git)  ⇒ 'prod'   ← the fix
<core>/app/current -> /Users/g/wienerdog                    ⇒ 'dev'
<core>/app/current  missing / unresolvable                  ⇒ 'prod'   ← fail closed
```

`descriptorDigest` for an unchanged install is **unchanged** — see Table F. No
schema change, no new field, no new file, no migration command.

## Contract reference

**Activation (ADR-0031, 2-of-7): five triggers fire, so the discipline is on.**
(ii) a **result taxonomy** changes — one launcher refusal reason is deleted and
one is added; (iv) **error / fallback / precedence** behavior changes — the
fail-closed direction of an unresolvable path, and which arm a mismatch takes;
(v) the task **crosses an authority boundary** — `vendor.js` decides the stance,
`descriptor.js` records it into `<core>/state`, and `launcher.js`, a
self-contained file outside the app tree, independently re-observes and enforces
it; (vi) **a successor spec inherits the contract** —
`WP-dev-descriptor-no-tree-hash` builds its dev fixtures with the idiom this WP
invalidates; (vii) the **same contract appears in multiple mirrored surfaces** —
two independent implementations of the rule, plus `cases.js`'s `REASON` map, the
GLOSSARY, the THREAT-MODEL and the harness README.

### Table A — the stance rule (canonical; every other statement defers to this)

| Fact | Value |
|------|-------|
| **Authority** | containment of `<core>/app/current` inside `<core>/app` |
| **`'dev'` iff** | `fs.realpathSync(<core>/app)` **and** `fs.realpathSync(<core>/app/current)` both resolve, **and** `path.relative(realApp, realCurrent)` is non-empty **and** (starts with `..` **or** is absolute) |
| **`'prod'`** | every other outcome — including either `realpathSync` throwing (**fail closed to the ENFORCED path**) |
| **Signals that MUST NOT be consulted** | a `.git` at any location; `env.WIENERDOG_DEV`; any other file under `app/current`; the file **ownership** of the target (that is `verifyContainment`'s job and it must never select an arm) |
| **Mint implementation** | `src/core/vendor.js` `installStance(paths)` (exported) |
| **Mint call site** | `src/scheduler/descriptor.js` `buildDescriptor` — `const stance = installStance(paths);` replaces `:186` |
| **Fire implementation** | `src/scheduler/launcher.js` `liveStance(p)` (exported), a deliberate self-contained duplicate |
| **Fire call site** | `verifyAndResolve`, replacing `const liveDev = isDev(target);` at `:275`, evaluated **before** any `require` from the app tree |
| **Cross-implementation invariant** | for every install shape, `liveStance(corePathsOf(paths)) === installStance(paths)` (T4) |

### Table B — decision matrix (bound stance × live containment)

| descriptor `appRelease.stance` | `liveStance` | Launcher outcome |
|---|---|---|
| `'prod'` | `'prod'` | prod verification: ownership + app release digest + descriptor digest (**unchanged**) |
| `'prod'` | `'dev'`  | refuse via `verifyContainment` — reason C2 (**unchanged behaviour**; the dedicated pre-check is deleted as redundant) |
| `'dev'`  | `'dev'`  | dev arm: bound-root equality, then the reduced descriptor digest (**unchanged**) |
| `'dev'`  | `'prod'` | refuse — reason **C1**, NEW. Zero spawn, durable alert, remedy `wienerdog sync` |
| anything else | — | refuse — `descriptor stance … is not prod or dev` (**unchanged**, `launcher.js:301`) |

Row 4 is the migration path for every descriptor minted under the old rule on a
contained tree — i.e. exactly the attacked or `WIENERDOG_DEV`-abused installs
(Table F).

### Table C — launcher refusal reasons touched by this WP (canonical strings)

| id | Emitted by | Literal fragment that must appear | Status |
|----|-----------|-----------------------------------|--------|
| **C1** | `verifyAndResolve` dev arm, live stance ≠ dev | `authorized for a dev checkout but app/current now resolves inside` | **NEW** |
| **C2** | `verifyContainment` via the prod arm | `app/current does not resolve inside` | unchanged |
| **C3** | prod arm, tree comparison | `the live app tree does not match the descriptor` | unchanged |
| **C4** | dev arm, bound-root check | `does not resolve to the authorized checkout root` | unchanged |
| **C5** | *(deleted)* | `looks like a dev checkout (.git present)` | **REMOVED — must not appear anywhere under `src/` or `tests/`** |

Full C1 text (the launcher's `refuse()` wraps it with the fixed banner):

> `the descriptor was authorized for a dev checkout but app/current now resolves inside <core>/app`

### Table D — `WIENERDOG_DEV` disposition (which call sites may honour it)

| Site | Before | After |
|------|--------|-------|
| `src/core/vendor.js` `isDevCheckout` | `if (env.WIENERDOG_DEV === '1') return true;` | **deleted**, together with the `env` parameter — the function has no access to an environment to honour |
| `src/core/vendor.js` `vendorSelf` (`:167`) | `isDevCheckout(root, env)` | `isDevCheckout(root)`; `opts.env` stays in the signature (other reads may follow) but is not passed here |
| `src/scheduler/descriptor.js` `buildDescriptor` | `isDevCheckout(appRoot, env)` | `installStance(paths)`; the local `const env` (`:135`) is deleted |
| `src/scheduler/launcher.js` `derivationEnv` (`:219`) | `delete e.WIENERDOG_DEV;` | **KEPT** — defence in depth against reintroduction. This is the **only** permitted occurrence of the token under `src/` |
| anywhere else in `src/` | — | forbidden |

**Enforced, not documented:** T3 walks every `.js` file under `src/` and asserts
that no line outside `src/scheduler/launcher.js` contains `WIENERDOG_DEV`, with a
built-in non-vacuity control (the same walk must visit ≥ 60 files and find
`WIENERDOG_HOME` in ≥ 5 of them — measured on `main`: **86** `.js` files, **8**
containing `WIENERDOG_HOME`). A walker that silently visits nothing would
otherwise pass this test forever.

### Mirrored Surface Checklist

Table A is the single place the stance rule is decided; Table C the single place
the reason strings are decided. Every surface that restates them is registered
below so one finding updates all of them in one pass, and any new mirror found in
review is added here on the spot.

In this spec:

- [ ] Deliverables cells for `src/core/vendor.js` (D1/D2), `src/scheduler/descriptor.js` (D3), `src/scheduler/launcher.js` (D4)
- [ ] "Exact contracts" JSDoc blocks and the four worked examples
- [ ] Acceptance criteria AC1–AC4 (Table A), AC5–AC7 (Table B), AC8 (Table C), AC9–AC10 (Table D)
- [ ] Verification commands V1, V2, V6, V7 and their `main` baselines
- [ ] Current state §1, §2, §3, §4, §6, §8
- [ ] Implementation notes → "Why containment survives the attack it replaces", "Migration" (Table F)
- [ ] Security checklist bullets 1–4
- [ ] Mutation checks (Table E) rows 1–8
- [ ] Test index rows T1–T10

Out of this spec (all are Deliverables of this WP, so they move in the same PR):

- [ ] `src/scheduler/launcher.js` header bullet 3 (`:11-12`) — prose restating Table B
- [ ] `tests/scenarios/a7-integrity/fixtures/cases.js` `REASON` map — the literal fragments of Table C
- [ ] `tests/scenarios/a7-integrity/README.md:52` — the `3-stance` matrix rows
- [ ] `docs/GLOSSARY.md:30` **production/dev stance**
- [ ] `docs/THREAT-MODEL.md:277-279` — the stance clause

Not registered, and why: `docs/GLOSSARY.md:25`/`:27` describe the descriptor
field set and the digest definition, neither of which this WP changes;
`docs/runbooks/scheduler-and-executable-integrity.md` describes the dev reduction
generically and never states how the stance is decided (grepped: no `stance`
match); `docs/adr/0028-…` is the ratification surface and belongs to the
concurrent amendment, not to this WP.

## Implementation notes & constraints

### Why containment survives the attack it replaces (read this before reviewing)

This exact hole has now been relocated twice by successive fixes — first
`WIENERDOG_DEV`, then on-disk `.git`. The design must therefore be attacked, not
asserted.

**What defeats containment.** Exactly one capability: *changing what
`<core>/app/current` resolves to*. That means writing the `current` symlink
itself, or replacing any path component of its target that lies outside the app
tree (e.g. swapping `<core>/app/<version>` for a symlink to an attacker
directory). Writing *into* the tree — appending to `src/core/errors.js`, creating
`<core>/app/<version>/.git`, dropping a whole new subdirectory — cannot change
it, and that is the entire A7 adversary.

**And that capability is already game-over on `main`, which is why binding to
containment gives up nothing.** An attacker who can repoint `current` at a
directory they control need only place a `.git` in it: today's mint classifies
that directory `dev` (`isDevCheckout(appRoot)` ⇒ true), the fire-time liveness
check passes, the bound-root comparison passes *trivially* because the bound root
**is** the live target, and `reDeriveDigest` then `require`s the attacker's own
`src/core/paths`, `src/scheduler/jobs` and `src/scheduler/descriptor`. The same
actor can equally overwrite `<core>/launcher/launch.js`, which `launcher.js:30-33`
already declares out of A7's scope: *"any write reaching THIS launcher file …
are A12's territory (arbitrary same-user writes under `<core>`), not A7's."* So
the set of write capabilities that reach the reduced path shrinks from
{*any* write inside the app tree} ∪ {repoint `current`} to {repoint `current`}.
Strictly smaller, and the remainder is a capability the shipped design already
concedes.

**The one thing that must not be claimed.** Do **not** argue that a stance marker
kept in `<core>/state` would harden this further. `<core>/state` and `<core>/app`
are both same-uid directories under the same core; no realistic adversary can
write one and not the other, so a marker would buy a capability boundary that
does not exist while adding a file, a manifest entry, an uninstall path and a
migration. It was considered and rejected for exactly that reason.

**The objection a reviewer will raise, answered.** *"If the stance is derived
from containment, doesn't the prod arm's containment check become tautological?"*
No — because the two observations are separated in time. The descriptor's stance
was minted at the last attended `sync`; `liveStance` is observed at fire, which
may be a month later. A repoint performed between the two flips the live
observation and must refuse (Table B rows 2 and 4). This is structurally the same
cross-check the launcher performs today, moved from a forgeable signal onto an
unforgeable one.

**Why `vendorSelf`'s remaining `.git` read is not the same hole.** `vendorSelf`
tests `packageRoot()` — the *running installer's* root — to choose copy-vs-link,
which does influence where `current` ends up. On a prod install, `wienerdog sync`
runs through the shim at `<core>/app/current/bin/wienerdog.js`, and Node resolves
`__filename` through symlinks, so `packageRoot()` is `<core>/app/<version>`. A
planted `.git` there therefore makes `vendorSelf` take its dev branch, set
`target = <core>/app/<version>`, and `repointCurrent` to the place `current`
already points — a no-op that leaves the install **contained**, hence **prod**.
Containment neutralises it. The other case, an installer the user ran from
outside `<core>/app`, is a tree the A7 adversary cannot write. This is why
`isDevCheckout` may keep its `.git` read and **may not** keep its `env` read: an
environment variable is settable from a shell profile regardless of which tree
the installer was run from.

### D1 — `src/core/vendor.js`: `installStance`

Implement Table A directly with `fs.realpathSync` + `path.relative`. Place it
next to `verifyCurrentContainment` and export it from the module footer
(`vendor.js:359-363`).

**Do NOT implement it as `verifyCurrentContainment(paths).ok ? 'prod' : 'dev'`.**
`verifyCurrentContainment` also fails on POSIX **ownership**, so that delegation
would let a foreign-owned `current` select the *reduced* verification path — a
strictly worse outcome than the bug being fixed. T2 is the runtime gate for this
and Table E row 3 is its mutation proof. The small duplication between the two
functions is deliberate and must be noted in `installStance`'s doc comment.

### D2 — `src/core/vendor.js`: `isDevCheckout`

Delete the `env` parameter and the `WIENERDOG_DEV` branch (Table D); update the
doc comment at `:25-29`, whose current text advertises both the env var and the
"so a worktree dev install produces a `dev`-stance descriptor the launcher can
then verify (F10)" rationale — that rationale is now false, because this function
no longer decides any stance. Say what it does decide: copy-vs-link in
`vendorSelf`. Fix the `vendorSelf` call at `:167` to `isDevCheckout(root)`.

Accepted cost, stated plainly: a developer whose working copy has no `.git` (a
tarball export, a `git worktree` whose gitfile was removed) can no longer force a
linked install with `WIENERDOG_DEV=1`. The workaround is `git init`. This is a
developer convenience that is also an env-settable input to a verification-path
decision; the project's last three findings each closed by subtracting, and this
one subtracts too.

### D3 — `src/scheduler/descriptor.js`

Replace `:186` with `const stance = installStance(paths);`, add `installStance`
to the destructured `require('../core/vendor')` at `:175`, and delete the now-dead
`const env = opts.env || process.env;` at `:135`. Also delete `env?:NodeJS.ProcessEnv`
from the `opts` JSDoc at `:119` and add one clause: no field of the descriptor is
environment-derived any more, so call sites that still pass `opts.env`
(`launcher.js:247`, several tests) are harmless and **are not to be edited**.

That deletion is a strengthening worth noticing: after it, `buildDescriptor`'s
output is a function of on-disk state alone, so the fire-time re-derivation can
no longer be steered by an inherited environment at all.

`appRoot` (`:178`) stays — `readVersion(appRoot)` and the dev `root` field still
need it. Yes, `installStance` realpaths `current` a second time; that is two
`realpathSync` calls on a path that was just resolved, which is not worth
plumbing a parameter to avoid. Note it in the PR under "Decisions made".

### D4 — `src/scheduler/launcher.js`

1. Delete `isDev` (`:141-155`) entirely — after step 3 it has no caller.
2. Add `liveStance(p)` implementing Table A, next to `verifyContainment`, and add
   it to `module.exports` (`:490`) so T4 can compare it against
   `vendor.installStance`. Reuse the existing `containedIn` helper, but **guard
   the resolution explicitly**: `containedIn` returns `false` on any `realpathSync`
   failure, which as a stance would be `'dev'` — the fail-**open** direction.
   Table A requires `'prod'`.
3. In `verifyAndResolve`: replace `const liveDev = isDev(target);` (`:275`) with
   `const live = liveStance(p);`. In the dev arm replace the `:282` guard with a
   `live !== 'dev'` guard emitting **C1**. In the prod arm **delete** the `:302`
   line entirely — `verifyContainment(p, platform)` at `:305` already refuses the
   same case with reason **C2**, and one branch is better than two.
   `live` must be computed **before** the dev arm's `reDeriveDigest`, which is
   the first thing that loads code from the tree.
4. Update the header comment bullet 3 (`:11-12`, currently *"prod/dev stance
   matches (no planted `.git` downgrade of a prod install)"*) to state Table A's
   rule, and `derivationEnv`'s comment (`:211-213`) to say the `WIENERDOG_DEV`
   scrub is now purely defence in depth because no `src/` code reads the variable.

Cross-platform: nothing here is platform-specific. `liveStance` uses only
`realpathSync` and `path.relative`, both of which behave identically on win32;
the launcher's existing win32 reduction is in `verifyContainment` (it skips the
uid check, `:104`) and is **not** touched. Table B holds identically on launchd,
systemd and schtasks because all three invoke the same `launch.js` with the same
argv — the platform difference lives in the generators, which are not deliverables.

### D5/D6/D7 — the prose mirrors (exact wording)

`tests/scenarios/a7-integrity/README.md:52` — replace the single `3-stance` row
with three rows whose ids, guards and outcomes match `cases.js` exactly:

```
| 3a-plant-git-prod | plant `.git` in the prod app tree, re-mint | stance | RUNS — the plant does not downgrade |
| 3b-plant-git-tamper | same plant + an app-code byte edit | app-tree-digest | refuse, "app tree does not match" |
| 3c-stale-dev | descriptor says `dev`, `current` is contained | stance | refuse, "authorized for a dev checkout" |
```

`docs/GLOSSARY.md:30` — replace the **production/dev stance** entry's body with:

> whether an install runs the vendored `app/<version>` (**prod**,
> integrity-enforced) or a dev checkout (**dev**, mutable-by-design). The stance
> is decided by **containment**: an install is **dev** only when
> `<core>/app/current` resolves *outside* `<core>/app`; every other case —
> including a `.git` planted inside the app tree, an environment variable, or an
> unresolvable path — is **prod**. The launcher re-observes containment at fire
> time and refuses whenever it disagrees with the stance bound into the job
> descriptor, in either direction (A7, WP-157, WP-stance-authority-containment).

Keep the entry's existing leading bullet and bolded term, and its trailing
`(Not: …)` clause if present; change nothing else on the line.

`docs/THREAT-MODEL.md:277-279` — replace the clause
*"and the **production/dev stance** matches (a prod entry over a dev-looking tree
— e.g. a planted `.git` — is refused, never silently downgraded to the unverified
dev path)"* with:

> and the **production/dev stance** matches, where the stance is decided by
> containment alone — an install is dev only when `app/current` resolves outside
> `<core>/app`, so no write *into* the app tree (a planted `.git`, an env var)
> can select the reduced verification path, and a disagreement between the bound
> and live stance is refused in either direction

Leave the surrounding bullet (the read-only publish sentence, the interrupted-
update sentence) untouched. Do not touch `docs/THREAT-MODEL.md:336`'s
"Enforcement reductions" bullet: it describes what a dev install *skips*, which
this WP does not change.

### General

- No new npm dependencies; plain Node ≥ 18; JSDoc only, no TypeScript, no build
  step; zero runtime deps (ADR-0013).
- No new file is written to a user machine, so the install manifest and
  `wienerdog uninstall` are unchanged and remain reversible. Idempotence is
  unaffected: `installStance` is a pure read.
- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope to resolve it.

### Migration — Table F

The stance is recorded in the descriptor, and (for prod) is digest-covered
directly, (for dev) survives `reduceForDigest` as `{stance:'dev', root}`. So a
stance flip changes the digest, and an unchanged classification changes nothing.

| Install | Old classification | New classification | Before any `sync` | After one attended `wienerdog sync` |
|---|---|---|---|---|
| real dev checkout (the maintainer's: `~/.wienerdog/app/current -> …/wienerdog`) | dev (`.git`) | dev (not contained) | **descriptor byte-identical, digest byte-identical, OS entry keeps verifying — no re-mint, no user action** (V8) | identical |
| ordinary prod install | prod | prod (contained) | identical, digest identical | identical |
| prod tree with a planted `.git` (**the attack**) | dev | prod (contained) | **fails closed** at fire: Table B row 4, reason C1, zero spawn, durable alert naming `wienerdog sync` | re-minted `prod`; full app-code enforcement resumes |
| prod install synced once with `WIENERDOG_DEV=1` | dev | prod (contained) | same as the row above | same as the row above |
| dev checkout whose `.git` was removed | prod | dev (not contained) | **already broken today** — the prod arm's `verifyContainment` refuses (C2); unchanged | re-minted `dev`; starts working for the first time |

**Fail closed or silent re-mint? Both, in the only order that is safe.** At
**fire** time nothing is ever minted: a bound/live disagreement is a hard refusal
with a durable alert. A re-mint happens only inside an **attended**
`wienerdog sync`, which the user runs deliberately and which also re-registers
the OS entry with the new digest (WP-043). That is the defensible split: a silent
fire-time re-mint would destroy the property outright, and a refusal that no
command can clear would strand a user. The attacker gains nothing by provoking
the sync, because after this WP the re-mint **cannot** produce `dev` for a
contained tree — which is exactly what "moving the attack one attended sync
earlier" no longer buys.

Nothing must be re-minted for correctness; the only installs that change
behaviour are the misclassified ones, and for them the change *is* the fix.

## Security checklist

- [ ] **No verification is removed, reordered or weakened on either arm.** The
      prod arm still runs ownership, the app release digest and the descriptor
      digest, in that order. The dev arm still runs bound-root equality and the
      reduced descriptor digest. The only deleted check (`launcher.js:302`) is
      strictly subsumed by `verifyContainment` two lines later (Table B row 2,
      preserved by the unmodified test at `tests/unit/launcher.test.js:100-111`
      and case `2c-escape`).
- [ ] **The new stance signal is not writable by this WP's adversary.** Table A's
      rule reads only the resolution of `<core>/app/current`; no file *inside*
      `app/current` participates. The residual capability, and why it is already
      conceded, is stated in "Why containment survives the attack it replaces".
- [ ] **Fail-closed direction is asserted, not assumed.** An unresolvable
      `<core>/app` or `<core>/app/current` yields `'prod'` — the enforced path —
      at BOTH implementations (T2, T4, Table E row 2). The naive
      `containedIn(...) ? 'prod' : 'dev'` in the launcher fails **open** and is
      the trap this bullet exists to catch.
- [ ] **Ownership must never select an arm.** `installStance` must not delegate
      to `verifyCurrentContainment` (T2, Table E row 3).
- [ ] **No environment variable can select a verification path.** `isDevCheckout`
      no longer receives an environment; `buildDescriptor` no longer reads one;
      a source-walk test enforces it with a non-vacuity control (T3, Table D).
- [ ] **No untrusted identifier reaches a filesystem path or a shell command.**
      This WP introduces no new path construction, no new `require` target, no
      new argv element and no new user-supplied value; it only replaces one
      boolean's source and deletes a parameter. The anchored-path checks
      (`path.relative` on realpath-canonical inputs, `..`-and-absolute rejection)
      are the existing ones and are applied to values Wienerdog itself resolved.
- [ ] **No daemon, watcher, poller or background process** (ADR-0004); the
      launcher still runs and exits with each fire; no new file is written to a
      user machine, so uninstall stays complete.

## Acceptance criteria

**Preamble — a test that passes against unmodified `main` is not evidence.**
Every criterion below marked *(change)* must be demonstrated **red before the fix
and green after**, and every row of Table E must be demonstrated red. Paste both
sets of output into the PR body. A new verification command that cannot fail is a
defect in this WP, not a pass. Criteria marked *(preservation)* are the
deliberate exception: they assert that something did **not** move, so their `main`
output *is* their success output — do not "fix" them by making them fail on `main`.

- [ ] **AC1 (mint: containment decides) *(change)*.** On a prod-shaped fixture
      whose `current` is contained, `buildDescriptor` yields `stance:'prod'`
      when a `.git` **file** is planted in the app tree, when a `.git`
      **directory** is planted, and when `WIENERDOG_DEV=1` is passed in
      `opts.env`. V1 prints all four rows and exits 0. (T5, V1)
- [ ] **AC2 (mint: dev still classifies dev) *(change/preservation)*.** A fixture
      whose `current` resolves **outside** `<core>/app` yields `stance:'dev'`,
      with `.git` present **and** with `.git` absent. (T5, V8)
- [ ] **AC3 (mint: fail closed) *(change)*.** `installStance` returns `'prod'`
      when `<core>/app/current` is missing, when it dangles, and when
      `<core>/app` itself cannot be resolved. (T2)
- [ ] **AC4 (ownership must not select the arm) *(change)*.** With
      `stubForeignOwner` making `current`'s target report a foreign uid,
      `installStance` still returns `'prod'` for a contained install — while
      `verifyCurrentContainment` on the same fixture returns `ok:false`. Both
      assertions in one test, so a delegating implementation cannot pass. (T2)
- [ ] **AC5 (fire: stale dev descriptor over a contained tree ⇒ refuse) *(change)*.**
      A prod fixture whose descriptor file has `appRelease.stance` hand-set to
      `"dev"` refuses with reason **C1**, spawns nothing, and does so **before**
      any `require` from the app tree. (T7, T10 case `3c`)
- [ ] **AC6 (fire: prod over a non-contained tree ⇒ refuse) *(preservation)*.**
      `tests/unit/launcher.test.js:100-111` and case `2c-escape` pass
      **unmodified**, still emitting reason **C2**.
- [ ] **AC7 (fire: real dev install still runs) *(preservation)*.**
      `tests/unit/launcher.test.js`'s `setupDev('file')` and `setupDev('dir')`
      tests pass with no assertion edited: a dev install runs, a tracked-source
      edit still runs, a config edit still refuses, a repoint off the bound root
      still refuses (**C4**).
- [ ] **AC8 (the attack, end to end, observing the job's real outcome) *(change)*.**
      Plant `.git` in a prod-shaped fixture → run the **mint** (`writeDescriptor`)
      → assert the written descriptor's `appRelease.stance === 'prod'` → tamper an
      app **code** file (`src/core/errors.js`) → drive `launcher.main` with a
      recording spawn and assert **exit code 1**, **spawn count 0**, and a durable
      alert matching **C3**. On `main` this run yields exit 0, spawn count 1 and
      argv `["run-job","dream"]`. (T8, T10 cases `3a`/`3b`, V2)
- [ ] **AC9 (`WIENERDOG_DEV` is inert) *(change)*.** `vendorSelf` on a
      `.git`-free source with `env:{WIENERDOG_DEV:'1'}` returns `dev:false`,
      `copied:true`, and leaves `current` resolving inside `<core>/app`. (T1)
- [ ] **AC10 (`WIENERDOG_DEV` is unreadable from `src/`) *(change)*.** No `.js`
      file under `src/` outside `src/scheduler/launcher.js` contains the token,
      and the walk that proves it visited ≥ 60 files and found `WIENERDOG_HOME`
      in ≥ 5 of them. (T3, V7)
- [ ] **AC11 (the two implementations agree) *(change)*.** Over four install
      shapes — contained prod, non-contained dev, missing `current`, unresolvable
      `<core>/app` — `launcher.liveStance(corePathsOf(paths))` equals
      `vendor.installStance(paths)`, **and** the four results include at least one
      `'prod'` and at least one `'dev'` (without which two constant functions
      would satisfy the equality). (T4)
- [ ] **AC12 (reason C5 is gone) *(change)*.** V6 finds zero occurrences of
      `looks like a dev checkout` under `src/` and `tests/`. On `main` there are
      four.
- [ ] **AC13 (dev migration is a no-op) *(change → equality)*.** V8's printed
      descriptor digest for a fixed-root dev fixture is **identical** on `main`
      and on the branch:
      `sha256:b6ed5746a75a4aa089d098bf0d722803452199d145651333b3e0e0b8c5b0f5d5`
      (measured this session, twice, at `efd1489`). Paste both runs.
- [ ] **AC14 (mutation matrix) *(change)*.** Every row of Table E was
      demonstrated red; output pasted in the PR.
- [ ] **AC15 (nothing else moved) *(preservation)*.** `npm test` and
      `npm run lint` pass, and `git diff --stat` touches exactly the ten
      Deliverables paths plus this spec.

### Table E — Mutation checks (apply to the FIXED tree; the named test must turn RED)

| # | One-line source mutation | Test that must go red |
|---|--------------------------|-----------------------|
| 1 | `vendor.installStance`: invert the containment test (return `'dev'` for a contained current) | T5 (AC1), T4 (AC11), **V1** |
| 2 | `vendor.installStance`: delete the `try/catch`, letting an unresolvable path throw instead of returning `'prod'` | T2 (AC3) |
| 3 | `vendor.installStance`: reimplement as `verifyCurrentContainment(paths).ok ? 'prod' : 'dev'` | T2 (AC4) — the foreign-uid case |
| 4 | `descriptor.buildDescriptor`: restore `const stance = isDevCheckout(appRoot, env) ? 'dev' : 'prod';` | T5 (AC1), **V1**, **V2** |
| 5 | `vendor.isDevCheckout`: re-add the `env` parameter and the `WIENERDOG_DEV` branch | T1 (AC9), T3 (AC10), **V7** |
| 6 | `launcher.verifyAndResolve`: delete the dev arm's live-stance guard | T7 (AC5), T10 case `3c` |
| 7 | `launcher.liveStance`: implement as `containedIn(p.appDir, p.appCurrent) ? 'prod' : 'dev'` (no explicit resolution guard — the **fail-open** form) | T4 (AC11) — the unresolvable-`<core>/app` shape |
| 8 | `launcher.verifyAndResolve`: delete the prod arm's `verifyContainment` call | existing `tests/unit/launcher.test.js:100-111` (unmodified) + case `2c-escape` |

Two notes, because two of these rows are subtle:

- **Row 3 is the one that matters most.** It is the plausible "simplify by
  reusing the existing helper" edit, and it silently routes a foreign-owned
  `current` to the *reduced* path. If T2 does not go red under row 3, T2 is not
  asserting what AC4 says it does.
- **Row 7 must be red, and it is easy to write a T4 that stays green under it.**
  If T4's four shapes all resolve successfully, the two implementations agree
  trivially and row 7 passes. The unresolvable-`<core>/app` shape is the only one
  that discriminates; construct it by removing the `<core>/app` directory after
  capturing `corePathsOf(paths)`.

### Test index (what to write, and where)

| id | File | What it drives |
|----|------|----------------|
| T1 | tests/unit/vendor.test.js | **converts R5**: `vendorSelf` + `env:{WIENERDOG_DEV:'1'}` on a `.git`-free source ⇒ `dev:false`, `copied:true`, `current` contained (AC9) |
| T2 | tests/unit/vendor.test.js | `installStance`: contained ⇒ `'prod'`; outside ⇒ `'dev'`; planted `.git` inside ⇒ `'prod'`; missing/dangling `current` ⇒ `'prod'`; unresolvable `<core>/app` ⇒ `'prod'` (AC3); foreign-uid via `stubForeignOwner` ⇒ `'prod'` **while** `verifyCurrentContainment` ⇒ `ok:false` (AC4) |
| T3 | tests/unit/vendor.test.js | source walk over `src/**/*.js` for `WIENERDOG_DEV`, with the ≥ 60-files / ≥ 5-`WIENERDOG_HOME` non-vacuity control (AC10) |
| T4 | tests/unit/vendor.test.js | cross-implementation: `launcher.liveStance` ≡ `vendor.installStance` over four shapes, asserting both values occur (AC11) |
| T5 | tests/unit/descriptor.test.js | **converts R2**: stance by containment — planted `.git` file/dir and `WIENERDOG_DEV=1` all yield `'prod'`; an out-of-app `current` yields `'dev'` (AC1, AC2) |
| T6 | tests/unit/descriptor.test.js | **converts R1**: the dev-reduction test's fixture is rebuilt with `current` pointing OUTSIDE `<core>/app`; its assertions (tracked-source edit does not drift; model/layout/at/run/home edits do) stay **semantically identical** |
| T7 | tests/unit/launcher.test.js | **converts R3**: (a) a prod fixture + a planted `.git` **directory** now `ok:true` (no downgrade, digest unchanged); (b) a descriptor with `stance` hand-set to `"dev"` over a contained tree ⇒ refuse with **C1** (AC5) |
| T8 | tests/unit/launcher.test.js | the attack, unit level: plant → `writeDescriptor` → assert `'prod'` → tamper `src/core/errors.js` → refuse with **C3** (AC8) |
| T9 | tests/unit/launcher.test.js | comment-only update to `setupDev`'s doc block (the `.git` is now what makes `vendorSelf` link, not what makes the stance dev) |
| T10 | tests/scenarios/a7-integrity/fixtures/cases.js | **converts R4**: case `3-stance` → `3a-plant-git-prod` (positive: re-mint, exit 0, exactly one spawn), `3b-plant-git-tamper` (refuse, `REASON.treeDigest`), `3c-stale-dev` (refuse, the re-pointed `REASON.stance` = **C1**) |

**T10 mechanics, spelled out** because the harness contract is not obvious.
`tests/unit/a7-integrity-negatives.test.js` calls `runLauncher(fx, null, null,
ov.env)` **after** `c.mutate(fx)` has run, and `runLauncher` reads `fx.digest`
and `fx.descriptorPath` at call time. A case that needs a re-mint may therefore
do it inside `mutate` and assign the new digest back onto `fx`:

```js
const job = jobsLib.findJob(fx.paths, 'dream');
const w = descriptorMod.writeDescriptor(fx.paths, job, { env: fx.env }); // same call build.js makes
fx.digest = w.digest;
```

`cases.js` already imports `descriptorMod` and `jobsLib` at its head, so no new
import is needed. Add a comment at the re-mint line saying why it is there (it
models the one attended `sync` the attack needs). **`tests/unit/a7-integrity-negatives.test.js`
must not be modified** — the existing loop already handles both `refuse:true` and
`refuse:false` cases, and leaving it untouched is this WP's proof that the harness
contract did not change.

For `3c-stale-dev`, mutate the **written descriptor file** (read it, set
`appRelease.stance = 'dev'`, write it back) rather than rebuilding one — a
rebuild would classify prod and there would be nothing to test.

## Verification steps (run these; paste output in the PR)

Run everything from the repo root. **Every command below was executed against
unmodified `main` at `efd1489` while this spec was written; the "on `main`" line
under each is its real output there.**

V1, V2 and V8 are scripts. Write them **outside the repo** (`/tmp`, as the
heredocs below do) and run them from the repo root, so `process.cwd()` resolves
the requires. Do not commit them anywhere: no scratch path is in the Deliverables
table and `boundary-check` rejects any file that is not.

**Never use `node --test <file>` for anything in this WP.** `tests/run.js:7` is
the only place `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` is set, and it guards
`src/scheduler/spawn.js:26` from driving your **real** launchd. Use
`node tests/run.js <paths>` (argv forwarding is verified working) or
`npm test -- <paths>`.

```bash
# ── V1 (change) — THE MINT ORACLE. Does an A7-scoped write decide the stance?
cat > /tmp/v1-mint.js <<'JS'
'use strict';
process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER = '1';
const fs = require('node:fs'), path = require('node:path');
const R = process.cwd();
const { buildProdInstall, cleanup } = require(path.join(R, 'tests/scenarios/a7-integrity/fixtures/build'));
const D = require(path.join(R, 'src/scheduler/descriptor'));
const J = require(path.join(R, 'src/scheduler/jobs'));
const fx = buildProdInstall();
const out = {};
try {
  const app = fs.realpathSync(fx.corePaths.appCurrent);
  const job = J.findJob(fx.paths, 'dream');
  const rel = path.relative(fs.realpathSync(fx.corePaths.appDir), app);
  out.contained = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  out.clean = D.buildDescriptor(fx.paths, job, { env: fx.env }).appRelease.stance;
  out.envdev = D.buildDescriptor(fx.paths, job, { env: { ...fx.env, WIENERDOG_DEV: '1' } }).appRelease.stance;
  fs.writeFileSync(path.join(app, '.git'), 'gitdir: /elsewhere\n');
  out.plantFile = D.buildDescriptor(fx.paths, job, { env: fx.env }).appRelease.stance;
  fs.rmSync(path.join(app, '.git'));
  fs.mkdirSync(path.join(app, '.git'));
  out.plantDir = D.buildDescriptor(fx.paths, job, { env: fx.env }).appRelease.stance;
} finally { cleanup(fx.root); }
// Guard clauses: without them a broken fixture prints PASS for the wrong reason.
if (out.contained !== true) throw new Error('ORACLE BROKEN: the prod fixture is not contained');
if (out.clean !== 'prod') throw new Error('ORACLE BROKEN: a clean prod fixture did not mint prod');
console.log(`app/current contained in <core>/app : ${out.contained}`);
console.log(`mint stance, clean prod tree        : ${out.clean}`);
console.log(`mint stance, WIENERDOG_DEV=1        : ${out.envdev}`);
console.log(`mint stance, planted .git FILE      : ${out.plantFile}`);
console.log(`mint stance, planted .git DIR       : ${out.plantDir}`);
const ok = out.envdev === 'prod' && out.plantFile === 'prod' && out.plantDir === 'prod';
console.log(ok ? 'PASS: stance is containment-bound' : 'FAIL: an A7-scoped signal decided the stance');
process.exitCode = ok ? 0 : 1;
JS
node /tmp/v1-mint.js; echo "EXIT=$?"
# on main:  …WIENERDOG_DEV=1 : dev / …planted .git FILE : dev / …planted .git DIR : dev
#           FAIL: an A7-scoped signal decided the stance
#           EXIT=1
# required after: all three read `prod`, `PASS: stance is containment-bound`, EXIT=0
```

```bash
# ── V2 (change) + V3 (preservation) — THE ATTACK, END TO END, through launcher.main.
#     V2 = `plant` (the attack). V3 = `control` (identical run, no plant) and is
#     the non-vacuity proof: the script CAN print PASS, and does, on main.
cat > /tmp/v2-e2e.js <<'JS'
'use strict';
process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER = '1';
const fs = require('node:fs'), path = require('node:path');
const R = process.cwd();
const { buildProdInstall, recordingSpawn, cleanup } = require(path.join(R, 'tests/scenarios/a7-integrity/fixtures/build'));
const D = require(path.join(R, 'src/scheduler/descriptor'));
const J = require(path.join(R, 'src/scheduler/jobs'));
const L = require(path.join(R, 'src/scheduler/launcher'));
const mode = process.argv[2] === 'control' ? 'control' : 'plant';
const fx = buildProdInstall();
let code, calls, stance, alerts = '';
try {
  const app = fs.realpathSync(fx.corePaths.appCurrent);
  const job = J.findJob(fx.paths, 'dream');
  if (mode === 'plant') fs.writeFileSync(path.join(app, '.git'), 'gitdir: /elsewhere\n'); // 1. A7-scoped write
  const w = D.writeDescriptor(fx.paths, job, { env: fx.env });                            // 2. one attended sync
  stance = JSON.parse(fs.readFileSync(w.path, 'utf8')).appRelease.stance;
  const f = path.join(app, 'src', 'core', 'errors.js');                                   // 3. tamper app CODE
  try { fs.chmodSync(f, 0o644); } catch { /* already writable */ }
  fs.appendFileSync(f, '\n// attacker payload marker\n');
  const rec = recordingSpawn(); calls = rec.calls;                                        // 4. fire
  const oe = process.stderr.write; process.stderr.write = () => true;
  try {
    code = L.main(['dream', '--descriptor', w.path, '--expect-digest', w.digest],
      { env: fx.env, core: fx.paths.core, platform: process.platform, spawn: rec.spawn, exit: () => {} });
  } finally { process.stderr.write = oe; }
  try { alerts = fs.readFileSync(path.join(fx.paths.state, 'alerts.jsonl'), 'utf8'); } catch { alerts = ''; }
} finally { cleanup(fx.root); }
if (typeof code !== 'number' || !Array.isArray(calls)) throw new Error('ORACLE BROKEN: launcher.main returned nothing usable');
console.log(`mode                               : ${mode}`);
console.log(`descriptor stance after plant+sync : ${stance}`);
console.log(`launcher exit code                 : ${code}`);
console.log(`spawn count                        : ${calls.length}`);
console.log(`spawn argv                         : ${calls.length ? JSON.stringify(calls[0].args.slice(1)) : '(none)'}`);
console.log(`alert reason                       : ${(alerts.trim().split('\n').pop() || '(none)').slice(0, 160)}`);
const ok = stance === 'prod' && code === 1 && calls.length === 0;
console.log(ok ? 'PASS: app-code tamper refused, zero spawn' : 'FAIL: app-code tamper reached a spawn (or the stance downgraded)');
process.exitCode = ok ? 0 : 1;
JS
node /tmp/v2-e2e.js plant;   echo "EXIT=$?"     # V2
node /tmp/v2-e2e.js control; echo "EXIT=$?"     # V3
# V2 on main: stance dev / exit code 0 / spawn count 1 / argv ["run-job","dream"] /
#             alert reason (none) / FAIL … / EXIT=1
# V2 required after: stance prod / exit code 1 / spawn count 0 / argv (none) /
#             alert reason matching "the live app tree does not match the descriptor" /
#             PASS … / EXIT=0
# V3 on main AND after: stance prod / exit code 1 / spawn count 0 / PASS … / EXIT=0
```

```bash
# ── V4 (change: count) — the four unit files this WP edits, plus the harness
#     negatives that consume cases.js. `pass` must exceed the main baseline and
#     `fail` must be 0. NEVER `node --test` these (see the warning above).
node tests/run.js tests/unit/launcher.test.js tests/unit/descriptor.test.js \
                  tests/unit/vendor.test.js tests/unit/a7-integrity-negatives.test.js
# on main: 'ℹ tests 102' / 'ℹ pass 102' / 'ℹ fail 0'
#          (this repo's Node v25 prints the spec reporter, not TAP)
# required after: fail 0, pass > 102
```

```bash
# ── V5 (preservation) — full suite + lint.
npm test
npm run lint
# on main: lint prints 'Summary: 0 error(s)' … 'lint passed'
```

```bash
# ── V6 (change) — the deleted refusal reason (Table C, C5) is gone.
grep -rn 'looks like a dev checkout' src/ tests/
# on main: FOUR lines — src/scheduler/launcher.js, tests/unit/launcher.test.js,
#          tests/scenarios/a7-integrity/fixtures/cases.js,
#          tests/scenarios/a7-integrity/README.md
# required after: no output (grep exits 1). Do NOT widen this to docs/: the
#          occurrence in docs/specs/done/WP-158-a7-integrity-harness.md is
#          shipped history and must stay.
```

```bash
# ── V7 (change) — WIENERDOG_DEV survives only as the launcher's defensive scrub.
grep -rn 'WIENERDOG_DEV' src/
# on main: FIVE lines — src/core/vendor.js:26, :31; src/scheduler/launcher.js:143, :211, :219
# required after: only src/scheduler/launcher.js lines, and none of them a READ
#          (the sole executable occurrence must be `delete e.WIENERDOG_DEV;`)
```

```bash
# ── V8 (change → EQUALITY) — THE DEV MIGRATION PROOF. Builds a dev install at a
#     FIXED root so the digest is reproducible, and prints the per-job descriptor
#     digest. Run it on `main` FIRST (git stash), then on the branch. The two
#     digests MUST be identical: a real dev install's OS entry keeps verifying
#     with no re-mint and no user action.
cat > /tmp/v8-migration.js <<'JS'
'use strict';
process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER = '1';
const fs = require('node:fs'), path = require('node:path');
const R = process.cwd();
const vendor = require(path.join(R, 'src/core/vendor'));
const { getPaths } = require(path.join(R, 'src/core/paths'));
const D = require(path.join(R, 'src/scheduler/descriptor'));
const J = require(path.join(R, 'src/scheduler/jobs'));
const ROOT = '/tmp/wd-stance-migration-fixture';
fs.rmSync(ROOT, { recursive: true, force: true });
const checkout = path.join(ROOT, 'checkout');
fs.mkdirSync(checkout, { recursive: true });
vendor.copyTree(R, checkout);
fs.writeFileSync(path.join(checkout, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
const env = { HOME: ROOT, WIENERDOG_HOME: path.join(ROOT, 'wd') };
const paths = getPaths(env);
fs.mkdirSync(paths.state, { recursive: true });
fs.writeFileSync(paths.config, `version: 1\nvault: ${path.join(ROOT, 'vault')}\n`);
vendor.vendorSelf(paths, { sourceRoot: checkout, env });
fs.writeFileSync(path.join(paths.state, 'exec-pins.json'), JSON.stringify({
  schema: 1, pins: {
    claude: { commandPath: '/x/bin/claude', installDir: '/x/share/claude', version: '9', pinnedAt: 't' },
    git: { commandPath: '/usr/bin/git', installDir: '/usr/bin', version: 'g', pinnedAt: 't' },
  },
}), { mode: 0o600 });
const JOB = { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 };
J.saveJob(paths, JOB);
const d = D.buildDescriptor(paths, JOB, { env });
const target = fs.realpathSync(path.join(paths.core, 'app', 'current'));
const rel = path.relative(fs.realpathSync(path.join(paths.core, 'app')), target);
const contained = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
if (contained) throw new Error('ORACLE BROKEN: the dev fixture is contained inside <core>/app');
console.log(`app/current                 : ${target}`);
console.log(`contained in <core>/app     : ${contained}`);
console.log(`appRelease.stance           : ${d.appRelease.stance}`);
console.log(`dev descriptor digest       : ${D.descriptorDigest(d)}`);
fs.rmSync(ROOT, { recursive: true, force: true });
if (d.appRelease.stance !== 'dev') { console.log('FAIL: a real dev install did not classify dev'); process.exitCode = 1; }
else console.log('PASS: dev install classifies dev');
JS
node /tmp/v8-migration.js; echo "EXIT=$?"
# on main (run twice, identical both times):
#   contained in <core>/app     : false
#   appRelease.stance           : dev
#   dev descriptor digest       : sha256:b6ed5746a75a4aa089d098bf0d722803452199d145651333b3e0e0b8c5b0f5d5
#   PASS: dev install classifies dev   EXIT=0
# required after: the SAME digest, character for character.
```

**Why V8's digest is stable across the branch, so you know when it isn't.** The
dev reduction drops `treeDigest` and `version`, so the copied `src/` content does
not enter the digest. What does enter it and could move: `promptHash` (the
`DREAM_PROMPT` template from `src/core/dream/brain.js` plus the vendored
`wienerdog-dream` skill body) and `node: process.execPath`. Neither
`src/core/dream/brain.js` nor `skills/` is a Deliverable of this WP, and you must
run both halves of V8 with the same Node. If the digest differs, that is a real
finding, not fixture noise — investigate before proceeding.

## Out of scope (do NOT do these)

- **Catch-up, in any form.** Do not touch `verifyCatchup` (`launcher.js:352-371`),
  the catch-up anchor, `catchupExpectDigest`, or the `--job-digests` token. A dev
  install still fails catch-up containment and refuses — WP-157's ratified
  disposition, re-affirmed by ADR-0028's 2026-07-25 amendment §2 after a proposed
  dev catch-up branch was **rejected on security grounds**. The catch-up anchor's
  own separate weakness (plant-then-sync re-mints an anchor covering the plant)
  is a *different* finding on a *different* path; it is not fixed here and not
  worsened here.
- **`src/scheduler/descriptor.js`'s dev `appRelease` arm.** It still computes
  `treeDigest` for dev and throws it away; that is
  `WP-dev-descriptor-no-tree-hash`'s deliverable and it must not be pre-empted
  here. Do not touch `descriptor.js:212-219`, `reduceForDigest`, or
  `docs/GLOSSARY.md:25`.
- **A stance marker file, a `--dev` flag, or any new state.** Considered and
  rejected — see "Why containment survives the attack it replaces". Do not add a
  file under `<core>/state`, a manifest entry, or a CLI flag.
- **Excluding `.git/` or `node_modules/` from `appTreeDigestOf`, in either copy**,
  and any git-derived file selection. Explicitly forbidden by ADR-0028's amendment
  (lines 905-913): it would make prod integrity depend on `.gitignore` — writable
  at exactly the surface A7 defends — and would require the self-contained
  launcher to consult `git`.
- **`src/cli/sync.js:206`'s dev message.** After D2 it can no longer be triggered
  by `WIENERDOG_DEV`; it is still correct for a real checkout. Leave it.
- **`src/core/vendor.js`'s `verifyCurrentContainment`.** It keeps its ownership
  check and keeps having no `src/` caller. Do not delete it, do not call it from
  `installStance`, do not "unify" the two.
- **`docs/adr/0028-scheduler-app-executable-integrity.md`.** Its 2026-07-25
  amendment is `Proposed`, already records the per-job dev path as an unresolved
  rule violation, and already names this WP as the work that resolves it. Do not
  edit it, do not mark it Accepted, do not sign an approval line, and do not add
  a "resolved" note when you merge — that is the owner's ratification, not an
  implementer's edit.
- **`docs/specs/WP-dev-descriptor-no-tree-hash.md`.** Its Test index tells an
  implementer to build dev fixtures with `fs.mkdirSync(path.join(paths.core,
  'app','0.0.1','.git'))`, an idiom this WP invalidates. Correcting it is the
  architect's job, not yours; note it under "Discovered issues" in your PR body.
- **The A7 harness's gated runner** (`tests/scenarios/run-a7-integrity.js`) and
  `tests/scenarios/a7-integrity/fixtures/build.js`. Verified this session: the
  runner consumes `launcherCases()` generically and hard-codes no case id, and
  `build.js`'s `devSource()` already produces a non-contained `current`. Neither
  needs a change; if you believe otherwise, say so in the PR rather than editing.
- **`docs/THREAT-MODEL.md:336`'s "Enforcement reductions" bullet** and
  `docs/runbooks/scheduler-and-executable-integrity.md`. Both describe what a dev
  install *skips*, which this WP does not change.

## Definition of done

1. All verification steps (V1–V8) run locally and their output pasted into the PR
   body, including the Table E mutation runs (all **eight** rows, each shown red)
   and the V4 `ℹ tests / ℹ pass / ℹ fail` counts.
2. The PR body states, in one line each: that **V1 and V2 printed FAIL/exit 1 on
   `main` and PASS/exit 0 after**; that **V3 printed PASS on both** (the
   non-vacuity control — a pass, not a defect); and that **V8 printed the same
   digest on both**, with the two digests quoted side by side.
3. The PR body lists the five deliberately-red existing tests (Current state §6
   R1–R5) and, for each, one line on how it was **converted** — none deleted.
4. `git diff --stat` pasted, showing exactly the ten Deliverables paths plus this
   spec. In particular `tests/unit/a7-integrity-negatives.test.js`,
   `tests/scenarios/a7-integrity/fixtures/build.js` and
   `tests/unit/scheduler-schedule.test.js` are **untouched**.
5. Conventional commits; PR titled
   `fix(scheduler): bind the prod/dev stance to containment (WP-stance-authority-containment)`.
6. PR template filled, including "Decisions made" (or "none"), "Discovered
   issues" (the `WP-dev-descriptor-no-tree-hash` fixture idiom), and
   `Generated-by:`.
7. This spec's `status:` flipped to `In-Review` in the same PR.
