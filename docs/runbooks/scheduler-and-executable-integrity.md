# Runbook: scheduled-run and executable integrity

This is the operator's guide to how Wienerdog makes sure your **nightly
scheduled runs** (the dream, and any routines you turn on) run only the code and
tools they were authorized to run — and what to do when it tells you something
changed. It is written for you, the person who owns the machine, not for a
developer.

## The short version

Your OS scheduler (launchd on macOS, systemd on Linux, Task Scheduler on
Windows) fires a small Wienerdog job on a timer. That job's launch instruction
is fixed, but two things it depends on can be edited later: the code under
`~/.wienerdog/app/current`, and the `run` action in `~/.wienerdog/config.yaml`.
So before each nightly run, an **independent launcher** checks that:

- the app's code is exactly the code that was there when you last ran
  `wienerdog sync` (a content fingerprint must match);
- the job still matches the **authorization record** ("descriptor") that was
  written and locked in at sync time;
- Claude and Git are run only from the exact install locations Wienerdog
  **pinned** for them.

If everything matches, the run proceeds. If anything doesn't, the run **refuses**
— it does nothing, records an alert, and waits for you. Nothing runs "anyway".

## What a drift / mismatch alert means

You'll see a durable alert (in `wienerdog doctor` output, and — if email alerts
are configured — a note) saying a scheduled job **refused to run** because of an
integrity mismatch. That means one of the checked things changed since your last
`wienerdog sync`:

- **You (or a tool) edited `config.yaml`** — for example changed the model, the
  timeout, or what the job runs — but didn't re-sync. The launcher only trusts
  the version you locked in at sync time, so it refuses until you re-authorize.
- **The app code under `app/current` changed** — a file was modified, or the
  `current` pointer now points somewhere else.
- **Claude or Git moved** — you reinstalled one of them a different way (for
  example switched to Homebrew), so it now lives at a different path than the one
  Wienerdog pinned.

A mismatch is **not** proof of an attack — the most common cause is a legitimate
edit or reinstall without a follow-up sync. But the launcher can't tell the
difference between "you changed it on purpose" and "something changed it," so it
refuses either way and leaves the decision to you. That's the point: one skipped
night is the cost of never silently running unauthorized code.

## The fix: `wienerdog sync`

For almost every mismatch, the fix is a single command:

```bash
wienerdog sync
```

`sync` re-resolves and re-pins Claude/Git, re-reads your current `config.yaml`,
re-fingerprints the app, and re-writes the authorization record and the digest
bound into the scheduler entry. After a successful sync, the next scheduled run
verifies cleanly and proceeds.

**Before you re-sync, confirm the change was expected.** If you know why it
changed (you edited config, updated Claude, upgraded Wienerdog), re-sync and
you're done. If you *don't* recognize the change, treat it as a signal: look at
what changed under `~/.wienerdog` before re-authorizing it.

## Updating Claude, Git, or Wienerdog itself

- **Claude Code auto-updates** several times a day by dropping a new version file
  in the same place. That is expected and passes **silently** — no alert, no
  re-sync needed. Wienerdog pins Claude by *where it's installed*, not by its
  exact bytes, precisely so routine updates don't nag you.
- **Changing how Claude or Git is installed** (e.g. native install → Homebrew, or
  moving it to a new directory) changes its install location, which **fails safe**
  — the next run refuses until you run `wienerdog sync` to pin the new location.
- **Upgrading Wienerdog** (`npx wienerdog@latest sync`) vendors the new app
  version and re-binds everything as part of the sync. Wienerdog never
  auto-updates itself; it only tells you the command.

## What `wienerdog doctor` reports

`wienerdog doctor` surfaces the current integrity state in plain language:
whether each scheduled job's authorization record is present and matches, whether
the app fingerprint verifies, whether Claude/Git are resolvable at their pinned
locations, and any outstanding drift alerts with the exact remedy. If a run
refused, `doctor` is where you see why and what to do.

## What this does and does not protect

**It does** protect against *scoped* changes — a limited file-write, a stray
edit, or a misbehaving agent session that can write your `config.yaml`, the app
tree, or `~/.local/bin` but cannot re-register the OS scheduler entry or overwrite
the launcher itself. Against that, a changed `config.yaml` or app tree is
**detected and refused**, not silently run.

**It does not** protect against arbitrary software running on your computer *as
you*. Anything running under your own user account can already read and rewrite
the same files — including the launcher file that does the checking. Defending
against that is a different, OS-level problem (it needs a launcher anchored
outside your own write access, and OS user-presence checks), and Wienerdog does
not claim to solve it. In short: this **detects drift between the times you run
`sync`**; it is **not** a wall against same-user native malware. See the
[threat model](../THREAT-MODEL.md) (T8) for the honest boundary.
