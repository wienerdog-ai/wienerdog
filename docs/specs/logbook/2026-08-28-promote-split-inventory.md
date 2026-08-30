---
title: The complete code-first inventory — 95 elements, with Table V membership
date: 2026-08-28
related_wps: [WP-dream-promote-module, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->

# The complete code-first inventory — 95 elements

Produced by step (a) (`2026-08-28-promote-split-inventory-measurement.md`) from
`src/` alone, before any spec was opened. **This record exists so that every
EXCLUSION from Table V is visible and revisitable rather than silent** — the
owner's condition when ruling the scope. Table V cites this file.

## The membership test — owner-ruled 2026-08-28, mechanical

> **An element enters Table V iff it has a NAMED CONSUMER among this package's
> own rows or criteria** — a Table G or module row READS, WRITES, REPLACES or
> REORDERS it, or a criterion's evidence references it.

This is the spec-authoring runbook's own law ("every detail earns its place by a
named consumer: the decision or check that uses it"), applied as a check rather
than a feeling. **Borderline cases lean INCLUDE**: four rounds' failure mode was
under-inclusion, and one extra row is cheaper than a silent product loss.

`IN` = enters Table V. `OUT` = untouched by this package; it stays as it is, and
this row is the record of that decision.

| id | what | where | kind | Table V | why |
|---|---|---|---|---|---|
| I001 | mechanics-root trust gate refuses the run on a symlinked/non-dir protected path | `cli/dream.js:324-339` | consumed input | OUT | no row reads, writes, replaces or reorders it |
| I002 | config supplies vault, model, byte budget, timeout, layout, run date | `cli/dream.js:341-344` | consumed input | **IN** | `promote()` takes `date` and `layout`; G1 consumes the vault |
| I003 | the vault must resolve as a git repository | `cli/dream.js:346-347` | consumed input | **IN** | G8's commit depends on it (borderline → include) |
| I004 | single-run lock at `state/dream.lock` | `lock.js:13-53` | durable output | **IN** | G5 reorders the `finally` where cleanup and release live |
| I005 | "another dream in progress" line | `cli/dream.js:354-357` | user output | OUT | untouched; no row reads or reorders it |
| I006 | stale-lock-steal warning | `cli/dream.js:359-361` | user output | OUT | untouched |
| I007 | transcript ledger read + in-memory migration, persisted on real runs | `cli/dream.js:363-377` | durable output | **IN** | G4 rewrites the transcript-advance that writes it |
| I008 | transcript discovery and ledger eligibility | `scratch.js:103-121` | consumed input | **IN** | G4's deferral decision consumes the same selection |
| I009 | input-byte budget allocation and capacity deferral | `scratch.js:123-198` | consumed input | OUT | untouched by any row |
| I010 | private 0700 scratch rebuild + 0600 extracts | `scratch.js:28-70,160-226` | durable output | **IN** | G12 enumerates scratch against these exact outputs |
| I011 | `collectExtracts` return (entries, wrote, processed, quarantined, deferred) | `scratch.js:89-102` | returned field | **IN** | G12 uses `wrote`; G4 uses `processed` |
| I012 | truncation lines | `cli/dream.js:409-415` | user output | OUT | untouched |
| I013 | capacity-drop line | `cli/dream.js:416-422` | user output | OUT | untouched |
| I014 | newly-quarantined transcript lines | `cli/dream.js:423-433` | user output | OUT | untouched |
| I015 | quarantine-only run still writes ledger + digest | `cli/dream.js:436-447` | durable output | OUT | untouched; precedes the brain |
| I016 | capacity-wedge fail-loud | `cli/dream.js:449-463` | user output | OUT | untouched |
| I017 | "nothing new to dream" fast path | `cli/dream.js:466-469` | user output | OUT | untouched |
| I018 | dry-run prints the composed brain argv | `cli/dream.js:80-108,472-477` | user output | **IN** | G1 re-points the write target the argv shows |
| I019 | digest input set and ordering | `digest.js:605-838` | consumed input | OUT | untouched |
| I020 | atomic private `state/digest.md` write | `cli/dream.js:405-406` | durable output | OUT | untouched |
| I021 | pre-dream containment probe | `containment-probe.js:140-282` | side effect | OUT | untouched |
| I022 | containment-failure delivery | `cli/dream.js:490-500` | user output | OUT | untouched |
| I023 | pre-brain hash of every expected extract | `cli/dream.js:43-55,502-503` | consumed input | **IN** | G12's baseline |
| I024 | `precommitSessionEdits` one-commit of the dirty vault | `validate.js:112-137` | durable output | **IN** | G6 REMOVES it |
| I025 | private dream log dir/file, brain output appended | `cli/dream.js:510-515` | durable output | OUT | untouched |
| I026 | supervised pidfile write | `cli/dream.js:162-203` | durable output | **IN** | G2 reorders the reap/unlink |
| I027 | hook-free settings profile | `runtime-settings.js:60-74` | durable output | OUT | untouched |
| I028 | Claude staging dir wiped and recreated | `brain.js:173-188` | side effect | OUT | untouched |
| I029 | brain invocation inputs and constructed env | `brain.js:302-349,384-445` | consumed input | **IN** | G1 replaces the transitional write target |
| I030 | run-evidence append | `brain.js:447-497` | durable output | OUT | untouched |
| I031 | per-chunk stdout/stderr redaction | `brain.js:500-549` | durable output | OUT | untouched |
| I032 | `spawnBrain` completion fields; watchdog surfaces none | `brain.js:552-570` | returned field | **IN** | the pipeline `### Exact contracts` changes this return |
| I033 | watchdog reap on every settle; pidfile ordering | `cli/dream.js:206-215,268-294` | side effect | **IN** | G2 |
| I034 | nonzero-exit and timeout failures | `cli/dream.js:206-223` | user output | **IN** | G3 keeps them explicitly |
| I035 | unknown-command compound guard | `cli/dream.js:224-267` | consumed input | **IN** | G3 replaces its evidence half |
| I036 | `restoreVaultToHead` on failure paths | `cli/dream.js:547-550` | side effect | **IN** | G9 REPLACES both call sites |
| I037 | post-brain scratch integrity abort | `cli/dream.js:57-78,555-569` | consumed input | **IN** | G12 keeps it |
| I038 | `validateAndCommit` parameter contract | `validate.js:1036-1080` | consumed input | **IN** | replaced wholesale by the module contract + G7 |
| I039 | skill-registry read; corrupt → empty | `validate.js:1092-1096` | consumed input | **IN** | Table D gates take the registry snapshot |
| I040 | unexpected scratch files deleted AND recorded | `validate.js:1107-1121` | side effect | **IN** | G12 |
| I041 | modified expected extracts deleted AND recorded | `validate.js:1123-1129` | side effect | **IN** | G12 |
| I042 | extracts parsed into `extractsBySession` | `validate.js:1132-1142` | consumed input | **IN** | Table D ledger row |
| I043 | `git status --porcelain` change set | `validate.js:1013-1034` | consumed input | **IN** | replaced by `computeDelta` (G3, Tables C/D) |
| I044 | out-of-vault escape restore/remove + record | `validate.js:615-667` | side effect | **IN** | replaced by C9 + the primitive's refusal |
| I045 | LEARNINGS.md accepted only beside a registered SKILL.md | `validate.js:516-544` | consumed input | **IN** | Table D ledger row |
| I046 | ledger entry well-formedness | `validate.js:423-471` | consumed input | **IN** | Table D ledger row |
| I047 | ledger append-only / raise-only invariants | `validate.js:550-587` | consumed input | **IN** | Table D ledger row |
| I048 | session-binding + untrusted-taint rules | `validate.js:474-504,589-611` | consumed input | **IN** | Table D ledger row |
| I049 | ledger violation restore/remove + reverted record | `validate.js:1157-1167` | side effect | **IN** | replaced by refuse-and-report (Tables C/E) |
| I050 | injected-identity freeze under the default profile | `validate.js:17-41,1170-1183` | consumed input | **IN** | Table D Tier-3 row |
| I051 | shipped `wienerdog-*` skills out of revision scope | `validate.js:293-305` | consumed input | **IN** | Table D skill row; G10's exclusions |
| I052 | tracked skill revision authorization | `validate.js:335-364` | consumed input | **IN** | Table D skill row |
| I053 | body change needs a trusted learning, 3+ sessions | `validate.js:366-411` | consumed input | **IN** | Table D skill row |
| I054 | the learning-free incubating→active promotion | `validate.js:249-291` | consumed input | **IN** | Table D skill row |
| I055 | skill-body violation restore/remove + record | `validate.js:1185-1191` | side effect | **IN** | replaced by refuse-and-report |
| I056 | Tier-3 numeric floor and provenance | `validate.js:202-239` | consumed input | **IN** | Table D Tier-3 row |
| I057 | Tier-3 failure restore/remove + record | `validate.js:1193-1199` | side effect | **IN** | replaced by refuse-and-report |
| I058 | accepted new skill → `{rel,id,created}` candidate | `validate.js:1200-1205` | consumed input | **IN** | G10 |
| I059 | remaining changes fall through to EP2 | `validate.js:1206-1209` | consumed input | **IN** | replaced by Tables C/D |
| I060 | stage-all before EP2; staged name-status is the scan set | `validate.js:1211-1238` | side effect | **IN** | G7/G8 replace it |
| I061 | binary staged content withheld; no-added-lines skipped | `validate.js:1239-1263` | consumed input | **IN** | Table D EP2 row |
| I062 | scan added lines; hard→withhold, soft→redact | `validate.js:1257-1270` | consumed input | **IN** | Table D EP2 row |
| I063 | `quarantinePreserve` writes the artifact and returns its ACTUAL collision-resolved name + captured bytes | `validate.js:669-738` | durable output | **IN** | Table D EP2 row assigns the preservation; **GAP-INTERFACE** |
| I064 | soft findings preserve first, derive added lines, refuse non-lossless UTF-8 | `validate.js:740-785` | consumed input | **IN** | Table D EP2 row |
| I065 | the scrub: line-exact, mode/newline preserving, re-scan, index-first staging, byte-compare, rename | `validate.js:787-904` | side effect | **IN** | Table D EP2 row |
| I066 | `secretRedacted` entry `{path, lines, labels, name}`; counter increments last | `validate.js:1283-1291` | returned field | **IN** | **GAP-INTERFACE** |
| I067 | preservation-failure ABORT: never destroy unless a durable artifact byte-identically holds the CURRENT bytes | `validate.js:1293-1323` | consumed input | **IN** | **GAP-UNDERSTATED — ranked first on damage** |
| I068 | withheld tracked restore / untracked remove + index drop | `validate.js:1296-1332` | side effect | **IN** | replaced — nothing was published |
| I069 | withhold reason enriched with copy-failure, UTF-8 fallback, surviving original | `validate.js:1333-1359` | report line | **IN** | **GAP-INTERFACE** |
| I070 | redundant redacted copy deleted ONLY when byte-identical to the withheld copy | `validate.js:1338-1359` | side effect | **IN** | **GAP-UNDERSTATED** |
| I071 | withheld → reverted + `secretReverts` increment | `validate.js:1361-1364` | returned field | **IN** | G4 |
| I072 | `redacted/` retention: once per run, cap 50, oldest first, never this run's own | `validate.js:906-946,1365-1366` | side effect | **IN** | **GAP-UNDERSTATED** |
| I073 | secret-reverted new skills removed from `newSkills` | `validate.js:1367-1372` | side effect | **IN** | G10 |
| I074 | dated report created header-only if absent | `validate.js:1374-1383` | durable output | **IN** | Table R |
| I075 | "Reverted by orchestrator" section, or `- none` | `validate.js:1384-1391` | report line | **IN** | Table D report row / Table R |
| I076 | "Redacted in place" section, one metadata line per scrub | `validate.js:1392-1409` | report line | **IN** | **GAP-INTERFACE** |
| I077 | stage again; `committed[]` from staged name-status | `validate.js:1411-1425` | returned field | **IN** | G8 |
| I078 | notes/skills counter increment points and exact semantics | `validate.js:1416-1429` | returned field | **IN** | **GAP-UNDERSTATED** — G11 claims the counts |
| I079 | exactly one dream commit, fixed identity and message | `validate.js:1432-1441` | durable output | **IN** | G8 |
| I080 | post-commit `recordSkills` merge | `validate.js:1443-1448` | durable output | **IN** | G10 |
| I081 | returned `committed[]` | `validate.js:1450-1452` | returned field | **IN** | **GAP-UNDERSTATED** — neither inherited nor dropped |
| I082 | returned `reverted[]` | `validate.js:1450-1453` | returned field | **IN** | replaced by `refused[]` + `report.record` |
| I083 | returned `outOfVault` (paths only, reasons lost) | `validate.js:1453` | returned field | **IN** | G11/G12 |
| I084 | returned commit SHA | `validate.js:1454` | returned field | **IN** | G11 |
| I085 | returned `counts` | `validate.js:1455` | returned field | **IN** | **GAP-UNDERSTATED** — no defined producer |
| I086 | returned `secretReverts` | `validate.js:1456` | returned field | **IN** | G4 |
| I087 | returned `secretRedactions` | `validate.js:1457` | returned field | **IN** | G4 |
| I088 | `cleanRun` fail-closed on a malformed counter | `cli/dream.js:582-595` | consumed input | **IN** | G4 |
| I089 | per-transcript processed / deferred / exhausted records | `cli/dream.js:595-610` | durable output | **IN** | G4 |
| I090 | deferred/quarantined run-local counters | `cli/dream.js:595-609` | consumed input | **IN** | G4 |
| I091 | atomic ledger persist after all outcomes | `cli/dream.js:611` | durable output | **IN** | G4 |
| I092 | nonclean-run secret summary line | `cli/dream.js:612-621` | user output | **IN** | G11 |
| I093 | digest regenerated AFTER ledger persistence | `cli/dream.js:623-625` | durable output | **IN** | G4 reorders what precedes it (borderline → include) |
| I094 | final summary: SHA, counts, reverted, out-of-vault | `cli/dream.js:627-632` | user output | **IN** | G11 |
| I095 | scratch deleted then lock released, only if still owner | `cli/dream.js:633-642` | side effect | **IN** | G5 reorders teardown into the same `finally` |

## Counts under the ruled test

| | Count |
|---|---:|
| **IN** — enters Table V | **76** |
| **OUT** — untouched, recorded here | **19** |
| Total | **95** |

**The 19 exclusions, listed once so they are never silent:** I001, I005, I006,
I009, I012, I013, I014, I015, I016, I017, I019, I020, I021, I022, I025, I027,
I028, I030, I031. Each is a behaviour in `cli/dream.js` or a module it calls
that no row of this package reads, writes, replaces or reorders. **If a later
round shows any of them IS touched, that is a finding against this list, and the
list is the thing to revisit** — which is the whole reason it is written down.
