# ADR-0003: npm-primary distribution

Status: Accepted
Date: 2026-07-02

## Context

The one-line install must work for knowledge workers on macOS/Linux/Windows. Every Claude Code user already has Node (Claude Code is npm-distributed); Codex CLI users overwhelmingly do too. Alternatives: curl|sh script, Python package, homebrew.

## Decision

`npx wienerdog@latest init` is the primary install. Implementation is plain Node ≥ 18, zero runtime dependencies except `googleapis` (the single approved exception — hand-rolling OAuth + three Google APIs is worse). No TypeScript build step (JSDoc types). A curl wrapper that checks for Node and delegates may be added later. Package name `wienerdog`, GitHub org `wienerdog-ai`.

## Consequences

- One-line install with no new runtime; versioning, provenance attestation, and download stats for free.
- Node is a hard requirement — acceptable given the target user already runs a Node-installed harness.
- Hook scripts are Node files invoked by absolute path (never `npx` in a hook — cold-start latency and network risk).
- SemVer via release-please; 0.x until the installed file layout stabilizes (the installed layout is the public API).
