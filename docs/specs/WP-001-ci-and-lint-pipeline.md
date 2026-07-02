---
id: WP-001
title: Implement CI and lint pipeline
status: Ready
model: sonnet
size: M
depends_on: []
adrs: [ADR-0003, ADR-0005]
branch: wp/001-ci-and-lint
---

# WP-001: Implement CI and lint pipeline

## Context (read this, nothing else)

Wienerdog is an npm-distributed CLI (`npx wienerdog init`) that installs configuration files — markdown, skills, hooks, schedules — into users' Claude Code / Codex CLI setups. The repo is mostly markdown and thin Node scripts (plain Node ≥ 18, zero runtime deps except `googleapis`, JSDoc types, no build step — ADR-0003). Development is spec-driven (ADR-0005): every PR implements exactly one work-package spec, and the spec's "Deliverables" table is a hard permission boundary — a PR may only touch files listed there.

This WP builds the CI that enforces those rules mechanically, plus the local lint pipeline. It is the foundation every later WP's verification steps rely on.

## Current state

`.github/workflows/ci.yml` exists as a placeholder that must be replaced. `package.json` has stub `test` and `lint` scripts. Tests directory does not exist yet. The PR template at `.github/PULL_REQUEST_TEMPLATE.md` contains a `Spec:` line whose value is a path like `docs/specs/WP-004-vault-skeleton.md` — your boundary-check reads the spec path from the PR body.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | .github/workflows/ci.yml | replace placeholder with the real pipeline |
| create | scripts/lint.js | runs all lint layers, exit 1 on any failure |
| create | scripts/boundary-check.js | diff vs spec Deliverables table |
| create | scripts/check-frontmatter.js | validate YAML frontmatter vs schemas |
| create | tests/schemas/spec.schema.json | JSON schema for WP spec frontmatter |
| create | tests/schemas/agent.schema.json | JSON schema for .claude/agents frontmatter |
| create | tests/unit/boundary-check.test.js | node:test unit tests |
| modify | package.json | wire `lint` script to scripts/lint.js |

### Exact contracts

`scripts/lint.js` (run as `npm run lint`), layers in order, all must pass:
1. **markdownlint** on `docs/**/*.md`, `*.md` (use `markdownlint-cli2` as devDependency; config `.markdownlint.jsonc` may be created — add it to Deliverables? No: put config inline in package.json under `"markdownlint-cli2"` key, permitted since package.json is listed). Disable line-length rule (MD013).
2. **shellcheck** on `**/*.sh` if any exist AND shellcheck is installed; skip with a warning if the binary is absent (local machines), but in CI it is installed.
3. **frontmatter check**: `node scripts/check-frontmatter.js` — validates every `docs/specs/WP-*.md` against `tests/schemas/spec.schema.json` and every `.claude/agents/*.md` against `tests/schemas/agent.schema.json`. Hand-roll minimal YAML frontmatter parsing (the frontmatter here is a flat key: value / key: [list] subset — no runtime YAML dep; document the subset in a comment).

`scripts/boundary-check.js`:
```js
/** Usage: node scripts/boundary-check.js <specPath> <changedFile...>
 *  Parses the spec's "## Deliverables" markdown table (rows: | Action | Path | Notes |),
 *  exits 0 if every changedFile is listed (exact path match) or is the spec file itself,
 *  else prints offending paths and exits 1. The spec file and docs/specs/ROADMAP.md
 *  are always allowed (status flips). */
```

Spec frontmatter schema (spec.schema.json) must require: `id` (^WP-\d{3}$), `title`, `status` (enum Draft|Ready|In-Progress|In-Review|Done), `model` (enum sonnet|opus), `size` (enum S|M), `depends_on` (array), `adrs` (array), `branch` (^wp/). Agent schema must require: `name` (^wd-), `description`, `model` (enum sonnet|opus|haiku).

`ci.yml` jobs (trigger: pull_request + push to main):
- `lint`: ubuntu-latest, setup-node 20, `npm ci || npm i`, install shellcheck via apt, `npm run lint`.
- `test`: matrix `[ubuntu-latest, macos-latest]`, `npm test` (node --test; must pass with zero test files too — guard the glob).
- `boundary` (pull_request only): extract the `Spec:` path from the PR body (`github.event.pull_request.body`); if no spec path is present, pass with a notice (docs-only PRs); else `git diff --name-only origin/main...HEAD` piped to boundary-check.
- `pr-title` (pull_request only): grep title against `^(feat|fix|docs|test|chore)(\([a-z0-9-]+\))?: .+ \(WP-\d{3}\)$` OR allow titles without `(WP-XXX)` when no Spec line exists in the body.

## Implementation notes & constraints

- devDependencies allowed: `markdownlint-cli2` only. Everything else is Node stdlib.
- `node --test tests/` fails if the directory has no test files in some Node versions — ensure at least the boundary-check test exists (it does, in this WP).
- Do not add husky/pre-commit hooks — CI and `npm run lint` only.
- When uncertain: simpler option + "Decisions made" note in PR.

## Acceptance criteria

- [ ] `npm run lint` passes on the current repo as-is (fix nothing outside your Deliverables; if existing markdown fails a rule, disable that rule in config and note it).
- [ ] `node scripts/boundary-check.js docs/specs/WP-001-ci-and-lint-pipeline.md scripts/lint.js` exits 0; same command with `src/other.js` appended exits 1 with the path printed.
- [ ] `node scripts/check-frontmatter.js` validates all current specs and agents, exit 0.
- [ ] `npm test` passes on macOS and Linux.
- [ ] ci.yml is valid (parses under `gh workflow` or actionlint if available; otherwise YAML-parses).

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
npm test
node scripts/boundary-check.js docs/specs/WP-001-ci-and-lint-pipeline.md scripts/lint.js && echo PASS-allowed
node scripts/boundary-check.js docs/specs/WP-001-ci-and-lint-pipeline.md src/nope.js; echo "exit=$?"
node scripts/check-frontmatter.js
```

## Out of scope (do NOT do these)

- Golden-file test harness (WP-003). Scenario/nightly workflow (WP-015). Release automation (M7). shfmt formatting of shell (no shell files exist yet).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/001-ci-and-lint`; conventional commits; PR titled `chore(ci): implement CI and lint pipeline (WP-001)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
