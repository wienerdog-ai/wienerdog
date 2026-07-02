---
id: WP-014
title: Author the routine catalog skill plus daily-digest, inbox-triage, and weekly-review routines
status: Ready
model: sonnet
size: M
depends_on: [WP-013, WP-018, WP-019]
adrs: [ADR-0007, ADR-0008]
branch: wp/014-routine-catalog
---

# WP-014: Author the routine catalog skill plus daily-digest, inbox-triage, and weekly-review routines

## Context (read this, nothing else)

The single most common failure of "personal AI agent" products is not installation —
it is *"now what?"*. Users install an autonomous agent and cannot find useful jobs for
it, so the novelty dies (ADR-0008). Wienerdog's answer is the **routine catalog**: an
opt-in, re-runnable menu (`/wienerdog-routines`) of ready-made scheduled routines with
plain-language descriptions of what each delivers and what access it needs. **Nothing
is scheduled by default** (ADR-0008) — the user picks zero or more, and each pick is
configured in one guided conversation: the skill describes the routine, then runs
`wienerdog schedule add` to schedule it, and where the routine needs to *send* email,
walks the user through `wienerdog grant send` first. The catalog is designed for a
spectacular first win within 24 hours of install, and it doubles as marketing.

This work package authors that catalog skill **and** the three v1 routines it offers.
All four are prompts (`SKILL.md`), not code:

1. **`wienerdog-routines`** — the catalog menu skill (the guided conversation).
2. **`wienerdog-daily-digest`** — the flagship routine: a morning brief (today's
   calendar + an overnight inbox summary + the latest dream report) **emailed to the
   user**. Because it sends, it requires a send grant.
3. **`wienerdog-inbox-triage`** — a draft-only routine (categorizes/triages recent
   inbox mail and leaves *drafts*; never sends → no grant).
4. **`wienerdog-weekly-review`** — a draft-only routine (a weekly summary note in the
   vault and/or a draft; never sends → no grant).

Two invariants from the send-governance model shape the catalog and the digest
(ADR-0007, Threat model T4a — outbound as an exfiltration channel):

- **Sending executes only under a send grant**, scoped to `(routine, recipient
  allowlist)`, stored in `~/.wienerdog/config.yaml`, and created **only** by the
  interactive `wienerdog grant send` command with a typed confirmation that lives
  outside any model context. No skill, hook, or headless job can mint or widen a grant.
  So the catalog skill (running as the user's interactive model) does not itself write
  a grant — it *tells the user to run* `wienerdog grant send`, which prompts them to type
  the word "grant". The daily digest's grant is `--to self` (the user's own address):
  the canonical, safest first grant.
- **An ungranted send degrades to a draft plus a notice** — it never errors and never
  leaks. So a misconfigured digest fails safe and visibly (the user gets a draft, not
  silence, not an unwanted send).

The digest routine runs **headless** under the scheduler (`wienerdog run-job
daily-digest`, WP-020): the OS launches `claude -p /wienerdog-daily-digest`, which reads
Google + the vault via `wienerdog gws` / files and composes+sends the brief. It has no
human in the loop, so its prompt must be self-sufficient and must degrade gracefully
(missing calendar, empty inbox, no dream report yet, ungranted send).

## Current state

`skills/wienerdog-routines/`, `skills/wienerdog-daily-digest/`,
`skills/wienerdog-inbox-triage/`, and `skills/wienerdog-weekly-review/` do not exist —
you are creating them. `skills/wienerdog-setup/SKILL.md` (WP-005) is the **style
reference** for voice and the `name`/`description` frontmatter shape. Match it.

The commands the skills drive (all **already built** — treat as fixed contracts):

- **`wienerdog schedule add <name> --at HH:MM (--skill <skill> | --job <builtin>)`**
  (WP-013) — schedules a routine. The catalog uses `--skill <skill>` for each routine,
  e.g. `wienerdog schedule add daily-digest --at 07:00 --skill wienerdog-daily-digest`.
  The scheduler registers an OS-native entry that later launches `wienerdog run-job
  <name>` (WP-020). `wienerdog schedule list` shows what is scheduled; `wienerdog
  schedule remove <name>` unschedules.
- **`wienerdog grant send --routine <name> --to <a@b>[,<c@d>...]`** (WP-018) — the ONLY
  way to authorize sending. Interactive: it prints a plain-language summary and requires
  the user to type the word `grant` to confirm (typing anything else cancels; `--yes`
  does NOT bypass it). `--to self` is expressed by passing the user's own email address.
  The catalog never runs this itself — it instructs the user to run it.
- **`wienerdog gws gmail search "<query>" [--max N]` / `gmail read --id <id>`** (WP-011)
  — read inbox headers / full message text.
- **`wienerdog gws gmail send --to <a> --subject <s> --body <b> --routine <name>`**
  (WP-018) — grant-gated send. With a matching grant it sends; without one it returns a
  draft + a notice (degraded, never an error). When run headless under `run-job`, the
  routine name also arrives via `WIENERDOG_JOB`, so the digest can omit `--routine` and
  still match its grant.
- **`wienerdog gws cal list [--from <iso>] [--to <iso>] [--max N]`** (WP-019) — today's
  calendar events.
- The **latest dream report** lives at `<vault>/reports/dreams/<YYYY-MM-DD>.md` (the
  most recent file in that dir); the vault path is the `vault:` line of
  `~/.wienerdog/config.yaml`.

**Skill registration is NOT this WP's job.** The Claude adapter (WP-006) / Codex adapter
(WP-010) sync every `skills/wienerdog-*` folder on `wienerdog sync`; creating the source
`SKILL.md` files here is sufficient.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | skills/wienerdog-routines/SKILL.md | the catalog menu + guided configuration flow |
| create | skills/wienerdog-daily-digest/SKILL.md | the flagship routine (headless; reads gws+vault, composes, sends under grant) |
| create | skills/wienerdog-inbox-triage/SKILL.md | draft-only routine (no grant) |
| create | skills/wienerdog-weekly-review/SKILL.md | draft-only routine (no grant) |
| create | tests/unit/routines-skill-structure.test.js | node:test grepping mandatory sections/rules across all four skills |

### `skills/wienerdog-routines/SKILL.md` — required structure

Frontmatter:

```yaml
---
name: wienerdog-routines
description: "Browse and set up ready-made daily/weekly routines (morning digest, inbox triage, weekly review). Use when the user wants to set up an automatic routine, a scheduled job, or asks 'what can Wienerdog do for me?'."
---
```

Body sections (exact `##` headings — the structural test greps them):

**`## What routines are`** — one paragraph, plain language: routines are jobs Wienerdog
runs for the user on a schedule, on their own computer, through their own AI
subscription. State plainly (ADR-0008): **nothing is scheduled until they choose it
here**, and they can run this menu any time to add or remove routines.

**`## The menu`** — present the three v1 routines, each with: what it delivers, when it
runs, and what access it needs. Use exactly these names and be honest about access:
- **Daily digest** — a morning email to *you* with today's calendar, an overnight inbox
  summary, and last night's memory report. Needs: Google connected, and your permission
  to email *you* (a one-time grant to your own address).
- **Inbox triage** — each morning, sorts recent inbox mail and leaves **draft** replies
  where useful. Needs: Google connected. **Never sends** — only drafts.
- **Weekly review** — a weekly summary of what you worked on, saved to your notes (and a
  draft you can send if you want). Needs: nothing beyond Wienerdog. **Never sends.**

**`## Setting up a routine`** — the guided flow, one routine at a time:
1. If the routine reads Google (all three read; digest+triage need Gmail/Calendar),
   confirm Google is connected; if not, point them to `/wienerdog-google-setup` first.
2. Ask what time they want it (default suggestions: digest 07:00, triage 08:00, weekly
   review Monday 08:00 — note weekly is still a daily `--at` in v1; see the routine's
   own note). Then run `wienerdog schedule add <name> --at HH:MM --skill <skill>`.
3. **If the routine sends** (only the daily digest does): before or right after
   scheduling, walk them through granting send-to-self. Tell them to run, and what to
   expect:
   ```bash
   wienerdog grant send --routine daily-digest --to <their own email address>
   ```
   Explain that it will ask them to **type the word "grant"** to confirm, and that this
   is deliberate — it is the one action a routine can never take on its own, so it
   always requires them, in person, at the keyboard. Emphasize `--to <their own
   address>` (send-to-self) is the safe default; do not suggest third-party recipients.
   **You (the model) must not type "grant" or run this command for them** — you can only
   show it and explain it; they run it themselves.
4. Confirm what is now scheduled (`wienerdog schedule list`) and, for the digest, that
   the grant exists, and tell them when the first run will happen.

**`## Removing or changing a routine`** — `wienerdog schedule remove <name>` to
unschedule; re-run this menu to change the time (schedule add overwrites). Removing a
routine does not revoke a send grant (grants are managed separately) — mention it.

**`## Safety`** — restate, in plain words: routines run on their schedule through the
user's own AI subscription; a routine can only *send* email if the user granted it, and
only to the addresses they named; anything ungranted becomes a draft, never a surprise
send. The catalog itself never grants anything — only the user, typing "grant", does.

### `skills/wienerdog-daily-digest/SKILL.md` — required structure

Frontmatter:

```yaml
---
name: wienerdog-daily-digest
description: "Compose and email the user's morning digest (today's calendar, overnight inbox summary, latest memory report). Run headlessly by the daily-digest routine; not for interactive use."
---
```

Body sections (exact `##` headings — greped):

**`## Your role`** — you are a scheduled routine running with no human present. You
gather today's context and email a short, skimmable morning brief to the user. You have
the normal harness tools plus the `wienerdog gws` and `wienerdog` CLIs. Keep the whole
thing brief and factual.

**`## Gather`** — the exact reads, each degrading gracefully if empty/unavailable:
- Today's calendar: `wienerdog gws cal list --max 20` (filter to today). No events →
  say "nothing on the calendar today".
- Overnight inbox: `wienerdog gws gmail search "in:inbox newer_than:1d" --max 20`, then
  `gws gmail read --id <id>` for any that look important. Summarize senders/subjects;
  do not quote private content verbatim beyond what a one-line summary needs. Empty →
  "no new mail overnight".
- Latest memory report: read the newest file in `<vault>/reports/dreams/` (find the
  vault path from `~/.wienerdog/config.yaml`'s `vault:` line). Missing → skip that
  section; do not error.

**`## Compose`** — assemble a short brief with three clearly labeled sections (Calendar,
Inbox, From your memory). Plain language, skimmable, no filler. Put the date in the
subject.

**`## Send`** — send it to the user with:
```bash
wienerdog gws gmail send --to <user's own address> --subject "Morning digest — <date>" --body "<brief>"
```
State the grant reality explicitly: this routine can only send because the user granted
`daily-digest` permission to their own address; if no grant exists, this command returns
a **draft plus a notice** instead of sending — that is expected and safe, and the user
will see the draft. When running under `run-job`, the routine name is provided via the
`WIENERDOG_JOB` environment variable, so `--routine` may be omitted and the grant still
matches. **Never send to any address other than the user's own; never add recipients;
never attempt to create or widen a grant** (you cannot — grants are code-gated).

**`## If something is missing`** — a short list: no calendar / no mail / no dream report
/ Google not connected (skip gracefully, still send whatever you have; if Google is
entirely unavailable, do nothing and let the run fail loudly rather than send an empty
shell).

### `skills/wienerdog-inbox-triage/SKILL.md` — required structure

Frontmatter `name: wienerdog-inbox-triage`, a `description` mentioning it drafts (never
sends). Body sections (exact `##` headings — greped): `## Your role`,
`## Gather`, `## Draft`, `## Never send`.
- `## Your role`: a scheduled, headless routine that triages recent inbox mail and
  leaves draft replies; no human present.
- `## Gather`: `wienerdog gws gmail search "in:inbox newer_than:1d" --max 20` +
  `gws gmail read` as needed.
- `## Draft`: for mail that clearly warrants a reply, create a **draft** via
  `wienerdog gws gmail draft --to <sender> --subject <re> --body <suggested reply>`.
  Drafts only — the user reviews and sends manually.
- `## Never send`: state absolutely that this routine never runs `gws gmail send`, never
  asks for a grant, and only ever drafts. (The structural test greps this.)

### `skills/wienerdog-weekly-review/SKILL.md` — required structure

Frontmatter `name: wienerdog-weekly-review`, a `description` mentioning it writes a
summary note and never sends. Body sections (exact `##` headings — greped):
`## Your role`, `## Gather`, `## Write the review`, `## Never send`.
- `## Your role`: a scheduled, headless routine that summarizes the past week.
- `## Gather`: read the past week's `<vault>/07-Daily/*.md` and the week's dream reports.
- `## Write the review`: write a summary note into the vault (a dated note under
  `03-Resources/` or append to the current daily log — pick the simpler, note the
  choice) with proper provenance frontmatter (`origin: routine`); optionally also create
  an email **draft** via `gws gmail draft` if the user might want to send it.
- `## Never send`: state absolutely that this routine never runs `gws gmail send` and
  never asks for a grant. Also note the v1 limitation that scheduling is daily (`--at`);
  the routine itself decides to act only on its chosen weekday (e.g. Monday).

### `tests/unit/routines-skill-structure.test.js` — required assertions

A `node:test` file that Reads all four `SKILL.md` files and asserts (mirror WP-009's
`dream-skill-structure.test.js` approach). List each check:

1. Each file's frontmatter has the correct `name:` and a non-empty `description:`.
2. `wienerdog-routines` contains all five `##` headings (`## What routines are`,
   `## The menu`, `## Setting up a routine`, `## Removing or changing a routine`,
   `## Safety`); mentions all three routine display names (`Daily digest`, `Inbox
   triage`, `Weekly review`); contains the exact grant command form `wienerdog grant
   send --routine daily-digest --to`; and contains a statement that the model must NOT
   run the grant for the user (grep `type the word "grant"` and a "you run it
   yourself"-style phrase — assert both substrings you write appear).
3. `wienerdog-routines` states nothing is scheduled by default (grep a phrase like
   `nothing is scheduled` / `until you choose`, case-insensitive) and that inbox-triage
   and weekly-review **never send** (grep `Never sends`/`never send`).
4. `wienerdog-daily-digest` contains `## Your role`, `## Gather`, `## Compose`,
   `## Send`, `## If something is missing`; references `wienerdog gws cal list`,
   `wienerdog gws gmail search`, `reports/dreams/`, and `wienerdog gws gmail send`; and
   states the ungranted-send-degrades-to-draft behavior (grep `draft` near `grant`) and
   `WIENERDOG_JOB`.
5. `wienerdog-daily-digest` states it only ever sends to the user's own address and
   never creates/widens a grant (grep both substrings you write).
6. `wienerdog-inbox-triage` contains `## Your role`, `## Gather`, `## Draft`,
   `## Never send`; references `wienerdog gws gmail draft`; and asserts it never runs
   `gws gmail send` (grep the `## Never send` section content).
7. `wienerdog-weekly-review` contains `## Your role`, `## Gather`, `## Write the
   review`, `## Never send`; references reading `07-Daily/`; and asserts it never sends.
8. None of the routine skills contain the string `wienerdog grant send` **except**
   `wienerdog-routines` (only the interactive catalog mentions the grant command; the
   headless routines must never invoke it). Assert `daily-digest`, `inbox-triage`,
   `weekly-review` do NOT contain `wienerdog grant send`.

## Implementation notes & constraints

- **These are prompts, not code.** Plain, confident, knowledge-worker English (product
  voice per CLAUDE.md). The catalog is a conversation; the three routines are headless
  and must be self-sufficient (they run with no human present) and degrade gracefully.
- **The catalog never grants; only the user does (ADR-0007).** The catalog skill shows
  and explains `wienerdog grant send` but must not run it or type "grant". The headless
  routines never mention or attempt a grant at all.
- **Use canonical GLOSSARY terms** exactly: routine, routine catalog, send grant,
  digest, vault, dream report. Do not invent synonyms.
- **Only the daily digest sends**, and only to the user's own address, only under the
  grant. Inbox-triage and weekly-review are draft-only by design — this is a safety
  property the structural test enforces, so state it explicitly in each.
- No new npm dependencies. The structural test is Node stdlib (`node:test`, `fs`).
- When uncertain: choose the simpler wording and record it under "Decisions made" (e.g.
  where weekly-review writes its note). Do NOT expand scope.

## Acceptance criteria

- [ ] All four `SKILL.md` files exist with correct frontmatter and the exact `##`
      sections listed above.
- [ ] The catalog presents the three routines with honest access requirements, walks the
      user through `wienerdog schedule add` for each and `wienerdog grant send` for the
      digest, and states plainly that nothing is scheduled by default and that the model
      never grants on the user's behalf.
- [ ] The daily-digest skill reads calendar + inbox + latest dream report, composes a
      brief, sends via grant-gated `gws gmail send` to the user's own address, and
      documents graceful degradation and the ungranted-send-becomes-draft behavior.
- [ ] Inbox-triage and weekly-review are draft-only and each state they never send and
      never grant; neither contains `wienerdog grant send` or `gws gmail send`.
- [ ] `tests/unit/routines-skill-structure.test.js` passes (all checks above).
- [ ] `npm test` and `npm run lint` (markdownlint covers `skills/**/*.md`) pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern routines-skill
npm run lint   # markdownlint covers skills/**/*.md
```

**Live end-to-end (schedule the digest, grant send-to-self, let it fire and arrive by
email) is manual-verify-at-M6** — the ROADMAP M6 acceptance ("catalog flow configures
digest incl. its send-to-self grant; digest arrives by email"). This WP's automated
checks are structural only; note in the PR whether the manual run was done.

## Out of scope (do NOT do these)

- **The `schedule` / `grant` / `gws` commands** — WP-013 / WP-018 / WP-019 / WP-011
  (all built). These skills only invoke them.
- **The `run-job` executor** that runs the digest headless — WP-020. This WP authors the
  skill that `run-job` launches; it does not implement `run-job`.
- **Registering/syncing the skills** into `~/.claude/skills` or Codex `[skills]` —
  WP-006 / WP-010. This WP creates the source `SKILL.md` files only.
- **Any code change** and **any new grant mechanics** — grants are ADR-0007 CLI-only.
- **Additional routines beyond the three v1 entries** — future catalog-growth WPs.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/014-routine-catalog`; PR titled `feat(routines): catalog skill + daily-digest, inbox-triage, weekly-review (WP-014)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
