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

src/core/exec-identity.js:554-556  (spawnPinnedSync uses opts.env for resolution and for the child)
   before: function spawnPinnedSync(name, paths, opts = {}) {
   FIRST :   const env = opts.env || process.env;
   LAST  :   const { command, args } = resolvePinnedSpawn(name, paths, env, platform);
   after :   const jobArgs = Array.isArray(opts.args) ? opts.args : [];

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

Two ranges were **wrong at one end in the first draft and corrected here rather
than in prose**: `src/cli/adopt.js:79-82` ended on the `return` with the closing
brace after it (now `:79-83`), and `src/core/vault.js:118-119` ended inside the
`if` block (now `:118`). Both are finding Y3.

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
spec line count                                 = 423
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

The spec is **422 lines** by `wc -l` — 0.5's `coherence.js` reports 423 because
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
  This WP does not touch ADR-0012 (Out of scope).
