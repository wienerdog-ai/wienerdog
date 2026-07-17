---
id: WP-110
title: Freeze Google setup and GWS credential use behind the safety profile
status: Draft
model: sonnet
size: S
depends_on: [WP-109]
adrs: [ADR-0004, ADR-0007]
branch: wp/110-freeze-gws
---

# WP-110: Freeze Google setup and GWS credential use behind the safety profile

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its optional Google Workspace layer (`gws`)
connects a Google account by OAuth and then reads Gmail/Calendar/Drive and drafts
or sends mail. A 2026-07-15 security audit put GWS behind a hard pre-use freeze:
until a credential-holding broker is built (audit action A2) and the P0 gates
close, **Google setup and any use of Google credentials must be disabled in
production — fail closed BEFORE a credential is loaded or the browser is opened**,
so a fresh install cannot connect or exercise Google through any headless path.

WP-109 shipped the mechanism: a code-owned **safety profile** with **capability
gates**, all BLOCKED, and no runtime/env/flag override. This WP wires the two GWS
gates:

- `google-setup` — the OAuth connect flow (`wienerdog gws auth`).
- `gws-use` — every other `gws` verb (`gmail search/read/draft/send`, `cal`,
  `drive`, and the internal `_alert` self-email), each of which loads the OAuth
  token / client and may install `googleapis`.

The gate must fire at the ONE dispatch chokepoint in `src/gws/index.js`, before
`ensureGoogleReady` (which can install `googleapis`), before `getServices` (which
loads the token), and before the `auth` handler reads the client JSON or opens a
browser socket. Blocking `_alert` too is correct and intended: with GWS frozen
there is no send-capable path, and `run-job`'s fail-loud still records a durable
`state/alerts.jsonl` entry (that path is independent of the email — see
`src/cli/run-job.js` `failLoud`), so nothing silently breaks.

**No behavior for a routine implementer to decide:** this is a blunt freeze. The
real least-scope broker is a later WP (A2). This WP does not touch OAuth scopes,
grants, or the verb modules.

## Current state

**`src/gws/index.js`** — `async function run(argv)` builds a dispatch `key`
(`'auth'`, `'gmail search'`, `'gmail read'`, `'gmail draft'`, `'gmail send'`,
`'cal'`, `'drive'`, `'_alert'`), looks up a `handler` in `DISPATCH`, throws
`WienerdogError` for an unknown command, then:

```js
  const flags = parseFlags(rest);
  const paths = getPaths();
  if (key !== 'auth') await ensureGoogleReady(paths);   // may install googleapis
  let cached;
  const services = () => (cached || (cached = getServices(paths)));  // loads the token
  const result = await handler({ paths, flags, services });
  render(key, result, flags.json);
```

The `auth` handler (`require('./auth').run`) reads/persists the client JSON,
installs `googleapis`, and opens a loopback OAuth browser flow. `run(argv)`
currently takes only `argv` and is invoked by `bin/wienerdog.js` as
`require('../src/gws/index').run(rest)`.

**`src/core/safety-profile.js`** (WP-109) exports `requireCapability(name,
profile?)`, `CAPABILITY.{GOOGLE_SETUP,GWS_USE}`, and `allowAll()`. Passing no
`profile` uses the frozen (all-blocked) profile; `profile` is a **code seam** for
tests only — never read from env/argv.

**Tests.** Only `tests/unit/gws-dispatch.test.js` drives `gwsIndex.run([...])`
end-to-end (it sets up fake secrets so the real `getServices` succeeds and asserts
the send-grant degradation, `_alert`, `cal draft-event`, `--attendee`, `--id`
bridge behaviors). The verb modules keep their own direct unit tests
(`gws-gmail`, `gws-calendar`, `gws-drive`, `gws-send`, `gws-client`, `gws-auth`,
`gws-deps`), which do NOT go through `index.run` and are unaffected.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/gws/index.js | add `opts` param; gate `auth`→`google-setup`, all other keys→`gws-use`, BEFORE `ensureGoogleReady`/`getServices`/handler |
| modify | tests/unit/gws-dispatch.test.js | thread `{ profile: allowAll() }` into existing bridge tests; add two freeze-assertion tests |

### Exact contracts

**1. `src/gws/index.js`.** Change the signature to `async function run(argv, opts =
{})` and insert the gate immediately after the `if (!handler) throw …` check and
**before** `parseFlags`/`getPaths`/`ensureGoogleReady`:

```js
const { requireCapability, CAPABILITY } = require('../core/safety-profile');
// … inside run(argv, opts = {}) …
  const handler = DISPATCH[key];
  if (!handler) {
    throw new WienerdogError(`unknown gws command: ${argv.slice(0, 2).join(' ').trim()}`);
  }

  // A0 pre-use freeze (WP-109): connecting Google and using Google credentials are
  // disabled until the P0 security gates close. Fail closed HERE — before any token
  // load, googleapis install, or OAuth browser socket. opts.profile is a code seam
  // for tests only (never env/argv).
  requireCapability(key === 'auth' ? CAPABILITY.GOOGLE_SETUP : CAPABILITY.GWS_USE, opts.profile);

  const flags = parseFlags(rest);
  const paths = getPaths();
  if (key !== 'auth') await ensureGoogleReady(paths);
  // … unchanged …
```

`bin/wienerdog.js` calls `run(rest)` with no `opts` → the frozen profile → every
`gws` invocation throws. Do not change `bin/wienerdog.js`. Keep `render`,
`parseFlags`, `resolveRoutine`, and the `DISPATCH` table unchanged (the gate sits
in front of them). `module.exports` stays `{ run, resolveRoutine }`.

**2. `tests/unit/gws-dispatch.test.js`.**
- `const { allowAll } = require('../../src/core/safety-profile');`
- In every existing test that calls `gwsIndex.run([...])` to exercise real bridge
  behavior, pass the allow-all profile as the second arg:
  `gwsIndex.run(['gmail', 'send', …], { profile: allowAll() })`. This preserves all
  existing coverage under an explicitly-allowed profile (the code seam, not an env
  override).
- Add two NEW tests asserting the freeze (no `opts` → frozen):
  - `await assert.rejects(gwsIndex.run(['gmail', 'search', 'x']), /disabled in this release/)`
    and assert it rejects with the `gws-use` wording; assert the fake services'
    call log shows **zero** API calls (no credential load reached).
  - `await assert.rejects(gwsIndex.run(['auth', '--client', '/nope.json']), /disabled in this release/)`
    — asserts `google-setup` fails before the client JSON is read (use a path that
    does NOT exist; the freeze must throw the "disabled" error, NOT a
    "could not read the client JSON" error).

## Implementation notes & constraints

- **Gate BEFORE side effects.** The insertion point is chosen so the throw
  precedes `ensureGoogleReady` (googleapis install), `getServices`/`loadToken`
  (credential load), and the `auth` handler's client-JSON read + browser socket.
  Do not move it below `parseFlags`/`getPaths` side-effect calls — those are
  harmless, but keep the gate as the first thing after handler resolution.
- **`_alert` is intentionally frozen** (`gws-use`). It is send-capable and needs a
  token; with GWS off there is no self-send. `run-job` fail-loud still writes the
  durable alert independently, so job failures stay visible.
- **Unknown-command behavior is unchanged**: an unknown `gws` command still throws
  its own "unknown gws command" error (the gate runs only for a real handler).
- **No env/flag override** (A0). The only way a test sees "allowed" is the
  `opts.profile` code seam.
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] The freeze fires before any credential is loaded or written and before the
      OAuth browser socket opens: the `auth` failure path uses a non-existent
      `--client` and asserts the "disabled" error (not a file-read error), and the
      verb failure path asserts zero fake-API calls. `opts.profile` is a code-only
      seam (tests); production (`bin` → `run(rest)`) passes nothing → frozen. No
      env var or `--yes` can reach an allowed state.

## Acceptance criteria

- [ ] `wienerdog gws auth --client <anything>` fails closed with the `google-setup`
      "disabled in this release … no … override" error, before reading the client
      JSON — a fresh install cannot connect Google through any headless path.
- [ ] `wienerdog gws gmail search …` (and `gmail read/draft/send`, `cal`, `drive`,
      `_alert`) fails closed with the `gws-use` error, before `ensureGoogleReady`
      or `getServices` — zero Google API calls, no credential load.
- [ ] With `{ profile: allowAll() }`, every existing dispatch-bridge test still
      passes (send-grant degradation, `_alert`, `cal draft-event`, `--attendee`,
      `--id`) — the freeze adds a gate, it does not change verb behavior.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "gws-dispatch"
node bin/wienerdog.js gws gmail search hi ; echo "exit=$?"   # expect: disabled + exit 1
node bin/wienerdog.js gws auth --client /nope.json ; echo "exit=$?"  # expect: disabled + exit 1
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The credential-holding broker, least-scope credential split, or `cal draft-event`
  rename — those are audit action A2, a separate future WP.
- Gating `getServices` in `src/gws/client.js` or `grant.js`'s best-effort
  self-address lookup — the single `index.js` chokepoint covers direct `gws` CLI
  invocation; deeper defense-in-depth is deferred (record as a Decision if you
  considered it).
- Any change to OAuth scopes, grants (ADR-0007), or the verb modules.
- Touching `bin/wienerdog.js` (WP-109 already registered no gws change; `gws`
  stays wired as-is).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/110-freeze-gws`; conventional commits; PR titled
   `feat(gws): freeze Google setup + credential use behind the safety profile (WP-110)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main`
> per `docs/security-audit/2026-07-15/WORKING-NOTES.md`; the `branch:`/PR fields
> are kept for template/upstream-porting fidelity.
