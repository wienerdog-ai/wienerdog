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

## External rounds

Round 2 is owed (DESIGN). Appended by the orchestrator below this line.
