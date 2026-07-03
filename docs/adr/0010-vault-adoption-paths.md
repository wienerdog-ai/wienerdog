# ADR-0010: Three vault paths — fresh, guided import, full adoption

Status: Accepted
Date: 2026-07-03

## Context

Setup (`/wienerdog-setup`, WP-005) creates a *fresh* vault at `~/wienerdog/` and,
in step 3, defers any handling of a user's existing notes ("automatically adopting
an existing notes system is coming in a later version"). That deferral was a scope
decision plus a real constraint — an existing vault often lives in an iCloud /
macOS-TCC path that unattended launchd jobs cannot touch (the 4-hour-hang lesson,
ADR-0004) — not a philosophical one. But leaving a power user's existing second
brain untouched means Wienerdog builds a *second, parallel* memory next to it. That
directly contradicts the product's own thesis (GLOSSARY: the vault is "the only
long-term memory store"): a knowledge worker with a mature vault should not be asked
to keep two.

The safety guarantee that makes auto-written memory acceptable at all (THREAT-MODEL
T1) rests on git: "one commit per dream" so `git revert <sha>` undoes an entire
night, plus the orchestrator's post-commit diff validation. Using a user's real
vault in place is only as safe as that guarantee — which requires the vault be a git
repository.

## Decision

Setup and the installer offer **three** vault paths; the user picks one.

1. **Fresh vault (default, unchanged).** `~/wienerdog/`, scaffolded by
   `scaffoldVault`. No behavior change.
2. **Fresh vault + guided import.** With the user's consent, the setup interview
   reads an existing vault **read-only** (mining only), extracts identity /
   preferences / goals / active projects into the *new* fresh vault's mapped
   `identity_dir` + `projects_dir` seeds with `origin: import` provenance, and then
   shows the user exactly what it took. The old vault is never moved, copied wholesale,
   or modified.
3. **Full adoption (power users).** Wienerdog uses the existing vault **in place** as
   THE vault, gated on hard prerequisites, all enforced by `wienerdog adopt <path>`
   before anything is written:
   - **Local, non-TCC disk path.** Refused if the path is under a macOS
     TCC-protected location (Desktop/Documents/Downloads/iCloud) — reuse
     `src/scheduler/tccguard.js`. TCC paths hang unattended dream jobs.
   - **Git-initialized.** A hard prerequisite because the entire adoption safety
     story is the revert guarantee. If the vault is not a git repo, `adopt` offers
     to `git init` + take an initial snapshot commit interactively; declining aborts
     adoption.
   - **Layout mapping confirmed.** `adopt` infers a `vault_layout` mapping from the
     vault's actual folder names and daily-note nesting, prints it in plain language,
     and requires the user to confirm it before writing config.
   - **Conservative memory_mode for the first week.** `adopt` sets
     `memory_mode: conservative` and tells the user why, so the strictest gates apply
     while they build trust; they can loosen it later via `/wienerdog-setup`.

A checked-in **`vault_layout`** config section (ADR-consumed by WP-022/WP-024) lets
the whole file pipeline — digest render, dream tier gates, dream report path, the
dream skill's write destinations — target an arbitrary layout instead of the
hardcoded default folder names. Defaults equal today's hardcoded paths, so fresh and
imported vaults are byte-for-byte unchanged.

## Consequences

- The one-memory thesis holds for power users: adoption unifies rather than
  duplicates. Import gives non-power-users a warm start without touching their old
  system.
- Adoption's safety is exactly git's safety. Making git a hard prerequisite (with an
  interactive `git init` offer) keeps the revert guarantee true for every adopted
  vault; there is no "degraded, no-git" adoption mode.
- The installer/skills grow a layout-mapping layer. Every file-touching component
  (digest, dream validate, dream skill) must resolve paths through `vault_layout`
  rather than string constants; the default layout keeps existing golden tests green.
- The iCloud/TCC constraint is not solved, only fenced: adoption refuses TCC paths
  up front rather than silently degrading. A user whose vault is in iCloud is told to
  move it or use import instead. Assisted migration remains future work.
- `uninstall` must leave an adopted vault exactly as found: adoption records only
  `vault-file` / `vault-dir` manifest entries (already skipped by the reverse pass),
  so nothing in the user's real vault is ever removed.
