---
id: WP-005
title: Implement setup interview skill + identity→digest renderer
status: In-Review
model: opus
size: M
depends_on: [WP-004]
adrs: [ADR-0004, ADR-0005]
branch: wp/005-interview-and-renderer
---

# WP-005: Implement setup interview skill + identity→digest renderer

## Context (read this, nothing else)

Wienerdog's onboarding is an **interview conducted by the user's own AI**: after `npx wienerdog init`, the user opens Claude Code and runs the `wienerdog-setup` skill. The model interviews them conversationally and writes the answers into the vault's `06-Identity/` notes (profile.md, preferences.md, goals.md, instructions.md — scaffolds with empty section headings already exist from WP-004). Those notes are the *source of truth*; the text injected into future sessions is a **digest** rendered from them by code.

This WP delivers (a) the interview skill — a SKILL.md folder, the format both Claude Code and Codex understand — and (b) the deterministic renderer that turns `06-Identity/` notes into `~/.wienerdog/state/digest.md`. The digest is pre-rendered so the future SessionStart hook (WP-006) only has to `cat` one file. Product invariants: user knowledge lives in the vault, never in `~/.wienerdog` (mechanics only); nothing here starts a process (ADR-0004).

## Current state

From WP-004: `templates/vault/06-Identity/*.md` scaffolds with frontmatter (`type: identity`) and empty section headings — profile: Role/Background/Context; preferences: Communication/Tools/Workflow; goals: Now/This year; instructions: How to work with me. From WP-003: `src/core/paths.js` (`getPaths`), `config.yaml` with `vault: <path>` and `memory_mode: standard`. `skills/` directory does not exist yet at repo root. `src/cli/` has init/doctor/uninstall.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | skills/wienerdog-setup/SKILL.md | the interview |
| create | src/core/digest.js | renderer |
| create | src/cli/sync.js | v1: renders digest only |
| modify | bin/wienerdog.js | wire `sync` |
| create | tests/unit/digest.test.js | |
| create | tests/fixtures/identity-filled/ | filled example 06-Identity notes |
| create | tests/golden/digest-default.md | expected digest for the fixture |

### Exact contracts

`skills/wienerdog-setup/SKILL.md` — frontmatter `name: wienerdog-setup`, `description: Set up Wienerdog: interview the user and build their identity notes. Use when the user asks to set up or reconfigure Wienerdog.` Body must instruct the model to:
0. **Reconfigure mode**: if `06-Identity/profile.md` already has content beyond the scaffold, do NOT redo the full interview — present a short menu ("What would you like to adjust? profile / preferences & tone / goals / standing instructions / memory mode") and update only the chosen section(s), then continue at step 5–6. This makes the skill the product's settings panel — re-runnable anytime.
1. Read `~/.wienerdog/config.yaml` for the vault path; verify the vault exists (if not, tell the user to run `npx wienerdog init` and stop).
2. Interview conversationally — **one topic at a time, ≤10 minutes total**: role & background; current projects/responsibilities; communication preferences (depth, tone, format); tools they live in; goals (now / this year); "anything your AI should always know or never do".
3. Ask about existing memory: do they already keep an Obsidian vault or notes system? (If yes: record its path in the conversation and tell them adapter adoption arrives in a later version — do not move files.)
4. Ask which `memory_mode` they want, explained in plain language: conservative ("AI proposes, remembers less, asks more") / standard / eager ("remembers aggressively") — update the `memory_mode:` line in config.yaml.
5. Write the answers into the four `06-Identity/*.md` files — filling the existing section headings, updating `updated:` in frontmatter, `origin: interview` — atomic, factual, no filler.
6. Run `wienerdog sync` via the shell and confirm to the user what their AI now knows (quote the digest).
The skill must state: never write outside the vault and config.yaml; never touch CLAUDE.md/AGENTS.md directly (the renderer owns that content).

`src/core/digest.js`:
```js
/** renderDigest(vaultDir) → string
 *  Deterministic, no model calls. Reads 06-Identity/{profile,preferences,goals,
 *  instructions}.md + the newest 07-Daily/*.md (if any) + 01-Projects/* dirs
 *  (names only). Output (≤120 lines) exactly:
 *    "# Who you're working with\n" + compacted profile sections
 *    "\n## Preferences\n" + compacted preferences
 *    "\n## Goals\n" + compacted goals
 *    "\n## Standing instructions\n" + compacted instructions
 *    "\n## Active projects\n" + "- <name>" per project dir
 *    "\n## Latest daily log (<date>)\n" + that file's "## Summary" section if present
 *  "Compacted" = strip frontmatter, drop empty sections/headings, collapse
 *  blank runs to one. Sections whose source file is missing are omitted.
 *  Skips any note whose frontmatter has derived_from_untrusted: true. */
```

`src/cli/sync.js`: `wienerdog sync` → read config for vault path, `renderDigest`, write `~/.wienerdog/state/digest.md` (atomic write: temp file + rename), print a 1-line confirmation with the byte count. Exit 1 with a clear message if vault missing/unset.

## Implementation notes & constraints

- The renderer is pure code — no model invocation anywhere in this WP.
- Frontmatter parsing: reuse the flat-subset parser approach from `scripts/check-frontmatter.js` (WP-001) — copy the ~30 lines into `src/core/frontmatter.js`? NO — that file is not in your Deliverables; inline a minimal parser in digest.js with a comment noting future extraction (say so in "Decisions made").
- Fixture `tests/fixtures/identity-filled/` is a mini-vault: the four identity notes filled with a fictional persona ("Ada Kovács, product lead…"), one project dir, one daily note. Golden digest matches it byte-for-byte.
- SKILL.md is product voice: plain language, knowledge-worker audience.

## Acceptance criteria

- [ ] `renderDigest` on the fixture equals `tests/golden/digest-default.md` byte-for-byte.
- [ ] A note with `derived_from_untrusted: true` in 06-Identity is excluded from the digest (unit test).
- [ ] `wienerdog sync` on a temp install writes `state/digest.md` atomically and idempotently (same input → identical bytes, no temp litter).
- [ ] SKILL.md passes `npm run lint` (markdownlint + agent/skill frontmatter conventions) and contains all six interview steps above.
- [ ] `npm test`, `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
export WIENERDOG_HOME=$(mktemp -d)/wd WIENERDOG_VAULT=$(mktemp -d)/vault
node bin/wienerdog.js init --yes
cp -R tests/fixtures/identity-filled/06-Identity/* $WIENERDOG_VAULT/06-Identity/
node bin/wienerdog.js sync && head -20 $WIENERDOG_HOME/state/digest.md
node bin/wienerdog.js sync   # idempotent, identical bytes
```

## Out of scope (do NOT do these)

- Installing the skill into `~/.claude/skills` / Codex `[skills]` and the SessionStart injection hook (WP-006). Managed CLAUDE.md/AGENTS.md blocks (WP-006). Existing-vault migration/adoption mechanics. Dreaming (WP-008/009). Live end-to-end interview testing (manual, at M2 review).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/005-interview-and-renderer`; PR titled `feat(setup): implement interview skill and digest renderer (WP-005)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
