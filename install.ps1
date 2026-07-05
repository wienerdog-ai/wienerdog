# Wienerdog bootstrapper (Windows) - https://github.com/wienerdog-ai/wienerdog
# The PowerShell analog of install.sh, invoked as `irm <url>/install.ps1 | iex`.
# Checks for a recent Node.js on PATH and, if found, hands off to the versioned
# `npx wienerdog@latest init` (or an npm-less registry-tarball fallback when npx
# is absent), which does the real install work. Node/git auto-install (which on
# Windows requires UAC elevation) is a separate work package (WP-058); here a
# Node-absent machine gets print-guidance-and-exit.
#
# IRON RULE (ADR-0004): Wienerdog is just files. This installer runs synchronous
# work and exits; it starts nothing that outlives its job, no daemon, no telemetry.

# --- Non-interactive detection (module scope, computed once) ----------------
# Non-interactive iff stdin is redirected, or a remoting host, or an explicit
# -NonInteractive flag. IsInputRedirected is the ground truth (WP-056):
# [Environment]::UserInteractive is documented-unreliable and must NOT be used.
$script:NonInteractive =
    [Console]::IsInputRedirected -or
    ($Host.Name -eq 'ServerRemoteHost') -or
    ([Environment]::GetCommandLineArgs() -match '^-NonInteractive$|^-noni$')

# --- Path-safety + pure helpers --------------------------------------------

# Fully-anchored strict semver. Rejects '', '1.2', 'v1.2.3', '1.2.3/../x',
# '1.2.3\x', '..' - none of which match this charset. (^...$ is load-bearing.)
function Test-SemVer {
    param([string]$Version)
    return $Version -match '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'
}

# Registry tarball URL - CONSTRUCTED locally from an already-validated version,
# never taken from the registry JSON. Caller MUST have passed Test-SemVer first.
function Get-TarballUrl {
    param([string]$Version)
    return "https://registry.npmjs.org/wienerdog/-/wienerdog-$Version.tgz"
}

# sha512 SRI ('sha512-<base64>') of a file, byte-identical to what WP-053's Node
# verifier and WP-055's bash path compute. Uses .NET SHA512 (built into 5.1) -
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
    $profileDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $env:HOME }
    return (Join-Path $profileDir '.wienerdog')
}

# --- Consent ----------------------------------------------------------------

# Per-hop consent. Shows the exact command/URL in $Message (the CALLER builds it),
# prompts [Y/n] (default yes) on the live console. Returns $true to proceed.
# When non-interactive: prints copy-paste guidance and returns $false (never
# auto-installs, never applies default-yes) - the caller then exits non-zero.
function Confirm-Step {
    param([Parameter(Mandatory)][string]$Message)
    if ($script:NonInteractive) {
        Write-Host "Not an interactive console - cannot ask for confirmation."
        Write-Host "To do this yourself, run the command shown above, or re-run"
        Write-Host "install.ps1 from an interactive PowerShell window."
        return $false
    }
    $reply = Read-Host "$Message [Y/n]"
    if ([string]::IsNullOrWhiteSpace($reply)) { return $true }   # bare Enter = yes
    return $reply -match '^(y|yes)$'
}

# --- npm-less tarball fallback (ADR-0016) -----------------------------------

# Thin wrappers so Pester can Mock the external handoffs. They only shell out to
# an external process (no Wienerdog state to gate), so ShouldProcess/-WhatIf does
# not apply - the SuppressMessage keeps the 'Start-' verb without that ceremony.
function Start-WienerdogNpx {
    [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Thin external-process handoff; no state to gate with ShouldProcess.')]
    param([string[]]$ForwardArgs)
    & npx --yes wienerdog@latest init @ForwardArgs
}
function Start-WienerdogInit {
    [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Thin external-process handoff; no state to gate with ShouldProcess.')]
    param([Parameter(Mandatory)][string]$BinPath, [string[]]$ForwardArgs)
    & node $BinPath init @ForwardArgs
}

# Copy-paste fallback when the tarball path can't/won't run.
function Write-Tarball-Fallback {
    Write-Host "To install Wienerdog yourself, add npm and run:"
    Write-Host "    npx wienerdog@latest init"
    Write-Host "npm ships with Node.js - reinstall Node from https://nodejs.org to get it."
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
            Write-Host "Checksum mismatch - refusing to install the download."
            return $false
        }
        $staging = Join-Path $tmp 'staging'
        New-Item -ItemType Directory -Path $staging -Force | Out-Null
        # npm tarballs wrap everything under package/ - strip it so bin\ src\ land at dest.
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
# exactly what/where), download+verify+unpack, then hand off to `node ...\init`.
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

# --- Node detection + Main --------------------------------------------------

# Returns the installed node major version as an int, or 0 if node is absent/unparseable.
function Get-NodeMajor {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return 0 }
    $v = (& node -v) 2>$null            # e.g. "v20.11.1"
    if ($v -match '^v?([0-9]+)\.') { return [int]$Matches[1] }
    return 0
}

function Main {
    param([string[]]$ForwardArgs)
    $script:MainRan = $true
    $major = Get-NodeMajor
    if ($major -lt 18) {
        Write-Host "Node.js 18+ was not found on your PATH."
        Write-Host "Install Node LTS from https://nodejs.org, then re-run this installer."
        # WP-058 replaces this branch with a consented winget/MSI auto-install.
        exit 1
    }
    Write-Host "Found Node $((& node -v)) - handing over to the Wienerdog installer..."
    if (Get-Command npx -ErrorAction SilentlyContinue) {
        Start-WienerdogNpx -ForwardArgs $ForwardArgs
        exit $LASTEXITCODE
    }
    Write-Host "npm/npx isn't available - installing Wienerdog directly from the npm registry..."
    exit (Install-ViaTarball -ForwardArgs $ForwardArgs)
}

# Dot-source guard (WP-056): runs Main on direct execution AND under irm|iex
# (InvocationName is '' there, which is -ne '.'), but NOT when dot-sourced for
# tests (InvocationName is '.'). The env seam mirrors install.sh's
# WIENERDOG_INSTALL_LIB for defense-in-depth / forced library mode.
if ($MyInvocation.InvocationName -ne '.' -and -not $env:WIENERDOG_INSTALL_LIB) {
    Main -ForwardArgs $args
}
