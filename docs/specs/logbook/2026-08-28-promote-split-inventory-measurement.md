---
title: Step (a) — the code-first inventory measurement (raw), the promote split pair
date: 2026-08-28
related_wps: [WP-dream-promote-module, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->
<!-- Verbatim measurement output — EVIDENCE, never reformatted. -->

# Step (a) — the code-first inventory measurement (raw)

Agent: gptsol, fresh clean context. Method pinned before the run
(`2026-08-28-promote-split-review-rounds.md`, "Method note for step (a)"): the
inventory is built from the CODE in a sealed phase 1 and written to disk BEFORE
any spec file is opened. **The agent confirms it did so**, and its execution
report records the command whose success gated phase 2.

**Committed BEFORE adjudication.** This is a MEASUREMENT, not a review: its
deliverable is a gap list, and it wrote no spec text.

**Condensation, declared:** the 95-row inventory table and the 95-row
classification table are reproduced below by their **gap rows in full** plus the
counts; the COVERED and DROPPED-BY-DESIGN rows are carried by id in the counts
and in the classification summary. The complete tables are in the agent
transcript and in `/tmp/inventory.md` / `/tmp/classification.md` as produced.
This is the same device this repo already used for an over-long raw command log
(`2026-08-20-dream-denied-object-disposal-round-2-raw.md`).

**Read-only, verified independently**: `git status --porcelain` empty before and
after.

## Counts

| Classification | Count |
|---|---:|
| COVERED | 48 |
| GAP-OWNERSHIP | 27 |
| GAP-INTERFACE | 4 |
| GAP-UNDERSTATED | 8 |
| DROPPED-BY-DESIGN | 8 |
| **Total** | **95** |

## The gap list, verbatim — ordered by concrete damage

1. **I067 — GAP-UNDERSTATED:** The replacement has no stated recoverability invariant when redaction fails and a withheld copy cannot be saved. Workspace teardown could destroy the only remaining copy of the brain-produced note.
2. **I095 — GAP-UNDERSTATED:** Lock ownership does not guard scratch cleanup in the spec. A stale process could delete the current owner's live extracts, causing a brain to consolidate missing or partial inputs.
3. **I004 — GAP-OWNERSHIP:** The single-run lock has no named owner. Concurrent dreams could rebuild or delete one another's scratch inputs and corrupt transcript advancement.
4. **I001 — GAP-OWNERSHIP:** The protected mechanics-root symlink/non-directory gate has no owner. A reimplementation could write state, logs, credentials, or scratch through an attacker-controlled top-level path.
5. **I003 — GAP-OWNERSHIP:** The git-repository precondition has no owner. Commit/staging behavior could fail after vault publication, leaving published notes without the required run commit.
6. **I093 — GAP-OWNERSHIP:** No row owns post-ledger digest regeneration. The next session can receive stale quarantine, alert, identity, update, or transcript-state banners after the ledger has already changed.
7. **I063 — GAP-INTERFACE:** The EP2 result cannot carry the actual collision-resolved quarantine basename or captured-byte identity. The caller cannot identify the recovery artifact it must report or validate.
8. **I066 — GAP-INTERFACE:** Redaction results omit scrubbed-line count, detector labels, and quarantine basename. The current redaction accounting cannot cross from the gate into promotion/reporting.
9. **I076 — GAP-INTERFACE:** The report interface cannot receive the metadata required to produce the current per-redaction report lines. Users lose the recovery location and what was scrubbed.
10. **I069 — GAP-INTERFACE:** The enforcement-record interface cannot carry quarantine-copy failure, invalid-UTF-8 fallback, or surviving-original metadata. Users can be told a note was refused without being told which recovery copy remains.
11. **I070 — GAP-UNDERSTATED:** The byte-identity condition for deleting a redundant redacted copy is absent. An implementation could delete the only nonidentical recovery artifact.
12. **I072 — GAP-UNDERSTATED:** Redacted-original retention has no contract. The directory can grow without bound, or an implementation can prune a copy that the current report has just told the user to restore.
13. **I007 — GAP-OWNERSHIP:** Transcript-ledger read/migration persistence has no owner. Existing users can have pre-ledger transcripts reprocessed or skipped inconsistently.
14. **I008 — GAP-OWNERSHIP:** Transcript selection and quarantine eligibility have no owner. Processed transcripts may rerun, or unconsolidated transcripts may be silently skipped.
15. **I009 — GAP-OWNERSHIP:** Input-budget allocation and capacity deferral have no owner. Large/new transcripts can starve others, or partial inputs can be incorrectly marked consumed.
16. **I010 — GAP-OWNERSHIP:** Private scratch construction, extraction, truncation, and invocation-index rebasing have no owner. The brain can receive malformed or insecure extracts, and learning authorization can use wrong invocation windows.
17. **I011 — GAP-OWNERSHIP:** The `collectExtracts` return contract has no owner. The pipeline can lose the exact processed/wrote/quarantine/deferred sets needed for integrity checks and ledger advancement.
18. **I015 — GAP-OWNERSHIP:** Quarantine-only runs have no named durable ledger/digest update. An unreadable transcript can fail every night without becoming a visible stable quarantine.
19. **I020 — GAP-OWNERSHIP:** The atomic private `state/digest.md` write has no owner. Session context can remain stale or be written with weaker filesystem guarantees.
20. **I019 — GAP-OWNERSHIP:** The full digest input set and ordering have no owner. Identity approval, unresolved alerts, scheduler/update notices, quarantine banners, or private-mode warnings can silently disappear.
21. **I021 — GAP-OWNERSHIP:** The pre-dream containment probe has no owner. A broken hermetic runtime can run the brain without first proving forbidden reads and writes remain blocked.
22. **I022 — GAP-OWNERSHIP:** Containment failure delivery has no owner. A refused run can lose the version/outcome/reason needed for diagnosis.
23. **I031 — GAP-OWNERSHIP:** Per-chunk stdout/stderr redaction has no owner. Brain-controlled secrets can enter the durable dream log or surfaced stderr tail.
24. **I025 — GAP-OWNERSHIP:** Private log creation and append behavior have no owner. Logs can lose diagnostics or become group/world-readable or symlink-following writes.
25. **I030 — GAP-OWNERSHIP:** Run-evidence persistence has no owner. The auditable record of actual executable, argv posture, settings, hooks and containment result disappears.
26. **I027 — GAP-OWNERSHIP:** The hook-free settings profile has no owner. Dry-run, probe, or brain execution may use ambient hooks/settings instead of the explicit inert profile.
27. **I028 — GAP-OWNERSHIP:** Neutral Claude staging-directory recreation has no owner. Project instructions or settings from a prior run can influence the next brain.
28. **I002 — GAP-OWNERSHIP:** The config/layout/date input contract has no owner. The replacement can use the wrong vault, model, timeout, budget, mapped directories, or date.
29. **I078 — GAP-UNDERSTATED:** Exact note/skill counter increments are missing. Commit messages and user summaries can change meaning by counting reports, deletions, or only `SKILL.md` rather than all skills-dir files.
30. **I085 — GAP-UNDERSTATED:** No interface or local contract says how counts reach G11. The summary promises counts without a defined producer.
31. **I081 — GAP-UNDERSTATED:** The current `committed[]` return field is neither inherited nor explicitly dropped. Direct callers can silently lose their path-level commit result.
32. **I018 — GAP-UNDERSTATED:** Dry-run is not explicitly retargeted to the workspace. It can preview a vault-writing argv while the real run uses a workspace, making the preview false.
33. **I016 — GAP-OWNERSHIP:** Capacity-wedge failure behavior has no owner. A run with fresh but unfeedable sessions can return as if nothing happened and repeat forever.
34. **I014 — GAP-OWNERSHIP:** Per-quarantine diagnostic output has no owner. Users lose which sanitized transcript was quarantined and why.
35. **I013 — GAP-OWNERSHIP:** Capacity-drop output has no owner. Sessions deferred because of the byte budget can disappear from operator visibility.
36. **I012 — GAP-OWNERSHIP:** Truncation output has no owner. Users cannot tell that a transcript was consolidated from only its newest suffix.
37. **I017 — GAP-OWNERSHIP:** The genuinely-empty fast-path output has no owner. A no-op run becomes indistinguishable from a silently skipped or failed pipeline.
38. **I005 — GAP-OWNERSHIP:** The live-lock no-op message has no owner. A skipped concurrent invocation can appear to have run normally.
39. **I006 — GAP-OWNERSHIP:** The stale-lock-steal warning has no owner. Operators lose the signal that the previous run exceeded its ownership deadline.

## Execution report, condensed with exit statuses preserved

All commands read-only, all exit 0 except one deliberate no-match grep (exit 1,
no conclusion rested on it). Verified HEAD and a clean `git status --porcelain`
before and after. **Read all 1469 lines of `src/core/dream/validate.js` and all
646 lines of `src/cli/dream.js` by numbered `sed` ranges**, plus the called
modules (scratch, ledger, lock, brain, skill-registry, containment-probe,
digest, private-fs, runtime-settings, identity approvals, alerts, update status,
run-evidence). Wrote `/tmp/inventory.md` (95 rows) and only then opened the two
spec files; extracted Tables G, V, D, R, S and the exact contracts; wrote
`/tmp/classification.md`; validated ids I001–I095, classifications and counts
with a script.

**Not run:** any product command, test suite, lint, commit, checkout, staging
operation or repository write. No file in the checkout was created, edited,
deleted, staged or committed.
