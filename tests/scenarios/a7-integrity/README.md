# A7 integrity containment proof (WP-158)

End-to-end **negative harness** for A7's integrity anchors of the unattended
nightly run: the pinned external executables (WP-154), the deleted test-exec
seams (WP-155), the canonical digest-bound job descriptor (WP-156), the
out-of-tree launcher that verifies the app + descriptor before spawning
(WP-157), and per-job catch-up authorization (WP-catchup-per-job-authorization).

It drives the **real** launcher / pin / catch-up path against each tamper with a
**recording fake spawn**: a would-be `node <currentBin> run-job <name>` launch is
captured, never executed. A single spawn that should not happen is a hard fail.
A **non-vacuity control** asserts the clean baseline *does* record exactly one
intended spawn, so "zero spawn on tamper" can never pass because the harness
failed to run.

## Non-vacuity is the point (WP-082 canary class)

The first cut of this harness was **substantially vacuous**: every case asserted
only `exit==1 + zero-spawn + /integrity mismatch/` (the last is unconditional in
the alert template), and the launcher folds tree-digest **and** stance into the
descriptor digest — so deleting any single dedicated guard (containment,
tree-digest, stance) left the harness green.

The fix: there is **one authoritative tamper list** (`fixtures/cases.js`) shared
by BOTH this runner AND the deterministic unit negatives
(`tests/unit/a7-integrity-negatives.test.js`), and **every launcher case asserts
the DISTINCT reason only the guard it isolates emits** — not the generic
`integrity mismatch`. Deleting the targeted guard changes the reason (or reaches
a spawn), so the case goes red. The binding acceptance property is: *each tamper
case fails if the guard it targets is deleted.* This was spot-checked by actually
deleting the descriptor-digest, containment, app-tree-digest, owner-uid, and
catch-up-union guards and confirming each case flips to red.

## What it proves

Every case reaches and trips exactly one guard/field. `guard` names it.

| # | Tamper | Guard isolated | Expected |
|---|--------|----------------|----------|
| 0 | clean fixture (control) | — | exactly ONE intended spawn (non-vacuity) |
| 1-run | rewrite job `run` | descriptor-digest | refuse, zero spawn, "descriptor changed" |
| 1-model | rewrite `dream_model` | descriptor-digest | refuse, zero spawn, "descriptor changed" |
| 1-timeout | rewrite `dream_timeout_minutes` (inner) | descriptor-digest | refuse |
| 1-maxinput | rewrite `dream_max_input_bytes` | descriptor-digest | refuse |
| 1-outertimeout | rewrite job `timeout_minutes` (outer) | descriptor-digest | refuse |
| 1-vaultroot | rewrite `vault` | descriptor-digest | refuse |
| 1-vaultlayout | rewrite `vault_layout` | descriptor-digest | refuse |
| 1-at | rewrite job `at` (schedule) | descriptor-digest | refuse |
| 2a-tree | app byte mutation | app-tree-digest | refuse, "app tree does not match" |
| 2b-repoint | repoint `current` to an in-app sibling | app-tree-digest | refuse |
| 2c-escape | symlink `current` OUTSIDE `<core>/app` | containment | refuse, "does not resolve inside" |
| 3-stance | plant `.git` (prod→dev downgrade) | stance | refuse, "looks like a dev checkout" |
| 4 | rewrite config + a REAL manifest | descriptor-digest | refuse (entry digest is the anchor) |
| 5 | plant a fake `claude` earlier on PATH | pin drift | throws pre-spawn, plant never runs |
| 6a-c | pinned target: repoint / no exec bit / writable ancestor | pin structural | throws pre-spawn |
| 6d | pinned target owned by a FOREIGN uid | owner-uid | throws pre-spawn (deterministic uid stub) |
| 6e | partial pin store (git only, no claude) | fail-closed (R2:F1) | a planted claude never resolves |
| I1 | non-node env-shebang + planted interpreter | encapsulation (R10-13) | throws, ZERO execution (fire) |
| I2 | same, at pin creation | encapsulation | `createPins` records ZERO execution |
| 7a | interrupted re-vendor (crash after staging) | update atomicity | prior `current` still verifies + runs |
| 7b | completed re-vendor + re-bind | update atomicity (positive) | switches `current`, verifies |
| 9-hostile-home | hostile ambient HOME | bound-home (R4:#2) | still runs; child HOME = bound home |
| 10a-dev-source-edit | dev worktree tracked-source edit | dev-reduction | still RUNS (treeDigest excluded) |
| 10b-dev-at-edit | dev worktree `at` edit | dev-descriptor-digest | REFUSES (schedule retained) |
| cu-match | catch-up token + bound map MATCHES | catch-up auth | authorized job runs (enforced path) |
| cu-mismatch | catch-up bound digest MISMATCH | catch-up auth | refuse + alert, zero run |
| cu-added | job added to config, not in map | union-authorize | refuse the addition (alert) |
| cu-removed | job removed from config, still in map | union-authorize | alert (not silent suppression) |
| cu-at-future | `at` rewritten to a future time | union-authorize | drift ALERTS before due-filtering |
| cu-malformed | malformed base64url `--job-digests` | bounded decoder | durable alert + zero run |
| cu-oversized | oversized `--job-digests` | bounded decoder | durable alert + zero run |
| 8 | set `WIENERDOG_RUNJOB_CMD`/`DREAM_CMD`/`FAKE_TODAY`/`RUNJOB_TIMEOUT_MS` | — | no effect; `grep` of `src/` empty |

No gaps: the shared list covers all four launcher checks (containment,
app-tree-digest, descriptor-digest, prod/dev stance), every digest-covered
config field (WP-156 R15 set: `run`, `model`, inner+outer timeout,
`maxInputBytes`, `vaultRoot`, `vaultLayout`, `schedule.at`, `home`), the dev-
stance reduction, the pin structural + owner + partial-store + interpreter-hijack
paths, update atomicity (both directions), and catch-up union-authorization +
transport — with an isolating case each.

### Platform note (catch-up transport)

The base64url `--job-digests` map applies to **macOS + Windows only** (they have a
separate all-job catch-up registration), so the catch-up cases run with
`platform: 'darwin'`. On **Linux there is no map**: each per-job `.timer
Persistent=true` replays the normal per-job `.service`, already descriptor-
authorized — there is no separate all-job dispatch to authorize.

## How to run

```bash
# Deterministic negatives — run in the normal suite, no gating, no quota:
npm test -- --test-name-pattern "a7-integrity-negatives"

# Gated end-to-end runner (still no model quota — the spawn is a recorder):
npm run scenarios:a7-integrity                       # prints SKIPPED, exits 0
WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:a7-integrity   # runs the matrix
```

## Gating & safety

- `WIENERDOG_RUN_SCENARIOS=1` hard-gates the runner (WP-023/133/142); without it
  it prints `SKIPPED` and exits 0, so `npm test` never runs it.
- Spends **no** model quota: the "spawn" is a recorder, never a real model/app
  launch. Uses a disposable temp `$HOME`/`WIENERDOG_HOME` removed in `finally`;
  never writes the maintainer's real config and never touches the real OS
  scheduler.
- Opens **no** gate: `wienerdog safety` stays all-BLOCKED — this harness only
  observes refusals.

## Honest boundary

This proves the **scoped-write** negatives (writes reaching `config.yaml`,
`app/current`, `~/.local/bin`, or the pin store but NOT the launcher file or the
OS entry) and the drift-detection positives. It does **not** assert protection
against an actor who can overwrite the launcher itself
(`<core>/launcher/launch.js` — a core-wide write that defeats the launcher layer
alone) or rewrite the OS scheduler entry. That class is **A12's** territory
(arbitrary same-user native writes under `<core>`), not A7's.
