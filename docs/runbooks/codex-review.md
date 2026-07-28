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
3. **Dispatch-time re-verification (mandatory): every WP, at the moment it is
   handed to an implementer.** The **orchestrator session** re-runs the spec's
   executable Current-state claims against current `main` before it writes the
   dispatch message. See "Dispatch-time re-verification" below. Listed here
   because this is the section a dispatcher reads, and the gate is worthless if
   it is only findable next to the design-review loop that precedes it.

## The loop (design review)

```text
wd-architect drafts → /codex:adversarial-review (focus text scoped to the
drafted docs) → orchestrator verifies citations against the files → owner
accepts/rejects findings → wd-architect revision pass → /codex:adversarial-review
round 2 (ask it to verify its own prior findings are fixed AND attack the new
mechanisms) → repeat until clean → owner sign-off → specs move to Ready.
```

## Dispatch-time re-verification (the last gate before an implementer starts)

**`Ready` is not the same as "still true".** **The orchestrator session runs
this**, in the same session that writes the dispatch message and immediately
before it — the same actor that runs the design-review loop above, at the next
step of the same pipeline. **Before it hands a WP to an implementer it re-runs
that spec's executable Current-state claims against current `main`. A stale
claim blocks the dispatch and routes the spec back to wd-architect** — the
orchestrator does not repair it, and the implementer is never dispatched to work
around it.

**Dispatch here is a conversation, not a command**, which is exactly why the rule
has to name its actor and its artifact rather than a hook: there is no dispatch
command, agent invocation or workflow to wire this into, and inventing an entry
point to hold the gate would be more machinery than the gate. What makes it
auditable instead is the **dispatch message**: it names each claim re-run and the
result, so a reader can tell a gate that ran from a gate that was skipped. That
is the whole record — no new file, no tooling, no schedule.

**Which claims, and how the orchestrator knows the set is complete.** The set is
every claim **the spec states as fact about files it does not own** and that has a
runnable form: line-number citations, `grep` sentinels, digests over files outside
the spec's Deliverables table, "today's behaviour" descriptions, and
permitted-removal bounds. **`## Current state` is where most of them live, but the
boundary is the claim's kind, not the heading** — a spec may carry copied,
un-re-measured facts under any heading, and those are in scope too. Worked
instance: `WP-secret-fence-ep2-redact-arm` puts rows **D1/D2** under
`## Derived measurements — copied, not re-measured`, which is precisely the
digests-over-files-the-WP-does-not-own category above; a check bounded to the
`## Current state` heading would have walked past them. The spec is the inventory —
it is required to inline everything the implementer needs (ADR-0005) — so a claim
of this kind that appears nowhere enumerable is a spec bug and is reported as one
rather than silently re-verified. **If a spec's claims of this kind cannot be
enumerated from it, the spec is not dispatchable and goes back to wd-architect** —
the same routing as a stale claim, for the same reason.

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

**Three rules follow.**

- **Re-run, do not re-read.** A claim is stale or it is not; reading the spec
  again cannot tell you which. If a claim has no runnable form, it was not an
  executable Current-state claim and this gate does not cover it.
- **A stale claim goes back to wd-architect, never to the implementer.** The
  spec's Deliverables table is a permission boundary, so the file that would fix
  a rotted citation is usually outside the implementer's reach — which is what
  made the case above a deadlock rather than an inconvenience.
- **The dispatch message records the run.** Which claims were re-run, and their
  results. A dispatch that does not say is a dispatch where this gate did not
  run, and it is the orchestrator's to redo.

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
