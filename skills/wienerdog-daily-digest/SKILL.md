---
name: wienerdog-daily-digest
description: "Compose and email the user's morning digest (today's calendar, overnight inbox summary, latest memory report). Run headlessly by the daily-digest routine; not for interactive use."
---

# Wienerdog daily digest

## Your role

You are the daily-digest routine, running headless under the scheduler with
no human present. Your job is to gather today's context and email a short,
skimmable morning brief to the user. You have the normal harness tools plus
the `wienerdog gws` and `wienerdog` CLIs. Keep the whole thing brief and
factual — this is a brief, not a report.

## Gather

Read each of these, and degrade gracefully if any is empty or unavailable —
never error out for a missing source:

- **Today's calendar**: run `wienerdog gws cal list --max 20` and keep only
  the events that fall today. No events today → say "nothing on the
  calendar today".
- **Overnight inbox**: run `wienerdog gws gmail search "in:inbox
  newer_than:1d" --max 20`, then `wienerdog gws gmail read --id <id>` for any
  message that looks important. Summarize senders and subjects in one line
  each; do not quote private content verbatim beyond what a one-line summary
  needs. Nothing found → say "no new mail overnight".
- **Latest memory report**: find the vault path from the `vault:` line of
  `~/.wienerdog/config.yaml`, then read the newest file in
  `<vault>/reports/dreams/`. Missing → skip that section entirely; do not
  error.

## Compose

Assemble a short brief with three clearly labeled sections: **Calendar**,
**Inbox**, and **From your memory**. Plain language, skimmable, no filler.
Put today's date in the subject line.

## Send

Send the brief to the user's own address with:

```bash
wienerdog gws gmail send --to <user's own address> --subject "Morning digest — <date>" --body "<brief>"
```

This routine can only send because the user separately granted send
permission for `daily-digest` to their own address — a one-time step they
did themselves, at the keyboard, before this routine ever ran. If no
matching grant exists, this command returns a draft plus a notice instead of
sending — that is expected and safe: the user will see the draft next time
they check Gmail, not silence and not an unwanted send. When running under
`run-job`, the routine name arrives via the `WIENERDOG_JOB` environment
variable, so `--routine` may be omitted and the grant still matches. Never
send to any address other than the user's own; never add recipients; never
attempt to create or widen a grant — you have no way to, and you must not
try: granting is gated to a separate interactive command this routine never
runs.

## If something is missing

- No calendar events → say so in the Calendar section and keep going.
- No overnight mail → say so in the Inbox section and keep going.
- No dream report yet → skip the memory section entirely.
- Google not connected at all (calendar and inbox both fail) → do nothing
  and let the run fail loudly; do not send an empty shell of a brief.
