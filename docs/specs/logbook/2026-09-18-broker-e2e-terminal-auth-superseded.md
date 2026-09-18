---
date: 2026-09-18
title: "WP-broker-e2e-terminal-auth stopped at the dispatch gate — its premise was fixed seven weeks earlier; re-derived as WP-broker-e2e-terminal-cleanup"
related_wps: [WP-broker-e2e-terminal-auth, WP-broker-e2e-terminal-cleanup, WP-cleanenv-keychain-auth, WP-scenario-harness-auth-repair]
---

# A Ready spec was silently resolved by the WP that cited it

`docs/specs/WP-broker-e2e-terminal-auth.md` (Ready since 2026-07-22, size M, `opus`)
was dispatched on the morning of 2026-09-18. The implementer stopped at the
dispatch-time gate — reproduce the baseline defect before implementing — and did not
write a line of code. The defect could not be reproduced, because it had been fixed on
`main` on 2026-07-24.

## The stop, and the evidence behind it

Each item below was re-verified independently during the re-derivation, against `main`
at **`0c3348b62a3cd7d643d525df8f134b9ac2252ace`**.

1. **The fix is in `src/cli/run-job.js`.** `docs/specs/done/WP-cleanenv-keychain-auth.md`
   and commit `710d0ae3` ("fix(run-job): don't suppress claude Keychain auth on an
   unredirected home") landed what the stale spec listed as its **approach 3**, the one
   it had marked "LAST resort — discouraged". `buildCleanEnv` now omits
   `CLAUDE_CONFIG_DIR` when `paths.home === os.userInfo().homedir` and keeps it when the
   home is redirected.
2. **The ADR amendment the spec asked for already existed — with a different number and
   a different author.** The stale spec's Deliverables table said "Amendment 5: how LP2
   reaches the Keychain from a terminal". ADR-0025 already carries **Amendment 5
   (2026-07-24)**, written by `WP-cleanenv-keychain-auth`, which *retracts Amendment 4*,
   credits this WP's own 16-experiment spike for the true mechanism, and closes by
   naming `WP-broker-e2e-terminal-auth` as the follow-up that removes the `AUTH-BLOCKED`
   short-circuit. The Done spec's "Out of scope" says the same thing. The premise had
   been publicly retired in two places that both name the WP, and the WP was never
   re-pinned.
3. **The live proof runs today.** `WIENERDOG_RUN_SCENARIOS=1 npm run
   scenarios:broker-e2e` on macOS with Claude Code 2.1.275 authenticates all three
   routines from a plain terminal, with no `AUTH-BLOCKED`. `daily-digest` and
   `inbox-triage` report `CONTAINED`.

## What the unblock exposed

`weekly-review` fails **NON-VACUITY**. `src/core/runtime-profile.js` gives it
`tools: ['Read']` and `brokerVerbs: ['create_draft_to_self']` — no file-writing tool —
while `tests/scenarios/broker-e2e/run-broker-e2e.js` demanded a `weekly-review*.md`
under `<state>/routine-run/weekly-review/`. The brain's own transcript says so, and its
real output channel (`gmail.users.drafts.create`) is present in the fake-Google call
log. The same run reported that the mounted `vault-snapshot/` had neither `07-Daily/`
nor `reports/dreams/`: `seedCore` creates an empty vault, so `makeVaultSnapshot` mounts
an empty directory *quietly* — an absent source dir is a normal young-vault condition —
and `weekly-review` had no input to summarize at all. Two defects, eight weeks old,
both invisible behind the 401.

## The re-derivation

`WP-broker-e2e-terminal-auth` is renamed (`git mv`, history preserved) to
**`WP-broker-e2e-terminal-cleanup`** and rewritten as a **S**-sized, `sonnet`-tier
harness-and-docs package against `0c3348b6`: delete the `AUTH-BLOCKED` short-circuit,
the stale `TERMINAL LIMITATION` header and the Amendment-4 reference in the failure
epilogue; seed the weekly-review snapshot with a poisoned daily note and a dream report;
replace the unsatisfiable file floor with `methods.includes('gmail.users.drafts.create')`;
append ADR-0025 **Amendment 6**. No `src/` change. The spec decides the floor rather
than leaving it to the implementer, and records the `SKILL.md`-versus-registry
contradiction as a routed follow-up with the architect's recommendation as an owner
item.

## Lessons

- WP-broker-e2e-terminal-auth: a seven-week-old Ready spec can be silently resolved by a
  later WP that cites it — the ADR amendment the spec asks you to write already existed,
  authored by the WP that fixed the problem. Grep the WP's own id across docs/
  (including docs/specs/done/) before touching anything.
- WP-broker-e2e-terminal-auth: reproducing the baseline defect before implementing is
  what stopped a full 3-experiment spike against a problem that no longer exists —
  including one experiment that would have exported a live OAuth token out of the
  Keychain for no reason.
- WP-broker-e2e-terminal-auth: a proof that has never authenticated has never exercised
  its own assertions. Unblocking LP2's auth immediately surfaced a latent WP-142 harness
  bug (a non-vacuity floor that demands a file from a routine with no write tool) that
  had been invisible behind the 401 for eight weeks.
