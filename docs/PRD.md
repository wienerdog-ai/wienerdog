# Wienerdog v1 — Product Requirements

Owner: Gyula Fehér. Status: locked for v1 (2026-07-02). Changes require an ADR.

## Scope decisions (locked)

| Decision | Choice |
|---|---|
| v1 features | Installer, interview, memory vault, capture, dreaming, **Google Workspace**, scheduler. Browser GUI = v2 (must not be precluded; isn't — all state is on-disk files). |
| Harnesses | **Claude Code AND Codex CLI in v1.** Vendor-neutral core, thin adapters. Hooks are enrichment, never a dependency. |
| Memory writes | **Auto-write with tiered gates** + mandatory provenance frontmatter + git-backed vault (one commit per dream run) + human-readable dream reports. |
| Distribution | Default entry point: `curl -fsSL …/install.sh \| bash` bootstrapper delegating to npm (ADR-0006); `npx wienerdog@latest init` as the alternative. npm `wienerdog` is the distribution registry. GitHub org `wienerdog-ai`. |
| Visibility | Private until installable: init works end-to-end on macOS, ≥3 WPs shipped, threat model published. |
| License / version | MIT. SemVer, **0.x until the installed file layout stabilizes** — the installed layout IS the public API. |
| Windows | Lands M6–M7, "supported, less battle-tested". macOS and Linux gate earlier milestones. |

## User stories (v1)

1. **Setup** — As a Claude Code/Codex user, I paste one line, answer an interview conducted by my own AI, and end up with a personalized CLAUDE.md/AGENTS.md and a memory vault at `~/wienerdog/`. If I already have an Obsidian vault, Wienerdog adopts it instead.
2. **Memory** — My AI starts every session already knowing who I am, what I'm working on, and where we left off (injected digest). When I say "remember this," it lands in the vault immediately.
3. **Dreaming** — Overnight, my conversations are reviewed: durable facts become atomic notes, my day gets a daily-log entry, workflows I repeated ≥3 times become draft skills. I can read what was learned in a dream report, and revert any night with one git command.
4. **Senses** — After a guided Google setup, my AI can search/read my Gmail, Calendar, and Drive, and create drafts. It can *send* only under a grant I created myself at the keyboard, scoped to a routine and approved recipients (ADR-0007); anything else falls back to a draft plus a notice.
5. **Routines** — After setup, I pick from a catalog of ready-made routines (daily digest, inbox triage, weekly review, …) — nothing is scheduled by default (ADR-0008). If my laptop was closed at run time, the routine catches up shortly after I'm back — dreaming included. If anything fails, I find out loudly, not silently.
6. **Exit** — `wienerdog uninstall` removes everything it installed except my vault, and shows me exactly what it's doing first.

## Success criteria

- Time from paste-to-personalized: **< 15 minutes** (excluding optional Google setup).
- A brand-new session demonstrably knows the user (name, role, active projects) with **zero** manual prompting.
- Two-week retention behavior: dream commits still appearing nightly; digest still arriving.
- Zero support issues of the class "Wienerdog broke my existing CLAUDE.md" (managed blocks only).

## Non-goals (v1)

- Browser GUI (v2). Mobile anything. Messaging-channel integration (WhatsApp/Telegram — that's OpenClaw's game). Multi-user/team features. Non-Google productivity stacks (v1.x candidates: Microsoft 365). Verbatim/hindsight long-term memory engine (evaluate post-v1). Shared Google OAuth client (requires Google restricted-scope assessment; per-user client with guided setup in v1).

## Milestones

M0 foundation (docs/specs/agents — this commit) → M1 skeleton & installer → M2 Claude adapter + interview *(go-public possible)* → M3 capture + dreaming → M4 Codex adapter → M5 Google Workspace → M6 scheduler + digest → M7 hardening & release. Acceptance criteria per milestone live in `docs/specs/MILESTONES.md`.

## Key risks

- **Quota burn**: nightly dreams consume the user's subscription quota → input-size cap by default, configurable cadence (`dream every N days`).
- **Platform drift**: Claude Code/Codex surfaces change monthly → wd-researcher standing drift-check; adapters isolate the blast radius.
- **Vendor native features**: Anthropic/OpenAI ship built-in memory → our moat is user-owned vendor-neutral files, curation quality, and the safety posture, not any single feature.
- **Google OAuth friction**: per-user client setup is the v1 tax; the guided skill must make it survivable. Funding a verified shared client is a post-traction decision.
- **Injection into memory**: the defining risk — see `THREAT-MODEL.md`; the tiered-gate design exists because of it.
