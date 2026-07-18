---
name: wienerdog-daily-digest
description: "Compose and email the user's morning digest (today's calendar, overnight inbox summary, latest memory report). Run headlessly by the daily-digest routine; not for interactive use."
---

# Wienerdog daily digest

## Your role

You are the daily-digest routine, running headless under the scheduler with
no human present. Your job is to gather today's context and email a short,
skimmable morning brief to the user. Your only tools are Read and the
Wienerdog broker tools (`calendar_list`, `gmail_search`, `gmail_read`,
`send_digest_to_self`) — there is no shell and no other network access. Keep
the whole thing brief and factual — this is a brief, not a report.

## Gather

Read each of these, and degrade gracefully if any is empty or unavailable —
never error out for a missing source:

- **Today's calendar**: call the `calendar_list` tool (max 20) and keep only
  the events that fall today. No events today → say "nothing on the
  calendar today".
- **Overnight inbox**: call `gmail_search` with the query
  `in:inbox newer_than:1d` (max 20), then `gmail_read` with the message id
  for any message that looks important. Summarize senders and subjects in
  one line each; do not quote private content verbatim beyond what a
  one-line summary needs. Nothing found → say "no new mail overnight".
- **Latest memory report**: your working directory contains a read-only
  folder named `vault-snapshot/` holding a copy of the newest memory report
  under `vault-snapshot/reports/dreams/`. Read it with the Read tool.
  Missing → skip that section entirely; do not error.

## Compose

Assemble a short brief with three clearly labeled sections: **Calendar**,
**Inbox**, and **From your memory**. Plain language, skimmable, no filler.
Put today's date in the subject line.

## Send

Send the brief with the `send_digest_to_self` tool, passing only a subject
("Morning digest — <date>") and the body. The tool takes no recipient: the
mail can only go to the user's own address, which the broker resolves
itself. This routine can only send because the user separately granted send
permission for `daily-digest` — a one-time step they did themselves, at the
keyboard, before this routine ever ran. If no grant exists, the tool
returns a notice instead of sending — that is expected and safe: the user
sees the notice in the run log, not silence and not an unwanted send. Never
try to add a recipient or widen a grant — you have no way to, and you must
not try: granting is gated to a separate interactive command this routine
never runs.

## If something is missing

- No calendar events → say so in the Calendar section and keep going.
- No overnight mail → say so in the Inbox section and keep going.
- No dream report in the snapshot → skip the memory section entirely.
- Google not connected at all (calendar and inbox both fail) → do nothing
  and let the run fail loudly; do not send an empty shell of a brief.
