# Lessons inbox (append-only)

One bullet per lesson, prefixed with WP id (or M0 for foundation work). The dream job consolidates; don't organize here.

- M0: GitHub user `wienerdog` is taken; org is `wienerdog-ai`, npm package `wienerdog` (free as of 2026-07-02 — reserve before public).
- M0: Both harnesses natively support SKILL.md folders (verified 2026-07) — canonical skill format needs no per-harness translation, only registration.
- M0: launchd StartCalendarInterval runs missed jobs on wake but NOT after power-off — hence the login-triggered catch-up check (docs/ARCHITECTURE.md).
- M0: macOS TCC — launchd-spawned processes don't inherit terminal permissions; unattended jobs must only touch non-TCC paths. Vault default `~/wienerdog` exists because of this.
- M0: "Every harness user has Node" is false — Claude Code's primary install is now a native binary via curl. Hence ADR-0006: curl bootstrapper as default entry point (guides Node install, never silent-installs).
- M0-process: subagents given a repo path may cd to it instead of their isolated worktree — one reviewer ran git reset --hard in the shared checkout and destroyed uncommitted architect output (recovered from agent context). Rule: agent prompts must pin cwd to the worktree AND owner must commit main-checkout work immediately, never leave it uncommitted while agents run.
- WP-005 follow-up (review): shared config regex /^vault:\s*(.*)$/m in init.js+sync.js lets \s* cross newlines on a bare 'vault:' line — harmless for configs init writes, but change to [ \t]* when WP-006 touches sync.js.
- WP-005 follow-up (review): check-frontmatter covers specs+agents only — add a skill-frontmatter schema (name/description) for skills/**/SKILL.md in a future WP.
