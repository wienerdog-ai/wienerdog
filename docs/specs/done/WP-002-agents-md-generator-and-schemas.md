---
id: WP-002
title: Implement AGENTS.md generator
status: Done
model: sonnet
size: S
depends_on: [WP-001]
adrs: [ADR-0003, ADR-0005]
branch: wp/002-agents-md-generator
---

# WP-002: Implement AGENTS.md generator

## Context (read this, nothing else)

Wienerdog targets two AI harnesses: Claude Code (reads `CLAUDE.md`) and Codex CLI (reads `AGENTS.md`). This repo's own implementer instructions live in `CLAUDE.md`; contributors using Codex must get identical instructions via `AGENTS.md`. Hand-maintaining two copies drifts, so `AGENTS.md` is generated. The same "render one canonical source into per-harness files" pattern is the heart of the product's adapter design — this WP is its first, simplest instance.

## Current state

`CLAUDE.md` (56 lines) is the canonical source. `AGENTS.md` currently exists as a manually created copy with the header line:
`<!-- GENERATED from CLAUDE.md — do not hand-edit. Regenerate with: npm run gen:agents (WP-002). -->`
`scripts/` contains `lint.js`, `boundary-check.js`, `check-frontmatter.js` from WP-001. CI (`.github/workflows/ci.yml`) has `lint` and `test` jobs you will extend with a drift check.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | scripts/gen-agents-md.js | generator + `--check` drift mode |
| modify | package.json | add `gen:agents` script |
| modify | .github/workflows/ci.yml | add drift check step to the lint job |
| modify | AGENTS.md | regenerate via the script (byte output of the generator) |
| create | tests/unit/gen-agents-md.test.js | node:test |

### Exact contracts

```js
/** scripts/gen-agents-md.js
 *  Default: writes AGENTS.md = HEADER + "\n" + contents of CLAUDE.md, where
 *  HEADER = '<!-- GENERATED from CLAUDE.md — do not hand-edit. Regenerate with: npm run gen:agents. -->'
 *  --check: exits 0 if AGENTS.md is already exactly that output, else prints a
 *  one-line diff summary and exits 1 (used by CI).
 */
```

CI: in the `lint` job, after `npm run lint`, add step `node scripts/gen-agents-md.js --check`.

## Implementation notes & constraints

- Node stdlib only. Read/write UTF-8. Preserve CLAUDE.md byte-for-byte after the header (including trailing newline).
- The header text drops the "(WP-002)" suffix — the regenerated AGENTS.md uses the exact HEADER above.

## Acceptance criteria

- [ ] `npm run gen:agents` is idempotent (second run: `git status` clean).
- [ ] Editing CLAUDE.md then running `--check` exits 1; after `npm run gen:agents` it exits 0. (Test via a temp copy in the unit test, not by editing the real CLAUDE.md.)
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm run gen:agents && git status --porcelain
node scripts/gen-agents-md.js --check && echo IN-SYNC
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The product's user-machine adapter compile (`wienerdog sync` — WP-006/WP-010). Any change to CLAUDE.md content itself.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/002-agents-md-generator`; PR titled `chore(repo): implement AGENTS.md generator (WP-002)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
