---
date: 2026-09-17
related_wps: [WP-dream-primary-dialogue-filter]
---

# Primary dialogue filter: design review and maintainer handoff

## Scope and hold

The owner requested one bounded work-package specification using the repository
process, followed by feedback from the main developer before implementation.
No implementation, deployment, runtime reconfiguration, or upstream mutation is
authorized by this design exercise. Keep the spec Draft for that feedback and
subsequent owner sign-off; do not dispatch an implementer.

Working scope: primary user/concluding-assistant dialogue, a lightweight Sonnet
relevance filter, and the existing consolidation pipeline. No tool-evidence
access, coverage report, persistent partial sessions, completion-protocol
redesign, or runtime judge. Offline qualitative evaluation is sufficient; no
100% recall/coverage claim. The accepted direction and its evolution are in
[the scope record](2026-09-17-dream-primary-input-scope.md).

## Stop criterion, pinned before adversarial review

- Close the design-review loop when a fresh round has no supported in-scope
  product findings. Keep the spec Draft even when review is clean.
- Band A (silent wrong behavior/data loss/security) and band B (caught
  downstream) product findings require a proposed fix within the selected scope
  or an explicit maintainer/owner decision; do not silently accept residual risk.
- A HEAVY fix changes product behavior/contracts and requires a fresh external
  round. LIGHT verification/wording fixes are checked mechanically; band C
  hygiene alone does not justify another full external round.
- Findings that reintroduce excluded architecture, full-coverage guarantees, or
  a new reporting framework are scope objections, separately routed for owner
  consideration, not requirements silently added to this WP.
- Two consecutive rounds finding the same kind of gap reopen the design
  question for maintainer feedback; do not grow verification machinery or loop
  indefinitely. Draft revisions are proposals, not owner ratification.

## Review procedure

1. wd-architect drafts using the exact template and authoring runbook.
2. A fresh native agent checks template conformance with only the spec and
   template as inputs. A separate coherence pass verifies current-state claims
   and runnable checks against the named source baseline.
3. Independent native Codex design review uses the frozen adversarial prompt,
   scoped to the drafted docs. The owner previously authorized native Codex
   agents in place of the historical gptsol transport.
4. Review an immutable clean checkout. Record status before/after. Raw output
   is written outside it, copied verbatim into this logbook, and committed before
   the orchestrator reads or dispositions it. Each round below must name the
   reviewed SHA, raw artifact, and raw-introduction commit.
5. Record proposed dispositions with consequence bands and fix weights; do not
   label unimplemented behavior tested or an unresolved owner choice approved.

Native transport calibration precedent is retained in the September 15
filtered-input-budget native-calibration red/green raw artifacts in this folder.
This exercise does not change that backend or the frozen reviewer prompt.

## Current progress

- Product source baseline: `1c3790de9f88f40aa28202e6f47748500babd555`.
- wd-architect draft committed at `ff78e2f024db99724754f52415fd14f23c55b9d5` in
  a separate worktree; production main remains unchanged.
- Round-zero coherence completed below; template and independent gates pending.
- Main-developer feedback and owner sign-off remain pending.

## Local format observations used during drafting

Content-free inspection of 35 local Codex transcript files from September 16
found user-record metadata `content_item_kinds` equal to `["user.text"]` in 60
records; 35 other records explicitly identify injected AGENTS/environment or
plugin-recommendation material. Assistant message phases included `commentary`
and `final_answer`. No `event_msg.user_message` appeared in that sample.

A broader 70-file sample found the first `session_meta.id` matched the filename
in all 70 files; 17 files included later metadata with another identity. Choosing
the last metadata record would therefore misidentify those files. These are
sample observations, not a claim of universal harness schema coverage.

The September 17 Claude dream trace has assistant text with `stop_reason:
tool_use` for progress output and `stop_reason: end_turn` for its concluding
reply. This supplies a concrete discriminator to examine in parser design.

Existing source requires an explicit nonempty runtime tool allowlist. Although
the installed CLI help now describes empty `--tools` differently, this WP must
not silently relax the repository's accepted hermetic-profile contract.

## Round zero: internal coherence and baseline verification

The orchestrator read the whole draft at
`ff78e2f024db99724754f52415fd14f23c55b9d5`, then checked its claims against
source. No contradictory product requirement was found in this pass. This is
not an independent adversarial verdict. The draft's constants, legacy policy,
and one-M sizing remain proposals for maintainer feedback.

| Check | Tree | Result |
|---|---|---|
| Current-state `git rev-parse HEAD` and status | Product baseline `1c3790de9f88f40aa28202e6f47748500babd555` | SHA matched; status empty |
| Literal Current-state `rg` command | Product baseline | Exit 0; parser, collector, watchdog, gate consumer, and taint function resolved |
| Literal existing `npm test --` command | Product baseline | Exit 0; 100 tests, 100 pass, 0 fail, 0 skipped |
| Deliverables existence | Reviewed draft checkout | 17 modify paths exist; 4 create paths absent, as expected |
| Source claim inspection | Reviewed draft checkout, product code identical to baseline | Parser caps/redaction, original invocation geometry, collector memo/admission, supervision, exports, and descriptor/profile bindings matched |
| Repo-configured markdownlint | Reviewed draft checkout | Exit 0; 1 file, 0 errors |
| Frontmatter check | Reviewed draft checkout | Exit 0; 275 specs, 4 agents |
| `git diff --check` and status | Reviewed draft checkout | Exit 0; status empty |

The test command used the previously verified Node-only PATH directory
`/tmp/wd-dream-lock-design.NApPpv/runtime-bin` to avoid making a production Claude
binary available alongside Node in isolated pin tests. The unmodified npm test
wrapper ran. Its raw output is
`2026-09-17-dream-primary-filter-baseline-tests.txt` in this folder.

AC1–AC4 describe absent future behavior; their implementation tests are not
claimed green. AC5 requires an authorized implementation and offline model
comparison; it was not run. No real model, live ledger, vault, installation,
scheduler, or upstream remote was changed. The specification does not contain
numerical source-line ranges requiring endpoint checks.

## Round zero: fresh template conformance

Reviewed revision: `ff78e2f024db99724754f52415fd14f23c55b9d5`.
Raw output: [conformance report](2026-09-17-dream-primary-filter-conformance-raw.md).
Raw-introduction commit: `3832b3b23bfbff78590b8a7bdf89627796cfb4de`.
The raw artifact was committed before the orchestrator opened it. The reviewer
received exactly the draft and template, took no part in drafting, and verified
empty status before/after in the isolated checkout.

Every required template section is present. Two explicit within-section
requirements need correction before the independent round:

| Finding | Band | Weight | Proposed disposition | Reason |
|---|---|---|---|---|
| TC-01: full generated-file example absent | C | LIGHT | fix | Add a minimal synthetic extract example, mirroring existing proposed contracts |
| TC-02: mirror maintenance discipline implicit | C | LIGHT | fix | State per-table mapping, same-commit updates, and immediate new-mirror registration |

The wd-architect applied both document-only corrections. The orchestrator
verified the full synthetic JSON/JSONL example parses, checked the A/B/C/D mirror
mapping and same-commit/new-mirror instructions, and reran markdownlint (0
errors) and `git diff --check` (exit 0). Neither correction changes product
behavior or authorizes implementation. Round zero is complete.

## Maintainer handoff draft — not sent

Please review `docs/specs/WP-dream-primary-dialogue-filter.md` before we authorize
implementation. It proposes one M work package:

- Build primary user/concluding-assistant dialogue, excluding source tool text
  and recognized harness/progress material.
- Ask a bounded Sonnet stage to select original exchange blocks, then run the
  existing consolidation agent and publication pipeline.
- Apply the existing X admission cap before Sonnet, without backfill. Keep
  original content on ordinary filtering failure; preserve existing integrity
  and process-supervision failures as aborts.
- Evaluate representative examples offline with an LLM judge. No access report,
  tool-evidence retrieval, full-coverage guarantee, or completion redesign.

Feedback requested:

1. Is the proposed scope feasible as one M WP using the existing supervised
   process lifecycle? If it needs a broader lifecycle refactor, split before
   implementation.
2. Are the source/legacy/subagent rules and the separation of model input from
   code-owned skill authorization acceptable? Does the durable policy need an
   ADR amendment before Ready?
3. Are Table C's provisional batch/time limits and keep-original fallback a
   reasonable first experiment? They are not measured savings claims. A large X
   can remain mostly unfiltered when that allowance expires.
4. Is X-before-filter/no-backfill the right initial tradeoff? It bounds work but
   intentionally does not fill newly freed space with older sessions.

The existing limitation remains: successful run-level publication does not
prove the consolidator examined every selected session. No historical replay is
introduced. The WP remains Draft until feedback and owner sign-off; no
implementation or deployment has started. Independent design-review results and
proposed dispositions are recorded in this same logbook entry.
