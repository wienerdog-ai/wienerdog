---
id: WP-057
title: install.ps1 core — detection, consent, npm-less tarball fallback, CI lint+Pester gate
status: In-Review
model: opus
size: M
depends_on: [WP-056]
adrs: [ADR-0017, ADR-0011, ADR-0016, ADR-0004]
branch: wp/057-install-ps1-core
---

# WP-057: `install.ps1` core (detection, consent, tarball fallback, CI gate)

## Context (read this, nothing else)

Wienerdog's default installer on macOS/Linux is `install.sh`
(`curl -fsSL <url>/install.sh | bash`): it checks for Node ≥ 18, offers consented
dependency installs, then hands off to `wienerdog init` (via `npx`, or a
registry-tarball fallback when `npx` is absent). We now build the **PowerShell
analog**, `install.ps1`, invoked as `irm <url>/install.ps1 | iex`, so a Windows
user gets the same one-line install. **IRON RULE (ADR-0004): Wienerdog is just
files** — the installer runs synchronous work and exits; it starts nothing that
outlives its job, no daemon, no telemetry.

This WP builds the **testable core**: everything needed to get a Windows machine
that **already has Node ≥ 18** to a working `wienerdog init` + skills, plus the CI
lint + unit-test harness for PowerShell. The **auto-install of a missing Node/git**
(which on Windows unavoidably requires UAC elevation — see below) is a **separate
WP (WP-058)**; this WP's `Main`, when Node is missing or too old, prints guidance
and exits non-zero (WP-058 replaces that one branch).

**Platform facts this WP relies on (verified by WP-056's research memo,
`memory/research/2026-07-05-windows-install-ps1.md` — inlined here so you need not
read it):**

- `irm URL | iex` is PowerShell's **object** pipeline, **not** bash's
  stdin-redirecting `curl | bash`. The process's real stdin (the interactive
  console) is untouched, so `Read-Host` inside the iex'd code reads from the live
  terminal. **There is no `/dev/tty` trick and no stdin trap.** (Microsoft
  `about_Pipelines`: "stdin isn't connected to the PowerShell pipeline for input.")
- **Non-interactive detection:** `[Console]::IsInputRedirected` is the reliable
  signal (true for pipe/file/redirected input, false for a real console).
  **Do not** use `[Environment]::UserInteractive` (documented-unreliable; returns
  `$true` even under full redirection).
- **Consent primitive:** `Read-Host` with a manual `[Y/n]` parse (default yes), not
  `$Host.UI.PromptForChoice` (whose exception text is host-specific and unstable).
- **Dot-source guard for testing:** under `irm|iex` there is no script file, so
  `$MyInvocation.InvocationName` is the empty string `''` (which is `-ne '.'`, so
  `Main` runs — the desired behavior). When dot-sourced (Pester `BeforeAll`) it is
  `'.'` (so `Main` is skipped). Verified across direct-run, `irm|iex`, and
  dot-source shapes.
- **CI:** `ubuntu-latest` and `macos-latest` GitHub runners ship `pwsh`, Pester,
  and PSScriptAnalyzer preinstalled — so this WP is linted and unit-tested with
  **zero extra runner cost**, covering PowerShell syntax and the script's *pure*
  functions and the tarball fetch/verify/unpack (against a locally-built fixture
  with real `tar`). PSScriptAnalyzer flags `Write-Host`, which an interactive
  installer legitimately needs — a committed settings file excludes that one rule.

**The npm-less tarball path mirrors WP-055's bash version exactly** (ADR-0016):
GET `registry.npmjs.org/wienerdog/latest`, read `version` + `dist.integrity`
(`sha512-<base64>` SRI), validate the version as **strict, fully-anchored semver**,
**construct** the tarball URL locally (never trust the JSON's `tarball` field),
download, **verify sha512 before unpacking**, extract with `tar --strip-components=1`
into `~/.wienerdog/app/<version>/`, then `node app\<version>\bin\wienerdog.js init`.

## Current state

Nothing PowerShell exists in the repo. `install.sh` exists at the repo root (the
posture to mirror; do not modify it here). `scripts/lint.js` runs markdownlint +
shellcheck (gated on the `shellcheck` binary being present) + a frontmatter check.
`.github/workflows/ci.yml` has a `lint` job (ubuntu-latest, runs `npm run lint`)
and a `test` job (ubuntu + macOS, runs `npm test`). There is no PowerShell lint or
test layer yet.

The Windows `.cmd` shim (`~/.local/bin/wienerdog.cmd`) already exists (WP-051), and
`wienerdog update` (WP-054) already works on Windows — neither is in scope here.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | install.ps1 | the bootstrapper: detection, `Confirm-Step` consent, npm-less tarball fallback, npx handoff, `Main` (Node-absent → print+exit, filled by WP-058), dot-source guard |
| create | PSScriptAnalyzerSettings.psd1 | excludes `PSAvoidUsingWriteHost` (interactive installer output is host UI by design); no other rule changes |
| create | tests/ps/install-ps1.Tests.ps1 | Pester v5 tests; dot-sources install.ps1 in library mode; builds the fixture tarball offline with `tar` |
| modify | scripts/lint.js | add a PowerShell layer: run `Invoke-ScriptAnalyzer` over `*.ps1` via `pwsh`, gated on `pwsh` being present (skip-with-warning if absent, exactly like the shellcheck layer) |
| modify | .github/workflows/ci.yml | add a Pester step (runs `Invoke-Pester tests/ps -CI` via `pwsh` on ubuntu-latest) |

### Exact contracts — `install.ps1`

Structure: a header comment, then function definitions, then the dot-source guard.
Every function must pass `Invoke-ScriptAnalyzer` with the committed settings
(Warning + Error severity). Use `[CmdletBinding()]`/typed params. Use `Write-Host`
freely for user-facing text (the settings file allows it). **Do not** use `exit`
inside a helper that Pester dot-sources and calls (it would kill the test process);
only `Main` and the top-level guard call `exit`.

**Path-safety (Security checklist — binding):** the version string from the
registry flows into `app\<version>\` (a filesystem path). Validate it with a
**fully anchored** semver regex that rejects `/`, `\`, and `..` **before** it
touches any path or download. The start-anchored-only form is an arbitrary-write
primitive (WP-055 twin).

```powershell
# Fully-anchored strict semver. Rejects '', '1.2', 'v1.2.3', '1.2.3/../x',
# '1.2.3\x', '..' — none of which match this charset. (^...$ is load-bearing.)
function Test-SemVer {
    param([string]$Version)
    return $Version -match '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'
}

# Registry tarball URL — CONSTRUCTED locally from an already-validated version,
# never taken from the registry JSON. Caller MUST have passed Test-SemVer first.
function Get-TarballUrl {
    param([string]$Version)
    return "https://registry.npmjs.org/wienerdog/-/wienerdog-$Version.tgz"
}

# sha512 SRI ('sha512-<base64>') of a file, byte-identical to what WP-053's Node
# verifier and WP-055's bash path compute. Uses .NET SHA512 (built into 5.1) —
# no Node, no openssl, no external dep. Get-FileHash is NOT used here (it returns
# hex; SRI is base64).
function Get-SriSha512 {
    param([string]$Path)
    $sha = [System.Security.Cryptography.SHA512]::Create()
    try {
        $bytes = [System.IO.File]::ReadAllBytes($Path)
        return 'sha512-' + [System.Convert]::ToBase64String($sha.ComputeHash($bytes))
    }
    finally { $sha.Dispose() }
}

# Canonical core dir: $WIENERDOG_HOME if set, else <userprofile>/.wienerdog.
# Uses $env:USERPROFILE on Windows and falls back to $HOME so Pester on Linux/mac
# can point it at a temp dir via $env:WIENERDOG_HOME.
function Get-CoreDir {
    if ($env:WIENERDOG_HOME) { return $env:WIENERDOG_HOME }
    $home = if ($env:USERPROFILE) { $env:USERPROFILE } else { $env:HOME }
    return (Join-Path $home '.wienerdog')
}
```

**Consent.** Compute `$script:NonInteractive` once, near the top of the script
(module scope), then gate every consent through `Confirm-Step`. `Confirm-Step`
**returns a bool and never exits** — the caller prints the fallback and exits on
`$false`.

```powershell
# Non-interactive iff stdin is redirected, or a remoting host, or an explicit
# -NonInteractive flag. IsInputRedirected is the ground truth (WP-056).
$script:NonInteractive =
    [Console]::IsInputRedirected -or
    ($Host.Name -eq 'ServerRemoteHost') -or
    ([Environment]::GetCommandLineArgs() -match '^-NonInteractive$|^-noni$')

# Per-hop consent. Shows the exact command/URL in $Message (the CALLER builds it),
# prompts [Y/n] (default yes) on the live console. Returns $true to proceed.
# When non-interactive: prints copy-paste guidance and returns $false (never
# auto-installs, never applies default-yes) — the caller then exits non-zero.
function Confirm-Step {
    param([Parameter(Mandatory)][string]$Message)
    if ($script:NonInteractive) {
        Write-Host "Not an interactive console — cannot ask for confirmation."
        Write-Host "To do this yourself, run the command shown above, or re-run"
        Write-Host "install.ps1 from an interactive PowerShell window."
        return $false
    }
    $reply = Read-Host "$Message [Y/n]"
    if ([string]::IsNullOrWhiteSpace($reply)) { return $true }   # bare Enter = yes
    return $reply -match '^(y|yes)$'
}
```

**Tarball install (the npm-less path).** `Invoke-WebRequest` /
`Invoke-RestMethod` are cmdlets (Pester-mockable); the final Node handoff is
wrapped in `Start-WienerdogInit` / `Start-WienerdogNpx` so Pester can mock them
instead of really running `init`.

```powershell
# Thin wrappers so Pester can Mock the external handoffs.
function Start-WienerdogNpx {
    param([string[]]$ForwardArgs)
    & npx --yes wienerdog@latest init @ForwardArgs
}
function Start-WienerdogInit {
    param([Parameter(Mandatory)][string]$BinPath, [string[]]$ForwardArgs)
    & node $BinPath init @ForwardArgs
}

# Download the tarball at $Url, verify its sha512 == $Integrity BEFORE unpacking,
# extract with `tar --strip-components=1` into $Dest. Verify-before-unpack is
# structural: a mismatch aborts and unpacks nothing. Extract into a staging dir,
# then move onto $Dest. Returns $true on success, $false on any failure.
function Invoke-TarballInstall {
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][string]$Integrity,
        [Parameter(Mandatory)][string]$Dest
    )
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("wd-" + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    try {
        $tgz = Join-Path $tmp 'wd.tgz'
        try { Invoke-WebRequest -Uri $Url -OutFile $tgz -UseBasicParsing }
        catch { Write-Host "Download failed."; return $false }
        if ((Get-SriSha512 $tgz) -ne $Integrity) {
            Write-Host "Checksum mismatch — refusing to install the download."
            return $false
        }
        $staging = Join-Path $tmp 'staging'
        New-Item -ItemType Directory -Path $staging -Force | Out-Null
        # npm tarballs wrap everything under package/ — strip it so bin\ src\ land at dest.
        & tar -xzf $tgz --strip-components=1 -C $staging
        if ($LASTEXITCODE -ne 0) { Write-Host "Extraction failed."; return $false }
        $parent = Split-Path -Parent $Dest
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
        if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
        Move-Item -Path $staging -Destination $Dest
        return $true
    }
    finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}

# The npm-less install path: fetch + validate the manifest, get consent (showing
# exactly what/where), download+verify+unpack, then hand off to `node …\init`.
# Prints the fallback + returns 1 (caller: `exit`) on any failure/decline/no-tty.
function Install-ViaTarball {
    param([string[]]$ForwardArgs)
    $core = Get-CoreDir
    $meta = $null
    try { $meta = Invoke-RestMethod -Uri 'https://registry.npmjs.org/wienerdog/latest' -UseBasicParsing }
    catch { $meta = $null }

    $ver = if ($meta) { [string]$meta.version } else { '' }
    $integrity = if ($meta -and $meta.dist) { [string]$meta.dist.integrity } else { '' }

    if (-not (Test-SemVer $ver) -or ($integrity -notmatch '^sha512-')) {
        Write-Host "Couldn't read Wienerdog's release info from the npm registry."
        Write-Tarball-Fallback
        return 1
    }
    $url = Get-TarballUrl $ver
    $dest = Join-Path (Join-Path $core 'app') $ver

    if (Test-Path (Join-Path $dest 'bin\wienerdog.js')) {   # idempotent
        Start-WienerdogInit -BinPath (Join-Path $dest 'bin\wienerdog.js') -ForwardArgs $ForwardArgs
        return 0
    }

    Write-Host "Wienerdog will download and unpack the app (no npm needed):"
    Write-Host "    from: $url"
    Write-Host "    to:   $dest"
    if (-not (Confirm-Step "Download and install Wienerdog now?")) {
        Write-Tarball-Fallback
        return 1
    }
    if (Invoke-TarballInstall -Url $url -Integrity $integrity -Dest $dest) {
        Start-WienerdogInit -BinPath (Join-Path $dest 'bin\wienerdog.js') -ForwardArgs $ForwardArgs
        return 0
    }
    Write-Tarball-Fallback
    return 1
}

# Copy-paste fallback when the tarball path can't/won't run.
function Write-Tarball-Fallback {
    Write-Host "To install Wienerdog yourself, add npm and run:"
    Write-Host "    npx wienerdog@latest init"
    Write-Host "npm ships with Node.js — reinstall Node from https://nodejs.org to get it."
}
```

**Node detection + `Main`.** `Main` gates on Node; when Node is missing or too old
it prints guidance and exits non-zero (WP-058 replaces that branch with the
consented auto-install). The `$ForwardArgs` are the script's `$args`, forwarded to
`init`.

```powershell
# Returns the installed node major version as an int, or 0 if node is absent/unparseable.
function Get-NodeMajor {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return 0 }
    $v = (& node -v) 2>$null            # e.g. "v20.11.1"
    if ($v -match '^v?([0-9]+)\.') { return [int]$Matches[1] }
    return 0
}

function Main {
    param([string[]]$ForwardArgs)
    $major = Get-NodeMajor
    if ($major -lt 18) {
        Write-Host "Node.js 18+ was not found on your PATH."
        Write-Host "Install Node LTS from https://nodejs.org, then re-run this installer."
        # WP-058 replaces this branch with a consented winget/MSI auto-install.
        exit 1
    }
    Write-Host "Found Node $((& node -v)) — handing over to the Wienerdog installer…"
    if (Get-Command npx -ErrorAction SilentlyContinue) {
        Start-WienerdogNpx -ForwardArgs $ForwardArgs
        exit $LASTEXITCODE
    }
    Write-Host "npm/npx isn't available — installing Wienerdog directly from the npm registry…"
    exit (Install-ViaTarball -ForwardArgs $ForwardArgs)
}

# Dot-source guard (WP-056): runs Main on direct execution AND under irm|iex
# (InvocationName is '' there, which is -ne '.'), but NOT when dot-sourced for
# tests (InvocationName is '.'). The env seam mirrors install.sh's
# WIENERDOG_INSTALL_LIB for defense-in-depth / forced library mode.
if ($MyInvocation.InvocationName -ne '.' -and -not $env:WIENERDOG_INSTALL_LIB) {
    Main -ForwardArgs $args
}
```

### Exact contract — `PSScriptAnalyzerSettings.psd1`

```powershell
@{
    # Interactive installer output is host UI by design (colored [Y/n] prompts and
    # status lines), so PSAvoidUsingWriteHost does not apply here.
    ExcludeRules = @('PSAvoidUsingWriteHost')
}
```

### Exact contract — `scripts/lint.js` (add a PowerShell layer)

Add a layer AFTER shellcheck and BEFORE the frontmatter check, mirroring the
shellcheck gating (skip-with-warning when the tool is absent, so local machines
without `pwsh` still pass; CI's ubuntu-latest has `pwsh`):

```js
  console.log('--- PSScriptAnalyzer ---');
  const psFiles = /* recursively find *.ps1 under root, skipping node_modules/.git */;
  if (psFiles.length === 0) {
    console.log('no .ps1 files found, skipping');
  } else if (!hasBinary('pwsh')) {
    console.warn('pwsh not found, skipping PSScriptAnalyzer (install PowerShell to run it locally; CI has it)');
  } else {
    const script =
      "$r = Invoke-ScriptAnalyzer -Path . -Recurse -Settings ./PSScriptAnalyzerSettings.psd1 " +
      "-Severity Warning,Error; $r | Format-Table -AutoSize; " +
      "if (@($r).Count -gt 0) { exit 1 }";
    if (!run('pwsh', ['-NoProfile', '-Command', script])) {
      console.error('PSScriptAnalyzer failed');
      failed = true;
    }
  }
```

Reuse the existing `hasBinary`/`run` helpers and add a `.ps1` finder analogous to
`findShellFiles` (or extend it — implementer's choice; keep it simple). The
`Invoke-ScriptAnalyzer -Path . -Recurse` form scans both `install.ps1` and the
test `.ps1`; that is fine (tests should also be clean).

### Exact contract — `.github/workflows/ci.yml` (add a Pester step)

Add a step to the existing `lint` job (ubuntu-latest has `pwsh` + Pester
preinstalled), after the `Lint` step:

```yaml
      - name: Pester (install.ps1 unit tests)
        shell: pwsh
        run: |
          Invoke-Pester -Path tests/ps -CI
```

Do not add a new job or a Windows runner (there is none). Do not change the
`test`/`boundary`/`pr-title` jobs.

### Exact contract — `tests/ps/install-ps1.Tests.ps1`

Pester v5. Dot-source the script in library mode; build the fixture tarball
offline with `tar` (no `npm pack`, no network). Cover:

```powershell
BeforeAll {
    $env:WIENERDOG_INSTALL_LIB = '1'         # belt: force library mode
    . $PSScriptRoot/../../install.ps1        # dot-source: InvocationName '.' → Main skipped
    # Build a fixture npm-style tarball: package/bin/wienerdog.js etc.
    $pkg = Join-Path $TestDrive 'pkg/package/bin'
    New-Item -ItemType Directory -Path $pkg -Force | Out-Null
    Set-Content -Path (Join-Path $pkg 'wienerdog.js') -Value '// fixture'
    $script:Fixture = Join-Path $TestDrive 'fixture.tgz'
    Push-Location (Join-Path $TestDrive 'pkg')
    & tar -czf $script:Fixture package
    Pop-Location
    $script:FixtureSri = Get-SriSha512 $script:Fixture
}
```

Required test cases (each an `It`):

- **Test-SemVer** accepts `0.4.0`, `10.20.30`, `1.2.3-beta.1`, `1.2.3+build.5`;
  rejects `''`, `1.2`, `v1.2.3`, `1.2.3/../../x`, `1.2.3\x`, `..`, and `1.2.3`
  with a trailing space.
- **Get-TarballUrl** `0.4.0` → `https://registry.npmjs.org/wienerdog/-/wienerdog-0.4.0.tgz`.
- **Get-SriSha512** of the fixture starts with `sha512-` and equals a value
  independently computed in the test (`[Convert]::ToBase64String(...)`).
- **Confirm-Step** with `$script:NonInteractive = $true` returns `$false` (and does
  NOT call `Read-Host`); with `NonInteractive=$false` and `Mock Read-Host { '' }`
  returns `$true`; `{ 'y' }` → `$true`; `{ 'n' }` → `$false`.
- **Invoke-TarballInstall** with `Mock Invoke-WebRequest { Copy-Item $script:Fixture $OutFile }`
  and the correct `$script:FixtureSri` → returns `$true`; `<dest>\bin\wienerdog.js`
  exists. With a **wrong** integrity string → returns `$false` and `<dest>` is NOT
  created.
- **Install-ViaTarball** with `$env:WIENERDOG_HOME` set to a `$TestDrive` dir,
  `Mock Invoke-RestMethod { @{ version = '0.4.0'; dist = @{ integrity = $script:FixtureSri } } }`,
  `Mock Invoke-WebRequest { Copy-Item $script:Fixture $OutFile }`,
  `Mock Start-WienerdogInit {}`, and `Mock Read-Host { '' }` (consent yes) →
  returns `0`, `Start-WienerdogInit` called once with `BinPath` under
  `<home>\app\0.4.0\bin\wienerdog.js`.
- **Install-ViaTarball path-traversal** (Security): `Mock Invoke-RestMethod`
  returning `version = '1.2.3/../../pwned'` → returns `1`, `Invoke-WebRequest`
  and `Start-WienerdogInit` are **never called** (`Should -Invoke … -Times 0`),
  nothing is written outside `<home>`. (Twin of WP-055's canary test.)
- **Install-ViaTarball consent no** (`Mock Read-Host { 'n' }`) → returns `1`,
  `Invoke-WebRequest` never called.
- **Guard**: assert `Main` did not run during `BeforeAll` (e.g. a module-scope
  sentinel variable that `Main` would set remains unset), proving the dot-source
  guard skipped it.

Note for Pester mocking: to make `Invoke-WebRequest`'s `-OutFile` visible inside a
`Mock`, reference the bound parameter `$OutFile` in the mock body (Pester binds
mocked-cmdlet parameters). Use `Should -Invoke` for call-count assertions.

## Implementation notes & constraints

- **No new npm runtime deps.** PSScriptAnalyzer/Pester are the CI runner's
  preinstalled PowerShell modules, not npm packages — nothing is added to
  `package.json`/`package-lock.json`. (If a runner ever lacks them, the CI step may
  `Install-Module Pester,PSScriptAnalyzer -Scope CurrentUser -Force -SkipPublisherCheck`
  first, but the current images ship them — do not add that unless CI fails.)
- **`exit` only in `Main` and the top-level guard.** Helpers return values;
  `Install-ViaTarball` returns `0`/`1` and `Main` `exit`s with it. This keeps every
  helper safe to dot-source and call under Pester.
- **`Write-Host` is intentional** for all user-facing lines; the settings file
  allows it. Do not switch to `Write-Output` (it pollutes the pipeline/return
  values) or `Write-Information`.
- **`tar` on Linux CI vs `tar.exe` on Windows:** the same `tar -xzf … --strip-components=1`
  invocation works on both (Windows 10+ ships bsdtar as `tar.exe`). The Pester test
  runs on Linux with real `tar`; do not hard-code `tar.exe`.
- **sha512 is base64 SRI, not hex.** Use `Get-SriSha512` (the .NET SHA512 +
  base64), NOT `Get-FileHash` (hex). `Get-FileHash -Algorithm SHA256` is only for
  the Node MSI in WP-058 (hex vs `SHASUMS256.txt`).
- **Do not implement Node/git auto-install, elevation, `winget`, MSI download, or
  PATH refresh here** — all WP-058. `Main`'s Node-absent branch is a deliberate
  print-and-exit placeholder.
- **Do not modify `install.sh`, the README, or any adapter/core JS.** The README
  one-liner + `install.sh`'s "PowerShell installer coming" note are a wd-docs
  follow-up.
- When uncertain: choose the simpler option and record it under "Decisions made" in
  the PR.

## Security checklist

- [x] The registry `version` string flows into `app\<version>\` and is validated
      with the fully-anchored `Test-SemVer` (`^…$`, rejecting `/`, `\`, `..`)
      **before** any path build or download. The path-traversal Pester test
      (`1.2.3/../../pwned` → no download, no write, returns 1) proves it.

## Acceptance criteria

- [ ] `install.ps1` exists; dot-sourcing it (as Pester does) loads its functions
      **without** running `Main` (guard verified).
- [ ] On a machine with Node ≥ 18 and `npx`, `Main` invokes
      `npx --yes wienerdog@latest init` (mocked in tests via `Start-WienerdogNpx`).
- [ ] On Node ≥ 18 without `npx`, `Install-ViaTarball` fetches `/latest`, validates
      the version (fully-anchored semver) + integrity, verifies the real sha512 of
      the downloaded fixture, extracts it, and hands off to `node …\app\<v>\bin\wienerdog.js init`.
- [ ] A malicious manifest `version` containing `/` or `..` is rejected before any
      download or write; consent-no and non-interactive both print the fallback and
      return non-zero with no download.
- [ ] `npm run lint` runs PSScriptAnalyzer over `install.ps1` (locally: skipped
      with a warning if `pwsh` is absent) and passes with the committed settings.
- [ ] `Invoke-Pester tests/ps` passes (all cases above green); the CI `lint` job
      runs it.

## Verification steps (run these; paste output in the PR)

```bash
npm run lint            # includes PSScriptAnalyzer when pwsh is present
npm test                # existing node:test suite stays green (unaffected)
pwsh -NoProfile -Command "Invoke-Pester -Path tests/ps -Output Detailed -CI"
pwsh -NoProfile -Command "Invoke-ScriptAnalyzer -Path ./install.ps1 -Settings ./PSScriptAnalyzerSettings.psd1 -Severity Warning,Error"
```

(If `pwsh` is not installed locally, install PowerShell 7 — `brew install --cask powershell`
on macOS — to run the last two commands; CI runs them regardless.)

## Out of scope (do NOT do these)

- Node/git **auto-install**, UAC elevation, `winget`, official-MSI download +
  SHA256 verify, LTS discovery from `nodejs.org/dist/index.json`, registry PATH
  refresh, and the manual Windows VM checklist — **all WP-058**.
- Windows scheduling / `schtasks` — deferred (ADR-0017 §6).
- README / `install.sh` note updates — wd-docs follow-up.
- Any change to the existing JS installer, adapters, or `wienerdog update`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/057-install-ps1-core`; conventional commits; PR titled
   `feat(install): install.ps1 core — detection, consent, tarball fallback (WP-057)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
