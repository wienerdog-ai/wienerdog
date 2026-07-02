# This vault

This is your memory: notes an AI assistant writes and reads over time, so it
remembers things across sessions instead of starting from zero each time.
It's plain markdown files — readable with any text editor, or with the free
Obsidian app if you want a nicer view. Nothing here requires Obsidian.

## Folders

- `00-Inbox/` — unsorted notes waiting to be filed elsewhere.
- `01-Projects/` — things with a goal and an end date.
- `02-Areas/` — ongoing responsibilities with no end date (health, finances).
- `03-Resources/` — reference material you might want again later.
- `04-Archive/` — projects and areas that are no longer active.
- `05-Skills/` — reusable how-to instructions the assistant has learned.
- `06-Identity/` — who you are: role, preferences, goals, working style.
- `07-Daily/` — one note per day, a running log.
- `reports/dreams/` — nightly summaries of what changed and why.

These are the "PARA" folders (Projects, Areas, Resources, Archive), a common
way to organize notes so anything can be filed in one obvious place.

## Note format

One idea per note ("atomic"). File names are lowercase-with-hyphens, e.g.
`client-onboarding-checklist.md`. Related notes link to each other with
double brackets, e.g. `[[client-onboarding-checklist]]` — this is how
Obsidian (and the assistant) find connections between notes.

## Frontmatter

Every note starts with a YAML block:

```yaml
---
id: <unique-id>
type: note | daily | moc | skill | identity
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: []
status: active | incubating | archived
---
```

Notes the assistant writes on its own (not typed by you) also carry
provenance fields: `origin`, `source_sessions`, `confidence`, `recurrence`,
`derived_from_untrusted`. These record where a claim came from, so anything
uncertain can be checked before it's trusted.

## Rules

- `06-Identity/` is the source of truth. Your CLAUDE.md/AGENTS.md files are
  generated (rendered) from what's in here — edit identity here, not there.
- This vault holds knowledge, never machine/app state (no config, no secrets,
  no logs — those live elsewhere).
