# Runbook: Codex adversarial review loop

A second, independent AI reviewer (OpenAI Codex, via the `codex@openai-codex`
Claude Code plugin) is a standard gate in the pipeline, alongside wd-reviewer.
Adopted 2026-07-12 after its first outing found eight real, zero hallucinated
findings across two rounds on the ADR-0020 / WP-080…083 spec chain.

## When it runs

1. **Design review (mandatory): every new or revised spec/ADR set.** After
   wd-architect drafts, the orchestrator session runs the loop below. A spec
   does not move to `Ready` until Codex returns no findings the owner hasn't
   explicitly accepted as residual.
2. **PR review (additional gate): alongside wd-reviewer.** wd-reviewer remains
   the merge gate (spec-fidelity review); Codex is an independent second
   opinion on the same diff. Both run; Gyula merges only when both are clean
   or every finding is dispositioned.

## The loop (design review)

```text
wd-architect drafts → /codex:adversarial-review (focus text scoped to the
drafted docs) → orchestrator verifies citations against the files → owner
accepts/rejects findings → wd-architect revision pass → /codex:adversarial-review
round 2 (ask it to verify its own prior findings are fixed AND attack the new
mechanisms) → repeat until clean → owner sign-off → specs move to Ready.
```

## Dispatch-time re-verification (the last gate before an implementer starts)

**`Ready` is not the same as "still true". Before a WP is handed to an
implementer, re-run its executable Current-state claims. A stale one blocks
dispatch and routes the spec back to wd-architect — it is never something the
implementer works around.**

The claims this covers are the ones the spec states as fact about the tree the
implementer will find: line-number citations, `grep` sentinels, digests over
files the WP does not own, "today's behaviour" descriptions, and permitted-removal
bounds. The check is exactly the spec's own commands, run on current `main`. No
new mechanism, no tooling, no schedule — this is one step in the dispatch
conversation, stated once, here.

**Why it exists.** A spec's Current-state section is verified once, at design
time. Every dependency that merges between then and dispatch can falsify it,
silently, without anyone editing the spec. Measured on the `secret-fence` epic:
the specs count **seven** capture-drift instances in the epic
(`docs/specs/done/WP-secret-fence-two-tier-detector.md:320`,
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md:618`), and the `0.11.0` batch
merging on 2026-07-26–27 moved `main` underneath **both** legs at once — round 1
of the design gate then found **seven stale citations across the two legs**, all
from that single event and none of them a design error
(`docs/specs/done/WP-secret-fence-two-tier-detector.md:326`).

**And one of them was not cosmetic.** `WP-stance-authority-containment` rewrote
`docs/THREAT-MODEL.md`'s stance clause, so the ep2 spec's V-27 sentinel grepped
for a sentence that no longer existed. V-27 exited 1 **before an implementer
could write a line**, while that spec's own Deliverables row and V-27's own
failure text both forbade touching the region that would fix it — a hard
deadlock, dispatched (`docs/specs/done/WP-secret-fence-ep2-redact-arm.md:629`).
Re-running the claims at dispatch turns that into a five-minute architect edit
instead of a blocked session.

**Two rules follow.**

- **Re-run, do not re-read.** A claim is stale or it is not; reading the spec
  again cannot tell you which. If a claim has no runnable form, it was not an
  executable Current-state claim and this gate does not cover it.
- **A stale claim goes back to the architect, never to the implementer.** The
  spec's Deliverables table is a permission boundary, so the file that would fix
  a rotted citation is usually outside the implementer's reach — which is what
  made the case above a deadlock rather than an inconvenience.

## How to run it

- Design review: `/codex:adversarial-review` with focus text naming the exact
  files to review and the specific decisions to challenge; explicitly exclude
  unrelated working-tree files (`docs/marketing/`, `memory/research/`,
  `userreports/`). On round ≥ 2, list the prior findings and ask Codex to
  verify each is genuinely fixed, not re-worded.
- PR review: `/codex:review` (native, no focus text) against the PR branch.
- Prefer `--background`; results via `/codex:status`.

## Rules

- Codex output is relayed **verbatim** to the owner — never paraphrased,
  softened, or filtered.
- The orchestrator spot-checks citations against the actual files before
  anyone acts on a finding (both rounds so far were accurate, but the
  competitor-research lesson stands: verify, don't trust).
- Findings are fixed by **wd-architect** (specs/ADRs) or the **implementer**
  (PR diffs) — never by the orchestrator inline, and never by Codex itself.
- A finding the owner rejects is recorded in the spec/PR as an accepted
  residual with a one-line reason.
- **Loop circuit-breaker (ADR-0031).** If two consecutive review rounds land a
  finding on the *same* contract family, stop fixing finding-by-finding and do a
  contract-**extraction** pass instead: pull that contract into one canonical
  reference table and register its mirrored surfaces per ADR-0031's Mirrored
  Surface Checklist, then resume the loop. The Mirrored Surface Checklist is the
  stronger day-to-day mechanism (it keeps mirrors in lockstep up front); this
  breaker is the backstop for when scattered contract prose slipped through
  unregistered.

## Requirements

Machine-local: the `codex@openai-codex` plugin installed in Claude Code and
Codex CLI authenticated (currently Gyula's machine, ChatGPT auth). If the
plugin is unavailable, the loop is skipped and the skip is noted in the PR /
spec Done record — wd-reviewer alone is then the gate, as before 2026-07-12.
