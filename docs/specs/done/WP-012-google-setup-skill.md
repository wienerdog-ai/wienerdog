---
id: WP-012
title: Author the wienerdog-google-setup skill (guided OAuth onboarding)
status: Done
model: sonnet
size: S
depends_on: [WP-011]
adrs: [ADR-0004]
branch: wp/012-google-setup-skill
---

# WP-012: Author the wienerdog-google-setup skill (guided OAuth onboarding)

## Context (read this, nothing else)

Wienerdog can read a user's Gmail, Calendar, and Drive and draft mail through its
own thin CLI, `wienerdog gws` (Google Workspace). Before any of that works, the
user must give Wienerdog a Google OAuth client of their own. Wienerdog deliberately
does **not** ship a shared Google client: a shared client carrying Gmail scopes would
require Google's restricted-scope security assessment (not viable for a young
open-source project), and Google's test-mode sharing caps at 100 users with 7-day
token expiry. So each user creates a personal client in the Google Cloud Console,
downloads its JSON, and hands it to `wienerdog gws auth`, which runs a one-time
localhost consent flow and stores a token at `~/.wienerdog/secrets/google-token.json`
(mode 0600).

That Cloud Console walk-through is genuinely fiddly for a non-technical knowledge
worker — six screens, easy to get lost. **This work package is the skill that walks
them through it in plain language**: `/wienerdog-google-setup`. It is a prompt
(`SKILL.md`), not code. The user's own model (Claude Code or Codex CLI) runs it
conversationally: it gives precise click-by-click instructions, waits at each step,
then runs `wienerdog gws auth --client <downloaded.json>` and verifies success with a
single read-only smoke call (`wienerdog gws gmail search ... --max 1`).

Two product invariants shape this skill:

1. **Wienerdog is just files (ADR-0004).** This skill never starts a server or a
   background process. The only network touch is the OAuth loopback inside
   `gws auth` — a temporary local listener open for the seconds of the consent
   redirect, then closed. The skill just runs the CLI command; it does not implement
   any of that.
2. **Plain language for knowledge workers, not developers (CLAUDE.md).** No jargon
   without explanation. There are no screenshots (a skill is text), so the click-path
   wording must be exact: name the button, say where it is, say what happens next.

## Current state

`skills/wienerdog-google-setup/` does not exist — you are creating it.

- `skills/wienerdog-setup/SKILL.md` (WP-005) already exists and is the **style
  reference** for skill voice, frontmatter shape (`name`, `description`), and the
  "one thing at a time, wait for the user" conversational structure. Match it.
- **`wienerdog gws auth`** (WP-011, already built — treat as a fixed contract) is the
  command this skill drives. Its behavior, verbatim from WP-011:
  - Invocation: `wienerdog gws auth --client <path-to-downloaded-client.json>`.
  - It reads the Cloud-Console **Desktop-app** client JSON (shape
    `{ "installed": { "client_id", "client_secret", "redirect_uris", "auth_uri",
    "token_uri" } }`), copies it to `~/.wienerdog/secrets/google-client.json` (0600),
    opens the system browser to Google's consent screen, starts a temporary
    `127.0.0.1:<ephemeral-port>` listener to catch the redirect, exchanges the code
    for a token, writes `~/.wienerdog/secrets/google-token.json` (0600), and prints a
    confirmation line naming the authenticated account email (best-effort).
  - The scopes it requests are fixed: `gmail.readonly`, `gmail.compose`, `calendar`,
    `drive.readonly`.
- **`wienerdog gws gmail search "<query>" --max 1`** (WP-011) is the read-only smoke
  test: it lists at most one matching message header. A zero-result search still
  proves auth works (exit 0, empty list); an auth failure exits non-zero with a
  `wienerdog: ...` message telling the user to run `wienerdog gws auth`.
- **Skill registration is NOT this WP's job.** The Claude adapter (WP-006) and Codex
  adapter (WP-010) already sync every `skills/wienerdog-*` folder into the harness on
  `wienerdog sync`. Creating the source `SKILL.md` here is sufficient; the next sync
  registers it. Do not touch any adapter or `sync` code.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | skills/wienerdog-google-setup/SKILL.md | the guided-OAuth prompt (this WP's whole substance) |
| create | tests/unit/google-setup-skill-structure.test.js | node:test that greps the mandatory steps below |

### `skills/wienerdog-google-setup/SKILL.md` — required structure

Frontmatter (exact keys, mirroring `wienerdog-setup`):

```yaml
---
name: wienerdog-google-setup
description: "Connect Wienerdog to your Google account (Gmail, Calendar, Drive). Walks you through creating a personal Google sign-in key, then verifies it. Use when the user wants to connect Google / Gmail / Calendar / Drive."
---
```

The body must contain these sections (use these **exact** `##` headings — the
structural test greps for them literally) with the content described. Write every
click-path as precise, current wording; when a Google label might have changed, tell
the user what the button *does* so they can find its renamed equivalent.

**`## What this does and what you'll need`**
- One short paragraph: this connects Wienerdog to the user's own Google account by
  creating a personal "OAuth client" (explain in plain words: a sign-in key that lets
  *this computer's* Wienerdog read their Gmail/Calendar/Drive and draft mail, and
  nothing else). State plainly: it takes about ten minutes, is a one-time setup, and
  nothing is sent anywhere — the key stays on their machine.
- Tell them what they need: a Google account and a web browser on this computer.

**`## Before you start: the plain-language picture`**
- Explain, in three or four sentences, the trust model so they are not alarmed by the
  Google "unverified app" warnings they will see: they are creating the app
  themselves, for themselves; the scary warning screens are Google asking "do you
  trust this app?" and the honest answer is "yes, I built it." State that Wienerdog
  only ever asks for read access to Gmail/Calendar/Drive plus permission to *draft*
  (not auto-send) mail, and that sending is separately gated later.

**`## Step 1 — Create a Google Cloud project`**
- Direct them to <https://console.cloud.google.com/>. Tell them to sign in with the
  Google account they want Wienerdog to use.
- Precise click path to create a new project (project dropdown at the top → "New
  Project" → name it e.g. `Wienerdog` → Create), and to wait for it to be created and
  then **select it** (so the rest of the steps happen inside it). Warn them that all
  later steps must happen with this project selected in the top bar.

**`## Step 2 — Turn on the Gmail, Calendar, and Drive APIs`**
- Explain that an API must be "enabled" before the key can use it. Click path: the
  navigation menu (☰) → "APIs & Services" → "Enabled APIs & services" → "+ Enable
  APIs and Services", then search for and enable each of **Gmail API**, **Google
  Calendar API**, and **Google Drive API** — one at a time, coming back to the library
  for the next. Tell them to enable all three before moving on.

**`## Step 3 — Set up the OAuth consent screen`**
- Click path: "APIs & Services" → "OAuth consent screen". Choose **External** user
  type (explain: because this is a personal Google account, not a Workspace-org
  internal app). Fill the minimum required fields (App name e.g. `Wienerdog`, their
  own email as user support email and as developer contact). Save and continue through
  the Scopes and Test-users pages without adding anything.
- **Publishing status:** tell them to set the app to **"In production"** (the
  "Publish App" / "Push to production" button on the OAuth consent screen overview),
  and confirm the dialog. Explain why in one sentence: a "Testing" app issues tokens
  that silently expire after 7 days, which would break Wienerdog's scheduled jobs; "In
  production" issues long-lived tokens. Reassure them that "In production" here does
  **not** mean public — no one else can use their personal client.

**`## Step 4 — Create a Desktop-app client and download the JSON`**
- Click path: "APIs & Services" → "Credentials" → "+ Create Credentials" → "OAuth
  client ID" → Application type **"Desktop app"** (this exact type matters — it is
  what enables the localhost sign-in Wienerdog uses) → name it → Create.
- A dialog appears with the new client. Tell them to click **"Download JSON"** and
  remember where the file saved (usually the Downloads folder), and its filename
  (something like `client_secret_….json`). They will hand this file to Wienerdog next.
- Reassure: this file is like a house key for their own Google account access;
  Wienerdog copies it into its private, permission-locked folder and never sends it
  anywhere.

**`## Step 5 — Hand the file to Wienerdog`**
- Have them tell you the path to the downloaded file (or find it in their Downloads
  folder). Then run, in the shell:

  ```bash
  wienerdog gws auth --client "<path to the downloaded JSON>"
  ```

- Explain what happens: a browser tab opens to Google's sign-in/consent screen; they
  pick the same account, click through the "unverified app" warning (Advanced → "Go
  to Wienerdog (unsafe)" — reassure them this is expected because they built it), and
  approve the requested read/draft access. The tab then says they can close it, and
  the command prints a confirmation naming the connected account.
- If the browser does not open, tell them the command also prints the URL to paste
  manually. If it fails, the message tells them what to fix; common causes: they chose
  the wrong client type in Step 4, or the app is still "Testing".

**`## Step 6 — Verify the connection`**
- Run a single read-only smoke check and confirm it succeeds:

  ```bash
  wienerdog gws gmail search "in:inbox" --max 1
  ```

- Explain that if this prints a message (or an empty result) with no error, Google is
  connected and Wienerdog can now read their Gmail/Calendar/Drive and draft mail. If
  it errors telling them to run `wienerdog gws auth`, something in the steps above did
  not complete — walk back through Steps 3–5.
- Close by telling them, in plain language, what is now possible and what is **not**:
  Wienerdog can read and draft, but it cannot *send* email until they explicitly grant
  a routine permission to do so (that is a separate, deliberate step). Do not run any
  grant command here.

**`## If something goes wrong`**
- A short troubleshooting list keyed to the exact symptoms: "unverified app" dead-end
  (they must click Advanced → proceed), token expired after a week (the app is still
  "Testing" — redo Step 3's publish), `access_denied` (they declined a scope — rerun
  `gws auth`), wrong client type (delete it, redo Step 4 as "Desktop app").

### `tests/unit/google-setup-skill-structure.test.js` — required assertions

A `node:test` file that Reads `skills/wienerdog-google-setup/SKILL.md` once and
asserts (use `assert.ok(text.includes(...))` / `assert.match`). Mirror the structural
approach of WP-009's `dream-skill-structure.test.js`. List each check:

1. Frontmatter contains `name: wienerdog-google-setup` and a non-empty `description:`.
2. All eight `##` headings above are present, literally:
   `## What this does and what you'll need`,
   `## Before you start: the plain-language picture`,
   `## Step 1 — Create a Google Cloud project`,
   `## Step 2 — Turn on the Gmail, Calendar, and Drive APIs`,
   `## Step 3 — Set up the OAuth consent screen`,
   `## Step 4 — Create a Desktop-app client and download the JSON`,
   `## Step 5 — Hand the file to Wienerdog`,
   `## Step 6 — Verify the connection`,
   `## If something goes wrong`.
3. The console URL `console.cloud.google.com` appears.
4. All three API names appear: `Gmail API`, `Google Calendar API`, `Google Drive API`.
5. The exact publishing instruction phrase `In production` appears, AND the string
   `Desktop app` appears (case-sensitive, the exact client type).
6. The auth command `wienerdog gws auth --client` appears.
7. The verify command substring `wienerdog gws gmail search` with `--max 1` appears.
8. The skill states sending is NOT enabled here: it contains both `draft` and a
   statement that it cannot `send` until a grant (grep `send` and `grant`,
   case-insensitive), and contains NO `wienerdog grant` command invocation (assert the
   string `wienerdog grant send` is absent — this skill must not run a grant).

## Implementation notes & constraints

- **This is a prompt, not code.** Plain, confident, knowledge-worker English (product
  voice per CLAUDE.md). The click paths are the substance — be precise, and where a
  Google label may drift, describe the button's purpose so a renamed control is still
  findable. Do not invent screenshots or image references.
- The skill must be **self-contained**: it relies only on the two `gws` commands above
  and the user's browser. It never edits files, never registers itself, never touches
  `secrets/` directly (only `gws auth` writes there).
- Do not instruct the user to install `gcloud`, any SDK, or any dependency — the whole
  point of the guided flow is that they need nothing but a browser and the shipped
  `wienerdog` CLI.
- No new npm dependencies. The structural test is Node stdlib (`node:test`, `fs`).
- When uncertain: choose the simpler wording and record it under "Decisions made". Do
  NOT expand scope.

## Acceptance criteria

- [ ] `skills/wienerdog-google-setup/SKILL.md` exists with the frontmatter and all
      eight `##` sections above.
- [ ] The skill names all three APIs, the "Desktop app" client type, and the "In
      production" publishing step, in plain language with precise click paths.
- [ ] The skill drives exactly two commands — `wienerdog gws auth --client <path>` and
      a read-only `wienerdog gws gmail search ... --max 1` verify — and runs no grant.
- [ ] `tests/unit/google-setup-skill-structure.test.js` passes (all checks above).
- [ ] `npm run lint` (markdownlint covers `skills/**/*.md`) passes on the new SKILL.md.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern google-setup-skill
npm run lint   # markdownlint covers skills/**/*.md
```

**Live OAuth walk-through is verified by hand at milestone M5** (the owner runs the
skill against a real Google Cloud project end to end). This WP's automated checks are
structural only; note in the PR whether the manual walk-through was run.

## Out of scope (do NOT do these)

- **The `gws auth` command and OAuth loopback** — WP-011 (already built). This skill
  only invokes it.
- **Send grants / `wienerdog grant send`** — WP-018. This skill enables read+draft and
  explicitly stops short of sending.
- **The routine catalog and daily digest** — WP-014. Connecting Google is a
  prerequisite the catalog assumes; do not fold catalog steps in here.
- **Registering/syncing the skill** into `~/.claude/skills` or Codex `[skills]` —
  WP-006 / WP-010. This WP creates the source `SKILL.md` only.
- **Any code change.** This WP is one skill file plus its structural test.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/012-google-setup-skill`; PR titled `feat(gws): author the wienerdog-google-setup skill (WP-012)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
