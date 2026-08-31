---
title: The index refresh dropped with its cause, and the contract surface its absence explains
date: 2026-08-31
related_wps: [WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->

# 2026-08-31 — the index refresh dropped with its cause

**Subject:** `WP-dream-promote-in-workspace`, the commit path (`commitNamedSet`).
**Status:** owner ruling, implemented at `dd18370`; contracted here and in
**Table W** of that spec.
**Pattern:** the same one as
`docs/specs/logbook/2026-08-30-toctou-class-retired-with-its-cause.md` — a
retirement records the CAUSE that retired with it, so a later reader cannot read
it as a silent weakening.

## What was dropped

After publishing its commit, the run used to refresh the user's git index so
`git status` would not report freshly committed paths as staged deletions. That
mechanism is gone. **The run now touches the user's index in no way at all.**
**SCOPE, per Table W row W1(a), which defines it and which this sentence cites
rather than restates:** the claim ranges over the run's OWN acts — its own git
invocations and its own file writes. A write performed by the user's own git
hooks is outside it, and W1(a) records that residual and the two remedies the
owner rejected by name.

## Why — four defects in four rounds, each fixing the case it was shown

| round | what the mechanism did | the class it missed |
|---|---|---|
| 1 | overwrote the index entry for every committed path | destroyed the user's **staged content** |
| 2 | compared the staged blob before overwriting | a staged **deletion** has no entry, so the guard re-added the path; a staged **mode** change has an equal blob sha, so the guard flattened the mode |
| 3 | parsed `ls-tree` and `ls-files` output to compare properly | one reader for two formats — a parser bug that **disabled the refresh entirely**, silently |
| 4 | separate readers per format | an unresolved **merge** has three stages for one path; the refresh flattened them into one |

**The shape is the lesson, not any one row.** Each patch addressed the case the
review had just shown it, and each shipped green. What the mechanism actually
required was a hand-rolled re-derivation of git's own staging rules — every
entry shape git can hold, maintained here forever. **The owner ruled DROP rather
than a fifth patch.**

## The cause that retired with it

The mechanism read each path's existing index entry and then conditionally
rewrote it. **Two operations over a mutable index with a window between them is a
TOCTOU**, and a concurrent `git add` in the user's own shell landing in that
window was overwritten — measured, and one of the four losses above.

**That race is not mitigated. It is unrepresentable, because the act that created
it — this package writing the user's index — is gone.** No compare, no update,
no window. **Nothing inherits it and nothing needs to:** unlike the 2026-08-30
entry's TOCTOU, whose protected property was real and moved one package over
(Table H row H5 of `docs/specs/done/WP-dream-vault-write-primitive.md`), this
race protected nothing. It was created entirely by the mechanism, and it leaves
with it.

## What the drop costs, and the remedy

The user's index still describes the pre-run HEAD, so `git status` shows the
committed paths as staged deletions or reverse modifications and `git diff HEAD`
shows phantom deletions. **`git reset` in the vault clears all of it.** One
command; the committed history is correct throughout.

**The sharp edge, which is Table W row W4's:** until that reset,
`git revert <dream sha>` **REFUSES** — `error: your local changes would be
overwritten by revert`, exit 128. Re-derived at `dd18370` in both directions.
That makes ADR-0012's one-commit-per-run revertability **conditional on one
command** rather than immediate.

## The owner ruling, and the alternative REJECTED BY NAME

**Ruled 2026-08-31: AMEND. The drop stands.** The conditional cost above was
routed to the owner as a STOP-POINT rather than papered over, because it
diverges from a release gate (M3) and four owner-ruled documents. The ruling:
the five surfaces stating immediate revertability are **rewritten to the
conditional form**, and `docs/PRD.md:21` joined them when the re-sweep the
ruling ordered found it.

**What survives is the property, not the phrasing:** a run is
**deterministically and loudly undoable**. That is what M3 and THREAT-MODEL T1
actually guarantee. What dies is the literal *"one command"*. **The conditional
form is not a weakening of the guarantee — it is the guarantee stated
accurately**, and a reversibility mechanism that silently destroyed unresolved
merge stages was self-defeating.

### REJECTED: the middle path — have the run perform the `git reset` itself

The obvious-looking third option, and the reason it is recorded rather than
merely not taken: it will be re-proposed as an improvement by anyone who meets
the two-command cost without meeting this entry.

**It is rejected on two independent grounds, either sufficient.**

1. **It reimports the defect-4 class as DESIGNED behaviour.** `git reset` is
   precisely the act that flattens a user's staged state — it is the mechanism
   that destroyed the unresolved merge's three stages in round 4 of the table
   above. Automating it does not fix that; it makes it unconditional and
   removes the user from the decision. **The reason `git reset` is the correct
   REMEDY is that the user chooses to run it**, on their own staging, at a
   moment they pick. The same command issued by a background nightly job over
   whatever the user happened to have staged is a different act with the same
   name.
2. **It violates the just-contracted Table W row W1**, which is a total: *the
   run never writes, refreshes, resets or otherwise touches the user's index —
   at all, in any run state.* **SCOPE: that total ranges over the package's OWN
   acts — its own git invocations and its own file writes — and row W1(a) is
   where it is defined; a write performed by the user's own git hooks is out of
   its scope, and the residual is stated there (owner ruling, 2026-08-31).** A
   sanctioned exception re-opens exactly the per-shape reasoning that lost a
   different shape every round. **This paragraph originally added that the total
   "is what makes the contract checkable by a single byte-identity assertion";
   that clause is withdrawn** — a later round measured an endpoint compare
   insufficient for a total over acts, and W1(c) now carries the enforcement.

**The cost of rejecting it is one command the user runs, once, when they choose
to undo a night — and a refusal that is loud rather than silent if they skip
it.** That is a smaller cost than any version of the run touching the index.

## The root cause of the DEFECTS, which is not the mechanism

The round-4 spec-fidelity gate's finding, and the reason this entry exists:

> **The mechanism had no canonical contract surface.** Its rules lived only in
> ~60 lines of code comments, and the one spec sentence that reached the area
> declined to contract it — *"How the bytes reach the index is not asserted —
> round-4 CUT ruling."* **A residual no spec names is a residual no gate can
> check.**

Four rounds of review could each only check the patch in front of them, because
there was nothing to check the patch AGAINST. **Table W is that surface**, and
the CUT sentence is now qualified to the run's PRIVATE index — unqualified, it
read as a decision not to contract the user's index either, which is precisely
where the four defects landed.

## Where the assertions went

Four tests retired with the mechanism. Two tested it directly, one of them
carrying the eighth vacuous assertion this package has paid for. **The other two
SURVIVED the deletion and passed — which is exactly why they had to go:** with
nothing touching the index they were trivially true and had no possible RED.

**One assertion replaces all four** —
`tests/unit/dream-pipeline.test.js`, cited by the stable stem of its name,
*"the run does not touch the user's git index — at all, `<layout>` vault"*
(**one `test()` call, three tests at run time, one per vault layout; the stem is
the citable part because the suffix moves with the layout list**): ordinary
staged content, a staged deletion, a staged mode change and a real unresolved
merge in one fixture. **SCOPE — the claim in that name ranges over the run's OWN
acts, its own git invocations and its own file writes; Table W row W1(a) defines
it and states the user-hook residual this entry does not restate.** It has a real RED against any
reintroduced write, and it covers shapes nobody has enumerated. **A total is what
the per-shape tests could not be:** each of them named a shape, and the mechanism
lost a different one every round.

**WHAT THAT ASSERTION ENFORCES WITH IS NO LONGER A COMPARISON OF THE INDEX —
amended 2026-08-31, and the amendment is the point of this section rather than a
correction to it.** The first form of this paragraph said the run is
**byte-identical** across the run, which was true and was not enough. **An
artifact compared at two ENDPOINTS cannot enforce a total over ACTS:** a write
followed by a restore lands between the endpoints and reads green. The
enforcement is now the git execution seam, whose invariant **Table W row W1(c)
states and this entry does not** — **and WHAT that seam decides changed once
more on 2026-08-31, from classifying each invocation to matching it against the
run's own pinned calls; the section below records that retirement with its
cause.** The byte comparison is retained as a DIAGNOSTIC, kept on stated
grounds. **The gloss that used to stand here — "on a
measured index-safe allowlist or carries a private `GIT_INDEX_FILE`" — was
removed on 2026-08-31 for the reason the next paragraph gives, and it had
already drifted while it stood:** W1(c) requires that file to RESOLVE to an index
that is neither the user's own nor under the vault, and the gloss was the
presence-only form the row's trap (3) exists to forbid. **A second copy does not
stay a copy — that is the whole finding, demonstrated on itself.** **That is a change of KIND, not a fourth representation**, which
matters because the three preceding rounds each answered a finding with a wider
representation and the fourth found the next gap. There is no fifth
representation worth reaching for.

**The MECHANISM that assertion uses is Table W row W1's, and this entry
deliberately does not spell it.** An earlier form of this paragraph did — `git
ls-files --stage` — and that second copy is how the contract came to say two
different things: the spec's row was patched to `-v --stage` while this sentence
was not, so the record and the contract disagreed about what enforces the total.
**One contract, one place that spells its mechanism.** Row W1 is that place;
this entry cites it. **The rule reaches PROSE like this paragraph — not the test,
which IS the mechanism, and not a SHA-pinned measurement, which reports what ran
on a tree rather than what must run now.** The tables below keep their pinned
`ls-files` spellings on exactly that ground.

## The projection representation, retired with ITS cause

Recorded to the same standard as the mechanism above, because it is the second
thing this work retired and the first thing a later reader will be tempted to
put back.

Between the drop and the extraction pass of 2026-08-31, the total was enforced
through a `git ls-files` projection of the index — `--stage`, then `-v --stage`
after a review round found `--stage` blind to index flags. **The retired thing
is that pattern: a column added per round.** Its cause is a mismatch of kind — a
projection ENUMERATES the index, and the contract is a TOTAL over it, so the
projection is only ever as complete as the last shape someone thought of.

Two measurements ended it, both reproduced at `cbc7240` on git 2.50.1, and both
show the index file changing while `ls-files -v --stage` compares EQUAL:

| # | the act | raw `.git/index` | `ls-files -v --stage` | `ls-files -f` |
|---|---------|------------------|------------------------|----------------|
| 1 | re-stage an entry with its **own identical mode and sha** | **differs** | equal — blind | equal — blind |
| 2 | set or clear **`fsmonitor-valid`** (needs `core.fsmonitor` configured) | **differs** | equal — blind | differs |

Neither is exotic. Shape 1 is what any "refresh" that decides an entry is
already correct still does to the file, which is defect 3's neighbourhood; and
no projection catches both, because they are blind in different places.

**READ THE TABLE'S LAST COLUMN, because a later form of the spec's own row W1(b)
did not.** Shape 2 is caught by `ls-files -f`; only shape 1 is blind to every
projection. The spec's row opened by claiming both shapes leave *every*
projection equal, contradicted itself three lines later, and propagated the error
into its blindness rule — while this table, and the shipped code, had it right
all along. **Corrected in the spec on 2026-08-31 against the shipped behaviour.**
The argument the table supports is untouched by the correction: it was never that
`-f` is blind to everything, it was that the projection cannot be COMPLETED by
enumeration.

**The RED was measured too, not assumed.** With `commitNamedSet` mutated to
perform shape 1 against the user's index, the raw comparison went red on every
run state that reaches the publish — normal, bare-marker-after-writes,
secret-note, near-marker — while `ls-files -v --stage` stayed green on all four.
The run states that abort before the publish stayed green in both, correctly.

## The constructed index path, retired with ITS cause

**The third thing this work retired, recorded to the same standard as the other
two — and the only one of the three that was silently WRONG rather than merely
insufficient.**

The endpoint diagnostic located the index by construction, at
`<vault>/.git/index`. **That is the wrong file in two producible layouts**, both
reproduced on git 2.50.1:

| layout | `<vault>/.git` | where the live index actually is |
|---|---|---|
| plain repo | a directory | `<vault>/.git/index` — the constructed path is right |
| **linked worktree** (`git worktree add`) | a **file** holding `gitdir: …` | `<main>/.git/worktrees/<name>/index` |
| **`--separate-git-dir`** | an **87-byte file** | `<separate dir>/index` |

**In the worktree layout the failure is silent, which is what makes it worse than
a crash.** A real `git update-index --assume-unchanged` writes the live index and
`ls-files -v` prints `h`, while `<vault>/.git/index` does not exist **before or
after** — so the absent-compares-equal-to-absent rule compares `null` with `null`
and PASSES a run that wrote the user's index. **A rule that is correct in
isolation became the silencer**, because the path it was applied to was wrong.

**Measured in place rather than argued:** with the constructed locator restored
and the index genuinely written, the check was **GREEN on `separate-git-dir` and
on `linked-worktree`**, red only on `plain`. With `git rev-parse --git-path index`
— git's own answer, resolved against the vault — it is RED on all three. The test
is now parameterised over the three layouts for exactly this reason; a
single-layout fixture could not have told them apart.

**This was NOT classified as a residual, and the ruling is recorded because the
classification was contested** (owner, 2026-08-31): a vault living in a linked
worktree is a **producible user configuration** — adopt requires a git repo, and
a linked worktree is one. *"No producing workflow"* was the wrong reading.

**And the raw representation was measured to be STABLE**, which is the condition
that makes it usable at all: across those eight run states, plus a racily-clean
index, `core.fsmonitor` on, and untracked-cache/split-index on, the file's
content was byte-identical — and its inode and mtime were unchanged too, so
nothing in the run opens it. **The one false-positive class is named in row
W1(e):** a git command that refreshes the stat cache (`status`, `diff`) rewrites
the index with no semantic edit. The run issues none in the user's repo — row W6
is that measurement — and W6's standing clause already requires owner review
before one is added.

Assertions that asked the index a question now ask **HEAD**, which is what they
meant; the warnings-file check asks the **file**, because `status` and
`diff HEAD` are both index-mediated and now carry the cost's noise.

## The intent-classification direction, retired with ITS cause

**The fourth thing this work retired, and the only one of the four that is not a
representation problem.** The first three were the same mistake at three depths —
a projection of the index, a wider projection, then the artifact itself. This one
is different in kind, and the difference is why it is worth its own section.

After the enforcement moved to the git execution seam, the seam decided each
invocation by **understanding** it: resolve the subcommand past leading global
options, ask git which repository — later, which index file — the invocation
would reach, and admit it if the verb was on a twelve-entry index-safe allowlist
(`INDEX_SAFE_GIT`). **Two independent refutations, two rounds apart, each
reproduced independently, retired that direction. Either alone is sufficient, and
they break it in different places.**

| # | the exploit | what it did | why the classifier missed it |
|---|---|---|---|
| 1 | `git --attr-source log update-index --chmod=+x f.txt` | wrote the user's index — mode `100644` → `100755`, exit 0 | `--attr-source` is a value-consuming global option added in git **2.40**; the resolver did not know it, so it read the verb as `log`, which WAS on the allowlist |
| 2 | `GIT_INDEX_FILE=<private> git read-tree --index-output=<user index> HEAD` | **destroyed the user's staged content** — `two` staged became the committed `one`; index sha `dd271d29…` → `0097ddb9…` | `--index-output` is a **subcommand** flag, not a global option, so no replay of global options reaches it; the index-identity probe reported the PRIVATE index |

**Refutation 1's lesson is not the missing entry.** The round before had patched
the identical shape for `--namespace`. **Git's global-option grammar is not ours
and it grows**, so a resolver built on it can always be one entry short — and one
entry short HERE grants by omission, at exactly the layer that refuses to grant by
omission one line above.

**Refutation 2's lesson is that the destination is not a property of the
configuration.** A subcommand's own grammar can name the file it writes, and no
amount of global-option or environment replay sees it.

### What replaced it, and the structural ground

**Option C, owner-ruled 2026-08-31: the run's own calls are PINNED. Default-deny;
an unknown shape is a violation.** The owner's words, which are the whole reason
this closes where the others did not:

> enumerating the BAD is unclosable because git's grammar is not ours;
> enumerating our OWN GOOD is closable because the run's call set is ours —
> default-deny, unknown shape = violation.

Nine shapes, measured as forty-five invocations across all three vault layouts.
**Both exploits above fail against it — but NOT for the same reason, and the
sentence that once said they did is corrected here rather than dropped.**
Refutation 1, and refutation 2 in the three-token form measured at `578d17b`,
fail on argument count and literals: no pinned shape has their shape, and
nothing had to understand either one. **Refutation 2's TWO-token form did not
fail at all until the object-name slots were pinned later the same day** — see
"The slot that was not a slot" below, which is the whole of what that correction
is about. **The set itself is Table W row W1(c)'s and this entry does not spell
it**, on the same one-contract-one-place rule the projection paragraph above is
an instance of.

**Matching is strict shape-equality, never re-classification.** A fuzzy matcher —
prefix matching, option-order tolerance — would smuggle the retired direction
back in under a new name, because every such tolerance is a small
re-classification.

### The slot that was not a slot — the gap in the pinned set, and the ruling that closed it

**Same day, two rounds after the set landed.** A review gate and the owner
independently measured that `ANY` — a placeholder accepting one token without
inspecting it — was too wide for the slots that hold OBJECT NAMES.

`read-tree` accepts `--index-output=<path>` **as its sole argument**. So

```
['read-tree', '--index-output=<user index>']     # two tokens
```

matched the pinned `['read-tree', ANY]` **on argument count**, and the command is
not inert: exit 0, **the user's index EMPTIED**, staged content destroyed — with
a legitimate private `GIT_INDEX_FILE` set and every disposition clause of row
W1(c) satisfied. **A data slot that cannot tell data from an option is not
pinned at all.**

**THE RULING (owner, 2026-08-31, shipped at `5c5d082`): pin the object-name
slots to the run's OWN computed values.** A second placeholder, `RUN_VALUE`,
sits beside `ANY`. **It does not inspect the token** — inspecting tokens is the
direction this entry retires. It compares the token to values THIS RUN PRODUCED
and the seam watched it produce: the head from `rev-parse HEAD`, blobs from
`hash-object`, the tree from `write-tree`, the commit from `commit-tree`. Every
object name the run passes is one it computed through an earlier pinned read, so
identity to an observed value is available **without any grammar**.

> Same structural ground the pinned set stands on: our own values are ours to
> enumerate; git's grammar is not.

**Applied to every slot the rule reaches, not only the exploited one** —
`ls-tree`'s tree-ish, `update-index --cacheinfo`'s sha, `read-tree`'s tree-ish,
`commit-tree`'s tree and parent, `update-ref`'s two shas. Slots holding data the
run did not compute — modes, paths, messages — stay `ANY`. **The set itself, and
each slot's kind, is Table W row W1(c)'s and this entry does not spell it.**

**Measured both directions**, through the real `classify` in the live fixture and
again in isolation:

| slot kind | the two-token redirect | the legitimate call |
|---|---|---|
| `ANY` | **ACCEPTED** — the gap | accepted |
| `RUN_VALUE` | **REJECTED** | **still accepted** |

Regression held on the same tree: `--attr-source` and the three-token
`--index-output` still rejected as unknown shapes, the in-tree private index
still rejected by the working-tree clause, and the two-sided vacuity guard still
0 pass / 3 fail against a dead decision in both directions.

**`read-tree` was the only shape carrying the defect** — three independent
sweeps agree (six directed vectors, the gate's own probes, then ten exotic ones:
`--split-index`, `@`, `--`-position abuse, crafted paths, `--stdin` in a sha
slot, an option as the message). It is singular because `--index-output` is the
one **subcommand** flag among the nine that retargets a write off the pinned
private index. **That is a measurement over enumerated vectors and not a proof
over git's grammar** — the pin is applied by the rule, not by the exploit, so
the other slots are pinned whether or not anyone has found their vector.

#### The lesson that outlives the fix: a canary that differs from the exploit by ARITY proves nothing about it

The non-vacuity guard's reject-side canary asserted rejection of the **three**-token
`read-tree --index-output=<path> HEAD`. No pinned shape can match that on
argument count, so the canary was green **against a set that accepted the
two-token form of the same exploit**. It certified a rejection the set never
made. Both forms are asserted now.

Argument count is the first thing shape-equality decides, so a canary that
differs from its exploit in arity dies before it reaches the slot under test.
This is the `+0`-delta shape one level in: the assertion ran, and it ran past the
thing it was believed to be checking.

#### One residual, stated rather than closed

**The shipped own-value set is wider than the four sources the ruling names.**
The seam admits the single-line output of any pinned call it observed succeed —
so besides the head, blob, tree and commit names it also admits `ls-tree`'s
output line (harmless: it begins with a mode, so it equals no argument the run
passes) and **the committed content of the quarantine-warnings file** read by
`show HEAD:<warnings>`, whenever that content is one line after trimming. That
content is in the user's vault history and is therefore user-controllable, so a
run **mutated** to issue the two-token redirect would be admitted again in a
vault whose committed warnings file consists of exactly that argument.

The exploit needs BOTH the mutation and the crafted vault, so this narrows the
pin rather than opening a live data-loss path. It is recorded in Table W row
W1(c) as owner-visible work with the shape of its remedy, **and it was not
narrowed away in prose**: the row and `KNOWN_CALLS` are a registered pair, and a
row claiming four sources while the code admits six is the exact drift Table W
was extracted to end.

### What was measured SOUND and is kept rather than dropped

A retirement that discards its predecessor's correct results loses them twice.

- **The twelve allowlisted verbs were measured to write no index**, at `1ac82ac`
  on git 2.50.1 against a vault carrying deliberately stale cached stat data.
  **That measurement never failed and it is not what retired**: the members were
  right; the RESOLVER that mapped an argv onto a member could not be closed. Six
  of those verbs are exactly the six `unset`-disposition shapes of the pinned set,
  so the measurement now underwrites them directly.
- The ADR-0012 restoration was byte-equal across three surfaces; boundary clean;
  `mirror-walk` +0.

### The rule this section adds

**A superseded rationale is retired WITH its mechanism.** Removed with the
direction: `INDEX_SAFE_GIT`, the verb resolver, the global-option collector, the
vault-git-dir binding they fed, **and the comment block arguing the retired
predicate in the present tense** (*"WHICH REPOSITORY DOES THIS CALL REACH? ASK
GIT — DO NOT ENUMERATE"*). The last of those was a gate finding in its own right,
and it is the instructive one: **a rationale left standing beside a new mechanism
is read as describing it**, so it does not merely go stale — it misinforms with
the authority of a contract comment.

### The proof standard this direction introduced

**Instrumentation may not make seam calls of its own.** Measured at `578d17b`: a
first pass of the three exploit cells reddened all three, but for the harness's
own reason — it located the index with `rev-parse --git-path index` THROUGH the
production seam, which is an unpinned shape. Routed around the seam and re-run,
each cell failed for its own reason. **Under the retired direction this was
harmless**, since the extra read resolved to a repository and passed. **A gate
that inherits a pre-C harness therefore inherits a false red**, and a red whose
reason is not the cell's is not a measurement.

### One prose/code divergence settled with the direction

The seam's JSDoc promised a private index that is *"neither the user's nor inside
their working tree"*; the shipped predicate checked only the first clause. So
`GIT_INDEX_FILE=<vault>/scratch-index` had been a violation and had silently
become permitted. **Settled towards the stronger side by owner ruling — the row
decides, and it decided BOTH clauses** — because an index materialised inside the
vault is a file this run writes into the user's working tree, which row W1(a)'s
scope names in as many words. Measured RED at `578d17b`. **The pair is now a
registered mirror**, which is the actual remedy: the drift was possible because
nothing said the two had to move together.

## The standing condition, re-derived rather than inherited

The drop was conditional on nothing downstream depending on a refreshed index.
**That was re-derived at `dd18370` rather than taken from the removal commit's
claim**, and the measurement is Table W row W6. Its two loudest candidates both
came back negative for the same reason: `assertCleanTree` (the only real
`git status`) and `restoreVaultToHead` (the only `reset`) are **exported but
called nowhere in `src/`** — retired by row G3's re-base onto the workspace. Had
either still run, a stale index would have starved every subsequent run at its
own pre-flight, which is the failure this check existed to rule out.

## The rule this entry is an instance of

**A mechanism that keeps failing review in the same place is missing a contract,
not a patch.** The fifth patch was available and cheap; what was missing was the
surface that would have made the first one checkable. When the same contract is
hit round after round, extract it — and record the cause that leaves with the
mechanism, or the next reader cannot tell a retirement from a weakening.

## REGISTERED, NOT FIXED — the run does not pin its git environment

Recorded here on the owner's ruling of 2026-08-31 so it is carried openly
rather than discovered later, and explicitly **not** repaired in that round.

`commitNamedSet` builds its private-index environment by spreading the ambient
one — `{ ...process.env, GIT_INDEX_FILE: tmpIndex }` (`src/cli/dream.js`, the
block opening `THE USER'S INDEX IS NOT THIS RUN'S PROPERTY`). A user who has
`GIT_DIR` or `GIT_WORK_TREE` exported at dream time therefore propagates a
repository redirect into every git invocation the run makes.

**What this is not.** It is not a hole in row W1's enforcement, and the REASON
was rewritten on 2026-08-31 when the enforcement changed direction — the old
reason described the retired classifier and could not simply be carried
forward. Under the pinned call set, an ambient `GIT_INDEX_FILE` arriving on a
shape whose disposition is `unset` is itself a violation, and the three shapes
that write an index carry an explicit private `GIT_INDEX_FILE` that a `GIT_DIR`
redirect does not override. **Row W1(c) is where that rule lives; this entry
cites it and does not restate it** — including the ground's status, which the
row marks as REASONED rather than measured.

**What it is.** A question about whether the run should PIN its git environment
rather than inherit it — product hardening, with its own trade-off (pinning
overrides a configuration the user set deliberately, which is the same
objection that retired the `core.hooksPath` proposal in this entry's ruling).
It belongs to the post-family queue, and it is registered rather than taken
because a product change must not be adopted under review pressure.
