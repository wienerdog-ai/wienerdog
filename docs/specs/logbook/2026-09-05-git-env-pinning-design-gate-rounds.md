---
date: 2026-09-05
title: "Design-gate rounds: WP-dream-git-env-pinning"
related_wps: [WP-dream-git-env-pinning, WP-dream-git-env-validate-seam]
---

# Design-gate rounds — WP-dream-git-env-pinning

Round zero is the architect's own measurement, internal coherence pass and
both-directions proof of every new verification step
(`docs/runbooks/codex-review.md`, "Internal coherence pass"). The
orchestrator's clean-context executors and the external double-channel rounds
are appended below it.

## Round zero — architect, 2026-09-05, tree at `4b629ec6`

`4b629ec6` is `origin/main`. The worktree
`/Users/gyulafeher/Documents/Claude_Projects/wienerdog-wt/git-env-pinning-design`
(branch `docs/wp-dream-git-env-pinning`) was created from it; its `HEAD` at the
start of this pass was `326b2fbd`, which adds one logbook file
(`2026-09-05-owner-rulings-git-env-pinning-queue.md`) and **no `src/` or
`tests/` change** — `git diff --stat 4b629ec6 326b2fbd` is one file, 45
insertions. Every code citation and every code-shape claim below is therefore
against `4b629ec6`.

**No measurement mutated the worktree or the main checkout.** The git probes ran
in `mktemp -d` scratch repositories; the compliant and violating states for the
both-directions proofs are hand-built copies under the session scratchpad
(`states/green`, `states/violating`); the red-proof runs used `--root` pointed
at a plain `git archive HEAD | tar -x` copy of the tree in scratch, never the
worktree. `git status --porcelain` in the worktree was checked after the probe
runs and showed only this pass's own two spec files.

**Every measurement was run FROM A FILE** (`docs/runbooks/codex-review.md`,
"Run a gate from a script, not from an inline shell one-liner"). The drivers are
`m1-write-targets.sh`, `m2-config-code.sh`, `m3-reach-and-minimal-env.sh`,
`m4-assertgitrepo.sh`, `check-ranges.js`, `prove-v3-v5.sh` and `coherence.js`.

**One driver defect is recorded rather than quietly fixed**, because it is the
exact shape `codex-review.md` names under "Capture an exit code as its own
statement". The first form of `prove-v3-v5.sh`'s `v3()` helper piped `node`
through `tail`, so the rc it returned was the pipeline's and **every state read
`rc=0`** — including the deliverable-absent one, which is the state the proof
exists to redden. It was caught by the result looking wrong (a missing file
reporting success), not by review. The helper now runs `node` with no pipe and
the three states separate cleanly; the fix is visible in the driver's own
comment.

### 0.1 STOP CRITERION — pinned BEFORE round 1

Pinned here per `docs/runbooks/codex-review.md:90-108`, before any adversarial
round runs. Materiality bands are HANDOVER's: **A** = silent wrong behavior with
a data-loss or security consequence; **B** = caught downstream; **C** = hygiene.

**Step 0 — the band gate.** Before any branch is consulted: a round whose
findings are **all band C** → **CLOSE**, hygiene fixed in place. **Any finding
above C** → route every finding through the ladder below.

**Then, applied PER FINDING, first match wins:**

1. **The product decision** — the finding argues for *don't-pin*, or that a
   channel Table U carries should be dropped, or that a channel it drops should
   be carried, in a way that changes what the user's own git configuration can
   do to the run → **OWNER item**, parked with a recommendation and an
   enumerated overrule cost under escalation (ii)
   (`codex-review.md:52-53`; `:59-66`, diff size does not measure contract
   impact). **It does NOT block**: the loop continues on the remaining findings,
   and the item is appended to
   `2026-09-05-owner-rulings-git-env-pinning-queue.md` under "Items dispatched
   under the standing process".
2. **The measurement the WP rests on** — the finding falsifies a "Measured
   reach" cell: a channel recorded as NOT reaching a pinned shape is shown to
   reach one, or a MEASURED reach fails to reproduce → **DESIGN**. The answer is
   to **re-derive Table U mechanically** from a fresh probe run and update every
   registered mirror in the same commit, never to patch the row. A single wrong
   cell means the probe method, not the cell, is what was believed.
3. **Same-family repeat (ADR-0031)** — it is the second consecutive round
   landing a finding on **any row of Table U, in any surface the Mirrored
   Surface Checklist registers** → **contract EXTRACTION pass**
   (`codex-review.md:422-429`), never a third row patch. **Table U is the
   family** for this rule, and it is named here so the breaker has a subject.
4. **Operative content** — it changes what the implementer must build: the
   Deliverables permission boundary, `buildGitEnv`'s or `gitIn`'s contract, an
   acceptance criterion's assertion, or the content either out-of-spec mirror
   must carry → **HEAVY fix**, then a full fresh external round.
5. **Mirror drift** — a registered mirror disagrees with a Table U row that is
   itself right → **LIGHT fix**: correct every mirror the checklist names, in
   the same commit, and re-run `coherence.js`. No new round.
6. **Machinery or record only** — it is about a verification step's shape, a
   citation, this record, or the RED declarations' ids and nothing else →
   **LIGHT fix**, mechanically re-verified, no new round.
7. **Nothing about the product** → **CLOSE**.

**Round rule.** A round's outcome is the **most escalating** outcome any single
finding produced, on `CLOSE < LIGHT < HEAVY < EXTRACTION < DESIGN`. OWNER items
are raised alongside and do not by themselves hold the loop open.

**FALLBACK.** If the three RED declarations themselves draw findings in two
consecutive rounds — the mutation shape, the expectRed sets, the ids — drop the
per-channel RED declarations to the single `git-env-inherits-git-dir` proof and
carry AC2–AC4 on the pipeline assertions plus `npm test` alone. Verification
machinery may grow only to guard a product behavior, in the smallest form that
guards it (`codex-review.md:188-191`). **Recorded consequence if it fires:** the
stub's 2026-09-02 amendment forbids a pin outcome going green from `GIT_DIR`
alone, so the fallback must keep AC3 and AC4 as behavioural assertions even
where their RED declarations are dropped — the fallback trims the proofs, never
the channel set.

### 0.2 The measurements

Two scratch repositories per driver — VAULT (what the run means) and OTHER (what
the environment redirects to) — on **git 2.50.1 (Apple Git-155)**, `/usr/bin/git`.
Each block below is the driver's own pasted stdout; the command and its exit
code were captured as their own statements.

#### M1 — the write-target channels (`m1-write-targets.sh`, rc 0)

```text
ROOT=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.hp0CxM1hXs
== baseline ==
vault HEAD  = a125f40742f8812ef46f574e77f2f386d8c51641
other HEAD  = e0f421125979cd8db1d85bec1df8950e9456def3

== P1a GIT_DIR + rev-parse HEAD (shape 5) ==
e0f421125979cd8db1d85bec1df8950e9456def3
   (expect: OTHER's head if the channel reaches this shape)

== P1b GIT_DIR + hash-object -w --stdin (shape 2) ==
sha=3b017914fa520a01004d26c0965386aedf125b77
in vault? no
in other? yes

== P1c GIT_DIR + commit-tree/update-ref (shapes 8,9) ==
other HEAD before=e0f421125979cd8db1d85bec1df8950e9456def3 after=f49173ffcf4d84e502ad207b3a998de16971def0 moved=yes
vault HEAD unchanged? a125f40742f8812ef46f574e77f2f386d8c51641

== P2 GIT_OBJECT_DIRECTORY alone + hash-object -w --stdin (shape 2), GIT_DIR unset ==
sha=be8c8673e9ee1cb1aa23f0479709132d69c5d5eb
in vault objects? no
in other objects? yes

== P3 GIT_WORK_TREE alone + the nine shapes' worktree dependence ==
rev-parse HEAD: a125f40742f8812ef46f574e77f2f386d8c51641
write-tree from a private index seeded by read-tree:
  read-tree rc=0
0a0a91cb00e42a252b600dd0a8f9c18268671418
  write-tree rc=0

== P4 GIT_ALTERNATE_OBJECT_DIRECTORIES: read-scope widening ==
object 8b176f7443cd31fb4caa4a7f85bfa098eb4761c0 exists only in OTHER
vault cat-file without alternates: fatal: Not a valid object name 8b176f7443cd31fb4caa4a7f85bfa098eb4761c0
vault cat-file with alternates:    only-in-other
== P5 GIT_NAMESPACE + update-ref HEAD ==
update-ref rc=0
real HEAD now: 0e60c750791a19ecac8992f1235a22a661fd2270 (was a125f40742f8812ef46f574e77f2f386d8c51641)
namespaced ref: 

== P6 GIT_CEILING_DIRECTORIES = the vault itself (denial channel) ==
0e60c750791a19ecac8992f1235a22a661fd2270
rc=0
0e60c750791a19ecac8992f1235a22a661fd2270
rc(parent-ceiling)=0

== P7 GIT_COMMON_DIR ==
0e60c750791a19ecac8992f1235a22a661fd2270
rc=0
ROOT kept at /var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.hp0CxM1hXs
```

**What M1 establishes.** `GIT_DIR` reaches four of the nine pinned shapes;
`GIT_OBJECT_DIRECTORY` alone reaches `hash-object -w --stdin`;
`GIT_ALTERNATE_OBJECT_DIRECTORIES` widens read scope, shown here on `cat-file`
only (its probe against a PINNED shape is M3's P12b, because M2's first attempt
at that — P12 — seeded both repositories identically and could not have
discriminated; that defect is recorded rather than deleted);
`GIT_WORK_TREE`, `GIT_NAMESPACE`, `GIT_CEILING_DIRECTORIES`
and `GIT_COMMON_DIR`-with-`GIT_DIR` show **no** reach into the shapes probed
here. `GIT_NAMESPACE` is the notable one: the run's own `update-ref … HEAD`
moved the repository's REAL head under it, so the channel does not redirect
shape 9.

#### M2 — the config and code channels (`m2-config-code.sh`, rc 0)

```text
ROOT=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.M4CdYrzXAA  vaultHEAD=59d688266a6c71b2e46aaa21c2a175004fd8eff0

== P8 GIT_CONFIG_COUNT injecting core.fsmonitor=<script>: does it EXECUTE? ==
  after 'read-tree 59d688266a6c71b2e46aaa21c2a175004fd8eff0': rc=0 fsmonitor-log-lines=0
  after 'write-tree': rc=0 fsmonitor-log-lines=2
  after 'update-index --refresh': rc=0 fsmonitor-log-lines=4
  log:
    FSMONITOR RAN args=2 1788642527404895000
    FSMONITOR RAN args=1 1788642527404895000
    FSMONITOR RAN args=2 1788642527404896000
    FSMONITOR RAN args=1 1788642527404896000

== P8b GIT_CONFIG_COUNT injecting an ordinary config value (does the channel apply at all?) ==
false
  rc=0
INJECTED
  rc=0

== P8c GIT_CONFIG_COUNT + core.hooksPath: does an injected hooks path fire on update-ref? ==
  update-ref rc=0 hook-log-lines=2
    REFTX HOOK RAN prepared
    REFTX HOOK RAN committed

== P9 GIT_EXEC_PATH: is a fake git-hash-object executed? ==
  stdout=c1b0730e0133447badcfd47fd144e254807b06e1
  exec-log-lines=0
== P9b GIT_EXEC_PATH with a NON-builtin subcommand (control that the channel is live) ==
  exec-log-lines=1
    WDPROBE RAN

== P10 GIT_CONFIG_GLOBAL vs HOME: which one carries the user's global config ==
  HOME only:                       from-home-gitconfig
  HOME + GIT_CONFIG_GLOBAL:        from-GIT_CONFIG_GLOBAL
  HOME + XDG_CONFIG_HOME relocation: from-XDG
  neither HOME nor XDG set:            rc=1

== P11 GIT_COMMON_DIR redirects the OBJECT STORE? ==
  sha=072f6f624504c90fb3a467ec358dd331afd912d2
  in vault objects? no
  in other objects? yes

== P12 GIT_ALTERNATE_OBJECT_DIRECTORIES reaching a PINNED shape (read-tree) ==
  without alternates rc=0
  with alternates rc=0

== P13 GIT_INDEX_FILE inherited reaches an 'unset'-disposition shape? ==
  rev-parse rc=0
  ls-tree rc=0
  user-index bytes changed? no
ROOT kept at /var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.M4CdYrzXAA
```

**What M2 establishes, and it is the band-A half of the case.**
`GIT_CONFIG_COUNT` + `core.fsmonitor=<script>` **executed that script** during
`write-tree` and again during `update-index` — arbitrary code, reached from the
launching shell, inside the run's own pinned shapes. The same triple with
`core.hooksPath` fired a `reference-transaction` hook **the user never
configured**, which is the asymmetry the stub called the crux: the pin refuses an
injection, it does not suppress a configuration. `GIT_CONFIG_GLOBAL` reaches the
same code channel through a relocated file. `GIT_EXEC_PATH` did **not** reach
`hash-object` (a builtin) while the live-channel control `git wdprobe` **was**
executed from it, so the row records absence of reach and not absence of a
channel. `GIT_COMMON_DIR` redirects the object store. And `HOME` versus
`GIT_CONFIG_GLOBAL` versus `XDG_CONFIG_HOME` is the measurement behind Table U's
carried keys and row U11's named cost.

#### M3 — reach against a pinned shape, and the minimal environment (`m3-reach-and-minimal-env.sh`, rc 0)

```text
ROOT=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.TR5qa8qVTf vaultHEAD=813ba7de55de259353fee57b2cae3d5eaba78e75 otherTree=5eaac5140510be5a1624b402cd339fff102fff91

== P12b GIT_ALTERNATE_OBJECT_DIRECTORIES reaching read-tree (distinct content) ==
fatal: failed to unpack tree object 5eaac5140510be5a1624b402cd339fff102fff91
  without alternates rc=128
  with alternates rc=0
  index now holds: b.txt 

== P14 GIT_CONFIG_GLOBAL as a CODE channel (core.fsmonitor via a relocated global config) ==
  rc=0 fsmonitor-log-lines=2
    FSMONITOR RAN via GIT_CONFIG_GLOBAL
    FSMONITOR RAN via GIT_CONFIG_GLOBAL

== P15 which env keys do the nine pinned shapes NEED? ==
  full ambient env                  -> failures=0
  env -i + PATH only                -> failures=0
  env -i + PATH + HOME              -> failures=0
  env -i + PATH,HOME,XDG,TMPDIR     -> failures=0
  env -i, NO PATH at all            -> failures=0
  env -i + PATH, HOME=/nonexistent  -> failures=0

== P16 do the pinned shapes run a FILTER driver (smudge/clean) from injected config? ==
  after show: rc=0 filter-log-lines=0
  after hash-object -w --stdin (no --path): rc=0 filter-log-lines=0
ROOT kept at /var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.TR5qa8qVTf
```

**What M3 establishes.** P12b is M1's alternates probe redone with distinct
content: `read-tree «tree»` exits **128** without the alternates and **0** with
them, and the private index then holds the other repository's path — a real
reach into pinned shape (6). P14 shows `GIT_CONFIG_GLOBAL` executing
`core.fsmonitor` on `write-tree`. **P15 is the evidence for what the constructed
environment may leave out**: the nine shapes ran with **zero failures** under
`env -i PATH=<git's dir>`, and again with `HOME` pointed at a non-existent
directory — so no `TMPDIR`, no locale and no `USER` is needed, and `HOME` is
carried by DECISION (rows U2, U3) rather than by necessity. P16 shows no filter
driver running for `show HEAD:<path>` or for `hash-object -w --stdin`, which
carries no `--path` by Table W row W1's own contract.

**One limit of P15, stated because the run does not reach it:** `env -i` still
supplies `execvp`'s default PATH, so the "NO PATH at all" line proves nothing
about PATH and is not relied on. What decides PATH is row U1's code reading of
`resolveExecutable` / `verifyPin`, not this probe.

#### M4 — the residual this WP names rather than fixes (`m4-assertgitrepo.sh`, rc 0)

```text
ROOT=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.3JrWP0WWen
  plain (no GIT_DIR), vault is NOT a repo: rc=128 out=[fatal: not a git repository (or any of the parent directories): .git]
  with inherited GIT_DIR=<other>/.git:     rc=0 out=[/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.3JrWP0WWen/other/.git]
  (rc=0 here means the guard reports 'vault is a git repository' for a directory that is not one)
ROOT kept at /var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.3JrWP0WWen
```

**What M4 establishes.** The `assertGitRepo` guard's exact invocation exits 0 for
a directory that is not a repository, when `GIT_DIR` is exported elsewhere. This
is the measurement behind owner item O2 and the successor stub
`WP-dream-git-env-validate-seam`.

#### The two spawn points on the dream path, enumerated rather than grepped

```text
$ grep -rn "spawnPinnedSync(.git." src   # the dream path
src/core/dream/promote.js:339:  return spawnPinnedSync('git', getPaths(), {
src/core/dream/validate.js:65:  const res = spawnPinnedSync('git', getPaths(), {
src/cli/dream.js:179:  return spawnPinnedSync('git', getPaths(), {
rc=0
```

`dream.js:179` is `spawnGitPinned`, this WP's seam. `validate.js:65` is the
`assertGitRepo` spawn point, owner item O2. `promote.js:339` is
`spawnGitForMerge`, which already constructs its own environment and is out of
scope. Nothing else in `src/` spawns git on the dream path — `vault.js`,
`adopt.js` and `adopt-git.js` are the init and adopt paths.

### 0.3 Every cited range checked at BOTH ends

`codex-review.md:160-170`. Each range's first and last line printed with its
neighbours, so a range ending inside the next construct is visible. Run by
`check-ranges.js`, rc 0.

```text
src/cli/dream.js:166-175  (gitIn — the pipeline seam)
   before:  */
   FIRST : function gitIn(spawnGit, cwd, args, opts = {}) {
   LAST  : }
   after : 

src/cli/dream.js:178-186  (spawnGitPinned — the pinned front door)
   before: /** The real seam: the WP-154 pinned front door, never a bare `git`. */
   FIRST : function spawnGitPinned(o) {
   LAST  : }
   after : 

src/cli/dream.js:226-231  (the private-index environment)
   before:   // untouched whatever happens here.
   FIRST :   const tmpIndex = path.join(o.stateDir, `dream-index.${process.pid}.tmp`);
   LAST  :   const withIndex = (args, opts) => g(args, { ...opts, env: indexEnv });
   after : 

src/cli/dream.js:562-562  (the spawnGit default)
   before:   // row W1(c). JS-only: production passes no opts, so the pinned door always runs.
   FIRST :   const spawnGit = opts.spawnGit || spawnGitPinned;
   LAST  :   const spawnGit = opts.spawnGit || spawnGitPinned;
   after : 

src/cli/dream.js:587-587  (the assertGitRepo call site)
   before:   // 2. Vault must be a git repo (read-only check; fail fast without the lock).
   FIRST :   assertGitRepo(vaultDir);
   LAST  :   assertGitRepo(vaultDir);
   after : 

src/cli/dream.js:1007-1007  (show HEAD:reports/warnings.md)
   before:       const warningsRender = composeWarnings(ledger);
   FIRST :       const headWarnings = gitIn(spawnGit, vaultDir, ['show', `HEAD:${WARNINGS_REL}`], { allowFail: true });
   LAST  :       const headWarnings = gitIn(spawnGit, vaultDir, ['show', `HEAD:${WARNINGS_REL}`], { allowFail: true });
   after :       if (headWarnings.status === 0) {

src/core/dream/validate.js:64-81  (validate.js's module-private git())
   before:  */
   FIRST : function git(vaultDir, args, opts = {}) {
   LAST  : }
   after : 

src/core/dream/validate.js:88-93  (assertGitRepo)
   before:  */
   FIRST : function assertGitRepo(vaultDir) {
   LAST  : }
   after : 

src/core/dream/promote.js:387-418  (constructMergeEnv — the precedent)
   before:  */
   FIRST : function constructMergeEnv(root) {
   LAST  : }
   after : 

src/core/exec-identity.js:93-118  (resolveExecutable — reads env.PATH)
   before:  */
   FIRST : function resolveExecutable(name, env, platform) {
   LAST  : }
   after : 

src/core/exec-identity.js:451-461  (verifyPin — compares the resolved path to the pin)
   before: 
   FIRST :   const live = resolveExecutable(name, env, platform);
   LAST  :   }
   after :   const liveDir = path.dirname(live.realpath);

src/cli/run-job.js:58-78  (WIN_ENV_PASSTHROUGH)
   before:  *  paths.home so the passthrough can never overwrite the deterministic homedir. */
   FIRST : const WIN_ENV_PASSTHROUGH = [
   LAST  : ];
   after : 

src/cli/run-job.js:150-150  (buildCleanEnv — the scheduled run's clean env)
   before:  */
   FIRST : function buildCleanEnv(paths, name, platform = process.platform) {
   LAST  : function buildCleanEnv(paths, name, platform = process.platform) {
   after :   if (platform === 'win32') {

tests/red-proofs/dream-pipeline.proofs.json:10-11  (the find/replace this WP re-targets)
   before:       "file": "src/cli/dream.js",
   FIRST :       "find": "const indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex };",
   LAST  :       "replace": "const indexEnv = { ...process.env }; void tmpIndex; /* RP_MUT_PRIVATE_INDEX_DROPPED */",
   after :       "marker": "RP_MUT_PRIVATE_INDEX_DROPPED",

tests/unit/dream-pipeline.test.js:185-185  (watchIndexWrites)
   before:  */
   FIRST : function watchIndexWrites(vault) {
   LAST  : function watchIndexWrites(vault) {
   after :   const { spawnPinnedSync } = require('../../src/core/exec-identity');

src/core/exec-identity.js:553-553  (spawnPinnedSync)
   before:  */
   FIRST : function spawnPinnedSync(name, paths, opts = {}) {
   LAST  : function spawnPinnedSync(name, paths, opts = {}) {
   after :   const env = opts.env || process.env;

docs/runbooks/codex-review.md:52-53  (a hardening proposal needs an owner yes)
   before:   the owner; drafting the decisions does not.
   FIRST : - A hardening proposal becomes text only on an explicit owner yes — never
   LAST  :   folded in silently.
   after : - **Altitude guard (a drop sub-case):** a finding that lives one level

docs/runbooks/codex-review.md:59-66  (diff size does not measure contract impact)
   before:   higher document.
   FIRST : - **Diff size does not measure contract impact (a park sub-case).** A finding
   LAST  :   quietly rebuilding the absence that was the point.)
   after : - Every solution starts with the value question: what does fixing this

docs/runbooks/codex-review.md:90-108  (the STOP CRITERION bullet)
   before:   `docs/HANDOVER.md:355-358`).
   FIRST : - A design loop states its STOP CRITERION in the round record BEFORE
   LAST  :   (`docs/HANDOVER.md:371-372`).
   after : - The reviewer's raw output is committed BEFORE anyone reads or judges

docs/runbooks/codex-review.md:160-170  (a cited range is checked at both ends)
   before:   the spec itself provides.
   FIRST : - A cited RANGE is checked at BOTH ends, mechanically — `file:START-END` must
   LAST  :   WP-index-guard-residuals; `docs/HANDOVER.md:298`).
   after : 

docs/runbooks/codex-review.md:188-191  (verification machinery may grow only to guard)
   before: 
   FIRST : - Verification machinery may GROW only to guard a product behavior, and
   LAST  :   the existing surface, or accepted as a named residual.
   after : - Why this is the convergence condition, measured: each fix injects

docs/runbooks/codex-review.md:406-413  (prove a new gate in both directions)
   before:   changed (`docs/HANDOVER.md:342-343`).
   FIRST : - **Prove a new gate in BOTH directions.** Red-before-work shows a check is not
   LAST  :   punish the implementer for doing the work correctly.
   after : - **A mutation matrix is evidence only once each cell proves its own

docs/runbooks/codex-review.md:422-429  (the ADR-0031 loop circuit-breaker)
   before:   (`inbox` WP-dream-promote-in-workspace, WP-show-slot-own-value-kind).
   FIRST : - **Loop circuit-breaker (ADR-0031).** If two consecutive review rounds land a
   LAST  :   unregistered.
   after : - **Capture an exit code as its own statement, immediately.** `rc=$?` on the

ALL RANGES RESOLVED
```

The spec's own citations were then re-extracted FROM the spec text and resolved
again by `coherence.js` (0.5), which is the check that catches a citation the
range list forgot: it found one — a bare `dream.js:230` with no directory, which
could not resolve and which would also have rotted the moment this WP lands.
Replaced with a description that carries no line number.

### 0.4 Both-directions proof of every NEW verification step

`docs/runbooks/spec-authoring.md`: a new verification step is trusted only after
a real green on the compliant state and a real red on a deliberately broken one,
**and the deliberately-broken state includes the DELIVERABLE-ABSENT case**. V5 is
built with `test -f … && grep -qF …` precisely so an absent file is red rather
than green.

**V1 (`npm test`)** — not new; run on the untouched tree as the baseline the
implementer inherits:

```text
ℹ tests 2684
ℹ suites 0
ℹ pass 2672
ℹ fail 0
ℹ cancelled 0
ℹ skipped 12
ℹ todo 0
ℹ duration_ms 53918.718792
```

**V2 / V3 (the red-proof runner)** — the deliverable-absent red, run in the
worktree:

```text
$ node scripts/red-proofs.js --wp WP-dream-git-env-pinning
RED proofs — root /Users/gyulafeher/Documents/Claude_Projects/wienerdog-wt/git-env-pinning-design
Node 25.9.0 (lane floor 18.15.0)
60 declared proof(s), 0 selected [--wp WP-dream-git-env-pinning]
VACUOUS: V2 — the selection matched no proof. A selection matching nothing is a vacuous run, not an empty success.
rc=1
```

**And the green side of V2's mechanism, on a plain copy of the tree** — because
the worktree's `node_modules` is a symlink and the runner refuses one at
SNAPSHOT (`ERROR: SNAPSHOT — unsupported entry type: symbolic link at
node_modules`, reproduced in the worktree). Run against
`git archive HEAD | tar -x -C <scratch>`:

```text
$ node scripts/red-proofs.js --root <scratch copy> --wp WP-show-slot-own-value-kind
RED proofs — root /private/tmp/claude-501/-Users-gyulafeher-Documents-Claude-Projects-wienerdog/5aacc823-45ec-41c6-81f1-7a9912a80656/scratchpad/architect/tree
Node 25.9.0 (lane floor 18.15.0)
60 declared proof(s), 2 selected [--wp WP-show-slot-own-value-kind]
snapshot: 1379 entries under the declared domain (`.git/` and `node_modules/` excluded)

PROVEN       dream-private-index-dropped  (WP-show-slot-own-value-kind criterion 3)
             why: the index guard's enforcement is not vacuously green: dropping the run's private GIT_INDEX_FILE makes the pinned-shape check fire in all three vault layouts
PROVEN       known-calls-show-slot-widened  (WP-show-slot-own-value-kind criterion 2)
             why: the two-token `show --output=<user index>` canary is not vacuous: widening shape (4)'s literal slot to ANY makes the canary's rejection stop happening, and the canary reddens

…
RUN: FILTERED
rc=1
```

**This is where a criterion was found unsatisfiable and rewritten, which is
round zero's whole purpose.** The first draft's AC5/AC6 asserted that
`node scripts/red-proofs.js --wp <WP>` **exits 0**. It does not and cannot: a
`--wp` selection leaves every other WP's declarations out, the roll-up marks
each one `FILTERED`, and the run verdict is the worst of them — so the criterion
was red by construction on a correct implementation, the exact over-strict shape
`codex-review.md:406-413` warns about. The selection's two `PROVEN` per-proof
lines above are real; the exit code is the runner's design. AC5 and AC6 now rest
on the **whole-tree** run (`node scripts/red-proofs.js`, exit 0 required) and the
selection is kept as the readable per-proof view, with its expected exit code
stated in the step itself.

**The green side of AC5's own three declarations is NOT runnable at round zero
and is not claimed**: the declarations do not exist until the implementer writes
them. What is proven now is the absent-state red (above) and the identity check
(V4, below), both of which are runnable on the pinned base with what the spec
itself provides.

**V4 (the declaration identity check) and V5 (the two out-of-spec mirrors)** —
all three states, from `prove-v3-v5.sh`. `V3` in that driver's output is the
spec's **V4**; the driver was written before the steps were renumbered, and the
mapping is stated rather than the output edited:

```text
=== STATE absent — the untouched worktree, nothing implemented ===
  V3 rc=1  node:internal/modules/cjs/loader:1478
  V5 rc=1  FAIL: ADR-0012 amendment missing
=== STATE compliant — hand-built ===
  V3 rc=0  git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
  V5 rc=0  V5 OK
=== STATE violating — hook residual reworded; a fourth declaration added ===
  V3 rc=1  git-env-extra,git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
  V5 rc=1  FAIL: row W1's hook residual was not left intact
```

The violating state moves two things independently, so neither attributes the
other: the hook-residual sentence is reworded (V5's third guard fires) and a
fourth declaration is added under this WP's own `wp` id (V4's identity check
fires). The compliant state is hand-built in scratch — the ADR heading and the
row-W1 sentence appended to real copies of the two target files — never in the
tree.

**V6 (`npm run lint`)** — green; the tail is in 0.6.

### 0.5 Internal coherence pass

Counts re-derived from the spec's own text by `coherence.js`, not read, and
every `file:line` citation extracted FROM the spec and resolved (rc 0):

```text
spec line count                                = 551
Table U rows                                   = 21  U1,U2,U3,U4,U5,U6,U7,U8,U9,U10,U11,U12,U13,U14,U15,U16,U17,U18,U19,U20,U21
U-ids mentioned anywhere but absent from table = none
U-rows never referenced outside their own row  = U8,U9,U12,U14,U15,U16,U17,U18,U19 (informational)
acceptance criteria                            = 8  AC1,AC2,AC3,AC4,AC5,AC6,AC7,AC8
verification steps (commented V-headers)        = 6  V1,V2,V3,V4,V5,V6
deliverable rows                               = 7
   create src/core/dream/git-env.js  exists=false 
   modify src/cli/dream.js  exists=true 
   modify tests/unit/dream-pipeline.test.js  exists=true 
   modify tests/red-proofs/dream-pipeline.proofs.json  exists=true 
   create tests/red-proofs/dream-git-env-pinning.proofs.json  exists=false 
   modify docs/adr/0012-dream-run-lifecycle.md  exists=true 
   modify docs/specs/done/WP-dream-promote-in-workspace.md  exists=true 
files touched (deliverables + the spec itself)  = 8  (README heuristic: <= 8)
file:line citations in the spec                = 17
   `src/cli/dream.js:587`
      FIRST:   assertGitRepo(vaultDir);
      LAST :   assertGitRepo(vaultDir);
   `src/core/dream/validate.js:64-81`
      FIRST: function git(vaultDir, args, opts = {}) {
      LAST : }
   `src/cli/dream.js:166-175`
      FIRST: function gitIn(spawnGit, cwd, args, opts = {}) {
      LAST : }
   `src/cli/dream.js:178-186`
      FIRST: function spawnGitPinned(o) {
      LAST : }
   `src/core/exec-identity.js:553`
      FIRST: function spawnPinnedSync(name, paths, opts = {}) {
      LAST : function spawnPinnedSync(name, paths, opts = {}) {
   `src/cli/dream.js:562`
      FIRST:   const spawnGit = opts.spawnGit || spawnGitPinned;
      LAST :   const spawnGit = opts.spawnGit || spawnGitPinned;
   `src/cli/dream.js:226-231`
      FIRST:   const tmpIndex = path.join(o.stateDir, `dream-index.${process.pid}.tmp`);
      LAST :   const withIndex = (args, opts) => g(args, { ...opts, env: indexEnv });
   `src/cli/dream.js:1007`
      FIRST:       const headWarnings = gitIn(spawnGit, vaultDir, ['show', `HEAD:${WARNINGS_REL}`], { allowFail: true });
      LAST :       const headWarnings = gitIn(spawnGit, vaultDir, ['show', `HEAD:${WARNINGS_REL}`], { allowFail: true });
   `tests/red-proofs/dream-pipeline.proofs.json:10-11`
      FIRST:       "find": "const indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex };",
      LAST :       "replace": "const indexEnv = { ...process.env }; void tmpIndex; /* RP_MUT_PRIVATE_INDEX_DROPPED */",
   `src/cli/run-job.js:150`
      FIRST: function buildCleanEnv(paths, name, platform = process.platform) {
      LAST : function buildCleanEnv(paths, name, platform = process.platform) {
   `src/core/dream/promote.js:387-418`
      FIRST: function constructMergeEnv(root) {
      LAST : }
   `src/core/exec-identity.js:93-118`
      FIRST: function resolveExecutable(name, env, platform) {
      LAST : }
   `src/cli/run-job.js:58-78`
      FIRST: const WIN_ENV_PASSTHROUGH = [
      LAST : ];
   `docs/specs/done/WP-criterion-red-harness.md:95`
      FIRST:   builds the private index environment at exactly one site — the `indexEnv`
      LAST :   builds the private index environment at exactly one site — the `indexEnv`
   `docs/specs/done/WP-audit-c-close-disposition.md:130`
      FIRST:   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
      LAST :   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
RED ids named in the Exact-contracts table     = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
RED ids in V4's `want`  array                    = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
template sections absent                       = none

COHERENCE: no failures
```

Findings, all fixed in this pass:

| # | Band | Finding | Fix |
|---|------|---------|-----|
| Z1 | B | AC5 and AC6 asserted `node scripts/red-proofs.js --wp <WP>` exits 0 — unsatisfiable on a correct implementation (0.4) | the gate moved to the whole-tree run; the selection kept with its expected exit code stated |
| Z2 | C | A citation read `dream.js:230` with no directory: it resolved against nothing, and its line number would rot the moment this WP edits that line | replaced with "the `indexEnv` line above" |
| Z3 | C | A Current-state bullet nested backticks inside a code span (markdownlint MD038) | the shape described instead of quoted |
| Z4 | B | `m2-config-code.sh`'s P12 alternates probe seeded both repositories identically, so its `read-tree` comparison compared a tree with itself and could not discriminate — it read `rc=0` on BOTH sides | re-run in M3 as P12b with distinct content — 128 without the alternates, 0 with; the defective probe is kept in M2's pasted output with its defect named here |
| Z5 | A | `prove-v3-v5.sh`'s `v3()` captured a pipeline's exit code, so all three states read `rc=0` — a proof that could not fail | pipe removed; the three states separate; recorded in this record's head |
| Z6 | B | **All seven `docs/runbooks/codex-review.md` citations in the first draft of THIS record were stale** — carried over from `2026-09-05-process-runbook-sweeps-design-gate-rounds.md`, which was written at `98a8b49a`, before `WP-process-runbook-sweeps` itself edited that runbook. Every one landed mid-paragraph in unrelated text (`:72-81`, the STOP CRITERION, resolved to the repeat-kind rule) | all seven re-derived by anchor and added to `check-ranges.js`, so 0.3's pasted output now covers them. **The general lesson: a citation copied from another record inherits that record's tree, not yours** — and the both-ends check is the only thing that sees it |

Bidirectional checks, all clean: Table U has 21 rows, ids `U1`–`U21` contiguous
and in order; no `U`-id is mentioned anywhere in the spec that the table does not
define; the three RED ids named in Exact contracts equal the three in V4's
`want` array, in both directions; all eight acceptance criteria and all six
verification steps are numbered contiguously; every Deliverables row's action
matches the file's actual presence (`create` → absent, `modify` → present); and
every template section is present.

### 0.6 Size

The spec is **551 lines**, above the ~400-line heuristic in
`docs/specs/README.md`. The overage is one 21-row canonical table whose rows
carry their own measured evidence, plus the two owner items with their
enumerated overrule costs. **It touches 8 files (7 Deliverables + the spec
itself), exactly the README's `≤ 8 files` bound** — and holding that bound is
why `src/core/dream/validate.js` was split out to
`WP-dream-git-env-validate-seam` rather than folded in (owner item O2). The
implementation itself is one ~30-line module, two call-site edits, one
re-targeted declaration and three new ones: an **S**.

`npm run lint`, run last, on the tree this record is committed with:

```text
$ npm run lint

--- markdownlint ---
markdownlint-cli2 v0.23.0 (markdownlint v0.41.0)
Finding: docs/**/*.md skills/**/*.md templates/**/*.md tests/**/*.md *.md
Linting: 651 file(s)
Summary: 0 error(s)
--- shellcheck ---
--- PSScriptAnalyzer ---
--- frontmatter check ---
frontmatter check passed: 269 spec(s), 4 agent(s)

lint passed
```

## Executor passes and external rounds

Appended by the orchestrator below this line.
