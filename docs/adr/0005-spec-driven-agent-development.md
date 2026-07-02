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
