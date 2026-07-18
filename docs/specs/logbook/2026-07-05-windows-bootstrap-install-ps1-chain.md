---
date: 2026-07-05
title: Windows bootstrap install.ps1 chain
related_wps: [WP-055, WP-056, WP-057, WP-058]
---

# Windows bootstrap install.ps1 chain (2026-07-05)

**Windows bootstrap `install.ps1` chain (2026-07-05, ADR-0017).** Pulls the
promised PowerShell installer (ADR-0006) forward from M6–M7: `irm <url>/install.ps1
| iex` gets a bare Windows Server 2022 / Windows 11 machine to a working
`wienerdog init` + skills under `install.sh`'s ADR-0011 trust posture.
**WP-056** is a wd-researcher spike (memo
`memory/research/2026-07-05-windows-install-ps1.md`) that resolved the two
load-bearing unknowns rather than guess them: (a) `irm|iex` is PowerShell's
*object* pipeline, so the interactive console stays usable for per-hop
`Read-Host` consent — no bash-style `curl|bash` stdin trap; and (b) **Node's
official MSI is `ALLUSERS=1` per-machine-only and hard-requires UAC — there is no
non-elevated official Node install**, the decisive elevation fork. It also
confirmed `ubuntu-latest`/`macos-latest` runners ship `pwsh`+Pester+PSScriptAnalyzer,
so the PowerShell script is CI-lintable and pure-function-testable with zero extra
runner cost. **WP-057** (Ready) builds the testable core — the `$NonInteractive`
detector, `Read-Host` `Confirm-Step` consent, the npm-less registry-tarball
fallback (ADR-0016 analog of WP-055, with a fully-anchored semver gate), the `npx`
handoff, PSScriptAnalyzer settings + Pester harness + CI wiring — a complete,
CI-verified installer for **Node-present** Windows machines; its `Main` prints and
exits when Node is missing (placeholder). **WP-058** (In-Review) fills that branch
with the consented Node/git auto-install: winget-if-present, else the official signed
MSI downloaded + SHA256-verified + installed via a UAC elevation (`Start-Process
-Verb RunAs`), plus registry PATH refresh — and carries the **mandatory manual
Windows VM checklist** (CI has no Windows runner). Its elevation posture is confirmed
(ADR-0017 Accepted, 2026-07-05); CI covers the pure helpers plus the
SHA-mismatch/elevation-failure *handling* via mocked seams, with the real
UAC/MSI/registry paths on the manual checklist. Windows scheduling / `schtasks` stays deferred; the dream
is not scheduled on Windows yet (digest/skills/manual dream still work).
