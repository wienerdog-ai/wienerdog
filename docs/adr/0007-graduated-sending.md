# ADR-0007: Graduated sending (send grants) instead of no-send

Status: Accepted (amends the gws design in ARCHITECTURE/THREAT-MODEL as originally drafted)
Date: 2026-07-02

## Context

The original v1 design gave `gws` no send verb at all ("read-first, draft-only"). This is too strict: the flagship routine — a daily digest *emailed to the user* — requires sending, and prohibiting it wholesale forfeits legitimate autonomy. The real requirement is preventing *inadvertent or attacker-induced* sending, not sending itself.

## Decision

Sending exists behind **send grants**:

- Default posture stays read + draft. `gws gmail send` (and future outbound verbs) executes only when a matching grant exists.
- A grant is scoped to `(routine, recipient allowlist)` and stored in `~/.wienerdog/config.yaml` — mechanics, not vault, so no model-writable surface can create one.
- Grants are created **only** by the interactive CLI (`wienerdog grant send --routine <name> --to <recipients>`) with an explicit typed confirmation that names the routine and recipients. No skill, hook, dream, or headless job can create or widen a grant.
- A send without a matching grant is not an error: it degrades to a draft plus a notice, so misconfigured routines fail safe and visibly.
- `--to self` (the user's own address) is the canonical first grant, offered during routine setup (e.g. the daily digest). Grants to third parties get an extra warning spelling out the risk in plain language.
- The dream job continues to have no `gws` access whatsoever.

## Consequences

- The daily digest and similar routines can genuinely deliver, not just draft.
- Prompt injection cannot exfiltrate via email beyond the granted allowlist, and cannot mint grants — the confirmation lives outside any model context.
- Marketing claim changes from "the send button doesn't exist" to "your AI can only send what you explicitly granted, to whom you granted it" — still a strong differentiator, now honest about autonomy.
- Slightly more config surface (grants) to build, test, and explain.
