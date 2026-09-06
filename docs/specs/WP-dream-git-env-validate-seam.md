---
id: WP-dream-git-env-validate-seam
title: Give the dream's second git spawn point the same constructed environment
status: Draft
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

The dream run makes git calls from **two** places. The pipeline's nine pinned
shapes go through `gitIn` in `src/cli/dream.js`; since
`WP-dream-git-env-pinning` landed those run under an environment built key by
key from a named allowlist — **that spec's Table U is canonical for the channel
set, and this spec restates none of it.** The other place is
`src/core/dream/validate.js`'s module-private `git()`, which still passes
`env: process.env`. `assertGitRepo(vaultDir)` (`src/cli/dream.js:587`) reaches
it on **every** dream and is the dream path's only caller of it (Table J).

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

Measured on `8358655d` (`origin/main`), the tree this spec is drafted against.

- **`src/core/dream/validate.js:64-81` — the module-private `git()`.** It
  spawns through the pinned front door
  (`spawnPinnedSync('git', getPaths(), { args: ['-C', vaultDir, ...args], env: process.env, … })`),
  throws a `WienerdogError` on a non-zero exit unless `opts.allowFail` is set,
  and is **the only thing in this file that spawns anything**. `env:
  process.env` is the one line this WP changes. Its four call sites, and who
  calls each on the dream path: Table J.
- **`src/core/dream/git-env.js:26-41` — `buildGitEnv(indexFile?)`**, created by
  `WP-dream-git-env-pinning`: a fresh object built key by key — `PATH` from
  `process.env.PATH`, `HOME` from `getPaths().home`, nine carried keys plus a
  set `USERPROFILE` on win32, and `GIT_INDEX_FILE` **only** when `indexFile` is
  passed. With no argument it carries none — measured, the whole map on this
  host is `{HOME, PATH}` (VS-P2).
- **`src/core/exec-identity.js:554-558`** — `spawnPinnedSync` uses the `env` it
  is given both to resolve the pinned executable (`:556`) and as the child's
  environment (`:558`, through `passthroughSpawnOpts`).
  `buildGitEnv` carries `process.env.PATH` verbatim, so pin resolution and the
  WP-154 drift refusal are unaffected: the fake-`git`-on-PATH assertion at
  `tests/unit/dream-validate.test.js:1386` keeps its meaning.
- **`src/cli/dream.js:29` and `:587`** — `assertGitRepo` is imported and called
  once, before the lock, as a read-only fail-fast check. The three names
  imported beside it reach no git.
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
| modify | src/core/dream/validate.js | `git()` builds its child environment with `buildGitEnv()` from `src/core/dream/git-env.js` (Table J, row J0) instead of passing `process.env`; `assertGitRepo`'s JSDoc gains the decided precondition (row J5). **No argv changes and no call site is added or removed** — rows J1–J4 |
| modify | tests/unit/dream-validate.test.js | assertions covering AC1–AC3 (the implementer designs the cases) |
| create | tests/red-proofs/dream-git-env-validate-seam.proofs.json | this WP's ONE RED declaration (Exact contracts below); `suite` is `tests/unit/dream-validate.test.js` |

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
RED declaration's `why`, and the verification greps.

### Table J — `validate.js`'s git call sites, and the guard's precondition

**Canonical for THIS WP's own facts.** Every other statement of them in this
spec defers here. It is deliberately *not* about the channel set: that is
`WP-dream-git-env-pinning`'s Table U, cited and never restated.

| # | Site | argv, unchanged by this WP | Caller on the dream path | Act | After this WP |
|---|------|----------------------------|--------------------------|-----|---------------|
| J0 | `validate.js:64-81`, the module-private `git()` | — | the four rows below | — | `env: buildGitEnv()`, one construction, no second allowlist |
| J1 | `:89`, in `assertGitRepo` | `-C <vault> rev-parse --git-dir` | `src/cli/dream.js:587`, **every dream run** | READ | runs under the constructed environment; this is the row the WP exists for |
| J2 | `:103`, in `assertCleanTree` | `-C <vault> status --porcelain -uall` | **none in `src/`** — exported for tests only, by the owner ruling of 2026-08-30 recorded at `validate.js`'s export block | READ that also REFRESHES the user's index — a write to `.git/index` | same construction; **inert on the dream path**, because no dream run reaches it |
| J3 | `:118`, in `restoreVaultToHead` | `-C <vault> reset --hard HEAD` | **none in `src/`** — same export block | WRITE (working tree and index) | same construction; **inert on the dream path** |
| J4 | `:119`, in `restoreVaultToHead` | `-C <vault> clean -fd` | **none in `src/`** — same export block | WRITE (removes untracked non-ignored files) | same construction; **inert on the dream path** |
| J5 | the guard's precondition | — | — | — | **"inside a repository", not "is a repository root"** — accepted and NAMED in `assertGitRepo`'s JSDoc (owner item O5) |

**Why the standing trigger of `WP-dream-promote-in-workspace` Table W row
W1(c)(i) does NOT fire, stated with its reasoning.** That row elects to leave
this spawn point un-seamed and closes with: *"THE ELECTION CARRIES A STANDING
TRIGGER: any change to what `validate.js` spawns falsifies it, and the answer is
then to close the seam AND bring the new shape to the owner."* The clause's own
subject is the SHAPE — it says closing the seam "reddens the suite on its own,
because it surfaces a TENTH shape, and admitting that shape is an addition to
the pinned set" — and the election's admissibility rests on `rev-parse` having
been measured index-safe from a stale-stat state, a property of the command.
This WP changes **no argv** (rows J1–J4 are byte-identical before and after) and
**adds no call site**, so no tenth shape is surfaced and the measurement the
election rests on is untouched. What it changes is the environment those same
invocations run under, which can only *narrow* what they may reach: today an
exported `GIT_INDEX_FILE` reaches row J1's call; after this WP none does. The
non-firing is not left to a reader's confidence — **V4 asserts it mechanically**
by enumerating the four argv we intend to accept and refusing a fifth call site.

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
- [ ] **Verification commands / greps** — V3 and **V4, the executable mirror of
      rows J1–J4**: the argv literals it greps and the call-site count it asserts
      ARE those cells, so a row that changes without moving V4 is a table and a
      mirror disagreeing inside one commit.
- [ ] **Operative prose** — the W1(c)(i) non-firing paragraph and the row-J2
      paragraph above; owner items O4 and O5.
- [ ] **Outside this spec** — `assertGitRepo`'s JSDoc in
      `src/core/dream/validate.js` (row J5's one code-side statement: it may
      summarise, it may not decide) and the RED declaration's `why` field (it
      names row J1's behaviour).

## Dispatch precondition — owner items

Both calls below are the owner's. Each is **adopted under the standing
authorization of 2026-09-05**
(`docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`: the
maturing architect records a recommendation with the cost of overruling it, and
the session may dispatch under it) — **never as a direct owner ruling.** The
owner may reverse either by dated amendment, at the cost enumerated with it.

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
- [ ] **AC2 — the call carries the constructed environment, key and value**
      (row J0). What `git()` hands the spawn is exactly what `buildGitEnv()`
      returns for the same process — asserted against `buildGitEnv` itself, never
      a copied key list, so a Table U row added or removed cannot make the two
      disagree — and it carries **no `GIT_INDEX_FILE`**, asserted with one
      exported around the call.
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
- [ ] **AC5 — the standing trigger did not fire, mechanically** (rows J1–J4).
      V4 exits 0: the four argv literals are byte-exact and `git(vaultDir, [` has
      exactly four occurrences, so no shape changed and no fifth spawn was added.
      **Green on the untouched tree too, deliberately** — an INVARIANCE check,
      not a completion check; completion is AC1's and AC4's.
- [ ] **AC6 — idempotence:** `N/A — this WP ships no command and writes nothing
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

# V4 — AC5, Table J rows J1-J4. Enumerates the argv we INTEND to accept (never a
# forbidden set — git's grammar is not ours to close), refuses a fifth call site,
# and is guarded so a missing file is RED rather than silently green.
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
n=$(grep -c "git(vaultDir, \[" "$F")
[ "$n" = 4 ] || { echo "FAIL: expected 4 call sites of git(), found $n"; exit 1; }
echo "V4 OK — Table J's four argv literals byte-exact, and no fifth call site"

# V5 — the repo gates. The boundary check takes the spec and the changed set as
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
  of this split), **ADR-0012**, or
  **`docs/specs/done/WP-dream-promote-in-workspace.md`**. This WP surfaces no
  tenth pinned shape (Table J), so row W1(c) is unchanged and needs no amendment,
  and the ADR's 2026-09-05 amendment already carries the decision this extends.
- **`src/core/dream/promote.js`'s `spawnGitForMerge` / `constructMergeEnv`** —
  already constructed, deliberately stricter, outside these Deliverables.
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
