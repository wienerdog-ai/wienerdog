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
