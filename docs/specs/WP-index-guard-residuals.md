---
id: WP-index-guard-residuals
title: Refuse to judge a relative private index, give the PRODUCING attribute its slot, and narrow the seam's coverage claim
status: In-Review
model: opus
size: S
depends_on: [WP-show-slot-own-value-kind]
adrs: [ADR-0004, ADR-0031]
epic: dream-promotion
---

# WP-index-guard-residuals: close the guard's three measured residuals

## Dispatch precondition

**ONE OWNER RATIFICATION, and it blocks dispatch.** Item 1 is closed by
**refusing to judge** a non-absolute `private` `GIT_INDEX_FILE`: the decision
returns an UNJUDGED state and the seam wrapper raises a harness ERROR carrying
the invocation, instead of returning a verdict (Table A). The owner ratifies one
thing — **that a refusal is not a fifth failure mode**. The four verdict strings
are W1(c)'s contract and *"gain no fifth member"*; this design adds none,
declining to decide rather than deciding a new way, which is the category an
assertion failure is already in.

**Why a refusal rather than a third attempt at the frame:** two rounds produced
two answers and measurement falsified both (Current state). Modeling the frame is
unclosable; refusing to model it is closed by construction, and costs nothing the
run uses (Table A).

**If the owner rules the other way, this WP RETURNS TO DESIGN — there is no
branch to switch to, and saying otherwise would be the false comfort this family
has paid for before.** Rejected options records design **(A)**, the out-of-band
effective-path locator, as the STARTING POINT for that redesign, with the
measurements already taken. What (A) would then have to cover, none of which is
written: the W1(c) sentences a locator contradicts — *"there is no question here
about which repository a call reaches or which index it would write"* and the
retirement of *"asking git which repository an invocation reaches"* — and how
each is re-scoped to separate a retired argv classifier from a permitted path
locator; where the locator runs, given the decision has no `cwd` and `classify`'s
signature is frozen (the seam wrapper is the only site holding cwd, args and env
together); what a locator FAILURE means (harness error, on the same ground as the
refusal); how the invocation's whole environment is replayed, without which the
locator answers a different question than the invocation asks; and the RED/GREEN
evidence replacing criterion 1's. **That is a spec revision, not a flag flip.**

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): the nightly **dream** run is a CLI process
that writes a commit into the user's vault and exits. Nothing here starts
anything.

The dream commits through a **private index** — `GIT_INDEX_FILE` pointed at a
file under `~/.wienerdog/state`, so the user's own git index is never touched
(`src/cli/dream.js:226-230`). A **test-side guard** enforces that: the pipeline
routes the git calls it makes through an injected seam (`opts.spawnGit`), and
`watchIndexWrites(vault)` (`tests/unit/dream-pipeline.test.js:179-246`)
substitutes it and decides each invocation against a **pinned call set** of nine
shapes. Default-deny — an unknown shape is a violation. A `private` shape must
additionally carry a `GIT_INDEX_FILE` resolving to a path that is **neither the
user's index nor inside the user's working tree**. That set and that rule are
DECIDED in **row W1(c)** of
`docs/specs/done/WP-dream-promote-in-workspace.md` — one ~46 KB markdown table
cell, all of it on line **541** — whose executable copy is
`tests/unit/dream-pipeline.known-calls.js`, pinned whole by
`KNOWN_CALLS_SOURCE_DIGEST` in the guard file. **This WP changes no byte of that
module**, so nothing here re-pins the digest.

Three residuals measured when the family closed are what this package closes:
**(1)** the guard resolves a relative `GIT_INDEX_FILE` in a frame that is not
git's; **(2)** the producing attribute — which shapes' stdout the own-value set
learns from — is stated in the row as prose instead of standing at its shape,
which is the row's own rule; **(3)** four surfaces claim the seam sees every git
call the run makes, and it does not. **No product behaviour changes**; the only
`src/` change is comment text.

## Current state

**Re-measured on `fc506110` (main) with git 2.39.5 (Apple Git-154) and Node
v25.9.0.** The machine's pinned git is 2.39.5 while measurements already inside
W1(c) cite 2.50.1, so every measurement here states its version.

**The decision.** `classify(args, env)`
(`tests/unit/dream-pipeline.test.js:196-208`) returns `null` for an admitted call
and a reason string otherwise. For a `private` shape it resolves the override with
`realish(gif)` (`:202`), then applies two clauses: `priv === userIndex` → *private
index IS the user's index*; `under(priv, vaultReal)` → *private index lies inside
the user's working tree*. `realish` (`:128-131`) realpaths the path, else its
parent, else `path.resolve(p)` — **every branch resolves in the NODE process's
frame**, which is nothing to do with git's.

**Item 1 — the gap, then the measurements that killed every candidate frame.
PROVENANCE for Table A's design (model no frame), not rules this WP implements;
the round records hold the transcripts.** All git 2.39.5.

- **The gap:** `GIT_INDEX_FILE=rel.idx git -C <repo> read-tree HEAD` from an
  unrelated cwd writes `<repo>/rel.idx`, while `realish('rel.idx')` returns
  `<node cwd>/rel.idx` — a relative override git places inside the vault is
  admitted today.
- **Frame 1, the `-C` directory — falsified:** with `-C <repo>/sub`, all three
  private shapes (`read-tree`, `update-index`, `write-tree`) wrote to the
  worktree top instead.
- **Frame 2, the worktree top — falsified twice:** through `top/link → top/inner`
  git wrote INSIDE the tree where a `-C`-frame guard realpaths outside it, so no
  base bounds another once symlinks and `..` are in play; and with
  `GIT_DIR`/`GIT_WORK_TREE` set, `rev-parse --show-toplevel` printed
  `/private/tmp` and `read-tree`'s lock path confirmed git resolved against it —
  **a locator that does not replay the invocation's whole environment gets a
  different answer than the invocation.**

**Not producible by the shipped run, with the exception named rather than rounded
off.** The run's `GIT_INDEX_FILE` is `tmpIndex` (`src/cli/dream.js:226`), built on
`paths.state`, which sits under `$WIENERDOG_HOME` — forced absolute by
`assertSafeOverride` (`src/core/paths.js:21-31`) — or under `HOME`. **`HOME` is
deliberately NOT validated** (`src/core/paths.js:7-10`) and is the one way in:
measured, `getPaths({ HOME: 'relhome' }).state === 'relhome/.wienerdog/state'`.
That is why every sentence about this says *under every supported configuration*
rather than *by construction*.

**Item 2 — the producing attribute has no slot-side home.** W1(c) writes each
slot's KIND at the slot (`«own …»` ↔ `RUN_VALUE`; any other guillemet token ↔
`ANY`) and each shape's disposition at the shape, *"because a kind stated once
for a whole set is a kind that drifts one slot at a time"*. PRODUCING is the one
shape attribute that does not stand at its shape: three sentences carry it as
prose, and Table B moves all three.

- the *"THE REPAIR DOES NOT INSPECT THE TOKEN"* clause — *"values THIS RUN
  PRODUCED and the seam watched it produce — the head from `rev-parse HEAD`, a
  blob from `hash-object`, …"*; and the closure clause's *"the surface that OWNS
  this fact is the `produces: true` markers beside the set"*. **These two are the
  obligation the predecessor handed here** — *"that package lands C2's sharpened
  wording in W1(c) when it gives `produces` its slot-side representation"*
  (`docs/specs/done/WP-show-slot-own-value-kind.md:717`).
- the ORDERING paragraph's *"every object name the run passes was computed by an
  EARLIER pinned read"*. **Found by review after this table's first draft had
  moved the other two**, and false twice over: `rev-parse HEAD` READS the head
  back from the user's ref, and `hash-object -w`, `write-tree` and `commit-tree`
  are not reads — besides using COMPUTED, the shorthand the predecessor banned
  from this cell.

The sharpened predicate **already stands once in the cell**, in clause **(1)** of
*"WHICH SLOTS TAKE THE PIN"*. Measured at `fc506110`: `**PRODUCING**` occurs
nowhere on line 541, and the module carries `produces: true` on some of its nine
entries — **which ones is derived by the work, not predicted here**.

**Item 3 — the coverage claim, in four surfaces:** `src/cli/dream.js:156-157`
(*"Every git invocation this pipeline makes goes through here"*), `:560` (*"The
run's ONE git seam"*), `tests/unit/dream-pipeline.test.js:167-168` (*"Every git
invocation the run makes must match one of KNOWN_CALLS exactly"*), and — the only
one that is contract text — row W1(c)'s clause (a), *"its own git invocations —
every one of them through the seam of (c) — and its own file writes"*.

**W1(c) already states the true scope and OWNS it**: its *"COVERAGE — stated as a
LIMIT, never implied as a total"* clause holds the seam total over
`src/cli/dream.js`, names the two spawn points on the dream path that are not on
it, and rules that they stay. **That list is deliberately not copied here** —
Table C forbids the rewrites from restating it, and a copy in this spec is the
first place one would be copied from; read it in the cell. Two things about it
are load-bearing: clause (c)(i) names one of those invocations as IN SCOPE, which
falsifies clause (a)'s parenthetical three clauses earlier, and the clause
forecloses the stub's alternative in as many words — *Do NOT "fix" this by
forwarding the pipeline's seam into `promote()`*.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself (the status flip), package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/dream.js | **COMMENT TEXT ONLY, two sites:** the `gitIn` JSDoc at `:156-157` and the inline comment at `:560`, per **Table C** rows 1–2. **This cell owns what stays unchanged in this file: the diff contains no change to an executable line** |
| modify | tests/unit/dream-pipeline.test.js | **SIX sites.** (a) the `private` arm of `classify` (`:196-208`), which returns the UNJUDGED state, and (b) the seam wrapper (`:209-231`), which raises on it with the full invocation — both per **Table A**; (c) the canaries the acceptance criteria need, inside the index test's existing non-vacuity canary block; (d) the `watchIndexWrites` JSDoc at `:167-168`; (e) the `claim-2b-pipeline` comment at `:443-445`; (f) that test's TITLE at `:436` — (d)–(f) per **Table C** rows 3–5. **THIS CELL OWNS WHAT STAYS UNCHANGED, and the acceptance criteria cite it rather than re-listing it: `shapeMatches`, `realish`, `classify`'s SIGNATURE and its five call sites, the require, `KNOWN_CALLS_SOURCE_DIGEST`, the two disposition clauses, the four verdict strings (and no fifth is added) and every test title EXCEPT `:436`'s are unchanged — and that one keeps its `claim-2b-pipeline` token, which is what the pinned `--test-name-pattern` command selects on** |
| modify | docs/specs/done/WP-dream-promote-in-workspace.md | **ROW W1(c) ONLY** — all of Table W is on line 541. **SEVEN edits, and the Mirrored Surface Checklist owns the list:** the pinned-set enumeration gains the **PRODUCING** markers and the preamble gains their definition; the *"THE REPAIR DOES NOT INSPECT THE TOKEN"* clause and the ORDERING paragraph each stop stating a rule of their own; the residual-closure clause's owning-surface sentence moves (all four **Table B**); the *"ONE MECHANICAL TRAP SURVIVES"* clause gains the absoluteness sentence and the *"EVERY RED CARRIES ITS INVOCATION"* sentence is scoped to verdict reds with the refusal's diagnostic defined beside it (both **Table A**); and clause (a) SCOPE's seam parenthetical is narrowed (**Table C** row 0). **No other row, no other table, no frontmatter, and NOT that spec's own Mirrored Surface Checklist (`:548-1017`)** |

**NOT a deliverable, stated because it is the trap:**
`tests/unit/dream-pipeline.known-calls.js` is **not touched**. Its `produces`
markers are already correct and the row is being brought to them, not the
reverse. Any byte change there would owe a digest re-pin in the same commit; this
WP has none, and its verification asserts the file is byte-identical to `main`.

### Exact contracts — the marker literal

The row-side producing marker is this literal — the single place these bytes are
decided. It is appended to a shape's entry in W1(c)'s pinned-set enumeration,
after that entry's call-site citation and before its terminating period. The
example is deliberately SCHEMATIC: which real shapes carry it is derived from the
module (Table B), never fixed by an example here.

```text
marker: — **PRODUCING**
shape entry, before and after:
**(n)** `<disposition>` — `<verb …>` (`:<line>`).
**(n)** `<disposition>` — `<verb …>` (`:<line>`) — **PRODUCING**.
```

## Contract reference

Activation (ADR-0031, 2-of-7): **(iv)** the guard's outcome for a `private` shape
carrying a non-absolute override changes; **(vii)** the producing attribute and
the coverage claim each live in several mirrored surfaces.

**None of these takes a family table-letter.** W1(c) is and stays the canonical
decision surface; these are **change orders** deciding what moves and citing
W1(c) for the rest.

### Table A — which private-index values this guard will judge (item 1)

| Fact / rule | Value |
|---|---|
| What is judged | a `private` shape's `GIT_INDEX_FILE` **only when it is an absolute path**. The two clauses then apply to its resolved (realpath) form exactly as today — they are unchanged, and so is `realish` |
| A non-absolute value | is **REFUSED, not judged.** The decision returns a distinguishable **UNJUDGED** state instead of applying either clause, and **the seam wrapper raises on it** — a harness ERROR, **not a verdict and not a fifth failure mode** (the Dispatch precondition's single ratification) |
| Where each half lives, and why it is split | the DECISION stays in `classify`, which already matches the shape and already holds `env` — **so no second matching site is created**, which is the drift class this family fights. The RAISE is in the seam wrapper (`tests/unit/dream-pipeline.test.js:209-231`), which is the only place holding `args`, `cwd` and `env` together. **`classify`'s signature and its five call sites are unchanged**: the return domain gains one state, and every existing call site passes an absolute or absent value |
| The refusal's diagnostic | the raise carries **the full `args`, the `cwd`, the RAW `GIT_INDEX_FILE` value, and the UNJUDGED state** — and it reports **no resolved path, because none is computed**. W1(c)'s *"AND EVERY RED CARRIES ITS INVOCATION … and where it resolved"* is a universal over VERDICT reds; this WP scopes it to those and defines the refusal's diagnostic beside it, so the sentence stays true rather than being quietly falsified by an outcome that resolves nothing |
| Scope of the refusal — `private` only | an `unset` shape arriving with a non-absolute `GIT_INDEX_FILE` keeps its existing verdict (*known shape carrying an unexpected `GIT_INDEX_FILE`*). **Refusing every non-absolute value before `classify` was weighed and rejected**: it is simpler, but it converts an existing verdict into an error for a case this WP is not about, and makes that verdict unreachable for a subclass |
| Why refusal rather than resolution | **no frame is modeled, so none can be wrong.** Two rounds produced two frames and measurement falsified both; a third measurement showed the answer also depends on the invocation's environment (Current state). Same closable direction the pinned set itself takes: enumerate our own good — absolute paths — rather than model git's grammar |
| What W1(c) keeps as a result | its sentences that **nothing asks git which repository an invocation reaches, and no question arises about which index a call would write, stay TRUE**: this design adds no locator, no out-of-band call, no environment replay |
| What is lost | **nothing the run uses.** Its own value is absolute under every supported configuration, and every existing canary passes an absolute value. The relative-`HOME` hole (Current state) is the one producible exception, is unsupported, and is a Discovered issue rather than a case this guard silently accepts |
| The row sentences this adds | the *"ONE MECHANICAL TRAP SURVIVES"* clause gains: the value must be ABSOLUTE, a non-absolute one is refused unjudged, and **the run's own value is absolute under every supported configuration, a relative `HOME` being the one producible exception** (it may not claim *"absolute by construction"*). The *"EVERY RED CARRIES ITS INVOCATION"* sentence is scoped to verdict reds and gains the refusal's diagnostic beside it |

### Table B — the PRODUCING attribute and the membership predicate (item 2)

| Fact / rule | Value |
|---|---|
| Where the attribute is DECIDED | at the shape, in W1(c)'s pinned-set enumeration, spelled with the `marker:` literal under "Exact contracts" |
| Which shapes carry it | **exactly the shapes whose entry in `tests/unit/dream-pipeline.known-calls.js` carries `produces: true`, and no others.** The mapping is **derived from the module by the work, never predicted in this spec** — the module is not edited, so it is the source |
| Executable mirror | that module's `produces` property. The pair moves together, as `«own …»` ↔ `RUN_VALUE` already does |
| What the row's enumeration must satisfy, so the pair is checkable at all | exactly nine entries, labelled **(1)**–**(9)**, in the module's physical order, each label unique and no decoy entry; and a marker counts **only when it sits in its own entry, between that entry's call-site citation and its terminating period**. A label swap, a decoy ordinal, and a same-count swap are each a FAILURE of this row — see the acceptance criteria, which require each as an observed RED |
| How identity is established | **by shape-by-shape comparison of two INDEPENDENTLY DERIVED sides**, never by a count or a script carrying the answer. Measured against earlier drafts: a count passes a same-count swap; an ordinal parser passes a label swap and a decoy; a verifier with the mapping hard-coded passes a wrong baseline while reddening every mutation. **No grep reaches this**, which W1(c)'s own registration already states for slot kinds; the evidence is the comparison, pasted |
| Preamble sentence | the set's preamble — which defines the guillemet kinds and ends *"The disposition is part of the shape, not a side condition."* — gains the marker's definition in the same place and form: a marked shape is one whose whole stdout the own-value set learns from, its executable spelling is `produces: true`, and the two copies must agree shape by shape |
| Membership predicate's home | **unchanged — clause (1) of "WHICH SLOTS TAKE THE PIN"**, which spells it and whose own sentence already declares itself a citation of it |
| The REPAIR clause | stops stating a membership rule of its own: the token is compared to the own-value set, whose membership is clause (1)'s predicate and whose sources are the shapes the set marks |
| The ORDERING paragraph | stops classifying with **computed**: it states only the ordering it exists to state — a token is admitted in an own-value slot only after an earlier pinned PRODUCING call has RETURNED and its whole stdout joined the set. **Neither COMPUTED nor READ may be the word doing the classifying** |
| The closure clause | its owning-surface sentence moves: the owning surface is the row's markers, with the module's property as the executable mirror. **The no-count rule stands** |
| Registered NON-move, inside the same cell | the closure clause's *"THE REMEDY THAT CLAUSE SPECIFIED — … SHIPPED AT `b19121bb`"*. A SHA-pinned, past-tense record of what a ruling specified — the form this row grants and its retirement discipline requires. It stays legible as history and is not reworded into a statement of the live set |

### Table C — what each surface may claim about the seam's coverage (item 3)

| # | Surface | Required content |
|---|---|---|
| 0 | `docs/specs/done/WP-dream-promote-in-workspace.md:541` — clause (a) SCOPE, **inside the canonical cell; the only copy that is contract text** | the parenthetical *"every one of them through the seam of (c)"* is narrowed so the scope stays a total over the run's own acts while the SEAM stops being claimed as total over them, deferring to (c)'s COVERAGE clause for the limit. **It may not restate the spawn-point list** — (c) owns it — and it must bring the parenthetical into line with (a)'s own ruling that *"the boundary is AUTHORSHIP, not visibility"* |
| 1 | `src/cli/dream.js:156-157` (`gitIn`'s JSDoc) | the SCOPE: the seam is total over `src/cli/dream.js`, and is **not** total over the dream path. **It cites row W1(c)'s COVERAGE clause and does not restate it** — no spawn-point list, no re-argument. The rest of the JSDoc is unchanged |
| 2 | `src/cli/dream.js:560` | may not claim the run has only one git seam; names this file's seam and defers to `gitIn` |
| 3 | `tests/unit/dream-pipeline.test.js:167-168` | *"Every git invocation the run makes…"* becomes the row's own wording — the invocations **the seam observes** |
| 4 | `tests/unit/dream-pipeline.test.js:443-445` | one sentence on what this test's evidence REACHES — the calls arriving through the injected `opts.spawnGit` — citing W1(c)'s COVERAGE clause rather than restating it |
| 5 | `tests/unit/dream-pipeline.test.js:436` (the test TITLE) | **RENAMED.** The title claims *no product code invokes git with a cwd at or beneath the workspace root*, which this test does not establish: it observes only calls arriving through `opts.spawnGit`. The new title states the observed scope and **PRESERVES the `claim-2b-pipeline` token** — `--test-name-pattern` matches by SUBSTRING, so the pinned command at `docs/specs/done/WP-dream-promote-in-workspace.md:1454` keeps selecting exactly what it selects today. **Nothing the test asserts changes**; only its name stops overstating |

### Mirrored Surface Checklist

**Tree surfaces** were found by the sweep in Verification steps, which owns the
patterns. **In-spec surfaces** — the criteria asserting each table's facts and the
commands checking them — are registered beside them, located by criterion number
and by each verification block's comment header, which the sweep cannot reach.
`W1(c)` below always means `docs/specs/done/WP-dream-promote-in-workspace.md:541`.

**Table A:**

- [ ] `tests/unit/dream-pipeline.test.js:196-208` — the `private` arm, which returns UNJUDGED; and `:209-231`, the seam wrapper, which raises on it. **The pair moves together**: the state is meaningless unless something raises on it, and the raise is meaningless unless the state is distinguishable
- [ ] **NON-moves:** `realish` (`:128-131`), `classify`'s SIGNATURE and its five call sites (`:1589`, `:1602`, `:1617`, `:1624`, `:1629`) — no frame is introduced and every call site passes an absolute or absent value; and W1(c)'s two-clause private-index rule, whose clauses are untouched
- [ ] W1(c) — the *"ONE MECHANICAL TRAP SURVIVES"* clause (the absoluteness sentence) and the *"AND EVERY RED CARRIES ITS INVOCATION"* sentence (scoped to verdict reds, with the refusal's diagnostic beside it). **Registered as a pair with the wrapper's raise**: the diagnostic the code emits and the sentence that governs it move in one pass
- [ ] **Criteria 1–3** and **the guard-file suite run**, registered with what they reach: **no grep can establish a refusal**, so this table rests on criterion 1's pasted pair

**Table B:**

- [ ] W1(c) — the enumeration (markers) and its preamble (their definition); the REPAIR clause; the ORDERING paragraph; the closure clause's owning-surface sentence
- [ ] `tests/unit/dream-pipeline.known-calls.js` — the `produces` properties, the executable half of the pair. **NOT edited**, and asserted byte-untouched
- [ ] **NON-moves, re-read but not edited:** `tests/unit/dream-pipeline.test.js:226-238` (the recorder comment the predecessor rewrote a day earlier); `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md:356-366` (its C2 checklist already ruled it); `docs/specs/done/WP-show-slot-own-value-kind.md` and **this spec**, which quote pre-change wording on purpose and are excluded from the sweep for that reason and no other
- [ ] **Criteria 4 and 4a**, the **module byte-identity gate** and the **guarded negated grep** — the gate holds the pair's executable half still, the grep is a FLOOR on wording only. Identity and the semantic wording test are criteria with pasted evidence, because every scripted mechanism tried here — a count, an ordinal parser, one with the mapping hard-coded — was measured to pass a wrong state

**Table C:**

- [ ] W1(c) — clause (a)'s parenthetical (row 0); the COVERAGE clause is a **NON-move**, being what the four rewrites cite
- [ ] `src/cli/dream.js:156-157` and `:560`; `tests/unit/dream-pipeline.test.js:167-168`, `:443-445`, and `:436` — the title, which **MOVES**, preserving the `claim-2b-pipeline` token
- [ ] **NON-moves:** `docs/specs/done/WP-dream-promote-in-workspace.md:1114` and `:1454` — CLAIM 2b's criterion and the command pinning the test name, which is the reason row 5 preserves the token
- [ ] **Criterion 5** and **the claim sweep with its baseline**, registered with what it reaches: the registered wordings are gone and the baseline hits moved. **It cannot certify the concept** — a rewording scores zero hits — so criterion 5's pasted blocks and criterion 6's re-read carry that

## Implementation notes & constraints

- **Zero new dependencies; plain Node ≥ 18; no build step; nothing that outlives
  its job (ADR-0004).** The change is one refusal, four comment edits, one test
  title and one markdown cell.
- **After rewriting the cell, RE-READ IT WHOLE** — `sed -n '541p' <that file> |
  fold -s -w 180` — and likewise each comment block you edit. No mirror checklist
  sees inside one cell, and the failure mode is the new sentence landing while the
  old one stays. **This re-read carries the semantic claims**: every scripted
  mechanism tried in review — a count, an ordinal parser, one with the mapping
  hard-coded, a concept regex — passed a state a reader catches at once.
- **The set does not change:** no shape added, removed or reordered; no slot
  changes kind; `shapeMatches` and the module untouched.
- **`docs/specs/done/` is NOT always-allowed** — `scripts/boundary-check.js`
  admits only `package-lock.json`, `memory/lessons/inbox.md`,
  `docs/specs/logbook/` and this spec without listing.
- Test design, fixture topology and mutation mechanics are the implementer's; the
  criteria state the properties and the evidence required, not the code.
- **Ambiguity → the simpler option, recorded under "Decisions made".**

### Rejected options, recorded so they are not re-proposed

| Option | Why rejected |
|---|---|
| **(A) Ask git for the EFFECTIVE index path out of band** — run `rev-parse --git-path index` with the invocation's `GIT_INDEX_FILE`, environment and cwd, and resolve its answer against the cwd | **It works** — measured on git 2.39.5 against every vector that defeated the two frames (plain relative, symlink, `GIT_DIR`/`GIT_WORK_TREE`), agreeing with where `read-tree` actually wrote, and index-safe on a stale-stat index. It is the **STARTING POINT for a redesign** if the owner declines the Dispatch precondition's ratification — not a branch to switch to; that section lists what it would still have to cover. Not taken because it costs an out-of-band git call per private invocation, must replay the invocation's whole environment to be correct at all, and requires re-scoping W1(c)'s *"nothing asks git which repository an invocation reaches"* to distinguish a retired argv classifier from a permitted path locator. **The deciding reason is the loop**: two rounds produced two frames, and modeling one more is the direction this family has retired twice |
| **Resolving in a frame the guard computes** — the `-C` directory, or the worktree top | Both **measured FALSE** (Current state). Recorded because each was this spec's own answer in a previous round and each is the obvious cheap fix |
| **Rejecting a relative value as a fifth VERDICT** rather than refusing to judge | A verdict is a contract change to W1(c)'s four failure modes. The refusal is an error — the harness declining to decide — which is why the Dispatch precondition asks the owner to ratify exactly that distinction and nothing else |
| **Closing either un-seamed spawn point** — routing `promote()`'s `merge-file` through the pipeline's seam, or threading it into `assertGitRepo` | Foreclosed by W1(c)'s COVERAGE clause in as many words: incompatible cwd conventions, and under default-deny either close surfaces an unpinned TENTH shape, whose admission is a change to the canonical table |
| **Deleting the closure clause's historical enumeration of the remedy's shapes** | Table B's last row. Table W records every retirement with its cause; deletion loses the finding twice |

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no untrusted identifier
      reaches a filesystem path or a shell command here.** The only `src/` change
      is comment text.
- [ ] **The one security-relevant property: the guard stops returning a verdict it
      cannot ground.** The `unset` arm is untouched. An ABSOLUTE override — every
      one the shipped run makes and every one the existing canaries carry — is
      judged exactly as today, so nothing about the admitted set moves. A
      non-absolute override on a `private` shape, today silently judged in an
      unrelated frame, now stops the suite instead — carrying the invocation that
      caused it. An `unset` shape's non-absolute override keeps its existing
      verdict, so no verdict becomes unreachable. **No shape, disposition or slot
      is widened, the four verdict strings are unchanged, and no frame is
      modeled**, so this WP adds no surface that drifts as git's path resolution
      changes.

## Acceptance criteria

- [ ] 1. **The refusal is observed in both directions, and its diagnostic is
      pasted in full.** A `private` shape carrying a non-absolute
      `GIT_INDEX_FILE` makes the guard ERROR — not return a verdict, not fall
      through to either clause — and the error text carries **the full `args`,
      the `cwd`, the raw value, and the UNJUDGED state, and reports no resolved
      path** (Table A). One carrying an absolute value is still judged, reaching
      both existing private-index verdicts as today. An `unset` shape carrying a
      non-absolute value still gets its existing verdict rather than the refusal.
      Paste all three.
- [ ] 2. **The accept side stays alive:** the index test is green on all three
      vault layouts with `violations` empty, and the run's own absolute private
      index is admitted. A guard that refused everything would satisfy criterion 1
      alone.
- [ ] 3. **Nothing outside the edited sites moved.** Everything the Deliverables
      cell for `tests/unit/dream-pipeline.test.js` names as unchanged is unchanged
      — that cell owns the list, `classify`'s signature and its five call sites
      included — and `tests/unit/dream-pipeline.known-calls.js` is byte-identical
      to `main`, so no re-pin is owed.
- [ ] 4. **Table B has landed, and the row's markers match the module's SHAPE BY
      SHAPE.** The enumeration satisfies Table B's structural row (nine entries;
      labels unique, in the module's order; no decoy; each marker inside its own
      entry between the call-site citation and the terminating period).
      **THE EVIDENCE MUST DERIVE BOTH SIDES INDEPENDENTLY, and this is the
      requirement, not the parser:** the module's shape identities and `produces`
      state are read FROM THE MODULE, the row's from the committed line's physical
      entries, and the two are compared position by position. **A verifier
      carrying an expected mapping as a constant does not satisfy this** — one was
      executed against an earlier draft with a wrong baseline hard-coded, and it
      went green while every mutation below went red.
      **Each of these is required as a pasted RED, one per way this has failed:**
      a same-count swap, a label swap, a decoy ordinal, and — **the one that
      proves the module is actually read** — a `produces` property flipped in a
      scratch copy of the module, which must turn the comparison RED without the
      row changing at all.
- [ ] 4a. **No count of own-value sources is stated in any SPEC OR DOCS PROSE
      surface** — the scope of W1(c)'s own rule (*"NEITHER THIS ROW NOR ANY PROSE
      SURFACE"*). **Explicitly out of scope: code and its comments** (exemption
      (i) — which is why the module and
      `tests/unit/dream-pipeline.test.js:226-238`, both untouchable here, are not
      defects) **and dated, SHA-pinned provenance lines**, which report what a
      tree measured rather than what holds now.
- [ ] 5. **Table C has landed, row 0 included.** None of the four false universals
      survives; **each edited comment site carries a `row W1(c)` citation WITHIN
      ITS OWN BLOCK**, evidenced by pasting each block — a per-file count cannot
      establish this, since two citations at one site satisfy it; the renamed
      title states only what the test observes and keeps the `claim-2b-pipeline`
      token; both Deliverables cells' unchanged lists hold.
- [ ] 6. **The whole cell, and each edited comment block, were re-read after
      rewriting** and carry no sentence the rewrite falsified. **This carries the
      semantic claims in criteria 4 and 5** — no pattern does. Report what the
      re-read found, including "nothing".
- [ ] 7. The sweep is re-run and every hit is corrected text or a registered
      non-move, **reported as what it establishes**: the registered wordings are
      gone and the baseline hits moved, not that the concept is gone.
- [ ] 8. `npm test` and `npm run lint` pass; `boundary-check` is clean.
- [ ] 9. Idempotency: `N/A — this WP ships no command and writes nothing outside
      the repository.`

## Verification steps (run these; paste output in the PR)

These are the checks a command CAN establish; criteria 1, 4, 5 and 6 rest on
pasted evidence instead, every scripted mechanism tried in review having passed a
wrong state.

```bash
# The guard's own file, then the whole suite and the lint pipeline. Capture the
# exit code as its own statement, never behind a pipe.
npm test -- tests/unit/dream-pipeline.test.js
echo "guard-file suite exit=$?"
npm test
npm run lint

# Criterion 3 — the module is untouched, so no digest re-pin is owed.
git diff --quiet main -- tests/unit/dream-pipeline.known-calls.js \
  && echo "known-calls module byte-identical to main"

# Criterion 4 — the loose wording is gone from Table W. GUARDED: a bare negated
# grep passes hardest when the file is absent. A FLOOR on wording only.
test -f docs/specs/done/WP-dream-promote-in-workspace.md \
  && ! grep -qF -- 'values THIS RUN PRODUCED' docs/specs/done/WP-dream-promote-in-workspace.md \
  && echo "the loose PRODUCED wording is gone from Table W"

# Criteria 5 and 7 — the claim sweep, whitespace-flattened so a hard wrap cannot
# hide a hit, ONE PATTERN PER PASS as fixed literals (an alternation swallows
# adjacent hits). EXCLUDED, and nothing else is: this spec and the predecessor,
# which quote the pre-change wording on purpose.
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

**Sweep baseline at `fc506110`, so the deltas are checkable.** `Every git
invocation this pipeline makes` → `src/cli/dream.js` 1; `The run's ONE git seam`
→ `src/cli/dream.js` 2; `Every git invocation the run` →
`tests/unit/dream-pipeline.test.js` 1; `product code invokes git` → that file 1
and `docs/specs/done/WP-dream-promote-in-workspace.md` 1; `values THIS RUN
PRODUCED` → that Done spec 1 and
`docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md` 1.
**After this WP the first three, and the Table W hit of the last, must be ZERO**,
and `product code invokes git` drops to the Done spec's `:1114` alone — the test
file's occurrence is the TITLE row 5 renames, so a run still reporting two has
not done the rename. The logbook hit is a registered non-move and is UNCHANGED.

**Both directions are required for every new assertion**, green on the finished
state and red on a deliberately broken one: a byte added to the module; the loose
sentence left standing, plus the negated grep's file-absent case (moved aside it
must go RED); criterion 1's non-absolute vector; and **every mutation criterion 4
requires, the module-side `produces` flip included** — that criterion owns the
list, and this inventory does not restate it.

## Out of scope (do NOT do these)

- **Any change to `src/` beyond comment text**, and any change that models where
  git would place a relative index.
- **Discovered while measuring, reported and NOT fixed — both go under "Discovered
  issues" in the PR body.** (a) `src/core/paths.js` does not validate `HOME`, so a
  relative `HOME` yields a relative `paths.state` and therefore a relative
  `GIT_INDEX_FILE` — a product-side question about an unsupported configuration,
  and the one case Table A's refusal would now stop the suite on. (b)
  `docs/specs/done/WP-dream-promote-in-workspace.md:673` still registers the
  executable copy of the pinned set as living in
  `tests/unit/dream-pipeline.test.js`; it moved, and row W1(c) already says so.
  That is that spec's own Mirrored Surface Checklist, which Deliverables excludes.
- **The family's other queued follow-ups:** the predecessor spec's canonical
  module block as an unregistered third copy of the set; W1(c)'s missing nine-slot
  adjudication; row W5's three dead `5c5d082` SHAs (correct: `c853245b`); and
  `src/core/dream/warnings.js:63-66`'s known-falsified-by-design JSDoc.
- **Re-opening any W1(c) ruling this WP cites**, and **adding a fifth verdict, a
  third placeholder kind, a tenth shape, or any tolerance in `shapeMatches`.**

## Definition of done

0. **DISPATCH PRECONDITION.** Not dispatched until the owner has ratified that
   refusing to judge a non-absolute private `GIT_INDEX_FILE` is a harness error
   and not a fifth failure mode. **If the owner rules otherwise this WP returns to
   design**, with (A) in Rejected options as the starting point and the open
   questions the Dispatch precondition lists; it is not a flag flip. The dispatch
   message records the ruling.
1. All verification steps pass locally; output in the PR body, with the pasted
   evidence criteria 1, 4, 5 and 6 require.
2. Conventional commits; PR titled
   `test(dream): refuse to judge a relative private index and give PRODUCING its slot (WP-index-guard-residuals)`.
3. PR template filled, including "Decisions made" (or "none"), `Generated-by:`,
   and "Discovered issues" carrying the two items named in Out of scope.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — defined in `docs/runbooks/codex-review.md`, not restated here.
   `In-Review` marks the START of review: this list is complete only when review
   is.
