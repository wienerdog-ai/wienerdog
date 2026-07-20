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

You'll see a durable alert in the **digest banner** — a line at the top of your
next injected session digest (`~/.wienerdog/state/digest.md`), so it's one of the
first things your AI shows you — and, if email alerts are configured, a
notification email. It says a scheduled job **refused to run** because of an
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

## Where to check status (and where not to look)

As of this release, `wienerdog doctor` does **not** read any of the state this
runbook is about — it doesn't show the authorization record, the pin store, the
app fingerprint, or a drift alert. The one place a mismatch surfaces is the
**digest banner** described above, plus an alert email if you've configured one.
If you don't see a banner, nothing has refused. Wiring `doctor` up to show this
directly is a planned follow-up, not built yet.

## Catching up after downtime

If your machine was off or asleep at the scheduled time, Wienerdog runs missed
jobs later (catch-up) rather than skipping them. On **macOS and Windows**,
catch-up checks each missed job against the same authorization record a normal
run uses — bound in the last time you ran `wienerdog sync` (or added a routine,
or ran initial setup). A job that was added, removed, or changed since then is
refused with an alert, exactly like a normal run — never silently skipped and
never silently run with stale rules. On **Linux**, catch-up works differently:
the OS timer itself replays the normal per-job run, which is already checked the
same way every night, so there's no separate catch-up check to describe.

One honest edge case: a catch-up entry that hasn't been through a `sync` yet (a
brand-new install before its first sync, or a manual invocation) has nothing to
check against yet, and falls back to running the job as currently configured —
the same "only checked once you've synced" rule every integrity check here
follows. Running `wienerdog sync` activates it.

## What this does and does not protect

**It does** protect against *scoped* changes — a limited file-write, a stray
edit, or a misbehaving agent session that can write your `config.yaml`, the app
tree, or `~/.local/bin` but cannot re-register the OS scheduler entry or overwrite
the launcher itself. Against that, a changed `config.yaml` or app tree is
**detected and refused**, not silently run.

**What's pinned today.** The pinning above covers the three things the nightly
dream actually spawns: Claude (or Codex), Git for the vault commit, and the
pre-dream containment check. It does not yet cover routines you add from the
catalog (morning digest, inbox triage, and so on) — those still run Claude by
its plain command name. Pinning them is a planned follow-up.

**A couple of places the check is lighter.** On a developer checkout (not the
packaged install almost everyone has), the app-code fingerprint is skipped —
your own tracked source is expected to change — but the rest of the
authorization record (what runs, the model, the timeout, the schedule, and so
on) is still checked and still refuses on a mismatch. On Windows, the check that
Claude/Git haven't moved is lighter than on Mac/Linux: it confirms they're still
a regular file at the pinned location, but doesn't check file ownership or
permissions the way Mac/Linux do (Windows has no equivalent concept).

**It does not** protect against arbitrary software running on your computer *as
you*. Anything running under your own user account can already read and rewrite
the same files — including the launcher file that does the checking. Defending
against that is a different, OS-level problem (it needs a launcher anchored
outside your own write access, and OS user-presence checks), and Wienerdog does
not claim to solve it. In short: this **detects drift between the times you run
`sync`**; it is **not** a wall against same-user native malware. See the
[threat model](../THREAT-MODEL.md) (T8) for the honest boundary — including three
specific timing windows (mid-verify file swaps at fire, heal, and uninstall time)
that are accepted as the same same-user-native residual, not claimed as closed.
