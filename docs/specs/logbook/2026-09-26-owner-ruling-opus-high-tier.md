---
date: 2026-09-26
title: "Ruling: architecture planning and coding both run on Opus at high effort"
related_wps: []
---

# Ruling: Opus at high effort for architecture and implementation (2026-09-26)

One instruction from the owner, quoted verbatim so this record stands on its
own. It is **transcribed by the orchestrator, not owner-typed**.

```text
please update the rules of the project so that we use Opus High for both
architecture planning and coding. Up to this point, we had been using both Opus
and Sonnet for coding tasks, but Sonnet is now so behind Opus that I just want
to default to Opus at this point. As for double gate reviews for architecture
and code review, keep those the same as they are now, including the Codex
reviewers.
```

## What it changes

- `docs/adr/0005-spec-driven-agent-development.md` — Amendment 1, OWNER-RULED
  2026-09-26: implementer sessions and `wd-architect` run on Opus at `high`
  effort; the One-Document Rule and both review gates are unchanged.
- `docs/adr/README.md` — the 0005 row carries the amendment.
- `docs/specs/_TEMPLATE.md` — `model:` defaults to `opus`; `sonnet` stays a
  valid schema value for the specs already in `done/`.
- `.claude/agents/wd-architect.md` — `effort: high` added beside `model: opus`;
  the "Sonnet-tier implementers" sentence now names the Opus tier.
- `.claude/agents/wd-reviewer.md` — one framing sentence updated (the "cheap
  implementers" premise); the review procedure is byte-identical.
- `docs/specs/README.md` — the lifecycle paragraph names the tier.
- `docs/runbooks/codex-review.md` — the dispatch message must name the model
  and effort the implementer runs on.

## What it deliberately does not change

- `wd-reviewer` stays on Opus; the Codex adversarial gate (design review and PR
  review, `gpt-6-astra`) runs exactly as before.
- ~~`wd-docs` and `wd-researcher` keep `model: sonnet`~~ — **revised the same
  day**: the owner's second message moved both to `model: opus` (*"Opus 5.5 has
  much better writing skills than Sonnet 5"*); verbatim in
  `2026-09-26-owner-rulings-queue.md`. All four agents now declare Opus.
- `tests/schemas/spec.schema.json` keeps `sonnet` in the `model` enum.
- The four Draft specs on `main` keep the `model:` value they were filed with;
  the tier they run on is decided by this ruling, not by that field.
