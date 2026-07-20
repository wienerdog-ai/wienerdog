---
id: WP-gws-retire-dead-send-path
title: Retire the dead interactive gmail/drive dispatch + forgeable legacy grant read; rewire the fail-loud alert
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0007, ADR-0026]
epic: p0-ungate
---

# WP-gws-retire-dead-send-path: Retire the dead interactive gmail/drive send path

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Google access uses **split, least-scope
credentials** per capability class (WP-138): `getServicesForClass(paths, class)`
builds only the services a class is scoped for; the old combined-token
`getServices()` was RETIRED and now throws unconditionally. Grants live ONLY in the
broker-owned store (WP-139), minted by the TTY `wienerdog grant` CLI (ADR-0007); the
legacy `config.yaml` grant block is no longer a write target.

This WP is a cluster-N cleanup folded into the 0.10.0 un-freeze. The double-gate
review found a HIGH-quality dead-code + latent-security issue on the interactive
`wienerdog gws` path: the `gmail search/read/draft/send` and `drive` and `_alert`
dispatch entries resolve `services()` = `getServices()`, which THROWS — so they are
all inert. That inert throw is an ACCIDENTAL mask fronting a FORGEABLE reader:
`gmail.js send` still reads `parseGrants` of the legacy `config.yaml` block (which
WP-139 says any same-user writer could forge), NOT the hardened broker store. A
regression that re-enabled `getServices` would resurrect the forgeable send-grant
path, and no test asserts `getServices()` throws, so the regression would stay green.
Separately, the run-job fail-loud EMAIL (`gws _alert`) is inert too — post-un-gate it
would hit the `getServices` throw and silently fail (the durable `alerts.jsonl`
banner still works; only the email is lost).

**Decision (recorded in FIX-PLAN §4a):** DELETE the dead interactive gmail/drive
path and the forgeable read; REWIRE `_alert` to a least-scope SEND credential so the
fail-loud email works. Routines use the broker (not these interactive verbs), and
`cal` already uses `getServicesForClass`, so nothing in production loses function.

## Current state

`src/gws/index.js`:
- Imports `{ getServices }` (l.5). The `DISPATCH` table (l.114-156) has entries
  `gmail search`, `gmail read`, `gmail draft`, `gmail send`, `cal`, `drive`,
  `_alert`. `gmail *` / `drive` / `_alert` handlers call `services()` (l.231-232:
  `const services = () => (cached || (cached = getServices(paths)))`). `cal` uses
  `servicesFor: (cls) => getServicesForClass(paths, cls)` (l.149) — the pattern to
  copy for `_alert`.
- `run(argv, opts)` gates on `requireCapability(key === 'auth' ? GOOGLE_SETUP :
  GWS_USE, opts.profile)` (l.220).

`src/gws/client.js`: `getServices()` (l.223-227) throws the migration error
unconditionally; `getServicesForClass(paths, capabilityClass, opts)` (l.185) is the
least-scope accessor. Both are exported.

`src/gws/gmail.js`: `send(services, opts)` (l.153-183) calls `const { findGrant,
isSendAllowed } = require('./grant')` and `findGrant(opts.paths, routine)` — the
only caller of `findGrant`. `search`/`read`/`draft`/`buildMime` are used by the
broker verbs (`src/gws/broker/verbs.js`) and `_alert` (`buildMime`).

`src/gws/grant.js`: `parseGrants` (l.34) is called only by `findGrant` (l.80);
`findGrant` (l.72) is called only by `gmail.js send`. `hasLegacyYamlGrants` (l.62) is
used by `src/cli/grant.js:116` (the migration notice) — KEEP. `isSendAllowed` (l.92)
is the pure enforcement decision (documented reuse) — KEEP. `BEGIN` (l.25) is used by
`hasLegacyYamlGrants`; `END` (l.26) only by `parseGrants`.

`src/gws/alert.js`: `run(services, opts)` (l.25) calls
`services.gmail.users.getProfile` then `services.gmail.users.messages.send` (a
fixed-recipient self-send). It needs a SEND-class `services.gmail`.

`src/cli/run-job.js`: `defaultSendAlert(paths, name, subject, body)` (l.486-494)
spawns `wienerdog gws _alert --subject … --body …`.

`tests/unit/gws-dispatch.test.js` monkeypatches `getServices` and asserts the
gmail-send/interactive verbs — i.e. it validates DEAD code.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/gws/index.js | delete `gmail search/read/draft/send` + `drive` dispatch entries; rewire `_alert` to a SEND-class service; remove the now-orphaned `getServices` import + `services()` closure |
| modify | src/gws/gmail.js | delete `send` (the forgeable legacy-grant reader); keep `search`/`read`/`draft`/`buildMime` |
| modify | src/gws/grant.js | remove `parseGrants` + `findGrant` (+ the `END` constant) if grep confirms orphaned; keep `isSendAllowed` + `hasLegacyYamlGrants` (+ `BEGIN`) |
| modify | tests/unit/gws-dispatch.test.js | drop the dead gmail-send/interactive assertions; add a `getServices()`-throws test; assert `_alert` uses the SEND-class service |
| modify | tests/unit/gws-send.test.js | delete the 5 dead `gmail.send` tests (keep the 2 `alert.run` tests) — `send()` is retired |
| modify | tests/unit/gws-gmail.test.js | drop the `send()`-routed CRLF-injection test + its orphaned `grantedPaths` helper; WP-085 coverage is preserved by the existing live-path `buildMime` CRLF tests |

### Exact contracts

**1. `index.js` — delete the dead entries, rewire `_alert`.** Remove the
`'gmail search'`, `'gmail read'`, `'gmail draft'`, `'gmail send'`, and `'drive'`
`DISPATCH` keys. Rewire `_alert` to a SEND-class service (mirroring how `cal` uses
`getServicesForClass`):

```js
const { CAPABILITY_CLASS } = require('./broker/constants'); // SEND
// … in DISPATCH:
  '_alert': ({ paths, flags }) =>
    require('./alert').run(require('./client').getServicesForClass(paths, CAPABILITY_CLASS.SEND), {
      subject: flags.subject, body: flags.body,
    }),
```

Remove the `getServices` import (l.5) and the `services` closure (l.231-232); the
remaining live keys (`auth`, `cal`, `_alert`) build their own services. Confirm no
other handler references `services`.

**2. `gmail.js` — delete `send`.** Remove the `send` function (and its
`require('./grant')`); update `module.exports` to
`{ search, read, draft, buildMime }`. `buildMime`/`draft`/`search`/`read` stay (the
broker and `_alert` use them).

**3. `grant.js` — remove orphans.** After `gmail.js send` is gone, `findGrant` and
`parseGrants` have no caller — grep-verify (`grep -rn "findGrant\|parseGrants" src/
tests/`) and remove them and the `END` constant. Keep `isSendAllowed`,
`hasLegacyYamlGrants`, `BEGIN`, and their exports. If the grep shows an unexpected
caller, KEEP the function and note it under "Decisions made".

**4. `getServices()` retirement lock.** In `tests/unit/gws-dispatch.test.js`, replace
the dead gmail-send assertions with:
- a test that `client.getServices()` THROWS a `WienerdogError` (the migration
  message) — so a regression re-enabling it fails;
- a test that `_alert` dispatch calls `getServicesForClass(paths, SEND)` (inject a
  stub `getServicesForClass` returning a fake `{gmail:{users:{getProfile, messages:
  {send}}}}` and assert `alert.run` sends to the resolved self address).

## Implementation notes & constraints

- **`gws-use` description stays accurate WITHOUT editing `safety-profile.js`.** After
  `WP-broker-verb-allowlist-and-gws-gate` folds the broker behind `gws-use`, the
  `gws-use` gate genuinely governs Gmail/Cal/Drive (interactive `cal` + `_alert`, and
  routine access via the broker). Do NOT edit `safety-profile.js` here.
- **`_alert` `getProfile`-under-send-scope is a REQUIRED release smoke test (ST1,
  FIX-PLAN §6).** `alert.js` calls `getProfile` with a `gmail.send`-only credential;
  if Google rejects that, the fail-loud email (and `send_digest_to_self`) cannot
  resolve the self address. This WP does NOT change scopes; if ST1 fails, adding
  `gmail.metadata` to the SEND scope-set (or resolving the self address via the READ
  credential) is a separate follow-up sequenced before the flip.
- **`cli/grant.js` is unaffected** — its `authenticatedAddress` already swallows the
  `getServices` throw and returns null (graceful degradation); do not touch it.
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No product path reads `parseGrants(config.yaml)` for a send decision (the
      broker store is the sole grant authority): `gmail.js send` and `grant.js`
      `findGrant`/`parseGrants` are removed. The combined-token `getServices()` throws
      for every caller and a test asserts it (regression-locked). The fail-loud email
      resolves its credential via the least-scope SEND class, never the retired
      combined token. No untrusted identifier flows into a path/shell.

## Acceptance criteria

- [ ] `wienerdog gws gmail search|read|draft|send` and `wienerdog gws drive` are
      unknown commands (dispatch entries removed); `auth`, `cal`, `_alert` still
      dispatch.
- [ ] `client.getServices()` throws a `WienerdogError` (asserted by a new test).
- [ ] `_alert` builds its service via `getServicesForClass(paths, SEND)` (asserted);
      `alert.run` sends to the resolved self address only.
- [ ] `gmail.js` exports `{ search, read, draft, buildMime }` (no `send`); `grant.js`
      no longer exports `parseGrants`/`findGrant`; `isSendAllowed`/`hasLegacyYamlGrants`
      remain and their callers still pass.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "gws-dispatch|gws"
grep -rn "findGrant\|parseGrants" src/ tests/    # no product caller remains
npm test
npm run lint
node bin/wienerdog.js safety   # gates unchanged at this WP
```

## Out of scope (do NOT do these)

- The broker server-side per-verb allowlist / `gws-use` fold — `WP-broker-verb-allowlist-and-gws-gate`.
- Any scope-set change (ST1 contingency is a separate follow-up if the live smoke test fails).
- `cli/grant.js` / `authenticatedAddress`.
- Opening any capability gate.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `refactor(gws): retire dead interactive send path + forgeable grant read; rewire _alert (WP-gws-retire-dead-send-path)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
