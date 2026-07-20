# ADR-0026: GWS capability broker — a credential-holding, per-job stdio broker behind fixed verbs

Status: Accepted
Date: 2026-07-18

> **Accepted 2026-07-18 (A2 owner walkthrough).** All eleven ADR-level `DECISION NEEDED`
> markers below were walked through with the owner one at a time and are recorded as
> dated `OWNER-APPROVED` resolutions. The WP-local markers remaining in the WP-136..
> WP-143 specs (D-VERB-SET, D-TOKEN-MIGRATION, D-STORE-INTEGRITY, D-ADDEVENT-DEGRADE,
> D-CAL-ATTENDEES, D-BROKER-CONFIG-PATH, D-SKILL-REWRITE-OWNER, D-E2E-GATE-CROSSREF,
> D-CLAIM-WORDING, D-VERIFY-FIGURES) resolve in the per-ticket walkthroughs before each
> spec flips to `Ready` (the A1/A5 lifecycle,
> `docs/security-audit/2026-07-15/WORKING-NOTES.md`).
>
> Load-bearing runtime facts here are from the 2026-07-18 wd-researcher pass
> (official Claude Code CLI reference + Google OAuth docs, fetched that day).
> `CONFIRMED` = primary-source-verified; `SPIKE` = a named unresolved item a WP
> must de-risk with a live measurement before it can move to `Ready`.

## Context

Wienerdog's Google Workspace surface (`src/gws/**`, the `wienerdog gws` CLI) is
today a set of thin JS wrappers over `googleapis`, authenticated by **one combined
OAuth token** at `~/.wienerdog/secrets/google-token.json`. That token carries the
scopes `gmail.readonly`, **`gmail.compose`** (send-capable at the Google layer),
**`calendar`** (full read-write), and `drive.readonly` (`src/gws/client.js` `SCOPES`).
The send-grant control (ADR-0007) lives **only inside the CLI wrapper**
(`src/gws/grant.js` `isSendAllowed`, consulted by `src/gws/gmail.js` `send`); the
credential itself is strictly more powerful than the wrapper exposes.

The 2026-07-15 security audit (action **A2**, deep-dive `04-gws-grants.md`) found
that the grant model is a property of the **CLI wrapper**, not of the **credential**
or the **OS boundary**. Its concrete findings:

- **F1 (HIGH):** any process running as the user can read the 0600 token and call
  `gmail.users.messages.send` / `calendar.events.delete` **directly via
  `googleapis`**, never touching `isSendAllowed`. The read/write split is not real
  at the API layer — `gmail.compose` authorizes send and full `calendar` authorizes
  delete/update.
- **F2 (HIGH):** the send grant is an **unauthenticated plaintext YAML fact** in
  `~/.wienerdog/config.yaml`; `saveGrant` is exported and even re-syncs the install
  manifest hash, so a programmatic forge is internally consistent and
  `doctor`-invisible. A same-user actor can mint a grant with a file write.
- **F3 (MEDIUM):** `cal draft-event` is a **live** `events.insert` (a mutation, not
  a "draft"), ungated; full `calendar` scope makes delete/update reachable by direct
  token use.
- **F4 (MEDIUM):** routine brains ran **unsandboxed** (the A1 defect — closed by
  ADR-0025 for containment, but the credential surface remained).
- **F5 (LOW):** `--routine` / `WIENERDOG_JOB` is self-asserted; any caller can borrow
  another routine's grant.

A1 (ADR-0025) contained the **model-selectable** surface: a hijacked routine brain
now gets `--tools Read` only, no Bash/WebFetch/WebSearch, a staging-only writable
root, and **exactly one** absolute-path local broker MCP (or none). A1 explicitly
left the broker as a **seam**: `src/core/routine-runtime.js` composes a routine run
with a single broker MCP config expected at `<core>/runtime/broker-mcp.json`; absent
→ a broker-requiring routine (`daily-digest`, `inbox-triage`) **fails closed** (no
`--mcp-config` → `RuntimeProfileError`). **A2 fills this seam.**

**IRON RULE (ADR-0004): Wienerdog is just files — no daemons, servers, or
telemetry.** The broker is therefore **not** a service. It is a **per-job stdio
child**: an MCP server that `claude -p` spawns for the duration of one routine run,
communicating over stdin/stdout, dying when the routine process exits. It has no
listener, no port, no persistence, and never outlives its job — the same discipline
`src/gws/auth.js`'s loopback listener already follows ("No socket may outlive the
command (ADR-0004)"). **SPIKE (stdio-lifecycle):** Claude Code's official docs do
**not** state that a stdio MCP child is killed on normal exit / parent SIGTERM /
parent crash, and there are open orphaned-child bug reports
(`anthropics/claude-code#1935`, `#15211`; spurious-SIGTERM `#40207`). Because this is
load-bearing for ADR-0004, WP-136 MUST prove the lifecycle with a **live self-check**
(PID-file + trap probe: broker gone after normal exit, after parent kill, after
parent crash) — the WP-135 runtime-self-verification precedent — and, if the runtime
orphans the child, add a supervisor-side reap so no broker outlives its job.

**Zero runtime dependencies except `googleapis`** (the single ADR-approved
exception; ADR-0013). The MCP stdio server side is therefore **hand-rolled
plain-Node JSON-RPC over stdio** — no `@modelcontextprotocol/sdk`. MCP's stdio
transport is a small, stable JSON-RPC 2.0 subset (`initialize`, `tools/list`,
`tools/call`), well within a bounded hand-rolled implementation (§Decision.1;
D-SDK-EXCEPTION records the option to reconsider).

**Boundary hand-offs restated (so no WP overclaims):**

- **A5 (ADR-0024) explicitly did NOT touch `secrets/`, tokens, or grants.** Its
  scope boundary states: "WP-126 explicitly does not touch `secrets/` … the GWS
  grant/token files … those are A9." A5 also deferred exact-value matching of
  Wienerdog-known OAuth/client credentials to **A2** — "the GWS broker, the one
  component that legitimately holds those bytes, applies it on its own output path."
  So token/grant handling is **A2/A9 territory**; A2 owns the credential and grant
  mechanics, and applies the known-credential redaction on the broker's own output
  path. A9 owns the broader private-mode policy sweep and log rotation.
- **A7 owns executable/scheduler integrity.** The broker records nothing about the
  `claude` binary's authenticity; a fake `claude`/`node` on PATH is A7's boundary.
- **A12 owns arbitrary same-user native code.** The broker constrains the **model**
  (no token bytes, no raw client, fixed verbs); it does **not** and cannot constrain
  native code already executing as the user, which can read the same tokens.

## Decision

Put all Google credential handling behind a **local, per-job, stdio capability
broker** that the model reaches only through **fixed verbs**. The model never sees a
token path/value, a raw HTTP/Google client, or a generic send; and a routine's
identity/capability is fixed by a **trusted launch descriptor** written by
`run-job`'s code path, never by model-suppliable input.

### 1. Broker transport — a hand-rolled MCP stdio server (WP-136)

A new `src/gws/broker/` package. `server.js` implements an MCP stdio server as
plain-Node JSON-RPC 2.0 over stdin/stdout: the `initialize` handshake, `tools/list`
(advertising the fixed verb schemas), and `tools/call` (dispatch to a verb handler).
It takes an injected **verb registry**, reads/writes the framed message stream
(`protocol.js`), starts no listener, and exits on stdin EOF / parent exit.
`constants.js` defines the shared broker **capability classes** consumed by
WP-137/WP-138.

**CONFIRMED (Claude Code CLI reference, 2026-07-18):**
- `--strict-mcp-config` makes `--mcp-config` **exclusive** ("only use MCP servers
  from `--mcp-config`, ignoring all other MCP configurations"). `--mcp-config` alone
  is **additive** to ambient sources — so the routine composition MUST pass **both**
  `--strict-mcp-config` **and** `--mcp-config <absolute broker path>` (WP-131 already
  does; the dream stays `--strict-mcp-config` with no `--mcp-config` = zero servers).
- MCP tool names are `mcp__<server-name>__<tool-name>`; they are allowlisted in
  **`--allowedTools`** (exact names or `mcp__<server>__*`). **`--tools` governs
  BUILT-IN tools only and does not constrain MCP tools.** So the routine composition
  must **explicitly `--allowedTools` the exact broker verb names** (WP-141 extends the
  composer). Headless (no TTY) blocks any unlisted tool; MCP tools flagged
  `requiresUserInteraction` are denied headlessly even when allowlisted (the broker's
  verbs must not be flagged interactive).

**SPIKE (mcp-framing):** the exact stdio framing (newline-delimited JSON-RPC vs
LSP-style `Content-Length` headers) is not doc-stated — WP-136 measures it against the
real `claude -p` before locking the wire format. **SPIKE (permission-modes):** the
"exact `--allowedTools` + a non-asking permission mode" headless pattern is
secondary-sourced — WP-141 confirms the permission-mode value against
`code.claude.com/docs/en/permission-modes` before it lands in the composer. **SPIKE
(env-inheritance):** whether the stdio child gets full parent-env passthrough vs a
stripped subset is undocumented — WP-136 dumps the broker's `process.env` under the
real composition; the design must **not rely on env inheritance either way** (the
broker declares everything it needs explicitly and treats parent env as
potentially-leaking).

### 2. Fixed verbs — server-side schemas, limits, exact API-method allowlist (WP-137)

`src/gws/broker/verbs.js` is the **one** place a broker verb is defined. Each verb is
a frozen record: `{ name, capabilityClass, inputSchema, limits, apiMethod }`. The
verb set is exactly:

- **read (`READ` credential):** `gmail_search` → `gmail.users.messages.list`
  (+metadata get), `gmail_read` → `gmail.users.messages.get`, `calendar_list` →
  `calendar.events.list`, `calendar_show` → `calendar.events.get`, `drive_search` →
  `drive.files.list`, `drive_read` → `drive.files.get`/`export`.
- **draft (`DRAFT` credential, `gmail.compose`, broker-only):** `create_draft` →
  `gmail.users.drafts.create` (drafts never leave the account — ungated, safe).
- **send (`SEND` credential, broker-only):** `send_digest_to_self` →
  `gmail.users.messages.send` with the recipient **resolved server-side** to the
  authenticated self address (**zero address input**; §4).
- **calendar write (`CALENDAR_WRITE` credential, broker-only):** intentionally **not
  exposed as a routine verb in v1** — no shipped routine creates events; the
  interactive `cal add-event` CLI (WP-140) is the only calendar-mutation surface,
  behind an explicit write grant.

Each verb validates its arguments against a **server-side JSON schema**
(`additionalProperties:false`, exact types) and enforces **byte/count/rate limits**
(max results, body-byte caps, per-run call caps). There is **no** generic
`messages.send`, no delete/update, no arbitrary URL, and no raw client surface. Verb
handlers reuse the existing pure verb functions where they are already safe
(`gmail.js` `search`/`read`/`buildMime`, `calendar.js` `list`/`show`, `drive.js`
`search`/`read`), taking an injected `services` object (WP-138 supplies the real,
per-capability one; tests supply a fake factory, as `getServices` already allows).

### 3. Least-scope credentials + granted-scope verification (WP-138)

The single combined token is **split by capability** into broker-only credentials,
each obtained by its own consent and stored 0600, separately (D-CRED-STORAGE):

- **READ:** `gmail.readonly`, `calendar.events.readonly`, `drive.readonly`.
- **DRAFT:** `gmail.compose` (broker-only; drafts).
- **SEND:** `gmail.send` (broker-only; send-to-self) — see D-SEND-SCOPE.
- **CALENDAR_WRITE:** `calendar.events` (broker-only; `cal add-event`).

`src/gws/broker/credentials.js` loads **only** the credential required by a verb's
`capabilityClass` and **verifies the actual granted scope set** before use; the model
never receives any credential.

**CONFIRMED (Google OAuth docs, 2026-07-18):**
- One OAuth client can hold **multiple independent refresh tokens** with different
  scope sets (separate consent flows → separate token files). Cap: 100 tokens per
  account per client (oldest silently invalidated) — three/four broker credentials
  are fine.
- **Scope-bleed:** with `include_granted_scopes=true`, a later consent flow **merges
  previously granted scopes** into the new token, defeating the split when one
  `client_id` is reused. Every broker consent flow MUST pass
  **`include_granted_scopes: false`** and then **verify the actual granted scopes**
  post-flow. (`src/gws/auth.js` today omits the param; the vendored-library default is
  a SPIKE — WP-138 measures it and sets it explicitly regardless.)
- **`gmail.compose`** ("Manage drafts and send emails") is **send-capable**; there is
  **no** draft-only Gmail scope. **`gmail.send`** is strictly narrower (authorizes
  `messages.send` but **not** `drafts.create`; classified Sensitive vs
  compose/readonly's Restricted). So `send_digest_to_self` should use **`gmail.send`**
  (raw MIME built broker-side) and `create_draft` uses `gmail.compose` (D-SEND-SCOPE).
- **Granted-scope verification** is reliable via `OAuth2Client.getTokenInfo(accessToken)`
  → `scopes[]` (tokeninfo). WP-138 does an **exact subset check per credential at
  load** (audit acceptance point 7): the loaded credential's live scopes must be
  exactly the least-scope set the capability class requires — a superset (scope bleed)
  or a missing scope **fails closed**.
- **`calendar.events` allows `events.delete`; there is no insert/update-only Calendar
  scope.** Delete-prevention therefore comes **only** from the broker's verb/method
  allowlist, **not** from the scope choice — stated so nobody assumes the scope swap
  closes the delete path. The `calendar.events.readonly` READ credential **cannot
  mutate at all** (that is what closes F1/F3's delete-via-read-token path);
  `drive.readonly` (not `drive.metadata.readonly`) is required to download content.

### 3a. Testing-mode 7-day refresh-token expiry (WP-138 + WP-143) — a posture concern, not just a broker detail

**CONFIRMED (primary Google doc, 2026-07-18):** an OAuth consent screen in **"Testing"
publishing status** issues refresh tokens that **expire in 7 days** for Restricted
scopes (Gmail read/compose, `drive.readonly`). This affects the **whole unattended-GWS
posture** independent of the broker: a testing-mode token dies weekly, so nightly
routines would silently go dark. The design MUST:

- emit a **loud, fail-closed, distinct alert** — "Google refresh token expired
  (testing-mode 7-day limit) — re-run `wienerdog gws auth`" — never a silent failure,
  when a credential load fails on an expired/revoked refresh token; and
- follow **D-TESTING-MODE — RESOLVED (OWNER-APPROVED 2026-07-18): the per-user
  non-Testing client posture.** Wienerdog's model is already one self-created OAuth
  client per user; the documented recommended setup is to flip that client's consent
  screen OUT of "Testing" ("In production", left unverified) — field-confirmed practice
  for personal Google CLIs (2026-07-18 owner evidence): no 7-day refresh-token expiry,
  the unverified-app consent warning is a one-time click-through, and the 100-user cap
  is irrelevant because every install runs its own client. **SPIKE
  (production-unverified-restricted):** primary-source-confirm (the official
  restricted-scope-verification page + a live check on a real client) that this holds
  for the Restricted scopes; the CASA cost figures stay secondary-sourced/advisory.
  Weekly re-auth is documented ONLY as the fallback limitation for clients left in
  Testing; the loud fail-closed expiry alert ships regardless (it also covers
  revocation). Full CASA verification is out of scope — relevant only if a
  shared/hosted client were ever offered. This deserves its own THREAT-MODEL/runbook
  treatment (WP-143).

### 4. Default unattended send = `send_digest_to_self` (WP-137, ADR-0007)

The only unattended send verb takes **no recipient argument**; the broker resolves the
recipient to the authenticated self address (`gmail.users.getProfile` → `me`). An
external recipient supplied in the arguments **fails schema validation** and makes
**zero API calls**. Third-party unattended send stays **disabled** — it requires a
separate decision and a stronger grant design (ADR-0007's third-party posture,
unchanged).

### 5. Canonical broker-owned grant store — TTY-only, integrity fail-closed (WP-139)

The send grant moves out of the free-form `config.yaml` managed-YAML block into a
**canonical broker-owned store** `~/.wienerdog/state/broker-grants.json` (0600,
outside the model's write surface), mirroring the ADR-0021 identity trust registry: a
code-owned JSON with an **exact-byte integrity marker**. Only the interactive TTY-only
`wienerdog grant` path (the ADR-0007 typed-word confirmation, no `--yes`/env/headless
bypass) may mutate it. At broker send time an **integrity mismatch fails closed** and
emits a **fixed, secret-free alert**; a grant-store bit flip therefore causes **no**
draft/send/calendar write. The old YAML grant block is retired.

### 6. `cal draft-event` → `cal add-event`, behind a write grant (WP-140)

The interactive CLI verb is renamed to reflect that it creates a **live event** (F3),
and every calendar mutation (CLI and any future broker verb) is placed behind an
**explicit calendar-write grant** and the `CALENDAR_WRITE` credential. The read path
uses `calendar.events.readonly` and cannot mutate at all.

### 7. Trusted launch descriptor + broker wiring (WP-141)

`run-job`'s code path writes the **per-run broker MCP config** at the WP-131 seam,
embedding the routine's identity/capability profile in the **broker's spawn argv**
(the trusted launch descriptor) — the broker learns "I am `daily-digest`" from
Wienerdog's code, never from a model-suppliable flag or env var (closes F5; the SPIKE
env-inheritance result cannot make this less trustworthy because identity is argv, not
env). The composer additionally emits **`--allowedTools mcp__<broker>__<verb>`** for
exactly the routine's verbs (CONFIRMED: `--tools` does not constrain MCP tools), sets a
**per-server `timeout`** in the MCP config for slow Google calls (honored since Claude
Code 2.1.203/2.1.206), and sets **`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0`** (2.1.212) so
a >2-min MCP call does not auto-background and the `run-job` supervisor stays the single
timeout authority. The routine profile's MCP posture flips `broker` on for the routines
that need it (`daily-digest`, `inbox-triage`, and `weekly-review` for its draft), and
the routine's bounded **read-only vault snapshot** (deferred from WP-131
D-ROUTINE-VAULT-READ) is copied into a staging subdir added read-only via `--add-dir`.
(Routines cannot spawn subagents — `Task`/`Agent` are in the A1 deny list — so the
pre-2.1.177 "subagent `disallowedTools` ignored" bug is not reachable; WP-142 adds an
explicit negative assertion that no subagent MCP path exists.)

### 8. Containment proof — live negative + E2E poisoned-email (WP-142)

A2 owns the **end-to-end containment proof deferred from A1/WP-133** (WP-133
D-HARNESS-ROUTINE-EXEC): the full `run-job` wrapper poisoned-email E2E — clean env +
WP-132 preflight + vault snapshot + broker — exercised via the `allowAll()` code seam.
It proves a poisoned email cannot send externally, mutate/delete calendar data, or
exceed the routine's Drive/Gmail operation set; that the broker tool-to-method mapping
is exact (no generic send/delete/URL/raw client); that an external recipient to
`send_digest_to_self` makes zero API calls; that a read-only credential fails
send/delete; and that a grant-store bit flip fails closed. It also asserts the
**stdio-lifecycle** self-check (§1 SPIKE) — the broker leaves no orphan. This is a
**REQUIRED gate-opening precondition** — but **A2 opens NO gate**: the proof runs, and
`wienerdog safety` still shows all five gates BLOCKED after every A2 WP. The gate opens
only later (P1 + a clean-commit audit rerun + an explicit human go, per the ACTION-LIST
header).

### 9. Honest product claims + docs (WP-143)

`THREAT-MODEL.md`, `GLOSSARY.md`, README/VISION, and a new `docs/runbooks/gws-broker.md`
are updated to state the true boundary: the broker constrains the **model/CLI path** to
fixed verbs and least-scope credentials; arbitrary same-user native code is outside this
boundary (A12) unless a separate OS identity/user-presence design is adopted;
`gmail.compose` is send-capable; `cal add-event` is a live mutation; the grant store is
tamper-evidence between attended actions, not an OS boundary; and the testing-mode
7-day refresh-token limitation (§3a).

## Boundary statement (the A2 residual)

The broker makes the **model** unable to reach Google except through fixed,
schema-validated, least-scope, grant-gated verbs, and unable to read a token/client/
grant byte or start `googleapis` directly (combined with A1's `--tools Read` +
staging-only writes). The **real** containment of a hijacked routine is the union of
**A1** (no Bash/write/network for the model) and **A2** (no raw credential, fixed
verbs). The grant store's integrity marker and the broker's server-side checks are
**tamper-evidence and defense-in-depth**, honest between attended human actions — they
are **not** an OS security boundary: an actor already executing as the user can read
the same 0600 tokens and rewrite the same 0600 store regardless of any marker (F1/F2's
core truth, ACTION-LIST A12). A2 defends against a **hijacked model** steered by
untrusted email/Drive content, which is the audited threat — not against arbitrary
same-user native malware.

## Consequences

- Every Google effect a routine can cause is enumerable in `verbs.js` and gated by a
  server-side schema, a least-scope credential, and (for send/mutate) a TTY-minted
  grant. Adding a capability is a reviewed code change to the verb table + a credential
  class + (if outbound) a grant kind — there is no generic path.
- Routine skills that today shell out to `wienerdog gws …` (Bash) no longer can (A1
  removed Bash); their Google work flows through broker verbs. The three shipped routine
  `SKILL.md` bodies are **rewritten** for the broker verbs in WP-141/WP-143 — not in the
  earlier WPs (they stay byte-frozen under A1's integrity digest until the broker exists).
- The combined token is replaced by least-scope tokens; a one-time migration (or
  re-consent) applies, and `wienerdog gws auth` runs one consent flow per credential.
- Unattended routines are subject to Google's testing-mode 7-day refresh-token expiry
  until app verification (§3a) — documented as a v1 limitation with a loud fail-closed
  expiry alert.
- A2 opens no gate: the broker is built and proven but unreachable in production until
  the gate-open decision. `wienerdog safety` stays all-five-BLOCKED.

## Open decisions (DECISION NEEDED — resolved in the WP walkthroughs)

1. **D-SDK-EXCEPTION — RESOLVED (OWNER-APPROVED 2026-07-18): hand-roll.** The MCP stdio
   server is hand-rolled plain-Node JSON-RPC 2.0 (no `@modelcontextprotocol/sdk`): the
   zero-runtime-dependency invariant holds, the supply-chain surface of the
   security-critical component stays minimal, and the needed surface is a bounded
   three-method subset. Accepted risk: we own protocol drift if MCP changes — mitigated
   by the mcp-framing SPIKE pinning the measured wire format before WP-136 goes Ready and
   by WP-142's live proof. Reopen only if the required protocol surface grows materially.
   **Owner-mandated drift posture (2026-07-18):** if a live MCP protocol change breaks
   the hand-rolled transport, the recorded fallback is to REOPEN this decision and adopt
   `@modelcontextprotocol/sdk` as a second ADR-0013 runtime-dep exception (the transport
   collapses to a thin adapter). Drift must be **detectable, not inferred**: the WP-136
   transport validates the negotiated `protocolVersion` against a code-owned supported
   set (unsupported → fixed, distinct, fail-closed + fail-loud "MCP protocol version
   mismatch" error), flags an unrecognized pre-handshake framing as a distinct "possible
   MCP protocol change" error, and the golden-frame-vs-live differential (recorded
   handshake goldens green + live handshake red ⇒ drift; goldens red ⇒ our regression)
   is the programmatic discriminator between protocol drift and our own bug.
2. **D-BROKER-LAUNCH — RESOLVED (OWNER-APPROVED 2026-07-18): the hidden subcommand.**
   The broker is spawned as `node <wienerdogBin> gws _broker --routine <id>` via the
   scheduler generators' `gen.nodePath()` + `gen.wienerdogBin(paths)`, reusing the
   ADR-0013 vendored install's stable `app/current` entry so a `wienerdog update`
   repoints it automatically (the `gws _alert` hidden-subcommand precedent,
   run-job.js). A standalone script was rejected: it would duplicate path/vendoring
   logic and could go stale after an update.
3. **D-DESCRIPTOR — RESOLVED (OWNER-APPROVED 2026-07-18): the per-run argv descriptor.**
   The broker learns its routine identity from `--routine <id>` embedded in its spawn
   argv by the per-run generated broker MCP config, which `run-job`'s code path writes
   under `core/runtime/` — outside the model's write surface (the staging dir is the
   model's only writable root under A1), so the model can neither write nor override
   the descriptor; this closes F5. A static config + env var was rejected: stdio-child
   env inheritance is an unresolved SPIKE the design must not rely on, and env is the
   ambient, self-asserted channel F5 exists to eliminate. The env-inheritance SPIKE's
   outcome cannot weaken this — identity is argv, not env.
4. **D-CRED-STORAGE — RESOLVED (OWNER-APPROVED 2026-07-18): separate files.** Four
   separate 0600 token files (`secrets/google-token-read.json`, `-draft.json`,
   `-send.json`, `-calendar.json`): least privilege at the file level (a read-only code
   path never opens the send token — assertable in tests and the WP-142 canary checks),
   isolated blast radius (one credential's corruption/rotation/re-consent touches one
   file), cleaner migration. The single sectioned file was rejected: every load would
   read all credentials' bytes and a partial write would corrupt all four.
5. **D-SEND-SCOPE — RESOLVED (OWNER-APPROVED 2026-07-18): `gmail.send`.**
   `send_digest_to_self` runs on the strictly narrower `gmail.send` (authorizes
   `messages.send` only — cannot create drafts or read; Sensitive, not Restricted); the
   broker builds the raw MIME itself. Drafting stays on the separate DRAFT credential
   (`gmail.compose`). Accepted cost: two Gmail consent flows — the least-privilege gain
   is the point.
6. **D-OAUTH-CLIENT-COUNT — RESOLVED (OWNER-APPROVED 2026-07-18): one client + N tokens
   for v1.** All four consent flows run against the ONE user-created OAuth client
   (creating a Cloud Console client is already the most painful GWS setup step;
   multiplying it by four is a real UX cost). Accepted and documented limitation:
   Google-side revocation is believed to be per-app (per `client_id`) — "Remove access"
   kills ALL four tokens, so per-capability Google-side revocation is not possible
   (SECONDARY-SOURCED, the revocation-granularity spike; WP-143 documents it as
   all-or-nothing). Local mitigation exists regardless: revoking the grant / deleting a
   token file disables that capability broker-side. Revisit with N separate client IDs
   only if per-capability revocation becomes a requirement.
7. **D-TESTING-MODE — RESOLVED (OWNER-APPROVED 2026-07-18): the per-user non-Testing
   client posture** (full text in §3a): the documented recommended setup is the user's
   own OAuth client flipped out of "Testing" (unverified "In production" — no 7-day
   expiry; the 100-user cap irrelevant with one client per install; field-confirmed
   practice), with the production-unverified-restricted SPIKE confirming it for the
   Restricted scopes, weekly re-auth documented only as the Testing-mode fallback, the
   loud fail-closed expiry alert shipping regardless (WP-138), and CASA verification out
   of scope.
8. **D-GRANT-MIGRATION — RESOLVED (OWNER-APPROVED 2026-07-18): require a fresh TTY
   re-grant, no import.** An existing config.yaml YAML grant is never imported into the
   store — importing would launder a potentially forged, unauthenticated YAML fact (the
   exact F2 primitive) into the trusted store, and the store's ONLY author stays the
   interactive TTY grant path. Cost is negligible: GWS is frozen and the user base is a
   handful of installs at most (owner assessment 2026-07-18), mostly future fresh
   installs. Mechanism: detect the legacy YAML grant, print a one-time "grant model
   changed — re-run `wienerdog grant`" notice, retire the YAML block.
9. **D-VAULT-SNAPSHOT — RESOLVED (OWNER-APPROVED 2026-07-18): fixed slices + caps +
   visible skip.** Per-routine fixed slices: daily-digest → the single newest
   `reports/dreams/*.md`; weekly-review → the last 7 `07-Daily/*.md` + last 7
   `reports/dreams/*.md`; inbox-triage → none. Hard caps: ≤ 32 files, ≤ 2 MB total,
   ≤ 256 KB per file (the WP-118 bounded-intake discipline; set ~100× above realistic
   legit sizes — a fail-safe against pathological/poisoned content, cost blowups and
   exfil surface, never a constraint a legit power user meets). **Owner-mandated
   exceed behavior (2026-07-18): an over-cap file is SKIPPED, never silently** — the
   skip is recorded in the WP-132 run evidence AND surfaced to the owner on the next
   digest via the existing state-driven warning-banner mechanism (the WP-125
   exclusion-banner precedent). Failing the whole run for one oversized note was
   rejected as too harsh; silent skip as unexplainable.
10. **D-E2E-BROKER — RESOLVED (OWNER-APPROVED 2026-07-18): fake-Google for the required
    negative proof; the live self-send positive is OPTIONAL at A2 and becomes a REQUIRED
    gate-open precondition.** The containment proof runs against a fake-Google backend
    that records every attempted API method (proving the model cannot even ISSUE a
    disallowed verb — deterministic, no real mail, no live 7-day-expiring credentials).
    The live self-send positive check (one real `send_digest_to_self` email proving the
    real-Google happy path: token chain, self-address resolution, MIME acceptance) is a
    documented optional manual step during A2 (it can piggyback on the WP-138/WP-143
    live OAuth spikes) and is REQUIRED before the eventual `external-content-routine`
    gate-open decision — recorded with the other gate preconditions (P1 + audit rerun +
    explicit go). Its failure mode is functional, never containment evidence.
11. **D-CAL-WRITE-GRANT — RESOLVED (OWNER-APPROVED 2026-07-18): a distinct
    `kind:'calendar_write'` in the same store.** Same store, same exact-byte integrity
    discipline, same TTY-only mutation path — but its own record type: a pure per-routine
    on/off with no recipient concept (the send grant's `to` allowlist is meaningless for
    calendar writes, and reusing it would give an empty field special implicit meaning).
    Distinct kinds structurally guarantee the two capabilities never imply each other.

**Named SPIKEs (a WP must de-risk each with a live measurement before `Ready`):**
mcp-framing (WP-136), stdio-lifecycle (WP-136), env-inheritance (WP-136),
permission-modes value (WP-141), `include_granted_scopes` library default (WP-138),
production-unverified-restricted (WP-143 — confirm the unverified "In production"
posture removes the 7-day expiry for the Restricted scopes; §3a),
Restricted-scope verification cost/process (WP-143 docs; advisory only).

## Alternatives considered

- **Keep the CLI grant + move it to `secrets/` + add a MAC.** Rejected by the audit
  (F2): a MAC readable/writable by the same shell-capable actor is not a boundary. The
  usable design requires the model to have no raw credential at all — a broker.
- **Reduce scopes only (no broker).** Rejected: `gmail.compose` authorizes send and
  there is no draft-only Gmail scope, so scope reduction alone cannot replace the broker
  for the send path (04-gws-grants consensus).
- **Take `@modelcontextprotocol/sdk`.** Deferred to D-SDK-EXCEPTION; default is
  hand-roll to preserve the zero-runtime-dep invariant.
- **Run the broker as a long-lived local service.** Rejected: violates ADR-0004. The
  broker is a per-job stdio child that dies with the routine (proven by the WP-136
  lifecycle self-check).
- **Build the broker inside A1.** Rejected there (ADR-0025): coupling the credential
  boundary to the containment boundary; A1 left the seam, A2 fills it.

## Amendments

### Amendment 1 (2026-07-20) — server-side per-verb allowlist + the broker is dual-gated behind `gws-use`

The 0.10.0 un-freeze double-gate review surfaced two hardening items on the shipped
broker:

1. **Server-side per-verb allowlist.** `buildRegistry` advertises `Object.values(VERBS)`
   (all verbs) and `callTool` dispatches any `VERBS[name]` whose class credential
   loaded — the per-verb restriction is ONLY client-side (`--allowedTools
   mcp__wienerdog-broker__<verb>`). No escalation today, but a future *mutating* verb
   added to an already-loaded capability class would be executable server-side without
   a code review of the routine's `brokerVerbs`. **Decision:** `buildRegistry` takes
   `allowedVerbs = profile.brokerVerbs`; `listTools` advertises and `callTool`
   dispatches ONLY those verbs (an undeclared verb → "unknown broker verb", zero side
   effect). The client-side allowlist stays; this is redundant defense-in-depth on the
   authoritative (server) side.

2. **The broker is dual-gated: `external-content-routine` AND `gws-use`.** Today the
   broker's reachability is governed only by `external-content-routine` (upstream:
   `run-job` refuses to compose a routine while it is blocked); `gws-broker.js` never
   calls `requireCapability(GWS_USE)`, so the `gws-use` description ("reading or
   sending Gmail, Calendar, and Drive is disabled") overclaims relative to the broker.
   **Decision:** `gws-broker.js` calls `requireCapability(GWS_USE)` at startup (fail
   closed before any MCP byte). Routine Google access now requires BOTH gates —
   semantically honest (the broker IS the routine Gmail/Cal/Drive path) and
   defense-in-depth against a future partial un-gate (a release that opened
   `external-content-routine` but kept `gws-use` closed would still deny routine Google
   access). In the 0.10.0 flip both gates open together, so this changes nothing
   functionally now; it fixes the mapping and the description overclaim without editing
   `safety-profile.js`.

Implemented by **WP-broker-verb-allowlist-and-gws-gate**.
