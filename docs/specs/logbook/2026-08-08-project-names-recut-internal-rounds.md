---
date: 2026-08-08
title: Project-name sanitizer re-cut — round zero and two internal passes
related_wps: [WP-sanitize-project-display-names]
---

# Project-name sanitizer re-cut — round zero and two internal passes (2026-08-08)

**The spec was re-cut onto the reset `main` as a fresh file with no history**
(the twelve review-round commits stay on `wp/sanitize-project-display-names-pre-reset`,
because parts of that history are misleading — claims later corrected, directions
later withdrawn). This record covers what ran against the re-cut file before any
external round, and carries the dispositions the owner ruled, including the drops
that deliberately never reach the artifact.

## Round zero — template conformance

Run per the codex-review runbook: a throwaway executor in a clean context, given
exactly two inputs — the spec and `docs/specs/_TEMPLATE.md` — and told this is a
presence read, not a design critique. No external reviewer was used.

**Result: CLEAR.** All thirteen template sections present; no section needed an
`N/A —` marker. Two spec-only sections identified, both ruled to stay as additive
sections: `Mutation rows` and `Coverage`.

## The two internal passes

Two fresh contexts, neither of which took part in writing the file.

- **Fidelity** — old tip versus re-cut file: did anything of substance get lost,
  weakened or silently altered? Eight findings.
- **Coherence** — the finished file alone: do internal references resolve, do
  stated counts match real counts, do any two statements contradict each other?
  Fourteen findings.

After deduplication and after removing what the owner's own re-cut ruling had
already decided (the `status: Ready → Draft` flip and the deletion of the fork-era
`Size self-gates` section), seventeen findings went to disposition.

**Fifteen were ruled `fix` and are applied in the commit this record accompanies.**
Five of them were damage the restructure itself introduced; nine were pre-existing
defects that had survived eleven external rounds and an owner sign-off on the old
tip; one was a frontmatter completeness question.

The most consequential of the pre-existing nine: `G1`'s envelope accepted
`# pass ≥ 16` while the Deliverables table demands *exactly* the sixteen tests and
the **Not relaxed** line claims no envelope widens. Seventeen tests passed that
gate. It is now pinned to `16` with both directions red. The pin was measured
before it was written — `node --test` over a single file reports one `pass` per
top-level `test()` and adds no entry for the file itself — because a count pinned
by inference is how a gate becomes unpassable on a correct tree.

## The two drops, and why they are recorded here rather than in the spec

Per the runbook, a drop is noted in the round record and never in the artifact.

- **Promote `### Exact contracts` to `##`, and move the RES-1/2/3 blocks out from
  under Deliverables.** Dropped. `### Exact contracts` is a *subsection of
  Deliverables in the upstream template*; promoting it would break the conformance
  round zero had just certified. The observation about the residual blocks sitting
  under a heading that reads "permission boundary — touch ONLY these" is fair, but
  moving them is a restructure outside the ruling that authorised this re-cut.
- **Reorder the mutation table's last four rows** (they run `M10, M9, M8, M7`
  while the Definition of done lists them ascending). Dropped as style. The row
  set is complete, the union of the reddens cells still covers every one of
  T1–T16, and every reddens ∪ stays-green pair still sums to sixteen.

## One finding raised during execution and deliberately NOT applied

The `G1` envelope names its counters with a `#` prefix (`# fail 0`, `# pass`).
Measured on this tree, Node's default reporter prints `ℹ tests 7 / ℹ pass 7`; the
`#` form belongs to the TAP reporter. So the envelope, read literally, names a
prefix the documented command does not print. This is a pre-existing defect and it
was **not** in the ruled batch of fifteen, so it was not folded in silently — even
though the fix would have landed in a cell that was being edited anyway. It goes to
the external confirming round as a finding.

## Process note

Nine of the fifteen fixes were defects that eleven external rounds did not find,
and one of them was a live false-green vector. That says something about what the
external loop looks at rather than about this spec. The owner has queued the
proposal — make the internal coherence pass standing, at the same level as round
zero — as **Q13: candidate, not yet a rule.** The framing package's re-cut supplies
the second measurement; a measured recurrence is what would raise it to a rule.

## External confirming round — findings and dispositions

Run with the plugin's own companion runtime, invoked programmatically as a plain
command: `codex-companion.mjs adversarial-review --wait --cwd <worktree>
--base main <focus>`. Not the human-only slash command, not the raw engine. The
call succeeded on its first attempt; nothing in the mechanics needed working
around. Raw stdout is preserved verbatim beside this file, committed before any
finding was adjudicated.

Verdict: needs-attention, three findings, all ruled **fix**. Every one of the
three was re-measured locally before disposition, not taken on the reviewer's
word.

- **R1 (high) — `G1`'s envelope was false-red and false-green at once.** False
  red: it named the counters with a `#` prefix, while the documented command
  prints `ℹ` under the default reporter, so a correct run failed the literal
  envelope. False green, and this one was new: sixteen passing cases plus a
  **failing** seventeenth marked `{todo: true}` reports `tests 17, pass 16,
  fail 0, skipped 0, cancelled 0, todo 1` and exits `0` — measured — which
  satisfied every condition the envelope listed while refuting the sentence
  beside it. Ruled: the prefix leaves the envelope (the numbers are the
  envelope, never the notation), and `tests` and `todo` join `pass` as pinned
  counters. That closes the over-count side from both directions.
- **R2 (high) — the `G2` red-run obligation contradicted its own constraint.**
  `G2` hashes one file at a fixed path and the current bytes already equal the
  pin, so a red side requires different bytes — while the Definition of done, as
  written in the previous commit, forbade any run that *writes* that path. Ruled
  option (i): the constraint narrows to "may not leave the tracked file in a
  modified state", which permits a temporary tip-observe-restore. The method
  stays the implementer's, so the spec still grows no methodology, and Q11's
  two-sided observation survives intact.
- **R3 (medium) — the Security checklist claimed more than row A9 decides.** It
  said the WP closes "structural forgery"; A9 decides line and section forging
  only, and RES-2 deliberately keeps one construct alive inside the bullet.
  Ruled: the claim narrows to what A9 gates, with the RES-2 residual named
  rather than implied.

Two of the three were defects the re-cut itself introduced, and the third — the
counter prefix — was the one flagged in this record and deliberately routed to
the external round instead of being folded in silently. The round found nothing
new in the content that had passed the old tip's eleven rounds; the nine
pre-existing defects had already been taken by the internal coherence pass.

## Closing round — findings and dispositions

Same mechanics, same preservation discipline: raw stdout committed before any
finding was adjudicated. The round returned **needs-attention, two findings**, so
the ruled closure criterion — a fresh round with zero findings — was NOT met and
the spec did not go to Ready on it. Both findings were re-measured locally before
disposition.

- **F1 (high) — the constraint on the golden said two different things in two
  places.** The confirming round's fix rewrote the Definition of done's copy and
  left the Verification steps copy at the older, stricter "no mutation may
  **write**". A reader taking the stricter one still cannot produce `G2`'s red
  side. This is an update-all-mirrors failure in a spec that carries that exact
  obligation — one mirror was updated, the other was not. Ruled fix: the
  Verification steps sentence now carries the Definition of done's wording.
- **F2 (medium) — row A9's line-count guarantee is false on a reachable path.**
  `renderDigest` ends in `capDigest` (120 lines / 32 KiB) and identity notes are
  assembled before the project section, so a large approved note pushes the block
  past the cap. Measured, with `K = 20` project directories and one approved
  identity note: at 100 note lines the shipped digest carries the heading and 17
  project lines; at 110, seven; at 150 the section is gone entirely. Two things
  the reviewer did not say and the measurement adds: in each of those renders row
  A11's boundary does not exist, so a fixture reaching that state would throw
  rather than pass vacuously — the falsehood is in the spec's claim, not in the
  gate — and no fixture reaches it, because identity injection needs a
  hash-matched approval the tests do not supply. Ruled fix, minimal: A9 gains a
  `capDigest`-survival condition in the same form as the EP4 condition it already
  carried; A10 inherits it explicitly and the Security checklist restates both.
  **No test is written for the truncated case** — `capDigest` is out of scope for
  this WP and stays so.

## Circuit breaker, and where the design question went

The runbook's breaker applies when two consecutive rounds land findings of the
same kind. It did: the confirming round's R3 and this round's F2 are one family —
**the spec asserts a security property more widely than its gate decides it**.
R3 was "structural forgery" claimed above what A9 gates; F2 was A9 itself claimed
above what the shipped digest satisfies. Patching a third instance in the same
shape would have been the wrong move.

The design question raised instead: must every Table A property row state its own
validity conditions inline — as A7 already did and A9 did not — or should the spec
carry one collected place naming every layer that can stand in front of a measured
property (`capDigest`, the EP4 omission, the approval gate)?

Owner ruling: recorded as **Q14, with a trigger.** The minimal per-row condition is
applied now; if a third instance of this family appears — the framing package's
re-cut is the next measurement point — the collected-layers form becomes mandatory.

## A pre-decision recorded for the specs that follow

This spec closes under the current all-or-nothing criterion: a fresh round with
zero findings. After it closes, the owner decides on a weighted closure rule for
the following specs, on the evidence of the full round-count series.
