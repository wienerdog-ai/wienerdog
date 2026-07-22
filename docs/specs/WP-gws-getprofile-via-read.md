---
id: WP-gws-getprofile-via-read
title: Resolve the self-address via the READ credential, not SEND (getProfile scope fix — ST1)
status: Draft
model: opus
size: S
depends_on: [WP-broker-verb-allowlist-and-gws-gate, WP-gws-retire-dead-send-path]
adrs: [ADR-0026]
epic: p0-ungate
---

# WP-gws-getprofile-via-read: getProfile under READ, send under SEND

## Context (read this, nothing else)

The broker's least-scope SEND credential is `gmail.send`-only (`scope-sets.js:25`).
Google's Gmail API does NOT permit `users.getProfile` under `gmail.send` — it
requires one of `mail.google.com` / `gmail.modify` / `gmail.compose` /
`gmail.readonly` / `gmail.metadata`
(https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile).
So both self-send paths that resolve the recipient via `getProfile` under the SEND
credential **403 at runtime**:

- `send_digest_to_self` broker verb — `src/cli/gws-broker.js` `compositeServices`
  currently wires `users.getProfile` to the SEND credential (l.67; the JSDoc l.44
  even states "getProfile + messages.send to SEND"). The handler
  (`broker/verbs.js:197`) calls `services.gmail.users.getProfile` → 403 → throws
  "could not determine your Google account address — digest not sent".
- `gws _alert` — `src/gws/index.js:131` builds a SEND-only service; `alert.js:28`
  calls `services.gmail.users.getProfile` → 403 → the fail-loud watchdog email
  never sends.

This is the ST1 smoke-test failure the flip design anticipated. **Fix (option B,
owner-chosen): resolve the self-address via the READ credential (`gmail.readonly`,
which IS getProfile-eligible); keep the actual send under SEND.** This adds NO new
scope — READ already exists — and keeps SEND purely send-only (preserves the A2
least-scope guarantee; option A, broadening SEND with `gmail.metadata`, was
rejected for that reason).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/gws-broker.js | `compositeServices`: wire `users.getProfile` from the READ credential (beside `messages.list/get`), NOT SEND; keep `messages.send` from SEND. Updated the JSDoc. Exported `compositeServices` for the CI regression lock. |
| modify | src/gws/index.js | `_alert` dispatch: build a composite service where `getProfile` is from `getServicesForClass(paths, READ)` and `messages.send` is from `getServicesForClass(paths, SEND)`; pass it to `alert.run` (alert.run's `services.gmail.users.{getProfile,messages.send}` shape is unchanged). |
| modify | tests/unit/gws-dispatch.test.js | the `_alert` test: getProfile invoked on the READ service (`seenClasses==['READ','SEND']`), send on the SEND service — distinct per-class stubs prove it (non-vacuous). |
| create | tests/unit/gws-broker.test.js | `compositeServices` routes getProfile+reads to READ, send to SEND; with no READ, getProfile is absent (fail closed, never sourced from SEND). CI-runnable lock. |

### Exact contract

`compositeServices(byClass)` — move the `getProfile` wiring into the READ block:

```js
if (read && read.gmail) {
  messages.list = (p) => read.gmail.users.messages.list(p);
  messages.get = (p) => read.gmail.users.messages.get(p);
  // getProfile needs a read scope (gmail.send cannot getProfile — Google API);
  // resolve the self-address under READ, never SEND. Keeps SEND send-only.
  users.getProfile = (p) => read.gmail.users.getProfile(p);
}
const send = byClass.SEND;
if (send && send.gmail) {
  messages.send = (p) => send.gmail.users.messages.send(p);
}
```

`_alert` dispatch (`index.js`): build the two-credential composite inline (or via a
shared helper) so `alert.run` sees `getProfile`←READ and `messages.send`←SEND.

## Implementation notes & constraints

- **No scope change** — do NOT edit `scope-sets.js`. READ (`gmail.readonly`) is
  already getProfile-eligible; that is the whole point of option B.
- `send_digest_to_self` runs only under the `daily-digest` profile, which already
  loads READ (its `gmail_search`/`gmail_read` verbs) — so READ getProfile is present.
  Add a one-line comment noting the coupling: a SEND-only profile using
  `send_digest_to_self` would need READ loaded for self-resolution.
- `alert.run` (`src/gws/alert.js`) is called ONLY by the `_alert` dispatch; its body
  is unchanged (it already calls `services.gmail.users.getProfile` then
  `services.gmail.users.messages.send` — now backed by READ and SEND respectively).
- The self-only invariant (recipient is always the authenticated account, never
  from arguments) is UNCHANGED and must stay intact.
- Zero new deps; JSDoc types; no build step.

## Security checklist

- [ ] SEND credential stays `gmail.send`-only (no new scope); getProfile is resolved
      under READ; the self-only-recipient invariant is preserved for both `_alert`
      and `send_digest_to_self`.

## Acceptance criteria

- [ ] `compositeServices` sources `getProfile` from READ and `messages.send` from SEND.
- [ ] `_alert` resolves the self-address via the READ credential and sends via SEND.
- [ ] `npm test` + `npm run lint` pass.
- [ ] (Live, ST1) `wienerdog gws _alert` self-sends successfully under the split
      credentials — confirmed by the maintainer before the flip ships.

## Definition of done

1. Verification passes; output pasted in the PR.
2. Conventional commit `fix(gws): resolve self-address via READ getProfile, keep SEND send-only (WP-gws-getprofile-via-read)`.
3. Spec `status:` → In-Review.
