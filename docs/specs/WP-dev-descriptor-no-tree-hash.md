---
id: WP-dev-descriptor-no-tree-hash
title: Stop content-addressing the live checkout in the dev job descriptor
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0028, ADR-0031]
epic: audit-a7
---

# WP-dev-descriptor-no-tree-hash: the dev descriptor stops hashing a live tree

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly `dream`, later routines) with the OS-native
scheduler. The registered OS entry never invokes the app directly: it invokes the
**independent launcher** at `<core>/launcher/launch.js` — a file that lives
OUTSIDE the mutable app tree — which verifies integrity and only then spawns
`node <app>/bin/wienerdog.js run-job <name>`. Any verification failure is a
durable alert plus **zero** spawn (ADR-0028). **IRON RULE (ADR-0004): Wienerdog
is just files.** The launcher runs and exits with each fire; nothing here starts
a process that outlives its job, and this WP adds no daemon, watcher, or poller.

An install has one of two **stances**. In **prod** the published files are copied
into `<core>/app/<version>/` and `app/current` symlinks there; that tree is
immutable between updates, so the launcher can demand a byte-exact **app release
digest** (a sha256 content address over the sorted per-file hashes). In **dev**
`app/current` points at a live git checkout — the maintainer's own install is
dev: `~/.wienerdog/app/current -> /Users/gyulafeher/Documents/Claude_Projects/wienerdog`.
A dev tree is edited constantly by definition, so ADR-0028 amendment #7
(2026-07-19) ruled that a dev install binds a **reduced** descriptor digest —
`appRelease` collapses to `{stance:'dev', root}`, excluding `treeDigest` and
`version`, while every other field (run, model, timeouts, vaultLayout, vaultRoot,
home, schedule, node, exec pins) stays digest-covered. So on dev, a tracked-source
edit stays runnable but a `config.yaml`/schedule/home edit still drifts and
refuses.

**`buildDescriptor` nevertheless computes an app release digest for the dev
`appRelease` and then throws it away**: `reduceForDigest` rebuilds
`{stance, root}` from scratch before digesting, so the field it computed is never
digested and no dev code path ever reads it. Hashing a **live** checkout is not
free and not safe: a concurrent `git`/`npm` write can unlink a file mid-walk, the
resulting `ENOENT` propagates out of `buildDescriptor`, and the nightly **dream**
**refuses**. This WP deletes that computation. It changes **nothing** on prod, and
— by `reduceForDigest`'s own construction — it cannot change any dev digest, so
nothing already registered needs re-minting.

**Catch-up is not in scope and its behaviour does not change.** Catch-up (running
jobs missed while the machine was off) has a separate OS registration whose
launcher gate is containment inside `<core>/app` plus a byte-exact app release
digest. A dev install fails containment unconditionally, so catch-up refuses on
every dev install. That is WP-157's ratified disposition and it **stands**. A
round-2 draft of this WP proposed a dev catch-up branch; it was **rejected** by
the owner on 2026-07-25 for a demonstrated security regression (see "Out of
scope → dev catch-up", which you must read before proposing anything adjacent).

## Current state

Everything below was read at commit `efd1489`; line numbers are that commit's.

### 1. The block this WP edits — `src/scheduler/descriptor.js:212-219`

```js
    appRelease:
      stance === 'dev'
        ? // Dev checkouts are live-edited: the digest reduces appRelease to
          // {stance, root} (excludes treeDigest+version) so a tracked-source edit
          // stays runnable; every OTHER field is retained + digest-covered.
          { version: readVersion(appRoot), treeDigest: appTreeDigest(paths), stance: 'dev', root: appRoot }
        : { version: readVersion(appRoot), treeDigest: appTreeDigest(paths), stance: 'prod' },
```

`stance` is set at `descriptor.js:186` from `isDevCheckout(appRoot, env)`
(`src/core/vendor.js:30-36`: a `.git` **directory**, a `.git` regular **file** —
a git worktree — or `env.WIENERDOG_DEV === '1'`). `appRoot` is
`fs.realpathSync(currentLink(paths))` (`descriptor.js:178`). **This WP does not
touch either** — see Out of scope.

### 2. Why removal is provably migration-free — `descriptor.js:249-254`

```js
function reduceForDigest(d) {
  if (d && d.appRelease && d.appRelease.stance === 'dev') {
    return { ...d, appRelease: { stance: 'dev', root: d.appRelease.root } };
  }
  return d;
}
```

It builds `{stance, root}` **from scratch**, so whether the input `appRelease`
carries a `treeDigest` cannot affect the resulting digest. `descriptorDigest(d)`
(`:257`) is `'sha256:' + sha256(canonicalize(reduceForDigest(d)))`. That fact
is the whole migration argument, and AC2 is its executable form.

### 3. The app-tree content address — unchanged by this WP

`descriptor.js:48-63` `appTreeDigestOf(root)` walks the whole tree and hashes
every regular file, with **no exclusion list of any kind** (no `.git`, no
`node_modules`, no dotfile filter); only symlinks and non-regular files are
skipped. `descriptor.js:72` `appTreeDigest(paths)` is the thin wrapper the
`appRelease` arms call. `src/scheduler/launcher.js:125-139` holds a **second,
independent copy** of `appTreeDigestOf`, because the launcher's only top-level
requires are Node builtins (`launcher.js:36-39`) — it cannot require the hash
from the tree it is about to verify.

**The invariant binding the two copies is digest equality, not textual
identity.** Be precise here, because the existing test title says "byte-for-byte"
and that title is misleading — do not inherit its wording. The two bodies are
**not** textually identical today: `descriptor.js` carries two inline comments
(`// POSIX separators, always` on the `childRel` line, and `// symlinks /
specials excluded — content, not link topology, is addressed`) that the
`launcher.js` copy does not have. What is enforced is that both functions return
the **same digest for the same tree**:

- `tests/unit/launcher.test.js:211` — `launcher.appTreeDigestOf(target) === descriptorMod.appTreeDigest(paths)` over a prod fixture.
- `tests/unit/launcher.test.js:224` — `launcher.appTreeDigestOf(root) === descriptorMod.appTreeDigestOf(root)` over hostile filenames (unicode, embedded `"` and `\n`, a nested `sub/dir/deep.json`).

A comment-only edit to either copy therefore does **not** turn those tests red,
and it should not — it changes no digest. A *semantic* edit does. **This WP
modifies neither copy**, and `tests/unit/launcher.test.js` is not a deliverable,
so both tests must still pass **unmodified**. V6 is the executable proof.

### 4. What reads the dev `appRelease.treeDigest` — nothing

`grep -rn treeDigest src bin tests` at `efd1489` shows the only readers are
`launcher.js:309` (the **prod** branch of `verifyAndResolve`, which compares the
live tree to `descriptor.appRelease.treeDigest`) and two test assertions,
`tests/unit/descriptor.test.js:208` and `tests/unit/scheduler-schedule.test.js:1194`
— both on **prod** fixtures (`descriptor.test.js:209` asserts `stance === 'prod'`;
`scheduler-schedule.test.js` plants a `.git`-free app tree). No dev code path
reads it. The catch-up gate (`launcher.js:364`) compares against the
entry-bound `--expect-digest`, not against this field.

### 5. The defect this removes — a mid-walk `ENOENT` becomes a refusal

Every dev descriptor derivation walks and hashes the whole live checkout, then
discards the result. Two consequences, both real today:

- **It makes `writeDescriptor` non-idempotent on dev.** `descriptor.js:272`
  documents *"unchanged inputs ⇒ byte-identical file"* (`writeDescriptor` itself
  is at `:280`); on dev the recorded
  `treeDigest` changes whenever any file under the checkout changes, so the file
  is rewritten on inputs that are unchanged in every respect the digest covers.
- **It turns a concurrent write into a refusal.** `appTreeDigestOf` stats a
  directory entry and then reads it; a `git`/`npm`/editor write that unlinks the
  file in between raises `ENOENT` inside the walk. Nothing catches it in
  `buildDescriptor`, so it propagates: on the nightly per-job fire it reaches
  `verifyAndResolve`'s outer catch (`launcher.js:326-328`) and the dream refuses
  with `integrity check errored: …`; inside `catchUp` the per-job catch
  (`src/cli/run-job.js:1136-1145`) converts *any* `deriveDescriptorDigest` throw
  into the misleading *"it is authorized but no longer in your config"*. This is
  the defect that bites nightly, and it is the reason this WP exists — the I/O
  cost below is secondary.

### 6. Measured facts about the maintainer's dev install (2026-07-25)

- `~/.wienerdog/app/current -> /Users/gyulafeher/Documents/Claude_Projects/wienerdog` (a live checkout with a `.git` directory ⇒ dev stance).
- The hashed tree, measured by walking it with `appTreeDigestOf`'s own rules
  (recurse `isDirectory`, count `isFile`): **8,922** regular files — **3,341**
  under `.git/`, **4,905** under `node_modules/`, leaving **676** of product
  source and docs (3,341 + 4,905 + 676 = 8,922; `.git/` + `node_modules/` are
  **92.4%** of the hashing work). Three consecutive warm-cache passes measured
  **0.35 s / 0.57 s / 0.37 s**.
- **Pre-declaration: do not re-derive these numbers.** They are a snapshot of a
  **live working checkout** and drift by the hour as `.git` objects and scratch
  files come and go — a re-measurement an hour later legitimately differs by a
  file or two. That drift **is the defect**, not a measurement flaw. Quote these
  figures verbatim if you need them; do not compute a different number and leave
  two in the repo.

### 7. `docs/GLOSSARY.md:25` is falsified by this WP

The **job descriptor** entry ends its field list with `` the app release digest
(`appRelease`: `version`, `treeDigest`, `stance`) ``. That was already imprecise
on dev (it omits `root`, which the dev descriptor has recorded since ADR-0028
amendment #7) and Table A makes it flatly wrong. The same entry's separate
"**Dev reduction:**" sentence describes what the *digest* covers and stays true.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing (recorded, not left implicit).** One production edit of one ternary arm
plus its comment, two new tests, and one glossary parenthetical. **S** — well
under a session. It is not split further. `depends_on` is empty **by argument, not
by default** — one open WP does touch this file; see "Relationship to
`WP-stance-authority-containment`" in Implementation notes before assuming an
ordering.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/descriptor.js | **D1** — the dev `appRelease` arm drops `treeDigest` (Table A) and its comment is updated. No other change: `appTreeDigestOf`, `appTreeDigest`, the prod arm, `stance` derivation (`:186`), `canonicalize`, `reduceForDigest` and `descriptorDigest` are untouched. |
| modify | tests/unit/descriptor.test.js | **T1**, **T2** (Test index). The existing prod assertions at `:208-209` must stay **unmodified**. |
| modify | docs/GLOSSARY.md | **D2** — one parenthetical in the **job descriptor** entry (`:25`), exact wording in Implementation notes. No other entry, no other line. |

Not deliverables, deliberately: `src/scheduler/launcher.js`, `src/cli/schedule.js`,
`src/cli/run-job.js`, `src/core/vendor.js`, `tests/unit/launcher.test.js`,
`tests/unit/scheduler-schedule.test.js`, `tests/scenarios/a7-integrity/**`,
`docs/THREAT-MODEL.md`, `docs/runbooks/scheduler-and-executable-integrity.md`,
`docs/adr/0028-scheduler-app-executable-integrity.md`. See Out of scope for why
each is untouched. Several of them contain tests that must pass **unmodified** —
that is this WP's proof that nothing else moved.

### Exact contracts

`buildDescriptor(paths, job, opts)` keeps its signature and every other field.
Only the `appRelease` value changes, and only on dev (Table A):

```jsonc
// dev, BEFORE (efd1489)
"appRelease": { "version": "0.4.1", "treeDigest": "sha256:…", "stance": "dev", "root": "/Users/g/wienerdog" }
// dev, AFTER
"appRelease": { "version": "0.4.1", "stance": "dev", "root": "/Users/g/wienerdog" }
// prod, BEFORE and AFTER — byte-identical
"appRelease": { "version": "0.4.1", "treeDigest": "sha256:…", "stance": "prod" }
```

`descriptorDigest(d)` returns the **same string** for a dev descriptor before and
after, because `reduceForDigest` discards `appRelease` and rebuilds
`{stance, root}` (Current state §2). No re-minting, no migration, no
compatibility shim.

## Contract reference

**Activation (ADR-0031, 2-of-7):** two triggers fire, so the discipline is on.
(i) an on-disk **record shape** changes — the dev `appRelease` object loses a
field; (vii) the same field set is restated in five places (this spec's
Deliverables notes, its acceptance criteria, its verification grep,
`docs/GLOSSARY.md:25`, and ADR-0028's Decision §3 schema block plus its
2026-07-25 amendment). One canonical table below; every mirror is registered
under it.

### Table A — descriptor `appRelease` by stance (canonical)

| Stance | Fields written to `<core>/state/descriptors/<job>.json` | Fields the digest sees (after `reduceForDigest`) |
|--------|---------------------------------------------------------|--------------------------------------------------|
| `prod` | `{version, treeDigest, stance:'prod'}` — **unchanged** | all three |
| `dev`  | `{version, stance:'dev', root}` — **`treeDigest` removed** | `{stance:'dev', root}` — **unchanged** |

Two invariants the implementer must preserve, both of them the reason this WP is
safe:

1. `reduceForDigest` (`descriptor.js:249`) is **not** edited. Because it
   constructs `{stance, root}` fresh, removing `treeDigest` from the dev input
   provably cannot change any dev descriptor digest — **no dev per-job OS entry
   needs re-minting** (AC2).
2. The prod row is a *preservation* requirement, not a no-op: the prod arm still
   calls `appTreeDigest(paths)` and the prod `treeDigest` remains the value
   `launcher.js:309` compares against at every prod fire (Table E row 4).

### Mirrored Surface Checklist

Table A is the single place these facts are decided. Every surface that restates
them is registered below, so one finding updates all of them in one pass. **The
checklist deliberately extends past this spec's own text**: two of the surfaces
live in the repo, not in this file, and an unregistered out-of-spec mirror is
exactly how a contract goes stale (ADR-0031).

In this spec:

- [ ] Deliverables-table cell for `src/scheduler/descriptor.js`
- [ ] "Exact contracts" before/after JSON block
- [ ] Acceptance criteria **AC1** (the dev key set), **AC2** (digest invariance), **AC5** (the prod row)
- [ ] Verification grep **V5** (the dev arm no longer calls `appTreeDigest`)
- [ ] Current state §1 (the pre-change arm), §2 (`reduceForDigest`), §4 (who reads the field), §7 (the glossary defect)
- [ ] Out of scope → "The stance oracle at `descriptor.js:186`" — it restates §4's *write-only on dev* fact to bound what this WP does and does not change about the A7 stance exposure
- [ ] Implementation notes → "Migration" table
- [ ] Security checklist bullet 1
- [ ] Mutation checks (Table E) rows 1, 2 and 4
- [ ] Test index rows T1, T2

Out of this spec:

- [ ] `docs/GLOSSARY.md:25` **job descriptor** — its `appRelease` field list (a Deliverables entry; D2)
- [ ] `docs/adr/0028-scheduler-app-executable-integrity.md` — the Decision §3 descriptor schema block (`appRelease` shown with `treeDigest`) **and** the 2026-07-25 amendment — both its §1 (the corrected dev/prod field sets) and its §3 closing paragraph (which relies on the dev `treeDigest` being write-only to say this WP creates no exposure). **Not** a deliverable of this WP (owner-ratification surface; see Out of scope). Registered here so a later Table A change updates it too.

Not registered, and why: `docs/THREAT-MODEL.md` and
`docs/runbooks/scheduler-and-executable-integrity.md` describe the dev reduction
generically ("the app-code fingerprint is skipped on a developer checkout") and
never restate the written field set, so they are not mirrors of Table A.
`src/scheduler/launcher.js:309` **reads** `appRelease.treeDigest` but only on the
prod branch, which Table A leaves untouched.

## Implementation notes & constraints

### D1 — `src/scheduler/descriptor.js`

Change the dev arm of the `appRelease` ternary (`descriptor.js:212-219`) to
`{ version: readVersion(appRoot), stance: 'dev', root: appRoot }` per Table A, and
update the neighbouring comment so it says the dev arm **does not compute** a
tree digest — the current wording ("the digest reduces appRelease to …") is about
`reduceForDigest` and would read, after your edit, as if the field were merely
excluded from the digest rather than never computed. Say why in one clause:
hashing a live checkout is discarded work whose mid-walk `ENOENT` becomes a
refusal (Current state §5).

Do **not** touch the prod arm, `stance` derivation at `:186`, `reduceForDigest`,
`descriptorDigest`, `canonicalize`, `writeDescriptor`, or `appTreeDigestOf`.
`appTreeDigest`/`appTreeDigestOf` stay exported and unchanged — the prod arm,
`src/cli/schedule.js` and the tests all use them.

### D2 — `docs/GLOSSARY.md`: one edit, exactly (exact wording)

In the **job descriptor** entry (`:25`), replace the parenthetical

`` the app release digest (`appRelease`: `version`, `treeDigest`, `stance`) ``

with:

> the app release digest (`appRelease` — on **prod** `{version, treeDigest,
> stance}`; on **dev** `{version, stance, root}`, with **no** `treeDigest`
> computed or recorded)

Leave the entry's existing "**Dev reduction:**" sentence exactly as it is — it
describes what the *digest* covers (`reduceForDigest` → `{stance, root}`) and
Table A does not change that. The two statements are about different things (what
is written vs. what is digested) and both are true after the edit.

No other GLOSSARY entry changes. In particular leave **app release digest**
(`:27`), **independent launcher** (`:28`) and **production/dev stance** (`:30`)
alone: this WP changes neither the digest's definition, nor what the launcher
verifies on either path, nor the stance concept.

### Why the digest's *scope* is not the fix (read before changing your mind)

The obvious reading of "hashing the checkout is expensive and unstable" is that
`appTreeDigestOf` should exclude `.git/` (or `node_modules/`). **Do not do this.**
It is not in the Deliverables table and it is the wrong repair:

1. **It would not make anything stable.** With `.git/` excluded, the digest still
   covers every product file, every doc, and every untracked scratch file in a
   *live working checkout*. Exclusion converts "changes on the next `git commit`"
   into "changes on the next file save".
2. **`node_modules/` exclusion would change nothing anywhere.** It is not in a
   prod tree (`src/core/vendor.js:7` `COPY_INCLUDE = ['bin', 'src', 'skills',
   'templates', 'package.json']`, commented *"NEVER copies node_modules or
   .git"*), and the single ADR-approved runtime dependency is not loaded from the
   hashed tree: `googleapis` resolves only from
   `<core>/app/deps/node_modules/googleapis` by direct-path construction with a
   realpath containment check and **no ancestor walk** (`src/gws/deps.js:25`
   `depsDir` = `<core>/app/deps`; `:40-41` `depsPresent`; `:46` the "no ancestor
   walk" rationale). `<core>/app/deps` is a **sibling** of `app/current`, outside
   the walked tree.
3. **Git-derived scoping would weaken prod.** Deriving scope from `.gitignore` /
   `.git/info/exclude` / `git ls-files` makes prod integrity depend on files at
   exactly the scoped-write surface A7 defends against — one appended line hides a
   planted file from the digest. The launcher also cannot consult `git` without
   breaking its builtins-only self-containment (`launcher.js:36-39`).
4. **After this WP there is nothing left to stabilise.** No dev code path
   content-addresses the tree, so the instability the exclusion was meant to cure
   does not exist on dev, and on prod it never existed. The change would be pure
   unused mechanism.

`appTreeDigestOf` therefore stays **git-agnostic**: every regular file under
`app/current`, tracked or not, no `.gitignore`, no `.git/index`, no `git`
subprocess.

### Migration — what happens to everything already pinned

| Already-bound artifact | After this WP, **before** any `sync` | After one attended `wienerdog sync` |
|---|---|---|
| prod per-job `--expect-digest` | identical value, still verifies | identical |
| **dev** per-job `--expect-digest` | identical value, still verifies (Table A: `reduceForDigest`'s output cannot change) | identical |
| prod catch-up anchor | identical value, still verifies | identical |
| **dev** catch-up anchor | still a stale `sha256:…`; a dev install fails containment first and refuses — **exactly as today, no change either way** | re-minted, still refuses on containment — unchanged by this WP |
| prod descriptor file | identical bytes | identical bytes |
| **dev** descriptor file | stale (still carries `treeDigest`); no dev code path reads it (Current state §4) and its digest is unaffected | rewritten without it, then byte-stable across source edits |

So: **nothing is re-minted, nothing newly fails closed, and no user action is
required.** A dev user who never runs `sync` keeps a stale `treeDigest` in a file
nobody reads, with an unchanged digest.

### Relationship to `WP-stance-authority-containment`

Another architect is drafting **`WP-stance-authority-containment`**: it replaces
the forgeable stance oracle (`.git` / `WIENERDOG_DEV`) with realpath containment
inside `<core>/app` — the discriminator an attacker cannot forge by writing *into*
the tree (`src/core/vendor.js:200-206`). It is the assigned fix for the violation
ADR-0028's 2026-07-25 amendment §3 records. **You are not implementing it and you
are not waiting for it.** `depends_on` is deliberately empty:

- **It is not an ordering dependency.** That WP will edit `descriptor.js:186`
  (the `stance =` line); D1 edits the `appRelease` ternary at `:212-219`. Different
  hunks of one file — whichever merges second rebases without conflict. Neither
  WP's tests touch the other's assertions.
- **Blocking would buy no security.** D1 removes a field that was already
  write-only on dev; the dev fire's enforcement set is byte-for-byte the same
  before and after (Current state §2, §4). Holding it would leave the live defect
  — a concurrent `git`/`npm` write turning the nightly **dream** into
  `integrity check errored: …` (Current state §5) — in place for zero gain.
- **The gate is the ADR, not this merge.** The amendment is `Proposed` and
  unsigned; ratifying it is where the owner rules on the violation's disposition.
  Merging this WP does not ratify anything and must not be cited as doing so.

If that WP lands first, nothing here changes: dev is still dev, and a dev
descriptor still has no reason to content-address its tree.

### General

- No new npm dependencies; plain Node ≥ 18; JSDoc only, no TypeScript, no build step.
- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope to resolve it.

## Security checklist

- [ ] **No verification is removed, reordered or weakened on either stance.** On
      prod, `appRelease.treeDigest` is still written and still compared at
      `launcher.js:309` (Table A prod row, AC5, Table E row 4). On dev, the field
      removed was never digested and never read (Current state §2, §4), so the
      set of things a dev fire enforces is **identical** before and after: the
      dev-reduced descriptor digest, the bound checkout root, and dev liveness.
- [ ] **No new stance signal is introduced, and none is fixed.** This WP does not
      add, move or read any input that decides prod-vs-dev: it deletes a computed
      field on a branch whose condition (`descriptor.js:186`) it does not touch.
      **This is not an all-clear.** The durable rule ADR-0028's 2026-07-25
      amendment proposes — *stance must never be selected by a signal that lives
      inside the A7-writable tree* — is **violated by the shipped per-job dev
      path**, which that amendment's §3 records as unresolved and assigns to
      `WP-stance-authority-containment`. This WP neither causes nor worsens it
      (the removed field was write-only on dev) and neither closes it. Do not
      cite this WP as evidence that the dev path is safe.
- [ ] **Nothing untrusted flows anywhere new.** No new value reaches a filesystem
      path, a `require`, or a shell command; the edit only *removes* a call.
- [ ] **The dev digest is provably unchanged**, so no OS entry silently starts
      accepting a descriptor it previously refused (AC2).
- [ ] No daemon, watcher, poller or background process is introduced (ADR-0004);
      the launcher still runs and exits with each fire.

## Acceptance criteria

**Preamble — a test that passes against unmodified `main` is not evidence.**
Every new test below must be demonstrated **red before the fix and green after**,
and every row of Table E (Mutation checks) must be demonstrated red. Paste both
sets of output into the PR body. A *new* verification command that cannot fail is
a defect in this WP, not a pass. (Preservation checks are the deliberate
exception — see the Verification preamble.)

- [ ] **AC1 (dev descriptor: no tree digest).** A dev descriptor's `appRelease`
      has keys exactly `version`, `stance`, `root` — asserted with
      `assert.deepEqual(Object.keys(d.appRelease).sort(), ['root','stance','version'])`,
      not with a `treeDigest === undefined` check, so an added field also fails.
      (T1)
- [ ] **AC2 (dev digest is provably unmigrated).** For a dev install,
      `descriptorDigest(d)` equals `descriptorDigest({...d, appRelease:
      {...d.appRelease, treeDigest: 'sha256:' + '0'.repeat(64)}})` — injecting a
      `treeDigest` back cannot change the digest, so no dev entry needs
      re-minting. (T1)
- [ ] **AC3 (dev derivation reads no source).** `deriveDescriptorDigest` on a dev
      install reads **no** file under `app/current` matching
      `/(^|\/)(src|bin|node_modules|\.git)\//`, and reads fewer than 10 files
      under the app tree in total. Instrumented at runtime — see the note under
      the Test index. (T2)
- [ ] **AC4 (dev descriptor idempotency).** `writeDescriptor` on a dev install
      returns `changed:false` and leaves byte-identical file contents when called
      again after appending a byte to a tracked source file under the checkout.
      (T2)
- [ ] **AC5 (prod unchanged).** The existing prod assertions pass **unmodified**:
      `tests/unit/descriptor.test.js:208-209` (a prod `appRelease` still carries a
      `sha256:` `treeDigest` and `stance:'prod'`) and
      `tests/unit/scheduler-schedule.test.js:1194` (the descriptor written by
      `schedule add` on a `.git`-free tree still carries one). Neither assertion
      may be edited; `scheduler-schedule.test.js` is not even a deliverable.
- [ ] **AC6 (the duplication invariant survived).** `tests/unit/launcher.test.js:211`
      and `:224` — the digest-equality guard between the two `appTreeDigestOf`
      copies — pass **unmodified**, and V6 prints `identical sha256:…` **and
      exits 0** (it throws on inequality, so exit 0 is the assertion, not the
      word).
      `tests/unit/launcher.test.js` is not a deliverable, so any edit to it is a
      Deliverables violation.
- [ ] **AC7 (mutation matrix).** Every row of Table E was demonstrated red;
      output pasted in the PR.

### Table E — Mutation checks (each row: apply the mutation to the fixed tree, the named test must turn RED)

| # | One-line source mutation | Test that must go red |
|---|--------------------------|-----------------------|
| 1 | `descriptor.js`: re-add `treeDigest: appTreeDigest(paths)` to the **dev** arm | T1 (AC1), T2 (AC3, AC4) |
| 2 | `descriptor.js reduceForDigest`: spread `d.appRelease` instead of constructing `{stance, root}` | T1 (AC2) |
| 3 | `launcher.js appTreeDigestOf`: change `pairs.push([childRel, …])` to `pairs.push([e.name, …])` — a **semantic** divergence | existing `tests/unit/launcher.test.js:211` / `:224` (unmodified) + **V6** |
| 4 | `descriptor.js`: remove `treeDigest` from the **prod** arm too | existing `tests/unit/descriptor.test.js:208` and `tests/unit/scheduler-schedule.test.js:1194` (both unmodified) |

Two notes, because two of these rows are subtle:

- **Row 3 must be semantic, not "one byte".** "Change one byte inside
  `appTreeDigestOf`" does **not** turn those tests red if the byte is in a
  comment — the two copies already differ in comments (Current state §3) and the
  tests compare **digests**. `childRel` → `e.name` changes the digest of any tree
  with a nested file, which the `:224` fixture has (`sub/dir/deep.json`).
  **`launcher.js` is not a deliverable — revert this mutation before committing**
  (Definition of done 6 is the proof). Executed at `efd1489`: unmutated ⇒
  `identical sha256:4de344d153248682accd1443815d78b85e0395f297b0f1f05d2e43b2d281bda3`,
  **exit 0**; mutated ⇒ `Error: DIVERGED launcher=sha256:9eb40e34d6cd…
  descriptor=sha256:4de344d153…`, **exit 1**. Report the exit code; the printed
  word alone is not the verdict.
- **Row 4 is what stops the edit over-reaching.** Rows 1-2 prove the dev change
  happened; row 4 proves it did **not** happen on prod. Without it, an
  implementer who deleted `treeDigest` from both arms would pass AC1-AC4 and ship
  a silent prod integrity regression.

### Test index (what to write, and where)

| id | File | What it drives |
|----|------|----------------|
| T1 | tests/unit/descriptor.test.js | a dev fixture's `appRelease` key set (AC1); `descriptorDigest` invariance to an injected `treeDigest` (AC2) |
| T2 | tests/unit/descriptor.test.js | instrumented `fs.readFileSync` during a dev `deriveDescriptorDigest` (AC3); dev `writeDescriptor` idempotency across a tracked-source edit (AC4) |

The file already has a dev fixture idiom — the test at
`tests/unit/descriptor.test.js:138-147` ("a dev descriptor digest ignores
tracked-source edits but drifts on ANY config-field edit") builds one with
`fs.mkdirSync(path.join(paths.core, 'app', '0.0.1', '.git'))`. Reuse that idiom
rather than inventing a second, and do **not** modify that test.

Instrumentation note for T2: `descriptor.js` calls `fs.readFileSync` as a
property lookup on the `node:fs` module object, so a test can wrap
`require('node:fs').readFileSync` with a recording shim and restore it in a
`finally`. That is the exact runtime gate for AC3 — far stronger than a textual
grep, and it turns red the instant anyone re-adds tree hashing.

## Verification steps (run these; paste output in the PR)

Run everything from the repo root. **Every command below was executed against
unmodified `main` at `efd1489` while this spec was written; the "on `main`" line
under each one is its real output there.**

**Three rules, and they are not the same rule.**

1. **Change checks** must print something different after the fix than they do on
   `main`. **V2 and V5 are change checks.** In particular V2's `main` count of
   `ℹ pass 117` is a **FAILURE** after implementation — T1 and T2 add tests, so a
   run that still reports 117 means the only new direct evidence for AC1–AC4 was
   never written. A change check whose `main` output is already its success output
   is a defect in this WP; say so rather than pasting it.
2. **Preservation checks** assert that something did *not* move, so they are
   *supposed* to print the same thing before and after. The carve-out covers
   **exactly three results: V1's `ℹ fail 0` line, V3, and V6** — and nothing else.
   V1's `ℹ pass` count is emphatically **not** covered; it is V2's input. Do not
   "fix" a preservation check by making it fail on `main`.
3. **Exit status is the verdict for V1, V3 and V6 only.** V6 earns that by
   construction: it **throws** on divergence, so a mutation makes it exit non-zero
   rather than merely printing a scary word. **V2 and V5 are judged by reading the
   printed output** — `grep` exits 0 whether it prints two lines or three, and V2
   is a count comparison rather than a command at all. Never report an exit 0 from
   those two as a pass.

V4, V7 and V8 were deleted in round 3 with the dev catch-up branch they proved.
The numbering is left gapped on purpose so every surviving command keeps the
identity under which its `main` output was recorded.

```bash
# V1 (preservation of `fail 0`; its `pass` count feeds V2) — the touched unit
#      file plus the three files whose
#      assertions must survive unmodified, by explicit path (never
#      --test-name-pattern: a pattern that matches nothing exits 0 and proves
#      nothing). MUST go through `npm test --`, NOT a bare `node --test`:
#      tests/run.js sets WIENERDOG_TEST_NO_REAL_SCHEDULER=1 for the whole suite,
#      and without it scheduler-schedule.test.js fails against the real OS
#      scheduler.
npm test -- tests/unit/launcher.test.js tests/unit/descriptor.test.js \
            tests/unit/scheduler-schedule.test.js tests/unit/a7-integrity-negatives.test.js
# on main (executed at efd1489):
#   ℹ tests 120 / ℹ suites 0 / ℹ pass 117 / ℹ fail 0 / ℹ skipped 3
# `ℹ fail 0` is the preservation result and must stay 0. (Bare `node --test` on
# the same files gives 'ℹ fail 1' — "repointSchedules after add is a no-op".)

# V2 (CHANGE — anti-vacuity; judged by reading, not by exit status) — this repo's
#      Node (v25) prints the *spec* reporter, not TAP: the summary lines are
#      'ℹ tests N' / 'ℹ pass N' / 'ℹ fail N'. Paste those three verbatim from V1.
#      REQUIRED: `pass` strictly greater than 117 and `fail` exactly 0.
#      `ℹ pass 117` after implementation is a FAILURE of this step, not a pass:
#      T1 and T2 are the only direct tests of AC1-AC4, so an unchanged count means
#      they are missing. Do not invoke the preservation carve-out here — it covers
#      V1's `fail` line, V3 and V6, and explicitly not this count.

# V3 (preservation) — full suite + lint.
npm test
npm run lint
# on main (executed at efd1489):
#   npm test  -> ℹ tests 1671 / ℹ suites 0 / ℹ pass 1666 / ℹ fail 0 / ℹ skipped 5
#   npm run lint -> 'Summary: 0 error(s)' / 'frontmatter check passed' /
#                   'lint passed'
# Both must still be clean after the fix, with `pass` risen by the T1/T2 tests.
# If lint reports an error in a docs/specs/WP-*.md that is NOT one of this WP's
# three deliverables, it belongs to another architect's in-flight spec sharing
# your working tree — report it under "Discovered issues", do not fix it, and do
# not let it mask an error in a file you own.

# V5 (change) — the DEV arm of the descriptor no longer calls appTreeDigest.
#      Expected AFTER the fix: exactly TWO matching lines — the helper
#      definition and the prod arm. Paste them and confirm neither is inside the
#      `stance === 'dev'` arm.
grep -n 'appTreeDigest(paths)' src/scheduler/descriptor.js
# on main: THREE lines — 72 (the helper), 217 (the dev arm), 218 (the prod arm).

# V6 (preservation; EXIT STATUS is the verdict) — the two appTreeDigestOf copies
#      still agree. The invariant is DIGEST EQUALITY, not textual identity (the
#      bodies already differ in comments — Current state §3), so compare what the
#      two functions RETURN over a hostile-named tree. Two guards make it a real
#      oracle, and BOTH are load-bearing: the shape check (a previous version
#      silently compared two EMPTY strings and printed 'identical') and the
#      inequality THROW. Do not soften the throw back into a printed 'DIVERGED'
#      with exit 0 — that was the round-2 defect: two different valid digests
#      printed a scary word and still exited 0, so the command could not turn red.
node -e "
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const L=require('./src/scheduler/launcher'), D=require('./src/scheduler/descriptor');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'wd-v6-')));
for (const n of ['a.txt','ünï.md','q\".js','new\nline.txt',path.join('sub','dir','deep.json')]) {
  const f=path.join(root,n); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,'x-'+n);
}
const a=L.appTreeDigestOf(root), b=D.appTreeDigestOf(root);
fs.rmSync(root,{recursive:true,force:true});
const ok=/^sha256:[0-9a-f]{64}\$/;
if(!ok.test(a)||!ok.test(b)) throw new Error('ORACLE BROKEN: '+a+' / '+b);
if(a!==b) throw new Error('DIVERGED launcher='+a+' descriptor='+b);
console.log('identical '+a);"; echo "exit=\$?"
# on main (executed at efd1489):
#   identical sha256:4de344d153248682accd1443815d78b85e0395f297b0f1f05d2e43b2d281bda3
#   exit=0
# under Table E row 3 (executed against a patched COPY of launcher.js, so the real
# file stayed untouched): stderr `Error: DIVERGED
#   launcher=sha256:9eb40e34d6cd3fb72d0dbbfc320c97b6acb81f9791cd31656aa197383f54c700
#   descriptor=sha256:4de344d153248682accd1443815d78b85e0395f297b0f1f05d2e43b2d281bda3`
#   and exit=1. Report the exit code, not just the text.
```

## Out of scope (do NOT do these)

- **Dev catch-up. Do not add a dev branch to `verifyCatchup`, and do not make
  `catchupExpectDigest` stance-shaped.** This was proposed in rounds 1-2 of this
  WP and **rejected by the owner on 2026-07-25** after both review legs
  demonstrated it against real code. The short form: any dev catch-up branch must
  decide "is this install dev?" from something, and every candidate signal —
  `env.WIENERDOG_DEV`, an on-disk `.git` — is an **A7-scoped write**, so an
  attacker who can perform one gets a mint that skips the tree hash entirely.
  Planting `.git` into a prod app tree **before** the attended sync makes the mint
  itself classify prod as dev, and the per-job digest map cannot backstop it
  because the map's enforcement runs inside the same unverified app code. Today
  that same plant-then-sync re-mints a `sha256:` anchor *covering* the planted
  file, so the tree is pinned from that moment and further tamper refuses — i.e.
  **the shipped code is safe and the proposal would have regressed it**. Catch-up
  keeps refusing on a dev install, which is WP-157's original disposition. The
  full argument and both attack orderings are recorded in ADR-0028's 2026-07-25
  amendment; read it before proposing anything adjacent.
- **`src/scheduler/launcher.js`, in any form.** In particular its `verifyCatchup`
  doc comment (`:331-351`) is **not** to be edited here. Two observations for the
  record, neither of them work for this WP: its sentence *"There is deliberately
  **NO** dev early-return"* (`:335-336`) is **true** and stays true — this WP adds
  none; and its clause *"but NOT per-job descriptor authorization (that is
  WP-catchup-per-job-authorization)"* (`:334-335`) is stale, because that WP is
  **Done**. That staleness predates this WP, is not caused by it, and belongs to
  whoever next owns `launcher.js`.
- **Excluding `.git/`, `node_modules/`, or any other path from `appTreeDigestOf`,
  in either copy**, and **any git-derived file selection** (`.gitignore`,
  `git ls-files`, `.git/index`). Defended at length in Implementation notes.
- **The stance oracle at `descriptor.js:186`.** It calls
  `isDevCheckout(appRoot, env)` (`src/core/vendor.js:30-36`), so **either** an
  ambient `WIENERDOG_DEV=1` **or** a `.git` planted in a prod app tree makes a
  per-job descriptor claim `dev` stance on a prod tree. Do **not** change that
  line and do **not** add an `env` parameter anywhere.
  **Be clear about what that exposure is, because an earlier draft of this spec
  understated it.** The dev arm of `verifyAndResolve` checks `liveDev`,
  bound-root equality and `reDeriveDigest(...) === o.expectDigest`
  (`launcher.js:288-299`) — **config fields only; it never hashes the tree**
  (`appTreeDigestOf` is called on the prod branch alone, `launcher.js:308`). Nor
  is `reDeriveDigest` independent: it `require`s its derivation modules *from the
  live tree* (`launcher.js:240-248`), which on dev is unverified. So a dev fire
  enforces **nothing** about app code, and plant-`.git`-then-`sync` is a real path
  to that state. This is **pre-existing and not caused by this WP** — the
  `treeDigest` D1 removes was already write-only on dev (Current state §4), so the
  set of things a dev fire enforces is identical before and after. It is recorded
  as an unresolved violation in ADR-0028's 2026-07-25 amendment §3, whose fix is
  **`WP-stance-authority-containment`** (another architect; do not write it, do
  not wait for it — see "Relationship to `WP-stance-authority-containment`").
- **`run-job.js`'s misleading catch-up refusal message.** `catchUp`
  (`run-job.js:1136-1145`) converts *any* `deriveDescriptorDigest` throw into
  *"it is authorized but no longer in your config"*. This WP removes the most
  common cause of that throw on dev; the mislabelling itself remains. Separate WP.
- **`<core>/app/deps/node_modules/googleapis` integrity.** Covered by no anchor
  today, including on prod; a swapped `googleapis` is undetected. Real,
  pre-existing, unchanged by this WP, and it needs its own WP.
- **The catch-up status probe and the harness leak guard.** The reason catch-up
  had been failing hourly is neither defect here: its loaded launchd record had
  been hijacked by a leaked test fixture, so it ran a deleted path with
  `MODULE_NOT_FOUND`. The status probe checks *presence* not *identity*, and the
  harness leak guard scans plist files rather than loaded records. Those two blind
  spots are being specced as a separate P0 WP by another architect — do not touch
  them.
- **`docs/THREAT-MODEL.md` and `docs/runbooks/scheduler-and-executable-integrity.md`.**
  Both describe the dev reduction generically and neither restates the written
  field set, so no doc edit is owed. If review disagrees, that is a doc WP.
- **`docs/adr/0028-scheduler-app-executable-integrity.md`.** Its 2026-07-25
  amendment is already drafted and marked **PENDING OWNER RATIFICATION**. Do not
  edit it, do not mark it Accepted, and do not sign the approval line.

## Definition of done

1. All verification steps (V1, V2, V3, V5, V6) pass locally; output pasted into
   the PR body, including the Table E mutation runs (all **four** rows, each shown
   red) and the V2 `ℹ tests / ℹ pass / ℹ fail` counts.
2. The PR body states, in one line each: **V5 printed three lines on `main` and
   two after the fix**; **V2's `ℹ pass` is strictly greater than 117** (117 would
   be a failure); and **V1's `ℹ fail 0`, V3 and V6 printed the same result before
   and after** — that last one is the preservation claim and it is a pass, not a
   defect. V6's line must include its exit status.
3. Conventional commits; PR titled
   `fix(scheduler): dev descriptor stops hashing the live checkout (WP-dev-descriptor-no-tree-hash)`.
4. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.
6. The PR body confirms that `tests/unit/launcher.test.js`,
   `tests/unit/scheduler-schedule.test.js` and every file outside the three-row
   Deliverables table are **untouched** — `git diff --stat` pasted as the proof.
