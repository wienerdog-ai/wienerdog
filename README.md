# Wienerdog 🌭🐕

**Give your AI a memory, habits, and a daily routine — with nothing but files.**

You already pay for a great AI model. Wienerdog makes it *feel* dramatically smarter — not by changing the model, but by installing the right files around it: a real profile of you, a persistent markdown memory, skills for your recurring tasks, and a nightly "dreaming" process that learns from your conversations.

```
curl -fsSL https://raw.githubusercontent.com/wienerdog-ai/wienerdog/main/install.sh | bash
```

**On Windows**, open PowerShell and run:

```
irm https://raw.githubusercontent.com/wienerdog-ai/wienerdog/main/install.ps1 | iex
```

Prefer npm? `npx wienerdog@latest init` does the same thing on any OS. Either script checks for Node (and git); if either is missing it offers to install it for you — always asking first and showing the exact command it will run, and simply printing that command for you to run yourself if you decline or aren't in an interactive terminal. On Windows, installing Node this way may pop up a one-time admin (UAC) prompt — that's Windows asking permission, not Wienerdog; decline it and you get the same command to run yourself instead. The window stays open and tells you when it's done. [Read install.sh](install.sh) or [install.ps1](install.ps1) first if you like; once Node is ready either one hands over to the versioned npm package. That handoff doesn't pause for another confirmation — it prints its plan as it installs, and running the one-liner is your go-ahead. Want to review the plan before anything is written? Run `npx wienerdog@latest init --dry-run` first, or use the AI-assisted install below.

> **Windows has full parity:** vault, skills, and scheduled nightly dreaming all work — the nightly dream registers in Task Scheduler for your own user (no admin rights), and if the machine was off or asleep at dream time it catches up after you're back.

Not comfortable with the terminal at all? Paste the prompt below into Claude Code
or Codex and your AI will install Wienerdog for you. In this flow you are the
approval step: it shows you the plan first, installs only after you say go, and
points you at the metadata so a cautious AI can confirm the package is genuine
before running it.

```
Please install Wienerdog for me. It's an open-source tool that gives an AI a
memory and daily routines using plain files. Before running anything, you can
verify it: GitHub https://github.com/wienerdog-ai/wienerdog, npm
https://www.npmjs.com/package/wienerdog. Then:
1. Show me the plan: run `npx wienerdog@latest init --dry-run` and summarize what
   it would create. Wait for me to say go ahead.
2. Install it: run `npx wienerdog@latest init --yes`.
3. Tell me to restart Claude Code (or Codex) so the new Wienerdog skills
   load — they only appear after a restart.
4. After I restart, walk me through the Wienerdog setup.
```

After the restart, in Claude Code:

```
/wienerdog-setup
```

In Codex CLI, skills start a little differently: type `/skills` to see them,
then `$wienerdog-setup` — or just ask for "Wienerdog setup" in plain words.

That's it. Your AI interviews you, builds your memory vault, and starts remembering.

> **Status: 0.x.** Installable and dogfooded daily by its maintainer; file formats may still evolve until 1.0 (the installed file layout is our public API).

## What you get

- **A proper CLAUDE.md / AGENTS.md** — generated from an interview, not a blank page. Your AI knows who you are, how you work, and what you care about, in every session.
- **A markdown memory vault** — Obsidian-convention PARA structure (works *with* Obsidian if you use it, doesn't require it). Plain files you own, readable by you, versioned in git. It stays on your machine — Wienerdog never pushes it anywhere on its own; publishing it, if you ever want to, is something you do yourself. Wienerdog also scrubs secret-looking text (API keys, tokens) out of what it reads and writes, but that scrubbing is best-effort, not a guarantee — if you know a real credential got captured, follow the [secret-incident guide](docs/runbooks/secret-incident.md).
- **Dreaming** — a nightly job reviews the day's conversations, promotes what matters into long-term memory through quality gates, and turns your repeated workflows into reusable skills. Skills Wienerdog created keep learning: the dream watches how they perform in real use and revises them over time — your own skills and Wienerdog's built-ins are never touched (see the [threat model](docs/THREAT-MODEL.md)). Every night is at most one git commit; anything can be reverted. If your computer is off or asleep at that time, don't worry — Wienerdog catches up automatically the next time you're back. In this security-hardened build, the dream's automatic edits to your identity files are paused pending a one-time pre-use safety review — it still writes your ordinary memory notes and skills as usual; run `wienerdog safety` to see what's enabled.
- **Google Workspace senses** *(optional)* — Gmail, Calendar, and Drive access that is read-first and draft-first by design. On the path Wienerdog enforces — a local capability broker that holds the credentials and exposes only fixed verbs — your AI can only *send* what you explicitly granted, to recipients you explicitly approved, and unattended sending goes to your own address only; grants are created by you at the keyboard, never by the AI.[^send-scope] In this security-hardened build, Google Workspace access is turned off pending a one-time pre-use safety review (run `wienerdog safety` to see what's enabled) — it's coming back once the safety gates are cleared.

[^send-scope]: This is a claim about what Wienerdog's own broker and CLI enforce against a hijacked AI, not an absolute guarantee against other software running as the same user on your machine — anything running as you can already read the same files. See the [threat model](docs/THREAT-MODEL.md) (T4a) for the honest boundary.
- **Laptop-friendly routines** *(optional, pick from a catalog)* — after setup, choose from a menu of ready-made scheduled routines (morning digest, inbox triage, weekly review, …) run by your OS's native scheduler (launchd / systemd / Task Scheduler). Laptop was closed at run time? It catches up. No daemon. In this security-hardened build, routines from the catalog are turned off pending a one-time pre-use safety review (run `wienerdog safety` to see what's enabled) — they're coming back once the safety gates are cleared.
- **Scheduled runs are verified before they run.** At every nightly fire, an independent launcher first checks that the app's code matches its recorded content address and that the job still matches its digest-bound authorization descriptor; Claude and Git are only spawned from their pinned, structurally verified install locations. Edits to `config.yaml` or the app tree made outside `wienerdog sync` don't change what runs — the job refuses with an alert instead (fail closed; the fix is one `wienerdog sync`).[^a7-boundary]

[^a7-boundary]: *Boundary, stated plainly: this protects against scoped file writes and detects drift between syncs. It is not a defense against arbitrary same-user native malware — that requires OS-level anchoring (see [THREAT-MODEL](docs/THREAT-MODEL.md)).*

## Why Wienerdog and not a "personal AI agent" app?

Projects like OpenClaw and Hermes are impressive — and they are *applications*: gateways, daemons, servers you must run, secure, and update. Wienerdog is different by design:

**Wienerdog is just files.** Markdown, skills, hooks, config — interpreted by the AI tool you already run and trust. No new long-running software: nothing listens, nothing serves, nothing phones home. No extra hardware, no VPS. And because everything executes through your own Claude Code / Codex subscription, you stay fully within your provider's terms of service.

## Built by its own product

This repo dogfoods Wienerdog from day one: its own memory vault lives in [`memory/`](memory/), its development conventions are its own CLAUDE.md, and most of its code is written by mid-tier AI models following its spec system (see [`docs/specs/`](docs/specs/)). The product thesis — *an AI gets dramatically better when you install the right files around it* — is also how this project is built.

## Documentation

- [Vision](docs/VISION.md) · [Product requirements](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md)
- [Threat model](docs/THREAT-MODEL.md) — read this if you're wondering "is auto-written AI memory safe?"
- [Contributing](CONTRIBUTING.md) — AI-assisted contributions welcome; we have a spec system built for them.

## License

[MIT](LICENSE)
