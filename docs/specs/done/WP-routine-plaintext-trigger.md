---
id: WP-routine-plaintext-trigger
title: Routine trigger is plain text, not a bare slash command (Claude ≥2.1.216 compat)
status: Done
model: opus
size: S
depends_on: [WP-routine-containment-probe]
adrs: [ADR-0025]
epic: p0-ungate
---

# WP-routine-plaintext-trigger: plain-text routine trigger

## Context (read this, nothing else)

A skill-based routine spawns its hermetic brain with a `-p` prompt that TRIGGERS
the routine; the routine's actual instructions are delivered separately via
`--append-system-prompt` (the integrity-checked vendored skill body, D-SKILL-LOAD).
The trigger was `` `/${skillId}` `` (`src/core/routine-runtime.js`) — a BARE slash
command, e.g. `-p "/wienerdog-daily-digest"`.

**Claude Code ≥2.1.216 parses a `-p` prompt that is *only* a slash command as a
command lookup and hard-errors** — the broker-e2e (LP2) transcript on 2.1.216 shows
`Unknown command: /wienerdog-daily-digest` for all three routines, `0` broker calls,
the routine did no work (caught by the harness non-vacuity check). The hermetic run
uses `--setting-sources ''`, so no skill is registered as a slash command → the bare
command is always unknown. Certified working on 2.1.214; 2.1.216 changed the parse.

The **dream is unaffected** — its `DREAM_PROMPT` is `/wienerdog-dream` followed by
context lines (a multi-line prompt), which 2.1.216 treats as regular text; the
production nightly dream produced notes normally on 2.1.216 (`dream: 2026-07-21 —
4 notes`). Only the routine's *bare* single-line slash prompt trips the parser.

## Fix

Replace the bare-slash trigger with a plain-text directive that names the routine.
The skill body (append-system-prompt) carries the instructions; the trigger only
tells the brain to start, and must not be a bare `/command`:

```js
prompt: `Run the ${skillId} routine now. Follow the instructions in your system prompt and use only your available tools.`,
```

This decouples the routine from Claude's slash-command parsing entirely (robust to
future changes) rather than depending on skill slash-command registration.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/routine-runtime.js | trigger prompt → plain-text directive naming the routine; NOT a bare `/${skillId}` |
| modify | tests/unit/routine-runtime.test.js | assert the trigger is NOT a bare slash command (`!/^\s*\/\S+\s*$/`) and names the routine |
| modify | tests/unit/scheduler-runjob.test.js | same assertion at the resolveCommand layer |

## Acceptance criteria

- [ ] The composed routine argv's `-p` value is plain text (not a bare slash command) and names the routine.
- [ ] `npm test` + `npm run lint` pass.
- [ ] (Live, LP2) `scenarios:broker-e2e` on the current Claude: all three routines
      read the poisoned email (`messages.get` logged), non-vacuity passes, containment holds.

## Out of scope / follow-ups

- The dream's `DREAM_PROMPT` leading `/wienerdog-dream` line is NOT changed (it works;
  the trigger there is followed by context). If a future Claude tightens the parse
  further, apply the same plain-text treatment to the dream.
- **Re-certification:** once LP1/LP2/LP3 pass on the then-current Claude, update the
  scenario harness's last-certified version to it.
- **Probe-fidelity note:** the routine containment probe uses a plain-text probe
  prompt, so it PASSED on 2.1.216 while the real routine (bare slash) failed — the
  probe validates the containment envelope, not the routine's task invocation. That
  division is by design (broker-e2e covers task execution), but the probe cannot
  catch a broken routine invocation; noted for WP-routine-containment-probe.

## Definition of done

1. Verification passes; LP2 evidence pasted.
2. Conventional commit `fix(routine): plain-text trigger, not a bare slash command (Claude 2.1.216 compat) (WP-routine-plaintext-trigger)`.
3. Spec `status:` → In-Review.
