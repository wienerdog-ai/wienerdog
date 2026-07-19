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

An interview conducted *by the user's own AI* produces their profile, preferences, and working instructions. A PARA-structured markdown vault becomes the model's persistent memory. A nightly **dreaming** job reviews the day's conversations, promotes what matters into long-term memory through quality gates, and turns repeated workflows into reusable skills. Optional Google Workspace senses (read-first, draft-first, reached only through a local capability broker, sending only under explicit user-created grants) and an opt-in catalog of OS-native scheduled routines — designed to deliver a spectacular first win within a day — complete the stack (in this build, Google senses and the routine catalog are off pending the pre-use security review — see "What we will not do").

## The principle that defines us

**Wienerdog is just files.**

OpenClaw and Hermes Agent prove the demand for persistent, personal AI — and both are *applications*: gateways, daemons, servers the user must run, secure, patch, and worry about. Wienerdog installs a *configuration*: markdown, skills, hooks, config entries — inert text interpreted by the AI tool the user already runs and trusts. Consequences:

- **No daemon to secure.** Nothing listens, nothing serves, nothing phones home.
- **No new hardware.** No Mac mini, no VPS, no Docker.
- **TOS-compliant.** Everything executes through the user's own Claude Code / Codex subscription (`claude -p` / `codex exec` for scheduled jobs) — no gray-zone API relays.
- **User-owned.** Memory is plain markdown in the user's home directory, versioned in git, readable without any tool, portable between AI vendors.
- **Tiny maintenance surface.** The intelligence lives in prompts; the code is thin plumbing (< ~4k LOC).
- **Scheduled runs are verified before they run.** Because the nightly jobs are unattended, an independent launcher checks — at every fire — that the app's code still matches its recorded content address and that the job still matches its digest-bound authorization descriptor, and Claude and Git are spawned only from their pinned, structurally verified install locations. An edit to `config.yaml` or the app tree made outside `wienerdog sync` does not change what runs; the job refuses with an alert (fail closed) until an explicit re-sync re-authorizes it.[^a7-boundary]

[^a7-boundary]: *Boundary, stated plainly: this protects against scoped file writes and detects drift between syncs. It is not a defense against arbitrary same-user native malware — that requires OS-level anchoring (see [THREAT-MODEL](THREAT-MODEL.md)).*

## Who it's for

Not "everyone" — honestly: **knowledge workers who can be walked into Claude Code or Codex once, but will never build this scaffolding themselves.** They have a subscription and a terminal they were shown how to open. Our marketing owns step zero ("install Claude Code"); our product owns everything after.

## What success looks like

Two weeks after install, the user's memory vault is growing without their effort, their morning digest arrives, and they say the words we build for: *"it just feels much smarter now."*

## What we will not do

- No daemon, gateway, or server — ever (ADR-0004).
- No telemetry.
- No sending without a grant: outbound actions (email, invites) execute only under grants the user created interactively, scoped to specific routines and recipients (ADR-0007), and a routine reaches Google only through the local capability broker's fixed verbs (ADR-0026) — it never holds a raw credential or a generic send. Along that enforced broker/CLI path the AI cannot widen its own permissions; this is a boundary against a hijacked model, not against arbitrary same-user native code (see the threat model's T4a). In the current security-hardened build the Google Workspace layer is disabled entirely behind a pre-use safety gate — see the threat model's T0 and run `wienerdog safety`.
- No feature that requires the user to understand what a port is.
