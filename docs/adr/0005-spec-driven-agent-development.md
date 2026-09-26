# ADR-0005: Spec-driven agent development

Status: Accepted
Date: 2026-07-02

## Context

Planning happens with a frontier model (Fable) and the owner; implementation is executed mostly by mid-tier models (Sonnet, sometimes Opus) for cost. The repo's documentation is therefore the primary interface through which implementers receive work.

## Decision

All implementation is organized as **work packages** (`docs/specs/WP-*.md`) governed by the **One-Document Rule**: a mid-tier model must be able to ship a WP correctly reading only that spec plus CLAUDE.md. Specs inline everything needed (duplicating from architecture docs deliberately — tokens are cheaper than confusion). The spec's Deliverables table is a hard permission boundary enforced by CI. **The implementer is not a named agent**: it is a fresh harness session pointed at one Ready spec; the spec + CLAUDE.md are its entire definition. Quality is bought at the gate, not the keyboard: the reviewer agent runs on Opus, non-negotiably; two failed review rounds mean the spec is the bug and it returns to the architect.

## Consequences

- Cheap parallel implementation with bounded blast radius per session; scope creep is mechanically rejected.
- Spec-writing is the highest-leverage token spend in the project — never economized.
- Deliberate content duplication between specs and architecture docs; specs in `done/` become the true changelog.
- This process is itself a demonstration of the product thesis: a model gets dramatically better when you install the right files around it.

## Amendment 1 (2026-09-26) — architecture and implementation both run on Opus at high effort, OWNER-RULED

OWNER-RULED 2026-09-26

> **Ruled by the owner on 2026-09-26.** The owner instructed the agent, in the
> working session of 2026-09-26, to update the project's rules to this effect and
> to write the record; the instruction is quoted verbatim in
> `docs/specs/logbook/2026-09-26-owner-ruling-opus-high-tier.md`. No agent chose
> this; the line above records provenance, per the ADR-0035 discipline that an
> agent never writes an owner line silently.

**This section is in force as of the ruling above.** It amends the Context and
Decision above as follows; where they disagree, this section wins.

- **The implementer tier is Opus at high effort.** Every implementer session — a
  fresh harness session pointed at one `Ready` spec — runs on Opus with the
  effort level set to `high` (Claude Code: `--effort high`, or `effortLevel:
  "high"` in settings). The Context sentence "implementation is executed mostly
  by mid-tier models (Sonnet, sometimes Opus) for cost" no longer describes the
  process: Sonnet is not dispatched for implementation any more. Reason, per the
  owner (verbatim in the logbook entry): Sonnet is now so far behind Opus that
  Opus is simply the default.
- **The architect runs on Opus at high effort.** `wd-architect` declares
  `model: opus` and `effort: high`; spec authoring and ADR drafting are never
  delegated to a lower tier.
- **The One-Document Rule is unchanged.** A spec must still be implementable
  reading only itself plus CLAUDE.md. The rule was never about the
  implementer's weakness; it is what keeps the Deliverables boundary
  enforceable and the specs in `done/` a readable changelog. Specs keep
  inlining everything the implementer needs.
- **Both review gates are unchanged.** `wd-reviewer` stays on Opus,
  non-negotiably; the independent Codex gate (`docs/runbooks/codex-review.md`,
  design review and PR review, currently on `gpt-6-astra`) runs exactly as
  before. This amendment touches who writes the code and the specs, not who
  judges them.
- **The spec template's `model:` field defaults to `opus`.** It records the tier
  the spec was written for; it no longer selects between tiers. `sonnet` stays a
  valid schema value only so the historical specs in `done/` keep validating.
- **Out of scope.** `wd-docs` and `wd-researcher` are neither architecture nor
  implementation and keep their own `model:` lines; changing them is a separate
  decision.

The Consequences bullet "Cheap parallel implementation with bounded blast radius
per session" is read as "Parallel implementation with bounded blast radius per
session" — the blast-radius property stands, the cost claim does not.
