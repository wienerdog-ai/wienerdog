# Roadmap — milestones and work packages

Milestone acceptance criteria are binding; WPs are the unit of implementation. Status source of truth is each spec's frontmatter; this table is the index.

## Milestones

| M | Name | Acceptance (summary) |
|---|---|---|
| M0 | Foundation | Docs, ADRs, spec system, agents, dogfood scaffold exist (this commit). |
| M1 | Skeleton & installer | Clean-machine `npx wienerdog` creates `~/.wienerdog` + vault (git-initialized), detects harnesses; `uninstall --dry-run` lists exactly what was created; `doctor` passes. |
| M2 | Claude adapter + interview | `/wienerdog-setup` produces `06-Identity/*`; CLAUDE.md managed block rendered; new session demonstrably knows the user via injected digest; `sync` idempotent. *Go-public possible.* |
| M3 | Capture + dreaming | Fixture transcripts incl. planted injection → gated notes with provenance; injection never reaches Tier 3; one git commit per run; readable dream report; `git revert` cleanly undoes a run. |
| M4 | Codex adapter | Codex-only machine (no hooks) gets full setup + working dream from rollout files alone. |
| M5 | Google Workspace | Guided OAuth completes; gmail/cal/drive read+draft work headlessly from `claude -p`; sends execute only under a grant, ungranted sends degrade to draft+notice (ADR-0007); tokens 0600, survive reboot. |
| M6 | Scheduler + routine catalog | Native schedule entries on each OS; simulated hang → watchdog kill + alert; job missed by shutdown (dream included) runs within an hour of the machine being back; catalog flow (ADR-0008) configures digest incl. its send-to-self grant; digest arrives by email. |
| M7 | Hardening & release | Threat model finalized vs implementation; install→use→uninstall leaves only the vault; fresh-machine install from README alone; npm publish. |

## Work packages

| WP | Title | Milestone | Model | Status | Depends on |
|---|---|---|---|---|---|
| [WP-001](WP-001-ci-and-lint-pipeline.md) | CI and lint pipeline | M0/M1 | sonnet | Ready | — |
| [WP-002](WP-002-agents-md-generator-and-schemas.md) | AGENTS.md generator + frontmatter schemas | M0/M1 | sonnet | Ready | WP-001 |
| [WP-003](WP-003-installer-core.md) | Installer core (init/doctor/uninstall, manifest) | M1 | opus | Ready | WP-001 |
| [WP-004](WP-004-vault-skeleton.md) | Vault skeleton generator + golden tests | M1 | sonnet | Ready | WP-003 |
| [WP-005](WP-005-interview-skill-and-renderer.md) | Interview skill + identity→managed-block renderer | M2 | opus | Ready | WP-004 |
| [WP-006](WP-006-claude-adapter.md) | Claude Code adapter (managed block, hooks, skills registration) | M2 | opus | Ready | WP-005 |
| [WP-007](WP-007-transcript-parsers.md) | Transcript parsers (Claude JSONL + Codex rollout) | M3 | sonnet | Ready | WP-003 |
| [WP-008](WP-008-dream-orchestrator.md) | Dream input assembly + brain launch (config, lock, watermarks, scratch, invocation) | M3 | opus | Ready | WP-007 |
| [WP-009](WP-009-dream-skill.md) | Dream skill (phases, tiered gates, provenance) | M3 | opus | Ready | WP-008, WP-017 |
| WP-010 | Codex adapter | M4 | sonnet | Draft | WP-006, WP-007 |
| WP-011 | gws CLI (auth, gmail, cal, drive, send grants, _alert) | M5 | opus | Draft | WP-003 |
| WP-012 | Google setup skill (guided OAuth) | M5 | sonnet | Draft | WP-011 |
| WP-013 | Scheduler generators + run-job wrapper (incl. catch-up) | M6 | opus | Draft | WP-003 |
| WP-014 | Routine catalog skill + daily digest entry | M6 | sonnet | Draft | WP-011, WP-013 |
| WP-015 | Scenario-test harness (nightly, incl. injection fixture) | M3/M7 | sonnet | Draft | WP-009 |
| [WP-016](WP-016-curl-installer-script.md) | curl installer bootstrapper (install.sh) | M1 | sonnet | Ready | WP-003 |
| [WP-017](WP-017-dream-validate-commit.md) | Dream runtime pipeline (watchdog run, diff validation, single commit) | M3 | opus | Ready | WP-008 |

## Dependency graph

```mermaid
graph LR
  WP001[WP-001 CI/lint] --> WP002[WP-002 AGENTS.md gen]
  WP001 --> WP003[WP-003 installer core]
  WP003 --> WP004[WP-004 vault skeleton]
  WP004 --> WP005[WP-005 interview]
  WP005 --> WP006[WP-006 Claude adapter]
  WP003 --> WP007[WP-007 transcript parsers]
  WP007 --> WP008[WP-008 dream input+launch]
  WP008 --> WP017[WP-017 dream validate/commit]
  WP017 --> WP009[WP-009 dream skill]
  WP006 --> WP010[WP-010 Codex adapter]
  WP007 --> WP010
  WP003 --> WP011[WP-011 gws CLI]
  WP011 --> WP012[WP-012 google setup skill]
  WP003 --> WP013[WP-013 scheduler]
  WP011 --> WP014[WP-014 daily digest]
  WP013 --> WP014
  WP009 --> WP015[WP-015 scenario harness]
  WP003 --> WP016[WP-016 curl installer]
```
</content>
