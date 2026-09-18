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

## Round 3 (Astra)

- **Reviewed tip:** `8e9d4dde` (round-2 findings applied).
- **Raw + focus committed BEFORE adjudication:** `dcf46033`.
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r3-astra-raw.json`
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r3-astra-focus.txt`
- **Verdict:** `needs-attention` — *"D10 still permits false coverage that leaves
  a live job without any unload attempt."*
- **D5's two phases and D10(e) held.** The finding is a *third* hole in the same
  predicate, again executed against mocked I/O, again a combination neither
  earlier round's condition excludes.

### Disposition

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| 6 | **Coverage does not survive earlier reversers.** On win32, an unrecorded `schedules/wienerdog-dream.xml` covered by a `scheduler-entry` for an in-root, **same-basename symlink** resolving to it passes **all five** D10 conditions — including round 2's (e), since the basenames match and the argv is equivalent — so the XML is excluded from discovery. A later deletable `{kind:'file'}` record for the XML then deletes it during replay; the covering entry's reverser subsequently fails realpath containment and spawns nothing. Mocked execution confirmed every condition passed, the file was removed, and `schedulerSpawn` received **zero** calls; the core is then disposed around a live task. D5a cannot help, because discovery had excluded the candidate | A | HEAVY | **ACCEPTED, and the design is changed rather than the predicate.** See the convergence note below |

### Convergence note — the surface is now frozen

Three rounds, three holes, all in one place: **D10's coverage predicate deciding
to suppress an unload.** Round 1 added conditions (a)–(d), round 2 added (e), and
round 3 found a combination satisfying all five. `docs/runbooks/codex-review.md`'s
rule is that the loop converges by **freezing surface, not by patience**, and the
common shape of all three is diagnostic: a suppression rule has to predict what
the *rest of the replay* will do to its own evidence, which has no closed form.

**A sixth condition was therefore not added. The predicate was deleted.**

- **D10** now reads: coverage never suppresses an unload; discovery does not read
  the manifest at all. Phase **D5a unloads every candidate D1 yields**, recorded
  or not, before any manifest reverser runs.
- **D11** is the manifest's only remaining influence: a validated entry naming a
  discovered path sets `remove: false`. That direction is safe in a way
  suppression never was — it can only make uninstall delete *less*, so a forged,
  stale or evidence-losing record cannot leave a job running.
- **Names follow the design:** `discoverUnrecordedSchedules` →
  `discoverSchedulesOnDisk`; `reverse()`'s `unrecordedSchedules` option and
  return field → `discoveredSchedules`.

**The surface is frozen here.** D5a unloads everything recognized, contained,
non-vault and regular-file. Further findings are either fixed **within** that
shape — the candidate gate, the phase order, the removal narrowing — or accepted
as **named residuals** in this spec. Re-opening the question of whether some
manifest state may suppress an unload is out of bounds without a new owner
ruling.

### The cost this buys, and why it is tolerated

A normal install's every job is now unloaded **twice** — once by D5a, once by its
own `scheduler-entry` reverser. Recorded as **Table D row D13**, with the
per-platform expectation and, more importantly, the reason it cannot fail the
run: `reverseSchedulerEntry` wraps its spawn in `try/catch` and **discards the
result** (`manifest.js:532-536`), under a comment that already anticipates it —
*"Best-effort: the entry may already be unloaded. Ignore non-zero/errors"*
(`:529`). No exit code reaches a decision, so `R-failed-unload` has no abort path
for a second attempt to trip. Second-attempt expectations: **launchd** `bootout`
of an already-booted-out label → non-zero; **systemd** `disable --now` of an
already-disabled unit → 0 (non-zero only if the unit file is gone); **schtasks**
`/delete /tn … /f` of a missing task → non-zero. Two stated costs: one extra
`schedulerSpawn` per recorded scheduler entry, and one extra ADR-0041 refusal
line per entry on an unauthorized run.

**The inverse suppression was weighed and not taken** — having D5a record what it
unloaded so the recorded entry's reverser skips its own attempt. It would save a
spawn whose result is already discarded, at the price of re-introducing a
suppression channel into the exact mechanism three rounds just removed one from.

### Surfaces updated in the same commit

Table D (D1 loses its coverage clause; D3 gains the duplicate-`would run:`
disclosure; D5a's scope widened; D7's consent argument re-derived; D10 and D11
rewritten; **D13** added), Table S (S7 and S10 rewritten to cite the removal of
the predicate), Table B (`srm-alias-counts-as-coverage` **dropped** — it pinned a
predicate that no longer exists — and `srm-record-suppresses-unload` added,
anchored on `const removedSet = new Set([paths.manifest]);`, measured unique at
`c05a575b`), the Exact contracts (both signatures renamed, the worked example
re-derived), the Deliverables notes, acceptance criteria 13 (rewritten) and 14
(new, the double-unload behaviour) with the red-proofs criterion renumbered to
15, the Mirrored Surface Checklist, the Security checklist, the gate-derived-rows
implementation note, and the Definition of done's dispatch precondition.

## Round 4 (Astra)

- **Reviewed tip:** `bca5b091` (round-3 convergence move applied).
- **Raw + focus committed BEFORE adjudication:** `b78ccba7`.
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r4-astra-raw.json`
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r4-astra-focus.txt`
- **Verdict:** `needs-attention` — *"the specified discovery can make an existing
  integration test delete real scheduler files."*
- **The frozen surface held.** Nothing about D1, D5, D10, D11 or D13 was
  re-opened: no manifest-coverage suppression, D5a unloads everything, D11
  narrows removal only, the double unload is discarded at
  `manifest.js:529-536`. The finding is **inside** the frozen shape — it is about
  which roots D1 enumerates — which is what the convergence note said further
  findings would look like.

### Disposition

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| 7 | **An inherited `XDG_CONFIG_HOME` puts a discovery root outside the sandbox.** `tests/integration/uninstall-core-e2e.test.js` `tempEnv()` spreads `...process.env` (`:27`) and overrides only `HOME` (`:28`), so `systemdUserDir` (`generators.js:99-103`) still resolves to the developer's real `~/.config/systemd/user`. Astra executed the environment builder read-only to confirm it. The test grants `WIENERDOG_ALLOW_REAL_SCHEDULER=1` (`:39`), so clearance is short-circuited, and `WIENERDOG_LOADER_NOOP` (`:33`) suppresses **spawns, not deletions** — so under R4's `unload-and-remove` a real `wienerdog-*.timer` there would be discovered, not found in the fixture manifest, and **deleted by `npm test`**. The integration test was also absent from the Deliverables table | A | HEAVY | **ACCEPTED, and fixed in the root derivation rather than only in the test.** See below |

### Where the fix belongs, and why the existing guard does not reach it

The coordinator's question was whether `WP-scheduler-mutation-home-authority`'s
authority check covers this. **It does not, and structurally cannot.**
`realSchedulerAuthority` compares `getPaths().core` to
`<os.userInfo().homedir>/.wienerdog` and gates `schedulerSpawn` — the **mutation
chokepoint**. The damage here is an `fs.rmSync` on a file outside the sandbox,
which no spawn guard observes. ADR-0041's own sentence is the one being violated
one level down: *a redirected `HOME` sandboxes the files, so it must also stop
the mutation* — except `XDG_CONFIG_HOME` is not a file the redirect moved.

So the fix is **Table D row D14**, in D1's root derivation: a discovery root must
be `contains`-inside `paths.home` or `paths.core`. Per root —

- **LaunchAgents** `path.join(home,'Library','LaunchAgents')` — inside
  `paths.home` by construction. Always a discovery root.
- **Windows XML** `path.join(paths.core,'schedules')` — inside `paths.core` by
  construction, and **never `APPDATA`-derived or otherwise ambient**. Always a
  discovery root. (Checked because the coordinator asked: the win32 root has no
  environment input at all.)
- **systemd user dir** `(XDG_CONFIG_HOME || home/.config)/systemd/user` — the
  **only** root an ambient variable can move outside the home being reversed, and
  the one D14 exists for.

**Both fixes ship, and the test fix is not the load-bearing one.** The literal
edit is in the Deliverables row: add `XDG_CONFIG_HOME: path.join(root,
'.config'),` to `tempEnv()`'s object literal beside the existing
`CLAUDE_CONFIG_DIR` / `CODEX_HOME` overrides.

### Named residual

**`R-external-xdg-root-undiscovered`** — on an install whose `XDG_CONFIG_HOME`
genuinely points outside `$HOME`, unrecorded systemd units there are not
discovered. Recorded ones still reverse, because `reverse()`'s own
`schedulerRoots` and `withinSchedulerRoot` are untouched. Strictly narrower than
today's behaviour, and therefore the direction ADR-0038 permits. This is the
"accepted as a named residual" branch the convergence note reserved.

### Surfaces updated in the same commit

Table D (D1's root clause now cites D14; **D14** added), Table S (**S11** added),
Table B (`srm-external-root-discovered` added, anchored on the unchanged
`gen.systemdUserDir(paths.home, process.env)` line, measured unique at
`c05a575b`), a **new Deliverables row** for
`tests/integration/uninstall-core-e2e.test.js` carrying the literal edit,
acceptance criteria 15 and 16 (red-proofs renumbered to 17), the Platform-scope
table's Linux row, the Mirrored Surface Checklist, the Security checklist, the
gate-derived-rows implementation note, and the Definition of done's dispatch
precondition.

## Round 5 (Astra)

- **Reviewed tip:** `4c95c587` (round-4 D14 applied).
- **Raw + focus committed BEFORE adjudication:** `868f578e`.
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r5-astra-raw.json`
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r5-astra-focus.txt`
- **Verdict:** `needs-attention` — *"the new root filter can silently bypass the
  unreadable-root safeguard and leave live jobs behind."*
- **D14 held as a design.** The finding is in **how** it is evaluated, inside the
  frozen shape's candidate gate.

### Disposition

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| 8 | **A resolution failure was indistinguishable from a confirmed-external root.** D14 filtered roots through `contains`, which catches **every** `realpathSync` error and returns `false` (`manifest.js:1097-1108`, `:1103-1104`). An `EACCES`/`EIO` resolving an otherwise in-home root therefore **excluded** it before D9 could enumerate it and report it unreadable. Astra injected `EACCES` against the unchanged helper and confirmed the exclusion. With authority present and the job unrecorded, uninstall skips the probe, unloads nothing, and removes the core around the live job — the failure D9 exists to prevent, reached through a different door | A | HEAVY | **ACCEPTED.** New Table D row **D15**: discovery classifies each root itself, with an explicit `try/catch` that surfaces `err.code`, into **(i) confirmed external** (resolved, inside neither anchor ⇒ excluded silently), **(ii) absent** (`ENOENT`/`ENOTDIR` ⇒ contributes nothing, matching D9's existing reading), **(iii) resolution failure** (any other code ⇒ `unreadable`, aborting through D9 before any mutation). Failing to resolve `paths.home` or `paths.core` itself is (iii) for **every** root, not a silent exclusion of all of them. **`contains` is not changed** — its fail-closed boolean is correct for `withinSchedulerRoot` (`:556`) and the vault guard (`:1144`), where an unresolvable side should mean *preserve*; D15 adds an error-surfacing resolution **beside** it for the one caller whose fail-closed direction is unsafe. New acceptance criterion 17 (all three outcomes, not just the new one), Table S row S12, RED declaration `srm-resolution-failure-read-as-external` |

### On the declaration's anchor

`srm-resolution-failure-read-as-external` mutates **new code authored by this
package** (D15's classification), so it carries **no pre-measurable anchor at
`c05a575b`** — stated in its Table B row, the same disclosure
`srm-disposition-flipped` already makes. It is still declarable, and it is
declared, because criterion 17 is abort-shaped: it goes green whenever the
fixture never made a root unresolvable.

### Surfaces updated in the same commit

Table D (D14 now defers its resolution to D15; D9 gains root-resolution failure
as a third source of `unreadable`; **D15** added), Table S (**S12** added), Table
B (one declaration added), the Deliverables note for `manifest.js` — which now
states that **`contains` stays byte-unchanged** — acceptance criterion 17 with
the red-proofs criterion renumbered to 18, the Mirrored Surface Checklist, the
Security checklist, the gate-derived-rows implementation note, and the Definition
of done's dispatch precondition.

## Round 6 (Astra)

- **Reviewed tip:** `999256f2` (round-5 D15 applied).
- **Raw + focus committed BEFORE adjudication:** `07d2df2a`.
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r6-astra-raw.json`
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r6-astra-focus.txt`
- **Verdict:** `needs-attention` — *"candidate-resolution failures can still
  bypass the unreadable-root safeguard and leave live jobs behind."*
- **D15 held for roots.** The finding is the **same defect one level down**.

### Disposition

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| 9 | **Candidate canonicalization still swallowed its errors.** D15 covered roots, but D1 still gated each **candidate** through `withinSchedulerRoot` (`manifest.js:555`), which is built on `contains` and returns `false` on any `realpathSync` error. Read-only fault injection confirmed roots resolving and `lstat` reporting a regular file while an `EIO` on the candidate silently produced `false`; D9 received nothing, no unload was attempted, and the core was removed around the live registration | A | HEAVY | **ACCEPTED, and generalized rather than duplicated.** Adding a D16 for candidates would have invited a D17 for the vault path. **D15 is restated as ONE rule over every path discovery resolves** — each root, each candidate, and D12's vault path: `ENOENT`/`ENOTDIR` = absent; any other code = unreadable → D9 aborts before mutation; **only a successful resolution may classify a path as external or contained**. **Discovery calls neither `withinSchedulerRoot` nor `contains`** — it uses its own error-surfacing resolver for containment, and needs nothing else from `withinSchedulerRoot`, whose loose basename half R2 already supersedes (Table R row R3). Both helpers stay byte-unchanged for their own callers, where fail-closed correctly means *preserve*. **D12 explicitly follows the rule:** an unresolvable vault path is unreadable and aborts, never "nothing to exclude". Acceptance criterion 17 gains the candidate-`EIO` case as a **fourth outcome** rather than becoming a new criterion; Table S row S12 and the Security-checklist row are restated over all sites; the RED declaration's mutation becomes "collapse the three outcomes at **any** resolution site" |

### The one place the rule deliberately does not reach

The **act-time** re-check (D6) runs inside `reverse()`, after D9's abort has
already passed, so a resolution failure there **drops the path**. At that point
failing can only ever preserve, which is the narrowing direction. Stated in D15
itself so it is not read as an inconsistency.

### Convergence note, extended

Round 3 froze the *shape*: D5a unloads everything recognized, contained,
non-vault, regular-file. **Round 6 freezes the resolution semantics inside it:
there is one rule for every path discovery resolves, stated in D15.** A further
finding of this family — some path in discovery whose resolution error could be
swallowed — is fixed by **pointing at D15**, not by adding a row for that site.
If a site is found that cannot follow the rule, that is a named residual, not a
new predicate.

## Round 7 (Astra)

- **Reviewed tip:** `7968bbcf` (round-6 uniform D15 applied).
- **Raw + focus committed BEFORE adjudication:** `c3f9557a`.
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r7-astra-raw.json`
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r7-astra-focus.txt`
- **Verdict:** `needs-attention` — *"act-time resolution failures can still leave
  live jobs behind while uninstall deletes their core."*
- **The uniform D15 held.** The finding is **the exception D15 carved out for
  itself**, which is the sharper result: the rule was right and the carve-out was
  the defect.

### Disposition

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| 10 | **The "can only preserve" exception was false at whole-uninstall scope.** D6 dropped a discovered path when its act-time `lstat`/resolution failed and let reversal continue. Measured: a disclosed, unrecorded plist whose D5a re-check hits `EIO` gets **no unload**, while the manifest loop and `disposeCoreMechanics` remove the core around it; if the error clears before D5b, D5b's *independent* re-check would even permit deleting the plist with no unload ever attempted. **R-stripped-manifest-orphan recreated**, and distinct from `R-failed-unload` because **no spawn occurs** | A | HEAVY | **ACCEPTED; the exception is removed, not narrowed.** D6 rewritten: in phase D5a, `ENOENT`/`ENOTDIR` is **absence** (drop that item, record it, continue); **any other failure stops the uninstall** with D9's abort shape, naming the path and `code`, **before the manifest entry loop and before `disposeCoreMechanics`**. Phase **D5b acts only on the items D5a passed** and performs no independent re-check that could re-admit one; its own checks may only skip. D15's scope line now reads "in discovery **and** at act time", with absence as its single special case. AC 17 gains this as a **fifth outcome**; Table S row S12, the Security-checklist row and the RED declaration's mutation are restated to include the act-time site |

### Why this does not weaken `reverse()`'s per-entry error isolation

`manifest.js:842-846` exists so a throwing reverser cannot leave an install
**partially reversed and permanently un-uninstallable** — *"every retry hit the
same entry"*. D5a's abort is the opposite case: it fires **before any entry
reverser has run**, so the manifest, the core and every file are intact and a
retry is unaffected once the I/O condition clears. It is also the shape ADR-0041
Decision 2 already mandates for `uninstall` — abort loudly, having deleted
nothing. Recorded because a reader meeting the abort at that line will ask.

### What the architect got wrong, recorded plainly

The exception was written in round 6 with the reasoning *"at that point failing
can only ever preserve"*. That is true **of the one path** and false **of the
uninstall**, and `docs/runbooks/spec-authoring.md` already names the question
that catches it: *if my conclusion were false, would this evidence have shown
it?* The evidence considered was one path's fate; the claim quantified over the
whole run. Two rounds in a row the gate has been the thing asking that question.

### Convergence note, restated

**D15 is uniform across discovery AND act time**, with absence
(`ENOENT`/`ENOTDIR`) as its single exception, at every site. The shape was frozen
in round 3; the resolution semantics in round 6; round 7 removes the last
carve-out from them. A further finding of this family is fixed by **pointing at
D15**, and a site that genuinely cannot follow it becomes a **named residual**,
never a new predicate and never a new exception.

## Round 8 (Astra)

- **Reviewed tip:** `bbee59a3` (round-7 D6 rewrite applied).
- **Raw + focus committed BEFORE adjudication:** `a6734862`.
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r8-astra-raw.json`
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r8-astra-focus.txt`
- **D6 and D15 held.** One band-A HEAVY finding and one band-B LIGHT.

### Dispositions

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| 11 | **A preserved plist reloads at the next login.** D11 sets `remove: false` for a plist recorded as `kind:'file'`; the file reverser **also** preserves it, because `~/Library/LaunchAgents` is outside `withinAllowedRoot`'s root set (`manifest.js:742`, gate `:872-883`) — verified. D5a unloads the job, the core is removed, the plist survives, and under R5's login-reload behaviour the next login re-registers it against a deleted core. The unload **succeeded**, so `R-failed-unload` does not cover it, and the ADR-0041 amendment's unconditional "CLOSED" was unsupported | A | HEAVY | **ACCEPTED as a NAMED RESIDUAL, not a new mechanism** — the branch the round-6/7 convergence note reserved. New Table R row **R9**, `R-preserved-reloadable-plist`, with its reachability (hand-edited or corrupted manifest only; no code path records a schedule file as anything but `scheduler-entry`, `schedule.js:358`) and its comparison to `c05a575b` (where the same install gets **no unload at all** and the same surviving file, so this package is strictly narrower). The ADR-0041 amendment text is **narrowed** and gains a residual row beside the closed one. Disclosure is **mandatory, not optional**: every `keep` line for a plist is followed by a plain-language warning. The alternative — a retryable refusal before core teardown — is **owner item 3**, deliberately not the default |
| 12 | **Mirror drift in acceptance criterion 10.** It still required a validated `scheduler-entry` to **exclude** its file from discovery — the round-3 suppression D10 now forbids — contradicting criterion 14's double-unload assertion | B | LIGHT | **ACCEPTED.** Criterion 10 rewritten: recorded files **stay discovered** with `remove: false`, and D5a attempts their unload **independently of** the recorded reverser. Swept every acceptance criterion and Table S row for other pre-round-3 suppression vocabulary — **none found**; the remaining occurrences of "suppress" are the rows that describe the suppression channel's *removal* (D10, D13, S7, S12, the `srm-record-suppresses-unload` declaration) |

### Why the refusal is not the default

The only exit from a refusal, for a user unwilling to hand-edit their manifest,
is for Wienerdog to delete a file another record owns — which re-opens the
**deletion-widening question owner item 1 already carries**, one level deeper and
without a ruling. A refusal clearable only by taking the option the owner has not
yet ruled on is not a neutral default. Recorded as owner item 3 with its overrule
cost: an uninstall that cannot complete on a corrupted manifest until the user
edits that file by hand.

### Convergence note — the residual branch was exercised

Rounds 3, 6 and 7 froze the shape, the resolution semantics and the last
carve-out, and stated that a site which cannot follow the rules becomes a **named
residual, never a new exception**. Round 8 is the first finding to take that
branch, and it took it without adding a predicate, a condition or a code path.

## Round 9 (Astra)

- **Reviewed tip:** `131189d6` (round-8 R9 and the narrowed amendment applied).
- **Raw + focus committed BEFORE adjudication:** `9a32963b`.
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r9-astra-raw.json`
  - `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-r9-astra-focus.txt`
- **Verdict:** `needs-attention` — *"the act-time absence exception can still
  leave registered jobs pointing at a deleted core."*
- **R9, the narrowed amendment and D3 held.** The finding is the **absence**
  exception — the one special case D15 kept at every site.

### Disposition

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| 13 | **A vanished file does not prove the registration vanished.** D6 dropped a disclosed candidate on `ENOENT`/`ENOTDIR` and continued teardown. A disclosed, unrecorded `wienerdog-dream.xml` deleted during the confirmation prompt therefore got **no unload**, while the registered Windows task survived — registration stores the command in the Task Scheduler database, the XML being only the import source (`schedule.js:416`, `schtasks /create … /xml <path> /f`). The core is then removed around a registered task. **No spawn was attempted, so `R-failed-unload` does not cover it** | A | HEAVY | **ACCEPTED, and fixed by removing the dependency rather than by aborting.** The raw recommendation was to *"stop core teardown with recovery metadata retained"*; that was **not** adopted, because it adds an abort site and leaves the unload conditioned on file state. Instead **phase D5a performs no filesystem check at all**: its input is the disclosed list, its argv is re-derived purely from `path.basename` by `deriveUnloadArgv` (verified: zero `fs.` uses in its body), and it unloads **every disclosed item unconditionally**. The act-time re-check moves entirely to **phase D5b**, where it governs **removal** only, with absence = nothing to remove |

### Why the file was never the right precondition — per platform

- **win32** — the XML is an *import source*; `schtasks /create /tn <task> /xml
  <path> /f` (`schedule.js:416`) copies it into the Task Scheduler store. Delete
  the XML and the task stays registered. This is the case the gate executed.
- **launchd** — a booted job remains loaded in the domain until it is booted out
  or the session ends, plist present or not.
- **systemd** — enablement is a symlink in `timers.target.wants/` plus the
  manager's loaded state; the unit file is neither. (`disable --now` against a
  missing unit file exits non-zero, which **D13** already covers as discarded.)

### The consent argument, re-derived

It holds, and it is now stated in two halves rather than one: for the **unload**
the acted set **equals** the disclosed set exactly — D5a acts on the disclosed
list and nothing else, in either direction; for the **removal** the acted set is
a **subset**, because D5b can only skip. Nothing outside the disclosed list is
ever unloaded or deleted.

### This removed an exception; it did not add one

D15 previously carried absence as a special case **at every site**, including at
act time where it could skip an unload. After round 9 the unload site resolves
nothing, so absence cannot arise there at all; absence survives only where it is
tautological — you cannot remove a file that is not there. **D15 now has exactly
one abort site, D9, in discovery.** Round 7 removed the "can only preserve"
carve-out for unloads; round 9 removes the last way an unload could be skipped,
which is what makes D5b's skip safe for a genuinely different reason than the one
round 7 falsified: a skip there forgoes a *deletion*, never an *unload*. Where
that leftover is a launchd plist it is Table R row **R9**'s class, and D5b prints
R9's plain-language warning at that moment.

### Convergence note, extended

Round 3 froze the shape, round 6 the resolution semantics, round 7 the last
carve-out inside them, round 8 exercised the named-residual branch — and **round
9 adds the sharpest invariant of the set: the unload phase is filesystem-free.**
What gets unloaded is fixed at disclosure and cannot be changed by any file
state, race, permission or error afterwards. A finding that proposes conditioning
an unload on something observable on disk is answered by pointing here.

## Round 10

Pending. Per the coordinator's standing instruction, a clean or LIGHT-only round
closes the gate.
