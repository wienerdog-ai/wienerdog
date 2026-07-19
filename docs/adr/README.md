# Architecture Decision Records

Durable decisions live here so they are made once, not re-litigated per session (human or model).

**Process**: copy `0000-template.md` to the next number; keep it under one page; status `Proposed` → `Accepted`. Accepted ADRs are immutable — supersede with a new ADR, never edit. Work-package specs cite ADRs by number ("Per ADR-0004, …"); implementers treat cited ADRs as law.

| # | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-mit-license.md) | MIT license | Accepted |
| [0003](0003-npm-primary-distribution.md) | npm-primary distribution | Accepted (amended by 0006, 0013) |
| [0004](0004-no-daemon-invariant.md) | No-daemon invariant ("Wienerdog is just files") | Accepted |
| [0005](0005-spec-driven-agent-development.md) | Spec-driven agent development | Accepted |
| [0006](0006-curl-installer-default.md) | curl installer as the default entry point | Accepted (amended by 0011, 0013) |
| [0007](0007-graduated-sending.md) | Graduated sending (send grants) instead of no-send | Accepted |
| [0008](0008-routine-catalog.md) | Post-setup routine catalog (quick wins), digest opt-in | Accepted (amended by 0014) |
| [0009](0009-subscription-everywhere.md) | Subscription auth everywhere — no Anthropic API keys | Accepted |
| [0010](0010-vault-adoption-paths.md) | Three vault paths — fresh, guided import, full adoption | Accepted |
| [0011](0011-consented-dependency-install.md) | Consented dependency auto-install in the curl installer | Accepted (amends 0006) |
| [0012](0012-dream-run-lifecycle.md) | Dream run lifecycle — pre-commit, crash revert, durable alerts | Accepted |
| [0013](0013-vendored-install.md) | Vendored install — stable app copy, `sync` as update command | Accepted (amends 0003, 0006) |
| [0014](0014-dream-scheduled-by-default.md) | Dreaming is scheduled by default on vault creation | Accepted (amends 0008) |
| [0015](0015-update-availability-check.md) | Update-availability check — bounded, cache-rendered, opt-out | Accepted |
| [0016](0016-npm-less-tarball-install-and-update.md) | npm-less install & update via the registry tarball | Accepted (amends 0003, 0006, 0013) |
| [0017](0017-windows-install-ps1.md) | Windows bootstrap (`install.ps1`) — consent, elevation, testing | Accepted (amends 0006, 0011, 0016) |
| [0018](0018-windows-scheduled-dreaming.md) | Windows scheduled dreaming via Task Scheduler | Accepted (amends 0014; extends 0013) |
| [0019](0019-uninstall-disposes-core-mechanics.md) | Uninstall disposes the core's machine-generated mechanics | Accepted |
| [0020](0020-skill-revision-lifecycle.md) | Skill revision lifecycle — dream-created-only, recurrence-gated, quarantined learnings | Accepted |
| [0021](0021-identity-trust-registry.md) | Human-ratified identity memory with an exact-byte trust registry | Accepted |
| [0022](0022-single-strict-frontmatter-parser.md) | One strict, fail-closed frontmatter parser for security-bearing notes | Accepted |
| [0023](0023-bounded-transcript-intake-and-quarantine-ledger.md) | Bounded streaming transcript intake and a per-file quarantine ledger | Accepted |
| [0024](0024-layered-secret-lifecycle.md) | Layered secret lifecycle — one shared scanner, four fail-closed persistence gates | Accepted |
| [0025](0025-hermetic-runtime-profiles.md) | Hermetic runtime profiles — code-owned capability composition | Accepted |
| [0026](0026-gws-capability-broker.md) | GWS capability broker — credential-holding per-job stdio broker, fixed verbs | Accepted |
| [0027](0027-scheduler-unload-rederived-not-stored.md) | Re-derive scheduler unload — never execute manifest-stored argv | Accepted |
| [0028](0028-scheduler-app-executable-integrity.md) | Scheduler, app, and executable integrity — pins, descriptors, out-of-tree launcher | Accepted |
| [0029](0029-spec-identity-and-derived-views.md) | Slug spec identity; frontmatter authority; views generated, never hand-written | Accepted |
| [0030](0030-bounded-user-level-process-supervision.md) | Bounded user-level process supervision — reap the findable descendant tree to quiescence; adversarial full-detach is A12 | Accepted |
| [0031](0031-contract-reference-tables-single-source.md) | A dense contract's single source of truth is one canonical reference table; registered mirrored surfaces defer to it and move with it | Proposed |
