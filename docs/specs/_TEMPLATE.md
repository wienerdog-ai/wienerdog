---
id: WP-XXX
title: <verb-first, e.g. "Implement vault skeleton generator">
status: Draft            # Draft | Ready | In-Progress | In-Review | Done
model: sonnet            # recommended implementer tier: sonnet | opus
size: S                  # S (<1h session) | M (one session) — L is forbidden; split it
depends_on: []           # e.g. [WP-002]
adrs: []                 # e.g. [ADR-0004] — decisions this WP must respect
branch: wp/XXX-short-slug
---

# WP-XXX: <title>

## Context (read this, nothing else)

2–4 paragraphs. What this component is, why it exists, how it fits the system.
Written to be COMPLETE — summarize anything from ARCHITECTURE.md/PRD.md that is
needed; never say "see the architecture doc for details". Include the one or two
product invariants that matter here (e.g. "Wienerdog installs files; it never
starts a process that outlives its job — ADR-0004").

## Current state

What already exists that this WP builds on: exact file paths, exact function
signatures being extended, sample of existing output if relevant. For greenfield:
"Nothing exists; you are creating these files."

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/example/thing.js | exports `doThing(dir, opts)` |
| modify | bin/wienerdog.js | wire subcommand |
| create | tests/unit/thing.test.js | |

### Exact contracts

Signatures, CLI flags, file formats — spelled out, not implied. Include example
input → example output pairs. For file-generating code, show a literal expected
output file in full.

```js
/** @param {string} dir @param {{dryRun?: boolean}} opts
 *  @returns {{created: string[]}} — throws WienerdogError on collision */
function doThing(dir, opts)
```

## Implementation notes & constraints

- Constraints beyond CLAUDE.md (e.g. "no new npm deps").
- Known traps ("launchd plists do not expand $HOME — absolute paths only").
- When uncertain: choose the simpler option and note it in the PR description
  under "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] Any untrusted identifier (version, name, path segment, filename) that flows
      into a filesystem path or a shell command is validated with a **fully
      anchored** pattern that rejects `/`, `\`, and `..`, in **every** language it
      passes through (e.g. JS `isSemver` AND the bash/PowerShell regex). A
      start-anchored-only check accepts `1.2.3/../../x` and becomes an
      arbitrary-write primitive (WP-022, WP-055). **Anchor correctly per engine:**
      in .NET/PowerShell `^…$` still matches *before* a trailing newline — use
      `\A…\z`; in JS `$` without the `m` flag is safe; in POSIX `grep` remember it
      is line-oriented (a multiline value with one valid line matches `^…$`), so
      confirm the value cannot contain a newline (WP-057).

## Acceptance criteria

- [ ] Objective, binary criteria only — each maps to a verification step below.
- [ ] Running the command twice is idempotent (second run: zero changes).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern thing
npm run lint
```

## Out of scope (do NOT do these)

- Explicitly list adjacent work that belongs to other WPs, with their ids.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch from frontmatter; conventional commits; PR titled `feat(scope): title (WP-XXX)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
