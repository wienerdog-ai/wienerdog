# ADR-0008: Post-setup routine catalog (quick wins), digest opt-in

Status: Accepted
Date: 2026-07-02

## Context

The most common failure mode observed among OpenClaw/Hermes adopters (YouTube/Reddit and firsthand) is not installation — it's *"now what?"*: users can't find useful jobs for their autonomous agent, so the novelty dies. Separately, the daily digest was drafted as a default part of installation, but not everyone wants one.

## Decision

No routine is installed by default, including the daily digest. Instead, after the setup interview, an optional **routine catalog** step (`/wienerdog-routines` skill, re-runnable anytime) presents a curated menu of scheduled routines with plain-language descriptions of what each delivers and what access it needs. The user picks zero or more; each selection configures the skill + schedule entry + any required send grant (ADR-0007) in one guided flow. The catalog is designed for a spectacular first win within 24 hours of install.

## Consequences

- Onboarding produces visible value fast without imposing anything; "empty agent" syndrome is addressed head-on.
- The catalog is a product surface that grows over time (each entry = one shipped skill) and doubles as marketing material.
- Setup gets one more optional step; the digest must be built as a catalog entry, not a special case (WP-014).
