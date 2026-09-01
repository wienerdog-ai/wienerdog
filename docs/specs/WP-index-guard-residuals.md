---
id: WP-index-guard-residuals
title: Close the index guard's resolution frame, give the PRODUCING attribute its slot, and narrow the seam's coverage claim
status: Ready
model: opus
size: S
depends_on: [WP-show-slot-own-value-kind]
adrs: [ADR-0004, ADR-0031]
epic: dream-promotion
---

# WP-index-guard-residuals: close the guard's three measured residuals

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): the nightly **dream** run is a CLI process
that writes a commit into the user's vault and exits. Nothing here starts
anything.

The dream commits through a **private index** — `GIT_INDEX_FILE` pointed at a
file under `~/.wienerdog/state`, so the user's own git index is never touched
(`src/cli/dream.js:226-230`). A **test-side guard** enforces that: the pipeline
routes the git calls it makes through an injected seam (`opts.spawnGit`), and
`watchIndexWrites(vault)` in `tests/unit/dream-pipeline.test.js:179-246`
substitutes it and decides each invocation against a **pinned call set** of nine
shapes. Default-deny — an unknown shape is a violation. A shape declared
`private` must additionally carry a `GIT_INDEX_FILE` resolving to a path that is
**neither the user's index nor inside the user's working tree**.

**The set and that rule are DECIDED in one canonical cell** — row **W1(c)** of
`docs/specs/done/WP-dream-promote-in-workspace.md`, all of which sits on line
**541**: a single markdown table cell of ~46 KB. Its executable copy is
`tests/unit/dream-pipeline.known-calls.js`, whose whole source form is pinned by
`KNOWN_CALLS_SOURCE_DIGEST` in the guard file. **This WP changes no byte of that
module**, so nothing here re-pins the digest.

Three residuals of the guard were measured and ruled RIDES when the family
closed, and this package closes them: **(1)** the guard resolves a relative
`GIT_INDEX_FILE` in the wrong frame; **(2)** the producing attribute — which
shapes' stdout the own-value set learns from — is stated in the row as prose
instead of standing at its shape, which is the row's own rule; **(3)** two
comments in `src/cli/dream.js` and one in the guard claim the seam sees every
git call the run makes, and it does not. **No product behaviour changes.** The
guard may only NARROW: no shape is added, no slot widened, and the four failure
modes gain no fifth member.

## Current state

**Re-measured on `fc506110` (main, 2026-09-01) with git 2.39.5 (Apple Git-154)
and Node v25.9.0.** The machine's pinned git (`~/.wienerdog/state/exec-pins.json`
→ `/usr/bin/git`) is 2.39.5, while measurements already inside row W1(c) cite git
2.50.1 — so every measurement here states its version.

**The decision.** `classify(args, env)` (`tests/unit/dream-pipeline.test.js:196-208`)
returns `null` for an admitted call and a reason string otherwise. For a
`private` shape it resolves the override with `realish(gif)` (`:202`) and applies
the two clauses: `priv === userIndex` → *private index IS the user's index*;
`under(priv, vaultReal)` → *private index lies inside the user's working tree*.
`realish` (`:128-131`) realpaths the path, else its parent, else falls back to
`path.resolve(p)` — **every branch resolves in the NODE process's frame.**
`classify` never receives the invocation's `cwd`; the seam wrapper has it, and
the violation line prints `realish(raw)` (`:218-220`). Five call sites pass two
arguments (`:1589`, `:1602`, `:1617`, `:1624`, `:1629`), all in the index test.

**Item 1 — the two frames.** From an unrelated cwd,
`GIT_INDEX_FILE=rel.idx git -C <repo> read-tree HEAD` exits **0** and writes
`<repo>/rel.idx`; nothing appears at `<cwd>/rel.idx`. Node resolves the same
string the other way: with the process cwd at the repo checkout,
`realish('scratch.idx')` returns `<checkout>/scratch.idx`. **So a `private`
shape carrying a relative override that git would place INSIDE the vault is
admitted today** — the guard compares a path in its own frame, finds it outside
the vault, and returns `null`.

**And the frame git uses is the TOP OF THE WORKING TREE, not the `-C` directory
— which corrects the claim this WP was stubbed with.** With `-C <repo>/sub` the
same command wrote `<repo>/rel2.idx`, not `<repo>/sub/rel2.idx`. The two rules
coincide for every shape in the pinned set: each runs with `-C <vaultDir>`, and
the vault is the worktree top in all three fixture layouts. Table A carries the
consequence.

**Not producible by the shipped run — with the exception named rather than
rounded off.** `tmpIndex = path.join(o.stateDir, …)` (`src/cli/dream.js:226`);
`o.stateDir` is the property `stateDir: paths.state,` passed to
`commitNamedSet({…})` at `:1039`; and `paths.state` sits under
`core = assertSafeOverride('WIENERDOG_HOME', …) || path.join(home, '.wienerdog')`
(`src/core/paths.js:55`), where `assertSafeOverride` (`:21-31`) rejects a
non-absolute `WIENERDOG_HOME`. **`HOME` is deliberately NOT validated**
(`src/core/paths.js:7-10`) and is the one way in: measured,
`getPaths({ HOME: 'relhome' }).state === 'relhome/.wienerdog/state'`. A relative
`HOME` is not a supported configuration, but it is why Table A's row sentence
says *`$WIENERDOG_HOME`* rather than *by construction*. See Out of scope.

**Item 2 — the producing attribute has no slot-side home.** W1(c) writes each
slot's KIND at the slot (`«own …»` ↔ `RUN_VALUE`; any other guillemet token ↔
`ANY`) and each shape's disposition at the shape (`unset` / `private`), *"because
a kind stated once for a whole set is a kind that drifts one slot at a time"*.
PRODUCING is the one shape attribute that does not stand at its shape. It appears
in the cell only as prose, in the two sentences Table B moves:

- *"An own-value slot compares the token to values THIS RUN PRODUCED and the seam
  watched it produce — the head from `rev-parse HEAD`, a blob from `hash-object`,
  the tree from `write-tree`, the commit from `commit-tree`"* (the *"THE REPAIR
  DOES NOT INSPECT THE TOKEN"* clause). This is the sentence
  `WP-show-slot-own-value-kind` registered and deliberately left, handing the
  obligation here in as many words: *"that package lands C2's sharpened wording in
  W1(c) when it gives `produces` its slot-side representation"*
  (`docs/specs/done/WP-show-slot-own-value-kind.md:717`).
- *"…and the surface that OWNS this fact is the `produces: true` markers beside
  the set"* (the residual-closure clause) — which sends the reader to the
  executable copy for a fact the canonical row is supposed to decide.

The sharpened predicate **already stands once in the cell**, in clause **(1)** of
*"WHICH SLOTS TAKE THE PIN"*: *"an object name git itself emitted as the whole
stdout of one of this run's pinned PRODUCING shapes"*. Measured on line 541: the
literal `PRODUCING` occurs once, `**PRODUCING**` zero times.
`tests/unit/dream-pipeline.known-calls.js` carries `produces: true` four times.

**Item 3 — the coverage claim, in three comments.** `src/cli/dream.js:156-157`
(*"The run's ONE git seam … Every git invocation this pipeline makes goes through
here"*), `src/cli/dream.js:560` (*"The run's ONE git seam"*) and
`tests/unit/dream-pipeline.test.js:167-168` (*"Every git invocation the run makes
must match one of KNOWN_CALLS exactly"*). All three are false the same way, and
**W1(c) already states the true scope** in its *"COVERAGE — stated as a LIMIT,
never implied as a total"* clause: the seam is total over `src/cli/dream.js`, and
**two** git spawn points on the dream path are not on it —
`src/core/dream/validate.js`'s `git()` (`:64-65`, reached every run via
`assertGitRepo`, `src/cli/dream.js:587`) and `src/core/dream/promote.js`'s
`spawnGitForMerge` (`:311`; the pipeline's `promote({…})` at
`src/cli/dream.js:941` passes no `spawnGit`). That clause also **forecloses** the
stub's alternative in as many words, quoted byte-exactly because a reviewer greps
for it: *Do NOT "fix" this by forwarding the pipeline's seam into `promote()`*.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself (the status flip), package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/dream.js | **COMMENT TEXT ONLY, two sites:** the `gitIn` JSDoc at `:156-157` and the inline comment at `:560`, per **Table C** rows 1–2. **THIS CELL OWNS WHAT STAYS UNCHANGED in this file, and the acceptance criteria cite it: the diff contains no change to an executable line** |
| modify | tests/unit/dream-pipeline.test.js | **FOUR sites.** (a) `classify`'s private-index resolution, the violation line's resolved path and the `classify` call sites, per **Table A**; (b) the canary the acceptance criteria need, inside the index test's existing non-vacuity canary block; (c) the `watchIndexWrites` JSDoc at `:167-168` and (d) the `claim-2b-pipeline` comment at `:443-445`, per **Table C** rows 3–4. **THIS CELL OWNS WHAT STAYS UNCHANGED, and the acceptance criteria cite it rather than re-listing it: `shapeMatches`, the require, `KNOWN_CALLS_SOURCE_DIGEST`, the two disposition clauses, the four verdict strings (and no fifth is added) and every test title are unchanged** |
| modify | docs/specs/done/WP-dream-promote-in-workspace.md | **ROW W1(c) ONLY** — all of Table W is on line 541. Four edits, and the Mirrored Surface Checklist below owns the list: the pinned-set enumeration gains the markers and the preamble gains their definition; the *"THE REPAIR DOES NOT INSPECT THE TOKEN"* clause stops stating a membership rule of its own; the residual-closure clause's owning-surface sentence moves (all three **Table B**); the *"ONE MECHANICAL TRAP SURVIVES"* clause gains the frame sentence (**Table A**). **No other row, no other table, no frontmatter, and NOT that spec's own Mirrored Surface Checklist (`:548-1017`)** |

**NOT a deliverable, stated because it is the trap:**
`tests/unit/dream-pipeline.known-calls.js` is **not touched**. Its four
`produces: true` markers are already correct and the row is being brought to
them, not the reverse. Any byte change there would owe a digest re-pin in the
same commit; this WP has none, and its verification asserts the file is
byte-identical to `main`.

### Exact contracts — the marker literal

The row-side producing marker is this literal — the single place these bytes are
decided:

```text
marker: — **PRODUCING**
```

It is appended to a shape's entry in W1(c)'s pinned-set enumeration, after that
entry's call-site citation and before its terminating period. Worked example —
shape (2), today and after:

```text
**(2)** `unset` — `hash-object -w --stdin` (`:253`).
**(2)** `unset` — `hash-object -w --stdin` (`:253`) — **PRODUCING**.
```

## Contract reference

Activation (ADR-0031, 2-of-7): **(iv)** the guard's verdict for a `private` shape
carrying a relative override changes; **(vii)** the producing attribute and the
coverage claim each live in several mirrored surfaces.

**None of these takes a family table-letter.** W1(c) is and stays the canonical
decision surface; these are **change orders** deciding what moves and citing
W1(c) for the rest. On merge W1(c) carries these facts and this spec becomes
their history.

### Table A — the private-index resolution frame (item 1)

| Fact / rule | Value |
|---|---|
| What is resolved, and in what frame | a `private` shape's `GIT_INDEX_FILE`, BEFORE either clause of the two-clause rule is applied (the clauses themselves are unchanged), against the invocation's own `-C` directory — the `cwd` the seam received — never the checker's process cwd. An absolute value is unaffected: resolving it against any base returns it unchanged |
| Why that base, given git resolves against the WORKTREE TOP (Current state) | for every shape in the pinned set the two are the same directory. Where a future call's cwd sits BELOW the top, the guard's base is at or below git's, so its resolved path is too: a path git places inside the working tree the guard also places inside it, and the guard is **never more permissive** on that clause. It could name the other private-index verdict for a relative value landing exactly on the user's index — a stated limit, not a gap |
| Verdict set | **unchanged — the four failure modes gain no fifth member**, which W1(c) states in as many words and this WP does not reopen. A relative override git would place inside the vault lands on the existing *private index lies inside the user's working tree* |
| No hidden second frame | every caller of the decision — the seam wrapper and the five canary sites the Mirrored Surface Checklist enumerates — supplies the invocation's cwd. **A default standing in for a missing one is forbidden:** it is a second, invisible frame, and a canary run under it proves nothing about the frame it claims to test |
| The red's resolved path | the violation line prints the SAME resolved path the verdict used (W1(c) already requires *"where it resolved"*) |
| The row sentence this adds | the *"ONE MECHANICAL TRAP SURVIVES"* clause — already the canonical home of *"`GIT_INDEX_FILE` must be RESOLVED, not merely present"* — gains the frame, the measurement above with its git version, and that the shipped run cannot produce it because `$WIENERDOG_HOME` is forced absolute by `assertSafeOverride`. **It may not claim "absolute by construction"**: Current state measures the `HOME` exception |

### Table B — the PRODUCING attribute and the membership predicate (item 2)

| Fact / rule | Value |
|---|---|
| Where the attribute is DECIDED | at the shape, in W1(c)'s pinned-set enumeration, spelled with the `marker:` literal under "Exact contracts" |
| Which shapes carry it | **exactly the shapes whose entry in `tests/unit/dream-pipeline.known-calls.js` carries `produces: true`, and no others.** This spec states no list and no count: the module is not edited, so the mapping is read off it |
| Executable mirror | that module's `produces: true` property. The pair is registered below and moves together, exactly as `«own …»` ↔ `RUN_VALUE` already does |
| What enforces the pair, stated at what it actually reaches | the count check in Verification steps is a **tripwire, not a proof of identity**: it catches a marker added or dropped on one side only, and says nothing about WHICH shapes carry it. Identity is the reviewer's shape-by-shape comparison of the row against the module — which is already this pair's enforcement, W1(c)'s registration having recorded that **no grep reaches a slot-kind drift** |
| Preamble sentence | the set's preamble — which defines the guillemet kinds and ends *"The disposition is part of the shape, not a side condition."* — gains the marker's definition in the same place and form: a marked shape is one whose whole stdout the own-value set learns from, its executable spelling is `produces: true`, and the two copies must agree shape by shape |
| Membership predicate's home | **unchanged — clause (1) of "WHICH SLOTS TAKE THE PIN"**, which spells it and whose own sentence already declares itself a citation of it. This WP does not re-edit that clause |
| The REPAIR clause | stops stating a membership rule of its own: the sentence quoted in Current state is replaced by one that defers — the token is compared to the own-value set, whose membership is clause (1)'s predicate and whose sources are the shapes the set marks with the marker. Everything else in that clause stays: that the repair inspects nothing, that it asks set membership, the owner's ground quote, and the ordering paragraph |
| The closure clause | its *"the surface that OWNS this fact is the `produces: true` markers beside the set"* moves: the owning surface is the row's markers, with the module's property as the executable mirror. **The no-count rule stands and is not weakened** — neither the row nor any prose surface states a count of sources again |
| Registered NON-move, inside the same cell | the closure clause's *"THE REMEDY THAT CLAUSE SPECIFIED — … which is (2), (5), (7) and (8), excluding (1) and (4) — SHIPPED AT `b19121bb`"*. It is a SHA-pinned, past-tense record of what a ruling specified — the form this row grants and its retirement discipline requires. It stays legible as history and is **not** reworded into a statement of the live set |

### Table C — what each surface may claim about the seam's coverage (item 3)

| # | Surface | Required content |
|---|---|---|
| 1 | `src/cli/dream.js:156-157` (`gitIn`'s JSDoc) | the SCOPE: the seam is total over `src/cli/dream.js`, and is **not** total over the dream path. **It cites row W1(c)'s COVERAGE clause and does not restate it** — it may not list the spawn points outside the seam, name their files, or re-argue why they stay; the row owns that list, and a second copy is what this WP is closing. The rest of the JSDoc (why a source grep cannot discriminate, the `@param` block) is unchanged |
| 2 | `src/cli/dream.js:560` | may not claim the run has only one git seam; it names this file's seam and defers to `gitIn` for the scope |
| 3 | `tests/unit/dream-pipeline.test.js:167-168` | *"Every git invocation the run makes must match one of KNOWN_CALLS exactly"* becomes the row's own wording — the invocations **the seam observes**. Nothing else in that JSDoc moves |
| 4 | `tests/unit/dream-pipeline.test.js:443-445` | one sentence on what this test's evidence REACHES — the calls arriving through the injected `opts.spawnGit` — citing W1(c)'s COVERAGE clause for the limit rather than restating it |
| 5 | `tests/unit/dream-pipeline.test.js:436` (the test TITLE) | **REGISTERED NON-MOVE, decided rather than left open.** Three reasons: the title is pinned as a `--test-name-pattern` argument by `docs/specs/done/WP-dream-promote-in-workspace.md:1454`, so renaming it silently breaks a committed command; the *product-wide* claim is **CLAIM 2b's**, owned by that spec's acceptance criterion (`:1114`), not by row W1; and it is asserted at **two** scopes, the second being `claim-2b-merge-cwd` (`tests/unit/dream-promote.test.js:886`), which covers promote's share. Row 4's comment narrows this test's evidence claim; the name stays |

### Mirrored Surface Checklist

**The tree surfaces below** — the prose and code each table's facts appear in —
were found by the sweep in Verification steps; that command owns the patterns and
this section does not restate them. Re-run it after editing: a hit that is neither
corrected text nor a named non-move here is unfinished work.
**The in-spec surfaces** — the acceptance criteria that assert each table's facts
and the verification commands that check them — are registered beside them, so a
review finding moves the table and all its mirrors in one pass. They are located
by criterion number and by each verification block's own comment header, which are
stable where line ranges are not; the sweep does not and cannot find them.

**Table A:**

- [ ] `tests/unit/dream-pipeline.test.js:196-208` — the decision itself
- [ ] `tests/unit/dream-pipeline.test.js:218-220` — the violation line's resolved path
- [ ] `tests/unit/dream-pipeline.test.js:1589`, `:1602`, `:1617`, `:1624`, `:1629` — the five `classify` call sites, each of which must supply the frame
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — the *"ONE MECHANICAL TRAP SURVIVES"* clause, which gains the frame sentence
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — the two-clause private-index rule (*"must RESOLVE (symlinks and `..` included)"*): **registered NON-move**. The clauses do not change; only the frame they are applied in is stated
- [ ] **Acceptance criteria 1, 2, 3 and 4** — they assert this table's frame, its accept side, the no-hidden-default rule, and (through the Deliverables cell they cite) the unchanged verdict set
- [ ] **Verification steps: the guard-file suite run and criterion 1's applied mutation.** Registered with what it reaches: **no grep can check a resolution frame**, so this table's only check is the RED/GREEN pair criterion 1 requires. If Table A's frame changes, that pair is what changes with it

**Table B:**

- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — the pinned-set enumeration (markers) and its preamble (their definition)
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — the *"THE REPAIR DOES NOT INSPECT THE TOKEN"* clause
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — the residual-closure clause's owning-surface sentence
- [ ] `tests/unit/dream-pipeline.known-calls.js` — the `produces: true` properties, **the executable half of the new pair. NOT edited**, and asserted byte-untouched in Verification steps
- [ ] `tests/unit/dream-pipeline.test.js:226-238` — the `produces` recorder comment. **Registered NON-move:** `WP-show-slot-own-value-kind` rewrote it to the sharpened predicate one day earlier and it is already correct. Re-read it; do not edit it
- [ ] `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md:356-366` — the same *PRODUCED* phrasing. **Registered NON-move**, already ruled so by `WP-show-slot-own-value-kind`'s C2 checklist: a dated narrative of that day's ruling, not a mirror of the live contract
- [ ] `docs/specs/done/WP-show-slot-own-value-kind.md` and **this spec** — both quote the pre-change wording on purpose, as a record and a change order must, and those quotations stay true as history. Excluded from the sweep for that reason and no other
- [ ] **Acceptance criterion 5** — it asserts every fact in this table, including the two this table's rows call non-negotiable: the no-count rule and the unreworded historical sentence
- [ ] **Verification steps: the `Criterion 5 — the row/module PRODUCING pair AGREES` block**, the `Criterion 5 — the loose wording is gone from Table W` guarded negated grep, and the `Criterion 4 — the module is untouched` diff gate, which is what holds the pair's executable half still while the row moves. The pair block asserts a count equality and states no number itself, which is this table's no-count row applied to its own check

**Table C:**

- [ ] `src/cli/dream.js:156-157` and `:560`
- [ ] `tests/unit/dream-pipeline.test.js:167-168` and `:443-445`
- [ ] `tests/unit/dream-pipeline.test.js:436` — the title, **registered NON-move** (Table C row 5)
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:1114` and `:1454` — CLAIM 2b's acceptance criterion and the command pinning the test name. **Registered NON-moves**, and the reason row 5 gives for not renaming
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — the COVERAGE clause. **Registered NON-move:** it is what the three comments cite, and it is already correct
- [ ] **Acceptance criterion 7** — it asserts that none of the three false universals survives, that each replacement cites rather than restates, and that both Deliverables cells' unchanged lists hold (it cites those cells rather than re-listing the title and the executable lines)
- [ ] **Verification steps: the claim-sweep block and its measured baseline paragraph.** The baseline names the expected hit for every pattern, so this table's registered non-moves (the two `product code invokes git` hits) are checked as UNCHANGED rather than merely tolerated

## Implementation notes & constraints

- **Zero new dependencies; plain Node ≥ 18; no build step; nothing that outlives
  its job (ADR-0004).** The whole change is one resolution base, four comment
  edits and one markdown cell.
- **`opus` is the recommended tier for one reason: row W1(c).** The code change is
  small and mechanical; the delicate work is editing four clauses inside a single
  46 KB cell without falsifying a fifth.
- **After rewriting the cell, RE-READ IT WHOLE.** No mirror checklist can see
  inside one cell, and the failure mode is the new sentence landing while the old
  one stays — the paid-for lesson of the predecessor package and the likeliest way
  this WP ships broken. Read it with
  `sed -n '541p' docs/specs/done/WP-dream-promote-in-workspace.md | fold -s -w 180`.
- **The set does not change.** No shape added, removed or reordered; no slot
  changes kind; no literal moves; `shapeMatches` untouched; the module untouched,
  so `KNOWN_CALLS_SOURCE_DIGEST` is not re-pinned.
- **`docs/specs/done/` is NOT always-allowed** — `scripts/boundary-check.js`
  admits only `package-lock.json`, `memory/lessons/inbox.md`,
  `docs/specs/logbook/` and this spec without listing.
- **`grep` on the maintainer's machine is `ugrep` 7.8.4**, and BSD/GNU/ugrep
  disagree about `-c` on a one-line file. The verification steps therefore count
  with `grep -oF -- … | wc -l` and put `--` before every fixed pattern. Do not
  simplify them back to `-c`.
- **Ambiguity → the simpler option, recorded under "Decisions made" in the PR
  body.** Do not expand scope to resolve it.

### Rejected options, recorded so they are not re-proposed

| Option | Why rejected |
|---|---|
| **Assert that a `private` `GIT_INDEX_FILE` is ABSOLUTE and reject a relative one on its form** | It is a FIFTH failure mode. W1(c) states the four *"gain no fifth member"*, so this is a change to the canonical row's contract and the owner's to rule, not this package's to take. It is also the weaker fix: resolving in git's frame keeps the verdict truthful about where the write would land, which is what the two-clause rule is about |
| **Closing either un-seamed spawn point** — routing `promote()`'s `merge-file` through the pipeline's seam (the stub's alternative for item 3), or threading it into `assertGitRepo` | Both are foreclosed by W1(c)'s COVERAGE clause in as many words. The seams have incompatible cwd conventions — `spawnGitPinned` passes the directory as `-C <cwd>` and sets no process cwd, which would destroy the property promote's out-of-workspace assertion guarantees — and under default-deny either close surfaces an unpinned TENTH shape, whose admission is an addition to the pinned set and therefore a change to the canonical table. W1(c) records the election to leave both |
| **Deleting the closure clause's historical enumeration of the remedy's shapes** | Table B's last row. Table W records every retirement with its cause; deletion loses the finding twice |

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no untrusted identifier
      reaches a filesystem path or a shell command here.** This WP adds no path or
      command construction to `src/`; its only `src/` change is comment text.
- [ ] **The one security-relevant property: the guard's decision may only
      narrow.** The `unset` arm is untouched (a `GIT_INDEX_FILE` present on an
      `unset` shape is still a violation whatever it resolves to); the `private`
      arm applies the same two clauses to a path resolved in git's frame, which is
      at or below the previously-compared path (Table A) and therefore never
      admits more. No shape, disposition or slot is widened.

## Acceptance criteria

- [ ] 1. **Table A's frame is enforced, with an observed RED against a
      deliberately broken state.** A `private` shape carrying a relative
      `GIT_INDEX_FILE` that git would place inside the vault is verdicted *private
      index lies inside the user's working tree*; with the resolution base
      reverted to the checker's frame the same vector is ADMITTED. Both states are
      observed and pasted. The vector's arity matches a pinned shape's, so it
      reaches the clause under test instead of dying on length equality.
- [ ] 2. **The accept side stays alive in both states:** the run's legitimate
      absolute private index is still admitted, and the whole index test — all
      three vault layouts — is green with `violations` empty. A guard that
      rejected everything would satisfy criterion 1 alone.
- [ ] 3. No `classify` call site relies on a default frame, and the violation line
      prints the same resolved path the verdict used (Table A).
- [ ] 4. **Nothing outside the edited sites moved.** Everything the Deliverables
      cell for `tests/unit/dream-pipeline.test.js` names as unchanged is
      unchanged — that cell owns the list and this criterion does not re-state it
      — and `tests/unit/dream-pipeline.known-calls.js` is byte-identical to
      `main`, so no shape, slot kind or literal moved and no re-pin is owed.
- [ ] 5. **Table B has landed in W1(c):** every shape whose module entry carries
      `produces: true` carries the marker and no other shape does; the preamble
      defines it; the REPAIR clause states no membership rule of its own and the
      phrase *"values THIS RUN PRODUCED"* is gone from that cell; the closure
      clause names the row's markers as the owning surface; **no surface states a
      count of own-value sources**; and the SHA-pinned historical sentence naming
      what the remedy specified at `b19121bb` is still there, unreworded.
- [ ] 6. **The whole cell was re-read after the rewrite** and carries no sentence
      the rewrite falsified. Say in the PR body that the re-read happened and what
      it found — including "nothing".
- [ ] 7. **Table C has landed:** none of the three false universals survives, each
      replacement cites W1(c) rather than restating it, and both Deliverables
      cells' unchanged lists hold — those cells own them, and this criterion does
      not re-state them.
- [ ] 8. The sweep is re-run over the whole tree and every hit is corrected text or
      a registered non-move. Paste its output.
- [ ] 9. `npm test` and `npm run lint` pass; `boundary-check` is clean.
- [ ] 10. Idempotency: `N/A — this WP ships no command and writes nothing outside
      the repository.`

## Verification steps (run these; paste output in the PR)

```bash
# The guard's own file, then the whole suite and the lint pipeline. Capture the
# exit code as its own statement, never behind a pipe.
npm test -- tests/unit/dream-pipeline.test.js
echo "guard-file suite exit=$?"
npm test
npm run lint

# Criterion 4 — the module is untouched, so no digest re-pin is owed.
git diff --quiet main -- tests/unit/dream-pipeline.known-calls.js \
  && echo "known-calls module byte-identical to main"

# Criterion 5 — the row/module PRODUCING pair AGREES, asserted without either
# side stating a number. Row W1(c) is located by its row key, not by a line
# number that moves (measured: `| W1 |` matches exactly one line).
row=$(grep -F -- '| W1 |' docs/specs/done/WP-dream-promote-in-workspace.md \
        | grep -oF -- '— **PRODUCING**' | wc -l | tr -d ' ')
mod=$(grep -oF -- 'produces: true' tests/unit/dream-pipeline.known-calls.js \
        | wc -l | tr -d ' ')
test "$row" = "$mod" && test "$row" -gt 0 \
  && echo "PRODUCING pair agrees on $row shapes"

# Criterion 5 — the loose wording is gone from Table W. GUARDED: a bare negated
# grep passes hardest when the file is absent.
test -f docs/specs/done/WP-dream-promote-in-workspace.md \
  && ! grep -qF -- 'values THIS RUN PRODUCED' docs/specs/done/WP-dream-promote-in-workspace.md \
  && echo "the loose PRODUCED wording is gone from Table W"

# Criteria 7 and 8 — the claim sweep, whitespace-flattened so a hard wrap cannot
# hide a hit, ONE PATTERN PER PASS as fixed literals (an alternation with context
# windows matches non-overlapping and swallows adjacent hits). EXCLUDED, and
# nothing else is: this spec and the predecessor spec, which quote the pre-change
# wording on purpose.
PATTERNS=('Every git invocation this pipeline makes' "The run's ONE git seam" \
          'Every git invocation the run' 'product code invokes git' \
          'values THIS RUN PRODUCED')
for f in $(git ls-files '*.md' '*.js' | grep -v node_modules \
             | grep -v WP-index-guard-residuals \
             | grep -v WP-show-slot-own-value-kind); do
  flat=$(tr '\n' ' ' < "$f" | tr -s ' ')
  for p in "${PATTERNS[@]}"; do
    n=$(printf '%s' "$flat" | grep -oF -- "$p" | wc -l | tr -d ' ')
    if [ "$n" -gt 0 ]; then printf '%s :: %s :: %s\n' "$f" "$p" "$n"; fi
  done
done

# The permission boundary. Run on the IMPLEMENTATION branch, whose diff is this
# WP's own.
node scripts/boundary-check.js docs/specs/WP-index-guard-residuals.md \
  $(git diff --name-only main...HEAD)
```

**The sweep's baseline, measured on `fc506110` so the deltas are checkable.**
`Every git invocation this pipeline makes` → `src/cli/dream.js` 1;
`The run's ONE git seam` → `src/cli/dream.js` 2;
`Every git invocation the run` → `tests/unit/dream-pipeline.test.js` 1;
`product code invokes git` → `tests/unit/dream-pipeline.test.js` 1 and
`docs/specs/done/WP-dream-promote-in-workspace.md` 1;
`values THIS RUN PRODUCED` → `docs/specs/done/WP-dream-promote-in-workspace.md` 1
and `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md` 1.
**After this WP the first three, and the Table W hit of the last, must be ZERO**;
the `product code invokes git` hits and the logbook hit are the registered
non-moves in the Mirrored Surface Checklist and must be UNCHANGED.

**Both directions are required for the three NEW assertions** — the module-diff
gate, the PRODUCING pair check and the guarded negated grep. Paste a real green on
the finished state AND a real red from a deliberately broken one for each: a byte
added to the module; one marker removed from the row, and separately one added to
a shape the module does not mark; the loose sentence left standing. Observe the
negated grep's ABSENT case too — with the file moved aside it must go RED, not
green.

## Out of scope (do NOT do these)

- **Any change to `src/` beyond comment text.** The private index's construction,
  `assertSafeOverride` and `HOME` validation are untouched.
- **Discovered while measuring, reported and NOT fixed — each goes under
  "Discovered issues" in the PR body.** (a) `src/core/paths.js` does not validate
  `HOME`, so a relative `HOME` yields a relative `paths.state` and therefore a
  relative `GIT_INDEX_FILE` (measured:
  `getPaths({ HOME: 'relhome' }).state === 'relhome/.wienerdog/state'`) — a
  product-side question about an unsupported configuration, not a guard question.
  (b) `docs/specs/done/WP-dream-promote-in-workspace.md:673` still registers the
  executable copy of the pinned set as `KNOWN_CALLS` in
  `tests/unit/dream-pipeline.test.js`; it moved to
  `tests/unit/dream-pipeline.known-calls.js` on 2026-09-01 and row W1(c) already
  says so. That is that spec's own Mirrored Surface Checklist, which this WP's
  Deliverables exclude by name.
- **The family's other queued follow-ups, none of which rides here:** the
  predecessor spec's canonical module block as an unregistered third copy of the
  set; W1(c)'s missing nine-slot adjudication; row W5's three dead `5c5d082` SHAs
  (correct: `c853245b`); and `src/core/dream/warnings.js:63-66`'s
  known-falsified-by-design JSDoc.
- **Re-opening any W1(c) ruling this WP cites:** the hook narrowing and its
  residual, the retirement of intent-classification, the election to leave
  `validate.js`'s spawn point un-seamed, or promote's exclusion by scope.
- **Adding a fifth failure mode, a third placeholder kind, a tenth shape, or any
  tolerance in `shapeMatches`.**

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   criterion 1's RED, the both-directions evidence for the three new assertions,
   and the sweep of criterion 8.
2. Conventional commits; PR titled
   `test(dream): close the guard's resolution frame and give PRODUCING its slot (WP-index-guard-residuals)`.
3. PR template filled, including "Decisions made" (or "none"), `Generated-by:`,
   and "Discovered issues" carrying the two items named in Out of scope.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
