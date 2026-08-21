---
title: Review rounds — WP-dream-baseline-delta-primitive
date: 2026-08-21
---

# Review rounds — WP-dream-baseline-delta-primitive

Spec: `docs/specs/WP-dream-baseline-delta-primitive.md`. Base: `main` @ `e648284`.

**Round counter starts at ZERO.** This package is successor 1 of the superseded
`docs/specs/done/WP-dream-gate-inputs-baseline-delta.md`. That document's three
rounds are EVIDENCE for the measurements this spec carries — above all the reason the
primitive makes no freshness claim — and are **never review credit**. Nothing found
there counts as reviewed here.

## STOP CRITERION (pinned before the first adversarial round)

- **Closes:** one external adversarial round returns no finding about the PRODUCT.
- **THE FAMILY, inherited and re-pinned:** the predecessor died of *snapshot
  substituted for a live read*. This package's whole defence is that it substitutes
  nothing — it has no consumer. **A round that finds this package implying, assuming
  or requiring any freshness property returns to the owner**, because that is the
  failure that already cost one package.
- **Otherwise:** two consecutive rounds on any other same contract family → contract
  extraction. Two consecutive rounds on an owner ruling → owner ruling request.
- **Surface frozen:** the two new assertions in Verification steps are the entire
  machinery budget. Everything else is proven behaviourally.
- **Scope frozen:** additive by ruling. A finding that asks for a consumer, a wiring
  step, a freshness check, a generation invariant, or any policy about which files
  matter is ROUTED to successor 2, never folded in.

## Rounds

| Round | Kind | Raw record | Verdict |
|---|---|---|---|
| 0a | Template conformance (clean context, two inputs, no external reviewer) | `docs/specs/logbook/2026-08-21-dream-baseline-delta-primitive-r0-template-conformance-raw.md` | CONFORMANT — 0 blocking, 4 non-blocking |
| 0b | Internal coherence + runnable criteria | `docs/specs/logbook/2026-08-21-dream-baseline-delta-primitive-r0-internal-coherence-raw.md` | 5 findings, all fixed |
| 1 | External adversarial (design), gptsol, English-pinned | `docs/specs/logbook/2026-08-21-dream-baseline-delta-primitive-round-1-raw.md` | **NO-SHIP** — 4 findings, all confirmed; 2 folded, 2 PARKED |
| 2 | External adversarial (design), gptsol, fresh round after the ruling | `docs/specs/logbook/2026-08-21-dream-baseline-delta-primitive-round-2-raw.md` | **NO-SHIP** — 1 FIXED, 2 PARTIAL, 1 NOT FIXED, 5 fresh findings; all folded, none parked |
| 3 | External adversarial (design), gptsol, fresh round after the framing flip | `docs/specs/logbook/2026-08-21-dream-baseline-delta-primitive-round-3-raw.md` | **NO-SHIP** — 3 FIXED, 1 PARTIAL, 1 NOT FIXED, 4 fresh findings; 3 folded, 1 PARKED |
| 4 | External adversarial (design), gptsol, the closing round required by weighted closure | `docs/specs/logbook/2026-08-21-dream-baseline-delta-primitive-round-4-raw.md` | **NO-SHIP** — 2 FIXED, 2 PARTIAL, 3 fresh findings (the FIRST type (a) in this package); all 3 folded |
| 5 | External adversarial (design), gptsol, owner-ruled after round 4 | `docs/specs/logbook/2026-08-21-dream-baseline-delta-primitive-round-5-raw.md` | **NO-SHIP** — all 4 round-4 fixes FIXED; 2 fresh findings; 1 folded, 1 PARKED (type (a), fourth containment-family, REPEAT-KIND) |
| 6 | External adversarial (design), gptsol, the round weighted closure required | `docs/specs/logbook/2026-08-21-dream-baseline-delta-primitive-round-6-raw.md` | **NO-SHIP** — byte-preservation FIXED, **platform ruling NOT FIXED**; 1 fresh type (a); nothing folded, PARKED as a design question |

## Round 0 dispositions

**0a — four non-blocking observations, all ACCEPTED as-is**: the per-contract table
headings (the template's own body invites them, and the worked example sets the
precedent), the paraphrased-and-extended security item, and the two extra unheaded
blocks (both named; the post-fence commentary is required by the authoring runbook's
both-sides rule).

**0b — five findings, all FIXED before this commit:**

| # | Finding | Class | Weight |
|---|---|---|---|
| 1-3 | Three stale range citations — `hashScratch` `:44-56`→`:44-55`, `changedPaths` `:1020-1033`→`:1020-1034`, `private-fs.js:620-668`→`listPrivateEntries` `:619-669` (wrong at both ends) | citation drift | LIGHT |
| 4 | **The git-free assertion was a FALSE GREEN on a missing deliverable.** `! grep …` succeeds when `grep` exits 2 on a nonexistent file, so the gate passed hardest exactly when the module was never written. Hardened with `test -f` first and proven in three directions (absent → red, clean → green, dirty → red) | verification machinery | **HEAVY** — a gate that cannot fail is worse than no gate |
| 5 | `captureBaseline` returned `{Baseline}` while Table A promised anomalies reporting, so a symlink met at capture had nowhere to go and would have been dropped silently — in a module whose entire value is that its baseline is complete | contradiction | **HEAVY** |

**The range check earned its place immediately.** It was added to this spec's dispatch
precondition because the same defect recurred three times in the predecessor. Applied
to this spec's own first draft it caught three more, one of them wrong at both ends.
Five of seven ranges were already correct — the check pays for itself on the other
two.

**Weighted closure:** two HEAVY findings landed, so the next step is a full fresh
external adversarial round, not a mechanical re-check.

## Round 1 dispositions

All four findings CONFIRMED on the tree; F3 and F4 reproduced independently rather
than read. The Routed section came back explicitly empty — the category-error guard
placed BEFORE the vendored prompt did its job, and no round was spent on a
freshness objection this package cannot own.

Triage follows the rule agreed with the advisor and sharpened here: *a fix reachable
only by adding a freshness, locking or stability mechanism is PARKED regardless of how
small the diff looks, because the diff size does not measure the contract impact.*

| # | Finding | Disposition | Why this bucket |
|---|---|---|---|
| 1 | The scope predicate is lost between `captureBaseline` and `computeDelta`, so an excluded pre-existing file can be reported `added` | **FOLDED** | Routine information-loss defect in the API. Fixed by making the baseline carry its own `include` and having `computeDelta` re-apply it — chosen over re-passing the filter, because carrying it makes a mismatched-scope call **structurally impossible** rather than merely forbidden. Three acceptance cases added |
| 4 | `lstat`-then-read-by-name follows a symlink substituted in the gap, capturing bytes from outside `rootDir` under an internal path | **FOLDED** | Routine, and NOT a freshness mechanism: it makes a guarantee the spec ALREADY claimed actually hold, for a single read, and the repo already applies the discipline (`src/core/private-fs.js:687-751`, `applyModeSecure` — `O_NOFOLLOW` open, `fstat`, revalidate). Table A gains the bound-object row; an acceptance criterion adds the substitution discriminator and states that up-front symlinks do not satisfy it |
| 2 | The permitted conservative-`binary` result contradicts Table C's unconditional line-equivalence obligation, on the very fixture the corpus mandates | **PARKED (coupled to 3)** | Not routine: resolving it requires deciding what the primitive is equivalent TO, and the answer depends on finding 3 |
| 3 | Git's binary signal is repository-configuration-sensitive — `.gitattributes` overrides the byte heuristic in **both** directions (reproduced) — so a git-free module cannot reproduce it from bytes alone | **PARKED** | **Table C's central obligation is unachievable as written.** This is the advisor's "structurally impossible git-free" bucket: not a corpus gap, and not fixable without either dragging git semantics back into a deliberately git-free module or weakening an obligation the owner has already seen |

### The parked pair, stated as one question for the owner

**What exactly is this primitive equivalent to?** Table C currently says "git's
signal", and finding 3 proves no git-free module can meet that, because the signal
depends on repository configuration the module cannot see.

**Recommendation, not applied:** narrow Table C to git's **default content
heuristic** (bytes only, bounded prefix), keep the conservative-binary exception, and
**condition the exact `addedLineNumbers` and scan-text obligations on
`binary === false`** — conservative-binary records exempt, because a consumer
withholds what it cannot scan. The attribute sensitivity then becomes a NAMED
successor obligation: the successor must show that repository attributes cannot alter
the relevant paths in its workspace, or handle it there.

**Why not the alternative:** requiring exact reproduction of git's predicate would
mean reading `.gitattributes` and implementing git's attribute resolution — putting
git semantics back inside the module whose git-freedom is the reason it can be
verified independently at all.

**Status: folded findings landed; the package does not advance to round 2 until the
owner rules on the parked pair.** Weighted closure would otherwise call for a fresh
round, and running one against a spec with a known-open contract question would spend
it on a moving target.

## The parked pair — OWNER-RULED 2026-08-21, folded at this commit

The owner's own question opened a **third path** neither the advisor nor I had
considered: we stopped using git as a source of STATE, but that does not forbid using
it as a **pure function** — hand it bytes, ask for its judgment. Git as a blindable
state oracle and git as a pure function over bytes we supply are different things, and
both of our framings had collapsed them.

**RULING.** The product code stays git-free — a ~10-line byte check — and the
"spawns nothing" contract stands. The TEST proves equivalence by calling git in
isolation, which replaces the vague phrase "git's default content heuristic" with a
precise, testable definition: *the judgment git gives when run with no repository in
scope, no system or global config, and no external diff.* Table C takes that
definition verbatim, switches included. The conservative-binary exception stands; the
exact `addedLineNumbers`/scan-text obligations are conditioned on `binary === false`;
attribute sensitivity becomes a named successor obligation.

**Why the product code may not spawn git** (the owner's reasoning, recorded): it would
re-open the class direction (A) exists to escape — git configuration as a hidden
influence channel — and this program's record at enumerating that class is **0 for 3**
(the self-hiding `.gitignore`, the fake `.git` marker, `diff.external`). Three times it
believed the list was complete. A ten-line byte check has no channel; the residual
risk of git changing its heuristic is caught RED by the equivalence test, bounded and
loud.

### Re-measured before folding — two results the relayed version did not carry

The ruling arrived with four supporting measurements. I re-ran all four rather than
inherit them, and two came out differently in ways that change the contract text.

| Claim as relayed | Measured here | Consequence |
|---|---|---|
| `--no-index` escapes `.gitattributes` | **Only if the CWD is outside a repository.** With a CWD inside a repo, that repo's attributes are applied even to operands living OUTSIDE it (`-\t-` vs `1\t1` for the same two files). A `.gitattributes` merely PRESENT in a non-repository directory is correctly ignored | The isolation property is about the **invoking CWD**, not about where the operands sit. Table C now says so, and an acceptance criterion states that a test running from this checkout would measure the wrong thing |
| `diff.external` fires on `--no-index` and is silenced by the guards | **Half right, and the half that is wrong is the one that matters.** It fires on the TEXTUAL `git diff --no-index` shape from a hostile global config in a clean directory (reproduced; `--no-ext-diff` silences it), but on `--numstat` it does not fire **at all**, guards or no guards — that path never invokes the external driver | The external-diff guard is load-bearing for the **`-U0` added-lines** invocation, not for the binary one. Read the other way round, someone could guard only the numstat call and leave the hijackable shape open. Recorded in Implementation notes; both invocations carry the full guard set anyway |

The other two reproduced exactly: `--no-index --numstat` outside a repo yields the
bounded-prefix heuristic identical to the staged form (`NUL@100` → `-\t-`,
`NUL@9000` → `1\t0`), and the cost is ~6.4 ms per judgment (200 runs in 1.28 s).

Also confirmed and deliberately NOT relied upon: this repository carries no root
`.gitattributes` today (`git check-attr diff -- README.md` → unspecified). Leaning on
that would be a borrowed defense of exactly the kind this project rejects, so the
neutral-CWD requirement is the guarantee and the repo's current cleanliness is not.

**Next: round 2, a full fresh external round. The contract question is closed, so
there is no moving target.**

## Round 2 dispositions — all five folded, none parked

All confirmed independently; two reproduced from scratch rather than read. **None
required a freshness, locking or stability mechanism**, so under the parking rule none
was owner-level. One of them, however, EXTENDS an owner-ruled contract and is flagged
as such below.

| # | Finding | Disposition |
|---|---|---|
| 1 | The ruled isolation set does not isolate: under the exact ruled switches, plain ASCII flips to binary through `XDG_CONFIG_HOME/git/attributes` and independently through `GIT_CONFIG_COUNT`/`core.attributesFile` | **FOLDED — and the shape changed, not just the list.** See below |
| 2 | `binary` was defined from `afterBytes`, but git's verdict is PAIRWISE (binary-before/text-after, text-before/binary-after, and binary deletion all return `-\t-`), so Tables B and C demanded different things for the mandatory `modified` and `deleted` categories | **FOLDED.** `binary` is now a verdict about the pair, with the measurement in the row |
| 3 | Leaf-only `O_NOFOLLOW` does not establish containment — an intermediate DIRECTORY swapped for a symlink lets the leaf open cleanly and return external bytes | **FOLDED.** The contract now carries the precedent's FULL discipline: `O_NOFOLLOW` + `fstat` + **`(dev, ino)` revalidation** against the pair captured at enumeration. Measured: the `(dev, ino)` mismatch is exactly what catches the ancestor swap. I had cited `applyModeSecure` as precedent in round 1 and carried only half of what it does |
| 4 | Carrying the callback does not preserve its meaning — one function object can answer `false` at capture and `true` at delta | **FOLDED.** The "structurally impossible" claim is withdrawn. What carrying it actually removes is one failure mode (a different function on the second walk); the rest is now a NAMED caller invariant — `include` must be a pure function of the path — with an acceptance case pinning the behaviour when it is violated |
| 5 | The prefix boundary was never in the contract, so a shorter cutoff passes the corpus | **FOLDED.** Measured exactly: `NUL@7999` → binary, `NUL@8000` → text, so the window is 8000 **today**. Deliberately NOT hardcoded: the fixtures are located by bounded search against the reference judgment, so the test follows git if git moves |

### Finding 1 in detail — why the fix is a change of shape

The owner's ruling named the isolation conditions explicitly, and the measurement says
that enumeration is **incomplete**. Worse, the reviewer's own recommended remedy is
also incomplete when measured: adding `GIT_ATTR_NOSYSTEM=1` does not close the XDG
channel, and overriding `HOME` does not close it either — each was recommended for
precisely the channel it fails to close. A complete sanitation does exist (`HOME` and
`XDG_CONFIG_HOME` at empty dirs, `GIT_CONFIG_NOSYSTEM=1`,
`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_COUNT=0`, `GIT_ATTR_NOSYSTEM=1`), but even
it flips back if one of its own values points at a hostile directory: **the guarantee
is not the flag, it is where the flag points.**

That is the **fourth** hidden-influence channel this program has failed to enumerate,
after the self-hiding `.gitignore`, the fake `.git` marker and `diff.external`. **0 for
4.** A fifth list would be a fifth guess. So the corpus gains a **mandatory
hostile-environment control** that arms both known channels and asserts the judgment
does not move, required to be shown RED without the sanitation and GREEN with it. The
environment list stays in the spec as the recipe; the control is what makes it a
guarantee.

**FLAGGED FOR THE OWNER, not parked:** this extends the ruled definition rather than
overriding it — the ruling's intent was "git as a pure function over bytes", and the
measurement shows the named switches do not deliver that intent. Serving the intent is
why it was folded rather than returned. If the owner reads the extension as a change
to the ruling itself, it is one edit to undo.

### Base-tree note

`main` advanced to `a1b473c` mid-round with a docs-only process landing that ratified
four method rules from this arc; `origin/main` is still `e648284` and the landing
touches no file this spec cites. This branch remains based on `e648284`. The spec's
dispatch precondition now says so instead of asserting `main == origin/main`.

**Next: round 3, a full fresh external round** — five findings landed, three of them
changing what the implementer builds.

## Post-round-2 amendment — the framing flipped, and the flip was measured

The advisor confirmed every round-2 measurement and ruled that finding 1 does **not**
need the owner's signature, on a precise boundary worth recording: **the owner ruled a
PROPERTY** — "the judgment git gives with no repository in scope, no system or global
config, no external diff" — while the **switch list was the advisor's own measurement
implementing that property**, and it was incomplete. Repairing a measurement so the
ruled property actually holds SERVES the ruling; it does not amend it. Not a contract
change, so the parking rule does not reach it.

The advisor also asked for a reframing — blocklist to constructed environment — on the
grounds that it is direction (A)'s own logic one level down. I folded it, but only
after measuring it, and **it is stronger than the request**: the request covered the
config/attribute ROOTS, and `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0` is not a root, so
that half would have stayed a blocklist item.

Measured with both hostile channels armed in the parent environment:

| Invocation | Result |
|---|---|
| inherited env, ruled switches only | `-\t-` |
| inherit, then subtract the full blocklist | `1\t1` |
| **`env -i`, roots at empty dirs, `GIT_CONFIG_*` never mentioned** | **`1\t1`** |
| constructed env, one root pointed at a hostile directory | `-\t-` |

The third row carries the argument: the injection variables are armed and cannot
arrive, because the child's environment was **built rather than filtered** — closing a
channel without naming it, which is the only answer to 0-for-4 that is not a fifth
guess. The fourth row is the honest residual.

So the guarantee now decomposes into two constructed halves — build the environment,
and point every config/attribute root at a directory this run created empty — with the
switch list demoted to a recipe and the hostile-environment control kept as the proof.

**A shared miss, recorded because it is more useful than a solo one.** In round 1 the
advisor CONFIRMED the `applyModeSecure` precedent for the no-follow fold, and neither
of us noticed the spec carried only half of it: the `(dev, ino)` revalidation was
missing, which is precisely what catches the intermediate-directory swap round 2 then
found. The advisor verified that the precedent EXISTED; nobody verified that the spec
had taken all of it. **Citing a precedent is not carrying it** — the check is whether
every defense the precedent applies appears in the text that cites it.

**Round 3 is green-lit** and dispatches next: full fresh external round, no pending
owner decision.

## Round 3 dispositions — three folded, one PARKED

All four confirmed by independent reproduction. Round-2 findings 2, 4 and 5 verified
FIXED by the reviewer; finding 1 PARTIAL and finding 3 NOT FIXED, both for reasons
below. The Routed section came back explicitly empty for the third consecutive round.

| # | Finding | Disposition |
|---|---|---|
| 1 | **A forged `git` first on PATH defeats the constructed environment.** Measured: `env -i`, empty `HOME`/`XDG_CONFIG_HOME`, `GIT_CONFIG_NOSYSTEM=1` — and a hostile PATH still returned a forged `-\t-` where the trusted absolute binary returned `1\t1` | **FOLDED.** The reference judgment now requires a verified ABSOLUTE executable, never the name `git` resolved through PATH, and the hostile control gains a PATH arm. In-repo precedent: the product's own git calls already go through `spawnPinnedSync` with a pinned absolute realpath (`validate.js:67`) for exactly this reason |
| 3 | **A FIFO substituted in the classify/open gap hangs the open forever.** `O_NOFOLLOW` refuses a final symlink, not a FIFO. Measured harder than reported: without `O_NONBLOCK` the open never returned and hung the measuring shell for a full two-minute timeout, never reaching `fstat`, so neither the anomaly path nor the throw was ever taken | **FOLDED.** `O_NONBLOCK` added to the untrusted open, then `fstat` rejects the non-regular kind. Measured with it: the open returns and reports `isFIFO: true` |
| 4 | **"Immutable baseline" is not achievable as written.** Measured: `Object.freeze` on a non-empty Buffer throws `TypeError: Cannot freeze array buffer views with elements` and the bytes stay writable (`Xriginal`); a frozen `Map` still accepts `set` | **FOLDED.** The word is withdrawn. Non-mutation becomes a NAMED caller invariant with an acceptance case — the same shape round 2 used for `include`'s purity, and for the same reason: the representation cannot enforce it, so claiming it would be a second false guarantee |
| 2 | **`(dev, ino)` revalidation does not close ancestor relocation.** Move the already-classified DIRECTORY outside the root and symlink its old location to it: the leaf is the same object, so identity matches. Measured: `openedRegular: true`, `devInoMatches: true`, `resolvedInsideRoot: false`. No inode reuse, no bind mount, no case-insensitive filesystem — an ordinary rename plus a symlink | **PARKED — owner question below** |

### The parked question — a containment guarantee this package cannot deliver

Table A claims every path the walk visits resolves inside `rootDir`, and the security
checklist leans on it. **That claim is false against an active ancestor swap, and
portable Node cannot make it true:** closing it properly needs per-component `openat`
from a verified parent descriptor, which Node's `fs` does not expose, and a native
module is barred by the zero-dependency rule.

This is the SECOND round in which the containment contract has failed, and the pattern
is the same both times: each fix closed the case that was demonstrated and left the
class open. Leaf `O_NOFOLLOW` closed leaf substitution; `(dev, ino)` closed
different-inode ancestor swaps; neither closes same-inode ancestor relocation. Folding
a third narrow fix would repeat the shape.

**Recommendation, NOT applied — two parts:**

1. **Add a realpath containment check** as defense in depth. Measured, it does catch
   the demonstrated attack: after the swap, `realpathSync` on the leaf resolves outside
   the root (`insideRoot: false`). It is still racy — the swap can happen after the
   check — so it is a narrowing of the window, not a closure of the class, and must be
   described that way.
2. **Withdraw the universal claim** and state what is actually guaranteed: no symlink
   is followed at the leaf, leaf identity is revalidated, and the resolved path is
   verified under the root — with the residual NAMED: an ancestor relocated between
   enumeration and open, leaf identity preserved, is not detectable without per-component
   `openat`. Then make it a successor obligation, like the attribute one: **the successor
   must show its writer cannot rename directories or create symlinks** in the workspace.

I have deliberately not leaned on that last point to weaken this package's claim now.
The successor's brain has `Read`/`Write`/`Edit`/`Glob`/`Grep` and no `Bash`, so it
plausibly cannot perform the relocation at all — but borrowing a defense from a
consumer that does not exist yet is exactly the pattern this project rejects, and it is
1b's to prove, not mine to assume.

**Why parked rather than folded:** it narrows a security guarantee the owner has seen,
which is the same boundary that sent the `.gitattributes` equivalence question up in
round 1. Consistency, not caution for its own sake.

### A correction to this spec's own overreach, folded with finding 1

The constructed-environment framing said the two constructed halves close every channel
"named or not". Finding 1 walked straight through that: an executable identity is
neither an environment variable nor a file under a controlled root. The claim is now
quantified over the classes actually constructed — environment, roots, **executable** —
and states explicitly that it is NOT a claim that every channel is closed.
**Constructing closes exactly the classes you construct.** That is the honest form of
the answer to 0-for-4, and the channel count is now 0 for 5.

## Post-round-3 amendment — the residual is handed forward, not merely withheld

The advisor confirmed all four findings and both the park and the scruple, adding one
correction I have folded: **do not just omit the tool-capability observation — pass it
forward as a named hypothesis the successor must TEST.** The difference between
"withheld" and "handed forward" is whether 1b has to rediscover it.

Two observations now travel to the successor, explicitly unverified:

1. The successor's writer is a headless brain with `Read`/`Write`/`Edit`/`Glob`/`Grep`
   and no `Bash`, so it may be unable to rename a directory or create a symlink at all.
   **Weak**, and deliberately labelled so: tool capability is a fast-moving harness
   implementation detail rather than a contract, and this repository already carries a
   stale version pin for exactly that reason.
2. Under direction (A) the capture runs BEFORE the brain is spawned, so during capture
   the brain is not an actor. **Stronger** — that is an ordering property of the design,
   not a borrowed defense.

Neither is credit this package may draw on; both must be measured by 1b, which then
states the residual's actual exposure.

**Two process notes the advisor added, recorded because they explain the stop.**

The park was not a judgment call. The **repeat-kind rule landed on `main` earlier the
same day** requires that two consecutive rounds finding the same KIND of defect become
a design question, never another textual patch — and containment failed in exactly that
shape twice: round 2's leaf-only `O_NOFOLLOW` versus the intermediate-directory swap,
round 3's `(dev, ino)` versus same-inode relocation. Each fix closed the demonstrated
case and left the class open. Stopping was mandatory, and it is the first time one of
this arc's own ratified rules bound a decision back on us.

And a pattern worth naming: **this is the FOURTH universal withdrawn inside this one
package** — "every channel closed", "structurally impossible" scope, "immutable"
baseline, and now containment. The first two were caught by reviewers; the last two I
caught while folding. That direction of travel is the point: the spec now states what
it can enforce and names what it cannot, which is what it should have said the first
time.

## Owner rulings 2026-08-21 — containment, priority, and the closing-round question

**RULING 1 — containment: the recommendation, as written.** Folded. Table A's
containment row now states what is guaranteed (leaf `O_NOFOLLOW`, `(dev, ino)`
revalidation, resolved path verified under the root) and NAMES the residual: an
ancestor directory relocated between enumeration and open, leaf identity preserved, is
not detectable without per-component `openat`. The realpath verification is described
as narrowing the window and explicitly NOT closing the class. The acceptance criterion
was corrected too — it still carried "never bytes from outside `rootDir`", which the
narrowing makes false; a criterion asserting the ancestor class closed would assert
something this package does not deliver.

**RULING 2 — priority: 1a closes with its honest limits; 1b comes forward.** The
grounds are worth recording, because they are about this package's value, not its
quality: 1a closes no audit finding by its own spec, and after three rounds and fifteen
commits the actual closure lives in 1b.

### The closing-round question — my call, by the rule, stated as required

The advisor read the remaining weighted-closure obligation as verification of the
round-3 fixes rather than another hardening round, and explicitly left the judgment to
me under the repo rules. I read the rule on `main` (not my older base, and not the
paraphrase) and **it binds: round 4 runs as a full fresh external round.**

`docs/runbooks/codex-review.md`, Weighted closure: *"HEAVY: fixes land, then a full
fresh external round"* and *"The loop is DONE when a round finds nothing about the
product."* Round 3's fixes are HEAVY by the rule's own test — the constructed
executable, `O_NONBLOCK`, the withdrawn immutability claim and the narrowed containment
contract each change what the implementer builds — and round 3 found product defects,
so the loop is not done. There is no reading on which 1a is Ready without one clean
round.

This does not fight ruling 2; it is how ruling 2 is executed. "Closes with its honest
limits" and "closes without the closing round" are different things, and the second is
not available. If round 4 comes back clean, 1a is Ready and 1b starts. If it does not,
that is information the owner needs BEFORE 1b, since 1b inherits this contract.

What the rule does NOT license is a wider round, and the dispatch says so: the
machinery surface is frozen (convergence rule — *"verification machinery may GROW only
to guard a product behavior"*), and the repeat-kind rule makes a third
containment-family finding a design question returned to the owner, never a fourth
patch.

**One addition of the owner's, carried into the dispatch prospectively.** The owner's
audit test — *does this change what the ATTACKER can do, or only what we CLAIM is
proven?* — is now a required per-finding classification in round 4, rather than
something applied afterwards. All four withdrawn universals in this package fell on the
"what we claim is proven" side; making the reviewer classify each finding at the point
of writing it is cheaper than adjudicating it later, and it is the same generative
move as asking a claim to name its mechanism.

**Second time an arc-ratified rule has bound this session's decision**, after the
repeat-kind rule forced the round-3 park. Recorded as the rule deciding, not as
judgment agreeing with it.

## Round 4 dispositions — three folded, and the first type (a) finding

The owner's audit test was carried in the dispatch as a **required per-finding
classification**, and it earned its place immediately: two findings are type (b) —
the guarantee is over-stated — and **one is type (a): the spec would fail to prevent
something real.** That is the first type (a) in four rounds, and it is the answer to
"is the remaining risk in what the thing does, or in what it says about itself".

| # | Finding | Class | Disposition |
|---|---|---|---|
| 3 | **Nested-directory enumeration failure was not fail-closed.** The spec named an unreadable ROOT and an unreadable FILE and never an unenumerable DIRECTORY (`:101`, `:133`, `:320`) | **(a)** | **FOLDED.** Capture now throws on a directory that cannot be enumerated at any depth, and the existing unreadable-capture criterion is EXTENDED rather than a new one added — within the frozen surface, as the reviewer itself insisted |
| 2 | **"Constructed executable" overstated absolute-path verification.** It prevents PATH SELECTION; it does not construct or freeze executable BYTES | (b) | **FOLDED** by narrowing the claim, not by adding a control — the reviewer explicitly said not to add one. Measured against the precedent: `spawnPinnedSync` fails closed on a forged `git` earlier in PATH and ACCEPTS rewritten content at the same verified absolute path |
| 1 | **The withdrawn containment universal was re-asserted in two mirrors** — the symlink row still said "never followed", the security checklist still said "no-follow rule" | (b) | **FOLDED as the circuit-breaker's prescribed action.** See below |
| — | Citation `validate.js:67` was one line early (`:68` is the `spawnPinnedSync` call) — a line I added in round 3 | (b) | **FOLDED** |

### Why finding 1 was folded and not parked — departing from a flag I placed myself

The dispatch told the reviewer that a third containment-family finding is a REPEAT-KIND
design question, and the reviewer duly flagged it as one. The burden is therefore on me
to justify not parking it, and here it is.

**Rounds 2 and 3 found MECHANISM failures** — leaf `O_NOFOLLOW` insufficient, then
`(dev, ino)` insufficient. **Round 4 found a MIRROR failure:** the canonical containment
row is honest and correct; two surfaces that mirror it still stated the withdrawn
universal, and the **Mirrored Surface Checklist contained zero containment entries** —
nothing bound them to it.

ADR-0031's loop circuit-breaker prescribes exactly this case, in its own words: two
consecutive rounds on the same contract family → *"pull that contract into one canonical
reference table and register its mirrored surfaces per ADR-0031's Mirrored Surface
Checklist, then resume the loop."* The canonical table already exists. The registration
never happened. And the DESIGN decision the reviewer asks to be resolved — leaf
no-follow plus a named residual, everywhere — **is the one the owner already ruled**.
Applying an existing ruling to every mirror is execution, not a new design question.

So: all four mirrors now state leaf no-follow plus the named ancestor residual, and the
containment mirrors are registered in the checklist so this cannot recur silently. A
sweep confirms no unqualified whole-path claim survives anywhere in the document.

### A precedent that has now imported two defects

`listNames` (`src/core/private-fs.js:382-390`) swallows a `readdirSync` failure and
returns `[]`. Finding 3 arrives through the very idiom this spec cites as its walk
precedent — the **second** time citing `private-fs.js` has imported a defect, after the
half-carried `applyModeSecure` in round 3. The lesson already logged ("citing a
precedent is not carrying it") has a sibling worth naming: **a precedent can be worth
citing for its shape and still be wrong in a detail you are inheriting.** Both times the
defect was in what the precedent does on the FAILURE path.

### The loop is not done, and round 5 is required

Finding 3 is type (a) and changes what the implementer builds, so it is HEAVY by the
rule's own test. `docs/runbooks/codex-review.md`: *"HEAVY: fixes land, then a full fresh
external round"*, and *"the loop is DONE when a round finds nothing about the product."*
Round 4 found product defects. **Round 5 is required.**

**The tension with ruling 2 is real and is the owner's to resolve, not mine.** Ruling 2
wants 1a closed and 1b brought forward; the rule says 1a is not Ready until a round comes
back clean. I am not going to read the rule loosely to reach the ruled outcome faster —
that is the same move I declined when the advisor framed the round-4 obligation as
verification. But the owner should see the shape of what remains: **rounds 3 and 4
produced four (b) findings and one (a)**, the (a) is folded, and the surface is frozen.
If he judges the remaining risk acceptable and closes 1a on the current text, that is a
legitimate owner act on a named residual — it is simply not a call the rule lets me make.

## Round 5 dispositions — one folded, one PARKED, and Routed came back empty

**All four round-4 fixes verified FIXED**, including the mirror registration: the
reviewer swept every containment mirror and confirmed no unqualified whole-path claim
survives. Routed was explicitly empty for the fourth consecutive round.

| # | Finding | Class | Disposition |
|---|---|---|---|
| 2 | Invalid UTF-8 without a NUL is TEXT to git (`1\t0`), its raw diff retains `0xff`, and a `utf8` decode makes it U+FFFD — so a decoding helper can claim byte identity while having replaced bytes. The production helper already decodes as `utf8` (`validate.js:68-73`) | (b) | **FOLDED.** Table C gains a byte-preserving-output row and one non-NUL invalid-UTF-8 corpus member — an extension of an existing criterion, within the frozen surface |
| 1 | **Leaf no-follow is not enforceable on win32**, so the containment contract is platform-conditional and never said so. Measured: the real flag gives `ELOOP`, the zero-valued fallback reads the outside bytes | **(a)** | **PARKED — fourth containment-family finding, REPEAT-KIND fired** |

### The parked question — and the repo has already answered it once

`O_NOFOLLOW` does not exist on win32. Where it is absent the leaf-symlink refusal
degrades to the pre-open `lstat` alone, and a symlink swapped in after that check is
followed. This spec specified `O_NOFOLLOW` unconditionally and stated no platform
condition, while `CLAUDE.md` puts the package on plain Node ≥ 18 with no platform
restriction.

**`src/core/vault-snapshot.js:48-57` already ruled this exact question**, in terms
worth quoting because they are also the recommendation: *"NEITHER CONSTANT EXISTS
EVERYWHERE (win32 has no `O_NOFOLLOW`). The fallback is an explicit branch that NAMES
what is lost, deliberately not the `fs.constants.X || 0` idiom, which makes a missing
flag look like a present one: where `O_NOFOLLOW` is absent the leaf-symlink refusal is
the pre-open `lstat` alone, so a symlink swapped in after that check IS followed — a
named residual, not an accident."*

**Recommendation, NOT applied:** adopt that shape — an explicit platform branch naming
what is lost, never the `|| 0` idiom, with the Windows residual named beside the
ancestor one. It is not a new design; it is the one this repo already made for the
identical question. It is parked rather than folded because it makes a security
guarantee platform-conditional, which is the class parked twice before, and because it
is type (a) on the fourth containment-family finding — the exact condition REPEAT-KIND
names.

### A precedent that has now been wrong three times in the detail inherited

This spec cites `src/core/private-fs.js` as its walk precedent. It has been wrong in
the inherited detail **three times**: the half-carried `applyModeSecure` (round 3),
`listNames` swallowing `readdirSync` failures (round 4), and now the
`fs.constants.O_NOFOLLOW || 0` idiom at `:683` — which `vault-snapshot.js` explicitly
warns against, in this same repository. `manifest.js:746` uses it too.

**The repo is internally inconsistent on this, and citing one file three times picked
the wrong side each time.** The sibling lesson already logged — *a precedent can be
worth citing for its shape and still be wrong in a detail you inherit* — gains a
sharper form: **when a repository disagrees with itself, citing a precedent is choosing
a side, and the choice needs its own justification.** For no-follow specifically,
`vault-snapshot.js` is the file that has thought about it hardest.

### Where the loop stands

Five rounds, thirteen findings: **eleven type (b), two type (a)**. The reviewer was
told it could state plainly that no type (a) could be constructed; it constructed one,
so the honest reading is that the loop is not yet exhausted. Round 5's own fixes are
one (b) fold — LIGHT — so weighted closure does not itself demand round 6; but the
parked (a) is unresolved, and 1a cannot be Ready while a type (a) finding stands
undispositioned.

**Sent to the advisor before folding**, as undertaken, because it changes what 1b can
guarantee: the workspace's containment inherits the platform condition, the two
handed-over hypotheses become MORE load-bearing on Windows where the mechanism protects
less, and the charter should cite `vault-snapshot.js` rather than `private-fs.js` if it
needs a walk precedent.

## Round 5 amendment — my park report was over-stated, and the finding's CLASS changes

The advisor corrected my park report, I measured the correction, and the measurement
went further than either of us had it. **The correction matters because it changes the
finding's classification, and therefore what the owner is deciding.**

**What I reported:** on win32 the leaf case is open — external bytes enter.
**What the advisor corrected:** the two `|| 0` sites do not degrade silently; both NAME
realpath-canonical containment as the win32 bound (`src/core/private-fs.js:680-683`,
`src/core/manifest.js:743-746` — verified verbatim), and 1a already carries a realpath
verification, so the leaf falls back to the same racy check that covers the ancestor.
**What the measurement shows:** it does not even fall that far. With the flag forced to
0, the open follows the symlink — and the **`(dev, ino)` revalidation refuses it at
`fstat`, before any byte is read**, because a symlink to a different file has a
different identity. Measured: `openSucceeded: true`, `devInoMatchesEnumerated: false`,
refusal before the read; control on an untouched leaf matched and read correctly.

So what the missing flag actually costs is **WHEN the refusal happens** — `fstat` rather
than `open` — leaving the process briefly holding a descriptor on an out-of-tree object
it never reads. The residual that survives is inode reuse, which exists on every
platform.

**The consequence for the park.** The reviewer's finding is still true about the
MECHANISM: the spec named a flag that does not exist on win32 and stated no platform
condition. But it is **not** true that the attacker gains a capability, because a
different named element of the same contract refuses the substitution. **The
classification drops from (a) to (b)** — the guarantee's wording is wrong, not its
effect. That is a materially different decision: a (b) can close as a named residual,
which an (a) cannot.

**How I got it wrong, and it is the same family this arc has been logging.** The
reviewer measured the OPEN mechanism in isolation — flag present versus absent — and I
carried its conclusion into a park report without asking what the **full contract** does
with that open. The contract does not read at open; it fstats and revalidates first. A
true measurement of one element, cited for a conclusion about the whole. That is the
family, again, in my own park report — and this time it would have gone to the owner as
an (a), which is the second time this family has reached him.

The park still stands and still needs his ruling: the platform condition must be stated
rather than implied, and the recommendation is unchanged — adopt `vault-snapshot.js`'s
explicit-branch shape rather than the `|| 0` idiom. What changes is that he is ruling on
a wording defect with a named residual, not on an open capability.

**One claim of mine also needs withdrawing:** I wrote that "the repo disagrees with
itself" on no-follow. It disagrees in IDIOM — an explicit branch versus `|| 0` — but
both sites consciously name what carries the weight on win32. The idiom criticism stands
(a missing flag should not look like a present one); the "disagrees with itself" framing
was too strong, and the three-times-wrong-precedent lesson keeps its narrower form:
`private-fs.js` was wrong in the details inherited, not incoherent about the substance.

## Owner ruling on the platform question — folded; and the round-6 judgment

**RULING (2026-08-21): the recommendation, as proposed.** Adopt
`src/core/vault-snapshot.js:48-57`'s explicit-branch shape and STATE the platform
condition; the zero-fallback idiom is FORBIDDEN in this contract, because a missing
flag must not be indistinguishable from a present one. What must be named: on win32 the
open follows a swapped leaf symlink and the refusal moves from `open` to `fstat`, where
`(dev, ino)` refuses before any byte is read; no capability is gained; what is lost is
the refusal's TIMING plus a briefly-held descriptor on an out-of-tree object that is
never read; the surviving residual is inode reuse, which exists everywhere.

The owner's grounds, recorded because they generalise: refusing to run on win32 is not
available (the product ships a Windows installer and scheduler under their own ADRs),
and the status quo — **implying the flag is universal — IS the defect**. A named
weakness beats a silent one.

**The fourth containment-family finding therefore CLOSES as a named (b) residual — and
it could only close that way because it is (b).** An (a) could not have. That is the
practical payoff of the classification discipline, and of the re-measurement that
downgraded it: had the park gone up as reported, this would still be open.

Folded across every registered containment mirror: the canonical row now carries the
owner-ruled platform contract, the security checklist names BOTH residuals, the
checklist registration forbids any surface from implying the flag is universal, and the
successor handoff requires the exposure to be measured PER PLATFORM. A sweep confirms no
surface still implies universal availability.

### Does weighted closure require a round 6? YES — my judgment, by the rule

Round 5 produced two folds. Their weights differ and only one matters:

- The UTF-8 byte-preservation fold is **LIGHT**: it extends Table C's corpus and requires
  the reference output to be compared as bytes. That is the spec's own verification
  machinery, which the rule names as LIGHT explicitly.
- **The platform fold is HEAVY.** The rule's test is whether the fix changes what the
  implementer builds in the product. Before it, an implementer reading "opened with
  `O_NOFOLLOW`" would write `fs.constants.O_NOFOLLOW` and, on win32, either crash or
  reach for the zero fallback. After it they must write an explicit platform branch.
  That is different `src/` code.

**HEAVY fixes land, then a full fresh external round.** And the loop is DONE only when a
round finds nothing about the product; round 5 found things. Neither clause offers an
exit, so **round 6 is required**.

Two honest notes for the owner alongside that verdict. First, the defect supply IS
shrinking as the convergence rule predicts — four findings in round 3, three in round 4,
two in round 5 — so round 6 is expected to be small, not another treadmill turn.
Second, round 6 would review text whose SUBSTANCE the owner just ruled; that does not
make it vacuous, because a reviewer can still find the FOLD wrong — a mirror missed, the
ruling implemented incorrectly, a contradiction introduced — and this loop has caught
exactly that twice.

**If the owner judges the remaining risk not worth one more round and closes 1a on the
current text, that is a legitimate owner act on a named residual.** It is simply not a
call the rule lets me make, and I have declined to read the rule loosely twice already.

## Round 6 — the platform ruling is NOT FIXED, and the fault is mine

**Nothing was folded.** This is the fifth containment-family finding, so REPEAT-KIND
makes it a design question; and it invalidates an owner ruling made on a basis I
supplied, so it goes back to him rather than into the text.

**The finding.** On the no-`O_NOFOLLOW` branch, an attacker moves the CLASSIFIED LEAF
ITSELF outside the root and puts a symlink at its old path. The opened object is then
the same inode that was classified, so `(dev, ino)` matches. Reproduced independently:
`openSucceeded: true`, `isRegularFile: true`, `devInoMatchesEnumerated: true`,
`realpathNowResolvesInsideRoot: false`, bytes read from outside the root. **Every check
the contract specifies passes.** No inode reuse. The only thing catching it is the
realpath check, which this spec itself calls racy and explicitly not a guarantee — and
the reviewer raced both orderings.

**My round-5 measurement was wrong, and the way it was wrong is the point.** I replaced
the leaf with a symlink to a DIFFERENT file while testing the NO-FLAG branch — two facts
moved at once — and concluded that `(dev, ino)` always refuses, hence "no capability is
gained on win32". That evidence reaches only different-inode substitution. *If my
conclusion were false, would that measurement have shown it?* No. It could not have.

**The classification reverts (b) → (a), and that reverses my own argument.** I made the
case that the downgrade mattered precisely because a (b) can close as a named residual
and an (a) cannot. On the corrected classification the fourth containment finding did
NOT legitimately close, and the platform ruling rests on a false premise. Sent to the
advisor immediately, before writing any of this, with a request to put it in front of
the owner before anything else moves.

**Surfaces now known false**, several of which I wrote: the "no capability is gained"
sentence in the security checklist, the unconditional leaf-no-follow phrasing at the
symlink and containment rows, `(dev, ino)` refusing before any read, and the
classify/read-gap acceptance contract. They are left standing deliberately — correcting
them would pre-empt the design decision that is now the owner's.

**The choice, as the reviewer frames it and I agree:** accept and name the win32
same-inode leaf-relocation residual, stripping every "no capability gained" and
unconditional leaf-no-follow claim from all registered mirrors; or bind traversal to
verified directory descriptors via per-component `openat`, which needs native support
and collides with the zero-dependency rule. The product behaviour to be guarded is
stated exactly: **a classified leaf relocated outside the root must not contribute bytes
under the original internal path.**

### Two things this round settles about the loop itself

**Seventh instance of the family, and the worst.** The first six cost rounds, an
advisor's audit, and the owner's review attention. This one cost an owner RULING made on
a false premise. The escalation is monotonic and it is worth stating plainly: the family
does not decay as we get better at the subject matter.

**And the newly landed rule did work — with a caveat I insist on keeping attached.** I
argued before this round that a clean round 6 must not be read as "the rule works". This
round is not clean: the rule was cited BY NAME to diagnose a real defect in a real
measurement, in its first round in force, and the diagnosis is correct. That is a
stronger data point than anything we had. But the reviewer was TOLD about the rule in my
dispatch, so it is salience-assisted rather than a cold catch — the first honest test
remains a fresh solo session with the runbook and neither salience nor a peer. Evidence
with the qualification attached; never vindication.

### Correction to the corroboration record — the ruling had ONE measurement, not two

The advisor reproduced the refutation and confirms it. In doing so they disclosed
something that corrects what the owner was told when he made the platform ruling.

Round 5's downgrade went up as **independently re-measured**. It was not. The advisor
ran the SAME SHAPE I did — a symlink to a *different* file — so their check inherited my
measurement's blind spot and could only ever have produced my answer. **An independent
check that reproduces the original's design is replication, not verification.**

So the ruling rested on **one measurement run twice**, presented as two confirmations.
That is a factual correction to what the owner believes he has, and it matters more than
either of our individual errors: two agreeing sessions is exactly the signal a decision
is supposed to be able to lean on.

**The operational form, which is sharper than the family's general shape:** when
re-measuring someone else's claim, the question is not *did I get the same answer* but
**could my test have produced a different one?** If the answer is no, the check adds
confidence without adding evidence — which is worse than not running it, because the
confidence is real and the evidence is not.

That is instance eight of the evidence-reach family, and the second in this arc where a
correctly-executed check said nothing about the conclusion drawn from it. It differs
from the others in who it deceived: not the person who ran it, but the person who read
"independently confirmed" and reasonably relied on it.

**Catch-mode note.** Six of the eight instances were caught by a round, salience or a
peer cross-check. This one was caught by **the round**, which is the first time the loop
itself found a defect in a measurement that had already passed peer cross-check. Fourth
distinct catch-mode datum for the owner's file, and the only one so far that survived a
peer check before being caught.
