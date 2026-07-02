# Lessons inbox (append-only)

One bullet per lesson, prefixed with WP id (or M0 for foundation work). The dream job consolidates; don't organize here.

- M0: GitHub user `wienerdog` is taken; org is `wienerdog-ai`, npm package `wienerdog` (free as of 2026-07-02 — reserve before public).
- M0: Both harnesses natively support SKILL.md folders (verified 2026-07) — canonical skill format needs no per-harness translation, only registration.
- M0: launchd StartCalendarInterval runs missed jobs on wake but NOT after power-off — hence the login-triggered catch-up check (docs/ARCHITECTURE.md).
- M0: macOS TCC — launchd-spawned processes don't inherit terminal permissions; unattended jobs must only touch non-TCC paths. Vault default `~/wienerdog` exists because of this.
- M0: "Every harness user has Node" is false — Claude Code's primary install is now a native binary via curl. Hence ADR-0006: curl bootstrapper as default entry point (guides Node install, never silent-installs).
- WP-001: `markdownlint-cli2` does NOT auto-read config from `package.json` like v1's `.markdownlint.json` — you must invoke it with `--config package.json --configPointer /markdownlint-cli2`, otherwise the inline config is silently ignored and defaults apply.
- WP-001: On Node v25.9.0, `node --test <directory>` throws `MODULE_NOT_FOUND` (it's treated as an entry-point script, not a test-runner target) — bare `node --test` (no path) relies on documented default recursive discovery and works everywhere, including the zero-test-files case (exits 0).
- WP-001: `npm install --save-dev` always regenerates `package-lock.json`, but it isn't in most WPs' Deliverables tables — don't commit it; `npm ci || npm i` in CI is the designed fallback for a lockfile-less repo.
- WP-001: actionlint (via `brew install actionlint`, which also installs shellcheck) flags unquoted word-split shell variables (SC2086) even in intentional multi-arg-expansion contexts (e.g. piping `git diff` output into a script's argv) — use `mapfile -t arr < <(cmd)` + `"${arr[@]}"` instead of a bare unquoted variable.
- WP-001 follow-up (review): lockfile policy set — package-lock.json is committed and always-allowed by boundary-check; memory/lessons/inbox.md likewise always-allowed (dogfood rule).
