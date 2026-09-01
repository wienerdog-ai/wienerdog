---
title: Design-gate round record — WP-show-slot-own-value-kind
date: 2026-09-01
related_wps: [WP-show-slot-own-value-kind]
---

# 2026-09-01 — design-gate rounds, WP-show-slot-own-value-kind

Doc under review: `docs/specs/WP-show-slot-own-value-kind.md`, matured from
the 2026-08-31 handover stub by wd-architect on
`docs/wp-show-slot-own-value-kind` (base `5d31a7dc`), tip `29b1d19b` at round
zero. Companion touch: `docs/specs/WP-index-guard-residuals.md` gained the
dependency on this package (`29b1d19b`).

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material product finding on either channel;
machinery/wording findings at that point are fixed within the frozen surface
or accepted as named residuals. The owner ruling this spec parks (the C1
slot-kind change + the home of the W1(c) amendment, both in the spec's
Dispatch precondition) blocks `dispatch`, not the loop.

**Channels:** gate = Codex plugin; shadow = herdr-spawned hermetic Codex
(`CODEX_HOME=~/.codex-review-home`, read-only). Raw outputs are committed
BEFORE adjudication, one file per channel per round
(`2026-09-01-show-slot-gate-raw-round<N>-<channel>.txt`).

## Round zero (`e35c5260` → fixes in `b9bd5f66`)

Template conformance (clean-context executor): **CONFORMANT** (two cosmetic
notes, both taken as offered). Coherence pass: every runnable claim
reproduced — all ~30 file:line citations byte-exact including the four quoted
fragments inside the 42 KB W1(c) cell, the `grep -rn "'show'" src/` pair, the
`b19121bb`→`53b1519b` ancestry, the index-corruption exploit and its
staged-content-destroying recovery, `classify` returning `null` on the
two-token vector today, the `commit-tree -m` negative, the
`--test-name-pattern` 43/43 non-filter, and the claim sweep (12 hits, all
accounted). **9 findings (4 B, 5 C), all FIX, applied in `b9bd5f66`:**

1. **B** — W1(c)'s FREE-slot RULE sentence (*"a slot holding data the run
   merely carries … is FREE"*) is falsified by C1 and was registered nowhere;
   now the FIRST C1 checklist entry, C1 restated as amending the partition
   two-way → three-way (COMPUTED → own; carried-and-varying → FREE;
   carried-and-fixed → literal), sweep pattern `merely carries` added.
2. **B** — Deliverables "three clauses move" vs four checklist W1(c) surfaces:
   the *"REPAIR DOES NOT INSPECT THE TOKEN"* clause decided a registered
   NON-move (PRODUCED is loose, not false; its sharpening is
   `WP-index-guard-residuals` item 2's deliverable — hand-off recorded in both
   specs); Deliverables no longer states a count.
3. **B** — criterion 4's three REDs unsatisfiable for the two prose-only
   fixes; narrowed to C1 (RED with slot reverted to `ANY`, GREEN with the
   literal, accept side alive both ways); C2/C3 carry the whole-cell re-read,
   any red for them named synthetic.
4. **B** — the shape (3) negative measurement was true only for the MODE
   slot; the PATH slot accepts an option string as a literal filename
   (exit 0, private index, no file written — conclusion survives, evidence
   restated per-slot; the original vector's `Invalid path` confound named).
5. **C** — three quotations re-attributed from "W1(c)" to the Done spec's
   Mirrored Surface Checklist (`:665-677`). 6. **C** — `:1024`→`:1032`.
   7. **C** — the sweep's mandatory-context window swallowed an adjacent hit
   (5-of-6) and `{0,n}` bounds die on the ugrep shim; rebuilt as one
   fixed-literal `grep -oF` pass per pattern (18 hits, all accounted).
   8. **C** — logbook range unified on `:409-426`. 9. **C** — ADR-0031
   trigger restated (ii)+(vii); (vi) does not fire.

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
| 1 (`8652e8b9`) | needs-attention / needs-attention | `…round1-codex-plugin.txt` (`424ef73f`), `…round1-herdr-shadow.txt` (`69d4d375`) | Converged (plugin F1 + shadow F1, conf 0.99): C1's fixed-vs-varying partition falsified by shape (9)'s fixed-but-FREE `-m` slot — the amended rule and `KNOWN_CALLS` would drift ON MERGE, defect 3 recreated by its own fix. Resolved by scoping the partition's carried half BY POSITION (three clauses: computed → own; carried in an option position → fixed and literal; other carried slots → FREE, fixed ones literal-pinnable as optional hardening), with "option position" stated as a design-time predicate, never a match-time test, and shape (9) reconciled as clause (3) applying rather than an exception. Plugin-only: the present-tense "stay `ANY`" mechanism claim (`2026-08-31-index-refresh…:368-372`) falsified by C1 and unreachable by any sweep pattern — SHA-scoped to past tense, slot-kind spelling dropped (which also makes its own deference sentence true), registered, sweep pattern added. Shadow-only: no verification step discriminated the spelled literal from the forbidden `HEAD:${WARNINGS_REL}` interpolation (runtime-identical; the relocation tripwire unprovable) — a three-state source-form count check added (absent → RED, literal → GREEN, interpolated → runtime green but source-form RED), plus the interpolation as a second required applied mutation. Shadow scope objection (the `WP-index-guard-residuals.md` edit fails this spec's boundary command) ROUTED, not counted: spec-family docs branch; the boundary gate targets the implementation diff — a clarifying clause added beside the boundary command. All three findings FIX, applied in `6c2bcee2`. R1-A is HEAVY (canonical contract text) → full fresh round 2. |

## Outcome

*Open.*
