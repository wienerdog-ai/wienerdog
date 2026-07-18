---
id: WP-138
title: Least-scope GWS credential split + granted-scope verification + broker per-verb credential selection (audit A2)
status: Draft
model: opus
size: M
depends_on: [WP-136]
adrs: [ADR-0007, ADR-0013, ADR-0026]
branch: wp/138-least-scope-credential-split
---

# WP-138: Least-scope GWS credential split + granted-scope verification + broker per-verb credential selection (audit A2)

## Context (read this, nothing else)

Wienerdog installs files. **IRON RULE (ADR-0004): Wienerdog is just files** — no
daemons/servers/telemetry. Node ≥ 18, zero runtime deps (only `googleapis` is
ADR-approved), JSDoc types, no build step.

Today Wienerdog authenticates all Google access with **one combined OAuth token**
(`~/.wienerdog/secrets/google-token.json`) carrying `gmail.readonly`, **`gmail.compose`**
(send-capable), **`calendar`** (full read-write), and `drive.readonly`
(`src/gws/client.js` `SCOPES`). The 2026-07-15 audit (action **A2**, `04-gws-grants.md`)
found this makes the read/write split fake at the API layer: the token can `messages.send`
/ `events.delete` directly (F1). ADR-0026 fixes this by **splitting the credential by
capability** and having the broker load **only** the least-scope credential a verb needs,
and by **verifying the actual granted scopes** rather than trusting the requested
constants (audit point 7).

**WP-137** defined the broker verb table, tagging each verb with a **capability class**
(`READ`, `DRAFT`, `SEND`, `CALENDAR_WRITE`) and injecting a `services` object. This WP
builds the credential layer that produces the **right least-scope `services` per
capability class**, splits `wienerdog gws auth` into per-credential consent flows, and
migrates the existing combined token.

**A2 opens NO capability gate.** `google-setup` / `gws-use` stay BLOCKED
(`src/core/safety-profile.js` untouched). The CLI `gws auth` path is unreachable in
production (it fails closed at `requireCapability(GOOGLE_SETUP)` in `src/gws/index.js`);
this WP changes what it *would* do, unit-tested via the code seam. `wienerdog safety`
shows all five BLOCKED.

## Current state

- **`src/gws/client.js`:** `SCOPES` (the combined list), `tokenPath(paths)` →
  `secrets/google-token.json`, `clientJsonPath(paths)` → `secrets/google-client.json`,
  `writeSecretJson`/`persistToken`/`loadToken`, and `getServices(paths, {factory,
  googleapis})` — builds one `OAuth2` client from the single token and returns
  `{gmail, calendar, drive}`. **The `factory` seam** returns a fake for tests.
- **`src/gws/auth.js`:** `run(paths, opts)` runs one OAuth loopback flow with PKCE +
  `state` (WP-101) requesting `SCOPES`, and persists the single token. It calls
  `oauth.generateAuthUrl({access_type:'offline', prompt:'consent', scope:SCOPES,
  state, code_challenge, code_challenge_method:'S256'})` — **it does NOT set
  `include_granted_scopes`** today.
- **`src/gws/deps.js`:** `loadGoogleapis(paths)` (the vendored googleapis loader) and
  `OAuth2Client.getTokenInfo` is available on the google-auth-library client.
- **WP-137** `registry.js` takes `services` as an injected dep — this WP is the producer
  of that object for the broker.

**CONFIRMED (wd-researcher, Google OAuth docs 2026-07-18):**
- One OAuth client can hold **multiple independent refresh tokens** with different scope
  sets (separate consent flows → separate token files); cap 100/account/client.
- **Scope-bleed:** `include_granted_scopes=true` merges prior scopes into a new token —
  every broker consent MUST set **`include_granted_scopes: false`** and verify.
- **`gmail.send`** authorizes `messages.send` but **not** `drafts.create` (narrower than
  `gmail.compose`, which is send-capable and covers drafts). No draft-only scope exists.
- **`calendar.events` allows `events.delete`** — no insert-only Calendar scope exists.
  Delete-prevention comes from the broker verb allowlist (WP-137), **not** the scope;
  `calendar.events.readonly` (READ) cannot mutate at all. `drive.readonly` (not
  `drive.metadata.readonly`) is required to download content.
- Granted-scope verification is reliable via `OAuth2Client.getTokenInfo(accessToken)` →
  `scopes[]` (tokeninfo).
- **Testing-mode publishing status issues 7-day refresh tokens** for Restricted scopes
  (gmail read/compose, drive.readonly) — a weekly expiry that must fail **loud + closed**.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/gws/client.js | replace `SCOPES` with per-capability `SCOPE_SETS`; per-capability token paths; `getServicesForClass(paths, capabilityClass, opts)` builds a client from ONLY that credential; keep back-compat shims where safe |
| modify | src/gws/auth.js | run one consent flow **per credential** (`include_granted_scopes:false`), persist each token separately, and verify the actual granted scope subset per credential |
| create | src/gws/broker/credentials.js | broker-side: `loadCredentialServices(paths, capabilityClass)` — load the least-scope token, verify live scopes ⊆ required set (fail closed), return `{gmail\|calendar\|drive}`; loud fail-closed on expired/revoked (testing-mode 7-day) |
| create | src/gws/scope-sets.js | frozen `SCOPE_SETS` = {READ, DRAFT, SEND, CALENDAR_WRITE} → exact scope arrays; `requiredScopesFor(capabilityClass)` |
| create | src/gws/token-migration.js | one-time: detect the legacy combined token; per D-GRANT-MIGRATION-equivalent (D-TOKEN-MIGRATION) either retire it with a re-auth prompt or map it; never silently reuse a broad token as a least-scope one |
| create | tests/unit/broker-credentials.test.js | per-class scope-set selection, granted-scope subset check (accept/reject on bleed/missing), expired-refresh loud fail, migration behavior |
| modify | tests/unit/gws-auth.test.js | reconcile the multi-flow auth + `include_granted_scopes:false` + scope verification |
| modify | tests/unit/gws-client.test.js | reconcile SCOPE_SETS + `getServicesForClass` |

### Exact contracts

**1. `src/gws/scope-sets.js`.**

```js
'use strict';
const { CAPABILITY_CLASS } = require('./broker/constants');
/** Least-scope OAuth scope sets per broker capability class. Frozen; the ONE place
 *  scopes are declared for the split credentials. */
const SCOPE_SETS = Object.freeze({
  [CAPABILITY_CLASS.READ]: Object.freeze([
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
  ]),
  [CAPABILITY_CLASS.DRAFT]: Object.freeze(['https://www.googleapis.com/auth/gmail.compose']),
  [CAPABILITY_CLASS.SEND]:  Object.freeze(['https://www.googleapis.com/auth/gmail.send']),   // D-SEND-SCOPE
  [CAPABILITY_CLASS.CALENDAR_WRITE]: Object.freeze(['https://www.googleapis.com/auth/calendar.events']),
});
/** @param {string} capabilityClass @returns {string[]} */
function requiredScopesFor(capabilityClass) { /* SCOPE_SETS[class] or throw */ }
module.exports = { SCOPE_SETS, requiredScopesFor };
```

**2. `src/gws/client.js` — per-capability tokens + services.**

- Per-capability token paths: `secrets/google-token-read.json`, `-draft.json`,
  `-send.json`, `-calendar.json` (D-CRED-STORAGE — separate 0600 files). The legacy
  `google-token.json` path is retained ONLY for `token-migration.js` detection.
- `getServicesForClass(paths, capabilityClass, opts)` loads ONLY that class's token +
  the shared client JSON, builds one `OAuth2` client, and returns the **minimal**
  services object for that class (READ → `{gmail, calendar, drive}` read clients;
  DRAFT/SEND → `{gmail}`; CALENDAR_WRITE → `{calendar}`). The `factory` seam is preserved.
- The old `getServices(paths)` (combined token) is **retired** from the broker path; if
  any non-broker caller still needs it, keep a thin shim that throws a clear
  "split-credential migration required" error (GWS is frozen; nothing production reaches it).

**3. `src/gws/broker/credentials.js` — the broker's credential loader.**

```js
/** Load the least-scope services for a capability class, VERIFYING the actual granted
 *  scopes (getTokenInfo) are exactly the required least-scope set. Fails closed on:
 *  missing token, a granted-scope SUPERSET (scope bleed) or SUBSET-missing, or an
 *  expired/revoked refresh token (the testing-mode 7-day case → a distinct loud alert).
 *  The model NEVER receives the returned services or any token byte.
 *  @param {import('../../core/paths').WienerdogPaths} paths
 *  @param {string} capabilityClass
 *  @param {{ googleapis?:object, factory?:Function, getTokenInfo?:Function }} [opts]
 *  @returns {Promise<{gmail?:object, calendar?:object, drive?:object}>}
 *  @throws {WienerdogError} fixed, secret-free messages (incl. a distinct
 *          `refresh token expired (testing-mode 7-day)` message) */
async function loadCredentialServices(paths, capabilityClass, opts = {})
```

- Scope verification: obtain an access token, `getTokenInfo(accessToken)` → `scopes[]`,
  and assert `set(scopes) === requiredScopesFor(class)` (exact set, not a superset — a
  superset means scope bleed and is refused; a missing scope is refused). Record the
  verified scopes in the run-evidence-friendly return (metadata only, never the token).
- Expired/revoked refresh token → catch the `invalid_grant`-class error and throw the
  **distinct** testing-mode-expiry `WienerdogError` (ADR-0026 §3a) so `run-job`'s
  fail-loud surfaces "re-run `wienerdog gws auth`" — never a silent skip.

**4. `src/gws/auth.js` — one consent flow per credential.**

- Iterate the capability classes, running the existing PKCE+state loopback flow **once
  per class** with `scope: requiredScopesFor(class)` and
  **`include_granted_scopes: false`** (the scope-bleed guard). Persist each token to its
  per-class path. After each flow, call the WP-138 scope verification and **fail the
  flow** if the granted set is not exactly the requested least-scope set.
- Keep PKCE, `state`, the 5-min timeout, the loopback-close, ADR-0004 (no socket
  outlives the command) — all unchanged per flow.

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-SEND-SCOPE — RESOLVED (OWNER-APPROVED 2026-07-18): `gmail.send`.** SEND uses
  `gmail.send` (send-only, cannot create drafts or read; Sensitive not Restricted)
  rather than reusing `gmail.compose` — least privilege, and the broker builds raw MIME
  itself (WP-137). Accepted counterargument: two Gmail scopes (compose for drafts, send
  for send) means two Gmail consent flows; the least-privilege gain is the point.
- **D-CRED-STORAGE — RESOLVED (OWNER-APPROVED 2026-07-18): separate files.** Four
  separate 0600 token files (not one file with per-capability sections) — a
  compromise/rotation of one credential is isolated, and the broker opens only the one
  file it needs (file-level least privilege, assertable in tests).
- **D-OAUTH-CLIENT-COUNT — RESOLVED (OWNER-APPROVED 2026-07-18): one client + N tokens
  for v1.** Google-side revocation is believed per-app (per `client_id`) — secondary-
  sourced (the revocation-granularity spike) — so per-capability Google-side revocation
  would need N client IDs; v1 stays one client + N tokens (simpler consent; Console
  client creation is the most painful setup step), documenting revocation as
  all-or-nothing per client. Local mitigation: revoking the grant / deleting a token
  file disables that capability broker-side. Revisit if per-capability revocation is
  required.
- **D-TOKEN-MIGRATION (recommend retire-and-reauth).** The legacy combined token: import
  it as one of the split credentials (risky — it is a superset, so scope verification
  would refuse it anyway) vs retire it and require fresh per-credential `gws auth`.
  Recommend **retire + re-auth**: detect the legacy token, print a one-time notice that
  the credential model changed and `gws auth` must be re-run, and do NOT reuse the broad
  token (it would fail the exact-scope check by design). GWS is frozen and no production
  token exists, so no user is disrupted.
- **D-TESTING-MODE (cross-ref WP-143) — RESOLVED (OWNER-APPROVED 2026-07-18): the
  per-user non-Testing client posture** (ADR-0026 §3a): the documented recommended setup
  is the user's own OAuth client flipped out of "Testing" (unverified "In production" —
  no 7-day expiry; field-confirmed practice), weekly re-auth documented only as the
  Testing-mode fallback. This WP MUST ship the loud fail-closed expiry alert regardless;
  the posture doc is WP-143 (with the production-unverified-restricted SPIKE).

## SPIKEs (resolve with a live measurement before Ready)

- **SPIKE-include-granted-scopes-default** — the vendored google-auth-library's default
  for `include_granted_scopes` when omitted is unverified. Measure it; set the param to
  `false` explicitly regardless (do not rely on the default).
- **SPIKE-scope-verify-shape** — confirm `getTokenInfo` returns `scopes[]` in the vendored
  library version and the exact `invalid_grant` error shape for an expired refresh token
  (drives the distinct testing-mode alert).

## Implementation notes & constraints

- **The model never sees a token.** All credential loading is broker-side; the returned
  `services` object lives only in the broker process. No token path/value ever crosses the
  MCP boundary (WP-136 already forbids raw errors reaching the model).
- **Exact-scope, not superset.** A credential whose live scopes are a **superset** of the
  least-scope set is refused (that is scope bleed, and defeats the split). This is stricter
  than "has at least what I need" — deliberately (audit point 7).
- **Fail loud on expiry.** The testing-mode 7-day expiry must be a distinct, actionable,
  fail-closed alert — never a silent read failure that makes a routine quietly do nothing.
- **Idempotent/reversible.** Token files under `secrets/` (0700 dir / 0600 files, existing
  `writeSecretJson` shape). Uninstall already removes `secrets/` (WP-068/ADR-0019). The
  A5/A9 boundary holds: A5 did not touch `secrets/`; A2 owns these token files, A9 owns the
  broader private-mode sweep.
- Zero deps, JSDoc only. When uncertain, choose simpler + record it.

## Security checklist

- [ ] The broker loads ONLY the least-scope credential a verb's capability class requires,
      verifies the ACTUAL granted scopes are exactly that set (getTokenInfo) and fails
      closed on a superset (scope bleed), a missing scope, a missing token, or an
      expired/revoked refresh token (a distinct loud testing-mode-expiry alert). Every
      consent flow sets `include_granted_scopes:false`. No token path/value ever reaches
      the model. READ uses `calendar.events.readonly` (cannot mutate); SEND uses the
      narrowest send scope. The legacy combined token is retired, not silently reused.

## Acceptance criteria

- [ ] `getServicesForClass(paths, READ)` builds a client from the read token only and
      returns read services; a DRAFT/SEND call cannot obtain read services and vice versa
      (integration via the factory seam). (unit)
- [ ] `loadCredentialServices` accepts a token whose live scopes exactly match the class
      set; **rejects** a superset (bleed) and a missing scope; both fail closed with a
      fixed message. (unit — audit point 7)
- [ ] An expired/revoked refresh token produces the **distinct** testing-mode-expiry
      `WienerdogError`, not a generic failure. (unit — ADR-0026 §3a)
- [ ] `auth.js` runs one flow per credential with `include_granted_scopes:false` and
      persists separate token files; a flow whose granted scopes ≠ requested least-scope
      set fails. (unit)
- [ ] A read-only credential cannot send/delete: a SEND/CALENDAR_WRITE call built on the
      READ token is refused by the scope check (the live-Google proof that Google itself
      enforces this is WP-142's integration test — noted). (unit)
- [ ] Legacy combined token detected → retire + re-auth notice; not silently reused. (unit)
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "broker-credentials"
npm test -- --test-name-pattern "gws-auth"
npm test -- --test-name-pattern "gws-client"
npm test
npm run lint
node bin/wienerdog.js safety    # all five gates BLOCKED
```

State in the PR the SPIKE findings (include_granted_scopes default, getTokenInfo/scope
shape, invalid_grant shape) with the vendored googleapis version. The live "read-only
credential is rejected by Google on send/delete" proof is WP-142 (subscription/live).

## Out of scope (do NOT do these)

- The broker transport/verbs — **WP-136/WP-137** (this WP supplies `services` to WP-137's
  registry; wiring the real services into a run is **WP-141**).
- The grant store / TTY mutation — **WP-139**. `cal add-event` rename — **WP-140**.
- The 7-day-expiry threat-model/docs prose — **WP-143** (this WP ships only the alert).
- Opening any capability gate — never in A2.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, with the SPIKE
   findings and vendored googleapis version.
2. Branch `wp/138-least-scope-credential-split`; conventional commits; PR titled
   `feat(gws): least-scope credential split + granted-scope verification (WP-138)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
