---
id: WP-040
title: Dream skill preserves provenance when updating an existing note
status: Ready
model: sonnet
size: S
depends_on: [WP-009]
adrs: []
branch: wp/040-dream-note-update-provenance
---

# WP-040: Dream skill preserves provenance when updating an existing note

## Context (read this, nothing else)

The nightly **dream** consolidates recent sessions into the user's markdown
**vault**. Its behavior is defined by a prompt file — the dream **skill** at
`skills/wienerdog-dream/SKILL.md` — that the headless brain (`claude -p`) loads.
Every note the brain writes or updates carries **provenance frontmatter**:
`origin`, `source_sessions`, `confidence`, `recurrence`, `derived_from_untrusted`
(plus `id`, `type`, `created`, `updated`). Provenance is load-bearing: the digest
renderer excludes any note flagged `derived_from_untrusted: true`, and the
orchestrator's Tier-3 code gate reads these fields to decide what may reach
identity/skills. **This WP edits only the skill's prose and its structural test —
it changes no code and starts no process (ADR-0004).**

Production defect (owner-observed, 2026-07-04): the dream **updated** a
human-curated note (`current-state.md`) and *replaced* its frontmatter wholesale —
stamping `origin: dream`, its own `source_sessions`/`confidence`, and
`derived_from_untrusted: true` — so the note's **original `origin` and `created`
(and its identity) were lost.** The skill today tells the brain that "`origin` is
always `dream`" and, for updates, only says "update an existing note in place
rather than creating a near-duplicate" — with no rule to *preserve* the existing
note's provenance. So when the brain touches a note a human (or an earlier,
differently-sourced pass) created, it overwrites history.

The fix is a set of explicit **update rules**: when modifying an EXISTING note,
preserve its original `origin`, `created`, `id`, and `type`; bump `updated` to
today; APPEND this run's sessions to `source_sessions` (never replace); and only
ever *raise* `derived_from_untrusted` toward `true` — never lower an existing
`true` to `false`. Create-case rules (a brand-new note) are unchanged.

## Current state

`skills/wienerdog-dream/SKILL.md` — the two regions to edit.

Writing mechanics under **`## Phase 3 — Consolidate (tiered gates)`** ends with:

```
- Atomic notes are one concept per file, with kebab-case filenames and
  `[[wikilinks]]` to related notes.
- Daily-log entries append under the day's daily-log file — the "Daily log file
  for today" path from your prompt.
- Update an existing note in place rather than creating a near-duplicate.
```

The **`## Provenance frontmatter (mandatory)`** section shows the frontmatter
block, then:

```
- `origin` is always `dream`.
- `source_sessions` lists the supporting sessions as `"<harness>:<session_id>"`
  (for example `"claude:sess-abc"`), one entry per distinct supporting session.
- `updated` is today's date from your prompt. On a new note, `created` is today too.
- `confidence`, `recurrence`, and `derived_from_untrusted` are the values you
  computed in Phase 2. Do not omit them — a note missing them is treated as failing
  the gate.
```

The structural test `tests/unit/dream-skill-structure.test.js` asserts headings
and key phrases are present verbatim (substring checks against the file text).
Its `## Provenance frontmatter (mandatory)` heading assertion already exists.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | skills/wienerdog-dream/SKILL.md | add "Updating an existing note" rules; scope `origin: dream` to the create case |
| modify | tests/unit/dream-skill-structure.test.js | assert the new update-preservation rules are present verbatim |

### Exact contracts

**SKILL.md — replace the `origin` bullet** in `## Provenance frontmatter
(mandatory)` so it no longer says "always", and **add a new subsection**
immediately after that bulleted list. Use this text verbatim (the structural test
below asserts these exact substrings):

Change:

```
- `origin` is always `dream`.
```

to:

```
- `origin` is `dream` on a NEW note you create. On a note that already exists,
  preserve its existing `origin` — see "Updating an existing note" below.
```

Then add, as a new `###` subsection at the end of the `## Provenance frontmatter
(mandatory)` section:

```
### Updating an existing note

When you EDIT a note that already exists (rather than creating a new one), you are
adding to a record someone else may have authored. Preserve its history — never
overwrite it:

- **Preserve** the existing `origin`, `created`, `id`, and `type` exactly as they
  are. Do not restamp `origin: dream` and do not reset `created` to today — those
  describe where the note came from and when it was first written.
- **Bump** `updated` to today's date from your prompt.
- **Append** this run's supporting sessions to the existing `source_sessions`
  list; keep the entries already there. Do not replace the list.
- For `confidence` and `recurrence`, use the values you computed in Phase 2 for
  the merged candidate (which already counts the prior sessions via recurrence).
- For `derived_from_untrusted`: you may only ever RAISE it toward `true`. If the
  existing note is already `true`, it stays `true`. If it is `false` and your new
  supporting text includes any `tool_result`-derived content, set it to `true`.
  Never lower an existing `true` to `false`.

If a note has no frontmatter yet, treat your edit as creating provenance for it:
set `created` to today and `origin: dream`.
```

**Test additions** in `tests/unit/dream-skill-structure.test.js` — add one test
(house pattern: substring assertions against the file `text`):

```js
test('dream-skill: existing-note updates preserve original provenance', () => {
  assert.ok(text.includes('### Updating an existing note'), 'update subsection heading present');
  assert.ok(
    text.includes('Preserve** the existing `origin`, `created`, `id`, and `type`'),
    'preserve-original rule present'
  );
  assert.ok(text.includes('Append** this run'), 'append-source_sessions rule present');
  assert.ok(text.includes('only ever RAISE it toward `true`'), 'raise-only derived_from_untrusted rule present');
});
```

Adjust the exact substring literals if your wording differs by punctuation, but
keep the four rules (preserve origin/created/id/type, bump updated, append
source_sessions, raise-only derived_from_untrusted) each individually asserted.

## Implementation notes & constraints

- Prose only — do NOT modify any `.js` under `src/`. In particular, do NOT add a
  code backstop to `src/core/dream/validate.js` in this WP.
- A code backstop was considered: on a MODIFIED (not added) tracked note, diff the
  new frontmatter against `git show HEAD:<path>` and repair/revert changed
  `origin`/`created`. That requires reading HEAD blobs, parsing both frontmatter
  blocks, and a merge step — beyond an S. **Leave it as a follow-up WP** (note it
  in the PR under "Discovered issues"); do not expand scope here.
- Keep GLOSSARY terms exact (provenance, dream, vault). User-facing skill prose
  may soften "dream report" to "memory report" elsewhere, but do not rename
  frontmatter keys.
- Match the file's existing markdown style (bold `**term**`, backticked keys).

## Acceptance criteria

- [ ] SKILL.md contains a `### Updating an existing note` subsection stating all
      four rules: preserve `origin`/`created`/`id`/`type`; bump `updated`; append
      to `source_sessions`; raise-only `derived_from_untrusted`.
- [ ] The `origin` bullet no longer says "always"; it scopes `origin: dream` to
      the create case.
- [ ] `tests/unit/dream-skill-structure.test.js` asserts each of the four rules
      verbatim and passes.
- [ ] `npm test` and `npm run lint` (markdownlint + frontmatter schema) pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'dream-skill'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any `validate.js` code backstop for existing-file frontmatter (follow-up WP).
- Run-job clean-env / rotation / stderr — **WP-038**.
- Dream pre-commit / crash recovery — **WP-039**.
- Persistent failure alerts — **WP-041**.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/040-dream-note-update-provenance`; conventional commits;
   PR titled `fix(dream-skill): preserve provenance on note update (WP-040)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
