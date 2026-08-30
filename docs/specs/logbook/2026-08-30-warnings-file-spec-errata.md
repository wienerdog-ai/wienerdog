---
title: Spec errata — WP-quarantine-warnings-file after PR #34
date: 2026-08-30
related_wps: [WP-quarantine-warnings-file, WP-dream-promote-in-workspace]
---

# Spec errata — WP-quarantine-warnings-file after PR #34

Five items, all raised by the two PR review gates on the merged
implementation PR #34 (`docs/runbooks/codex-review.md`). Text-only pass on
`docs/specs/WP-quarantine-warnings-file.md`; `src/` was not touched. The spec
stays in `docs/specs/` — the move to `done/` is a separate PR.

## One root cause behind items 1-3, and a fourth surface the rule reached

**The fact.** Refresh point 1 writes the warnings file at `src/cli/dream.js:471`
(merged tree; inside `:443-447` in the spec's own pre-implementation numbering),
which is BEFORE `precommitSessionEdits` at `:540` (`:507` pre-implementation).
That sweep commits every dirty working-tree path with `git add -A` ahead of the
brain, so on a normal run those bytes are already in `HEAD` by the time the EP2
staged-output secret gate scans `git diff --cached`. **The gate never sees them.**
Refresh points 2 and 3 write after the precommit or on a run that never reaches
it, so they are not in a `validateAndCommit` changed set either.

Verified by execution, not by tracing — a probe reproducing the real
`precommitSessionEdits` → `validateAndCommit` sequence against a temp git vault:

```text
dirty before precommit: "?? reports/"
precommit committed: true  msg: vault: session edits before dream
files in that commit: [ 'reports/warnings.md' ]
validateAndCommit counts: {"notes":1,"skills":0}
files in dream commit: [ '03-Resources/n.md', 'reports/dreams/2026-08-30.md' ]
=> warnings.md reached the EP2/step-2 changed set? false
```

**Four surfaces had each guessed the ordering independently, and all four were
wrong.** The review named three; the fourth follows from the same rule.

| surface | what it said | disposition |
|---|---|---|
| the EP2 residual, Implementation notes | a point-1 write "is staged before Step 3's secret gate and is scanned like any other change" | restated: the bytes reach vault history UNSCANNED. The harm runs the opposite way from what the residual reasoned about — it worried about the gate redacting Wienerdog's own file (bounded, self-healing); the reality is unscanned bytes in the user's history |
| Security checklist, residual list | asserted the same EP2 coverage | restated to the same fact, same bound, same discharge event |
| Table D, "The problem" | "a run that changes it reports one extra note" | false on the intended path. Restated: the exclusion is NOT dead code — reachable on the brain-writes-it path (a write landing in the brain window IS in the changed set) and required forward by `WP-dream-promote-in-workspace` row G11 |
| Table D, "Not changed" | "still classified by Step 2's branch (c) … and still scanned by the EP2 gate" | the fourth surface, not in the review's list. Qualified: true whenever the file IS in a changed set; on the code-owned path it is in none |

**The remedy is ADR-0031's, not four independent fixes.** One fact, four prose
surfaces, no canonical owner — textbook mirror drift. Table B already owns
call-site placement, so the ordering fact got a row there, every mirror now
defers to it by citation, and the Mirrored Surface Checklist registers the set.
A fifth restatement is now a finding rather than a fix.

**The bound on the residual is structural.** `displayName` whitelists
`[A-Za-z0-9._-]`, so no `:`, `=`, `/` or whitespace can appear — no
assignment-, URL- or header-shaped token can be forged into the file by a
filename. The same sanitized basename already reaches the injected digest and
the dream console lines: one more place for the same bytes, no new class of
byte. Discharge is `WP-dream-promote-in-workspace`'s row G8, the same event that
discharges the pre-promotion-window integrity residual.

**Not re-proposed.** The transitional canonical re-stage guard was rejected by
the owner as throwaway machinery (`2026-08-29-quarantine-split-round-4-raw.md:44`,
recorded in the spec at the pre-promotion-window residual). These were text fixes.

## Item 4 — a tie-break justified by a false sentence

Table A's sort row said tied `displayName`s "render identical text, so the bytes
are deterministic either way". False for the `over-ceiling` group, which renders
a size suffix. Executed:

```text
keys {p1/huge.jsonl(52428800), p2/huge.jsonl(51404120)} → "50.0 MB" then "49.0 MB"
same two records, keys in the other order                → "49.0 MB" then "50.0 MB"
```

So `composeWarnings` is a pure function of the ledger **object**, not of the
record set. Latent only: `writeLedger` (`ledger.js:102-115`) serializes
`ledger.files` in key-insertion order and `withRecord` (`:246-248`) re-spreads an
existing key in place, so a tied pair's order is fixed at first insertion and
never moves within an install. No churn is reachable today.

The row now states the real reason the unspecified tie-break is affordable — and
names it as a property of the CALLERS, not of the render. The one-line total sort
(a secondary tie-break on the ledger key, unique by construction, at
`src/core/dream/warnings.js:142`) is recorded as a deliberate non-deliverable so
it is not rediscovered as a bug; it is a code change and was out of scope here.

## Item 5 — the spec contradicted itself, and the ruling is neither branch offered

**The collision.** The rendered document's fixed header ends `Do not edit it —
it is rewritten whenever the list below changes.` Those bytes are pinned by Table
A's two worked examples and by a byte-exact template gate, and the implementer
was right to render them. The Mirrored Surface Checklist said in bold: **"No
surface may say the file is rewritten 'when the SET changes'"**.

**The ruling: neither (a) nor (b). The sentence is not an instance of the
forbidden wording, and the checklist is what moves.**

The prohibition exists because a MEMBERSHIP formulation is false — a same-key
reason or size change rewrites the file with the quarantine set unmoved. But
**"the list below" denotes the rendered block, not the key set**, and the
rendered block IS Table C's operand. So the sentence is true in both directions:
every rewrite changes what is printed below, and every change to what is printed
below causes a rewrite. There is no rewrite case a reader could point at where
the list below did not change — the only other content is the fixed header.

**Why the review read it as a violation is itself the defect.** The rendered
document's own trigger sentence was never registered as a mirror of Table C. An
unregistered mirror cannot be checked against the canonical table, so the clash
stayed invisible until code shipped and a reviewer put the two texts side by
side.

**Value line.** (c) costs one checklist edit and one Table A row. It ships no
user-facing inaccuracy, and it strictly increases the prohibition's precision —
a rule that forbids a formulation is enforceable, a rule that forbids a word
catches compliant prose and trains readers to ignore it. **(b) — changing the
sentence — is a contract change with a code arm** (`HEADER_PARAGRAPH`, both
worked examples, the template gate, the tests) and one cost that decides it:
these bytes are part of the render, so under Table C row 1 **every install that
already holds the file rewrites it on its next dream run**, producing a vault
commit whose entire diff is this sentence. That is a real mark in the user's own
history, bought for a wording that is already true. **(a) — keeping the bytes and
conceding the product ships something mildly inaccurate — concedes an inaccuracy
that does not exist.**

**What was kept from (b).** The suggested successor wording, `it is rewritten
whenever what it shows changes`, is nearer the mechanism and no less plain. It is
recorded in Table A's ruling row as the wording to adopt **if the paragraph is
ever reopened for an independent reason** — so the analysis is not redone, and so
the churn is paid once, alongside a change that earns it.

## Lessons

- **A rendered product string is a mirror.** The checklist registered specs,
  prose and contracts, and left out the bytes the code actually prints. Anything
  that states a contract to a user is a surface ADR-0031 governs.
- **Forbid the formulation, not the word.** "No surface may say X" needs X to be
  the false claim, not a token that appears in it — otherwise the rule fires on
  compliant text and the next reader stops trusting it.
- **A "textbook mirror drift" finding should be answered by extraction and then
  swept.** Fixing the three named surfaces would have left the fourth standing.
