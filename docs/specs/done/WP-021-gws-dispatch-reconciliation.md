---
id: WP-021
title: Reconcile gws dispatch with verb-module contracts
status: Done
model: sonnet
size: S
depends_on: [WP-018, WP-019]
adrs: [ADR-0007]
branch: wp/021-gws-dispatch
---

# WP-021: Reconcile gws dispatch with verb-module contracts

## Context (read this, nothing else)

`wienerdog gws` is the Google Workspace CLI. WP-011 shipped `src/gws/index.js` with a lazy dispatch table whose rows for later verbs were written before those verbs existed. Both follow-up WPs then hit the same drift, documented in their PR reviews:

- WP-019 (cal/drive) found the dispatch routes whole groups via `require('./calendar').run(services(), flags)` while its spec's contracts exported only verb functions — resolved with additive `run()` bridges that re-parse verb flags from `flags.positionals` because `index.js`'s `parseFlags` only knows `--json/--max/--to/--subject/--body/--client`.
- WP-018 (send grants) built to its spec contracts — `gmail.send(services, {to, subject, body, routine, paths})` and `alert.run(services, {subject, body})` — but the merged dispatch calls `gmail.send(services(), flags)` and `alert.run(paths, flags)`, doesn't parse `--routine`, and doesn't implement routine resolution (`--routine` flag → `WIENERDOG_JOB` env → null). So the live `gws gmail send` and `gws _alert` CLI paths are currently broken; only the unit-tested module contracts work.

This WP makes the live CLI match the module contracts everywhere, so M5's manual verification can run `gws gmail send`/`gws _alert` for real. It is deliberately a reconciliation: verb modules are correct as merged; only the dispatch/parsing layer changes (plus removing the now-unnecessary token re-parsing duplication if trivial — see notes).

## Current state

Read these merged files first — they are the truth:
- `src/gws/index.js` — `DISPATCH` table, `parseFlags`, group-vs-verb routing (gmail uses two-word keys; cal/drive/auth/_alert route by group).
- `src/gws/gmail.js` — exports `search`, `read`, `draft`, `send(services, {to, subject, body, routine, paths})`, `buildMime`. `send` degrades to draft+notice when ungranted.
- `src/gws/alert.js` — exports `run(services, {subject, body})`; self-send only; throws on profile failure.
- `src/gws/calendar.js` / `drive.js` — verb functions + additive `run(services, flags)` bridges that re-parse `flags.positionals`.
- `src/gws/grant.js` — `findGrant`, `isSendAllowed` (used by gmail.send; you do not touch grant logic).
- `bin/wienerdog.js` — `gws` command wiring.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/gws/index.js | parseFlags gains verb flags + --routine; dispatch rows call the real contracts |
| create | tests/unit/gws-dispatch.test.js | end-to-end dispatch tests via stub services |

### Exact contracts

`parseFlags` additions: `--routine <name>`, `--title <s>`, `--start <iso>`, `--end <iso>`, `--attendee <email>` (repeatable → array), `--from <iso>`, `--id <s>`. Existing flags unchanged. Unknown flags remain positionals (current behavior).

Dispatch changes (only these rows):
- `gmail send` → `require('./gmail').send(services(), {to: flags.to, subject: flags.subject, body: flags.body, routine: resolveRoutine(flags), paths})` where `resolveRoutine(flags)` = `flags.routine ?? process.env.WIENERDOG_JOB ?? null` (exported for tests).
- `_alert` → `require('./alert').run(services(), {subject: flags.subject, body: flags.body})`.
- `cal` / `drive` rows may keep calling the modules' `run(services(), flags)` bridges (they work end-to-end per PR #14's review) — but now that `parseFlags` knows the verb flags, pass the parsed `flags` through; the bridges' positional re-parsing must keep working for backward compatibility (do NOT modify calendar.js/drive.js — not in Deliverables).

`tests/unit/gws-dispatch.test.js` (stub services via the client seam; zero network): (a) `gws gmail send` without grant → draft + the verbatim degradation notice, exit 0; (b) with a grant present in a temp config and `--routine` matching → send called with exact recipients; (c) `WIENERDOG_JOB` env supplies the routine when `--routine` absent; (d) `gws _alert --subject x --body y` → alert.run invoked with exactly {subject, body}; (e) `gws cal draft-event --title t --start s --end e` still works through dispatch (regression for the bridge path); (f) `--attendee a@b --attendee c@d` accumulates.

## Implementation notes & constraints

- `resolveRoutine` must never invent a routine: absent flag + absent env = null (which gmail.send treats as ungranted → draft).
- Do not touch calendar.js, drive.js, gmail.js, alert.js, grant.js — dispatch-layer only.
- When uncertain: simpler option + "Decisions made" note.

## Acceptance criteria

- [ ] All six dispatch tests pass; full `npm test` and `npm run lint` pass.
- [ ] `node bin/wienerdog.js gws gmail send --to a@b --subject s --body b` on a granted temp config sends via stub; ungranted degrades to draft+notice (manual transcript in PR).
- [ ] No behavior change to any verb module (their unit tests unchanged and passing).

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
npm test -- --test-name-pattern gws-dispatch
```

## Out of scope (do NOT do these)

- Refactoring cal/drive bridges away (works; revisit post-v1). Any grant-logic change (ADR-0007 surface — WP-018 owns it). Live network calls.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/021-gws-dispatch`; PR titled `fix(gws): reconcile dispatch with verb-module contracts (WP-021)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
