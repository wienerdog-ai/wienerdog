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

## Requirements

Machine-local: the `codex@openai-codex` plugin installed in Claude Code and
Codex CLI authenticated (currently Gyula's machine, ChatGPT auth). If the
plugin is unavailable, the loop is skipped and the skip is noted in the PR /
spec Done record — wd-reviewer alone is then the gate, as before 2026-07-12.
