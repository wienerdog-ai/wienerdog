---
date: 2026-07-07
title: Windows irm|iex init-handoff hang
related_wps: [WP-034, WP-052, WP-058, WP-060, WP-061, WP-072]
---

# Windows irm|iex init-handoff hang (2026-07-07)

**Windows irm|iex init-handoff hang (2026-07-07, credit: owner field report,
Node-present Windows machine).** `irm .../install.ps1 | iex` printed
"Found Node v24.18.0 - handing over ..." then **hung forever** — no plan, no
prompt. Root cause (verified from code): the handoff ran
`npx --yes wienerdog@latest init`, where `--yes` is **npx's** package-prompt flag
(it precedes `wienerdog@latest`), NOT passed to `init` — so `init` reached its own
`[Y/n]` confirm (`init.js:117`) and blocked on stdin. POSIX survives via
`confirm()`'s `/dev/tty` fallback (WP-034); Windows has no `/dev/tty` and under
`irm|iex` the init child's stdin is tangled in PowerShell's object pipeline, so
the plan+prompt never surface and it hangs — the WP-061 iex-handoff fragility
class. **WP-072** (opus S, independent) makes the handoff **non-interactive**:
`Main` builds the forwarded argv once as `$ForwardArgs + --yes` (de-duped,
null-safe) and passes it to BOTH the `npx` branch and the `Install-ViaTarball`
branch, so init skips its blocking confirm while still PRINTING its full plan
(transparency intact; the installer one-liner + printed plan are the consent
surface per ADR-0011/0017/WP-052). The two handoff seams
(`Start-WienerdogNpx`/`Start-WienerdogInit`) are untouched — the npx `--yes` stays
where it is; init's `--yes` arrives via `@ForwardArgs`. **POSIX is left
interactive on purpose** (the `/dev/tty` prompt works and is the designed UX — fix
only what's broken); WP-060's default-yes cannot save the iex case (tangled stdin
delivers no line at all). Frozen as an **ADR-0017 amendment (non-interactive init
handoff)**. CI-covered by Pester `Main` argv assertions on the mocked seams; the
real no-hang reproduction on the Node-present Windows box is the owner manual gate
(WP-058/061 precedent). Residual init.js mode-1 readline hang (Windows
stdin.isTTY-true-but-unreadable) is noted out-of-scope: removed from the installer
path by `--yes`, and no safe non-heuristic guard exists.
