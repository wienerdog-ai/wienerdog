# Architecture Decision Records

Durable decisions live here so they are made once, not re-litigated per session (human or model).

**Process**: copy `0000-template.md` to the next number; keep it under one page; status `Proposed` → `Accepted`. Accepted ADRs are immutable — supersede with a new ADR, never edit. Work-package specs cite ADRs by number ("Per ADR-0004, …"); implementers treat cited ADRs as law.

| # | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-mit-license.md) | MIT license | Accepted |
| [0003](0003-npm-primary-distribution.md) | npm-primary distribution | Accepted (amended by 0006) |
| [0004](0004-no-daemon-invariant.md) | No-daemon invariant ("Wienerdog is just files") | Accepted |
| [0005](0005-spec-driven-agent-development.md) | Spec-driven agent development | Accepted |
| [0006](0006-curl-installer-default.md) | curl installer as the default entry point | Accepted (amended by 0011) |
| [0007](0007-graduated-sending.md) | Graduated sending (send grants) instead of no-send | Accepted |
| [0008](0008-routine-catalog.md) | Post-setup routine catalog (quick wins), digest opt-in | Accepted |
| [0009](0009-subscription-everywhere.md) | Subscription auth everywhere — no Anthropic API keys | Accepted |
| [0010](0010-vault-adoption-paths.md) | Three vault paths — fresh, guided import, full adoption | Accepted |
| [0011](0011-consented-dependency-install.md) | Consented dependency auto-install in the curl installer | Accepted (amends 0006) |
