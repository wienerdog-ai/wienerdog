# A7 integrity containment proof (WP-158)

End-to-end **negative harness** for A7's three integrity anchors of the
unattended nightly run: the pinned external executables (WP-154), the canonical
digest-bound job descriptor (WP-156), and the out-of-tree launcher that verifies
the app + descriptor before spawning (WP-157) — plus the WP-155 cross-check that
the test-exec env seams no longer exist.

It drives the **real** launcher / pin path against each tamper with a
**recording fake spawn**: a would-be `node <currentBin> run-job <name>` launch is
captured, never executed. A single spawn that should not happen is a hard fail.
A **non-vacuity control** asserts the clean baseline *does* record exactly one
intended spawn, so "zero spawn on tamper" can never pass because the harness
failed to run.

## What it proves

| # | Tamper | Expected | A7 mapping |
|---|--------|----------|------------|
| 0 | clean fixture (control) | exactly ONE intended run-job spawn | non-vacuity |
| 1 | rewrite `run` / `dream_model` / `dream_timeout_minutes` in config (no re-sync) | descriptor digest ≠ bound `--expect-digest` ⇒ refuse, zero spawn | bullet 1 + WP-156 model/timeout |
| 2 | app byte mutation / `current` repoint / out-of-root symlink | refuse, zero spawn | bullet 2 |
| 3 | plant `.git` inside a prod `app/current` (stance downgrade) | refuse on stance mismatch, no silent dev fallback | WP-157 prod/dev stance |
| 4 | rewrite config + manifest but NOT the entry digest | refuse (the entry digest is the independent anchor) | bullet 3 |
| 5 | plant a fake `claude` earlier on the job PATH | `resolvePinnedSpawn` throws — the fake is never resolved | bullet 4 |
| 6 | pinned target: symlink out of install dir / cleared exec bit / group-writable ancestor | throws pre-spawn | bullet 5 |
| 7 | interrupted re-vendor (staging removed before rename) | the prior valid `current` still verifies + runs | bullet 6 |
| 8 | set `WIENERDOG_RUNJOB_CMD` / `WIENERDOG_DREAM_CMD` | no effect; `grep` of `src/` is empty | WP-155 cross-check |

The matrix covers all **four** launcher checks — current containment (2), app
`treeDigest` (2), descriptor digest (1, 4), prod/dev stance (3) — and all
**three** digest-covered config knobs — `run`, `dream_model`,
`dream_timeout_minutes` (1) — with no gaps.

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
`app/current`, or `~/.local/bin` but NOT the launcher file or the OS entry) and
the drift-detection positives. It does **not** assert protection against an actor
who can overwrite the launcher itself (`<core>/launcher/launch.js` — a core-wide
write that defeats the launcher layer alone) or rewrite the OS scheduler entry.
That class is **A12's** territory (arbitrary same-user native writes under
`<core>`), not A7's.
