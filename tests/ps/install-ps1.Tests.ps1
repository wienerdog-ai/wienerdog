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

Describe 'Dot-source guard' {
    It 'did not run Main during BeforeAll (library mode)' {
        Get-Variable -Name MainRan -Scope Script -ErrorAction SilentlyContinue |
            Should -BeNullOrEmpty
    }
}
