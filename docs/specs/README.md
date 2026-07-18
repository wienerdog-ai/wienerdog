# Work-package specs

A **work package (WP)** is one self-contained implementation spec: one implementer session, one PR. Specs are the primary interface through which models receive work (ADR-0005) and obey the **One-Document Rule**: implementable reading only the spec + CLAUDE.md.

## Lifecycle

`Draft → Ready → In-Progress → In-Review → Done` (frontmatter `status:`). Only the architect agent or the owner moves a spec to `Ready`. An implementer may only pick up a `Ready` spec whose `depends_on` are all `Done`. On merge, the spec's file moves to `done/` — kept forever; `done/` is the project's true changelog.

## Sizing

S (< 1 focused hour) or M (one session). **L is forbidden — split it.** Heuristics: ≤ ~400 lines of new non-test content, ≤ 8 files touched, zero "and also" clauses. If concrete verification commands can't be written for it, it's too big.

## Rules that make this work

- The **Deliverables table is a permission boundary**: implementers may not create or modify any file not listed; CI (`boundary-check`) enforces it.
- Specs inline all needed context — never "see the architecture doc for details".
- Every acceptance criterion maps to a literal verification command whose output is pasted into the PR.
- Cited ADRs are binding.

Index and dependency graph: [ROADMAP.md](ROADMAP.md). Template: [_TEMPLATE.md](_TEMPLATE.md).
