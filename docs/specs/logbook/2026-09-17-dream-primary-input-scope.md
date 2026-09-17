---
date: 2026-09-17
related_wps: [WP-dream-filtered-input-budget, WP-dream-report-run-skips]
---

# Dream primary input: first-iteration scope decision

## Status

Owner direction recorded before drafting new work packages. This is not a Ready
spec, an ADR amendment, or authorization to implement product changes. The
runtime checkout and installed dream remain unchanged.

This updates the recommendations in the
[September 16 assessment](2026-09-16-dream-process-assessment.md), following the
conversation about primary dialogue, optional tool evidence, and budget
enforcement. Later implementation must still follow the repository's architect,
design review, and owner-sign-off workflow.

## Accepted direction

Use the user's messages and the agent's corresponding concluding replies as
the primary material for memory consolidation. The intended unit is each
request/reply exchange, not just the last answer of an entire long session.
The owner also accepted retaining every actual user message, including
corrections and requests that never received a concluding reply, while excluding
intermediate agent progress updates. Harness-injected instructions and copied
subagent history must be distinguished from actual user messages.
Exact harness-specific identification remains spec work.

For the first implementation, exclude tool-call details and tool-result content
from the dream's input. Do not prepare separate tool-evidence files, create an
evidence index/archive, expose an on-demand extraction operation, or implement a
budgeted evidence-access tool. Existing raw harness transcripts are not deleted.

The model may mention missing tool evidence in the existing dream report when
useful, as previously discussed. No new mandatory reporting section, collection
mechanism, or persistent request queue is required for the first iteration.

The earlier idea of primary content plus evidence sharing a dynamically consumed
X is no longer needed for this first iteration. Preserve the existing X as an
admission bound on the resulting normalized primary extracts, including their
metadata. This is not a guarantee on cumulative tool-read traffic, model tokens,
or repeated context. No new read-metering mechanism is proposed here.

Keep the already accepted newest-first selection, whole-extract admission,
overflow distinction, soft preprocessing deadline, and absence of persistent
partial-session checkpoints. Changing which messages belong in an extract does
not silently change those policies.

## Optional missing-evidence observations

An ordinary comment in the existing dream report can name:

- the source session;
- the specific observation or claim that needed additional evidence;
- what result would have helped (for example, a test outcome or source text);
- how the missing evidence affected the memory decision.

The model must not invent a tool identifier or claim to have inspected omitted
content. A session reference and a plain description of the need are sufficient.
These are model-reported needs, not code-verified coverage statistics.

Lack of tool evidence alone does not automatically enqueue the entire session
forever. The dream can decline an unsupported claim, or retain a carefully
attributed observation when that is useful and policy permits it. It must not
promote an unverified outcome into a verified fact.

## Accepted completion semantics

On 2026-09-17 the owner accepted the following outcomes. Their implementation
and verification mechanism still need to be designed; admission alone is not
evidence of examination.

| Session outcome | Completion decision |
|---|---|
| Examined; useful findings handled under the publication policy | Processed |
| Examined; no information worth retaining | Processed |
| Examined; a claim intentionally omitted for lack of tool evidence, with the limitation reported | Can still be processed |
| Skipped, interrupted, or no interpretable processing result | Retryable |

These outcomes do not supersede the existing secret-preservation and
publication-failure contracts. The spec must reconcile their interaction
explicitly rather than treating a model's self-reported completion as authority
to bypass a code-owned gate.

**Latest scope steering on the same day:** keep the current consolidation agent,
potentially add only a lighter relevance filter, and omit automated access
reporting. Assess practical quality using an LLM judge on examples. The owner
explicitly prefers sufficiently good results over guaranteed 100% coverage.
The completion outcomes above remain a desired direction, not a requirement to
build per-session coverage enforcement in this first iteration. Do not claim
that this iteration fixes the selected-but-unexamined ledger behavior.

## Latest direction: a lightweight relevance filter, existing consolidation

The owner does not want a broad dream redesign. The working proposal is:

1. Construct primary dialogue without source tool calls/results, as agreed above.
2. Use a lighter model (Sonnet was suggested; no exact model/version is selected)
   to remove material that is not useful for memory.
3. Give the reduced material to the existing, more capable consolidation agent.
4. Evaluate example runs using an LLM judge comparing source primary dialogue
   with the actual memory changes. No automated access/coverage report is built.

This replaces the earlier recommendation to add separate full per-session
learning jobs and a redesigned consolidation protocol in the first iteration.
No candidate store, evidence retrieval, or new durable partial-session state is
proposed. Whether filtering is beneficial remains to be measured: it adds its
own model work and can discard important information.

### Accepted evaluation scope: sufficiently good memory

The owner explicitly removed the proposed access report from the first
iteration. Do not add Read/Grep trace instrumentation, exact coverage accounting,
new reporting infrastructure, or a production judge to the nightly pipeline.
LLM-as-judge is an offline evaluation method here, not another required runtime
stage or a new evaluation framework to implement.

Use representative examples to judge whether important decisions, corrections,
and preferences survive; whether retained claims remain faithful to their
sources; and whether the result contains less low-value material. Compare against
the primary dialogue before model filtering so the judge can notice what the
filter discarded. Judge the resulting memory changes in the context of existing
notes, not just the dream's self-written report. A judge's verdict is a practical
quality signal, not proof of completeness. No 100% input-coverage target or
unsupported numerical quality threshold is introduced.

### Proposed implementation defaults, not yet owner-ratified

- Select original dialogue blocks, preserving their source/role/order and
  necessary request/reply context. Do not ask the filter to rewrite them into a
  new summary or invent memory/provenance claims.
- Drop clearly irrelevant material; retain uncertain cases and user corrections
  or decisions. Compare against known important observations to detect losses.
- First bound the selected primary batch with the existing X, then filter that
  batch without admitting more sessions simply because filtering freed space.
  This keeps the filter's total assigned input bounded. Moving X to *only* the
  post-model output would require a separate bound on filter work and is not an
  automatic consequence of adding a relevance filter.
- Use bounded inputs per filter invocation; do not assume an 8 MB batch fits
  one model request. A parseable output must select only known original blocks.
  A failed or invalid filter result must not silently discard its input; define
  an explicit retain-original or retry behavior in the spec.
- Use already available sizing/usage information if useful during offline
  evaluation; do not build instrumentation for it in this iteration. Fewer
  retained bytes alone do not establish lower total cost or better memory.

### Historical access evidence, not an implementation deliverable

The measurements below predate the owner's decision to omit access reporting.
They are retained as evidence only, not as requirements for the first WP.

The real consolidation trace under the local Claude projects directory ran
from `2026-09-17T01:30:23.525Z` to `2026-09-17T01:46:08.929Z` and contained:

| Observation | Count |
|---|---:|
| All Read calls, including workspace notes | 43 |
| Read calls targeting scratch extracts | 25 |
| Distinct scratch paths passed to Read | 16 |
| Scratch Read calls with offset or limit arguments | 18 |
| Scratch Grep calls returning content | 22 |
| Scratch Grep calls returning matching filenames only | 2 |
| Scratch Grep calls returning counts only | 5 |
| All Glob calls | 5 |

`src/core/runtime-profile.js` currently permits Read, Write, Edit, Glob, and
Grep for dream; Bash and other execution/network tools are not in this profile.
Source tool results excluded from input and the dream's own file tools are
different things: excluding the former does not remove the latter.

Read and content-mode Grep can both expose input text. File lists and match
counts do not establish substantive access, and even a Read request is not proof
of a full read. Tool-visible text is evidence of exposure, not understanding.
No instrumentation of these distinctions will be added in the first iteration.

## Current execution model, verified for the owner's question

At `1c3790de`, the orchestrator calls `collectExtracts` once and then
`runBrainWithWatchdog` once for the selected batch. It starts one consolidation
agent session with the scratch directory and a private workspace. That session
can make many model turns and file-tool calls; this is not one inference request
per session or one inference request for the whole night.

The skill instructs the agent to Glob scratch and read each extract. Ingest,
ranking, cross-session deduplication, and note writing are phases of that same
agent session, not separately scheduled model jobs. The model chooses its read
sequence. Code does not currently require a completion result for each input;
the final ledger loop applies the run-level publication/secret outcome to all
selected inputs. This gap remains under the first iteration's unchanged
consolidation/ledger flow; the offline quality evaluation does not enforce
per-session completion.

## What the experiment can and cannot establish

Observed requests give examples where tool access could be valuable. Their
absence does not establish that tool content has no value: a model cannot report
every important fact it never saw. A small controlled comparison with known
important facts is still needed before making a general sufficiency claim.

Excluding tool outputs does not make every retained assistant statement
user-authored or trusted. An assistant may summarize external material. Preserve
the existing provenance protections and represent uncertainty conservatively;
do not reset trust flags merely because direct tool-result messages are absent.

The current parser does not omit all tool results: it mishandles a measured
Codex array-valued output shape while retaining some other tool-result forms.
The new policy would be an intentional, consistent exclusion across harnesses.
The measured parser defect remains a historical finding; restoring all those
outputs to dream input is not a prerequisite for this chosen iteration.

## Still to resolve in spec preparation

1. Map the accepted primary-exchange rules to both harnesses' actual record
   formats. Do not equate a normalized `user` role with human authorship without
   checking the original record.
2. Make the lightweight relevance-filter proposal concrete: model selection,
   block-selection rules, per-call and whole-run bounds, X before/after filtering,
   failure behavior, and the evaluation that checks usefulness rather than size
   reduction alone. No separate per-session learning architecture is requested.
3. Choose a small representative set of inputs and review criteria for offline
   LLM-as-judge evaluation. Keep this an assessment of sufficiently good memory,
   not an automated coverage-reporting or perfect-completion project.
4. Check existing invocation-index, skill-learning, and provenance contracts when
   filtering messages. No gate may gain permission because its supporting
   evidence was removed; do not add tool details back to the model input to hide
   a compatibility problem.
5. Establish the effect on previously processed inputs and whether any targeted
   replay is needed. Do not reset the live ledger by default or replay everything
   solely to recover tool content that this iteration intentionally excludes.
6. Split the selected scope into bounded WPs if needed. The existing report WP
   remains independent; no access-report work is added to it or made a dependency
   of this first iteration.

## Verification

Documentation-only scope: no code, prompt, configuration, or runtime state edits.
Validate these documents with the repository's markdownlint configuration and
check the staged diff for whitespace errors before committing.
