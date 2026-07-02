# Security Policy

Wienerdog writes files into users' AI-tool configurations, auto-writes memory derived from conversation transcripts, and (optionally) holds Google OAuth tokens. We treat security reports as top priority.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting on this repository ("Security" tab → "Report a vulnerability"). You'll get an acknowledgment within 72 hours.

## Scope of particular interest

- Prompt-injection paths into persistent memory (anything that lets untrusted content — email bodies, web pages, tool results — reach the injected session digest, identity notes, or skills). See [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) for the tiered-gate design this must not be possible through.
- Escapes from the dreaming job's restricted tool surface (it must not be able to execute shell commands or reach the network).
- Credential exposure: Google tokens leaving `~/.wienerdog/secrets/`, or secret-looking strings surviving the redaction pass into the vault.
- Installer writing outside its manifest, or uninstall leaving executable state behind.

## Out of scope

- Vulnerabilities in Claude Code, Codex CLI, or the model providers themselves (report upstream).
- Attacks requiring an already-compromised user account or machine.
