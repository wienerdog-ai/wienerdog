---
id: WP-061
title: install.ps1 stays open with a completion banner (iex-safe return-not-exit)
status: In-Review
model: opus
size: S
depends_on: []
adrs: [ADR-0017]
branch: wp/061-install-ps1-completion-banner
---

# WP-061: install.ps1 stays open with a completion banner (iex-safe return-not-exit)

## Context (read this, nothing else)

Wienerdog is an open-source "AI upgrade stack": a one-line install that writes
config files into a user's Claude Code / Codex setup. It is **just files** — the
installer runs synchronous work and exits; it starts nothing that outlives its
job, no daemon, no telemetry (ADR-0004). `install.ps1` is the Windows analog of
`install.sh`, invoked as `irm <url>/install.ps1 | iex`: it ensures Node ≥ 18
(consented winget / signed MSI + UAC), offers git, then hands off to
`npx wienerdog@latest init` (or an npm-less registry-tarball fallback). All of
that already works — the owner ran it end-to-end on a real Windows Server 2022
VPS (Node MSI, UAC accept, PATH refresh, handoff all succeeded).

**The bug this WP fixes.** Under `irm | iex`, PowerShell evaluates the script text
**inside the user's live host session** (`iex` = `Invoke-Expression`). So when
`Main` finishes with `exit $LASTEXITCODE` (install.ps1:445 / :448), that `exit`
terminates the **host** — the user's PowerShell window vanished the instant the
install succeeded, before they could read a single word confirming it. The same
trap hides **failures**: `Ensure-Node`'s hard-gate `exit 1` (install.ps1:372,
:384, :396) would close the window over the guidance the user most needs to read.
`exit` inside `iex` is a window-killer; the fix is to **return an exit code from
`Main` and let a context-aware guard decide whether calling `exit` is safe** —
plus a plain-language completion banner so an `iex` window visibly confirms
success.

Why this is safe to distinguish: the script already ends with a **dot-source
guard** that reads `$MyInvocation.InvocationName` (WP-056 research, ADR-0017 §7):
`.` ⇒ dot-sourced for Pester (library mode, `Main` not run); `''` (empty) ⇒
`irm|iex` / in-memory eval; a **non-empty, non-`.`** name ⇒ a real script file
(`.\install.ps1` / `powershell -File`) running in **its own process**, where
`exit` is perfectly safe. This WP uses that same signal for the exit decision.

This is captured durably as an **ADR-0017 amendment (iex-safe exit discipline)**,
because the deferred M6–M7 Windows scheduler work will touch this same `Main` and
must preserve the rule. Read that amendment for the binding statement; it is
reproduced operationally below.

**Constraints carried from prior Windows WPs.** Keep `install.ps1` **pure ASCII**
— non-ASCII trips the BOM analyzer and risks a PS 5.1 mis-decode under `irm|iex`
(WP-057 lesson). Do not touch the `Test-SemVer` / sha512 path-safety gates; this
WP changes control flow and adds a static banner, nothing security-relevant.

## Current state

The two exit clusters you rewrite. `Main` (install.ps1:437–449):

```powershell
function Main {
    param([string[]]$ForwardArgs)
    $script:MainRan = $true
    Ensure-Node                     # hard gate: returns only if Node >= 18 is (now) present
    Ensure-Git                      # soft: prints a note if git is missing, then proceeds
    Write-Host "Found Node $((& node -v)) - handing over to the Wienerdog installer..."
    if (Get-Command npx -ErrorAction SilentlyContinue) {
        Start-WienerdogNpx -ForwardArgs $ForwardArgs
        exit $LASTEXITCODE
    }
    Write-Host "npm/npx isn't available - installing Wienerdog directly from the npm registry..."
    exit (Install-ViaTarball -ForwardArgs $ForwardArgs)
}
```

`Ensure-Node` (install.ps1:356–397) reaches `exit 1` at three terminal points:
the winget branch (after "Or install Node LTS from https://nodejs.org."), the
`-not $msi` branch (after two Write-Host lines), and the MSI branch (after "Or
install Node LTS from https://nodejs.org."). Its success paths already `return`
(top-of-function `if ((Get-NodeMajor) -ge 18) { return }`, and after each
successful install `if ((Get-NodeMajor) -ge 18) { return }`).

`Ensure-Git` already only `return`s (never exits) — leave it alone.
`Install-ViaTarball` already **returns** `0`/`1` (never exits) — leave it alone.

The dot-source guard (install.ps1:451–457):

```powershell
if ($MyInvocation.InvocationName -ne '.' -and -not $env:WIENERDOG_INSTALL_LIB) {
    Main -ForwardArgs $args
}
```

Pester harness `tests/ps/install-ps1.Tests.ps1` dot-sources the script
(`$env:WIENERDOG_INSTALL_LIB = '1'` + `. .../install.ps1`, so `InvocationName`
is `.` and `Main` is skipped). Existing `Describe 'Dot-source guard'` asserts
`$script:MainRan` is unset after `BeforeAll` (library mode). Mocking pattern in
that file: `Mock Read-Host { '' }`, `Mock Invoke-WebRequest {...}`,
`Should -Invoke <fn> -Times N`, `-ParameterFilter { ... }`. Reuse it.

`PSScriptAnalyzerSettings.psd1` excludes `PSAvoidUsingWriteHost` (installer output
is host UI by design), so `Write-Host` is lint-clean.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | install.ps1 | add `Write-CompletionBanner` + `Test-NpxAvailable`; `Main` returns an int (never `exit`), prints banner on success; `Ensure-Node`'s 3 `exit 1` → `return`; guard decides exit vs. return |
| modify | tests/ps/install-ps1.Tests.ps1 | add `Describe 'Write-CompletionBanner'` and `Describe 'Main'` (with the MainRan-cleanup AfterEach) |
| modify | docs/adr/0017-windows-install-ps1.md | append the "iex-safe exit discipline" amendment (text supplied below) |

Do NOT touch `Ensure-Git`, `Install-ViaTarball`, any `Test-SemVer`/sha512 code, or
`Main`'s Node/git/handoff logic beyond the exact edits below.

### Exact contracts

**1. New `Write-CompletionBanner`** (place near the other `Write-*` helpers). Pure
ASCII, verbatim:

```powershell
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
```

**2. New `Test-NpxAvailable`** — a thin seam so `Main`'s npx-vs-tarball branch is
Pester-mockable without mocking the built-in `Get-Command` (which is fragile):

```powershell
# Thin seam so Main's npx-vs-tarball branch is Pester-mockable without mocking the
# built-in Get-Command.
function Test-NpxAvailable {
    return [bool](Get-Command npx -ErrorAction SilentlyContinue)
}
```

**3. `Main` returns `[int]`, never `exit`, prints the banner on success:**

```powershell
function Main {
    param([string[]]$ForwardArgs)
    $script:MainRan = $true
    Ensure-Node                     # consented Node install attempt; never exits now
    if ((Get-NodeMajor) -lt 18) { return 1 }   # hard gate unmet; Ensure-Node already printed guidance
    Ensure-Git                      # soft: prints a note if git is missing, then proceeds
    Write-Host "Found Node $((& node -v)) - handing over to the Wienerdog installer..."
    if (Test-NpxAvailable) {
        Start-WienerdogNpx -ForwardArgs $ForwardArgs
        $code = $LASTEXITCODE
    }
    else {
        Write-Host "npm/npx isn't available - installing Wienerdog directly from the npm registry..."
        $code = Install-ViaTarball -ForwardArgs $ForwardArgs
    }
    if ($code -eq 0) { Write-CompletionBanner }
    return $code
}
```

**4. `Ensure-Node`: replace each of the three `exit 1` with `return`.** Change
**nothing else** in that function — its Write-Host guidance stays; only the three
`exit 1` statements become `return`. `Main`'s new `if ((Get-NodeMajor) -lt 18)
{ return 1 }` re-check converts "Node still missing after the consented attempt"
into `Main`'s non-zero return, preserving the exact external behaviour for a real
script file (process exits non-zero) while no longer killing an `iex` host.

**5. Guard decides exit vs. return** (install.ps1:451–457 becomes):

```powershell
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
```

### Pester cases to add (append AFTER the existing `Describe 'Dot-source guard'`)

```powershell
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

    It 'success via npx: returns 0 and shows the banner (a returning Main proves it did not exit)' {
        Mock Get-NodeMajor { 20 }
        Mock Test-NpxAvailable { $true }
        Mock Start-WienerdogNpx { $global:LASTEXITCODE = 0 }
        Main -ForwardArgs @() | Should -Be 0
        Should -Invoke Start-WienerdogNpx -Times 1
        Should -Invoke Write-CompletionBanner -Times 1
    }

    It 'success via tarball (no npx): returns 0 and shows the banner' {
        Mock Get-NodeMajor { 20 }
        Mock Test-NpxAvailable { $false }
        Mock Install-ViaTarball { 0 }
        Main -ForwardArgs @() | Should -Be 0
        Should -Invoke Install-ViaTarball -Times 1
        Should -Invoke Write-CompletionBanner -Times 1
    }

    It 'node hard-gate unmet: returns 1, no banner, no handoff' {
        Mock Get-NodeMajor { 0 }
        Mock Test-NpxAvailable { throw 'no handoff expected when Node is missing' }
        Main -ForwardArgs @() | Should -Be 1
        Should -Invoke Write-CompletionBanner -Times 0
        Should -Invoke Start-WienerdogNpx -Times 0
    }
}
```

The "does not exit" property is proven **structurally**: if `Main` called `exit`,
the Pester runner process itself would terminate and the `Should -Be` assertion
would never run. A `Main` test that returns a value **is** the no-exit proof —
exactly what the owner asked to make CI-coverable. The `& node -v` display line
runs on the success paths; GitHub `ubuntu-latest` / `macos-latest` runners ship
Node, as the existing WP-057/058 Pester suite already relies on. The hard-gate
test returns before that line, so it needs no Node.

### ADR-0017 amendment text (append at the end of docs/adr/0017-windows-install-ps1.md)

```markdown
## Amendment - iex-safe exit discipline (2026-07-06, WP-061)

Field follow-up from the owner's real Windows Server 2022 install
(`irm .../install.ps1 | iex`, end-to-end success): under `iex` the script body is
evaluated **inside the user's live PowerShell host**, so any `exit` in the script -
including `Main`'s success `exit 0` and `Ensure-Node`'s hard-gate `exit 1` -
terminates the **host session** and closes the window. On success that erased the
just-completed install before the user could read it; on failure it would hide the
guidance the user needs.

Binding rule for `install.ps1` and all future Windows-installer work on this file
(including the deferred M6-M7 Windows scheduling):

1. **`Main` returns an `[int]` exit code; it never calls `exit`.** Dependency gates
   (`Ensure-Node`) signal failure by returning to `Main` (which re-checks
   `Get-NodeMajor` and returns non-zero), never by `exit`.
2. **On the success path `Main` prints a plain-language completion banner**
   (`Write-CompletionBanner`) so an `irm|iex` window visibly confirms the install
   and points at restart + `/wienerdog-setup`.
3. **Only the bottom-of-file dot-source guard decides process disposition**, using
   the same `$MyInvocation.InvocationName` signal SS7 relies on: `''` => `irm|iex`
   / in-memory eval => set `$global:LASTEXITCODE` and return (never `exit`, so the
   host survives); a non-empty, non-`.` name => a real script file in its own
   process => `exit $code` is safe; `.` => library/dot-source (Pester), `Main` not
   run.

CI-testable on the Linux/macOS runners at the `Main` + `Write-CompletionBanner`
level (a Pester `Main` test that returns a value is itself proof `Main` did not
`exit` - an `exit` would kill the Pester process). The `irm|iex` window-survival
itself stays a one-line item on the manual Windows checklist (SS7), not a blocker.
```

(Use plain ASCII in the ADR too — write `SS7` as `§7` only if your editor keeps it
UTF-8-clean; the surrounding ADR file is already UTF-8, so `§` is fine there. The
ASCII constraint is on `install.ps1` only.)

## Implementation notes & constraints

- `install.ps1` stays **pure ASCII** (banner uses only `=`, space, ASCII letters,
  `/`, `*`, `-`, `.`, `'`). No box-drawing, no smart quotes.
- Do not add a `SuppressMessage` attribute to `Write-CompletionBanner` or
  `Test-NpxAvailable` — `Write` and `Test` are approved verbs and `Write-Host` is
  already excluded from the analyzer; the existing `Write-Tarball-Fallback` is the
  precedent (no attribute, lint-clean).
- `$code = $LASTEXITCODE` after `Start-WienerdogNpx`: trust that the external
  `npx`/`node` sets it (the original code did `exit $LASTEXITCODE` on the same
  trust). Do **not** coerce with `[int]` — `[int]$null` is `0` and would print the
  banner spuriously. In tests the mock sets `$global:LASTEXITCODE` explicitly.
- The guard cannot be unit-tested directly (Pester dot-sources → `InvocationName`
  is `.` → guard body never runs). That is expected; the testable logic lives in
  `Main` + `Write-CompletionBanner`. The `''`-vs-name disposition and the real
  window-stays-open behaviour are on the manual Windows checklist (see DoD).
- When uncertain, choose the simpler option and record it under "Decisions made".
  Do NOT expand scope.

## Security checklist

- [x] This WP introduces **no new untrusted-input → path/command flow**. It changes
      control flow (exit → return), adds a static ASCII banner, and adds a boolean
      npx-presence seam. The existing `Test-SemVer` / sha512 tarball gates are not
      touched and are out of scope.

## Acceptance criteria

- [ ] `Main` returns `0` on both success handoffs (npx present; npx absent →
      tarball) and prints the banner exactly once; returns `1` on the Node
      hard-gate-unmet path with **no** banner and **no** handoff.
- [ ] `Main` never calls `exit` (proven: the `Describe 'Main'` block runs to
      completion in-process).
- [ ] `Write-CompletionBanner` output contains "Wienerdog is installed", "Restart
      your AI tool", and "/wienerdog-setup", and is pure ASCII.
- [ ] The dot-source guard exits (`exit $code`) for a real script file and sets
      `$global:LASTEXITCODE` + returns for `irm|iex` (`InvocationName -eq ''`).
- [ ] `Ensure-Node`'s three terminal `exit 1` are `return`; a still-missing Node
      yields `Main` returning `1` (external non-zero preserved for a script file).
- [ ] Existing Pester suite (incl. `Dot-source guard`) stays green;
      PSScriptAnalyzer clean; `npm test` unaffected.

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
npm test
pwsh -NoProfile -Command "Invoke-Pester -Path tests/ps -Output Detailed -CI"
pwsh -NoProfile -Command "Invoke-ScriptAnalyzer -Path ./install.ps1 -Settings ./PSScriptAnalyzerSettings.psd1 -Severity Warning,Error"
```

(If `pwsh` is not installed locally: `brew install --cask powershell` on macOS.
CI runs the last two regardless.)

## Out of scope (do NOT do these)

- Any Windows scheduling / `schtasks` work (deferred M6–M7, ADR-0017 §6).
- Changing the Node/git install actions, tarball fetch/verify, or consent prompts.
- README/docs updates about the Windows one-liner (a wd-docs follow-up).
- A completion banner for `install.sh` / macOS/Linux (POSIX `bash` after
  `curl|bash` does not have the host-kill problem; separate call if wanted).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/061-install-ps1-completion-banner`; conventional commits; PR titled
   `feat(install): install.ps1 stays open with a completion banner (WP-061)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. **Owner re-confirm (light, not a heavy gate):** on the next real Windows run
   (`irm .../install.ps1 | iex`), the window **stays open** and the completion
   banner shows on success. The no-exit/banner logic itself is CI-covered by the
   Pester `Main` tests above, so this is a quick visual re-confirm — record it as a
   checked item, not a blocking manual elevation gate like WP-058's UAC path.
5. This spec's `status:` flipped to `In-Review` in the same PR.
