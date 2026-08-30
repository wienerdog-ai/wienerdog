# ADR-0004: No-daemon invariant ("Wienerdog is just files")

Status: Accepted
Date: 2026-07-02

## Context

Competing personal-AI projects (OpenClaw, Hermes Agent) are applications: gateways, daemons, servers users must run, secure, and update. Wienerdog's core differentiation and safety story is that it is not one.

## Decision

Wienerdog installs configuration, not an application. Permitted executables: the thin CLI (run on demand), hook scripts (<200ms, no computation at SessionStart — pre-rendered digest only), and scheduled jobs that are short-lived processes launched by the **OS-native scheduler** (launchd / systemd user timers / Task Scheduler). No process may outlive its job. No polling loops. No servers, no listeners, no telemetry. Scheduled intelligence runs through the user's own subscription via `claude -p` / `codex exec`.

## Amendment 1 (2026-08-30) — the hook clause, ACCEPTED

OWNER-SIGNED 2026-08-31

> **Ratified by the owner on 2026-08-31.** The owner ratified this amendment in
> the working session of 2026-08-31 and explicitly instructed the agent, in that
> session, to write the signature line above on his behalf — recorded so the
> line's provenance is exact, per the ADR-0035 discipline that an agent never
> writes one silently. With this signature the proposed replacement parenthetical
> below is in force; the Decision section is read with it.

**This section is in force as of the signature above.** It amends the ratified Decision above and
therefore needed the owner's ratification, which the signature line above now
carries (written by the agent on the owner's explicit in-session instruction,
provenance recorded in the header block).

**What is wrong.** The Decision's permitted-executables clause reads
`hook scripts (<200ms, no computation at SessionStart — pre-rendered digest
only)`. `WP-session-start-digest-dedup` (Done, shipped in PR #50 as `152ae3a`)
made the second half literally false: the SessionStart hook now stats each
present harness's config directory, reads that harness's `CLAUDE.md`/`AGENTS.md`,
reconstructs the expected managed block from the digest, and compares — so that
it can emit **nothing** when the block already carries the same bytes (ADR-0039,
Accepted and owner-signed 2026-08-30).

**What the clause is protecting is the budget, not the arithmetic.** This ADR's
subject is that Wienerdog installs no application: nothing that outlives its job,
nothing that polls, nothing a user must run or secure. A string compare over two
small files does not touch that. The `<200ms` bound is the real invariant and it
holds — measured 22.4 ms on a 32 KB digest with a matching block, 2026-08-30.

**Proposed replacement for that parenthetical, and nothing else in the Decision:**

```text
hook scripts (<200ms, no work that outlives the hook — they read pre-rendered
state and may compare it against what the session already carries, but never
render, never call a model, and never write outside their own one-shot job;
see ADR-0039)
```

**Scope of the amendment, stated so it cannot be read wider than it is:** it
changes one parenthetical in the permitted-executables sentence. The no-daemon
invariant, the no-polling rule, the no-servers/no-listeners/no-telemetry rule,
the `<200ms` budget, and the OS-native-scheduler requirement are untouched and
are not reopened here.

**Registered mirror.** `docs/specs/done/WP-session-start-digest-dedup.md`'s
Mirrored Surface Checklist carries this ADR's Decision line as a surface, so the
two move in the same pass once this amendment is signed.

## Consequences

- No new attack surface, no TOS gray zone, tiny maintenance burden — the product's defining claims stay true.
- Some features must be designed around OS schedulers' quirks (e.g. macOS powered-off catch-up via a login-triggered check).
- Any PR adding a daemon/server/telemetry is declined regardless of quality. A v2 GUI must be an on-demand local reader/editor of on-disk files, launched and exited by the user.
