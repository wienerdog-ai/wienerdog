# Changelog

All notable changes to Wienerdog. Format: [Keep a Changelog](https://keepachangelog.com), versioning: SemVer (0.x until the installed file layout stabilizes — ADR-0003).

## [0.10.0] — 2026-07-22

This is Wienerdog's biggest security release yet. Between 0.9.0 and this release, an independent audit went through every place Wienerdog reaches outside your own machine — connecting Google, the scheduled routines (morning digest, inbox triage, weekly review), the daily summary injected into every new session, and the nightly memory consolidation's ability to edit your identity notes — and found real gaps in each one. Every one of those capabilities was rebuilt and hardened before being turned back on. The result is the same conveniences as before, now running on narrower Google permissions, inside a locked-down execution environment that checks itself before every run, and with a human always confirming anything sensitive before it's trusted or sent.

### Added
- **Google access is now split into narrow, single-purpose permissions instead of one bundled key.** Reading your mail and calendar, drafting a reply, sending, and adding a calendar event each use their own separate, minimal permission — so a bug, or a hostile email a routine reads, can't quietly upgrade "read your inbox" into "send from your account." Scheduled routines never hold any of these permissions directly: they reach Google only through a small, temporary go-between that alone holds the credentials and will only perform a short, fixed list of allowed actions for exactly as long as the routine runs — never a broad, send-capable connection. The digest routine's own outgoing mail can only ever go to your own address, never one supplied by something it read.
- **Scheduled routines now run in a locked-down copy of Claude, checked fresh before every single run.** The morning digest, inbox triage, and weekly review already ran with a restricted toolset and no general internet or command-line access; now, right before each run, Wienerdog does a quick live check that the lockdown is actually holding on your installed version of Claude Code — and refuses to run rather than proceed on an unverified setup. This matters because a routine's whole job is to read things you didn't write (your inbox); the lockdown is what keeps a poisoned email from doing anything beyond being read.
- **The daily summary injected into every new session is now clearly labeled as background information, not instructions.** Your daily notes can pull in text from emails and other sources during the day, so the summary Wienerdog shows at the start of a session is now wrapped in a visible marker telling the model to treat it as data for context only — and it's read with a size limit, so an oversized note can't be used to overload a session either.
- **Automatic identity memory is back — safe, and always with your sign-off.** The nightly memory consolidation can once again propose edits to your identity notes (who you are, your preferences, your goals) after noticing the same pattern across enough sessions. But nothing it proposes is trusted into your next session until you approve the exact text with `wienerdog memory approve <file>`. New: `wienerdog memory approve --all` lets you review and ratify every note that's waiting on you in one sitting, instead of one at a time.

### Fixed
- **Sending your own morning digest, and the "something went wrong" alert email, now work under the new narrower send permission.** A Google quirk meant looking up your own address needed a slightly broader permission than sending does. Wienerdog now looks up your address using the read permission and sends using the narrower send-only one, so nothing had to give up its minimal-permission guarantee to keep working.
- **Scheduled routines keep working on the newest Claude Code.** A recent Claude Code update changed how it interprets a routine's start signal, which could make a routine silently do nothing. Routines now start with a plain instruction instead of that signal, so they're unaffected by the change.

### Security & hardening
- **Wienerdog now checks its own scheduled jobs, launcher, and installed program for tampering before anything runs.** Every scheduled and nightly run verifies that the code about to execute, and the job description driving it, still match what was actually set up — so a stray write into Wienerdog's own folder can no longer quietly swap in different code, or a different command, for the scheduler to run later.
- **Uninstall no longer trusts its own bookkeeping file blindly.** The record Wienerdog keeps of what it created is now treated as untrusted input when reversing an install: a corrupted or tampered copy of that record can no longer be used to delete or rewrite a file it shouldn't, and one bad entry in it no longer aborts the whole uninstall.
- **A killed or crashed job can no longer leave stray processes running.** Wienerdog still runs nothing in the background by design — but a scheduled routine or the nightly consolidation could occasionally leave an orphaned process behind if it was interrupted at just the wrong moment. Every run now hunts down and stops anything it started, including processes that tried to detach from their parent to survive.
- **Your private files stay private even under unusual filesystem tricks.** The checks that keep Wienerdog's secrets and configuration locked to your account alone are now resistant to symlink and path-swapping tricks that could otherwise have exposed or corrupted them.

## [0.9.0] — 2026-07-16

This release exists because Wienerdog's own health check failed its maintainer. A demo recording accidentally ran the installer "half-sandboxed" — its own folder redirected to a temporary location, but the real Claude Code settings left in place. The install quietly rewired the live setup to point at that temporary folder; three days later macOS purged it, every `/wienerdog-*` command vanished, session hooks failed on every start, and `wienerdog doctor` said everything was fine. All three gaps are now closed — and the new checks proved themselves immediately by finding a piece of that incident's residue the manual cleanup had missed.

### Added
- **`doctor` now verifies your skills are truly wired up, not just present.** For both Claude Code and Codex, every skill registration must point into the current install and contain its skill file. A link pointing at a vanished or foreign location, a leftover empty folder, or a damaged install copy gets a clear warning naming the skill and the fix (`wienerdog sync`). Previously, a completely broken setup could show all-green.
- **`doctor` now spots leftover session hooks.** A hook that matches Wienerdog's exact shape but whose script no longer exists — the thing that silently logs "hook failed" at every session start, forever — is flagged with the exact settings file and entry to remove. Notice-only: doctor never edits your settings, because a hook at a foreign path can't be proven to be Wienerdog's own.
- **`init` and `sync` warn about a half-sandbox before writing anything.** If `WIENERDOG_HOME` points somewhere custom while your real Claude Code or Codex settings would still be modified, you now get a loud warning naming the exposed tool — with stronger wording when the custom location looks temporary. It warns and never blocks, so deliberate custom setups keep working.

### Changed
- **`sync` decides which AI tools to write into once per run.** It takes a single snapshot of which tools are present, warns from that snapshot, and rechecks each tool still exists at the last moment before writing into it. A tool appearing or disappearing mid-run can no longer be written into without warning or crash the run partway through.

## [0.8.1] — 2026-07-13

This release fixes a dead-end that could hit anyone who connected Google before July 4 and then updated: the Google connection itself was fine, but every Gmail, Calendar, and Drive command failed with a message wrongly telling you to set Google up again.

### Fixed
- **Your Google connection heals itself after an update.** If Wienerdog finds your Google sign-in intact but its Google client library missing (the state older installs land in after updating), any Google command now offers to install the library on the spot — one consent, no browser, no re-connecting. Scheduled jobs that can't ask (like the morning digest) fail with a short, accurate note naming the one command to run, instead of the misleading "Google isn't set up yet."
- **Error messages about Google now tell the truth.** Wienerdog distinguishes "not connected," "connected but the library needs its one-time install," "the library is installed but damaged" (with the exact repair: delete its folder, then reinstall — a plain reinstall can falsely report "up to date"), and "your sign-in file looks damaged" — and never sends you back through full Google setup when you don't need it.
- **Pressing Enter at the install prompt now means Yes**, as its `[Y/n]` wording always claimed. (It had silently counted as No since the prompt was introduced.)
- **`--json` output stays clean JSON.** Install notices, consent prompts, and installer output go to the error stream, so piping a Google command's JSON into another tool can't be corrupted mid-install.
- The suggested repair command now works for folder paths containing spaces (the path is quoted).

### Added
- **`wienerdog doctor` now checks your Google connection.** One line tells you whether Google is connected and whether its library is healthy, missing, or damaged — with the exact remedy. Doctor stays silent if you never connected Google, and it validates the sign-in file itself instead of assuming any file means "connected."
- **Updates repair the library for you.** Running `wienerdog sync` (or an update) in a terminal offers the same one-time library install when your connection needs it — so machines that only run scheduled jobs get fixed the next time you touch them, without waiting for an interactive Google command.

### Security & hardening
- **Stronger containment for the on-demand Google library.** The check that trusts only the copy Wienerdog installed now constructs its path directly instead of searching upward — a copy of the library anywhere else on your machine is never even considered, and a subtle Node caching quirk can no longer make a freshly installed copy invisible until the next run.

## [0.8.0] — 2026-07-13

This release put Wienerdog's older, foundational parts through the same adversarial security review its newer features already get. Seventeen hardening changes came out of it. None of them change how Wienerdog works day to day — they close edge cases that would only matter if something (a downloaded file, a web page captured in a session recording, an interrupted uninstall) were hostile or malformed.

### Added
- **Connecting Google is more secure — and no longer hangs.** Google sign-in now uses PKCE and a one-time anti-forgery token (the industry standard for this kind of on-your-own-computer sign-in, RFC 8252), so another program sharing your machine can't slip into the handshake. And if you close the browser without finishing, sign-in now gives up after five minutes with a clear message instead of waiting forever.

### Security & hardening
- **Sending email stays inside the permission you granted — no header tricks.** A crafted subject line or contact name can no longer smuggle an extra, hidden recipient past the send permission you approved. Send permissions are also confirmed correctly when Wienerdog is run non-interactively, and an empty recipient is never treated as "allowed."
- **An interrupted uninstall is always safe to run again.** If uninstall is stopped partway (a crash, a closed laptop), it now leaves things so that simply running it again finishes the job — and on that retry it can never delete a vault you keep inside Wienerdog's own folder.
- **Downloads and installs are verified before they're trusted.** The version Wienerdog vendors is unpacked through a containment check (no file can escape its folder via a crafted path or symlink), the macOS/Linux installer pins HTTPS and shows you the exact Node download it will run, and the Windows installer refuses any non-HTTPS Git download address.
- **The uninstaller's "your notes are yours" guard resists path trickery on macOS.** The check that stops uninstall from touching anything outside its own area now correctly handles symlinks, Apple's firmlinks, and Unicode/upper-lower-case variations of your home-folder path, so a lookalike path can't slip past it.
- **Scheduling handles awkward file paths and never fails silently.** Schedule files now correctly escape special characters in paths, and if the system scheduler refuses a change, Wienerdog says so plainly instead of reporting success it didn't achieve.
- **Assorted internal hardening.** Session recordings from Codex are now read with the same "anything that came from a tool or a web page is untrusted" rule that Claude sessions already use (some of that content was previously dropped); the nightly dream keeps its skill-usage bookkeeping correct even when a recording is trimmed for length; skill folders are refreshed by verified ownership instead of a blind delete; hook commands and memory "managed blocks" are written and matched more strictly; the secrets folder is locked down only if Wienerdog created it; and the internal alerts log can no longer grow without bound.

## [0.7.1] — 2026-07-12

### Changed
- **Documentation only — no behavior changes; the installed files are identical to 0.7.0.**
- README's setup steps no longer tell Codex users to run `/wienerdog-setup` (that command only exists in Claude Code); the Codex way — `/skills`, then `$wienerdog-setup`, or just asking in plain words — is now spelled out, matching what setup itself has printed since 0.6.7.
- README's feature list now describes what 0.7.0 actually shipped: skills Wienerdog created keep learning from real use and are carefully revised over time, with your own skills remaining off limits.
- Security wording tightened to match the threat model: "no new attack surface" became the precise claim (nothing listens, nothing serves, nothing phones home), and the threat model now documents the skill-revision surface introduced in 0.7.0 (ADR-0020) — including that v1 has no human approval gate; the dream report and git revert are the undo story.

## [0.7.0] — 2026-07-12

### Added
- **Skills now learn from being used.** Until now, the nightly dream could create a new skill when it noticed you doing the same kind of task again and again — but a skill, once written, never got better. Now the dream also watches how its skills perform in your real sessions: when one stumbles, needs a workaround, or you correct it, that observation is written down in a small log next to the skill. Once the same lesson has shown up in at least three different sessions, the dream may carefully revise the skill's instructions — and every revision is listed in the dream report, with your vault's git history as the undo button.
- **Strict safety rails around skill revisions, checked by code — not by trust.** Only skills Wienerdog itself created can ever be revised (your own skills and Wienerdog's built-in ones are permanently off limits, enforced by a tamper-proof ownership registry). A lesson only counts if the skill was genuinely used in a session — verified against the session recording itself — and anything that came from tool output (web pages, files, command results) is treated as untrusted and can never authorize a revision. We verified this end to end: a planted attack that tried to talk the nightly dream into poisoning a skill was refused, logged, and quarantined on a live run.

### Notes
- On Codex-only setups, skills are created and lessons are collected, but automatic revision stays off for now — it needs a usage signal that only Claude Code sessions currently provide.

## [0.6.7] — 2026-07-10

### Fixed
- **Codex CLI can now actually see Wienerdog's skills.** Skills were linked into a folder Codex's documentation mentions but shipped versions never read (`~/.agents/skills`). They are now linked where current Codex really looks (`~/.codex/skills`). If you had worked around this by linking skills there yourself, the next `wienerdog sync` adopts your links so a later uninstall still cleans up everything. Setup output now also explains that Codex starts skills differently from Claude Code: type `/skills` to see them, then `$wienerdog-setup` — or just ask in plain words. There is no `/wienerdog-setup` command in Codex. (Found the day Codex CLI was added to the maintainer's own machine.)

### Added
- **`wienerdog doctor` now checks your Codex skills.** If Codex is installed but the skills aren't registered where Codex looks, doctor says so plainly and points you to `wienerdog sync` — so if Codex ever moves this folder again, you hear it from doctor instead of noticing your skills quietly vanished.

## [0.6.6] — 2026-07-09

### Fixed
- **Windows: the nightly dream can now find git.** Scheduled jobs run with a deliberately minimal environment, and on Windows that environment didn't include git's folder — so every nightly dream failed before it could save your memories. The standard Git for Windows locations are now always included. If git still can't be found, the error now says so in plain language instead of a cryptic code. (Reported by our external Windows tester — this unblocked his first successful nightly dream.)
- **Windows: session-end hooks no longer fail after every Claude Code session.** Hook commands were registered with Windows-style backslash paths, which the shell that runs them misreads. They are now written with forward slashes (which Windows accepts too), and an update cleanly repairs existing entries — including ones you may have fixed by hand.

## [0.6.5] — 2026-07-08

### Fixed
- **Windows: installing without admin rights now works on a stock machine.** Wienerdog's internal "current version" pointer is now created as an NTFS junction instead of a symlink, so it no longer needs Developer Mode or an elevated shell. (Reported by our first external Windows tester — thank you.)
- **Windows: the nightly dream and its catch-up now actually land in Task Scheduler.** The task files are now written in the encoding Task Scheduler expects (UTF-16), which it previously rejected. The catch-up task also no longer uses a logon trigger — the one part of scheduling that silently required admin rights; it relies on its hourly check instead, so a missed dream still catches up within the hour, with no elevation needed anywhere.
- **A failed scheduling step is now reported honestly.** Previously, if your computer's scheduler rejected a job, Wienerdog could still print a success message. Now `wienerdog sync` prints a clear warning naming the affected jobs, `wienerdog schedule add` reports the error and exits nonzero, and install/adopt say plainly when nightly dreaming could not be activated.

## [0.6.4] — 2026-07-07

### Fixed
- **Windows one-line install no longer hangs when Node is already present.** The `irm …/install.ps1 | iex` installer now completes the setup step on its own instead of stopping to ask a question it couldn't display — you still see the plan of what it will create, it just proceeds. (Reported from a real Windows install.)

## [0.6.3] — 2026-07-07

### Fixed
- **Two nightly dreams can no longer corrupt each other.** If a dream is running and a second one starts (for example the daily run overlapping the hourly catch-up), the second now backs off completely without touching the first one's work-in-progress. Previously the second run could delete the first's inputs mid-consolidation.
- **A dream can no longer "skip" your day silently.** Wienerdog now only marks a day's conversations as consolidated when the dream actually finished consolidating them — so an interrupted run re-processes that day next time instead of quietly moving past it.

### Added
- **Your scheduler's health is now visible.** If a scheduled job (like the nightly dream) is set up but not actually active in your computer's scheduler — which can happen after some system updates — `wienerdog doctor` and your session briefing now say so plainly, and `wienerdog sync` reactivates it. Previously a dropped schedule failed invisibly: no run, no warning.

## [0.6.2] — 2026-07-06

### Fixed
- **Uninstall now finishes what it says.** Wienerdog's own working files (`state/`, `logs/`, `schedules/`, `secrets/` — including the Google sign-in token, which you can always re-create later) are fully removed, so `~/.wienerdog` is genuinely gone after uninstall instead of lingering half-empty.
- **Your vault's preservation is now said properly.** Instead of a confusing "skipping unknown manifest entry" warning for every vault file, uninstall prints one clear line: your memory vault was left untouched — your notes are yours. (And if your vault somehow lives *inside* Wienerdog's own folder, uninstall now detects that, refuses to touch it, and tells you honestly — while `adopt` no longer allows choosing such a location in the first place.)
- **Windows: uninstall no longer ends with "The batch file cannot be found."** The `wienerdog.cmd` launcher now survives deleting itself mid-run, so a successful uninstall reports success. Existing installs pick up the fixed launcher automatically on their next `sync` or update.

## [0.6.1] — 2026-07-06

### Changed
- **Smoother setup interview.** The four multiple-choice moments (what to adjust, preferred tone, vault choice, memory eagerness) are now asked as structured pick-one questions where your AI tool supports them — with a type-your-own answer always available. Open questions (who you are, your goals, your tools) stay conversational.
- **No overnight anxiety.** Everywhere Wienerdog mentions the 03:30 nightly dream — install summary, adoption summary, setup, README — it now also says plainly: if your computer is off or asleep at that time, don't worry, Wienerdog catches up automatically the next time you're back. That flexibility has always been how it works; now it's said out loud.

## [0.6.0] — 2026-07-06

### Added
- **Scheduled nightly dreaming on Windows.** Creating or adopting a vault on Windows now schedules the 03:30 dream in Task Scheduler, just like macOS and Linux — no admin rights needed (tasks are registered for your own user), and a companion catch-up task runs missed dreams shortly after you log back in when the machine was off or asleep at 03:30. Laptop-friendly: the tasks are explicitly configured to run on battery. `wienerdog uninstall` removes both tasks. This completes scheduled dreaming on all three OSes. (ADR-0018)
- Scheduled jobs on Windows get a properly shaped environment (PATH, HOME/USERPROFILE), and a job that hangs is now killed cleanly with its whole process tree.

### Notes
- This is the first release carrying Windows scheduling — it is fully covered by automated tests up to the Task Scheduler boundary, and its live behavior (registration, nightly runs, catch-up) is being verified in field testing now. If a scheduled dream misbehaves on your Windows machine, please open an issue: failures are recorded in `state/alerts.jsonl` and shown in your next session's briefing.

## [0.5.0] — 2026-07-06

### Added
- **Windows installer (`install.ps1`).** Windows now has a one-line install to match macOS/Linux: `irm https://…/install.ps1 | iex`. On a bare machine it detects a missing or too-old Node and offers to install the official signed Node LTS — via winget where present, otherwise the official signed `.msi` (SHA256-verified) through a consent-gated Windows elevation (UAC) prompt. git is offered the same way (never required to finish). After Node is in place it installs Wienerdog (npm-less tarball path where npm is absent) and hands off to `wienerdog init`. Node is the only hard requirement; every step shows exactly what it will run and falls back to printing the command if you decline. (ADR-0017)

### Changed
- **`wienerdog init` now defaults to "yes"** at its final "Proceed?" confirmation — pressing Enter proceeds. (Deletion prompts like `uninstall` still default to "no".)
- The Windows installer keeps your PowerShell window open and prints a clear "installed" confirmation at the end, instead of the window closing before you can read it.

### Notes
- Google features still require npm (the `googleapis` library is installed on demand); everything else works npm-free on all three OSes.
- Windows scheduling (the nightly dream on a timer) is not yet built — the digest, skills, and manual dreaming work; scheduled dreaming remains macOS/Linux-only for now.

## [0.4.0] — 2026-07-05

### Added
- **Install and update without npm.** Node is the only hard requirement now — where `npx`/`npm` isn't available, `install.sh` downloads the release straight from the npm registry over HTTPS (with a consent prompt showing exactly what and where), verifies its sha512 checksum, and unpacks it. A new `wienerdog update` command upgrades the same way. The "a new version is available" notice quotes `wienerdog update` on npm-less installs and `npx wienerdog@latest sync` where npm is present. (ADR-0016)

### Notes
- Google features still require npm (the `googleapis` library is installed on demand); everything else works npm-free.

## [0.3.1] — 2026-07-05

### Fixed
- **Windows: `sync`/`init` no longer crash after the first run.** Re-pointing the `app/current` link now falls back to remove-then-rename where Windows refuses to rename over an existing directory link, cleans up any `current.tmp.*` leftovers from earlier crashes, and — most importantly — skips the re-point entirely when `current` already points at the right version, so routine runs perform no link operations at all. (Reported by an external Windows tester — thank you.)
- **Windows: skills now register.** Where symlinks aren't permitted, skill folders are copied into place instead (tracked in the install manifest, fully removed by `wienerdog uninstall`), so the `/wienerdog-*` commands work after restarting your AI tool. A `wienerdog.cmd` launcher is also installed so the `wienerdog` command works in Windows terminals.
- **Dreaming no longer goes quiet after busy days.** Heavy session days could exceed the dream's input budget, and the run would falsely report "nothing new to dream" — forever. The budget default is now 8 MB, oversized sessions are trimmed to fit (newest messages kept) instead of skipped, and a dream that truly can't fit anything raises a visible alert instead of exiting silently.
- Dream skill preserves a note's provenance fields when updating it (WP-040, released here).

### Changed
- The README's "install via your AI" prompt now has the assistant show you the install plan first (`init --dry-run`), wait for your go-ahead, then install (`init --yes`) — with links to verify the package, and a reminder to restart your AI tool so the `/wienerdog-*` commands appear.

## [0.3.0] — 2026-07-04

### Added
- **Nightly dreaming is scheduled by default** (ADR-0014): creating or adopting a vault now schedules the 03:30 dream automatically — no prompt, plainly disclosed in the install summary, tracked in the install manifest, fully reversed by `wienerdog uninstall`. Change the time or remove it any time via `wienerdog schedule`. Catalog routines (daily digest, inbox triage, weekly review) remain opt-in.
- **Update notices** (ADR-0015): scheduled runs check the npm registry for a newer version at most once a day (3-second budget, silent on failure, never delays a job); the injected digest and `wienerdog doctor` show a one-line notice with the exact update command. Opt out with `update_check: false` in config.yaml. Wienerdog never updates itself. Disclosed in the threat model (T7).
- **Stable update path** (ADR-0013): the package now vendors itself into `~/.wienerdog/app/<version>` behind an atomically-switched `current` link, and installs a `wienerdog` command shim at `~/.local/bin`. Scheduled jobs target the stable path, so updates (and npm cache cleaning) can no longer strand the nightly dream. `npx wienerdog@latest sync` is the canonical update command: it vendors the new version, repoints existing schedules, and refreshes all managed files.
- On-demand Google library install: `googleapis` is no longer assumed present — Google setup installs it once, with consent showing the exact command (`npm install --ignore-scripts …`), into a version-durable deps dir. Non-Google users never download it; without it, `gws` explains how to set up instead of crashing.

### Fixed
- First-production-night hardening (ADR-0012): scheduled jobs now carry `USER` and find a natively-installed `claude` (`~/.local/bin`) in their clean environment; the dream pre-commits your session edits (`vault: session edits before dream`) instead of refusing all night on an "uncommitted changes" gate; a crashed dream reverts its partial writes so it can never starve future dreams; log rotation no longer deletes the newest evidence; brain stderr is surfaced in failure messages.
- Job failures are now durably visible: they append to `state/alerts.jsonl` and render as a plain-language alert block in the digest until the job next succeeds (replaces the transient banner that a digest regeneration could erase).
- The dream skill preserves provenance frontmatter (`origin`, `created`, `source_sessions`) when updating an existing note; `derived_from_untrusted` can only be raised.
- The bare `wienerdog` command now resolves on every install (the new shim) — previously the Google routine skills' `wienerdog gws …` instructions failed on npx-based installs.

### Security
- googleapis resolution is containment-guarded: only the consented, pinned copy in Wienerdog's own deps dir is ever loaded — a package planted elsewhere on the module path is ignored (and the consented install runs with `--ignore-scripts`).
- Update-check responses are treated as untrusted input: only a strictly semver-shaped version can be stored or rendered, inside a fixed template.

## [0.2.1] — 2026-07-03

### Fixed
- CLI confirmation prompts (`init`, `uninstall`) now read from the terminal (`/dev/tty`) when stdin is piped — the curl one-liner previously printed "Proceed? [y/N]" and exited silently without installing. When no terminal is available at all, the CLI aborts with a clear message instead of a silent no-op. Interactive Ctrl-D at a prompt aborts cleanly instead of hanging. (Found live in the first public curl-installer test.)

## [0.2.0] — 2026-07-03

### Added
- Consented dependency auto-install in `install.sh` (ADR-0011): detects missing Node ≥ 18 / git and installs them with per-hop `[Y/n]` consent showing the exact command — macOS (Xcode Command Line Tools for git; official signed nodejs.org `.pkg`, or Homebrew if already present, for Node) and Linux (apt/dnf/yum/pacman/zypper/apk, post-install version verification, NodeSource as a separately consented fallback for old-Node distros). Node is the only hard gate; a missing git warns and proceeds. Every action falls back to printing the exact command on decline, failure, or when no terminal is available — non-interactive contexts are never auto-installed into. Threat model updated (new entry T5b).

### Security
- New safety posture on the record: "never installs software without consent" (amends the earlier "never installs software" rule). No password capture, no Homebrew bootstrapping, signed sources preferred over nested scripts.

## [0.1.0] — 2026-07-03

First installable release. Everything below was built spec-driven by AI implementers with adversarial AI review; see docs/specs/done/ for the full record (30 work packages).

### Added
- One-line install (`install.sh` bootstrapper / `npx wienerdog init`) with manifest-tracked, byte-reversible uninstall.
- Interview-driven CLAUDE.md/AGENTS.md setup (`/wienerdog-setup`), re-runnable as a settings panel.
- Markdown memory vault (PARA, Obsidian-convention) with three paths: fresh, guided import, or full in-place adoption of an existing vault (`wienerdog adopt`) with layout mapping, TCC/git prerequisites, and a byte-non-destructiveness guarantee.
- Nightly dreaming: transcript capture (Claude Code + Codex CLI), tiered anti-injection memory gates enforced in code, one revertible git commit per run, human-readable dream reports, skill synthesis.
- Google Workspace senses (`wienerdog gws`): Gmail/Calendar/Drive, read-first and draft-first; sending only under user-created send grants (typed confirmation, per-routine recipient allowlists).
- Laptop-friendly scheduler: OS-native (launchd/systemd) with catch-up, TCC-guard, watchdog, fail-loud alerts; opt-in routine catalog (daily digest, inbox triage, weekly review).
- Subscription auth everywhere — no API keys in the product or its test infrastructure.

## [Unreleased]

### Notes
- (M0 foundation history folded into 0.1.0 above.)
