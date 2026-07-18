---
date: 2026-07-06
title: Windows-VPS post-install UX
related_wps: [WP-060, WP-061]
---

# Windows-VPS post-install UX (2026-07-06)

**Windows-VPS post-install UX (2026-07-06).** The owner's real Windows Server
2022 `irm .../install.ps1 | iex` install worked end-to-end (Node MSI, UAC accept,
PATH refresh, handoff to `npx wienerdog@latest init`) and surfaced two
post-install UX asks. **WP-060** (JS, independent) flips `init`'s
plan-confirmation to default-yes: the shared `confirm()` in `src/core/prompt.js`
gains a **per-call** `{defaultYes}` opt (default false — every existing caller,
incl. `uninstall`'s destructive `Proceed with removal?`, byte-for-byte
unchanged), and ONLY `init`'s "Proceed?" passes `{defaultYes:true}` + `[Y/n]`.
The default-yes is scoped to the interactive empty-Enter case only: EOF /
no-terminal (mode 3) still abort loudly, and `--yes` still bypasses — aligning
init with ADR-0011's `[Y/n]`-default-yes install-hop norm. `adopt`'s four prompts
are untouched: it uses its OWN local `confirm`, not `src/core/prompt`. **WP-061**
(PowerShell, independent) makes `install.ps1` survive `iex`: under `irm|iex` the
script runs inside the user's live host, so `Main`'s `exit` closed the window the
instant the install succeeded. `Main` now **returns** an exit code (never
`exit`), prints a plain completion banner on success, and the dot-source guard
`exit`s only for a real script file (`InvocationName` non-empty) while setting
`$global:LASTEXITCODE` + returning under `iex` (`''`). Frozen as an ADR-0017
amendment (iex-safe exit discipline); the no-exit/banner logic is CI-covered by
Pester `Main` tests (a returning `Main` proves it did not `exit`). The two WPs
share no files and carry no dependency — they can land in parallel.
