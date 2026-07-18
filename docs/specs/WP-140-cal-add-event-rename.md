---
id: WP-140
title: Rename `cal draft-event` → `cal add-event` and gate every calendar mutation behind a calendar-write grant + credential (audit A2)
status: Ready
model: sonnet
size: S
depends_on: [WP-138, WP-139]
adrs: [ADR-0007, ADR-0026]
branch: wp/140-cal-add-event-rename
---

# WP-140: Rename `cal draft-event` → `cal add-event` and gate every calendar mutation behind a calendar-write grant + credential (audit A2)

## Context (read this, nothing else)

Wienerdog installs files. **IRON RULE (ADR-0004): Wienerdog is just files** — no
daemons/servers/telemetry. Node ≥ 18, zero runtime deps (only `googleapis`), JSDoc
types, no build step.

The `wienerdog gws cal draft-event` verb (`src/gws/calendar.js` `draftEvent`) is a
**misnomer**: it calls `events.insert` on the user's `primary` calendar — a **live
mutation**, not a draft. The 2026-07-15 audit (action **A2**, `04-gws-grants.md` F3)
requires renaming it to reflect that it creates a live event and placing **every
calendar mutation behind an explicit write capability/grant** (audit point 8). Today
the verb is **ungated** (unlike `gmail send`) and runs under the full `calendar` scope,
which also makes `events.delete`/`update` reachable by direct token use.

ADR-0026 addresses the credential half elsewhere: **WP-138** split the read path onto
`calendar.events.readonly` (which cannot mutate at all) and gave calendar writes their
own `CALENDAR_WRITE` credential (`calendar.events`); **WP-139** added a `calendar_write`
grant kind to the canonical broker-owned grant store, minted only at the TTY. This WP
does the **CLI-surface** half: rename the verb and gate it behind that grant +
credential. (Note: `calendar.events` still permits `events.delete`; delete-prevention
comes from the verb allowlist — this CLI exposes only `add-event`, never delete/update —
**not** from the scope, per ADR-0026 §3.)

**A2 opens NO capability gate.** `gws-use` stays BLOCKED; the `cal` dispatch is
unreachable in production. `wienerdog safety` shows all five BLOCKED after this WP.

## Current state

- **`src/gws/calendar.js`:** `draftEvent(services, {title, start, end, attendees})` →
  `events.insert` on `primary` with `sendUpdates:'none'` (mandatory — never notifies
  attendees). `run(services, flags)` dispatches `list`/`show`/`draft-event`;
  `parseVerbFlags` parses `--title`/`--start`/`--end`/`--attendee`/etc.
- **`src/gws/index.js`:** `DISPATCH['cal'] = ({flags, services}) => require('./calendar').run(...)`.
  The `cal` group is dispatched with **no grant gating** today.
- **WP-138** provides `getServicesForClass(paths, CALENDAR_WRITE, ...)` (the
  `calendar.events` credential) and `getServicesForClass(paths, READ, ...)` (the
  `calendar.events.readonly` credential for `list`/`show`).
- **WP-139** provides `grantCheck(paths, routineId, 'calendar_write')` and
  `wienerdog grant calendar-write --routine <id>`.
- **Docs/threat-model** describe `cal draft-event` as a non-mutating draft — corrected in
  **WP-143** (not here). No shipped routine SKILL uses calendar write, so the routine
  SKILL bodies are **untouched** here (they stay byte-frozen under the A1 integrity digest).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/gws/calendar.js | rename `draftEvent`→`addEvent`; the `run` verb `draft-event`→`add-event`; `add-event` requires `calendar_write` grant + the CALENDAR_WRITE credential; `list`/`show` use the read credential |
| modify | src/gws/index.js | dispatch `cal add-event` through the write-credential + grant path; `list`/`show` through the read credential; no generic full-scope `services` for `cal` |
| create | tests/unit/gws-calendar-addevent.test.js | rename coverage, grant-gated add-event (denied without grant → no insert), read verbs use read credential, no delete/update verb exists |
| modify | tests/unit/gws-calendar.test.js | reconcile the rename + gating expectations |

### Exact contracts

- `addEvent(services, {title, start, end, attendees})` — identical body to `draftEvent`
  (`events.insert` on `primary`, `sendUpdates:'none'` MANDATORY), only renamed. There is
  **no** `deleteEvent`/`updateEvent` — the CLI never exposes calendar delete/update
  (delete-prevention is the verb allowlist, not the scope).
- `cal add-event` gating: before `events.insert`, resolve the routine identity for the
  grant lookup the same way the send path does (`--routine` flag / `WIENERDOG_JOB`), then
  `grantCheck(paths, routineId, 'calendar_write')`. Denied → a fail-visible notice (mirror
  the send-degrades-to-draft posture: "no calendar-write grant for <routine>; not created.
  Run: wienerdog grant calendar-write --routine <name>") and **zero** insert call. Allowed
  → `events.insert` via the `CALENDAR_WRITE` credential.
- `cal list`/`cal show` use the `READ` credential (`calendar.events.readonly`) — they
  physically cannot mutate.
- `index.js`: the `cal` dispatch selects the credential class per verb (write for
  `add-event`, read for `list`/`show`) instead of one full-scope `getServices`. Keep the
  `requireCapability(GWS_USE)` A0 freeze first (unchanged — still BLOCKED in production).

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-ADDEVENT-DEGRADE — RESOLVED (OWNER-APPROVED 2026-07-18): fail-visible notice,
  mirror send.** On a missing calendar-write grant, `cal add-event` degrades to the
  fail-visible notice in the contract above ("no calendar-write grant for <routine>;
  not created. Run: …") with **zero** insert calls — consistent with the send-grant
  degrade-to-draft and ADR-0007's fail-safe-and-visible posture. A hard error was
  rejected: security-equivalent (zero mutation either way) but inconsistent with the
  send path, and one missing grant would kill an entire routine run instead of
  producing an actionable message.
- **D-CAL-ATTENDEES — RESOLVED (OWNER-APPROVED 2026-07-18): keep `--attendee`,
  `sendUpdates:'none'` mandatory.** Existing behavior kept: no notification email is
  ever sent (emailing would be an outbound action, ADR-0007). Honest nuance recorded:
  `sendUpdates:'none'` suppresses the EMAIL only — for a Google-account attendee the
  invitation can still appear in their calendar, so an attendee-bearing insert IS an
  outward-visible effect. Accepted because the verb lives behind a TTY-minted
  `calendar_write` grant (and `gws-use` stays BLOCKED in A2); WP-143 documents the
  nuance in the honest-claims pass.

## Implementation notes & constraints

- **`sendUpdates:'none'` stays mandatory** — the rename does not change that a calendar
  insert must never email attendees (that would be a grant-gated outbound action).
- **No new verbs.** Do NOT add delete/update — the audit wants the mutation surface
  minimal and gated, and delete-prevention is the allowlist, not the scope.
- **Routine SKILL bodies untouched.** No shipped routine uses calendar write; leave the
  three `SKILL.md` files byte-unchanged (they are integrity-digest-frozen under A1).
- **Idempotent/reversible:** no new persisted files (grants live in WP-139's store,
  credentials in WP-138's token files). No manifest change.
- Zero deps, JSDoc only. When uncertain, choose simpler + record it.

## Security checklist

- [ ] `cal add-event` (the renamed live-mutation verb) creates an event ONLY under a
      `calendar_write` grant (TTY-minted, WP-139) using the CALENDAR_WRITE credential;
      without the grant it makes zero insert calls and returns a fail-visible notice.
      `cal list`/`show` use the read-only credential and cannot mutate. No calendar
      delete/update verb exists. `sendUpdates:'none'` remains mandatory.

## Acceptance criteria

- [ ] `cal draft-event` is gone; `cal add-event` exists and is grant-gated. (unit)
- [ ] `add-event` without a `calendar_write` grant makes zero `events.insert` calls and
      returns the fail-visible notice; with the grant it inserts via the write credential.
      (unit)
- [ ] `cal list`/`cal show` invoke the read credential; no code path lets `cal` obtain a
      write-scoped or full-scope client for a read. (unit)
- [ ] No `deleteEvent`/`updateEvent`/delete verb exists in `calendar.js` or the dispatch.
      (unit/grep)
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "gws-calendar"
npm test
npm run lint
node bin/wienerdog.js safety     # all five gates BLOCKED
grep -n "draft-event\|draftEvent\|events.delete\|events.update" src/gws/calendar.js src/gws/index.js  # only add-event/addEvent remain
```

## Out of scope (do NOT do these)

- The `CALENDAR_WRITE` credential / scope split — **WP-138**. The grant store + the
  `calendar_write` grant kind + the mint CLI — **WP-139** (this WP consumes both).
- The broker's Google verbs — **WP-137** (no routine calendar-write verb exists in v1).
- Docs/threat-model correction of the old "draft" claim — **WP-143**.
- Opening any capability gate — never in A2.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/140-cal-add-event-rename`; conventional commits; PR titled
   `feat(gws): rename cal draft-event → add-event behind a calendar-write grant (WP-140)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
