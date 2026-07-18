---
id: WP-160
title: Switch the spec-system machine gates to slug identity — schema, cross-file frontmatter checks, CI regexes, boundary allowlist
status: Done
model: opus
size: M
depends_on: []
adrs: [ADR-0005, ADR-0022, ADR-0029]
branch: wp/160-slug-identity-machine-gates
---

# WP-160: Slug-identity machine gates (ADR-0029, part 1 of 3 — the last numbered WP)

## Context (read this, nothing else)

ADR-0029 (Accepted, owner-ratified 2026-07-19) retires the global `WP-NNN`
counter and the hand-maintained `docs/specs/ROADMAP.md`: WP identity becomes a
kebab slug (`WP-<slug>`), spec frontmatter becomes the sole authority for
status/dependencies, and an optional `epic:` field replaces the never-used
Milestone column. Enforcement stays in the repo's existing deterministic gates
— `scripts/check-frontmatter.js` + `tests/schemas/spec.schema.json` (runs in
`npm run lint`) and the two `pull_request` CI jobs — no new standalone tooling.

This WP updates ONLY the machine gates. Two sibling WPs (created after this one
lands, already slug-id) update the prose ritual sites
(`WP-spec-ritual-updates`) and split/delete the ROADMAP
(`WP-roadmap-retirement`). This is deliberately the **last numbered WP**: its
own id must satisfy the schema that exists before it runs.

Critical trap this WP closes (found in wd-architect review): the CI boundary
job extracts the spec path from the PR body with a `WP-[0-9]{3}` regex; a
slug-named spec would not match, and the job **skips the Deliverables boundary
check silently** ("No Spec: line found"). Left unfixed, slug specs would fail
open, not fail loud.

## Current state

- `tests/schemas/spec.schema.json` — requires
  `[id, title, status, model, size, depends_on, adrs, branch]`; `id` pattern
  `^WP-\d{3}$`; `branch` pattern `^wp/`.
- `scripts/check-frontmatter.js` — hand-rolled frontmatter parser + minimal
  schema validator (`required`, `type`, `enum`, `pattern`). `main()` globs
  `docs/specs/` with prefix `WP-` (NOT `done/`) and `.claude/agents/`, validates
  each file in isolation, exits 1 on any error. No cross-file checks. No unit
  test exists for this script (the `tests/unit/frontmatter*.test.js` files test
  the product's vault parser, not this script).
- `.github/workflows/ci.yml` — `boundary` job line 59 extracts
  `Spec:[[:space:]]*docs/specs/WP-[0-9]{3}[A-Za-z0-9._-]*\.md` from the PR
  body; `pr-title` job line 81 requires titles to end `\(WP-[0-9]{3}\)$` when
  the PR body has a `Spec:` line.
- `scripts/boundary-check.js` — line 45 `allowed.add('docs/specs/ROADMAP.md')`
  plus header doc-comment (line 5) naming ROADMAP; its test
  `tests/unit/boundary-check.test.js` line 31 asserts ROADMAP is allowed
  unconditionally.
- All 96 `done/` specs and all active specs were verified conformant to the
  NEW schema at ADR-drafting time (numeric ids match the slug pattern; no
  duplicate ids; no dangling `depends_on`).

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/schemas/spec.schema.json | new id pattern, add `epic`, drop `branch` |
| modify | scripts/check-frontmatter.js | glob `done/`, add cross-file checks |
| create | tests/unit/check-frontmatter.test.js | fixture-tree tests incl. negatives |
| modify | .github/workflows/ci.yml | slug-compatible regexes, lines 59 + 81 |
| modify | scripts/boundary-check.js | remove ROADMAP allowlist (code + header comment) |
| modify | tests/unit/boundary-check.test.js | ROADMAP test now asserts REJECTION |

### Exact contracts

`tests/schemas/spec.schema.json` becomes exactly:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "WP spec frontmatter",
  "type": "object",
  "required": ["id", "title", "status", "model", "size", "depends_on", "adrs"],
  "properties": {
    "id": { "type": "string", "pattern": "^WP-[a-z0-9]+(-[a-z0-9]+)*$" },
    "title": { "type": "string" },
    "status": { "type": "string", "enum": ["Draft", "Ready", "In-Progress", "In-Review", "Done"] },
    "model": { "type": "string", "enum": ["sonnet", "opus"] },
    "size": { "type": "string", "enum": ["S", "M"] },
    "depends_on": { "type": "array" },
    "adrs": { "type": "array" },
    "epic": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" }
  }
}
```

Notes: `branch` is removed from BOTH `required` and `properties` — the
validator ignores unknown keys, so legacy `branch:` lines in existing specs
are inert, no mass edit. `epic` is optional (not in `required`).

`scripts/check-frontmatter.js`:

1. Spec glob becomes the union of `docs/specs/` and `docs/specs/done/`
   (same `WP-` prefix). Reuse `globFiles` — call it twice and concatenate.
   Side effect (intended per ADR-0029): archived done/ specs are now fully
   schema-validated on every lint run.
2. After the existing per-file validation loop, run cross-file checks over the
   collected spec frontmatters (MUST reuse the existing `parseFrontmatter`
   results — several done/ specs contain decoy `id:` lines in their bodies
   that a grep would wrongly ingest):

```js
/** @param {{file: string, fm: Record<string, string|string[]>}[]} specs
 *  @returns {string[]} */
function crossChecks(specs) {
  const errors = [];
  const byId = new Map();
  for (const { file, fm } of specs) {
    if (typeof fm.id !== 'string') continue;
    if (byId.has(fm.id)) {
      errors.push(`${file}: duplicate id "${fm.id}" (also declared in ${byId.get(fm.id)})`);
    } else {
      byId.set(fm.id, file);
    }
  }
  for (const { file, fm } of specs) {
    const deps = Array.isArray(fm.depends_on) ? fm.depends_on : [];
    for (const dep of deps) {
      if (!byId.has(dep)) {
        errors.push(`${file}: depends_on "${dep}" does not resolve to any spec id`);
      }
    }
  }
  return errors;
}
```

`.github/workflows/ci.yml` — exactly two regex changes, nothing else:

- line 59: `WP-[0-9]{3}[A-Za-z0-9._-]*\.md` → `WP-[a-z0-9][A-Za-z0-9._-]*\.md`
  (matches both `WP-042-...md` and `WP-roadmap-retirement.md`).
- line 81: `\(WP-[0-9]{3}\)$` → `\(WP-[a-z0-9]+(-[a-z0-9]+)*\)$`.

`scripts/boundary-check.js`: delete line 45
(`allowed.add('docs/specs/ROADMAP.md');`) and remove `docs/specs/ROADMAP.md`
from the header doc-comment (keep the spec-file and `package-lock.json`
allowances untouched).

`tests/unit/check-frontmatter.test.js`: spawn the script
(`node scripts/check-frontmatter.js`) with `cwd` set to a temp fixture tree
(copy the real `tests/schemas/*.json` into `<fixture>/tests/schemas/`; write
minimal spec files under `<fixture>/docs/specs/` and `.../done/`). Cases:

1. valid slug spec + valid numeric spec in `done/` → exit 0;
2. duplicate id, one in `docs/specs/`, one in `done/` → exit 1, stderr
   contains `duplicate id`;
3. `depends_on: [WP-nonexistent]` → exit 1, stderr contains
   `does not resolve`;
4. `id: WP-Bad_Slug` → exit 1 (pattern); `epic: Audit-A7` → exit 1 (pattern);
   `epic: audit-a7` → exit 0;
5. spec without `branch:` → exit 0 (no longer required).

## Implementation notes & constraints

- Zero new dependencies; plain `node:test` like `boundary-check.test.js`.
- Do NOT touch `docs/specs/ROADMAP.md` itself, any agent file, template, or
  GLOSSARY — those belong to the two sibling WPs.
- Do NOT edit existing spec files (no mass `branch:` removal — legacy fields
  are inert by design).
- The `agent.schema.json` path and agent validation loop are untouched.

## Acceptance criteria

- [ ] `npm run lint` passes on the repo as-is (proves all 96+ existing specs,
      numeric ids and legacy `branch:` lines included, conform with zero edits).
- [ ] The frontmatter check line now reports the done/ specs in its count
      (spec count > 100, was 18).
- [ ] All new unit-test negatives fail with the exact stderr substrings above.
- [ ] `boundary-check.js` rejects `docs/specs/ROADMAP.md` when not listed in a
      spec's Deliverables.
- [ ] Running lint twice is idempotent (no state written).

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
npm test -- --test-name-pattern "check-frontmatter"
npm test -- --test-name-pattern "boundary"
```

## Out of scope (do NOT do these)

- Prose ritual sites (agents, `_TEMPLATE.md`, `docs/specs/README.md`,
  GLOSSARY, CLAUDE.md/AGENTS.md, PR template) — `WP-spec-ritual-updates`.
- ROADMAP split/deletion, MILESTONES.md, logbook, PRD/issue-template/ADR-index
  edits — `WP-roadmap-retirement`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; title `feat(specs): slug-identity machine gates (WP-160)`.
3. This spec's `status:` flipped and the file moved to `done/` on completion.
