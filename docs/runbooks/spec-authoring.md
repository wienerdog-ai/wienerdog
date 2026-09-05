# Spec authoring

How a work-package spec is written. The template
(`docs/specs/_TEMPLATE.md`) gives the skeleton; these rules govern the
writing. Read both before drafting.

- A spec states the contract and stops there: boundaries, observable
  behavior, acceptance criteria, and WHAT must be verified — never how.
  Test designs, fixture shapes, mutation lists and code structure
  belong to the implementer, and their gaps — a missing test, an
  uncovered input — are what the implementation's own review loop
  exists to catch, at the level where finding them is cheap. A spec
  that prescribes the tests has taken the implementer's job and doubled
  the surface that can rot.
- Every detail earns its place by a named consumer: the decision or
  check that uses it, at the precision that consumer needs. A measured
  value carries one provenance line, not its measurement protocol. A
  detail with no consumer is cut — plausible-looking rigor is how a
  spec bloats, and pruning it is why reviews converge.
- A universal statement ("all", "none", "nowhere", "every") either
  quantifies over a named, checkable table or section, or names its
  exception set in place. An ungated universal is a hope, not a
  contract: state what enforces it, or narrow it to what something
  actually checks.
- A template section is never deleted silently: where a conditional
  section legitimately does not apply, one line stays in its place —
  `N/A — <one-line reason>` — so absence is always visible and checkable.
- A NEW verification step is trusted only after it has been observed on
  both sides: a real green on the compliant state, and a real red run
  against a deliberately broken state — so a check that can never fail is
  caught before anyone believes it. Paste both outputs.
- That deliberately-broken state includes the DELIVERABLE-ABSENT case, not only
  the violating one. A negated grep — `! grep -q PATTERN file` — passes hardest
  when the file does not exist: grep exits 2, and the negation turns that error
  into success, so the check reads greenest exactly where the work was never
  done. Guard it (`test -f file && ! grep -q …`) and observe all three states:
  absent → red, compliant → green, violating → red.
- Evidence establishes a claim only as far as it actually reaches, and the
  question that catches the gap is asked while WRITING, not afterwards: *if my
  conclusion were false, would this evidence have shown it?* A measurement that
  moved two things at once attributes neither. A precedent's existence is not
  its adoption — the check is whether every defense it applies appears in the
  text citing it. A design intention in a charter is not a property of the tree.
  Where the answer is no, either get evidence that reaches or state the smaller
  claim; the repo already asks this of acceptance criteria, and it is the same
  question one level up.
- A fact is stated once, in the surface that owns it; every other
  surface cites the owner instead of restating. A place that keeps
  going stale predicting another surface's content stops predicting
  and points — what has no content cannot go stale.
- After rewriting a canonical cell, re-read that cell WHOLE for a
  sentence the rewrite just falsified. The edit habit that survives every
  cross-surface discipline is intra-cell: the new sentence goes in, the
  old one stays, and no mirror checklist can see inside one cell. The
  re-read is the only tool that can.
- Sweep for the CLAIM, not for any wording of it — and across every spec
  in the family, not only the one being edited. A fact that changed is
  wrong everywhere it appears, in whatever phrasing: a phrase-shaped
  sweep finds only the wordings its author remembers writing, and a
  count that moved is wrong wherever any sentence states it. Sweep the
  concept (one pattern over the claim's shape, whitespace-flattened so a
  hard wrap cannot hide a hit), then verify each hit is corrected text
  or a named withdrawal. The sweep is also **pronoun-aware**: a claim
  restated as "it", "that count" or "the same file" is still the claim,
  and a pattern scoped to the noun alone walks past it. Write a claim's
  scope citation **adjacent to the claim** itself, not only in a table
  elsewhere, so one sweep pattern catches both the fact and where it
  applies (`inbox` WP-dream-promote-in-workspace;
  `docs/HANDOVER.md:362-363`).
- CLAUDE.md's `feat|fix|docs|test|chore(scope): message (WP-<slug>)` governs
  IMPLEMENTATION commits, which are one work package by construction. An
  architect's docs-only commit that spans several work packages at once — a
  family split, a review-round sweep, a gate-finding revision — has no single
  slug to name, so it carries the epic or the issue as its scope instead
  (`docs(specs): … (issue #165)`, `docs(specs): … (quarantine-surface)`). One
  work package touched, one slug; several, the stream they belong to.
- The worked example of these rules is
  `docs/specs/done/WP-daily-summary-per-line-framing.md`. Every other
  spec under `done/` predates them: those are RECORDS of what shipped,
  never models of how a spec should look. Copying a pre-rules spec's
  shape is how a 300-line contract becomes an 800-line fortress.
