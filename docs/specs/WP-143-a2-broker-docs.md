---
id: WP-143
title: A2 documentation — honest broker product claims, THREAT-MODEL, GLOSSARY broker terms, gws-broker runbook, testing-mode 7-day expiry limitation (audit A2)
status: Ready
model: sonnet
size: M
depends_on: [WP-136, WP-137, WP-138, WP-139, WP-140, WP-141, WP-142]
adrs: [ADR-0007, ADR-0026]
branch: wp/143-a2-broker-docs
---

# WP-143: A2 documentation — honest broker product claims, THREAT-MODEL, GLOSSARY broker terms, gws-broker runbook, testing-mode 7-day expiry limitation (audit A2)

## Context (read this, nothing else)

Wienerdog installs files. **IRON RULE (ADR-0004): Wienerdog is just files** — no
daemons/servers/telemetry. Node ≥ 18, zero runtime deps (only `googleapis`), JSDoc types,
no build step.

The 2026-07-15 audit (action **A2**, `04-gws-grants.md`) required (point 9) that the
product claims be corrected: the send boundary is enforced on the **broker/CLI path**, not
by the credential or the OS; `gmail.compose` is send-capable; `cal draft-event` is a live
mutation; and the "recurrence/grant protects you" and "the AI can **never** self-authorize
a send" language over-reaches against an actor with shell/filesystem access as the same OS
user. WP-136..WP-142 built and proved the **capability broker** (ADR-0026). This WP makes
the docs mechanically traceable to what the broker actually enforces, and adds an operator
runbook. It changes **prose only** — no product code, no golden fixtures.

**Everything a doc claims here must map to an enforced gate or a shipped mechanism** (the
A0/T0 discipline). The honest boundary: the broker contains a **hijacked model** (fixed
verbs, least-scope credentials, no raw token/client); it does **not** contain arbitrary
same-user native code (A12), which can read the same 0600 tokens and rewrite the same 0600
grant store. Document the **OAuth client posture** (ADR-0026 §3a, D-TESTING-MODE
OWNER-APPROVED 2026-07-18): the recommended setup is the user's own OAuth client flipped
out of "Testing" (unverified "In production" — no 7-day refresh-token expiry; one-time
unverified-app consent warning; the 100-user cap is irrelevant with one client per
install), with the **testing-mode 7-day expiry** stated as the fallback limitation for
clients left in Testing — it governs how long unattended GWS can run. Resolve the
**production-unverified-restricted SPIKE** here (primary-source-confirm the posture holds
for the Restricted scopes) before stating it as fact; CASA cost figures stay advisory.

**A2 opens NO capability gate.** GWS stays BLOCKED; the docs describe a mechanism that is
built and proven but not yet reachable. `wienerdog safety` shows all five BLOCKED.

## Current state (exact anchors to edit)

- **`docs/THREAT-MODEL.md`:**
  - **T4** (Credential exposure) mentions "the outbound send broker that gates every
    Google Workspace action (T4a)" — update to describe the least-scope split + no raw
    credential to the model.
  - **T4a** (Outbound sending as an exfiltration channel) currently says grants "live in
    `~/.wienerdog/config.yaml` … created only by the interactive CLI" and its **Residual**
    concedes "any local process able to write `config.yaml` … can forge a send grant, since
    a grant is an unauthenticated YAML fact." **This is the F2 language that A2 changes** —
    the grant now lives in the canonical broker-owned store with an exact-byte integrity
    marker, TTY-only mutation, and a fail-closed broker read; the residual is now honestly
    framed (tamper-evidence between attended actions, not an OS boundary; the model cannot
    forge it under A1+A2).
  - **T4b** (OAuth handshake integrity) — add the least-scope split + `include_granted_scopes:false`.
  - **Residual risks** section — add the testing-mode 7-day expiry and the A12
    arbitrary-same-user residual for the broker.
- **`docs/GLOSSARY.md`** — has `gws`, `send grant`. Add the broker terms.
- **`README.md:58`** — "Your AI can only *send* what you explicitly granted … grants are
  created by you at the keyboard, never by the AI." Scope this to the enforced broker/CLI
  path (it is true there; not an absolute against same-user native code).
- **`docs/VISION.md:48`** — "The AI can never widen its own permissions along the enforced
  grant/CLI path" — already scoped to the enforced path; align terminology with the broker
  and confirm no absolute overclaim remains (line 22 similarly).
- **`docs/runbooks/`** has `secret-incident.md`, `release.md`, `triage.md`,
  `codex-review.md`. There is **no** `gws-broker.md` — you create it.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/THREAT-MODEL.md | rewrite T4/T4a/T4b + Residual risks for the broker (least-scope split, no raw credential, broker-owned grant store tamper-evidence, gmail.compose send-capable, cal add-event live mutation, testing-mode 7-day expiry, A12 residual) |
| modify | docs/GLOSSARY.md | add `capability broker`, `broker verb`, `capability class`, `broker grant store`, `trusted launch descriptor`, `least-scope credential` |
| modify | README.md | scope the send claim to the enforced broker/CLI path; note GWS still off pending the safety review |
| modify | docs/VISION.md | align the send-boundary language with the broker; no absolute "never" overclaim |
| create | docs/runbooks/gws-broker.md | operator runbook: per-credential auth/re-auth, the 7-day testing-mode expiry + loud alert, grant minting (send-self, calendar-write), revocation granularity (per-client), what the broker does/doesn't protect |

### Content requirements (traceable claims only)

**THREAT-MODEL T4a rewrite — the core honesty fix.** Replace the F2 residual with:

- The send grant lives in the **canonical broker-owned grant store**
  (`state/broker-grants.json`, 0600), mutated **only** by the interactive TTY typed-word
  path (no `--yes`/env/headless), with an **exact-byte integrity marker** the broker
  verifies at send time; a mismatch **fails closed** (no send/draft/calendar write) with a
  fixed alert.
- The model reaches Google **only** through the broker's **fixed verbs** (least-scope
  credentials, server-side schemas, byte/count/rate limits, an exact API-method allowlist);
  it never sees a token/client/grant byte or a generic send, and cannot start `googleapis`.
- The default unattended send is **`send_digest_to_self`** — a zero-address-input verb; an
  external recipient is schema-rejected (zero API calls). Third-party unattended send stays
  disabled.
- **Honest residual (A12):** the integrity marker and the broker checks are
  **tamper-evidence between attended human actions, not an OS boundary** — a same-user
  *native* actor can read the same 0600 tokens and rewrite the same 0600 store. What
  contains a **hijacked model** (the audited threat) is A1 (no Bash/write/network) + A2 (no
  raw credential, fixed verbs). Do not imply cryptographic unforgeability.

**gmail.compose / cal add-event honesty.** State plainly: `gmail.compose` is **send-capable**
at the Google layer (there is no draft-only Gmail scope), which is why the send path is a
separate least-scope `gmail.send` credential behind the broker; and `cal add-event`
(formerly `cal draft-event`) creates a **live** calendar event (a mutation), gated by a
calendar-write grant.

**Testing-mode 7-day expiry (ADR-0026 §3a).** Document that a Google OAuth consent screen
in **Testing** publishing status issues refresh tokens that **expire in 7 days** for
Restricted scopes (Gmail read/compose, Drive), so unattended routines require weekly
re-auth until the app is verified; the broker fails **loud and closed** on expiry with a
distinct "re-run `wienerdog gws auth`" alert (never a silent no-op). Record app
verification (Restricted-scope CASA assessment) as the path to unattended longevity — but
mark its **cost/process figures SPIKE-advisory** (confirm against the official
restricted-scope-verification page before quoting numbers).

**Revocation granularity.** Note (per D-OAUTH-CLIENT-COUNT) that v1 uses one OAuth client
with per-capability tokens, so revoking one capability's access at Google is
**all-or-nothing per client** (per-capability revocation would need separate client IDs) —
so a user revokes at Google by removing Wienerdog's app access entirely.

**GLOSSARY additions (canonical names — never invent synonyms elsewhere):**
- **capability broker** — the local, per-job stdio process (ADR-0026) that alone holds
  Google OAuth credentials and exposes only fixed verbs to a routine's model over MCP; it
  is a child of the routine's `claude -p`, dies with it, and is never a daemon (ADR-0004).
- **broker verb** — one fixed, schema-validated, least-scope, rate-limited operation the
  capability broker exposes (e.g. `gmail_search`, `send_digest_to_self`), each mapped to
  exactly one Google API method; there is no generic send/URL/raw client.
- **capability class** — the least-scope credential group a broker verb belongs to
  (`READ`, `DRAFT`, `SEND`, `CALENDAR_WRITE`); the broker loads only the class a verb needs.
- **broker grant store** — the canonical 0600 record (`state/broker-grants.json`) of the
  send/calendar-write grants, mutated only by the interactive TTY `wienerdog grant` path,
  with an exact-byte integrity marker the broker checks fail-closed (ADR-0026); replaces
  the former config.yaml YAML grant block. Tamper-evidence between attended actions, not an
  OS boundary.
- **trusted launch descriptor** — the routine identity/capability the broker takes from
  `run-job`'s Wienerdog-written argv (`--routine <id>`), never from model-suppliable input
  or an env var; this is why a forged routine name cannot borrow another's capability/grant.
- **least-scope credential** — a per-capability OAuth token carrying only the scopes one
  capability class needs (e.g. READ = `gmail.readonly` + `calendar.events.readonly` +
  `drive.readonly`), verified against its actual granted scopes at load, replacing the
  single combined send-and-write-capable token.

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-CLAIM-WORDING — RESOLVED (OWNER-APPROVED 2026-07-18): "on the enforced broker/CLI
  path" + honest footnote.** The README/VISION send claim is scoped to the enforced
  path: "your AI can only send what you granted, to whom you granted it, **on the path
  Wienerdog enforces** — the broker and CLI", with a one-line footnote that this is not
  a claim against other software running as the same OS user (A12). Every word traces to
  a shipped mechanism (A0/T0 discipline); the full-retreat alternative ("grants limit
  sending") was rejected — equally true but needlessly surrenders the differentiator.
- **D-VERIFY-FIGURES — RESOLVED (OWNER-APPROVED 2026-07-18): omit specific figures.**
  The runbook says "annual assessment — see Google's restricted-scope app-verification
  page for current cost and process" and quotes NO dollar/timeline figures; a concrete
  number may enter only after a wd-researcher primary-source spike confirms it. A stale
  baked-in figure would violate the very honest-docs discipline this WP enforces, and
  the always-current link serves the user better than a decaying "~approx" number.

## Implementation notes & constraints

- **Prose only.** No product code, no golden fixtures, no CLI-string pins. If a claim needs
  a code change to be true, that is a spec-gap back to wd-architect — do not soften the
  code to match aspirational prose or vice versa.
- **Every claim traces to a mechanism.** Do not write a protection the broker does not
  enforce. Where the boundary is A1+A2 (not the credential/OS), say so.
- **Keep "sandbox" reserved** for `sandbox-guard.js` (the WIENERDOG_HOME redirect guard);
  the broker is a "capability broker," never a "sandbox."
- **User-facing plain language** (CLAUDE.md): the runbook is for a knowledge worker, not a
  developer — explain the 7-day re-auth in plain terms.
- When uncertain, choose the simpler wording and note it.

## Security checklist (docs)

- [ ] No doc claims a protection the shipped broker does not enforce. The send-boundary
      language is scoped to the enforced broker/CLI path; the A12 same-user-native residual,
      the grant-store-is-tamper-evidence-not-an-OS-boundary framing, the gmail.compose
      send-capability, the cal add-event live-mutation, and the testing-mode 7-day expiry
      are all stated. "Sandbox" is not used for the broker.

## Acceptance criteria

- [ ] THREAT-MODEL T4a no longer describes the grant as an "unauthenticated YAML fact any
      local process can forge" as the final word; it describes the broker-owned store +
      integrity + the honest A12 residual. (grep/read)
- [ ] THREAT-MODEL states gmail.compose is send-capable, cal add-event is a live mutation,
      and the testing-mode 7-day expiry limitation with the loud fail-closed alert. (read)
- [ ] GLOSSARY defines all six new broker terms; no synonym for them appears elsewhere in
      the changed docs. (read)
- [ ] README/VISION send claims are scoped to the enforced broker/CLI path (no absolute
      "the AI can never send" against same-user native code). (read)
- [ ] `docs/runbooks/gws-broker.md` covers per-credential auth/re-auth, the 7-day expiry +
      alert, grant minting (send-self + calendar-write), and revocation granularity. (read)
- [ ] `wienerdog safety` shows all five gates BLOCKED (untouched). `npm run lint` (markdown)
      passes.

## Verification steps (run these; paste output in the PR)

```bash
npm run lint                      # markdownlint + frontmatter checks on the changed docs
grep -n "unauthenticated YAML fact\|draft-event" docs/THREAT-MODEL.md   # the old F2/F3 wording is gone
grep -n "capability broker\|broker grant store\|trusted launch descriptor\|least-scope credential" docs/GLOSSARY.md
grep -n "enforced\|broker" README.md docs/VISION.md
test -f docs/runbooks/gws-broker.md && echo "runbook present"
node bin/wienerdog.js safety      # all five gates BLOCKED
```

## Out of scope (do NOT do these)

- Any product code, CLI message, or golden fixture — this WP is docs only (a needed code
  change is a spec-gap back to wd-architect).
- Rewriting the routine SKILL bodies — that is **WP-141** (function + integrity digest).
- Opening any capability gate — never in A2.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/143-a2-broker-docs`; conventional commits; PR titled
   `docs(security): honest GWS broker claims, threat model, glossary, runbook (WP-143)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
