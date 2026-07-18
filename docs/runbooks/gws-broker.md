# Runbook: the Google Workspace capability broker

This is the operator's guide to how Wienerdog reaches Google — Gmail, Calendar,
and Drive — and what to do when it needs attention. It is written for you, the
person who owns the machine, not for a developer.

> Google Workspace access is **off** in this security-hardened build, behind a
> pre-use safety gate. Run `wienerdog safety` to see what is enabled. This
> runbook describes how the broker behaves once that gate is opened.

## What the broker is

When a scheduled routine (the morning digest, inbox triage, the weekly review)
needs Google, it does **not** get your Google password or token. Instead
Wienerdog starts a small local helper — the **capability broker** — that alone
holds your Google sign-in and offers the routine only a short, fixed menu of
actions: search mail, read one message, list today's calendar, create a draft,
send the morning digest to yourself. Nothing else. The broker starts when the
routine starts, and stops the moment the routine stops. It is never a
background service, opens no network port, and holds no data of its own.

The routine's AI can pick items **from that menu** but can never reach past it:
it cannot read your saved sign-in, cannot send to an arbitrary address, cannot
delete a calendar event, and cannot run raw Google code. Each menu item is tied
to exactly one Google operation, checked against a fixed list.

**What this protects, honestly.** This boundary contains the *AI* — including an
AI that has been tricked by a malicious email. It is **not** a wall against
other software running on your computer as you: anything running under your own
user account can already read the same files. If your machine itself is
compromised, this broker is not what saves you (your OS account and disk
security are). See the [threat model](../THREAT-MODEL.md), T4a, for the precise
boundary.

## Connecting Google (first-time and re-auth)

Run, at your keyboard:

```
wienerdog gws auth --client <path-to-your-oauth-client.json>
```

Because Wienerdog uses **least-scope credentials**, this walks you through
**several short consent screens in a row** — one per capability group:

- **read** — Gmail read, Calendar read, Drive read;
- **draft** — create Gmail drafts;
- **send** — send mail (a separate, narrower permission than drafting);
- **calendar write** — create calendar events.

Approve each one. Wienerdog stores each as its own file and checks that Google
granted **exactly** the access asked for — no more. Approving all of them keeps
every routine option available; you can approve only the groups you want.

If you connected Google in an older version, the old single combined sign-in is
set aside automatically and you are asked to reconnect this way. The old
credential is never reused.

## The 7-day expiry (and how to avoid it)

Google treats an OAuth app that is still in **"Testing"** status specially: the
sign-in it issues **expires after 7 days** for the sensitive Gmail and Drive
permissions. If your app is in Testing, your unattended routines will stop
working about once a week until you re-run `wienerdog gws auth`. When this
happens the broker fails **loudly** — you get a clear alert telling you to
reconnect — never a silent "the digest just didn't arrive".

To avoid the weekly reconnect, in the Google Cloud console set your OAuth
consent screen's publishing status to **"In production"** (it can stay
*unverified* — you will see a one-time "Google hasn't verified this app"
warning when you connect, which is expected for your own personal app). That
removes the 7-day expiry. The 100-user limit that comes with an unverified app
does not matter here — it is your own app, used only by you.

Full **app verification** (a formal Restricted-scope security assessment) is the
step that clears the unverified warning entirely. Its cost and process are
Google's and change over time — see Google's current
[restricted-scope app-verification page](https://support.google.com/cloud/answer/13463073)
rather than any figure quoted here.

## Granting a routine permission to send or write the calendar

Reading and drafting need no grant. **Sending** and **creating calendar
events** do — and a grant can be created **only by you, at the keyboard**, by
typing a confirmation word. No routine, script, or `--yes` flag can create or
widen one.

```
wienerdog grant send --routine daily-digest --to <your-own-address>
wienerdog grant calendar-write --routine <routine-name>
```

The morning digest sends **only to your own address** — the broker fills in the
recipient itself, so even a compromised routine cannot redirect it. Grants live
in a protected file that the broker checks for tampering before every send; if
that file is altered, the broker refuses to send and tells you to re-grant at
the keyboard.

## Turning access off / revoking

- **Remove a grant locally:** delete the grant by re-running the grant flow, or
  remove the broker grant store file (`state/broker-grants.json`) — the routine
  then falls back to draft-only / no calendar write.
- **Revoke at Google:** open your Google Account's
  **Security → Third-party access** and remove Wienerdog's app. Note that
  revocation is **all-or-nothing per app** — removing access there disables
  *all* of the capability groups at once, not just one. (Per-group revocation
  would require setting up separate Google apps, which v1 does not do.)
- **Full uninstall:** `wienerdog uninstall` removes the stored sign-ins and the
  grant store along with everything else Wienerdog created.

## What the broker does and does not protect

| It contains | It does not contain |
|-------------|---------------------|
| An AI tricked by a malicious email or web page | Other software running as your OS user |
| A routine trying to send to an outside address | Someone with your unlocked laptop |
| A routine trying to delete/modify calendar events | A compromised operating system |
| A routine trying to read your stored sign-in | — |

The broker's containment of a hijacked AI is proven end-to-end by the
poisoned-email test harness (`tests/scenarios/broker-e2e/`). The protection of
the underlying files is your OS account and disk encryption, exactly as it is
for every other app you run.
