---
date: 2026-07-18
title: A2 GWS capability broker
related_wps: [WP-131, WP-133, WP-136, WP-137, WP-138, WP-139, WP-140, WP-141, WP-142, WP-143]
---

# A2 GWS capability broker (2026-07-18)

**A2 GWS capability broker (2026-07-18, ADR-0026 Accepted).** Closes the audit's GWS
capability-boundary cluster (04-gws-grants F1/F2/F3/F5): the single combined OAuth token
is send-and-write-capable (F1) and the send grant is a forgeable plaintext YAML fact (F2),
so the grant model is a property of the CLI wrapper, not the credential or the OS. A2
fills the A1 seam (WP-131's `broker-mcp.json`) with a **credential-holding capability
broker**: a per-job **stdio** child (ADR-0004 — NOT a daemon; spawned by the routine's
`claude -p`, dies with it) that alone loads OAuth tokens and exposes only **fixed verbs**
(server-side schemas, byte/count/rate limits, an exact API-method allowlist) to the
model — no token bytes, no raw client, no generic send. **WP-136** the hand-rolled MCP
stdio transport (zero-dep JSON-RPC, no @modelcontextprotocol/sdk) + a live per-job
lifecycle self-check; **WP-137** the fixed verb registry + limits; **WP-138** the
least-scope credential split (READ = readonly scopes incl. `calendar.events.readonly`;
DRAFT = `gmail.compose`; SEND = narrower `gmail.send`; CALENDAR_WRITE = `calendar.events`)
with actual-granted-scope verification and `include_granted_scopes:false` (scope-bleed
guard); **WP-139** the canonical broker-owned grant store (TTY-only, exact-byte integrity
fail-closed, retires the config.yaml YAML block); **WP-140** the `cal draft-event` →
`cal add-event` rename behind a calendar-write grant; **WP-141** the wiring (per-run
broker-mcp.json with the trusted `--routine` launch descriptor in the broker argv,
`--allowedTools mcp__broker__<verb>`, a bounded read-only vault snapshot, and broker-
calling routine skills); **WP-142** the end-to-end run-job poisoned-email containment
proof deferred from A1/WP-133 (a REQUIRED gate-opening precondition, executed here via the
`allowAll()` seam); **WP-143** the honest docs (broker boundary, gmail.compose send-
capability, cal add-event live mutation, grant store as tamper-evidence not an OS
boundary, the Google testing-mode 7-day refresh-token expiry limitation, A12 same-user
residual). Spec phase informed by a wd-researcher pass: `--strict-mcp-config` is required
(`--mcp-config` is additive); MCP tools are `mcp__<server>__<verb>` and need
`--allowedTools` (`--tools` governs built-ins only); `gmail.compose` is send-capable and
there is no draft-only Gmail scope; `calendar.events` allows delete (delete-prevention is
the verb allowlist, not the scope); **testing-mode issues 7-day refresh tokens** for
Restricted scopes — resolved by the per-user non-Testing client posture (unverified
"In production", D-TESTING-MODE) with a loud fail-closed expiry alert regardless;
revocation is per-client (D-OAUTH-CLIENT-COUNT);
and the stdio-child lifecycle is doc-unconfirmed → a mandatory WP-136 live self-check
(no orphaned broker, ADR-0004). **A2 opens NO capability gate** — `wienerdog safety`
shows all five BLOCKED after every WP; A1 contained the model, A2 removes the raw
credential, and `external-content-routine`/`gws-use` open only later (P1 + audit rerun +
explicit go + the WP-142 end-to-end containment proof). Chain: 136 → {137, 138, 139};
{138,139} → 140; {137,138,139} → 141; {140,141} → 142; all → 143.
