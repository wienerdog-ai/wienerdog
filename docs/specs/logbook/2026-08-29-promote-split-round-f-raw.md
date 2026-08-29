---
title: Round (f) — undirected round on the synthesis (raw), the promote family
date: 2026-08-29
related_wps: [WP-dream-promote-module, WP-dream-promote-report, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE. Condensation declared: the 17-row
     prior-findings table is carried by its verdicts; the single finding and the
     execution report are verbatim. -->

# Round (f) — undirected round on the synthesis (raw)

Reviewer: gptsol, external, FRESH agent, undirected. Targets: all three specs at
`8fefc80`. **This is the RETRY: the first agent on this round was lost to a
connection error before returning anything.** The retry's dispatch added one
instruction — budget the run, prioritise newest text → prior re-audit →
everything else, and land a complete report on fewer checks rather than an
exhaustive investigation that never returns. It finished in 41 tool calls
against the previous rounds' 80+.

**Read-only verified independently**, before and after both the dead run and this one.

## Prior findings

**Sixteen genuinely fixed.** Round (e)'s B ruled **"re-worded but still
defective"** — see the finding.

## Verdict

`needs-attention`. **NO-SHIP.** "The newest Table N rewrite withdraws the
derived-set mechanism in its preamble but still relies on that mechanism in three
operative/mirrored surfaces. Its headline universal also contradicts its own
no-transformation classifications."

## Finding 1 — B: Table N simultaneously withdraws and depends on the derived-set mechanism, and its universal contradicts its own classification rows

- **Affected file:** `docs/specs/WP-dream-promote-report.md`
- **line_start:** 185 **line_end:** 292 **Confidence:** 0.99

**What can go wrong:** The implementer receives mutually incompatible contracts:

1. The headline property says **every string** interpolated by the composer has passed redact-then-sanitise.
2. The classification rows say `redacted[].labels`, a string, receives **no transformation**.
3. The rewrite says the unavailable "derived from the return shape" mechanism is withdrawn.
4. N4, Table R, and the mirrored-surface checklist still say the guarantee depends on that derived set.

An implementation following the classification table leaves `labels` unchanged and violates the headline universal. An implementation following the universal transforms `labels` and violates the classification row. Separately, a reviewer cannot establish N4 using the stated prerequisite because the rewrite explicitly says that prerequisite does not exist in this plain-JavaScript runtime.

**Why vulnerable:** Universal at `:185-187`; explicit exception (`redacted[].labels`, string, transformation none) at `:210`; withdrawn mechanism at `:189-196`; N4 nevertheless conditions its guarantee on "the derived value set" at `:220`; Table R repeats "N4's derived value set" at `:248`; the mirrored-surface checklist still prohibits hand lists because the set "is DERIVED from the return shape" at `:285-292`.

The acceptance criterion tests hostile values only for channels classified attacker-influenceable at `:361-366`. It therefore permits the stated no-transformation treatment for `labels`, even though that contradicts the preceding "every string" property.

**The new RED direction is executable as a deliberate mutation test if "add a channel" means adding an UNNEUTRALISED, EXERCISED interpolation carrying the hostile fixture. However, the text should say that explicitly. Adding a new interpolation already routed through a shared fail-closed neutraliser correctly stays green, which I reproduced with a short runtime composition probe. Thus "add a channel" alone is not the precise red mutation; "add an unwired interpolation" is.**

**Likely impact:** A wrong canonical build contract, likely caught during implementation or downstream review. If resolved in the wrong direction, a newly introduced report channel can be treated as covered by N4 even though the stated basis for that guarantee was withdrawn. **This is B, not A: the current acceptance criterion does include hostile values and a RED mutation direction, so a leaking implementation is not clearly allowed by all stated tests. The immediate defect is that the specification does not coherently define what those tests and the implementation must satisfy.**

**Concrete recommendation:** (1) Quantify the headline property over **attacker-influenceable and unclassified** interpolated strings, not every string — compatible with the code-owned `labels` and numeric `lines`. (2) Replace the residual "derived value set" wording in N4, Table R's observable-property row, and the mirrored-surface checklist with the rewritten property's actual prerequisites: N1's order, N2's fail-closed default, and the acceptance criterion. (3) Define the RED mutation as: add an **unclassified, unneutralised composer interpolation**, exercise it with the hostile context-dependent secret fixture on both normal and fallback paths, and require the property test to fail until it is neutralised or composition refuses. (4) Keep the citation-only mirrors at `:247` and `:311-317`; do not restore member lists.

## Scope objections

**None.**

## Execution report

**Ran** (all exit 0): initial and final `git status --porcelain` / `rev-parse` (clean, `HEAD=8fefc80…`); a redact/sanitise ORDER probe on the shipped functions (both contextual secrets caught before sanitisation, missed after sanitizer-first); the placeholder probe (`[REDACTED:generic-secret]` → `REDACTED_generic-secret_`); **a JSDoc/enumeration probe confirming a populated object exposes only its actual keys, not declared fields or union arms**; **a new-channel probe through a shared neutraliser, which stayed GREEN and leaked nothing — establishing that the meaningful RED mutation is an UNWIRED interpolation**; a closed-set label probe (current detector labels produce no findings and survive neutralisation unchanged — consistent with their code-owned classification, inconsistent with the literal "every string" universal); focused shipped tests for unexpected scratch handling and the EP2 redaction report line (109 subtests, 0 failed); `git diff --check main...HEAD` clean.

**Not run:** full `npm test`; `npm run lint`; the future packages' verification commands (their deliverables do not exist); anything that writes.

## Lessons / gotchas

- Replacing a mechanism with an observable property requires removing the old mechanism from **every load-bearing mirror**, not only from the preamble.
- A universal over "every interpolated string" cannot coexist with explicit string channels classified as requiring no transformation.
- For the new-channel RED direction, the decisive mutation is an exercised **unwired** interpolation; a new channel already routed through fail-closed neutralisation should remain green.

## Author's verification, before adjudication

All three confirmed on the tree: the residual "derived value set" at `:220` and
`:248` and "DERIVED from the return shape" in the checklist; the universal at
`:185-187` against the `labels` row at `:210`. **All three are this author's — a
partial withdrawal, which is the defect the reviewer's first lesson line names.**
