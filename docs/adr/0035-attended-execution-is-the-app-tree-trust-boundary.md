# ADR-0035: An app-tree write is code execution at the next attended run — A7's boundary is re-scoped, not re-guarded

Status: Accepted
Date: 2026-07-26
OWNER-SIGNED 2026-07-26

> **Drafted as a decision request; ratified by the owner on 2026-07-26.** The
> architect wrote this ADR to put one question to the owner, and that question
> is preserved verbatim below rather than erased. The owner decided it on
> 2026-07-26 and signed the line above himself; what he ratified is the
> architect's recommendation, **Option 1 — accept the residual and re-scope
> A7's claim**. The Decision section is therefore in force. Two things his
> signature deliberately did **not** do: it did not amend ADR-0028, whose
> "Honest boundary" narrowing (Decision item 3) remains a separate, still
> outstanding owner act, and it did not enact the amendment text proposed
> under "Proposed amendment to ADR-0028", which is an offer and not in force.
> No agent wrote the signature line above; no agent may write, move or
> reformat one.

## What the owner decided

The ADR was drafted to put one question, in one sentence:

> **Do we build out-of-tree verification for attended CLI runs, or do we accept
> that a write into `<core>/app` is same-user code execution and correct every
> claim that says otherwise?**

The architect recommended the second, and on 2026-07-26 the owner chose it.
Ratification commits him to five things, listed in full under "Decision" so
none of them arrives as a surprise: A7 stops claiming to defend the app tree
against attended execution; `docs/THREAT-MODEL.md`'s A7 residual paragraph is
factually wrong today and **still awaits its correction**; ADR-0028's "Honest
boundary" needs a dated amendment **which is a separate owner act that this
signature did not perform**; no seventh guard gets built; and the out-of-tree
attended entry point is recorded as a documented next increment with a named
revisit trigger, exactly as ADR-0028 did for its "2b" bootstrap.

## Context

**IRON RULE (ADR-0004): Wienerdog is just files.** Nothing in this ADR starts a
process, opens a socket, or outlives its invocation. Every option below was
tested against that rule before it was written down; an option that violated it
would not be listed.

### The defect class, and why a reader should not reach for a guard

Across one long review session, a single A7 downgrade class **relocated six
times**. `WP-stance-authority-containment` Current state §10 records the chain
verbatim:

> inherited `WIENERDOG_DEV` → pre-sync `.git` plant → `package.json` version →
> `.git` at `packageRoot` → `writeLauncher` → module symlink

and records the pattern that matters more than the chain: **only the subtractive
fixes closed their finding.** Every additive fix — a new predicate, a new
validation, a new branch that inspects the tree more carefully — produced the
next finding in the list. The three fixes that held (`D2` deletes the
`WIENERDOG_DEV` branch; `D8` reuses the existing `isSemver` rather than adding a
second predicate; `D9` removes the tree's ability to select the vendor target)
each *removed* an input rather than checking one.

A reader arriving cold will think the obvious answer is a guard: validate the
source root, reject symlinked modules, check the tree before the mint reads it.
That instinct is what generated findings 2 through 6. Two independent reviewers
converged on why, and this is the sentence this ADR exists to act on:

> **The attended mint executes code from the A7-writable app tree, so any
> app-tree write is arbitrary code execution at the next attended CLI run. Data
> validation cannot close it, because the validating code is itself
> replaceable.**

A guard written in `src/core/vendor.js` is a guard the adversary edits in the
same write that plants the payload.

### The mechanism, cited and executed

`writeShim` (`src/core/vendor.js:307`) writes the user's `wienerdog` command as
literally

```text
exec node "<currentBin>" "$@"
```

(`src/core/vendor.js:311-314`), where `currentBin` (`:23`) is
`path.join(<core>/app/current, 'bin', 'wienerdog.js')`. So every attended
`wienerdog <anything>` enters app-tree code with **no verification of any kind**.
There is no descriptor check, no tree digest, no containment check on that path.

Node resolves module filenames through symlinks (`Module._findPath` →
`toRealPath`; there is no `--preserve-symlinks` in play), so once the shim has
entered through `app/current`, `packageRoot()` (`src/core/vendor.js:10`,
`path.resolve(__dirname, '..', '..')`) **is** `realpath(<core>/app/current)`.
Verified this session in a `mktemp -d` scratch: a main entry reached through a
symlinked directory reports `__dirname` at the symlink's *real* location, so
`packageRoot()` resolves to the linked-to tree, not the link path.

Three instances of the class follow from that one fact. All three were executed
this session, not argued.

| # | Instance | Mechanism, verified |
|---|---|---|
| **S1** | The attended mint republishes the out-of-tree verifier from the tree | `vendorSelf` ends at `src/core/vendor.js:195` with `writeLauncher(paths, { manifest: opts.manifest })` — **no `sourceRoot`** — so `writeLauncher` (`:259`) falls back to `packageRoot()` and copies `<root>/src/scheduler/launcher.js` over `<core>/launcher/launch.js`. On a shim-reached prod install that root is the app tree. One app-tree write becomes the fire-time verifier at the next attended `sync` |
| **S2** | A module symlink relocates `packageRoot()` outside every comparison | Replace `<core>/app/<version>/src/core/vendor.js` with a symlink to any out-of-tree checkout. The loaded module's `__dirname` is the external location, so `packageRoot()` — and every predicate derived from it — describes a tree the attacker chose. Executed: a symlinked module reports `packageRoot()` at the symlink target's root, with the requiring entry still inside the tree |
| **S3** | `wienerdog update` executes an already-published version dir without re-verifying it | `installVersion` short-circuits on `<core>/app/<version>/.wienerdog-complete` and returns `alreadyPresent: true` **without downloading or verifying anything** (`src/core/tarball.js:203-205`); `src/cli/update.js:45-48` then spawns `<res.target>/bin/wienerdog.js sync` **unconditionally** — there is no branch on `alreadyPresent`. Executed in scratch: with the marker present, the handoff runs code from the existing version dir. So the class reaches `update`, not only `sync` |

S3 was found while drafting this ADR and is recorded here because it is the same
class, not a new one — it is what makes "just run `wienerdog update` to repair"
an unsafe recovery, and it is why `npx wienerdog@latest sync` (a registry-fetched
root) is the recovery the specs name.

### The amplification

`src/scheduler/launcher.js`'s refusal banner — the `refuse` arrow function at
`:439-448`, its `reason` string at `:440-443` — ends, verbatim at **`:442-443`**:

```text
If the change was intentional, run `wienerdog sync`; otherwise investigate.
```

So a fire-time integrity refusal that correctly detected an app-tree tamper
instructs the user to perform S1 — the exact act that installs the attacker's
`launch.js`. The detection and the completion of the compromise are the same
message.

### What the two gated work packages close — stated precisely, not generously

Two work packages are drafted and gated on this session's review. They are the
first and second pieces of the three-part plan this ADR closes.

| Work package | Status | What it closes | What it does **not** close |
|---|---|---|---|
| `WP-refusal-remedy-discriminator` | `Draft`, both review legs gated, one confirmation outstanding | **The amplification only.** A structured `remedy` field on each verdict, assigned by rule **R-P**: a refusal returns `'sync'` **iff, on the path that reached it, the check tying live `app/current` to what the descriptor authorized has already executed and passed** (`launcher.js:310` on the prod arm, `:288` on the dev arm). Every other refusal gets a tail that says *do not run `wienerdog sync`* and names reinstall instead | Nothing about S1, S2, S3 or the general form. The banner is text; it changes what the user is told, not what `sync` does |
| `WP-launcher-no-self-resync-republish` | `Ready`, both legs APPROVE | **S1, on prod.** On a self-resync — `realpath(app/current) === realpath(sourceRoot)` — the existing `<core>/launcher/launch.js` is carried forward instead of republished, because a self-resync has no newer launcher to offer. Fails closed if the existing launcher is unreadable | S2 (below); S3; the general form; and its own **Residual R-dev** — on a dev install `carryForward` is false by design, so `<checkout>/src/scheduler/launcher.js` is still published at every attended sync, or the launcher could not be developed at all |

**Why S2 is not a leftover but a direct defeat of S1's fix.** The carry-forward
arm is selected by `selfResync`, i.e. `realpath(app/current) === realpath(root)`.
S2 relocates `packageRoot()` to an external checkout, so that equality is
**false**, `carryForward` is falsy, the publish arm runs, and the launcher is
taken from the attacker-chosen root. S2 does not sit beside S1's fix; it turns it
off. Any narrower predicate is a seventh guard on a value the adversary supplies.

**What holds meanwhile, and it is not nothing.** S1, S2 and S3 are all **code**
substitutions, so all three change `appTreeDigestOf` and are refused by any
*scheduled* fire that happens before the next attended run. The protection is
real and it is **temporally bounded by the user's next attended CLI invocation**.
That bound is the whole subject of this ADR.

### The structural question

The mint cannot verify itself. The code performing any check lives in the tree
the adversary can write, so a self-check is circular. The only non-circular
structure is **verification outside the tree, before app-tree code runs.**

That structure already exists for **scheduled** fires: `<core>/launcher/launch.js`
is deliberately outside the mutable tree, requires only Node builtins at load
(`src/scheduler/launcher.js:36-39`), and only requires code *from* the tree after
the tree has been proven byte-identical — its own comment says so at `:314-316`.
Its anchor is the digest bound into the **loaded** OS scheduler entry, which a
file-write primitive cannot change without registration privilege.

It does not exist for **attended** runs, and the reason is not an oversight:
**the attended path has no anchor to build it on.** The entry point is
`~/.local/bin/wienerdog`, written mode `0755` and therefore owner-writable
(`src/core/vendor.js:318-321`), reached through `$PATH` — the same resolution
surface ADR-0028's F4 already treats as attacker-influenceable. An attended
verifier can always be bypassed by replacing or bypassing the thing that invokes
it. The only attended entry point that is anchored is one fetched from the
registry at invocation time, which is what `npx wienerdog@latest sync` already
is.

## Options considered

The five options below are recorded as they were weighed, before the decision.
Option 1 is the one the owner ratified; Options 2–5 were not adopted, and
Option 2's status as the documented next increment is fixed under "Decision".

### Option 1 — Accept the residual; re-scope A7's claim (ADOPTED — ratified 2026-07-26)

Build no new mechanism. Ship the two gated work packages. Correct every document
that says A7 defends the app tree against an attended run, and state the
temporal bound — protection until the next attended CLI invocation — as the
guarantee.

- **Closes:** the false claim, which is the thing currently doing harm. Today
  `docs/THREAT-MODEL.md:363-374` states A7 catches *"an agent session that can
  write `config.yaml`, `app/current`, or `~/.local/bin` but can neither
  re-register the OS scheduler entry nor overwrite the launcher file."* That
  sentence is **false as written**: a writer of `app/current` reaches the
  launcher file transitively, at the next attended run. A reader who trusts it
  under-reacts to a real tamper.
- **Costs:** the honest claim is weaker and harder to market. `docs/VISION.md`,
  `README.md` and the integrity runbook all need their A7 sentences narrowed.
  A dated amendment to ADR-0028's "Honest boundary" is required — and ADR-0028
  is owner-signed, so that amendment is **a separate owner act** (see below),
  still outstanding as of 2026-07-26 and not performed by ratifying this ADR.
- **Does not close:** S2, S3, the general form, or `R-dev`. All four stay open
  and named.
- **What could go wrong:** documenting a residual is how residuals become
  permanent. The mitigation is the revisit trigger under "Decision", not good
  intentions. A second risk is over-correction — writing the boundary so
  pessimistically that the scheduled-fire protection, which is real and was
  expensive, reads as worthless.

### Option 2 — Route attended invocations through the out-of-tree launcher

Point the shim at `<core>/launcher/` instead of `<core>/app/current/bin/`. The
out-of-tree entry verifies containment, the app tree digest and the entry-bound
descriptor digest, and only then executes `bin/wienerdog.js <command>`.

- **Closes:** in principle, the general form for every attended command it
  covers — the thing no guard can close.
- **Costs:** the launcher stops being a fire-time verifier and becomes the
  product's universal entry point, which **amends ADR-0028 Decision 4**. It must
  parse the CLI's argv before loading any tree code, so a second, out-of-tree
  copy of the command table exists and must not drift. It must query the loaded
  OS scheduler entry (`launchctl print` / `schtasks /query` / `systemctl show`)
  on every invocation to reach a trustworthy anchor — a subprocess per command,
  and a new dependency of the attended CLI on the scheduler being registered.
- **Does not close:** the mint commands, which is fatal as stated. `wienerdog
  sync`, `update`, `init` and `adopt` exist to *change* the tree, so they cannot
  be gated on it matching the last-bound digest — a legitimate `update`
  publishes a tree that by construction does not match. Exempting them exempts
  `sync`, the command in the attack. It also does not close the anchor problem:
  the shim is owner-writable, so an adversary who reaches `app/current` can
  usually also rewrite `~/.local/bin/wienerdog` and skip the launcher entirely.
- **What could go wrong:** the bootstrap-absent case. On a fresh install there is
  no schedule, no descriptor and no loaded entry, so verification has nothing to
  check. "Skip when absent" is fail-open and is precisely the pattern ADR-0028
  amendment #1 had to fix for `exec-pins.json`; "refuse when absent" makes the
  CLI unusable before the first schedule exists and hands the adversary a
  denial-of-service by deleting one file.

### Option 3 — Anchor the mint outside the tree (subtractive generalization)

Generalize the two work packages: the mint may never take **code** from a source
root that resolves inside `<core>/app`. `wienerdog sync` through the shim keeps
re-rendering digests and re-binding descriptors, but publishing app code or the
launcher requires an external root — `npx wienerdog@latest sync`, or `update`'s
freshly-downloaded-and-verified tree.

- **Closes:** the self-publishing channel as a class, rather than S1 as an
  instance. S3 also closes, by removing `update`'s short-circuit handoff.
- **Costs:** a legitimate repair now needs the network, and `wienerdog sync`
  becomes two commands the user must tell apart. `wienerdog update` loses its
  idempotent fast path.
- **Does not close:** the general form. Tampered tree code still executes on
  `wienerdog dream`, `doctor`, `run-job`, `gws` and every other attended
  command; only the *publishing* consequence is removed.
- **What could go wrong:** the discriminator is still a computed value. S2
  falsifies "resolves inside `<core>/app`" the same way it falsifies
  `selfResync`, so Option 3 done naively is finding number seven. It is only
  sound if the containment test runs on a path the substituted module cannot
  reach — which, since the test would live in the substituted module, it cannot.

### Option 4 — Remove the write: `<core>/app` stops being same-user-writable

Publish the app tree root-owned (or under a dedicated service account), so a
scoped same-user write cannot reach it at all.

- **Closes:** the class outright. There is no A7-writable app tree left to
  execute from, and the "guards relocate" problem disappears with it.
- **Costs:** install, `sync`, `update` and `uninstall` all require elevation.
  That contradicts the curl-installer default's no-elevation stance (ADR-0006,
  ADR-0011) and endangers the reversibility invariant — `wienerdog uninstall`
  must still empty `<core>` (ADR-0019), which would now need `sudo`. Windows
  needs the equivalent admin story on top of ADR-0017.
- **Does not close:** anything reachable by an adversary who already has
  elevation, and nothing at all on a machine where the user routinely runs `sudo`
  from an agent-reachable shell.
- **What could go wrong:** it converts a security property into an install-time
  friction that users will work around. A partial form — `chflags uchg` /
  `chattr +i` — is not a boundary at all, because the same user clears it.

### Option 5 — Add a seventh guard

Validate the source root, reject symlinked modules, inspect the tree before the
mint reads it.

- **Rejected.** This is the family that produced findings two through six. The
  validating code is inside the tree the adversary writes, so the guard's own
  bytes are attacker-controlled; `WP-stance-authority-containment` Current state
  §10 states it directly (*"the guard would be written in code the adversary can
  replace"*) and instructs implementers not to add one for S1 or S2. Listed here
  so that a future reader finds it already weighed and refused, rather than
  re-deriving it as the obvious answer.

## Decision

**Option 1 is adopted**, ratified by the owner on 2026-07-26. A7's boundary is
re-scoped to what it actually holds, and no seventh guard is built.

The durable rule this establishes:

> **Wienerdog's app tree is an execution surface, not a data surface. A write
> into `<core>/app` is same-user code execution at the next attended CLI
> invocation. No mechanism may be built, and no claim may be made, that treats an
> app-tree write as a bounded, detectable, data-shaped event.** A7's app-tree
> integrity guarantee holds **only for scheduled fires that occur before the next
> attended run**, and every statement of it must carry that bound.

Ratification committed the owner to all five of the following. **The signature
performed none of items 1, 2 or 3** — each names work or an owner act that was
still outstanding when this ADR was signed and is outstanding until someone does
it. Items 4 and 5 are standing prohibitions, in force from 2026-07-26.

1. **The two gated work packages ship as scoped, and neither is asked to do
   more.** `WP-refusal-remedy-discriminator` closes the amplification;
   `WP-launcher-no-self-resync-republish` closes S1 on prod. Neither closes the
   general form and neither may be widened to try.
2. **The false claims get corrected.** `docs/THREAT-MODEL.md`'s A7 residual
   paragraph, the corresponding sentences in `README.md`, `docs/VISION.md` and
   `docs/runbooks/scheduler-and-executable-integrity.md`, and the shipped doc
   comment at `src/core/vendor.js:249-250` (*"a scoped write to the app tree
   cannot disable the fire-time verification"*, recorded as **known false** by
   `WP-stance-authority-containment` Table G row S1) all state the temporal
   bound. This needs its own work package; it is not free and it is not this
   ADR. **No such work package exists as of 2026-07-26**, so those sentences —
   `docs/THREAT-MODEL.md:369-372` above all — are still shipped and still false.
   Ratifying this ADR corrected none of them; writing that work package is the
   outstanding act.
3. **ADR-0028 needs a dated amendment, and that is a separate act the owner must
   still take.** ADR-0028 is Accepted and OWNER-SIGNED; its "Honest boundary"
   currently protects *"scoped writes that reach `config.yaml`, the app tree,
   and/or the install manifest but NOT the launcher file."* The **app tree**
   must leave that list, because an app-tree write reaches the launcher file
   transitively. **This ADR does not amend ADR-0028 and must not be read as
   having done so.** The owner's 2026-07-26 signature is on *this* file only:
   as of that date ADR-0028's "Honest boundary" is unchanged and still names the
   app tree in its protected class. It is the single easiest thing for a later
   reader to assume was handled here; it was not. The proposed amendment text is
   below, unsigned.
4. **S2, S3 and `R-dev` stay open, named, and un-guarded.** They are recorded in
   `WP-stance-authority-containment` Table G row S2, in this ADR's instance
   table, and in `WP-launcher-no-self-resync-republish`'s Residual R-dev
   respectively. Ratification closed none of the three and was never going to —
   staying open is the decision, not a gap in it. Adding a guard for any of them
   is a violation of this ADR.
5. **Option 2 is recorded as the documented next increment, and was not built by
   this decision.** It stays unbuilt until one of the revisit triggers below
   fires. Same
   treatment ADR-0028 gave its "2b" bootstrap: written down with its costs, with
   a named revisit trigger, so the next session neither re-derives it nor starts
   it by accident.

### Proposed amendment to ADR-0028 (for the owner's separate signature)

**Not in force, and not enacted by the owner's 2026-07-26 signature on this
ADR** — that signature ratified ADR-0035 and nothing else. The text below is
offered so the remaining act is one signature rather than one design session; it
takes effect only when it appears in `docs/adr/0028-scheduler-app-executable-integrity.md`
over the owner's own dated marker:

> **Amendment (date TBD) — the app tree leaves the protected class.** The
> "Honest boundary" section's protected class is narrowed: A7 protects scoped
> writes that reach `config.yaml` and/or the install manifest **but not the app
> tree and not the launcher file**. A write into `<core>/app` is same-user code
> execution at the next attended CLI invocation (ADR-0035), which reaches the
> launcher file transitively; the app-tree integrity guarantee therefore holds
> only for scheduled fires occurring before the next attended run. Decision 4's
> out-of-tree launcher is unchanged and still catches the tamper at fire time —
> what changes is the claim about how long that catch survives.

### Revisit triggers

- **A12** — the audit item that owns arbitrary same-user native code. Option 2
  and Option 4 are both A12-shaped and belong to that pass.
- **Any anchored attended entry point becoming available** — an OS-level
  user-presence prompt, a signed launcher, or a decision to make the registry the
  only mint source (Option 3's premise). Any of these makes Option 2's
  bootstrap-absent problem tractable, which is today its blocking defect.
- **A seventh instance of the class.** If one appears without any of the above,
  that is evidence the residual is not stable and the cost balance has moved.

## Consequences

- **The scheduled fire's protection is unchanged and still worth what it cost.**
  S1, S2 and S3 are code substitutions; all three drift `appTreeDigestOf` and are
  refused, with a durable alert and zero spawn, by any fire before the next
  attended run. What this ADR removes is an overclaim about duration, not a
  mechanism.
- **The product's honest security statement gets shorter and more defensible.**
  "Your scheduled AI cannot be silently re-pointed between attended syncs" is
  true. "Your app files cannot be tampered with" was never true and now cannot be
  written.
- **`npx wienerdog@latest sync` becomes the named repair, and `wienerdog update`
  is not a substitute for it.** S3 is the reason: `update`'s short-circuit
  executes an existing version dir without re-verifying it.
- **The review loop gets a fixed criterion.** ADR-0034 made the same move for the
  secret fence after six rounds produced a fail-open critical in five: the
  problem was not a cleverer rule but a missing ratified threat model. This ADR
  is the same move for A7's attended surface, and the six relocations are the
  same evidence in the same shape.
- **A cost is accepted, not hidden.** Until an anchored attended entry point
  exists, a determined adversary who achieves one write into `<core>/app` gets
  arbitrary same-user code execution the next time the user types `wienerdog`.
  Wienerdog will say so in its own documentation rather than let a reader infer
  otherwise from a launcher that sounds stronger than it is.
- **Nothing here starts a process.** Every option was screened against ADR-0004
  first; the adopted one adds no code at all.

## Relations to prior ADRs

- **ADR-0004 (no-daemon invariant).** Honored. The adopted option builds nothing;
  the options that were weighed and declined would each have been files and
  verify-then-spawn logic, never a resident process.
- **ADR-0028 (scheduler, app and executable integrity).** **Not amended by this
  ADR, and not amended by its ratification.** Decision 4's out-of-tree launcher
  stands; its "Honest boundary" still needs the narrowing proposed above, which
  remains a separate owner act, outstanding as of 2026-07-26. ADR-0028's
  2026-07-25
  amendment §3 established that *stance* is never selected by a signal an
  A7-scoped write can produce; this ADR is the generalization of that rule from
  stance selection to **execution**.
- **ADR-0013 (vendored install).** Unchanged. The version-named `app/<version>/`
  layout and the `current` symlink stay exactly as they are — Option 4, the only
  option that would have disturbed them, was not adopted.
- **ADR-0034 (the secret fence's threat model).** Same structural move, different
  subsystem: when a review loop relocates a defect instead of closing it, the
  missing artifact is a ratified statement of what the mechanism is for.
- **ADR-0031 (contract reference tables).** The instance table under "The
  mechanism, cited and executed" is this ADR's single home for S1/S2/S3; the
  work packages cite it rather than restating the mechanisms.
