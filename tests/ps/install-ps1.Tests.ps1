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

Describe 'Get-GitForWindowsAssetUrl' {
    BeforeAll {
        $script:Release = [pscustomobject]@{ assets = @(
                [pscustomobject]@{ name = 'Git-2.55.0-32-bit.exe'; browser_download_url = 'https://example/32.exe' }
                [pscustomobject]@{ name = 'Git-2.55.0-64-bit.exe'; browser_download_url = 'https://example/64.exe' }
                [pscustomobject]@{ name = 'PortableGit-2.55.0-64-bit.7z.exe'; browser_download_url = 'https://example/portable' }
            ) }
    }

    It 'returns the standard 64-bit installer .exe URL by default' {
        Get-GitForWindowsAssetUrl -Release $script:Release | Should -Be 'https://example/64.exe'
    }

    It "returns '' when no matching asset exists" {
        $r = [pscustomobject]@{ assets = @([pscustomobject]@{ name = 'notes.txt'; browser_download_url = 'x' }) }
        Get-GitForWindowsAssetUrl -Release $r | Should -Be ''
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
