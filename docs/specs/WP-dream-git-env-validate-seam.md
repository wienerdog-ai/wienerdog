---
id: WP-dream-git-env-validate-seam
title: Give the dream's second git spawn point the same constructed environment
status: In-Review
model: sonnet
size: S
depends_on: [WP-dream-git-env-pinning]
adrs: [ADR-0004, ADR-0012, ADR-0031, ADR-0042]
epic: dream-promotion
---

# WP-dream-git-env-validate-seam: the `assertGitRepo` spawn point

> **Provenance.** This WP matures the Draft stub created 2026-09-05 by
> `WP-dream-git-env-pinning`'s design pass as that WP's **named residual, owner
> item O2**. The product decision it extends — an environment built from a named
> allowlist rather than inherited — is already recorded in
> `docs/specs/done/WP-dream-git-env-pinning.md` and in ADR-0012's 2026-09-05
> amendment. Open here, and settled below under the standing process of
> `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`: whether
> that decision reaches the second spawn point, and what the guard's precondition
> is. The predecessor's O2 and its "Out of scope" bullet stay as the record of why
> this was a successor rather than a fold-in; neither is rewritten, and that spec
> is **not** a Deliverable here.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): it writes configuration into a user's setup
and starts nothing that outlives its job. The **dream** is its nightly run —
`wienerdog dream`, scheduled by the OS or typed by hand — which consolidates
recent session transcripts in a workspace outside the vault, promotes approved
notes into the user's markdown vault, and publishes **one git commit** there.

The dream run spawns git from **three** modules, and naming all three is the
point — an inventory that says "two" is what a reviewer catches. **(1)** The
pipeline's nine pinned shapes go through `gitIn` in `src/cli/dream.js`; since
`WP-dream-git-env-pinning` landed those run under an environment built key by
key from a named allowlist — **that spec's Table U is canonical for the channel
set, and this spec restates none of it.** **(2)** `src/core/dream/promote.js`'s
`spawnGitForMerge` runs the three-way merge under `constructMergeEnv`, an
environment already **built from nothing** for its own reasons; Table W row
W1(c)(ii) names it as the second un-seamed dream-path spawn, and it is **out of
scope here** (see Out of scope). **(3)** `src/core/dream/validate.js`'s
module-private `git()`, which still passes `env: process.env`, is this WP's
subject. `assertGitRepo(vaultDir)` (`src/cli/dream.js:587`) reaches it on
**every** dream and is the dream path's only caller of it (Table J).

**So the guard's verdict is currently the launching shell's, not the vault's.**
Measured on the real code path (VS-P1): with `GIT_DIR` exported to a real
repository elsewhere, `assertGitRepo` **accepts** a directory that is not a
repository at all. The pin bounds the consequence rather than closing it — the
pipeline's calls no longer follow the redirection, so a wrongly-passing guard
costs a late, loud failure at `rev-parse HEAD` instead of the early, friendly
*"vault is not a git repository — run `npx wienerdog init` first"*.

**A second, separate item, and it is not an environment question at all.**
`assertGitRepo` establishes that the vault is **INSIDE** a repository, not that
it **IS** one: from a directory that is not a repository but lies within one,
`rev-parse --git-dir` resolves the **ancestor** — measured with no `GIT_*`
variable involved at all (VS-P2 arm (c)), so this is discovery, not inheritance,
and the pin does not touch it. Owner item **O5** decides it.

## Current state

**THE PINNED BASE IS `8358655d41f997e8da05a39ec6b2851d05785480`**, stated here
once and cited everywhere else. Every measurement below, Table J's cells, VS-P7's
re-measurement and the Table W amendment's claim were taken against it, and V4
takes its diff of the prescribed lines against it.

**V4's guard on that base compares CONTENT, not SHAs**, and the distinction is
load-bearing rather than pedantic: `src/core/dream/validate.js` and
`src/core/dream/git-env.js` must be **byte-identical between the pinned base and
`git merge-base origin/main HEAD`**. The two subjects are exactly the files the
measurements rest on — Table J's rows are `validate.js`'s call sites, and row J0
calls `buildGitEnv`, which is `git-env.js`'s. What the guard exists to catch is
an **upstream change to those files sliding under a rebase**, which is when row
W1(c)(i)'s standing trigger should force re-review rather than go quiet; a
`main` that moved for unrelated reasons is not that. **A SHA-equality form of
this guard was unsatisfiable by construction** and the dispatch-time gate caught
it (finding D1): the Ready PR itself advances `main`, and the implementer must
branch AFTER it to have this spec in the tree, so the merge-base is never the
measured SHA on any honest implementation branch. If the CONTENT differs,
re-derive Table J, re-run VS-P7 against the new base, and update this SHA;
dispatch-time re-verification runs exactly that content check.

- **`src/core/dream/validate.js:64-81` — the module-private `git()`.** It
  spawns through the pinned front door
  (`spawnPinnedSync('git', getPaths(), { args: ['-C', vaultDir, ...args], env: process.env, … })`),
  throws a `WienerdogError` on a non-zero exit unless `opts.allowFail` is set,
  and is **the only thing in this file that spawns anything**. `env:
  process.env` is the one line this WP changes. Its four call sites, and who
  calls each on the dream path: Table J.
- **`src/core/dream/git-env.js:26-41` — `buildGitEnv(indexFile?)`**, created by
  `WP-dream-git-env-pinning`: a fresh object built key by key from **Table U's
  CARRIED rows — U1, U2, U4/U4b and U5 — which are canonical there and are NOT
  reproduced here** (an earlier draft copied the key set and was a Table U mirror
  nobody had registered). **This WP's own local fact is the call**:
  `buildGitEnv()` is invoked with **no argument**, which by row U5 means the call
  carries no `GIT_INDEX_FILE`. Measured on this host the resulting map is
  `{HOME, PATH}` (VS-P2) — an observation of this host's Table U, not a
  restatement of it.
- **`src/core/exec-identity.js:554-558`** — `spawnPinnedSync` uses the `env` it
  is given both to resolve the pinned executable (`:556`) and as the child's
  environment (`:558`, through `passthroughSpawnOpts`).
  `buildGitEnv` carries `process.env.PATH` verbatim, so pin resolution and the
  WP-154 drift refusal are unaffected: the fake-`git`-on-PATH assertion at
  `tests/unit/dream-validate.test.js:1386` keeps its meaning.
- **`src/cli/dream.js:29` and `:587`** — `assertGitRepo` is imported and called
  once, before the lock, as a read-only fail-fast check. The three names
  imported beside it reach no git.
- **`tests/unit/dream-validate.test.js:1485` — `stubCollaborators(patches)`**,
  and **`:1506-1513` — `stubSpawn(handler)`**, which is already built on it and
  already patches `spawnPinnedSync` on `EXEC_IDENTITY_ID`, re-requiring
  `validate.js` through the cache and handing the stub `opts.args`. **AC2's
  complete-argv capture needs no new seam** — this is the one it uses, and a
  round-1 channel confirmed by execution that it intercepts this spawn.
- **`tests/red-proofs/*.proofs.json` — a declaration file is per WORK PACKAGE,
  not per suite.** Measured: `ledger-parser-corpus.proofs.json` and
  `quarantine-preserve-durability.proofs.json` both already declare
  `"suite": "tests/unit/dream-validate.test.js"`. The runner
  (`scripts/red-proofs.js`) imposes no one-file-per-suite rule, so the stub's and
  O2's parenthetical "(one declaration file per suite)" is **withdrawn** as a
  round-zero finding, and this WP adds a file of its own.
- **`src/cli/adopt.js:79-83` — `isGitRepo(dir)` is `rev-parse --git-dir`**, the
  same predicate as the guard's, so adopt reads "inside a repository" as
  "already a repo" and skips its `git init`. `src/core/vault.js:118` uses the
  same predicate on the init path.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | Exactly **two added code lines and one removed** (Exact contracts, "The two lines"; V4 is the gate): the `require('./git-env')` line, and `env: buildGitEnv(),` replacing `env: process.env,` in `git()` (Table J, row J0). Comment-only changes are additionally allowed and are exactly two: `assertGitRepo`'s JSDoc gains the decided precondition (row J5), and **the stale sentence in the `module.exports` block that says the tests use `assertCleanTree` to build fixtures is corrected** — measured false (VS-P8), and correcting it here rather than routing it is authorized because this file is already in the boundary. **No argv changes and no call site added or removed** — rows J1–J4 |
| modify | tests/unit/dream-validate.test.js | assertions covering AC1–AC3 (the implementer designs the cases) |
| create | tests/red-proofs/dream-git-env-validate-seam.proofs.json | this WP's ONE RED declaration (Exact contracts below); `suite` is `tests/unit/dream-validate.test.js` |
| modify | docs/specs/done/WP-dream-promote-in-workspace.md | a dated amendment **INSIDE Table W row W1(c)(i) and nowhere else**, opening with the exact sentence fixed in the Mirrored Surface Checklist. Row W1's surrounding text — the hook residual, both named rejections, (c)'s COVERAGE clause and every existing line citation — stays **byte-intact and un-renumbered** |

### Exact contracts

**The environment.** `git()` passes `env: buildGitEnv()` — **no argument**, so
no `GIT_INDEX_FILE`. `buildGitEnv` is required from
`src/core/dream/git-env.js` and is **not** re-implemented, wrapped, extended or
given a second allowlist: `WP-dream-git-env-pinning`'s Table U stays canonical
for the channel set and this WP adds no row to it and no second construction of
it. `validate.js` already requires `getPaths` from `../paths`, so the new
`require` adds no package dependency (CLAUDE.md: zero runtime dependencies).

**The guard's precondition, which `assertGitRepo`'s JSDoc must state** (row J5;
the wording is the implementer's, the content is not): *`vaultDir` is asserted
INSIDE a git repository — what `rev-parse --git-dir` establishes and all it
establishes. A vault directory that is not itself a repository but lies within
one PASSES, and the run then targets that ancestor. Decided by owner item O5,
reachable through `wienerdog adopt` today, and named here rather than left
implied by what the guard happens to check.*

**The two lines, and they are the whole code change.** Against the pinned base,
`src/core/dream/validate.js` gains exactly these two non-comment lines and loses
exactly one, byte-exact including indentation:

```text
ADDED    +const { buildGitEnv } = require('./git-env');
ADDED    +    env: buildGitEnv(),
REMOVED  -    env: process.env,
```

**V4 checks that these three landed and NOTHING MORE — it is a completion and
presence screen, blind to whatever else the diff contains, and it says so.** Two
consecutive rounds landed findings on textual forms of this check that claimed to
exclude additions and did not (a literal count missed a multi-line fifth call; a
line-prefix comment filter missed `/* c */ git(…)`), so the check stopped
claiming exclusion rather than being patched a third time. **Where the
no-added-spawn invariant is actually established: AC2**, which observes that
`assertGitRepo` performs exactly ONE spawn, and **wd-reviewer's whole-diff read
of `validate.js`**, which AC5 names. Rows J2–J4 have no dream-path caller
(Table J), so a hidden addition there is inert on the run and the reviewer's read
is the proportionate check for it.

**The Table W amendment** (Deliverables row 4). It opens with this sentence,
byte-exact:

```text
**AMENDED 2026-09-06 — THE STANDING TRIGGER'S SUBJECT IS THE SHAPE, AND THE SUCCESSOR CHANGES NO SHAPE.**
```

and must state, nothing more being required of it: that this clause's standing
trigger has as its subject the **SHAPE** — the argv and the call-site set, which
is what the row's own tenth-shape reasoning is about; that
`WP-dream-git-env-validate-seam` changes **no shape and adds no call**, observed
at the spawn by AC2 (exactly one spawn from `assertGitRepo`, with the complete
argv) and read whole-diff by wd-reviewer, rather than asserted by assurance; that
the
**environment** of the existing invocation is now constructed rather than
inherited, per ADR-0012's amendment of 2026-09-05, which is the decision this
successor extends and not a new one; and that **the election's admissibility
measurement was RE-MEASURED under that constructed environment and holds** —
`rev-parse --git-dir` issued from a stale-stat index leaves `.git/index`
byte-identical, with a `status --porcelain` positive control in the same state
moving it (probe **VS-P7**, `WP-dream-git-env-validate-seam`'s design-gate
record). **Nothing else in row W1 is rewritten.**

**The one RED declaration.** Its `id` and `criterion` are fixed here so AC4 can
name them without a repo-wide count; the mutation literal, the marker and the
`expectRed` identities are the implementer's.

| id | reintroduces | must redden |
|----|--------------|-------------|
| `validate-git-inherits-git-dir` | `GIT_DIR` inheritance at `validate.js`'s `git()` | the **AC1** assertion |

`wp` is `WP-dream-git-env-validate-seam`; `criterion` is `1`.

**Only AC1 is in that set, and that is a contract statement rather than an
omission.** `scripts/red-proofs.js` requires the observed own-body failing set
to EQUAL the declared set, so a criterion that only *might* redden cannot be
declared. AC2 is the structural map assertion and AC3 is the nested-vault pair;
neither exports `GIT_DIR`, so neither reddens under this mutation.

## Contract reference

**ADR-0031's activation trigger fires: three of the seven are true.** (iv)
precedence behaviour changes — which environment this spawned call obeys; (v) the
task crosses an authority boundary — the launching environment versus the run's
own act, and the guard's verdict versus the vault's actual shape; (vii) the same
contract appears in mirrored surfaces — this spec, `assertGitRepo`'s JSDoc, the
RED declaration's `why`, the verification greps, and the dated amendment inside
`WP-dream-promote-in-workspace` Table W row W1(c)(i).

### Table J — `validate.js`'s git call sites, and the guard's precondition

**Canonical for THIS WP's own facts.** Every other statement of them in this
spec defers here. It is deliberately *not* about the channel set: that is
`WP-dream-git-env-pinning`'s Table U, cited and never restated.

| # | Site | argv, unchanged by this WP | Caller on the dream path | Act | After this WP |
|---|------|----------------------------|--------------------------|-----|---------------|
| J0 | `validate.js:64-81`, the module-private `git()` | — | the four rows below | — | `env: buildGitEnv()`, one construction, no second allowlist |
| J1 | `:89`, in `assertGitRepo` | `-C <vault> rev-parse --git-dir` | `src/cli/dream.js:587`, **every dream run** | READ | runs under the constructed environment; this is the row the WP exists for |
| J2 | `:103`, in `assertCleanTree` | `-C <vault> status --porcelain -uall` | **none anywhere in the repo** — measured: exported, and neither `src/` nor `tests/` calls or imports it (VS-P6, VS-P8) | READ that also REFRESHES the user's index — a write to `.git/index` | same construction; **inert on the dream path**, because no dream run reaches it |
| J3 | `:118`, in `restoreVaultToHead` | `-C <vault> reset --hard HEAD` | **none anywhere in the repo** — measured: imported by `tests/unit/dream-validate.test.js:15` and never called, its tests retired at row G7 (VS-P8) | WRITE (working tree and index) | same construction; **inert on the dream path** |
| J4 | `:119`, in `restoreVaultToHead` | `-C <vault> clean -fd` | **none anywhere in the repo** — same function as J3 | WRITE (removes untracked non-ignored files) | same construction; **inert on the dream path** |
| J5 | the guard's precondition | — | — | — | **"inside a repository", not "is a repository root"** — accepted and NAMED in `assertGitRepo`'s JSDoc (owner item O5) |

**How `WP-dream-promote-in-workspace` Table W row W1(c)(i)'s standing trigger is
DISPOSED OF — by a dated amendment inside that row, not by reading it narrowly
here.** The row elects to leave this spawn point un-seamed and closes:
*"THE ELECTION CARRIES A STANDING TRIGGER: any change to what `validate.js`
spawns falsifies it, and the answer is then to close the seam AND bring the new
shape to the owner."* **The environment handed to `spawnPinnedSync` is part of
what is spawned**, so a successor may not decide on its own authority that
"any change" means argv only — an earlier draft of this spec did exactly that
and round 1 caught it. The disposition is therefore an act, not a reading:
**Deliverables row 4 writes a dated amendment INSIDE row W1(c)(i)**, whose
required content is fixed under Exact contracts and whose opening sentence V5
greps. What that amendment records is what this WP can actually show:

- **The trigger's subject is the SHAPE.** The row's own consequence clause is
  about a shape — closing the seam "reddens the suite on its own, because it
  surfaces a TENTH shape, and admitting that shape is an addition to the pinned
  set". The remedy the trigger names is *bring the new shape to the owner*; with
  no new shape there is nothing to bring.
- **This WP changes no shape.** Rows J1–J4 are byte-identical before and after
  and no call site is added — asserted by **V4** against the branch's
  merge-base, not by assurance.
- **The admissibility measurement was RE-MEASURED, not carried forward.** The
  election is admissible *"only on that measurement"* — `rev-parse` index-safe
  from a stale-stat state. Under the constructed environment that measurement
  **holds**: probe **VS-P7** issues the exact argv from a stale-stat index and
  `.git/index` is byte-identical afterwards, with a `status --porcelain`
  positive control in the same state moving it.

**No monotonicity is claimed, and an earlier draft's claim is withdrawn.** That
draft said a constructed environment "can only *narrow* what these invocations
may reach"; round 1 falsified it by measurement — dropping an inherited
`GIT_CEILING_DIRECTORIES` **widens** repository discovery, turning a 128 into a 0
that resolves an ancestor. Argv invariance (V4) and environment effects are
separate things and are argued separately: the safety argument this WP rests on
is VS-P7's re-measurement above, and nothing else.

**Owner item O6 carries the alternative**: the owner may instead rule that the
trigger fires on an environment change, at the cost enumerated there.

**Row J2's `status --porcelain -uall` and Table W row W1(a).** W1(a)'s scope is
a total over *the run's own acts*. A function no dream run calls performs no act
during a run, so row J2 is outside that total today by having no caller — not by
an exemption — and this WP does not give it one. Its index-refresh property is
recorded in the row because **row W1's `(e)` sub-bullet** measured it — *"at
`1ac82ac` on git 2.50.1 from a stale-stat state, `status --porcelain` rewrites
the index file"* — and a future caller would inherit it.

### Mirrored Surface Checklist

Every surface that mirrors **Table J**, so a review finding updates the table
and all its mirrors **in one pass and in the same commit** — no commit exists in
which the table and a registered mirror disagree — and any new mirror found in
review is added here on the spot.

- [ ] **Deliverables-table cells** — the `validate.js` row (row J0's one
      construction, rows J1–J4's "no argv changes and no call site added or
      removed", row J5's JSDoc).
- [ ] **Acceptance criteria** — AC1 asserts row J1, AC2 rows J0/J1, AC3 row J5,
      AC5 rows J1–J4's invariance.
- [ ] **Current state** — the `git()` bullet and the `buildGitEnv` bullet.
- [ ] **Verification commands / greps** — V3, V5, and **V4 with V4a, the
      executable mirror of rows J1–J4**: the three diff lines V4 requires and the
      four argv literals V4a greps ARE those cells, so a row that changes without
      moving them is a table and a mirror disagreeing inside one commit. **V4's
      base guard is a CONTENT comparison over `validate.js` and `git-env.js`, not
      a SHA equality** — the wording is the Current-state bullet's and moves with
      it.
      **Both are PRESENCE screens and are labelled so in the step, in AC5 and
      here — V4 is blind to additions.** The invariant they do not carry is
      AC2's one-spawn clause and wd-reviewer's whole-diff read of
      `src/core/dream/validate.js`, which AC5 names.
- [ ] **Operative prose** — the W1(c)(i) non-firing paragraph and the row-J2
      paragraph above; owner items O4 and O5.
- [ ] **Outside this spec** — `assertGitRepo`'s JSDoc in
      `src/core/dream/validate.js` (row J5's one code-side statement: it may
      summarise, it may not decide) and the RED declaration's `why` field (it
      names row J1's behaviour).
- [ ] **Outside this spec, and it moves in the SAME commit as any change to rows
      J1–J4: the dated amendment inside `docs/specs/done/WP-dream-promote-in-workspace.md`
      Table W row W1(c)(i)**, whose opening sentence is fixed byte-exact under
      Exact contracts and grepped by **V5**. It carries rows J1–J4's no-shape
      claim and VS-P7's re-measurement into the row whose trigger they dispose
      of; a change to those rows that does not move the amendment is a canonical
      table and a registered mirror disagreeing across two specs. **V5 proves
      PRESENCE, not content** — the amendment's four required statements are the
      reviewer's read, judged over the whole cell and never over the grep window.
- [ ] **Outside this spec — the owner-rulings record's O4/O5/O6 entries**
      (`docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`).
      They are **citations of this spec's owner-items section, never restatements**
      (round 1, R1-G); the record is append-only, so a change here is carried
      there by a dated amendment paragraph naming this spec as governing.

## Dispatch precondition — owner items

The three calls below are the owner's. Each is **adopted under the standing
authorization of 2026-09-05**
(`docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`: the
maturing architect records a recommendation with the cost of overruling it, and
the session may dispatch under it) — **never as a direct owner ruling.** The
owner may reverse any of them by dated amendment, at the cost enumerated with
it. The owner-rulings record cites this section; it does not restate it.

**O4 — EXTEND THE CONSTRUCTED ENVIRONMENT TO THIS SPAWN POINT. Recommendation
adopted.** `validate.js`'s `git()` builds its child environment with the same
`buildGitEnv` the pipeline seam uses. One construction, no second allowlist, no
new row in Table U. The principle is ADR-0012's 2026-09-05 amendment's,
unchanged and not restated: the user's configuration FILES and hooks stay
honoured (`HOME` is carried as `getPaths().home`); the launching process's
environment is not a configuration surface for a run that is also a scheduled
job.

*Overrule cost.* To DON'T-EXTEND, the WP is withdrawn entirely:
`WP-dream-git-env-pinning`'s owner item O2 becomes an accepted residual rather
than a routed one, and the guard's verdict stays the launching shell's (VS-P1),
which the group-C disposition of 2026-09-02 named as owed. O5 would then need a
home of its own, being neither an environment question nor closed by this one.

**O5 — THE NESTED VAULT: ACCEPT AND NAME IT. Recommendation adopted, and the
measurement is what decides it.** `assertGitRepo` establishes "inside a
repository"; that is stated in its own contract (row J5) rather than tightened.
**Measured (VS-P4): `wienerdog adopt` ACCEPTS a directory that is a
subdirectory of an existing repository and has no `.git` of its own** — it reads
`rev-parse --git-dir` as "already a repo" (`src/cli/adopt.js:79-83`), skips its
`git init`, writes that path into `config.yaml`, and completes with exit 0. So
the nested case is reachable through the product's own front door and is a
supported configuration today, not a hand-configuration.

*The cost of accepting, stated rather than absorbed.* A dream in such a vault
reads against the **ancestor** repository: measured, `rev-parse --git-dir` and
`--show-toplevel` from the nested directory both resolve the ancestor under the
constructed environment (VS-P2, VS-P3). That the pipeline then commits into that
ancestor is **inferred from the code, not measured** — no publishing run was
executed. The pin prevents an *environment* from choosing the repository; it
does not make discovery stop at the vault.

*Overrule cost.* The two hardening answers are parked here rather than dropped,
and either is the reversal: **(a) require `rev-parse --show-toplevel` to equal
the vault** — `assertGitRepo` gains a second invocation (a fifth call site, so
V4's count moves and row J1's cell gains a sibling), the refusal message becomes
a user-facing product string and joins Deliverables, and a vault adopted inside
a larger repository stops dreaming, loudly, having worked yesterday; **(b) set
`GIT_CEILING_DIRECTORIES` for this call** — the same user-visible break by a
different route, plus it puts a `GIT_*` key back into the constructed
environment that Table U row U15 keeps out, which is a change to that table and
therefore to `WP-dream-git-env-pinning`'s canonical surface. **Neither is taken
here**: a hardening proposal with a user-visible cost becomes text only on an
explicit owner yes (`docs/runbooks/codex-review.md`, "Finding disposition"), and
the measurement says the cost is real rather than hypothetical.

**O6 — DISPOSE OF TABLE W ROW W1(c)(i)'s STANDING TRIGGER BY A DATED AMENDMENT
INSIDE THAT ROW, RATHER THAN BY READING IT NARROWLY. Recommendation adopted.**
The row's trigger is *"any change to what `validate.js` spawns"*, and the
environment handed to `spawnPinnedSync` **is** part of what is spawned — so a
successor may not decide on its own authority that the phrase means argv only.
The disposition is an act: `docs/specs/done/WP-dream-promote-in-workspace.md`
joins Deliverables for **one dated amendment inside row W1(c)(i) and nowhere
else**, whose required content is fixed under Exact contracts and whose opening
sentence V5 greps. Its load-bearing statement is the one this WP can show rather
than argue: the election is admissible *"only on that measurement"*, and the
measurement was **RE-MEASURED under the constructed environment** and holds
(VS-P7).

*Overrule cost, and it is the largest here.* The owner may instead rule that
**the trigger FIRES on an environment change**. Then this WP stops and is
superseded, because the remedy row W1(c)(i) itself names is *close the seam AND
bring the new shape to the owner*: threading the pipeline's `spawnGit` into
`assertGitRepo` and admitting `rev-parse --git-dir` as a **TENTH pinned shape**
both become owner business and a change to Table W row W1(c) itself;
`tests/unit/dream-pipeline.known-calls.js` joins Deliverables; the pinned-shape
count moves from nine to ten in every surface that states it; and the package is
no longer an S.

## Implementation notes & constraints

- **No new environment seam.** `buildGitEnv` reads `process.env` directly and
  must keep doing so; WP-155 deleted every test-exec env seam and
  `docs/THREAT-MODEL.md` states that no environment variable may substitute an
  executable or skip the containment self-check (ADR-0028). Exercise the pin by
  exporting the real variable around the call, saving and restoring it.
- **Zero new package dependencies** (CLAUDE.md). The only new import is
  `./git-env` from `validate.js`.
- **`buildGitEnv()` takes NO argument here.** Passing one would put a
  `GIT_INDEX_FILE` on a call that has none today; row J1's shape is not one of
  the nine pinned shapes and has no `private` disposition to satisfy.
- **`HOME` changes from the shell's string to `getPaths().home`.** Where `HOME`
  is set these coincide (`getPaths()` is `env.HOME || os.homedir()` and POSIX
  `os.homedir()` reads `$HOME` first), so a test that must discriminate them has
  to unset `HOME` around the call.
- **`scripts/red-proofs.js` refuses a `node_modules` SYMLINK** at SNAPSHOT
  (`ERROR: SNAPSHOT — unsupported entry type: symbolic link at node_modules`) —
  what a git worktree sharing the main checkout's dependencies has. If yours
  does, run V2 with `--root` pointed at a `git archive HEAD | tar -x -C <dir>`
  copy. A normal clone is unaffected.
- When uncertain: choose the simpler option and note it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The one untrusted input this WP consumes is **the launching process's
      environment — untrusted as a selector for this guard's verdict.** After
      this WP no inherited variable chooses which repository `assertGitRepo`
      answers about. Handled by **construction**, reusing
      `WP-dream-git-env-pinning`'s `buildGitEnv`; what that forbids and why a
      denylist cannot work is Table U row U21's and that spec's Security
      checklist's, cited and not restated. `HOME` remains the one deliberate
      carried config-location key (Table U row U2) — a trust decision, not a
      safety claim.
- [ ] No value this WP adds reaches a child's argument list: rows J1–J4 are
      byte-identical, and `vaultDir` is the config-derived path they already
      carry.
- [ ] `N/A — no untrusted identifier crosses a language boundary in this WP`
      (the template's anchored-pattern bullet): no shell, no PowerShell and no
      regex over a user-supplied name is added.

## Acceptance criteria

- [ ] **AC1 — an exported `GIT_DIR` no longer decides the guard's verdict**
      (row J1). With `GIT_DIR` exported to a real repository elsewhere for the
      duration of the call, `assertGitRepo` **refuses** a vault directory that is
      not a repository and is not inside one, with the existing *"vault is not a
      git repository … run `npx wienerdog init` first"* message. Measured
      before-state on `8358655d`, so this criterion is not vacuous: it
      **accepts** that case today (VS-P1 arm (b)).
- [ ] **AC2 — the call carries the constructed environment AND the unchanged
      argv, both captured at the spawn** (rows J0, J1). Through the suite's
      existing require-cache substitution — `stubCollaborators`
      (`tests/unit/dream-validate.test.js:1485`), which `stubSpawn` already uses
      to intercept `spawnPinnedSync` — **one** `assertGitRepo` call is driven and
      every spawn it performs is captured. Three clauses, all required:
      **(a) EXACTLY ONE SPAWN.** The captured count is `1`. This is where the
      no-added-spawn invariant lives: a hidden call inside the guard — however
      spelled, wrapped or preceded by a comment — is a second spawn and reddens
      this. Two review rounds established that no textual check over the diff can
      carry this claim, so it is carried where it is observable.
      **(b) The COMPLETE spawned argv** is `['-C', <vault>, 'rev-parse',
      '--git-dir']` — not the arguments handed to `git()`, but what `git()`
      assembles and hands `spawnPinnedSync`, which is the gap a round-1 channel
      demonstrated by mutating the `-C` prefix.
      **(c) The environment** is exactly what `buildGitEnv()` returns for the
      same process — compared against `buildGitEnv` itself, never a copied key
      list, so a Table U row added or removed cannot make the two disagree — and
      carries **no `GIT_INDEX_FILE`**, asserted with one exported around the call.
      A round-2 channel executed this capture against the real helper and
      confirmed all three are observable; the helper is **JavaScript
      require-cache substitution, not an environment seam** (ADR-0028 is not
      touched).
- [ ] **AC3 — the nested-vault pair, asserted rather than inherited** (row J5).
      Both halves, one test: a vault that **is** a repository root passes
      `assertGitRepo`; a directory that is **not** a repository but lies inside
      one **also passes**, which is the decided behaviour of owner item O5. The
      second half is what makes the decision executable instead of a sentence:
      an implementation that quietly tightened the guard would fail it.
- [ ] **AC4 — the RED declaration is PROVEN**, identified by this WP's own `wp`
      field and by the id fixed under Exact contracts, never a repo-wide count.
      `node scripts/red-proofs.js` exits 0 with `RUN: PROVEN`, and within it
      `validate-git-inherits-git-dir` has a `PROVEN` per-proof line and every
      roll-up line for this WP reads `PROVEN`.
- [ ] **AC5 — the prescribed change landed, and nothing else was added; the two
      halves are checked by different things and neither pretends to be the
      other** (rows J1–J4, and the claim the Table W amendment carries).
      **(a) LANDED — mechanical.** V4 exits 0: `src/core/dream/validate.js` and
      `src/core/dream/git-env.js` are **unchanged in CONTENT** between the pinned
      base and the branch's merge-base with `origin/main` (never a SHA
      comparison — see Current state and finding D1), and the diff against the
      pinned base CONTAINS the two prescribed added lines and the one removed
      line. **V4 is blind to additions and is labelled so in the
      step** — it proves the prescribed change landed, nothing about what else
      did. V4a is likewise a presence screen for the four argv literals.
      **(b) NOTHING ELSE WAS ADDED — observed where it is observable, plus a
      read.** AC2's clause (a) asserts `assertGitRepo` performs exactly ONE
      spawn, which is the only surface that sees a hidden call regardless of how
      it is written; and **wd-reviewer's whole-diff read of
      `src/core/dream/validate.js` is the named check that no other spawn was
      added elsewhere in the file** — proportionate, because rows J2–J4 have no
      dream-path caller and an addition there is inert on the run.
      **Why this shape and not a third textual patch:** two consecutive rounds
      landed on the mechanical form (a literal count, then a line-prefix comment
      filter), and a lexically sound JS analysis needs an AST dependency this
      repo does not carry. Under §0.1's repeat rule the answer is a re-cut by
      kind, and this one is **smaller** than what it replaces — no new gate, one
      assertion moved to where the property is visible.
- [ ] **AC6 — the registered out-of-spec mirror moved in the same commit**:
      `docs/specs/done/WP-dream-promote-in-workspace.md` Table W row W1(c)(i)
      carries the dated amendment with the byte-exact opening sentence (V5), and
      row W1's hook-residual sentence is still present, so the amendment was
      placed beside the row's existing text rather than over it. **NAMED
      RESIDUAL, stated rather than closed:** V5 is a presence grep, so a copied
      sentence over a wrong body passes it — the four content obligations under
      Exact contracts are the reviewer's read, judged over the whole cell.
- [ ] **AC7 — idempotence:** `N/A — this WP ships no command and writes nothing
      outside the repo; a dream run is deliberately not idempotent (ADR-0012),
      and this WP changes only the environment of an existing call.`

## Verification steps (run these; paste output in the PR)

```bash
# V1 — AC1-AC3 and the whole suite
npm test

# V2 — AC4, THE GATE. Whole tree: exit 0 and `RUN: PROVEN` required. A `--wp`
# SELECTION never exits 0 while any other WP has declarations — the runner's
# design, not a failure — so it is the readable per-proof view, NOT the gate.
node scripts/red-proofs.js
node scripts/red-proofs.js --wp WP-dream-git-env-validate-seam   # expect: PROVEN line, rc 1 (FILTERED)

# V3 — AC4's identity check: this WP's own `wp` field names exactly the one
# declared id, in the declaration file whose suite is the validate suite.
node -e 'const d=require("./tests/red-proofs/dream-git-env-validate-seam.proofs.json");
if (d.suite !== "tests/unit/dream-validate.test.js") { console.log("FAIL: suite is " + d.suite); process.exit(1); }
const ids = d.proofs.filter((p) => p.wp === "WP-dream-git-env-validate-seam").map((p) => p.id).sort();
const want = ["validate-git-inherits-git-dir"];
console.log(ids.join(","));
process.exit(JSON.stringify(ids) === JSON.stringify(want) ? 0 : 1)'

# V4a — the PRESENCE SCREEN, and it is only that: the four argv of Table J rows
# J1-J4 are still spelled byte-exact. It enumerates the argv we INTEND to accept
# (never a forbidden set — git's grammar is not ours to close) and is guarded so
# a missing file is RED. It does NOT establish the invariance; V4b does.
F=src/core/dream/validate.js
test -f "$F" || { echo "FAIL: $F is missing"; exit 1; }
while IFS= read -r a; do
  grep -qF "$a" "$F" || { echo "FAIL: argv not found byte-exact: $a"; exit 1; }
done <<'ARGV'
git(vaultDir, ['rev-parse', '--git-dir'], { allowFail: true })
git(vaultDir, ['status', '--porcelain', '-uall'])
git(vaultDir, ['reset', '--hard', 'HEAD'])
git(vaultDir, ['clean', '-fd'])
ARGV
echo "V4a OK — presence screen only"

# V4 — AC5 half (a): a COMPLETION / PRESENCE screen, and that is ALL it is.
# It checks that the prescribed change LANDED. It is BLIND TO ADDITIONS: it makes
# no claim about what else the diff contains, because two rounds proved that no
# line-oriented check over a JS diff can carry that claim (a literal count missed
# a multi-line fifth call; a comment-prefix filter missed `/* c */ git(...)`), and
# a lexically sound analysis needs an AST dependency this repo does not carry.
# The no-added-spawn invariant is AC2's ONE-SPAWN clause plus wd-reviewer's
# whole-diff read of this file — see AC5.
# The base is PINNED (Current state) and its guard compares CONTENT, not SHAs:
# what must not happen is an upstream change to the two measured files folding
# into the base under a rebase — that is when W1(c)(i)'s trigger should fire, not
# go quiet. `main` moving for unrelated reasons is not that, and a SHA-equality
# form was unsatisfiable by construction (finding D1): the Ready PR itself moves
# `main`, and the implementer branches after it.
# NOTE, so the sequence is not misread: `scripts/red-proofs.js` applies its
# mutations to fresh isolated COPIES of the tree. V4 runs against the unmutated
# working checkout, so a mutation that would redden V4 is not a conflict with V2.
BASE=8358655d41f997e8da05a39ec6b2851d05785480
MB=$(git merge-base origin/main HEAD)
git diff --quiet "$BASE" "$MB" -- src/core/dream/validate.js src/core/dream/git-env.js \
  || { echo "FAIL: base moved — re-derive Table J and re-run VS-P7 against the new base, then update the pinned SHA (merge-base $MB changes one of the two measured files)"; exit 1; }
D=$(git diff "$BASE" -- src/core/dream/validate.js)
# `-e` is required, not stylistic: the removed-line pattern begins with `-` and
# grep would otherwise read it as an option (measured — the first draft of this
# step reported the compliant state RED for exactly that reason).
printf '%s\n' "$D" | grep -qxF -e "+const { buildGitEnv } = require('./git-env');" || { echo "FAIL: the require('./git-env') line was not added"; exit 1; }
printf '%s\n' "$D" | grep -qxF -e "+    env: buildGitEnv()," || { echo "FAIL: env: buildGitEnv(), was not added"; exit 1; }
printf '%s\n' "$D" | grep -qxF -e "-    env: process.env," || { echo "FAIL: env: process.env, was not removed"; exit 1; }
echo "V4 OK — the prescribed change landed (blind to additions; AC2 and the reviewer's read carry that)"

# V5 — AC6, the registered out-of-spec mirror, guarded so an absent file is RED.
# PRESENCE only; the amendment's four required statements are the reviewer's read.
W=docs/specs/done/WP-dream-promote-in-workspace.md
test -f "$W" && grep -qF "**AMENDED 2026-09-06 — THE STANDING TRIGGER'S SUBJECT IS THE SHAPE, AND THE SUCCESSOR CHANGES NO SHAPE.**" "$W" || { echo "FAIL: the row W1(c)(i) amendment is missing"; exit 1; }
test -f "$W" && grep -qF "NEITHER SUPPRESSED NOR DETECTED" "$W" || { echo "FAIL: row W1's hook residual was not left intact"; exit 1; }
echo "V5 OK"

# V6 — the repo gates. The boundary check takes the spec and the changed set as
# `.github/workflows/ci.yml` invokes it, but WITHOUT `mapfile` (absent from macOS
# /bin/bash 3.2.57). No tracked path in this repo carries a space.
npm run lint
node scripts/boundary-check.js docs/specs/WP-dream-git-env-validate-seam.md $(git diff --name-only origin/main...HEAD)
```

## Out of scope (do NOT do these)

- **Tightening the guard to "is a repository root"** — answer (a) or (b) of
  owner item O5. Parked with its cost; it becomes text only on an explicit owner
  yes, and it would change a user-facing refusal.
- **Any change to `WP-dream-git-env-pinning`'s Table U**, including adding
  `GIT_CEILING_DIRECTORIES` to the constructed environment. That table is
  canonical elsewhere and this WP restates and amends none of it.
- **Editing `docs/specs/done/WP-dream-git-env-pinning.md`** (its O2 is the record
  of this split) or **ADR-0012** (its 2026-09-05 amendment already carries the
  decision this extends). **`docs/specs/done/WP-dream-promote-in-workspace.md` IS
  a Deliverable, but for ONE amendment inside row W1(c)(i) and nothing else** —
  no other row, and none of W1's surrounding text. This WP surfaces no tenth
  pinned shape (Table J), so row **W1(c)'s pinned set is unchanged** and the
  amendment records that rather than widening it.
- **`src/core/dream/promote.js`'s `spawnGitForMerge` / `constructMergeEnv`** —
  the dream's THIRD git spawn surface, named by Table W row W1(c)(ii). Its
  environment is already built from nothing, deliberately stricter than
  `buildGitEnv` because it operates on temp copies outside any repository, and
  unifying the two is prohibited by that row. Out of these Deliverables.
- **`src/cli/adopt.js` and `src/core/vault.js`** — the init and adopt paths.
  VS-P4 measures adopt as evidence for O5; changing it is a different work
  package on Table W row W6's finding.
- **Adding a caller for `assertCleanTree` or `restoreVaultToHead`** (rows J2-J4).
  Their absence from `src/` is a recorded contract, not an oversight.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): give the assertGitRepo spawn point the constructed git environment (WP-dream-git-env-validate-seam)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
