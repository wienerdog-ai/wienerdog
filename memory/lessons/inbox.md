# Lessons inbox (append-only)

One bullet per lesson, prefixed with WP id (or M0 for foundation work). The dream job consolidates; don't organize here.

- M0: GitHub user `wienerdog` is taken; org is `wienerdog-ai`, npm package `wienerdog` (free as of 2026-07-02 — reserve before public).
- M0: Both harnesses natively support SKILL.md folders (verified 2026-07) — canonical skill format needs no per-harness translation, only registration.
- M0: launchd StartCalendarInterval runs missed jobs on wake but NOT after power-off — hence the login-triggered catch-up check (docs/ARCHITECTURE.md).
- M0: macOS TCC — launchd-spawned processes don't inherit terminal permissions; unattended jobs must only touch non-TCC paths. Vault default `~/wienerdog` exists because of this.
