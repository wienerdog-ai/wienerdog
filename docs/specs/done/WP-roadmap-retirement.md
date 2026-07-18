---
id: WP-roadmap-retirement
title: Split ROADMAP.md into MILESTONES.md + logbook/ entries, delete it, repoint references, backfill the ADR index
status: Done
model: opus
size: M
depends_on: [WP-160, WP-spec-ritual-updates]
adrs: [ADR-0029]
epic: spec-system
---

# WP-roadmap-retirement: Retire ROADMAP.md (ADR-0029, part 3 of 3)

## Context (read this, nothing else)

ADR-0029 (Accepted): spec frontmatter is the sole authority for WP
status/dependencies; hand-maintained aggregate views are retired. WP-160
switched the machine gates (ROADMAP is no longer implicitly allowed by
boundary-check); WP-spec-ritual-updates rewired the prose rituals (agents,
template, glossary, CLAUDE.md) — both Done. What remains is the file itself:
`docs/specs/ROADMAP.md` (~1500 lines) mixes (a) the M0–M7 milestone
acceptance table — original, low-churn content worth keeping; (b) a WP status
table + mermaid dependency graph — pure hand-synced duplicates of spec
frontmatter, NOT preserved (views are generated on demand); and (c) ~70
narrative blockquote blocks — dated incident retros and chain rationale, the
file's only other original content, which move to per-entry logbook files so
parallel writers can never conflict (ADR-0029; changesets pattern).

## Current state

- `docs/specs/ROADMAP.md`: `## Milestones` table (lines 5–16), `## Work
  packages` table with interleaved `> **…**` blockquote narrative clusters
  separated by `<!-- -->` spacers (lines 18–1293), `## Dependency graph`
  mermaid (1294–end). Narrative entry headers look like
  `> **First-production-night incident (2026-07-04).** …`; some blockquote
  blocks have no dated header — they continue the preceding dated entry.
- `docs/specs/logbook/` does not exist.
- `docs/PRD.md` line 39 ends: "Acceptance criteria per milestone live in
  `docs/specs/ROADMAP.md`."
- `docs/specs/README.md` line 20: "Index and dependency graph:
  [ROADMAP.md](ROADMAP.md). Template: [_TEMPLATE.md](_TEMPLATE.md)."
- `.github/ISSUE_TEMPLATE/work-package-proposal.yml` line 21: "Which
  milestone (docs/specs/ROADMAP.md), which existing WPs it depends on, which
  ADRs constrain it."
- `docs/adr/README.md` index table rows stop at 0020; ADRs 0021–0029 exist on
  disk but have no rows (all Accepted).
- Historical ROADMAP mentions inside done/ spec bodies and
  `memory/lessons/inbox.md` are inert records — deliberately NOT edited.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | docs/specs/MILESTONES.md | M0–M7 table, release-gate framing |
| create | docs/specs/logbook/ | one file per dated narrative entry |
| delete | docs/specs/ROADMAP.md | via `git rm` |
| modify | docs/PRD.md | milestone pointer → MILESTONES.md |
| modify | docs/specs/README.md | line 20 pointer paragraph |
| modify | .github/ISSUE_TEMPLATE/work-package-proposal.yml | epic wording |
| modify | docs/adr/README.md | backfill rows 0021–0029 |

### Exact contracts

**`docs/specs/MILESTONES.md`**: title `# Milestones — release gates`; one
intro paragraph stating these are the project's historical build phases and
release-gate acceptance criteria, that WPs no longer carry a milestone field,
and that optional grouping is the `epic:` frontmatter field (ADR-0029); then
the M0–M7 table copied byte-identical from ROADMAP lines 7–16.

**Logbook extraction rule** (apply mechanically, entries in file order):

1. An entry STARTS at a blockquote block whose first line matches
   `^> \*\*.*\([0-9]{4}-[0-9]{2}-[0-9]{2}`. Subsequent blockquote blocks
   without such a dated header (including `<!-- -->`-separated continuations
   like `> **WP-054** adds …`) belong to the SAME entry.
2. Filename: `docs/specs/logbook/<date>-<kebab-slug-of-header-title>.md`,
   where the header title is the bold text before the parenthesis, kebab-cased
   (lowercase, non-alphanumerics → `-`, collapse repeats, trim). Keep names
   unique; on a same-date title collision append a short disambiguator.
3. File format — frontmatter then dequoted body:

   ```markdown
   ---
   date: YYYY-MM-DD
   title: <header title verbatim>
   related_wps: [WP-038, WP-039, WP-041]
   ---

   # <header title> (YYYY-MM-DD)

   <entry text with the `> ` quote prefix stripped and `<!-- -->` spacers
   replaced by blank lines; wrapping and all inline markdown preserved>
   ```

   `related_wps` = sorted unique `WP-\d{3}` ids appearing anywhere in the
   entry text.
4. The WP status table rows and the mermaid graph are NOT extracted anywhere
   — that information lives in spec frontmatter and views are generated on
   demand (ADR-0029).

**`docs/PRD.md`** line 39: `docs/specs/ROADMAP.md` → `docs/specs/MILESTONES.md`.

**`docs/specs/README.md`** line 20 becomes:

```markdown
Status and dependencies live in each spec's frontmatter — generate any table or graph view on demand. Release gates: [MILESTONES.md](MILESTONES.md). Narrative history: [logbook/](logbook/). Template: [_TEMPLATE.md](_TEMPLATE.md).
```

**Issue template** line 21 description becomes: "Which epic (if any), which
existing WPs it depends on (spec frontmatter is the source of truth), which
ADRs constrain it. Release gates: docs/specs/MILESTONES.md."

**`docs/adr/README.md`**: append rows 0021–0029 to the index table in the
existing format, titles taken from each ADR's H1, all `Accepted`; mark 0003's
style of amendment references only where an ADR header states one (0029 needs
no amendment marker — it retires a non-ADR design).

## Implementation notes & constraints

- Extraction MUST be scripted outside the repo (scratchpad), reviewed, then
  written — no hand-retyping of 1300 lines. The script is throwaway; do not
  commit it (ADR-0004 spirit: no new repo tooling).
- Verify entry-count conservation: number of logbook files == number of dated
  headers; total dated headers + continuation blocks == 70 blockquote blocks.
  Record both counts in the PR body.
- Logbook files are NOT WP specs: `check-frontmatter.js` ignores them (glob
  prefix `WP-`), but markdownlint runs on them — keep the format above.
- `memory/lessons/inbox.md` and done/ spec bodies keep their historical
  ROADMAP mentions untouched.

## Acceptance criteria

- [ ] `docs/specs/ROADMAP.md` no longer exists; `git log` still preserves it.
- [ ] `ls docs/specs/logbook/ | wc -l` equals the dated-header count recorded
      in the PR body; every file has valid frontmatter (date, title,
      related_wps) and a dequoted body.
- [ ] MILESTONES.md table is byte-identical to the former ROADMAP M-table.
- [ ] `grep -rn "ROADMAP" docs/PRD.md docs/specs/README.md .github/` → no hits.
- [ ] `docs/adr/README.md` has exactly one row per ADR file 0001–0029.
- [ ] `npm run lint` and `npm test` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
ls docs/specs/logbook | wc -l
grep -rn "ROADMAP" docs/PRD.md docs/specs/README.md .github/ || echo CLEAN
ls docs/adr/*.md | wc -l
```

## Out of scope (do NOT do these)

- Converting `memory/lessons/inbox.md` to a per-entry directory — recommended
  follow-up in ADR-0029, separate decision.
- Any generated-view tooling (`wp list`, CI-published tables) — rejected as
  YAGNI in ADR-0029.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; title `docs(specs): retire ROADMAP.md (WP-roadmap-retirement)`.
3. This spec's `status:` flipped and the file moved to `done/` on completion.
