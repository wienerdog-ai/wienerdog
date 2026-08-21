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
