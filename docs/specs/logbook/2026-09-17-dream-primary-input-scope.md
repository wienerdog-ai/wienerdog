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
Exact harness-specific identification remains spec work.

For the first implementation, exclude tool-call details and tool-result content
from the dream's input. Do not prepare separate tool-evidence files, create an
evidence index/archive, expose an on-demand extraction operation, or implement a
budgeted evidence-access tool. Existing raw harness transcripts are not deleted.

Let the dream report occasions when tool evidence would have helped it decide
what to remember or verify a claim. Use those observations to inform whether a
later implementation should provide access. The purpose is to test the value of
that additional mechanism before building it.

The earlier idea of primary content plus evidence sharing a dynamically consumed
X is no longer needed for this first iteration. Preserve the existing X as an
admission bound on the resulting normalized primary extracts, including their
metadata. This is not a guarantee on cumulative tool-read traffic, model tokens,
or repeated context. No new read-metering mechanism is proposed here.

Keep the already accepted newest-first selection, whole-extract admission,
overflow distinction, soft preprocessing deadline, and absence of persistent
partial-session checkpoints. Changing which messages belong in an extract does
not silently change those policies.

## Proposed reporting behavior for the draft spec

Use the existing dream report, rather than placing operational requests in
durable knowledge notes or introducing a new persistent queue. A short section
can name:

- the source session;
- the specific observation or claim that needed additional evidence;
- what result would have helped (for example, a test outcome or source text);
- how the missing evidence affected the memory decision.

The model must not invent a tool identifier or claim to have inspected omitted
content. A session reference and a plain description of the need are sufficient.
These are model-reported needs, not code-verified coverage statistics.

Proposed handling: lack of tool evidence alone does not automatically enqueue
the entire session forever. The dream can decline an unsupported claim, or
retain a carefully attributed observation when that is useful and policy permits
it. It must not promote an unverified outcome into a verified fact. The exact
completion/retry contract remains open for the new WP design.

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

1. Define the primary exchange precisely for both harnesses, including interrupted
   turns, user corrections, agent final replies, and exclusion of harness control
   text or copied history. Do not equate a normalized `user` role with human
   authorship without checking the original record.
2. Define per-session completion: distinguish an examined session with no retained
   candidate from an input the model skipped or failed to examine. Tool omission
   does not solve the existing admission-versus-completion gap.
3. Decide whether bounded per-session ingestion and cross-session consolidation
   belong in this iteration or a later one; that architectural choice is not
   accepted by the tool-exclusion decision.
4. Check existing invocation-index, skill-learning, and provenance contracts when
   filtering messages. No gate may gain permission because its supporting
   evidence was removed; do not add tool details back to the model input to hide
   a compatibility problem.
5. Establish the effect on previously processed inputs and whether any targeted
   replay is needed. Do not reset the live ledger by default or replay everything
   solely to recover tool content that this iteration intentionally excludes.
6. Split the selected scope into bounded WPs and reconcile it with the existing
   report WP. The reporting section above is a proposed use of the existing
   report, not permission to expand that sibling WP silently.

## Verification

Documentation-only scope: no code, prompt, configuration, or runtime state edits.
Validate these documents with the repository's markdownlint configuration and
check the staged diff for whitespace errors before committing.
