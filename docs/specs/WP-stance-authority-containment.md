---
id: WP-stance-authority-containment
title: Bind the prod/dev stance to containment, not to a signal an app-tree data write can produce
status: Ready
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0013, ADR-0028, ADR-0031]
epic: audit-a7
---

# WP-stance-authority-containment: containment decides the stance

> **DISPATCH STATUS — 2026-07-26: READY. Nothing blocks this WP, and nothing
> further is required from the owner before an implementer starts.**
> Both adversarial review legs returned APPROVE after nine rounds. The one
> owner-authority point — **Definition of done item 7**, the sign-off on D9's
> deliberate behaviour change — was **granted verbally in session on 2026-07-26**
> and is transcribed inside that item. The transcription is a decision record,
> **not** a signature: it is deliberately not an `OWNER-SIGNED` line, and this
> spec keys no gate on one. **Discovered issue 6.6 (the per-platform recovery
> procedure) stays OPEN and routed — the sign-off does not close it**; it is a
> PR-body entry, not a dispatch blocker.

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

**The governing rule** (ADR-0028's 2026-07-25 amendment, whose status line reads
**`Accepted. OWNER-SIGNED 2026-07-26`**, section *"3. The durable rule — stance is
never selected by a signal inside the A7-writable tree"*, quoted verbatim so you
need not open it):

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
prerequisite is this WP. The rule is **signed and binding**, not aspirational.
**Do not edit ADR-0028** — it is another architect's surface, it is already
ratified, and recording that this WP resolved the violation is the owner's act,
not an implementer's.

**One clause in that quotation is quoted, not endorsed.** *"that property cannot
be forged by writing into the app tree"* is true of **data** writes and false of
**code** writes: an app-tree write that replaces the mint's own code does move
containment, by executing at the next attended `sync` (Current state §10,
executed twice, two independent reviewers). This WP therefore resolves §3's
mint-time half **for data-shaped inputs only**, and says so at every surface it
touches. Whether that constitutes closure of the recorded violation is the
owner's call on a ratified surface — do not write "resolved" anywhere.

**The mint-time half of the rule is the hard half, and it is where two rounds of
review found this design leaking.** Binding the stance to containment is only
sound if containment itself cannot be *chosen* by an A7-scoped write. It is
`vendorSelf` (`src/core/vendor.js:163-197`) that establishes where
`<core>/app/current` points, and on a prod install `vendorSelf` runs **from
inside the app tree**: `wienerdog sync` goes through the shim at
`<core>/app/current/bin/wienerdog.js`, Node resolves module filenames through
symlinks, and `packageRoot()` therefore returns `<core>/app/<version>` — the
A7-writable tree itself. Executed this session (see Current state §9): it does.
**Two** of the inputs `vendorSelf` reads out of that tree can *select* containment,
and this WP must remove both, or binding the stance to containment merely
relocates the hole a fourth time. **That is a count of the inputs that can select
containment — not a count of what the mint reads**, and the distinction is the one
this spec's own rule line insists on (*"tree data cannot select containment"*,
never *"tree data is not consulted"*). `vendorSelf` reads a **third** file out of
that same tree: it ends with `writeLauncher(paths, …)` and passes no `sourceRoot`
(`vendor.js:195`), so `:259` falls back to `packageRoot()` and it reads
`<app tree>/src/scheduler/launcher.js` — **on the self-resync arm too**. That is a
**code** read, it is Table G row **S1**, it is known-open and owner-routed, and it
is exactly why every claim in this WP is scoped to **data**. (Registered mirror of
"Table G — canonical scope statement", MECHANISM paragraph.) The two inputs that
**select**:

1. `readVersion(root)` (`vendor.js:13-15`) does `JSON.parse(…).version` with
   **zero validation**, and `package.json` is in `COPY_INCLUDE` (`vendor.js:7`) so
   it lives inside the app tree. `path.join(app, version)` with
   `version = "../../escaped"` resolves **outside** `<core>/app`; `repointCurrent`
   then points `current` there. Executed against `main` (Current state §9):
   `current` lands at `<tmp>/escaped`, not contained. Today that install still
   mints `prod` (no `.git` is copied) and refuses at fire time on containment —
   so a naive version of this WP would turn a **refusal into a `dev` mint**: a
   regression, not a fix.
2. `isDevCheckout(root)` decides copy-vs-link. On an install whose `current`
   already resolves outside `<core>/app`, planting a `.git` keeps it outside,
   where a clean sync would have copied it inside.

Both are fixed here, both by **subtraction** (Table G), and the result is a
single checkable invariant, V9: *an attended `sync` carries containment forward,
**or refuses**; no A7-scoped **data** write changes it.* (The "or refuses" arm is
qualifier (iii) of "Table G — canonical scope statement" and is not optional — the
rewritten-`version` shape takes exactly that arm.)

**What this WP does NOT close, stated up front so no claim in it is read wider
than it holds.** Round-3 review found — independently, from two reviewers, and
by execution — that the attended mint **executes code out of the A7-writable
tree**: `wienerdog sync` reaches `vendorSelf` through the shim at
`<core>/app/current/bin/wienerdog.js`, so every module the mint runs is a file
an A7 write can replace. Two concrete instances are recorded in **Current state
§10** (`writeLauncher` re-publishing `launch.js` *from* the app tree, and a
module-level symlink that moves `packageRoot()` outside the containment
comparison). Their general form is: **D8 and D9 constrain what the honest mint
code READS; they cannot constrain what code the mint RUNS.** No data-validation
fix closes that, because the fix would be written in code the adversary can
replace. This WP therefore claims containment only against **data-shaped**
A7 inputs, and the code-substitution channel is named, gated by the fire-time
tree digest **only until the next attended `sync`**, and **routed to the owner** —
it is explicitly out of this WP's scope (Out of scope, Discovered issues).

**The canonical statement of that scope is the subsection "Table G — canonical
scope statement", and this paragraph is a citation of it, not a second source.**
That subsection carries three qualifiers — (i) the scope is A7-scoped **DATA**
inputs, never "file content", because code *is* file content; (ii) the digest
control holds **only until the next attended `wienerdog sync`**; (iii) the
conclusion is a **disjunction** — containment is carried forward **or the call
refuses**. Four review rounds each found one of those qualifiers dropped in one
downstream copy, so round-4 stopped paraphrasing: **every restatement of "what an
A7 write cannot do" anywhere in this spec, in `docs/GLOSSARY.md` (D6) and in
`docs/THREAT-MODEL.md` (D7) quotes or cites that subsection and adds nothing to
it.** Round-5 added a fourth discipline after the extraction itself introduced a
false mechanism clause: **a clause promoted INTO the canonical statement must be
executed and registered like any other change to it.** If you believe the scope is
wrong, change that subsection first; if you find a restatement that is not
registered in the Mirrored Surface Checklist, register it in the same pass.

That scoping is not a face-saving retreat, and the residue is worth shipping:
an **empty `.git` directory contributes zero pairs to `appTreeDigestOf`**
(`launcher.js:133` pushes only `isFile()` entries), so today's plant is
**invisible to the prod tree digest and self-concealing**. A code substitution
is not: it changes the tree digest and is refused by any fire that happens
before the next attended `sync`. **This WP closes the invisible attack.** The
visible one is a pre-existing structural channel that this WP neither creates
nor worsens.

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
**They live in a `mktemp -d` scratch directory (`$SCRIPTS`), never in the repo
and never at a fixed `/tmp` path** — no scratch path is in the Deliverables table
and `boundary-check` rejects any file that is not, so a `scripts/v1-mint.js` is
an automatic REQUEST-CHANGES. Their real output at
`efd1489`:

```
$ node "$SCRIPTS/v1-mint.js"                         # the MINT oracle
app/current contained in <core>/app : true
mint stance, clean prod tree        : prod
mint stance, WIENERDOG_DEV=1        : dev
mint stance, planted .git FILE      : dev
mint stance, planted .git DIR       : dev
FAIL: an A7-scoped signal decided the stance      (exit 1)

$ node "$SCRIPTS/v2-e2e.js" plant                    # the FULL attack, end to end
mode                               : plant
vendorSelf (the sync step)         : target=…/wd/app/0.10.0 dev=true copied=false
descriptor stance after plant+sync : dev
launcher exit code                 : 0
spawn count                        : 1
spawn argv                         : ["run-job","dream"]
durable alert matches C3           : false
alert reason                       : (none)
FAIL: the tamper reached a spawn, the stance downgraded, or no C3 alert was written   (exit 1)

$ node "$SCRIPTS/v2-e2e.js" control                  # same, WITHOUT the .git plant
mode                               : control
vendorSelf (the sync step)         : target=…/wd/app/0.10.0 dev=false copied=false
descriptor stance after plant+sync : prod
launcher exit code                 : 1
spawn count                        : 0
spawn argv                         : (none)
durable alert matches C3           : true
alert reason                       : {"job":"dream",…,"reason":"wienerdog: refusing to run \"dream\" — the live app tree does not match the descriptor (app files chang…
PASS: app-code tamper refused, zero spawn, C3 alert persisted   (exit 0)
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
| R3 | `tests/unit/launcher.test.js:121-128` *"a prod descriptor over a dev-looking tree (planted .git) ⇒ refuse"* — plants an **empty `.git` directory** at `:124` | an empty directory contributes **zero** pairs to `appTreeDigestOf` (it pushes only `isFile()` entries, `launcher.js:133`), so the tree digest is unchanged and `verifyAndResolve` now returns `ok:true` |
| R4 | `tests/scenarios/a7-integrity/fixtures/cases.js:130-137` case `3-stance` — the same empty-`.git`-dir plant, expecting `refuse` | same as R3; surfaces through `tests/unit/a7-integrity-negatives.test.js`'s shared loop |
| R5 | `tests/unit/vendor.test.js:266-…` *"dev mode via WIENERDOG_DEV links current at the checkout, copies nothing"* | `WIENERDOG_DEV` becomes inert ⇒ `vendorSelf` copies into `<core>/app/<version>` |

R3's mechanism is the subtlest fact in this WP. **An empty `.git` directory does
not change the app release digest.** Do not write any test or case that relies on
planting an empty directory to cause a refusal.

### 7. Tests and fixtures that already survive unchanged (do not "fix" them)

- `tests/unit/launcher.test.js` `setupDev()` — doc block `:227-233`, function
  `:234-259` — copies a checkout to a temp dir **outside `<core>/app`** and
  vendors it, so its `current` is already non-contained ⇒ still `dev` under the
  new rule. Its `.git` writes must **stay** — `vendorSelf` still needs them to
  choose link-over-copy on this path (the temp checkout is not where `current`
  points when `vendorSelf` runs, so it is not a self-resync — Table G row 1).
  Only its comment changes.
- `tests/scenarios/a7-integrity/fixtures/build.js:55-62` `devSource()` — same
  shape, same conclusion. **`build.js` is NOT a deliverable.**
- `tests/unit/launcher.test.js:300-308` *"WIENERDOG_DEV=1 in the scheduler env +
  a PROD descriptor does NOT flip to dev"* — passes before and after; it becomes
  doubly true. Preservation check, leave it alone.
- `tests/unit/launcher.test.js:101-112` *"repointing current OUT of `<core>/app`
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

### 9. The mint-time surface — `vendorSelf`, executed (not asserted)

Three facts, each produced by running code this session at `6eb2d30`. They are
the reason D8 and D9 exist; do not take them on trust, V9 re-runs all of them.

**(a) `packageRoot()` resolves THROUGH the `current` symlink.** A tree copied to
`<core>/app/0.0.1`, symlinked as `<core>/app/current`, then required as
`require('<core>/app/current/src/core/vendor')`:

```
current symlink path      : <tmp>/core/app/current
realpath of current       : <tmp>/core/app/0.0.1
packageRoot() via symlink : <tmp>/core/app/0.0.1      ← identical to the realpath
```

So on a prod install the `sync` that runs `vendorSelf` **is running from inside
the A7-writable app tree**, and `packageRoot()` is that tree. This confirms the
argument the previous draft made for `isDevCheckout` (a planted `.git` at
`packageRoot` makes `vendorSelf` link the tree to itself — a no-op that leaves
the install contained), and it is exactly why `readVersion` is dangerous.

**(b) `readVersion` is an unvalidated path traversal into the mint.** On a
contained prod fixture, one A7-scoped write to `<core>/app/0.0.1/package.json`
setting `"version": "../../escaped"`, then `vendorSelf` through the shim:

```
packageRoot()      : <tmp>/core/app/0.0.1
readVersion()      : "../../escaped"
vendorSelf target  : <tmp>/escaped              ← path.join(app, version)
current realpath   : <tmp>/escaped
relative to app    : "../../escaped"
CONTAINED          : false
=> new-rule stance : dev      ← what an unfixed version of this WP would mint
=> old-rule stance : prod     ← what `main` mints (no `.git` is copied)
```

`main` mints `prod` here and the launcher's prod arm refuses on containment
(reason C2, `launcher.js:305`). Binding the stance to containment *without* D8
would mint `dev` instead and run the attacker's tree on the reduced path. That
is a **regression**, and it is the sharpest finding this spec has taken.

**(c) The full input matrix for `vendorSelf`, before and after.** Five install
shapes × one A7-scoped write each, run through `vendorSelf` from the app tree:

| start | A7 write | `main` leaves | after D8+D9 leaves |
|---|---|---|---|
| contained | none | contained | contained |
| contained | plant `.git` | contained | contained |
| contained | `version: "../../escaped"` | **outside** | **refuses** (D8) |
| outside | none | **contained** | outside |
| outside | plant `.git` | outside | outside |

`main` has two rows where an A7 write changes the outcome (3 and 4-vs-5). After
D8+D9 **no row of this matrix** changes the outcome: each row's outcome equals
its starting containment, or the call refuses. Row 4 is also the correction to
Table F row 5 — see the note there.

**Read that as the matrix result it is, not as a reachability claim.** The
matrix enumerates **data-shaped** A7 writes (a planted `.git`, a rewritten
`package.json` `version`). It is *not* the set of all A7-reachable outcomes:
§10 records two A7 writes that are **code substitutions** rather than data, and
those are not in this matrix and are not closed by D8+D9. Any sentence in this
spec of the form "after D8+D9 nothing an A7 write does changes containment"
means *nothing in this matrix*, and every such sentence has been rewritten to
say so.

### 10. The structural channel this WP does NOT close (round-3, executed)

Two reviewers independently produced the same defect from opposite ends. Both
are recorded here because an implementer must not read this spec's claims wider
than they hold, and because both are **routed to the owner**, not fixed here.

**(a) `writeLauncher` re-publishes `launch.js` out of the app tree.**
`vendorSelf` ends with `writeLauncher(paths, { manifest: opts.manifest })`
(`vendor.js:195`) — **no `sourceRoot`** — so `writeLauncher` takes
`root = packageRoot()` (`vendor.js:259`) and copies `<root>/src/scheduler/launcher.js`
over `<core>/launcher/launch.js`. On a prod install reached through the shim,
`packageRoot()` **is** `realpath(<core>/app/current)` (§9a proves this by
execution). So **every attended `sync` overwrites the out-of-tree fire-time
verifier with a copy taken from the A7-writable app tree.** Executed proof:
append a marker to `<core>/app/<version>/src/scheduler/launcher.js`, run one
sync, and the marker is present in `<core>/launcher/launch.js`.
The shipped comment at **`vendor.js:249-250`** — *"a scoped write to the app
tree cannot disable the fire-time verification"* — is therefore **known false**.
It is not a Deliverable of this WP and must not be edited here; it is routed
(Discovered issues).

**(b) A module-level symlink relocates `packageRoot()` outside the comparison.**
Replace `<core>/app/<version>/src/core/vendor.js` with a **symlink** to the same
file in any out-of-tree Wienerdog checkout. Node resolves module filenames
through symlinks by default (`Module._findPath` → `toRealPath`; there is no
`--preserve-symlinks`), so the loaded module's `__dirname` is the **real**
location, not the symlink's — confirmed by execution this session. Consequences,
in order: `packageRoot()` inside that module becomes the external checkout; D9's
`realpathSync(currentLink(paths)) === realpathSync(root)` comparison is
therefore **false**; the external checkout has a `.git`; `isDevCheckout(root)`
returns true; `vendorSelf` repoints `current` **outside** `<core>/app`; and the
descriptor mints `dev`. The only attacker write was **one symlink inside the app
tree**. This falsifies the previous draft's "the out-of-tree source root is
outside A7's reach"; that sentence has been removed. **V9 carries this as a
sixth, deliberately ungated row** (`contained-symlink-vendor`): measured this
session it prints `start=true … after=false` on unmodified `main` **and** on a
scratch tree with D1+D8+D9 applied — i.e. a conforming implementation does not
close it, which is the point. See V9's `KNOWN-OPEN` line.

**S2 is not privilege-gated on Windows, which is why V9's own S2 row is written
as a directory junction there.** A *file* symlink on win32 needs Developer Mode
or an elevated shell, but a **directory junction** needs neither, and junctioning
`src/core` to an out-of-tree copy relocates `packageRoot()` by the identical
mechanism. So the channel exists on an ordinary non-elevated Windows host, and
the round-3 script — which created a file symlink unconditionally, outside the
guarded `vendorSelf` call — would have died with `EPERM` before printing either
the `KNOWN-OPEN` line or the gated verdict. Round-4 fixed the script (V9); the
finding it reports is unchanged.

**The general form, which is what actually matters.** *The attended mint
executes code from the A7-writable tree, so any app-tree write is arbitrary code
execution at the next attended CLI run. D8 and D9 constrain only the HONEST
code's data reads.* The stance-computing code is itself inside the tree the
adversary can write, so no additional data-validation guard can close this — the
guard would be written in code the adversary can replace. Note the project's
standing record: this A7 downgrade class has now relocated **six** times
(inherited `WIENERDOG_DEV` → pre-sync `.git` plant → `package.json` version →
`.git` at `packageRoot` → `writeLauncher` → module symlink), and only the
**subtractive** fixes closed their finding. **Do not add a sixth guard for
(a) or (b).** The correct disposition is structural and is the owner's:
source `launch.js` from outside the app tree, or verify it before use — an
ADR-0028-level decision.

**What still holds, and why the WP is worth shipping anyway.** Both (a) and (b)
are **code substitutions**, so both change `appTreeDigestOf` and are refused by
any fire that happens **before** the next attended `sync` (reason C3 — the
temporal bound is qualifier (ii) of Table G's canonical scope statement, and it is
not optional).
The plant this WP removes — an **empty `.git` directory** — contributes zero pairs
to that digest (`launcher.js:133`), so it is invisible to the prod check *and*
self-concealing. Closing the invisible channel while naming the visible one is a
real, bounded improvement.

**"Digest-invisible" is a larger set than "empty directories", so this claim is
scoped to its *known* members.** `fs.readdirSync(dir, { withFileTypes: true })`
reports a symlink as neither `isFile()` nor `isDirectory()`, so `launcher.js:133`
skips it as well. **Replacing** a file with a symlink therefore *removes* a pair —
a visible change, which is exactly what makes S2 C3-detectable before the next
sync — but an **added** symlink contributes nothing and is precisely as invisible
as an empty directory. Round-4 review confirmed the mechanism on both legs and
found **no** added-symlink route to the reduced path today; the claim survives
because no such route is known, **not** because empty directories are the only
digest-invisible write. Read the after-set below as *known*, never as proven
exhaustive, and if you find another invisible route, that is a finding to raise —
not a guard to add here (Out of scope).

**AMPLIFICATION — a user-facing hazard, written down rather than left inferable.**
`launcher.js`'s `refuse()` banner — the `refuse` arrow function is `:439-448`, its
`reason` string `:440-443`, and the sentence below is at **`:442-443`** — reads,
verbatim: *"If the change was
intentional, run `wienerdog sync`; otherwise investigate."* Combined with (a),
a **C3 integrity refusal instructs the user to perform the exact act that
installs the attacker's `launch.js`** — the refusal that detected the tamper is
the same message that tells the user to bless it. This interaction is **routed
to the owner** with (a); it is not a footnote and it is not fixed here. Do not
edit `launcher.js`'s `refuse()` banner in this WP — it is outside D4's stated
scope (D4 touches the header bullet, `derivationEnv`'s comment, `isDev`,
`liveStance` and the two arms only).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing, recorded rather than left implicit.** Ten paths, of which three are
one-to-three-line prose corrections mechanically implied by Table A, and four are
test files that this change **forces** red (Current state §6) rather than
optional additions. New non-test source is ≈ 80 lines (one added function per
side of the trust boundary, one deleted function, one validation clause, one
`vendorSelf` branch, three edited branches); new test content ≈ 230 lines. Zero
"and also" clauses: every path exists to make one sentence true — *the stance is
decided by containment, and no A7-scoped **data** write decides containment*
(the scope word is load-bearing; see Current state §10 and Table G rows S1/S2 for
the code-substitution channel that is out of scope and owner-routed). D8/D9 are
not scope creep: without them the WP's own change turns a fire-time refusal into
a `dev` mint (Current state §9b), so they are the cost of the sentence, not an
addition to it. Both are **subtractions** — a rejected input and a deleted read —
consistent with the project's record that additive guards relocate this class of
hole and subtractive ones close it. This is **M**, one session. It exceeds
`docs/specs/README.md:11`'s ≤ 8-file heuristic by two, and
that is deliberate: `docs/THREAT-MODEL.md` and the harness README state the
security claim this WP inverts, and shipping code that falsifies a shipped threat
model in order to hit a file count is the wrong trade. It is well under the same
line's ≤ ~400-line bound.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/vendor.js | **D1** — add + export `installStance(paths)` (Table A). **D2** — `isDevCheckout` loses its `env` parameter and the `WIENERDOG_DEV` branch (Table D). **D8** — `readVersion` guards the parsed value with the **existing** `isSemver` from `src/core/update-check.js` and throws a `WienerdogError` otherwise; **no new predicate** (Table G row 2). **D9** — `vendorSelf` gains the self-resync branch, drops its `const env`, and derives its returned `dev` field from `installStance` (Table G rows 1 and 3). Nothing else: `verifyCurrentContainment`, `repointCurrent`, `copyTree`, `makeTreeFilesReadOnly`, `writeLauncher`, `writeShim`, `COPY_INCLUDE` are untouched — **including `writeLauncher` and its `:249-250` doc comment**, which round-3 review showed is factually false (Table G row S1, Current state §10a); it is **routed to the owner**, not repaired here. |
| modify | src/scheduler/descriptor.js | **D3** — `stance` comes from `installStance(paths)` (Table A); the now-unused `const env` at `:135` and the `env?` entry in the `opts` JSDoc are deleted. No other change: `appTreeDigestOf`, `appTreeDigest`, both `appRelease` arms, `reduceForDigest`, `descriptorDigest`, `canonicalize`, `writeDescriptor`, `deriveDescriptorDigest` are untouched. |
| modify | src/scheduler/launcher.js | **D4** — delete `isDev` (`:141-155`); add + **export** `liveStance(p)` (Table A); rewrite the dev-arm cross-check and **delete** the prod-arm one (Table B, Table C); update the header bullet 3 (`:11-12`) and the `derivationEnv` comment (`:211-213`). `verifyCatchup`, `verifyContainment`, `containedIn`, `appTreeDigestOf`, `appendRefuseAlert`, `parseArgv`, `main` bodies unchanged. |
| modify | tests/unit/vendor.test.js | **T1**, **T2**, **T3**, **T4**, **T11**, **T12** (Test index). Converts R5. |
| modify | tests/unit/descriptor.test.js | **T5**, **T6**. Converts R1 and R2. The prod assertions at `:207-209` stay: `d.appRelease.version === '0.0.1'`, `treeDigest` matches `/^sha256:/`, and `d.appRelease.stance === 'prod'`. Only `:209`'s assertion **message** (`'no .git in the fixture tree'`) may change — it restates the rule this WP removes. |
| modify | tests/unit/launcher.test.js | **T7**, **T8**, **T9**. Converts R3. `setupDev`'s comment only (doc block `:227-233`); its `.git` writes stay. The tests at `:101-112`, `:211`, `:224` and `:300-308` must stay **unmodified**. |
| modify | tests/scenarios/a7-integrity/fixtures/cases.js | **T10** — case `3-stance` is replaced by `3a`/`3b`/`3c` and `REASON.stance` is re-pointed (Table C). No other case, no other `REASON` key. |
| modify | tests/scenarios/a7-integrity/README.md | **D5** — the single `3-stance` matrix row at `:52` becomes three rows matching `cases.js`. No other line. |
| modify | docs/GLOSSARY.md | **D6** — the **production/dev stance** entry (`:30`) only; exact wording in Implementation notes. |
| modify | docs/THREAT-MODEL.md | **D7** — the stance clause at `:277-279` only; exact wording in Implementation notes. |

Not deliverables, deliberately: `src/cli/sync.js`, **`src/cli/adopt.js`** (the
*second* attended `vendorSelf` caller, `:392` — D9 changes its behaviour on one
path and it still needs no edit; Table G row 1's scope paragraph states exactly
which path and why V9/Table F cover it), `src/cli/schedule.js`,
`src/cli/run-job.js`, `src/cli/doctor.js`, `src/core/manifest.js`,
`src/core/update-check.js` (D8 **imports** `isSemver` from it; importing is not
editing — the predicate is not to be widened, narrowed or copied),
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
 * `<core>/app` — the one property an A7-scoped DATA write into the app tree
 * cannot forge (ADR-0028 amendment §3/§4, WP-stance-authority-containment).
 * Consults NO signal inside the tree: not `.git`, not any environment variable
 * (the dev-mode env var is deleted outright — Table D; naming it here would put
 * the token back under `src/`, which AC10 forbids), not any file under
 * `app/current`. Fails CLOSED: any unresolvable path ⇒ 'prod',
 * the ENFORCED path. MUST stay behaviourally identical to the launcher's inlined
 * `liveStance` (a cross-implementation test pins that).
 * SCOPE: an app-tree write that replaces the MINT'S OWN CODE still moves
 * containment, because the attended mint runs out of the tree it is vendoring.
 * That channel is known-open and owner-routed; the app release digest covers it
 * until the next attended `sync`. Do not add a guard for it here.
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

// src/core/vendor.js — CHANGED body (D8, Table G row 2)
// NO new predicate. Reuse the existing, length-guarded `isSemver`, which
// already guards the IDENTICAL `path.join(appDir(paths), version)` construction
// at src/core/tarball.js:36 / :200 / :202:
const { isSemver } = require('./update-check');

/** @param {string} root @returns {string} version from <root>/package.json
 *  @throws {WienerdogError} when the value is not strict semver — an app tree
 *  whose package.json declares one is tampered, and `path.join(app, version)`
 *  would escape `<core>/app`, collide with the `current` symlink (any case, on
 *  a case-insensitive FS) or evade repointCurrent's `current.tmp.` sweep
 *  (WP-stance-authority-containment D8, Table G row 2). */
function readVersion(root)     // body unchanged except the validation + throw

// src/core/vendor.js — CHANGED body (D9, Table G rows 1 and 3)
/** …existing doc comment, plus:
 *  SELF-RESYNC: when the running installer IS the tree `app/current` already
 *  resolves to (the shim path on every install), `current` is left pointing
 *  exactly where it pointed and NO signal inside that tree can SELECT that
 *  target: `isDevCheckout` is not called at all, and `target` is the realpath of
 *  `current` itself. `readVersion(root)` still runs (it always did — it is the
 *  returned/printed `version`), but its value cannot reach the target path and is
 *  strict-semver validated, so a tampered version REFUSES the call instead of
 *  moving containment. Against DATA-shaped A7 writes an attended `sync` therefore
 *  carries containment forward, OR refuses (V9).
 *  SCOPE: this says nothing about an A7 write that REPLACES this module's code
 *  or relocates packageRoot() via a symlink — the mint runs out of the tree it
 *  is vendoring, so that channel is structural and is NOT closed here
 *  (WP-stance-authority-containment, Table G rows S1/S2; the fire-time tree
 *  digest catches it until the next attended sync). Changing an install's stance
 *  otherwise requires running the installer from a DIFFERENT, NON-DEV source root
 *  (a git checkout links itself in place and stays dev), which is an attended
 *  act — WP-stance-authority-containment Table G row 1's recovery property.
 *  @returns {{version:string, target:string, dev:boolean, copied:boolean}}
 *    `dev` is now `installStance(paths) === 'dev'`, evaluated AFTER the repoint,
 *    so the value `src/cli/sync.js:206` prints agrees with Table A. */
function vendorSelf(paths, opts = {})
```

`vendor.js` gains exactly **two** `require`s at the top:
`const { WienerdogError } = require('./errors');`, so D8's refusal prints as
`wienerdog: <message>` with no stack (`src/core/errors.js:5-8`), and
`const { isSemver } = require('./update-check');` (Table G row 2). Both are
safe — the launcher never requires `vendor.js` (`launcher.js:16-26`), so its
self-containment is unaffected — and neither creates a cycle: `errors.js` and
`update-check.js` both require only Node builtins at top level (executed).
`installStance` is called from `vendorSelf`, which is a backward reference in
source order; function declarations hoist, so place `installStance` next to
`verifyCurrentContainment` as D1 says and do not reorder the file.

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

Three canonical tables carry that discipline: **Table A** (the stance rule),
**Table C** (the refusal reason strings) and **Table G** (the inputs `vendorSelf`
may consult, **this WP's scope boundary** and **the recovery path**). Table G was
added in the round-1 revision after review showed the stance rule is only as good
as the function that establishes containment, and extended in round-3 with rows
S1/S2 after review showed the same is true of the *code* that function is made of.
Its two dense contracts each have their own named home — the subsection **"Table G
— canonical scope statement"** and **Table G row 1's "The recovery path"
paragraph** — because a contract that lives in a grid cell is a contract nobody can
review (see below). Every statement about `readVersion`, `vendorSelf`, or **the
reach of an A7-scoped write** anywhere in this spec defers to them — including
every scoped claim in D6 and D7. The version predicate is deliberately **not** a
fourth canonical table: Table G row 2 delegates to the one that already exists
(`isSemver`), so this spec contains no predicate literal to drift.

**Round-4 was an extraction pass, not another revision, and the reason is worth
stating.** Rounds 1-3 each rewrote the *prose* describing the reach of an A7
write, and each rewrite was falsified by execution in the next round — every time
in a downstream **copy**, never in the canonical text. Under ADR-0031's loop
circuit-breaker the remedy is not a fourth paraphrase but the remedial extraction
move: state the contract once, canonically; turn every restatement into a citation
or a quotation of that one place; register every mirror. Round-4 did that for
**two** contracts — the scope boundary and the recovery path (Table G row 1's
recovery paragraph, whose round-3 wording was itself falsified) — and the Mirrored
Surface Checklist lists both mirror sets explicitly. **If you are about to write a
fresh sentence about what an A7 write can or cannot do, or about how a dev install
converts to prod: don't. Quote the canonical text.**

**Round-5 is what the extraction still missed, and it is the reason two more rules
now attach to the canonical surfaces.** Round-4's extraction succeeded on what it
targeted and failed on what it did not audit: it lifted the self-resync *mechanism*
clause out of an unaudited mirror (`vendorSelf`'s JSDoc) straight into the
canonical cell, where the clause turned out to be **false** by execution — a
settled-contract reinterpretation by side effect, the cell's facts changed without
the mechanism ever being registered as part of the contract. Two rules follow, and
both are now stated at the canonical surfaces themselves:

1. **Promotion is not a copy operation.** A clause promoted INTO a canonical
   surface must be executed and registered in the same pass, exactly like any
   other change to that surface.
2. **A canonical contract does not live in a grid cell.** The scope statement was
   ~1400 characters wedged under Before/After headers that meant nothing for it;
   round-5 lifted it into its own subsection. Table G stays the index; the
   contract has a readable, diffable home.

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

**Full C1 text, and the ambiguity a reviewer caught here.** Table C's *fragment*
column stops before the path, so both a literal and an interpolated tail satisfy
it — and C2, C1's live analogue, interpolates (`launcher.js:96`:
`` `app/current does not resolve inside ${p.appDir}` ``). Ambiguity resolved in
favour of matching the neighbour. C1 is **interpolated**, emitted exactly as:

```js
return { ok: false, reason: `the descriptor was authorized for a dev checkout but app/current now resolves inside ${p.appDir}` };
```

so the user-visible tail is the real `<core>/app` path, not the placeholder.
`refuse()` wraps it with the fixed banner. Assertions (T7, `REASON.stance`) match
the fragment in the table, never the whole string.

### Table D — `WIENERDOG_DEV` disposition (which call sites may honour it)

| Site | Before | After |
|------|--------|-------|
| `src/core/vendor.js` `isDevCheckout` | `if (env.WIENERDOG_DEV === '1') return true;` | **deleted**, together with the `env` parameter — the function has no access to an environment to honour |
| `src/core/vendor.js` `vendorSelf` (`:167`) | `isDevCheckout(root, env)` | `isDevCheckout(root)`, and only on the non-self-resync arm (Table G row 1). The local `const env` (`:164`) is **deleted** — nothing in `vendorSelf` reads an environment any more. `env?` stays in the `opts` JSDoc, documented as accepted-and-ignored, because `tests/scenarios/a7-integrity/fixtures/build.js:100` passes it and is not a deliverable |
| `src/scheduler/descriptor.js` `buildDescriptor` | `isDevCheckout(appRoot, env)` | `installStance(paths)`; the local `const env` (`:135`) is deleted |
| `src/scheduler/launcher.js` `derivationEnv` (`:219`) | `delete e.WIENERDOG_DEV;` | **KEPT** — defence in depth against reintroduction. This is the **only** permitted occurrence of the token under `src/` |
| anywhere else in `src/` | — | forbidden |

**Enforced, not documented:** T3 walks every `.js` file under `src/` and asserts
that no line outside `src/scheduler/launcher.js` contains `WIENERDOG_DEV`, with a
built-in non-vacuity control (the same walk must visit ≥ 60 files and find
`WIENERDOG_HOME` in ≥ 5 of them — measured on `main`: **86** `.js` files, **8**
containing `WIENERDOG_HOME`). A walker that silently visits nothing would
otherwise pass this test forever.

### Table G — the `vendorSelf` input rule and this WP's scope boundary (canonical; Table A's precondition)

Table A says containment decides the stance. Table G is what makes that
statement worth anything: it is the single place the inputs `vendorSelf` may
consult are decided. Its two dense contracts live in named prose below it, not in
its cells — **the recovery path** in row 1's "The recovery path" paragraph and
**this WP's scope boundary** in the subsection "Table G — canonical scope
statement". Rows 1-3 are **subtractions** and are the work. Rows S1 and S2 are
**known-open channels, deliberately NOT fixed here**, listed in this table
because its canonical scope is "the inputs that reach the mint" and an input
channel that is omitted from the canonical table is a channel nobody re-reads.

| # | Rule | Before | After |
|---|------|--------|-------|
| 1 | **Self-resync: nothing in the tree selects the target.** When `fs.realpathSync(<core>/app/current)` equals `fs.realpathSync(sourceRoot)`, `target` is that realpath — no `isDevCheckout`, no `readVersion`-derived path, no copy. `readVersion(root)` **still runs** (it always did, `vendor.js:166`, unconditionally and before the branch) and its value is still returned and printed; row 2 is what makes that safe — see the canonical scope statement's mechanism paragraph | `isDevCheckout(root, env)` chose the branch on **every** call | the branch is chosen by *where `current` already points*; `isDevCheckout` runs only when the source root is a **different** tree |
| 2 | **A version that is not strict semver is refused.** `readVersion` throws a `WienerdogError` unless `isSemver(v)` — the **existing, length-guarded** predicate at `src/core/update-check.js:20`, already used to guard the identical `path.join(appDir(paths), version)` construction at `src/core/tarball.js:36`/`:200`/`:202`. **No new predicate is introduced** | `JSON.parse(…).version`, unvalidated, straight into `path.join(app, version)` | `path.join(app, version)` provably yields a **direct child** of `<core>/app`, under **one** predicate shared by both call sites |
| 3 | **The returned `dev` field is containment-derived**, not `.git`-derived: `installStance(paths) === 'dev'`, evaluated after `repointCurrent` | `isDevCheckout(root, env)` | agrees with Table A, so `src/cli/sync.js:206`'s message cannot contradict the descriptor |
| **S1** | **`writeLauncher` re-publishes `<core>/launcher/launch.js` FROM the app tree** — `vendorSelf` calls it with no `sourceRoot` (`vendor.js:195`), so `root = packageRoot()` (`vendor.js:259`), which on a shim-reached prod install **is** `realpath(app/current)` | — | **UNCHANGED — known open.** Out of scope; **routed to the owner** (Discovered issues). Not in Deliverables; `writeLauncher` is explicitly listed as untouched in the `src/core/vendor.js` Deliverables cell. Detected by the fire-time tree digest (C3) until the next attended `sync`. Current state §10(a) |
| **S2** | **A module-level symlink inside the app tree relocates `packageRoot()`** — Node resolves module filenames through symlinks, so a symlinked `src/core/vendor.js` sees the external checkout as `__dirname`, defeating row 1's realpath comparison and re-enabling the `.git` branch | — | **UNCHANGED — known open.** Out of scope; **routed to the owner**. Module resolution is not a Deliverable and no guard inside the substituted module can defend it. Detected by the fire-time tree digest (C3) until the next attended `sync`. Current state §10(b) |

**The invariant these rows buy (V9, AC16) is stated in its own subsection below —
"Table G — canonical scope statement" — not in a cell of this grid.** Round-4 put
it in a ~1400-character row whose Before/After headers meant nothing for it, and
round-5 review found a false clause had been introduced into that cell without
anyone noticing until execution. See that subsection for why, and cite it by name.

Row 2's reuse is the subtraction, and it is why the round-2 draft's bespoke
`VERSION_RE` is gone. `isSemver` already rejects every vector that predicate was
written for and several it missed: `../../escaped`, `a/b`, `..`, `.`, `current`,
**`Current`** and **`CURRENT`** (the round-2 predicate's reservation was
lowercase-only, and APFS/NTFS are case-insensitive — executed on this machine:
`existsSync(<app>/Current)` resolves to the `current` symlink, so the copy
branch is skipped, `repointCurrent` points `current` at itself, and
`realpathSync` throws **ELOOP**, which is verbatim the bricking Table G exists
to prevent), `current.tmp.9` and **`Current.tmp.9`** (which escapes
`repointCurrent`'s orphan sweep — `vendor.js:110` matches
`startsWith('current.tmp.')` case-sensitively), a **trailing `.`** such as
`0.10.0.` and the win32 device names `NUL`/`CON`/`COM1`, plus non-strings and
anything over 256 chars. It accepts everything AC17 requires: `0.10.0`, `0.0.1`,
`1.2.3-rc.1+build.7`, and the A7 fixture's own `999.0.0-a7test`
(`build.js:38`). All of that was executed this session. Reusing it also removes a
**contract mirror**: a second, looser predicate for the same path construction in
a second file is exactly the proliferation ADR-0031 exists to prevent. Cycle
check, executed: `src/core/update-check.js` requires only Node builtins at top
level (`fs`, `path`, `https`, `child_process`) — its one `require('../../package.json')`
is lazy, inside `currentVersion()` — so `vendor.js → update-check.js` creates no
cycle.

Row 1's scope, stated so it is not over-read: it changes behaviour in **exactly
one** direction — an install whose `current` already resolves outside
`<core>/app` is no longer silently converted into a vendored prod install by a
`vendorSelf` run whose source root **is** that same tree. That conversion was
never a security property (it is what an A7-planted `.git` suppressed) and it was
a real hazard: a maintainer whose worktree gitfile went missing would have had
their dev install copied into `<core>/app/<version>` and repointed behind their
back. Converting a dev install to prod is now an attended act: run the installer
from a **different, non-dev** source root — the recovery paragraph below states
that property canonically, and a git checkout does **not** satisfy it. Verified this session — install,
upgrade-from-a-new-source and self-resync all behave exactly as before
(Implementation notes → "How the mint-time leg is closed").

**Row 1 reaches two attended callers, not one, and both are stated rather than
left inferable.** `vendorSelf` has exactly two attended production callers:
`src/cli/sync.js:204` and **`src/cli/adopt.js:392`** — both of those are the
`vendorSelf(…)` **call**, with the `require` one line above each (`sync.js:202`,
`adopt.js:391`); round-3 cited the `require` line for `sync` and the call line for
`adopt`, in the same sentence. `adopt.js` is *not* a Deliverable and needs no
edit, but D9 changes what it does on one path, so it is named here. Its own comment (`adopt.js:389-390`, `:396-397`) records that
`adopt` runs from an npx/temp copy, "does NOT call `sync`", and is a first-class
attended **mint** caller. That is why V9's and Table F's reasoning covers it
**unchanged**: `adopt`'s source root is normally an npx/temp checkout, i.e. a
*different* tree from wherever `current` points, so `selfResync` is `false` and
`adopt` still converts exactly as it does on `main`. The one case that changes:
`wienerdog adopt` invoked **through the shim** on an install whose `current`
already resolves outside `<core>/app` now self-resyncs (carries the target
forward) instead of converting — the same single behaviour change as Table G
row 1, on a second entry point. No test asserts the old behaviour on that path —
verified this session: `tests/integration/adopt-e2e.test.js` contains no match for
`vendorSelf`, `app/current`, `appDir` or `contained` — so nothing goes red; it is
called out so a reviewer does not have to discover it.

**The recovery path — CANONICAL. D6's shipped prose and Definition of done item 7
cite this paragraph; neither may paraphrase it.** What is canonical here is a
**property**. Round 7 subtracted the *enumeration* down to the two entries this WP
can actually stand behind, and routed the rest; the reason is recorded below
rather than absorbed, because the enumeration is the thing that keeps failing.

**THE PROPERTY — this is the canonical fact, and it is what every restatement must
carry.** Converting a non-contained (**dev**) install back to **prod** requires an
attended run whose **source root** — the directory `packageRoot()` resolves to,
i.e. where Node loaded `vendor.js` from — is **provably not a dev checkout** (no
`.git` at that root) **and provably not the tree `app/current` already resolves
to**. The short form, in these words: run the installer from **a non-dev source
root**. The mechanism: on the non-self-resync arm (row 1) `isDevCheckout(root)`
still decides copy-vs-link, so a source root that has a `.git` takes
`target = root`, `repointCurrent` points `current` at *that checkout* — still
**outside** `<core>/app` — and the install stays **dev**. Executed round-4,
identically on a conforming D1+D2+D8+D9 tree and on `main`: source root with
`.git` ⇒ `dev`; source root without ⇒ `prod`. **The property is
platform-independent** — it is decided by the presence of `.git` and by a
`realpath` comparison, and neither has a platform-specific form.

**STANDING RULE for entries, added in round 5 because the class was already
undeniable.** Three consecutive review rounds each killed a *different* entry, and
every one was listed in one round and falsified by execution in the next:
`install.sh` (listed round 2, killed round 3), an explicitly invoked fresh git
checkout (listed round 3, killed round 4), a bare `wienerdog sync` after
`npm install -g` (listed round 4, killed round 5). Each false entry was written
from *intent* rather than from execution. So: **every entry must name an
invocation whose source root is provably NOT a dev checkout AND is provably NOT
the tree `app/current` already resolves to, and must be verified by running it
before it is listed.** Naming the package manager is not enough — the entry must
name the *invocation*, because what decides the outcome is which file Node loads
`vendor.js` from (that is `packageRoot()`, hence `sourceRoot`), not which command
installed it. The corrections below are kept in the spec as corrections, not
silently absorbed, precisely so the class stays visible.

**ROUND-7 SHIPPING RULE — a second condition, added because the round-5 rule was
not sufficient and was violated by the pass that wrote it.** Round-7 review killed
two more entries: one that named a **POSIX-only path** (a directory that does not
exist on Windows) and one that named **no invocation at all**, which the round-5
rule already forbade. That is five defective entries in five rounds, and the thing
that fails is always the enumeration, never the property. So, in addition to the
round-5 rule: **an entry may ship into user-facing prose (D6) only if the user
supplies no filesystem path** — the invocation names a command and lets npm, npx
or Wienerdog's own code compute the source root. An entry that requires the user
to type a path is platform-shaped (path layout differs per platform), this WP can
execute only POSIX, and an unverifiable path is precisely how a nonexistent
Windows directory got as far as D6 — the text this WP ships into
`docs/GLOSSARY.md` — in round 5.

**The entries that satisfy both rules and therefore ship into D6 — exactly two:**

- `npx wienerdog@latest sync` — runs `<npm cache>/…/wienerdog/bin/wienerdog.js`,
  an npm/tarball extraction: no `.git`, and not where `current` points. The user
  types no path; npx computes the root. Executed: matrix row 1 (POSIX).
- a `wienerdog update` that lands a **newer** packaged version — `update.js:45-48`
  spawns the NEW `<core>/app/<newver>/bin/wienerdog.js sync`, a different root
  from `current` and `.git`-free. The path is built by Wienerdog's own
  `path.join`, not typed by the user. Executed: matrix row 2 (POSIX).

**The two entries round 7 subtracted, each with the rule it broke.** Both stay
here as executed evidence for the *property*; neither ships to D6.

- **A global `npm install -g wienerdog` invoked by the binary's own path.** Round 5
  listed `"$(npm prefix -g)/bin/wienerdog" sync`. The *invocation* converts on
  POSIX (matrix row 3b, executed), but the written form is **POSIX-only**: on
  Windows npm places its executable shims directly **under the prefix**
  (`%APPDATA%\npm\wienerdog.cmd`), not under `<prefix>/bin`, and global packages
  live at `<prefix>\node_modules\…`, not `<prefix>/lib/node_modules`. The shipped
  command therefore named a path that does not exist on a **supported install
  target** (this project ships schtasks scheduling for Windows), and nobody on this
  WP can execute the Windows form to derive a correct one. Breaks the round-7 rule.
- **"Uninstall, then reinstall."** Round 5 listed it, and it names **no
  invocation** — which the round-5 rule, introduced by that same pass, forbids.
  After `wienerdog uninstall`, running `wienerdog init` **from a fresh git
  checkout** produces another **dev** install: that is matrix row X, executed, the
  case this list already knows does not convert. The round-5 parenthetical
  "(fresh `<core>`, tarball root)" named the root that was probed, not a command a
  user would run to obtain it. Matrix row 4 is relabelled below as the property
  probe it actually was. Breaks the round-5 rule.

**OWNER ROUTING — the per-platform recovery procedure is not this WP's to write.**
Writing "here is how you recover, on each supported platform" is user-facing,
multi-platform operational documentation; it needs per-platform execution, and this
WP has no Windows host. Carrying it here produced a defect in **every round in
which it existed**. It is therefore routed to the owner as its own documentation
task, with per-platform verification as its acceptance criterion (Discovered
issues → Definition of done item 6.6). What this WP ships is the property plus the
two path-free entries above, with their verification scope stated in D6's own text.

**Three** things that are **not** recovery, each corrected in a different review
round. Only the **fresh git checkout** one ships to D6 — its mechanism is `.git`
presence, which is platform-neutral. The bare-`wienerdog` one is POSIX-shaped (see
its bullet) and with the global-binary entry subtracted it has no referent in
user-facing text anyway; `install.sh` was never in D6:

- **Bare `wienerdog sync` after `npm install -g wienerdog`.** Round-4 listed this
  ("a global `npm install -g wienerdog` followed by `wienerdog sync`") and it is
  **false**. `writeShim` writes `$HOME/.local/bin/wienerdog` containing
  `exec node "<core>/app/current/bin/wienerdog.js" "$@"` (`vendor.js:307`), and
  `src/cli/sync.js:209` instructs the user to **PREPEND** that directory
  (`export PATH="$HOME/.local/bin:$PATH"`), so the managed shim beats the npm
  global bin — and `package.json` declares no `postinstall`, so `npm install -g`
  on its own changes nothing at all. Bare `wienerdog` therefore re-enters through
  `app/current`, `selfResync` is **true**, and the install stays `dev`. Verified
  on the maintainer's own machine this session: `$HOME/.local/bin` is PATH
  position 4 and `/opt/homebrew/bin` (this box's `npm prefix -g`) position 5;
  `which wienerdog` resolves to the shim, which execs
  `~/.wienerdog/app/current/bin/wienerdog.js`. **This refutation is POSIX-scoped
  and round 7 says so rather than shipping it further:** it rests on
  `$HOME/.local/bin` preceding npm's global bin, and the instruction that puts it
  there (`src/cli/sync.js:209`) is a bash `export PATH=…` line. On Windows
  `writeShim` additionally writes `~/.local/bin/wienerdog.cmd`
  (`vendor.js:326-329`) but nothing places `~/.local/bin` on a Windows PATH by
  default, so the PATH-precedence premise may simply not hold there. Unverified on
  Windows; not shipped to D6.
- **An explicitly invoked fresh git checkout.** Round-3 listed this and it is
  **false**: from a different checkout `selfResync` is false but
  `isDevCheckout(root)` is **true**, so the non-self branch sets `target = root`,
  outside `<core>/app`, and the install remains `dev`. Executed on this repo:
  `isDevCheckout(<repo root>) === true`.
- **`install.sh`.** It invokes `wienerdog init`; `src/cli/init.js:87`'s guard
  makes `:88` print *"wienerdog: already installed, nothing to do."* and return
  **before** `vendorSelf` on an existing install (executed).

**The executed matrix (round 5, on macOS/POSIX), on a conforming D1+D2+D8+D9
tree.** Each row starts from a **dev** install (`current` → an out-of-`<core>/app`
checkout with a `.git`) and runs `vendorSelf` out of that entry point's own tree,
which is what makes `packageRoot()` — and therefore `sourceRoot` — the entry
point's root. **Read this as evidence for THE PROPERTY, not as a recovery menu**:
rows 3b and 4 are probes of source roots, not entries a user can be told to run
(round 7; see the subtraction bullets above). Row 4's round-5 label was
"uninstall + reinstall"; round 7 relabels it to name what was actually probed —
the `before`/`after` values are the measured ones and are unchanged.

```
1. npx wienerdog@latest sync  (npm cache root)           before=dev   after=prod
2. wienerdog update  (spawns <core>/app/<new>/bin)       before=dev   after=prod
3a. npm i -g + bare `wienerdog sync` (shim wins PATH)    before=dev   after=dev
3b. global npm binary's own root (POSIX layout) [probe]  before=dev   after=prod
4. fresh <core> + tarball source root           [probe]  before=dev   after=prod
X. explicit fresh GIT CHECKOUT source root               before=dev   after=dev
PASS: every source root that is neither a dev checkout nor the install's own tree
      converted dev→prod; every root that is one of those stayed dev
```

Nobody is stranded: the property holds on all six rows, and the two invocations
this WP ships (rows 1 and 2) are on it. **3a and X are the shapes that look like
recovery and are not**, and X is why "uninstall, then reinstall" is not an entry —
the reinstall a user is most likely to perform is a git checkout.

### Table G — canonical scope statement

**Cite this subsection by name.** It is the single place *"what an A7-scoped write
cannot do"* is decided — the resulting invariant of Table G rows 1-3, the thing V9
gates and AC16 asserts. Every restatement of it, in this spec and in
`docs/GLOSSARY.md` (D6) and `docs/THREAT-MODEL.md` (D7), **quotes or cites this
subsection and adds nothing to it.** Registered mirrors are listed under
Contract 1 in the Mirrored Surface Checklist.

**Why it is a subsection and not a table row — read this before editing it.**
Round-4 applied ADR-0031's remedial extraction and put this contract into a single
~1400-character cell of the Table G grid, under **Before/After** column headers
that mean nothing for it. Round-5 review then found a **false clause inside that
cell**: the extraction had *promoted* text out of an unaudited mirror
(`vendorSelf`'s JSDoc) into the canonical cell, so the cell's facts changed without
the promoted mechanism ever being verified or registered. That is a settled-contract
reinterpretation by side effect, and a 1400-character cell is where it hides.
**The lesson, which is now a rule: promotion is not a copy operation — every clause
promoted into this subsection must be executed and registered in the same pass.**

**Four review rounds found this contract wrong in a *copy*; round 5 found it wrong
here. The three qualifiers below are exactly what has been dropped or falsified,
so dropping any of them is a class-(a) defect, not a wording preference.**

**(i) SCOPE — A7-scoped *DATA* inputs, never "file content".** An attended `sync`
carries containment forward against **data-shaped** A7 inputs: over V9's
install-shape matrix, containment after `vendorSelf` equals containment before it,
**or the call refuses** (qualifier (iii)). **Code is file content too**, so "no
file *content*" is NOT a legal restatement: an app-tree write that replaces the
mint's own code (rows S1/S2) **does** move the stance at the next attended `sync`.
Executed round-4 and re-executed round-5, on a **conforming D1+D2+D8+D9 tree**, no
symlink involved (this is not S2) — `chmod +w` and append plain bytes to
`<core>/app/0.0.1/src/core/vendor.js`, then one `vendorSelf` required through
`app/current`: `stance BEFORE: prod`, `app release digest changed by the write:
true`, `current now resolves to the attacker's checkout`, `stance AFTER one
attended sync: dev`.

**(ii) TEMPORAL BOUND — "until the next attended `wienerdog sync`".** The control
that covers S1/S2 is the app release digest, and it holds **only up to that sync**:
a code substitution changes the tree, so every fire **before** the sync refuses
(C3); the sync itself re-mints from the substituted code — in the run above it left
`current` pointing at an attacker checkout and the stance `dev`, where the reduced
descriptor never hashes app code again — so a fire **after** it need not refuse. A
restatement that says "the launcher refuses on that" **without** the temporal bound
is false.

**(iii) THE CONCLUSION IS A DISJUNCTION — "carried forward **OR the call refuses**".**
The invariant has two arms and both are load-bearing. The refusal arm is the entire
behaviour of the `contained-bad-version` shape: V9's predicate allows it explicitly
(`verP.after === base.after || verP.after === 'REFUSED'`), V9 prints `after=REFUSED`
for it on a conforming tree, and Table F row 6 records it (*"the `sync` itself now
fails loudly with D8's tamper message and mints nothing"*). Round-4 dropped this arm
from **three** mirrors — D6's GLOSSARY body (*"carries containment forward
unchanged"*), the Context paragraph's one-line statement of the invariant, and
`vendorSelf`'s JSDoc (*"carried forward verbatim by every attended `sync`"*), which
ships into `src/` — which is why it is now registered as a qualifier in its own
right rather than left implicit in the word "verbatim". A user
who reaches D6's GLOSSARY entry from a refusal banner (Current state §10,
AMPLIFICATION) and is told only that containment is "carried forward unchanged" has
the wrong model at the worst possible moment: the next attended `sync` may instead
hard-fail and mint nothing. **A restatement that says only "carried forward" is
false.**

**THE MECHANISM — stated as what is true, corrected in round 5.** The false clause
round 4 promoted into the canonical cell was *"on a self-resync the honest mint
reads **no** signal inside the tree it is re-vendoring"*, rendered in D6 as *"it
consults **no data** inside that tree — not `.git`, not `package.json`"*. **Both are
false.** `src/core/vendor.js:166` — `const version = readVersion(root);` — runs
**unconditionally, before the branch**, and D9's three edits do not move it; D9's
own step 3 says so (*"`readVersion(root)` still runs on every call"*). Executed
round-5 on a conforming tree, with `package.json`'s `version` rewritten to another
**valid** semver:

```
packageRoot() === realpath(app/current) (self-resync) : true
vendorSelf() returned version                        : "9.9.9"   <- read out of the app tree's package.json
target carried forward                               : true
sync.js:206 would print                              : wienerdog: vendored app 9.9.9.
```

What row 1 removes is not the *read* but the read's **reach**. On the self-resync
arm `target` is `fs.realpathSync(currentLink(paths))`, so **no value read out of
that tree can reach the target path**, and `isDevCheckout` is not called at all.
The one value still read off that tree is validated by row 2, so a value that is
not strict semver makes the call **throw**. V9's `contained-bad-version` row is a
self-resync *shape*, and it never reaches the self-resync test at all: `readVersion`
runs first and throws, so that row's `after=REFUSED` originates in **D8's
validation**, not in any containment logic. So the accurate claim is:

> On a self-resync, **no signal inside the tree can select the target**. The one
> *data* value the honest mint still reads out of that tree (`package.json`'s
> `version`, `vendor.js:166`) cannot reach the target path and is validated by
> row 2, so a tampered value **refuses the sync** rather than moving containment. A
> `version` rewritten to another *valid* semver changes only the version string
> `vendorSelf` returns and `src/cli/sync.js:206` prints; containment is still
> carried forward.

**"Tree data cannot select containment" — never "tree data is not consulted".**
Any restatement of the second form is a class-(a) defect.

**One more read exists and is deliberately not counted above, so nobody discovers
it as a contradiction.** `vendorSelf` ends with `writeLauncher(paths, …)` and no
`sourceRoot`, so it also reads `<app tree>/src/scheduler/launcher.js` and
re-publishes it over `<core>/launcher/launch.js` — on the self-resync arm too. That
is a **code** read, it is Table G row **S1**, it is known-open and owner-routed, and
it is exactly why qualifier (i) scopes this contract to **data**. The `version`
sentence above is therefore about the mint's *data* reads on that arm, not a claim
that `vendorSelf` opens exactly one file.

### Mirrored Surface Checklist

Table A is the single place the stance rule is decided; Table C the single place
the reason strings are decided; Table G the single place `vendorSelf`'s permitted
inputs are decided, with **this WP's scope boundary** in the subsection "Table G —
canonical scope statement" and **the recovery path** in row 1's "The recovery path"
paragraph. Every surface that restates them is registered below so one finding
updates all of them in one pass, and any new mirror found in review is added here
on the spot.

**Two dense contracts got a canonical home of their own in round-4, after three
rounds of review kept finding the same fact wrong in a copy; round-5 moved the
first one out of the table grid into a named subsection, after a false clause was
introduced into that cell during the extraction itself.** ADR-0031's remedial
extraction move applies to both: pull the contract into one place, convert every
restatement into a citation or a quotation of it, and register every mirror here.
**Round-5 adds one rule to the move: a clause promoted INTO the canonical text must
be executed and registered in the same pass — promotion is not a copy operation.**

**Round-6 adds a mechanical half to that rule, because a discipline nobody can run
is a promise.** Five consecutive rounds each produced at least one restatement or
quotation of this spec's own canonical text that was never checked against its
source, and round-5's grep-based retarget provably missed a line-wrapped instance.
Two parts of that class are cheaply decidable and are now checks, both
whitespace- and emphasis-normalized so line wraps and `**` do not matter:

- **Check A — D6 fidelity (round 6).** Every fragment the D6 mapping table quotes
  must appear verbatim in the D6 body it claims to render. **Anchor the body span
  on the D6 heading line itself**, not on the phrase "production/dev stance
  entry": the first line matching that phrase is the **Deliverables cell**, and a
  span opened there runs on for eleven hundred lines and swallows two unrelated
  blockquotes — including the canonical MECHANISM blockquote. Check A was written
  precisely to catch a cell that quotes the CANONICAL SOURCE instead of D6's
  RENDERING of it, and with that anchor such a cell passes green. Round 8
  corrected the anchor; the check still passes.
- **Check B — registration fidelity (round 8).** Every fragment **this checklist
  itself** marks with `*"…"*` must appear verbatim somewhere in the spec
  **outside** this checklist. Round 8 added it because a registration that was
  never verbatim survived rounds 4–7 and both legs of check A: Contract 2's
  Table F row-5 entry quoted "a different source root" where the row itself says
  *"a **non-dev** source root"*. That is not cosmetic. This checklist is the
  index a future round consults to learn what a mirror says, so a stale quotation
  here reconciles the mirror in the **wrong direction** — here, by restoring the
  exact wording round 4 executed and falsified (a *different* source root that is
  a git checkout does not recover: `isDevCheckout(<repo root>) === true`).

**Convention check B depends on, and which is now binding inside this
subsection:** `*"…"*` asserts "this text exists verbatim elsewhere in the
spec". Text this spec deliberately **removed** is quoted with plain double
quotes instead, so the check needs no exemption list and can therefore only miss,
never wrongly accuse. Both checks are an architect/reviewer step run before this
spec leaves Draft — they are **not** Verification commands below, they touch no
Deliverable, and they are deliberately not wired into `npm run lint`.

**Round 9: both checks now fail closed on their own inputs, because a gate that
passes when it finds nothing is the more dangerous vacuity — a green run is read
as proof.** Reviewed on the round-8 text, deleting the mapping-table header
anchor still printed `PASS`: the verdict counted only mismatches, and a failed
anchor search yields zero fragments to mismatch. The script therefore asserts
every anchor it depends on — check A's D6 body start and end and its
mapping-table header, check B's checklist heading and the closing `##` heading
that bounds it — reports a missing one by name, asserts each located span is
non-empty, and asserts a non-zero count against a floor: **check A ≥ 6 mapping
rows and ≥ 10 quoted fragments; check B ≥ 14 quoted fragments.** Those are the
counts this text yields today, and every run prints all three so the evidence is
visible rather than inferred. Floors rather than exact counts, deliberately: this
checklist grows every round by design, so an exact count would fire on each
legitimate registration and train the next reader to bump the number without
looking — the same reflex that produced the vacuous `PASS`. A floor fires only
when coverage **shrinks**, which is the anchor-drift case. A legitimate shrink is
possible (round 8 re-marked one registration to plain quotes per the convention
above), so a floor failure prints as `COVERAGE FLOOR`, a distinct message class
from `NOT VERBATIM`, and its remedy is to re-measure and lower the floor
deliberately in the same pass — never to let it pass silently. The guards do not
cost the one-directional property: each collection loop runs **only** when its
own anchors resolved, so a missing anchor produces a vacuity failure and can
never turn into a false accusation against a quotation that is in fact verbatim.
They strengthen it, because the round-8 script could wrongly accuse. Executed:
renaming check A's D6 *body* anchor rather than its table header left the body
span empty and printed ten `NOT VERBATIM` lines against ten fragments that were
verbatim — the silent `PASS` and the false accusation are the same missing-anchor
bug read from its two ends, and one assertion closes both.

```bash
GATE="$(mktemp -d "${TMPDIR:-/tmp}/wd-gate.XXXXXX")"   # never a fixed /tmp path
cat > "$GATE/spec-quote-check.js" <<'EOF'
const fs=require('fs');
const L=fs.readFileSync(process.argv[2],'utf8').split('\n');
const norm=s=>s.replace(/[*_]/g,'').replace(/\s+/g,' ').trim();
const strip=s=>s.replace(/^(?:\/\/ ?|> ?|\| ?|- \[[ x]\] ?|- )+/,'');
const clean=f=>norm(f).replace(/^[\s,;.—-]+|[\s,;.—-]+$/g,'');
let bad=0,vac=0;
// NON-VACUITY (round 9). A check that located nothing must FAIL, not report PASS
// over an empty search. Floors are the counts this text yields; a floor firing
// means coverage SHRANK — re-measure and lower it deliberately, never silently.
// Every collection loop is guarded by its own anchors, which is what keeps the
// one-directional property: a check may miss, it must never wrongly accuse.
const MIN_A_ROWS=6, MIN_A_FRAGS=10, MIN_B_FRAGS=14;
const at=(name,i)=>{if(i<0){vac++;console.log('ANCHOR NOT FOUND: '+name);}return i;};
const floor=(name,n,min)=>{if(n<min){vac++;
  console.log(`COVERAGE FLOOR: ${name}=${n}, expected >=${min}`);}};
// A. Every fragment the D6 mapping table quotes is verbatim in the D6 body.
const a=at('A/D6 body start: "`docs/GLOSSARY.md:30` — replace"',
        L.findIndex(l=>l.startsWith('`docs/GLOSSARY.md:30` — replace'))),
      b=at('A/D6 body end: "Keep the entry\'s existing"',
        L.findIndex(l=>l.startsWith("Keep the entry's existing"))),
      h=at('A/mapping-table header: "| Canonical scope statement"',
        L.findIndex(l=>l.startsWith('| Canonical scope statement')));
let body='',aRows=0,aFrags=0;
if(a>=0&&b>=0&&b<=a){vac++;console.log('ANCHOR ORDER: A/D6 body end precedes start');}
if(a>=0&&b>a){
  body=norm(L.slice(a,b).filter(l=>l.startsWith('> ')).map(l=>l.slice(2)).join(' '));
  if(!body){vac++;console.log('ANCHOR EMPTY: A/D6 body span quotes nothing');}
}
if(h>=0&&body)for(let i=h+2;i<L.length&&L[i].startsWith('|');i++){
  aRows++;
  const cell=L[i].split('|')[2];
  for(const m of cell.matchAll(/\*"([^"]+)"\*/g))
    for(const frag of m[1].split('…')){
      const f=clean(frag);
      if(!f)continue;
      aFrags++;
      if(!body.includes(f)){bad++;console.log('A row '+(i-h-1)+' NOT VERBATIM: '+f);}
    }
}
floor('A rows',aRows,MIN_A_ROWS); floor('A fragments',aFrags,MIN_A_FRAGS);
// B. Every `*"…"*` in this checklist is verbatim somewhere outside it.
const cs=at('B/checklist heading: "### Mirrored Surface Checklist"',
         L.findIndex(l=>l.startsWith('### Mirrored Surface Checklist')));
let ce=cs+1,bFrags=0; while(ce<L.length&&!L[ce].startsWith('## '))ce++;
if(cs>=0&&ce>=L.length){vac++;console.log('ANCHOR NOT FOUND: B/checklist end ("## ")');}
if(cs>=0&&ce<L.length){
  const hay=L.filter((l,i)=>i<cs||i>=ce).map(l=>strip(norm(l))).join(' ').replace(/\s+/g,' ');
  let fence=false,reg='';
  for(let i=cs;i<ce;i++){
    if(L[i].startsWith('```')){fence=!fence;continue;}   // skip this script itself
    if(!fence)reg+=' '+L[i];                             // join: quotations wrap lines
  }
  if(!hay){vac++;console.log('ANCHOR EMPTY: B/haystack outside the checklist');}
  else for(const m of reg.replace(/\s+/g,' ').matchAll(/\*"([^"]+)"\*/g))
    for(const frag of m[1].split('…')){
      const f=clean(frag);
      if(!f)continue;
      bFrags++;
      if(!hay.includes(f)){bad++;console.log('B REGISTRATION NOT VERBATIM: '+f);}
    }
}
floor('B fragments',bFrags,MIN_B_FRAGS);
console.log(`counts: A rows=${aRows} A frags=${aFrags} B frags=${bFrags}`);
console.log(bad+vac?`FAIL (${bad} not-verbatim, ${vac} vacuity)`:'PASS');
process.exit(bad+vac?1:0);
EOF
node "$GATE/spec-quote-check.js" docs/specs/WP-stance-authority-containment.md
# Round-9 evidence, all three runs against a copy of this file in "$GATE",
# using the script text extracted from this very block:
#   1. unmodified            -> counts: A rows=6 A frags=10 B frags=14 / PASS, exit 0
#   2. mapping-table header anchor deleted
#                            -> ANCHOR NOT FOUND: A/mapping-table header: …
#                               COVERAGE FLOOR: A rows=0, expected >=6
#                               COVERAGE FLOOR: A fragments=0, expected >=10
#                               FAIL (0 not-verbatim, 3 vacuity), exit 1
#      On the round-8 script this same mutation printed PASS, exit 0.
#   2b. D6 body-start anchor renamed
#                            -> ANCHOR NOT FOUND: A/D6 body start: …
#                               plus the same two floors, FAIL, exit 1.
#      This is the round-8 script's OTHER failure mode, and it is the mirror
#      image of case 2: `a` went to -1, `L.slice(-1,b)` returned an empty span,
#      and all TEN verbatim fragments were reported `A row … NOT VERBATIM` —
#      ten false accusations, FAIL (10). Anchor assertions are therefore not
#      only what stops the silent PASS; they are what makes "may miss, must
#      never wrongly accuse" true in the missing-anchor case as well.
#   3. the round-8 V1 shape reintroduced (Contract 2's row-5 registration put
#      back to "a different source root")
#                            -> B REGISTRATION NOT VERBATIM: runs the installer
#                               from a different source root
#                               counts: A rows=6 A frags=10 B frags=14
#                               FAIL (1 not-verbatim, 0 vacuity), exit 1
#      i.e. the fidelity check round 8 proved still works, unweakened.
# Round-6 ran check A on the round-5 text first: it printed
# `row 6 NOT VERBATIM: …` (that cell compressed the recovery list instead of
# quoting it, and was rewritten as a real quotation), and it is the shape of
# check that kills a MECHANISM cell whose sentence exists nowhere in the spec.
# Round-8 ran check B on the round-7 text first. It printed two lines out of the
# 14 quoted fragments this subsection then carried (round 9 re-ran that replay
# and measured 14, from 13 elidable marks; the round-8 comment said 19, a count
# written rather than executed — corrected here, the two printed lines stand):
#   B REGISTRATION NOT VERBATIM: runs the installer from a different source root
#   B REGISTRATION NOT VERBATIM: `vendorSelf` reads exactly two inputs from ...
# The first is the Contract-2 miss described above and was fixed. The second is
# the round-7 entry deliberately quoting KILLED text; round 8 re-marked it with
# plain double quotes per the convention above rather than exempting it in code,
# which is why the script carries no exemption list. Nothing else fired: zero
# false positives. Both checks elide with `…`; each piece between elisions must
# still be verbatim.
```

**Still considered and rejected: a check for mirror *registration coverage*** —
"is this occurrence of a canonical phrase registered at all?", which is a
different question from check B's "does a registration quote its target
faithfully?". Mirrors are registered here by prose description ("Current state
§9c's 'Read that as the matrix result it is' paragraph"), not by a literal
phrase, so no grep can decide whether a given occurrence is registered; and the
canonical phrases legitimately recur in Table G, in the refutation lists, and
inside `main` baselines quoted verbatim. Such a check would emit mostly false
positives, and — worse — a green run would read as proof of registration it
cannot supply. **Coverage stays a human obligation**, carried by the standing
rule in Context (*"if you find a restatement that is not registered … register it
in the same pass"*). Recorded as a **residual**: round 6 registered two mirrors
that had gone four rounds unregistered, round 7 registered two more, and nothing
mechanical guarantees a fifth is not still out there. Check B narrows only the
other failure mode — a mirror that *is* registered, under a quotation that was
never true of it.

**Contract 1 — "what an A7-scoped write cannot do". Canonical: the subsection
"Table G — canonical scope statement"** (qualifier (i) scope = DATA inputs, never
"file content"; qualifier (ii) temporal bound = "until the next attended
`wienerdog sync`"; qualifier (iii) the conclusion is a **disjunction** — carried
forward **or the call refuses**; plus the MECHANISM paragraph — *tree data cannot
select containment*, never *tree data is not consulted*). Registered mirrors, each
of which cites or quotes that subsection and adds nothing:

- [ ] Context → "What this WP does NOT close" (the earliest mirror an implementer reads)
- [ ] Context → the "One clause … quoted, not endorsed" paragraph
- [ ] Context → the "The canonical statement of that scope is …" paragraph (the qualifier list)
- [ ] **Context → the V9 one-line invariant** (*"an attended `sync` carries containment forward, **or refuses**; no A7-scoped **data** write changes it"*, with its qualifier-(iii) note) — round-6 registration; it is the densest single-sentence form of the contract in the spec and it sat unregistered while rounds 1–5 corrected the paragraphs around it
- [ ] **Context → "The mint-time half of the rule is the hard half"**, specifically its **two-inputs count** — round-7 registration. Through round 6 it read "`vendorSelf` reads exactly **two** inputs from that tree" (plain quotes, per the convention above: that wording was removed, so it must not assert its own presence), which is false as a **read** claim (`writeLauncher` reads a third, row S1) and is exactly the read/select conflation the MECHANISM paragraph forbids. It now counts the inputs that can **select containment** and names the third read. This is the first prose an implementer meets, and it sat unregistered while round 6 fixed the identical defect in Security checklist bullet 3
- [ ] Deliverables → sizing paragraph's *"no A7-scoped **data** write decides containment"*
- [ ] "Exact contracts" → `installStance`'s `SCOPE:` block and `vendorSelf`'s `SELF-RESYNC`/`SCOPE:` block (these ship into `src/`, so all three qualifiers **and** the mechanism wording must survive into the source comments — this is the mirror round-4 promoted from without auditing). **Because this mirror ships into `src/core/vendor.js`, it is also bound by Table D: the prescribed JSDoc says *"not any environment variable"* and deliberately does NOT name the dev-mode env var.** Through the round-8 pass the prescribed comment spelled the token literally, which an implementer copying it faithfully would have put it back into `src/core/vendor.js` — red under AC10, T3 and V7, i.e. the spec's own gates would have failed the spec's own text. **State the gate precisely, because it is a FILE-level ban and not a token-level one:** AC10/T3/V7 forbid the token in every `.js` file under `src/` **outside `src/scheduler/launcher.js`**, and `src/scheduler/launcher.js` is the **sole permitted file** — inside it the token may appear freely, in comments as well as in code. That is not a loophole but a requirement: D4 step 4 directs you to update `derivationEnv`'s comment to say the scrub is now purely defence in depth, which **names** the token, and the shipped launcher carries it in three comments plus the `delete` statement. What this bullet binds is narrower and exact: **the prescribed `src/core/vendor.js` JSDoc must not contain the token**
- [ ] **Table G row 1's headline and its in-cell mechanism note** (*"nothing in the tree selects the target"*; *"`readVersion(root)` still runs"*) — round-5 registration
- [ ] Current state §9c's "Read that as the matrix result it is" paragraph
- [ ] Current state §10 → "What still holds", the "Digest-invisible is a larger set" paragraph, and "The general form"
- [ ] Implementation notes → "What the corrected statement is" and the capability-shrink blockquote
- [ ] Implementation notes → **the "objection a reviewer will raise" paragraph's closing clause** about which signal the cross-check now rests on — round-5 registration
- [ ] Implementation notes → "Why D9 is a subtraction and not a fifth guard" (its mechanism sentence) — round-5 registration
- [ ] Implementation notes → **D9 step 2's `SELF-RESYNC:` inline comment** (*"let NO signal inside that tree select the target"*; *"`readVersion` still runs above"*; *"a tampered version refuses the call"*) — round-6 registration, and **this one ships into `src/core/vendor.js`**: it is the third source-resident mirror alongside `installStance`'s and `vendorSelf`'s JSDoc blocks. **What must survive into this comment specifically is the MECHANISM wording (*select*, never *not consulted*) and qualifier (iii)'s refusal arm** — round-8 correction; through round 7 this line demanded all three qualifiers, which the prescribed comment does not carry and should not: qualifiers (i) DATA scope and (ii) the temporal bound are carried by `vendorSelf`'s `SELF-RESYNC`/`SCOPE:` JSDoc block **directly above it in the same file** (previous bullet), and duplicating them into an inline comment inside the function body buys nothing and adds a fourth place to keep in sync
- [ ] Implementation notes → **D9 step 3's note that `readVersion(root)` still runs on every call** — round-5 registration; this note is what contradicted the round-4 cell, and it was right
- [ ] Implementation notes → **Migration (Table F), the "What the attacker gains by provoking that sync" paragraph** — this one was registered in round 3 and did **not** move; round-4 rewrote it
- [ ] Implementation notes → **D6's clause-by-clause mapping table** (it must map all three qualifiers, not two)
- [ ] Security checklist bullets **2**–5 (bullet 2 was registered in round-5; before that it sat unregistered under "Everything else")
- [ ] AC16
- [ ] V9's banner comment, its `PASS`/`FAIL` strings and its `KNOWN-OPEN` line
- [ ] **D6 — `docs/GLOSSARY.md:30`** (rendered clause-by-clause; the mapping table is in Implementation notes → D5/D6/D7)
- [ ] **D7 — `docs/THREAT-MODEL.md:277-279`** (the only mirror that carried both round-3 qualifiers through — it is the model the others were re-derived from)

**Contract 2 — "how a non-contained install is converted back to prod". Canonical:
Table G row 1's "The recovery path" paragraph.** What is canonical is **THE
PROPERTY** — an attended run whose source root is provably not a dev checkout and
provably not the tree `app/current` already resolves to; the mandatory phrase is
**"a non-dev source root"**, and a git checkout is **not** one. The *enumeration*
is subordinate to it and, since round 7, is bounded: only invocations that pass
both the round-5 standing rule and the round-7 shipping rule ship into D6.
Registered mirrors:

- [ ] **D6 — `docs/GLOSSARY.md:30`**'s closing sentences
- [ ] Migration Table F, the row-5 note (*"runs the installer from a **non-dev** source root"*)
- [ ] Implementation notes → "Why D9 is a subtraction and not a fifth guard"
- [ ] Table G row 1's own scope paragraph (*"Converting a dev install to prod is now an attended act"*)
- [ ] **Definition of done item 7** — the owner sign-off rests on this contract; since round 7 it names **what** he signs (the property, the two shipped entries, the stated macOS/Linux scope, and the routing of the rest), not "the list is true". **Granted in session on 2026-07-26** and transcribed inside that item — a decision record, deliberately not an `OWNER-SIGNED` line; if this contract is ever widened, the grant does not stretch with it and must be re-sought
- [ ] **Definition of done item 6.6** — round-7 registration; it is the routed remainder of this contract and must stay consistent with the round-7 shipping rule and with item 7. **Still open and routed**: the 2026-07-26 sign-off does not close it

**Contract 2 carries TWO RULES, not just a list.** Round-5's standing rule: every
entry must name an invocation whose source root is provably non-dev **and**
provably not the tree `app/current` already resolves to, and must be **verified by
execution** before it is listed. Round-7's shipping rule: an entry may ship into
user-facing prose (D6) only if **the user supplies no filesystem path**. Five
consecutive rounds each falsified at least one entry written from intent —
`install.sh`, a fresh git checkout, a bare-`wienerdog` global install, a POSIX-only
global-binary path, and "uninstall, then reinstall" (which named no invocation at
all, violating the rule its own pass introduced). All five corrections are kept
visible in the paragraph rather than absorbed. **The lesson round 7 drew is
structural, not editorial:** the property survived every round untouched and the
enumeration failed in every round, so the enumeration was subtracted to what this
WP can execute and the per-platform procedure was routed out (Definition of done
item 6.6). Do not re-grow the list here.

- [ ] **Table G row 1 → the ROUND-7 SHIPPING RULE paragraph and the two
      subtraction bullets** — round-7 registration; they are where an entry is
      admitted or refused, so a future round that wants to add a command must
      amend them rather than the list
- [ ] **Implementation notes → D6's rationale paragraph** (*"Five are now on
      record …"*) — round-7 registration; it is the count of falsified entries and
      it must match the two rules above

Everything else in this spec:

- [ ] Deliverables cells for `src/core/vendor.js` (D1/D2/D8/D9), `src/scheduler/descriptor.js` (D3), `src/scheduler/launcher.js` (D4)
- [ ] "Exact contracts" JSDoc blocks and the four worked examples
- [ ] Acceptance criteria AC1–AC4 (Table A), AC5–AC7 (Table B), AC8 (Table C), AC9–AC10 (Table D), AC16–AC17 (Table G)
- [ ] Verification commands V1, V2, V6, V7, V9 and their `main` baselines
- [ ] Current state §1, §2, §3, §4, §6, §8, §9 (§10 is registered under Contract 1 above)
- [ ] Implementation notes → "Why containment survives the attack it replaces", "How the mint-time leg is closed" (Migration/Table F is registered under Contract 1 above)
- [ ] Security checklist bullets 1 and 6–9 (bullets **2**–5 are registered under Contract 1 above)
- [ ] Mutation checks (Table E) rows 1–10
- [ ] Test index rows T1–T12
- [ ] **Out of scope → the S1/S2 bullet and the `refuse()`-banner bullet**
- [ ] **Definition of done item 6** — **six** Discovered-issues entries since round 7; **6.3–6.5** mirror Table G rows S1/S2 and §10's amplification note (**6.6** is registered under Contract 2)
- [ ] **Table G row 2's `isSemver` reuse** is mirrored in the "Exact contracts" require line, the D8 note, AC17's vector list and T11 — there is **no** predicate literal anywhere in this spec any more, and none may be reintroduced

Out of this spec (all are Deliverables of this WP, so they move in the same PR):

- [ ] `src/scheduler/launcher.js` header bullet 3 (`:11-12`) — prose restating Table B
- [ ] `tests/scenarios/a7-integrity/fixtures/cases.js` `REASON` map — the literal fragments of Table C
- [ ] `tests/scenarios/a7-integrity/README.md:52` — the `3-stance` matrix rows
- [ ] `docs/GLOSSARY.md:30` **production/dev stance**
- [ ] `docs/THREAT-MODEL.md:277-279` — the stance clause

Registered as a mirror that this WP deliberately leaves **stale**, so nobody
"tidies" it: `src/core/vendor.js:249-250`'s doc comment states the opposite of
Table G row S1 and is known false. It is not a Deliverable, it is routed to the
owner (Definition of done item 6.3), and editing it here would put a non-listed
line in the diff.

Not registered, and why: `docs/GLOSSARY.md:25`/`:27` describe the descriptor
field set and the digest definition, neither of which this WP changes;
`docs/runbooks/scheduler-and-executable-integrity.md` describes the dev reduction
generically and never states how the stance is decided (grepped: no `stance`
match); `docs/adr/0028-…` is the ratification surface and belongs to the
concurrent amendment, not to this WP.

## Implementation notes & constraints

### Why containment survives the attack it replaces (read this before reviewing)

This exact hole has now been relocated **four** times by successive fixes — first
`WIENERDOG_DEV`, then on-disk `.git`, then (found in this spec's own round-1
review) `package.json`'s `version` and `.git`-at-`packageRoot`. The design must
therefore be attacked, not asserted, and the previous draft's central claim was
**false**; it is corrected below.

**What defeats containment — corrected.** The previous draft asserted "exactly
one capability: changing what `<core>/app/current` resolves to … writing *into*
the tree cannot change it". The second half was wrong. Writing into the tree
changes what `current` resolves to **through the next attended `sync`**, because
`vendorSelf` runs from inside that tree (Current state §9a) and reads two of its
files **that can select containment**: `package.json`'s `version`, which lands in `path.join(app, version)` and
can traverse out (§9b, executed), and `.git`, which selects link-over-copy.
Containment was not a property of the design; it was an output of a function the
attacker had two inputs into.

**What the corrected statement is.** After D8 and D9, **no data signal the honest
`vendorSelf` reads out of the tree `current` resolves to can select where `current`
points.** It still *reads* one — `readVersion(root)` at `vendor.js:166`, which runs
unconditionally and supplies the returned/printed `version` — but on a self-resync
that value cannot reach the target path, and row 2 makes a non-semver value refuse
the call outright. (An earlier draft of this paragraph said `vendorSelf` "reads no
data signal" from that tree; that is the round-4 clause round-5 executed and
falsified. The canonical wording is the MECHANISM paragraph of "Table G — canonical
scope statement"; this paragraph cites it.) Three capabilities remain. The first
two were already conceded; the third was found in round-3 review and is the reason
every claim in this spec is scoped to *data-shaped* inputs:

1. Writing the `current` symlink itself, or replacing a path component of its
   target that lies outside the app tree (swapping `<core>/app/<version>` for a
   symlink to an attacker directory). This is a write into `<core>/app`, not into
   the app tree — A12's territory, which `launcher.js:30-33` already declares out
   of A7's scope.
2. Running the installer from an attacker-chosen source root. That is an
   attended command the user types, not a write.
3. **Replacing the mint's own code.** The attended mint executes out of the
   A7-writable tree (Current state §9a), so an app-tree write is arbitrary code
   execution at the next attended CLI run. Two executed instances: `writeLauncher`
   re-publishing `launch.js` from that tree (§10a) and a module-level symlink
   moving `packageRoot()` (§10b). **D8 and D9 do not touch this** — they constrain
   what the honest code reads, not which code runs — and no additional guard can,
   because the guard would live in the replaceable code. This channel is
   **known-open, out of scope, and routed to the owner** (Table G rows S1/S2).

The invariant D8+D9 buy is **exactly** the one "Table G — canonical scope
statement" states and V9 gates; this paragraph cites that subsection and adds
nothing: **no A7-scoped *data* write changes the containment an attended `sync`
leaves behind — the `sync` either carries it forward or refuses** — and the digest
that covers the residue holds **only until the next attended `sync`**. That is a
property, checkable in five lines, not an argument — and it is not the same
sentence as "no A7-scoped write" or "no file *content*", both of which
capability 3 falsifies in one command.

**And that capability is already game-over on `main`, which is why binding to
containment gives up nothing.** An attacker who can repoint `current` at a
directory they control need only place a `.git` in it: today's mint classifies
that directory `dev` (`isDevCheckout(appRoot)` ⇒ true), the fire-time liveness
check passes, the bound-root comparison passes *trivially* because the bound root
**is** the live target, and `reDeriveDigest` then `require`s the attacker's own
`src/core/paths`, `src/scheduler/jobs` and `src/scheduler/descriptor`. The same
actor can equally overwrite `<core>/launcher/launch.js`, which `launcher.js:30-33`
already declares out of A7's scope: *"any write reaching THIS launcher file …
are A12's territory (arbitrary same-user writes under `<core>`), not A7's."*

**The capability-shrink claim, corrected in round-3 review.** An earlier draft
said here that "the set of write capabilities that reach the reduced path shrinks
from {*any* write inside the app tree} ∪ {repoint `current`} to
{repoint `current`}". **That is false as written** and has been deleted: an
app-tree write still reaches the reduced path, through the attended `sync`, by
replacing the mint's own code (§10a/§10b). The claim that survives is narrower
and is what this WP actually buys:

> The set of **known** write capabilities that reach the reduced path **without
> changing `appTreeDigestOf`** shrinks from {an empty `.git` directory planted
> anywhere in the app tree} ∪ {repoint `current`} to {repoint `current`}.

That is the whole value proposition, stated exactly: the **known
digest-invisible** downgrade is removed. Every remaining *known* app-tree route to
the reduced path is a **content change**, so it is caught by C3 on any fire
before the next attended `sync` — and **only** until that sync (qualifier (ii) of
"Table G — canonical scope statement") — and the residue, repointing `current`,
is a capability the shipped design already concedes to A12.

**The word "known" is load-bearing and was added in round-4.** "Digest-invisible"
is strictly larger than "empty directory": `launcher.js:133` pushes only
`isFile()` entries, and `fs.readdirSync(dir, { withFileTypes: true })` reports a
symlink as neither `isFile()` nor `isDirectory()`, so an **added** symlink is
invisible to the digest too. (A symlink that *replaces* a file removes a pair, so
it is visible — which is why S2 is C3-detectable before the next sync, and that
claim stands.) No added-symlink route to the reduced path is known today — both
round-4 review legs confirmed the mechanism and found none — which is why the
shrink holds. Do not restate this as a proof that the after-set is exhaustive; if
you find another invisible route, raise it, do not guard it (Out of scope).

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
cross-check the launcher performs today, moved off a signal that an A7-scoped
**data** write forges in one line (`mkdir .git`) onto one that it cannot select at
all. **Containment is not "unforgeable" and must not be described that way** — a
registered mirror of Contract 1, so it carries Contract 1's scope: rows S1/S2 move
containment by substituting the mint's **code**, and capability 1 above moves it by
writing `<core>/app` itself (A12). What is true is the narrower thing: no A7-scoped
*data* write into the app tree can select it.

### How the mint-time leg is closed (D8 + D9)

**Why the `.git`-at-`packageRoot` read alone was not enough to worry about, and
why it still had to go.** On a *contained* install the planted-`.git` argument
does hold, and it was verified by execution this session: `packageRoot()` is
`<core>/app/<version>` (§9a), so the dev branch sets `target = root` and
`repointCurrent` points `current` where it already points — a no-op leaving the
install contained, hence prod (§9c rows 1-2, identical outcomes). What that
argument does **not** cover is an install whose `current` already resolves
*outside* `<core>/app`. There the checkout **is** the app tree and **is**
A7-writable by definition, and `main` behaves differently with and without the
plant (§9c rows 4 and 5): clean, `vendorSelf` copies it inside and the install
becomes enforced; planted, it stays outside and reduced. An A7-produced `.git`
chose reduced over enforced. That is a letter-for-letter violation of ADR-0028
§3's mint-time half, and it is closed by D9, not argued away.

**Why D9 is a subtraction and not a fifth guard.** It does not add a check that
inspects the attacker's write; it removes the call. On a self-resync there is
nothing to decide — `current` already points somewhere and `vendorSelf` has
nothing new to vendor — so the honest implementation **calls no oracle at all**
(`isDevCheckout` is not invoked) and carries the existing target forward.
`isDevCheckout` survives only on the path where the source root is a *different*
tree. Note the precise claim, which is Contract 1's mechanism and not a stronger
one: the self-resync arm consults no signal that could *select* the target. It
still calls `readVersion(root)` — that never moved (`vendor.js:166`) — and row 2 is
what makes the surviving read safe.

**And the limit of that argument, stated because round-3 review found it.** "A
*different* tree" is decided by `realpathSync(root)`, and `root` is
`packageRoot()` — a value computed **inside** a module the adversary can replace
with a symlink, which moves `__dirname` to the symlink's real location (§10b,
executed). So the self-resync comparison is only as trustworthy as the module
computing it. That is not fixable by a further check in the same module, which is
precisely why S1/S2 are routed rather than guarded. What D9 does buy is the
**digest-invisible** case: a plain `.git` directory plant, which is what an
attacker reaches for because it leaves `appTreeDigestOf` untouched.

**Verified end to end, this session, on the fixed tree** (all commands re-run
under V9 and V5):

- fresh install from an out-of-tree source ⇒ `target=<core>/app/0.10.0`,
  `copied:true`, contained;
- upgrade from a **second** out-of-tree source with a bumped version ⇒
  `target=<core>/app/0.11.0`, `copied:true`, `current` repointed, contained;
- `sync` through the shim afterwards ⇒ `target=<core>/app/0.11.0`,
  `copied:false`, `current` unchanged — **the same resolved target and the same
  `copied:false`** as `main`, where the prod branch already skipped the re-copy
  (`vendor.js:178`). Deliberately **not** "byte-for-byte": `main` stores
  `path.join(app, version)` while D9 step 2 stores
  `fs.realpathSync(currentLink(paths))`, and the two strings differ wherever
  `<core>` has a symlinked path component — which is *every* macOS `/tmp` fixture
  (`/tmp → /private/tmp`). `repointCurrent` rewrites the stored link once and is
  stable from then on, and no test asserts the stored target string, so nothing
  goes red; the earlier "byte-for-byte" wording was an overstatement and is
  corrected here;
- the full suite on a scratch tree carrying D1 + D2 + D8 + D9 (`node tests/run.js`,
  re-measured in round-3 with `isSemver` in place of the withdrawn bespoke
  predicate): **1665 pass / 1 fail / 5 skipped**, the single failure being R5
  (`tests/unit/vendor.test.js:266`, `WIENERDOG_DEV`), which this WP converts by
  design. An earlier draft printed "1666 pass / 0 fail" *and* "the only red test
  being R5" — those two cannot both be true; the numbers above are the measured
  ones. Your own run will differ by however many tests T1-T12 add.

**Why `isDevCheckout` may keep its `.git` read and may not keep its `env` read.**
After D9 the read happens only for a source root the running module resolved as
*different* from where `current` points — normally a tree outside the app tree,
and outside A7's **data**-write surface. (Not outside A7 unconditionally: §10b's
symlink makes that resolution itself attacker-influenced. The point stands
relatively, not absolutely.) An environment variable is settable from a shell
profile *regardless* of which tree the installer was run from, so it has no
boundary at all and is deleted (Table D).

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

### D8 — `src/core/vendor.js`: `readVersion` validates (by REUSING `isSemver`)

Table G row 2. Add **both** file-header requires named in "Exact contracts"
(`./errors` and `./update-check`) and **write no new predicate**: guard with
`isSemver(v)`. Then throw with a message that names the file and the offending
value and tells the user what to do — this fires on an **attended** command, so
it must read as a tamper report, not a stack trace. Suggested text, matched
literally by T11: `` `refusing to use ${path.join(root, 'package.json')}:
"version" is ${JSON.stringify(v)}, which is not a plain version token — the app
tree looks tampered; reinstall Wienerdog.` ``

**Why reuse and not a bespoke regex — this is a Table G row 2 decision, recorded
here so it is not re-litigated.** `src/core/update-check.js:20` already exports
`isSemver`, length-guarded to 256 chars, and `src/core/tarball.js:36` and `:200`
already use it to guard the **identical** `path.join(appDir(paths), version)`
construction at `tarball.js:202`. A second predicate for the same construction in
a second file is a contract mirror, and round-2's bespoke `VERSION_RE` was also
strictly **weaker**: it was case-sensitive about the `current` reservation while
APFS and NTFS are not, so `version: "Current"` passed it and bricked the install
with ELOOP, and `"Current.tmp.9"` additionally escaped `repointCurrent`'s
case-sensitive `current.tmp.` sweep (`vendor.js:110`). `isSemver` rejects both by
shape, along with a trailing `.` and the win32 device names. The reservation list
is therefore **deleted, not fixed** — the subtraction. Executed acceptance/
rejection evidence and the no-cycle proof are in Table G row 2's note. If a
future value must be accepted that `isSemver` rejects, that is a change to
`isSemver` and to `tarball.js`'s contract, not a second predicate here.

Validate in `readVersion`, **not** in `vendorSelf`: `src/scheduler/descriptor.js`
calls `readVersion(appRoot)` too (`:217`, `:218`), and a single choke point means
the traversal string can never reach either the vendored directory name or the
descriptor's `version` field. A throw from the descriptor path is fail-closed —
`verifyAndResolve` wraps the whole verdict computation and turns any exception
into a refusal (the `try` opens at `launcher.js:263`; the `catch` at `:326-328`
returns `ok: false` with reason `integrity check errored: <err.message>`), and on
prod the version is already pinned by the tree digest before that code runs.

Verified this session against `isSemver` specifically: the repo's own `0.10.0`,
the fixtures' `0.0.1` and `build.js:38`'s `V2_VERSION = '999.0.0-a7test'` all
pass; `../../escaped`, `Current`, `Current.tmp.9` and `0.10.0.` all throw; and
the full suite with D1+D2+D8+D9 applied is **1665 pass / 1 fail / 5 skipped**,
the one failure being R5 — i.e. `readVersion`'s new guard breaks nothing.

### D9 — `src/core/vendor.js`: `vendorSelf`

Table G rows 1 and 3. Three edits, in this order:

1. Delete `const env = opts.env || process.env;` — after D2 and row 1 it has no
   reader, and an unused binding fails lint. Keep `env?:NodeJS.ProcessEnv` in the
   `opts` JSDoc, documented as *accepted and ignored*: `build.js:100` passes
   `env: {}` and `build.js` is **not** a deliverable, so the parameter must stay
   tolerated. Do not "clean up" the callers.
2. Insert the self-resync test after the `fs.mkdirSync(app, …)` /
   `recordOnce(…)` lines and before the branch:

   ```js
   // SELF-RESYNC: the running installer IS the tree `app/current` already
   // resolves to. Carry containment forward: let NO signal inside that tree
   // select the target — `isDevCheckout` is not called, and `target` is the
   // realpath of `current` itself. (`readVersion` still runs above; its value
   // cannot reach `target` and is semver-validated, so a tampered version
   // refuses the call.) Table G row 1 + canonical scope statement;
   // ADR-0028 amendment §3 mint-time half.
   let selfResync = false;
   try {
     selfResync = fs.realpathSync(currentLink(paths)) === fs.realpathSync(root);
   } catch { selfResync = false; }
   ```

   Both sides **must** be realpath'd: `opts.sourceRoot` from a test is often a
   `/tmp` path whose realpath is `/private/tmp` on macOS, and a raw string
   compare would silently never match. A first install has no `current`, so the
   `catch` correctly yields `false`.

   Then: `if (selfResync) { target = fs.realpathSync(currentLink(paths)); }`
   `else if (isDevCheckout(root)) { target = root; }` `else { …the existing prod
   copy branch, unchanged… }`. `copied` stays `false` on the self-resync arm.
3. Replace the `dev` the function returns: delete the `const dev = …` at the top
   and compute `const dev = installStance(paths) === 'dev';` **after**
   `repointCurrent(paths, target)` and before `writeLauncher`. The returned shape
   is unchanged, so `src/cli/sync.js:206` needs no edit.

**`readVersion(root)` still runs on every call**, self-resync included — it is
`vendor.js:166`, unconditional and before the branch, and none of the three edits
above moves it; the `version` field is returned and printed. After D8 that is safe,
and the reason it is safe is Contract 1's mechanism: on the self-resync arm the
value cannot reach `target`, and a value that is not strict semver throws. **Do not
"tidy" this into a claim that the self-resync reads nothing from the tree** — that
sentence was in the round-4 canonical cell and in D6, and round-5 executed it and
found it false. This note is a registered mirror of "Table G — canonical scope
statement".

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
> unresolvable path — is **prod**. **Data written into the app tree cannot move an
> install between the two stances.** When the installer is the very tree it is
> re-vendoring, nothing inside that tree chooses where `current` ends up: an
> attended `wienerdog sync` either leaves `current` exactly where it already
> pointed, **or** — if that tree's `package.json` carries something that is not a
> plain version number — **stops with a tamper message and changes nothing at
> all**. (Nothing the installer reads out of that tree feeds that decision. It does
> still read the tree's `package.json` version — that is the version number it
> reports back to you — and that value is checked, so a tampered one stops the sync
> rather than steering it.) **Code written into the
> app tree is a different matter and is not covered**: the installer runs out of
> that tree, so a replaced source file executes at the next attended `wienerdog
> sync` and *can* move the stance. What covers that is the **app release digest**,
> and only **until** that sync — every scheduled run *before* it refuses, because
> the tree no longer matches the descriptor; a run *after* it need not. The
> launcher re-observes containment at fire time and refuses whenever it disagrees
> with the stance bound into the job descriptor, in either direction. Converting a
> dev install back to prod is an attended act, and what makes it work is a
> property rather than one particular command: you must run the installer **from a
> non-dev source root** — a copy of Wienerdog that is **not** a git checkout and is
> **not** the tree this install already runs from. On POSIX systems (executed on
> macOS), two commands are known to satisfy that: `npx wienerdog@latest sync`,
> and a `wienerdog update` that installs a newer version. A plain `git clone` is
> **not** one of them: the
> installer links a checkout in place, so the install stays dev. (On Windows the
> same property applies; the exact commands are not documented yet.) (A7, WP-157,
> WP-stance-authority-containment).

Keep the entry's existing leading bullet and bolded term, and its trailing
`(Not: …)` clause if present; change nothing else on the line.

**This body is a rendering of "Table G — canonical scope statement", not a fresh
paraphrase — and that is the point.** Four review rounds broke this one entry four
different ways: three times in the *copy* (round-4 extracted it for that reason),
and once — round 5 — because the extraction promoted a **false mechanism clause**
into the canonical text and this entry faithfully rendered it. The body above
carries all **three** mandatory qualifiers in plain language plus the corrected
mechanism, and its final sentences carry Table G row 1's canonical recovery list.
**If you think any clause here is wrong, change the canonical subsection (or row 1)
first and re-derive this text from it.** Do not edit this text in place.

The mapping, clause by clause, so the derivation is checkable:

| Canonical scope statement | Rendered here as |
|---|---|
| (i) SCOPE — **data**, never "file content" | *"Data written into the app tree cannot move an install between the two stances"* |
| (i) SCOPE — code substitution **does** move the stance | *"Code written into the app tree is a different matter and is not covered … a replaced source file executes at the next attended `wienerdog sync` and can move the stance"* |
| (ii) TEMPORAL BOUND — **until the next attended `sync`** | *"only until that sync — every scheduled run before it refuses … a run after it need not"* |
| (iii) DISJUNCTION — carried forward **or the call refuses** | *"either leaves `current` exactly where it already pointed, **or** … stops with a tamper message and changes nothing at all"* |
| MECHANISM — tree data cannot **select** containment; it is not "not consulted" | *"nothing inside that tree chooses where `current` ends up … Nothing the installer reads out of that tree feeds that decision. It does still read the tree's `package.json` version — that is the version number it reports back to you — and that value is checked, so a tampered one stops the sync rather than steering it."* |
| Table G row 1's recovery **property**, plus the only two entries that pass the round-7 shipping rule, plus the one platform-neutral non-recovery | *"you must run the installer **from a non-dev source root** — a copy of Wienerdog that is **not** a git checkout and is **not** the tree this install already runs from. On POSIX systems (executed on macOS), two commands are known to satisfy that: `npx wienerdog@latest sync`, and a `wienerdog update` that installs a newer version. A plain `git clone` is **not** one of them"* |

**Five wordings this entry must never revert to, with the command that kills
each.** Each was in a shipped draft of this spec; each was executed by a reviewer
and failed.

1. *"nothing written into the app tree can move an install between the two
   stances"* (round 2) — falsified by one attended `sync` after a code write.
2. *"no file **content** written into the app tree can move an install between
   the two stances"* (round 3) — **code is file content**, so this has the same
   truth value as (1). Falsified round-4 on a **conforming D1+D2+D8+D9 tree**,
   with no symlink (this is not S2): `chmod +w` and append plain bytes to
   `<core>/app/0.0.1/src/core/vendor.js`, then one `vendorSelf` required through
   `app/current` in a fresh process ⇒ `stance BEFORE: prod`, `digest changed:
   true`, `current` now resolves to the attacker's checkout, `stance AFTER one
   attended sync: dev`.
3. *"…the launcher refuses on that"* with no temporal bound (round 3) — true only
   for a fire **before** the next attended `sync`. After that sync the compromised
   mint has republished `launch.js` (S1) and re-minted the descriptor, and the
   install is `dev`, where the reduced descriptor never hashes app code again.
4. *"it consults **no data** inside that tree — not `.git`, not `package.json`"*
   (round 4, rendered from the round-4 canonical cell's *"reads **no** signal
   inside the tree it is re-vendoring"*) — **false**. `vendor.js:166` calls
   `readVersion(root)` unconditionally, before the branch, and D9 does not move it.
   Executed round-5 on a conforming tree with the app tree's `package.json`
   `version` rewritten to another **valid** semver:
   `packageRoot() === realpath(app/current): true`,
   `vendorSelf() returned version: "9.9.9"`, `target carried forward: true` — the
   installer read that string out of the app tree and printed it. Say *"nothing
   inside that tree chooses where `current` ends up"*, never *"nothing is read"*.
5. **Any wording that drops the refusal arm** — e.g. round-4's *"carries
   containment forward unchanged"* with no "or stops". A `version` that is not
   strict semver makes the attended `sync` **hard-fail and mint nothing** (D8;
   Table F row 6; V9's `contained-bad-version` row prints `after=REFUSED`). This
   entry is read next to a banner telling the user to run `wienerdog sync`, so a
   user who is promised "carried forward unchanged" and instead gets a refusal has
   been given the wrong model at the worst moment.

Shipping a GLOSSARY claim a reviewer can break in one command is the exact defect
Current state §8 says this WP exists to remove. And note **where** this entry
sits: it is user-facing text read next to a refusal banner that tells the user to
run `wienerdog sync`. A missing qualifier here states the amplification hazard
(§10, AMPLIFICATION) as if it were the protection.

The recovery sentence is also the sign-off item below: today the recovery from
D9's deliberate behaviour change appears in **no** user-facing text, and this
entry is where it becomes user-facing — which is why the corrections to it are
load-bearing and not typo fixes. **Five** are now on record — round-3's
(`install.sh` does not recover), round-4's (a git checkout does **not** recover),
round-5's (a bare `wienerdog` after `npm install -g` does **not** recover either —
the managed shim wins the PATH), and round-7's two subtractions (the
global-binary path form is POSIX-only; "uninstall, then reinstall" names no
invocation). **Round 7 therefore changed the shape of what this entry ships**: the
canonical fact is the *property*, the entry names only the two invocations that
were executed **and** require the user to type no filesystem path, and it states
its own verification scope ("on POSIX systems (executed on macOS)") instead of
implying every platform. **Round 8 narrowed that scope string too**: rounds 5–7
wrote "on macOS and Linux", but the executed matrix header says *(round 5, on
macOS/POSIX)* and both shipped entries record *Executed: matrix row 1 (POSIX)* /
*row 2 (POSIX)* — no Linux run is on record. The inference to Linux is sound
(neither entry's mechanism depends on filesystem layout), but round-5's standing
rule is verification **by execution**, and this is the shipped user-facing
sentence. State the executed scope; do not launder an inference into it.
The per-platform procedure is owner-routed (Definition of done item
6.6). If you are tempted to add a command here, read Table G row 1's round-7
shipping rule first — five of the last five additions were wrong.

`docs/THREAT-MODEL.md:277-279` — replace the clause
*"and the **production/dev stance** matches (a prod entry over a dev-looking tree
— e.g. a planted `.git` — is refused, never silently downgraded to the unverified
dev path)"* with:

> and the **production/dev stance** matches, where the stance is decided by
> containment alone — an install is dev only when `app/current` resolves outside
> `<core>/app`, so no A7-scoped *data* input (a planted `.git`, a rewritten
> `package.json` version, an environment variable) can select the reduced
> verification path at fire time **or** at mint time, and a disagreement between
> the bound and live stance is refused in either direction. This does **not**
> extend to an app-tree write that replaces the app's own code: the attended mint
> runs out of the app tree, so such a write is code execution at the next
> attended CLI run. That channel is covered by the app release digest — it
> changes the tree, so any fire before the next attended `wienerdog sync` refuses
> — and it is out of this control's scope

Leave the surrounding bullet (the read-only publish sentence, the interrupted-
update sentence) untouched. Do not touch `docs/THREAT-MODEL.md:336`'s
"Enforcement reductions" bullet: it describes what a dev install *skips*, which
this WP does not change.

**Why the second sentence is mandatory, not optional hedging.** The round-2
proposed wording stopped after *"at fire time **or** at mint time"*. Executed in
round-3 review, **one attended `sync` falsifies it** (Current state §10a/§10b),
which would put a false security claim into the shipped threat model — the same
class of defect §8 lists as this WP's motivation. A threat model that names its
residual channel and the control that covers it is stronger than one that
overclaims, and it gives the owner the hook for the routed structural fix. Do not
shorten this to the round-2 sentence.

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
| dev checkout whose `.git` was removed | prod | dev (not contained) | **already broken today** — the prod arm's `verifyContainment` refuses (C2); unchanged | re-minted `dev`; starts working for the first time (see the note below — this row changed in review) |
| prod app tree whose `package.json` version was rewritten to a traversal | prod, then **refused** at fire on containment (C2) | — | unchanged: the descriptor minted before the rewrite still refuses | the `sync` itself now **fails loudly** with D8's tamper message and mints nothing; `current` is untouched |

**Fail closed or silent re-mint? Both, in the only order that is safe.** At
**fire** time nothing is ever minted: a bound/live disagreement is a hard refusal
with a durable alert. A re-mint happens only inside an **attended**
`wienerdog sync`, which the user runs deliberately and which also re-registers
the OS entry with the new digest (WP-043). That is the defensible split: a silent
fire-time re-mint would destroy the property outright, and a refusal that no
command can clear would strand a user.

**What the attacker gains by provoking that sync — scoped exactly as "Table G —
canonical scope statement" scopes it, because this paragraph is a registered mirror
of it.** Round-3
wrote here that *"the attacker gains nothing by provoking the sync, because after
this WP the re-mint cannot produce `dev` for a contained tree"*. That is true of a
**data**-shaped A7 write and **false** of a code-substituting one, and this
paragraph is the justification for answering a fire-time refusal with "run
`wienerdog sync`", so the distinction is load-bearing:

- **Data-shaped write (Table G rows 1-3).** The re-mint cannot produce `dev` for a
  contained tree. That is exactly what "moving the attack one attended `sync`
  earlier" no longer buys, and it is what V9 gates.
- **Code-substituting write (Table G rows S1/S2).** The re-mint **can** produce
  `dev` for a contained tree, and does: executed round-4 on a conforming
  D1+D2+D8+D9 tree, a plain-byte append to one app-tree source file plus one
  attended `sync` takes the install from `prod` to `dev`. Under S1 the same sync
  also republishes `<core>/launcher/launch.js` out of the compromised tree, so
  such an attacker gains **everything** by provoking it.

Therefore **do not read this table's "after one attended `wienerdog sync`" column
as a claim that `sync` is safe to recommend after an unexplained refusal.** It is
the documented remedy for the *misclassified* installs in rows 3-4, and Current
state §10's **AMPLIFICATION** paragraph records that a C3 refusal banner already
tells every user to run it. That hazard is owner-routed (Definition of done item
6.5), not resolved here.

**Note on row 5, corrected in review.** An earlier draft claimed this row is
re-minted `dev` after one `sync` **and** argued elsewhere that a `.git`-less tree
makes `vendorSelf` copy inside and therefore mint `prod`. Both could not be true.
Executed on `main` (Current state §9c row 4): a `.git`-less non-contained
checkout is **copied into `<core>/app/<version>` and repointed**, so `main` would
re-mint `prod` — the draft's row was wrong. After D9 the row is right for a new
reason: the self-resync branch carries the non-contained target forward, so the
install stays a dev checkout and re-mints `dev`. The user who *wants* the
conversion to prod runs the installer from a **non-dev** source root — Table G
row 1's canonical recovery property; a git checkout does not satisfy it, it links
itself in place and the install stays dev. The correction matters because the difference between those two
behaviours on `main` was selectable by planting a `.git` — the A2 finding — and
D9 is what removes the choice rather than picking a side.

Nothing must be re-minted for correctness; the only installs that change
behaviour are the misclassified ones, and for them the change *is* the fix.

## Security checklist

- [ ] **No verification is removed, reordered or weakened on either arm.** The
      prod arm still runs ownership, the app release digest and the descriptor
      digest, in that order. The dev arm still runs bound-root equality and the
      reduced descriptor digest. The only deleted check (`launcher.js:302`) is
      strictly subsumed by `verifyContainment` two lines later (Table B row 2,
      preserved by the unmodified test at `tests/unit/launcher.test.js:101-112`
      and case `2c-escape`).
- [ ] **The new stance signal is not writable by this WP's adversary — with the
      same scope every other claim here carries.** *(Registered mirror of "Table G —
      canonical scope statement"; round-5 registration, after this bullet was found
      stating an unqualified absolute that this WP's own executed counter-examples
      falsify.)* Table A's rule reads only the resolution of `<core>/app/current`;
      no file *inside* `app/current` participates, so **no A7-scoped DATA write
      into the app tree can produce or select it**. That is the claim — not "no
      write can". The residual **capabilities**, all three of them and why they are
      already conceded, are stated in "Why containment survives the attack it
      replaces": writing `<core>/app` itself (A12), running the installer from an
      attacker-chosen source root (an attended command), and **replacing the mint's
      own code** (S1/S2, which moves containment at the next attended `sync`,
      executed).
- [ ] **The signal is not *choosable* by this WP's adversary either — the
      mint-time half, for DATA-shaped writes.** Binding the stance to containment
      is only sound if an A7 write cannot decide containment. `vendorSelf` runs
      from inside the app tree on every prod `sync` and reads two of its files
      **that can select containment** (`package.json` version, `.git`); D8 and D9
      remove **both of those selectors** — `readVersion` still runs and is
      validated (Table G
      rows 1-2), `isDevCheckout` is not called on the self-resync arm (row 1). V9
      gates the resulting invariant and **fails on `main`**, which is the proof
      that it is asserting something. Do not ship D1–D4 without D8/D9: the combination
      without them converts a fire-time refusal into a `dev` mint (Current state
      §9b).
- [ ] **The mint-time half is NOT closed against code-substituting writes, and
      this WP says so rather than claiming otherwise.** The attended mint executes
      out of the A7-writable tree, so an app-tree write is code execution at the
      next attended CLI run (Current state §10; Table G rows S1/S2). **"Table G —
      canonical scope statement" is the canonical text and this bullet cites it**:
      every claim in this spec, in `docs/GLOSSARY.md` (D6) and in
      `docs/THREAT-MODEL.md` (D7) is scoped to **data-shaped** inputs (never "file
      content" — code *is* file content), bounded to **the next attended
      `wienerdog sync`**, and stated as a **disjunction** (carried forward **or the
      call refuses**). The residual channel is a **content** change, so it moves
      `appTreeDigestOf` and is refused (C3) on any fire **before** that sync — and
      not after it, because the sync re-mints from the substituted code. The
      empty-`.git` plant this WP removes is the only **known** digest-invisible
      route (an added symlink is invisible too; none is known to reach the reduced
      path — Current state §10). **Do
      not add a guard for S1 or S2 in this WP** — six relocations of this hole are
      on record and only the subtractive fixes closed theirs; the disposition is
      structural and is routed to the owner.
- [ ] **The refusal banner's remedy is a known hazard, recorded not repaired.**
      `launcher.js:442-443` tells the user *"If the change was intentional, run
      `wienerdog sync`"* (the `refuse()` arrow function is `:439-448`; the `reason`
      string it builds is `:440-443`).
      Under S1 a C3 refusal therefore instructs the user to
      run the command that publishes the attacker's `launch.js`. Do **not** edit
      that banner here — it is outside D4's scope; it is routed with S1
      (Discovered issues).
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
      `tests/unit/launcher.test.js:101-112` and case `2c-escape` pass
      **unmodified**, still emitting reason **C2**.
- [ ] **AC7 (fire: real dev install still runs) *(preservation)*.**
      `tests/unit/launcher.test.js`'s `setupDev('file')` and `setupDev('dir')`
      tests pass with no assertion edited: a dev install runs, a tracked-source
      edit still runs, a config edit still refuses, a repoint off the bound root
      still refuses (**C4**).
- [ ] **AC8 (the attack, end to end, through the REAL sync order) *(change)*.**
      Plant `.git` in a prod-shaped fixture → run **one attended `sync`** in the
      order `src/cli/sync.js` uses: the `vendorSelf` **call first** (`sync.js:204`;
      `:202` is its `require`), required *through* `app/current` so `packageRoot()`
      is the app tree exactly as the shim makes it, and only then the descriptor
      write, which happens inside `repointSchedules` (`sync.js:221` requires it,
      `:222` calls it) →
      assert the written descriptor's `appRelease.stance === 'prod'` → tamper an
      app **code** file (`src/core/errors.js`) → drive `launcher.main` with a
      recording spawn and assert **exit code 1**, **spawn count 0**, **and** that
      `<core>/state/alerts.jsonl` durably contains **C3**. All four assertions are
      in the pass predicate: without the alert assertion, suppressing alert
      persistence or refusing via a *different* guard still prints PASS. On `main`
      this run yields exit 0, spawn count 1, argv `["run-job","dream"]` and no
      alert. (T8, T10 cases `3a`/`3b`, V2)
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
- [ ] **AC13 (dev migration is a no-op) *(change → EQUALITY ONLY)*.** V8's printed
      descriptor digest for a dev fixture built under **the same scratch root** is
      character-for-character **identical** on `main` and on the branch. The
      criterion is the equality, **not** any particular digest value: two of V8's
      inputs are environment-bound (`node: process.execPath` and the realpath of
      the scratch root), so the literal changes with a Node version, an OS, or a
      different `mktemp -d`. For reference only, **not** as a pass condition, one
      author-environment pair measured this session (Node v25.9.0, macOS,
      `ROOT=/tmp/wd-v8x.4iK7Bs`, both halves): `sha256:d65561e98d2131cc15d5bf2065`
      `7318f4e1f6f7cad9b64a44338779aae60153b1`. A digest that differs from that
      literal is **not** a finding. A digest that differs **between your two runs
      with the same `ROOT` and the same Node** is. Paste both runs.
- [ ] **AC14 (mutation matrix) *(change)*.** Every row of Table E was
      demonstrated red; output pasted in the PR.
- [ ] **AC15 (nothing else moved) *(preservation)*.** `npm test` and
      `npm run lint` pass, and `git diff --stat` touches exactly the ten
      Deliverables paths plus this spec.
- [ ] **AC16 (a `sync` cannot move containment — against DATA-shaped A7 writes)
      *(change)*.** Over the **five gated** install shapes — contained/clean,
      contained + planted `.git`, contained + `package.json` version rewritten to
      `"../../escaped"`, outside/clean, outside + planted `.git` — the containment
      `vendorSelf` leaves behind equals the containment it started with, or the call
      **refuses**, **and** the two clean baselines are themselves carried forward
      unchanged. On `main` **two of those five** change the outcome
      (`contained-bad-version`, `outside-clean`).
      **A sixth shape is run, reported, and deliberately NOT gated**: contained +
      **`src/core/vendor.js` replaced by a symlink to an out-of-tree checkout**
      (`contained-symlink-vendor`). That shape is §10b / Table G row S2, a
      known-open **code**-substitution channel outside this WP's scope, so it is
      **outside the invariant above** and is **expected to print `after=false` on
      `main` and on the branch alike** — V9 reports it on its own `KNOWN-OPEN` line
      and its verdict does not depend on it. Stating the invariant over all six and
      then exempting one would make the criterion contradict its own verifier; it is
      stated over the gated five, which is exactly what V9 asserts. This criterion is
      a registered mirror of "Table G — canonical scope statement" and carries that
      subsection's three qualifiers, including the **or the call refuses** arm.
      (T12, V9)
- [ ] **AC17 (a tampered version is refused, not sanitised) *(change)*.**
      `readVersion` throws a `WienerdogError` whose message names the
      `package.json` path and the offending value, for `"../../escaped"`,
      `"a/b"`, `"current"`, **`"Current"`**, `"current.tmp.9"`,
      **`"Current.tmp.9"`**, **`"0.10.0."`**, `""`, `null` and a non-string —
      and returns normally for `"0.10.0"`, `"0.0.1"`, `"1.2.3-rc.1+build.7"` and
      the A7 fixture's `"999.0.0-a7test"`. The three bolded vectors are the
      case-insensitive-filesystem vectors that round-2's bespoke predicate
      accepted; they pass here because D8 reuses `isSemver` (Table G row 2). (T11)

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
| 8 | `launcher.verifyAndResolve`: delete the prod arm's `verifyContainment` call | case `2c-escape` (V-matrix) — **and that row alone** |
| 9 | `vendor.readVersion`: delete the validation, restoring the bare `JSON.parse(…).version` | T11 (AC17) — **and T11 alone** |
| 10 | `vendor.vendorSelf`: delete the `selfResync` branch (fall through to `isDevCheckout`) | T12 (AC16), **V9** — the `outside-*` rows diverge |

Notes, because several of these rows are subtle. **Read the two "and that row
alone" cells (rows 8 and 9) as the narrowings they are**: a mutation row that
names a check which does NOT go red is worse than no row at all, because the
implementer pastes a green result into the PR and calls the mutation caught.

- **Row 3 is the one that matters most.** It is the plausible "simplify by
  reusing the existing helper" edit, and it silently routes a foreign-owned
  `current` to the *reduced* path. If T2 does not go red under row 3, T2 is not
  asserting what AC4 says it does.
- **Row 7 must be red, and it is easy to write a T4 that stays green under it.**
  If T4's four shapes all resolve successfully, the two implementations agree
  trivially and row 7 passes. The unresolvable-`<core>/app` shape is the only one
  that discriminates; construct it by removing the `<core>/app` directory after
  capturing `corePathsOf(paths)`.
- **Row 8 names `2c-escape` and nothing else — do NOT add
  `tests/unit/launcher.test.js:101-112` back.** That test
  (*"repointing current OUT of `<core>/app` ⇒ refuse (A7 bullet 2)"*) asserts an
  **alternation**: `assert.match(r.reason, /does not resolve inside|app tree does
  not match/)`. Delete the prod arm's `verifyContainment` call and the
  app-tree-digest guard still refuses, satisfying the **second** branch — so the
  test stays GREEN under the mutation while appearing to gate it. Confirmed by
  execution during the post-gate pass; `2c-escape` does go red. A regex
  alternation is never a discriminator for a mutation that only removes one of
  the alternatives.
- **Rows 9 and 10 are the mint-time pair, but they are NOT interchangeable
  discriminators.** Either one alone re-opens the hole this WP exists to close,
  and neither is caught by any test that only looks at
  `installStance`/`liveStance` — both functions still behave correctly; it is the
  *input* to them that moves. **What each row actually reddens, confirmed by
  execution during the post-gate pass:**
  - **Row 9 reddens T11 only.** It does **not** redden T12 or V9. Every V9 shape
    is a **self-resync**, so `vendorSelf` takes Table G row 1's branch and the
    target is `fs.realpathSync(currentLink(paths))` — a tampered `package.json`
    `version` never reaches the target path, and containment is carried forward
    either way. `readVersion`'s validation is what makes the
    `contained-bad-version` row print `after=REFUSED` rather than `after=true`,
    but V9's gate is
    `verP.after === base.after || verP.after === 'REFUSED'` — it **allows both**
    (see "V9's predicate allows it explicitly"), so the script still prints
    `PASS` and exits 0 with the validation deleted. Only the human-readable row
    line moves (`REFUSED` → `true`); the machine verdict does not. T11 — which drives
    `readVersion` directly over the escape/`current`/non-semver corpus — is the
    only check that discriminates.
  - **Row 10 reddens T12 and V9**, independently of row 9: deleting the
    `selfResync` branch falls through to `isDevCheckout`, the `outside-*` rows
    diverge, and the gated verdict flips. That is why row 10 exists as a
    separate row and why row 9 must not borrow its checks.

  If T12 stays green under **row 10**, T12 is not asserting AC16. T12 staying
  green under row 9 is expected and is not a defect in T12.

### Test index (what to write, and where)

| id | File | What it drives |
|----|------|----------------|
| T1 | tests/unit/vendor.test.js | **converts R5**: `vendorSelf` + `env:{WIENERDOG_DEV:'1'}` on a `.git`-free source ⇒ `dev:false`, `copied:true`, `current` contained (AC9) |
| T2 | tests/unit/vendor.test.js | `installStance`: contained ⇒ `'prod'`; outside ⇒ `'dev'`; planted `.git` inside ⇒ `'prod'`; missing/dangling `current` ⇒ `'prod'`; unresolvable `<core>/app` ⇒ `'prod'` (AC3); foreign-uid via `stubForeignOwner` ⇒ `'prod'` **while** `verifyCurrentContainment` ⇒ `ok:false` (AC4) |
| T3 | tests/unit/vendor.test.js | source walk over `src/**/*.js` for `WIENERDOG_DEV`, with the ≥ 60-files / ≥ 5-`WIENERDOG_HOME` non-vacuity control (AC10) |
| T4 | tests/unit/vendor.test.js | cross-implementation: `launcher.liveStance` ≡ `vendor.installStance` over four shapes, asserting both values occur (AC11) |
| T11 | tests/unit/vendor.test.js | `readVersion` refuses `"../../escaped"`, `"a/b"`, `"current"`, **`"Current"`**, `"current.tmp.9"`, **`"Current.tmp.9"`**, **`"0.10.0."`**, `""`, `null`, a number; accepts `"0.10.0"`, `"0.0.1"`, `"1.2.3-rc.1+build.7"`, `"999.0.0-a7test"`. Assert the thrown error's `name === 'WienerdogError'` and that its message contains the package.json path (AC17). Do **not** write a local copy of the predicate in the test — import nothing; drive `readVersion` |
| T12 | tests/unit/vendor.test.js | AC16, the **five gated** shapes of "Table G — canonical scope statement": for each, record containment before, apply the A7-scoped write, call `vendorSelf` **required through `<core>/app/current`** (not the test process's own `vendor` module — that is what makes `packageRoot()` the app tree), and assert containment after equals containment before, or that the call threw. Assert the five *starting* shapes are as intended, **and** assert the two clean baselines are carried forward unchanged (`contained-clean` stays contained, `outside-clean` stays outside), so an implementation that inverts every row cannot pass. The **sixth**, symlink shape (§10b) is V9's `KNOWN-OPEN` row and is **not** asserted here — a test that must fail is not a test |
| T5 | tests/unit/descriptor.test.js | **converts R2**: stance by containment — planted `.git` file/dir and `WIENERDOG_DEV=1` all yield `'prod'`; an out-of-app `current` yields `'dev'` (AC1, AC2) |
| T6 | tests/unit/descriptor.test.js | **converts R1**: the dev-reduction test's fixture is rebuilt with `current` pointing OUTSIDE `<core>/app`; its assertions (tracked-source edit does not drift; model/layout/at/run/home edits do) stay **semantically identical** |
| T7 | tests/unit/launcher.test.js | **converts R3**: (a) a prod fixture + a planted `.git` **directory** now `ok:true` (no downgrade, digest unchanged); (b) a descriptor with `stance` hand-set to `"dev"` over a contained tree ⇒ refuse with **C1** (AC5) |
| T8 | tests/unit/launcher.test.js | the attack, unit level: plant `.git` → **`vendorSelf` required through `<core>/app/current`** (the real sync order — the `vendorSelf` call at `sync.js:204` before the descriptor write inside `repointSchedules`, called at `sync.js:222`; skipping it is what let an earlier draft's "end-to-end" gate pass vacuously) → `writeDescriptor` → assert `'prod'` → tamper `src/core/errors.js` → assert refuse with **C3**, exit 1, zero spawn, **and** a durable `alerts.jsonl` line matching C3 (AC8) |
| T9 | tests/unit/launcher.test.js | comment-only update to `setupDev`'s doc block (the `.git` is now what makes `vendorSelf` link, not what makes the stance dev) |
| T10 | tests/scenarios/a7-integrity/fixtures/cases.js | **converts R4**: case `3-stance` → `3a-plant-git-prod` (positive: re-mint, exit 0, exactly one spawn), `3b-plant-git-tamper` (refuse, `REASON.treeDigest`), `3c-stale-dev` (refuse, the re-pointed `REASON.stance` = **C1**) |

**Where T2's and T4's helpers live, and the one detail that makes T2 work.**
`tests/unit/vendor.test.js` does **not** import the A7 fixture builder today
(`vendor.test.js:1-10` requires only `node:test`, `node:assert/strict`,
`node:fs/os/path`, `../../src/core/paths` and `../../src/core/vendor`). Both
helpers are exported from **`tests/scenarios/a7-integrity/fixtures/build.js`** —
`stubForeignOwner` is defined at `:220` and `corePathsOf` at `:65`, and both
appear in that file's `module.exports` (`:252-272`). Add
`const { stubForeignOwner, corePathsOf } = require('../scenarios/a7-integrity/fixtures/build');`
to `vendor.test.js`. **`build.js` itself is not a deliverable and must not be
edited** — importing it is not editing it.

`stubForeignOwner(targetPath)` swaps `fs.statSync` for a wrapper that returns a
foreign `uid` **only on an exact string match** against `targetPath`, and returns
a restore function you must call in a `finally`. So T2 must pass
`fs.realpathSync(<core>/app/current)` — the resolved target, which is what
`verifyCurrentContainment` stats (`vendor.js:230`) — not the symlink path, or the
stub never fires and the test passes vacuously. The reason this discriminates
Table E row 3 at all is that a **correct** `installStance` never calls `statSync`,
so the stub cannot affect it; a delegating implementation inherits
`verifyCurrentContainment`'s uid check and flips to `'dev'`. Assert both halves
in one test (AC4) so that asymmetry is what is being measured.

**T10 mechanics, spelled out** because the harness contract is not obvious.
`tests/unit/a7-integrity-negatives.test.js` calls `runLauncher(fx, null, null,
ov.env)` **after** `c.mutate(fx)` has run, and `runLauncher` reads `fx.digest`
and `fx.descriptorPath` at call time. A case that needs a re-mint may therefore
do it inside `mutate` and assign the new digest back onto `fx`:

```js
// One attended `wienerdog sync`, in sync.js's own order: the vendorSelf CALL
// (sync.js:204; :202 is its require) BEFORE the descriptor write, which happens
// inside repointSchedules (required sync.js:221, called :222). vendorSelf is required THROUGH
// app/current so packageRoot() is the app tree, exactly as the shim makes it —
// skipping this step is what let an earlier draft's "end-to-end" case pass while
// the real mint still let `.git`/`version` decide containment.
const live = fs.realpathSync(fx.corePaths.appCurrent);
require(path.join(live, 'src', 'core', 'vendor')).vendorSelf(fx.paths, { env: fx.env });
const job = jobsLib.findJob(fx.paths, 'dream');
const w = descriptorMod.writeDescriptor(fx.paths, job, { env: fx.env }); // same call build.js makes
fx.digest = w.digest;
```

`cases.js` already imports `descriptorMod`, `jobsLib`, `fs` and `path` at its
head, so no new import is needed. The `vendorSelf` line is required in
`3a-plant-git-prod` (the positive case) — that is the case that claims the plant
does not downgrade, so it must traverse the code that decides. **`tests/unit/a7-integrity-negatives.test.js`
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

V1, V2, V8 and V9 are scripts. Write them **outside the repo** and run them from
the repo root, so `process.cwd()` resolves the requires. Do not commit them
anywhere: no scratch path is in the Deliverables table and `boundary-check`
rejects any file that is not.

**Create the script directory with `mktemp -d` first — run this once, before the
blocks below:**

```bash
SCRIPTS="$(mktemp -d "${TMPDIR:-/tmp}/wd-scripts.XXXXXX")"
```

A fixed `/tmp/<name>.js` is a symlink-clobber hazard on a shared box (any other
user can pre-create `/tmp/v1-mint.js` as a symlink into a path you can write) and
it is an unnecessary asymmetry with the data roots, which already use `mktemp -d`
for exactly that reason. Every heredoc below writes into `"$SCRIPTS"`.

**Never use `node --test <file>` for anything in this WP.** `tests/run.js:7` is
the only place `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` is set, and it guards
`src/scheduler/spawn.js:26` from driving your **real** launchd. Use
`node tests/run.js <paths>` (argv forwarding is verified working) or
`npm test -- <paths>`.

```bash
# ── V1 (change) — THE MINT ORACLE. Does an A7-scoped write decide the stance?
cat > "$SCRIPTS/v1-mint.js" <<'JS'
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
node "$SCRIPTS/v1-mint.js"; echo "EXIT=$?"
# on main:  …WIENERDOG_DEV=1 : dev / …planted .git FILE : dev / …planted .git DIR : dev
#           FAIL: an A7-scoped signal decided the stance
#           EXIT=1
# required after: all three read `prod`, `PASS: stance is containment-bound`, EXIT=0
```

```bash
# ── V2 (change) + V3 (preservation) — THE ATTACK, END TO END, through launcher.main.
#     V2 = `plant` (the attack). V3 = `control` (identical run, no plant) and is
#     the non-vacuity proof: the script CAN print PASS, and does, on main.
cat > "$SCRIPTS/v2-e2e.js" <<'JS'
'use strict';
process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER = '1';
const fs = require('node:fs'), path = require('node:path');
const R = process.cwd();
const { buildProdInstall, recordingSpawn, cleanup } = require(path.join(R, 'tests/scenarios/a7-integrity/fixtures/build'));
const J = require(path.join(R, 'src/scheduler/jobs'));
const L = require(path.join(R, 'src/scheduler/launcher'));
const mode = process.argv[2] === 'control' ? 'control' : 'plant';
const fx = buildProdInstall();
let code, calls, stance, alerts = '', synced = '';
try {
  const app0 = fs.realpathSync(fx.corePaths.appCurrent);
  if (mode === 'plant') fs.writeFileSync(path.join(app0, '.git'), 'gitdir: /elsewhere\n'); // 1. A7-scoped write
  // 2. ONE ATTENDED `wienerdog sync`, in the real order and through the real
  //    entry point: sync calls vendorSelf FIRST (src/cli/sync.js:204) and only
  //    then writes descriptors, inside repointSchedules (:222). Both modules are required THROUGH
  //    app/current, exactly as the ~/.local/bin shim invokes them, so
  //    packageRoot() is the app tree — the whole point of the mint-time attack.
  const Vlive = require(path.join(app0, 'src', 'core', 'vendor'));
  const v = Vlive.vendorSelf(fx.paths, { env: fx.env });
  synced = `target=${v.target} dev=${v.dev} copied=${v.copied}`;
  const app = fs.realpathSync(fx.corePaths.appCurrent);
  const Dlive = require(path.join(app, 'src', 'scheduler', 'descriptor'));
  const job = J.findJob(fx.paths, 'dream');
  const w = Dlive.writeDescriptor(fx.paths, job, { env: fx.env });
  stance = JSON.parse(fs.readFileSync(w.path, 'utf8')).appRelease.stance;
  const f = path.join(app, 'src', 'core', 'errors.js');                          // 3. tamper app CODE
  try { fs.chmodSync(f, 0o644); } catch { /* already writable */ }
  fs.appendFileSync(f, '\n// attacker payload marker\n');
  const rec = recordingSpawn(); calls = rec.calls;                               // 4. fire
  const oe = process.stderr.write; process.stderr.write = () => true;
  try {
    code = L.main(['dream', '--descriptor', w.path, '--expect-digest', w.digest],
      { env: fx.env, core: fx.paths.core, platform: process.platform, spawn: rec.spawn, exit: () => {} });
  } finally { process.stderr.write = oe; }
  try { alerts = fs.readFileSync(path.join(fx.paths.state, 'alerts.jsonl'), 'utf8'); } catch { alerts = ''; }
} finally { cleanup(fx.root); }
if (typeof code !== 'number' || !Array.isArray(calls)) throw new Error('ORACLE BROKEN: launcher.main returned nothing usable');
if (!/target=/.test(synced)) throw new Error('ORACLE BROKEN: the sync step did not run vendorSelf');
const C3 = /the live app tree does not match the descriptor/;
console.log(`mode                               : ${mode}`);
console.log(`vendorSelf (the sync step)         : ${synced}`);
console.log(`descriptor stance after plant+sync : ${stance}`);
console.log(`launcher exit code                 : ${code}`);
console.log(`spawn count                        : ${calls.length}`);
console.log(`spawn argv                         : ${calls.length ? JSON.stringify(calls[0].args.slice(1)) : '(none)'}`);
console.log(`durable alert matches C3           : ${C3.test(alerts)}`);
console.log(`alert reason                       : ${(alerts.trim().split('\n').pop() || '(none)').slice(0, 160)}`);
const ok = stance === 'prod' && code === 1 && calls.length === 0 && C3.test(alerts);
console.log(ok ? 'PASS: app-code tamper refused, zero spawn, C3 alert persisted'
               : 'FAIL: the tamper reached a spawn, the stance downgraded, or no C3 alert was written');
process.exitCode = ok ? 0 : 1;
JS
node "$SCRIPTS/v2-e2e.js" plant;   echo "EXIT=$?"     # V2
node "$SCRIPTS/v2-e2e.js" control; echo "EXIT=$?"     # V3
# V2 on main: vendorSelf dev=true / stance dev / exit code 0 / spawn count 1 /
#             argv ["run-job","dream"] / alert matches C3 false / FAIL … / EXIT=1
# V2 required after: vendorSelf dev=false / stance prod / exit code 1 /
#             spawn count 0 / argv (none) / alert matches C3 TRUE / PASS … / EXIT=0
# V3 on main AND after: vendorSelf dev=false / stance prod / exit code 1 /
#             spawn count 0 / alert matches C3 true / PASS … / EXIT=0
#
# The `C3.test(alerts)` conjunct is load-bearing, not decoration: without it,
# suppressing alert persistence — or refusing via a DIFFERENT guard (e.g. delete
# the prod tree-comparison and let the code load from the unverified tree, then
# refuse on derived-digest drift) — still prints PASS. AC8 requires the refusal
# to be the RIGHT refusal, durably recorded.
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
# ── V8 (change → EQUALITY) — THE DEV MIGRATION PROOF. Builds a dev install under
#     a scratch root YOU create with `mktemp -d` and pass in, and prints the
#     per-job descriptor digest. Run it on `main` first, then on the branch,
#     WITH THE SAME ROOT and the same Node. The two digests must be identical:
#     a real dev install's OS entry keeps verifying, no re-mint, no user action.
#
#     The root is a parameter, not a constant, for two reasons that pull against
#     each other and are both satisfied here: the digest covers `home`, `vault`
#     and the dev checkout path, so the two runs MUST share a root; and a
#     hard-coded `/tmp/<fixed-name>` would let this script `rm -rf` a path a user
#     or a concurrent job already owns. The script therefore never removes ROOT
#     itself — only the three subdirectories it creates inside it.
cat > "$SCRIPTS/v8-migration.js" <<'JS'
'use strict';
process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER = '1';
const fs = require('node:fs'), path = require('node:path');
const R = process.cwd();
const ROOT = process.argv[2];
if (!ROOT || !path.isAbsolute(ROOT)) throw new Error('usage: node v8-migration.js <absolute scratch root from mktemp -d>');
if (!fs.statSync(ROOT).isDirectory()) throw new Error(`${ROOT} is not a directory`);
const checkout = path.join(ROOT, 'checkout'), wd = path.join(ROOT, 'wd'), vault = path.join(ROOT, 'vault');
for (const d of [checkout, wd, vault]) fs.rmSync(d, { recursive: true, force: true }); // only our own subdirs
const vendor = require(path.join(R, 'src/core/vendor'));
const { getPaths } = require(path.join(R, 'src/core/paths'));
const D = require(path.join(R, 'src/scheduler/descriptor'));
const J = require(path.join(R, 'src/scheduler/jobs'));
fs.mkdirSync(checkout, { recursive: true });
vendor.copyTree(R, checkout);
fs.writeFileSync(path.join(checkout, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
const env = { HOME: ROOT, WIENERDOG_HOME: wd };
const paths = getPaths(env);
fs.mkdirSync(paths.state, { recursive: true });
fs.writeFileSync(paths.config, `version: 1\nvault: ${vault}\n`);
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
console.log(`scratch root                : ${ROOT}`);
console.log(`contained in <core>/app     : ${contained}`);
console.log(`appRelease.stance           : ${d.appRelease.stance}`);
console.log(`dev descriptor digest       : ${D.descriptorDigest(d)}`);
for (const dir of [checkout, wd, vault]) fs.rmSync(dir, { recursive: true, force: true });
if (d.appRelease.stance !== 'dev') { console.log('FAIL: a real dev install did not classify dev'); process.exitCode = 1; }
else console.log('PASS: dev install classifies dev');
JS

# The `main` half. `git stash` is NOT the way to get it: once your work is
# committed on wp/… there is nothing to stash. Use a throwaway local clone —
# read-only with respect to your working tree, and it leaves your branch alone.
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/wd-v8.XXXXXX")"
MAINCO="$(mktemp -d "${TMPDIR:-/tmp}/wd-mainco.XXXXXX")/repo"
git clone -q --shared . "$MAINCO" && git -C "$MAINCO" checkout -q main
( cd "$MAINCO" && node "$SCRIPTS/v8-migration.js" "$ROOT" ); echo "EXIT=$?"   # baseline
node "$SCRIPTS/v8-migration.js" "$ROOT"; echo "EXIT=$?"                       # your branch
# Both halves must print:
#   contained in <core>/app     : false
#   appRelease.stance           : dev
#   dev descriptor digest       : sha256:…        ← THE SAME sha256, both halves
#   PASS: dev install classifies dev   EXIT=0
# Measured this session on the author's environment (Node v25.9.0, macOS, one
# specific ROOT) the pair was
# sha256:d65561e98d2131cc15d5bf20657318f4e1f6f7cad9b64a44338779aae60153b1 —
# quoted for orientation ONLY. See AC13: the criterion is the equality.
```

**Why V8's digest is stable between the two halves, and why the literal is not
portable.** The dev reduction drops `treeDigest` and `version`, so the copied
`src/` content does not enter the digest. What does enter it: `promptHash` (the
`DREAM_PROMPT` template from `src/core/dream/brain.js` plus the vendored
`wienerdog-dream` skill body) — neither is a Deliverable of this WP, so it cannot
move — plus two **environment-bound** inputs: `node: process.execPath` and the
realpath of `ROOT` (which reaches `home`, `vaultRoot` and `appRelease.root`).
Hold both fixed — same shell, same Node, same `ROOT` — and the digests match;
change either and they differ **while the property under test still holds**.
Verified this session: same `ROOT` twice ⇒ identical digest; a different `ROOT`
⇒ a different digest, both runs `PASS`. So a mismatch against the quoted literal
is **not** a finding and must not stall you. A mismatch **between your own two
halves** is.

```bash
# ── V9 (change) — THE MINT-TIME GATE (AC16, Table G). The invariant, with BOTH
#     arms of qualifier (iii): an attended `sync` carries containment forward, OR
#     the call refuses; no A7-scoped DATA write changes it. Five gated install
#     shapes plus one reported-but-ungated KNOWN-OPEN shape (S2, §10b);
#     `vendorSelf` is required THROUGH app/current so packageRoot() is the app
#     tree, exactly as the shim makes it.
#
#     The predicate asserts the INVARIANT, not just "planted rows match their
#     baselines". Round-3 review executed the weaker form against a deliberately
#     broken implementation that flips every clean contained install outside and
#     every clean outside install inside: the weak predicate printed PASS. The
#     `carried(base) && carried(outB)` conjunct below is what kills it.
cat > "$SCRIPTS/v9-sync-containment.js" <<'JS'
'use strict';
process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER = '1';
const fs = require('node:fs'), path = require('node:path');
const R = process.cwd();
const ROOT = process.argv[2];
if (!ROOT || !path.isAbsolute(ROOT)) throw new Error('usage: node v9-sync-containment.js <absolute scratch root from mktemp -d>');
const V0 = require(path.join(R, 'src/core/vendor'));
function contained(core) {
  const app = path.join(core, 'app');
  try {
    const rel = path.relative(fs.realpathSync(app), fs.realpathSync(path.join(app, 'current')));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch { return 'UNRESOLVABLE'; }
}
function run(name, { outside, write }) {
  const base = path.join(ROOT, name);
  fs.rmSync(base, { recursive: true, force: true });
  const core = path.join(base, 'core'), app = path.join(core, 'app');
  const paths = { core, home: base, state: path.join(core, 'state') };
  const start = outside ? path.join(base, 'checkout') : path.join(app, '0.0.1');
  fs.mkdirSync(start, { recursive: true });
  fs.mkdirSync(app, { recursive: true });
  V0.copyTree(R, start);
  // A directory JUNCTION on win32: plain symlinkSync needs Developer Mode or an
  // elevated shell there, so the script would die before it ever exercised a
  // conforming implementation on a normal Windows box.
  fs.symlinkSync(start, path.join(app, 'current'), process.platform === 'win32' ? 'junction' : undefined);
  const before = contained(core);
  if (write === 'git') fs.writeFileSync(path.join(start, '.git'), 'gitdir: /elsewhere\n');
  if (write === 'version') {
    const pj = path.join(start, 'package.json');
    fs.chmodSync(pj, 0o644);
    const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
    j.version = '../../escaped';
    fs.writeFileSync(pj, JSON.stringify(j, null, 2));
  }
  if (write === 'symlink') {
    // S2 / Current state §10b: one link INSIDE the app tree relocates the mint's
    // own module. Node resolves module filenames through symlinks, so the loaded
    // vendor.js sees `ext` as __dirname ⇒ packageRoot() is `ext` ⇒ D9's
    // self-resync comparison is false ⇒ ext's `.git` selects the dev branch.
    const ext = path.join(base, 'ext');
    V0.copyTree(R, ext);
    fs.writeFileSync(path.join(ext, '.git'), 'gitdir: /elsewhere\n');
    if (process.platform === 'win32') {
      // A FILE symlink needs Developer Mode or an elevated shell on Windows, and
      // this call sits OUTSIDE the guarded `vendorSelf`, so an EPERM here would
      // abort V9 before either the KNOWN-OPEN line or the gated verdict printed.
      // A directory JUNCTION needs neither privilege and relocates the same
      // module: `src/core/vendor.js` is then read out of `ext`, so its __dirname
      // — and therefore packageRoot() — is `ext`, exactly as in the POSIX form.
      const dir = path.join(start, 'src', 'core');
      fs.rmSync(dir, { recursive: true, force: true });
      fs.symlinkSync(path.join(ext, 'src', 'core'), dir, 'junction');
    } else {
      const victim = path.join(start, 'src', 'core', 'vendor.js');
      fs.rmSync(victim, { force: true });
      fs.symlinkSync(path.join(ext, 'src', 'core', 'vendor.js'), victim);
    }
  }
  let after, err = '';
  try {
    require(path.join(app, 'current', 'src', 'core', 'vendor')).vendorSelf(paths, {});
    after = contained(core);
  } catch (e) { after = 'REFUSED'; err = ` (${e.message.slice(0, 60)}…)`; }
  console.log(`${name.padEnd(26)} start=${String(before).padEnd(6)} A7 write=${String(write).padEnd(8)} after=${String(after)}${err}`);
  return { before, after };
}
const base = run('contained-clean', { outside: false, write: 'none' });
const gitP = run('contained-plant-git', { outside: false, write: 'git' });
const verP = run('contained-bad-version', { outside: false, write: 'version' });
const outB = run('outside-clean', { outside: true, write: 'none' });
const outG = run('outside-plant-git', { outside: true, write: 'git' });
const symP = run('contained-symlink-vendor', { outside: false, write: 'symlink' });   // KNOWN-OPEN, not gated
// Oracle guards on the STARTING shapes, never on the outcome under test.
for (const r of [base, gitP, verP, symP]) if (r.before !== true) throw new Error('ORACLE BROKEN: a contained fixture did not start contained');
for (const r of [outB, outG]) if (r.before !== false) throw new Error('ORACLE BROKEN: an outside fixture did not start outside');
// THE INVARIANT: each shape's containment is CARRIED FORWARD (or the call
// refuses). Asserting the clean baselines is what makes this an invariant rather
// than a same-as-the-neighbour comparison — an implementation that inverts every
// row satisfies the neighbour comparisons and fails these two.
const carried = (r) => r.after === r.before;
const okBaselines = carried(base) && carried(outB);
const okContained = gitP.after === base.after && (verP.after === base.after || verP.after === 'REFUSED');
const okOutside = outG.after === outB.after;
const ok = okBaselines && okContained && okOutside;
console.log(`KNOWN-OPEN (S2, §10b) contained-symlink-vendor carried forward: ${carried(symP)}  ← REPORTED, NOT GATED`);
// Both verdict strings carry BOTH arms of qualifier (iii). A conforming
// `contained-bad-version` row takes the REFUSES arm (after=REFUSED), so a PASS
// line that said only "carries containment forward" would claim less than the
// run proved and less than the canonical statement says — round-7 finding.
console.log(ok
  ? 'PASS: every shape carried its containment forward, OR refused — no DATA-shaped A7 write changed it'
  : 'FAIL: a shape neither carried its containment forward NOR refused — see the rows above');
process.exitCode = ok ? 0 : 1;
JS
node "$SCRIPTS/v9-sync-containment.js" "$(mktemp -d "${TMPDIR:-/tmp}/wd-v9.XXXXXX")"; echo "EXIT=$?"
# on main:
#   contained-clean            start=true   A7 write=none     after=true
#   contained-plant-git        start=true   A7 write=git      after=true
#   contained-bad-version      start=true   A7 write=version  after=false      ← A1
#   outside-clean              start=false  A7 write=none     after=true       ← A2 (baseline moves)
#   outside-plant-git          start=false  A7 write=git      after=false
#   contained-symlink-vendor   start=true   A7 write=symlink  after=false      ← S2
#   KNOWN-OPEN … carried forward: false  ← REPORTED, NOT GATED
#   FAIL: a shape neither carried its containment forward NOR refused — see the rows above
#   EXIT=1
# Round 7 re-executed this whole block after changing the two verdict literals
# (the six row lines and the KNOWN-OPEN line are produced by unmodified code and
# came back byte-identical to the round-4/5 measurement; only the verdict line is
# new). It is the CURRENT literal, not a hand-edited one.
# required after: `contained-bad-version` reads `REFUSED` with D8's message,
#   `outside-clean` reads `after=false` (baseline carried), PASS, EXIT=0 — and
#   `contained-symlink-vendor` STILL reads `after=false` / `carried forward:
#   false`. That row is EXPECTED to stay broken on the branch; it is the
#   known-open structural channel (Table G row S2) and it is deliberately outside
#   the gate. A run in which it flips to `true` means someone added a sixth guard
#   — that is out of scope for this WP and must be raised, not merged.
```

**V9's predicate was executed in both directions while this spec was written, and
so was the counter-example that forced the strengthening.** Against unmodified
`main` the six rows print exactly the baseline block above and the script exits
1. Against a scratch tree with D1+D8+D9 applied (a throwaway `git clone --shared`,
never the working tree) the gated five print
`after=true / true / REFUSED / false / false`, `PASS`, exit 0 — while
`contained-symlink-vendor` still prints `after=false`, confirming §10b survives a
conforming implementation and belongs outside the gate. Separately, the round-2
predicate (`gitP≡base && (verP≡base ‖ REFUSED) && outG≡outB`, with no
carry-forward conjunct) was evaluated against the inverting implementation's
matrix — `base {true→false}`, `outB {false→true}`, planted rows tracking their
baselines — and returned **true**; the predicate above returns **false** on the
same matrix and **true** on the conforming one. That is why AC16 now says
"equals the containment it started with" and V9 asserts it.

**V9's portability, fixed in round-4.** V9 creates `app/current` as a directory
**junction** on win32 because a plain `symlinkSync` there needs Developer Mode or
an elevated shell — but the round-3 script then created a **file** symlink in the
S2 row unconditionally, and that call sits **outside** the guarded `vendorSelf`,
so on an ordinary non-elevated Windows host it threw `EPERM` and aborted V9 before
either the `KNOWN-OPEN` line or the gated verdict printed. The stated
normal-Windows portability was therefore not achieved. The S2 row now uses a
directory junction on win32 (junction `src/core` to the out-of-tree copy), which
needs no privilege and relocates `packageRoot()` by the identical mechanism — and
is itself the more realistic Windows form of the attack. **The POSIX path is
byte-identical to round-3's**, so the measured baselines above are unchanged:
re-run round-4 on macOS, `main` prints the six-row block verbatim and exits 1, and
a conforming D1+D2+D8+D9 tree prints
`after=true / true / REFUSED / false / false`, `KNOWN-OPEN … carried forward:
false`, `PASS`, exit 0.

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
- **Any fix for S1 (`writeLauncher` sources `launch.js` from the app tree) or S2
  (a module symlink relocates `packageRoot()`).** Both are executed, both are
  recorded in Current state §10 and Table G rows S1/S2, and both are **routed to
  the owner**. Do not change `writeLauncher`'s `sourceRoot` default, do not add a
  verification of `launch.js` before use, do not add a symlink check in
  `vendorSelf`, do not `realpathSync`-and-compare `__dirname`, and do not touch
  `src/core/vendor.js:249-250`'s (now known false) doc comment. The correct fix is
  structural — source `launch.js` from outside the app tree, or verify it before
  use — and it is an **ADR-0028-level decision**, not an implementer's. This
  paragraph is the hard boundary: **six** relocations of this hole are on record
  and every additive guard generated the next finding, so a sixth guard smuggled
  in here is an automatic REQUEST-CHANGES even if it works.
- **`src/scheduler/launcher.js`'s `refuse()` banner (the arrow function is
  `:439-448`; the `reason` string it builds is `:440-443`).**
  Its remedy line at **`:442-443`** — *"If the change was intentional, run
  `wienerdog sync`; otherwise investigate."* — combined with S1 makes a C3 refusal instruct the user to install the
  attacker's `launch.js` (Current state §10, AMPLIFICATION). It is a real
  user-facing hazard and it is **routed**, not repaired here: rewording a refusal
  banner is a docs/UX decision with its own golden-file blast radius, and D4's
  scope in the Deliverables table does not include it.
- **Excluding `.git/` or `node_modules/` from `appTreeDigestOf`, in either copy**,
  and any git-derived file selection. Explicitly forbidden by ADR-0028's amendment
  (lines 905-913): it would make prod integrity depend on `.gitignore` — writable
  at exactly the surface A7 defends — and would require the self-contained
  launcher to consult `git`.
- **`src/cli/sync.js:206`'s dev message.** After D2 it can no longer be triggered
  by `WIENERDOG_DEV`, and after D9 row 3 the `v.dev` it prints is containment-
  derived, so it now agrees with the descriptor by construction. Leave it — the
  line needs no edit, and it is not a Deliverable.
- **`src/core/vendor.js`'s `verifyCurrentContainment`.** It keeps its ownership
  check and keeps having no `src/` caller. Do not delete it, do not call it from
  `installStance`, do not "unify" the two.
- **`src/core/update-check.js`.** D8 **imports** `isSemver` from it (Table G
  row 2). Importing is not editing: do not widen it, narrow it, move it, re-export
  it from `vendor.js`, or copy its regex. If you believe a legitimate version it
  rejects must be accepted, stop and say so in the PR — that is a change to a
  predicate `src/core/tarball.js` also depends on, and it is not this WP's.
- **`src/cli/adopt.js`.** It is the second attended `vendorSelf` caller (`:392`)
  and D9 changes its behaviour on exactly one path (Table G row 1's scope
  paragraph says which, and why V9/Table F cover it unchanged). It needs **no
  edit**: it passes no `env`, ignores the returned `dev`, and normally runs from
  an npx/temp source root, so `selfResync` is false and it still converts. Do not
  "align" it with `sync.js`.
- **`docs/adr/0028-scheduler-app-executable-integrity.md`.** Its 2026-07-25
  amendment is signed (`Accepted. OWNER-SIGNED 2026-07-26`), already records the
  per-job dev path as an unresolved rule violation, and already names this WP as
  the work that resolves it. **Do not edit it** — not the status line, not the
  amendment body, and not to add a "resolved" note when you merge. Recording that
  the violation is closed is the owner's act on a ratified surface, not an
  implementer's edit.
- **`docs/specs/WP-dev-descriptor-no-tree-hash.md`.** Its Test index tells an
  implementer to build dev fixtures with `fs.mkdirSync(path.join(paths.core,
  'app','0.0.1','.git'))`, an idiom this WP invalidates. Correcting it is the
  architect's job, not yours; note it under "Discovered issues" in your PR body.
- **ADR-0028 Decision 4(d)** (`:203-205`) — *"a `dev` entry [must resolve] to a
  dev checkout, so a planted `.git` cannot downgrade a prod install"*. That
  sentence is a stale mirror **inside** the canonical file, superseded by the
  signed amendment's §3/§4 further down the same file, and this WP makes it
  false. Do not edit it (previous bullet). Add it to the same "Discovered issues"
  list in your PR body so the architect reconciles 4(d) and the
  `WP-dev-descriptor-no-tree-hash` fixture idiom in one owner-routed pass.
- **The A7 harness's gated runner** (`tests/scenarios/run-a7-integrity.js`) and
  `tests/scenarios/a7-integrity/fixtures/build.js`. Verified this session: the
  runner consumes `launcherCases()` generically and hard-codes no case id, and
  `build.js`'s `devSource()` already produces a non-contained `current`. Neither
  needs a change; if you believe otherwise, say so in the PR rather than editing.
- **`docs/THREAT-MODEL.md:336`'s "Enforcement reductions" bullet** and
  `docs/runbooks/scheduler-and-executable-integrity.md`. Both describe what a dev
  install *skips*, which this WP does not change.

## Definition of done

1. All verification steps (V1–V9) run locally and their output pasted into the PR
   body, including the Table E mutation runs (all **ten** rows, each shown red)
   and the V4 `ℹ tests / ℹ pass / ℹ fail` counts.
2. The PR body states, in one line each: that **V1, V2 and V9 printed FAIL/exit 1
   on `main` and PASS/exit 0 after**; that **V3 printed PASS on both** (the
   non-vacuity control — a pass, not a defect); and that **V8 printed the same
   digest on both halves**, with the two digests quoted side by side and the
   `ROOT` and `node --version` used for both stated once. The V8 criterion is the
   equality only — do not compare against any literal in this spec.
3. The PR body lists the five deliberately-red existing tests (Current state §6
   R1–R5) and, for each, one line on how it was **converted** — none deleted.
4. `git diff --stat` pasted, showing exactly the ten Deliverables paths plus this
   spec. In particular `tests/unit/a7-integrity-negatives.test.js`,
   `tests/scenarios/a7-integrity/fixtures/build.js` and
   `tests/unit/scheduler-schedule.test.js` are **untouched**.
5. Conventional commits; PR titled
   `fix(scheduler): bind the prod/dev stance to containment (WP-stance-authority-containment)`.
6. PR template filled, including "Decisions made" (or "none"), `Generated-by:`,
   and "Discovered issues" with **exactly these six** entries — recounted in
   round-3 review (it was two) and again in round 7, which added 6.6:
   1. `docs/specs/WP-dev-descriptor-no-tree-hash.md`'s Test index still builds dev
      fixtures with `fs.mkdirSync(path.join(paths.core,'app','0.0.1','.git'))`, an
      idiom this WP invalidates. Architect's fix, not yours.
   2. `docs/adr/0028-…` Decision 4(d) (`:203-205`) is a stale mirror inside the
      canonical file, superseded by the signed amendment further down it. Owner's
      surface; do not edit.
   3. **S1 — `writeLauncher` re-publishes `<core>/launcher/launch.js` from the
      A7-writable app tree** on every attended `sync` (`vendor.js:195` passes no
      `sourceRoot`; `:259` falls back to `packageRoot()`, which through the shim
      *is* `realpath(app/current)`). State in the same entry that the shipped doc
      comment at **`src/core/vendor.js:249-250`** — *"a scoped write to the app
      tree cannot disable the fire-time verification"* — is therefore **known
      false**. Proposed disposition, for the owner: source `launch.js` from
      outside the app tree, or verify it before use. ADR-0028-level.
   4. **S2 — a module-level symlink inside the app tree relocates
      `packageRoot()`**, because Node resolves module filenames through symlinks;
      this defeats D9's self-resync comparison from inside the very module that
      performs it. No in-module guard can close it. Owner-routed with S1.
   5. **The refusal banner amplifies S1** — `launcher.js:442-443` tells the user to run
      `wienerdog sync` after a C3 integrity refusal, which under S1 is the act
      that installs the attacker's launcher. User-facing hazard; owner-routed.
   6. **The per-platform recovery procedure is undocumented, and deliberately so.**
      D6 ships the recovery **property** plus the only two invocations that were
      executed *and* require the user to type no filesystem path
      (`npx wienerdog@latest sync`; a `wienerdog update` to a newer version), with
      its verification scope stated in the text ("on POSIX systems (executed on
      macOS)"). Windows is
      a supported install target (schtasks) and has **no** documented recovery
      command: the round-5 form `"$(npm prefix -g)/bin/wienerdog" sync` is
      POSIX-only (Windows npm puts its shims directly under the prefix, and global
      packages at `<prefix>\node_modules`), and no one on this WP has a Windows
      host to derive and execute the correct form. Proposed disposition, for the
      owner: a standalone documentation task, "recovering a dev-classified install,
      per platform", whose acceptance criterion is **execution on each supported
      platform**. Rationale for routing rather than guessing is in Table G row 1's
      round-7 shipping rule. Do **not** add commands to D6 to close this.
      **The 2026-07-26 owner sign-off (item 7) explicitly does NOT close this
      entry** — it is part of what he was told he is *not* signing off on.
7. **Owner sign-off — REQUESTED AND GRANTED IN SESSION on 2026-07-26. Record it
   in the PR body; do not re-request it.** D9
   deliberately changes one behaviour: a non-contained install is no longer
   silently converted to prod by a `vendorSelf` whose source root is that same
   tree (Table G row 1; it reaches both `vendorSelf` call sites,
   `src/cli/sync.js:204` and `src/cli/adopt.js:392`). **Gyula** was asked to sign
   off on that change and did.
   **What he signed, stated exactly, because round 7 changed it:**
   (a) that the behaviour change is intended, and (b) that what D6 ships as its
   recovery — **the property** (run the installer from **a non-dev source root**:
   a copy that is not a git checkout and is not the tree this install already runs
   from), **plus the two invocations that were executed and require no
   user-typed path**, **plus the stated scope "on POSIX systems (executed on
   macOS)"**, **with the
   per-platform procedure routed out as Discovered issue 6.6** — is enough to ship
   the change now. He did **not** sign off on a complete cross-platform recovery
   menu; that is exactly what round 7 removed from this WP, and item 6.6 is the
   commitment that replaces it. Quote Table G row 1's property sentence and its two
   entries verbatim in the PR body, beside the transcription below; do not
   paraphrase, and do not add a third entry — **that quotation is the exact scope
   of what was granted**, and a PR body that quotes more is claiming a sign-off he
   did not give.

   > **OWNER-RATIFIED IN SESSION (TRANSCRIBED, NOT OWNER-TYPED)** — 2026-07-26.
   > Gyula ruled verbally in session on D9's deliberate behaviour change:
   > **"sign-off granted."** What he granted is exactly (a) and (b) above and
   > nothing wider — (a) that the behaviour change is intended, and (b) that what
   > D6 ships (the property, the two executed path-free invocations, the stated
   > scope "on POSIX systems (executed on macOS)", with the per-platform procedure
   > routed out as Discovered issue 6.6) is enough to ship now. He did **not**
   > grant a complete cross-platform recovery menu. **Discovered issue 6.6 stays
   > OPEN and routed; this sign-off does not close it.**
   >
   > Transcribed by the orchestrating session, **not typed by Gyula**. It is a
   > decision record, not a signature: it is deliberately **not** an
   > `OWNER-SIGNED` line and must never be rewritten as one. This item asks for
   > the owner's *decision* and keys no gate on an owner-typed marker, so under
   > this project's convention the transcribed ruling **does satisfy item 7** —
   > and nothing further needs to be typed by Gyula for this WP.
   The reason it needs a signature rather than a note: the recovery appears in
   **no** user-facing text today, and **five** successive drafts documented a
   recovery that does not work. Round 3 found `install.sh` does not recover
   (`install.sh` invokes `wienerdog init`; `src/cli/init.js:87`'s guard makes
   `:88` print "already installed" and return before `vendorSelf`). Round 4 found
   the replacement entry *"an explicitly-invoked … fresh checkout"* does not
   recover either, because `isDevCheckout` is true for a git checkout, so the
   install stays dev. **Round 5 found the next replacement, *"a global
   `npm install -g wienerdog` followed by `wienerdog sync`"*, does not recover
   either**: `writeShim` puts `$HOME/.local/bin/wienerdog` in front of the npm
   global bin on the PATH `src/cli/sync.js:209` tells the user to set, and
   `package.json` declares no `postinstall`, so bare `wienerdog` re-enters the same
   install through `app/current` and self-resyncs. **Round 7 subtracted the two
   entries that replaced those** — the global-binary form
   `"$(npm prefix -g)/bin/wienerdog" sync`, whose written path does not exist on
   Windows, and "uninstall, then reinstall", which names no invocation at all —
   which is where the count of five comes from. Table G row 1 therefore now
   carries **two rules**, not one: round-5's — every entry names an invocation
   whose source root is provably non-dev and provably not the current install's
   own tree, and is **verified by execution** before being listed — and round-7's
   shipping rule, that an entry reaches user-facing prose only if **the user
   supplies no filesystem path**. The executed matrix is printed under that
   paragraph, and it is evidence for the property, not a menu.
   D6 puts the corrected recovery into `docs/GLOSSARY.md`; the sign-off is that this
   is enough — and the reviewer's standing point applies: the sign-off is warranted
   **because** the recovery is documented, so a documented recovery with a broken
   entry on it is not a typo. **What to quote is stated above** — the property
   sentence and the two entries, verbatim, and nothing else. There is no longer a
   "corrected list" to quote: round 7 replaced the list with a property plus two
   entries, and a request that quotes anything more is asking for a signature on
   something this WP did not execute.
8. This spec's `status:` flipped to `In-Review` in the same PR.
