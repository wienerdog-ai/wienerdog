# Wienerdog — Vision

## The observation

Highly capable knowledge workers — VCs, consultants, managers — use frontier AI models every day at a fraction of their potential. Teach them four things and the same model suddenly feels twice as intelligent:

1. a real CLAUDE.md/AGENTS.md that knows who they are and how they work,
2. a persistent markdown memory the model reads and writes across sessions,
3. skills for their recurring tasks,
4. access to the information already on their radar (email, calendar, files).

This knowledge is *not* widespread. It surprised McKinsey consultants. It surprised proficient daily AI users. The gap between "what the model can do" and "what most subscribers get from it" is enormous, and the fix is not a better model — it's better files around the model.

## The product

Wienerdog packages that fix as a one-line install:

```
curl -fsSL …/install.sh | bash   →   /wienerdog-setup
```

An interview conducted *by the user's own AI* produces their profile, preferences, and working instructions. A PARA-structured markdown vault becomes the model's persistent memory. A nightly **dreaming** job reviews the day's conversations, promotes what matters into long-term memory through quality gates, and turns repeated workflows into reusable skills. Optional Google Workspace senses (read-first, draft-only) and OS-native scheduled routines complete the stack.

## The principle that defines us

**Wienerdog is just files.**

OpenClaw and Hermes Agent prove the demand for persistent, personal AI — and both are *applications*: gateways, daemons, servers the user must run, secure, patch, and worry about. Wienerdog installs a *configuration*: markdown, skills, hooks, config entries — inert text interpreted by the AI tool the user already runs and trusts. Consequences:

- **No new attack surface.** Nothing listens, nothing serves, nothing phones home.
- **No new hardware.** No Mac mini, no VPS, no Docker.
- **TOS-compliant.** Everything executes through the user's own Claude Code / Codex subscription (`claude -p` / `codex exec` for scheduled jobs) — no gray-zone API relays.
- **User-owned.** Memory is plain markdown in the user's home directory, versioned in git, readable without any tool, portable between AI vendors.
- **Tiny maintenance surface.** The intelligence lives in prompts; the code is thin plumbing (< ~4k LOC).

## Who it's for

Not "everyone" — honestly: **knowledge workers who can be walked into Claude Code or Codex once, but will never build this scaffolding themselves.** They have a subscription and a terminal they were shown how to open. Our marketing owns step zero ("install Claude Code"); our product owns everything after.

## What success looks like

Two weeks after install, the user's memory vault is growing without their effort, their morning digest arrives, and they say the words we build for: *"it just feels much smarter now."*

## What we will not do

- No daemon, gateway, or server — ever (ADR-0004).
- No telemetry.
- No auto-*sending* anything: Google integration is read-first, draft-only; the send verb does not exist.
- No feature that requires the user to understand what a port is.
