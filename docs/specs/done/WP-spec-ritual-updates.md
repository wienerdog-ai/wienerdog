---
id: WP-spec-ritual-updates
title: Update the prose ritual sites to the slug/frontmatter spec system — agents, template, glossary, CLAUDE.md
status: Done
model: sonnet
size: M
depends_on: [WP-160]
adrs: [ADR-0005, ADR-0029]
epic: spec-system
---

# WP-spec-ritual-updates: Prose ritual sites for ADR-0029 (part 2 of 3 — the first slug-id WP)

## Context (read this, nothing else)

ADR-0029 (Accepted): WP identity is a kebab slug (`WP-<slug>`), spec
frontmatter is the sole authority for status/dependencies/epic, and the
hand-maintained `docs/specs/ROADMAP.md` is being retired. WP-160 (Done)
already switched the machine gates: schema accepts slug ids, `branch:` is
retired, optional `epic:` exists, cross-file id/depends_on checks run in
lint, and `boundary-check` no longer implicitly allows ROADMAP.

This WP updates the PROSE sites that still teach the old rituals, so agents
and implementers stop being instructed to do things the gates no longer
support. The ROADMAP file itself still exists and is deleted by the third
WP (`WP-roadmap-retirement`) — do not touch it here.

Owner decision recorded in ADR-0029: the "Never commit to main / one PR per
WP" discipline stays as written (this working repo is transitional); only the
branch-field reference and the WP-XXX numbering examples change.

## Current state

- `.claude/agents/wd-architect.md` line 14: "Check `docs/specs/ROADMAP.md`
  for numbering, dependencies, and milestone fit." Line 21: "Update
  `ROADMAP.md` (table + mermaid graph) with every new or changed WP."
- `.claude/agents/wd-reviewer.md` line 11: "…(the spec file itself and
  `docs/specs/ROADMAP.md` are always allowed)…"
- `docs/specs/_TEMPLATE.md`: frontmatter has `id: WP-XXX` and
  `branch: wp/XXX-short-slug`; the always-allowed comment (lines 30–31)
  names ROADMAP; Definition-of-done line 90 says "Branch from frontmatter;
  conventional commits; PR titled `feat(scope): title (WP-XXX)`."
- `docs/specs/README.md` line 3: "…one implementer session, one branch, one
  PR." (Its ROADMAP index pointer on the last line is NOT this WP's job.)
- `docs/GLOSSARY.md` line 88: work package entry ends "…sized for one
  implementer session, one branch, one PR." No `slug`/`epic`/`logbook` terms.
- `CLAUDE.md` Git-discipline: "Branch: `wp/XXX-slug` (from your spec's
  frontmatter). Never commit to main." and "Conventional commits:
  `feat|fix|docs|test|chore(scope): message (WP-XXX)`." `AGENTS.md` is
  generated from CLAUDE.md; CI enforces sync via `npm run gen:agents`.
- `.github/PULL_REQUEST_TEMPLATE.md` line 1:
  `Spec: docs/specs/WP-XXX-....md  <!-- delete this line for docs-only PRs with no spec -->`

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | .claude/agents/wd-architect.md | new slug/epic/logbook rituals |
| modify | .claude/agents/wd-reviewer.md | drop ROADMAP from boundary sentence |
| modify | docs/specs/_TEMPLATE.md | slug frontmatter, comment, DoD line |
| modify | docs/specs/README.md | drop "one branch" clause only |
| modify | docs/GLOSSARY.md | WP entry fix + slug/epic/logbook terms |
| modify | CLAUDE.md | git-discipline slug wording |
| modify | AGENTS.md | regenerate via `npm run gen:agents` |
| modify | .github/PULL_REQUEST_TEMPLATE.md | slug placeholder |

### Exact contracts

`wd-architect.md` — replace line 14 (step 2) with:

```
2. Choose a kebab slug id (`WP-<slug>`; uniqueness across `docs/specs/` and `done/` is lint-enforced), read `depends_on` across `docs/specs/` and `docs/specs/done/` for dependency fit, consult `docs/specs/MILESTONES.md` for release-gate context, and set the optional `epic:` field when the WP belongs to a larger stream.
```

Replace line 21 (the "Update ROADMAP" rule) with:

```
- Record incident/chain retros as dated `docs/specs/logbook/` entries (`YYYY-MM-DD-<slug>.md`, `related_wps:` frontmatter). Never hand-maintain an aggregate status table or dependency graph — views are generated from frontmatter on demand (ADR-0029).
```

`wd-reviewer.md` line 11: "(the spec file itself and `docs/specs/ROADMAP.md`
are always allowed)" → "(the spec file itself is always allowed)".

`docs/specs/_TEMPLATE.md`:

- frontmatter: `id: WP-XXX` → `id: WP-short-slug` with trailing comment
  `# kebab slug — becomes the filename WP-short-slug.md`; DELETE the
  `branch:` line; ADD after `adrs:` this commented-out line (the frontmatter
  parser skips `#`-prefixed lines, so copies lint clean until it is
  deliberately enabled):
  `# epic: audit-a7       # optional — uncomment and set when part of a larger stream`
- heading `# WP-XXX: <title>` → `# WP-<slug>: <title>`
- always-allowed comment: drop `docs/specs/ROADMAP.md,` (keep the spec file
  itself and package-lock.json).
- Definition-of-done item 2 → `2. Conventional commits; PR titled
  `feat(scope): title (WP-<slug>)`.`

`docs/specs/README.md` line 3: "one implementer session, one branch, one PR"
→ "one implementer session, one PR". Nothing else.

`docs/GLOSSARY.md`: in the work package entry, "one implementer session, one
branch, one PR" → "one implementer session, one PR"; then insert directly
after it these three entries:

```
- **slug** — the kebab-case identity of a work package (`WP-<slug>`), chosen at draft time, globally unique across `docs/specs/` and `done/` (lint-enforced), never renumbered (ADR-0029). Legacy numeric ids (`WP-042`) are valid slugs.
- **epic** — optional kebab-case frontmatter label grouping related WPs into a stream (e.g. `audit-a7`). The only grouping field on a spec; WPs carry no milestone.
- **logbook** — dated narrative entries in `docs/specs/logbook/` (`YYYY-MM-DD-<slug>.md`, `related_wps:` frontmatter): incident retros and chain rationale. One file per entry so parallel writers never conflict.
```

`CLAUDE.md` Git-discipline: "Branch: `wp/XXX-slug` (from your spec's
frontmatter). Never commit to main." → "Branch: `wp/<slug>`. Never commit to
main." and "`feat|fix|docs|test|chore(scope): message (WP-XXX)`" →
"`feat|fix|docs|test|chore(scope): message (WP-<slug>)`". Then run
`npm run gen:agents` to regenerate `AGENTS.md`.

`.github/PULL_REQUEST_TEMPLATE.md` line 1: `WP-XXX-....md` → `WP-<slug>.md`.

## Implementation notes & constraints

- English only in all file content.
- Do NOT touch `docs/specs/ROADMAP.md`, `docs/PRD.md`, the issue template,
  or `docs/adr/README.md` — those belong to `WP-roadmap-retirement`.
- MILESTONES.md and `docs/specs/logbook/` do not exist yet; the new prose may
  reference them (they land in the third WP of this epic, same migration).

## Acceptance criteria

- [ ] `grep -rn "ROADMAP" .claude/agents/ docs/specs/_TEMPLATE.md` → no hits.
- [ ] `grep -n "one branch" docs/specs/README.md docs/GLOSSARY.md` → no hits.
- [ ] `grep -n "WP-XXX" CLAUDE.md .github/PULL_REQUEST_TEMPLATE.md docs/specs/_TEMPLATE.md` → no hits.
- [ ] `npm run gen:agents -- --check` (or the lint pipeline) confirms
      AGENTS.md is in sync.
- [ ] `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
grep -rn "ROADMAP" .claude/agents/ docs/specs/_TEMPLATE.md || echo CLEAN
grep -rn "one branch" docs/specs/README.md docs/GLOSSARY.md || echo CLEAN
grep -rn "WP-XXX" CLAUDE.md .github/PULL_REQUEST_TEMPLATE.md docs/specs/_TEMPLATE.md || echo CLEAN
```

## Out of scope (do NOT do these)

- ROADMAP split/deletion, MILESTONES.md, logbook creation, PRD/issue-template/
  ADR-index edits — `WP-roadmap-retirement`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; title `docs(specs): slug-era ritual sites (WP-spec-ritual-updates)`.
3. This spec's `status:` flipped and the file moved to `done/` on completion.
