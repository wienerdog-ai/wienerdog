<!-- GENERATED from CLAUDE.md — do not hand-edit. Regenerate with: npm run gen:agents. -->
# Wienerdog — implementer guide

## What this is
Wienerdog is an open-source "AI upgrade stack": a one-line install that writes
configuration files (CLAUDE.md/AGENTS.md, a markdown memory vault, skills,
hooks, OS-native schedules) into a user's Claude Code / Codex CLI setup.

**IRON RULE (ADR-0004): Wienerdog is just files.** No daemons, no servers, no
background processes that outlive their job, no telemetry. If your change
starts something that keeps running, it is wrong.

## How work happens here
- All implementation is **spec-driven**. You implement exactly ONE work package
  from `docs/specs/WP-*.md`. If you were not given a spec path, STOP and ask.
- Read, in order: (1) this file, (2) your spec, (3) the files in the spec's
  Deliverables table. Nothing else is required; do not wander the repo. The
  spec inlines everything you need — if it doesn't, that's a spec bug: say so.
- Touch ONLY files listed in the spec's Deliverables table. CI rejects PRs
  that touch unlisted files. Found something else broken? Note it under
  "Discovered issues" in the PR body; do not fix it.
- Ambiguity → choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.
- `docs/GLOSSARY.md` names are canonical. Never invent synonyms for vault,
  dream, routine, digest, managed block, work package, etc.

## Code conventions
- Installer/CLI: plain Node ≥ 18, **zero runtime dependencies** (`googleapis`
  is the single ADR-approved exception; devDependencies are fine). No
  TypeScript in `src/` — JSDoc type annotations only. No build step.
- Everything the installer writes to a user machine must be **idempotent**
  (running twice = zero changes) and **reversible** (`wienerdog uninstall`
  fully undoes it via the install manifest).
- Shell scripts: bash, must pass `shellcheck`; format with `shfmt -i 2`.
- Product files in `skills/` and `templates/`: markdown with YAML frontmatter,
  Obsidian conventions (wikilinks, `YYYY-MM-DD` daily notes, PARA folders).
- User-facing text (CLI output, docs, templates): plain language for
  knowledge workers, not developers. No jargon without explanation.

## Testing
- `npm test` = unit tests (`node:test`) + golden-file checks. Golden fixtures
  live in `tests/golden/`; update ONLY when your spec explicitly says so.
- `npm run lint` = markdownlint + shellcheck + shfmt + frontmatter schema
  checks (pipeline defined in WP-001).
- Every spec has literal verification commands. All must pass before you open
  the PR; paste their output into the PR body.

## Git discipline
- Branch: `wp/XXX-slug` (from your spec's frontmatter). Never commit to main.
- Conventional commits: `feat|fix|docs|test|chore(scope): message (WP-XXX)`.
- One PR per WP. Fill the PR template completely, including the
  `Generated-by: <model>` line.

## Memory (dogfooding)
- This repo runs Wienerdog on itself. At the end of your session, append the
  lessons or gotchas you hit to `memory/lessons/inbox.md` — one bullet per
  lesson, each prefixed with your WP id. Don't organize it — the dream job
  consolidates.
