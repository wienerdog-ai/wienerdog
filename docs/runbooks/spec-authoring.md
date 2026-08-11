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
- A fact is stated once, in the surface that owns it; every other
  surface cites the owner instead of restating. A place that keeps
  going stale predicting another surface's content stops predicting
  and points — what has no content cannot go stale.
- The worked example of these rules is
  `docs/specs/done/WP-daily-summary-per-line-framing.md`. Every other
  spec under `done/` predates them: those are RECORDS of what shipped,
  never models of how a spec should look. Copying a pre-rules spec's
  shape is how a 300-line contract becomes an 800-line fortress.
