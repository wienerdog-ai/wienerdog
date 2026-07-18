---
id: WP-139
title: Canonical broker-owned grant store — TTY-only mutation, exact-byte integrity fail-closed, retire the config.yaml YAML block (audit A2)
status: In-Review
model: opus
size: M
depends_on: [WP-136]
adrs: [ADR-0007, ADR-0021, ADR-0026]
branch: wp/139-broker-grant-store
---

# WP-139: Canonical broker-owned grant store — TTY-only mutation, exact-byte integrity fail-closed, retire the config.yaml YAML block (audit A2)

## Context (read this, nothing else)

Wienerdog installs files. **IRON RULE (ADR-0004): Wienerdog is just files** — no
daemons/servers/telemetry. Node ≥ 18, zero runtime deps (only `googleapis`), JSDoc
types, no build step.

A **send grant** (GLOSSARY; ADR-0007) is the `(routine, recipient-allowlist)`
permission that lets a routine send outbound email. Today it lives in a comment-fenced
**managed-YAML block** inside `~/.wienerdog/config.yaml`, parsed/written by
`src/gws/grant.js`. The 2026-07-15 audit (action **A2**, `04-gws-grants.md` F2) found
this is an **unauthenticated plaintext YAML fact**: `saveGrant` is exported and even
re-syncs the install-manifest hash, so any same-user process (or a hijacked agent with a
file write) can forge a grant the CLI then honors, bypassing the typed-word confirmation;
`doctor` performs no integrity check.

ADR-0026 replaces it with a **canonical broker-owned grant store** — a 0600 JSON file
outside the model's write surface, with an **exact-byte integrity marker**, mutated
**only** by the interactive TTY-only `wienerdog grant` path, and read by the broker with
a **fail-closed integrity check** (a bit flip → no draft/send/calendar write + a fixed
alert). This mirrors the **identity trust registry** (ADR-0021): self-recorded hashes in
an attacker-writable core are **tamper-evidence between attended human actions, not an OS
boundary** — the real containment that a hijacked *model* cannot forge a grant is A1 (the
routine has `--tools Read`, staging-only writes, no Bash) + A2 (no raw credential). State
this honestly; do not overclaim (F2's core truth: a same-user *native* actor can rewrite
the store regardless — A12).

**WP-137** defined the broker's `send_digest_to_self` verb as grant-gated via an
**injected** `grantCheck`. This WP provides the store + the real `grantCheck` + the
TTY-only mutation CLI. **WP-141** wires the store's `grantCheck` into the running broker.

**A2 opens NO capability gate.** `gws-use` stays BLOCKED. `wienerdog safety` shows all
five BLOCKED after this WP.

## Current state

- **`src/gws/grant.js`:** `BEGIN`/`END` sentinels, `parseGrants(configText)`,
  `renderConfigWithGrants`, `saveGrant(paths, grant)` (writes config.yaml + re-syncs the
  manifest hash — **the F2 defect**), `findGrant(paths, routine)`, and the pure
  `isSendAllowed(grant, recipients)` (fail-closed exact-address allowlist — this ENFORCEMENT
  decision is good and is REUSED).
- **`src/cli/grant.js`:** `wienerdog grant send --routine --to` — the TTY-only typed-word
  confirmation (`/dev/tty`, no `--yes`/env bypass; WP-086) → calls `grantLib.saveGrant`.
- **`src/core/identity-approvals.js`** (ADR-0021, WP-116) is the PRECEDENT: a 0600 JSON
  registry in `state/`, exact-byte `sha256`, atomic temp+rename+chmod via `private-fs`,
  mutated only by the attended path. Follow its shape.
- **`src/core/private-fs.js`:** `mkdirPrivate(dir)` (0700), `writeFilePrivate(dest, data)`
  (atomic temp+rename+chmod 0600). Use these.
- **`state/broker-grants.json`** does not exist — you create it.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/gws/broker/grant-store.js | the canonical 0600 store: read/write, exact-byte integrity marker, `grantCheck(routineId, kind)` fail-closed reader, TTY-only `putGrant` |
| modify | src/cli/grant.js | mint grants into the new store (send-self + calendar-write kinds); keep the TTY typed-word confirmation; add `wienerdog grant calendar-write --routine`/CLI-scope |
| modify | src/gws/grant.js | retire the config.yaml YAML block (drop `saveGrant`'s config write + manifest-hash re-sync — the F2 path); keep the pure `isSendAllowed` enforcement (reused by the store) |
| create | tests/unit/broker-grant-store.test.js | put/read round-trip, integrity mismatch fails closed + fixed alert, unknown/absent grant denied, TTY-only mutation, calendar-write kind |
| modify | tests/unit/gws-grant.test.js | reconcile the retired YAML path (assert the F2 write path is gone) + the store-backed mint + calendar-write kind + TTY-only (the CLI grant tests live here, not in a `cli-grant.test.js`) |
| modify | tests/unit/gws-send.test.js | AMENDED 2026-07-18 (review): the frozen `gmail.send` read path seeds a grant via the now-deleted `saveGrant`; reconcile with a local legacy-YAML seed helper |
| modify | tests/unit/gws-dispatch.test.js | AMENDED 2026-07-18 (review): same `saveGrant` seed reconciliation as gws-send.test.js |

### Exact contracts

**1. `src/gws/broker/grant-store.js`.**

```js
/** The canonical broker-owned grant store: state/broker-grants.json, 0600, outside the
 *  model's write surface. Grants are keyed by (routineId, kind); each carries an
 *  exact-byte integrity marker computed over its canonical serialization, mirroring the
 *  identity trust registry (ADR-0021). The store is tamper-EVIDENCE between attended
 *  human actions, NOT an OS boundary (F2/A12): a same-user native actor can rewrite it.
 *  @typedef {Object} StoredGrant
 *  @property {string} routineId
 *  @property {'send_self'|'calendar_write'} kind
 *  @property {string[]} to          [] for send_self (recipient is server-resolved self)
 *  @property {string} approved_at
 *  @property {string} integrity     sha256 over the grant's canonical bytes */

/** Read a grant and VERIFY its integrity marker. A missing grant, a malformed store, or
 *  an integrity mismatch → fail closed: return {allowed:false, reason, alert} where alert
 *  is a fixed, secret-free string the caller surfaces. NEVER throws.
 *  @param {import('../../core/paths').WienerdogPaths} paths
 *  @param {string} routineId @param {'send_self'|'calendar_write'} kind
 *  @returns {{allowed:boolean, reason:string, alert?:string}} */
function grantCheck(paths, routineId, kind)

/** Mint/replace a grant. TTY-ONLY: throws unless `opts.confirmedAtTty === true` (the
 *  CLI passes it only after the typed-word confirmation read from /dev/tty). Writes the
 *  store atomically at 0600 with a fresh integrity marker. NO --yes/env/headless path.
 *  @param {import('../../core/paths').WienerdogPaths} paths @param {StoredGrant} grant
 *  @param {{confirmedAtTty:boolean}} opts */
function putGrant(paths, grant, opts)
```

- **Integrity marker:** `sha256` over the grant's canonical serialization (stable key
  order, no whitespace variance). A one-byte change to the stored grant → `grantCheck`
  mismatch → fail closed + the fixed alert. This is the ADR-0021 exact-byte discipline
  applied to grants (path/key identity may be lowercased for the routineId; the grant
  content bytes are exact).
- **Recipient enforcement reuse:** for a `send_self` grant, `grantCheck` allowing send is
  necessary but the recipient is still server-resolved to self (WP-137). For any future
  third-party grant, reuse `grant.js` `isSendAllowed` for the exact-address allowlist —
  but v1 exposes NO third-party unattended send (ADR-0026 §4).
- **Fail-closed reader, never throws:** a corrupt/absent store denies and returns a fixed
  alert; the broker's send verb then makes zero send calls (audit acceptance point 5).

**2. `src/cli/grant.js` — mint into the store, keep TTY-only.**

- `wienerdog grant send --routine <id> --to <self-addr>` → after the existing typed-word
  `/dev/tty` confirmation (unchanged), call `putGrant(paths, {routineId, kind:'send_self',
  to:[...]}, {confirmedAtTty:true})`. (The recipient for the unattended digest is
  server-resolved self; `--to self` remains the canonical grant, ADR-0007.)
- **New:** `wienerdog grant calendar-write --routine <id>` → same TTY confirmation → a
  `calendar_write` grant (D-CAL-WRITE-GRANT). Used by WP-140's `cal add-event`.
- **No** `--yes`/env/headless bypass (WP-086 posture preserved). The confirmation is the
  only mutation path; `putGrant` refuses without `confirmedAtTty`.

**3. `src/gws/grant.js` — retire the F2 write path.**

- Delete `saveGrant`'s config.yaml write **and** its manifest-hash re-sync (the exact F2
  primitive). Keep `isSendAllowed` (pure enforcement, reused). `parseGrants`/`renderConfig...`
  may be retained only if a one-time read is needed for migration; per **D-GRANT-MIGRATION
  (recommend require re-grant)** they can be dropped — the YAML block is gone.
- Any remaining `findGrant`/`saveGrant` caller (e.g. `gmail.js` `send`, the CLI path) is
  BLOCKED in production (`gws-use` gate). Reconcile the send path to consult the store via
  the broker (WP-141) — this WP leaves `gmail.js` untouched (the broker send verb is
  WP-137's new path; the legacy `gmail.send` grant coupling is dead under A1+A2).

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-GRANT-MIGRATION — RESOLVED (OWNER-APPROVED 2026-07-18): require re-grant.** No
  import of an existing config.yaml YAML grant: GWS is frozen (`gws-use` BLOCKED) and the
  user base is a handful of installs at most, so no production grant exists to preserve;
  keeping the store's ONLY author the TTY path is cleaner and avoids importing an
  unauthenticated YAML fact (the very thing F2 flagged). Retire the YAML block entirely,
  with a one-time "grant model changed — re-run `wienerdog grant`" notice on detection.
- **D-CAL-WRITE-GRANT — RESOLVED (OWNER-APPROVED 2026-07-18): a distinct
  `kind:'calendar_write'` in the same store.** One store, one integrity discipline, one
  TTY path — but its own record type: a pure per-routine on/off with no recipient
  concept (no `to` allowlist; reusing the send-grant schema would give an empty field
  special implicit meaning, and the two capabilities must never imply each other).
- **D-STORE-INTEGRITY — RESOLVED (OWNER-APPROVED 2026-07-18): exact-byte sha256,
  honestly framed.** The ADR-0021 framing: exact-byte `sha256` **tamper-evidence between
  attended actions**, explicitly NOT an OS boundary — a same-user native actor can
  rewrite hash and store alike (the A12 residual, documented). The real model-forge
  defense is A1 (no Bash, staging-only writes) + A2 (no raw credential). NO keyed MAC:
  the audit showed a same-user-readable key is not a boundary, so a MAC would add
  complexity only to imply a false guarantee. One integrity discipline across the
  product (identity trust registry precedent), honest claims throughout.

## Implementation notes & constraints

- **Mirror `identity-approvals.js` exactly** for the store's atomic write + 0600 +
  exact-byte hash shape (ADR-0021, WP-116). Do not invent a new persistence pattern.
- **TTY-only is the whole point.** `putGrant` MUST refuse without `confirmedAtTty`;
  `cli/grant.js` sets it only after the `/dev/tty` typed-word confirmation. There is no
  `--yes`/env/headless path — a headless/hijacked process cannot mint a grant via the CLI,
  and under A1 cannot write the store file at all.
- **Honest boundary in code comments and messages:** the store is tamper-evidence, not an
  OS boundary. The fixed alert on mismatch says "grant store integrity check failed — not
  sending; re-grant at the keyboard," never implying cryptographic unforgeability.
- **Fail closed, never throw in the reader.** `grantCheck` returns a decision; a corrupt
  store denies. The broker send verb then makes zero API calls.
- **Idempotent/reversible.** The store lives in `state/` (0600), disposable by uninstall
  (WP-068). A5/A9 boundary: A5 did not touch grants; A2 owns this store, A9 the broader sweep.
- Zero deps, JSDoc only. When uncertain, choose simpler + record it.

## Security checklist

- [ ] Grants live ONLY in the 0600 broker-owned store, mutated ONLY by the TTY typed-word
      path (no `--yes`/env/headless); the config.yaml YAML grant block and its
      `saveGrant`+manifest-hash-resync (F2) are removed. The broker reads a grant with an
      exact-byte integrity check that fails closed on any mismatch/absence/corruption and
      emits a fixed secret-free alert; a grant-store bit flip causes zero draft/send/
      calendar write. The store is documented as tamper-evidence, not an OS boundary (F2/A12).

## Acceptance criteria

- [ ] `putGrant` writes the store at 0600 with an integrity marker; `grantCheck` allows the
      exact stored grant; a one-byte tamper of the store makes `grantCheck` deny with the
      fixed alert. (unit — audit acceptance point 5)
- [ ] `putGrant` throws without `confirmedAtTty`; the CLI sets it only after the `/dev/tty`
      typed-word confirmation; `--yes`/piped stdin cannot mint a grant. (unit)
- [ ] An absent or malformed store denies (fail closed), never throws. (unit)
- [ ] `wienerdog grant calendar-write --routine <id>` records a `calendar_write` grant
      behind the same confirmation. (unit)
- [ ] `grant.js` no longer writes config.yaml or re-syncs the manifest hash (the F2 path is
      gone); the pure `isSendAllowed` still enforces the exact-address allowlist. (unit)
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "broker-grant-store"
npm test -- --test-name-pattern "gws-grant"
npm test -- --test-name-pattern "cli-grant"
npm test
npm run lint
node bin/wienerdog.js safety    # all five gates BLOCKED
grep -n "saveGrant\|manifest" src/gws/grant.js   # the F2 config-write + manifest re-sync path is gone
```

## Out of scope (do NOT do these)

- The broker transport/verbs/credentials — **WP-136/137/138** (here `grantCheck` is the
  real store; wiring it into the running broker is **WP-141**).
- `cal draft-event`→`add-event` rename + gating the CLI verb — **WP-140** (this WP only
  adds the `calendar_write` grant KIND + CLI to mint it).
- Opening any capability gate — never in A2.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/139-broker-grant-store`; conventional commits; PR titled
   `feat(gws): canonical broker-owned grant store — TTY-only, integrity fail-closed (WP-139)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
