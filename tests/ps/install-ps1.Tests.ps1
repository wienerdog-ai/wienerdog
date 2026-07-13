BeforeAll {
    $env:WIENERDOG_INSTALL_LIB = '1'         # belt: force library mode
    . $PSScriptRoot/../../install.ps1        # dot-source: InvocationName '.' -> Main skipped

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

Describe 'Test-SemVer' {
    It 'accepts <v>' -TestCases @(
        @{ v = '0.4.0' }
        @{ v = '10.20.30' }
        @{ v = '1.2.3-beta.1' }
        @{ v = '1.2.3+build.5' }
    ) {
        param($v)
        Test-SemVer $v | Should -BeTrue
    }

    It 'rejects <v>' -TestCases @(
        @{ v = '' }
        @{ v = '1.2' }
        @{ v = 'v1.2.3' }
        @{ v = '1.2.3/../../x' }
        @{ v = '1.2.3\x' }
        @{ v = '..' }
        @{ v = '1.2.3 ' }
    ) {
        param($v)
        Test-SemVer $v | Should -BeFalse
    }

    # WP-058 owner amendment: \A...\z (not ^...$) so a trailing newline is rejected
    # ('$' matches before a trailing newline in .NET/PowerShell).
    It 'rejects a value with a trailing newline (\A...\z anchors)' {
        Test-SemVer "1.2.3`n" | Should -BeFalse
    }
    It 'still accepts a bare version and a valid prerelease' {
        Test-SemVer '1.2.3' | Should -BeTrue
        Test-SemVer '1.2.3-rc.1' | Should -BeTrue
    }
}

Describe 'Get-TarballUrl' {
    It 'constructs the registry URL locally' {
        Get-TarballUrl '0.4.0' |
            Should -Be 'https://registry.npmjs.org/wienerdog/-/wienerdog-0.4.0.tgz'
    }
}

Describe 'Get-SriSha512' {
    It 'is a sha512 SRI equal to an independently-computed value' {
        $sri = Get-SriSha512 $script:Fixture
        $sri | Should -BeLike 'sha512-*'

        $sha = [System.Security.Cryptography.SHA512]::Create()
        try {
            $bytes = [System.IO.File]::ReadAllBytes($script:Fixture)
            $expected = 'sha512-' + [System.Convert]::ToBase64String($sha.ComputeHash($bytes))
        }
        finally { $sha.Dispose() }
        $sri | Should -Be $expected
    }
}

Describe 'Confirm-Step' {
    It 'returns false and does not prompt when non-interactive' {
        $script:NonInteractive = $true
        Mock Read-Host { throw 'Read-Host must not be called when non-interactive' }
        Confirm-Step 'proceed?' | Should -BeFalse
        Should -Invoke Read-Host -Times 0
    }

    Context 'interactive' {
        BeforeEach { $script:NonInteractive = $false }

        It 'bare Enter (empty) is yes' {
            Mock Read-Host { '' }
            Confirm-Step 'proceed?' | Should -BeTrue
        }
        It 'y is yes' {
            Mock Read-Host { 'y' }
            Confirm-Step 'proceed?' | Should -BeTrue
        }
        It 'n is no' {
            Mock Read-Host { 'n' }
            Confirm-Step 'proceed?' | Should -BeFalse
        }
    }
}

Describe 'Invoke-TarballInstall' {
    It 'verifies then unpacks a good tarball' {
        Mock Invoke-WebRequest { Copy-Item $script:Fixture $OutFile }
        $dest = Join-Path $TestDrive 'good/app/0.4.0'
        Invoke-TarballInstall -Url 'https://x/y.tgz' -Integrity $script:FixtureSri -Dest $dest |
            Should -BeTrue
        Test-Path (Join-Path $dest 'bin/wienerdog.js') | Should -BeTrue
    }

    It 'refuses to unpack on a checksum mismatch and creates nothing at dest' {
        Mock Invoke-WebRequest { Copy-Item $script:Fixture $OutFile }
        $dest = Join-Path $TestDrive 'bad/app/0.4.0'
        Invoke-TarballInstall -Url 'https://x/y.tgz' -Integrity 'sha512-wrong' -Dest $dest |
            Should -BeFalse
        Test-Path $dest | Should -BeFalse
    }
}

Describe 'Install-ViaTarball' {
    BeforeEach {
        $script:NonInteractive = $false
        $env:WIENERDOG_HOME = Join-Path $TestDrive ('home-' + [System.Guid]::NewGuid().ToString('N'))
    }
    AfterEach {
        Remove-Item Env:WIENERDOG_HOME -ErrorAction SilentlyContinue
    }

    It 'fetches, verifies, unpacks, and hands off to node init' {
        Mock Invoke-RestMethod { @{ version = '0.4.0'; dist = @{ integrity = $script:FixtureSri } } }
        Mock Invoke-WebRequest { Copy-Item $script:Fixture $OutFile }
        Mock Start-WienerdogInit {}
        Mock Read-Host { '' }

        $expectedBin = Join-Path (Join-Path $env:WIENERDOG_HOME 'app/0.4.0') 'bin\wienerdog.js'
        Install-ViaTarball -ForwardArgs @() | Should -Be 0
        Should -Invoke Start-WienerdogInit -Times 1 -ParameterFilter { $BinPath -eq $expectedBin }
    }

    It 'rejects a path-traversal version before any download or write (security)' {
        Mock Invoke-RestMethod { @{ version = '1.2.3/../../pwned'; dist = @{ integrity = $script:FixtureSri } } }
        Mock Invoke-WebRequest {}
        Mock Start-WienerdogInit {}

        Install-ViaTarball -ForwardArgs @() | Should -Be 1
        Should -Invoke Invoke-WebRequest -Times 0
        Should -Invoke Start-WienerdogInit -Times 0
    }

    It 'returns 1 without downloading when consent is declined' {
        Mock Invoke-RestMethod { @{ version = '0.4.0'; dist = @{ integrity = $script:FixtureSri } } }
        Mock Invoke-WebRequest {}
        Mock Start-WienerdogInit {}
        Mock Read-Host { 'n' }

        Install-ViaTarball -ForwardArgs @() | Should -Be 1
        Should -Invoke Invoke-WebRequest -Times 0
    }
}

# --- WP-058: Node/git auto-install pure helpers (no live network, no install) --

Describe 'Get-LtsMsiInfo' {
    BeforeAll {
        # Date-descending fixture: a leading Current (lts:$false) then the LTS line.
        $script:Index = @(
            [pscustomobject]@{ version = 'v25.0.0'; lts = $false }
            [pscustomobject]@{ version = 'v24.18.0'; lts = 'Krypton' }
            [pscustomobject]@{ version = 'v24.17.0'; lts = 'Krypton' }
        )
    }

    It 'returns the first LTS entry as x64 MSI info by default' {
        $info = Get-LtsMsiInfo -Index $script:Index
        $info.Version | Should -Be '24.18.0'
        $info.MsiName | Should -Be 'node-v24.18.0-x64.msi'
        $info.MsiUrl | Should -Be 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-x64.msi'
        $info.ShaSumsUrl | Should -Be 'https://nodejs.org/dist/v24.18.0/SHASUMS256.txt'
    }

    It 'builds an arm64 MSI name/URL when -Arch arm64' {
        $info = Get-LtsMsiInfo -Index $script:Index -Arch 'arm64'
        $info.MsiName | Should -Be 'node-v24.18.0-arm64.msi'
        $info.MsiUrl | Should -Be 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-arm64.msi'
    }

    It 'returns $null when no entry is LTS (all lts:$false)' {
        $current = @([pscustomobject]@{ version = 'v25.0.0'; lts = $false })
        Get-LtsMsiInfo -Index $current | Should -BeNullOrEmpty
    }

    It 'skips an LTS entry whose version is not strict semver (path-safety)' {
        $bad = @(
            [pscustomobject]@{ version = 'v24.18.0/../x'; lts = 'Krypton' }
            [pscustomobject]@{ version = 'v24.18.0'; lts = 'Krypton' }
        )
        (Get-LtsMsiInfo -Index $bad).Version | Should -Be '24.18.0'
    }
}

Describe 'Get-ShaFromSums' {
    BeforeAll {
        $script:Sums = @(
            'aaa111  node-v24.18.0-arm64.msi'
            'BBB222  node-v24.18.0-x64.msi'
            'ccc333  node-v24.18.0.tar.gz'
        ) -join "`n"
    }

    It 'returns the lowercase hex for the requested file name' {
        Get-ShaFromSums -SumsText $script:Sums -FileName 'node-v24.18.0-x64.msi' |
            Should -Be 'bbb222'
    }

    It "returns '' when the file name is absent" {
        Get-ShaFromSums -SumsText $script:Sums -FileName 'node-v99.0.0-x64.msi' |
            Should -Be ''
    }
}

Describe 'Get-MsiexecArgs' {
    It 'is the quiet, no-restart per-machine install arg list' {
        Get-MsiexecArgs -MsiPath 'C:\t\x.msi' |
            Should -Be @('/i', 'C:\t\x.msi', '/qn', '/norestart')
    }
}

Describe 'Test-Elevated' {
    It 'returns $false off-Windows without throwing (WindowsIdentity unsupported)' {
        Test-Elevated | Should -BeFalse
    }
}

# Install-NodeViaMsi's SECURITY branches, unit-covered via the Invoke-WebRequest +
# Start-Process seams (no live network, no real msiexec/UAC). These move the
# tamper-abort and the failed/cancelled-elevation HANDLING from "manual, maybe" to
# CI. The real UAC dialog (accept/cancel) and a real MSI stay on the manual checklist.
Describe 'Install-NodeViaMsi (security branches)' {
    BeforeEach {
        # Deterministic fake MSI bytes + their real SHA256 (lowercase hex).
        $script:MsiBytes = [byte[]](1..64)
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try { $script:MsiHash = (($sha.ComputeHash($script:MsiBytes) | ForEach-Object { $_.ToString('x2') }) -join '') }
        finally { $sha.Dispose() }

        $script:Msi = @{
            Version    = '24.18.0'
            MsiName    = 'node-v24.18.0-x64.msi'
            MsiUrl     = 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-x64.msi'
            ShaSumsUrl = 'https://nodejs.org/dist/v24.18.0/SHASUMS256.txt'
        }
        # One mock for both calls: -OutFile branch writes the fake MSI; the other
        # returns the SHASUMS text (set per-test in $script:SumsText).
        Mock Invoke-WebRequest {
            if ($OutFile) { [System.IO.File]::WriteAllBytes($OutFile, $script:MsiBytes); return }
            [pscustomobject]@{ Content = $script:SumsText }
        }
    }

    It 'aborts before install on a checksum mismatch (no msiexec/Start-Process)' {
        $script:SumsText = "deadbeefdeadbeef  node-v24.18.0-x64.msi`n"   # wrong hash
        Mock Start-Process { throw 'Start-Process must not run on a checksum mismatch' }

        Install-NodeViaMsi -Msi $script:Msi | Should -BeFalse
        Should -Invoke Start-Process -Times 0
    }

    It 'returns $false when the (elevated) install exits non-zero (UAC cancel = 1223)' {
        $script:SumsText = "$script:MsiHash  node-v24.18.0-x64.msi`n"    # matching hash
        Mock Start-Process { [pscustomobject]@{ ExitCode = 1223 } }      # 1223 = ERROR_CANCELLED

        Install-NodeViaMsi -Msi $script:Msi | Should -BeFalse
        Should -Invoke Start-Process -Times 1
    }

    It 'returns $true when the install completes (exit 0), proving the pass path' {
        $script:SumsText = "$script:MsiHash  node-v24.18.0-x64.msi`n"    # matching hash
        Mock Start-Process { [pscustomobject]@{ ExitCode = 0 } }

        Install-NodeViaMsi -Msi $script:Msi | Should -BeTrue
    }
}

Describe 'Test-GitHubAssetUrl' {
    It 'accepts the canonical git-for-windows release-download URL' {
        Test-GitHubAssetUrl 'https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.1/Git-2.55.0-64-bit.exe' |
            Should -BeTrue
    }

    It 'rejects a non-HTTPS URL' {
        Test-GitHubAssetUrl 'http://github.com/git-for-windows/git/releases/download/v2.55.0/Git-2.55.0-64-bit.exe' |
            Should -BeFalse
    }

    It 'rejects a non-github.com host' {
        Test-GitHubAssetUrl 'https://evil.example.com/Git-2.55.0-64-bit.exe' | Should -BeFalse
    }

    It 'rejects a github.com URL under a different repository path' {
        Test-GitHubAssetUrl 'https://github.com/attacker/repo/releases/download/v1/Git-2.55.0-64-bit.exe' |
            Should -BeFalse
    }

    It 'rejects an unparseable URL' {
        Test-GitHubAssetUrl 'not a url' | Should -BeFalse
    }
}

Describe 'Get-GitForWindowsAssetUrl' {
    BeforeAll {
        $script:GoodUrl = 'https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.1/Git-2.55.0-64-bit.exe'
    }

    It 'returns the standard 64-bit installer .exe URL when it passes provenance validation' {
        $release = [pscustomobject]@{ assets = @(
                [pscustomobject]@{ name = 'Git-2.55.0-32-bit.exe'; browser_download_url = 'https://example/32.exe' }
                [pscustomobject]@{ name = 'Git-2.55.0-64-bit.exe'; browser_download_url = $script:GoodUrl }
                [pscustomobject]@{ name = 'PortableGit-2.55.0-64-bit.7z.exe'; browser_download_url = 'https://example/portable' }
            ) }
        Get-GitForWindowsAssetUrl -Release $release | Should -Be $script:GoodUrl
    }

    It "returns '' when no matching asset exists" {
        $r = [pscustomobject]@{ assets = @([pscustomobject]@{ name = 'notes.txt'; browser_download_url = 'x' }) }
        Get-GitForWindowsAssetUrl -Release $r | Should -Be ''
    }

    It "returns '' when the matching-name asset's URL is http (non-HTTPS)" {
        $r = [pscustomobject]@{ assets = @(
                [pscustomobject]@{ name = 'Git-2.55.0-64-bit.exe'; browser_download_url = 'http://github.com/git-for-windows/git/releases/download/v1/Git-2.55.0-64-bit.exe' }
            ) }
        Get-GitForWindowsAssetUrl -Release $r | Should -Be ''
    }

    It "returns '' when the matching-name asset's URL is a non-github.com host" {
        $r = [pscustomobject]@{ assets = @(
                [pscustomobject]@{ name = 'Git-2.55.0-64-bit.exe'; browser_download_url = 'https://evil.example.com/Git-2.55.0-64-bit.exe' }
            ) }
        Get-GitForWindowsAssetUrl -Release $r | Should -Be ''
    }

    It "returns '' when the matching-name asset's URL is a wrong-repo github.com path" {
        $r = [pscustomobject]@{ assets = @(
                [pscustomobject]@{ name = 'Git-2.55.0-64-bit.exe'; browser_download_url = 'https://github.com/attacker/repo/releases/download/v1/Git-2.55.0-64-bit.exe' }
            ) }
        Get-GitForWindowsAssetUrl -Release $r | Should -Be ''
    }

    It "returns '' without throwing when a matching asset has an empty browser_download_url" {
        $r = [pscustomobject]@{ assets = @(
                [pscustomobject]@{ name = 'Git-2.55.0-64-bit.exe'; browser_download_url = '' }
            ) }
        { Get-GitForWindowsAssetUrl -Release $r } | Should -Not -Throw
        Get-GitForWindowsAssetUrl -Release $r | Should -Be ''
    }

    It "returns '' without throwing when a matching asset omits browser_download_url (null)" {
        $r = [pscustomobject]@{ assets = @(
                [pscustomobject]@{ name = 'Git-2.55.0-64-bit.exe' }   # no browser_download_url property -> null
            ) }
        { Get-GitForWindowsAssetUrl -Release $r } | Should -Not -Throw
        Get-GitForWindowsAssetUrl -Release $r | Should -Be ''
    }
}

Describe 'Test-GitHubDownloadUri' {
    It 'accepts https github.com' {
        Test-GitHubDownloadUri ([System.Uri]'https://github.com/x/y') | Should -BeTrue
    }
    It 'accepts https *.githubusercontent.com' {
        Test-GitHubDownloadUri ([System.Uri]'https://objects.githubusercontent.com/x/y') | Should -BeTrue
    }
    It 'rejects http' {
        Test-GitHubDownloadUri ([System.Uri]'http://github.com/x/y') | Should -BeFalse
    }
    It 'rejects a non-GitHub host' {
        Test-GitHubDownloadUri ([System.Uri]'https://evil.example.com/x/y') | Should -BeFalse
    }
}

Describe 'Get-ResponseFinalUri' {
    It 'returns the URI from a 5.1-shaped response (BaseResponse.ResponseUri, no RequestMessage)' {
        $resp = [pscustomobject]@{
            BaseResponse = [pscustomobject]@{ ResponseUri = [System.Uri]'https://objects.githubusercontent.com/a/b' }
        }
        Get-ResponseFinalUri $resp | Should -Be ([System.Uri]'https://objects.githubusercontent.com/a/b')
    }

    It 'returns the URI from a 7+-shaped response (BaseResponse.RequestMessage.RequestUri)' {
        $resp = [pscustomobject]@{
            BaseResponse = [pscustomobject]@{
                RequestMessage = [pscustomobject]@{ RequestUri = [System.Uri]'https://github.com/a/b' }
            }
        }
        Get-ResponseFinalUri $resp | Should -Be ([System.Uri]'https://github.com/a/b')
    }

    It 'prefers the 7+ shape when both accessors are present' {
        $resp = [pscustomobject]@{
            BaseResponse = [pscustomobject]@{
                RequestMessage = [pscustomobject]@{ RequestUri = [System.Uri]'https://github.com/seven' }
                ResponseUri    = [System.Uri]'https://github.com/five-one'
            }
        }
        Get-ResponseFinalUri $resp | Should -Be ([System.Uri]'https://github.com/seven')
    }

    It 'returns $null when neither accessor is present' {
        $resp = [pscustomobject]@{ BaseResponse = [pscustomobject]@{} }
        Get-ResponseFinalUri $resp | Should -BeNullOrEmpty
    }

    It 'returns $null when BaseResponse itself is absent' {
        $resp = [pscustomobject]@{ BaseResponse = $null }
        Get-ResponseFinalUri $resp | Should -BeNullOrEmpty
    }
}

Describe 'Test-GitHubResponseFinalUri' {
    It 'accepts a mock whose final URI is https objects.githubusercontent.com' {
        $resp = [pscustomobject]@{
            BaseResponse = [pscustomobject]@{ ResponseUri = [System.Uri]'https://objects.githubusercontent.com/a/b' }
        }
        Test-GitHubResponseFinalUri $resp | Should -BeTrue
    }

    It 'rejects a mock whose final URI is http' {
        $resp = [pscustomobject]@{
            BaseResponse = [pscustomobject]@{ ResponseUri = [System.Uri]'http://objects.githubusercontent.com/a/b' }
        }
        Test-GitHubResponseFinalUri $resp | Should -BeFalse
    }

    It 'rejects a mock whose final URI is an off-host https URL' {
        $resp = [pscustomobject]@{
            BaseResponse = [pscustomobject]@{ ResponseUri = [System.Uri]'https://evil.example.com/a/b' }
        }
        Test-GitHubResponseFinalUri $resp | Should -BeFalse
    }

    It 'rejects a mock with neither accessor present (refuse fail-closed)' {
        $resp = [pscustomobject]@{ BaseResponse = [pscustomobject]@{} }
        Test-GitHubResponseFinalUri $resp | Should -BeFalse
    }
}

Describe 'Install-GitViaExe' {
    BeforeAll {
        $script:GoodOrigin = 'https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.1/Git-2.55.0-64-bit.exe'
    }

    It 'refuses an off-host origin URL without downloading' {
        Mock Invoke-WebRequest { throw 'Invoke-WebRequest must not be called for a bad origin URL' }
        Mock Start-Process { throw 'Start-Process must not run when the origin is refused' }
        Install-GitViaExe -Url 'https://evil.example.com/Git-2.55.0-64-bit.exe' | Should -BeFalse
        Should -Invoke Invoke-WebRequest -Times 0
        Should -Invoke Start-Process -Times 0
    }

    It 'refuses, deletes the file, and never runs Start-Process on an off-host FINAL (redirected) URI' {
        Mock Invoke-WebRequest {
            [System.IO.File]::WriteAllBytes($OutFile, [byte[]](1, 2, 3))
            [pscustomobject]@{
                BaseResponse = [pscustomobject]@{ ResponseUri = [System.Uri]'https://evil.example.com/redirected.exe' }
            }
        }
        Mock Start-Process { throw 'Start-Process must not run on an off-host final URI' }

        Install-GitViaExe -Url $script:GoodOrigin | Should -BeFalse
        Should -Invoke Start-Process -Times 0
    }

    It 'downloads and runs when the origin and final URI both validate' {
        Mock Invoke-WebRequest {
            [System.IO.File]::WriteAllBytes($OutFile, [byte[]](1, 2, 3))
            [pscustomobject]@{
                BaseResponse = [pscustomobject]@{ ResponseUri = [System.Uri]'https://objects.githubusercontent.com/redirected.exe' }
            }
        }
        Mock Start-Process { [pscustomobject]@{ ExitCode = 0 } }

        Install-GitViaExe -Url $script:GoodOrigin | Should -BeTrue
        Should -Invoke Start-Process -Times 1
    }
}

Describe 'Ensure-Git (optional-Git fallback)' {
    It 'continues without throwing or running Start-Process when the release asset URL is empty/missing' {
        # git absent (so it proceeds), winget absent (so it hits the release path).
        Mock Get-Command { $null } -ParameterFilter { $Name -eq 'git' }
        Mock Get-Command { $null } -ParameterFilter { $Name -eq 'winget' }
        # Compromised/malformed response: matching asset NAME but empty download URL.
        Mock Invoke-RestMethod {
            [pscustomobject]@{ assets = @(
                    [pscustomobject]@{ name = 'Git-2.55.0-64-bit.exe'; browser_download_url = '' }
                ) }
        }
        Mock Confirm-Step { throw 'Confirm-Step must not be reached when there is no valid asset URL' }
        Mock Install-GitViaExe { throw 'Install-GitViaExe must not run without a valid asset URL' }
        Mock Start-Process { throw 'Start-Process must not run' }

        { Ensure-Git } | Should -Not -Throw
        Should -Invoke Install-GitViaExe -Times 0
        Should -Invoke Start-Process -Times 0
    }
}

Describe 'Get-GitSilentArgs' {
    It 'is the documented Git-for-Windows silent-install arg list' {
        Get-GitSilentArgs |
            Should -Be @('/VERYSILENT', '/NORESTART', '/NOCANCEL', '/SP-', '/SUPPRESSMSGBOXES')
    }
}

Describe 'Dot-source guard' {
    It 'did not run Main during BeforeAll (library mode)' {
        Get-Variable -Name MainRan -Scope Script -ErrorAction SilentlyContinue |
            Should -BeNullOrEmpty
    }
}

Describe 'Write-CompletionBanner' {
    It 'emits the installed confirmation and next steps' {
        $out = Write-CompletionBanner 6>&1 | Out-String
        $out | Should -Match 'Wienerdog is installed'
        $out | Should -Match 'Restart your AI tool'
        $out | Should -Match '/wienerdog-setup'
    }
    It 'is pure ASCII' {
        $out = Write-CompletionBanner 6>&1 | Out-String
        ($out.ToCharArray() | Where-Object { [int]$_ -gt 127 }).Count | Should -Be 0
    }
}

Describe 'Main' {
    BeforeEach {
        Mock Ensure-Node {}
        Mock Ensure-Git {}
        Mock Write-CompletionBanner {}
        Mock Start-WienerdogNpx {}
        Mock Install-ViaTarball { 0 }
    }
    # Main sets $script:MainRan; clear it so the 'Dot-source guard' Describe still
    # sees it unset regardless of Describe execution order.
    AfterEach {
        Remove-Variable -Name MainRan -Scope Script -ErrorAction SilentlyContinue
    }

    It 'success via npx: returns 0, shows the banner, hands off with --yes' {
        Mock Get-NodeMajor { 20 }
        Mock Test-NpxAvailable { $true }
        Mock Start-WienerdogNpx { $global:LASTEXITCODE = 0 }
        Main -ForwardArgs @() | Should -Be 0
        Should -Invoke Start-WienerdogNpx -Times 1 -ParameterFilter { $ForwardArgs -contains '--yes' }
        Should -Invoke Write-CompletionBanner -Times 1
    }

    It 'success via tarball (no npx): returns 0, shows the banner, hands off with --yes' {
        Mock Get-NodeMajor { 20 }
        Mock Test-NpxAvailable { $false }
        Mock Install-ViaTarball { 0 }
        Main -ForwardArgs @() | Should -Be 0
        Should -Invoke Install-ViaTarball -Times 1 -ParameterFilter { $ForwardArgs -contains '--yes' }
        Should -Invoke Write-CompletionBanner -Times 1
    }

    It 'does not pass a duplicate --yes when the caller already did' {
        Mock Get-NodeMajor { 20 }
        Mock Test-NpxAvailable { $true }
        Mock Start-WienerdogNpx { $global:LASTEXITCODE = 0 }
        Main -ForwardArgs @('--yes') | Should -Be 0
        Should -Invoke Start-WienerdogNpx -Times 1 -ParameterFilter {
            (@($ForwardArgs) | Where-Object { $_ -eq '--yes' }).Count -eq 1
        }
    }

    It 'appends --yes while preserving other forwarded args' {
        Mock Get-NodeMajor { 20 }
        Mock Test-NpxAvailable { $true }
        Mock Start-WienerdogNpx { $global:LASTEXITCODE = 0 }
        Main -ForwardArgs @('--fresh-vault') | Should -Be 0
        Should -Invoke Start-WienerdogNpx -Times 1 -ParameterFilter {
            ($ForwardArgs -contains '--fresh-vault') -and ($ForwardArgs -contains '--yes')
        }
    }

    It 'node hard-gate unmet: returns 1, no banner, no handoff' {
        Mock Get-NodeMajor { 0 }
        Mock Test-NpxAvailable { throw 'no handoff expected when Node is missing' }
        Main -ForwardArgs @() | Should -Be 1
        Should -Invoke Write-CompletionBanner -Times 0
        Should -Invoke Start-WienerdogNpx -Times 0
    }
}
