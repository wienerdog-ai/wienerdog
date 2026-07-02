---
id: WP-018
title: Implement gws send grants, Gmail send, and _alert (ADR-0007)
status: In-Review
model: opus
size: M
depends_on: [WP-011]
adrs: [ADR-0007, ADR-0004]
branch: wp/018-gws-send-grants
---

# WP-018: Implement gws send grants, Gmail send, and _alert (ADR-0007)

## Context (read this, nothing else)

WP-011 shipped the `gws` foundation: OAuth, an authenticated-client injection seam,
and Gmail **read + draft**. This WP adds the **outbound** half — the one place
Wienerdog can send email — under the strict governance of **ADR-0007 (graduated
sending / send grants)**. It builds three things:

1. **`wienerdog grant send`** — the *only* way a send grant is ever created. An
   interactive command with a **typed confirmation** that names the routine and the
   exact recipients. No skill, hook, dream, or headless job can create or widen a
   grant.
2. **`gws gmail send`** — executes a real send *only* when a matching grant exists.
   With no matching grant it does **not error**: it degrades to creating a **draft +
   a notice** (fail-safe, fail-visible).
3. **`gws _alert`** — a fixed-template mail to the **user's own address** for
   watchdog fail-loud (`run-job`). This is a built-in self-grant: it never needs a
   configured grant because the recipient is always the authenticated account itself.

The governing invariant (ADR-0007, Threat model T4a — outbound as an exfiltration
channel): **grants are mechanics, not model-writable surface.** They live in
`~/.wienerdog/config.yaml`, created exclusively by the interactive CLI with a typed
confirmation that lives *outside any model context*. Injected content therefore
cannot mint a grant, and cannot exfiltrate email beyond a granted recipient
allowlist. The dream job has no `gws` access at all. Marketing promise: "your AI can
only send what you explicitly granted, to whom you granted it."

ADR-0004 still holds: `gws`/`grant` run one command and exit. No daemon.

**Grant enforcement is in CODE, not in prompts** (ARCHITECTURE: "governance enforced
in the CLI, not in prompts"). A skill telling the model "you may send" changes
nothing — `gws gmail send` consults the grant file itself.

## Current state

From **WP-011** (dependency; treat as fixed contracts):

- **`src/gws/client.js`** — `getServices(paths, {factory})` returns
  `{gmail, calendar, drive}` authed Google service objects; injection seam via
  `opts.factory` (tests pass a stub, never hitting the network). Also
  `tokenPath(paths)`, `loadToken(paths)`, `SCOPES` (includes `gmail.compose`, which
  authorizes sending at the Google layer — the *grant* gate is Wienerdog's own, on
  top). `require('googleapis')` appears only inside `getServices`.
- **`src/gws/gmail.js`** — exports `search`, `read`, `draft`, and
  `buildMime({to, subject, body, from})` (RFC-2822 → base64url). Verb functions take
  `(services, opts)` and **return plain data** (no console I/O). `draft` calls
  `gmail.users.drafts.create({userId:'me', requestBody:{message:{raw}}})` → returns
  `{draftId, messageId}`. **You extend this file with `send`.**
- **`src/gws/index.js`** — `run(argv)` parses `gws <group> <verb> [flags]`, builds
  `services = getServices(paths)` for non-`auth` groups, and dispatches via a table
  that **already contains rows for `gmail send` and `_alert`** pointing at
  `require('./gmail').send` and `require('./alert').run` (they throw "Cannot find
  module"/"not a function" until this WP lands). It renders `--json` as
  `JSON.stringify(result, null, 2)`, else short text. Flags include `--to`,
  `--subject`, `--body`, `--json`, and it can pass through additional flags you add
  (`--routine`). Verb functions throw `WienerdogError` for bad input.
- **`bin/wienerdog.js`** — dispatches top-level commands via a `commands` map
  (`{init, sync, doctor, uninstall, gws}`). You add `grant`.

From **WP-003** (installer core):

- **`src/cli/init.js`** writes `config.yaml` and records it in the manifest with a
  content `hash`; after later rewriting it (vault path) it **re-syncs the recorded
  hash** so `uninstall` doesn't mistake Wienerdog's own edit for a user edit
  (`init.js` lines ~150-156 — mirror this pattern when you write a grant).
- **`src/core/manifest.js`** — `load(paths)`, `record`, `save(paths, manifest)`;
  `reverse` skips a `config.yaml` whose hash no longer matches the recorded hash
  ("keeping … — modified since install"). **You do NOT modify manifest.js.** Instead,
  after writing a grant into `config.yaml`, update the recorded hash (below) so
  `uninstall` still removes it cleanly.
- **`src/core/paths.js`** — `getPaths(env)` → `{..., config, secrets, ...}`.
- **`src/core/errors.js`** — `WienerdogError`.

The initial `config.yaml` (WP-003) is flat top-level YAML (`version`, `vault`,
`harnesses:`, `memory_mode`); it is read elsewhere by a **minimal line-based reader
that only parses un-indented `key: value` lines and ignores comments and indented
lines**. Your grants block must not break that reader (it won't — see format).

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/gws/grant.js | grants managed-section in config.yaml (read/write + manifest-hash sync), matching, degradation decision |
| create | src/cli/grant.js | interactive `wienerdog grant send` with typed confirmation |
| modify | bin/wienerdog.js | add `grant` to the `commands` map + one usage line |
| modify | src/gws/gmail.js | add `send(services, opts)` — grant-gated; degrade to draft |
| create | src/gws/alert.js | `gws _alert` fixed-template self-send |
| create | tests/unit/gws-grant.test.js | matching, degradation, config round-trip, manifest-hash sync, confirmation gating |
| create | tests/unit/gws-send.test.js | send gating + degrade-to-draft + `_alert` self-send (stub client) |

### Exact contracts

#### Grant storage format in `config.yaml`

Grants live in a **managed section** appended to `config.yaml`, delimited by fixed
comment sentinels. Every grant line is written as **real, indented YAML** under a
top-level `grants:` key so a future YAML parser reads it correctly, while the
existing minimal line-based reader ignores the indented lines and the comment
fences. `grant.js` owns parsing this section (it knows the exact shape it writes) —
it never parses arbitrary YAML.

```yaml
# --- wienerdog:grants (managed by `wienerdog grant`; do not edit by hand) ---
grants:
  - routine: daily-digest
    to:
      - gyula@example.com
  - routine: weekly-review
    to:
      - gyula@example.com
      - ada@example.com
# --- end wienerdog:grants ---
```

Sentinels — the exact begin and end lines (each a full line, including the
leading `#`):

```text
# --- wienerdog:grants (managed by `wienerdog grant`; do not edit by hand) ---
# --- end wienerdog:grants ---
```

If no grants exist, the whole section (including the `grants:` key) is absent from
the file.

#### `src/gws/grant.js`

```js
/** Parse the grants managed-section out of config.yaml content.
 *  @param {string} configText @returns {Array<{routine:string, to:string[]}>}
 *  Reads only between the two sentinels; tolerant of the exact block this module
 *  writes. Absent section → []. */
function parseGrants(configText)

/** Return config.yaml content with the grants section replaced by `grants`
 *  (removed entirely if grants is empty). Everything OUTSIDE the sentinels is
 *  preserved byte-for-byte; the section is (re)written just before EOF with exactly
 *  one blank line before it. @param {string} configText
 *  @param {Array<{routine:string, to:string[]}>} grants @returns {string} */
function renderConfigWithGrants(configText, grants)

/** Upsert one grant (add, or replace an existing grant with the same routine) and
 *  persist config.yaml, then re-sync the manifest hash so uninstall stays clean.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {{routine:string, to:string[]}} grant
 *  Steps: read config.yaml; grants = parseGrants; replace/insert by routine (dedup
 *  `to`, preserve order); next = renderConfigWithGrants(...); write config.yaml;
 *  load manifest; find the {kind:'file', path: paths.config} entry and set its
 *  `hash` = sha256(next) (mirror init.js); save manifest. */
function saveGrant(paths, grant)

/** Look up the grant for a routine. @param {WienerdogPaths} paths
 *  @param {string|null} routine @returns {{routine, to:string[]}|null} (null if routine null/absent) */
function findGrant(paths, routine)

/** THE ENFORCEMENT DECISION (pure; unit-tested).
 *  @param {{routine:string, to:string[]}|null} grant  the matching grant, or null
 *  @param {string[]} recipients  the send's actual recipients
 *  @returns {{allowed:boolean, reason:string}}
 *  allowed=true IFF grant is non-null AND every recipient is in grant.to
 *  (case-insensitive, trimmed exact-address match — no wildcards). Otherwise
 *  allowed=false with a plain-language reason naming what was missing. */
function isSendAllowed(grant, recipients)

module.exports = { parseGrants, renderConfigWithGrants, saveGrant, findGrant, isSendAllowed };
```

Recipient matching is **exact address, case-insensitive, no wildcards, no domain
grants** — the narrowest safe rule (ADR-0007). A send to 3 recipients requires all 3
to be listed.

#### `src/cli/grant.js` — `wienerdog grant send`

```js
/** `wienerdog grant send --routine <name> --to <a@b>[,<c@d>...]`
 *  @param {string[]} argv @returns {Promise<void>} */
async function run(argv)
```
Behavior:
- Sub-verb must be `send` (only verb in v1). Parse `--routine <name>` (required) and
  `--to <comma-separated addresses>` (required, ≥1). Missing/empty → `WienerdogError`
  naming the flag. Basic address sanity: each `to` contains exactly one `@` and a dot
  after it; else `WienerdogError`.
- Print a plain-language summary and require a **typed confirmation** — the user must
  type the exact word `grant` (not just `y`) to proceed:
  ```
  You are about to let the "daily-digest" routine SEND email to:
    - gyula@example.com
  Anything this routine emails will go to those addresses without further prompting.
  Type the word "grant" to confirm (anything else cancels):
  ```
  Read one line via `readline`; proceed only if the trimmed input === `grant`. `--yes`
  does **NOT** bypass this (unlike other commands): a grant always requires the typed
  word. If a recipient is not the user's own account, print an extra warning line
  ("These are third-party addresses; email sent here leaves your control.") before the
  prompt. (Determining "own account" cheaply: compare against the authenticated
  address if a token exists — `require('../gws/client').loadToken` + a best-effort
  `getProfile`; if unavailable, treat all as third-party and warn. Keep this
  best-effort; never fail the grant because the profile lookup failed.)
- On confirm: `require('../gws/grant').saveGrant(paths, {routine, to})`; print
  `wienerdog: granted "<routine>" → <recipients>.` On cancel: print `Cancelled.` and
  return (exit 0, no change).

#### `src/gws/gmail.js` — add `send`

```js
/** gmail send — grant-gated. Sends ONLY under a matching send grant; otherwise
 *  degrades to a draft + notice (never throws for missing grant).
 *  @param {{gmail:object}} services
 *  @param {{to:string, subject:string, body:string, routine:string|null,
 *           paths:import('../core/paths').WienerdogPaths}} opts
 *  @returns {Promise<{sent:boolean, degraded:boolean, draftId?:string,
 *                     messageId?:string, notice?:string}>}
 *  Steps:
 *   1. recipients = split opts.to on ',' (trim). routine = opts.routine (may be null).
 *   2. grant = require('./grant').findGrant(opts.paths, routine);
 *      decision = require('./grant').isSendAllowed(grant, recipients).
 *   3. If decision.allowed: raw = buildMime(opts);
 *      res = gmail.users.messages.send({userId:'me', requestBody:{raw}});
 *      return {sent:true, degraded:false, messageId: res.data.id}.
 *   4. Else (no/insufficient grant): create a draft instead —
 *      d = draft(services, opts);  return {sent:false, degraded:true,
 *      draftId:d.draftId, messageId:d.messageId,
 *      notice:`No matching send grant (${decision.reason}); saved a draft instead. `
 *              + `Run: wienerdog grant send --routine <name> --to <recipients>`}. */
async function send(services, opts)
```
Add `send` to `module.exports`. The routine for a headless job is passed by the
caller; `index.js` resolves it from `--routine <name>` **or** `process.env.WIENERDOG_JOB`
(the scheduler's job name, WP-013) **or** null. A null routine can never match a
grant → always degrades to draft (correct fail-safe).

#### `src/gws/alert.js` — `gws _alert`

```js
/** gws _alert — fixed-template mail to the user's OWN address (built-in self-grant;
 *  no configured grant needed). Used by run-job fail-loud (WP-013).
 *  @param {{gmail:object}} services @param {{subject:string, body:string}} opts
 *  @returns {Promise<{sent:boolean, to:string, messageId:string}>}
 *  Steps: self = (await gmail.users.getProfile({userId:'me'})).data.emailAddress;
 *  compose with a FIXED template — subject prefixed `[wienerdog alert] <subject>`,
 *  body wrapped with a fixed preamble/footer identifying it as an automated
 *  Wienerdog alert; raw = buildMime({to:self, subject:'[wienerdog alert] '+subject,
 *  body:<templated>}); send via gmail.users.messages.send. Return {sent, to:self,
 *  messageId}. `_alert` bypasses the grant layer BECAUSE recipient is always self —
 *  assert `to === self` before sending; if getProfile fails, throw WienerdogError
 *  (do NOT fall back to any other address). */
async function run(services, opts)
module.exports = { run };
```
`_alert` never accepts a recipient argument — the recipient is *always* the
authenticated account. This is the only send path that skips the grant check, and it
is safe precisely because it cannot address anyone but the user.

#### `bin/wienerdog.js` (modify)

Add `grant: () => require('../src/cli/grant')` to the `commands` map and one usage
line (aligned with the existing entries):

```text
  grant       Authorize a routine to send email (typed confirmation required)
```

### Example I/O

```
$ wienerdog grant send --routine daily-digest --to gyula@example.com
You are about to let the "daily-digest" routine SEND email to:
  - gyula@example.com
...
Type the word "grant" to confirm (anything else cancels): grant
wienerdog: granted "daily-digest" → gyula@example.com.

$ wienerdog gws gmail send --to gyula@example.com --subject "Digest" --body "..." --routine daily-digest --json
{ "sent": true, "degraded": false, "messageId": "18f..." }

$ wienerdog gws gmail send --to attacker@evil.com --subject "x" --body "y" --routine daily-digest --json
{ "sent": false, "degraded": true, "draftId": "r-9...", "messageId": "18f...",
  "notice": "No matching send grant (recipient attacker@evil.com not in allowlist); saved a draft instead. Run: wienerdog grant send --routine <name> --to <recipients>" }
```

## Implementation notes & constraints

- **No new runtime dependency** (googleapis already added in WP-011). Node stdlib +
  the WP-011 modules only. JSDoc types, no TypeScript, no build step.
- **Tests never hit the network.** `gws-send.test.js` passes a stub `services` whose
  `gmail.users.messages.send` / `drafts.create` / `getProfile` are spies returning
  canned data; assert send happens only when a grant matches, and that a missing/
  insufficient grant produces a draft + notice. `gws-grant.test.js` operates on a
  temp `config.yaml` (via a temp `WIENERDOG_HOME` + `init --yes`, or a hand-written
  config) and asserts: round-trip `parseGrants`/`renderConfigWithGrants` preserves
  content outside the sentinels byte-for-byte; `isSendAllowed` truth table
  (exact/case-insensitive match, partial-recipient denial, null-grant denial,
  null-routine denial); `saveGrant` upserts by routine and re-syncs the manifest hash
  so a subsequent `uninstall` still removes `config.yaml`.
- **The typed confirmation is the security boundary** (ADR-0007). It is driven by
  `readline` on real stdin; `--yes` must NOT bypass it. For unit-testing the CLI
  confirmation, structure `src/cli/grant.js` so the prompt/read step is injectable
  (e.g. an internal `promptFn` defaulting to the readline reader) — the test passes a
  fake that returns `"grant"` (proceeds) or `"nope"` (cancels, asserts no write).
- **`config.yaml` reversibility:** after any grant write, the recorded manifest hash
  MUST be updated to `sha256(newContent)` (mirror `init.js`), so `uninstall` removes
  `config.yaml` (and empties the core) rather than "keeping … modified since install".
  A test asserts this end to end (write grant → `manifest.reverse` removes config).
- **`_alert` bypasses grants only because recipient === self.** Assert it before
  sending; never add a recipient parameter. This keeps the self-send from becoming an
  exfiltration path.
- Ambiguity → simpler option, record under "Decisions made". Do NOT expand scope
  (no `grant list`/`grant revoke`, no domain/wildcard grants, no calendar-invite
  sending — all future WPs).

## Acceptance criteria

- [ ] `wienerdog grant send --routine X --to a@b` writes the managed grants section
      to `config.yaml` **only after** the user types `grant`; typing anything else
      cancels with no change; `--yes` does not bypass the typed confirmation.
- [ ] `parseGrants`/`renderConfigWithGrants` round-trip; content outside the sentinels
      is byte-identical; removing all grants removes the whole section.
- [ ] `isSendAllowed`: allows only when every recipient is in `grant.to`
      (case-insensitive, exact address); denies null grant, null routine, and
      partial-recipient matches, each with a reason.
- [ ] `gws gmail send` with a matching grant calls `messages.send` (stub spy) and
      returns `{sent:true}`; with no/insufficient grant it creates a draft and returns
      `{sent:false, degraded:true, notice:...}` and **does not throw**.
- [ ] A null routine (no `--routine`, no `WIENERDOG_JOB`) always degrades to draft.
- [ ] `gws _alert` sends only to the authenticated account's own address (stub
      `getProfile`), with the fixed `[wienerdog alert]` template; throws if the
      profile lookup fails (no fallback recipient).
- [ ] After a grant write, `manifest.reverse` still removes `config.yaml` (hash
      re-synced) — uninstall leaves no residue.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern gws-grant
npm test -- --test-name-pattern gws-send
npm run lint
# Manual confirmation UX (temp machine):
export WIENERDOG_HOME=$(mktemp -d)/wd
node bin/wienerdog.js init --yes >/dev/null
printf 'grant\n' | node bin/wienerdog.js grant send --routine daily-digest --to me@example.com
grep -n 'wienerdog:grants' "$WIENERDOG_HOME/config.yaml"
node bin/wienerdog.js uninstall --yes >/dev/null && test ! -f "$WIENERDOG_HOME/config.yaml" && echo "config removed cleanly"
```

Live OAuth-backed send/alert is **manual-verification-at-M5** (against a real Google
project); unit tests cover all gating/degradation logic with a stub client.

## Out of scope (do NOT do these)

- **`gws cal *` / `gws drive *`** — WP-019.
- **`grant list` / `grant revoke`, domain or wildcard grants, third-party-invite
  sending on calendar events** — future WPs.
- **The routine catalog / daily-digest routine that consumes a self-grant** — WP-014.
- **Editing `src/core/manifest.js`, `src/core/paths.js`, `src/cli/init.js`, or the
  `config.yaml` initial template** — only append the managed grants section at runtime
  and re-sync the hash.
- **Any send path that skips the grant check other than `_alert`-to-self.**

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/018-gws-send-grants`; PR titled `feat(gws): send grants, Gmail send, and _alert (WP-018)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
