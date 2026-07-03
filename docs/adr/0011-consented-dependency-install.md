# ADR-0011: Consented dependency auto-install in the curl installer

Status: Accepted (amends ADR-0006; further amends ADR-0003)
Date: 2026-07-03

## Context

ADR-0006 made `curl -fsSL <url>/install.sh | bash` the default entry point with a hard rule: the script "never installs software silently," and (per THREAT-MODEL T5a) "never writes to disk, never uses sudo or package managers, never installs Node — it prints guidance and exits." Field reality: a large and growing share of our knowledge-worker audience installs Claude Code via its native binary and has **no Node or git at all**. For them, "print guidance and exit" is a dead end — they came for one line and hit homework. Competitors (OpenClaw, Hermes) auto-install dependencies. The owner has decided Wienerdog should too — aggressively, across all supported OSes — **without** surrendering the trust posture that is our entire pitch. The platform facts backing this decision were researched in `memory/research/2026-07-03-dependency-autoinstall.md`.

## Decision

The installer MAY install missing dependencies (Node ≥ 18, git) using real OS installers, but **never without consent**. Concretely:

1. **Per-hop consent.** Before each install action the script prompts on `/dev/tty` (`[Y/n]`, default yes) and **shows the exact command or URL it is about to run**. One prompt per distinct action — git, Node, and any nested-script hop are *separate* prompts. Never a single blanket "install everything," and never a hidden action nested inside a consented one. (This resolves the researcher's open question in favour of per-hop consent, which the owner's decision requires.)
2. **Mandatory print-fallback.** Whenever auto-install is not safe or not possible, the script prints the exact command for the user to run themselves and exits non-zero. The **frozen fallback triggers** are: (a) `/dev/tty` unreachable (CI / cron / `ssh host 'bash -s'`); (b) user declines; (c) any install step fails or times out; (d) `sudo` unavailable and the user is not root (Linux); (e) any *second* nested `curl|bash` beyond the one already consented to.
3. **Prefer signed OS package managers / official signed packages over nested `curl|bash`.** Trust order: distro package managers (`apt`/`dnf`/`yum`/`pacman`/`zypper`/`apk` — GPG-signed repos) and the official signed nodejs.org `.pkg` (via `sudo installer -pkg`) are preferred. A nested `curl|bash` (NodeSource on old-Node distros; nvm) is used only as a *separately consented* fallback, with the full URL shown, pinned to a specific upstream major where offered.
4. **Never auto-bootstrap Homebrew.** Homebrew is used for Node only if `brew` is already present. The installer never installs Homebrew itself — that is a nested `curl|bash` with its own sudo hop and no advantage over the official signed `.pkg`. (This resolves the researcher's second open question: brew is used-if-present, never bootstrapped.)
5. **Non-interactive contexts get print-only.** `/dev/tty` reachability is the gate for any prompt; a context with no controlling terminal is never auto-installed into, and the default-yes must never apply there. Reachability is tested by attempting to open the terminal device, not by `[ -t 0 ]` (which is always false under `curl|bash`).
6. **PATH after install.** After a successful install the script re-resolves the dependency's absolute path (`hash -r` + known install dirs) for the rest of its own run, so handoff to `npx wienerdog@latest init` works this session. It prints one explicit follow-up line for the user's *interactive* shell; it never mutates or re-execs the parent shell.
7. **No password capture.** `sudo` mode is detected with `sudo -n true` (a non-interactive probe that never prompts); the script never reads, stores, or pipes a password (never `sudo -S`). Interactive sudo prompts on its own controlling terminal, or the action falls back to print.
8. **Node is the only hard gate; git is recommended but non-blocking.** The CLI itself is Node, so a missing/too-old Node that cannot be provided (declined, failed, or no tty) means the script prints the fallback and exits non-zero — Wienerdog cannot run at all. **git** is offered on the same per-hop consent flow (CLT on macOS, package manager on Linux), but a missing git never blocks the handoff: `wienerdog init` (what the script `exec`s into) creates only the core (`~/.wienerdog`) and does not need git — git is required later, at vault-creation/adopt/dream time, where those paths already fail with a clear "install git" error. So if git is missing and not installed (declined / failed / no tty), the script prints a one-line note (what git is needed for, and the exact command) and **proceeds to hand off (exit 0)** rather than exiting non-zero.

This amends ADR-0006's "never installs software silently" to **"never installs without consent,"** and supersedes THREAT-MODEL T5a's "never uses sudo or package managers, never installs Node" mitigation, which is replaced by this consent-gated design and the new hazard entry T5b.

## Consequences

- No-Node / no-git users get a real one-line install instead of a dead end; parity with competitor onboarding.
- The installer's blast radius grows from a read-only version check to potentially root-level package installs — a real, user-opted expansion of trust, documented as THREAT-MODEL **T5b** with baked-in mitigations (per-hop consent showing the exact command; signed-source preference; no silent nested hops; `/dev/tty` gating; fail-to-print).
- The script is no longer "~60 lines you can read in one screen"; it grows a detection + consent engine. The README's "read it first" invitation stays; the length claim is dropped.
- Every consented action must have an equivalent print-fallback, so a user who declines is never worse off than under ADR-0006.
- The iron rule (ADR-0004) is unchanged: the installer still starts nothing that outlives its job — it runs OS installers synchronously and exits. No telemetry, no daemon.
- Windows (`install.ps1`, M6–M7) will use `winget` under this same consent posture; out of scope here.
