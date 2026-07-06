# Changelog

All notable changes to Wienerdog. Format: [Keep a Changelog](https://keepachangelog.com), versioning: SemVer (0.x until the installed file layout stabilizes — ADR-0003).

## [0.6.1] — 2026-07-06

### Changed
- **Smoother setup interview.** The four multiple-choice moments (what to adjust, preferred tone, vault choice, memory eagerness) are now asked as structured pick-one questions where your AI tool supports them — with a type-your-own answer always available. Open questions (who you are, your goals, your tools) stay conversational.
- **No overnight anxiety.** Everywhere Wienerdog mentions the 03:30 nightly dream — install summary, adoption summary, setup, README — it now also says plainly: if your computer is off or asleep at that time, don't worry, Wienerdog catches up automatically the next time you're back. That flexibility has always been how it works; now it's said out loud.

## [0.6.0] — 2026-07-06

### Added
- **Scheduled nightly dreaming on Windows.** Creating or adopting a vault on Windows now schedules the 03:30 dream in Task Scheduler, just like macOS and Linux — no admin rights needed (tasks are registered for your own user), and a companion catch-up task runs missed dreams shortly after you log back in when the machine was off or asleep at 03:30. Laptop-friendly: the tasks are explicitly configured to run on battery. `wienerdog uninstall` removes both tasks. This completes scheduled dreaming on all three OSes. (ADR-0018)
- Scheduled jobs on Windows get a properly shaped environment (PATH, HOME/USERPROFILE), and a job that hangs is now killed cleanly with its whole process tree.

### Notes
- This is the first release carrying Windows scheduling — it is fully covered by automated tests up to the Task Scheduler boundary, and its live behavior (registration, nightly runs, catch-up) is being verified in field testing now. If a scheduled dream misbehaves on your Windows machine, please open an issue: failures are recorded in `state/alerts.jsonl` and shown in your next session's briefing.

## [0.5.0] — 2026-07-06

### Added
- **Windows installer (`install.ps1`).** Windows now has a one-line install to match macOS/Linux: `irm https://…/install.ps1 | iex`. On a bare machine it detects a missing or too-old Node and offers to install the official signed Node LTS — via winget where present, otherwise the official signed `.msi` (SHA256-verified) through a consent-gated Windows elevation (UAC) prompt. git is offered the same way (never required to finish). After Node is in place it installs Wienerdog (npm-less tarball path where npm is absent) and hands off to `wienerdog init`. Node is the only hard requirement; every step shows exactly what it will run and falls back to printing the command if you decline. (ADR-0017)

### Changed
- **`wienerdog init` now defaults to "yes"** at its final "Proceed?" confirmation — pressing Enter proceeds. (Deletion prompts like `uninstall` still default to "no".)
- The Windows installer keeps your PowerShell window open and prints a clear "installed" confirmation at the end, instead of the window closing before you can read it.

### Notes
- Google features still require npm (the `googleapis` library is installed on demand); everything else works npm-free on all three OSes.
- Windows scheduling (the nightly dream on a timer) is not yet built — the digest, skills, and manual dreaming work; scheduled dreaming remains macOS/Linux-only for now.

## [0.4.0] — 2026-07-05

### Added
- **Install and update without npm.** Node is the only hard requirement now — where `npx`/`npm` isn't available, `install.sh` downloads the release straight from the npm registry over HTTPS (with a consent prompt showing exactly what and where), verifies its sha512 checksum, and unpacks it. A new `wienerdog update` command upgrades the same way. The "a new version is available" notice quotes `wienerdog update` on npm-less installs and `npx wienerdog@latest sync` where npm is present. (ADR-0016)

### Notes
- Google features still require npm (the `googleapis` library is installed on demand); everything else works npm-free.

## [0.3.1] — 2026-07-05

### Fixed
- **Windows: `sync`/`init` no longer crash after the first run.** Re-pointing the `app/current` link now falls back to remove-then-rename where Windows refuses to rename over an existing directory link, cleans up any `current.tmp.*` leftovers from earlier crashes, and — most importantly — skips the re-point entirely when `current` already points at the right version, so routine runs perform no link operations at all. (Reported by an external Windows tester — thank you.)
- **Windows: skills now register.** Where symlinks aren't permitted, skill folders are copied into place instead (tracked in the install manifest, fully removed by `wienerdog uninstall`), so the `/wienerdog-*` commands work after restarting your AI tool. A `wienerdog.cmd` launcher is also installed so the `wienerdog` command works in Windows terminals.
- **Dreaming no longer goes quiet after busy days.** Heavy session days could exceed the dream's input budget, and the run would falsely report "nothing new to dream" — forever. The budget default is now 8 MB, oversized sessions are trimmed to fit (newest messages kept) instead of skipped, and a dream that truly can't fit anything raises a visible alert instead of exiting silently.
- Dream skill preserves a note's provenance fields when updating it (WP-040, released here).

### Changed
- The README's "install via your AI" prompt now has the assistant show you the install plan first (`init --dry-run`), wait for your go-ahead, then install (`init --yes`) — with links to verify the package, and a reminder to restart your AI tool so the `/wienerdog-*` commands appear.

## [0.3.0] — 2026-07-04

### Added
- **Nightly dreaming is scheduled by default** (ADR-0014): creating or adopting a vault now schedules the 03:30 dream automatically — no prompt, plainly disclosed in the install summary, tracked in the install manifest, fully reversed by `wienerdog uninstall`. Change the time or remove it any time via `wienerdog schedule`. Catalog routines (daily digest, inbox triage, weekly review) remain opt-in.
- **Update notices** (ADR-0015): scheduled runs check the npm registry for a newer version at most once a day (3-second budget, silent on failure, never delays a job); the injected digest and `wienerdog doctor` show a one-line notice with the exact update command. Opt out with `update_check: false` in config.yaml. Wienerdog never updates itself. Disclosed in the threat model (T7).
- **Stable update path** (ADR-0013): the package now vendors itself into `~/.wienerdog/app/<version>` behind an atomically-switched `current` link, and installs a `wienerdog` command shim at `~/.local/bin`. Scheduled jobs target the stable path, so updates (and npm cache cleaning) can no longer strand the nightly dream. `npx wienerdog@latest sync` is the canonical update command: it vendors the new version, repoints existing schedules, and refreshes all managed files.
- On-demand Google library install: `googleapis` is no longer assumed present — Google setup installs it once, with consent showing the exact command (`npm install --ignore-scripts …`), into a version-durable deps dir. Non-Google users never download it; without it, `gws` explains how to set up instead of crashing.

### Fixed
- First-production-night hardening (ADR-0012): scheduled jobs now carry `USER` and find a natively-installed `claude` (`~/.local/bin`) in their clean environment; the dream pre-commits your session edits (`vault: session edits before dream`) instead of refusing all night on an "uncommitted changes" gate; a crashed dream reverts its partial writes so it can never starve future dreams; log rotation no longer deletes the newest evidence; brain stderr is surfaced in failure messages.
- Job failures are now durably visible: they append to `state/alerts.jsonl` and render as a plain-language alert block in the digest until the job next succeeds (replaces the transient banner that a digest regeneration could erase).
- The dream skill preserves provenance frontmatter (`origin`, `created`, `source_sessions`) when updating an existing note; `derived_from_untrusted` can only be raised.
- The bare `wienerdog` command now resolves on every install (the new shim) — previously the Google routine skills' `wienerdog gws …` instructions failed on npx-based installs.

### Security
- googleapis resolution is containment-guarded: only the consented, pinned copy in Wienerdog's own deps dir is ever loaded — a package planted elsewhere on the module path is ignored (and the consented install runs with `--ignore-scripts`).
- Update-check responses are treated as untrusted input: only a strictly semver-shaped version can be stored or rendered, inside a fixed template.

## [0.2.1] — 2026-07-03

### Fixed
- CLI confirmation prompts (`init`, `uninstall`) now read from the terminal (`/dev/tty`) when stdin is piped — the curl one-liner previously printed "Proceed? [y/N]" and exited silently without installing. When no terminal is available at all, the CLI aborts with a clear message instead of a silent no-op. Interactive Ctrl-D at a prompt aborts cleanly instead of hanging. (Found live in the first public curl-installer test.)

## [0.2.0] — 2026-07-03

### Added
- Consented dependency auto-install in `install.sh` (ADR-0011): detects missing Node ≥ 18 / git and installs them with per-hop `[Y/n]` consent showing the exact command — macOS (Xcode Command Line Tools for git; official signed nodejs.org `.pkg`, or Homebrew if already present, for Node) and Linux (apt/dnf/yum/pacman/zypper/apk, post-install version verification, NodeSource as a separately consented fallback for old-Node distros). Node is the only hard gate; a missing git warns and proceeds. Every action falls back to printing the exact command on decline, failure, or when no terminal is available — non-interactive contexts are never auto-installed into. Threat model updated (new entry T5b).

### Security
- New safety posture on the record: "never installs software without consent" (amends the earlier "never installs software" rule). No password capture, no Homebrew bootstrapping, signed sources preferred over nested scripts.

## [0.1.0] — 2026-07-03

First installable release. Everything below was built spec-driven by AI implementers with adversarial AI review; see docs/specs/done/ for the full record (30 work packages).

### Added
- One-line install (`install.sh` bootstrapper / `npx wienerdog init`) with manifest-tracked, byte-reversible uninstall.
- Interview-driven CLAUDE.md/AGENTS.md setup (`/wienerdog-setup`), re-runnable as a settings panel.
- Markdown memory vault (PARA, Obsidian-convention) with three paths: fresh, guided import, or full in-place adoption of an existing vault (`wienerdog adopt`) with layout mapping, TCC/git prerequisites, and a byte-non-destructiveness guarantee.
- Nightly dreaming: transcript capture (Claude Code + Codex CLI), tiered anti-injection memory gates enforced in code, one revertible git commit per run, human-readable dream reports, skill synthesis.
- Google Workspace senses (`wienerdog gws`): Gmail/Calendar/Drive, read-first and draft-first; sending only under user-created send grants (typed confirmation, per-routine recipient allowlists).
- Laptop-friendly scheduler: OS-native (launchd/systemd) with catch-up, TCC-guard, watchdog, fail-loud alerts; opt-in routine catalog (daily digest, inbox triage, weekly review).
- Subscription auth everywhere — no API keys in the product or its test infrastructure.

## [Unreleased]

### Notes
- (M0 foundation history folded into 0.1.0 above.)
