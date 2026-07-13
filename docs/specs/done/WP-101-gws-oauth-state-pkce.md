---
id: WP-101
title: gws OAuth loopback — add state + PKCE (RFC 8252)
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
branch: wp/101-gws-oauth-state-pkce
---

# WP-101: gws OAuth loopback state + PKCE

## Context (read this, nothing else)

`wienerdog gws auth` connects a user's Google account with the **OAuth loopback
flow** for Desktop-app clients: it starts a one-shot HTTP listener on an
ephemeral `127.0.0.1` port, opens Google's consent URL in the browser, and
Google redirects back to `http://127.0.0.1:<port>/?code=...`; the listener reads
the code and exchanges it for tokens (stored 0600 under `~/.wienerdog/secrets/`).
The client is a **per-user** Google Cloud "Desktop app" OAuth client whose
`client_id`/`client_secret` the user pastes in; it is stored 0600, not baked into
any distributed binary.

Two verified gaps against the primary specs (memo
`memory/research/2026-07-13-gws-oauth-loopback-state-pkce.md`, fetched RFC 8252 /
RFC 7636 / Google's native-app doc / the `google-auth-library` API):

1. **No `state`.** The auth URL carries no `state`, and the listener resolves on
   the **first** request carrying a `?code=` (or `?error=`) with **no correlation
   to the request Wienerdog actually made**. A co-resident process on the same
   machine can enumerate loopback listeners (`lsof`/`netstat`, no privilege) and
   race a bogus `GET /?code=garbage` into the one-shot listener before the real
   browser callback, hijacking the promise with a code that fails `getToken`
   (`invalid_grant`) — a **DoS/CSRF-injection** on the `auth` command. Google's
   native-app doc recommends verifying `state` server-side "to ensure that the
   user, not a malicious script, is making the request."
2. **No PKCE.** RFC 8252 §6 makes PKCE a **MUST** for exactly this public
   loopback/Desktop-app client shape (§8.1: the loopback redirect "may be
   susceptible to interception by other apps accessing the same loopback
   interface"). `google-auth-library` supports PKCE but it is **opt-in** — the
   caller must call `generateCodeVerifierAsync()`, pass
   `code_challenge`/`code_challenge_method=S256` into `generateAuthUrl`, and pass
   `codeVerifier` into `getToken`. Wienerdog does none of this.

The *credential-hijack* worst case is bounded by file permissions on the 0600
`client_id` in Wienerdog's current per-user-client model (an attacker who can
mint a redeemable code already has file-read/terminal access equivalent to a full
local compromise — the memo's shape (B)).

**Right-sizing the mitigations honestly (don't over-claim):** `state` is printed
in the authorization URL (to stdout / the user's terminal), so it defends only
the **BLIND co-resident race** — an attacker who guesses the ephemeral port
WITHOUT seeing the URL cannot produce a matching `state` — plus standard CSRF
correlation. It does **NOT** defend against an attacker who can OBSERVE the
printed URL (same terminal/environment): such an attacker can craft a
matching-`state` callback, and is already inside the user's session (out of
scope). **PKCE** is the real defense against authorization-code injection
(RFC 8252 §6 MUST): an intercepted code is not redeemable without the
`code_verifier`, which never appears in the URL. A bounded **listener timeout**
backstops both — an attacker flooding mismatched-`state` callbacks, or a user who
never completes consent, can no longer wedge the process. All three are additive,
contained to `src/gws/auth.js`, and do not change the persisted token/client JSON
shape.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004) —
"no socket may outlive the command"; the listener is still closed in `finally`.
No new dependency: `google-auth-library` (behind the pinned `googleapis@^173`
already used by gws) provides `generateCodeVerifierAsync`.

## Current state

`src/gws/auth.js` — `run()` (loopback + URL + exchange) and the internal
`startLoopback()` (NOT exported today):

```js
async function run(paths, opts = {}) {
  // ... reads/persists client JSON, ensures googleapis ...

  // 3. Start the loopback listener on an ephemeral port before building the URL.
  const { server, port, waitForCode } = await startLoopback();

  try {
    const redirectUri = `http://127.0.0.1:${port}/`;
    const oauth =
      opts.oauthClient ||
      new (opts.googleapis || loadGoogleapis(paths)).google.auth.OAuth2(
        cfg.client_id, cfg.client_secret, redirectUri
      );

    // 4. Generate + present the consent URL.
    const authUrl = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });
    process.stdout.write(`\nOpen this URL ...\n\n${authUrl}\n\n`);
    if (opts.openBrowser) opts.openBrowser(authUrl);

    // 5. Wait for the single loopback redirect carrying ?code=...
    const code = await waitForCode;

    // 6. Exchange the code for tokens and persist them.
    const token = (await oauth.getToken(code)).tokens;
    oauth.setCredentials(token);
    persistToken(paths, token);
    // 7. Best-effort email ...
    return { email, tokenPath: require('./client').tokenPath(paths) };
  } finally {
    server.close(); // No socket may outlive the command (ADR-0004).
  }
}

function startLoopback() {
  return new Promise((resolve, reject) => {
    let resolveCode; let rejectCode;
    const waitForCode = new Promise((res, rej) => { resolveCode = res; rejectCode = rej; });
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(CLOSE_PAGE);
      if (error) rejectCode(new WienerdogError(`Google denied authorization: ${error}`));
      else if (code) resolveCode(code);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, waitForCode }));
  });
}

module.exports = { run };
```

`opts.oauthClient` and `opts.googleapis` are already injectable test seams.
`node:crypto` is NOT yet required in this file; `node:http` is.

**Verified library facts** (googleapis@^173 → google-auth-library, confirmed
against the installed version):
- `await oauth.generateCodeVerifierAsync()` → `{ codeVerifier, codeChallenge }`.
- `oauth.generateAuthUrl({ ..., state, code_challenge, code_challenge_method: 'S256' })`
  emits `state`, `code_challenge`, `code_challenge_method` as URL query params.
- `oauth.getToken({ code, codeVerifier })` sends `code` + `code_verifier` in the
  token exchange (the object form; the current string form `getToken(code)` is
  what we replace).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/gws/auth.js | Add `state` (random) + PKCE per the Exact contract; `startLoopback(expectedState)` VERIFIES `state` and ignores/keeps-listening on mismatch; add an `opts.startLoopback` injection seam; **export `startLoopback`** for direct testing. |
| create | tests/unit/gws-auth.test.js | Acceptance tests (all cases below). No auth test exists today. |
| modify | docs/THREAT-MODEL.md | Add the **T4b** subsection recorded under "THREAT-MODEL addition" below. |

### Exact contracts

**`run()` sequence (state generated before the listener; PKCE after the OAuth
client exists):**

```js
const crypto = require('node:crypto'); // add near the other requires

// inside run(), replacing steps 3–6:

// A random, high-entropy state correlates the callback to the request we made.
const state = crypto.randomBytes(32).toString('base64url');

// Loopback listener verifies `state`; injectable for tests.
const startLoopbackFn = opts.startLoopback || startLoopback;
const { server, port, waitForCode } = await startLoopbackFn(state);

try {
  const redirectUri = `http://127.0.0.1:${port}/`;
  const oauth =
    opts.oauthClient ||
    new (opts.googleapis || loadGoogleapis(paths)).google.auth.OAuth2(
      cfg.client_id, cfg.client_secret, redirectUri
    );

  // PKCE (RFC 8252 MUST for this client shape). Opt-in in google-auth-library.
  const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();

  const authUrl = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  process.stdout.write(`\nOpen this URL in your browser to authorize Wienerdog:\n\n${authUrl}\n\n`);
  if (opts.openBrowser) opts.openBrowser(authUrl);

  const code = await waitForCode;

  const token = (await oauth.getToken({ code, codeVerifier })).tokens;
  oauth.setCredentials(token);
  persistToken(paths, token);
  // ... step 7 (email) unchanged ...
} finally {
  server.close();
}
```

**`startLoopback(expectedState, timeoutMs)` — verify `state`, ignore mismatches,
BOUNDED by a timeout:**

The keep-listening-on-mismatch behavior MUST be bounded, or a mismatched-`state`
flood (or a user who never completes consent) would wedge the process forever.
`auth.js` has no existing timeout to reuse, so introduce
`CONSENT_TIMEOUT_MS = 5 * 60 * 1000` (a generous OAuth-consent window). Make the
value injectable so tests can drive the abort path with a tiny value without a
lingering 5-minute timer; `unref()` the timer so a pending timeout never keeps
the event loop alive on its own.

```js
const CONSENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — the OAuth consent window

/**
 * One-shot loopback listener on 127.0.0.1:0. Resolves the `code` ONLY from a
 * request whose `state` matches `expectedState`; a request with a missing or
 * mismatched `state` is answered with the close page but IGNORED (the listener
 * keeps waiting for the correct one) — this drops a raced/CSRF callback instead
 * of failing on it. An `error=` is honored only when its `state` matches. After
 * `timeoutMs` with no matching callback the flow ABORTS: `waitForCode` rejects
 * with a plain-language error (the caller's `finally` closes the server).
 * @param {string} expectedState
 * @param {number} [timeoutMs]
 * @returns {Promise<{server:import('node:http').Server, port:number, waitForCode:Promise<string>}>}
 */
function startLoopback(expectedState, timeoutMs = CONSENT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let resolveCode; let rejectCode; let timer;
    const waitForCode = new Promise((res, rej) => {
      resolveCode = (v) => { clearTimeout(timer); res(v); };
      rejectCode = (e) => { clearTimeout(timer); rej(e); };
    });
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(CLOSE_PAGE);
      if (state !== expectedState) return; // ignore raced/unrelated callbacks; keep listening
      if (error) rejectCode(new WienerdogError(`Google denied authorization: ${error}`));
      else if (code) resolveCode(code);
    });
    timer = setTimeout(() => {
      rejectCode(new WienerdogError(
        'Timed out waiting for Google authorization. Re-run `wienerdog gws auth` and complete the consent in your browser.'
      ));
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, waitForCode }));
  });
}

module.exports = { run, startLoopback };
```

Behavior:
- Auth URL now carries `state`, `code_challenge`, and `code_challenge_method=S256`.
- A BLIND same-machine attacker's `GET /?code=garbage` (no/mismatched `state`) is
  answered with the close page but **ignored** — `waitForCode` stays pending; the
  real browser callback (correct `state`) still resolves it. This closes the
  blind-race/CSRF variant; it does NOT stop an attacker who can read the printed
  URL (out of scope — already inside the user's session).
- The listener ABORTS after `CONSENT_TIMEOUT_MS` (5 min) with a plain-language
  error, so a flood of mismatched-`state` callbacks or an abandoned consent can no
  longer wedge the process.
- Token exchange includes `code_verifier` — an intercepted code is not redeemable
  without the verifier (RFC 7636 / RFC 8252 §6 MUST). This is the real
  code-injection defense.
- Persisted token/client JSON shapes are unchanged; `finally { server.close() }`
  unchanged (ADR-0004).

### Acceptance test cases (`tests/unit/gws-auth.test.js`)

Two seams make this fully unit-testable without a live Google:

**(i) `run()` with an injected `oauthClient` + `opts.startLoopback` fake** (no
real network): the fake `startLoopback(state)` returns `{ server: {close(){}},
port: 12345, waitForCode: Promise.resolve('the-code') }`; the mock `oauthClient`
provides `generateCodeVerifierAsync` → `{codeVerifier:'ver', codeChallenge:'chal'}`,
a `generateAuthUrl(opts)` that records `opts` and returns a URL, a
`getToken(arg)` that records `arg` and returns `{tokens:{access_token:'a'}}`,
`setCredentials(){}`, plus a stub `opts.googleapis` so `fetchEmail` returns null.
Provide a real temp `clientPath` with a valid `{installed:{client_id,client_secret,...}}`
JSON and a temp `paths`. Assert:
- [ ] `generateAuthUrl` was called with a non-empty string `state`, and with
      `code_challenge: 'chal'` and `code_challenge_method: 'S256'`.
- [ ] `getToken` was called with `{ code: 'the-code', codeVerifier: 'ver' }`.

**(ii) Real `startLoopback(expectedState, timeoutMs)` (exported) — state
verification + timeout** (drive with real loopback HTTP requests to
`127.0.0.1:<port>`; pass a generous `timeoutMs` for the state cases and a tiny one
for the timeout case, so no test lingers on the 5-minute default):
- [ ] A request with a **mismatched** `state` (`?state=wrong&code=x`) does NOT
      resolve `waitForCode` (assert it is still pending after the response — e.g.
      `Promise.race` against a short timer resolves to the timer sentinel).
- [ ] A request with an **absent** `state` (`?code=x`) likewise does not resolve.
- [ ] A subsequent request with the **matching** `state` (`?state=<expected>&code=good`)
      resolves `waitForCode` to `'good'`.
- [ ] A request with matching `state` and `?error=access_denied` rejects
      `waitForCode`; a mismatched-`state` `error=` is ignored.
- [ ] With a **tiny `timeoutMs`** (e.g. 50 ms) and NO matching callback (send
      nothing, or only a mismatched-`state` request), `waitForCode` **rejects with
      the plain-language timeout error** — the bounded-abort backstop.
- Close the server at the end of each case.

### THREAT-MODEL addition (docs/THREAT-MODEL.md)

Add a new subsection immediately **after T4a** (before T5a):

> ## T4b — OAuth handshake integrity (loopback state + PKCE)
>
> **Attack/hazard**: the `gws auth` loopback listener accepts a callback on an
> ephemeral `127.0.0.1` port. A co-resident process can enumerate loopback
> listeners without privilege and race a callback into the one-shot listener
> (RFC 8252 §8.1: the loopback redirect "may be susceptible to interception by
> other apps accessing the same loopback interface").
>
> **Mitigations (WP-101)**: the auth request carries a high-entropy `state`; the
> listener resolves ONLY on a callback whose `state` matches, ignoring
> (keep-listening on) any raced/unrelated request. `state` is a **partial**
> mitigation: it is printed in the authorization URL, so it defends the BLIND
> co-resident race (an attacker guessing the ephemeral port WITHOUT seeing the URL)
> and provides CSRF correlation — it does **NOT** defend against an attacker who can
> OBSERVE the printed URL (same terminal/environment), who can craft a
> matching-`state` callback. **PKCE** (`code_challenge`/`S256` on the auth URL,
> `code_verifier` on the token exchange, RFC 8252 §6 MUST) is the real defense
> against authorization-code injection: an intercepted code is not redeemable
> without the verifier (RFC 7636), which never appears in the URL. A bounded
> **listener timeout** (5 min) backstops both a mismatched-`state` flood and an
> abandoned consent, so neither can wedge the `auth` command.
>
> **Residual (accepted)**: a same-terminal / URL-observing attacker is out of
> scope — they already hold the user's session. And in the current
> per-user-client model the
> *credential-hijack* variant (an attacker redeeming their OWN valid code) already
> requires read access to the 0600 `client_id` — the same file-permission boundary
> that guards the token itself (T4) — so state/PKCE are defense-in-depth there, not
> the primary control. A future shared/multi-user client model would remove that
> file-permission mitigation and make PKCE load-bearing; it must not ship
> without state + PKCE.

## Implementation notes & constraints

- Zero new dependencies (`google-auth-library` via the existing `googleapis`
  pin); plain Node ≥ 18, JSDoc types only (CLAUDE.md). `node:crypto` is a
  built-in.
- The PKCE API is **confirmed present** in the pinned `google-auth-library`
  (`generateCodeVerifierAsync` → `{codeVerifier, codeChallenge}`;
  `getToken({code, codeVerifier})` sends `code_verifier`). Do NOT add a fallback
  for its absence — it is pinned by `googleapis@^173`.
- `state` uses `crypto.randomBytes(32).toString('base64url')` (URL-safe, no query
  escaping needed). Do not weaken the entropy source.
- Mismatched-`state` callbacks are **ignored (keep listening)**, NOT rejected —
  rejecting would reintroduce the very DoS the keep-listening design avoids (any
  stray first `code=` request would kill the flow). This is load-bearing; keep it
  exactly. The bounded timeout below is what prevents an unbounded keep-listening
  wedge — the two work together.
- The listener timeout is `CONSENT_TIMEOUT_MS = 5 * 60 * 1000` (5 min — a generous
  OAuth-consent window). `auth.js` has no existing timeout to reuse. Make it the
  default of an injectable `startLoopback(expectedState, timeoutMs)` so tests drive
  the abort path with a tiny value; `unref()` the timer so a pending timeout never
  keeps the event loop alive on its own. On timeout, `waitForCode` rejects with a
  plain-language error and the caller's `finally` closes the server.
- Do NOT change `persistToken` / `persistClientJson` / `fetchEmail` / `SCOPES`, or
  the token/client JSON shapes. The `finally { server.close() }` (ADR-0004) stays.
- When uncertain: choose the simpler option and record it under "Decisions made".
  Do NOT expand scope (no keyring, no fixed-port registration, no multi-account).

## Security checklist

- [ ] The auth URL carries a high-entropy `state` and the listener resolves ONLY
      on a matching-`state` callback; a mismatched/absent-`state` request is
      ignored (keep listening), so a BLIND raced local callback cannot hijack the
      one-shot promise (a URL-observing same-terminal attacker is out of scope).
- [ ] The listener aborts after a bounded timeout (`CONSENT_TIMEOUT_MS`, 5 min)
      with a plain-language error and the server is closed, so a mismatched-`state`
      flood or an abandoned consent cannot wedge the process.
- [ ] PKCE is wired end-to-end: `code_challenge` + `code_challenge_method=S256` on
      the auth URL AND `code_verifier` in the token exchange (RFC 8252 §6 MUST) —
      this is the real code-injection defense, not `state`.
- [ ] No secret is logged or persisted beyond the existing 0600 token/client
      files; the `state`/`code_verifier` live only in memory for the command's
      lifetime, and the socket is still closed in `finally` (ADR-0004).

## Acceptance criteria

- [ ] All test cases (i) and (ii) above pass.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "gws-auth|auth|loopback|state|pkce"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Fixed/registered redirect port, OS keyring storage, or multi-account support.
- Any change to token/client persistence, scopes, or `fetchEmail`.
- The scenario harness or the google-setup skill prose (WP-012) — unchanged.
- A new ADR — this implements an explicit RFC 8252 MUST within the existing gws
  design, not a new architectural decision.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/101-gws-oauth-state-pkce`; conventional commits; PR titled
   `feat(gws): add state + PKCE to the OAuth loopback flow (WP-101)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
</content>

## Done record (2026-07-13)

Merged to main as `37b4712` (PR #102, squash). Post-audit wd-researcher check that found a real gap: the GWS OAuth loopback flow gained a random 256-bit `state` verified on callback (mismatched/absent → keep listening), a bounded 5-minute consent timeout (was: hang forever), and PKCE (`generateCodeVerifierAsync()` → `code_challenge`/S256, `codeVerifier` on token exchange — RFC 8252 §6). New THREAT-MODEL **T4b** documents the handshake. Double gate: wd-reviewer APPROVE + Codex clean; CI green. Shipped in v0.8.0.
