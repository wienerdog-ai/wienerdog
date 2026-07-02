# Positioning

## One-liner

**Give your AI a memory, habits, and a daily routine — with nothing but files.**

## The claim structure

| Against | They are | We are |
|---|---|---|
| OpenClaw | A gateway daemon with 50+ channels, a skills marketplace, and a server you must run, secure, and update | No daemon. No server. No new attack surface. Just files your existing AI tool reads. |
| Hermes Agent | An agent application with a learning loop, deployed to VPS/Docker/GPU | Same learning loop idea (dreaming, skill synthesis) — installed as configuration into the subscription you already pay for. |
| "Just use ChatGPT/Claude better" content | Articles and videos you must translate into setup yourself | One line. Your AI sets itself up by interviewing you. |

## The three benefit pillars (use everywhere, in this order)

1. **It feels smarter immediately.** Your AI knows who you are, remembers yesterday, and improves at your recurring tasks.
2. **You own everything.** Plain markdown on your machine, versioned in git, readable without any tool, portable between AI vendors.
3. **Nothing new to trust.** No daemon, no server, no telemetry, no TOS gray zone — everything runs through the subscription and tool you already use.

## Proof points

- The repo is built by its own product (dogfood vault in `memory/`, spec-driven AI implementation, `Generated-by:` lines in history).
- The threat model is published; your AI can only send what you explicitly granted, to recipients you approved at the keyboard — and it can never widen its own permissions (`docs/THREAT-MODEL.md`, ADR-0007).
- Uninstall shows you everything and removes everything except your memories.

## Audience

Knowledge workers who can be walked into Claude Code or Codex once. Not developers (they'll come anyway), not tinkerers (they have OpenClaw). Write for the smart colleague who was shown the terminal last week.

## Voice

Plain, confident, slightly wry. No hype-words. The dachshund is charming, not cutesy. Every article ends with the one-line install (the curl command from the README; ADR-0006).
