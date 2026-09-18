---
date: 2026-09-18
related_wps: [WP-scheduler-replay-manifest-independent]
---

# Design gate — WP-scheduler-replay-manifest-independent

Adversarial review of the spec under `docs/runbooks/codex-review.md`. The spec
was `Draft` throughout; it may not move to `Ready` until this gate closes.

## Round 1 (Astra)

- **Reviewed tip:** `b6814357` (spec as matured), branch diff against
  `c05a575b`.
- **Raw + focus committed BEFORE adjudication:** `4b800517`.
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r1-astra-raw.json`
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r1-astra-focus.txt`
- **Verdict:** `needs-attention` — *"Do not dispatch as written: discovery can
  still silently miss live jobs, and the widened deletion bypasses an existing
  vault protection."*
- **Round zero (pre-review checks):** template PASS; every citation exact; all
  four Table R row R2 regexes verified against generator output and against
  near-misses; all four Table B anchors measured unique. Two LIGHT items, below.

### Dispositions

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| 1 | **An unreadable scheduler root is treated as empty.** D1 converted permission/I-O failures into an empty discovery result. With scheduler authority present the live probe is short-circuited (`uninstall.js:208`), so `reverse()` and then `disposeCoreMechanics` would run having never inspected the directory holding an unrecorded live job — no unload *attempted*, i.e. R-stripped-manifest-orphan itself, distinct from the deferred `R-failed-unload` | A | HEAVY | **ACCEPTED.** New Table D row **D9**: `ENOENT`/`ENOTDIR` is an absent root and contributes nothing; every other enumeration failure marks the root unreadable, discovery returns it in `unreadable`, and a non-dry-run `uninstall` aborts before any disclosure having deleted nothing. `--dry-run` reports instead of aborting. New acceptance criterion 9, new Table S row S6, new RED declaration `srm-unreadable-root-read-as-empty` |
| 2 | **A record of another kind suppressed the unload.** D1 excluded any path named by a *validated* entry, but `validateEntry` (`manifest.js:1044`) checks shape, not scheduler coverage: a schema-valid `{kind:'file', path:'…/Library/LaunchAgents/ai.wienerdog.dream.plist'}` suppressed discovery while the file reverser preserves that path — `withinAllowedRoot`'s root set is `[core, claudeDir, codexDir, ~/.local/bin]` (`:742`, gate at `:872-883`) — so nothing ever unloaded it | A | HEAVY | **ACCEPTED.** Unload coverage and deletion permission split into two rows. **D10**: only a validated `scheduler-entry` naming the same resolved path *and* passing `withinSchedulerRoot` suppresses discovery. **D11**: a validated record of any other kind does not suppress the unload but does withhold the removal, whatever Table R row R4 says, with a `keep …` notice. `reverse()`'s option becomes `{path, remove}` items so the decision stays at discovery time. New acceptance criterion 10, new Table S row S7 |
| 3 | **The widened deletion had no vault exclusion.** `disposeCoreMechanics` protects a legacy or hand-edited install whose vault sits inside a mechanics dir (`:1123-1127`, `:1144-1147`); with the vault at `<core>/schedules`, an unrecorded user file matching Table R row R2 satisfied every gate and would be deleted **before** the protected sweep ran — a file that survives on `c05a575b` | A | HEAVY | **ACCEPTED.** New Table D row **D12**: discovery takes the accepted vault path (the same value `uninstall.js:309` already hands `disposeCoreMechanics`) and excludes candidates equal to or inside it, from both unload and removal, reporting them in `skippedForVault`. The act-time re-check deliberately does not re-derive it — same value, so re-deriving could only disagree with the disclosed plan. New acceptance criterion 11, new Table S row S8, new RED declaration `srm-vault-exclusion-removed` |
| L1 | Deliverables cited "Table A row A2"; no Table A exists | A | LIGHT | **ACCEPTED** — now reads "the dated amendment drafted under owner item 2" |
| L2 | `validateEntry` pinned at `manifest.js:1016`; it is `:1044` | A | LIGHT | **ACCEPTED** — corrected in Table D row D10 (the only surviving cite) |

### Why only two of the three HEAVY findings got a RED declaration

Findings 1 and 3 produce **absence** assertions — an abort, and a user file
surviving — which are the vacuity-prone shape ADR-0042 exists for: both go green
when the mechanism never ran or the fixture never armed. Finding 2's criterion
asserts a **positive** effect (the derived argv for the uncovered file reaching
the chokepoint), which cannot pass while the behavior is absent. Recorded here
because completeness of a declared set stays a review judgment (ADR-0042
decision 5), not a mechanical one.

### Surfaces updated in the same commit

Table D (D1 rewritten; D2, D3, D4, D5, D6 amended; D9–D12 added), Table R (R4's
ceiling-not-floor clause), Table S (S6, S7, S8 added), Table B (two declarations
added plus the note above), the Exact contracts (both signatures, both return
shapes, the worked example), the Deliverables notes for `manifest.js`,
`uninstall.js` and the two test files, acceptance criteria 9–11 (with 12
renumbered to stay last), the Mirrored Surface Checklist and the Security
checklist.

## Round 2 (Astra)

- **Reviewed tip:** `6afda2b6` (round-1 findings applied).
- **Raw + focus committed BEFORE adjudication:** `244d0cfc`.
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r2-astra-raw.json`
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r2-astra-focus.txt`
- **Verdict:** `needs-attention` — *"Do not dispatch: two specified paths still
  leave live jobs without any unload attempt."*
- **Round 1's D9 and D12 held.** Both new findings were **executed** by the
  reviewer against mocked I/O rather than argued, and both land on rows round 1
  itself introduced — the class each closes is real, the closure was incomplete.

### Dispositions

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| 4 | **Ordering: another reverser deletes the evidence first.** D5 ran after the manifest entry loop and skipped paths in `removedSet`. On win32 `<core>/schedules` **is** inside `withinAllowedRoot`'s root set (`manifest.js:742`), so a schema-valid, deletable `{kind:'file'}` record for `wienerdog-dream.xml` is discovered under D10 yet deleted by the file reverser during the loop; the post-loop pass then skips it and D6 rejects the missing file. The Task Scheduler entry stays registered while the core is swept. A mocked dry-run confirmed the reverser marks the XML removed without unloading it | A | HEAVY | **ACCEPTED.** D5 becomes **two phases**: **D5a**, the unload phase, runs **before** the entry loop; **D5b**, the removal phase, runs after it and keeps D11's separate deletion permission and the `removedSet` skip. D6 is restated per phase. `reverse()`'s returned `unrecordedSchedules` is now defined as the paths **D5a unloaded**. New acceptance criterion 12 (the win32 regression), new Table S row S9, new RED declaration `srm-unload-moved-after-loop` |
| 5 | **Alias coverage: resolved-path equality is not an equivalent unload.** D10 equated *resolved* paths, but `reverseSchedulerEntry` derives its argv from the recorded **lexical** basename (`:524`) while its containment gate resolves (`:512`). A `scheduler-entry` naming an in-root symlink `ai.wienerdog...plist` → `ai.wienerdog.dream.plist` satisfies (a)–(d) — the loose `withinSchedulerRoot` basename passes — yet `deriveUnloadArgv` returns `null`, so the reverser unlinks the alias and unloads nothing while discovery suppresses the real plist. Mocked execution confirmed the predicate/argv mismatch | A | HEAVY | **ACCEPTED.** D10 gains condition **(e)**: coverage additionally requires `deriveUnloadArgv(<recorded lexical path>, platform)` to deep-equal `deriveUnloadArgv(<candidate path>, platform)`, `null` equal only to `null`. A recorded alias deriving `null` or a different target leaves the candidate discovered. New acceptance criterion 13 (both alias cases), new Table S row S10, new RED declaration `srm-alias-counts-as-coverage` |

### Note on the declaration set

Both round-2 findings are **absence-shaped** — an ordering that is unobservable
unless the corpus contains the overlapping win32 case, and a non-suppression that
is unobservable without a symlink alias — so both carry declarations, unlike
round 1's finding 2. Completeness of the set remains a review judgment (ADR-0042
decision 5).

### Surfaces updated in the same commit

Table D (D5 rewritten as two phases, D6 restated per phase, D10 gains condition
(e)), Table S (S9, S10 added), Table B (two declarations added; the
why-no-declaration note rescoped to round 1's finding 2), the `reverse()` return
JSDoc, the Deliverables note for `manifest.js`, acceptance criteria 12–13 (with
the red-proofs criterion renumbered to 14 to stay last), the Mirrored Surface
Checklist, the Security checklist, the Implementation note on gate-derived rows,
and the Definition of done's dispatch precondition.

## Round 3

Pending — a fresh Astra round runs against the revised spec.
