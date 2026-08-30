---
title: Citation rot blocks a dispatch, and a ninth mirror nobody registered
date: 2026-08-30
related_wps: [WP-quarantine-banner-decay, WP-doctor-quarantine-counts, WP-dream-report-run-skips]
---

# Citation rot blocks a dispatch, and a ninth mirror nobody registered

Two text-only repairs on one branch, from two different gates. They share a
shape: **a fact was fixed in one place and the register that would have caught
the next drift was not extended.**

## Part 1 — six rotted citations in a `Ready` spec

`WP-quarantine-banner-decay` was signed off as `Ready` and could not be handed
to an implementer. The dispatch-time re-verification gate
(`docs/runbooks/codex-review.md`) re-runs a spec's executable Current-state
claims against `main`; a stale claim blocks the dispatch and routes the spec
back to the architect. Six were stale, measured against `8f93bc4`.

| claim | authored (`2081472`) | measured (`8f93bc4`) | anchor it was re-derived from |
|---|---|---|---|
| `quarantineBannerLine` | `ledger.js:346` | `:367` | `function quarantineBannerLine(ledger) {` |
| the actionable sentence | `ledger.js:365-371` | `:386-392` | the `lines.push(` … `);` in the `if (spent.length > 0)` branch |
| the `dream.js` call site | `:391`, consumed `:396` | `:392`, `:397` | `const quarantineLine = ledgerLib.quarantineBannerLine(ledger);` |
| four banner tests | `ledger.test.js:406/421/441/453` | `:454/469/489/501` | the quoted test titles |
| three pinned tests | `dream.test.js:757/789/860` | `:758/806/997` | the quoted test titles |

**Four files, four different offsets, and one of them not constant within the
file.** `ledger.js` shifted +21 from an insertion at `:336`, so `displayName`
(`:319`) and `activeQuarantines` (`:328`) did not move at all while everything
below did. `dream.test.js` shifted +1 at its first citation and **+137** at its
third, because whole test suites landed in between. Arithmetic on the offset
would have produced three confidently wrong numbers.

**The load-bearing one is the actionable sentence.** The spec instructs an
implementer to reproduce a byte-exact sentence *from those lines*. Read today,
the stale range returns JSDoc plus a function head — the exact shape that has
deadlocked a package in this repo before. It now names the branch, the range,
and a literal to search for, in that order of durability.

Three claims re-run and confirmed unchanged: `digest.js:24-31`, `:833-838`,
`digest.test.js:184`. Their files were untouched.

**The sweep found more than the four the dispatcher had enumerated** — a sixth
rotted citation (`dream.js` `:396`), a new sibling function in the module the
implementer edits (`quarantineSizeBytes`, `:351`) that neither the module
inventory nor the Deliverables keep-unchanged list named, a fifth test calling
`quarantineBannerLine` (`ledger.test.js:265`) that the spec left in permission
limbo, and one absolute claim ("the only place a stored `reason` reaches the
digest") that two unrelated prefix blocks falsify. Each of those is a claim a
re-verifier would have had to adjudicate at dispatch.

## Part 2 — the ninth mirror

`WP-doctor-quarantine-counts` is `Done`. Its Mirrored Surface Checklist
registers eight mirrors of Table B's six pinned probe steps. The shipped
`warningsPointerStatus` JSDoc (`src/cli/doctor.js:306-321`) is a ninth, and it
was not on the list.

That JSDoc **had already drifted** — it numbered the probe five steps against
Table B's six — and PR #37's second round repaired it. The mirror was fixed;
the register was not extended. The failure this leaves open is precise: a
seventh step lands in Table B, every registered mirror is updated, and the
JSDoc goes stale again with no checklist line to catch it.

This is the same defect the `WP-quarantine-warnings-file` errata recorded
eight days' worth of rounds ago under a different name — *a rendered product
string is a mirror*. **Code comments that restate a canonical table are
mirrors too.** Neither is a spec surface, and that is exactly why the
checklists kept omitting them.

## Lessons

- **A `Ready` spec is not a dispatchable spec.** The gap between sign-off and
  dispatch is where dependencies merge, and merged dependencies falsify
  Current-state claims silently. `Ready` dates; it does not certify.
- **Re-derive, never offset.** Four files shifted by four amounts, and one
  file by two different amounts internally. An offset is a guess that reads
  like a measurement.
- **Cite the anchor, not only the number, for any claim an implementer must
  act on.** A number is a hash of the file's state; a function name, a branch,
  or a literal survives the next insertion. See the recommendation below.
- **When a review repairs a mirror, extend the register in the same pass.**
  ADR-0031's remedial move is two-armed. Shipping only the first arm is what
  produces the second drift.
- **A mirror register that lists only documents is incomplete.** Rendered
  product strings and JSDoc that restate a table are governed surfaces.

## Recommendation (not applied here)

Twice in one day a line-number citation blocked a dispatch —
`WP-quarantine-banner-decay` here, `WP-dream-report-run-skips` carrying the
same exposure. `docs/runbooks/spec-authoring.md` should say that a citation an
implementer must **act on** carries a stable anchor (a function name, a branch,
a grep sentinel, a quoted test title) and treats the line number as a
convenience beside it. Citations that merely orient a reader can stay bare
numbers. The runbook was deliberately **not** edited in this pass; this is a
recommendation to the owner, not a landing.
