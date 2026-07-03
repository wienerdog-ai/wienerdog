---
id: WP-025
title: Guided import from an existing vault (setup skill step 3)
status: In-Review
model: sonnet
size: S
depends_on: [WP-022]
adrs: [ADR-0010]
branch: wp/025-guided-import
---

# WP-025: Guided import from an existing vault (setup skill step 3)

## Context (read this, nothing else)

`/wienerdog-setup` is the interview skill the user's own model runs to build their
identity notes (`06-Identity/`), from which `wienerdog sync` renders the injected
session digest. Its **step 3 ("Existing notes")** currently DEFERS any handling of an
existing notes system:

> If they do, note where it lives … and let them know that automatically adopting an
> existing notes system is coming in a later version. **Do not move, copy, or change
> any of their existing files.**

ADR-0010 (read it) replaces that deferral with **three explicit vault paths** the user
chooses between:

1. **Fresh vault** (default, unchanged) — keep the freshly-scaffolded `~/wienerdog/`.
2. **Fresh vault + guided import** — with consent, the interview reads the user's
   existing vault **read-only**, mines identity / preferences / goals / active
   projects into the NEW vault's `06-Identity/` + `01-Projects/` seeds with
   `origin: import` provenance, then shows the user exactly what it took.
3. **Full adoption** (power users) — use the existing vault in place; performed by the
   `wienerdog adopt <path>` CLI (WP-026), NOT by this skill.

This WP rewrites step 3 to present all three paths and to fully implement path 2
(guided import). Path 1 is trivial (do nothing). Path 3 points the user at
`wienerdog adopt`. This is a **prompt-only** change plus a structural test — the skill
is markdown instructions the user's model follows; there is no Node code here.

Invariants (do not weaken):

- **Read-only mining.** Import NEVER moves, copies wholesale, or edits the user's
  existing vault. It reads it and writes *derived* seeds into the NEW vault only.
- **Only write inside the vault and `config.yaml`** (an existing hard rule of this
  skill). Import writes only under the new vault's `06-Identity/` and `01-Projects/`.
- **Provenance is mandatory.** Every imported note carries frontmatter with
  `origin: import` (a canonical GLOSSARY provenance origin alongside interview /
  capture / dream / manual).

Canonical terms (GLOSSARY): **vault**, **interview**, **digest**, **provenance**.

## Current state

### `skills/wienerdog-setup/SKILL.md` — the file you rewrite (step 3 only)

The whole skill exists (WP-005). Its structure: Step 0 (setting up vs adjusting),
Step 1 (find the vault), Step 2 (the interview), **Step 3 (Existing notes — the
deferral you replace)**, Step 4 (memory mode), Step 5 (write the four identity
notes), Step 6 (sync + confirm). The two hard rules at the top ("Only ever write
inside the vault and `config.yaml`"; "Never touch CLAUDE.md/AGENTS.md yourself") and
Steps 0–2, 4–6 stay as they are. You change **only Step 3**.

Step 5 already names the four identity notes the interview fills:

- `06-Identity/profile.md` — Role, Background, Context.
- `06-Identity/preferences.md` — Communication, Tools, Workflow.
- `06-Identity/goals.md` — Now, This year.
- `06-Identity/instructions.md` — How to work with me.

Import must populate the SAME four notes (plus project seeds), so it dovetails with
Step 5's write and Step 6's sync.

### Provenance frontmatter (the shape imported seeds carry)

From ARCHITECTURE.md, the mandatory note frontmatter — imported seeds use
`origin: import`:

```yaml
---
id: 2026-07-03-example-slug
type: note | identity | moc
created: 2026-07-03
updated: 2026-07-03
tags: []
status: active
origin: import
source_sessions: []
confidence: 0.7
recurrence: 1
derived_from_untrusted: false
---
```

For identity notes the interview already writes (Step 5), `origin` is normally
`interview`; when a section's content came from the imported vault, set
`origin: import` on that note so its source is auditable.

### Existing structural tests (the pattern to copy)

`tests/unit/dream-skill-structure.test.js`,
`tests/unit/google-setup-skill-structure.test.js`, and
`tests/unit/routines-skill-structure.test.js` each read a SKILL.md as text and assert
required phrases/sections are present. There is currently **no** structure test for
`wienerdog-setup`; you create one.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | skills/wienerdog-setup/SKILL.md | rewrite Step 3 into the three-path model; fully specify guided import |
| create | tests/unit/setup-skill-structure.test.js | assert the three paths, read-only guarantee, `origin: import`, and the "what was taken" summary are present |

Do NOT touch any Node source, `init.js`, the adopt CLI (WP-026), or any other skill.

### Exact contracts

#### 1. `skills/wienerdog-setup/SKILL.md` — new Step 3 (replace the current Step 3 text)

Rewrite Step 3 to read approximately as follows (keep the plain-language,
knowledge-worker tone of the rest of the skill; wording may vary but every labeled
element below MUST appear):

- **Ask whether they already keep an existing vault or notes system** (Obsidian or
  otherwise), and where it lives.
- **Offer three choices, in plain language:**
  1. **Start fresh** — keep the new empty vault; do nothing with the old one. (Default
     if they are unsure.)
  2. **Import from it** — you read their old vault once, pull the useful facts about
     them into the new vault, and leave the old vault completely untouched. Best for
     most people with existing notes.
  3. **Adopt it in place** (power users) — Wienerdog uses their existing vault AS the
     vault. Explain this is done from the terminal, not here: they should finish or
     exit setup and run `wienerdog adopt <path-to-their-vault>`, which checks the
     prerequisites (a normal local folder, not iCloud/Documents; a git repo — it will
     offer to set one up) and confirms the folder layout with them. Do NOT attempt
     adoption from inside this skill.
- **If they choose Import**, do this:
  - Ask for the path to their existing vault. Read it **read-only**. State plainly,
    in the skill text, that you must **never move, copy wholesale, edit, or delete any
    file in their existing vault** — you only read it.
  - Mine four things: who they are (role/background), how they like to work
    (preferences/tone/tools), what they are working toward (goals), and their current
    active projects. Look in the obvious places (an identity/about note, a profile,
    recent daily notes, project folders/MOCs).
  - Write what you found into the NEW vault's identity notes — the same four files
    Step 5 uses (`06-Identity/profile.md`, `preferences.md`, `goals.md`,
    `instructions.md`) — and seed each active project as
    `01-Projects/<kebab-name>/index.md`. Only write facts you actually found; invent
    nothing.
  - On every note you write from imported content, set the frontmatter `origin:` to
    **`import`** (not `interview`), so the source is auditable. Keep the other
    provenance fields (see the frontmatter shape above).
  - **Then show them exactly what was taken**: list, in the conversation, each fact or
    project you imported and which file it went into, so they can see and correct it.
    This "what was taken" summary is mandatory — import is never silent.
  - After importing, continue the interview normally (Steps 4–6) to fill any gaps and
    let them adjust anything the import got wrong.
- **If they choose Start fresh or Adopt**, skip the mining entirely and continue.

Add one sentence noting that adoption's own layout-mapping and prerequisites are
handled by `wienerdog adopt` (ADR-0010), so this skill never edits the old vault.

Do not change the two top-of-file hard rules or Steps 0–2, 4–6.

#### 2. `tests/unit/setup-skill-structure.test.js` (create)

A `node:test` file (name a test with `setup-skill` for
`--test-name-pattern setup-skill`). Read
`skills/wienerdog-setup/SKILL.md` as UTF-8 text and assert (case-insensitive
`includes` is fine) that Step 3 now contains:

- all three options — phrases matching **start fresh**, **import**, and **adopt** (the
  latter alongside the command `wienerdog adopt`);
- the read-only guarantee — a phrase asserting the existing vault is never moved,
  copied, edited, or deleted (assert on a stable keyword like `read-only` AND
  `never` near "move"/"edit" — pick literal substrings that your rewritten prose
  actually contains, and keep them stable);
- the provenance marker `origin: import`;
- an instruction to show the user what was imported (assert on a stable phrase such
  as `what was taken` or `show them` — again, match your actual prose).

Also assert the file still contains the pre-existing hard rule
`Only ever write inside the vault` (so the rewrite did not clobber the top rules) and
still references `wienerdog sync` (Step 6 intact).

Keep the assertions to stable literal substrings that your final SKILL.md text
contains; do not assert on wording you did not write.

## Implementation notes & constraints

- **Prompt-only + one test.** No Node source changes; the import behavior is executed
  by the user's model following the skill, not by installer code.
- **Do not implement adoption here.** Step 3 only *points* at `wienerdog adopt`; the
  CLI is WP-026. Referencing a command that lands in a later WP is intentional (the
  skill is guidance).
- **Keep prose knowledge-worker-plain** (CLAUDE.md). markdownlint must pass
  (the repo config allows long lines; still write clean markdown).
- When uncertain: choose the simpler wording and record it under "Decisions made" in
  the PR. Do NOT expand scope (no new steps, no config changes).

## Acceptance criteria

- [ ] Step 3 presents all three paths (fresh / import / adopt) and names
      `wienerdog adopt <path>` for adoption.
- [ ] The guided-import path specifies read-only mining, writing the four identity
      notes + project seeds with `origin: import`, and a mandatory "what was taken"
      summary.
- [ ] The two top-of-file hard rules and Steps 0–2, 4–6 are unchanged.
- [ ] `tests/unit/setup-skill-structure.test.js` passes and enforces the above.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern setup-skill
npm test
npm run lint      # markdownlint covers skills/wienerdog-setup/SKILL.md
```

## Out of scope (do NOT do these)

- The `wienerdog adopt` CLI, layout inference, config writing, `scaffoldMappedDirs`,
  the adoption end-to-end test (WP-026).
- The `vault_layout` layer or any dream/digest code (WP-022, WP-024).
- Changing Steps 0–2, 4–6 or the top-of-file hard rules.
- Any change that makes the skill write outside the vault/`config.yaml`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/025-guided-import`; conventional commits; PR titled
   `feat(setup): guided import from an existing vault (WP-025)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
