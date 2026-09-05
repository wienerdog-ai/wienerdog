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

**Pasted tool output in this record is normalized in two whitespace respects
and no other:** trailing whitespace was stripped so `git diff --check` exits 0 —
round 1's hermetic shadow found 30 such lines, all of them line-end spaces
inside quoted command output and blank neighbour lines in range dumps — and the
hard tabs `git ls-tree` puts before a path were expanded to one space, which
markdownlint's MD010 refuses even inside a fence. No visible character of any
pasted output was changed.

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

The spec is **550 lines** by `wc -l` — 0.5's pasted `coherence.js` output says
551 because it counts `split('\n')`'s array, whose last element is the empty
string after the trailing newline. The two numbers are the same file; the
convention is stated here so a reader does not read them as a disagreement.
It is above the ~400-line heuristic in
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

## Executor pass — template conformance

Run in a clean context by the orchestrator against `docs/specs/_TEMPLATE.md`
(`docs/runbooks/codex-review.md`, "Template conformance"). **Verdict:
NON-CONFORMANT on two items; both DROPPED by the orchestrator with a measured
precedent.** Everything else is PRESENT or explicitly `N/A`-marked: the executor
confirmed all five Mirrored-Surface categories, the Security-checklist `N/A`
line, AC8's `N/A` and the five Definition-of-done items.

| # | Item | Disposition |
|---|------|-------------|
| T1 | The `Authoring rules live in docs/runbooks/spec-authoring.md…` bullet under the H1 is absent | **DROP.** The worked example `docs/specs/done/WP-daily-summary-per-line-framing.md` — the only model spec, per `spec-authoring.md` — omits it too (grep count 0), as does the last matured spec `WP-process-runbook-sweeps`. It is an instruction to the author, not a section of the artifact |
| T2 | `## Contract reference` and `## Security checklist` drop the template's parenthetical hints | **DROP.** Identical in the worked example (`:129`, `:194`) |

## Executor pass — internal coherence

Run in a clean context, and it **RAN** V1–V6 rather than reading them — on a
plain `git archive` copy of the base, never in the worktree. All 20 citations
resolved except one (X3). Seven findings; all LIGHT, so no fresh external round
is owed by them and round 1 runs on the revised tip.

| # | Band | Finding | Disposition and what changed |
|---|------|---------|------------------------------|
| X1 | C | O2's overrule cost said "nine files": Deliverables has 7 rows and the fold-in adds 3 (`validate.js`, `dream-validate.test.js`, a second `proofs.json`) → **ten** | **FIX.** Corrected to ten, spelled as "three rows on top of this WP's seven". The S → M conclusion is unchanged — it was never the number that carried it |
| X2 | C | The Mirrored Surface Checklist said "AC1 quantifies over U1–U5" while AC1's own text says "rows U1–U4 … plus `GIT_INDEX_FILE` for exactly the private shapes" | **FIX.** The checklist entry now matches AC1's literal wording: U1–U4, reaching U5 through the private-shape clause |
| X3 | C | `docs/specs/done/WP-criterion-red-harness.md:95` is off by one — `:95` names `indexEnv`, the quoted literal is on `:96` | **FIX.** `:95-96`, re-checked at both ends |
| X4 | B | **AC1's discrimination is host-dependent.** A spread-then-delete implementation passes AC1 on any runner that exports no `GIT_*` — which is most of them. Rows U8 and U9, both MEASURED to reach a pinned shape, have no dedicated criterion | **FIX, in the smallest form.** AC1 gains a **CANARY** clause: the test exports one variable no Table U row names (`WIENERDOG_ENV_CANARY`, carried by the pipeline fixture's existing `ENV_KEYS` save/overwrite/restore) and asserts it appears in **no** observed `env`. A spread, a filtered copy or a delete-list fails that on every host, whatever the ambient environment holds. **No RED proofs were added for U8/U9** — that would be machinery growth to guard machinery (`codex-review.md:188-191`) |
| X5 | C | V3's comment claimed the selection "exits 1 with `RUN: FILTERED` (measured on `4b629ec6`)". On the base it is `VACUOUS: V2 — the selection matched no proof`, because this WP's declaration file does not exist yet; `FILTERED` was measured with `--wp WP-show-slot-own-value-kind` | **FIX.** The comment now states **both** measured shapes with the id each was measured under, and what the implementer will see once the file exists. What the step asserts is the CONTENT, not the exit code |
| X6 | B | V5 is a presence grep on exact strings: a copied heading over a wrong body passes it | **RESIDUAL, named in AC7.** The greps prove PRESENCE; the content obligations spelled out per amendment in the Mirrored Surface Checklist are the reviewer's read, judged over the whole cell and never over the grep window |
| X7 | C | V6 used `mapfile`, absent from macOS `/bin/bash` 3.2.57 — the only bash on this host (measured: `type mapfile` → not found) | **FIX.** Replaced with `$(git diff --name-only origin/main...HEAD)`; no tracked path in this repo carries a space. The comment now also records that on the DESIGN branch this check is **red by design** — the successor stub is outside Deliverables and must be — and that it is the implementation branch's gate |

**A residual X4 leaves standing, named here rather than closed.** Rows **U8**
(`GIT_COMMON_DIR`) and **U9** (`GIT_ALTERNATE_OBJECT_DIRECTORIES`) are each
MEASURED to reach a pinned shape and neither has a dedicated RED proof or a
dedicated behavioural criterion. What they rest on is **row U21 plus AC1's
canary**: the environment is built rather than filtered, and the canary is what
makes that construction observable on a host exporting neither variable. Adding
two more RED declarations would grow the verification surface to guard something
the construction already guarantees, which is the growth the convergence rule
forbids.

**The executor's own run, on a plain `git archive` copy of the base:**

| Step | rc | What it reported |
|------|----|------------------|
| V1 `npm test` | 0 | `2684` tests / `2672` pass / `0` fail / `12` skipped |
| V2 `node scripts/red-proofs.js` | 0 | `RUN: PROVEN`, 60 declared proofs |
| V3 `--wp WP-dream-git-env-pinning` | 1 | `VACUOUS: V2 — the selection matched no proof` — the deliverable-absent red |
| V4 declaration identity check | 1 | `MODULE_NOT_FOUND` — the declaration file is absent, RED as intended |
| V5 mirrors | 1 | fails at the ADR-0012 grep; the third guard (`NEITHER SUPPRESSED NOR DETECTED`) is TRUE today in isolation |
| V6 | lint 0 / boundary 1 | lint passed (`269 spec(s)`); `boundary-check` exits 1 naming `docs/specs/WP-dream-git-env-validate-seam.md` — expected on the docs branch, and now stated in V6's own comment (X7) |

Discrimination, as the executor judged it: AC2–AC4 behavioural and strong;
AC5/AC6 correctly scoped after round zero's own rewrite; AC7 weak (X6, named
residual); AC8 `N/A` by design.

## Orchestrator measurement — does `commit-tree` sign from the user's config?

**The question, and why it is the one worth asking of a carried key.** Row U2
carries `HOME`, deliberately, so the user's global git config still applies. That
opens a question no `GIT_*` enumeration can answer: can a *config* value the user
already has turn a **non-`GIT_*`** variable into a channel into a pinned shape?
The candidate is `commit.gpgsign=true` — if `commit-tree` signed from it, then
`GNUPGHOME`, `GPG_TTY` and `SSH_AUTH_SOCK` would each reach shape (8), and Table
U's carried-key set would be incomplete rather than merely short.

Driver: `scratchpad/orch/gpgsign.sh`, run on git 2.50.1 (Apple Git-155) in a
`mktemp -d` with `HOME` redirected into it — the real `~/.gitconfig` was checked
untouched afterwards.

```text
git version 2.50.1 (Apple Git-155)
case1 commit-tree with global commit.gpgsign=true: rc=0 stderr=
case1 gpg log:
case2 -c commit.gpgsign=false: rc=0 gpg log: ''
```

**Result: `commit-tree` does not sign from config.** With a global
`commit.gpgsign=true` and `gpg.program` pointed at a recording script, the
pinned shape exited 0 and **the script never ran** — the log is empty; the
`-c commit.gpgsign=false` control behaves identically, so the absence is not an
artefact of the override. The signing helpers are therefore **not** a channel
into any of the nine shapes, and carrying `HOME` does not open one.

**Recorded in Table U row U20**, whose title widens to *"transport, credential
and signing helpers"* and whose reach cell now carries this run as MEASURED for
the signing half while the transport half stays NOT MEASURED on the shape set.
The row also states why it is the one row where carrying `HOME` could have opened
a non-`GIT_*` channel — which is why it was measured rather than reasoned.

## Revision — the tree after X1–X7

The spec grew from **550 to 581 lines** (`wc -l`), all of it AC1's canary clause,
AC7's named residual, V3's and V6's corrected comments and row U20's measured
cell. **Sections 0.5 and 0.6 above are the round-zero record and are left as
they were measured**; the current numbers are here. `coherence.js` re-run on the
revised spec, rc 0:

```text
spec line count                                = 582
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
   `docs/specs/done/WP-criterion-red-harness.md:95-96`
      FIRST:   builds the private index environment at exactly one site — the `indexEnv`
      LAST :   constant, `{ ...process.env, GIT_INDEX_FILE: tmpIndex }`. This is stated as an
   `docs/specs/done/WP-audit-c-close-disposition.md:130`
      FIRST:   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
      LAST :   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
RED ids named in the Exact-contracts table     = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
RED ids in V4's `want`  array                    = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
template sections absent                       = none

COHERENCE: no failures
```

`npm run lint` on the revision commit's tree:

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

## Round 1 — external, double channel, tip `4cb6259f`

Both channels ran on `4cb6259f`, both returned **needs-attention**, and
`git status --porcelain` was byte-identical before and after in each. The raws
are committed **before** any of this was read or judged:

| Channel | Raw | Commit that introduced it |
|---------|-----|---------------------------|
| Codex plugin | `docs/specs/logbook/2026-09-06-git-env-pinning-gate-raw-round1-codex-plugin.txt` | `8b47487d` |
| Hermetic shadow | `docs/specs/logbook/2026-09-06-git-env-pinning-gate-raw-round1-herdr-shadow.txt` | `9c7d25a9` |

**Both verdicts are READINGS on the executable points, and both disclosed it.**
Neither sandbox could run the suite: `npm test` exited 1 before any test ran
(`mkdtemp` refused, EPERM) and `node scripts/red-proofs.js` the same way. The
shadow's `npm run lint` also failed on an unavailable registry lookup while its
frontmatter check passed. Every finding below therefore rests on the channels'
own targeted probes — which they executed and reported — and on this record's
re-derivation, not on a suite run.

### Findings, bands, criterion branch, disposition

| # | Channels | Band | Criterion branch (§0.1) | Disposition and what changed |
|---|----------|------|-------------------------|------------------------------|
| **R1-A** | shadow F1 + plugin F2 — **CONVERGED** | A | 4 (operative content) → **HEAVY** | **FIX.** Both executed the predicate: with `HOME`/`XDG_CONFIG_HOME` replaced by `/nonexistent`, AC1 passed — so a builder with constant or empty config roots, or a fixed shared index path, satisfied AC1–AC4 and reddened all three mutations while silently dropping the user's global config and its hooks. AC1 now asserts the complete **key → VALUE** map (each carried key equal to the value Table U decides; `GIT_INDEX_FILE` equal to `<paths.state>/dream-index.<pid>.tmp` on exactly the three `private` shapes and absent from the six `unset` ones), with deterministic set/unset fixtures instead of "present on the host". **And a new AC5, the POSITIVE CONTROL both channels asked for:** a hook configured through the user's config FILES still fires on the pinned `update-ref`, while the same hook injected through `GIT_CONFIG_COUNT` does not. AC5 is the executable statement of O1's principle, and it is also R1-B's "prove the chosen boundary" |
| **R1-B** | shadow F2 | A | 1 (**OWNER**) for the XDG half + 4 (**HEAVY**) for the rest | **FIX + PARK.** The reviewer is right on two facts and wrong on the frame. Facts: *"manual == scheduled"* was FALSE as written — `run-job` sets `HOME` from `paths.home` and carries no `XDG_CONFIG_HOME`; and the security checklist calling the launching environment *"the one untrusted input"* is what licensed reading `HOME=/attacker` as an injection. **Fixed:** `HOME` is now carried **as `paths.home`** (`src/core/paths.js:54`), the same code-derived value the scheduled child gets, so an environment that lies about `HOME` relocates the whole product — ADR-0025's half-sandbox contract, not a git channel of this WP; the security bullet is narrowed to what it means (untrusted **as a selector for the run's own git act** — repository, object store, index, config injection — not as the identity of the user the run acts for); `XDG_CONFIG_HOME` is **not carried**, which is what makes the manual==scheduled sentence true. **Parked as owner item O3** with its overrule cost, appended to `2026-09-05-owner-rulings-git-env-pinning-queue.md`. The frame the finding got wrong: a value the product already derives is not an injection channel merely because an environment variable participates in deriving it |
| **R1-C** | shadow F3 + plugin F3 — **CONVERGED** | B | 5/6 → **LIGHT**, folded into this pass | **FIX.** U20's *"no cost"* was false in two descendant directions. **(i) MEASURED here:** the user's own `reference-transaction` hook — the very hook O1 preserves — fires on the pinned `update-ref` under the constructed environment and therefore runs under **that** environment, losing the launching shell's `SSH_AUTH_SOCK`, `GNUPGHOME`, `GPG_TTY` and askpass variables; its environment is dumped below. **(ii) NOT MEASURED, `git help partial-clone` as provenance:** a partial-clone vault's pinned read can trigger a lazy `git fetch` subprocess, which loses agent-only authentication. U20 now reads **ABSENT, with TWO NAMED COSTS**, each framed as the manual run becoming identical to the scheduled one, which has had neither. O1's principle now says hooks stay **honoured — they RUN** — but run under the run's environment |
| **R1-D** | shadow F4 | C | 2 → **DESIGN** | **RE-DERIVED, not patched.** The provenance sentence promises the pinned argv for every MEASURED cell and one cell broke it: U10's second result used `update-index --refresh`, not the pinned `update-index --add --cacheinfo`. Per the criterion the response is a mechanical re-derivation of the whole table, not a row fix. One driver now issues **every** measured probe with the exact pinned argv, plus a chained replay of `commitNamedSet`'s own sequence; its full output is below and the Measured-reach column was rewritten **from** it. Result: U10's claim **survives with the correct argv** — `core.fsmonitor` fires on the pinned `update-index --add --cacheinfo` (2) and on `write-tree` (2) — and **five other rows changed**, three of them because the re-derivation found the old evidence too weak or too strong |
| **R1-E** | plugin F1 | A | 4 (**HEAVY** on the claims) | **FIX of the claims; the behaviour is ROUTED.** Executed by the reviewer and reproduced here: from a subdirectory of a repository, `rev-parse --git-dir` and `rev-parse HEAD` both exit 0 and resolve the **ancestor**; only a ceiling at the parent makes them 128. So `assertGitRepo` does not establish "the vault is its own repository root" — U15's scope sentence was false — and O2's *"never a commit into the wrong repository"* was an overclaim, **withdrawn**: a nested non-repository vault is targeted at its ancestor by discovery, today, independent of the environment. U15 now states the true precondition; O2's bound becomes *"no inherited environment variable decides the repository; repository DISCOVERY from the vault directory is unchanged by this WP"*; the successor stub gains the nested-vault question as a named second item with the cost of each of its three answers. **No run-set `GIT_CEILING_DIRECTORIES` was added** — it is a hardening proposal with a user-visible cost (a vault legitimately adopted inside a larger repository would stop dreaming) and becomes text only on an explicit owner yes |

**Round outcome: DESIGN** (branch 2 fired on R1-D), so a round 2 is owed on the
revised tip regardless of the other four being LIGHT or HEAVY.

**Housekeeping from the raws.** The shadow's `git diff --check` found trailing
whitespace in this record; stripped in the same commit as these fixes.

### R1-D — the re-derivation

Three drivers, all in scratch, all run from files: `rederive-table-u.sh` (every
probe, pinned argv, in isolation), `rederive-2-chained.sh` (the chained replay
plus the `env -i` probes re-run with their log path carried), and
`rederive-3-worktree.sh` (`U12` and `U15` on fresh repositories). Two harness
defects the re-derivation found in ITS OWN first pass are recorded rather than
silently corrected, because each produced a plausible-looking wrong number:

- **Under `env -i`, the recording scripts inherited no log variable**, so they
  could not write and every count read `0`. Part 1's `U2`, `U3` and `U20` blocks
  are that defect, not a measurement; part 2 re-runs them with the log path
  carried and they read `2`, `2` and `0` respectively.
- **Part 1's later blocks ran against a vault whose HEAD earlier probes had
  already advanced**, so `U12`'s `rev-parse HEAD -> NOT-VAULT` line compares
  against a stale baseline. Part 3 re-runs `U12` on a fresh repository: every
  shape identical with and without the variable.

**And one defect that reached outside the scratch tree, disclosed rather than
buried.** Part 2's first run carried a backtick pair inside a double-quoted
`echo` argument — the words *a real*, then a backticked `git commit`, inside
double quotes — which the shell executed as a command substitution in the
driver's own working directory, the **main checkout**. It
printed that checkout's status and exited without committing (`nothing added to
commit`). Verified immediately afterwards and again after the re-run: `HEAD` is
`4b629ec6`, the working tree carries the same single untracked directory it
started with, and `git reflog -1` is unchanged — **nothing was written**. The
line now uses single quotes. This is `codex-review.md`'s "run a gate from a
script, not from an inline shell one-liner" arriving from the one direction that
rule does not name: the quoting hazard inside a script, not the invocation of it.

#### Part 1 — every probe with the pinned argv, in isolation

```text
ROOT=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.DcvsiXWE3p
git: git version 2.50.1 (Apple Git-155)
vault  HEAD=5efd883d83f6be6fc136d54cf79791d988f37752 tree=4b6ba41e22b4ece94115c6c7757ec76d53964a0f blob(a.txt)=98dd3ab8e7fa1a16d516ee4636ce96d9206f29a2
other  HEAD=4893f9794b3e3a03749dc6b4168b92f1815595e7 tree=da3faabc2fcb5ab8064a3910b9cb8c37719e37d8

== U-BASELINE: the nine shapes under the ambient environment ==
  [baseline]
    (1) ls-tree            rc=0  100644 blob 98dd3ab8e7fa1a16d516ee4636ce96d9206f29a2 a.txt
    (2) hash-object -w     rc=0  sha=737cf08b4737f757ca4e8d4f824922499bcc3312  inVault=yes inOther=no
    (6) read-tree          rc=0  [private index]
    (3) update-index --add --cacheinfo  rc=0  [private index]
    (7) write-tree         rc=0  tree=4b6ba41e22b4ece94115c6c7757ec76d53964a0f
    (4) show HEAD:reports/warnings.md   rc=0  vault-warnings
    (5) rev-parse HEAD     rc=0  5efd883d83f6be6fc136d54cf79791d988f37752  (VAULT)

== U6 GIT_DIR=<other>/.git, all nine ==
  [GIT_DIR=other]
    (1) ls-tree            rc=128  fatal: not a tree object
    (2) hash-object -w     rc=0  sha=a9d88c3f9bdbac069986d019bb99681b4e39ec6a  inVault=no inOther=yes
    (6) read-tree          rc=128  [private index]
    (3) update-index --add --cacheinfo  rc=0  [private index]
    (7) write-tree         rc=128  tree=error: invalid object 100644 98dd3ab8e7fa1a16d516ee4636ce96d9206f29a2 for 'a.txt'
    (4) show HEAD:reports/warnings.md   rc=128  fatal: path 'reports/warnings.md' exists on disk, but not in 'HEAD'
    (5) rev-parse HEAD     rc=0  4893f9794b3e3a03749dc6b4168b92f1815595e7  (NOT-VAULT)
    (8) commit-tree        rc=128  new=fatal: 4b6ba41e22b4ece94115c6c7757ec76d53964a0f is not a valid object
    (9) update-ref         rc=128
    -> other HEAD 4893f9794b3e3a03749dc6b4168b92f1815595e7 -> 4893f9794b3e3a03749dc6b4168b92f1815595e7  moved=no
    -> vault HEAD 5efd883d83f6be6fc136d54cf79791d988f37752 -> 5efd883d83f6be6fc136d54cf79791d988f37752  moved=no

== U7 GIT_OBJECT_DIRECTORY=<other>/.git/objects (GIT_DIR unset), all nine ==
  [GIT_OBJECT_DIRECTORY=other]
    (1) ls-tree            rc=128  fatal: not a tree object
    (2) hash-object -w     rc=0  sha=740f49c2aa8b09dbda89c18b1285c56956b93f38  inVault=no inOther=yes
    (6) read-tree          rc=128  [private index]
    (3) update-index --add --cacheinfo  rc=0  [private index]
    (7) write-tree         rc=128  tree=error: invalid object 100644 98dd3ab8e7fa1a16d516ee4636ce96d9206f29a2 for 'a.txt'
    (4) show HEAD:reports/warnings.md   rc=128  fatal: path 'reports/warnings.md' exists on disk, but not in 'HEAD'
    (5) rev-parse HEAD     rc=0  5efd883d83f6be6fc136d54cf79791d988f37752  (VAULT)

== U8 GIT_COMMON_DIR=<other>/.git with GIT_DIR=<vault>/.git, all nine ==
  [GIT_COMMON_DIR=other]
    (1) ls-tree            rc=128  fatal: not a tree object
    (2) hash-object -w     rc=0  sha=e95edc8aeb52d8966a91323beb184a7248de1e67  inVault=no inOther=yes
    (6) read-tree          rc=128  [private index]
    (3) update-index --add --cacheinfo  rc=0  [private index]
    (7) write-tree         rc=128  tree=error: invalid object 100644 98dd3ab8e7fa1a16d516ee4636ce96d9206f29a2 for 'a.txt'
    (4) show HEAD:reports/warnings.md   rc=128  fatal: path 'reports/warnings.md' exists on disk, but not in 'HEAD'
    (5) rev-parse HEAD     rc=0  5efd883d83f6be6fc136d54cf79791d988f37752  (VAULT)

== U9 GIT_ALTERNATE_OBJECT_DIRECTORIES: pinned read-tree of a tree only in OTHER ==
fatal: failed to unpack tree object da3faabc2fcb5ab8064a3910b9cb8c37719e37d8
    without alternates rc=128
    with alternates    rc=0  index holds: b.txt

== U10 GIT_CONFIG_COUNT injecting core.fsmonitor, per PINNED shape ==
  [GIT_CONFIG_COUNT] which pinned shape RUNS core.fsmonitor?
    ls-tree: fsmonitor-invocations=0
    hash-object: fsmonitor-invocations=0
    read-tree: fsmonitor-invocations=0
    update-index: fsmonitor-invocations=2
    write-tree: fsmonitor-invocations=2
    show: fsmonitor-invocations=0
    rev-parse: fsmonitor-invocations=0

== U10 GIT_CONFIG_COUNT injecting core.hooksPath, on the pinned update-ref ==
    (9) update-ref rc=0  hook-invocations=2
      REFTX HOOK RAN prepared
      REFTX HOOK RAN committed

== U11 GIT_CONFIG_GLOBAL selecting a config carrying core.fsmonitor, per PINNED shape ==
  [GIT_CONFIG_GLOBAL] which pinned shape RUNS core.fsmonitor?
    ls-tree: fsmonitor-invocations=0
    hash-object: fsmonitor-invocations=0
    read-tree: fsmonitor-invocations=0
    update-index: fsmonitor-invocations=2
    write-tree: fsmonitor-invocations=2
    show: fsmonitor-invocations=0
    rev-parse: fsmonitor-invocations=0

== U2 HOME-resolved ~/.gitconfig carrying core.fsmonitor, per PINNED shape ==
  [HOME=<fixture>] which pinned shape RUNS core.fsmonitor?
    ls-tree: fsmonitor-invocations=0
    hash-object: fsmonitor-invocations=0
    read-tree: fsmonitor-invocations=0
    update-index: fsmonitor-invocations=0
    write-tree: fsmonitor-invocations=0
    show: fsmonitor-invocations=0
    rev-parse: fsmonitor-invocations=0

== U3 XDG_CONFIG_HOME-resolved git/config carrying core.fsmonitor, per PINNED shape ==
  [XDG_CONFIG_HOME=<fixture>, HOME has no .gitconfig] which pinned shape RUNS core.fsmonitor?
    ls-tree: fsmonitor-invocations=0
    hash-object: fsmonitor-invocations=0
    read-tree: fsmonitor-invocations=0
    update-index: fsmonitor-invocations=0
    write-tree: fsmonitor-invocations=0
    show: fsmonitor-invocations=0
    rev-parse: fsmonitor-invocations=0

== U12 GIT_WORK_TREE=<empty dir>, all nine ==
  [GIT_WORK_TREE=empty]
    (1) ls-tree            rc=0  100644 blob 98dd3ab8e7fa1a16d516ee4636ce96d9206f29a2 a.txt
    (2) hash-object -w     rc=0  sha=d6be993a29e2ac6d5d49506937c005415eb1cf8f  inVault=yes inOther=no
    (6) read-tree          rc=0  [private index]
    (3) update-index --add --cacheinfo  rc=0  [private index]
    (7) write-tree         rc=0  tree=4b6ba41e22b4ece94115c6c7757ec76d53964a0f
    (4) show HEAD:reports/warnings.md   rc=0  vault-warnings
    (5) rev-parse HEAD     rc=0  78c4264b5d1c9f4ab59b90bb2c686743aa2c0299  (NOT-VAULT)

== U13 inherited GIT_INDEX_FILE on the SIX unset-disposition shapes ==
    (5) rev-parse    rc=0
    (1) ls-tree      rc=0
    (2) hash-object  rc=0
    (4) show         rc=0
    (8) commit-tree  rc=0
    (9) update-ref   rc=0
    pointed-at index bytes changed across all six: no

== U14 GIT_NAMESPACE on the pinned update-ref ==
    (9) update-ref rc=0
    real HEAD b17032a687294ef630631e03ead27895bc57672f -> 06d2c1a057cff754b3dd8eaaf3a8b0fb196fe1cc  moved=YES
    refs under refs/namespaces/: ''

== U15 GIT_CEILING_DIRECTORIES, and R1-E's nested-directory case ==
    vault is its own repo root:
      ceiling=<vault>  rev-parse HEAD rc=0
      ceiling=<parent> rev-parse HEAD rc=0
    R1-E: a NON-repository directory INSIDE a repository (<vault>/nested/deep):
      rev-parse --git-dir rc=0 out=/private/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.DcvsiXWE3p/vault/.git
      rev-parse HEAD      rc=0 out=06d2c1a057cff754b3dd8eaaf3a8b0fb196fe1cc  (the ANCESTOR repository)
      with ceiling at the parent: rev-parse --git-dir rc=128 out=fatal: not a git repository (or any of the parent directories): .git

== U16 GIT_EXEC_PATH: a planted git-hash-object, with a live-channel control ==
    (2) hash-object -w --stdin -> 4f6c4ee9d928270b4304e3abcd8d81df3e740d12 ; planted-binary invocations=0
    control: git wdprobe (non-builtin) -> planted-binary invocations=1
      FAKE git-wdprobe RAN

== U17 GIT_ATTR_* / filter drivers on the pinned show and hash-object ==
    (4) show      rc=0 filter-invocations=0
    (2) hash-object (no --path) rc=0 filter-invocations=0

== U20 signing: does the pinned commit-tree sign from the user's config? ==
    (8) commit-tree rc=0 out=0716fe7b588eaf73a23563b089a25c3787eb0f90  gpg-program invocations=0

== R1-C(i) the user's own hook, fired by the pinned update-ref UNDER THE CONSTRUCTED ENV ==
    (9) update-ref rc=0  (constructed env = PATH + HOME + the log path only)
    the hook the USER configured through ~/.gitconfig DID fire: 2 time(s)
    and this is the environment it ran under:
      --- reference-transaction hook fired (prepared); its environment: ---
      CPATH=/usr/local/include
      GIT_EXEC_PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core
      GIT_PREFIX=
      HOME=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.DcvsiXWE3p/uhome
      HOOKENV_LOG=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.DcvsiXWE3p/hookenv.log
      LIBRARY_PATH=/usr/local/lib
      MANPATH=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/share/man:/Library/Developer/CommandLineTools/usr/share/man:/Library/Developer/CommandLineTools/Toolchains/XcodeDefault.xctoolchain/usr/share/man:
      PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core:/usr/bin
      PWD=/private/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.DcvsiXWE3p/vault
      SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk
      SHLVL=1
      _=/usr/bin/env
      __CF_USER_TEXT_ENCODING=0x1F5:0x0:0x0
      --- end hook env ---
      --- reference-transaction hook fired (committed); its environment: ---
      CPATH=/usr/local/include
      GIT_EXEC_PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core
      GIT_PREFIX=
      HOME=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.DcvsiXWE3p/uhome
      HOOKENV_LOG=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.DcvsiXWE3p/hookenv.log
      LIBRARY_PATH=/usr/local/lib
      MANPATH=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/share/man:/Library/Developer/CommandLineTools/usr/share/man:/Library/Developer/CommandLineTools/Toolchains/XcodeDefault.xctoolchain/usr/share/man:
      PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core:/usr/bin
      PWD=/private/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.DcvsiXWE3p/vault
      SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk
      SHLVL=1
      _=/usr/bin/env
      __CF_USER_TEXT_ENCODING=0x1F5:0x0:0x0
      --- end hook env ---

ROOT kept at /var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.DcvsiXWE3p
```

#### Part 2 — the chained replay, and the `env -i` probes with their log path carried

```text
ROOT=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.AiBKGLylVS
git: git version 2.50.1 (Apple Git-155)

== A0 the chain under the ambient environment (control) ==
  [control]  vault=765472c4bc07e27ab5cfa8597df5c9210e2ddedf other=aace11f2667d99b03e4d70f0b6a5b52c183356f8
    (5) rev-parse HEAD                  rc=0 -> 765472c4bc07e27ab5cfa8597df5c9210e2ddedf  (VAULT)
    (6) read-tree <own head>            rc=0
    (1) ls-tree <own head> -- a.txt     rc=0 mode=100644
    (2) hash-object -w --stdin          rc=0 sha=ced0d24043540233faea11b8d511d4b4bc63f235  inVault=yes inOther=no
    (3) update-index --add --cacheinfo  rc=0
    (7) write-tree                      rc=0 tree=ce270befa9aa56fbae2ee0361e1d2991a070f7e8
    (8) commit-tree <own tree> -p <own head>  rc=0 commit=a2af3b93eb7b88735add1adc6ba64dbb739c012a
    (9) update-ref -m … HEAD <new> <old> rc=0
    => vault HEAD moved: YES   other HEAD moved: no

== A1 the chain under an inherited GIT_DIR=<other>/.git ==
  [GIT_DIR=other]  vault=0f4b655c3ae426d972f3691d696e5155c5f85118 other=8aa6292e5444032622f1fd427e17f858631cacad
    (5) rev-parse HEAD                  rc=0 -> 8aa6292e5444032622f1fd427e17f858631cacad  (OTHER)
    (6) read-tree <own head>            rc=0
    (1) ls-tree <own head> -- a.txt     rc=0 mode=100644
    (2) hash-object -w --stdin          rc=0 sha=ced0d24043540233faea11b8d511d4b4bc63f235  inVault=no inOther=yes
    (3) update-index --add --cacheinfo  rc=0
    (7) write-tree                      rc=0 tree=f3d572684438883912118b230e40b248ceed7410
    (8) commit-tree <own tree> -p <own head>  rc=0 commit=8c1ac24232d94433f5bec29a8fbbd92d4b275708
    (9) update-ref -m … HEAD <new> <old> rc=0
    => vault HEAD moved: no   other HEAD moved: YES

== A2 the chain under an inherited GIT_OBJECT_DIRECTORY=<other>/.git/objects ==
  [GIT_OBJECT_DIRECTORY=other]  vault=2acae50dad28eb5c1f79608c5aca94167467a383 other=325992cd1d3c0764b4e5b9a9d5c59f7718a078c6
    (5) rev-parse HEAD                  rc=0 -> 2acae50dad28eb5c1f79608c5aca94167467a383  (VAULT)
    (6) read-tree <own head>            rc=128
    ABORTS HERE — the run stops before it writes anything

== A3 the chain under GIT_DIR=<vault>/.git + GIT_COMMON_DIR=<other>/.git ==
  [GIT_COMMON_DIR=other]  vault=a70081b86452fe53c4dd11ca3a4e890f381fada3 other=3cf81e26eca0ef7b13caf6678ce465be0718008d
    (5) rev-parse HEAD                  rc=0 -> a70081b86452fe53c4dd11ca3a4e890f381fada3  (VAULT)
    (6) read-tree <own head>            rc=128
    ABORTS HERE — the run stops before it writes anything

== B1 U2 — HOME-resolved ~/.gitconfig carrying core.fsmonitor (log path carried) ==
  [env -i PATH,HOME,FSM_LOG] which pinned shape RUNS core.fsmonitor?
    ls-tree: fsmonitor-invocations=0
    hash-object: fsmonitor-invocations=0
    read-tree: fsmonitor-invocations=0
    update-index: fsmonitor-invocations=2
    write-tree: fsmonitor-invocations=2
    show: fsmonitor-invocations=0
    rev-parse: fsmonitor-invocations=0

== B2 U3 — XDG_CONFIG_HOME-resolved git/config, HOME holding no .gitconfig ==
  [env -i PATH,HOME(empty),XDG_CONFIG_HOME,FSM_LOG] which pinned shape RUNS core.fsmonitor?
    ls-tree: fsmonitor-invocations=0
    hash-object: fsmonitor-invocations=0
    read-tree: fsmonitor-invocations=0
    update-index: fsmonitor-invocations=2
    write-tree: fsmonitor-invocations=2
    show: fsmonitor-invocations=0
    rev-parse: fsmonitor-invocations=0

== B3 U3 control — the SAME XDG config with XDG_CONFIG_HOME NOT carried ==
  [env -i PATH,HOME(empty),FSM_LOG] which pinned shape RUNS core.fsmonitor?
    ls-tree: fsmonitor-invocations=0
    hash-object: fsmonitor-invocations=0
    read-tree: fsmonitor-invocations=0
    update-index: fsmonitor-invocations=0
    write-tree: fsmonitor-invocations=0
    show: fsmonitor-invocations=0
    rev-parse: fsmonitor-invocations=0

== B4 U20 signing — the pinned commit-tree under a HOME whose config sets commit.gpgsign (log path carried) ==
    (8) commit-tree rc=0 out=553b8d6f5d79d728ffd33af3b1c2527c08897f65
    gpg-program invocations=0
    control - the same config used by a real "git commit" instead of the pinned plumbing:
    after a real git-commit under the same HOME: gpg-program invocations=1
      FAKEGPG RAN --status-fd=2 -bsau t <t@e>

ROOT kept at /var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.AiBKGLylVS
```

#### Part 3 — `U12` and `U15` on fresh repositories

```text
ROOT=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.O7eCHnn7Xi  git: git version 2.50.1 (Apple Git-155)
vault HEAD=5799509701d9e5f6a6076ee3e940535b9ac2764e tree=4b6ba41e22b4ece94115c6c7757ec76d53964a0f

== U12 GIT_WORK_TREE=<empty dir>, all nine shapes, FRESH repo, nothing run before ==
  [baseline]
    (1) ls-tree      rc=0 100644 blob 98dd3ab8e7fa1a16d516ee4636ce96d9206f29a2 a.txt
    (2) hash-object  rc=0 sha=4f6c4ee9d928270b4304e3abcd8d81df3e740d12
    (6) read-tree    rc=0
    (3) update-index rc=0
    (7) write-tree   rc=0 tree=4b6ba41e22b4ece94115c6c7757ec76d53964a0f
    (4) show         rc=0 vault-warnings
    (5) rev-parse    rc=0 5799509701d9e5f6a6076ee3e940535b9ac2764e (VAULT)
    (8) commit-tree  rc=0 3c45323b5eb7428c1d0fe6e00833f7c8fc2f28f4
    (9) update-ref   rc=0  vault HEAD moved: YES
  [GIT_WORK_TREE]
    (1) ls-tree      rc=0 100644 blob 98dd3ab8e7fa1a16d516ee4636ce96d9206f29a2 a.txt
    (2) hash-object  rc=0 sha=4f6c4ee9d928270b4304e3abcd8d81df3e740d12
    (6) read-tree    rc=0
    (3) update-index rc=0
    (7) write-tree   rc=0 tree=4b6ba41e22b4ece94115c6c7757ec76d53964a0f
    (4) show         rc=0 vault-warnings
    (5) rev-parse    rc=0 3c45323b5eb7428c1d0fe6e00833f7c8fc2f28f4 (NOT-VAULT)
    (8) commit-tree  rc=0 603ed857087a0fe0556938cac69eec2357d2857e
    (9) update-ref   rc=0  vault HEAD moved: YES

== U15 GIT_CEILING_DIRECTORIES on a vault that IS its own repository root ==
    no ceiling        rev-parse HEAD rc=0
    ceiling=<vault>   rev-parse HEAD rc=0
    ceiling=<parent>  rev-parse HEAD rc=0
ROOT kept at /var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.O7eCHnn7Xi
```

#### R1-C(i) — the user's hook fires, and this is the environment it runs under

The tail of part 1, quoted again because it is the measurement R1-C rests on:
the hook the user configured through their own `~/.gitconfig` fired twice on the
pinned `update-ref` under an environment of `PATH`, `HOME` and the log path
only — so **honoured** is true — and its environment contains none of
`SSH_AUTH_SOCK`, `GNUPGHOME`, `GPG_TTY` or any askpass variable. What it does
contain beyond the constructed map is git's own additions (`GIT_EXEC_PATH`,
`GIT_PREFIX`, `PWD`, a `PATH` prefixed with `git-core`) and four variables Apple's
`/usr/bin/git` shim injects (`CPATH`, `LIBRARY_PATH`, `MANPATH`, `SDKROOT`) —
neither of which this WP controls, and both stated so the dump is not read as
the constructed map alone.

#### Per-row result of the re-derivation

| Row | Result | What moved |
|-----|--------|-----------|
| U1 `PATH` | unchanged | rests on a code reading of `resolveExecutable`/`verifyPin`, not on a git probe |
| U2 `HOME` | **CHANGED** | probe replaced by the pinned argv (a `~/.gitconfig` `core.fsmonitor` runs on `update-index --add --cacheinfo` and `write-tree`, 2 each, and on no other shape) **and** the disposition now pins the SOURCE of the value to `getPaths().home` — a claim about where it comes from, not about what it says (R1-B, narrowed by R1-F) |
| U3 `XDG_CONFIG_HOME` | **CHANGED** | CARRIED → **NOT CARRIED** with a named cost (R1-B, owner item O3); measured in both directions, including the not-carried control at 0 |
| U4 win32 | **CHANGED** | `USERPROFILE` moves to a SET value (`paths.home`, mirroring `run-job.js:155`); `HOMEDRIVE`/`HOMEPATH` dropped — they would resolve the config against something other than the bound home |
| U5 `GIT_INDEX_FILE` (ours) | **CHANGED** | the exact value is now part of the row and of AC1, not merely the key |
| U6 `GIT_DIR` | **CHANGED** | the isolated four-shape claim is **withdrawn** — fed the vault's own object names, five shapes exit 128. The chained replay is the measurement: `rev-parse HEAD` returns the other repository's head and every following shape succeeds against it, ending with **the other repository's HEAD moved and the vault's unmoved** |
| U7 `GIT_OBJECT_DIRECTORY` | **CHANGED** | two facts now: isolated, the pinned `hash-object -w --stdin` writes into the other object store; chained, `read-tree <own head>` exits 128 first and the run aborts before writing |
| U8 `GIT_COMMON_DIR` | **CHANGED** | same two facts as U7 |
| U9 alternates | unchanged | re-reproduced with the pinned `read-tree «tree-ish»`: 128 without, 0 with, and the other repository's path enters the private index |
| U10 `GIT_CONFIG_*_n` | **CHANGED (evidence), conclusion stands** | the pinned `update-index --add --cacheinfo` **does** run `core.fsmonitor` (2), as does `write-tree` (2); the five read shapes do not. The `--refresh` argv the finding named is gone from the record |
| U11 `GIT_CONFIG_GLOBAL` | **CHANGED** | widened, correctly: the same two-shape profile as U10, not `write-tree` alone |
| U12 `GIT_WORK_TREE` | **CHANGED (evidence)** | re-run on a fresh repository — all nine shapes identical with and without it; the earlier `NOT-VAULT` line is disclosed as a stale-baseline artifact |
| U13 inherited `GIT_INDEX_FILE` | unchanged | the six `unset` shapes leave the pointed-at index byte-identical |
| U14 `GIT_NAMESPACE` | unchanged | the pinned `update-ref … HEAD` moved the repository's real head; no ref under `refs/namespaces/` |
| U15 `GIT_CEILING_DIRECTORIES` | **CHANGED** | no reach for a root vault (three ceilings, all rc 0), and the scope sentence is corrected for R1-E: discovery from `-C <vault>` resolves an ancestor for a nested non-repository directory |
| U16 `GIT_EXEC_PATH` | unchanged | planted `git-hash-object` not executed; planted `git-wdprobe` executed — the live-channel control |
| U17 `GIT_ATTR_*` | unchanged | no filter driver ran for the pinned `show` or `hash-object -w --stdin` |
| U18 / U19 | unchanged | NOT MEASURED, provenance stated |
| U20 transport/signing | **CHANGED** | signing re-measured with the pinned `commit-tree` **and a live-config control** (a real `git commit` under the same home invokes the program once, so the zero is about `commit-tree`); two named costs added (R1-C) |
| U21 closure row | unchanged | the mechanism row |

Twelve of twenty-one rows moved. **Nothing in the table now rests on a probe
whose argv is not one of the nine.**

### R1-F — orchestrator spot-check before round 2 (branch 6, LIGHT)

Found by the orchestrator on `e9ef98bf`, before round 2 was launched, and landed
first because a reviewer would have found it in minutes. **AC1's `HOME` bullet
was unsatisfiable as written.** It said *"the fixture makes those two DIFFER, so
an implementation that copies rather than derives fails here"* — but
`getPaths()` is `env.HOME || os.homedir()` (`src/core/paths.js:53-54`) and on
POSIX `os.homedir()` reads `$HOME` first, so whenever the launching environment
sets `HOME` the two are equal **by construction** and no fixture can separate a
copying `buildGitEnv` from a deriving one. Reproduced here rather than accepted
on the report:

```text
$ node verify-home.js
A: HOME set to the ambient value
   process.env.HOME = "/Users/gyulafeher"
   os.homedir()     = "/Users/gyulafeher"
   getPaths().home  = "/Users/gyulafeher"
   equal to env.HOME? true
B: HOME overridden to /tmp/some-other-home
   process.env.HOME = "/tmp/some-other-home"
   os.homedir()     = "/tmp/some-other-home"
   getPaths().home  = "/tmp/some-other-home"
   equal to env.HOME? true
C: HOME DELETED from the environment
   process.env.HOME = undefined
   os.homedir()     = "/Users/gyulafeher"
   getPaths().home  = "/Users/gyulafeher"
   equal to env.HOME? false
```

**The only observable difference is `HOME` unset in the launching environment**:
a copy carries no `HOME` key, the derivation carries one equal to
`getPaths().home` — case C above. Three surfaces changed, all wording:

- **AC1's `HOME` bullet** now states the coincidence, names the unset case as the
  discriminating one, and asserts **both** — the set case in the pipeline fixture,
  the unset case directly against `buildGitEnv` with `process.env.HOME` deleted
  around the call. The unit-level form for the unset case is deliberate: the
  pipeline fixture overrides `WIENERDOG_HOME`, `WIENERDOG_VAULT`,
  `CLAUDE_CONFIG_DIR` and `CODEX_HOME` (`tests/unit/dream-pipeline.test.js:411-414`)
  but would leave `home` itself to fall back to the developer's real home.
- **Table U row U2** said *"never the launching shell's string"*. **Withdrawn** —
  with `HOME` set it IS that string. What the row claims now is the SOURCE: the
  value is taken through the run's single authority, which is what makes it the
  same home the vault and state dir derive from, the same value the scheduled
  child gets, and what carries a `HOME` when the shell has none.
- **O1's principle paragraph** and the `dream-pipeline.test.js` mirror entry
  follow the same correction; the mirror entry now records that the set/unset
  split across the two test levels is itself part of the mirror.

**The lesson, which is not about `HOME`:** the first draft asserted a
DISCRIMINATION without running the two implementations it claimed to separate.
`codex-review.md`'s "a claim about how a tool behaves is a claim to be RUN"
reaches this case — the tool was `os.homedir()`, and one `node -e` would have
shown it.

### Revision — the tree after R1-A … R1-E

The spec grew from **581 to 700 lines** (`wc -l`): AC1's key→value map, the new
AC5 positive control, O3, O1's two rewritten paragraphs, O2's withdrawn bound,
twelve rewritten Table U cells and R1-F's `HOME` correction. It still touches **8 files** — the seven
Deliverables plus the spec itself — the README bound. `coherence.js` on the revised spec, rc 0 —
note the acceptance criteria now number **nine** and every one of the 19 distinct
`file:line` citations resolves, including the three added this round
(`src/core/paths.js:53-54`, `src/cli/run-job.js:47-50`, `:155`):

```text
spec line count                                = 701
Table U rows                                   = 21  U1,U2,U3,U4,U5,U6,U7,U8,U9,U10,U11,U12,U13,U14,U15,U16,U17,U18,U19,U20,U21
U-ids mentioned anywhere but absent from table = none
U-rows never referenced outside their own row  = U8,U9,U12,U14,U15,U16,U17,U18,U19 (informational)
acceptance criteria                            = 9  AC1,AC2,AC3,AC4,AC5,AC6,AC7,AC8,AC9
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
file:line citations in the spec                = 25
   `src/core/paths.js:53-54`
      FIRST: function getPaths(env = process.env) {
      LAST :   const home = env.HOME || os.homedir();
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
   `src/core/paths.js:54`
      FIRST:   const home = env.HOME || os.homedir();
      LAST :   const home = env.HOME || os.homedir();
   `src/cli/dream.js:179`
      FIRST:   return spawnPinnedSync('git', getPaths(), {
      LAST :   return spawnPinnedSync('git', getPaths(), {
   `src/core/dream/promote.js:387-418`
      FIRST: function constructMergeEnv(root) {
      LAST : }
   `src/core/exec-identity.js:93-118`
      FIRST: function resolveExecutable(name, env, platform) {
      LAST : }
   `src/cli/run-job.js:47-50`
      FIRST: const ENV_PASSTHROUGH = [
      LAST : ];
   `src/cli/run-job.js:155`
      FIRST:       USERPROFILE: paths.home, // deterministic homedir for children / os.homedir()
      LAST :       USERPROFILE: paths.home, // deterministic homedir for children / os.homedir()
   `src/cli/run-job.js:58-78`
      FIRST: const WIN_ENV_PASSTHROUGH = [
      LAST : ];
   `docs/specs/done/WP-criterion-red-harness.md:95-96`
      FIRST:   builds the private index environment at exactly one site — the `indexEnv`
      LAST :   constant, `{ ...process.env, GIT_INDEX_FILE: tmpIndex }`. This is stated as an
   `docs/specs/done/WP-audit-c-close-disposition.md:130`
      FIRST:   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
      LAST :   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
   `tests/unit/dream-pipeline.test.js:411-414`
      FIRST:   Object.assign(process.env, {
      LAST :   });
RED ids named in the Exact-contracts table     = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
RED ids in V4's `want`  array                    = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
template sections absent                       = none

COHERENCE: no failures
```

`npm run lint` on the revision commit's tree:

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

## Round 2 — external, double channel, tip `235af369`

Both channels ran on `235af369`, both returned **needs-attention**, and
`git status --porcelain` was byte-identical before and after in each. Raws
committed before any of this was read:

| Channel | Raw | Commit that introduced it |
|---------|-----|---------------------------|
| Codex plugin | `docs/specs/logbook/2026-09-06-git-env-pinning-gate-raw-round2-codex-plugin.txt` | `f69eee7b` |
| Hermetic shadow | `docs/specs/logbook/2026-09-06-git-env-pinning-gate-raw-round2-herdr-shadow.txt` | `5251057e` |

**Both verdicts are again READINGS on the executable points, and both disclosed
it**: `npm test` and `node scripts/red-proofs.js` each exited 1 before running,
on `mkdtemp`/sandbox EPERM, and the shadow's `npm run lint` failed on an
unavailable registry lookup while its frontmatter check passed. What each channel
DID execute — targeted `getPaths()`, `buildCleanEnv`, `git var` and citation
probes — is what its findings rest on, and those are reproduced below rather than
taken on report.

**Round-1 status, as both channels reported it:** R1-A, R1-C and R1-E fixed;
R1-B and R1-D partially. **No band A this round.**

### The round outcome, and why it is an EXTRACTION

Both channels state, and the orchestrator concurs, that this is the **second
consecutive round landing findings on Table U rows** — R1-D last round, R2-A and
R2-B this round. §0.1's ladder puts that at **branch 3: the ADR-0031 contract
extraction**, not a third row patch. R2-C is branch 2 (the probe method). Round
outcome: **DESIGN / EXTRACTION**.

**What the breaker actually found, which is the part worth keeping.** The
findings were never about Table U's DECISIONS. They were about the **prose inside
its cells** — rationales ("relocates the whole product"), equivalence claims
("manual == scheduled") and restated counts. Three kinds of content shared one
surface, so a correction to any one of them was a change to a table row, and the
table drew a finding every round by construction. The extraction gives each kind
one owner:

| Content | Owner after the extraction |
|---------|----------------------------|
| Decided facts — variable, class, source/disposition, a probe id and a one-word result | **Table U**, whose cells now carry nothing else |
| Every rationale, cost and equivalence claim | **"Why Table U is what it is"**, the section directly under the table, registered in the Mirrored Surface Checklist as THE ONE prose mirror |
| Every measurement | **This record**, under stable probe ids (`P…`) that the table's Reach column cites |

O1's principle paragraph now CITES the rationale section instead of re-arguing
it. After this cut a finding about a sentence is a rationale finding, a finding
about a fact is a row or a disposition, and a finding about a number is a probe —
which is what the breaker exists to achieve.

### Findings, bands, criterion branch, disposition

| # | Channels | Band | Branch (§0.1) | Disposition and what changed |
|---|----------|------|---------------|------------------------------|
| **R2-A** | plugin F1 + shadow F4 — **CONVERGED** | B | 3 (extraction) | **FIX.** The plugin executed `getPaths()` with the four `WIENERDOG_*`/`*_DIR` overrides fixed and every root stayed identical while `HOME` changed — reproduced here as **P20**. So *"an environment lying about `HOME` relocates the whole product"* is **withdrawn**: a different `~/.gitconfig` can be selected while the run still targets the same vault. The truthful rationale replaces it — `HOME` is trusted **by decision** as the location of the user's config files, the same trust a manual run extends to its launching shell, and **not** a security boundary; the security bullet now names `HOME` as the deliberate exception. Every *"manual == scheduled"* claim is narrowed to the three properties actually equalized (no inherited `GIT_*`; `HOME` from `getPaths().home`; no `XDG_CONFIG_HOME`), and the shadow's measured descendant cost is recorded under U1: `buildCleanEnv` reconstructs `PATH` while U1 carries the manual one (**P19**), so a hook or lazy-fetch helper resolves bare command names launch-mode-dependently |
| **R2-B** | shadow F3 (+ plugin next-steps) | B | 3 (extraction) | **FIX — two new rows.** **U22** `GIT_AUTHOR_*` / `GIT_COMMITTER_*` (names, emails and dates): measured with the pinned `commit-tree` argv, the inherited identity **wins** over the run's own `-c user.name` / `-c user.email` — the recorded author and committer become the exported ones (**P17d**), and the dates change the commit object too (**P22**). **U23** `GIT_NO_REPLACE_OBJECTS` / `GIT_REPLACE_REF_BASE`: measured against a real `refs/replace/` ref in the vault, the pinned `show`, `ls-tree` and `read-tree` all follow the replacement, and either variable switches it off (**P18**). Both ABSENT; both costs named in the rationale section — a user who tags dream commits through `GIT_COMMITTER_*` loses that, and replacement refs stay honoured (they are files in the repo) while the user can no longer switch them off from the shell for the run. **No new criterion**: AC1's value map already asserts their absence through its "no other key" clause |
| **R2-C** | plugin F2 | C | 2 (design — the method) | **RE-DERIVED.** The plugin extracted the committed part-3 output and showed the two passes still ran from different repository states. The METHOD was the defect, so the whole probe set was rebuilt: one driver, one template repository, a **fresh copy per probe invocation**, fixed identity **and** fixed dates in the probe's own environment, and a **mechanical** per-shape diff of the channel transcript against the baseline transcript. Every Reach cell in Table U now cites a probe id owned by this record |
| **R2-D** | shadow F1 | B | 6 (LIGHT) | **FIX.** The `git-env-inherits-config-count` mutation restores the very `GIT_CONFIG_COUNT` triple AC5(b) uses to inject `core.hooksPath`, so it necessarily reddens AC5(b) as well; `scripts/red-proofs.js` requires the observed red set to EQUAL the declared set, so the only route to PROVEN would have been to filter AC5 out — leaving the new positive control with no mutation evidence. AC5(b) is now in that declaration's `must redden` set, with a paragraph saying it is there **by necessity, not by choice** |
| **R2-E** | shadow F2 | B | 6 (LIGHT) | **FIX.** The rulings record's O1 entry still said `HOME` **and** `XDG_CONFIG_HOME` are carried, contradicting O3 and row U3. That record is append-only, so a dated amendment now states the adopted position, defers to the primary spec's owner-items section, and withdraws the two O1 sentences R2-A falsified — noting that the recommendation itself is unchanged and the adoption stands on it, not on those sentences |

**Housekeeping:** the seven trailing-whitespace lines both channels found are
stripped; `git diff --check` exits 0.

### The re-derivation — method, and what it caught in ITSELF

`probes.sh`, one file, in scratch. **Three defects in the driver's own first runs
are recorded rather than quietly fixed**, because each produced a plausible number
and two of them are the same class of error R2-C raised:

1. **The redirect channels pointed at the TEMPLATE.** `GIT_DIR=<template>/.git`
   made the run's own `update-ref` advance the template's HEAD — the source every
   later copy is made from. Every subsequent probe then started from an advanced
   copy and its `update-ref` failed identically on both sides, masking any channel
   that only reaches shape (9). Fixed with a **separate decoy repository**, and
   the driver now **asserts template integrity at the end of the run** and says
   the run is void if it moved.
2. **`inDecoy` was a path test.** `test -e <objects>/<sha[0:2]>/<sha[2:]>` answers
   *yes* for an empty sha, because it lands on the objects directory itself. Asked
   of git instead (`cat-file -e`), the control reads `inDecoy=no` as it should.
3. **The chain's decoy was a copy of the shared decoy**, which section 1's own
   probes write into by design — so the control reported the probe's blob already
   present in the decoy. Each chain now builds a pristine decoy of its own.

**The full driver output**, which every Reach cell in Table U cites:

```text
ROOT=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.2YZRTtzwLW
git: git version 2.50.1 (Apple Git-155)
template HEAD=65b3416e82aa5f7fd9e54daee3699e7ebed8e41a tree=f54bd691d4a8250ca67e2b84beb26a2e4924a7ee blob=de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b   fixed date: 1700000000 +0000
decoy    HEAD=48ae36eb59d2dcab40e2448bdaaf626be037d83d  (a SEPARATE repository; no probe ever writes to the template)

############ SECTION 1 — per-channel mechanical comparison of the nine shapes
Every block below: a fresh copy under the baseline env vs a fresh copy under
the channel env, transcripts diffed by the script.

P0  control — the baseline env compared with ITSELF (must be 'no reach')
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

P3  GIT_DIR=<decoy>/.git
    RESULT: REACHES — transcripts differ; the differing lines:
      1,4c1,4
      < (5) rev-parse HEAD                 rc=0  65b3416e82aa5f7fd9e54daee3699e7ebed8e41a
      < (1) ls-tree <tree> -- a.txt        rc=0  100644 blob de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b a.txt
      < (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=yes
      < (6) read-tree <tree>               rc=0
      ---
      > (5) rev-parse HEAD                 rc=0  48ae36eb59d2dcab40e2448bdaaf626be037d83d
      > (1) ls-tree <tree> -- a.txt        rc=128  fatal: not a tree object
      > (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=no
      > (6) read-tree <tree>               rc=128
      6,10c6,11
      < (7) write-tree                     rc=0  f54bd691d4a8250ca67e2b84beb26a2e4924a7ee
      < (4) show HEAD:reports/warnings.md  rc=0  template-warnings
      < (8) commit-tree <tree> -p <head>   rc=0  eb325f5247e9b19db9ea163da25ac50b0b461319
      < (9) update-ref -m … HEAD <new> <old> rc=0
      <     vault HEAD after: eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      > (7) write-tree                     rc=128  error: invalid object 100644 de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b for 'a.txt'
      > fatal: git-write-tree: error building trees
      > (4) show HEAD:reports/warnings.md  rc=0  DECOY-warnings
      > (8) commit-tree <tree> -p <head>   rc=128  fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object
      > (9) update-ref -m … HEAD <new> <old> rc=128  fatal: fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object: not a valid SHA1
      >     vault HEAD after: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a

P4  GIT_OBJECT_DIRECTORY=<decoy>/.git/objects
    RESULT: REACHES — transcripts differ; the differing lines:
      2,4c2,4
      < (1) ls-tree <tree> -- a.txt        rc=0  100644 blob de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b a.txt
      < (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=yes
      < (6) read-tree <tree>               rc=0
      ---
      > (1) ls-tree <tree> -- a.txt        rc=128  fatal: not a tree object
      > (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=no
      > (6) read-tree <tree>               rc=128
      6,10c6,11
      < (7) write-tree                     rc=0  f54bd691d4a8250ca67e2b84beb26a2e4924a7ee
      < (4) show HEAD:reports/warnings.md  rc=0  template-warnings
      < (8) commit-tree <tree> -p <head>   rc=0  eb325f5247e9b19db9ea163da25ac50b0b461319
      < (9) update-ref -m … HEAD <new> <old> rc=0
      <     vault HEAD after: eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      > (7) write-tree                     rc=128  error: invalid object 100644 de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b for 'a.txt'
      > fatal: git-write-tree: error building trees
      > (4) show HEAD:reports/warnings.md  rc=128  fatal: path 'reports/warnings.md' exists on disk, but not in 'HEAD'
      > (8) commit-tree <tree> -p <head>   rc=128  fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object
      > (9) update-ref -m … HEAD <new> <old> rc=128  fatal: fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object: not a valid SHA1
      >     vault HEAD after: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a

P5  GIT_COMMON_DIR=<decoy>/.git
    RESULT: REACHES — transcripts differ; the differing lines:
      2,4c2,4
      < (1) ls-tree <tree> -- a.txt        rc=0  100644 blob de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b a.txt
      < (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=yes
      < (6) read-tree <tree>               rc=0
      ---
      > (1) ls-tree <tree> -- a.txt        rc=128  fatal: not a tree object
      > (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=no
      > (6) read-tree <tree>               rc=128
      6,10c6,11
      < (7) write-tree                     rc=0  f54bd691d4a8250ca67e2b84beb26a2e4924a7ee
      < (4) show HEAD:reports/warnings.md  rc=0  template-warnings
      < (8) commit-tree <tree> -p <head>   rc=0  eb325f5247e9b19db9ea163da25ac50b0b461319
      < (9) update-ref -m … HEAD <new> <old> rc=0
      <     vault HEAD after: eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      > (7) write-tree                     rc=128  error: invalid object 100644 de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b for 'a.txt'
      > fatal: git-write-tree: error building trees
      > (4) show HEAD:reports/warnings.md  rc=128  fatal: path 'reports/warnings.md' exists on disk, but not in 'HEAD'
      > (8) commit-tree <tree> -p <head>   rc=128  fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object
      > (9) update-ref -m … HEAD <new> <old> rc=128  fatal: fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object: not a valid SHA1
      >     vault HEAD after: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a

P9  GIT_WORK_TREE=<empty dir>
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

P11  GIT_NAMESPACE=evil
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

P12  GIT_CEILING_DIRECTORIES=<the vault's parent>
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

P13  GIT_EXEC_PATH=<dir holding a planted git-hash-object>
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

P17  GIT_AUTHOR_* / GIT_COMMITTER_* (identity)
    RESULT: REACHES — transcripts differ; the differing lines:
      8c8
      < (8) commit-tree <tree> -p <head>   rc=0  eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      > (8) commit-tree <tree> -p <head>   rc=0  77a80b52ca91fb8502d7e8083b46c28e4236c28b
      10c10
      <     vault HEAD after: eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      >     vault HEAD after: 77a80b52ca91fb8502d7e8083b46c28e4236c28b

P22  GIT_AUTHOR_DATE / GIT_COMMITTER_DATE (dates)
    RESULT: REACHES — transcripts differ; the differing lines:
      8c8
      < (8) commit-tree <tree> -p <head>   rc=0  eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      > (8) commit-tree <tree> -p <head>   rc=0  a4d2c18a23d7e6bdf72e746b088863a0e69292db
      10c10
      <     vault HEAD after: eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      >     vault HEAD after: a4d2c18a23d7e6bdf72e746b088863a0e69292db

P6  GIT_ALTERNATE_OBJECT_DIRECTORIES=<decoy>/.git/objects
    RESULT: REACHES — transcripts differ; the differing lines:
      3c3
      < (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=yes
      ---
      > (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=no

P10  GIT_INDEX_FILE inherited (a copy of the user's index)
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

############ SECTION 2 — the chained replay (write-target channels)
commitNamedSet DERIVES every object name from its own earlier pinned calls,
so a redirected run must be replayed as a chain, not shape by shape.

P0c  control — the chain under the baseline env
    (5) rev-parse HEAD  rc=0 -> VAULT
    (6) read-tree <own head>  rc=0
    (1) ls-tree <own head> -- a.txt  rc=0 mode=100644
    (2) hash-object -w --stdin  rc=0 sha=ced0d24043540233faea11b8d511d4b4bc63f235  inVault=yes inDecoy=no
    (3) update-index --add --cacheinfo  rc=0
    (7) write-tree  rc=0
    (8) commit-tree  rc=0
    (9) update-ref  rc=0
    => vault HEAD moved: YES   DECOY HEAD moved: no

P3c  GIT_DIR=<decoy>/.git
    (5) rev-parse HEAD  rc=0 -> DECOY
    (6) read-tree <own head>  rc=0
    (1) ls-tree <own head> -- a.txt  rc=0 mode=100644
    (2) hash-object -w --stdin  rc=0 sha=ced0d24043540233faea11b8d511d4b4bc63f235  inVault=no inDecoy=yes
    (3) update-index --add --cacheinfo  rc=0
    (7) write-tree  rc=0
    (8) commit-tree  rc=0
    (9) update-ref  rc=0
    => vault HEAD moved: no   DECOY HEAD moved: YES

P4c  GIT_OBJECT_DIRECTORY=<decoy>/.git/objects
    (5) rev-parse HEAD  rc=0 -> VAULT
    (6) read-tree <own head>  rc=128
    ABORTS at (6) — the run stops before it writes anything

P5c  GIT_COMMON_DIR=<decoy>/.git
    (5) rev-parse HEAD  rc=0 -> VAULT
    (6) read-tree <own head>  rc=128
    ABORTS at (6) — the run stops before it writes anything

############ SECTION 3 — the code channel: which pinned shape RUNS a configured program
P1  core.fsmonitor via the CARRIED HOME's ~/.gitconfig
    ls-tree: program-invocations=0
    hash-object: program-invocations=0
    read-tree: program-invocations=0
    update-index: program-invocations=2
    write-tree: program-invocations=2
    show: program-invocations=0
    rev-parse: program-invocations=0

P2  core.fsmonitor via XDG_CONFIG_HOME (carried) — the disposition this WP does NOT take
    ls-tree: program-invocations=0
    hash-object: program-invocations=0
    read-tree: program-invocations=0
    update-index: program-invocations=2
    write-tree: program-invocations=2
    show: program-invocations=0
    rev-parse: program-invocations=0

P2n  the SAME XDG config with XDG_CONFIG_HOME NOT carried — the adopted disposition
    ls-tree: program-invocations=0
    hash-object: program-invocations=0
    read-tree: program-invocations=0
    update-index: program-invocations=0
    write-tree: program-invocations=0
    show: program-invocations=0
    rev-parse: program-invocations=0

P7  core.fsmonitor injected via GIT_CONFIG_COUNT
    ls-tree: program-invocations=0
    hash-object: program-invocations=0
    read-tree: program-invocations=0
    update-index: program-invocations=2
    write-tree: program-invocations=2
    show: program-invocations=0
    rev-parse: program-invocations=0

P8  core.fsmonitor via a config selected by GIT_CONFIG_GLOBAL
    ls-tree: program-invocations=0
    hash-object: program-invocations=0
    read-tree: program-invocations=0
    update-index: program-invocations=2
    write-tree: program-invocations=2
    show: program-invocations=0
    rev-parse: program-invocations=0

P7h core.hooksPath injected via GIT_CONFIG_COUNT — does it fire a hook on the pinned update-ref?
    update-ref rc=0  hook-invocations=2
      HOOK RAN prepared
      HOOK RAN committed

P16 the USER's own hook (configured through the carried HOME's ~/.gitconfig) under the CONSTRUCTED env
    update-ref rc=0  the user's hook fired 2 time(s); its environment:
      --- hook fired (prepared); its environment: ---
      CPATH=/usr/local/include
      GIT_EXEC_PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core
      GIT_PREFIX=
      HOME=<ROOT>/uhome
      HOOKENV_LOG=<ROOT>/c.23240.5445.henv
      LIBRARY_PATH=/usr/local/lib
      MANPATH=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/share/man:/Library/Developer/CommandLineTools/usr/share/man:/Library/Developer/CommandLineTools/Toolchains/XcodeDefault.xctoolchain/usr/share/man:
      PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core:/usr/bin
      PWD=/private<ROOT>/c.23240.5445
      SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk
      SHLVL=1
      _=/usr/bin/env
      __CF_USER_TEXT_ENCODING=0x1F5:0x0:0x0
      --- end ---
      --- hook fired (committed); its environment: ---
      CPATH=/usr/local/include
      GIT_EXEC_PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core
      GIT_PREFIX=
      HOME=<ROOT>/uhome
      HOOKENV_LOG=<ROOT>/c.23240.5445.henv
      LIBRARY_PATH=/usr/local/lib
      MANPATH=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/share/man:/Library/Developer/CommandLineTools/usr/share/man:/Library/Developer/CommandLineTools/Toolchains/XcodeDefault.xctoolchain/usr/share/man:
      PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core:/usr/bin
      PWD=/private<ROOT>/c.23240.5445
      SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk
      SHLVL=1
      _=/usr/bin/env
      __CF_USER_TEXT_ENCODING=0x1F5:0x0:0x0
      --- end ---

############ SECTION 4 — identity, replacement objects, signing
P17d the pinned commit-tree's RECORDED author/committer, with and without inherited identity
    baseline (no GIT_AUTHOR_*/GIT_COMMITTER_*):
      author wienerdog <wienerdog@localhost> 1700000000 +0000
      committer wienerdog <wienerdog@localhost> 1700000000 +0000
    with GIT_AUTHOR_*/GIT_COMMITTER_* exported:
      author Attacker <a@evil> 1700000000 +0000
      committer Attacker <a@evil> 1700000000 +0000

P18 replacement objects: a refs/replace/ ref in the vault, against the pinned reads and commit-tree
    a refs/replace/<template head> ref now points at a commit whose a.txt is REPLACED-CONTENT
    [honoured (no GIT_NO_REPLACE_OBJECTS)]
      (4) show <head>:a.txt        -> REPLACED-CONTENT
      (1) ls-tree <head> -- a.txt  -> 100644 blob 5871e2272698f4ba5f4b4bf34d4d80b56e5a48f4 a.txt
      (6) read-tree <head>, then the index's blob for a.txt -> 100644 5871e2272698f4ba5f4b4bf34d4d80b56e5a48f4 0 a.txt
      (8) commit-tree -p <head>    -> eb325f5247e9b19db9ea163da25ac50b0b461319  (its recorded parent: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a)
    [GIT_NO_REPLACE_OBJECTS=1]
      (4) show <head>:a.txt        -> template-a
      (1) ls-tree <head> -- a.txt  -> 100644 blob de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b a.txt
      (6) read-tree <head>, then the index's blob for a.txt -> 100644 de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b 0 a.txt
      (8) commit-tree -p <head>    -> eb325f5247e9b19db9ea163da25ac50b0b461319  (its recorded parent: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a)
    [GIT_REPLACE_REF_BASE=refs/other/]
      (4) show <head>:a.txt        -> template-a
      (1) ls-tree <head> -- a.txt  -> 100644 blob de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b a.txt
      (6) read-tree <head>, then the index's blob for a.txt -> 100644 de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b 0 a.txt
      (8) commit-tree -p <head>    -> eb325f5247e9b19db9ea163da25ac50b0b461319  (its recorded parent: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a)

P15 signing: does the pinned commit-tree honour commit.gpgsign from the carried HOME's config?
    (8) commit-tree rc=0 -> eb325f5247e9b19db9ea163da25ac50b0b461319 ; gpg-program invocations=0
    control: a real git-commit under the SAME home -> gpg-program invocations=1
      GPG RAN --status-fd=2 -bsau t <t@e>

############ SECTION 5 — attributes, alternates, inherited index, discovery
P14 filter drivers (GIT_ATTR_* family) on the pinned show and hash-object
    (4) show      rc=0 filter-invocations=0
    (2) hash-object (no --path) rc=0 filter-invocations=0

P6 GIT_ALTERNATE_OBJECT_DIRECTORIES on the pinned read-tree of a tree held only elsewhere
    without alternates: rc=128
    with alternates:    rc=0  index now holds: b.txt reports/warnings.md

P10 an inherited GIT_INDEX_FILE on the six unset-disposition shapes
    (5) rev-parse rc=0
    (1) ls-tree rc=0
    (2) hash-object rc=0
    (4) show rc=0
    (8) commit-tree rc=0
    (9) update-ref rc=0
    the pointed-at index's bytes changed across all six: no

P12n discovery from a NON-repository directory inside a repository (the R1-E case)
    rev-parse --git-dir  rc=0 -> /private<VAULT>/.git
    rev-parse HEAD       rc=0 -> 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a  (the ANCESTOR repository)
    with a ceiling at the parent: rc=128 -> fatal: not a git repository (or any of the parent directories): .git

############ SECTION 6 — the two claims that are about OUR code, not git's
P19 PATH: what the scheduled child gets vs what a manual run carries
    scheduled PATH (buildCleanEnv): /opt/homebrew/Cellar/node/25.9.0_2/bin:/Users/gyulafeher/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
    manual PATH (process.env.PATH): /Users/gyulafeher/.grok/bin:/Users/gyulafeher/.antigravity-ide/antigravity-ide/bin:/Users/gyulafeher/.antigravity/antigr …
    identical? false
    scheduled HOME: /Users/gyulafeher   getPaths().home: /Users/gyulafeher   identical? true
    scheduled XDG_CONFIG_HOME present? false

P20 do the product roots move when HOME moves, with the four overrides fixed?
    home       HOME=/tmp/home-a -> /tmp/home-a   HOME=/tmp/home-b -> /tmp/home-b   same? false
    core       HOME=/tmp/home-a -> /tmp/wd-core   HOME=/tmp/home-b -> /tmp/wd-core   same? true
    state      HOME=/tmp/home-a -> /tmp/wd-core/state   HOME=/tmp/home-b -> /tmp/wd-core/state   same? true
    secrets    HOME=/tmp/home-a -> /tmp/wd-core/secrets   HOME=/tmp/home-b -> /tmp/wd-core/secrets   same? true
    logs       HOME=/tmp/home-a -> /tmp/wd-core/logs   HOME=/tmp/home-b -> /tmp/wd-core/logs   same? true
    claudeDir  HOME=/tmp/home-a -> /tmp/wd-claude   HOME=/tmp/home-b -> /tmp/wd-claude   same? true
    codexDir   HOME=/tmp/home-a -> /tmp/wd-codex   HOME=/tmp/home-b -> /tmp/wd-codex   same? true
    vault      HOME=/tmp/home-a -> /tmp/wd-vault   HOME=/tmp/home-b -> /tmp/wd-vault   same? true

############ TEMPLATE INTEGRITY — the run is invalid if this moved
    template HEAD at start: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a
    template HEAD now     : 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a
    unchanged: YES
    decoy HEAD at start: 48ae36eb59d2dcab40e2448bdaaf626be037d83d
    decoy HEAD now     : 48ae36eb59d2dcab40e2448bdaaf626be037d83d

ROOT kept at /var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.2YZRTtzwLW
```

### Per-row result of the re-derivation

| Row | Result | What moved |
|-----|--------|-----------|
| U1 `PATH` | **CHANGED (rationale)** | the descendant cost is now named and measured (**P19**): the scheduled child's `PATH` is reconstructed, the manual run's is carried, so a hook's bare command name resolves differently |
| U2 `HOME` | **CHANGED (rationale)** | two withdrawals with their measurements (**P20**, and R1-F's `os.homedir()` reproduction); the reach cell is unchanged in substance (**P1**: shapes (3) and (7)) |
| U3 `XDG_CONFIG_HOME` | unchanged | **P2** / **P2n** reproduce both directions with the new method |
| U4 / U4b win32 | **CHANGED (split)** | the SET key (`USERPROFILE`) is now its own row, so the disposition column carries one verb per row |
| U5 index | unchanged | — |
| U6 `GIT_DIR` | **CHANGED (evidence)** | **P3** now lists eight shapes rather than four, because the decoy is a genuinely different repository; **P3c** reproduces the chained HEAD move |
| U7 `GIT_OBJECT_DIRECTORY` | **CHANGED (evidence)** | **P4** reaches seven shapes; **P4c** confirms the chain aborts at (6) |
| U8 `GIT_COMMON_DIR` | **CHANGED (evidence)** | **P5** / **P5c**, as U7 |
| U9 alternates | **CHANGED (evidence)** | **P6** shows a WRITE reach as well as the read one: with an alternate set, the pinned `hash-object -w` stores into the alternate, not the vault |
| U10 `GIT_CONFIG_*_n` | unchanged | **P7** reproduces (3) and (7); **P7h** the hook on (9) |
| U11 `GIT_CONFIG_GLOBAL` | unchanged | **P8** |
| U12 `GIT_WORK_TREE` | **CHANGED (evidence)** | **P9** is now a clean mechanical comparison — identical transcripts — rather than a hand comparison across two repository states. This is the cell R2-C was about |
| U13 inherited index | unchanged | **P10** |
| U14 `GIT_NAMESPACE` | unchanged | **P11** |
| U15 ceiling | unchanged | **P12**, plus **P12n** for the nested-directory discovery case |
| U16 `GIT_EXEC_PATH` | unchanged | **P13** |
| U17 `GIT_ATTR_*` | unchanged | **P14** |
| U18 / U19 | unchanged | not measured, provenance stated |
| U20 transport/signing | unchanged | **P15** signing with its live-config control; **P16** the hook's environment |
| **U22 identity/dates** | **NEW** | **P17** / **P17d** / **P22** — reaches shape (8); the inherited identity wins over the run's own `-c user.*` |
| **U23 replacement** | **NEW** | **P18** — reaches (1)(4)(6); either variable switches the repository's own `refs/replace/` off |
| U21 closure | unchanged | moved to the end of the table for reading order; its id is unchanged |

**Twenty-three rows, of which two are new and eleven moved.** Every Reach cell
now cites a probe id, and every probe ran under the corrected method.

### Revision — the tree after R2-A … R2-E

`coherence.js` on the revised spec:

```text
spec line count                                = 852
Table U rows                                   = 24  U1,U2,U3,U4,U4b,U5,U6,U7,U8,U9,U10,U11,U12,U13,U14,U15,U16,U17,U18,U19,U20,U22,U23,U21
  id set U1..U23 + U4b complete, no duplicates, closure row last: ok
U-ids mentioned anywhere but absent from table = none
U-rows never referenced outside their own row  = U8,U9,U12,U14,U15,U16,U17,U18 (informational)
acceptance criteria                            = 9  AC1,AC2,AC3,AC4,AC5,AC6,AC7,AC8,AC9
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
file:line citations in the spec                = 23
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
   `src/core/paths.js:54`
      FIRST:   const home = env.HOME || os.homedir();
      LAST :   const home = env.HOME || os.homedir();
   `src/cli/dream.js:179`
      FIRST:   return spawnPinnedSync('git', getPaths(), {
      LAST :   return spawnPinnedSync('git', getPaths(), {
   `src/core/dream/promote.js:387-418`
      FIRST: function constructMergeEnv(root) {
      LAST : }
   `src/core/exec-identity.js:93-118`
      FIRST: function resolveExecutable(name, env, platform) {
      LAST : }
   `src/core/paths.js:53-54`
      FIRST: function getPaths(env = process.env) {
      LAST :   const home = env.HOME || os.homedir();
   `src/cli/run-job.js:47-50`
      FIRST: const ENV_PASSTHROUGH = [
      LAST : ];
   `src/cli/run-job.js:58-78`
      FIRST: const WIN_ENV_PASSTHROUGH = [
      LAST : ];
   `src/cli/run-job.js:155`
      FIRST:       USERPROFILE: paths.home, // deterministic homedir for children / os.homedir()
      LAST :       USERPROFILE: paths.home, // deterministic homedir for children / os.homedir()
   `docs/specs/done/WP-criterion-red-harness.md:95-96`
      FIRST:   builds the private index environment at exactly one site — the `indexEnv`
      LAST :   constant, `{ ...process.env, GIT_INDEX_FILE: tmpIndex }`. This is stated as an
   `docs/specs/done/WP-audit-c-close-disposition.md:130`
      FIRST:   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
      LAST :   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
   `tests/unit/dream-pipeline.test.js:411-414`
      FIRST:   Object.assign(process.env, {
      LAST :   });
RED ids named in the Exact-contracts table     = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
RED ids in V4's `want`  array                    = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
template sections absent                       = none

COHERENCE: no failures
```

`npm run lint` on the revision commit's tree:

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

## Round 3 — external, double channel, tip `2ad1434c`

Both channels ran on `2ad1434c`, both returned **needs-attention**, and
`git status --porcelain` was byte-identical before and after in each. Raws
committed before any of this was read:

| Channel | Raw | Commit that introduced it |
|---------|-----|---------------------------|
| Codex plugin | `docs/specs/logbook/2026-09-06-git-env-pinning-gate-raw-round3-codex-plugin.txt` | `c00f6f4b` |
| Hermetic shadow | `docs/specs/logbook/2026-09-06-git-env-pinning-gate-raw-round3-herdr-shadow.txt` | `3c2571a4` |

**Neither channel found anything about the product's BEHAVIOUR.** Every finding
is contract text, evidence, or the record. Both again disclosed that `npm test`
and `node scripts/red-proofs.js` stopped before running on temp-directory EPERM,
so their verdicts are readings on those points; what each DID execute — predicate
counterexamples through the real `evaluateRed()`, a probe-id collision audit,
`getPaths()` under fixed overrides, pinned-argv comparisons against
`KNOWN_CALLS` — is what the findings below rest on, and each is reproduced here.

**Round-2 status as the channels reported it:** R2-A partial (the equivalence and
PATH halves fixed, an authority claim surviving), R2-C fixed for U12, R2-D and
R2-E fixed; R2-B's two new rows accepted, with two evidence defects (below).

### Findings, bands, criterion branch, disposition

| # | Channels | Band | Branch (§0.1) | Disposition and what changed |
|---|----------|------|---------------|------------------------------|
| **R3-A** | shadow F1 | B | 4 → **HEAVY** | **FIX.** The Deliverables row allowed `git-env.js` no dependency outside `node:path`, while the exact contract requires `HOME = getPaths().home` and neither `buildGitEnv(indexFile)` nor `gitIn` receives a paths object — an implementer had to break the row or re-derive `HOME` and break row U2. The row now explicitly allows `require('../paths')` for `getPaths` (the module lives in `src/core/dream/`, and `spawnGitPinned` already calls it), and the JSDoc says `HOME` is taken from `getPaths().home` **at call time**. The signature is unchanged and no paths parameter is threaded through `gitIn` — that would touch every call site. This is the round's only HEAVY finding, and it is why a round 4 is owed |
| **R3-B** | shadow F2 + plugin "extraction incomplete" — **CONVERGED** | B | 5/6 → **LIGHT** | **FIX, in three surfaces and then the extraction itself.** The falsified authority claim — *"the same home the vault, the state directory and the config roots come from"* — survived R2-A in the rationale section, in Current state and in the owner-record amendment. All three now carry the conditional truth: each root defaults under `home` **and each has its own override**, so where an override is set the root does not follow `HOME` at all; with the four overrides fixed, `HOME` selects only where the user's git config lives, and that selection is trusted **by decision**. What taking the value through `getPaths()` buys is stated without the authority claim: one function decides it, manual and scheduled agree, and a `HOME` is carried when the shell has none. **The extraction is then completed**: O3's reasoning is cut to a citation of the rationation section, and O3, the Security checklist and the owner-rulings record are **registered as mirrors** — the record with its append-only rule spelled out |
| **R3-C** | shadow F3 + plugin F3 — **CONVERGED** | B/C | 2 (evidence) | **RE-MEASURED; the claim was FALSE and is withdrawn.** `R2P6` was contaminated: `R2P3`/`R2P4` had already written the identical blob into the shared decoy that `R2P6` then used as the alternate, so `storedInVault=no` showed lookup, not a write. Re-run on a pristine pair, two arms — and the row changes direction. See below |
| **R3-D** | plugin F2 | C | 2 (evidence) | **RE-MEASURED; the claim HOLDS.** `R2P18` used `show <sha>:a.txt`, not the pinned literal. Re-run with a replacement commit differing in `reports/warnings.md` and the exact pinned argv. See below |
| **R3-E** | shadow F4 | B | 6 → **LIGHT** | **FIX.** The corrected-method probes reused `P2`–`P16` for different channels than round zero's, so a bare `P9` resolved to contradicting output. The corrected-method probes are renamed into the **`R2P…`** namespace **in the driver itself and re-run**, so the pasted output carries the ids literally rather than through a mapping table; this round's re-runs are `R3P6` and `R3P18`; round zero's ids are untouched where they stand. Two collisions inside the R2 set were found while renaming and fixed as well — the alternates and inherited-index probes each appeared twice, now `R2P6`/`R2P6b` and `R2P10`/`R2P10b` |
| **R3-F** | plugin F1 | B | 6 → **LIGHT** | **FIX.** All three declarations named AC1 in their must-redden sets, but AC1's fixture exports only the canary and `XDG_CONFIG_HOME`, so under a single-channel reintroduction AC1 stays green and the runner's set-equality fails — the plugin ran the counterexample through the real `evaluateRed()`. AC1 is **dropped from all three sets**: `git-env-inherits-git-dir` → AC2; `…-object-directory` → AC3; `…-config-count` → AC4 and AC5(b). The Exact-contracts section now states why: AC1 is the **structural** key→value assertion in its own fixture, while the **behavioural** criteria each export their channel for the whole run and redden deterministically |

**Round outcome: HEAVY** (R3-A). Round 4 runs as the closing confirmation on the
revised tip; under weighted closure it closes if it returns nothing about the
product, with any remaining C-band evidence or record items fixed in place.

### R3-C — the alternates row, re-measured on a pristine pair

Driver `probes-r3.sh`, a repository pair built fresh for each arm, nothing
written by any earlier probe.

**Arm (i) — the blob absent from both stores.** The pinned
`hash-object -w --stdin` stores it **in the vault**, exactly as it would without
the variable. So *"the write lands in the alternate"* is **FALSE and is
withdrawn**; the earlier cell had read a lookup as a write.

**Arm (ii) — the blob present ONLY in the alternate.** The pinned
`hash-object -w --stdin` stores **nothing**: the object is already reachable
through the alternate, so the vault never gets its own copy. **And the run does
not stop there** — the replay continues into `read-tree`, `update-index`,
`write-tree`, `commit-tree` and `update-ref`, and the vault's `HEAD` advances
onto a commit whose tree references that blob. With the alternate gone — which,
under the pin, it always is — the vault cannot read its own committed content:
`cat-file` fails and `fsck --connectivity-only` reports **`broken link from tree
… to blob …`**.

**So U9's Reach cell is now `R3P6 — reaches (2) and (6): a blob already in the
alternate is NOT stored in the vault`**, and the interpretation lives in the
rationale section, where it belongs: this is the one ABSENT row whose channel
corrupts the vault's own history, and the pin is what prevents it.

### R3-D — the replacement row, re-measured with the pinned literal

Same driver. The scratch vault holds `reports/warnings.md`; a `git replace` ref
maps `HEAD`'s commit to a replacement whose `reports/warnings.md` differs.

With the replacement honoured, the literal `show HEAD:reports/warnings.md`
returns the REPLACED content and `ls-tree HEAD -- reports/warnings.md` and
`read-tree HEAD` carry the replacement's blob; `GIT_NO_REPLACE_OBJECTS=1` and a
redirected `GIT_REPLACE_REF_BASE` each revert all three. `rev-parse HEAD` and
`commit-tree`'s recorded parent are **unaffected in every arm**.

**U23's Reach cell is now `R3P18 — reaches (1)(4)(6); not (5) or (8)`** — the
claim holds on the pinned argv, and the two shapes it does NOT reach are stated
rather than left implied.

#### The round-3 driver's output

```text
ROOT=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.HqygHyaG2m
git: git version 2.50.1 (Apple Git-155)

############ R3P6 — GIT_ALTERNATE_OBJECT_DIRECTORIES, pristine per arm

ARM (i): the blob is ABSENT from BOTH stores before the pinned hash-object.
  target blob = 039688da6bfa6dbea40ecc6959aaa4ee644892d2
  before:  in vault=no   in alternate=no
  (2) hash-object -w --stdin  rc=0 -> 039688da6bfa6dbea40ecc6959aaa4ee644892d2
  after:   in vault=yes   in alternate=no
  loose object present under the VAULT's own objects dir:     yes
  loose object present under the ALTERNATE's own objects dir: no

ARM (ii): the blob is PRESENT ONLY IN THE ALTERNATE before the pinned hash-object.
  target blob = 17bb7db4ec8e3dda7f16d450cd14f6ebbc55f6d2
  before:  in vault=no   in alternate=yes
  (2) hash-object -w --stdin  rc=0 -> 17bb7db4ec8e3dda7f16d450cd14f6ebbc55f6d2
  after:   in vault=no   in alternate=yes
  loose object present under the VAULT's own objects dir: no
  and WITHOUT the alternate, can the vault still read it?  no

  the run's own next step, on arm (ii)'s blob: does a commit built from it survive the alternate going away?
  (7) write-tree -> 1ba7c25c9ddfdf780a387c0d46ae2f3ce0843ee8
  (8) commit-tree -> 6b29c645d988920fd64347d3e7497d8fe67883ac
  (9) update-ref rc=0  vault HEAD=6b29c645d988920fd64347d3e7497d8fe67883ac
  now the alternate is gone (the variable is not set, as it will not be under the pin):
    git -C <vault> cat-file -p <the committed blob>  -> fatal: Not a valid object name 17bb7db4ec8e3dda7f16d450cd14f6ebbc55f6d2
    git -C <vault> fsck --connectivity-only          -> broken link from    tree 1ba7c25c9ddfdf780a387c0d46ae2f3ce0843ee8               to    blob 17bb7db4ec8e3dda7f16d450cd14f6ebbc55f6d2

############ R3P18 — replacement objects against the EXACT pinned argv
  HEAD = a664a16318bf7996ab7f8ec74aa95c2e320de040 ; a git-replace ref maps it to d6c146a7dcbdb4e177fc113e1a968147b6ab997a, whose reports/warnings.md differs
  replacement ref: refs/replace/a664a16318bf7996ab7f8ec74aa95c2e320de040 -> d6c146a7dcbdb4e177fc113e1a968147b6ab997a
  [replacement honoured (no variable)]
    (4) show HEAD:reports/warnings.md   -> REPLACED-warnings
    (1) ls-tree HEAD -- reports/warnings.md -> 100644 blob 7a9a4f0b8d1201dde5fd31cdcec4dda4076d7ac0 reports/warnings.md
    (6) read-tree HEAD, index entry for reports/warnings.md -> 100644 7a9a4f0b8d1201dde5fd31cdcec4dda4076d7ac0 0 reports/warnings.md
    (5) rev-parse HEAD                  -> a664a16318bf7996ab7f8ec74aa95c2e320de040
    (8) commit-tree <tree> -p HEAD      -> 6d6bb7a413e8fc5a03611eb48b9d48d6609703e4  (recorded parent: a664a16318bf7996ab7f8ec74aa95c2e320de040)
  [GIT_NO_REPLACE_OBJECTS=1]
    (4) show HEAD:reports/warnings.md   -> ORIGINAL-warnings
    (1) ls-tree HEAD -- reports/warnings.md -> 100644 blob b5c3dd285d06ff61d6dabbf7f30b53ac2017e749 reports/warnings.md
    (6) read-tree HEAD, index entry for reports/warnings.md -> 100644 b5c3dd285d06ff61d6dabbf7f30b53ac2017e749 0 reports/warnings.md
    (5) rev-parse HEAD                  -> a664a16318bf7996ab7f8ec74aa95c2e320de040
    (8) commit-tree <tree> -p HEAD      -> 6d6bb7a413e8fc5a03611eb48b9d48d6609703e4  (recorded parent: a664a16318bf7996ab7f8ec74aa95c2e320de040)
  [GIT_REPLACE_REF_BASE=refs/other/]
    (4) show HEAD:reports/warnings.md   -> ORIGINAL-warnings
    (1) ls-tree HEAD -- reports/warnings.md -> 100644 blob b5c3dd285d06ff61d6dabbf7f30b53ac2017e749 reports/warnings.md
    (6) read-tree HEAD, index entry for reports/warnings.md -> 100644 b5c3dd285d06ff61d6dabbf7f30b53ac2017e749 0 reports/warnings.md
    (5) rev-parse HEAD                  -> a664a16318bf7996ab7f8ec74aa95c2e320de040
    (8) commit-tree <tree> -p HEAD      -> 6d6bb7a413e8fc5a03611eb48b9d48d6609703e4  (recorded parent: a664a16318bf7996ab7f8ec74aa95c2e320de040)

ROOT kept at /var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.HqygHyaG2m
```

### R3-E — the probe namespace, and the re-run that carries it

The corrected-method driver was renamed and **re-executed**, so its output below
carries the `R2P…` ids literally; nothing is mapped after the fact. Round zero's
`P…` ids stay where they are, in round zero's own section, and no current
citation uses a bare `P…` any more.

```text
ROOT=/var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.YtINwUFXEh
git: git version 2.50.1 (Apple Git-155)
template HEAD=65b3416e82aa5f7fd9e54daee3699e7ebed8e41a tree=f54bd691d4a8250ca67e2b84beb26a2e4924a7ee blob=de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b   fixed date: 1700000000 +0000
decoy    HEAD=48ae36eb59d2dcab40e2448bdaaf626be037d83d  (a SEPARATE repository; no probe ever writes to the template)

############ SECTION 1 — per-channel mechanical comparison of the nine shapes
Every block below: a fresh copy under the baseline env vs a fresh copy under
the channel env, transcripts diffed by the script.

R2P0  control — the baseline env compared with ITSELF (must be 'no reach')
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

R2P3  GIT_DIR=<decoy>/.git
    RESULT: REACHES — transcripts differ; the differing lines:
      1,4c1,4
      < (5) rev-parse HEAD                 rc=0  65b3416e82aa5f7fd9e54daee3699e7ebed8e41a
      < (1) ls-tree <tree> -- a.txt        rc=0  100644 blob de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b a.txt
      < (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=yes
      < (6) read-tree <tree>               rc=0
      ---
      > (5) rev-parse HEAD                 rc=0  48ae36eb59d2dcab40e2448bdaaf626be037d83d
      > (1) ls-tree <tree> -- a.txt        rc=128  fatal: not a tree object
      > (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=no
      > (6) read-tree <tree>               rc=128
      6,10c6,11
      < (7) write-tree                     rc=0  f54bd691d4a8250ca67e2b84beb26a2e4924a7ee
      < (4) show HEAD:reports/warnings.md  rc=0  template-warnings
      < (8) commit-tree <tree> -p <head>   rc=0  eb325f5247e9b19db9ea163da25ac50b0b461319
      < (9) update-ref -m … HEAD <new> <old> rc=0
      <     vault HEAD after: eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      > (7) write-tree                     rc=128  error: invalid object 100644 de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b for 'a.txt'
      > fatal: git-write-tree: error building trees
      > (4) show HEAD:reports/warnings.md  rc=0  DECOY-warnings
      > (8) commit-tree <tree> -p <head>   rc=128  fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object
      > (9) update-ref -m … HEAD <new> <old> rc=128  fatal: fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object: not a valid SHA1
      >     vault HEAD after: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a

R2P4  GIT_OBJECT_DIRECTORY=<decoy>/.git/objects
    RESULT: REACHES — transcripts differ; the differing lines:
      2,4c2,4
      < (1) ls-tree <tree> -- a.txt        rc=0  100644 blob de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b a.txt
      < (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=yes
      < (6) read-tree <tree>               rc=0
      ---
      > (1) ls-tree <tree> -- a.txt        rc=128  fatal: not a tree object
      > (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=no
      > (6) read-tree <tree>               rc=128
      6,10c6,11
      < (7) write-tree                     rc=0  f54bd691d4a8250ca67e2b84beb26a2e4924a7ee
      < (4) show HEAD:reports/warnings.md  rc=0  template-warnings
      < (8) commit-tree <tree> -p <head>   rc=0  eb325f5247e9b19db9ea163da25ac50b0b461319
      < (9) update-ref -m … HEAD <new> <old> rc=0
      <     vault HEAD after: eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      > (7) write-tree                     rc=128  error: invalid object 100644 de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b for 'a.txt'
      > fatal: git-write-tree: error building trees
      > (4) show HEAD:reports/warnings.md  rc=128  fatal: path 'reports/warnings.md' exists on disk, but not in 'HEAD'
      > (8) commit-tree <tree> -p <head>   rc=128  fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object
      > (9) update-ref -m … HEAD <new> <old> rc=128  fatal: fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object: not a valid SHA1
      >     vault HEAD after: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a

R2P5  GIT_COMMON_DIR=<decoy>/.git
    RESULT: REACHES — transcripts differ; the differing lines:
      2,4c2,4
      < (1) ls-tree <tree> -- a.txt        rc=0  100644 blob de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b a.txt
      < (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=yes
      < (6) read-tree <tree>               rc=0
      ---
      > (1) ls-tree <tree> -- a.txt        rc=128  fatal: not a tree object
      > (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=no
      > (6) read-tree <tree>               rc=128
      6,10c6,11
      < (7) write-tree                     rc=0  f54bd691d4a8250ca67e2b84beb26a2e4924a7ee
      < (4) show HEAD:reports/warnings.md  rc=0  template-warnings
      < (8) commit-tree <tree> -p <head>   rc=0  eb325f5247e9b19db9ea163da25ac50b0b461319
      < (9) update-ref -m … HEAD <new> <old> rc=0
      <     vault HEAD after: eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      > (7) write-tree                     rc=128  error: invalid object 100644 de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b for 'a.txt'
      > fatal: git-write-tree: error building trees
      > (4) show HEAD:reports/warnings.md  rc=128  fatal: path 'reports/warnings.md' exists on disk, but not in 'HEAD'
      > (8) commit-tree <tree> -p <head>   rc=128  fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object
      > (9) update-ref -m … HEAD <new> <old> rc=128  fatal: fatal: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a is not a valid object: not a valid SHA1
      >     vault HEAD after: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a

R2P9  GIT_WORK_TREE=<empty dir>
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

R2P11  GIT_NAMESPACE=evil
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

R2P12  GIT_CEILING_DIRECTORIES=<the vault's parent>
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

R2P13  GIT_EXEC_PATH=<dir holding a planted git-hash-object>
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

R2P17  GIT_AUTHOR_* / GIT_COMMITTER_* (identity)
    RESULT: REACHES — transcripts differ; the differing lines:
      8c8
      < (8) commit-tree <tree> -p <head>   rc=0  eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      > (8) commit-tree <tree> -p <head>   rc=0  77a80b52ca91fb8502d7e8083b46c28e4236c28b
      10c10
      <     vault HEAD after: eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      >     vault HEAD after: 77a80b52ca91fb8502d7e8083b46c28e4236c28b

R2P22  GIT_AUTHOR_DATE / GIT_COMMITTER_DATE (dates)
    RESULT: REACHES — transcripts differ; the differing lines:
      8c8
      < (8) commit-tree <tree> -p <head>   rc=0  eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      > (8) commit-tree <tree> -p <head>   rc=0  a4d2c18a23d7e6bdf72e746b088863a0e69292db
      10c10
      <     vault HEAD after: eb325f5247e9b19db9ea163da25ac50b0b461319
      ---
      >     vault HEAD after: a4d2c18a23d7e6bdf72e746b088863a0e69292db

R2P6  GIT_ALTERNATE_OBJECT_DIRECTORIES=<decoy>/.git/objects
    RESULT: REACHES — transcripts differ; the differing lines:
      3c3
      < (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=yes
      ---
      > (2) hash-object -w --stdin         rc=0  ced0d24043540233faea11b8d511d4b4bc63f235  storedInVault=no

R2P10  GIT_INDEX_FILE inherited (a copy of the user's index)
    RESULT: no reach — the nine shapes' transcripts are IDENTICAL to the baseline

############ SECTION 2 — the chained replay (write-target channels)
commitNamedSet DERIVES every object name from its own earlier pinned calls,
so a redirected run must be replayed as a chain, not shape by shape.

R2P0c  control — the chain under the baseline env
    (5) rev-parse HEAD  rc=0 -> VAULT
    (6) read-tree <own head>  rc=0
    (1) ls-tree <own head> -- a.txt  rc=0 mode=100644
    (2) hash-object -w --stdin  rc=0 sha=ced0d24043540233faea11b8d511d4b4bc63f235  inVault=yes inDecoy=no
    (3) update-index --add --cacheinfo  rc=0
    (7) write-tree  rc=0
    (8) commit-tree  rc=0
    (9) update-ref  rc=0
    => vault HEAD moved: YES   DECOY HEAD moved: no

R2P3c  GIT_DIR=<decoy>/.git
    (5) rev-parse HEAD  rc=0 -> DECOY
    (6) read-tree <own head>  rc=0
    (1) ls-tree <own head> -- a.txt  rc=0 mode=100644
    (2) hash-object -w --stdin  rc=0 sha=ced0d24043540233faea11b8d511d4b4bc63f235  inVault=no inDecoy=yes
    (3) update-index --add --cacheinfo  rc=0
    (7) write-tree  rc=0
    (8) commit-tree  rc=0
    (9) update-ref  rc=0
    => vault HEAD moved: no   DECOY HEAD moved: YES

R2P4c  GIT_OBJECT_DIRECTORY=<decoy>/.git/objects
    (5) rev-parse HEAD  rc=0 -> VAULT
    (6) read-tree <own head>  rc=128
    ABORTS at (6) — the run stops before it writes anything

R2P5c  GIT_COMMON_DIR=<decoy>/.git
    (5) rev-parse HEAD  rc=0 -> VAULT
    (6) read-tree <own head>  rc=128
    ABORTS at (6) — the run stops before it writes anything

############ SECTION 3 — the code channel: which pinned shape RUNS a configured program
R2P1  core.fsmonitor via the CARRIED HOME's ~/.gitconfig
    ls-tree: program-invocations=0
    hash-object: program-invocations=0
    read-tree: program-invocations=0
    update-index: program-invocations=2
    write-tree: program-invocations=2
    show: program-invocations=0
    rev-parse: program-invocations=0

R2P2  core.fsmonitor via XDG_CONFIG_HOME (carried) — the disposition this WP does NOT take
    ls-tree: program-invocations=0
    hash-object: program-invocations=0
    read-tree: program-invocations=0
    update-index: program-invocations=2
    write-tree: program-invocations=2
    show: program-invocations=0
    rev-parse: program-invocations=0

R2P2n  the SAME XDG config with XDG_CONFIG_HOME NOT carried — the adopted disposition
    ls-tree: program-invocations=0
    hash-object: program-invocations=0
    read-tree: program-invocations=0
    update-index: program-invocations=0
    write-tree: program-invocations=0
    show: program-invocations=0
    rev-parse: program-invocations=0

R2P7  core.fsmonitor injected via GIT_CONFIG_COUNT
    ls-tree: program-invocations=0
    hash-object: program-invocations=0
    read-tree: program-invocations=0
    update-index: program-invocations=2
    write-tree: program-invocations=2
    show: program-invocations=0
    rev-parse: program-invocations=0

R2P8  core.fsmonitor via a config selected by GIT_CONFIG_GLOBAL
    ls-tree: program-invocations=0
    hash-object: program-invocations=0
    read-tree: program-invocations=0
    update-index: program-invocations=2
    write-tree: program-invocations=2
    show: program-invocations=0
    rev-parse: program-invocations=0

R2P7h core.hooksPath injected via GIT_CONFIG_COUNT — does it fire a hook on the pinned update-ref?
    update-ref rc=0  hook-invocations=2
      HOOK RAN prepared
      HOOK RAN committed

R2P16 the USER's own hook (configured through the carried HOME's ~/.gitconfig) under the CONSTRUCTED env
    update-ref rc=0  the user's hook fired 2 time(s); its environment:
      --- hook fired (prepared); its environment: ---
      CPATH=/usr/local/include
      GIT_EXEC_PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core
      GIT_PREFIX=
      HOME=<ROOT>/uhome
      HOOKENV_LOG=<ROOT>/c.3905.25322.henv
      LIBRARY_PATH=/usr/local/lib
      MANPATH=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/share/man:/Library/Developer/CommandLineTools/usr/share/man:/Library/Developer/CommandLineTools/Toolchains/XcodeDefault.xctoolchain/usr/share/man:
      PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core:/usr/bin
      PWD=/private<ROOT>/c.3905.25322
      SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk
      SHLVL=1
      _=/usr/bin/env
      __CF_USER_TEXT_ENCODING=0x1F5:0x0:0x0
      --- end ---
      --- hook fired (committed); its environment: ---
      CPATH=/usr/local/include
      GIT_EXEC_PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core
      GIT_PREFIX=
      HOME=<ROOT>/uhome
      HOOKENV_LOG=<ROOT>/c.3905.25322.henv
      LIBRARY_PATH=/usr/local/lib
      MANPATH=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/share/man:/Library/Developer/CommandLineTools/usr/share/man:/Library/Developer/CommandLineTools/Toolchains/XcodeDefault.xctoolchain/usr/share/man:
      PATH=/Library/Developer/CommandLineTools/usr/libexec/git-core:/usr/bin
      PWD=/private<ROOT>/c.3905.25322
      SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk
      SHLVL=1
      _=/usr/bin/env
      __CF_USER_TEXT_ENCODING=0x1F5:0x0:0x0
      --- end ---

############ SECTION 4 — identity, replacement objects, signing
R2P17d the pinned commit-tree's RECORDED author/committer, with and without inherited identity
    baseline (no GIT_AUTHOR_*/GIT_COMMITTER_*):
      author wienerdog <wienerdog@localhost> 1700000000 +0000
      committer wienerdog <wienerdog@localhost> 1700000000 +0000
    with GIT_AUTHOR_*/GIT_COMMITTER_* exported:
      author Attacker <a@evil> 1700000000 +0000
      committer Attacker <a@evil> 1700000000 +0000

R2P18 replacement objects: a refs/replace/ ref in the vault, against the pinned reads and commit-tree
    a refs/replace/<template head> ref now points at a commit whose a.txt is REPLACED-CONTENT
    [honoured (no GIT_NO_REPLACE_OBJECTS)]
      (4) show <head>:a.txt        -> REPLACED-CONTENT
      (1) ls-tree <head> -- a.txt  -> 100644 blob 5871e2272698f4ba5f4b4bf34d4d80b56e5a48f4 a.txt
      (6) read-tree <head>, then the index's blob for a.txt -> 100644 5871e2272698f4ba5f4b4bf34d4d80b56e5a48f4 0 a.txt
      (8) commit-tree -p <head>    -> eb325f5247e9b19db9ea163da25ac50b0b461319  (its recorded parent: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a)
    [GIT_NO_REPLACE_OBJECTS=1]
      (4) show <head>:a.txt        -> template-a
      (1) ls-tree <head> -- a.txt  -> 100644 blob de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b a.txt
      (6) read-tree <head>, then the index's blob for a.txt -> 100644 de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b 0 a.txt
      (8) commit-tree -p <head>    -> eb325f5247e9b19db9ea163da25ac50b0b461319  (its recorded parent: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a)
    [GIT_REPLACE_REF_BASE=refs/other/]
      (4) show <head>:a.txt        -> template-a
      (1) ls-tree <head> -- a.txt  -> 100644 blob de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b a.txt
      (6) read-tree <head>, then the index's blob for a.txt -> 100644 de5f8b4f4970f2a5179fc157e660c4e21f5c5a9b 0 a.txt
      (8) commit-tree -p <head>    -> eb325f5247e9b19db9ea163da25ac50b0b461319  (its recorded parent: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a)

R2P15 signing: does the pinned commit-tree honour commit.gpgsign from the carried HOME's config?
    (8) commit-tree rc=0 -> eb325f5247e9b19db9ea163da25ac50b0b461319 ; gpg-program invocations=0
    control: a real git-commit under the SAME home -> gpg-program invocations=1
      GPG RAN --status-fd=2 -bsau t <t@e>

############ SECTION 5 — attributes, alternates, inherited index, discovery
R2P14 filter drivers (GIT_ATTR_* family) on the pinned show and hash-object
    (4) show      rc=0 filter-invocations=0
    (2) hash-object (no --path) rc=0 filter-invocations=0

R2P6b GIT_ALTERNATE_OBJECT_DIRECTORIES on the pinned read-tree of a tree held only elsewhere
    without alternates: rc=128
    with alternates:    rc=0  index now holds: b.txt reports/warnings.md

R2P10b an inherited GIT_INDEX_FILE on the six unset-disposition shapes
    (5) rev-parse rc=0
    (1) ls-tree rc=0
    (2) hash-object rc=0
    (4) show rc=0
    (8) commit-tree rc=0
    (9) update-ref rc=0
    the pointed-at index's bytes changed across all six: no

R2P12n discovery from a NON-repository directory inside a repository (the R1-E case)
    rev-parse --git-dir  rc=0 -> /private<VAULT>/.git
    rev-parse HEAD       rc=0 -> 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a  (the ANCESTOR repository)
    with a ceiling at the parent: rc=128 -> fatal: not a git repository (or any of the parent directories): .git

############ SECTION 6 — the two claims that are about OUR code, not git's
R2P19 PATH: what the scheduled child gets vs what a manual run carries
    scheduled PATH (buildCleanEnv): /opt/homebrew/Cellar/node/25.9.0_2/bin:/Users/gyulafeher/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
    manual PATH (process.env.PATH): /Users/gyulafeher/.grok/bin:/Users/gyulafeher/.antigravity-ide/antigravity-ide/bin:/Users/gyulafeher/.antigravity/antigr …
    identical? false
    scheduled HOME: /Users/gyulafeher   getPaths().home: /Users/gyulafeher   identical? true
    scheduled XDG_CONFIG_HOME present? false

R2P20 do the product roots move when HOME moves, with the four overrides fixed?
    home       HOME=/tmp/home-a -> /tmp/home-a   HOME=/tmp/home-b -> /tmp/home-b   same? false
    core       HOME=/tmp/home-a -> /tmp/wd-core   HOME=/tmp/home-b -> /tmp/wd-core   same? true
    state      HOME=/tmp/home-a -> /tmp/wd-core/state   HOME=/tmp/home-b -> /tmp/wd-core/state   same? true
    secrets    HOME=/tmp/home-a -> /tmp/wd-core/secrets   HOME=/tmp/home-b -> /tmp/wd-core/secrets   same? true
    logs       HOME=/tmp/home-a -> /tmp/wd-core/logs   HOME=/tmp/home-b -> /tmp/wd-core/logs   same? true
    claudeDir  HOME=/tmp/home-a -> /tmp/wd-claude   HOME=/tmp/home-b -> /tmp/wd-claude   same? true
    codexDir   HOME=/tmp/home-a -> /tmp/wd-codex   HOME=/tmp/home-b -> /tmp/wd-codex   same? true
    vault      HOME=/tmp/home-a -> /tmp/wd-vault   HOME=/tmp/home-b -> /tmp/wd-vault   same? true

############ TEMPLATE INTEGRITY — the run is invalid if this moved
    template HEAD at start: 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a
    template HEAD now     : 65b3416e82aa5f7fd9e54daee3699e7ebed8e41a
    unchanged: YES
    decoy HEAD at start: 48ae36eb59d2dcab40e2448bdaaf626be037d83d
    decoy HEAD now     : 48ae36eb59d2dcab40e2448bdaaf626be037d83d

ROOT kept at /var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/tmp.YtINwUFXEh
```

### Size — a named residual, not a trim

The spec is **908 lines** against `docs/specs/README.md`'s ~400-line
heuristic. Recorded rather than trimmed, in the shape audit-E's F6 used, because
trimming now would reopen surface the rounds have just frozen. **What the bulk
is:** Table U (24 rows), its rationale section, the nine acceptance criteria and
the two owner items with their enumerated overrule costs — every one of them
added because a round demanded it. **Zero gate machinery has been added since
round 1**: the verification steps are still V1–V6 and the RED declarations still
three. The implementation the spec describes is unchanged at one ~30-line module,
two call-site edits, one re-targeted declaration and three new ones — an **S**,
and it still touches 8 files.

### Revision — the tree after R3-A … R3-F

`coherence.js` on the revised spec:

```text
spec line count                                = 909
Table U rows                                   = 24  U1,U2,U3,U4,U4b,U5,U6,U7,U8,U9,U10,U11,U12,U13,U14,U15,U16,U17,U18,U19,U20,U22,U23,U21
  id set U1..U23 + U4b complete, no duplicates, closure row last: ok
U-ids mentioned anywhere but absent from table = none
U-rows never referenced outside their own row  = U8,U12,U14,U15,U16,U17,U18 (informational)
acceptance criteria                            = 9  AC1,AC2,AC3,AC4,AC5,AC6,AC7,AC8,AC9
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
file:line citations in the spec                = 24
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
   `src/core/paths.js:54`
      FIRST:   const home = env.HOME || os.homedir();
      LAST :   const home = env.HOME || os.homedir();
   `src/cli/dream.js:179`
      FIRST:   return spawnPinnedSync('git', getPaths(), {
      LAST :   return spawnPinnedSync('git', getPaths(), {
   `src/core/dream/promote.js:387-418`
      FIRST: function constructMergeEnv(root) {
      LAST : }
   `src/core/exec-identity.js:93-118`
      FIRST: function resolveExecutable(name, env, platform) {
      LAST : }
   `src/core/paths.js:53-54`
      FIRST: function getPaths(env = process.env) {
      LAST :   const home = env.HOME || os.homedir();
   `src/cli/run-job.js:47-50`
      FIRST: const ENV_PASSTHROUGH = [
      LAST : ];
   `src/cli/run-job.js:58-78`
      FIRST: const WIN_ENV_PASSTHROUGH = [
      LAST : ];
   `src/cli/run-job.js:155`
      FIRST:       USERPROFILE: paths.home, // deterministic homedir for children / os.homedir()
      LAST :       USERPROFILE: paths.home, // deterministic homedir for children / os.homedir()
   `docs/specs/done/WP-criterion-red-harness.md:95-96`
      FIRST:   builds the private index environment at exactly one site — the `indexEnv`
      LAST :   constant, `{ ...process.env, GIT_INDEX_FILE: tmpIndex }`. This is stated as an
   `docs/specs/done/WP-audit-c-close-disposition.md:130`
      FIRST:   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
      LAST :   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
   `tests/unit/dream-pipeline.test.js:411-414`
      FIRST:   Object.assign(process.env, {
      LAST :   });
RED ids named in the Exact-contracts table     = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
RED ids in V4's `want`  array                    = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
template sections absent                       = none

COHERENCE: no failures
```

`npm run lint` on the revision commit's tree:

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

## Round 4 — the closing confirmation, tip `edec229d`

Both channels ran on `edec229d`; `git status --porcelain` was byte-identical
before and after in each. Raws committed before any of this was read:

| Channel | Verdict | Raw | Commit that introduced it |
|---------|---------|-----|---------------------------|
| Codex plugin | **approve — no material findings** | `docs/specs/logbook/2026-09-06-git-env-pinning-gate-raw-round4-codex-plugin.txt` | `8776cace` |
| Hermetic shadow | needs-attention — three findings | `docs/specs/logbook/2026-09-06-git-env-pinning-gate-raw-round4-herdr-shadow.txt` | `f07c1210` |

The plugin confirms R3-A, R3-B, R3-D, R3-E and R3-F fixed, and R3-C
*"substantively corrected"* with an evidence-presentation note; it resolved all
28 probe ids to exactly one definition each and ran the three RED failure sets
through the real `evaluateRed()`. The shadow's three findings are below. **Both
again disclosed** that `npm test` and `node scripts/red-proofs.js` stopped before
running on sandbox EPERM, so both verdicts are readings on those points.

### Findings, bands, criterion branch, disposition

| # | Channels | Band | Branch (§0.1) | Disposition, and why it does not change what is built |
|---|----------|------|---------------|------------------------------------------------------|
| **R4-A** | shadow F1 | B | 5/6 → **LIGHT (mirror drift)** | **FIX.** The Implementation-notes bullet still said `git-env.js` *"needs `node:path` at most"*, contradicting R3-A's Deliverables row. That bullet is a MIRROR of the row and R3-A's sweep missed it. Replaced with the row's own constraint — zero new **package** dependencies; `node:path` and the existing `../paths` (`getPaths`), nothing else. **Nothing the implementer builds changes**: the Deliverables row, which is the permission boundary, already said this; the contradiction was between two statements of one decision, which is exactly the class the round-2 extraction was meant to end and one surface it had not reached |
| **R4-B** | shadow F2 | B | 6 → **LIGHT (a false claim, corrected)** | **FIX the claim, not the machinery.** The shadow executed the counterexample: spreading `process.env` and deleting every key NOT in the positive allowlist yields a map **deeply equal** to key-by-key construction — canary absent, `GIT_DIR` absent — so the sentence *"a spread, a filtered copy or a delete-list fails that on every host"* was FALSE for the allowlist-driven filter. **The PRODUCT property is untouched and fully asserted**: AC1 requires the child environment to BE exactly the allowlist map, and both constructions satisfy it because they produce the same map. What is genuinely forbidden is a **DENYLIST** — spread, then delete the names someone thought of — which leaks every key nobody listed and which the canary does catch. AC1's canary paragraph, the Security-checklist bullet and `buildGitEnv`'s JSDoc now say that precisely, and add what a runtime check CANNOT do: it cannot distinguish two source forms that produce the same map. Key-by-key construction remains the exact contract's **required source form**, enforced by the reviewer's read of `git-env.js`. **No structural gate was added** — machinery guarding no product behaviour, against a frozen surface (`codex-review.md`, "The loop converges by freezing surface") |
| **R4-C** | shadow F3 + the plugin's note — **CONVERGED** | C | 6 → **LIGHT (evidence cell)** | **FIX.** `R3P6`'s output proves shape (2) — the deduplication result — but does not print a discriminating shape-(6) comparison; `R2P6b` is what proves the `read-tree` reach. U9's Reach cell is now `**R3P6** — reaches (2); **R2P6b** — reaches (6)`, and the deduplication/broken-history consequence lives only in the rationale section and round 3's record. **A mechanical re-check of every Reach cell** then found four more carrying interpretation rather than a probe id and a result: U6, U15, U20 and U22 are trimmed the same way, and U15's discovery fact gains a rationale bullet so nothing is lost. U9's ABSENT disposition is unchanged |

**Round outcome: CLOSE.** No finding is about the product's behaviour.

## Closure

**The decision, and the rule it rests on.** `docs/runbooks/codex-review.md`,
weighted closure: *"The loop is DONE when a round finds nothing about the
product. Machinery findings at that point are fixed or accepted as named
residuals; they do not extend the loop."* Round 4 is that round. One channel
returned **approve, no material findings**; the other returned three, and every
one is a mirror sentence, a false claim about what a test discriminates, or an
evidence citation — none changes what the implementer builds, and all three are
fixed in place rather than carried. **No further external round is owed.** A
clean-context mechanical verification follows on this tip, then the PR.

### The rounds

| Round | Tip | Raws (introducing SHA) | Verdicts | Outcome (§0.1 round rule) |
|-------|-----|------------------------|----------|---------------------------|
| 0 | `4b629ec6` (base) | architect's own; executor passes `T1`–`T2`, `X1`–`X7` | — | criterion pinned; 7 findings fixed |
| 1 | `4cb6259f` | plugin `8b47487d`, shadow `9c7d25a9` | needs-attention / needs-attention | **DESIGN** (branch 2 on R1-D) |
| 2 | `235af369` | plugin `f69eee7b`, shadow `5251057e` | needs-attention / needs-attention | **DESIGN + EXTRACTION** (branch 3 fired) |
| 3 | `2ad1434c` | plugin `c00f6f4b`, shadow `3c2571a4` | needs-attention / needs-attention | **HEAVY** (branch 4 on R3-A) |
| 4 | `edec229d` | plugin `8776cace`, shadow `f07c1210` | **approve** / needs-attention | **CLOSE** |

Between rounds 1 and 4 the spec's Table U grew from 21 rows to 24 and every
Reach cell was re-derived twice; **no verification machinery was added after
round 1** — still V1–V6, still three RED declarations.

### Named residuals carried OUT of the loop

Each is stated here so the next reader finds them together, and each already has
its home in the spec or a successor.

1. **Nested-vault discovery.** `assertGitRepo` establishes that the vault is
   INSIDE a repository, not that it IS one; a non-repository vault directory
   within a repository is targeted at the ancestor by discovery, today and
   independent of this pin. Owner item **O2**; owned by
   `docs/specs/WP-dream-git-env-validate-seam.md`, which carries the three
   candidate answers and the cost of each.
2. **The second git spawn point.** `validate.js`'s module-private `git()` keeps
   inheriting `process.env`. Same owner item, same successor.
3. **Size.** The spec is **932 lines** against `docs/specs/README.md`'s
   ~400-line heuristic. Recorded, not trimmed — trimming would reopen surface
   the loop has just frozen. It still touches 8 files and the implementation is
   an **S**.
4. **U8 and U9 have no dedicated RED proof.** Both are measured to reach a
   pinned shape; what they rest on is row U21 plus AC1's canary — the
   environment is built rather than filtered — not a per-channel proof. Adding
   two more declarations would grow the verification surface to guard something
   the construction already gives.
5. **AC8's greps prove PRESENCE, not content.** A copied heading over a wrong
   body passes V5. The content obligations are the Mirrored Surface Checklist's,
   read whole-cell by wd-reviewer.
6. **The partial-clone lazy fetch is NOT MEASURED** (row U20, provenance
   `git help partial-clone`), and the **win32 rows U4/U4b are NOT MEASURED** —
   no win32 host in this loop; their provenance is `run-job.js`'s existing
   passthrough list.
7. **Three named costs the pin charges**, each in the rationale section:
   `GIT_CONFIG_GLOBAL` (a config relocated only by that variable stops applying
   to the run's calls), `GIT_TRACE*` (no tracing of the run's own git calls),
   and `XDG_CONFIG_HOME` (owner item **O3**). Plus U22's — a user who tags dream
   commits through `GIT_COMMITTER_*` loses that — and U23's, that replacement
   refs can no longer be switched off from the shell for the run.
8. **Three owner items, none a direct ruling.** **O1** (pin, by construction),
   **O2** (the successor split) and **O3** (`XDG_CONFIG_HOME` not carried) are
   recommendations adopted under the standing authorization of 2026-09-05. Their
   enumerated overrule costs live in the spec's
   `## Dispatch precondition — owner items`; the owner-rulings record
   (`2026-09-05-owner-rulings-git-env-pinning-queue.md`) records the adoption and
   cites those costs rather than restating them.

### Dispatch-time re-verification — the checklist the dispatch message ticks

`docs/runbooks/codex-review.md` requires the orchestrator to re-run every
executable Current-state claim against `main` immediately before dispatch, and to
record the run and the SHA it ran against. Every such claim in this spec,
enumerated so the dispatch message can tick them:

- [ ] `src/cli/dream.js:166-175` resolves to `gitIn`, first line to last brace.
- [ ] `src/cli/dream.js:178-186` resolves to `spawnGitPinned`.
- [ ] `src/cli/dream.js:226-231` resolves to the private-index block, and its
      first line is still `const tmpIndex = …`.
- [ ] `src/cli/dream.js:179` is still the `spawnPinnedSync('git', getPaths(), {`
      line (row U2's licence for the module's one non-`node:` dependency).
- [ ] `src/cli/dream.js:562` is still `const spawnGit = opts.spawnGit || spawnGitPinned;`.
- [ ] `src/cli/dream.js:587` is still `assertGitRepo(vaultDir);`.
- [ ] `src/cli/dream.js:1007` is still the `show HEAD:${WARNINGS_REL}` call.
- [ ] **The `indexEnv` literal** — `const indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex };`
      — is still byte-exact in `src/cli/dream.js`. It is the line the WP edits AND
      the `find` of an existing RED declaration.
- [ ] **`tests/red-proofs/dream-pipeline.proofs.json:10-11`** still carries that
      literal as `dream-private-index-dropped`'s `find`/`replace` pair.
- [ ] `src/core/dream/validate.js:64-81` resolves to the module-private `git()`,
      and `:88-93` to `assertGitRepo`.
- [ ] `src/core/exec-identity.js:93-118` resolves to `resolveExecutable`,
      `:451-461` to `verifyPin`'s resolve-and-compare block, `:553` to
      `spawnPinnedSync`.
- [ ] `src/core/dream/promote.js:387-418` resolves to `constructMergeEnv`.
- [ ] `src/cli/run-job.js:47-50` is still `ENV_PASSTHROUGH`, `:58-78`
      `WIN_ENV_PASSTHROUGH`, `:150` `buildCleanEnv`, `:155`
      `USERPROFILE: paths.home`.
- [ ] **`src/core/paths.js:53-54`** still reads
      `function getPaths(env = process.env) {` / `const home = env.HOME || os.homedir();`
      — row U2's source contract rests on it.
- [ ] **`tests/unit/dream-pipeline.test.js:411-414`** is still the fixture's
      `Object.assign(process.env, { … })` block, and **`ENV_KEYS`** still exists
      as the save/overwrite/restore list AC1's canary and unset fixtures use.
- [ ] `tests/unit/dream-pipeline.test.js:185` is still `watchIndexWrites`.
- [ ] `docs/specs/done/WP-criterion-red-harness.md:95-96` and
      `docs/specs/done/WP-audit-c-close-disposition.md:130` still quote the
      `indexEnv` literal (the two records this WP deliberately does not amend).
- [ ] **V5's third grep** — `NEITHER SUPPRESSED NOR DETECTED` — is still present
      in `docs/specs/done/WP-dream-promote-in-workspace.md`, so the guard that
      proves row W1's hook residual was left intact is not vacuous.
- [ ] `node scripts/red-proofs.js --wp WP-dream-git-env-pinning` still exits 1
      with `VACUOUS: V2` (the deliverable-absent red), and
      `node scripts/red-proofs.js --wp WP-show-slot-own-value-kind` still reports
      both of its proofs `PROVEN`.

**A stale claim blocks the dispatch and routes the spec back to wd-architect** —
it is not the implementer's to work around, and most of the citations above point
into files inside this WP's own Deliverables, which is precisely the window that
gate exists for.

### Revision — the tree at closure

`coherence.js`:

```text
spec line count                                = 933
Table U rows                                   = 24  U1,U2,U3,U4,U4b,U5,U6,U7,U8,U9,U10,U11,U12,U13,U14,U15,U16,U17,U18,U19,U20,U22,U23,U21
  id set U1..U23 + U4b complete, no duplicates, closure row last: ok
U-ids mentioned anywhere but absent from table = none
U-rows never referenced outside their own row  = U8,U12,U14,U16,U17,U18 (informational)
acceptance criteria                            = 9  AC1,AC2,AC3,AC4,AC5,AC6,AC7,AC8,AC9
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
file:line citations in the spec                = 24
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
   `src/core/paths.js:54`
      FIRST:   const home = env.HOME || os.homedir();
      LAST :   const home = env.HOME || os.homedir();
   `src/cli/dream.js:179`
      FIRST:   return spawnPinnedSync('git', getPaths(), {
      LAST :   return spawnPinnedSync('git', getPaths(), {
   `src/core/dream/promote.js:387-418`
      FIRST: function constructMergeEnv(root) {
      LAST : }
   `src/core/exec-identity.js:93-118`
      FIRST: function resolveExecutable(name, env, platform) {
      LAST : }
   `src/core/paths.js:53-54`
      FIRST: function getPaths(env = process.env) {
      LAST :   const home = env.HOME || os.homedir();
   `src/cli/run-job.js:47-50`
      FIRST: const ENV_PASSTHROUGH = [
      LAST : ];
   `src/cli/run-job.js:58-78`
      FIRST: const WIN_ENV_PASSTHROUGH = [
      LAST : ];
   `src/cli/run-job.js:155`
      FIRST:       USERPROFILE: paths.home, // deterministic homedir for children / os.homedir()
      LAST :       USERPROFILE: paths.home, // deterministic homedir for children / os.homedir()
   `docs/specs/done/WP-criterion-red-harness.md:95-96`
      FIRST:   builds the private index environment at exactly one site — the `indexEnv`
      LAST :   constant, `{ ...process.env, GIT_INDEX_FILE: tmpIndex }`. This is stated as an
   `docs/specs/done/WP-audit-c-close-disposition.md:130`
      FIRST:   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
      LAST :   (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
   `tests/unit/dream-pipeline.test.js:411-414`
      FIRST:   Object.assign(process.env, {
      LAST :   });
RED ids named in the Exact-contracts table     = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
RED ids in V4's `want`  array                    = git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
template sections absent                       = none

COHERENCE: no failures
```

`npm run lint`:

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

The spec's `status:` is flipped to **`Ready`** in the same commit.
