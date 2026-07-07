# ADR-0017: Windows bootstrap (`install.ps1`) — consent surface, elevation, and testing

Status: Accepted (amends ADR-0006, ADR-0011, ADR-0016)

> Owner decision 2026-07-05: **consented UAC elevation** confirmed for the
> Windows Node install — winget-if-present, else the official signed MSI
> (SHA256-verified) installed via a per-hop-consented `Start-Process -Verb RunAs`
> UAC elevation. No nvm-windows / portable-zip fallback in v1 (rejected: expands
> the trust surface past ADR-0011's signed-official-source rule). A user who
> declines the UAC prompt gets the exact manual command and a non-zero exit.
Date: 2026-07-05

## Context

ADR-0006 made `curl -fsSL <url>/install.sh | bash` the default entry point and
promised a PowerShell variant (`install.ps1`) at M6–M7; until now Windows users
were told to run `npx wienerdog@latest init`. ADR-0011 gave the bash installer a
consent-gated dependency-install engine (per-hop `[Y/n]` on the controlling
terminal, print-and-exit fallback when non-interactive, prefer signed official
packages, Node ≥ 18 the only hard gate, git soft). ADR-0016 added an npm-less
registry-tarball install/update path. The owner's real from-scratch Windows
installs (the VPS cold-start transcripts) showed the Windows onboarding is still
the manual dance: no winget → manual Node MSI download → checksum → PATH refresh
→ npx. We want the PowerShell analog of `install.sh`: `irm <url>/install.ps1 | iex`
takes a bare Windows Server 2022 / Windows 11 machine to a working
`wienerdog init` plus skills, under the **same trust posture** as `install.sh`.

A time-boxed research spike (`memory/research/2026-07-05-windows-install-ps1.md`,
WP-056) resolved the platform unknowns that could not be guessed:

- **The consent surface is safe.** `irm URL | iex` is PowerShell's *object*
  pipeline, not bash's stdin-redirecting `curl | bash`; the process's real stdin
  (the interactive console) is untouched, so `Read-Host` inside the iex'd code
  reads from the live terminal (empirically verified; Microsoft's `about_Pipelines`
  states "stdin isn't connected to the PowerShell pipeline for input"). There is
  **no `/dev/tty` trick needed** — the console is directly usable. Non-interactive
  contexts are detected by `[Console]::IsInputRedirected` (the reliable signal;
  `[Environment]::UserInteractive` is documented-unreliable and returned `$true`
  even under full stdin redirection).
- **`Read-Host` (not `PromptForChoice`) is the consent primitive.** It is a plain
  cmdlet with predictable, catchable behavior; `PromptForChoice` throws a
  host-owned exception whose text is not stable across hosts (VS Code's host has
  historically not implemented it).
- **Node's official MSI is per-machine-only and hard-requires elevation.** Direct
  inspection of the current LTS MSI's Property table shows `ALLUSERS=1` compiled in
  (not `2`), so `MSIINSTALLPERUSER=1` has no effect (per Microsoft's own docs); the
  install target is anchored under `ProgramFiles64Folder`. **There is no supported
  non-elevated official Node install.** This is the decisive architectural fork.
- **winget is not present by default on Windows Server 2022** (only from Server
  2025 onward) and must never be assumed — always feature-detect with
  `Get-Command winget`.
- **CI can lint + unit-test `install.ps1` on the existing `ubuntu-latest` /
  `macos-latest` runners** (both ship `pwsh`, Pester, PSScriptAnalyzer
  preinstalled) — but this covers PowerShell syntax and pure-function correctness
  **only**; there is no automated coverage of real Windows elevation/MSI/registry
  behavior, and no Windows CI runner exists.

## Decision

Ship `install.ps1` at the repo root, served from GitHub raw, invoked as
`irm <url>/install.ps1 | iex`. It mirrors `install.sh`'s ADR-0011 posture for the
Windows surface, with these Windows-specific rules:

1. **Consent surface = the interactive console, read via `Read-Host`.** A single
   `$NonInteractive` flag is computed once at start:
   `[Console]::IsInputRedirected -or $Host.Name -eq 'ServerRemoteHost' -or (explicit -NonInteractive)`.
   Every install action goes through one `Confirm-Step` that shows the **exact
   command/URL** and prompts `[Y/n]` (default yes) — *only* when interactive. When
   `$NonInteractive`, it prints the exact command as a copy-paste fallback and
   exits non-zero; it never auto-installs and never applies default-yes. This is
   the byte-for-byte analog of `install.sh`'s per-hop consent, minus the `/dev/tty`
   dance (unnecessary under `irm|iex`).

2. **Node is the only hard gate; the official signed MSI is preferred; elevation
   is honest.** Order, each hop consent-gated:
   (a) if `winget` is present → `winget install --id OpenJS.NodeJS.LTS -e`
   (machine scope; UAC as the OS sees fit);
   (b) else download the **official signed nodejs.org `.msi`** for the current LTS
   (discovered from `https://nodejs.org/dist/index.json`, the first entry with
   `lts != false`), **verify its SHA256** against the published
   `SHASUMS256.txt` (`Get-FileHash -Algorithm SHA256`, no external dependency),
   and install it. Because the MSI is per-machine-only, installation **requires an
   elevation event**: if the console is already elevated, run `msiexec /i … /qn`
   directly; if not, elevate just that call via `Start-Process msiexec -Verb RunAs
   -Wait` (the UAC prompt is Windows's own elevation-consent surface, on top of our
   `[Y/n]`). If the user declines our prompt, cancels UAC, or the context is
   non-interactive, print the exact manual command (download URL + `msiexec`) and
   exit non-zero. **Wienerdog does not bootstrap nvm-windows or portable Node zips
   in v1** — mirroring `install.sh`'s "no nvm in v1" and ADR-0011's "prefer signed
   official packages." The honest consequence, documented plainly to the user:
   **installing Node on Windows requires administrator elevation; there is no
   non-elevated official path.**

3. **git is soft, non-blocking, per-machine.** Offered on the same consent flow
   (`winget install --id Git.Git -e` if present, else the official signed
   Git-for-Windows `.exe` run with `/VERYSILENT /NORESTART /NOCANCEL /SP-
   /SUPPRESSMSGBOXES` — invoking the `.exe` directly rather than `winget --silent`,
   which currently maps to `/SILENT` not `/VERYSILENT`). A missing git never blocks
   the handoff (Node is the only hard gate). Note: Claude Code on Windows ships Git
   Bash, so Claude-Code users already have git; git-consent mainly matters for
   Codex/bare installs.

4. **PATH refresh from the registry for the current session.** After a successful
   install, rebuild `$env:Path` from
   `[Environment]::GetEnvironmentVariable('Path','Machine')` + `…,'User'` so
   `node`/`npx` resolve without a new shell; print one follow-up line for the
   user's interactive shell. Never mutate the parent process persistently beyond
   its own run.

5. **Install path after Node = reuse the ADR-0016 tarball layout.** If `npx`
   resolves → `npx wienerdog@latest init`. Else (Node present, npx absent) the
   **PowerShell npm-less tarball fallback**: GET `registry.npmjs.org/wienerdog/latest`,
   validate the version as **strict, fully-anchored semver** (rejecting `/`, `\`,
   `..`), construct the tarball URL locally, download it, verify its **sha512** SRI
   before unpacking, extract with `tar` `--strip-components=1` into
   `~/.wienerdog/app/<version>/`, then `node app\<version>\bin\wienerdog.js init`.
   The Windows `.cmd` shim already exists (WP-051); `wienerdog update` (WP-054),
   being pure Node + `tar`, already works on Windows.

6. **Windows scheduling stays deferred.** `install.ps1` gets a bare machine to a
   working `wienerdog init` + skills; it does **not** generate `schtasks` entries.
   The nightly dream is not scheduled on Windows yet — the digest, skills, and the
   manual dream still work. Scheduler generators for Windows remain M6–M7 future
   work; this ADR does not introduce them.

7. **Honest testing story.** `install.ps1` is lint-gated by **PSScriptAnalyzer**
   and unit-tested by **Pester** on the existing Linux/macOS CI runners (both cover
   PowerShell syntax and the script's *pure* functions — semver validation, tarball
   URL construction, LTS/MSI discovery parsing, checksum comparison, the
   `$NonInteractive` decision, the tarball fetch/verify/unpack against a local
   fixture with real `tar`). A committed `PSScriptAnalyzerSettings.psd1` excludes
   `PSAvoidUsingWriteHost` (an interactive installer's user-facing output is host UI
   by design). The dot-source guard `if ($MyInvocation.InvocationName -ne '.')` lets
   Pester load functions without running `Main` (verified across direct-run,
   `irm|iex`, and dot-source shapes). **CI cannot exercise real Windows elevation,
   MSI install, registry PATH, or the true interactive-console
   `IsInputRedirected=$false` branch** — those are covered by a **documented manual
   verification checklist run on the owner's Windows VPS / a Windows 11 box**, which
   is a first-class part of the Definition of Done for the install-actions WP. Specs
   must not imply Windows coverage that does not exist.

This amends ADR-0006 (delivers the promised `install.ps1`), extends ADR-0011's
consent posture to Windows (console-as-consent-surface, UAC as the elevation
analog of `sudo`), and extends ADR-0016 (a PowerShell tarball fallback alongside
the bash one). The iron rule (ADR-0004) holds: `install.ps1` runs synchronous
installers and exits; it starts nothing that outlives its job, no telemetry, no
daemon.

## Consequences

- Windows users get a real one-line install (`irm … | iex`) at parity with the
  macOS/Linux `curl … | bash`, under the same visible trust posture.
- **The elevation story is honest but heavier than POSIX.** Every from-scratch
  Windows Node install triggers UAC — there is no non-elevated official path. A
  user who refuses elevation gets the exact manual command and a non-zero exit,
  never a silent partial install. (If the owner prefers instead to *require* an
  already-elevated console and refuse-with-guidance otherwise — option (a) in the
  research memo's Implications #1 — or to add a non-official nvm-windows/portable-zip
  fallback, this ADR must be amended; those alternatives are recorded here as the
  rejected paths for v1.)
- CI cost is zero-additional (Linux/macOS runners already carry the PowerShell
  toolchain), but the automated coverage boundary is explicit: syntax + pure logic
  only. Real Windows behavior rests on a documented manual checklist, not a runner.
- `PSAvoidUsingWriteHost` is pre-excluded so implementers don't each rediscover it.
- Several platform facts remain **UNCERTAIN** pending a real-Windows smoke test and
  are surfaced as manual-checklist items rather than blockers: the interactive-
  console `IsInputRedirected=$false` branch, the exact Server-SKU winget cutover
  (mitigated by always feature-detecting winget), Git-for-Windows per-user flag
  names (sidestepped by the per-machine `.exe` path), and PowerShell 5.1 parity for
  the `irm|iex`/`$MyInvocation` mechanics (very likely identical; confirmed by the
  checklist). The research was performed on `pwsh 7.6.3`, not Windows PowerShell
  5.1.
- The README's Windows one-liner and `install.sh`'s "PowerShell installer coming"
  note become stale once `install.ps1` ships — a wd-docs follow-up, out of scope
  for the install WPs themselves.

## Amendment — iex-safe exit discipline (2026-07-06, WP-061)

Field follow-up from the owner's real Windows Server 2022 install
(`irm .../install.ps1 | iex`, end-to-end success): under `iex` the script body is
evaluated **inside the user's live PowerShell host**, so any `exit` in the script —
including `Main`'s success `exit 0` and `Ensure-Node`'s hard-gate `exit 1` —
terminates the **host session** and closes the window. On success that erased the
just-completed install before the user could read it; on failure it would hide the
guidance the user needs.

Binding rule for `install.ps1` and all future Windows-installer work on this file
(including the deferred M6–M7 Windows scheduling):

1. **`Main` returns an `[int]` exit code; it never calls `exit`.** Dependency gates
   (`Ensure-Node`) signal failure by returning to `Main` (which re-checks
   `Get-NodeMajor` and returns non-zero), never by `exit`.
2. **On the success path `Main` prints a plain-language completion banner**
   (`Write-CompletionBanner`) so an `irm|iex` window visibly confirms the install
   and points at restart + `/wienerdog-setup`.
3. **Only the bottom-of-file dot-source guard decides process disposition**, using
   the same `$MyInvocation.InvocationName` signal §7 relies on: `''` ⇒ `irm|iex`
   / in-memory eval ⇒ set `$global:LASTEXITCODE` and return (never `exit`, so the
   host survives); a non-empty, non-`.` name ⇒ a real script file in its own
   process ⇒ `exit $code` is safe; `.` ⇒ library/dot-source (Pester), `Main` not
   run.

CI-testable on the Linux/macOS runners at the `Main` + `Write-CompletionBanner`
level (a Pester `Main` test that returns a value is itself proof `Main` did not
`exit` — an `exit` would kill the Pester process). The `irm|iex` window-survival
itself stays a one-line item on the manual Windows checklist (§7), not a blocker.

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
