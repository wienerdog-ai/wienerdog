---
name: wienerdog-routines
description: "Browse and set up ready-made daily/weekly routines (morning digest, inbox triage, weekly review). Use when the user wants to set up an automatic routine, a scheduled job, or asks 'what can Wienerdog do for me?'."
---

# Wienerdog routines

Your job is to walk the person through the routine catalog: a menu of
ready-made routines they can turn on, one guided conversation at a time.

## What routines are

Routines are jobs Wienerdog runs for the person on a schedule, on their own
computer, through their own AI subscription — there is no separate service
and nothing runs anywhere else. Nothing is scheduled until they choose it
here. This menu is also their settings panel for routines: run it again any
time to add, remove, or change one.

## The menu

Present these three v1 routines. Be honest about what each needs — never
undersell the access requirement.

- **Daily digest** — a morning email to *you* with today's calendar, an
  overnight inbox summary, and last night's memory report. Runs once a day.
  Needs: Google connected, and your permission to email *you* (a one-time
  grant to your own address).
- **Inbox triage** — each morning, sorts recent inbox mail and leaves
  **draft** replies where useful. Needs: Google connected. **Never sends** —
  only drafts.
- **Weekly review** — a weekly summary of what you worked on, saved to your
  notes (and a draft you can send if you want). Needs: nothing beyond
  Wienerdog. **Never sends.**

## Setting up a routine

Walk through one routine at a time:

1. All three touch Google to some degree (digest and inbox triage need
   Gmail and Calendar; weekly review only needs the vault, but check anyway
   if unsure). If Google isn't connected yet, point the person to
   `/wienerdog-google-setup` first and come back here after.
2. Ask what time they want it to run. Default suggestions: daily digest
   07:00, inbox triage 08:00, weekly review Monday 08:00 (weekly review is
   still scheduled with a daily `--at` in v1 — the routine itself only acts
   on its chosen weekday; see that routine's own skill for the note on this
   limitation). Then run:
   ```bash
   wienerdog schedule add <name> --at HH:MM --skill <skill>
   ```
   using the routine's own name and skill, for example:
   ```bash
   wienerdog schedule add daily-digest --at 07:00 --skill wienerdog-daily-digest
   ```
3. **If the routine sends** — only the daily digest does — walk them through
   granting send-to-self, before or right after scheduling. Show them the
   command and explain what it does; do not run it for them:
   ```bash
   wienerdog grant send --routine daily-digest --to <their own email address>
   ```
   Tell them plainly what happens next: it will ask them to type the word
   "grant" to confirm, and that this is deliberate — granting send access is
   the one action a routine can never take on its own, so it always requires
   them, in person, at the keyboard. `--to <their own address>` (send-to-self)
   is the safe default; do not suggest third-party recipients. You must not
   type "grant" or run this command for them — you can only show it and
   explain it; they run it themselves.
4. Confirm what is now scheduled with `wienerdog schedule list` and, for the
   digest, that the grant exists. Tell them when the first run will happen.

## Removing or changing a routine

`wienerdog schedule remove <name>` unschedules a routine. To change its
time, re-run this menu and run `schedule add` again — it overwrites.
Removing a routine does not revoke a send grant; grants are managed
separately with `wienerdog grant send`, so mention that to the person if
they remove the daily digest.

## Safety

Routines run on their schedule through the person's own AI subscription, on
their own computer — nothing leaves it that they didn't ask for. A routine
can only *send* email if the person granted it, and only to the addresses
they named; anything ungranted becomes a draft, never a surprise send. This
catalog never grants anything itself — only the person, by typing "grant" at
the keyboard, does.
