---
title: PR gates — the quarantine surface split (PR #33)
date: 2026-08-30
related_wps: [WP-quarantine-warnings-file, WP-doctor-quarantine-counts, WP-quarantine-banner-decay, WP-dream-report-run-skips]
---

# PR gates — the quarantine surface split (PR #33)

PR #33 (`wp/quarantine-surface-split` → `main`, merge base `dcd5777`), reviewed
at tip `fb61dab`. Both gates per `docs/runbooks/codex-review.md` §"PR review",
run locally: GitHub Actions was down account-wide (billing — every job 0 steps
since 2026-08-29 22:47), so the CI jobs were reproduced locally with the
workflows' own commands and recorded on the PR
(comment: local CI-equivalence table — lint PASS, tests 2143/2133/1
pre-existing environmental, boundary docs-only skip verified against the real
PR body, pr-title verified against the real title, smoke 14 checks PASS,
docs-only diff confirmed).

## Gate verdicts at `fb61dab`

- **codex pr-rubric (gptsol backend, vendored `pr-rubric.md`):** "patch is
  incorrect" with 2 findings, both P2, both real (one carried an executed
  reproduction). Executed: lint (0), npm test twice (the one pre-existing
  adopt-e2e environmental failure, disclosed), git diff --check (0). Read-only
  verified.
- **wd-reviewer (spec-fidelity):** REQUEST-CHANGES with 9 findings — and an
  explicit finding-of-soundness on the loop itself: stop criterion byte-identical
  since pinned (31 min before the round-1 raw), all 7 round rows cite raw path +
  introducing SHA and all 7 SHAs verified, the five post-signature ADR changes
  reconcile exactly with the commit graph, signature line byte-identical to the
  signing commit. Its class diagnosis: intra-cell falsification and
  vocabulary-shifted restatement — the defect class a grep-based mirror walk is
  structurally blind to.

## Dispositions (all eleven), applied in `2081472`

| # | Finding | Disposition |
|---|---|---|
| C1 | G11 would count the reconciled warnings file as a user note | **fix** — G11 inherits Table D's exclusion (cited, not restated); acceptance case proven RED |
| C2 | the pointer probe misses a symlinked PARENT (`<vault>/reports` → elsewhere); reproduced executed | **fix** — probe step (5): realpath(parent) must equal realpath(vault)+reports dir; case (d); gate requires a sixth `realpathSync` |
| W1 | G8's empty-ledger guard missing from three restatements | **fix** — guard added to the summary sentence, checklist bullet, acceptance criterion |
| W2 | out-of-scope justification still reasoned from the deleted before/after-delta model | **fix** — re-keyed to never-mutate; old reason kept as marked history |
| W3 | banner spec silently lacked the idempotency criterion | **fix** — explicit `N/A —` naming the deliberate 7-day time-dependence |
| W4 | "in four cases" over five cases | **fix** |
| W5 | banner ∥ report share three files with no ordering edge | **fix (owner-flagged)** — `WP-dream-report-run-skips` gains `depends_on: WP-quarantine-banner-decay`, recorded as an ORDERING edge, not a contract; delays nothing (the promote gate is later); charter table amended |
| W6 | 31 commits use epic/issue scope, not `(WP-<slug>)` | **rule, no rewrite** — one runbook sentence legitimizes epic scope for multi-WP docs-only commits |
| W7 | 4 of 8 report-spec deliverable rows unmarked | **fix** — STABLE/PROVISIONAL classified per row against the promote deliverables |
| W8 | report spec title not verb-first | **fix** — retitled |
| W9 | raw filenames carry the family date, frontmatter the round date | **residual, deliberate** — the rounds table cites those exact paths at frozen SHAs; renaming would desync the record |

The fix pass's own whole-set sweep (now 9 files) caught two more sites the
findings did not name — the warnings spec quoting G8's criterion header verbatim
against its own no-restatement checklist rule, and the charter's stale
"Existence alone is the line." — both fixed in the same commit. Backlog items
recorded, not acted on: the spec-length trend (811-line warnings spec vs the
runbook's fortress warning), the GLOSSARY transcript-vs-secret-quarantine
ambiguity and the missing `reports/warnings.md` entry (declined as
out-of-smallest-form for a Ready spec at the PR gate; the deliverable row's own
scope says "one sentence, no other entry").

Both gates' full outputs are posted verbatim as PR #33 comments. Per the
runbook, the maintainer merges when both gates are clean or every finding is
dispositioned — the state this record establishes at `2081472`.
