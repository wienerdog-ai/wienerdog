---
id: WP-058
title: install.ps1 Node/git auto-install (winget → signed MSI + UAC), PATH refresh, manual Windows verification
status: Done
model: opus
size: M
depends_on: [WP-057]
adrs: [ADR-0017, ADR-0011, ADR-0004]
branch: wp/058-install-ps1-node-git-actions
---

# WP-058: `install.ps1` Node/git auto-install + PATH refresh + manual Windows verification

> **Elevation posture confirmed (owner, 2026-07-05).** ADR-0017 is **Accepted**:
> Node's official MSI is per-machine-only and hard-requires UAC — there is no
> non-elevated official install — so this WP uses "winget-if-present → else the
> signed MSI, SHA256-verified, installed via a consent-gated `Start-Process -Verb
> RunAs` UAC elevation; no nvm/portable-zip in v1." That fork is owner-visible and
> **cannot be fully verified by CI** (real Windows elevation/MSI/registry): its
> automatable parts (pure helpers + the SHA-mismatch/elevation-failure *handling*
> via mocked seams) are Pester-covered; the real UAC/MSI/registry paths are covered
> by the **mandatory manual checklist** in the Definition of Done.

## Context (read this, nothing else)

`install.ps1` (WP-057) is the PowerShell bootstrapper, invoked as
`irm <url>/install.ps1 | iex`. WP-057 built the **testable core**: a
`$NonInteractive` detector, a `Read-Host`-based `Confirm-Step` per-hop consent, the
npm-less registry-tarball fallback, the `npx` handoff, and the CI lint (PSScript-
Analyzer) + Pester harness. Its `Main`, when Node is **missing or older than 18**,
currently prints guidance and exits non-zero — a deliberate placeholder.

This WP fills that placeholder with the **consented dependency auto-install**,
mirroring `install.sh`'s ADR-0011 posture for Windows. **IRON RULE (ADR-0004):
Wienerdog is just files** — the installer runs synchronous OS installers and exits;
nothing outlives its job.

**Platform facts (verified by WP-056's memo,
`memory/research/2026-07-05-windows-install-ps1.md` — inlined so you need not read
it):**

- **Node's official Windows MSI is per-machine-only and hard-requires elevation.**
  Its Property table has `ALLUSERS=1` baked in (not `2`), so `MSIINSTALLPERUSER=1`
  is ignored (Microsoft docs); the install target is under `ProgramFiles64Folder`.
  **There is no non-elevated official Node install.** So installing Node triggers a
  UAC event: run `msiexec` directly if the console is already elevated, else elevate
  just that call with `Start-Process msiexec -Verb RunAs -Wait`.
- **LTS discovery:** `https://nodejs.org/dist/index.json` is a date-descending
  array; each entry has `version` (`"v24.18.0"`), `files`, and `lts` (which is the
  boolean `false` for Current, or the LTS codename string for LTS). The **first
  entry whose `lts` is not `false`** is the current LTS. Download URL:
  `https://nodejs.org/dist/v<version>/node-v<version>-<arch>.msi`; checksums:
  `https://nodejs.org/dist/v<version>/SHASUMS256.txt` (one `sha256  filename` line
  per artifact). Verify with `Get-FileHash -Algorithm SHA256` (hex; built into 5.1,
  no dependency).
- **winget is NOT present by default on Windows Server 2022** (only Server 2025+);
  **always feature-detect** with `Get-Command winget`. When present,
  `winget install --id OpenJS.NodeJS.LTS -e` installs the same per-machine MSI (same
  UAC). Never assume winget; never bootstrap it.
- **git is soft** (`winget install --id Git.Git -e`, else the official Git-for-
  Windows `.exe` run with `/VERYSILENT /NORESTART /NOCANCEL /SP- /SUPPRESSMSGBOXES`
  — invoke the `.exe` directly, not `winget --silent`, which currently maps to
  `/SILENT` not `/VERYSILENT`). Claude Code on Windows ships Git Bash, so a
  Claude-Code user already has git; git-consent mainly matters for Codex/bare
  installs. A missing git **never** blocks the handoff — Node is the only hard gate.
- **PATH refresh:** after install, rebuild `$env:Path` from
  `[Environment]::GetEnvironmentVariable('Path','Machine')` + `…,'User'` so
  `node`/`npx` resolve this session.
- **CI cannot exercise any of the above** (no Windows runner; elevation/MSI/registry
  are Windows-only). The pure helpers here (LTS/MSI parse, SHASUMS parse, msiexec
  arg construction, `Test-Elevated` returning `$false` off-Windows) get Pester
  tests; the actual install is covered by the **manual Windows VM checklist** in
  the Definition of Done, run on the owner's Windows VPS and a Windows 11 box.

## Current state

`install.ps1` exists (WP-057) with: `Test-SemVer`, `Get-TarballUrl`,
`Get-SriSha512`, `Get-CoreDir`, `$script:NonInteractive`, `Confirm-Step`,
`Start-WienerdogNpx`, `Start-WienerdogInit`, `Invoke-TarballInstall`,
`Install-ViaTarball`, `Write-Tarball-Fallback`, `Get-NodeMajor`, `Main`, and the
dot-source guard. `Main`'s Node-absent branch is the print-and-exit placeholder you
replace. `PSScriptAnalyzerSettings.psd1` (excludes `PSAvoidUsingWriteHost`) and
`tests/ps/install-ps1.Tests.ps1` exist; `npm run lint` runs PSScriptAnalyzer and
the CI `lint` job runs `Invoke-Pester tests/ps`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | install.ps1 | add Node/git install + elevation + PATH-refresh functions; replace `Main`'s Node-absent branch with `Ensure-Node` (hard gate) and add `Ensure-Git` (soft). No change to WP-057's tarball/consent/detection functions **except the `Test-SemVer` anchor fix below**. |
| modify | tests/ps/install-ps1.Tests.ps1 | add Pester tests for the PURE helpers (LTS/MSI parse, SHASUMS parse, msiexec arg construction, `Test-Elevated` off-Windows) **and the `Test-SemVer` trailing-newline case**. No live network, no real install. |

### Owner amendment (2026-07-05, from the WP-057 review): `Test-SemVer` anchor

WP-057's `Test-SemVer` uses `^…$`, but in .NET/PowerShell `$` matches **before a
trailing newline**, so `Test-SemVer "1.2.3\n"` returns `$true`. Not exploitable
today (the `[0-9.]`-only charset still rejects `/`/`\`/`..`, and a newline-bearing
version yields a malformed URL that 404s to the fallback), but it defeats the
"fully anchored" intent of the security-checklist rule. Change the anchors from
`^…$` to `\A…\z` (the .NET absolute-start/absolute-end anchors) so a trailing
newline is rejected. Add a Pester case asserting `Test-SemVer` returns `$false`
for `"1.2.3`<newline>`"` and still `$true` for a bare `1.2.3` and a valid
prerelease. This supersedes WP-057's now-archived regex.

### Exact contracts — new functions in `install.ps1`

All must pass `Invoke-ScriptAnalyzer` with the committed settings. `exit` stays
confined to `Main`; the `Ensure-*` functions may `exit` **only** on the Node hard
gate (they are called from `Main`, never dot-sourced-and-invoked by Pester — Pester
tests the pure helpers, not `Ensure-Node`).

**Elevation + PATH.**

```powershell
# True iff the current process is elevated (Administrator). Off-Windows (Pester on
# Linux/macOS) WindowsIdentity throws PlatformNotSupportedException → return $false.
function Test-Elevated {
    try {
        $id = [Security.Principal.WindowsIdentity]::GetCurrent()
        return ([Security.Principal.WindowsPrincipal]$id).IsInRole(
            [Security.Principal.WindowsBuiltinRole]::Administrator)
    } catch { return $false }
}

# Refresh the current session PATH from the registry (Machine + User scopes) so a
# just-installed node/npx resolves without a new shell. Off-Windows the scoped
# getters return $null → the join is harmless; guard against $null.
function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
}
```

**Node LTS discovery + checksum (PURE — Pester-tested with fixtures).**

```powershell
# From a PARSED nodejs.org/dist/index.json array, return info for the current LTS
# MSI for $Arch ('x64' | 'arm64'). "Current LTS" = first entry whose .lts is not
# the boolean $false. Returns a hashtable @{ Version; MsiName; MsiUrl; ShaSumsUrl }
# or $null if none found. PURE: takes the already-parsed array, does no I/O.
function Get-LtsMsiInfo {
    param([Parameter(Mandatory)]$Index, [string]$Arch = 'x64')
    foreach ($entry in $Index) {
        if ($entry.lts -and ($entry.lts -isnot [bool] -or $entry.lts -ne $false)) {
            $v = [string]$entry.version            # e.g. "v24.18.0"
            $bare = $v.TrimStart('v')
            # Guard: the version segment goes into a URL/filename → validate.
            if (-not (Test-SemVer $bare)) { continue }
            $name = "node-$v-$Arch.msi"
            return @{
                Version     = $bare
                MsiName     = $name
                MsiUrl      = "https://nodejs.org/dist/$v/$name"
                ShaSumsUrl  = "https://nodejs.org/dist/$v/SHASUMS256.txt"
            }
        }
    }
    return $null
}

# From the raw SHASUMS256.txt text, return the lowercase hex sha256 for $FileName,
# or '' if absent. PURE. Lines look like "abc123…  node-v24.18.0-x64.msi".
function Get-ShaFromSums {
    param([Parameter(Mandatory)][string]$SumsText, [Parameter(Mandatory)][string]$FileName)
    foreach ($line in ($SumsText -split "`n")) {
        $parts = $line.Trim() -split '\s+', 2
        if ($parts.Count -eq 2 -and $parts[1].Trim() -eq $FileName) { return $parts[0].Trim().ToLower() }
    }
    return ''
}

# The exact msiexec argument list for a quiet, no-restart per-machine install of
# $MsiPath. PURE (returns the array) so it can be asserted in a test. Displayed
# in the consent line and used verbatim by Install-NodeViaMsi (displayed == run).
function Get-MsiexecArgs {
    param([Parameter(Mandatory)][string]$MsiPath)
    return @('/i', $MsiPath, '/qn', '/norestart')
}
```

**Node install actions (side-effecting; manual-verified).**

```powershell
# winget path (only when Get-Command winget succeeds). Same per-machine MSI + UAC.
function Install-NodeViaWinget {
    & winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    return ($LASTEXITCODE -eq 0)
}

# Official signed MSI path: discover LTS from dist/index.json, download the MSI +
# SHASUMS256.txt, verify SHA256 (Get-FileHash, hex) BEFORE installing, then install
# via msiexec — directly if already elevated, else elevated via Start-Process
# -Verb RunAs (the UAC prompt is Windows's own elevation consent). Returns $true on
# a completed install. On checksum mismatch: abort, install nothing, return $false.
function Install-NodeViaMsi {
    param([Parameter(Mandatory)][hashtable]$Msi)   # from Get-LtsMsiInfo
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("wd-node-" + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    try {
        $msiPath = Join-Path $tmp $Msi.MsiName
        Invoke-WebRequest -Uri $Msi.MsiUrl -OutFile $msiPath -UseBasicParsing
        $sums = (Invoke-WebRequest -Uri $Msi.ShaSumsUrl -UseBasicParsing).Content
        $expected = Get-ShaFromSums -SumsText $sums -FileName $Msi.MsiName
        $actual = (Get-FileHash -Path $msiPath -Algorithm SHA256).Hash.ToLower()
        if (-not $expected -or $expected -ne $actual) {
            Write-Host "Node MSI checksum mismatch — refusing to install."
            return $false
        }
        $margs = Get-MsiexecArgs -MsiPath $msiPath
        if (Test-Elevated) {
            $p = Start-Process msiexec.exe -ArgumentList $margs -Wait -PassThru
        } else {
            $p = Start-Process msiexec.exe -ArgumentList $margs -Verb RunAs -Wait -PassThru
        }
        return ($p.ExitCode -eq 0)
    }
    catch { Write-Host "Node install failed: $($_.Exception.Message)"; return $false }
    finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}
```

**Hard gate `Ensure-Node` and soft `Ensure-Git` (called from `Main`).**

```powershell
# HARD GATE. Returns if Node >= 18 already resolves. Otherwise offers a consented
# install: winget-if-present, else the official signed MSI (with the exact URL +
# msiexec command shown, and a plain note that it needs admin/UAC). On success,
# refresh PATH and re-check. On decline / non-interactive / failure: print the
# exact manual command + nodejs.org pointer and `exit 1` (Node is the only hard
# gate — Wienerdog cannot run without it).
function Ensure-Node {
    if ((Get-NodeMajor) -ge 18) { return }
    Write-Host "Node.js 18+ was not found on your PATH."

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "About to run:"
        # display == exec: show the FULL argv that Install-NodeViaWinget runs,
        # including the --accept-*-agreements flags (ADR-0011 rule 1, byte-for-byte).
        Write-Host "    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements"
        if (Confirm-Step "Install Node LTS with winget now? (may prompt for admin)") {
            if ((Install-NodeViaWinget) ) {
                Update-SessionPath
                if ((Get-NodeMajor) -ge 18) { return }
            }
        }
        Write-Host "Or install Node LTS from https://nodejs.org."
        exit 1
    }

    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $index = $null
    try { $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing }
    catch { $index = $null }
    $msi = if ($index) { Get-LtsMsiInfo -Index $index -Arch $arch } else { $null }
    if (-not $msi) {
        Write-Host "Couldn't determine the current Node LTS from nodejs.org."
        Write-Host "Install Node LTS from https://nodejs.org, then re-run this installer."
        exit 1
    }
    Write-Host "About to download and install the official signed Node LTS (needs admin):"
    Write-Host "    from: $($msi.MsiUrl)"
    Write-Host "    verify: SHA256 against $($msi.ShaSumsUrl)"
    Write-Host "    run:  msiexec $((Get-MsiexecArgs -MsiPath $msi.MsiName) -join ' ')  (elevated)"
    if (Confirm-Step "Install Node LTS from nodejs.org now? (a UAC admin prompt will appear)") {
        if (Install-NodeViaMsi -Msi $msi) {
            Update-SessionPath
            if ((Get-NodeMajor) -ge 18) { return }
        }
    }
    Write-Host "Or install Node LTS from https://nodejs.org."
    exit 1
}

# NON-BLOCKING. If git is missing, offer a consented install (winget, else the
# official Git-for-Windows .exe with /VERYSILENT). On decline / non-interactive /
# failure, print a one-line note (what git is for + how) and RETURN (never exit) —
# git alone never blocks the handoff. Skips silently if git already resolves.
function Ensure-Git {
    if (Get-Command git -ErrorAction SilentlyContinue) { return }
    # ... winget Git.Git if present (Confirm-Step), else download the official
    # Git-for-Windows signed .exe and run it with:
    #   /VERYSILENT /NORESTART /NOCANCEL /SP- /SUPPRESSMSGBOXES
    # (invoke the .exe directly, not `winget --silent`). Resolve the current asset
    # via the GitHub releases API (api.github.com/repos/git-for-windows/git/releases/latest).
    # On any decline/failure/non-interactive: Write-Host the note and RETURN.
    Write-Host "git isn't installed — Wienerdog needs it once you create or adopt a vault."
    Write-Host "Install Git for Windows from https://gitforwindows.org before /wienerdog-setup."
}
```

**`Main` change.** Replace the Node-absent placeholder branch so `Main` calls
`Ensure-Node` (hard) then `Ensure-Git` (soft) before the handoff:

```powershell
function Main {
    param([string[]]$ForwardArgs)
    Ensure-Node                     # hard gate: returns only if Node >= 18 is (now) present
    Ensure-Git                      # soft: prints a note if git is missing, then proceeds
    Write-Host "Found Node $((& node -v)) — handing over to the Wienerdog installer…"
    if (Get-Command npx -ErrorAction SilentlyContinue) {
        Start-WienerdogNpx -ForwardArgs $ForwardArgs
        exit $LASTEXITCODE
    }
    Write-Host "npm/npx isn't available — installing Wienerdog directly from the npm registry…"
    exit (Install-ViaTarball -ForwardArgs $ForwardArgs)
}
```

### Pester additions (pure helpers only — no live network, no real install)

- **Get-LtsMsiInfo**: fixture index array with a leading `lts:$false` (Current)
  entry then an `lts:'Krypton'` `v24.18.0` entry → returns `Version='24.18.0'`,
  `MsiName='node-v24.18.0-x64.msi'`, correct `MsiUrl`/`ShaSumsUrl`; `-Arch 'arm64'`
  → `-arm64.msi`; an all-`lts:$false` array → `$null`; an entry with a non-semver
  version is skipped.
- **Get-ShaFromSums**: multi-line fixture → returns the right lowercase hex for the
  MSI name; absent name → `''`.
- **Get-MsiexecArgs**: `'C:\t\x.msi'` → `@('/i','C:\t\x.msi','/qn','/norestart')`.
- **Test-Elevated**: on the Linux/macOS CI runner returns `$false` (WindowsIdentity
  unsupported) without throwing.
- **Install-NodeViaMsi security branches** (via the `Invoke-WebRequest` +
  `Start-Process` mock seams — no live network, no real msiexec/UAC): (i) a
  downloaded-bytes fixture whose SHA256 ≠ the value in the (mocked) `SHASUMS256.txt`
  → returns `$false` **and `Start-Process` is invoked ZERO times** (tamper-abort
  before any install); (ii) a matching checksum but a non-zero elevated exit code
  (UAC-cancel `1223`) → returns `$false` (failed/cancelled-elevation HANDLING);
  (iii) matching checksum + exit `0` → returns `$true` (pass path). These unit-cover
  the two security branches the reviewer flagged; the real UAC dialog and a real MSI
  install stay on the manual checklist.

Do **not** Pester-test `Ensure-Node` end-to-end — it `exit`s on the hard gate, which
would terminate the Pester run, and it needs real Windows elevation/registry. Its
call into `Install-NodeViaMsi` **is** unit-covered above through Pester's
`Start-Process`/`Invoke-WebRequest` mock seams (no refactor needed — those cmdlets
are already the injectable seam, mirroring the tarball tests); the `exit 1` +
fail-to-print itself stays on the manual checklist.

## Implementation notes & constraints

- **`Get-FileHash -Algorithm SHA256` (hex) for the MSI** vs **`Get-SriSha512`
  (base64) for the npm tarball** — two different artifacts, two different digests.
  Do not cross them.
- **displayed == run:** the `msiexec` args shown in the `Ensure-Node` consent line
  come from the same `Get-MsiexecArgs` the installer runs (byte-identical, ADR-0011
  rule 1). The MSI URL shown is the same `$msi.MsiUrl` downloaded.
- **UAC is the elevation-consent surface**, layered on top of our `[Y/n]`: our
  prompt gates whether we *attempt* it; UAC is Windows deciding. A cancelled UAC =
  a failed install = print-fallback + `exit 1` (Node hard gate).
- **Never bootstrap winget, Chocolatey, Scoop, nvm-windows, or a portable Node
  zip** (ADR-0017 §2). winget is used only if already present.
- **git never exits.** Only the Node hard gate exits non-zero.
- **No `schtasks` / scheduling** (ADR-0017 §6). No README changes (wd-docs
  follow-up). Do not touch `install.sh` or any JS.
- When uncertain: simpler option; record under "Decisions made" in the PR.

## Security checklist

- [x] The Node LTS `version` from `dist/index.json` flows into the MSI URL/filename;
      `Get-LtsMsiInfo` validates it with the fully-anchored `Test-SemVer` (rejecting
      `/`, `\`, `..`) and skips non-conforming entries before building any URL.
- [x] The registry tarball `version` path-safety is already enforced by WP-057's
      `Test-SemVer` gate (unchanged here).

## Acceptance criteria

- [ ] `Main` gates on Node via `Ensure-Node` (hard) and offers git via `Ensure-Git`
      (soft) before the handoff; the WP-057 tarball/npx handoff is unchanged.
- [ ] Pure helpers (`Get-LtsMsiInfo`, `Get-ShaFromSums`, `Get-MsiexecArgs`,
      `Test-Elevated`, `Get-GitForWindowsAssetUrl`, `Get-GitSilentArgs`) pass their
      Pester tests on the Linux CI runner.
- [ ] `Install-NodeViaMsi`'s tamper-abort (SHA256 mismatch → no `Start-Process`) and
      failed/cancelled-elevation handling (non-zero exit → `$false`) pass their Pester
      tests via the mocked seams.
- [ ] `npm run lint` (PSScriptAnalyzer) and `Invoke-Pester tests/ps` stay green.
- [ ] **Manual Windows verification checklist below is completed and its output
      pasted into the PR** (this is the primary verification — CI cannot cover it).

### Manual Windows verification checklist (DoD — run on real Windows, paste results)

**Coverage split (be honest about what CI proves).** CI has **no Windows runner**.
Now **CI-covered** (Pester, mocked seams — no real Windows): the SHA256 tamper-abort
(mismatch → nothing installed, `Start-Process` invoked 0 times) and the
failed/cancelled-elevation *handling* (non-zero/UAC-cancel exit → `Install-NodeViaMsi`
returns `$false`). Still **owner-manual** (genuinely un-automatable without a real
Windows box): the real UAC dialog accept **and** cancel, a real MSI install, the
registry-PATH-refresh-without-a-new-shell, the git-accept live path, the true
interactive-console `IsInputRedirected=$false` prompt, and end-to-end `irm|iex` →
working `init` + skills.

Run on **both** a bare Windows Server 2022 (no winget, no Node — exercises the MSI
path) **and** a Windows 11 box (winget present — exercises the winget path), in
**Windows PowerShell 5.1** (the baseline; the research ran on pwsh 7.6.3, so 5.1
parity is confirmed here):

1. **Bare-machine happy path (MSI):** `irm <staged-url>/install.ps1 | iex` in a
   **non-elevated interactive** PowerShell window → the Node `[Y/n]` prompt shows
   the exact nodejs.org URL + msiexec command → accept → a **UAC prompt appears** →
   click **Yes** → MSI installs → PATH refreshes in-session → handoff runs →
   `wienerdog init` completes → `/wienerdog-*` skills are registered (restart the
   harness, confirm the slash commands load).
2. **Real UAC cancel:** accept our `[Y/n]` prompt, then click **Cancel/No** on the
   actual Windows UAC dialog → the exact manual command + `https://nodejs.org`
   printed, non-zero exit, **nothing installed**. (The branch logic — non-zero exit
   → `$false` — is now unit-tested in 2b; this confirms the real DIALOG's cancel
   maps onto it.)
3. **Decline:** answer `n` to the Node prompt → the exact manual command +
   `https://nodejs.org` printed, non-zero exit, **nothing installed**.
4. **Non-interactive:** `powershell -NonInteractive -Command "iex (irm <url>)"` (and
   separately a stdin-piped invocation) → **no prompt**, the fallback printed,
   non-zero exit, nothing installed. (Confirms the `[Console]::IsInputRedirected`
   detector.)
5. **Idempotent re-run:** run the one-liner again on the now-Node-present machine →
   no Node re-install, straight handoff; a second `init` is a no-op.
6. **winget path (Win 11):** on a machine with winget, the Node install goes through
   `winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements`
   (the exact string the `[Y/n]` line displays — still UAC-elevated).
7. **git — decline:** on a Codex/bare machine (no Git Bash), the git offer appears
   and is soft (declining still proceeds to the handoff); on a Claude Code machine,
   git is already present and the offer is skipped.
8. **git — accept:** on a bare machine, accept the git offer → `Get-GitForWindowsAssetUrl`
   hits the live GitHub releases API, the signed `.exe` downloads and installs
   silently, and `git` resolves afterward. (The winget-flavored accept, on Win 11,
   goes through the displayed `winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements`.)
9. **Interactive-console prompt actually reads input** (the `IsInputRedirected=$false`
   branch the research could not observe in its sandbox — confirm the `[Y/n]` prompt
   genuinely waits for and reads your keystroke).

Record OS build, PowerShell version, winget presence, and each step's result.

## Verification steps (automated part; paste output in the PR)

```bash
npm run lint
pwsh -NoProfile -Command "Invoke-Pester -Path tests/ps -Output Detailed -CI"
```

(Plus the manual Windows checklist above — its results are part of the PR.)

## Out of scope (do NOT do these)

- Any change to WP-057's detection/consent/tarball functions or the CI wiring.
- Windows scheduling / `schtasks` — deferred (ADR-0017 §6).
- README / `install.sh` note updates — wd-docs follow-up.
- nvm-windows / portable-zip / Chocolatey / Scoop / winget-bootstrap paths — ADR-0017
  rejects them for v1.
- Promoting the manual checklist into a standalone reusable doc — wd-docs follow-up.

## Definition of done

1. Automated verification passes locally; the **manual Windows checklist is
   completed** and its results are pasted into the PR body.
2. Branch `wp/058-install-ps1-node-git-actions`; conventional commits; PR titled
   `feat(install): install.ps1 consented Node/git auto-install + PATH refresh (WP-058)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Owner confirmed ADR-0017's elevation posture (2026-07-05, ADR Accepted) — done;
   this precondition is satisfied.
