---
title: Review rounds — WP-dream-control-file-fence (C1)
date: 2026-08-20
---

# Review rounds — WP-dream-control-file-fence (C1)

Spec: `docs/specs/WP-dream-control-file-fence.md`. Base: `main` @ `1d4c092`.
Closes M7, and M10 as far as a status-based fence reaches.

**Round counter starts at ZERO.** No round history is inherited from the superseded
predecessor. Its record —
`docs/specs/logbook/2026-08-20-dream-write-fence-control-files-review-rounds.md` —
is cited as EVIDENCE for the measurements C1 carries, never as review credit: no
finding there counts as reviewed here, and C1's own rounds must re-find anything
that still applies.

## Owner rulings landed BEFORE round zero

1. **The preserve→destroy race window is inherited from the EP2 gate unchanged**, as
   a named residual, with `tests/unit/dream-validate.test.js:2322-2368` as the test
   that pins it. No new locking scheme. Reasons: the rename direction shrinks the
   window on the untracked arm to a single syscall; the tracked arm is the EP2 gate's
   existing shape; and a locking scheme would repeat the scope growth the split just
   cured. (Table B.)
2. **The cross-run gate stays measure-first.** Marker + `:(exclude)` is the direction
   to measure; the reviewer's halt-before-precommit is measured against the dual
   constraint (no user data destroyed AND no cheap dream off-switch); the final shape
   returns to the owner as a ruling request after the implementer's measurement. No
   text change was required.
3. **Rename, disk-fill and the two failure classes.** A rename within one filesystem
   allocates no new data blocks, so disk-fill cannot defeat rename-first
   preservation; the disk-fill lever is reopened precisely by the EXDEV copy-fallback,
   i.e. on split-mount machines. Two consequences are now in the spec: the
   implementer's EXDEV measurement decides whether the disk-fill kill-switch argument
   stays theoretical, and the halt-gate measurement must treat preservation failure as
   TWO classes — *rename-impossible* vs *copy-failed* — because their
   attacker-forceability differs. (Tables B and C.)

## STOP CRITERION (pinned before the first adversarial round)

- **Closes the loop:** one external adversarial round returns no finding about the
  PRODUCT — nothing that changes what the implementer builds in `src/`: the two
  denial rules and their precedence, the ordering, un-staging, termination and the
  commit-boundary final pass (Table A); preservation before destruction and its
  measured mechanism (Table B); the residue contract and the between-runs gate
  (Table C); or the named residuals. Machinery findings at that point are fixed
  inside the existing verification surface or accepted as named residuals.
- **Escalates, does not iterate:** two consecutive rounds on the same contract family
  → contract-extraction pass (ADR-0031 circuit-breaker), not another patch. **Two
  consecutive rounds on the owner rulings above, or on the 2026-08-05 structural-denial
  ruling, go to the owner as a ruling request, never into a revision.** This is the
  criterion that fired on the predecessor and produced the split; it is pinned here
  before any round for the same reason.
- **Surface is frozen:** verification machinery grows only to guard a product
  behaviour, in the smallest form that guards it. It stands at ONE new assertion.
- **Scope is frozen:** C1 is the fence. A finding that belongs to C2 (the git seam)
  or C3 (the layout rule) is routed there, never folded in — the split is the thing
  under protection.

## Rounds

| Round | Kind | Raw record | Commit that introduced the raw | Verdict |
|---|---|---|---|---|
| 0a | Template conformance (clean context, two inputs, no external reviewer) | `docs/specs/logbook/2026-08-20-dream-control-file-fence-r0-template-conformance-raw.md` | `51829da` | clean — no blocking items |
| 0b | Internal coherence + runnable criteria | `docs/specs/logbook/2026-08-20-dream-control-file-fence-r0-internal-coherence-raw.md` | `c445f3c` | 1 finding |
| 1 | External adversarial (design), gptsol | `docs/specs/logbook/2026-08-20-dream-control-file-fence-round-1-raw.md` | `593e1fd` | NO-SHIP — 4 findings, 1 routed to C3 |
| 2 | External adversarial (design), gptsol, fresh round after HEAVY fixes | `docs/specs/logbook/2026-08-20-dream-control-file-fence-round-2-raw.md` | `256889a` | NO-SHIP — 2 fixed, 1 partial, 1 not fixed, 7 new |
| 3 | External adversarial (design), gptsol, fresh round after the relocation rewrite | `docs/specs/logbook/2026-08-20-dream-control-file-fence-round-3-raw.md` | `175fd99` | NO-SHIP — 2 not fixed, 5 partial, 5 new |

## Round 0 dispositions

**0a — template conformance: clean.** Every template section present with real
content; none silently absent, none `N/A`-marked. Frontmatter complete, `id` matches
the filename, `status`/`size` in enum. The three named contract tables occupy the
template's `### Contract table(s)` slot, which the template's own comment invites
("one canonical table per dense contract"). No action.

**0b — internal coherence: every citation re-ran clean; one finding.**

| # | Finding | Weight | Disposition |
|---|---|---|---|
| C1-R0-1 | The one proposed NEW verification assertion was VACUOUS — it passes on the untouched tree, because the validator already reads `git diff --cached` at four sites. Its replacement candidate, a `grep -F -f` on the spec's own reason literals, proved SHAPE-DEPENDENT: measured 0/2 and 1/2 against two hand-built, equally correct implementations, because the bases contain both an apostrophe and a double quote and JS escapes one or the other depending on quoting style | LIGHT | **fix** — the section now carries no source-level assertion, and records the measurement plus an explicit "do not re-add a source grep for them" |

**The generalisation is the valuable part, and it is now spec text.** A source-text
grep is not a sound way to assert a contract string. This is the second package in
which a source grep failed round zero — on the predecessor an unescaped `.` matched
`startsWith('#')` and passed on the untouched tree — but the failure mode is
different, and this one is not fixable by better quoting: no source-level pattern
matches every correct implementation of a string containing both quote characters.
The contract strings are observable in the dream report, so the implementer's tests
assert them in behaviour, which is where they are contracts.

**Machinery surface after round zero: ZERO new assertions**, down from one. The stop
criterion's "surface is frozen" clause is satisfied by construction — there is
nothing left to grow.

## Round 1 — verdicts, dispositions and rulings

Backend: `gptsol`, English-pinned, read-only verified. The dispatch carried a SCOPE
RULE (findings belonging to C2/C3 reported separately, never counted against C1) and
isolated the predecessor's record as evidence rather than review credit. **The scope
rule held**: the reviewer routed one genuine issue to C3 instead of widening C1.

All four findings were re-run independently by the orchestrator before adjudication,
and all four reproduced. All four are HEAVY — each changes what the implementer
builds — so the fixes land and a full fresh external round follows.

| # | Finding | Disposition |
|---|---|---|
| C1-R1-1 | A deleted tracked `.gitignore` becomes unpreservable residue, the deletion stands, and the files it was ignoring are staged and committed | **fix** (ruled) — deletions leave Table B entirely |
| C1-R1-2 | `:(exclude)<path>` is a PATTERN; one residue path can exclude unrelated files at every `add -A` | **fix** (ruled) — `:(top,literal,exclude)` |
| C1-R1-3 | Rename-first preservation breaks the quarantine mode, type-enumeration and open-descriptor contracts | **fix** (ruled) — path (c) |
| C1-R1-4 | The commit-boundary pass has no coherent sequencing with the report, the counts and the skill registry | **fix** (ruled) — a stabilization protocol, expressed as ONE mechanism with the bridge |
| routed | Dot-prefixed layout values make the fence deny the validator's own report | **C3**, with a narrow bridge in C1 (ruling 4) |

### The rulings, as landed

1. **Deletions are restored, not preserved.** The content is in HEAD, so reverting
   restores rather than destroys; the denied deletion is an unconditional
   `git checkout HEAD -- <path>` recorded with a new `suffix-restored`. Restoring the
   ignore file re-hides what it was ignoring, which ends the chain at its root rather
   than patching the exclusion set. Binary acceptance case added for both a root and a
   nested `.gitignore`, across two runs.
2. **`:(top,literal,exclude)<path>`, at every `add -A` site and at the report
   re-staging.** The Security checklist's claim was factually wrong and is corrected:
   a separate argv element stops SHELL interpretation, not git's pathspec parsing.
   Tests cover `*`, `?`, `[`, `]` and a leading `:`.
3. **Path (c) for preservation.** Regular files keep today's copy-based
   `quarantinePreserve` byte-for-byte — 0600/0700, naming, banner and `private-fs` all
   untouched. Symlinks and directories get **deny-without-destroy**: left in place,
   excluded, retried, named loudly in EVERY run's report. Two stipulations recorded:
   the on-disk corner is a named residual the disclosure WP's detector watches, and
   the EP2 open-fd race is inherited unchanged. Two supporting measurements added: `-uall`
   lists an untracked directory's contents file-by-file, so the directory shape is a
   rare corner; and the dream's tool set does not create symlinks — stated as
   defense-in-depth and explicitly NOT relied on, since it is a harness-behaviour
   claim this repository does not test.
   **Mandatory rewrite carried out:** Table B's disk-fill row and Table C's two-class
   consequence rested on the rename premise and partly collapse under (c) — with a full
   disk the copy fails for regular files too, so preservation failure is
   attacker-forceable in general. The conclusion is *strengthened*, not weakened: the
   halt gate stays rejected precisely because a forceable failure mode must never stop
   the dream, and the residue path (keep running, exclude, report loudly) is the ruled
   failure mode. The EXDEV row is moot under (c) and was removed.
4. **The C3 circularity gets a bridge, not a reorder.** The fence exempts exactly the
   report path the validator writes this run (`:1378`), only when the layout maps it
   under a dot segment, pinned before the brain starts from `~/.wienerdog/config.yaml`
   (`src/core/paths.js:67`), which lives outside the vault (`:63`) and so is beyond the
   dream's reach. A sunset test fails once C3 lands.
   **The ruling's conditional measurement was run and it fired:** the report is
   **appended**, not written whole — `:1380-1383` writes the header only when the file
   is absent and `:1388` appends — so bytes pre-planted at the exempted path would
   survive into the commit. The bridge therefore carries the required hardening: when
   the exemption is in force, the report is written with a full-file, code-owned write.
   Scoped to the exempted case only, so every dot-free install is byte-unchanged.
5. **The stabilization protocol and the bridge are ONE mechanism.** The report's
   re-staging uses the same residue-aware literal exclusion, and `committed`, the
   counts and the skill-registry candidates all derive from the stabilized set.

### Stop criterion — RE-STATED for round 2 (HEAVY fixes landed)

- **Closes:** one external round returns no finding about the PRODUCT — the fence and
  its stabilization protocol (Table A), preservation and deny-without-destroy
  (Table B), residue and the between-runs gate (Table C), the bridge, or the named
  residuals.
- **Escalates:** two consecutive rounds on the same contract family → contract
  extraction, not another patch. **Two consecutive rounds on the owner rulings — the
  2026-08-05 structural-denial ruling, the pre-round-zero rulings, or the five above —
  go to the owner as a ruling request, never into a revision.**
- **Surface frozen:** verification machinery stands at ZERO new source-level
  assertions and does not grow; round zero measured why source greps cannot assert
  these contracts.
- **Scope frozen:** C1 is the fence. A finding belonging to C2 or C3 is routed, never
  folded in. The bridge is the single, sunsetted exception and is not a precedent.

## Round 2 — verdicts, and the STOP CRITERION FIRING AGAIN

Read-only verified. The SCOPE RULE held a second time: the reviewer returned an
explicitly EMPTY routed section, so nothing was smuggled in from C2/C3 and every
finding is C1's own. Round-1 verdicts: R1-2 **FIXED**, R1-4 **FIXED**, R1-3
**PARTIALLY FIXED**, R1-1 **NOT FIXED**. Seven new findings. The orchestrator re-ran
the load-bearing ones; **all reproduced**:

- `git checkout HEAD -- <path>` on a deleted tracked `.gitignore` whose pathname is
  now a non-empty directory **exits 0 and silently destroys the directory and its
  contents**; the resulting `git status` is clean, so the loss is invisible to git.
- A directory rename carrying both a `.gitignore` and a file it hides: restoring the
  old ignore file and denying the new one **stages the private file** (`A new/private.txt`).
- `fs.writeFileSync` through a symlink at the exempted report path **overwrote the
  link target** — a vault `CLAUDE.md` became the code-owned report while the report
  path stayed a symlink.
- An internal contradiction of the orchestrator's own making: acceptance criterion
  at line 306 still demanded a symlink be "preserved AS a symlink" — stale text from
  the rejected rename era — while line 319 requires it be neither preserved nor
  destroyed. The Mirrored Surface Checklist should have caught this and did not.

### The stop criterion fires — this does NOT go into another revision

Pinned before round 1 and re-stated before round 2: *"Two consecutive rounds on the
owner rulings go to the owner as a ruling request, never into a revision."* Met on
two independent families:

- **The deletion ruling** (deletions leave preservation; unconditional checkout) was
  created in round 1's folding and is attacked head-on in round 2 by findings 1 and 2:
  it destroys replacement data, and restoring the old ignore file does not re-hide a
  renamed private file.
- **The preservation/residue ruling** (path (c), deny-without-destroy, residue) took
  R1-3 PARTIALLY FIXED plus findings 3 and 4.

**Finding 3 is the one that matters most, and it is structural.** Residue is left on
disk deliberately. The brain reaches the vault, and the next run's report — the
"loud" part of the ruled failure mode — is written only AFTER the brain has run. So a
denied instruction file that becomes residue can steer the next dream. C1's ruled
failure mode therefore preserves precisely the persistence M7 exists to prevent, and
C1 cannot claim to close M7 while it stands. **Finding 4 closes the pincer:** the same
full disk that justified rejecting the halt gate also prevents the residue marker and
the report from being written, so the mechanism does not satisfy its own dual
constraint under the very condition the constraint was written for.

Only three states exist today for a denied path — commit it, destroy it, or leave it
— and round 2 shows all three are wrong for some input. **That is a design question,
not a textual patch, and the runbook says so.** No revision is made until the owner
rules.

### What the orchestrator would put to the owner (proposals, not decisions)

- **A fourth state: relocate out of the vault.** Move residue into a residue area of
  its own under `state/` — not the secret quarantine, whose consumer contracts round 1
  measured as incompatible with directories and symlinks. This is the scope growth the
  earlier ruling avoided; finding 3 is the argument that it is now the thing that makes
  the package correct rather than an extra.
- **Pre-spawn block, narrowed to instruction-bearing residue only.** The off-switch
  objection is weaker here than it looked: to create residue at an instruction path the
  dream must already have written an instruction file, and halting a machine the fence
  cannot make safe is a defensible answer. Worth measuring against the dual constraint
  rather than rejecting by inheritance.
- **Deletion restoration becomes conditional** (finding 2): `lstat` the pathname
  first, restore directly only when it is absent, otherwise classify and preserve the
  occupant under the same rules; define a fail-closed disposition for the measured
  `checkout` exit 255 case.
- **The bridge write becomes an atomic replacement** (finding 5): temp regular file in
  a verified non-symlinked directory, renamed over the leaf, with no-follow checks on
  every ancestor; plus filesystem-identity comparison rather than string equality
  (finding 6).
- **Verification becomes behaviour-level** (finding 7): the three current commands are
  green on a spec-only branch, so they prove nothing. Keep the ban on source greps, but
  require the implementer to demonstrate each acceptance group failing against a
  deliberately broken implementation and passing against the finished one — and fix the
  Definition of done, which still references a "new assertion" that no longer exists.
- **The larger question, stated plainly:** finding 1 pushes toward the pre/post
  filesystem inventory that has been routed to the disclosure WP twice. If a fence
  built on `git status` keeps needing compensating machinery for every visibility
  shape, the primitive may be wrong — and that is the owner's call, not the author's.

## Owner rulings on the round-2 escalation (2026-08-20) — the design moves

All seven findings accepted and independently replayed. One mechanism correction and
three design rulings; this is a rewrite of the spec, not a patch.

### Correction to finding 3 (recorded, because it changes the remedy order)

**The live Claude brain does NOT start in the vault.** `brain.js:196-198` gives it a
neutral staging cwd (D-DREAM-CWD, WP-130); the vault cwd at `:189` belongs to the
**dead** Codex branch — verified at the source. The reviewer's finding cited
`brain.js:187-190` as though the vault cwd were live. The finding does not weaken:
the real consumers of a residue instruction file are the user's **own** harness
sessions in the vault, and any future Codex wiring. But it **reverses the order of
the remedies**: relocation protects both consumers, a pre-spawn block protects only
the second. That is why relocation became the main path and the block the second line.

### Ruling 1 — the fourth state, at the centre of the design

A denied, non-restorable object's default fate is **relocation**: `rename` into
`state/residue/`, a NEW area with its own minimal contract, deliberately not the
secret quarantine. Rename carries a file natively, a symlink AS a link, a directory
whole; within one filesystem it allocates no blocks, so the disk-fill lever dies on
the main path. Consequences the spec now states: **the vault is CLEAN after the
fence**; the `:(exclude)` + marker + retry apparatus leaves the main path entirely;
cross-run promotion has nothing to promote; the user-session channel closes; and the
structural-denial premise is restored. Three stipulations landed: (a) the **visibility
invariant** — a denial may never widen visibility, probed per path before any
intervention; (b) the **EXDEV corner** falls back to copy, where disk-fill returns —
named residual, watched by the disclosure WP; (c) the **pairing record may degrade**
to filename encoding on a full disk — the relocation still happens.

### Ruling 2 — the pre-spawn assert is the second line

A small invariant assert before the brain spawns: a forbidden instruction shape still
in place means that evening's brain is loudly skipped, everything else runs. **Not
load-bearing** — reaching it requires defeating relocation first, and if that
succeeds, not starting the brain is the correct answer.

### Ruling 3 — the primitive: the middle path

**Git stays the SENSOR — it says where a change happened. Every ACTION starts from
filesystem truth**, through one shared primitive: every path the fence touches is
classified in this pass with a no-follow `lstat`. Tracked modification → restore from
HEAD; deleted path → restore ONLY onto an empty pathname, otherwise the occupant's
fate is decided first; every other shape → relocation; the bridge write → atomic
tmp+rename with no-follow ancestor checks; identity → filesystem identity, never
string equality. The spec's guiding sentence: *git tells you where to look; only the
disk can tell you what is there.*

### Ruling 4 — verification becomes behavioural

Behaviour-level acceptance tests, and the PR must **demonstrate every prescribed test
RED on a deliberately broken implementation**; green-on-green is not evidence. The
Definition-of-done line referencing a non-existent "new assertion" and the
symlink-preservation contradiction between the old criteria are both gone in the
rewrite.

### Size self-check after the rewrite (ruling 5)

414 spec lines, **5 deliverable files** (`validate.js`, `dream.js`, `private-fs.js`,
and two test files) — inside the `docs/specs/README.md` ceiling of ~8 files, and
below the ~400-line new-content heuristic for `src/`. **No split proposed.** If a
later round bursts it, the natural seam is the `state/residue/` area contract; that
remains an owner decision to be flagged, never taken by the author.

## STOP CRITERION — RE-STATED for round 3, with a PRE-PINNED SWITCH

- **Closes:** one external round returns no finding about the PRODUCT — the fence and
  its visibility invariant and stabilization protocol (Table A), the classification
  primitive (Table B), relocation and the residue area (Table C), the pre-spawn assert
  (Table D), the bridge, or the named residuals.
- **THE SWITCH (pinned in advance, per the owner's ruling):** if the next round lands
  again on the **preservation/visibility family** — now on the NEW design — it goes
  back to the owner, and the **ruling-default is re-chartering the package on a
  filesystem-inventory basis**. The middle path gets **exactly one chance**. This is
  written down before the round so that the outcome cannot be argued about afterwards.
- **Escalates otherwise:** two consecutive rounds on any other same contract family →
  contract extraction, not another patch. Two consecutive rounds on the owner rulings
  → owner ruling request.
- **Surface frozen:** ZERO new source-level assertions; round zero measured why source
  greps cannot assert these contracts. The behavioural both-directions requirement is
  not machinery growth — it is evidence discipline on tests the implementer writes
  anyway.
- **Scope frozen:** C1 is the fence. A finding belonging to C2 or C3 is routed, never
  folded in. The bridge is the single sunsetted exception and is not a precedent.

## Round 3 — THE PRE-PINNED SWITCH FIRES

Read-only verified; the SCOPE RULE held a third time (empty routed section, with an
argument for why finding 1 is C1's and not C2's). Verdicts: R2-1 **NOT FIXED**, R2-4
**NOT FIXED**, R2-2/3/5/6/7 **PARTIALLY FIXED**, five new findings.

The orchestrator re-ran the three decisive claims. **All three reproduced.**

### The measurement that settles it

A steered dream writes an untracked root `.gitignore` containing `*`, plus an
untracked `CLAUDE.md`. Measured:

```text
git status --porcelain -z -uall   ->  (EMPTY)
git check-ignore .gitignore       ->  exit 0 (it hides itself)
git reset --hard HEAD; git clean -fd
  .gitignore survives? YES
  CLAUDE.md  survives? YES
```

**The fence's only input is empty.** Nothing enters the classification primitive, the
visibility probe, relocation, the report, or the staged-set fixpoint. No denial is
recorded because no candidate exists. The crash path preserves both files. The user's
own harness sessions in the vault then read the planted instruction file — which is
M7, untouched, by a channel the dream created itself inside the tree.

Also reproduced: the `lstat`→`checkout` TOCTOU destroys a concurrent user save
(`ENOENT` at classification, non-empty directory created, `checkout` exits 0 and
deletes it silently); and a hard link shares `(dev, ino)` with the bridge's report
leaf (`nlink=2`, identical device and inode), so leaf-identity matching cannot admit
exactly one path.

### The switch, as pinned in advance

Before round 3 this record said, verbatim: *"if the next round lands again on the
preservation/visibility family — now on the NEW design — it goes back to the owner,
and the ruling-default is re-chartering the package on a filesystem-inventory basis.
The middle path gets exactly one chance."*

It landed on both halves of that family: **visibility** (R2-1 not fixed; new finding 1)
and **preservation** (R2-2 partial with a reproduced data-loss race; new findings 2
and 3). The middle path had its one chance.

**No revision is made.** Per the pinned default, this returns to the owner with the
re-charter as the standing proposal. Two things are worth recording for that decision:

- **The reviewer's own remedy for finding 1 IS the inventory** — "a
  Git-status-independent, no-follow inventory for control filenames", explicitly
  narrowed to C1's code-owned denial names rather than all ignored user data. That is
  the middle path's replacement arriving from the outside, independently.
- **The evidence now points at the primitive, not the package.** Git-as-sensor failed
  on its own terms here: the sensor can be blinded from inside the tree by the very
  file class C1 exists to deny. The relocation design, the classification primitive
  and the stabilization protocol are all sound work that a re-chartered package keeps
  — what changes is where the candidate set comes from.

Finding 5 (C1 is not one session's work; a suggested internal C1a/C1b/C1c split) is
**not adjudicated here**: under a re-charter its premises change, and splitting is an
owner decision in any case. It is carried forward, not dropped.

## Owner ruling — the re-charter (2026-08-20), and the size verdict

**The pinned default is CONFIRMED: C1 re-charters onto a filesystem-inventory
fence.** The decisive measurement and the hard-link identity fact were both replayed
independently by the advisor. The package keeps its identity — it was never
implemented, so there is no supersede; the Draft is rewritten in place and this round
log continues. The next external round is **round 4**.

### What changed, and what did not

**One thing changed: where the candidate list comes from.** A git-independent,
no-follow inventory walk over the vault, **pinned narrow** to exactly the code-owned
denial names — `.gitignore` at any depth plus the four instruction basenames — and
explicitly NOT all ignored user data. That is the reviewer's own narrowing, adopted
unchanged. The inventory feeds two consumers: the fence's candidate set and the
pre-spawn assert, so the two can never disagree about what is in the vault.

**The load-bearing argument for why narrow suffices** is now spec text: the inventory
only has to find the *hiding mechanism* and the *instruction files*. Everything else
rule 1 denies becomes visible to git the moment the hiding `.gitignore` is denied and
the set recomputed. A narrow inventory plus recomputation covers the broad rule
without ever enumerating the user's ignored data — which is exactly what the
2026-08-05 ruling forbade by refusing `git clean -x`.

**Everything else from three rounds survives:** relocation as the fourth state, the
no-follow classification primitive, the commit-boundary stabilization protocol, and
the visibility invariant.

### The other four ruling items, as landed

- **R2-5/R2-6 hardening folded in:** `O_EXCL|O_NOFOLLOW` temp open, identity check
  after opening, ancestor revalidation at the rename boundary, and an explicit
  hard-link disposition — a leaf with `nlink > 1` is replaced by a fresh leaf, never
  written through. Bridge matching becomes a **compound** identity (verified parent
  chain + leaf spelling under it), because measured leaf-inode equality exempts every
  hard-link alias (`.evil.md` shares `(dev, ino)`, `nlink=2`).
- **The classify→act race:** action-time revalidation, and the irreducible remainder
  is a **named residual** on the EP2 precedent. **No atomicity is claimed** — what
  cannot be guaranteed is not asserted.
- **Disk-fill honesty:** the "same-filesystem rename allocates no blocks, so disk-fill
  is irrelevant" claim is **withdrawn** — the round disproved it (`rename(2)` returns
  `ENOSPC` when the destination directory must be extended). Replaced by a
  traceability contract plus fault-injection acceptance cases in which relocation, the
  pairing index and the report each fail independently.
- **The visibility invariant is re-keyed to the PRE-BRAIN ignore state**, which a
  per-candidate probe could not express. It also settles the converse correctly: a
  file the DREAM hid during the run was not hidden pre-brain, so the fence may act on
  it.

### SIZE SELF-CHECK after the re-charter — the verdict

| Metric | Value | Ceiling / heuristic |
|---|---|---|
| Spec lines | **471** | ~400 for new non-test content; the spec itself is now well past the shape a single session absorbs |
| Deliverable files | **5** | ≤ 8 — passes |
| Contract-table fact rows | **62** | — |
| Acceptance criteria | **24** | several carry multiple independently fail-able behaviours |
| Named residuals | **14** | — |
| Distinct mechanisms | **13** | round 3 counted 12 before the inventory was added |

**Verdict: it does NOT fit one implementer session.** The file-count ceiling passes,
and that is the only heuristic it passes. Round 3's finding 5 already argued this at
414 lines and 12 mechanisms; the re-charter adds a mechanism and 57 lines, so the
argument is stronger now, not weaker. The honest reading of `docs/specs/README.md`
("S (< 1 focused hour) or M (one session); L is forbidden — split it") is that this is
an L.

**The split decision is the owner's and is not taken here.** The named fallback is
round 3's three-way seam, which survives the re-charter with the inventory joining the
first package:

1. **C1a** — the inventory, the visibility invariant, and staged-set stabilization.
2. **C1b** — no-clobber restoration, the relocation transaction, recovery lifecycle,
   and the pre-spawn assert.
3. **C1c** — the temporary report bridge: compound identity and atomic replacement.

If an insecure intermediate state would result from landing these separately, the
sequencing question ("land helpers first, activate the fence last") comes with it.

## STOP CRITERION — for round 4, on the inventory design

- **Closes:** one external round returns no finding about the PRODUCT — the inventory
  and its narrow pin (Table A), the fence and its visibility invariant and
  stabilization protocol (Table B), the classification primitive (Table C), relocation
  and the residue area (Table D), the pre-spawn assert (Table E), or the named
  residuals.
- **THE ESCALATION, pinned in advance:** if round 4 lands again on the
  **preservation/visibility family** — now on the INVENTORY design — it returns to the
  owner as a ruling request, **and rethinking the package itself is on the table**, not
  merely its mechanism. Two designs will have failed the same family.
- **Otherwise:** two consecutive rounds on any other same contract family → contract
  extraction. Two consecutive rounds on the owner rulings → owner ruling request.
- **Surface frozen:** ZERO new source-level assertions. The behavioural
  both-directions requirement stands and does not grow.
- **Scope frozen:** C1 is the fence. C2/C3 findings are routed, never folded in.

## Owner ruling — the two-way split (2026-08-20)

### Metric correction to the size verdict above

The README's ~400-line heuristic governs the **implementation's new non-test
content**, not the spec's line count; the "471 > ~400" cell in the table above was
mislabelled and is corrected here rather than silently edited. **The verdict stands
on three independent legs:** thirteen mechanisms violate the "zero and-also clauses"
heuristic; round 3's external finding 5 argued the same at 414 lines and twelve
mechanisms; and twenty-four acceptance criteria are a large surface on their own.

### The cut: two packages, on the eye/hand boundary

Not round 3's three-way seam. The third piece would have been S-sized ceremony and
would have created a seam where none exists today — the bridge is one mechanism with
the stabilization protocol and is not cut across. The boundary chosen is the one the
two repeatedly-failing families sat astride:

- **HAND — `WP-dream-denied-object-disposal`:** the classification primitive with
  action-time revalidation, no-clobber restoration, the relocation transaction, the
  residue area, pairing, fault injection, the pre-spawn assert. Everything that
  touches the disk.
- **EYE — `WP-dream-fence-candidate-set`:** the inventory walk, the denial rules, the
  visibility invariant, the recompute ordering, the stabilization protocol, the report
  bridge. Everything that decides and accounts for what enters the commit.

**Order: the HAND first.** On today's candidate set it is already a strict security
improvement — relocation replaces destruction, with no new denial surface and no new
risk — so if the day slips, every stopping point is safer than the one before it. The
EYE follows, commanding a hand that is already safe, and `depends_on` records it.

**A boundary decision the author made and is flagging:** the HAND adds **no denial
rules**, so it needs no report bridge and creates no interval in which a `.reports`
user's report could be denied. It therefore closes **no audit finding on its own** —
both successor specs say so in their own words, so neither can be cited as closing M7
or M10. The EYE carries the rules, the bridge and the closure together.

**Merge discipline:** stacked PRs, merged **together**, only after both are green on
both review gates. No night may run on half a fence.

**Bookkeeping:** the 471-line spec goes Superseded and moves to `done/` with a
two-successor banner, per the precedent this program already set. Each successor
starts a **fresh round counter** and gets its own round record.

**Branch discipline:** the implementation dispatches take their own `wp/<slug>`
branches — that is where the long-deferred branch rename lands. The spec split itself
stays on the current branch as documentation commits.

### The family escalation, inherited VERBATIM by both successors

Carried word for word into each successor's stop criterion, as ruled:

> If a round of either part lands again on the **preservation/visibility family**, it
> returns to the owner as a ruling request, **and rethinking the package itself is on
> the table** — not merely its mechanism.

The no-split option was weighed and rejected: the size rule here is not
administration but the day's measurement, and an exemption would invite back the
failure mode that was measured.
