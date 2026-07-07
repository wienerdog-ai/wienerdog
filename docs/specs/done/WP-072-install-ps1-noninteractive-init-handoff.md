---
id: WP-072
title: install.ps1 hands off to init non-interactively (fix Windows irm|iex hang)
status: Done
model: opus
size: S
depends_on: []
adrs: [ADR-0017]
branch: wp/072-install-ps1-noninteractive-init-handoff
---

# WP-072: install.ps1 hands off to init non-interactively (fix Windows irm|iex hang)

## Context (read this, nothing else)

Wienerdog is an open-source "AI upgrade stack": a one-line install that writes
config files into a user's Claude Code / Codex setup. It is **just files** — the
installer runs synchronous work and exits; it starts nothing that outlives its
job, no daemon, no telemetry (ADR-0004). `install.ps1` is the Windows analog of
`install.sh`, invoked as `irm <url>/install.ps1 | iex`: it ensures Node >= 18
(consented winget / signed MSI + UAC), offers git, then **hands off** to
`npx wienerdog@latest init` (or, when npx is absent, an npm-less registry-tarball
fallback that runs `node <app>\bin\wienerdog.js init`). That `init` command does
the real per-machine install work.

**The P1 field bug this WP fixes (confirmed by the owner).** On a Windows machine
where Node is **already installed**, `irm .../install.ps1 | iex` prints
`Found Node v24.18.0 - handing over to the Wienerdog installer...` and then
**hangs indefinitely** — no plan, no prompt, nothing. Root cause, verified from
code: `install.ps1`'s handoff runs `npx --yes wienerdog@latest init` (the `--yes`
there is **NPX's** flag — "skip the package-install prompt" — it is **not** passed
to `init`). So `init` reaches its own interactive confirmation
(`src/cli/init.js:117`, `confirm('\nProceed? [Y/n] ', {defaultYes:true})`) and
blocks waiting for a line on stdin. On POSIX this survives because Wienerdog's
`confirm()` falls back to `/dev/tty` (WP-034), so the prompt shows on the real
terminal and works. **On Windows there is no `/dev/tty`, and under `irm | iex` the
init child's stdin is tangled in PowerShell's object pipeline** — so init's plan
and prompt never surface on screen and it blocks on stdin forever. This is the
same fragility class as the WP-061 iex-handoff bug: relying on an interactive
child prompt under `iex` is unreliable on Windows.

**The frozen fix.** The installer **is** the consent surface. A user who ran
`irm .../install.ps1 | iex` has already opted in (ADR-0011/0017; the same posture
WP-052 established for agent-driven installs: the one-liner runner is the consent).
init still **prints its full plan before doing anything** (verified: init.js prints
the plan at lines 93-109, *before* the `if (!yes)` confirm at line 116) — so
transparency is preserved. What must change is that the handoff to init must be
**non-interactive**: `install.ps1` passes `--yes` to the **init** command so init
skips its blocking confirm. With `--yes`, init prints the plan and proceeds; it
never reaches the readline prompt that hangs. This deterministically eliminates the
hang.

This is captured durably as an **ADR-0017 amendment (non-interactive init
handoff)** — a binding Windows-installer invariant, like the WP-061 iex-safe-exit
amendment on the same file, so future scheduler/installer work on `Main` preserves
it.

## Current state

`install.ps1` `Main` (install.ps1:459-476) — the handoff you edit:

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

The two handoff seams (install.ps1:88-97), which you **do NOT edit**:

```powershell
function Start-WienerdogNpx {
    ...
    param([string[]]$ForwardArgs)
    & npx --yes wienerdog@latest init @ForwardArgs
}
function Start-WienerdogInit {
    ...
    param([Parameter(Mandatory)][string]$BinPath, [string[]]$ForwardArgs)
    & node $BinPath init @ForwardArgs
}
```

Note the `--yes` in `Start-WienerdogNpx` is **npx's** flag (positioned before
`wienerdog@latest`, so it configures npx, not init). It stays exactly where it is.
`Install-ViaTarball` (install.ps1:159-195) forwards its `$ForwardArgs` to
`Start-WienerdogInit` at **two** call sites (line 178 idempotent path, line 190
after unpack). Because `Main` is the single point that builds the argv for **both**
the npx branch and the `Install-ViaTarball` branch, injecting `--yes` once in `Main`
covers all three init call sites — no edit to `Start-WienerdogNpx`,
`Start-WienerdogInit`, or `Install-ViaTarball` is needed.

The init side (`src/cli/init.js`, read-only context — do NOT edit): `const yes =
argv.includes('--yes')` (line 72); the plan prints at lines 93-109; `if (!yes) {
const ok = await confirm('\nProceed? [Y/n] ', {defaultYes:true}); ... }` at lines
116-122. So a `--yes` anywhere in init's argv skips the confirm, and a **duplicate**
`--yes` is harmless (`argv.includes` is idempotent). WP-060 made that confirm
default-yes, but default-yes only helps an *answered* empty-Enter; under tangled
iex stdin **no** line (not even empty) ever arrives, so default-yes cannot save it
— only skipping the prompt (`--yes`) does.

Pester harness `tests/ps/install-ps1.Tests.ps1` dot-sources the script
(`$env:WIENERDOG_INSTALL_LIB='1'` + `. .../install.ps1`) and already has a
`Describe 'Main'` block (lines 327-366) that mocks `Ensure-Node`, `Ensure-Git`,
`Write-CompletionBanner`, `Start-WienerdogNpx`, `Install-ViaTarball`,
`Get-NodeMajor`, `Test-NpxAvailable` and asserts with
`Should -Invoke <fn> -Times N -ParameterFilter { ... }`. You extend that block.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | install.ps1 | `Main` builds `$initArgs` = `$ForwardArgs` + `--yes` (de-duped) and passes `$initArgs` to both `Start-WienerdogNpx` and `Install-ViaTarball`. Nothing else changes. |
| modify | tests/ps/install-ps1.Tests.ps1 | extend `Describe 'Main'`: assert the handoff argv contains `--yes`; add "no duplicate `--yes`" and "preserves forwarded args" cases |
| modify | docs/adr/0017-windows-install-ps1.md | append the "non-interactive init handoff" amendment (exact text below) |

Do NOT edit `Start-WienerdogNpx`, `Start-WienerdogInit`, `Install-ViaTarball`,
`Ensure-Node`, the dot-source guard, any `Test-SemVer`/sha512 code, `install.sh`,
or `src/cli/init.js`.

### Exact contract

**1. `Main`: build `$initArgs` and use it in both branches.** Replace the handoff
region (from the `Write-Host "Found Node ..."` line down to the
`$code = Install-ViaTarball ...` line) with — verbatim, **pure ASCII**:

```powershell
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
```

Leave the surrounding lines (`if ((Get-NodeMajor) -lt 18) { return 1 }`,
`Ensure-Git`, `if ($code -eq 0) { Write-CompletionBanner }`, `return $code`)
exactly as they are.

Resulting handoff commands on Windows: `npx --yes wienerdog@latest init --yes` (npx
branch) and `node <app>\bin\wienerdog.js init --yes` (tarball branch) — init skips
its confirm, prints the plan, proceeds.

**2. Pester `Describe 'Main'` — extend to prove the argv.** Keep the existing
`BeforeEach`/`AfterEach`. Modify the two success cases to add a `-ParameterFilter`
that asserts the handoff received `--yes`, and add the two new cases. The full
intended `Describe 'Main'` body:

```powershell
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
```

(The last case — node hard-gate — is the existing one, unchanged; keep it.)

**3. ADR-0017 amendment.** Append verbatim at the very end of
`docs/adr/0017-windows-install-ps1.md` (after the existing WP-061 amendment):

```markdown
## Amendment - non-interactive init handoff (2026-07-07, WP-072)

P1 field bug from a real Windows machine with Node already installed:
`irm .../install.ps1 | iex` printed "Found Node ... - handing over ..." and then
**hung forever**. Root cause: the handoff ran `npx --yes wienerdog@latest init`,
where `--yes` is **npx's** package-prompt flag (it precedes `wienerdog@latest`), not
passed to `init`. So `init` reached its own `[Y/n]` confirm and blocked on stdin. On
POSIX that survives via `confirm()`'s `/dev/tty` fallback (WP-034); on Windows there
is no `/dev/tty` and under `irm|iex` the init child's stdin is tangled in
PowerShell's object pipeline, so init's plan and prompt never surface and it blocks
on stdin indefinitely - the same iex-handoff fragility class as WP-061.

Binding rule for `install.ps1` and all future Windows-installer work on this file:

1. **The bootstrapper hands off to `init` non-interactively.** `Main` passes `--yes`
   to the **init** command (built once into the forwarded argv and used for both the
   `npx` and the tarball branch), so `init` never reaches a blocking confirm. init
   still PRINTS its full plan before proceeding, preserving transparency; the
   installer one-liner + the printed plan are the consent surface (ADR-0011/0017,
   WP-052). The `--yes` is de-duped (idempotent - init reads `argv.includes('--yes')`).
2. **POSIX asymmetry is deliberate.** `install.sh` does NOT pass `--yes` to init: on
   POSIX the `/dev/tty` prompt actually works and shows the plan interactively (the
   designed UX with no downside). We keep the working interactive confirmation where
   it works and make the handoff non-interactive only where it cannot (Windows/iex).
   Making POSIX symmetric (or making Windows somehow prompt) would be a future
   amendment, not an oversight.

CI-testable on the Linux/macOS runners at the `Main` level: Pester asserts the
handoff argv contains exactly one `--yes` (via the mocked `Start-WienerdogNpx` /
`Install-ViaTarball` seams). The real no-hang behavior under `irm|iex` on a
Node-present Windows box stays a one-line manual-checklist item (§7), not a blocker.
```

## Implementation notes & constraints

- **Pure ASCII in `install.ps1`** (WP-057 lesson: non-ASCII trips the BOM analyzer
  and risks a PS 5.1 mis-decode under `irm|iex`). The added comment/code use only
  ASCII (backtick, `|`, `-`, `/`, `.`, `*` are all ASCII).
- **Do NOT touch `Start-WienerdogNpx`/`Start-WienerdogInit`.** Their `@ForwardArgs`
  splat already places whatever `Main` builds after `init`; the npx `--yes` (before
  `wienerdog@latest`) is a *different* flag and must stay. Injecting in `Main` keeps
  the npx-vs-init `--yes` distinction unambiguous and covers all three init call
  sites through the single `$initArgs` value.
- **`--yes` de-dup and null-safety.** The `if/elseif/else` handles: `$null`
  ForwardArgs -> `@('--yes')`; already-contains-`--yes` -> pass through unchanged;
  otherwise append. `[string[]] + [string]` yields an `[object[]]` that splats and
  binds back to `[string[]]` fine. Do not over-engineer beyond these three arms.
- **Why not just rely on WP-060's default-yes?** default-yes only resolves an
  *answered* empty-Enter; tangled iex stdin never delivers a line, so init would
  still block on readline. `--yes` (skip the prompt entirely) is the only
  deterministic fix. Do not attempt a prompt-hardening in `init.js` here (see Out of
  scope).
- When uncertain, choose the simpler option and record it under "Decisions made" in
  the PR. Do NOT expand scope.

## Security checklist

- [x] This WP introduces **no new untrusted-input -> path/command flow.** It appends
      a fixed literal flag (`--yes`) to the forwarded argv; no version/name/path
      segment is parsed or newly flows to a path or shell. The existing
      `Test-SemVer`/sha512 tarball gates are untouched and out of scope.

## Acceptance criteria

- [ ] `Main` passes `--yes` to the init handoff on **both** branches (npx present;
      npx absent -> `Install-ViaTarball`), proven by the Pester `-ParameterFilter`
      assertions.
- [ ] A caller-supplied `--yes` is **not** duplicated (exactly one `--yes` reaches
      the handoff); other forwarded args (e.g. `--fresh-vault`) are preserved
      alongside the appended `--yes`.
- [ ] The node hard-gate-unmet path still returns `1` with no banner and no handoff
      (existing behavior unchanged).
- [ ] `install.ps1` stays pure ASCII; PSScriptAnalyzer clean; the existing Pester
      suite (incl. `Dot-source guard`, `Write-CompletionBanner`) stays green.
- [ ] `npm test` and `npm run lint` unaffected (no JS/shell files changed).

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
npm test
pwsh -NoProfile -Command "Invoke-Pester -Path tests/ps -Output Detailed -CI"
pwsh -NoProfile -Command "Invoke-ScriptAnalyzer -Path ./install.ps1 -Settings ./PSScriptAnalyzerSettings.psd1 -Severity Warning,Error"
```

(If `pwsh` is not installed locally: `brew install --cask powershell` on macOS. CI
runs the last two regardless.)

## Out of scope (do NOT do these)

- **`install.sh` / POSIX parity.** Do not add `--yes` to `install.sh`'s handoff. On
  POSIX the `/dev/tty` prompt works (WP-034) and is the intended interactive
  confirmation — this is a **Windows-only** fix (verified from code: `install.sh`
  `exec npx --yes wienerdog@latest init "$@"` reaches init's `confirm()` which opens
  `/dev/tty`, prompts on stderr, and proceeds). The asymmetry is recorded in the ADR
  amendment as deliberate.
- **`src/core/prompt.js` `confirm()` hardening.** The residual init mode-1 hang
  (Windows `process.stdin.isTTY` true but the TTY never delivers a line under iex)
  is real but (a) removed from the installer path entirely by this `--yes` fix, and
  (b) has no safe non-heuristic guard — a timeout would break a legitimate slow human
  at an interactive prompt, and the Windows `/dev/tty` ENOENT path already resolves
  deterministically (`abort` -> false, never hangs). Report it as a lessons bullet /
  architect-backlog candidate; do NOT add a guard here.
- Any Windows scheduling / `schtasks` change.
- Editing `init.js`, `Ensure-Node`, the tarball fetch/verify, or the consent prompts.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/072-install-ps1-noninteractive-init-handoff`; conventional commits; PR
   titled `fix(install): install.ps1 hands off to init non-interactively (WP-072)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. **Owner manual Windows gate (the real reproduction; WP-058/061 precedent).** On
   the Node-present Windows machine, `irm .../install.ps1 | iex` **completes without
   hanging**: it prints "Found Node ... - handing over ...", init's plan prints, the
   install finishes, and the completion banner shows. The argv fix itself is
   CI-covered by the Pester `Main` tests above, so this is the confirming
   reproduction of the fixed field bug — record it as a checked item on the PR.
5. This spec's `status:` flipped to `In-Review` in the same PR.
