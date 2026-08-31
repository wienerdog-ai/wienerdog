---
id: WP-process-runbook-sweeps
title: Codify the paid-for review and sweep disciplines into the runbooks
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0031]
epic: spec-system
---

# WP-process-runbook-sweeps: Codify the paid-for review and sweep disciplines into the runbooks

> **Draft stub from the 2026-08-31 handover.** Docs-only. The source
> material is `memory/lessons/inbox.md` (especially the 13
> `WP-dream-promote-in-workspace:` bullets) and `docs/HANDOVER.md`'s "what
> to watch for" list — this WP moves the durable rules from lesson bullets
> into the operative runbooks so they bind future work, then lets the dream
> job's consolidation retire the raw bullets naturally.

## Context (read this, nothing else)

Each rule below was paid for at least once (several twice or three times) in
the audit-remediation program. They currently live as lesson bullets — read
but not binding. The runbooks (`docs/runbooks/`, the spec template's Gates
section, the reviewer/architect agent duties) are where they become process.

The set to codify (final wording is this WP's judgment):

- proof of a fix = the re-grep/re-run, never the edit; paste tool output;
- certify from the tool's own summary, never a hand regex count;
- +0 delta on an early-dying test proves nothing about later assertions;
- `+0/−0` beside a claimed content change is a failure signature — prove the
  commit, not the worktree;
- mutation application is proven (grep the injected marker) before a matrix
  is believed; guards must notice their own death; canaries match the
  exploit's arity;
- claim-level sweeps: whitespace-flattened, pronoun-aware, family-wide, with
  the scope citation adjacent to the claim;
- registered mirrors move together, in the same commit;
- ADR-0031 circuit breaker: two consecutive rounds on one contract family →
  extraction, never a third patch;
- materiality bands (A/B/C) on every review round; counts without bands are
  not decision-grade;
- form-insufficiency vs predicate-defect distinguisher (facts don't reach
  the observation point vs facts present, wrong question) — decides whether
  a loop reopens as design or as a fix;
- enumerate-your-own-good over enumerate-the-bad wherever the grammar isn't
  yours;
- reviewers read whole cells, not grep windows; comments cite names, never
  relative positions;
- frozen tip during gate rounds; both gates on the SAME tip; pinned reading
  before each round; declined owner grants surface loudly.

## What done means

- Each rule lands in the runbook/agent-duty file where it operationally
  binds (not in one new mega-document), with a one-line "paid for by"
  provenance.
- No rule is reworded into aspiration — keep the operative, checkable form.
- `markdownlint` clean; no product code touched.
