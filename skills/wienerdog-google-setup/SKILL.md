---
name: wienerdog-google-setup
description: "Connect Wienerdog to your Google account (Gmail, Calendar, Drive). Walks you through creating a personal Google sign-in key, then verifies it. Use when the user wants to connect Google / Gmail / Calendar / Drive."
---

# Wienerdog Google setup

Your job is to walk the person through connecting Wienerdog to their own
Google account — Gmail, Calendar, and Drive — one step at a time, in plain
language. Do not rush ahead: do one step, wait for them to confirm it worked,
then move to the next.

## What this does and what you'll need

This connects Wienerdog to the person's own Google account by creating a
personal "OAuth client" — think of it as a sign-in key that lets *this
computer's* Wienerdog read their Gmail, Calendar, and Drive, and draft email
on their behalf, and nothing else. It takes about ten minutes, it's a
one-time setup, and nothing is sent anywhere: the key stays on their
machine.

What they need: a Google account, and a web browser on this computer.

## Before you start: the plain-language picture

They are about to create a small Google Cloud project and, inside it, a
sign-in key — both for themselves, used only by themselves. Along the way
Google will show a couple of "unverified app" warning screens. That's
expected and not a red flag: those screens exist for apps built by strangers
for the public, and Google can't tell the difference between that and
someone building a private tool for their own computer. The honest answer to
"do you trust this app?" is "yes, I built it." Wienerdog only ever asks to
*read* Gmail, Calendar, and Drive, plus permission to *draft* (never
auto-send) email — actually sending mail is a separate, deliberate step
they'd have to turn on later.

## Step 1 — Create a Google Cloud project

Go to <https://console.cloud.google.com/> and sign in with the Google
account they want Wienerdog to use.

Click the project dropdown near the top of the page, then click **"New
Project"**. Name it something recognizable, like `Wienerdog`, and click
**Create**. Wait a few seconds for Google to finish creating it, then open
the project dropdown again and **select the new project** — everything from
here on must happen with this project chosen in the top bar, so double-check
it before each later step.

## Step 2 — Turn on the Gmail, Calendar, and Drive APIs

An "API" has to be switched on, one at a time, before the sign-in key is
allowed to use it. Click the navigation menu (the ☰ icon, top-left) →
**"APIs & Services"** → **"Enabled APIs & services"** → **"+ Enable APIs and
Services"**. This opens a search box.

Search for and enable each of these, one at a time — after enabling one,
click back to the API library to search for the next:

- **Gmail API**
- **Google Calendar API**
- **Google Drive API**

Make sure all three show as enabled before moving to Step 3.

## Step 3 — Set up the OAuth consent screen

Go to **"APIs & Services"** → **"OAuth consent screen"**.

Choose **External** as the user type (this is a personal Google account, not
a Google Workspace organization, so External is correct). Fill in only the
required fields: an app name (e.g. `Wienerdog`), and their own email address
as both the user support email and the developer contact email. Click
**Save and Continue** through the Scopes page and the Test users page
without adding anything on either — leave them empty and keep going.

Once the app is created, find the **publishing status** on the OAuth
consent screen's overview page and set it to **"In production"** — the
button may be labeled "Publish App" or "Push to production." Confirm the
dialog that appears. This matters because an app left in "Testing" mode
issues sign-in tokens that silently expire after 7 days, which would quietly
break Wienerdog's scheduled jobs; "In production" issues long-lived tokens
instead. Reassure them: "In production" here does not mean public — no one
else can discover or use their personal client.

## Step 4 — Create a Desktop-app client and download the JSON

Go to **"APIs & Services"** → **"Credentials"** → **"+ Create Credentials"**
→ **"OAuth client ID"**. For "Application type," choose **"Desktop app"** —
this exact type matters, it's what allows the sign-in step later to work
from their own computer. Give it a name and click **Create**.

A dialog appears showing the new client. Tell them to click **"Download
JSON"** and note where the file was saved (usually their Downloads folder)
and its filename (something like `client_secret_....json`). They'll hand
this file to Wienerdog in the next step.

Reassure them: this file is like a house key for their own Google account
access. Wienerdog copies it into its own private, permission-locked folder
on their computer and never sends it anywhere else.

## Step 5 — Hand the file to Wienerdog

Ask them for the path to the downloaded file (or help them find it in their
Downloads folder). Then run, in the shell:

```bash
wienerdog gws auth --client "<path to the downloaded JSON>"
```

Explain what will happen: a browser tab opens to Google's sign-in and
consent screen. They pick the same Google account, click through the
"unverified app" warning (click **Advanced**, then **"Go to Wienerdog
(unsafe)"** — expected, as covered above, because they built this app
themselves), and approve the requested read and draft access. The tab then
tells them they can close it, and the command prints a confirmation naming
the connected account.

If a browser tab doesn't open on its own, the command also prints a URL
they can paste into a browser by hand. If it fails outright, the error
message says what to fix — the two most common causes are picking the wrong
client type in Step 4 (it must be "Desktop app") or the consent screen still
being in "Testing" mode (redo the publish step in Step 3).

## Step 6 — Verify the connection

Run a single read-only check and confirm it succeeds:

```bash
wienerdog gws gmail search "in:inbox" --max 1
```

If this prints a message (or comes back empty) with no error, Google is
connected and Wienerdog can now read their Gmail, Calendar, and Drive, and
draft email. If it errors and tells them to run `wienerdog gws auth`,
something in the steps above didn't finish — walk back through Steps 3
through 5.

Close by telling them plainly what's now possible and what isn't yet:
Wienerdog can read their Gmail/Calendar/Drive and draft email, but it cannot
*send* email until they explicitly grant that as a separate, deliberate
step later. Do not run any grant command here — that's a different setup
step, for another time.

## If something goes wrong

- **Stuck on the "unverified app" warning with no way past it** — click
  **Advanced**, then the "Go to Wienerdog (unsafe)" link underneath. This is
  expected for a personal client and is not a sign anything is broken.
- **Sign-in worked but stopped working again about a week later** — the
  consent screen is still in "Testing" mode. Go back to Step 3 and publish
  it to "In production."
- **`access_denied` error** — a scope was declined during sign-in. Just
  rerun `wienerdog gws auth --client "<path>"` and approve everything this
  time.
- **The client type is wrong** — if Step 4 was created as something other
  than "Desktop app," delete that client in the Credentials page and redo
  Step 4, making sure to choose "Desktop app."
