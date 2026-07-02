# ADR-0006: curl installer as the default entry point

Status: Accepted (amends ADR-0003)
Date: 2026-07-02

## Context

ADR-0003 made `npx wienerdog@latest init` the primary install. Two problems: (a) Claude Code's own primary install is now a native binary (`curl -fsSL https://claude.ai/install.sh | bash`), so a growing share of harness users have no Node/npm at all; (b) our audience is knowledge workers — OpenClaw and Hermes both onboard via a single curl command, and "paste this one line" must not presuppose knowing what npm is.

## Decision

The default, user-facing install command is a curl-pipe-bash bootstrapper:

```
curl -fsSL <install-url> | bash
```

The script detects Node ≥ 18 and delegates to `npx wienerdog@latest init`; if Node is missing or too old, it prints plain-language, per-OS guidance and exits — it **never installs software silently** (our trust positioning). npm remains the distribution registry and `npx wienerdog@latest init` remains the documented alternative for users who prefer it. The script lives in-repo (`install.sh`), served from GitHub raw initially and from a friendly domain when one exists. Windows gets a PowerShell variant (`install.ps1`) at M6–M7; until then Windows users use npx.

## Consequences

- One-line onboarding works for native-installer Claude Code users; parity with competitor getting-started pages.
- The no-Node case becomes a guided path instead of a cryptic failure.
- ADR-0003's zero-dependency Node implementation, package name, and versioning rules are unchanged.
- We take on the usual curl|bash trust question — answered in THREAT-MODEL.md (the script is short, readable, in-repo, and delegates to a versioned, provenance-attested npm package).
