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
