---
title: Design-gate round record — issue #168 spec family (private-state mode pin + failLoud survival)
date: 2026-09-01
related_wps: [WP-private-state-writers-mode-pin, WP-failloud-survives-state-write-failure]
---

# 2026-09-01 — design-gate rounds, issue #168 family

Docs under review: `docs/specs/WP-private-state-writers-mode-pin.md` and (from
round 2) `docs/specs/WP-failloud-survives-state-write-failure.md`, split out of
it. Drafted by wd-architect on `docs/issue-168-spec` (base `a6e0803`).

**STOP CRITERION (pinned):** the loop closes when an external round returns no
material product finding on either channel; machinery/wording findings at that
point are fixed within the frozen surface or accepted as named residuals.
Owner ratifications outstanding (they block `Ready`, not the loop): the lift of
the DATED OWNER DECISION 2026-07-19 (repair-only waiver for
`schedule.json`/`watermarks.json` writers — issue #168 is its field
falsification), and the residual set named through the rounds.

## Round zero (`5ffba43` → fixes in `ad559ad`)

Template conformance (clean-context executor): **CONFORMANT**. Coherence pass:
the 19-row writer audit reproduced fully (all runnable claims green, the
RED-on-HEAD gate reproduced byte-for-byte, all 16 correct-rows spot-checked
exact); 4 citation findings + 1 clarity note, all FIX, applied in `ad559ad`
(the prose-vs-array-literal citation, scan-vs-repair line, `writeFilePrivate`
count 8→11 sites/10 files, boundary-check range, and the 0644-vs-0666 umask
arithmetic — the last verified by reproducing the field 0644 under umask 022).

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
| 1 (`ad559ad`) | needs-attention / needs-attention | `…round1-codex-plugin.txt`, `…round1-herdr-shadow.txt` (`d2a9c1d`) | Converged: the chmod-throw contradiction (the fix reintroduced the throw class used to reject `writeFilePrivate`) + umask-000-only test blindness; shadow added stale-temp/symlink loose-window, absent-file appendAlert window, deletion-recreation hole. Resolved by MEASUREMENT in `9675eb5`: today's writers already throw at three `run-job.js` sites outside every `try` — the alert is already lost on disk-full — so the objection collapsed, `writeFilePrivate` was adopted, and the pre-existing alert-loss split into `WP-failloud-survives-state-write-failure` (S, dependency). Gate now 2 umasks × 2 destination states, RED on HEAD ×12. |
| 2 (`9675eb5`) | needs-attention / needs-attention | `…round2-*` (`848b5b9`) | Converged: success-path refusal gap (`:1060`/`:1061` — a hardened refusal after successful work had no durable record; catch-up replay measured to key on `last_success` only) + 12-vs-10 cell arithmetic; plugin added the compaction-branch hazard. Applied in `bcc6d6a`: five-site contract, replay = diagnosable-not-prevented routed residual, 10 applicable cells honest. |
| 3 (`bcc6d6a`) | needs-attention / needs-attention | `…round3-*` (`01774e2`) | Plugin high: the recovery path performed the exfiltration (`failLoud`→`appendAlert` follows the refused symlink — measured). Converged: B1/B2 taxonomy split, one-ATTEMPT-not-one-record, unbounded replay honesty, `failLoud` subject false for completed work. Shadow supplied the safe compaction close (local try/catch after the durable `:89` append — the architect withdrew its round-2 refusal on measurement). Applied in `03b14d7`'s predecessor `bcc6d6a`… (rounds 3–4 fixes: `bcc6d6a` → `03b14d7`). |
| 4 (`bcc6d6a`) | needs-attention / needs-attention | `…round4-*` (`3c625c1`) | Circuit-breaker pass (rounds 3+4 same family): claims narrowed, residuals named, ONE sanctioned mechanism (Table E closed outcome enum). Impossible Table D byte-identical guarantee rescoped to the predictable-temp hazard; destination-symlink append = pre-existing named residual; unbounded compaction growth = named residual (doctor measured to never inspect `alerts.jsonl`); unreachable B2 precondition split; no-GWS B2 honesty (job-log stream measured closed at all five sites — no durable notification remains). Applied in `03b14d7`. |
| 5 (`03b14d7`) | needs-attention / **approve** | `…round5-*` (`7e5befd`) | Plugin's last high: F10 post-rename temp-substitution loses the `:89` record while reporting `persisted=true` (citations verified). The reviewer's "existing return-false path" REFUTED by measurement (`appendAlert` always returns `undefined`; `failLoud` keys on absence-of-throw) — a minimal NEW wire contracted instead, labelled as new, consumer-first landing order. Applied in `3ce75c4`. |
| 6 (`3ce75c4`) | **approve** / needs-attention | `…round6-*` (`227c004`) | Shadow's last finding: F10 indistinguishable without a stable code (message text is mutable). Fixed in `e544fc3`: `err.code = 'WD_F10_POST_RENAME'` on the single `:361-365` throw (the tree's `err.code` idiom measured across ~15 sites; every other throw site verified dest-untouched, so no-code⇒Case-1 is correct); `private-fs.js` Deliverables row honestly comment+one-tagged-throw; 2026-07-19 waiver verified unaffected. |
| 7 (`e544fc3`) | **approve** / **approve** | `…round7-*` (this commit) | Confirmation round. **LOOP CLOSED.** |

## Outcome

- Both specs remain **Draft**. `Ready` is blocked on two owner acts: (1) the
  2026-07-19 waiver lift for the two state-file writers (the dispatch
  precondition recorded in the mode-pin spec), and (2) ratification of the
  named residual set (destination-symlink append, unbounded compaction growth
  under permanent refusal, unbounded replay until repaired, no-GWS B2
  notification gap, deletion-recreation of in-place-written files — each with
  its routed follow-up or manual-recovery note).
- Dependency order: `WP-failloud-survives-state-write-failure` lands first
  (consumer of the F10 wire; byte-identical to HEAD until the producer lands),
  then `WP-private-state-writers-mode-pin`.
- Channel comparison data: 7 rounds × 2 channels; the two channels converged on
  every major finding family within a round of each other; one refuted-false
  finding per channel across both loops (#169's round-6 shadow absent-manifest;
  #168's round-5 plugin "existing return-false path" — half-false: the defect
  was real, the cited mechanism absent).
