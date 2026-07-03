# Changelog

All notable changes to Wienerdog. Format: [Keep a Changelog](https://keepachangelog.com), versioning: SemVer (0.x until the installed file layout stabilizes — ADR-0003).

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
