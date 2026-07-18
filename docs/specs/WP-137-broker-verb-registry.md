---
id: WP-137
title: GWS broker verb registry — fixed verbs, server-side schemas, byte/count/rate limits, exact API-method allowlist (audit A2)
status: Draft
model: opus
size: M
depends_on: [WP-136]
adrs: [ADR-0007, ADR-0025, ADR-0026]
branch: wp/137-broker-verb-registry
---

# WP-137: GWS broker verb registry — fixed verbs, server-side schemas, byte/count/rate limits, exact API-method allowlist (audit A2)

## Context (read this, nothing else)

Wienerdog installs files: a memory **vault**, skills, hooks, scheduled jobs. **IRON
RULE (ADR-0004): Wienerdog is just files** — no daemons/servers/telemetry. Node ≥ 18,
zero runtime deps (only `googleapis` is ADR-approved), JSDoc types, no build step.

A 2026-07-15 security audit (action **A2**, `04-gws-grants.md`) requires that the
Google-access **broker** (ADR-0026) expose only **fixed verbs with server-side
schemas, byte/count/rate limits, and an exact API-method allowlist** — no generic
`messages.send`, no delete/update, no arbitrary URL, no raw client surface (audit
acceptance point 1). **WP-136** built the broker **transport** (a hand-rolled MCP
stdio JSON-RPC server) that takes an **injected verb registry**. This WP builds that
**registry**: the one place a broker verb is defined.

The registry maps each verb to exactly one Google API method via a `services` object
(the `{gmail, calendar, drive}` shape `src/gws/client.js` `getServices` returns).
**This WP injects `services` — it does not load a credential** (credentials + the
per-verb credential selection are **WP-138**; the trusted-launch wiring is WP-141).
Tests pass a **fake `services`** exactly as the existing gws tests do
(`getServices(paths, {factory})`). So this WP is fully unit-testable with no Google.

**Default unattended send is `send_digest_to_self`** (ADR-0026 §4, ADR-0007): a
**zero-address-input** verb — no recipient argument. The broker resolves the recipient
to the authenticated self address. An external recipient supplied in the args **fails
schema validation** and makes **zero API calls**. Third-party unattended send stays
disabled.

**A2 opens NO capability gate.** `gws-use` / `external-content-routine` stay BLOCKED
(`src/core/safety-profile.js` untouched). The verbs are defined and unit-tested but
unreachable in a production routine. `wienerdog safety` shows all five BLOCKED.

## Current state

- **`src/gws/broker/server.js`** (WP-136) calls an injected `registry.listTools()` and
  `registry.callTool(name, args)`. This WP creates the registry those consume.
- **`src/gws/broker/constants.js`** (WP-136) exports `CAPABILITY_CLASS`
  (`READ`,`DRAFT`,`SEND`,`CALENDAR_WRITE`) and `BROKER_SERVER_NAME`.
- **Reusable pure verb functions already exist** (take `(services, opts)`, return plain
  data, no console I/O):
  - `src/gws/gmail.js`: `search(services,{query,max})`, `read(services,{id})`,
    `draft(services,{to,subject,body})`, `buildMime({to,subject,body,from})`.
  - `src/gws/calendar.js`: `list(services,{from,to,max})`, `show(services,{id})`.
  - `src/gws/drive.js`: `search(services,{query,max})`, `read(services,{id})`,
    `buildDriveQuery(term,{raw})`.
  - `src/gws/gmail.js` `send` exists but is **CLI-grant-coupled** (reads
    `config.yaml`); the broker's send path is NEW here (server-side self-resolve +
    injected grant check), it does NOT call `gmail.send`.
- **`src/gws/alert.js`** already resolves the self address via
  `services.gmail.users.getProfile({userId:'me'})` — reuse that pattern for
  `send_digest_to_self`.
- **CONFIRMED (wd-researcher, Claude Code CLI reference 2026-07-18):** MCP tools are
  named `mcp__<server>__<tool>` and advertised via `tools/list` with an `inputSchema`;
  the model reaches them only if the composition allowlists them (WP-141). The verb
  `name` here is the bare tool name (e.g. `gmail_search`); Claude Code prefixes the
  server name.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/gws/broker/verbs.js | the frozen verb table (name → {capabilityClass, inputSchema, limits, apiMethod, handler}) |
| create | src/gws/broker/schema.js | tiny pure JSON-shape validator (exact types, `additionalProperties:false`, required keys) — zero-dep, no ajv |
| create | src/gws/broker/limits.js | per-verb byte/count/rate caps + a per-run call counter |
| create | src/gws/broker/registry.js | `buildRegistry({services, selfAddress, grantCheck, limitsState})` → the `BrokerRegistry` WP-136 consumes; validates args, enforces limits, dispatches to the verb handler |
| create | tests/unit/broker-verbs.test.js | schema accept/reject per verb, exact API-method call assertions via a fake services, external-recipient rejection = zero calls, limit enforcement, unknown verb fail-closed |

### The verb table (exact, frozen)

Each entry: `{ name, capabilityClass, inputSchema, limits, apiMethod, handler(services, args, ctx) }`.
`apiMethod` is the human-readable exact Google method for the docs/evidence + the test
assertion; `handler` calls exactly that method (reusing the pure verb functions).

| verb | capabilityClass | inputSchema (all `additionalProperties:false`) | exact API method | limits |
|------|-----------------|-----------------------------------------------|------------------|--------|
| `gmail_search` | READ | `{query:string(≤512), max?:int 1..20}` | `gmail.users.messages.list` (+ per-hit `messages.get` metadata) | max results ≤ 20 |
| `gmail_read` | READ | `{id:string(≤128, [A-Za-z0-9_-])}` | `gmail.users.messages.get` (format full) | body returned capped ≤ 64 KB |
| `calendar_list` | READ | `{from?:iso, to?:iso, max?:int 1..20}` | `calendar.events.list` (primary) | max ≤ 20 |
| `calendar_show` | READ | `{id:string(≤1024)}` | `calendar.events.get` (primary) | — |
| `drive_search` | READ | `{term:string(≤512), raw?:bool, max?:int 1..20}` | `drive.files.list` | max ≤ 20 |
| `drive_read` | READ | `{id:string(≤128)}` | `drive.files.get`/`export` | text capped ≤ 256 KB |
| `create_draft` | DRAFT | `{to:string(≤320, no CR/LF), subject:string(≤512, no CR/LF), body:string(≤64 KB)}` | `gmail.users.drafts.create` | body ≤ 64 KB |
| `send_digest_to_self` | SEND | `{subject:string(≤512, no CR/LF), body:string(≤64 KB)}` — **NO recipient field** | `gmail.users.messages.send` (recipient = server-resolved self) | body ≤ 64 KB; grant-gated |

- **No `calendar_create_event` / delete / update verb exists** in v1 (ADR-0026 §2). The
  only calendar mutation is the interactive `cal add-event` CLI (WP-140), never a
  routine verb.
- **`send_digest_to_self` recipient is server-resolved**, never taken from args. Its
  schema has **no** `to`/`cc`/`bcc` field; `additionalProperties:false` rejects any
  address the model tries to supply → **zero API calls** (acceptance point 2). The
  handler resolves self via `services.gmail.users.getProfile({userId:'me'})`, builds
  the MIME with `gmail.buildMime` (CR/LF header-injection already rejected there,
  WP-085), and calls `messages.send`. It is **grant-gated**: the handler consults an
  injected `grantCheck(routineId, 'send_self')` and, if not allowed, returns a
  fixed-notice result and makes **zero send calls** (the grant store is WP-139; wiring
  is WP-141 — here `grantCheck` is injected and tests cover both branches).
- Every string field is validated for length and (for header fields) **no CR/LF**
  before any API call.

### `registry.js` — assembly

```js
/** Build the BrokerRegistry the WP-136 server consumes. Pure wiring: validates args
 *  against each verb's schema, enforces per-run limits, resolves the self address for
 *  send, checks the injected grant, and dispatches to the verb handler with the
 *  injected `services`. NEVER loads a credential (WP-138 supplies `services`) and NEVER
 *  reads config (WP-139/141 supply `grantCheck`).
 *  @param {{ services: {gmail:object,calendar:object,drive:object},
 *            routineId: string,
 *            grantCheck: (routineId:string, kind:string)=>boolean,
 *            limitsState?: object }} deps
 *  @returns {import('./server').BrokerRegistry} */
function buildRegistry(deps)
```

- `listTools()` returns the verbs allowed for this run (WP-141 filters by the routine's
  capability set; here return all defined verbs — filtering is the composition's job via
  `--allowedTools`, and the registry additionally refuses a `callTool` for a verb whose
  `capabilityClass` credential was not provided).
- `callTool(name, args)`:
  1. unknown verb → JSON-RPC-mappable error (fixed, secret-free), zero side effect.
  2. `schema.validate(verb.inputSchema, args)` fails → error, zero API call.
  3. `limits.check(name, limitsState)` exceeded → error, zero API call.
  4. SEND verb: `grantCheck(routineId,'send_self')` false → fixed "no grant; not sent"
     result, **zero send call**.
  5. call `verb.handler(services, args, ctx)`; a handler throw → fixed secret-free error
     (never the raw Google error, which can echo a token).

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-VERB-SET (recommend the table above).** The exact v1 verb set. Recommend exactly
  the eight verbs above — they cover the three shipped routines
  (daily-digest: `calendar_list`,`gmail_search`,`gmail_read`,`send_digest_to_self`;
  inbox-triage: `gmail_search`,`gmail_read`,`create_draft`;
  weekly-review: `create_draft` + vault read via `--add-dir`) with nothing extra. Drive
  verbs are included because the audit's example capability set lists them and they are
  read-only; the owner may drop `drive_*` from v1 if no routine uses them (leaner surface).
- **D-SEND-SCOPE (cross-ref WP-138) — RESOLVED (OWNER-APPROVED 2026-07-18):
  `gmail.send`.** `send_digest_to_self` uses the SEND capability class, which WP-138
  maps to `gmail.send` (the narrower scope). This WP only needs `messages.send` +
  `buildMime`, fully compatible with that choice.

## Implementation notes & constraints

- **Reuse, don't re-implement.** Read verbs call the existing `gmail.js`/`calendar.js`/
  `drive.js` pure functions with the injected `services`. Only the send path is new
  (self-resolve + grant + raw `messages.send`), because `gmail.send` is CLI-grant-coupled.
- **`schema.js` is a tiny hand-rolled validator** — no `ajv` (zero-dep). Support only
  what the schemas use: object with fixed keys, `additionalProperties:false`, per-key
  `type` (`string`/`integer`/`boolean`), optional `maxLength`, `min`/`max`,
  `pattern` (anchored), `required`. Reject anything unknown (fail closed).
- **Limits are per-run.** `limitsState` counts calls per verb across one broker process
  lifetime; exceeding a per-run call cap fails closed. This bounds a hijacked routine's
  blast radius (it cannot issue thousands of reads/drafts).
- **Never leak a raw Google error to the model.** A `googleapis` error can contain a
  token or a full request URL — map every handler error to a fixed message.
- **No credential, no config, no fs here.** The registry is pure wiring over injected
  deps. Keeps this WP disjoint from WP-138 (credentials) and WP-139 (grants).
- Zero deps, JSDoc only. When uncertain, choose simpler + record it.

## Security checklist

- [ ] Every verb maps to exactly one named Google method; there is no generic send,
      no delete/update, no arbitrary URL, no raw client. Every arg is validated
      server-side against an exact schema (`additionalProperties:false`) with byte/count
      caps before any API call. `send_digest_to_self` has NO recipient field and
      server-resolves self; an external recipient in the args is rejected by the schema
      with zero API calls. The send verb is grant-gated (injected check). A handler error
      never returns raw Google bytes to the model. An unknown verb / over-limit call
      fails closed with zero side effect.

## Acceptance criteria

- [ ] For each read verb, a valid call invokes exactly its `apiMethod` on the fake
      services and returns bounded data; an over-length/wrong-type arg is rejected with
      zero API call. (unit)
- [ ] `send_digest_to_self` with `{subject, body}` resolves self and calls
      `messages.send` to the self address; the SAME call with any `to`/`cc`/`bcc` present
      is schema-rejected and makes **zero** API calls. (unit — acceptance point 2)
- [ ] `send_digest_to_self` with `grantCheck` returning false makes **zero** send calls
      and returns the fixed no-grant notice. (unit — supports point 5)
- [ ] `create_draft` calls `drafts.create` (never `messages.send`); a CR/LF in `to`/
      `subject` is rejected (reuses `buildMime`'s assertion). (unit)
- [ ] Exceeding a per-run call cap fails closed with zero further API calls. (unit)
- [ ] An unknown verb name yields a fixed error and zero side effect. (unit)
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "broker-verbs"
npm test
npm run lint
node bin/wienerdog.js safety    # all five gates BLOCKED
```

## Out of scope (do NOT do these)

- Loading real credentials / scope split / granted-scope verification — **WP-138**.
- The grant store + TTY mutation + integrity — **WP-139** (here `grantCheck` is injected).
- `cal add-event` rename / calendar-write grant — **WP-140**.
- Writing `broker-mcp.json`, `--allowedTools`, the vault snapshot — **WP-141**.
- The poisoned-email E2E proof — **WP-142**. Opening any gate — never.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/137-broker-verb-registry`; conventional commits; PR titled
   `feat(gws): broker verb registry — fixed verbs, server-side schemas, limits (WP-137)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
