---
id: WP-056
title: Windows install.ps1 platform research spike (consent surface, Node elevation, CI)
status: Done
model: opus
size: S
depends_on: []
adrs: [ADR-0006, ADR-0011, ADR-0016]
branch: wp/056-windows-install-research-spike
---

# WP-056: Windows `install.ps1` platform research spike

## Context (read this, nothing else)

Before designing the flagship Windows bootstrapper (`install.ps1`, the PowerShell
analog of `install.sh`, invoked as `irm <url>/install.ps1 | iex`), two platform
questions were load-bearing and could not be answered from memory with confidence:
(1) whether `irm|iex` leaves the interactive console usable for per-hop consent
prompts (unlike bash `curl|bash`, where stdin is the piped script), and (2) whether
the official Node.js Windows `.msi` supports a non-elevated per-user install or
hard-requires admin. Getting either wrong would bake a false assumption into the
consent surface or the elevation story of the flagship installer. Per the owner's
standing preference ("a 20-minute research memo beats a wrong assumption on the
flagship Windows installer"), this spike was run **before** any install.ps1 WP was
written.

This WP is a **research spike** (wd-researcher), not an implementer task. Its
deliverable is a research memo; there is no code. It gates WP-057 and WP-058, which
inline the memo's verified facts.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | memory/research/2026-07-05-windows-install-ps1.md | the research memo (DONE) |

## What the spike answered (summary — the memo is authoritative)

- **Consent surface (Q1):** `irm URL | iex` is PowerShell's *object* pipeline, not
  OS-level stdin redirection; the process's real stdin (the interactive console) is
  untouched, so `Read-Host` inside the iex'd code reads from the live terminal
  (empirically verified; `about_Pipelines` confirms "stdin isn't connected to the
  PowerShell pipeline for input"). Non-interactive detection: `[Console]::IsInputRedirected`
  (reliable) — **not** `[Environment]::UserInteractive` (documented-unreliable,
  returned `$true` even under redirection). Consent primitive: `Read-Host` with
  manual `[Y/n]` parse, gated on a `$NonInteractive` flag computed once at start;
  `-NonInteractive` mode makes `Read-Host`/`PromptForChoice` throw cleanly (a safety
  net, not the primary control).
- **Node elevation (Q2) — the decisive finding:** the current LTS Node MSI has
  `ALLUSERS=1` compiled in (verified by inspecting the MSI Property table); per
  Microsoft's docs, `MSIINSTALLPERUSER=1` is then ignored. **Node's official MSI is
  per-machine-only and hard-requires elevation; there is no supported non-elevated
  official install.** LTS discovery: `https://nodejs.org/dist/index.json`, first
  entry with `lts != false`. Checksum: SHA256 vs `SHASUMS256.txt` via
  `Get-FileHash -Algorithm SHA256` (built into 5.1, no dependency).
- **winget (Q2c):** absent by default on Windows Server 2022 (present only from
  Server 2025); never assume it — always feature-detect `Get-Command winget`.
- **git (Q3):** official Git-for-Windows silent flags `/VERYSILENT /NORESTART
  /NOCANCEL /SP- /SUPPRESSMSGBOXES`; prefer the direct `.exe` over `winget --silent`
  (which maps to `/SILENT`, not `/VERYSILENT`). Claude Code on Windows ships Git
  Bash, so git-consent mainly matters for Codex/bare installs.
- **CI (Q4):** `ubuntu-latest` and `macos-latest` runners ship `pwsh`, Pester, and
  PSScriptAnalyzer preinstalled — so `install.ps1` can be linted + pure-function
  unit-tested with zero extra runner cost, but with **no** coverage of real Windows
  elevation/MSI/registry behavior. Dot-source guard for library-mode testing:
  `if ($MyInvocation.InvocationName -ne '.') { Main }` (verified across direct-run,
  `irm|iex`, and dot-source shapes). PSScriptAnalyzer flags `Write-Host` — pre-ship
  a settings file excluding `PSAvoidUsingWriteHost`.
- **UNCERTAIN (need a real Windows box; become manual-checklist items in WP-058):**
  the interactive-console `IsInputRedirected=$false` branch, the exact Server-SKU
  winget cutover, Git-for-Windows per-user flag names, and PowerShell 5.1 parity
  (all empirical tests ran on `pwsh 7.6.3`, not 5.1).

## Acceptance criteria

- [x] Memo committed at `memory/research/2026-07-05-windows-install-ps1.md`
      answering Q1–Q4 with citations and explicit UNCERTAIN flags.
- [x] Findings sufficient to write ADR-0017 and WP-057/058 without guessing the
      consent surface or the elevation story.

## Verification steps

Not applicable (research spike; no code). The memo's claims marked
"verified-current (empirical)" were executed during the spike.

## Out of scope

- Any `install.ps1` code — WP-057 (testable core) and WP-058 (install actions).
- A live Windows smoke test — captured as WP-058's manual checklist.

## Definition of done

1. Memo committed (done). ADR-0017 drafted from it (done).
2. WP-057 and WP-058 written with the memo's facts inlined (One-Document Rule).
