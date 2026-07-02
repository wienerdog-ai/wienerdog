---
id: WP-011
title: Implement gws foundation (OAuth auth, client seam, Gmail read/draft)
status: Ready
model: opus
size: M
depends_on: [WP-003]
adrs: [ADR-0004]
branch: wp/011-gws-foundation
---

# WP-011: Implement gws foundation (OAuth auth, client seam, Gmail read/draft)

## Context (read this, nothing else)

`wienerdog gws` is Wienerdog's thin Google Workspace CLI. Skills (running headless
via `claude -p` / `codex exec`) and the user both drive it to read Gmail, Calendar
and Drive and to draft mail — never to send, unless a later, grant-gated verb
allows it. This WP builds the **foundation** of that CLI plus its first read
surface (**Gmail read + draft**). Calendar and Drive read verbs are **WP-019**;
sending, send grants, and `_alert` are **WP-018** — both build on what you ship
here.

Wienerdog's iron rule (ADR-0004): **Wienerdog is just files. No daemon, no server,
no process that outlives its job.** `gws` runs one command and exits. The one place
that briefly touches the network beyond Google's APIs is the OAuth loopback in
`gws auth`: it opens a temporary local HTTP listener on an ephemeral port **only
for the seconds of the consent redirect**, then closes it. That listener is not a
server in the ADR-0004 sense — it is bounded to a single request during an
interactive `auth` run and torn down before the command returns.

`googleapis` (the official Google Node client) is the **single ADR-approved runtime
dependency** in the whole project (every other module is zero-dependency Node
stdlib). Adding it to `package.json` `dependencies` is a deliverable of this WP; do
not add any other runtime dependency.

Two design rules govern everything here:

1. **Governance is enforced in the CLI, not in prompts.** The scope set below
   (`gmail.readonly`, `gmail.compose`, `calendar`, `drive.readonly`) is what the
   user consents to. `gmail.compose` technically permits sending at the Google
   layer, but Wienerdog code never calls `messages.send` in this WP at all — draft
   is the only write verb, and it is inherently safe. Sending is gated by a
   **send grant** (ADR-0007) that arrives in WP-018.
2. **`googleapis` must be mockable so tests never hit the network.** Every code path
   that talks to Google goes through one **injection seam** (`getServices`, below).
   Unit tests pass a fake factory; the real OAuth consent flow is verified by hand
   at milestone M5 (marked below).

## Current state

These files exist from **Done** WPs. Treat their signatures as fixed contracts.

- **`bin/wienerdog.js`** (WP-003) — dispatches `init | sync | doctor | uninstall`
  to `src/cli/<cmd>.js`, each exporting `async function run(argv)`. It builds a
  `commands` map (`{init: () => require('../src/cli/init'), ...}`), looks up
  `argv[0]`, and calls `loader().run(rest)`. Unknown command → prints `USAGE` to
  stderr, exit 2. Thrown `WienerdogError` → `bin` prints `wienerdog: <message>` and
  exits 1; any other error re-throws with a full stack. You will add one entry to
  the `commands` map and one usage line.
- **`src/core/paths.js`** (WP-003) —
  ```js
  /** @returns {{home, core, config, state, secrets, logs, manifest,
   *             claudeDir, codexDir, vault}} — core = $WIENERDOG_HOME || ~/.wienerdog */
  function getPaths(env = process.env)
  ```
  `secrets` = `<core>/secrets` (created mode 0700 by `init`). There is **no**
  `gws`/token path in `getPaths`; derive token/client paths locally (below).
- **`src/core/errors.js`** (WP-003) — `class WienerdogError extends Error`. Throw it
  for every expected failure (missing token, unknown subcommand, bad flags); `bin`
  turns it into `wienerdog: <message>` + exit 1. Never `process.exit` from inside
  `src/gws/*` — throw instead, except the top-level `run(argv)` in `index.js` which
  may set `process.exitCode`.
- **`package.json`** — currently `dependencies` is **absent** (only
  `devDependencies` with markdownlint). `engines.node` is `>=18`. `files` includes
  `src/`. You add a `dependencies` block.

Nothing under `src/gws/` exists — you are creating it.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | package.json | add `dependencies: { "googleapis": "<pinned>" }` (the one ADR-approved runtime dep) |
| modify | bin/wienerdog.js | add `gws` to the `commands` map + one usage line |
| create | src/gws/index.js | `run(argv)`: parse `gws <group> <verb> [flags]`, dispatch table (lazy require), `--json`/text rendering |
| create | src/gws/auth.js | `gws auth`: OAuth loopback flow; persist token + client JSON (0600) |
| create | src/gws/client.js | `getServices` factory + injection seam; token load/refresh; `SCOPES` |
| create | src/gws/gmail.js | `gmail search\|read\|draft` verb functions |
| create | tests/unit/gws-client.test.js | seam, token perms 0600, SCOPES, `persistToken` |
| create | tests/unit/gws-gmail.test.js | search/read/draft against a stub client; JSON output shape |

### Exact contracts

#### `src/gws/client.js`

```js
'use strict';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
];

/** Absolute path of the OAuth token file. @param {WienerdogPaths} paths @returns {string} */
function tokenPath(paths)        // path.join(paths.secrets, 'google-token.json')

/** Absolute path of the saved Cloud-Console client JSON. @returns {string} */
function clientJsonPath(paths)   // path.join(paths.secrets, 'google-client.json')

/** Load and JSON.parse the token file. Throws WienerdogError with a plain-language
 *  "run `wienerdog gws auth` first" message if the file is missing/unreadable/invalid. */
function loadToken(paths)        // → object

/** Load and JSON.parse the saved client JSON. Throws WienerdogError likewise. */
function loadClientJson(paths)   // → object  ({ installed: {...} } or { web: {...} })

/** Write the token file atomically at mode 0600 (temp file + rename + chmod 0600).
 *  Creates paths.secrets if absent (mode 0700). @param {object} token */
function persistToken(paths, token)

/** Write the client JSON to clientJsonPath at mode 0600 (same atomic + chmod). */
function persistClientJson(paths, clientJson)

/** THE INJECTION SEAM. Build authenticated Google service objects.
 *  @param {WienerdogPaths} paths
 *  @param {{factory?: (auth:object)=>{gmail:object,calendar:object,drive:object},
 *           googleapis?: object}} [opts]
 *  @returns {{gmail:object, calendar:object, drive:object}}
 *  Behavior:
 *   - token = loadToken(paths); client = loadClientJson(paths).
 *   - If opts.factory is provided, return opts.factory(token) directly and touch
 *     NO real googleapis. (Unit-test seam: tests pass a factory returning stubs.)
 *   - Else: const { google } = opts.googleapis || require('googleapis');
 *     const cfg = client.installed || client.web;
 *     const oauth = new google.auth.OAuth2(cfg.client_id, cfg.client_secret,
 *                       cfg.redirect_uris ? cfg.redirect_uris[0] : undefined);
 *     oauth.setCredentials(token);
 *     return { gmail: google.gmail({version:'v1', auth:oauth}),
 *              calendar: google.calendar({version:'v3', auth:oauth}),
 *              drive: google.drive({version:'v3', auth:oauth}) }; */
function getServices(paths, opts = {})

module.exports = { SCOPES, tokenPath, clientJsonPath, loadToken, loadClientJson,
  persistToken, persistClientJson, getServices };
```

`require('googleapis')` must appear **only inside `getServices`/`auth.js`**, never
at module top level — so unit tests that use the seam never load the real package
and never hit the network.

#### `src/gws/auth.js`

```js
/** Run the interactive OAuth loopback flow and persist the token.
 *  @param {WienerdogPaths} paths
 *  @param {{clientPath?: string, googleapis?: object, oauthClient?: object,
 *           openBrowser?: (url:string)=>void}} opts
 *  @returns {Promise<{email:string|null, tokenPath:string}>}
 *  Steps:
 *   1. Read the Cloud-Console Desktop-app client JSON from opts.clientPath
 *      (the `--client <path>` flag). It has shape { installed: { client_id,
 *      client_secret, redirect_uris, auth_uri, token_uri } }. Persist a copy to
 *      clientJsonPath(paths) (0600) so future calls can refresh tokens.
 *   2. Build an OAuth2 client (opts.oauthClient injectable for tests; else
 *      new (opts.googleapis||require('googleapis')).google.auth.OAuth2(...)).
 *   3. Start an http listener on 127.0.0.1:0 (ephemeral port). redirect_uri =
 *      `http://127.0.0.1:<port>/`.
 *   4. authUrl = oauth.generateAuthUrl({ access_type:'offline', prompt:'consent',
 *      scope: SCOPES }). Print it and call opts.openBrowser?.(authUrl).
 *   5. On the single loopback request, read `?code=...`, respond with a small
 *      "You can close this tab" HTML page, and CLOSE the listener immediately.
 *   6. token = (await oauth.getToken(code)).tokens; oauth.setCredentials(token);
 *      persistToken(paths, token).
 *   7. Best-effort read the account email via gmail.users.getProfile for the
 *      confirmation line; null on failure. Return { email, tokenPath }. */
async function run(paths, opts)
```

The listener MUST be closed in a `finally` before `run` resolves — no socket may
outlive the command (ADR-0004). `prompt:'consent'` + `access_type:'offline'` is
required to receive a **refresh token** (without it Google omits it on re-auth).

#### `src/gws/gmail.js`

Verb functions take `(services, opts)` and **return plain data** — they perform no
console I/O (that is `index.js`'s job). `services` is the object from
`getServices`; tests pass a stub with just the methods used.

```js
/** gmail search — list message headers matching a Gmail query.
 *  @param {{gmail:object}} services @param {{query:string, max?:number}} opts
 *  @returns {Promise<Array<{id, threadId, from, subject, date, snippet}>>}
 *  Impl: gmail.users.messages.list({userId:'me', q:opts.query,
 *          maxResults: opts.max || 20}); then for each id
 *        gmail.users.messages.get({userId:'me', id, format:'metadata',
 *          metadataHeaders:['From','Subject','Date']}) → pull headers + snippet. */
async function search(services, opts)

/** gmail read — full plaintext of one message.
 *  @param {{gmail:object}} services @param {{id:string}} opts
 *  @returns {Promise<{id, from, to, subject, date, body}>}
 *  Impl: messages.get({userId:'me', id, format:'full'}); walk payload parts for the
 *  first text/plain body (base64url-decode); fall back to the top-level snippet. */
async function read(services, opts)

/** gmail draft — create a draft (NO send; safe, ungated).
 *  @param {{gmail:object}} services
 *  @param {{to:string, subject:string, body:string}} opts
 *  @returns {Promise<{draftId, messageId}>}
 *  Impl: raw = buildMime(opts); gmail.users.drafts.create({userId:'me',
 *          requestBody:{ message:{ raw } }}). */
async function draft(services, opts)

/** Build an RFC-2822 message, base64url-encoded (no padding, '+/'→'-_').
 *  @param {{to:string, subject:string, body:string, from?:string}} m
 *  @returns {string} */
function buildMime(m)   // exported for reuse by gmail send (WP-018)

module.exports = { search, read, draft, buildMime };
```

`buildMime` output (headers `To`, `Subject`, `Content-Type: text/plain; charset="UTF-8"`,
blank line, body), then `Buffer.from(mime).toString('base64url')`.

#### `src/gws/index.js` (the `gws` entry point)

```js
/** `wienerdog gws <group> <verb> [flags]`.
 *  @param {string[]} argv   // e.g. ['gmail','search','from:boss','--json','--max','5']
 *  @returns {Promise<void>} */
async function run(argv)
```

Behavior:
- Parse `group = argv[0]`, `verb = argv[1]`, then flags. Global flag `--json`
  selects machine output; positional/`--`flags per verb (below). Unknown group/verb
  → throw `WienerdogError('unknown gws command: <group> <verb>')`.
- **Dispatch table** — a `<group> <verb>` → handler map, with `require` done lazily
  inside each handler so a group whose module is not shipped yet fails only when
  invoked:

```text
auth                 → require('./auth').run(paths, {clientPath})  (needs --client <path>)
gmail search <query> → require('./gmail').search(services, {query, max})
gmail read <id>      → require('./gmail').read(services, {id})
gmail draft          → require('./gmail').draft(services, {to, subject, body})
gmail send           → require('./gmail').send(...)   [WP-018; until then require throws]
cal   <verb>         → require('./calendar')...       [WP-019]
drive <verb>         → require('./drive')...          [WP-019]
_alert               → require('./alert').run(...)    [WP-018]
```

  Ship the whole table now. Rows whose module does not yet exist throw a clean
  "Cannot find module" only when that command is invoked; WP-011 tests never invoke
  them. Do **not** stub the missing modules.
- For every group except `auth`, build `services = getServices(paths)` once and pass
  it to the verb. (`auth` needs no token yet.)
- **Rendering:** verb functions return data. If `--json`, print
  `JSON.stringify(result, null, 2)`. Else print a short human table/summary (e.g.
  search → one line per message `<date>  <from>  <subject>`). Rendering is
  best-effort text; only the `--json` shape is a tested contract.
- Flags: `--json` (bool), `--max <n>`, `--to <s>`, `--subject <s>`, `--body <s>`,
  `--client <path>`. Missing required flags → `WienerdogError` naming the flag.

#### `bin/wienerdog.js` (modify)

Add `gws: () => require('../src/gws/index')` to the `commands` map and one line to
`USAGE` (aligned with the existing entries):

```text
  gws         Read Gmail/Calendar/Drive and draft mail (Google Workspace)
```

Nothing else in `bin` changes.

#### `package.json` (modify)

Add a top-level `dependencies` block with `googleapis` pinned to a specific current
major (choose the latest stable major available at implementation time, pinned with
`^`, e.g. `"googleapis": "^140.0.0"` — record the exact version you pinned under
"Decisions made"). Do not add any other runtime dependency. Leave
`devDependencies`, `files`, and the markdownlint config untouched.

### Example I/O

```
$ wienerdog gws gmail search "from:boss is:unread" --max 2 --json
[
  { "id":"18f...","threadId":"18f...","from":"Boss <boss@acme.com>",
    "subject":"Q3 plan","date":"Wed, 2 Jul 2026 09:12:00 +0000",
    "snippet":"Can you review the deck before..." }
]

$ wienerdog gws gmail draft --to ada@acme.com --subject "Re: deck" --body "On it." --json
{ "draftId":"r-482...","messageId":"18f..." }
```

## Implementation notes & constraints

- **`googleapis` is the ONLY new runtime dependency.** Node stdlib for everything
  else. JSDoc types, no TypeScript, no build step (CLAUDE.md).
- **Never touch the real network in tests.** `gws-gmail.test.js` passes a stub
  `services` object; `gws-client.test.js` exercises `getServices` with `opts.factory`
  and `persistToken`/`loadToken` against a temp `paths.secrets`. `require('googleapis')`
  must never execute during `npm test`.
- **Token file security (Threat model T4):** `persistToken` writes mode 0600 and
  lives under `<core>/secrets/` — outside the vault and any git repo. The test
  asserts the mode. Same for the copied client JSON.
- **The live OAuth consent flow is verified by hand at M5** (`wd-researcher`/owner
  runs `gws auth --client <downloaded.json>` against a real Cloud project). The
  loopback + browser-open path is therefore **not** unit-tested end to end; only
  `persistToken`, `loadToken`, `getServices` seam, and the token exchange (with an
  injected `oauthClient`) are.
- Tests set `WIENERDOG_HOME` to an `fs.mkdtemp` dir and run `init --yes` (or create
  `secrets/` directly at 0700) so `paths.secrets` exists; never touch real `$HOME`.
- Ambiguity → choose the simpler option and record it under "Decisions made". Do NOT
  expand scope (no send verb, no calendar/drive here).

## Acceptance criteria

- [ ] `getServices(paths, {factory})` returns exactly the factory's object and
      loads NO real googleapis (assert by passing a factory and a token file, with
      no network available).
- [ ] `persistToken` writes `<secrets>/google-token.json` at mode 0600;
      `loadToken` round-trips it; a missing token throws a `WienerdogError` telling
      the user to run `wienerdog gws auth`.
- [ ] `SCOPES` equals exactly the four scopes above, in order.
- [ ] `gmail.search` against a stub client returns the mapped header array;
      `gmail.read` returns decoded plaintext; `gmail.draft` calls
      `drafts.create` (asserted via a stub spy) and returns `{draftId, messageId}`.
- [ ] `--json` output for each gmail verb is valid JSON of the documented shape.
- [ ] `wienerdog gws gmail search ...` with no token exits 1 with the
      `wienerdog: ...` auth message (WienerdogError path).
- [ ] `package.json` has `dependencies.googleapis`; `npm test` and `npm run lint`
      pass (googleapis need not be installed for the mocked tests, but CI installs
      it — see verification).

## Verification steps (run these; paste output in the PR)

```bash
npm install                 # pulls googleapis per the new dependency
npm test -- --test-name-pattern gws
npm run lint
node -e "console.log(require('./src/gws/client').SCOPES.join('\n'))"
# No-token error path:
export WIENERDOG_HOME=$(mktemp -d)/wd
node bin/wienerdog.js init --yes >/dev/null
node bin/wienerdog.js gws gmail search "test" 2>&1 || echo "(exited non-zero as expected)"
```

## Out of scope (do NOT do these)

- **Sending, send grants, `wienerdog grant`, and `gws _alert`** — WP-018 (ADR-0007).
  Do not add a `send` function or any grant logic. The `gmail send` / `_alert` rows
  in the dispatch table are placeholders that throw until WP-018.
- **`gws cal *` and `gws drive *`** — WP-019. Do not create `calendar.js`/`drive.js`.
- **The guided Cloud-Console OAuth walk-through skill** (`/wienerdog-google-setup`) —
  WP-012. This WP ships only the `gws auth` command it invokes.
- **Editing `src/core/paths.js`, `manifest.js`, `init.js`, or `config.yaml`
  format.** Derive token/client paths locally under `paths.secrets`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/011-gws-foundation`; PR titled `feat(gws): implement gws foundation — auth, client, Gmail read/draft (WP-011)`.
3. PR template filled, including "Decisions made" (incl. the pinned googleapis
   version) and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
