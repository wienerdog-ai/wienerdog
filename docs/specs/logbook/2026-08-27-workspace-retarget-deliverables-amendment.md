---
title: Deliverables amendment — WP-dream-workspace-retarget
date: 2026-08-27
---

# Deliverables amendment — WP-dream-workspace-retarget

Spec: `docs/specs/WP-dream-workspace-retarget.md`. Base: `main` @ `2cfb2b1`.

## The dispatch-blocking defect, reported by the implementer

The implementer delivered all five Deliverables files (branch
`wp/dream-workspace-retarget`, sibling worktree) and stopped on a boundary
violation instead of working around it. Twenty tests fail in five files the
Deliverables table does not list, for two independent reasons:

1. **The rename.** The spec's Exact contracts require `spawnBrain`'s
   write-target option to become `workspaceDir`. That breaks its existing call
   sites: `tests/unit/dream-brain.test.js` (5) and
   `tests/unit/codex-adapter.test.js` (2). No workaround exists — the rename
   either happens or it does not.
2. **The constructed child env** (Table B, site 7) drops the ambient variables
   the fake-brain fixtures were driven by (`WIENERDOG_FAKE_BRAIN_MODE`,
   `WIENERDOG_FAKE_TODAY`, `WD_SPAWN_VARIANT_MODE`/`_OUT`):
   `tests/integration/dream.test.js` (12), `reap-escape.test.js` (1),
   `adopt-e2e.test.js` (1).

**The proved contradiction:** `adopt-e2e` requires `WIENERDOG_FAKE_TODAY` to
reach the brain child process, while `tests/unit/a7-integrity-negatives.test.js`
greps `src/` and forbids that name in production code entirely. Within the
original boundary no implementation satisfies all three constraints.

## The ruling (owner, 2026-08-27)

**Widen the table with three DIRECTORY rows, not eight file rows** —
`tests/unit/`, `tests/integration/`, `tests/fixtures/` — using
`scripts/boundary-check.js`'s trailing-slash grant. Verified against the live
script before ruling: the four always-allowed paths are the spec file,
`package-lock.json`, `memory/lessons/inbox.md` and `docs/specs/logbook/` —
tests are NOT among them, so the widening is required, and eight file rows
would put the table at 13 rows against the ten-row hard cap.

- **`tests/golden/` is deliberately NOT granted.** Golden fixtures change only
  when a spec explicitly says so; a blanket `tests/` grant would silently
  retire that protection.
- **Fixture control re-routes to the already-allowlisted `WIENERDOG_DREAM_*`
  channel** — the clean resolution of the contradiction above. Putting
  test-only names on the production allowlist was rejected: partial (the A7
  guard still blocks `WIENERDOG_FAKE_TODAY`) and against the guard's intent.

## Scope of this amendment

The spec's Deliverables table (three rows + the amendment note) and this
logbook entry. Nothing else — the implementation continues on the
implementer's branch once this lands on `main`.
