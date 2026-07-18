# ADR-0029: Spec identity is a slug; frontmatter is the only authority; shared views are generated, never hand-written

Status: Accepted
Date: 2026-07-18

> **OWNER-RATIFIED (2026-07-19).** Felho approved the migration after two wd-architect
> review passes. Implemented by **WP-160** (gate/ritual updates — the last numbered WP)
> and **WP-roadmap-retirement** (ROADMAP split and deletion — the first slug-id WP).
> Drafted from the 2026-07-18 owner walkthrough of the WP-153/154 collision and the
> ROADMAP merge-conflict retro. Retires the hand-maintained `docs/specs/ROADMAP.md`
> design (M0-era, never ADR-recorded) and builds on ADR-0005's spec-driven workflow.

## Context

Two engineers work on a shared `main` (two clones, sync via pull — no WP branches in
practice). Every WP lifecycle step today writes three hand-synced copies of the same
facts: the spec's frontmatter, the `ROADMAP.md` table row, and the `ROADMAP.md` mermaid
graph. The global `WP-NNN` counter collides whenever two specs are drafted in parallel
(WP-153 twice → a manual "+1 renumber" plus a follow-up fix commit for the missed mermaid
edges), and the ROADMAP table conflicts on nearly every pull. Evidence gathered during the
retro: nothing in `scripts/`, `src/`, or CI reads the ROADMAP's status, dependency, or
milestone data; the Milestone column was never consciously used (105 of 159 WPs stamped
"M7" once the phase sequence was consumed); and the same counter disease exists in ADR
numbering (ADR-0028 is reserved by in-flight A7 specs while this draft was being written).
The repo already enforces spec frontmatter with a deterministic CI gate
(`scripts/check-frontmatter.js` + `tests/schemas/spec.schema.json`), so the enforcement
layer exists — only the shape is wrong.

## Decision

Per-item facts live in per-item files; every shared aggregate is either generated on
demand or effectively write-free. Concretely:

1. **WP identity is a slug**: `WP-<kebab-slug>` (e.g. `WP-executable-identity-pinning`),
   chosen at draft time, used in `id`, filename, `depends_on`, and commit trailers. No
   global counter. The schema `id` pattern becomes `^WP-[a-z0-9]+(-[a-z0-9]+)*$`
   (strict kebab: no trailing or doubled hyphens), which existing numeric ids
   (`WP-154`) already match — done/ history needs no renames and `depends_on`
   references stay valid. The `branch:` frontmatter field is retired: the branch name
   is no longer an authoritative spec field. Retiring the field does not itself forbid
   branches, and the `pull_request`-scoped CI gates (boundary check, PR title) remain;
   how `CLAUDE.md` words the branch/PR discipline is settled in item 5.
2. **Spec frontmatter is the sole authority** for status and dependencies. A new
   **optional `epic:`** field (pattern `^[a-z0-9]+(-[a-z0-9]+)*$`, e.g. `audit-a7`) replaces
   the Milestone column — the grouping the team actually uses. There is exactly one
   grouping field; solo fixes legitimately have none.
3. **`docs/specs/ROADMAP.md` is retired.** The M0–M7 acceptance table moves to
   `docs/specs/MILESTONES.md` as a historical/release-gate document (low-churn, hand
   written — acceptable). The narrative incident retros move to `docs/specs/logbook/`,
   one file per entry, `YYYY-MM-DD-<slug>.md` with `related_wps:` frontmatter — one file
   per entry so parallel writers never touch the same file (the npm "changesets"
   pattern). Status tables and dependency graphs are views an agent generates from
   frontmatter when asked; they are never committed.
4. **Enforcement stays in the existing gates, no new tooling**: update
   `tests/schemas/spec.schema.json` (id pattern, add optional `epic`, drop `branch`) and
   extend `scripts/check-frontmatter.js` with cross-file checks — `id` uniqueness across
   `docs/specs/` ∪ `docs/specs/done/` (the checker's glob today scans only `docs/specs/`
   and must also scan `done/`), and every `depends_on` entry resolves to an existing
   spec's `id` in either directory. Note two side effects the implementing WP must
   handle: extending the glob newly subjects all archived `done/` specs to full schema
   validation (verified conformant at drafting time), and id collection must reuse the
   existing leading-block `parseFrontmatter` — several done/ specs contain example
   `id:` lines in their bodies that a grep-based approach would wrongly ingest.
   Consistent with ADR-0022, whose boundary statement scopes `check-frontmatter.js` to
   repo docs. A `wp list` CLI and a `new-wp` scaffolder were considered and rejected
   (YAGNI — agents read frontmatter directly).
5. **Every ritual site updates in the same migration** (verified by repo-wide grep for
   `ROADMAP`, `branch:`, and `WP-[0-9]{3}` assumptions):
   - `.github/workflows/ci.yml` — the boundary job's `Spec:` extraction regex and the
     pr-title trailer pattern both hardcode `WP-[0-9]{3}`; both become
     `WP-[a-z0-9][a-z0-9-]*`. **This is load-bearing**: unchanged, the boundary job's
     extraction fails to match slug specs and skips the Deliverables check silently
     (fails open), and the pr-title gate rejects slug trailers.
   - `.github/PULL_REQUEST_TEMPLATE.md` — `WP-XXX` placeholder.
   - `CLAUDE.md` Git-discipline section: drop the "(from your spec's frontmatter)"
     clause from the Branch line and update the commit-trailer example to the slug form,
     **plus regenerated `AGENTS.md`** — CI enforces their sync (`gen-agents-md.js
     --check`). The written "never commit to main / one PR per WP" discipline stays
     as-is (owner decision, 2026-07-18): this working repo is transitional, and whether
     direct-to-main commits become policy will be decided in the canonical repo — not
     codified here.
   - `docs/GLOSSARY.md` — fix the `work package` entry ("one branch, one PR" clause),
     add `slug`, `epic`, and `logbook` as canonical terms.
   - `wd-architect` agent: drop "check ROADMAP for numbering / update table + mermaid";
     replacement duties stated positively — choose a kebab slug (uniqueness enforced by
     lint), read `depends_on` across `docs/specs/` and `done/` for dependency fit
     (generate a view on demand if needed), consult `MILESTONES.md` and set optional
     `epic:`, and record incident/chain retros as `docs/specs/logbook/` entries (the
     retro-authorship duty the retired ROADMAP ritual carried).
   - `wd-reviewer` agent + `scripts/boundary-check.js` (code and header doc-comment) +
     its test — drop the ROADMAP always-allowed exception.
   - `docs/specs/_TEMPLATE.md` — frontmatter shape (`id:` placeholder becomes a slug
     example), always-allowed comment, and the Definition-of-Done line ("Branch from
     frontmatter…"), reconciled with the CLAUDE.md resolution above.
   - `docs/specs/README.md` — index pointer AND its own "one branch, one PR" clause
     (line 3), fixed the same way as the GLOSSARY entry.
   - The WP-proposal issue template (milestone wording), `docs/PRD.md` line 39 (ROADMAP
     pointer → `MILESTONES.md`), and the `docs/adr/README.md` index row for this ADR —
     noting that index is already stale (rows stop at 0020 while 0021–0028 exist); the
     migration backfills 0021–0029.

## Consequences

- Two writers on shared `main` never edit the same file during normal WP lifecycle →
  the ROADMAP/renumber conflict class disappears mechanically, not by discipline. A
  same-slug collision surfaces as a git add/add conflict — a feature: it signals two
  people drafting the same work.
- No committed browsable index. Anyone wanting a table or mermaid graph asks an agent to
  generate one from frontmatter (or a future CI step can publish one; deferred until
  wanted).
- Milestone stops pretending to be a live field; `MILESTONES.md` keeps the M0–M7
  acceptance criteria as release gates.
- Migration is mechanical: extract MILESTONES.md and logbook entries from ROADMAP,
  delete ROADMAP, update schema + checker + the ritual sites in item 5. Existing specs
  keep their numeric ids; only new specs use descriptive slugs. The
  `docs/specs/ROADMAP.md` mentions inside existing specs' template-inherited
  "always allowed" HTML comments are inert (boundary-check parses the Deliverables
  table, not comments) and are deliberately not mass-edited.
- `memory/lessons/inbox.md` (same shared-append disease, CLAUDE.md documents the
  workaround) should follow the same per-entry-directory pattern — recommended follow-up,
  not part of this decision. Likewise ADR numbering itself remains a global counter
  (rare, owner-serialized writes — accepted for now; this ADR records the risk).
- We give up: at-a-glance GitHub browsing of one big roadmap file, and the familiar
  ordinal "WP-154" shorthand in conversation (slugs are longer but self-describing).
