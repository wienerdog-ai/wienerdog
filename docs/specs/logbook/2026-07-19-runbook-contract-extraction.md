---
date: 2026-07-19
title: Incident-runbook contract extraction — burying-in-prose → tables
related_wps: [WP-a9-incident-runbook]
---

# Incident-runbook contract extraction (2026-07-19)

**Structural refactor of `WP-a9-incident-runbook` — a re-presentation only, ZERO
contract change.** After eight adversarial review rounds, the runbook's findings kept
landing on the SAME small set of contracts scattered through the operative prose. The
clearest signature: the ONE core-path-resolution contract was hit across FOUR separate
rounds — R7-1 (add a step-0 preamble resolving the core), R8-2 (persist it across the
mandated reboot), R8-3 (every operative path must carry the resolved `<core>` prefix,
never a bare relative `state/…`), and R8-4 (read the core from `wienerdog doctor`, mirror
the `HOME`-before-`USERPROFILE` code order). Each round caught a *different scattered
instance* of the same underlying fact. That is the diagnostic for contracts-buried-in-
prose: fixing one corner leaves another corner wrong, and a later fix can silently
contradict a copy elsewhere.

## What changed

- Added a **Contract-reference** subsection to the spec's `### Exact contract` — five
  compact, authoritative tables the runbook MUST embed: **A** Core & path resolution
  (the one-line core formula + every `$CORE/…` artifact path, plus the three
  outside-the-core paths — the macOS catch-up plist, the evidence folder, the persisted
  CORE-PATH record); **B** Scheduler artifacts per platform (per-job vs. catch-up, the
  exact stop commands, the `sync`/`reloadMissing` resurrection rule, the blocking dual
  re-verify); **C** Restore rules (`builtin:*` re-addable via `--job`, `skill:*` frozen
  by the A0 gate, restore source = `config.yaml` `jobs:` not `schedule.json`); **D**
  Managed-block drill gate (the BLOCK vs. ALLOW signal table + the three-check
  conjunction + the no-raw-digest-byte-compare rule); **E** `memory approve` allowed
  short names.
- Reworked steps 0–7 from inline restatement to **table references** ("resolve the core
  (Table A)", "stop the catch-up + delete file + drop manifest entry, then the Table B
  dual re-verify", "re-add only re-addable jobs (Table C)", "the Table D three-check
  conjunction"). Ordering, blocking conditions, reboot-as-sole-proof, the fail-closed
  drill environment and byte-compare, and the evidence-privacy discipline are all
  preserved verbatim in intent.

## Why this is safe

Every table cell was checked against BOTH the current post-R8 prose AND the code before
being written — `paths.js:54–55` (core formula, `HOME || os.homedir()`), `doctor.js:322`
(`core directory exists (<getPaths().core>)`), `schedule.js` `ensureCatchup`
(`ai.wienerdog.catchup` plist under `launchAgentsDir(paths.home)`; Windows
`\Wienerdog\catchup` / `<core>/schedules/wienerdog-catchup.xml`), `status.js`
`reloadMissing` + `describeEntry` (launchctl bootstrap / systemctl --now / schtasks
/create reload argv), `codex.js` (two unconditional info notices per clean sync),
`memory.js` `KNOWN` (profile/preferences/goals/instructions), and the adapters' hook
install at `<core>/bin/session-start.sh`. No cell contradicted the prose, so nothing was
"fixed" — a contradiction would have been a NEW finding, out of scope for a refactor.

## Boundaries held

The Deliverables permission boundary (create `incident.md`, cross-link
`secret-incident.md`), every acceptance criterion, and every literal verification command
are unchanged — the reworked spec still REQUIRES all the same tokens in the runbook, now
concentrated in the tables the greps target. `status:` stays **Draft**; `size:` stays
**S** (still one docs-only runbook plus one cross-link — the tables re-present already-
required content, adding no new deliverable). The endgame dry-run gate now has an obvious
target: it validates the five tables against three real installs (clean Claude-only,
clean Codex-only, custom-`WIENERDOG_HOME`).
