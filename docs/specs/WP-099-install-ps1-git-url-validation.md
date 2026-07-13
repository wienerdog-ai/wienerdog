---
id: WP-099
title: Validate the Git-for-Windows asset URL is HTTPS on a GitHub host before download
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0017]
branch: wp/099-install-ps1-git-url-validation
---

# WP-099: install.ps1 Git-asset URL host/scheme validation

## Context (read this, nothing else)

`install.ps1` is Wienerdog's Windows bootstrapper (ADR-0017). When git is missing
and winget is unavailable, it falls back to downloading the official signed
Git-for-Windows `.exe` from GitHub's `releases/latest` API and running it (with
per-hop consent). The provenance claim is "official signed" Git-for-Windows.

Two **verified defects (installers #4, T5b signed-source integrity):**

1. **Origin URL provenance is unvalidated.** `Get-GitForWindowsAssetUrl` returns
   `browser_download_url` straight from the GitHub JSON response, validated ONLY by a
   **name regex** (`^Git-.*-64-bit\.exe$`). The URL scheme/host/PATH are never
   checked. A malicious or compromised API response can set `browser_download_url` to
   an arbitrary `http://` host, a non-GitHub host, or even
   `https://github.com/attacker/repo/releases/download/…/Git-2.55.0-64-bit.exe`
   (correct host, WRONG repository) while keeping a matching `name`, and
   `Install-GitViaExe` downloads and runs it. **Host `github.com` alone does NOT
   establish official Git-for-Windows provenance** — the canonical release path
   `/git-for-windows/git/releases/download/…` must be validated too.

2. **The final redirected URI is unvalidated.** `Install-GitViaExe` calls
   `Invoke-WebRequest -Uri $Url -OutFile $exe`, which **follows redirects**. Only the
   ORIGIN `$Url` is checked; a `github.com` origin that 302-redirects can land on an
   arbitrary or non-HTTPS final host, and the downloaded bytes are trusted anyway.
   The FINAL response URI (after redirects) must be validated as HTTPS on a
   GitHub-owned download host, or the download refused.

Require both: the origin URL is HTTPS on `github.com` with the official
Git-for-Windows release path, AND the final redirected URI is HTTPS on a
GitHub-owned host, before the `.exe` is trusted and run.

**Scope note (ADR-0017):** this WP does NOT address installers #5 ("permits
self-run when already elevated") — ADR-0017 explicitly accepts UAC elevation on
Windows because the official Node MSI is per-machine/`ALLUSERS=1` and hard-requires
it; the POSIX "never run as root" invariant does not transfer. Only the Git-asset
URL provenance is hardened here.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004);
`install.ps1` is lint-clean (PSScriptAnalyzer) and its pure helpers are
Pester-tested (ADR-0017 / WP-057).

## Current state

`install.ps1` (lines ~284–297, PURE, Pester-tested with fixtures):

```powershell
function Get-GitForWindowsAssetUrl {
    param([Parameter(Mandatory)]$Release, [string]$Arch = '64')
    foreach ($asset in $Release.assets) {
        if (([string]$asset.name) -match "^Git-.*-$Arch-bit\.exe$") {
            return [string]$asset.browser_download_url        # ← host/scheme unchecked
        }
    }
    return ''
}
```

`Install-GitViaExe` (lines ~353–367) does
`Invoke-WebRequest -Uri $Url -OutFile $exe -UseBasicParsing` then runs `$exe`.
`Ensure-Git` (~441–453) shows the URL at consent and calls `Install-GitViaExe`.
A GitHub release `browser_download_url` is canonically
`https://github.com/git-for-windows/git/releases/download/…/Git-2.55.0-64-bit.exe`
(host `github.com`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | install.ps1 | `Test-GitHubAssetUrl` requires HTTPS + host `github.com` + the official `/git-for-windows/git/releases/download/` path prefix (used by `Get-GitForWindowsAssetUrl`); add pure `Get-ResponseFinalUri` (extract the post-redirect URI cross-edition) and pure `Test-GitHubDownloadUri` (HTTPS + GitHub-owned host) + pure `Test-GitHubResponseFinalUri` (compose the two over a response object); `Install-GitViaExe` validates the FINAL redirected URI via `Test-GitHubResponseFinalUri` and refuses (deletes the file, returns `$false`) on failure |
| modify | tests/ps/install-ps1.Tests.ps1 | Pester cases: a non-HTTPS, non-github.com, or wrong-repo-path `browser_download_url` yields '' even with a matching name; a valid git-for-windows release URL passes; `Test-GitHubDownloadUri` accepts `github.com`/`*.githubusercontent.com` HTTPS and rejects http/other hosts; `Get-ResponseFinalUri` returns the 5.1 (`BaseResponse.ResponseUri`) and 7+ (`BaseResponse.RequestMessage.RequestUri`) shapes and `$null` when neither is present; `Test-GitHubResponseFinalUri` accepts a GitHub-host final URI and rejects an off-host / neither-present one; `Install-GitViaExe` (mocked `Invoke-WebRequest`/`Start-Process`) refuses an off-host final URI |

### Exact contracts

**(1) Origin URL: HTTPS + github.com + official Git-for-Windows release path.**
An asset that matches the name but fails the URL check is skipped (so the function
returns '' and `Ensure-Git` degrades to its print/decline fallback):

```powershell
# Official Git-for-Windows release-asset origin: HTTPS on github.com under the
# canonical repository release-download path. Host alone is insufficient — a
# github.com URL under any OTHER repo path is not the official project.
$script:GitForWindowsAssetPathPrefix = '/git-for-windows/git/releases/download/'

function Test-GitHubAssetUrl {
    param([Parameter(Mandatory)][string]$Url)
    try { $u = [System.Uri]$Url } catch { return $false }
    if ($u.Scheme -ne 'https') { return $false }
    if ($u.Host -ne 'github.com') { return $false }
    return $u.AbsolutePath.StartsWith($script:GitForWindowsAssetPathPrefix, [System.StringComparison]::Ordinal)
}

function Get-GitForWindowsAssetUrl {
    param([Parameter(Mandatory)]$Release, [string]$Arch = '64')
    foreach ($asset in $Release.assets) {
        if (([string]$asset.name) -match "^Git-.*-$Arch-bit\.exe$") {
            $url = [string]$asset.browser_download_url
            if (Test-GitHubAssetUrl $url) { return $url }
        }
    }
    return ''
}
```

**(2) Final redirected URI: HTTPS on a GitHub-owned download host.** A GitHub
release `browser_download_url` on `github.com` 302-redirects to
`*.githubusercontent.com` (which `Invoke-WebRequest` follows). Add a pure helper
for the final-hop allowlist and have `Install-GitViaExe` validate the URI the
response actually came from, refusing (delete the file, return `$false`) if it is
not HTTPS on a GitHub-owned host:

```powershell
# Hosts allowed as the FINAL download URI after redirects: github.com and its
# release-asset CDN (objects.githubusercontent.com etc.). HTTPS required.
function Test-GitHubDownloadUri {
    param([Parameter(Mandatory)][System.Uri]$Uri)
    if ($Uri.Scheme -ne 'https') { return $false }
    return ($Uri.Host -eq 'github.com' -or $Uri.Host.EndsWith('.githubusercontent.com', [System.StringComparison]::Ordinal))
}

# PINNED cross-edition accessor for the FINAL (post-redirect) request URI of an
# Invoke-WebRequest -PassThru response. PowerShell 7+ (HttpClient) exposes it as
# BaseResponse.RequestMessage.RequestUri; Windows PowerShell 5.1 (HttpWebRequest) as
# BaseResponse.ResponseUri. PREFER the 7+ shape when present (it is the actual final
# URI on modern runtimes). Returns $null when neither is available — the caller then
# REFUSES. PURE: takes an object, does no network, so Pester drives it with mocks.
function Get-ResponseFinalUri {
    param([Parameter(Mandatory)]$Response)
    $base = $Response.BaseResponse
    if ($null -eq $base) { return $null }
    if ($base.PSObject.Properties['RequestMessage'] -and $base.RequestMessage -and $base.RequestMessage.RequestUri) {
        return [System.Uri]$base.RequestMessage.RequestUri     # PowerShell 7+
    }
    if ($base.PSObject.Properties['ResponseUri'] -and $base.ResponseUri) {
        return [System.Uri]$base.ResponseUri                   # Windows PowerShell 5.1
    }
    return $null
}

# Whole redirect decision as one PURE predicate over a response object: is the FINAL
# URI a GitHub-owned HTTPS host? $false when the final URI is absent (neither accessor
# present) or off-host. Composing the two helpers here makes the redirect-validation
# decision unit-testable with a mocked response, independent of a live network.
function Test-GitHubResponseFinalUri {
    param([Parameter(Mandatory)]$Response)
    $final = Get-ResponseFinalUri $Response
    if ($null -eq $final) { return $false }
    return Test-GitHubDownloadUri $final
}

function Install-GitViaExe {
    param([Parameter(Mandatory)][string]$Url)
    if (-not (Test-GitHubAssetUrl $Url)) { Write-Host 'Refusing: Git asset URL failed provenance validation.'; return $false }
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("wd-git-" + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    try {
        $exe = Join-Path $tmp 'git-for-windows.exe'
        # -PassThru returns the response so we can inspect the FINAL URI after redirects.
        $resp = Invoke-WebRequest -Uri $Url -OutFile $exe -UseBasicParsing -PassThru
        if (-not (Test-GitHubResponseFinalUri $resp)) {
            Remove-Item -Force $exe -ErrorAction SilentlyContinue
            $shown = Get-ResponseFinalUri $resp
            Write-Host "Refusing: Git download redirected to an untrusted or unknown URL ($shown)."
            return $false
        }
        $p = Start-Process $exe -ArgumentList (Get-GitSilentArgs) -Wait -PassThru
        return ($p.ExitCode -eq 0)
    }
    catch { Write-Host "Git install failed: $($_.Exception.Message)"; return $false }
    finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}
```

Behavior:
- `https://github.com/git-for-windows/git/releases/download/…/Git-2.55.0-64-bit.exe`
  → passes origin check; final URI (github.com or `*.githubusercontent.com`, HTTPS)
  → downloaded and run (happy path).
- `http://github.com/git-for-windows/git/releases/download/…` (non-HTTPS) → origin
  skipped → '' .
- `https://github.com/attacker/repo/releases/download/…/Git-2.55.0-64-bit.exe`
  (wrong repo path) → origin skipped → '' .
- `https://evil.example.com/Git-2.55.0-64-bit.exe` (non-GitHub host) → origin
  skipped → '' .
- An origin that passes but redirects to a non-HTTPS or non-GitHub final host → the
  downloaded file is deleted and `Install-GitViaExe` returns `$false` (nothing runs).
- No matching/valid asset → '' → `Ensure-Git` prints the manual command (existing
  fallback), never downloading an unverified URL.

## Implementation notes & constraints

- Must pass PSScriptAnalyzer (the CI lint gate) and the Pester harness (ADR-0017).
- Keep `Get-GitForWindowsAssetUrl`, `Test-GitHubAssetUrl`, `Test-GitHubDownloadUri`,
  `Get-ResponseFinalUri`, and `Test-GitHubResponseFinalUri` PURE (no network) and
  Pester-tested. Only `Install-GitViaExe` (side-effecting) does the actual network
  call; its redirect DECISION is delegated to the pure `Test-GitHubResponseFinalUri`,
  so the whole validation is unit-testable (Pester mocks `Invoke-WebRequest` to return
  a synthetic response and `Start-Process`/`Remove-Item` to assert the refusal path).
- `Install-GitViaExe` IS changed here (final redirected-URI validation). Do NOT
  change `Ensure-Git`'s consent flow, the silent-args list, or the elevation
  posture. Do NOT add a checksum/Authenticode check in this WP (a larger, separate
  hardening — note it as a residual).
- **The final-URI accessor is PINNED, not deferred.** `Get-ResponseFinalUri` prefers
  the PowerShell 7+ shape (`BaseResponse.RequestMessage.RequestUri`), then the 5.1
  shape (`BaseResponse.ResponseUri`), and returns `$null` when neither is present (the
  caller then REFUSES — fail-closed). This contract is fixed and acceptance-gated by
  the mocked-response Pester cases below; it is NOT left for the implementer to "try
  and fall back if CI shows it's unreliable." If — and only if — a real CI run proves
  BOTH accessors are `$null` on a genuine redirect (not expected), the contingency is
  to re-request with `-MaximumRedirection 0` and validate each hop with
  `Test-GitHubDownloadUri`; record any such change under "Decisions made". The default
  path ships the pinned accessor.
- The origin host is `github.com` with the `/git-for-windows/git/releases/download/`
  path; the final-hop allowlist is `github.com` + `*.githubusercontent.com`. If a
  fixture shows a different real GitHub download host, add it and record why under
  "Decisions made".

## Security checklist

- [ ] A Git-for-Windows asset URL is accepted ONLY when it is HTTPS on `github.com`
      under the official `/git-for-windows/git/releases/download/` path — a matching
      filename on a non-HTTPS host, a non-GitHub host, or a github.com URL under a
      DIFFERENT repository path is skipped, so a compromised API response cannot get
      an arbitrary executable downloaded and run under the "official signed" claim.
- [ ] The FINAL redirected download URI is validated as HTTPS on a GitHub-owned host
      (`github.com`/`*.githubusercontent.com`); a redirect to a non-HTTPS or
      non-GitHub final host causes the downloaded file to be deleted and nothing to
      run.
- [ ] On no valid asset the function returns '' and the installer degrades to the
      print-the-command fallback (fail-safe), never a silent unverified download.

## Acceptance criteria

- [ ] Pester: a release whose matching asset has an `http://`, a non-github.com, or a
      wrong-repo-path (`/attacker/repo/releases/download/…`) `browser_download_url`
      yields `''`.
- [ ] Pester: a release with a valid
      `https://github.com/git-for-windows/git/releases/download/…Git-*-64-bit.exe`
      asset yields that URL.
- [ ] Pester: `Test-GitHubDownloadUri` returns `$true` for `https://github.com/…` and
      `https://objects.githubusercontent.com/…`, and `$false` for `http://…` and a
      non-GitHub host.
- [ ] Pester: `Get-ResponseFinalUri` returns the URI from a 5.1-shaped mock
      (`BaseResponse.ResponseUri` set, no `RequestMessage`), from a 7+-shaped mock
      (`BaseResponse.RequestMessage.RequestUri` set), and `$null` from a mock with
      neither accessor present.
- [ ] Pester: `Test-GitHubResponseFinalUri` returns `$true` for a mock whose final URI
      is `https://objects.githubusercontent.com/…`, and `$false` for a mock whose final
      URI is `http://…`, an off-host `https://evil.example.com/…`, or a response with
      neither accessor present (→ refuse).
- [ ] Pester: `Install-GitViaExe` with `Invoke-WebRequest` mocked to return a response
      whose final URI is off-host (and `Start-Process`/`Remove-Item` mocked) returns
      `$false`, deletes the downloaded file, and never calls `Start-Process`.
- [ ] PSScriptAnalyzer is clean on `install.ps1`.

## Verification steps (run these; paste output in the PR)

```bash
pwsh -c "Invoke-Pester tests/ps/install-ps1.Tests.ps1"
pwsh -c "Invoke-ScriptAnalyzer -Path install.ps1 -Settings tests/ps/PSScriptAnalyzerSettings.psd1"
npm run lint
```

(If the local box lacks `pwsh`, the CI PowerShell job runs these; note that in the PR.)

## Out of scope (do NOT do these)

- Authenticode-signature / SHA verification of the downloaded Git `.exe` — a larger
  separate hardening; note as a residual.
- installers #5 (self-run when elevated) — accepted under ADR-0017's Windows
  elevation posture; do NOT add a root/elevation refusal.
- install.sh network hardening — **WP-094**.

## Round-2 dispositions

- **Codex round-2 P1 (`github.com` alone does not establish Git-for-Windows
  provenance):** RESOLVED. `Test-GitHubAssetUrl` now requires HTTPS + host
  `github.com` + the canonical `/git-for-windows/git/releases/download/` path prefix,
  so a `github.com` URL under an attacker's repository path is rejected.
- **Codex round-2 P1 (redirect destinations unvalidated):** RESOLVED. `Install-GitViaExe`
  is brought into scope: it validates the FINAL redirected URI (HTTPS on
  `github.com`/`*.githubusercontent.com`) via the new pure `Test-GitHubDownloadUri`,
  and deletes the file + returns `$false` on a downgrade/off-host redirect.
  - *Owner judgment call — obtaining the final URI is PowerShell-version-sensitive.*
    Default applied: a `Get-ResponseFinalUri` helper preferring
    `$resp.BaseResponse.ResponseUri` (5.1) / `.RequestMessage.RequestUri` (7+), with
    an explicit `-MaximumRedirection 0` hop-by-hop fallback if neither is reliable on
    CI. The implementer confirms the accessor on the CI PowerShell job and records it.
- **Codex round-3 P1 (final-URI accessor deferred, not acceptance-gated):** RESOLVED.
  The `Get-ResponseFinalUri` contract is now PINNED in the exact contracts (prefer 7+
  `RequestMessage.RequestUri`, then 5.1 `ResponseUri`, else `$null` → refuse) rather
  than left as "try the accessors and fall back if CI shows they're unreliable." The
  redirect decision is factored into a pure `Test-GitHubResponseFinalUri` so it is
  unit-testable, and the acceptance criteria now add mocked-response Pester cases for
  the 5.1 shape, the 7+ shape, neither-present, an off-host final URI, and
  `Install-GitViaExe` refusing (delete + `$false`, no `Start-Process`) an off-host
  final URI. The `-MaximumRedirection 0` path is retained only as a runtime
  contingency if CI proves both accessors null on a genuine redirect.

## Definition of done

1. All verification steps pass locally (or via CI where `pwsh` is unavailable);
   output pasted into the PR body.
2. Branch `wp/099-install-ps1-git-url-validation`; conventional commits; PR titled
   `fix(install.ps1): require HTTPS GitHub host for the Git asset URL (WP-099)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
