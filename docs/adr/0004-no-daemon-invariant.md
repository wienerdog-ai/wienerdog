# ADR-0004: No-daemon invariant ("Wienerdog is just files")

Status: Accepted
Date: 2026-07-02

## Context

Competing personal-AI projects (OpenClaw, Hermes Agent) are applications: gateways, daemons, servers users must run, secure, and update. Wienerdog's core differentiation and safety story is that it is not one.

## Decision

Wienerdog installs configuration, not an application. Permitted executables: the thin CLI (run on demand), hook scripts (<200ms, no computation at SessionStart — pre-rendered digest only), and scheduled jobs that are short-lived processes launched by the **OS-native scheduler** (launchd / systemd user timers / Task Scheduler). No process may outlive its job. No polling loops. No servers, no listeners, no telemetry. Scheduled intelligence runs through the user's own subscription via `claude -p` / `codex exec`.

## Consequences

- No new attack surface, no TOS gray zone, tiny maintenance burden — the product's defining claims stay true.
- Some features must be designed around OS schedulers' quirks (e.g. macOS powered-off catch-up via a login-triggered check).
- Any PR adding a daemon/server/telemetry is declined regardless of quality. A v2 GUI must be an on-demand local reader/editor of on-disk files, launched and exited by the user.
