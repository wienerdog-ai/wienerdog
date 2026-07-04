# Changelog

All notable changes to Wienerdog. Format: [Keep a Changelog](https://keepachangelog.com), versioning: SemVer (0.x until the installed file layout stabilizes — ADR-0003).

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
