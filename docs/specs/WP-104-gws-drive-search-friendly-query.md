---
id: WP-104
title: gws drive search — friendly term search by default, --raw for Drive query language
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: []
branch: wp/104-gws-drive-search-friendly-query
---

# WP-104: gws drive search — friendly term search by default

> **Owner signed off 2026-07-13: option (B), friendly-by-default + `--raw`.**
> This changes the **default behavior** of `gws drive search` (see the resolved
> decision below). Captured from the appendix of
> `userreports/BUG-gws-deps-missing-after-upgrade.md`.

## Context (read this, nothing else)

**gws** is the `wienerdog gws` Google Workspace CLI, aimed at knowledge workers,
not developers (CLAUDE.md: user-facing text is plain language). `gws drive search
<query>` passes its argument **verbatim** as the Google Drive `q` parameter
(`src/gws/drive.js`, `search()` → `files.list({ q: opts.query, … })`).

Google Drive's `q` is a **query language**, not a free-text search: it requires
`<field> <operator> <value>`, e.g. `name contains 'report'` or `fullText contains
'budget'`. A bare word — the intuitive thing a knowledge worker types, e.g.
`wienerdog gws drive search budget` — is sent as `q=budget`, which the Drive API
rejects with `GaxiosError: Invalid Value` (a **query-syntax** error, surfaced as
an opaque failure — not an auth problem). So the most natural invocation fails
confusingly.

This WP makes a bare term **just work** by wrapping it as a full-text search,
while giving power users an explicit escape hatch (`--raw`) to pass Drive query
language unchanged. Read-only Drive access is unchanged (scope
`drive.readonly`); no write path is touched.

## Decision (resolved — owner chose (B), 2026-07-13)

The bug report offered two directions; they are mutually exclusive as the default:

- **(A) Document only.** Leave `q` verbatim; add the Drive query syntax to
  `--help`/error text. Zero behavior change, lowest value — the natural bare-word
  invocation still fails.
- **(B) Friendly-by-default + `--raw` (recommended).** Treat the argument as a
  plain search term by default and wrap it as `fullText contains '<term>'`; add a
  `--raw` flag that passes the argument as literal Drive `q`. Best UX for the
  target audience; **changes the default** for anyone currently relying on passing
  raw `q` (they must add `--raw`).

The architect recommends **(B)**: it matches the plain-language product voice and
fixes the reported papercut, and `--raw` fully preserves power-user queries. A
non-heuristic flag (rather than "guess whether the arg looks like a query") keeps
behavior predictable. The rest of this spec assumes (B). **If the owner picks
(A), this spec must be rewritten to a docs/help-only change.**

## Current state

**`src/gws/drive.js`** (verified against main @ d8ef87c):

```js
async function search(services, opts) {
  const res = await services.drive.files.list({
    q: opts.query,
    pageSize: opts.max || 20,
    fields: 'files(id,name,mimeType,modifiedTime)',
  });
  return (res.data && res.data.files) || [];
}

/** index.js leaves drive's own verb flags (e.g. --id) as plain tokens here. */
function parseVerbFlags(tokens) {
  const out = {};
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '--id') out.id = tokens[++i];
  }
  return out;
}

async function run(services, flags) {
  const [verb, ...rest] = flags.positionals;
  switch (verb) {
    case 'search':
      return search(services, { query: require_(rest[0], '<query>'), max: flags.max });
    case 'read': { /* ... uses parseVerbFlags(rest).id ... */ }
    default: throw new WienerdogError(`unknown drive verb: ${verb || '<none>'}`);
  }
}
```

`index.js`'s generic flag parser (`src/gws/index.js` `parseFlags`) leaves any
token it does not recognize in `flags.positionals`, so a new `--raw` token arrives
in `rest` here untouched (no change needed in `index.js`). `--max` **is** consumed
by `index.js` and arrives as `flags.max`.

**`tests/unit/gws-drive.test.js`** calls `drive.search(services, {query, max})`
directly with a stub `services.drive.files.list` that records the `args` it
receives (`seen.q`, `seen.pageSize`, `seen.fields`), and calls `drive.run(services,
{positionals:[...]})` for the verb-routing/`require_` cases. One existing case
asserts `seen.q === "name contains 'Q3'"` for `search(services, {query: "name
contains 'Q3'", max: 1})` — i.e. `search()` itself must keep passing `opts.query`
through verbatim; the **wrapping happens in `run()`**, not in `search()`. Keep it
that way so that existing test stays valid.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/gws/drive.js | add `buildDriveQuery(term, {raw})`; parse a boolean `--raw` in the `search` path; build `opts.query` from it. `search()`'s own `q: opts.query` pass-through stays unchanged. |
| modify | tests/unit/gws-drive.test.js | add cases: bare term → `fullText contains`, `--raw` → verbatim, quote-escaping. |

### Exact contracts

**1. `buildDriveQuery(term, opts)` — new pure helper in `drive.js`.**

```js
/**
 * Build the Drive `q` from a user argument. By default a plain term is wrapped
 * as a full-text search; --raw passes the argument as literal Drive query
 * language. Drive string literals are single-quoted with `\` and `'` escaped.
 * @param {string} term
 * @param {{raw?:boolean}} [opts]
 * @returns {string}
 */
function buildDriveQuery(term, opts = {}) {
  if (opts.raw) return term;
  const escaped = term.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `fullText contains '${escaped}'`;
}
```

**2. Parse `--raw` and the term in the `search` path of `run()`.** `--raw` is a
boolean flag that may appear before or after the term, so extract flags first,
then take the first remaining token as the term:

```js
case 'search': {
  const raw = rest.includes('--raw');
  const term = require_(rest.find((t) => t !== '--raw'), '<query>');
  return search(services, { query: buildDriveQuery(term, { raw }), max: flags.max });
}
```

(`--max` is already consumed upstream into `flags.max`, so it is not among
`rest`. `--raw` is the only new drive-local token to skip when picking the term.)

`search()` is unchanged — it still does `q: opts.query`.

**3. Tests (`tests/unit/gws-drive.test.js`).** Add cases driving `drive.run` with
a `list`-spy stub (assert `seen.q`):
- `run(services, {positionals: ['search', 'budget']})` → `seen.q === "fullText
  contains 'budget'"`.
- `run(services, {positionals: ['search', "name contains 'Q3'", '--raw']})` →
  `seen.q === "name contains 'Q3'"` (verbatim).
- `run(services, {positionals: ['search', "o'brien"]})` → `seen.q === "fullText
  contains 'o\\'brien'"` (single-quote escaped) — assert the exact string.
- `run(services, {positionals: ['search']})` still rejects with `/<query>/`
  (unchanged require).
- Keep the existing `drive.search(services, {query: "name contains 'Q3'"})`
  pass-through test unchanged (proves `search()` did not start wrapping).

## Implementation notes & constraints

- Zero new dependencies; pure string building. No change to `index.js`, to the
  `read` verb, or to Drive scopes (still `drive.readonly`).
- Escaping order matters: escape `\` **before** `'` (the code above does).
- Keep wrapping in `run()`, not `search()`, so `search()` stays a thin pass-through
  and the existing `search()` unit test stays valid.
- When uncertain, choose the simpler option and record it under "Decisions made".
  Do NOT add heuristic "does this look like a query?" detection — the `--raw`
  flag is the explicit, predictable escape hatch (that is the whole point of
  choosing (B) over a heuristic).

## Security checklist

- [ ] The user term is interpolated into a Drive **API query string**, not a
      shell command or a filesystem path. It is single-quote-escaped per Drive
      query rules (`\` and `'`), so a crafted term cannot break out of the string
      literal. No `path.join`, no `spawn`, no filesystem write is involved.

## Acceptance criteria

- [ ] `gws drive search <bare term>` searches file contents and returns results
      instead of an `Invalid Value` error.
- [ ] `gws drive search --raw '<drive query>'` passes the query to Drive verbatim.
- [ ] A term containing a single quote is escaped and does not break the query.
- [ ] The existing `search()` pass-through test is unchanged and passes.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "drive"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any change to `gws drive read`, to Drive scopes, or to the write path (there is
  none — Drive access is read-only).
- The deps self-heal / doctor probe — WP-102 / WP-103.
- Heuristic query detection (explicitly rejected in favor of `--raw`).

## Definition of done

1. Owner confirmed the default-behavior change to (B) (2026-07-13).
2. All verification steps pass locally; output pasted into the PR body.
3. Branch `wp/104-gws-drive-search-friendly-query`; conventional commits; PR
   titled `feat(gws): friendly drive search term + --raw escape hatch (WP-104)`.
4. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.
