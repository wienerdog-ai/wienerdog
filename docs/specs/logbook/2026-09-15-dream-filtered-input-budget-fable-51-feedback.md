---
date: 2026-09-15
related_wps: [WP-dream-filtered-input-budget]
---

# Fable 5.1 feedback on preprocessing budgets

## Status and evidence

Advisory feedback requested by the owner, not a formal design approval. The
owner questioned retaining the 200 MiB aggregate raw-read cap merely for memory
safety when per-session data is released between files. The discussed revision
would retain the configured final filtered-input limit X and individual input
guards, while replacing the aggregate raw-byte cap with a separate preprocessing
deadline. Actual filtered demands would be measured using private temporary
disk storage before allocating X. This proposal is not yet in the spec and is
not covered by the earlier Codex approval of that spec.

The requested model was `claude-fable-5-1`. The completed response envelope
confirms that exact canonical model, success, and no model substitution. The
agent received the proposal, explicit questions, and the complete current
`stream.js`, `scratch.js`, and `transcripts/index.js` files. Tools were disabled;
it did not run tests or measure throughput.

- [Request and source manifest](2026-09-15-dream-filtered-input-budget-fable-51-feedback-input.txt)
- [Complete unmodified response envelope](2026-09-15-dream-filtered-input-budget-fable-51-feedback-raw.txt)

Both were committed at `89a0a024` before the response was inspected. The
following is the relay's synthesis; the original response remains available
verbatim in the linked raw file.

## Feedback worth carrying into the decision

1. **The three-way separation is sound.** Final model-input content, resident
   memory, and total preprocessing work need distinct constraints. Disk-backed
   discovery of actual extract demands supports the existing equal-share policy
   without holding the corpus in memory.
2. **Temporary disk deserves an explicit limit.** Once extracts are staged
   before selection, the temporary collection can be larger than X. A separate
   staging bound makes resource use predictable. Fable suggested a multiple of
   X as one option, but its example values were not measured or approved.
   Hitting that bound narrows the admitted set and can exclude older small
   sessions; this is a capacity/fairness trade-off, not a free preservation of
   global fairness.
3. **Consider a deadline plus a generous byte ceiling.** Fable prefers measuring
   the filtered-size fix first and deciding the time policy separately. If a
   deadline is adopted, it suggests retaining a larger deterministic raw-byte
   ceiling as a second guard. This is a proposed work bound, not a claim that
   the current 200 MiB is necessary for memory safety. A hybrid still allows
   time-dependent selection; it does not itself make selection deterministic.
4. **Measure before picking values.** Useful measurements are preprocessing
   duration, raw bytes read, staged bytes, final selected bytes and deferrals.
   The owner has not approved new production diagnostics or their format.
5. **Reuse the existing private scratch lifecycle.** Temporary extracts can
   share its privacy and cleanup mechanisms, provided intermediate/unselected
   content is removed before the brain is given the scratch directory. Only
   final selection contributes to `processed`, `entries`, and `wrote`.
6. **Account for repeated work.** Staged-but-unselected sessions are re-parsed
   next run without a persistent cache. This amplifies an existing backlog cost.
   A size cache or partial-session continuation would add durable state and is
   not automatically justified by this feedback.

## Alternatives and corrections

**Do not adopt the suggested one-pass rollover as the same bugfix.** Fable
explicitly notes that a large early session can be truncated to its provisional
share even when later small sessions leave enough total space. That violates
the central proposed contract: a fully fitting admitted filtered corpus must
remain whole. It is simpler only if the owner intentionally weakens that goal.

**Deadline coverage needs one correction to the feedback.** Fable says that
checking the streaming loop also includes redaction work performed by
`onLine`. In the supplied current code, harness parsing returns first
(`transcripts/index.js`, the parser call), and the shared secret redaction and
message caps run afterwards through `raw.messages.map(capMessage)`.
Consequently, an intake-loop deadline check alone does not cover that later
work. A preprocessing time contract must address both phases and define what
happens to a session that cannot finish within one run's budget; otherwise
restarting that same unfinished session can make no progress. No replacement
mechanism is selected here.

**Do not treat suggested numbers or size savings as evidence.** The example
staging multiple, larger raw ceiling, and compact-vs-pretty size-saving estimate
in the response are unmeasured suggestions. They are not defaults, guarantees,
or owner decisions. The raw report's overall per-session-memory description
also needs the code's ordering caveat: message/count caps apply after the
harness parser has accumulated that session's messages.

## Recommended synthesis for owner discussion

Retain X as the final filtered-content bound; keep one-session resident memory;
measure real demands before distributing capacity; add an explicit temporary
disk bound if staging is selected. Evaluate preprocessing duration and an
optional larger raw-work ceiling using actual workloads before choosing
numbers. Preserve the no-avoidable-truncation invariant rather than taking the
one-pass shortcut. Any chosen change to the raw/time/staging policy requires a
spec revision and a new review of that changed contract.

No product code, spec contract, ADR, configuration, or approval status was
changed by this advisory request.
