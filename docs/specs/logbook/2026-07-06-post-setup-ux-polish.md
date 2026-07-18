---
date: 2026-07-06
title: Post-setup UX polish
related_wps: [WP-020, WP-065, WP-066]
---

# Post-setup UX polish (2026-07-06)

**Post-setup UX polish (2026-07-06, two parallel S WPs).** A full
`/wienerdog-setup` on Windows produced two platform-agnostic UX asks. **WP-065**
(setup skill only) makes the interview's closed-choice items — the Step 0
adjust-menu, preferred tone, the fresh/import/adopt vault choice, and memory
eagerness — ask via a **structured multiple-choice question where the harness
provides one** (Claude Code's `AskUserQuestion`) and via a plain **numbered
list where it does not** (Codex CLI), with the binding invariant that the user
can always type a custom answer (Claude Code's `AskUserQuestion` supplies the
free-text "Other" automatically). Genuinely open items (role, projects, tools,
goals, standing rules) stay free-text — exactly four `(closed-choice)` markers,
no over-structuring. **WP-066** adds a frozen one-sentence **dream catch-up
reassurance** to every surface that discloses the 03:30 schedule — `init.js`
and `adopt.js` summaries and the README Dreaming bullet — so users never think
they must leave the machine on overnight; it *extends* ADR-0014's plain
disclosure (the 03:30 time still stated), it does not weaken it. The two WPs
share **no files** (WP-065 owns `skills/wienerdog-setup/SKILL.md` outright,
including that skill's copy of the reassurance, so the CLI/README changes in
WP-066 never collide with it) and carry no dependency — they land in parallel.
Neither needs a new ADR: the reassurance surfaces a behavior ADR-0014 already
guarantees (WP-020 catch-up), and vendor-neutral graceful degradation is a
local skill-authoring choice.
