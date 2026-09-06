---
date: 2026-09-06
title: "Design-gate rounds: WP-dream-git-env-validate-seam"
related_wps: [WP-dream-git-env-validate-seam, WP-dream-git-env-pinning]
---

# Design-gate rounds — WP-dream-git-env-validate-seam

Round zero is the architect's own measurement, internal coherence pass and
both-directions proof of every new verification step
(`docs/runbooks/codex-review.md`, "Internal coherence pass"). The orchestrator's
clean-context executors and the external double-channel rounds are appended
below it.

## Round zero — architect, 2026-09-06, tree at `8358655d`

`8358655d` is `origin/main` at the time of this pass — the tip at which
`WP-dream-git-env-pinning` is `Done`, `src/core/dream/git-env.js` exists, and
`docs/specs/done/WP-dream-git-env-pinning.md` is the filed spec whose **Table U**
is canonical for the run's git channel set. The worktree
`/Users/gyulafeher/Documents/Claude_Projects/wienerdog-wt/validate-seam-design`
(branch `docs/wp-dream-git-env-validate-seam`) was created from it and adds
**documentation only** — no `src/` or `tests/` change. Every code citation and
code-shape claim below is therefore against `8358655d`.

**No measurement mutated the worktree or the main checkout.** Every git probe,
every `init`/`adopt` run and every both-directions state ran in `mktemp -d`
scratch directories or under the session scratchpad; the red-proof green-side run
used `--root` pointed at a plain `git archive HEAD | tar -x` copy in scratch,
never the worktree, because `scripts/red-proofs.js` refuses the `node_modules`
SYMLINK a shared-dependency worktree has. `git status --porcelain` in the
worktree showed only this pass's own two documentation files.

**Every measurement was run FROM A FILE** (`docs/runbooks/codex-review.md`,
"Run a gate from a script, not from an inline shell one-liner"). The drivers are
`vs-p1-p2-guard.js`, `vs-p4-adopt.js`, `vs-p5-init.js`, `vs-p6-callers.sh`,
`check-ranges.js`, `prove-v3-v4.sh` and `coherence.js`. Every exit code below was
**captured as its own statement**, never through a pipe — the defect
`WP-dream-git-env-pinning`'s round zero recorded as finding Z5 (a piped `node`
returned the pipeline's status, so all three states read `rc=0`) was reproduced
in this pass's first draft of `prove-v3-v4.sh` and fixed the same way before any
result was believed; it is recorded as finding Y5 below.

Scratch paths in pasted output are scrubbed to `<scratch>`; on macOS the
realpath form leaves a `/private<scratch>` prefix where the driver resolved the
symlinked temp root. No other character of any pasted output was changed.

### 0.1 STOP CRITERION — pinned BEFORE round 1

Pinned here, before any adversarial round runs. Materiality bands are HANDOVER's
and `docs/runbooks/codex-review.md`'s ("Finding disposition"): **A** = silent
wrong behavior with a data-loss or security consequence; **B** = caught
downstream; **C** = hygiene.

**Step 0 — the band gate.** Before any branch is consulted: a round whose
findings are **all band C** → **CLOSE**, hygiene fixed in place. **Any finding
above C** → route every finding through the ladder below.

**Then, applied PER FINDING, first match wins:**

1. **The product decision** — the finding argues that the constructed
   environment should NOT reach this spawn point, or that the guard's
   precondition should be tightened (a `--show-toplevel` equality, a
   `GIT_CEILING_DIRECTORIES`), or that a currently-supported vault shape should
   stop dreaming → **OWNER item**, parked with a recommendation and an
   enumerated overrule cost under escalation (ii). **It does NOT block**: the
   loop continues on the remaining findings, and the item is appended to
   `2026-09-05-owner-rulings-git-env-pinning-queue.md` under "Items dispatched
   under the standing process", continuing this WP's numbering (O4, O5, …).
2. **The measurement the WP rests on** — the finding falsifies a probe: the
   guard is shown NOT to accept the `GIT_DIR` case today, or `adopt` is shown to
   REFUSE the nested directory, or a Table J "Act"/"Caller" cell is shown wrong
   → **DESIGN**. The answer is to **re-derive Table J mechanically** from a fresh
   probe run and move every registered mirror in the same commit, never to patch
   the cell. `adopt`'s verdict is load-bearing twice over: it is what selects
   answer 3 over answers 1 and 2 in owner item O5, so a falsification there
   reopens the recommendation itself.
3. **Same-family repeat (ADR-0031)** — the second consecutive round landing a
   finding on **any row of Table J, in any surface the Mirrored Surface Checklist
   registers** → **contract EXTRACTION pass**
   (`docs/runbooks/codex-review.md`, "Loop circuit-breaker (ADR-0031)"), never a
   third row patch. **Table J is the family** for this rule, and it is named here
   so the breaker has a subject. Table U is NOT this WP's family: it belongs to
   `WP-dream-git-env-pinning`, is cited and never restated, and a finding against
   it is routed there rather than absorbed.
4. **Operative content** — it changes what the implementer must build: the
   Deliverables permission boundary, `git()`'s or `assertGitRepo`'s contract, an
   acceptance criterion's assertion → **HEAVY fix**, then a full fresh external
   round.
5. **Mirror drift** — a registered mirror disagrees with a Table J row that is
   itself right → **LIGHT fix**: correct every mirror the checklist names, in the
   same commit, and re-run `coherence.js`. No new round.
6. **Machinery or record only** — a verification step's shape, a citation, this
   record, or the RED declaration's id → **LIGHT fix**, mechanically
   re-verified, no new round.
7. **Nothing about the product** → **CLOSE**.

**Round rule.** A round's outcome is the **most escalating** outcome any single
finding produced, on `CLOSE < LIGHT < HEAVY < EXTRACTION < DESIGN`. OWNER items
are raised alongside and do not by themselves hold the loop open.

**FALLBACK.** If the single RED declaration itself draws findings in two
consecutive rounds — the mutation shape, the `expectRed` set, the id — drop it
and carry AC1 on the unit assertion plus `npm test` alone. Verification machinery
may grow only to guard a product behavior, in the smallest form that guards it
(`docs/runbooks/codex-review.md`, "The loop converges by freezing surface").
**Recorded consequence if it fires:** AC1 stays a behavioural criterion — the
fallback trims the proof, never the assertion, and never the measured
before-state (VS-P1 arm (b)) that makes it non-vacuous.

### 0.2 The measurements

Scratch repositories per driver, on **git 2.50.1 (Apple Git-155)**,
`/usr/bin/git`, Node 25.9.0. Each block is the driver's own pasted stdout; the
command and its exit code were captured as their own statements.

**Two probes run through the REAL code path rather than through a raw `git`
invocation** — `assertGitRepo` is imported from
`src/core/dream/validate.js` and called, with the pinned exec store created in
scratch first, so VS-P1's verdict is the product's and not a reconstruction of
it. `WP-dream-git-env-pinning`'s M4 measured the same property with a bare
`git -C <dir> rev-parse --git-dir`; this pass re-measured it one level up, and
the two agree.

#### VS-P1 / VS-P2 / VS-P3 — the guard's verdict, before and after (`vs-p1-p2-guard.js`, rc 0)

```text
ROOT=<scratch>
== VS-P1 — assertGitRepo TODAY (env is process.env) ==
  (a) non-repo vault, GIT_DIR unset           -> REFUSES: vault is not a git repository at <scratch>/vault — run `npx wienerdog init` first.
  (b) non-repo vault, GIT_DIR=<other>/.git    -> ACCEPTS (no throw)
  (c) nested non-repo dir inside a repo       -> ACCEPTS (no throw)
  (d) the ancestor repository root itself     -> ACCEPTS (no throw)
== VS-P2 — the SAME argv under buildGitEnv() (the decided environment) ==
  (a) non-repo vault, GIT_DIR unset           -> status=128 keys=[HOME,PATH] out=[fatal: not a git repository (or any of the parent directories): .git]
  (b) non-repo vault, GIT_DIR=<other>/.git    -> status=128 keys=[HOME,PATH] out=[fatal: not a git repository (or any of the parent directories): .git]
  (c) nested non-repo dir inside a repo       -> status=0 keys=[HOME,PATH] out=[/private<scratch>/ancestor/.git]
  (d) the ancestor repository root itself     -> status=0 keys=[HOME,PATH] out=[.git]
== VS-P3 — --show-toplevel for the same four, under buildGitEnv() ==
  non-repo vault  -> status=128 toplevel=[] equals-dir=false
  nested dir      -> status=0 toplevel=[/private<scratch>/ancestor] equals-dir=false
  ancestor root   -> status=0 toplevel=[/private<scratch>/ancestor] equals-dir=true
kept at <scratch>
```

**What these establish.** **VS-P1 arm (b) is the BEFORE-STATE the RED proof
turns**: the shipped guard, called as the dream calls it, **accepts** a
directory that is not a repository whenever `GIT_DIR` points at one elsewhere.
**VS-P2 arm (b) is the after-state**: the identical argv under `buildGitEnv()`
exits 128 — and the whole constructed map on this host is `{HOME, PATH}`, which
is also what makes the spec's AC2 "no `GIT_INDEX_FILE`" clause checkable.
**VS-P2/VS-P3 arm (c) is the nested case, and it moves under NO environment
variable**: discovery alone resolves the ancestor, before and after the change,
which is why owner item O5 is not an environment question. VS-P3 is the probe an
answer-1 implementation would rest on, measured here so its cost is stated
rather than guessed.

#### VS-P4 — does `wienerdog adopt` accept a nested directory? (`vs-p4-adopt.js`, rc 0)

The real CLI, not a reading of it: `init.run(['--yes'])` then
`adopt.run([<nested dir>, '--yes'])` in an isolated `WIENERDOG_HOME`, with the
repo's own fake-brain fixture on `PATH` so the pin preflight resolves.

```text
ROOT=<scratch>
== VS-P4 — `wienerdog adopt <nested dir inside a repository>` ==
  init rc=0
  adopt rc=0  (no throw — ACCEPTED)
  a `.git` was created inside the nested dir? NO
  config.yaml says: vault: /private<scratch>/ancestor/sub/my-vault
  ancestor repository log after adopt:
    9a6149c ancestor
  ancestor `git status --porcelain` after adopt:
    [?? sub/]
  adopt transcript lines mentioning git:
kept at <scratch>
```

**What it establishes, and it is what decides owner item O5.** A directory that
is a **subdirectory of an existing repository with no `.git` of its own** is
adopted successfully; `adopt`'s `isGitRepo` (`src/cli/adopt.js:79-83`) is the
same `rev-parse --git-dir` predicate as the guard's, so adopt reads "inside a
repository" as "already a repo", skips `git init`, and writes that path into
`config.yaml`. The nested case is therefore **reachable through the product's
own front door** and is a supported configuration today — not a hand-edited
`config.yaml`. That is why answers 1 and 2 (require `--show-toplevel == vault`;
set `GIT_CEILING_DIRECTORIES`) are user-visible breaks and are parked as O5's
overrule cost rather than taken.

**One further observation the probe surfaces and the spec does not rest on:**
because adopt skipped its snapshot, the ancestor's own `status` shows `?? sub/`
— the adopted vault is untracked in the repository the dream would target. What
the pipeline then does with that is inferred from the code, not measured here.

#### VS-P5 — and `wienerdog init`? (`vs-p5-init.js`, rc 0)

```text
ROOT=<scratch>
== VS-P5 — `wienerdog init` with the vault path inside an existing repository ==
  init rc=0  (no throw — ACCEPTED)
  a `.git` was created inside the nested vault? NO
  config.yaml: vault: null            # set by /wienerdog-setup or `wienerdog adopt`
  ancestor status --porcelain: [(clean)]
```

**What it establishes — and the narrower claim is the honest one.** `init --yes`
does not refuse a `WIENERDOG_VAULT` pointing inside a repository, but it also
does not create a vault or set `vault:` at all: it leaves `vault: null` for
setup or adopt. **So `init` is not the door that establishes the nested case;
`adopt` is** (VS-P4), and O5 rests on VS-P4. `src/core/vault.js:118` uses the
same `rev-parse --git-dir` predicate before its `git init`, so a vault later
created there would inherit the same reading — recorded, not measured.

#### VS-P6 — the callers of `validate.js`'s `git()`, enumerated from the files (`vs-p6-callers.sh`, rc 0)

```text
== the four call sites of validate.js's git() ==
89:  const res = git(vaultDir, ['rev-parse', '--git-dir'], { allowFail: true });
103:  const res = git(vaultDir, ['status', '--porcelain', '-uall']);
118:  git(vaultDir, ['reset', '--hard', 'HEAD']);
119:  git(vaultDir, ['clean', '-fd']);
rc=0

== the exported names dream.js imports from validate.js ==
const {
  makeGates,
  assertGitRepo,
  isNewSkillDraft,
  parseFrontmatter,
} = require('../core/dream/validate');
rc=0

== callers in src/ of each function that reaches git() ==
-- assertGitRepo --
src/cli/dream.js:29:  assertGitRepo,
src/cli/dream.js:587:  assertGitRepo(vaultDir);
   (grep rc=0; empty above = no caller in src/ outside validate.js)
-- assertCleanTree --
   (grep rc=1; empty above = no caller in src/ outside validate.js)
-- restoreVaultToHead --
   (grep rc=1; empty above = no caller in src/ outside validate.js)

== the dream path's own call ==
587:  assertGitRepo(vaultDir);
rc=0
```

**What it establishes — Table J's Caller and Act columns.** `git()` has exactly
**four** call sites. Only `assertGitRepo` has a caller in `src/`, and it is
`src/cli/dream.js:587`, on every run. `assertCleanTree` and `restoreVaultToHead`
have **no caller in `src/` at all** — the grep's rc 1 is the statement — which
matches the contract `validate.js`'s own export block records (rows G3/G6, owner
ruling of 2026-08-30, and row G9). So of the two WRITES in this file
(`reset --hard HEAD`, `clean -fd`) and the one index-refreshing read
(`status --porcelain -uall`), **none runs on the dream path**, and the
environment change is inert at those three sites. That is stated in the spec as
a finding to surface, not fixed: adding a caller is Table W row W6's
owner-review clause.

### 0.3 Every cited range checked at BOTH ends

`docs/runbooks/codex-review.md`, "Internal coherence pass". Each range's first
and last line printed with its neighbours, so a range ending inside the next
construct is visible. Run by `check-ranges.js`, rc 0.

```text
src/core/dream/validate.js:64-81  (the module-private git())
   before:  */
   FIRST : function git(vaultDir, args, opts = {}) {
   LAST  : }
   after :

src/core/dream/validate.js:88-93  (assertGitRepo)
   before:  */
   FIRST : function assertGitRepo(vaultDir) {
   LAST  : }
   after :

src/core/dream/validate.js:102-107  (assertCleanTree)
   before:  */
   FIRST : function assertCleanTree(vaultDir) {
   LAST  : }
   after :

src/core/dream/validate.js:117-120  (restoreVaultToHead)
   before:  */
   FIRST : function restoreVaultToHead(vaultDir) {
   LAST  : }
   after :

src/cli/dream.js:587  (the assertGitRepo call site)
   before:   // 2. Vault must be a git repo (read-only check; fail fast without the lock).
   FIRST :   assertGitRepo(vaultDir);
   LAST  :   assertGitRepo(vaultDir);
   after :

src/cli/dream.js:29  (the assertGitRepo import)
   before:   makeGates,
   FIRST :   assertGitRepo,
   LAST  :   assertGitRepo,
   after :   isNewSkillDraft,

src/core/dream/git-env.js:26-41  (buildGitEnv)
   before:  */
   FIRST : function buildGitEnv(indexFile) {
   LAST  : }
   after :

src/core/exec-identity.js:554-558  (spawnPinnedSync uses opts.env for resolution and for the child)
   before: function spawnPinnedSync(name, paths, opts = {}) {
   FIRST :   const env = opts.env || process.env;
   LAST  :   const raw = spawnSync(command, [...args, ...jobArgs], passthroughSpawnOpts(opts, SAFE_SYNC_OPTS, env));
   after :   /** @type {{status:number|null, signal:string|null, stdout:any, stderr:any, error?:Error}} */

src/core/exec-identity.js:556  (the pin resolution that reads env)
   before:   const platform = opts.platform || process.platform;
   FIRST :   const { command, args } = resolvePinnedSpawn(name, paths, env, platform);
   LAST  :   const { command, args } = resolvePinnedSpawn(name, paths, env, platform);
   after :   const jobArgs = Array.isArray(opts.args) ? opts.args : [];

src/core/exec-identity.js:558  (the child spawn that carries env)
   before:   const jobArgs = Array.isArray(opts.args) ? opts.args : [];
   FIRST :   const raw = spawnSync(command, [...args, ...jobArgs], passthroughSpawnOpts(opts, SAFE_SYNC_OPTS, env));
   LAST  :   const raw = spawnSync(command, [...args, ...jobArgs], passthroughSpawnOpts(opts, SAFE_SYNC_OPTS, env));
   after :   /** @type {{status:number|null, signal:string|null, stdout:any, stderr:any, error?:Error}} */

src/cli/adopt.js:79-83  (adopt's isGitRepo)
   before:
   FIRST : /** @param {string} dir @returns {boolean} true if dir is inside a git work tree. */
   LAST  : }
   after :

src/core/vault.js:118  (vault.js's repo check before git init)
   before:     await withVaultLock(targetDir, () => {
   FIRST :       if (!gitOk(['rev-parse', '--git-dir'], targetDir)) {
   LAST  :       if (!gitOk(['rev-parse', '--git-dir'], targetDir)) {
   after :         execFileSync('git', ['init'], { cwd: targetDir, stdio: 'ignore' });

tests/unit/dream-validate.test.js:1386  (the existing assertGitRepo assertion)
   before:     // Valid pin: git ops run normally (via the pinned absolute realpath).
   FIRST :     assertGitRepo(vault);
   LAST  :     assertGitRepo(vault);
   after :
```

Three ranges were **wrong at one end and corrected here rather than in prose**:
`src/cli/adopt.js:79-82` ended on the `return` with the closing brace after it
(now `:79-83`) and `src/core/vault.js:118-119` ended inside the `if` block (now
`:118`) — both finding Y3, caught in this pass; and
`src/core/exec-identity.js:554-556` covered only the FIRST of the two facts the
spec cites it for — finding **X2**, caught by the coherence executor, corrected
to `:554-558` and re-run above rather than edited in place. X2's fix also pins
each of the two facts to its own line in the spec's Current-state bullet, so
`:556` and `:558` were **added to `check-ranges.js`** and are checked at both
ends above rather than trusted because they fall inside a checked range.

### 0.4 Both-directions proof of every NEW verification step

`docs/runbooks/spec-authoring.md`: a new verification step is trusted only after
a real green on the compliant state and a real red on a deliberately broken one,
**and the deliberately-broken state includes the DELIVERABLE-ABSENT case.**

**V1 (`npm test`)** — not new; run on the untouched tree as the baseline the
implementer inherits (rc 0):

```text
ℹ tests 2690
ℹ suites 0
ℹ pass 2678
ℹ fail 0
ℹ cancelled 0
ℹ skipped 12
ℹ todo 0
ℹ duration_ms 49194.401833
```

**V2 (the red-proof runner)** — not new either, but both of its sides were run.
The **deliverable-absent red**, in the worktree (rc 1):

```text
$ node scripts/red-proofs.js --wp WP-dream-git-env-validate-seam
RED proofs — root /Users/gyulafeher/Documents/Claude_Projects/wienerdog-wt/validate-seam-design
Node 25.9.0 (lane floor 18.15.0)
63 declared proof(s), 0 selected [--wp WP-dream-git-env-validate-seam]
VACUOUS: V2 — the selection matched no proof. A selection matching nothing is a vacuous run, not an empty success.
rc=1
```

And **the green side of the mechanism**, on a plain `git archive` copy in scratch
(the worktree's `node_modules` is a symlink, which the runner refuses at
SNAPSHOT), selecting the predecessor's declarations, which do exist:

```text
$ node scripts/red-proofs.js --root <scratch copy> --wp WP-dream-git-env-pinning
63 declared proof(s), 3 selected [--wp WP-dream-git-env-pinning]
snapshot: 1394 entries under the declared domain (`.git/` and `node_modules/` excluded)

PROVEN       git-env-inherits-git-dir  (WP-dream-git-env-pinning criterion 2)
PROVEN       git-env-inherits-object-directory  (WP-dream-git-env-pinning criterion 3)
PROVEN       git-env-inherits-config-count  (WP-dream-git-env-pinning criterion 4)
…
RUN: FILTERED
rc=1
```

**The green side of THIS WP's own declaration is not runnable at round zero and
is not claimed** — the declaration does not exist until the implementer writes
it. What is proven now is the absent-state red, the identity check (V3) and the
invariance guard (V4), all three runnable on the pinned base with what the spec
itself provides. The spec's V2 comment states both exit shapes for the same
reason `WP-dream-git-env-pinning`'s did: a `--wp` selection never exits 0 while
another WP has declarations, so the whole-tree run is the gate.

**V3 (the declaration identity check) and V4 (the argv-invariance guard)** — all
four states, from `prove-v3-v4.sh`. The rc is captured with no pipe between the
command and the read:

```text
=== STATE absent — no declaration file; validate.js deleted for V4's guard ===
  V3 rc=1  node:internal/modules/cjs/loader:1478
  V4 rc=1  FAIL: src/core/dream/validate.js is missing
=== STATE compliant — declaration present with the one declared id; argv untouched ===
  V3 rc=0  validate-git-inherits-git-dir
  V4 rc=0  V4 OK — Table J's four argv literals byte-exact, and no fifth call site
=== STATE violating (a) — a second declaration added; the status argv widened ===
  V3 rc=1  validate-git-extra,validate-git-inherits-git-dir
  V4 rc=1  FAIL: argv not found byte-exact: git(vaultDir, ['status', '--porcelain', '-uall'])
=== STATE violating (b) — suite re-pointed; a FIFTH git() call site added, the four intact ===
  V3 rc=1  FAIL: suite is tests/unit/dream-pipeline.test.js
  V4 rc=1  FAIL: expected 4 call sites of git(), found 5
```

Each violating state moves **two independent things**, one per step, so neither
attributes the other: (a) adds a declaration under this WP's own `wp` (V3) and
widens one argv (V4); (b) re-points the declaration's `suite` (V3) and adds a
fifth call site with all four declared argv still byte-exact (V4). The last one
is the case the count exists for — enumerating the argv we intend to accept
catches a CHANGED shape, and only the count catches an ADDED one.

**V4 is GREEN on the untouched tree, and that is deliberate rather than a
defect.** It is an INVARIANCE check standing in for `WP-dream-promote-in-workspace`
Table W row W1(c)(i)'s standing trigger; completion is V1's and V2's. It is
stated that way in the spec's AC5 so no reader mistakes its green for evidence
that the work was done. Its `test -f` guard is what keeps the deliverable-absent
case red — a bare grep set would be greenest exactly where the file is gone.

**V5 (`npm run lint`)** — green; the tail is in 0.6.

### 0.5 Internal coherence pass

Counts re-derived from the spec's own text by `coherence.js`, not read, and every
`file:line` citation extracted FROM the spec and resolved (rc 0):

```text
spec line count                                 = 425
Table J rows                                    = 6  J0,J1,J2,J3,J4,J5
J-ids mentioned but absent from Table J         = none
J-ids contiguous J0..J5                         = ok
acceptance criteria                             = 6  AC1,AC2,AC3,AC4,AC5,AC6
verification steps (commented V-headers)        = 5  V1,V2,V3,V4,V5
owner items                                     = 2  O4,O5
deliverable rows                                = 3
   modify src/core/dream/validate.js  exists=true
   modify tests/unit/dream-validate.test.js  exists=true
   create tests/red-proofs/dream-git-env-validate-seam.proofs.json  exists=false
files touched (deliverables + the spec itself)  = 4  (README heuristic: <= 8)
RED ids named in the Exact-contracts table      = validate-git-inherits-git-dir
RED ids in V3's `want` array                    = validate-git-inherits-git-dir
V4's argv literals                              = 4
   resolves git(vaultDir, ['rev-parse', '--git-dir'], { allowFail: true })
   resolves git(vaultDir, ['status', '--porcelain', '-uall'])
   resolves git(vaultDir, ['reset', '--hard', 'HEAD'])
   resolves git(vaultDir, ['clean', '-fd'])
actual `git(vaultDir, [` occurrences            = 4  (matches V4 and Table J rows J1-J4)
file:line citations in the spec                 = 8
template sections absent                        = none

COHERENCE: no failures
```

(The eight citations' both-ends dumps are 0.3's; `coherence.js` resolves them a
second time out of the spec's own text, so a citation the spec carries but 0.3's
hand-written list forgot cannot hide.)

Findings, all fixed in this pass:

| # | Band | Finding | Fix |
|---|------|---------|-----|
| Y1 | B | **The stub's and the predecessor O2's parenthetical "(one declaration file per suite)" is FALSE.** Measured: `ledger-parser-corpus.proofs.json` and `quarantine-preserve-durability.proofs.json` both already declare `"suite": "tests/unit/dream-validate.test.js"`, and `scripts/red-proofs.js` imposes no such rule — declaration files are per WORK PACKAGE | **Withdrawn in the spec's Current state**, with the two file names as the evidence. The predecessor's O2 keeps the wording as the dated record it is (it is not a Deliverable here); the spec does not repeat it |
| Y2 | B | **Table V's row ids collided with the verification steps' ids** — the table's `V4` and the step `V4` are different objects, and the spec cited both in the same paragraphs. Every other spec in this family avoids this by construction (Table U rows `U…` beside steps `V…`) and this one had reintroduced it | **Table renamed to Table J, rows J0–J5.** Checked: `Table J` appears in exactly one other document (`docs/specs/done/WP-secret-fence-two-tier-detector.md`), so nothing an implementer reads carries a conflicting Table J |
| Y3 | C | Two cited ranges were wrong at one end: `src/cli/adopt.js:79-82` ended before the closing brace, `src/core/vault.js:118-119` ended inside the `if` block | **FIX** — `:79-83` and `:118`, both re-checked at both ends in 0.3 |
| Y4 | B | **The first draft asserted the guard's before-state from `WP-dream-git-env-pinning`'s M4**, which measured a bare `git -C <dir> rev-parse --git-dir` and not `assertGitRepo`. A raw-git measurement does not establish what the product's function returns — the pin store, `spawnPinnedSync`'s own env handling and `allowFail` all sit between them | **FIX** — VS-P1 re-measures through the imported `assertGitRepo` with a scratch pin store. The two agree, which is why this is band B and not A; the point is that agreement was measured rather than assumed |
| Y5 | A | **`prove-v3-v4.sh`'s first form piped each command through `head` inside the subshell**, so the rc read back was `head`'s and **all four states reported `rc=0`** — including the deliverable-absent one, the state the proof exists to redden. The same shape as the predecessor's Z5, reproduced independently one day later | **FIX** — output goes to a file, the rc is captured as its own statement, the file is printed afterwards. Caught by the result looking wrong (a deleted file reporting success), not by review |
| Y6 | C | An early draft's V4 was a grep for a FORBIDDEN shape (a `GIT_DIR`-inheriting line), which cannot be closed over git's grammar and would go green on any spelling nobody listed | **FIX** — V4 enumerates **our own good**: the four argv we intend to accept, plus the call-site count that catches an added one |

Bidirectional checks, all clean: Table J has 6 rows, ids `J0`–`J5` contiguous and
in order; no `J`-id is mentioned anywhere the table does not define; the one RED
id named in Exact contracts equals the one in V3's `want` array, in both
directions; the six acceptance criteria and five verification steps are numbered
contiguously; every Deliverables row's action matches the file's actual presence
(`create` → absent, `modify` → present); the four argv literals V4 greps all
resolve in `validate.js` and their count matches Table J's rows J1–J4; and every
template section is present.

### 0.6 Size

The spec is **424 lines** by `wc -l` — 0.5's `coherence.js` reports 425 because
it counts `split('\n')`'s array, whose last element is the empty string after the
trailing newline. Same file; the convention is stated so a reader does not read
the two numbers as a disagreement.

**It is above `docs/specs/README.md`'s ~400-line heuristic by about 5%, and that
is a recorded residual rather than a trim target.** Three things carry the
overage and none is removable without losing a decision: the two owner items with
their enumerated overrule costs (~55 lines), the W1(c)(i) non-firing argument the
predecessor's standing trigger requires be *stated with its reasoning* (~18
lines), and one canonical table with its two disambiguating paragraphs. It
**touches 4 files (3 Deliverables + the spec itself)**, half the README's `≤ 8`
bound, and the implementation is one changed line plus one JSDoc, assertions in
an existing suite, and one new declaration file: an **S**. For contrast, the
predecessor closed at 932 lines against 8 files.

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

### 0.7 Discovered, outside this WP's boundary

Recorded here rather than fixed, per CLAUDE.md's "Discovered issues" rule.

- **ADR-0012's 2026-09-05 amendment cites `docs/specs/WP-dream-git-env-pinning.md`**
  for Table U, but that spec now lives at
  `docs/specs/done/WP-dream-git-env-pinning.md` — the path moved when the WP was
  filed as `Done`. The citation names the canonical surface for the whole channel
  set, so it is worth a one-line correction by whoever next touches that ADR.
  This WP does not touch ADR-0012 (Out of scope) and ADR-0012 is deliberately NOT
  added to its boundary. **Routing:** the next touch of ADR-0012; the
  orchestrator notes it in the done-flip.
- **`tests/unit/dream-validate.test.js:15` imports `restoreVaultToHead` and
  nothing calls it** (VS-P8, round 1). Its tests were retired with the EP2
  enforcement half at `WP-dream-promote-in-workspace` row G7 and the import
  stayed. That file IS a Deliverable here, but removing the import is neither of
  the two code lines V4 admits nor anything round 1 asked for, so it is recorded
  rather than folded in. **Routing:** the next work package that edits that
  suite for its own reasons.

## Executor pass — template conformance

Run in a clean context by the orchestrator against `docs/specs/_TEMPLATE.md`
(`docs/runbooks/codex-review.md`, "Template conformance"). **Verdict:
NON-CONFORMANT on four items; three DROPPED by the orchestrator on the
predecessor's accepted precedent, one FIXED.** Confirmed present: the Security
checklist with the template's anchored-pattern item `N/A`-marked, AC6's
idempotence `N/A`, and all five Definition-of-done items.

| # | Item | Disposition |
|---|------|-------------|
| T1 | `### Contract table(s)` is renamed `### Table J — validate.js's git call sites, and the guard's precondition` | **DROP.** The template's own comment invites the instantiation (`<!-- One canonical table per dense contract -->`), and the predecessor's `### Table U — …` carried four external rounds under the same shape |
| T2 | `## Dispatch precondition — owner items` has no template counterpart | **DROP.** The same section appears in `WP-dream-git-env-pinning` and in `WP-process-runbook-sweeps`; it is where the standing process of 2026-09-05 lives, and the template predates that process |
| T3 | The Mirrored Surface Checklist merged the template's "Acceptance criteria" and "Current state" categories into ONE bullet, leaving four list items where the template names five | **FIX (band C).** Split into two bullets; the "Outside this spec" entry stays as the sixth. The merge was a size trim in round zero's final pass and it cost a category its own line — exactly the surface a review finding is supposed to land on individually |
| T4 | The `> **Provenance.**` blockquote sits in the slot the template gives the `Authoring rules live in docs/runbooks/spec-authoring.md…` bullet, which is absent | **DROP.** The bullet is an instruction to the author, not a section of the artifact — the worked example `docs/specs/done/WP-daily-summary-per-line-framing.md` omits it, as did `WP-dream-git-env-pinning` (which carried its own Provenance subsection in the same place) |

## Executor pass — internal coherence

Run in a clean context, and it **RAN** the verification steps rather than reading
them. **No band A, no band B. Two band-C findings, both citation precision**;
every other citation resolved at both ends.

**What it re-derived independently and confirmed.** Table J's Caller column:
`assertGitRepo` is the only one of the three with a caller in `src/`, and
`assertCleanTree` / `restoreVaultToHead` have zero. VS-P4's pasted output
supports the claim it is cited for — adopt accepts the nested directory. The
red-proof loader imposes no per-suite uniqueness, corroborating the Y1
withdrawal. **Discrimination assessment: every acceptance criterion
discriminates, and none rests on a repo-wide count** — AC4 is identified by this
WP's own `wp` field and the one fixed id.

**The executor's own run, on a plain `git archive` copy of the base:**

```text
V1  npm test                                    rc 0   tests 2690 / pass 2678 / fail 0 / skipped 12
V2  node scripts/red-proofs.js                  rc 0   63 declared, 63 selected, RUN: PROVEN
V2  node scripts/red-proofs.js --wp <this WP>   rc 1   VACUOUS — the selection matched no proof (expected: the declaration file does not exist yet)
V3  the declaration identity check              --     file absent (the deliverable-absent red)
V4  the argv-invariance guard                   rc 0   V4 OK — on the UNTOUCHED tree, as AC5 states
V5  npm run lint                                rc 0
V5  node scripts/boundary-check.js …            rc 0   names nothing
```

| # | Band | Finding | Disposition and what changed |
|---|------|---------|------------------------------|
| X1 | C | The spec cited "**W1(e)** measured it". **No `W1(e)` label exists** in `docs/specs/done/WP-dream-promote-in-workspace.md`: the fact sits under a bare `**(e)**` sub-bullet inside row W1's cell, and that file's own convention only ever produces `W1(a)`…`W1(d2)` (verified: `grep -o "W1(\([a-z][0-9]*\))"` yields exactly those six). A reader following the citation finds nothing | **FIX (LIGHT).** Cited as **"row W1's `(e)` sub-bullet"** with the measured sentence quoted, so the citation resolves by text rather than by a label that was never minted |
| X2 | C | `src/core/exec-identity.js:554-556` is cited for TWO facts — the `env` resolves the pin AND is the child's environment — but the range covers only the first; the second is at `:558` (`passthroughSpawnOpts(opts, SAFE_SYNC_OPTS, env)`). Evidence that reaches only half the claim | **FIX (LIGHT).** `:554-558`, with the two facts pinned to `:556` and `:558` individually in the Current-state bullet. `check-ranges.js` was updated and **re-run**, so 0.3's pasted output is real rather than edited |

**Round-zero outcome under §0.1's round rule: LIGHT.** All three fixes (T3, X1,
X2) are machinery, category-splitting and citation precision — branch 6 — so no
fresh external round is owed by them and **round 1 runs on the revised tip**. No
owner item was raised by either executor, and neither recommendation (O4, O5) was
argued against.

## Round 1 — external, double channel, tip `e96f761d`

| Channel | Raw | Introducing SHA | Verdict |
|---------|-----|-----------------|---------|
| Codex plugin | `docs/specs/logbook/2026-09-06-validate-seam-gate-raw-round1-codex-plugin.txt` | `ad1fa653` | needs-attention |
| Hermetic Codex shadow | `docs/specs/logbook/2026-09-06-validate-seam-gate-raw-round1-herdr-shadow.txt` | `e9e21e9a` | needs-attention |

Both raws were committed **pre-adjudication**; `git status --porcelain` was
identical before and after each run. **No band A. Neither channel challenged O4
or O5** — the shadow says so in as many words about O4, and both left the
nested-vault recommendation alone.

**Round outcome under §0.1's round rule: HEAVY** (branch 4). R1-A changes the
Deliverables permission boundary and adds an out-of-spec canonical mirror, so a
full fresh external round is owed: **round 2 runs on the revised tip.**

### Findings, bands, criterion branch, disposition

| # | Source | Band | Branch | Finding | What changed |
|---|--------|------|--------|---------|--------------|
| R1-A | shadow F1 | B | 4 (operative content) → **HEAVY** | The spec narrowed row W1(c)(i)'s *"any change to what `validate.js` spawns"* to argv and call-site count **on its own authority**. The environment handed to `spawnPinnedSync` IS part of what is spawned; the row's tenth-shape discussion describes the required RESPONSE but does not redefine "any change". The implementation could pass every gate while the default-deny contract stayed undisposed | **FIX — the trigger is DISPOSED OF as an act, not re-read.** `docs/specs/done/WP-dream-promote-in-workspace.md` joins Deliverables for **one dated amendment inside row W1(c)(i) and nowhere else** (precedent: the predecessor's 2026-09-05 amendment inside row W1, byte-intact surroundings). Its opening sentence is fixed byte-exact under Exact contracts, registered in the Mirrored Surface Checklist, grepped by the new **V5** and asserted by the new **AC6**. Its load-bearing content is a RE-MEASUREMENT rather than an argument: **VS-P7** below. Owner item **O6** carries the alternative — that the owner rules the trigger fires — with the largest overrule cost in this queue |
| R1-B | shadow F2 **+** plugin F1, **CONVERGED** | B | 6 (machinery) → LIGHT, folded into the HEAVY pass | **V4's literal count was a false green.** Both channels executed a fifth spawn and V4 passed: the shadow's was multi-line, the plugin's spelled `git (vaultDir, …`. Neither is matched by `grep -c "git(vaultDir, ["`. The check also ignored `git()`'s own `args: ['-C', vaultDir, ...args]` assembly and a direct `spawnPinnedSync` call | **RE-CUT as a DIFF, the smallest form that guards the behaviour.** V4 compares `git diff $(git merge-base origin/main HEAD) -- src/core/dream/validate.js`: the ADDED non-comment lines must be exactly the two prescribed under Exact contracts, the REMOVED exactly `env: process.env,`. The four-argv grep survives as **V4a**, labelled a **presence screen** in the step, in AC5 and in the mirror list. **Proved in five states below.** AC5 is rewritten and is now RED on the untouched tree (a completion check as well as an invariance one). Second half: **AC2 now captures the COMPLETE spawned argv** through `stubCollaborators` / `stubSpawn`, which the plugin confirmed by execution intercepts this spawn |
| R1-C | plugin F2 | C | 6 → LIGHT | The trigger rationale claimed the constructed environment "can only narrow what they may reach". The plugin **falsified it by measurement**: from this checkout's `src`, `rev-parse --git-dir` returns 128 with `GIT_CEILING_DIRECTORIES` set and **0, resolving the ancestor, under `buildGitEnv()`** — dropping an inherited ceiling WIDENS discovery | **FIX.** The monotonicity sentence is **withdrawn in the spec, by name**. Argv invariance (V4) and environment effects are now argued separately, and the safety argument rests on VS-P7's re-measurement alone |
| R1-D | shadow F3 | C | 5 (mirror drift) → LIGHT | The Current-state `buildGitEnv` bullet enumerated `PATH`, `HOME`, the nine win32 keys, `USERPROFILE` and the `GIT_INDEX_FILE` rule — a partial restatement of the channel set whose canonical Table U the spec says must be cited and never restated, and an **unregistered** Table U mirror | **FIX.** The bullet now cites Table U rows **U1, U2, U4/U4b, U5** and keeps only this WP's local fact: `buildGitEnv()` is called with **no argument**, so by row U5 the call carries no `GIT_INDEX_FILE`. The measured `{HOME, PATH}` map is kept as an OBSERVATION of this host, labelled as one |
| R1-E | shadow F4 | C | 6 → LIGHT | *"The dream run makes git calls from two places"* is false: `src/core/dream/promote.js`'s `spawnGitForMerge` is a third, and canonical Table W row W1(c)(ii) names it a dream-path spawn outside the pipeline seam | **FIX.** The Context now says **three**, names all three modules, and marks promote's already-constructed merge spawn out of scope **with the W1(c)(ii) citation**; the Out-of-scope bullet carries the same citation and the reason the two constructions are not unified |
| R1-F | shadow F5 | C | 6 → LIGHT | Table J row J2's *"exported for tests only, by the owner ruling of 2026-08-30"* is false on the tree: no test calls or imports `assertCleanTree` | **FIX, and wider than the finding after measurement.** **VS-P8** below separates MENTIONS from CALLS and finds neither function has a caller anywhere: `assertCleanTree` appears only in one comment, and `restoreVaultToHead` is **imported by `tests/unit/dream-validate.test.js:15` and never called** — its tests were retired at row G7. Rows J2/J3/J4 now state the measured fact narrowly. Because `validate.js` is already a Deliverable, the **stale export-block sentence is authorized for correction in the same commit** (one clause in its Deliverables row) rather than routed |
| R1-G | shadow F6 | C | 5 → LIGHT | The owner-rulings append **says** O4/O5 live in one place and are cited, then restates J0's construction rule and J5's nested-vault verdict, in an entry the Mirrored Surface Checklist did not register | **FIX, by the append-only route R2-E used for the predecessor.** A dated amendment paragraph in that record **withdraws** the restating sentences in favour of the citation, and the spec's Mirrored Surface Checklist now **registers the record as an external Table J mirror** with the dated-amendment procedure named |

### The two new probes

Both run FROM A FILE, rc captured as its own statement, in `mktemp -d` scratch.

#### VS-P7 — the election's admissibility, RE-MEASURED under the constructed environment (`vs-p7-stale-stat.js`, rc 0)

Row W1(c)(i)'s election is admissible *"only on that measurement"* —
`rev-parse` index-safe from a **stale-stat** state, which is the state that makes
an index-refreshing command rewrite `.git/index`. Carrying that measurement
forward across an environment change would be exactly the "a precedent's
existence is not its adoption" move `spec-authoring.md` warns about, so it is
taken again. A repository is built, committed, and a tracked file's mtime moved
without changing its content; `.git/index` is hashed before and after.

```text
== VS-P7 — the assertGitRepo argv under buildGitEnv(), from a stale-stat index ==
  SUBJECT — the election's measured argv
    argv=[-C <vault> rev-parse --git-dir]  env keys=[HOME,PATH]  status=0
    .git/index sha256[0:16]  before=a79d674436cd764d  after=a79d674436cd764d  UNCHANGED
== positive control — a command W1(e) measured to REFRESH, same env, same state ==
  CONTROL — status --porcelain
    argv=[-C <vault> status --porcelain]  env keys=[HOME,PATH]  status=0
    .git/index sha256[0:16]  before=a79d674436cd764d  after=3706ab40cb2a63e8  CHANGED

RESULT: subject index-safe = true ; control discriminates (moved the index) = true
```

**The positive control is not decoration.** Without it a green subject would
establish only that the probe cannot see an index write; with it, the same
environment and the same stale-stat state are shown to move the hash for a
command row W1's `(e)` sub-bullet measured as refreshing. This is the
measurement the Table W amendment cites.

#### VS-P8 — who actually calls `assertCleanTree` and `restoreVaultToHead` (`vs-p8-test-callers.sh`, rc 0)

MENTIONS and CALLS separated, because a comment naming a function is not a
caller — which is precisely how the false rationale survived.

```text
-- assertCleanTree: every MENTION outside validate.js --
tests/integration/dream.test.js:738:// unknown-command guard's `assertCleanTree` probe must RETHROW rather than read
   grep rc=0  (rc 1 = no hit at all)
-- assertCleanTree: every CALL outside validate.js --
   grep rc=1  (rc 1 = no call anywhere)
-- restoreVaultToHead: every MENTION outside validate.js --
tests/unit/dream-pipeline.test.js:886:  // The retired `restoreVaultToHead` here was a `reset --hard` + `clean -fd`.
tests/unit/dream-validate.test.js:15:  restoreVaultToHead,
tests/unit/dream-validate.test.js:493:// ── restoreVaultToHead ─────────────────────────────────────────────────────
tests/unit/dream-validate.test.js:501:// restoreVaultToHead clean mechanics and its ignored-file exception. Promotion never
   grep rc=0  (rc 1 = no hit at all)
-- restoreVaultToHead: every CALL outside validate.js --
   grep rc=1  (rc 1 = no call anywhere)
```

**`tests/unit/dream-validate.test.js:15` is an import with no call** — the
`restoreVaultToHead` tests were retired at row G7 and the import stayed. Noted as
a discovered issue in 0.7; **not** fixed, because removing it is not one of the
two lines V4 admits and is not what R1-F asked for.

### Both-directions proof of the RE-CUT V4 — five states (`prove-v4-diff.sh`)

Each state is a fresh `git clone --no-hardlinks` of the repository checked out at
the design tip (where `validate.js` equals the merge-base), then edited. The
compliant edit is exactly the two prescribed lines; the three evasions are the
ones the two round-1 channels executed or named.

```text
=== STATE 1 — untouched tree (the two prescribed lines are ABSENT) ===
  V4 rc=1
    BASE    8358655d
    ADDED   []
    REMOVED []
    FAIL: an unprescribed code line was added or removed
=== STATE 2 — compliant: the require line, env: buildGitEnv(), and nothing else ===
  V4 rc=0
    BASE    8358655d
    ADDED   ["const { buildGitEnv } = require('./git-env');","env: buildGitEnv(),"]
    REMOVED ["env: process.env,"]
    V4 OK — the only code lines this WP adds or removes are the two prescribed and the one replaced
=== STATE 3 — evasion (i): a FIFTH call, multi-line AND spelled `git (vaultDir` ===
  V4 rc=1
    BASE    8358655d
    ADDED   [");","['status', '--porcelain']","const { buildGitEnv } = require('./git-env');","env: buildGitEnv(),","git (","vaultDir,"]
    REMOVED ["env: process.env,"]
    FAIL: an unprescribed code line was added or removed
=== STATE 4 — evasion (ii): a DIRECT spawnPinnedSync call, bypassing git() ===
  V4 rc=1
    BASE    8358655d
    ADDED   ["const { buildGitEnv } = require('./git-env');","env: buildGitEnv(),","spawnPinnedSync('git', getPaths(), { args: ['-C', vaultDir, 'status', '--porcelain'], env: buildGitEnv() });"]
    REMOVED ["env: process.env,"]
    FAIL: an unprescribed code line was added or removed
=== STATE 5 — evasion (iii): git()'s own `-C` prefix assembly changed ===
  V4 rc=1
    BASE    8358655d
    ADDED   ["args: ['-C', vaultDir, '--no-optional-locks', ...args],","const { buildGitEnv } = require('./git-env');","env: buildGitEnv(),"]
    REMOVED ["args: ['-C', vaultDir, ...args],","env: process.env,"]
    FAIL: an unprescribed code line was added or removed
```

**State 3 is the exact mutation both channels used against the old form, and it
is red here.** State 1 is red where the old form was green, which is the
criterion changing character: the diff check is a completion check too. State 5
is why the check reads the whole file's diff rather than the four call lines —
a changed `-C` assembly moves what is spawned without touching any of them.

**What V4 still cannot see, named rather than implied:** a change to
`src/core/exec-identity.js` or `src/core/paths.js` would move what this spawn
does without appearing in `validate.js`'s diff at all. Neither is in
Deliverables, so `scripts/boundary-check.js` (V6) is what refuses it — the two
guards are complementary and neither is claimed to be total. **AC2's runtime
argv capture is the third leg**, and it is the only one that observes what
`git()` actually hands `spawnPinnedSync`.

### Both-directions proof of the NEW V5 — four states (`prove-v5.sh`)

```text
=== STATE absent — the untouched base, the amendment not written ===
  V5 rc=1  FAIL: the row W1(c)(i) amendment is missing
=== STATE file-absent — the target file deleted ===
  V5 rc=1  FAIL: the row W1(c)(i) amendment is missing
=== STATE compliant — the byte-exact opening sentence present ===
  V5 rc=0  V5 OK
=== STATE violating — amendment present, hook residual reworded ===
  V5 rc=1  FAIL: row W1's hook residual was not left intact
```

The `test -f && grep -qF` guard is what makes the file-absent state red rather
than green. The violating state moves only the hook-residual sentence, so the
third guard is shown to fire on its own — the amendment being present does not
license rewriting the row around it.

### Revision — the tree after R1-A … R1-G

`coherence.js`, rc 0:

```text
spec line count                                 = 602
Table J rows                                    = 6  J0,J1,J2,J3,J4,J5
J-ids mentioned but absent from Table J         = none
J-ids contiguous J0..J5                         = ok
acceptance criteria                             = 7  AC1,AC2,AC3,AC4,AC5,AC6,AC7
verification steps (commented V-headers)        = 6  V1,V2,V3,V4,V5,V6
owner items                                     = 3  O4,O5,O6
deliverable rows                                = 4
   modify src/core/dream/validate.js  exists=true
   modify tests/unit/dream-validate.test.js  exists=true
   create tests/red-proofs/dream-git-env-validate-seam.proofs.json  exists=false
   modify docs/specs/done/WP-dream-promote-in-workspace.md  exists=true
files touched (deliverables + the spec itself)  = 5  (README heuristic: <= 8)
RED ids named in the Exact-contracts table      = validate-git-inherits-git-dir
RED ids in V3's `want` array                    = validate-git-inherits-git-dir
V4's argv literals                              = 4
actual `git(vaultDir, [` occurrences            = 4  (matches V4a and Table J rows J1-J4)
file:line citations in the spec                 = 10
amendment sentence occurrences in the spec      = 2  (Exact contracts + V5, byte-identical)
template sections absent                        = none

COHERENCE: no failures
```

`check-ranges.js`, rc 0 over 16 ranges — the three added this round
(`tests/unit/dream-validate.test.js:1485-1502` `stubCollaborators`,
`:1506-1513` `stubSpawn`, `:15` the unused import) resolve at both ends.

**Size, and it moved.** The spec is **601 lines** by `wc -l` (602 by
`coherence.js`'s array convention), up from 424 — a **~50% overage** on
`docs/specs/README.md`'s ~400-line heuristic, and it is recorded rather than
trimmed. Every added line is a round-1 requirement: the third owner item with the
largest overrule cost in the queue (O6), the amendment's four required
statements, the re-cut V4 with its rationale, AC2's second half and AC6, and the
three findings that replaced a false claim with a measured one. Trimming now
would reopen surface the round just froze
(`docs/runbooks/codex-review.md`, "The loop converges by freezing surface").
**It touches 5 files (4 Deliverables + the spec itself)**, still inside the
README's `≤ 8` bound, and the code change is still **two lines and two comments**:
an **S**.

## Round 2 — external, double channel, tip `382faefb`

| Channel | Raw | Introducing SHA | Verdict |
|---------|-----|-----------------|---------|
| Codex plugin | `docs/specs/logbook/2026-09-06-validate-seam-gate-raw-round2-codex-plugin.txt` | `ba41781f` | needs-attention |
| Hermetic Codex shadow | `docs/specs/logbook/2026-09-06-validate-seam-gate-raw-round2-herdr-shadow.txt` | `6e0e29d2` | needs-attention |

Both raws committed **pre-adjudication**; porcelain identical before and after.

**What round 2 CONFIRMED, and it is why the loop closes.** Both channels report
R1-A, R1-C, R1-D, R1-E and R1-F **fixed**. Both checked VS-P7's pasted setup
against row W1's original stale-stat description and found it matches
(mtime moved, tracked content unchanged); neither could re-execute it, their
sandboxes being read-only. Both executed AC2's capture against the **real**
`stubCollaborators` helper and confirmed the complete argv and the
`buildGitEnv` equality are observable, and both state that this is **JavaScript
require-cache substitution, not an environment-variable seam** — so ADR-0028 is
untouched. The plugin adds that under the adopted O6 the specified amendment
"does not otherwise contradict W1(a), COVERAGE, (c)(ii), (e), or the
predecessor's dated amendment". **Neither channel raised a product or contract
finding, and neither objected to O4, O5 or O6.**

**Round outcome: CLOSE.** `docs/runbooks/codex-review.md`, weighted closure:
*"The loop is DONE when a round finds nothing about the product. Machinery
findings at that point are fixed or accepted as named residuals; they do not
extend the loop."* Every round-2 finding is criterion/machinery or record. **No
further external round is owed.** A clean-context mechanical verification follows
on the revised tip, then the PR.

### Findings, bands, criterion branch, disposition

| # | Source | Band | Branch | Finding | What changed |
|---|--------|------|--------|---------|--------------|
| R2-A | plugin F1 **+** shadow F1, **CONVERGED** | B | **3 — the same-family repeat rule (ADR-0031), fired** | The SECOND consecutive round on V4's evadability. Round 1 broke a literal count with a multi-line call; round 2 broke the comment filter with `/* explanatory comment */ git(vaultDir, ['status', '--porcelain']);` — both channels EXECUTED it, V4 returned rc 0 and the hidden call ran. A multi-line `// x */ git(); /*` passes too. A line-prefix comment filter over a JS diff cannot be lexically sound, and an AST tool is a dependency this repo does not carry | **RE-CUT BY KIND, never a third textual patch** — see below |
| R2-B | shadow F2 | B | 6 (machinery) → LIGHT | V4 diffed from `merge-base(origin/main, HEAD)` while Table J, VS-P7 and the W1 amendment were measured on `8358655d`. Today they coincide; after a routine rebase an upstream `validate.js` change folds into the new base and **disappears** from V4, while V4a still finds the four calls and AC2 still observes only `assertGitRepo`. That is precisely when W1(c)(i)'s trigger should force re-review | **FIX.** The pinned base SHA is stated **once**, in Current state, and V4 now REFUSES any other: `git merge-base origin/main HEAD` must equal it, else red with *"base moved — re-derive Table J and re-run VS-P7 against the new base, then update the pinned SHA"*. Proved as state 5 below. **SUPERSEDED IN PART by dispatch-time finding D1**: the intent stands, the predicate does not — the guard is now a CONTENT comparison |
| R2-C | plugin + shadow F3 | C | 5 (mirror drift) → LIGHT | The new O6 entry in the owner-rulings record restates the trigger subject, the no-shape claim, the constructed-environment rule, the stale-stat result and the full overrule cost — then closes by claiming citation-only treatment. Two substantive copies to keep aligned in an append-only record; the same defect the previous amendment had just fixed for O4/O5 | **FIX, by the same append-only route.** A dated correction withdraws every deciding sentence of the O6 entry **including its false closing sentence**, leaving adoption status plus a citation of the spec's O6 |
| R2-D | plugin, next-steps note | — | 6 → LIGHT | The RED mutation would make V4 red; a reader could take that for a conflict with V2 | **FIX.** V4's comment now states that `scripts/red-proofs.js` mutates fresh isolated COPIES while V4 runs on the unmutated working checkout, so the two never meet |

### R2-A — the re-cut, and why it is SMALLER

§0.1 branch 3 names **Table J** as this WP's family and V4 is a registered mirror
of rows J1–J4, so a second consecutive round landing there is a design question,
not a third patch. §0.1's FALLBACK anticipated the same direction from the other
end — *"verification machinery may grow only to guard a product behavior, in the
smallest form that guards it"* — and both point the same way here. What changed:

1. **V4 stopped claiming what it cannot check.** It is now a **COMPLETION /
   PRESENCE screen**: against the pinned base, the diff must CONTAIN the two
   prescribed added lines and the one removed line. **No comment filtering at
   all**, so there is no false claim about what it excludes — and the step, AC5
   and the Mirrored Surface Checklist all say **"blind to additions: it proves
   the prescribed change landed, nothing about what else did."**
2. **The invariant moved to where it is observable — AC2.** Through the same
   `stubCollaborators`/`stubSpawn` capture both channels executed, AC2 now
   asserts that `assertGitRepo` performs **exactly ONE spawn** (count `=== 1`),
   with the complete argv `['-C', <vault>, 'rev-parse', '--git-dir']` and `env`
   deep-equal to `buildGitEnv()`. A hidden call inside the guard — however
   spelled, wrapped, or preceded by a block comment — is a second spawn and
   reddens it. **This is the round-2 evasion's own case, caught at the seam
   instead of in the text.**
3. **The rest is the REVIEWER's, named rather than implied.** Rows J2–J4 have no
   dream-path caller (Table J), so a hidden addition there is inert on the run;
   AC5 names **wd-reviewer's whole-diff read of `src/core/dream/validate.js`** as
   the check for it. V4a survives unchanged as the four-argv presence screen it
   already was.

**It is smaller than what it replaced**: no new gate, no new machinery, one
assertion moved from a text check that could not carry it to a runtime check that
can, and one check honestly downgraded to what it does. The measurement that
carries the safety claim is still VS-P7, untouched.

### Both-directions proof of the RE-CUT V4 — five states (`prove-v4-r2.sh`)

The script under test is **extracted from the spec**, not retyped, so the proof
runs the step's own bytes. Each state is a fresh `git clone --no-hardlinks`
checked out at the design tip.

```text
=== STATE 1 — untouched tree: the prescribed change has NOT landed ===
  V4 rc=1  FAIL: the require('./git-env') line was not added
=== STATE 2 — compliant: the two added lines and the one removed ===
  V4 rc=0  V4 OK — the prescribed change landed (blind to additions; AC2 and the reviewer's read carry that)
=== STATE 3 — partial: the require line added, env: still process.env ===
  V4 rc=1  FAIL: env: buildGitEnv(), was not added
=== STATE 4 — compliant PLUS the two authorized comment edits (must stay green) ===
  V4 rc=0  V4 OK — the prescribed change landed (blind to additions; AC2 and the reviewer's read carry that)
=== STATE 5 — base moved: the merge-base is not the pinned SHA ===
  V4 rc=1  FAIL: base moved (e269f5cd07267a976c87f2df1759ca791c696478) — re-derive Table J and re-run VS-P7 against the new base, then update the pinned SHA
```

**State 4 is the one that had to stay green**: the two comment edits the
Deliverables row authorizes (the JSDoc precondition and the stale export-block
sentence) must not redden a check on code lines — both channels asked for that
control and both got it. **State 3** is a half-done implementation, red.
**State 5** is R2-B, red with the re-derivation instruction in the message.

**One defect this proof caught in the step itself, recorded rather than quietly
fixed.** The first form of V4's removed-line check was
`grep -qxF "-    env: process.env,"`; `grep` read the leading `-` as an option
and the **compliant state reported RED**. The step now uses `grep -qxF -e`, and
the reason is a comment in the step. It was caught by state 2 failing — the
proof's whole purpose — not by review.

**The AC2 count clause is an implementer test obligation, not new gate
machinery**, and that is deliberate: the assertion lives in
`tests/unit/dream-validate.test.js`, which is already a Deliverable and already
carries the helper. Its both-directions evidence is the ordinary one for a unit
assertion — the RED declaration proves AC1's non-vacuity, and AC2's count clause
is a positive assertion whose failure mode (a second spawn) the implementer
demonstrates in the PR by construction if wd-reviewer asks. No new declaration,
no new runner, no new step.

## Closure

**The decision, and the rule it rests on.** `docs/runbooks/codex-review.md`,
weighted closure: *"The loop is DONE when a round finds nothing about the
product. Machinery findings at that point are fixed or accepted as named
residuals; they do not extend the loop."* **Round 2 is that round.** Both
channels returned needs-attention, and every one of their findings is a
verification-machinery shape, a base anchor, or a record duplication — none
changes what the implementer builds, and all are fixed in place. Both channels
also positively confirmed the round-1 fixes, VS-P7's condition, and AC2's seam,
and neither objected to any owner item. **No further external round is owed.**

### The rounds

| Round | Tip | Raws (introducing SHA) | Verdicts | Outcome (§0.1 round rule) |
|-------|-----|------------------------|----------|---------------------------|
| 0 | `8358655d` (base) | architect's own; executor passes `T1`–`T4`, `X1`–`X2` | — | criterion pinned; 6 findings fixed (Y1–Y6), then 3 more (T3, X1, X2) |
| 1 | `e96f761d` | plugin `ad1fa653`, shadow `e9e21e9a` | needs-attention / needs-attention | **HEAVY** (branch 4 on R1-A) |
| 2 | `382faefb` | plugin `ba41781f`, shadow `6e0e29d2` | needs-attention / needs-attention | **CLOSE** (branch 3 fired on R2-A; no product finding) |

**No verification machinery was added after round 1** — still V1–V6 with V4a, and
still one RED declaration. Round 2's re-cut made the surface smaller, not larger.

### Named residuals carried OUT of the loop

Each is stated here so the next reader finds them together.

1. **V4 is BLIND TO ADDITIONS, by design.** It proves the prescribed change
   landed and nothing about what else the diff contains. Two rounds established
   that no line-oriented check over a JS diff can carry that claim without an AST
   dependency this repo does not have. What carries it instead: **AC2's
   one-spawn assertion** at the seam, and **wd-reviewer's whole-diff read of
   `src/core/dream/validate.js`**, named in AC5. Rows J2–J4 have no dream-path
   caller, so an addition there is inert on the run.
2. **Size.** The spec is **656 lines** against `docs/specs/README.md`'s ~400-line
   heuristic — a ~64% overage (635 at closure; the dispatch-time D1 fix added 21),
   recorded rather than trimmed, because trimming now
   would reopen surface two rounds have frozen. It touches **5 files** (4
   Deliverables + the spec), inside the `≤ 8` bound, and the code change is **two
   lines plus two comment edits**: an **S**.
3. **`tests/unit/dream-validate.test.js:15` imports `restoreVaultToHead` and
   nothing calls it** (VS-P8) — the tests were retired at row G7 and the import
   stayed. Discovered, not fixed: it is neither of the two lines V4 requires.
   Routed to the next work package that edits that suite.
4. **ADR-0012's 2026-09-05 amendment cites `docs/specs/WP-dream-git-env-pinning.md`**,
   which is now under `docs/specs/done/`. Routed to the next touch of ADR-0012;
   ADR-0012 is deliberately not in this WP's boundary.
5. **The nested-vault ancestor COMMIT is inferred from the code, not measured.**
   VS-P2 and VS-P3 measure that reads from a nested vault resolve the ancestor;
   that the pipeline would then publish there was not executed. Owner item O5
   states it that way and does not claim more.
6. **O6's overrule cost is the largest in this queue.** If the owner rules that
   row W1(c)(i)'s trigger FIRES on an environment change, this WP is superseded:
   seam closure plus admitting `rev-parse --git-dir` as a TENTH pinned shape
   become owner business and a change to Table W row W1(c);
   `tests/unit/dream-pipeline.known-calls.js` joins Deliverables; nine becomes ten
   in every surface stating it; and the package is no longer an S.
7. **V5 proves PRESENCE, not content.** A copied opening sentence over a wrong
   amendment body passes it; the four required statements are the reviewer's
   read, judged over the whole cell. AC6 says so.
8. **Three owner items, none a direct ruling.** O4, O5 and O6 are recommendations
   adopted under the standing authorization of 2026-09-05. Their enumerated
   overrule costs live in the spec's `## Dispatch precondition — owner items`;
   the owner-rulings record records the adoption and CITES those costs — twice
   corrected to do so, by dated amendment, after rounds 1 and 2.

### Dispatch-time re-verification — the checklist the dispatch message ticks

`docs/runbooks/codex-review.md` requires the orchestrator to re-run every
executable Current-state claim against `main` immediately before dispatch, and to
record the run and the SHA it ran against. **A stale claim blocks the dispatch
and routes the spec back to wd-architect.**

- [ ] **`src/core/dream/validate.js` and `src/core/dream/git-env.js` are
      UNCHANGED IN CONTENT between the pinned base
      `8358655d41f997e8da05a39ec6b2851d05785480` and
      `git merge-base origin/main HEAD`** —
      `git diff --quiet 8358655d <merge-base> -- src/core/dream/validate.js src/core/dream/git-env.js`
      exits 0. **This is a CONTENT comparison and never a SHA equality**
      (dispatch-time finding D1 below): `main` moves for unrelated reasons all
      the time, including for this spec's own Ready PR. It is V4's first gate and
      the anchor for Table J, VS-P7 and the Table W amendment; if the CONTENT
      differs, Table J must be re-derived and VS-P7 re-run before the SHA is
      updated.
- [ ] `src/core/dream/validate.js:64-81` resolves to the module-private `git()`,
      and its `env: process.env,` line is still byte-exact — it is the line V4
      requires to be removed.
- [ ] `src/core/dream/validate.js:88-93` `assertGitRepo`, `:102-107`
      `assertCleanTree`, `:117-120` `restoreVaultToHead`; the four `git(vaultDir,`
      call sites are still exactly the four of Table J rows J1–J4 (V4a).
- [ ] `src/cli/dream.js:29` and `:587` are still the `assertGitRepo` import and
      its single call site.
- [ ] `src/core/dream/git-env.js:26-41` still resolves to `buildGitEnv`, and it
      still adds `GIT_INDEX_FILE` only when `indexFile` is passed (AC2 clause c).
- [ ] `src/core/exec-identity.js:554-558` still uses `opts.env` both to resolve
      the pin (`:556`) and as the child's environment (`:558`).
- [ ] `tests/unit/dream-validate.test.js:1485-1502` is still
      `stubCollaborators` and `:1506-1513` still `stubSpawn` — AC2's three
      clauses rest on that helper and this WP adds no seam of its own.
- [ ] `tests/unit/dream-validate.test.js:1386` is still the `assertGitRepo`
      pinned-drift assertion, and `:15` still the unused `restoreVaultToHead`
      import (residual 3).
- [ ] `src/cli/adopt.js:79-83` is still `isGitRepo` = `rev-parse --git-dir`, and
      `src/core/vault.js:118` still the same predicate — owner item O5 rests on
      adopt reading "inside a repository" as "already a repo".
- [ ] **V5's second grep** — `NEITHER SUPPRESSED NOR DETECTED` — is still present
      in `docs/specs/done/WP-dream-promote-in-workspace.md`, so the guard that
      proves row W1's hook residual was left intact is not vacuous.
- [ ] Row **W1(c)(i)** still carries the standing-trigger sentence the amendment
      disposes of, and row **W1(c)** still declares **nine** pinned shapes — a
      tenth appearing upstream is O6's overrule condition arriving by another
      route.
- [ ] `node scripts/red-proofs.js --wp WP-dream-git-env-validate-seam` still
      exits 1 with `VACUOUS: V2` (the deliverable-absent red), and
      `node scripts/red-proofs.js --wp WP-dream-git-env-pinning` still reports
      its three proofs `PROVEN`.
- [ ] `tests/red-proofs/dream-git-env-validate-seam.proofs.json` still does not
      exist (V3's deliverable-absent red), and no other declaration file has
      claimed the id `validate-git-inherits-git-dir`.

## Dispatch-time re-verification, 2026-09-06 — one finding, D1

The design loop closed at round 2, the clean-context mechanical verification
passed 7/7, and PR #236 merged the `Ready` spec to `main` (`e7f1c957`). The
orchestrator then ran the dispatch-time gate
(`docs/runbooks/codex-review.md`, "Dispatch-time re-verification") against
`main` and **blocked the dispatch on the Closure checklist's own first item.**
It was right to: the item was **stale by construction**, and no implementer could
ever have satisfied it.

| # | Band | Branch | Finding | What changed |
|---|------|--------|---------|--------------|
| D1 | B | 6 (machinery) → LIGHT, no external round | **V4's base guard was UNSATISFIABLE BY CONSTRUCTION.** It required `git merge-base origin/main HEAD` to EQUAL `8358655d`. But the implementer must branch from `main` **after** the `Ready` PR merges — that is how the spec reaches their tree — so the merge-base is `e7f1c957`, and V4 was red on **every honest implementation branch**. The circularity is the point: **the Ready PR itself moves `main`**, so a SHA-equality guard pinned to a pre-Ready commit can never hold once the spec is dispatchable. R2-B's intent — an upstream change to the measured files must not slide under a rebase — is right; the SHA was the wrong predicate for it | **FIX.** The guard compares **CONTENT**: `git diff --quiet "$BASE" "$(git merge-base origin/main HEAD)" -- src/core/dream/validate.js src/core/dream/git-env.js` must exit 0, else the same base-moved message with the offending merge-base named. **Both files, not one**: Table J's rows are `validate.js`'s call sites and row J0 calls `buildGitEnv`, which is `git-env.js`'s, so the measurements rest on both. `BASE` stays pinned as the SHA the prescribed-lines diff is taken against. Every mirror moved in the same commit: the Current-state pinned-base bullet, AC5 half (a), the Mirrored Surface Checklist's V4 line, and this record's Closure checklist item above |

**Measured on this tree before the fix was written:** `git diff --quiet 8358655d e7f1c957 -- src/core/dream/validate.js src/core/dream/git-env.js` exits **0** — neither measured file changed between the pinned base and the post-merge `main`, so every measurement in this record still holds and nothing needs re-deriving. That is what the new guard asserts, and it is the fact the old guard could not express.

### Both-directions proof of the new base guard (`prove-d1.sh`)

The script under test is **extracted from the spec**, not retyped. Each state is
a fresh `git clone --no-hardlinks`; rc captured with no pipe in between.

```text
=== (i) an HONEST implementation branch: merge-base is e7f1c957, NOT the pinned SHA ===
  merge-base = e7f1c957378d62d9b4bd5b55b07b4647bb2aecf2
  pinned base= 8358655d41f997e8da05a39ec6b2851d05785480
  V4 rc=1  FAIL: the require('./git-env') line was not added
=== (ii) the base genuinely MOVED: validate.js differs at the merge-base ===
  merge-base = f2e2dd135c0b71ce4e4fa376b77df35d55a7766a
  V4 rc=1  FAIL: base moved — re-derive Table J and re-run VS-P7 against the new base, then update the pinned SHA (merge-base f2e2dd135c0b71ce4e4fa376b77df35d55a7766a changes one of the two measured files)
=== (iii) a COMPLIANT working state on an honest branch ===
  merge-base = e7f1c957378d62d9b4bd5b55b07b4647bb2aecf2
  V4 rc=0  V4 OK — the prescribed change landed (blind to additions; AC2 and the reviewer's read carry that)
```

**Read (i) carefully — it is the case the old form got wrong.** The merge-base is
`e7f1c957`, **not** the pinned SHA, and the guard **passes**: the two measured
files are byte-identical between the two commits, so V4 proceeds to its
prescribed-lines checks and fails there, on the untouched tree, which is the
correct red for a branch where the work has not been done. Under the old form
this state died at the guard with a base-moved message and the implementer had no
way forward. **(ii)** is the case the guard exists for: a one-line change to
`validate.js` committed upstream and folded into the merge-base produces the
base-moved failure naming the offending commit. **(iii)** is the green.

**The lesson, stated where the next architect will hit it.** A **SHA-equality**
base guard on a spec that must reach `Ready` is unsatisfiable by construction,
because the Ready PR is itself a commit on `main`. Guard the **content that the
measurements rest on**, and name those files explicitly — the predicate then says
what the reviewer actually meant, and stays true across every merge that does not
touch them.
