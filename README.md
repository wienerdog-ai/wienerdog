# Wienerdog 🌭🐕

**Give your AI a memory, habits, and a daily routine — with nothing but files.**

You already pay for a great AI model. Wienerdog makes it *feel* dramatically smarter — not by changing the model, but by installing the right files around it: a real profile of you, a persistent markdown memory, skills for your recurring tasks, and a nightly "dreaming" process that learns from your conversations.

```
npx wienerdog@latest init
```

Then, inside Claude Code or Codex CLI:

```
/wienerdog-setup
```

That's it. Your AI interviews you, builds your memory vault, and starts remembering.

> **Status: pre-release.** Wienerdog is under active development and not yet installable. Watch the repo — the line above will work soon.

## What you get

- **A proper CLAUDE.md / AGENTS.md** — generated from an interview, not a blank page. Your AI knows who you are, how you work, and what you care about, in every session.
- **A markdown memory vault** — Obsidian-convention PARA structure (works *with* Obsidian if you use it, doesn't require it). Plain files you own, readable by you, versioned in git.
- **Dreaming** — a nightly job reviews the day's conversations, promotes what matters into long-term memory through quality gates, and turns your repeated workflows into reusable skills. Every night is one git commit; anything can be reverted.
- **Google Workspace senses** *(optional)* — Gmail, Calendar, and Drive access that is read-first and draft-only by design. The send button doesn't exist.
- **Laptop-friendly routines** — a morning digest or any scheduled task, run by your OS's native scheduler (launchd / systemd / Task Scheduler). Missed while your laptop was closed? It catches up. No daemon.

## Why Wienerdog and not a "personal AI agent" app?

Projects like OpenClaw and Hermes are impressive — and they are *applications*: gateways, daemons, servers you must run, secure, and update. Wienerdog is different by design:

**Wienerdog is just files.** Markdown, skills, hooks, config — interpreted by the AI tool you already run and trust. No new long-running software. No new attack surface. No extra hardware, no VPS. And because everything executes through your own Claude Code / Codex subscription, you stay fully within your provider's terms of service.

## Built by its own product

This repo dogfoods Wienerdog from day one: its own memory vault lives in [`memory/`](memory/), its development conventions are its own CLAUDE.md, and most of its code is written by mid-tier AI models following its spec system (see [`docs/specs/`](docs/specs/)). The product thesis — *an AI gets dramatically better when you install the right files around it* — is also how this project is built.

## Documentation

- [Vision](docs/VISION.md) · [Product requirements](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md)
- [Threat model](docs/THREAT-MODEL.md) — read this if you're wondering "is auto-written AI memory safe?"
- [Contributing](CONTRIBUTING.md) — AI-assisted contributions welcome; we have a spec system built for them.

## License

[MIT](LICENSE)
