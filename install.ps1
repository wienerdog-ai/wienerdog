# Wienerdog bootstrapper (Windows) - https://github.com/wienerdog-ai/wienerdog
# The PowerShell analog of install.sh, invoked as `irm <url>/install.ps1 | iex`.
# Checks for a recent Node.js on PATH and, if present, hands off to the versioned
# `npx wienerdog@latest init` (or an npm-less registry-tarball fallback when npx
# is absent), which does the real install work. When Node is missing or too old,
# it offers a consented install (winget if present, else the official signed
# nodejs.org MSI, SHA256-verified, installed via a UAC-elevated msiexec); Node is
# the only hard gate. git is offered the same way but never blocks the handoff.
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
# '1.2.3\x', '..' - none of which match this charset. Uses .NET's absolute
# anchors \A...\z (not ^...$): in .NET/PowerShell '$' matches before a trailing
# newline, so '^...$' would accept "1.2.3`n"; \A...\z rejects it (WP-058 owner
# amendment). The anchors are load-bearing for path-safety.
function Test-SemVer {
    param([string]$Version)
    return $Version -match '\A[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?\z'
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

# Success banner. Printed by Main only when the install handoff returned 0. A
# separate function so Pester can assert it fires on success (not on failure) and
# can check its text. Pure ASCII (WP-057: non-ASCII risks the BOM analyzer + a
# PS 5.1 mis-decode under irm|iex).
function Write-CompletionBanner {
    Write-Host ""
    Write-Host "==================================================================="
    Write-Host "  Wienerdog is installed."
    Write-Host ""
    Write-Host "  Restart your AI tool (Claude Code or Codex) so the new"
    Write-Host "  /wienerdog-* commands load, then run  /wienerdog-setup  to begin."
    Write-Host "==================================================================="
    Write-Host ""
    Write-Host "You can close this window whenever you're ready."
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

# Thin seam so Main's npx-vs-tarball branch is Pester-mockable without mocking the
# built-in Get-Command.
function Test-NpxAvailable {
    return [bool](Get-Command npx -ErrorAction SilentlyContinue)
}

# --- Elevation + session PATH (Windows) -------------------------------------

# True iff the current process is elevated (Administrator). Off-Windows (Pester on
# Linux/macOS) WindowsIdentity throws PlatformNotSupportedException -> return $false.
function Test-Elevated {
    try {
        $id = [Security.Principal.WindowsIdentity]::GetCurrent()
        return ([Security.Principal.WindowsPrincipal]$id).IsInRole(
            [Security.Principal.WindowsBuiltinRole]::Administrator)
    }
    catch { return $false }
}

# Refresh the current session PATH from the registry (Machine + User scopes) so a
# just-installed node/npx resolves without a new shell. Off-Windows the scoped
# getters return $null -> the join is harmless; guard against $null.
function Update-SessionPath {
    [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Refreshes only this process $env:Path from the registry; no persistent/system state to gate with ShouldProcess.')]
    param()
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
}

# --- Node LTS discovery + checksum (PURE - Pester-tested with fixtures) ------

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
            # Guard: the version segment goes into a URL/filename -> validate.
            if (-not (Test-SemVer $bare)) { continue }
            $name = "node-$v-$Arch.msi"
            return @{
                Version    = $bare
                MsiName    = $name
                MsiUrl     = "https://nodejs.org/dist/$v/$name"
                ShaSumsUrl = "https://nodejs.org/dist/$v/SHASUMS256.txt"
            }
        }
    }
    return $null
}

# From the raw SHASUMS256.txt text, return the lowercase hex sha256 for $FileName,
# or '' if absent. PURE. Lines look like "abc123...  node-v24.18.0-x64.msi".
function Get-ShaFromSums {
    [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseSingularNouns', '', Justification = 'Parses SHASUMS256.txt; "Sums" is the file name it reads, and the function name is fixed by the WP-058 contract.')]
    param([Parameter(Mandatory)][string]$SumsText, [Parameter(Mandatory)][string]$FileName)
    foreach ($line in ($SumsText -split "`n")) {
        $parts = $line.Trim() -split '\s+', 2
        if ($parts.Count -eq 2 -and $parts[1].Trim() -eq $FileName) { return $parts[0].Trim().ToLower() }
    }
    return ''
}

# The exact msiexec argument list for a quiet, no-restart per-machine install of
# $MsiPath. PURE (returns the array) so it can be asserted in a test. Displayed in
# the consent line and used verbatim by Install-NodeViaMsi (displayed == run).
function Get-MsiexecArgs {
    [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseSingularNouns', '', Justification = 'Returns an argument list (plural by nature); name is fixed by the WP-058 contract.')]
    param([Parameter(Mandatory)][string]$MsiPath)
    return @('/i', $MsiPath, '/qn', '/norestart')
}

# --- Git-for-Windows discovery (PURE - Pester-tested with fixtures) ---------

# From a PARSED GitHub releases 'latest' object, return the download URL of the
# standard $Arch-bit Git-for-Windows installer .exe (e.g. Git-2.55.0-64-bit.exe),
# or '' if none. PURE. The '^Git-' anchor skips PortableGit/MinGit assets.
function Get-GitForWindowsAssetUrl {
    param([Parameter(Mandatory)]$Release, [string]$Arch = '64')
    foreach ($asset in $Release.assets) {
        if (([string]$asset.name) -match "^Git-.*-$Arch-bit\.exe$") {
            return [string]$asset.browser_download_url
        }
    }
    return ''
}

# The documented Git-for-Windows (Inno Setup) silent-install arg list. PURE.
# Displayed in the consent line and used verbatim by Install-GitViaExe.
function Get-GitSilentArgs {
    [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseSingularNouns', '', Justification = 'Returns an argument list (plural by nature).')]
    param()
    return @('/VERYSILENT', '/NORESTART', '/NOCANCEL', '/SP-', '/SUPPRESSMSGBOXES')
}

# --- Node/git install actions (side-effecting; manual-verified) -------------

# winget path (only when Get-Command winget succeeds). Same per-machine MSI + UAC.
function Install-NodeViaWinget {
    & winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    return ($LASTEXITCODE -eq 0)
}

# Official signed MSI path: download the MSI + SHASUMS256.txt, verify SHA256
# (Get-FileHash, hex) BEFORE installing, then install via msiexec - directly if
# already elevated, else elevated via Start-Process -Verb RunAs (the UAC prompt is
# Windows's own elevation consent). Returns $true on a completed install. On
# checksum mismatch: abort, install nothing, return $false.
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
            Write-Host "Node MSI checksum mismatch - refusing to install."
            return $false
        }
        $margs = Get-MsiexecArgs -MsiPath $msiPath
        if (Test-Elevated) {
            $p = Start-Process msiexec.exe -ArgumentList $margs -Wait -PassThru
        }
        else {
            $p = Start-Process msiexec.exe -ArgumentList $margs -Verb RunAs -Wait -PassThru
        }
        return ($p.ExitCode -eq 0)
    }
    catch { Write-Host "Node install failed: $($_.Exception.Message)"; return $false }
    finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}

# winget path for git (soft). Same per-machine MSI + UAC when present.
function Install-GitViaWinget {
    & winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
    return ($LASTEXITCODE -eq 0)
}

# Official signed Git-for-Windows .exe path: download $Url and run it with the
# documented silent flags (invoking the .exe directly, not `winget --silent`,
# which maps to /SILENT not /VERYSILENT). Returns $true on a completed install.
function Install-GitViaExe {
    param([Parameter(Mandatory)][string]$Url)
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("wd-git-" + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    try {
        $exe = Join-Path $tmp 'git-for-windows.exe'
        Invoke-WebRequest -Uri $Url -OutFile $exe -UseBasicParsing
        $p = Start-Process $exe -ArgumentList (Get-GitSilentArgs) -Wait -PassThru
        return ($p.ExitCode -eq 0)
    }
    catch { Write-Host "Git install failed: $($_.Exception.Message)"; return $false }
    finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}

# --- Dependency gates -------------------------------------------------------

# HARD GATE. Returns if Node >= 18 already resolves. Otherwise offers a consented
# install: winget-if-present, else the official signed MSI (with the exact URL +
# msiexec command shown, and a plain note that it needs admin/UAC). On success,
# refresh PATH and re-check. On decline / non-interactive / failure: print the
# exact manual command + nodejs.org pointer and `exit 1` (Node is the only hard
# gate - Wienerdog cannot run without it).
function Ensure-Node {
    [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseApprovedVerbs', '', Justification = 'Ensure-* is the installer-wide dependency-gate verb (analog of install.sh); intentional and shared.')]
    param()
    if ((Get-NodeMajor) -ge 18) { return }
    Write-Host "Node.js 18+ was not found on your PATH."

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "About to run:"
        Write-Host "    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements"
        if (Confirm-Step "Install Node LTS with winget now? (may prompt for admin)") {
            if (Install-NodeViaWinget) {
                Update-SessionPath
                if ((Get-NodeMajor) -ge 18) { return }
            }
        }
        Write-Host "Or install Node LTS from https://nodejs.org."
        return
    }

    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $index = $null
    try { $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing }
    catch { $index = $null }
    $msi = if ($index) { Get-LtsMsiInfo -Index $index -Arch $arch } else { $null }
    if (-not $msi) {
        Write-Host "Couldn't determine the current Node LTS from nodejs.org."
        Write-Host "Install Node LTS from https://nodejs.org, then re-run this installer."
        return
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
    return
}

# NON-BLOCKING. If git is missing, offer a consented install (winget, else the
# official Git-for-Windows .exe with /VERYSILENT). On decline / non-interactive /
# failure, print a one-line note (what git is for + how) and RETURN (never exit) -
# git alone never blocks the handoff. Skips silently if git already resolves.
function Ensure-Git {
    [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseApprovedVerbs', '', Justification = 'Ensure-* is the installer-wide dependency-gate verb (analog of install.sh); intentional and shared.')]
    param()
    if (Get-Command git -ErrorAction SilentlyContinue) { return }
    Write-Host "git isn't installed - Wienerdog needs it once you create or adopt a vault."

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "About to run:"
        Write-Host "    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements"
        if (Confirm-Step "Install Git with winget now? (may prompt for admin)") {
            if (Install-GitViaWinget) { return }
        }
        Write-Host "Or install Git for Windows from https://gitforwindows.org - it's optional; continuing."
        return
    }

    $release = $null
    try {
        $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' `
            -UseBasicParsing -Headers @{ 'User-Agent' = 'wienerdog-installer' }
    }
    catch { $release = $null }
    $url = if ($release) { Get-GitForWindowsAssetUrl -Release $release } else { '' }
    if ($url) {
        Write-Host "About to download and install the official signed Git for Windows (needs admin):"
        Write-Host "    from: $url"
        Write-Host "    run:  git-installer $((Get-GitSilentArgs) -join ' ')"
        if (Confirm-Step "Install Git for Windows now? (may prompt for admin)") {
            if (Install-GitViaExe -Url $url) { return }
        }
    }
    Write-Host "Install Git for Windows from https://gitforwindows.org before /wienerdog-setup - it's optional; continuing."
}

function Main {
    param([string[]]$ForwardArgs)
    $script:MainRan = $true
    Ensure-Node                     # consented Node install attempt; never exits now
    if ((Get-NodeMajor) -lt 18) { return 1 }   # hard gate unmet; Ensure-Node already printed guidance
    Ensure-Git                      # soft: prints a note if git is missing, then proceeds
    Write-Host "Found Node $((& node -v)) - handing over to the Wienerdog installer..."
    # The installer IS the consent surface (ADR-0011/0017): a user who ran
    # `irm .../install.ps1 | iex` already opted in, and init still PRINTS its full
    # plan before doing anything (transparency). But init's interactive confirm must
    # not BLOCK the handoff: under irm|iex on Windows there is no /dev/tty and the
    # init child's stdin is tangled in PowerShell's pipeline, so its prompt never
    # surfaces and it hangs on stdin forever. Hand off NON-INTERACTIVELY by passing
    # --yes to the INIT command. (The --yes already in Start-WienerdogNpx is npx's
    # own package-prompt flag, before `wienerdog@latest`; this one lands after
    # `init`.) Idempotent: init reads argv.includes('--yes'), so a duplicate is
    # harmless - we de-dup only to keep the forwarded argv clean.
    $initArgs = if ($null -eq $ForwardArgs) { @('--yes') }
                elseif ($ForwardArgs -contains '--yes') { $ForwardArgs }
                else { $ForwardArgs + '--yes' }
    if (Test-NpxAvailable) {
        Start-WienerdogNpx -ForwardArgs $initArgs
        $code = $LASTEXITCODE
    }
    else {
        Write-Host "npm/npx isn't available - installing Wienerdog directly from the npm registry..."
        $code = Install-ViaTarball -ForwardArgs $initArgs
    }
    if ($code -eq 0) { Write-CompletionBanner }
    return $code
}

# Dot-source guard (WP-056): runs Main on direct execution AND under irm|iex
# (InvocationName is '' there, which is -ne '.'), but NOT when dot-sourced for
# tests (InvocationName is '.'). Main returns an exit code; how we dispose of it
# depends on context (ADR-0017 iex-safe exit discipline / WP-061):
if ($MyInvocation.InvocationName -ne '.' -and -not $env:WIENERDOG_INSTALL_LIB) {
    $exitCode = Main -ForwardArgs $args
    if ($MyInvocation.InvocationName -eq '') {
        # irm | iex (or any in-memory eval): the script body runs INSIDE the user's
        # live PowerShell host. `exit` here closes their window - hiding the banner
        # on success and the error on failure. Set the code and fall through so the
        # session survives.
        $global:LASTEXITCODE = $exitCode
    }
    else {
        # Real script file (.\install.ps1 / powershell -File): its own process; exit.
        exit $exitCode
    }
}
