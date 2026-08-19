---
date: 2026-08-19
title: "WP-validator-decided-bytes review rounds — the record, with the stop criterion pinned before round 1"
related_wps: [WP-validator-decided-bytes]
---

# WP-validator-decided-bytes review rounds (2026-08-19)

Each round's raw final output is committed alongside this entry, one file per
round, and each row below cites that file's path AND the SHA of the commit
that introduced it — the rule at `docs/runbooks/codex-review.md` ("Rules"). A
round row without that SHA is a round where the raw-commit rule did not run.

## The stop criterion — pinned BEFORE the first adversarial round

Written at `9152588` (the spec's drafting commit), before any round ran. The
predecessor package spent eleven rounds and its own record names the cause:
the loop's fuel was an undefined finish line, and what eventually moved it was
narrowing the claim, not a better mechanism. So the finish line and the
fallback are both named here, in advance.

**CLOSE** — the loop is done when a round returns **no HEAVY finding**: nothing
that changes what the implementer builds in `src/core/dream/validate.js`,
nothing that changes Tables A, B or C, and nothing a user or a consuming model
observes. LIGHT findings at that point are fixed inside the existing surface or
accepted as named residuals; they do not extend the loop.

**ESCALATE — same-family repeat.** Two consecutive rounds landing findings on
the same contract family (Table A, B or C) stop the finding-by-finding fixing
and trigger an ADR-0031 contract-extraction pass on that family instead.

**ESCALATE — round 3.** If rounds 1, 2 and 3 each land a HEAVY finding, the
next step is the design question, not a fourth patch. **The fallback is
pre-committed rather than invented under pressure: drop Table B's
"appeared after the change scan" limb (reason R3) and ship C1 + C2 + the
changed-after-decision limb only.** That is the smaller package that still
closes the charter's named defect; the dropped limb becomes a named residual
with the measurement that justified it.

**HARD CAP — four external rounds.** Beyond four, the decision is the owner's
ruling, not another round.

**SURFACE FREEZE.** Verification machinery may grow only to guard a product
behavior, and only in the smallest form that guards it. A finding about the
machinery itself is fixed within the existing surface or accepted as a named
residual — it never justifies more machinery.

## The rounds

| # | Round | Backend | Result | Findings | Raw file | Raw commit |
|---|---|---|---|---|---|---|
| 0a | Template conformance | internal, clean context (spec + template only) | PASS | 0 blocking, 5 non-blocking | `2026-08-19-…-r0-template-conformance-raw.md` | `b9b9c26` |
| 0b | Internal coherence | internal, **fresh** context (not the drafting one) | 4 FINDINGS | 4 fixed, all LIGHT | `2026-08-19-…-r0-internal-coherence-raw.md` | `b9b9c26` |
| 1 | Adversarial design review | gptsol | NEEDS-ATTENTION | 7 (6 DESIGN-LEVEL/HEAVY, 1 MECHANICAL/LIGHT) | `2026-08-19-…-round-1-raw.md` | `ced70d4` |
| 2 | Adversarial design review — **the fallback round** | gptsol | NEEDS-ATTENTION | 5 (4 DESIGN-LEVEL/HEAVY, 1 MECHANICAL/LIGHT); 5 of round 1's 10 dispositions NOT-FIXED | `2026-08-19-…-round-2-raw.md` | `dabe91d` |
| 3 | Adversarial design review of the SPLIT package | gptsol | NEEDS-ATTENTION | 3 (2 DESIGN-LEVEL/HEAVY, 1 MECHANICAL/LIGHT); 5 of round 2's 6 dispositions VERIFIED-DISPOSED | `2026-08-19-…-round-3-raw.md` | `c575605` |
| 4 | Adversarial design review — **the closing round** | gptsol | NEEDS-ATTENTION | 2, **both LIGHT**; nothing about the product | `2026-08-19-…-round-4-raw.md` | `a00f0dd` |

Round 0a's five non-blocking observations: NB-1 (the template's
authoring-rules bullet is absent) and NB-3 (the H1 restates rather than copies
`title`) are **drop** — measured against the corpus, 3 of 211 done specs carry
that bullet and the runbook's own named worked example
(`WP-daily-summary-per-line-framing`) carries neither. NB-2, NB-4 and NB-5 are
informational and assert conformance rather than divergence. Nothing from 0a
changed a byte of the spec.

Round 0b's four findings are dispositioned in `29bb661`, each spot-checked
against the files first. All four are LIGHT — spec wording, no change to what
the implementer builds — so under weighted closure they owe no fresh external
round.

**The raw-commit ordering held for both**, including 0b: `b9b9c26` contains
the raw output and a byte-unchanged spec, and the fixes land two commits later
in `29bb661`. `f3d5ccd` sits between them and touches only the raw files'
headers — markdownlint was red on `b9b9c26` and the fix was to disable the
linter below the verbatim separator rather than edit a reviewer's byte. That
commit's message records the process slip that let a red gate through.

## Round 1's adjudication, and the criterion re-pinned for round 2

Round 1's seven findings are ruled on in
`2026-08-19-validator-decided-bytes-round-1-architect-ruling.md`. **The ruling
is the architect's, not the relay's** — and it exists because the owner asked
whether the architect had seen it, and the answer was no. One session had
drafted the spec, relayed the gate, and then proposed its own design
resolution: the exact conflict the runbook's role separation prevents. The
relay's measurements went to the architect as claims to RE-RUN, with its probe
scripts handed over so the instrument could be audited too. One of the seven
came back **failed as stated** — a claim the relay had run partially and
generalized fully — and the error worked against the relay's own proposal.

The ruling's finding: **the seven findings are one defect seen six times, and
it is C3's quantifier.** C3 quantified over the commit; the package's authority
is the paths its own decision accepted. C3 narrows to C3′, the abort and the
re-decision and R3 are deleted, three universals become three named residuals,
and both reviewer-recommended deliverable additions are refused. Neither of the
two mechanisms the relay put to the owner is taken: the id divergence is
executed-proven pre-existing and fail-closed, so CLAUDE.md's rule applies — it
is noted, not fixed — and a successor charter carries (A), (D) and a third
option, (E), that the relay's binary framing had hidden.

**Owner ruling, 2026-08-19: all three acceptances granted** — the Q1
narrowing, the re-pinned fallback below, and the id divergence disposed as a
noted defect plus a charter.

### The criterion, re-pinned before round 2

The runbook requires the stop criterion to be re-stated whenever a HEAVY fix
triggers a fresh round. **Round 1 falsified the original fallback's premise.**
It was aimed at R3 — one finding — while the actual failure was the quantifier,
which is six. The revision goes further than the fallback, which is the
direction the fallback pointed.

Everything else in the criterion above stands unchanged. The fallback is
replaced by: **if round 2 lands a HEAVY finding on C3′, split — ship C1 + C2 as
this WP and charter C3′ separately.**

## Round 2 — the fallback fired

Four HEAVY findings landed on C3′. That is exactly the condition the fallback
was re-pinned for **before this round ran**, so it fires without a new
judgement call: **split — C1 + C2 ship as this WP, C3′ is chartered out.**

**What round 2 actually measured, and it is worse than "C3′ needs work".**
The narrowing did not close the ordering hole; it moved the hole outside the
contract. A malformed `SKILL.md` created during Step 4 was committed with
`reverted: []`, because Step 2 never saw it and C3′ no longer says anything
about it.

**Two holes the fallback did not anticipate, because they hit C1 and C2 rather
than C3′.** Both executed by the reviewer, both reproduced independently by the
relay:

- **C2's "decide once" was never true.** There are three separate reads of a
  current Tier-3 file — `validate.js:190` (the floor), `:321` (the revision
  guard), `:506` (the ledger's parent-skill check) — and C2 removes only the
  fourth, at `:1170`. Measured: a tracked skill swapped between the revision
  guard and the floor commits an `id` of `bar` while the ownership registry
  still holds `foo`, `reverted: []`. The immutable-field, raise-only and
  authorization checks are bypassable. **This is an authorization gap, not a
  durability one.**
- **C1's containment claim is false as written.** C1 does what it says at its
  five decision sites, but the Security checklist's broader sentence does not
  survive: the redact arm rewrites frontmatter *after every decision has run*.
  Measured — redacting a high-entropy frontmatter KEY turns a well-formed block
  malformed (`false` → `true`); redacting a floor VALUE yields
  `confidence: [REDACTED:high-entropy]`, which `Number()` makes `NaN`. Both
  commit today.

So the split is not a deletion. **The claims that remain must be narrowed to
what they were measured to do**, with the difference disclosed as named
residuals.

**Owner ruling, 2026-08-19:** proceed with the split; the charter's main
content is those two holes rather than a restatement of C3′; and option **(E)**
— route Tier-3 redact-severity findings to the withhold arm instead of
scrubbing in place — is its first candidate. (E) is the one branch that would
close the redact-arm hole and the id divergence together.

## Round 3 — the design question, and the third narrowing

The split held: five of six round-2 dispositions came back VERIFIED-DISPOSED
and the reviewer calls C1 coherent. Two HEAVY findings remained, so **the
round-3 escalation trigger fired** — the criterion pinned before round 1 said
that three consecutive HEAVY rounds go to the design question, not a fourth
patch. It went to the architect, whose ruling is
`2026-08-19-validator-decided-bytes-round-3-architect-ruling.md`.

**Ruling: C2 does not ship. The package is pure C1.** The deciding measurement
was not the relay's. The relay argued "C2 drew findings in two rounds and what
it buys was measured fail-closed"; the architect measured the windows and found
that **C2 closes the only window in the pipeline containing no scheduling
point** (`:190`→`:1170`: zero subprocess call sites) while leaving open both
that span subprocess execution. That converts "arguably not worth it" into
"measurably not worth it". C2 also removes a guard — the `:1170` read's ENOENT
fail-stop — that three consecutive reviews had failed to inventory.

**On the charter's redaction boundary: two false universals in two rounds.**
First "decimal only, cannot" (architect, broken by the relay with a hex
literal), then "hex only" (architect, broken by the reviewer with `E+`). The
remedy is deletion rather than a third boundary, because exhaustiveness by
syntax class is impossible in principle — redaction is a predicate on the
literal's characters, `Number()` acceptance on its syntax, and the two are
independent. The proof is one measured pair, same syntax class, opposite
outcome:

```text
10293847561029384756E+12   3.522 bits/char   REDACTED
102938475610293847561E12   3.387 bits/char   clean
```

**Owner ruling, 2026-08-19:** accepted in full. Separately: the `id` stays, the
title is corrected to the actual scope, and one line records that the `id` is
historical.

### Convergence

| | Contract | Verification steps |
|---|---|---|
| Round 1 | C1 + C2 + C3 | 4 |
| Round 2 (split) | C1 + C2 | 3 |
| Round 3 (this ruling) | **C1** | **2** |

Three narrowings, three rounds — the predecessor's record said narrowing is
what moves these loops, and it is the only thing that has moved this one.

### Round 4's criterion — pinned before the round

Round 4 is the last under the hard cap. **It reviews C1's coherence and the
charter's accuracy only.** A HEAVY finding on C1 goes to the owner as a ruling,
not to a round 5. A finding on the charter is LIGHT by construction — the
charter is evidence for a future package, not a contract this implementer
builds — and is fixed inside the existing surface or accepted as a named
residual.

## Round 4 — the loop closes

**The reviewer validated C1**: *"C1's placement is coherent and the five
guarded parse inputs cover the validator's security-bearing frontmatter
decisions."* **Nothing was found about the product.** Two findings remained,
both about the spec's own evidence, both fixed in `f156dec`.

**AC2 had been vacuous for four rounds.** It asked for a floor-passing revision
omitting `derived_from_untrusted`, which the floor requires present and exactly
`false` — so a literal test was reverted for missing provenance regardless of
the guard, and would have stayed green on the empty-record design AC2 exists to
forbid. The wording came from the predecessor's round-8 finding, was carried
into the first draft here, and was re-read in every revision pass without once
being run. The architect fixed it by building **both designs as runnable
mutants** and executing the real `validateAndCommit` against each:

```text
FIXTURE A (as written)  forbidden: reverted   C1: reverted            -> vacuous
FIXTURE B (corrected)   forbidden: COMMITTED  C1: reverted with R1
```

AC2 is now a discrimination criterion carrying the prohibition *"Do not weaken
this to 'the revision is reverted'"*.

**The charter's boundary paragraph took three drafts and overstated in all
three** — "decimal only", then "hexadecimal only", then an anti-universal
claiming no class can be characterized at all. It is now a proof table: a class
*can* be characterized when it carries a character-level bound, with
distinct-symbol counts measured rather than assumed. All three failures stay in
the record, because the pattern is the lesson.

**Classification.** Both findings are **LIGHT with high severity**. The
runbook's definition decides it: a finding about the spec's own verification
machinery is LIGHT. Neither fix moves a `src/` byte, Table A, Table C or a
reason string. The reviewer marked AC2 HEAVY, but the relay's brief had said
"when in doubt, HEAVY" and the same brief had *forbidden* folding severity into
weight for charter findings — applying that distinction only where it was
convenient would have been the actual error. The architect concurred and
attached the condition that matters: **closure is earned by the mechanical
verification, not by the label**, which is why it executed the discrimination
rather than asserting it.

**Owner ruling, 2026-08-19: the design loop is CLOSED. Status moves to
`Ready`.**

### Convergence, four rounds

| | Contract | Verification steps |
|---|---|---|
| Round 1 | C1 + C2 + C3 | 4 |
| Round 2 (split) | C1 + C2 | 3 |
| Round 3 (C2 dropped) | **C1** | 2 |
| Round 4 (closing) | C1 | 2 — the freeze held |

Three narrowings in four rounds. The predecessor's record said narrowing is
what moves these loops, and it is the only thing that moved this one: no round
was closed by a better mechanism.

### What this loop cost, and what it caught

Findings per round: 4 (round 0), 7, 5, 3, 2. **Four false universals were
written and caught** — three in the charter's boundary paragraph and one in the
relay's `iff`-on-length claim — and every one of them was written by an actor
reasoning from a property instead of enumerating the alphabet. Each was caught
by the *next* reader running it. That is the gate working as designed, and it
is the single most repeated failure of the package.

## Session-shape disclosure

One session drafted the spec and relays the gate. The runbook's separation
(findings are fixed by wd-architect, relayed by the orchestrator) is therefore
not physically enforced here, and this line is the disclosure rather than a
claim that it was.

**Round 0b runs in a fresh, clean context** — not inline during drafting. The
predecessor's record flagged the same defect three packages running: the
internal coherence pass had always executed in the context that then fixed its
findings, so its raw output could never be committed before adjudication. A
pass that runs in a different context from the one that fixes is the only
shape that satisfies the rule, and that is the shape used here.
