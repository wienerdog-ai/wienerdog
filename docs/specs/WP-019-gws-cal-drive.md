---
id: WP-019
title: Implement gws Calendar and Drive read verbs
status: In-Review
model: sonnet
size: S
depends_on: [WP-011]
adrs: [ADR-0004]
branch: wp/019-gws-cal-drive
---

# WP-019: Implement gws Calendar and Drive read verbs

## Context (read this, nothing else)

WP-011 shipped the `gws` foundation (OAuth, the authenticated-client injection seam,
and Gmail read/draft). This small WP fills in the remaining **read-first** surface:
Google **Calendar** (`cal list|show|draft-event`) and **Drive** (`drive search|read`).
These are the last pieces of the `gws` read/draft command surface described in
ARCHITECTURE: `gmail search|read|draft|send`, `cal list|show|draft-event`,
`drive search|read`.

Everything here is **read-only or draft-only** — no outbound, no grants (grants and
sending are WP-018). `cal draft-event` creates an event on the user's *own* calendar
**without notifying anyone** (`sendUpdates: 'none'`); it is "draft-like" precisely
because it sends no invitations. Sending calendar invites (notifying attendees) would
be a grant-gated outbound verb — explicitly out of scope here.

Wienerdog's iron rule (ADR-0004) still holds: `gws` runs one command and exits. No
daemon. And the OAuth scope `drive.readonly` means Drive is genuinely read-only at the
Google layer; `calendar` is read-write but this WP only lists/shows and creates
no-notify events.

## Current state

From **WP-011** (dependency; treat as fixed contracts):

- **`src/gws/client.js`** — `getServices(paths, {factory})` returns
  `{gmail, calendar, drive}` authed Google service objects (googleapis
  `calendar({version:'v3'})` and `drive({version:'v3'})`); the injection seam is
  `opts.factory` (tests pass a stub — never the network). `SCOPES` already includes
  `https://www.googleapis.com/auth/calendar` and
  `https://www.googleapis.com/auth/drive.readonly`.
- **`src/gws/gmail.js`** — the pattern to mirror: verb functions take
  `(services, opts)` and **return plain data** (no console I/O); they throw
  `WienerdogError` on bad input.
- **`src/gws/index.js`** — `run(argv)` parses `gws <group> <verb> [flags]`, builds
  `services = getServices(paths)`, and dispatches via a table that **already contains
  rows for `cal *` and `drive *`** pointing at `require('./calendar')` /
  `require('./drive')` (they throw "Cannot find module" until this WP lands). It
  renders `--json` as `JSON.stringify(result, null, 2)`, else short text, and parses
  the flags `--json`, `--max <n>`, plus you may read additional flags it forwards
  (`--from`, `--to`, `--title`, `--start`, `--end`, `--attendee`). **You do NOT modify
  index.js** — its table already routes `cal`/`drive` to your new modules. (If, on
  reading the merged WP-011 `index.js`, `cal`/`drive` are NOT already routed, that is a
  spec/dependency mismatch: note it under "Discovered issues" and add the minimal
  routing — but expect the routes to be present.)
- **`src/core/errors.js`** — `WienerdogError`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/gws/calendar.js | `cal list\|show\|draft-event` verb functions |
| create | src/gws/drive.js | `drive search\|read` verb functions |
| create | tests/unit/gws-calendar.test.js | list/show/draft-event against a stub client; JSON shape |
| create | tests/unit/gws-drive.test.js | search/read against a stub client; Google-Doc export path |

### Exact contracts

#### `src/gws/calendar.js`

```js
/** cal list — upcoming events in a window.
 *  @param {{calendar:object}} services
 *  @param {{from?:string, to?:string, max?:number}} opts  (ISO timestamps)
 *  @returns {Promise<Array<{id, summary, start, end, attendees:string[]}>>}
 *  Impl: calendar.events.list({calendarId:'primary',
 *    timeMin: opts.from || new Date().toISOString(), timeMax: opts.to,
 *    maxResults: opts.max || 20, singleEvents:true, orderBy:'startTime'}); map each
 *  item to {id, summary, start: item.start.dateTime||item.start.date,
 *    end: item.end.dateTime||item.end.date,
 *    attendees:(item.attendees||[]).map(a=>a.email)}. */
async function list(services, opts)

/** cal show — one event's detail.
 *  @param {{calendar:object}} services @param {{id:string}} opts
 *  @returns {Promise<{id, summary, description, start, end, location, attendees:string[]}>}
 *  Impl: calendar.events.get({calendarId:'primary', eventId: opts.id}). */
async function show(services, opts)

/** cal draft-event — create an event on the PRIMARY calendar WITHOUT notifying anyone.
 *  @param {{calendar:object}} services
 *  @param {{title:string, start:string, end:string, attendees?:string[]}} opts
 *  @returns {Promise<{id, htmlLink}>}
 *  Impl: calendar.events.insert({calendarId:'primary', sendUpdates:'none',
 *    requestBody:{ summary: opts.title, start:{dateTime:opts.start},
 *      end:{dateTime:opts.end},
 *      attendees:(opts.attendees||[]).map(email=>({email})) }}). `sendUpdates:'none'`
 *  is MANDATORY — this verb must never notify attendees (that would be outbound). */
async function draftEvent(services, opts)

module.exports = { list, show, draftEvent };
```

Required-flag validation: `show` needs `--id` (`opts.id`); `draft-event` needs
`--title`, `--start`, `--end`; missing → `WienerdogError` naming the flag. `--attendee`
is repeatable → `opts.attendees` array (may be empty).

#### `src/gws/drive.js`

```js
/** drive search — files matching a query.
 *  @param {{drive:object}} services @param {{query:string, max?:number}} opts
 *  @returns {Promise<Array<{id, name, mimeType, modifiedTime}>>}
 *  Impl: drive.files.list({ q: opts.query, pageSize: opts.max || 20,
 *    fields:'files(id,name,mimeType,modifiedTime)' }) → data.files. */
async function search(services, opts)

/** drive read — text content of one file.
 *  @param {{drive:object}} services @param {{id:string}} opts
 *  @returns {Promise<{id, name, mimeType, text:string}>}
 *  Impl:
 *   1. meta = drive.files.get({fileId: opts.id, fields:'id,name,mimeType'}).
 *   2. If meta.mimeType starts with 'application/vnd.google-apps.' → it's a native
 *      Google Doc: export as text/plain via drive.files.export({fileId, mimeType:'text/plain'})
 *      (only 'application/vnd.google-apps.document' is expected; other google-apps
 *      types → throw WienerdogError('drive read: unsupported Google type <mimeType>')).
 *   3. Else download bytes via drive.files.get({fileId, alt:'media'}) and decode as
 *      utf8. Return {id, name, mimeType, text}. */
async function read(services, opts)

module.exports = { search, read };
```

Required-flag validation: `search` needs a positional `<query>`; `read` needs `--id`;
missing → `WienerdogError`.

### Example I/O

```
$ wienerdog gws cal list --max 2 --json
[
  { "id":"abc","summary":"Standup","start":"2026-07-03T09:00:00+02:00",
    "end":"2026-07-03T09:15:00+02:00","attendees":["ada@acme.com"] }
]

$ wienerdog gws drive search "name contains 'Q3'" --max 1 --json
[ { "id":"1Ab...","name":"Q3 plan","mimeType":"application/vnd.google-apps.document",
    "modifiedTime":"2026-07-01T12:00:00.000Z" } ]

$ wienerdog gws drive read --id 1Ab... --json
{ "id":"1Ab...","name":"Q3 plan","mimeType":"application/vnd.google-apps.document",
  "text":"Q3 plan\n\n1. ..." }
```

## Implementation notes & constraints

- **No new runtime dependency** (googleapis added in WP-011). Node stdlib + WP-011
  modules only. JSDoc types, no TypeScript, no build step. Mirror `gmail.js`'s style
  exactly (verb functions return data; `index.js` renders).
- **Tests never hit the network.** Pass a stub `services` object whose
  `calendar.events.*` / `drive.files.*` are spies returning canned googleapis-shaped
  responses (`{data: {...}}`). Assert the mapped output shape and that `draft-event`
  always sends `sendUpdates:'none'` (spy on the insert args). For `drive read`, test
  both branches: a Google-Doc mimeType → `files.export` is called; a binary/other
  mimeType → `files.get({alt:'media'})` is called.
- **`draft-event` must never notify** — the test asserts `sendUpdates === 'none'` in
  the insert call. This is the one place calendar could become outbound; keep it
  fenced.
- Ambiguity → simpler option, record under "Decisions made". Do NOT expand scope (no
  event-invite sending, no Drive write/upload, no non-primary calendars, no shared
  drives).

## Acceptance criteria

- [ ] `cal list` maps events to `{id, summary, start, end, attendees}` with
      `singleEvents:true, orderBy:'startTime'`; `cal show` returns the detail shape.
- [ ] `cal draft-event` calls `events.insert` with `sendUpdates:'none'` (asserted) and
      returns `{id, htmlLink}`; missing `--title`/`--start`/`--end` → `WienerdogError`.
- [ ] `drive search` returns `{id, name, mimeType, modifiedTime}` items.
- [ ] `drive read` exports Google Docs as `text/plain` and downloads other files via
      `alt:'media'`; returns `{id, name, mimeType, text}`; unsupported google-apps type
      → `WienerdogError`.
- [ ] `--json` output for each verb is valid JSON of the documented shape.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern gws-calendar
npm test -- --test-name-pattern gws-drive
npm run lint
```

Live OAuth-backed calls are **manual-verification-at-M5** (against a real Google
project); unit tests cover all mapping logic with a stub client.

## Out of scope (do NOT do these)

- **Sending, send grants, calendar-invite notifications** — WP-018 / future WPs.
- **Drive write/upload, shared drives, non-primary calendars, recurrence editing.**
- **Editing `src/gws/index.js`** (its dispatch table already routes `cal`/`drive`),
  `src/gws/client.js`, `bin/wienerdog.js`, or any WP-011 file — only add
  `calendar.js` and `drive.js` + their tests.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/019-gws-cal-drive`; PR titled `feat(gws): Calendar and Drive read verbs (WP-019)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
