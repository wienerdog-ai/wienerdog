# Changelog

All notable changes to Wienerdog. Format: [Keep a Changelog](https://keepachangelog.com), versioning: SemVer (0.x until the installed file layout stabilizes — ADR-0003).

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
