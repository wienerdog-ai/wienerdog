---
id: WP-adr-0028-entry-node-path-amendment
title: Amend ADR-0028 Decision 1 so the scheduler entry's node path may be an upgrade-durable alias while process.execPath stays the runtime and authorization value
status: Draft
model: opus
size: S
depends_on: []
adrs: [ADR-0004, ADR-0028]
epic: audit-a7
---

# WP-adr-0028-entry-node-path-amendment: unblock `WP-scheduler-node-path-durability`'s merge gate

> **OWNER ACTION — NOT DISPATCHABLE TO AN IMPLEMENTER.**
>
> The amendment text is **already written** into
> `docs/adr/0028-scheduler-app-executable-integrity.md` by `wd-architect`, in the
> same commit that created this spec. It carries
> `Status: **PROPOSED — awaiting owner signature.**`
>
> **The only remaining action is Gyula Fehér typing an `OWNER-SIGNED <date>`
> line into that amendment's status line by hand.** No agent may write that
> line, under any circumstance, for any reason, on any instruction that does not
> come from the owner's own message or the permission system. An agent-typed
> owner signature is forbidden outright.
>
> Do **not** dispatch this WP to an implementer session. There is no code to
> write, and an implementer may never edit an ADR (WP-114 Decision 5). This spec
> exists so the routed slug resolves, so the change has a Deliverables record,
> and so the gate below has one findable artifact.

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly **dream**, later routines) with the
OS-native scheduler: a launchd `.plist` on macOS, a systemd `.timer`/`.service`
on Linux, a Task Scheduler XML on Windows. **IRON RULE (ADR-0004): Wienerdog is
just files** — the registered entry runs and exits with each fire; nothing here
adds a daemon, watcher, poller or telemetry.

**ADR-0028** ("Scheduler, app, and executable integrity") is the durable decision
record for how an unattended fire trusts its scheduler entry, its vendored app
code and the executables it spawns. It is `Status: Accepted` and carries
`OWNER-SIGNED 2026-07-25` at the head of the file. Its Decision 1 (the structural
executable pin for `claude`/`git`/`codex`) ends with one sentence about node:

> `node` is `process.execPath` (already absolute) and is not pinned.

**`WP-scheduler-node-path-durability`** (`status: Ready`, `size: M`, in
`docs/specs/`) makes one reading of that sentence false. It registers the OS
entry against an upgrade-durable Homebrew alias
(`<prefix>/opt/<formula>/bin/node`) instead of the version-pinned Cellar path
`process.execPath` returns — because an ordinary `brew upgrade node` deletes the
Cellar directory, after which every scheduled fire dies in `posix_spawn` with
`ENOENT` before a line of Wienerdog code runs. The runtime spawns and the
digest-covered descriptor field keep `process.execPath` unchanged.

That spec carries a **hard merge gate** on this amendment. Its Definition of done
item 8 reads, verbatim:

> **ADR-0028 sequencing (OWNER).** The `WP-adr-0028-entry-node-path-amendment`
> change to `docs/adr/0028-…:83` has landed, or that line carries an
> owner-written annotation naming this WP, **at or before** this WP's merge.
> This WP does not merge leaving an owner-signed ADR line silently false.

(That is item **8** of its numbered Definition of done; the leading `8.` is
dropped from the quote above only so this document's own list numbering stays
lintable.)

and its Mirrored Surface Checklist repeats the requirement with the reason:

> **Sequencing is not optional and is not left to a routed slug:** the amendment
> must land **with or before** this WP's merge […] Knowingly merging code that
> falsifies an owner-signed ADR line, with no ordering requirement attached, is
> what round 1 did and it is not acceptable.

## Current state

Read and re-verified first-hand against the working tree at commit **`e7c845e`**
on **2026-08-01**.

1. **`docs/adr/0028-scheduler-app-executable-integrity.md:83`** reads exactly:
   `` `node` is `process.execPath` (already absolute) and is not pinned. ``
   It is the last line of Decision 1's first paragraph. The file's head carries
   `Status: Accepted` (`:3`) and `OWNER-SIGNED 2026-07-25` (`:6`).
2. **The ADR already carries four dated amendments** (2026-07-19, 2026-07-20 ×2,
   2026-07-25) plus one from 2026-08-01, each a `## Amendment (<date>) — <title>`
   section appended to the end of the file, each with its own `Status:` line.
   The 2026-07-25 one also carries an explicit architect-authored note
   disclaiming any owner approval — the precedent this amendment's disclaimer
   follows.
3. **The code the amendment describes has NOT shipped.**
   `grep -n "entryNodePath" src/scheduler/generators.js src/cli/schedule.js`
   returns nothing at `e7c845e`; `nodePath()` at `src/scheduler/generators.js:20-22`
   still returns `process.execPath`, and `src/scheduler/descriptor.js:215` still
   writes `node: process.execPath`. So the sentence at `:83` is **true today**
   and becomes false only when `WP-scheduler-node-path-durability` merges. The
   amendment therefore records a decision ahead of its implementation, which is
   the correct order and is what "at or before" in the gate means.
4. **`WP-scheduler-node-path-durability` is not merged**: its spec is in
   `docs/specs/` (not `docs/specs/done/`) with `status: Ready`.
5. **`docs/adr/README.md`'s index row for 0028** reads
   `| [0028](0028-scheduler-app-executable-integrity.md) | Scheduler, app, and executable integrity — pins, descriptors, out-of-tree launcher | Accepted |`
   — no amendment annotations, consistent with all five existing amendments
   having left it untouched.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/adr/0028-scheduler-app-executable-integrity.md | **ALREADY WRITTEN by the architect in this spec's commit — do not author it, do not revise it.** One appended amendment section, headed *"Amendment (2026-08-01) — the scheduler ENTRY's node path is an upgrade-durable alias; process.execPath stays the runtime and the authorization value"*, carrying `Status: PROPOSED — awaiting owner signature.` Listed so the boundary check permits its presence in this branch's diff, and so the Deliverables record is exhaustive. **The one remaining edit — replacing that status line with a hand-typed `OWNER-SIGNED <date>` — is the OWNER's, and no agent may make it.** |
| modify | docs/specs/WP-scheduler-node-path-durability.md | **D2 — four places, all already edited by the architect.** (a) Definition of done item 8 and (b) the matching Mirrored Surface Checklist entry each offered a second way to satisfy this gate — *"or that line carries an owner-written annotation"* on `docs/adr/0028-…:83` — which **conflicts with this spec's append-only rule** and with ADR-0028's convention; withdrawn in both. (c) **DISPATCH BLOCKER sub-item 0a's claim that the sibling "merged to `main` in PR #125"** is corrected: `git show --stat fbc9d80` merged **three docs files, zero `src/`, zero `tests/`** — the spec, not the implementation — and the banner gains an explicit **DISPATCH PRECONDITION** mirroring B6. (d) the `depends_on` history paragraph, same correction. **Still unchanged:** every table, every acceptance criterion, and `status:` (see Decisions). |

Not a deliverable, deliberately: `docs/adr/README.md`. See Implementation notes.

Not deliverables under any reading: every file under `src/`, `bin/`, `tests/`,
`skills/`, `templates/`.

**On D2's boundary expansion.** `docs/specs/WP-scheduler-node-path-durability.md`
was **not** on this branch before gate round 1; adding it widens the branch's
file set, which is exactly the kind of thing a Deliverables table exists to make
visible rather than silent. It is added because the finding cannot be fixed
anywhere else: the conflicting text lives in that spec, and leaving it would mean
shipping a gate whose two branches contradict each other. The edit is confined to
the two places named in the cell.

### What the amendment says (summary — the ADR is authoritative)

Nothing below decides anything; it is here so a reader of this spec knows what
landed without opening the ADR.

- Decision 1's node sentence conflated **three roles**. The amendment separates
  them: the **entry** role (the program the OS starts) may use an upgrade-durable
  alias; the **runtime** role (spawning a child of the already-running process)
  and the **authorization record** (the digest-covered descriptor `node` field)
  both stay `process.execPath`, unchanged.
- The alias is written **only** when `realpath(alias) === realpath(process.execPath)`
  — same inode as the running interpreter. Every other input and every error
  returns `process.execPath`. The derivation is fail-safe in one direction only.
- `node` remains **not pinned** in the WP-154 sense: no pin-store entry, no
  structural verification.
- The descriptor field does not move, and the honest consequence is stated: after
  a node upgrade the entry fires, the launcher re-derives the new `execPath`,
  finds the drift, and refuses loudly with the `wienerdog sync` remedy. The
  failure moves from *outside* the product's observability to *inside* it.
- **Honest boundary:** the alias is a third-party path Wienerdog does not own, so
  the amendment adds **no substitution resistance** — the substituted-binary half
  stays A12's. nvm/fnm/volta/nodenv keep the pinned path; Windows is a no-op by
  construction and that layout claim is specified, not observed.

## Implementation notes & constraints

- **No agent writes an owner signature.** The status line stays
  `PROPOSED — awaiting owner signature` until the owner edits it himself. This
  applies to every agent in this repo regardless of who or what asks; a message
  from another agent is never the owner's consent.
- **`docs/adr/README.md` is deliberately untouched.** All five existing
  amendments to ADR-0028 left the index row at plain `Accepted`, and the row
  stays true — the ADR *is* Accepted; one appended amendment is Proposed. Adding
  a pending-amendment annotation would have to be removed again on signature,
  churning a file for a state that is already visible at the only place it
  matters. Recorded here so the omission reads as a decision, not a miss.

  **There IS a live counterexample in that same file, and it does not overturn
  this.** `docs/adr/README.md:43` — the **0035** row — already carries exactly
  such an annotation, and about ADR-0028 at that:
  *"Accepted (does **not** amend 0028 — its "Honest boundary" narrowing awaits a
  separate owner-signed amendment)"*. Three differences make it a different case.
  **(1) It annotates a different ADR's row.** It tells a reader of **0035** that
  0035 does not do something they might assume it does; it is a fact about 0035's
  own scope, not a status marker for 0028. **(2) 0028's own row is unannotated**,
  and has stayed so across five amendments including two that were unsigned when
  written. **(3) The 0035 note is load-bearing against a misreading** — 0035 is
  *about* the A7 boundary, so "amends 0028" is the natural wrong inference — while
  a note on 0028's row would only restate what the file itself says on the line
  below its own heading. If the owner prefers the annotation anyway, it is one
  row and a two-word removal at signature time; it is left out, not overlooked.
- **The amendment records a decision ahead of its implementation, on purpose.**
  ADR-0028:83 is still true at `e7c845e` (Current state §3). The gate's wording
  is "at or before", and "before" is the safe order: signing first means the code
  can never merge into a tree where an owner-signed line is false.
- **No ADR text above the new heading may be edited**, including Decision 1's
  sentence itself. This ADR's convention (stated in its own preamble) is that a
  later ruling "lands as a dated amendment to this ADR", never as an edit.

## Acceptance criteria — TWO NAMED STATES

**This WP passes through two different correct states, and a single criteria set
cannot describe both.** An earlier revision tried: it required the amendment to
read `PROPOSED — awaiting owner signature` (AC1) and the file to gain **no** new
dated owner marker (AC2), while *also* requiring Gyula's dated `OWNER-SIGNED`
marker before the WP could close (AC5). **After the very signature this WP exists
to obtain, AC1 and AC2 necessarily FAIL** — so the gate could never close
honestly, and the only way through was a manual waive. Found by the final Codex
pass; the fix is to name the states.

- **State A — PRE-SIGNATURE.** What the architect delivers and what every gate
  round has been checking. The amendment is written, appended, disclaimed, and
  **unsigned**.
- **State B — SIGNED-FINAL.** What closes this WP. The owner has typed the
  marker; the `PROPOSED — awaiting owner signature` line is discharged.

**Both states are correct in their turn. A criterion belongs to exactly one.**
Never evaluate a State A criterion against a State B tree, or vice versa.

### State A — PRE-SIGNATURE (agent-satisfiable; true today)

- [ ] **A1** — `docs/adr/0028-scheduler-app-executable-integrity.md` contains
      exactly one occurrence of `PROPOSED — awaiting owner signature`, inside the
      2026-08-01 entry-node-path amendment.
- [ ] **A2** — The file gains **no new dated owner marker**. The criterion is the
      section **"A2's worked example"** below — VA2's actual nine-line output with
      every line classified into one of four classes. It **is** the criterion, not
      an illustration of one.
- [ ] **A3** — Decision 1's sentence at `:83` is byte-identical to its
      pre-amendment text.
- [ ] **A4** — The architect-authored disclaimer is present in the amendment
      (*"this is NOT an owner signature, confers no approval, and no gate may key
      on it"*).
- [ ] **A5** — `npm run lint` is green.
- [ ] **A6 (D2)** — `docs/specs/WP-scheduler-node-path-durability.md`'s
      Definition of done item 8 and its Mirrored Surface Checklist entry both
      require the **owner-signed dated amendment** and both mark the
      owner-written-annotation branch **withdrawn**; **VA5's two absence greps
      both return `0`** (they return `1` on `main`, so the gate is not vacuous).
      Its DISPATCH BLOCKER banner carries the corrected 0a and the DISPATCH
      PRECONDITION. Nothing else in that file changed
      (`git diff -- docs/specs/WP-scheduler-node-path-durability.md` touches only
      those regions — paste it).

### State B — SIGNED-FINAL (owner-satisfiable ONLY; red today, by design)

**Every B criterion is red right now, and that is the correct reading of this
tree — not a defect.** They go green on exactly one event: **Gyula typing the
marker.** This is the one gate in this repo that **no agent, and no amount of
work, can turn green** — which is the honest statement of what this WP is.

- [ ] **B1 (OWNER, blocking)** — the amendment's `Status:` line carries a
      **hand-typed** `OWNER-SIGNED <date>`, and the
      `PROPOSED — awaiting owner signature` text is **discharged** (replaced by
      that marker). **A1 is expected to fail in State B; that is the transition,
      not a regression.**
- [ ] **B2** — **Exactly ONE new dated owner marker exists**, and it is the one at
      the entry-node-path amendment. The A2 worked example is updated in the same
      owner pass to carry it as a **fifth [1] MARKER** row.
- [ ] **B3** — **All four pre-existing dated markers are byte-unchanged**:
      `OWNER-SIGNED 2026-07-25` (`:6`), `OWNER-APPROVED (2026-07-19)` (`:8`),
      `OWNER-SIGNED 2026-07-26` (`:752`), `OWNER-SIGNED 2026-08-01` (`:978`).
      Signing this amendment ratifies **this amendment**, nothing else.
- [ ] **B4** — **The pure-append property still holds against the signed tree**:
      every byte of `docs/adr/0028-…md` **above the 2026-08-01 entry-node-path
      amendment heading** is byte-identical to `e7c845e`. The signature edits one
      status line **inside** the appended section and nothing above it —
      including Decision 1's `:83`, which A3 pinned and B4 re-pins.
- [ ] **B5** — `npm run lint` is green.
- [ ] **B6 (NOT discharged by B1)** — the signature satisfies the **ADR gate
      only**. Dispatching `WP-scheduler-node-path-durability` additionally
      requires its `depends_on` spec,
      `WP-scheduler-register-replaces-loaded-record`, to be **`Done`** (merged
      **and** verified), per the standing dispatch discipline in
      `docs/specs/README.md`. **Nothing mechanical enforces this:**
      `scripts/check-frontmatter.js` resolves a `depends_on` id to an existing
      spec **file** and never reads that spec's `status`. Verified at `e7c845e`:
      that dependency is `status: Draft` and is **not** in `docs/specs/done/` —
      PR #125 (`fbc9d80`) merged its **spec document**, not its implementation —
      so the hazard it closes is still live. **Do not read a signed amendment as
      clearance to dispatch.**

**B6 is the only criterion that survives into State B unchanged from A**, because
it is not about the signature at all. Everything else in State B either replaces
an A criterion (B1 ↔ A1, B2 ↔ A2) or re-pins one against the new tree (B3/B4 ↔
A2/A3).

### A2's worked example — VA2's actual output, every line classified

Nine lines, four classes. **This block is the criterion**; compare VA2's output
against it line for line.

**This is the STATE A roster.** In State B it gains **one** row — the owner's new
marker at the entry-node-path amendment, classified **[1] MARKER** — and nothing
else changes. Updating it is part of the owner's signature pass (B2).

```text
6:OWNER-SIGNED 2026-07-25                                        [1] MARKER
8:> **OWNER-APPROVED (2026-07-19).** The owner ratified …         [1] MARKER
14:> resolved as dated `OWNER-APPROVED` markers across the …      [2] CONVENTION
752:Status: **Accepted. OWNER-SIGNED 2026-07-26.**                [1] MARKER
760:`OWNER-SIGNED 2026-07-25` line at the head of the file, and … [3] BACK-REF
978:Status: **ACCEPTED — OWNER-SIGNED 2026-08-01**                [1] MARKER
1224:Fehér types an `OWNER-SIGNED <date>` line into it by hand …  [4] PLACEHOLDER
1225:heading — not the `OWNER-SIGNED 2026-07-25` line at the …    [3] BACK-REF
1342:`OWNER-SIGNED <date>`, the gate is **not** satisfied …       [4] PLACEHOLDER
```

- **[1] Marker** — the four dated ratifications. **Cited by line, and only these
  are**, because the ADR change is a pure append and an append cannot move them.
- **[2] Convention** — a generic mention of the marker *convention* that names
  none of the four. `:14` is one. **An earlier three-class roster had no home for
  it, so a strict verifier would have failed a correct file** — that omission is
  the finding this section closes.
- **[3] Back-reference** — prose naming one of the four markers.
- **[4] Placeholder** — **identified by containing the literal
  `OWNER-SIGNED <date>`**, angle brackets and all, never by line number.

**The numbers on the [2] / [3] / [4] rows are a snapshot of one run — match those
rows by CLASS AND CONTENT, not by number.** They sit inside the amendment body
and shift on any future edit above them. Only the **[1] MARKER** rows have pinned
numbers, because the ADR change is a pure append and an append cannot move the
base region.

**Line numbers inside the amendment BODY are structurally unstable** — this
spec's own §5 insertion moved §6 from `:1331` to `:1342` within a single commit,
which is exactly why classes 2–4 are content-identified and only class 1 carries
line numbers. **A placeholder is not a signature; an agent may never replace
`<date>` with a real date.**

## Verification steps

**Run the set that matches the state you are in.** The `VA*` commands verify
State A and pass today. The `VB*` commands verify State B and **fail today by
design** — they are the owner's, and nothing an agent does turns them green.

### State A — PRE-SIGNATURE

```bash
# VA1 (A1) — exactly one PROPOSED marker, in the new amendment.
grep -n "PROPOSED — awaiting owner signature" docs/adr/0028-scheduler-app-executable-integrity.md

# VA2 (A2) — no NEW dated owner marker. Compare the output line-for-line against
# "A2's worked example", the actual nine-line output with every line classified.
# Deliberately NO line numbers restated here: only the four base-region markers
# have stable lines (the change is a pure append); anything inside the amendment
# body moves whenever the body is edited.
grep -n "OWNER-SIGNED\|OWNER-APPROVED" docs/adr/0028-scheduler-app-executable-integrity.md

# VA3 (A3) — Decision 1's sentence is unchanged.
sed -n '83p' docs/adr/0028-scheduler-app-executable-integrity.md

# VA4 (A4) — the architect disclaimer is present. Expect ONE matching line.
# TWO traps in this one grep, both hit while writing it:
#  (a) the disclaimer WRAPS ("…this is NOT an owner / signature, confers no
#      approval…"), so a grep for the full phrase matches NOTHING — grep is
#      line-oriented, so pick a fragment that lives on one line;
#  (b) "confers no approval" ALSO appears in the 2026-07-25 amendment's own
#      architect note (`:755`), so it returns two lines and cannot tell you
#      whether THIS amendment carries one. "no gate may key on it" is unique.
grep -n "no gate may key on it" docs/adr/0028-scheduler-app-executable-integrity.md

# VA5 (A6, D2) — the annotation branch is withdrawn in BOTH places, and DoD
# item 8 now requires the signature. Do NOT grep for "owner-written annotation":
# that phrase legitimately survives INSIDE the quoted, marked-withdrawn text in
# both places, so it cannot distinguish "removed" from "still offered".
# Expect: 2, then one matching line, then 0 and 0.
grep -c "withdrawn" docs/specs/WP-scheduler-node-path-durability.md
grep -n "carries the owner's hand-typed signature" docs/specs/WP-scheduler-node-path-durability.md
#
# THE NEXT TWO ARE ABSENCE CHECKS. A later editor must not "fix" a 0 by
# re-adding the text — 0 is the passing result, and a 1 means the annotation
# branch is being offered again.
grep -c "has landed, or that line carries" docs/specs/WP-scheduler-node-path-durability.md
grep -c "merge, or ADR-0028:83 must carry" docs/specs/WP-scheduler-node-path-durability.md

# VA6 (A5)
npm run lint
```

**Untouched-`main` baselines** (`git show e7c845e:docs/specs/WP-scheduler-node-path-durability.md`),
so every VA5 gate is proved red-before-green rather than asserted:

| Gate | on `e7c845e` | after D2 |
|------|--------------|----------|
| `grep -c "withdrawn"` | `0` | `2` |
| `grep -n "carries the owner's hand-typed signature"` | no output | one line |
| `grep -c "has landed, or that line carries"` | **`1`** | **`0`** |
| `grep -c "merge, or ADR-0028:83 must carry"` | **`1`** | **`0`** |

The last two rows run **1 → 0**, which is the direction that proves the offer was
really removed and not merely reworded around: each pattern spans the *operative*
wording of one old branch, and the quoted marked-withdrawn copies reproduce only
a fragment of each, deliberately.

Expected VA3 output, byte-exact:

```text
`node` is `process.execPath` (already absolute) and is not pinned.
```

### State B — SIGNED-FINAL (red today; only Gyula's signature turns these green)

```bash
# VB1 (B1) — the PROPOSED line is DISCHARGED. Expect NO output, exit 1.
# This is the exact inverse of VA1: A1 requires the line, B1 requires its absence.
grep -n "PROPOSED — awaiting owner signature" docs/adr/0028-scheduler-app-executable-integrity.md

# VB2 (B1, B2) — exactly FIVE dated markers now, the new one at the amendment.
# Compare against the worked example UPDATED in the signature pass.
grep -n "OWNER-SIGNED\|OWNER-APPROVED" docs/adr/0028-scheduler-app-executable-integrity.md

# VB3 (B3) — the four pre-existing markers are byte-unchanged.
sed -n '6p;8p;752p;978p' docs/adr/0028-scheduler-app-executable-integrity.md

# VB4 (B4) — PURE-APPEND still holds against the SIGNED tree. Compare the WHOLE
# base file against the HEAD of the current one; the base's own line count is the
# boundary. Expect no diff output and exit 0.
#
# Do NOT derive the boundary from the amendment heading's line number minus one:
# the append introduced a blank separator line ABOVE the heading, so that form
# reports a spurious one-line delta (measured — it did, on the first draft).
BASE=docs/adr/0028-scheduler-app-executable-integrity.md
BASE_LINES=$(git show "e7c845e:$BASE" | wc -l | tr -d ' ')
diff <(git show "e7c845e:$BASE") <(head -n "$BASE_LINES" "$BASE") \
  && echo "VB4 ok — pure append preserved through the signature"

# VB5 (B5)
npm run lint
```

**VB1 and VB2 are red on this branch and must stay red until the owner signs.** A
green VB1 today would mean an agent removed the `PROPOSED` line; a green VB2
today would mean an agent wrote a dated owner marker. **Either is a violation, not
progress** — see "no agent writes an owner signature" in Implementation notes.

**VB3 and VB4 already pass today, and that is correct** — they assert *invariants*
the signature must not break (the four pre-existing markers, and the pure-append
property), not the signature itself. They are in State B because they must be
**re-run after** the signature, where they are the only thing standing between a
one-line status edit and an accidental rewrite of the base region. Verified on
this branch: VB4 prints `VB4 ok — pure append preserved through the signature`.

## Out of scope (do NOT do these)

- Implementing `entryNodePath` or touching any file under `src/` — that is
  `WP-scheduler-node-path-durability`'s entire Deliverables table.
- Editing `docs/specs/WP-scheduler-node-path-durability.md` **beyond D2's
  two-place reword** — not its DISPATCH BLOCKER banner, not Tables A–F, not its
  acceptance criteria, not its status. (This exclusion was total until gate
  round 1; D2 carves out the minimum needed to remove a self-contradicting gate
  branch.)
- Editing `docs/adr/README.md` (see Implementation notes).
- Moving the descriptor's `node` field off `process.execPath` — a separate
  change that must land after ADR-0037's verified-registration postcondition is
  in force on every platform.
- Any Windows verification of the layout claim. The amendment states it as
  specified-not-observed; confirming it is an owner checklist item on
  `WP-scheduler-node-path-durability`, not work here.

## Definition of done

**The WP closes in STATE B, not State A.** State A is the deliverable; State B is
the completion. Read the two criteria sets before checking anything off.

1. **State A reached** — the amendment section exists in ADR-0028 with
   `Status: **PROPOSED — awaiting owner signature.**` (done in this spec's
   commit), and **A1–A6 all pass**.
2. **VA1–VA6 pass**; output pasted into the PR body. **VB1/VB2 are expected RED
   at this point** — paste them too, and say so, because a State-B gate that is
   green before the signature is a violation, not progress.
3. **The owner types the `OWNER-SIGNED <date>` line.** Not an agent. Ever. This
   is the only step that moves the WP from State A to State B, and **no amount of
   agent work substitutes for it**.
4. **State B verified** — after step 3, **B1–B5 all pass** and **VB1–VB5 are
   re-run**, including VB3/VB4, which are what catch a signature pass that
   accidentally touched the base region. The A2 worked example is updated in the
   same pass to carry the new marker as a fifth `[1] MARKER` row (B2).
5. Only after 4: `WP-scheduler-node-path-durability`'s Definition of done item 8
   is satisfied and its implementation PR may merge. **That is the ADR gate
   alone.** Dispatching that WP *also* requires
   `WP-scheduler-register-replaces-loaded-record` to be `Done` — merged and
   verified — which at `e7c845e` it is **not** (`status: Draft`, absent from
   `docs/specs/done/`). See **B6**; the two gates are independent and neither
   discharges the other.
6. This spec's `status:` moves to `Done` and the file moves to `docs/specs/done/`
   in the owner's signature pass — not before, because until then the gate this
   spec exists to hold is still open.

> **Provenance.** Drafted 2026-08-01 by `wd-architect` to unblock
> `WP-scheduler-node-path-durability`'s Definition of done item 8. Gate round 1:
> **APPROVE** with fold-ins (pure-append proven by `cmp`; owner-marker sweep
> clean). Gate round 2: **APPROVE-CONFIRMED** with two fold-ins, both applied
> here:
>
> - **(b) AC2 and V2's comment cited placeholder line numbers that were stale on
>   arrival.** They named `:1224/:1331`, but this spec's own §5 insertion into the
>   amendment moved §6 to `:1342` **within the same commit**. The reviewer's root
>   cause is the right one and is fixed structurally rather than by re-numbering:
>   **line numbers inside the amendment body are unstable by construction**, so
>   AC2 now identifies placeholders by their unfilled `<date>` **content** — which
>   is the actual criterion — and V2's comment points at AC2's roster instead of
>   restating it. **The four base-region markers keep their line numbers**,
>   because the change is a pure append and an append cannot move them.
> - **(b) V4 gained two absence greps**, each verified **1 → 0** against
>   `main`'s copy: `"has landed, or that line carries"` and
>   `"merge, or ADR-0028:83 must carry"`. They match the *operative* wording of
>   each withdrawn branch, which the quoted marked-withdrawn copies deliberately
>   reproduce only in fragment — so unlike a grep for
>   `"owner-written annotation"` they can distinguish *removed* from *still
>   offered*. Both are labelled **absence checks** in the spec so a later editor
>   does not "fix" a `0` by re-adding the text.
>
> No owner marker has been written at any point. The amendment still carries
> `Status: PROPOSED — awaiting owner signature.`
>
> **2026-08-01 — gate round 3 (verdict: APPROVE-CONFIRMED, one residual + one
> Codex finding). Both closed.**
>
> - **(b) AC2's roster claimed a total partition it did not achieve.**
>   `docs/adr/0028-…:14` — a generic prose mention of the `OWNER-APPROVED` marker
>   *convention*, undated in the marker sense and naming none of the four — fit no
>   class, so a strict verifier would have **failed a correct file**. This family
>   was on its third round, so the fix is structural rather than another patch:
>   class 2 is broadened to **"a generic reference to the marker convention
>   itself"**, and **V2's actual nine-line output is now pasted into AC2 with every
>   line classified inline**. The worked example *is* the roster. That ends the
>   assert-exhaustiveness-but-never-check-it pattern that produced all three
>   rounds of this finding.
> - **(a) Codex round 3 [high] — a signature would make the WP look
>   dispatchable while its dependency is unmerged.**
>   `WP-scheduler-node-path-durability` carries
>   `depends_on: [WP-scheduler-register-replaces-loaded-record]`, and
>   `scripts/check-frontmatter.js` **only resolves the id to an existing spec
>   file — it never reads that spec's `status`**. Verified at `e7c845e`: the
>   dependency is `status: Draft` and absent from `docs/specs/done/`; PR #125
>   (`fbc9d80`) merged its **spec document**, not its implementation. So the
>   silent-nonconvergence hazard it closes (a `sync` reporting success while
>   launchd/systemd still holds the pinned path) is **live in production**, and an
>   owner signing this amendment could reasonably read it as clearance to dispatch.
>   Closed with a completion-aware clause in three places — the amendment's §6
>   Sequencing, this spec's **AC5b**, and Definition of done item 4 — each stating
>   that the signature discharges the **ADR gate only**. No new mechanism, per the
>   brief.
>
> **Discovered issue, reported not fixed:** that WP's DISPATCH BLOCKER banner says
> the sibling *"merged to `main` in PR #125 (`fbc9d80`)"*. True of the spec
> document and its lift argument 0a (which was about scope coverage), but easy to
> misread as "the fix shipped". Re-wording it is outside this WP's Deliverables.
>
> **2026-08-02 — gate round 4 (verdict: APPROVE-CONFIRMED; one advisory, plus a
> serious discovered issue the reviewer escalated). Both closed.**
>
> - **(adv, taken)** The worked example now says in so many words that **the
>   numbers on the [2]/[3]/[4] rows are a snapshot of one run — match those rows by
>   class and content, not by number.** Only the [1] MARKER rows carry pinned
>   numbers, because a pure append cannot move the base region.
> - **(escalated, and it was right) DoD item 0a's "and it has shipped" was
>   FALSE.** `git show --stat fbc9d80` shows PR #125 merged exactly **three files**
>   — `docs/adr/0037-…md`, `docs/adr/README.md`, and the sibling **spec
>   document** — with **zero `src/` and zero `tests/`**. The
>   registration-replacement implementation never shipped, yet the DISPATCH
>   BLOCKER was lifted (spec → `Ready`, 2026-07-28) partly on that sub-item, while
>   the silent-nonconvergence hazard it closes is **live in production**. D2's
>   carve-out into `WP-scheduler-node-path-durability.md` is widened to fix it:
>   0a keeps its **true** half (the sibling spec exists and its scope covers Table
>   C rows 4 and 5) and loses the shipped claim; the banner names what actually
>   merged; the `depends_on` history paragraph gets the same correction; and an
>   explicit **DISPATCH PRECONDITION** is added, mirroring AC5b — dispatch requires
>   the sibling to be `Done`, which as of 2026-08-02 it is not.
>
> **Decision recorded: `status: Ready` is NOT reverted, and the question is
> flagged for the owner.** That flip was made in an owner-directed session, so
> reverting it silently would be the same overstep this branch already corrected
> once on WP-153. Instead the banner carries the precondition explicitly and says
> no dispatch may proceed on the strength of `status: Ready` alone. **Gyula
> decides: keep `Ready` with the precondition, or return the spec to `Draft` until
> the sibling ships.**
>
> **2026-08-02 — final Codex pass, [medium]: the gates contradicted the WP's own
> terminal state. CLOSED by splitting the criteria into two named states.**
>
> **The defect.** AC1 required the amendment to read
> `PROPOSED — awaiting owner signature` and AC2 required **no** new dated owner
> marker — while AC5/DoD required Gyula's dated `OWNER-SIGNED` marker before the
> WP could close. **After the very signature this WP exists to obtain, AC1 and AC2
> necessarily FAIL.** The gate could never close honestly; the only way through
> was a manual waive, which is precisely the outcome a gate is supposed to prevent.
>
> **The fix.** Two named states, each with its own criteria and its own V-set:
> **State A — PRE-SIGNATURE** (A1–A6 / VA1–VA6: the amendment written, appended,
> disclaimed, unsigned — what every gate round has been checking, and what passes
> today) and **State B — SIGNED-FINAL** (B1–B6 / VB1–VB5: the `PROPOSED` line
> discharged, **exactly one** new dated marker at the amendment, the four
> pre-existing markers byte-unchanged, the **pure-append property re-proved
> against the signed tree**, and the worked-example roster updated to carry the
> new marker as a fifth `[1] MARKER` row). A1's failure in State B is now
> **the transition, stated as such**, not a regression.
>
> **`VB1` and `VB2` are the one gate in this repo that no agent can turn green** —
> a green VB1 today would mean an agent deleted the `PROPOSED` line; a green VB2
> would mean an agent wrote a dated owner marker. Both are violations, not
> progress, and the spec says so where the commands live. **VB3/VB4 pass today by
> design**: they assert invariants the signature must not break, and their job is
> to be **re-run after** it. DoD now walks A → signature → B explicitly, and
> requires the red VB1/VB2 output to be pasted at step 2 so the pre-signature
> state is on the record.
>
> **Two defects in my own new gates, found by running them rather than reading
> them:**
>
> - **VA4 matched nothing.** The disclaimer wraps across a line break
>   (*"…this is NOT an owner / signature, confers no approval…"*) and `grep` is
>   line-oriented. The first repair then matched **two** lines, because
>   *"confers no approval"* also appears in the 2026-07-25 amendment's own
>   architect note (`:755`). Settled on `no gate may key on it`, which is unique —
>   both traps are recorded inline so the next editor does not re-introduce either.
> - **VB4 reported a spurious one-line delta.** Deriving the boundary from the
>   amendment heading's line number minus one excludes the blank separator the
>   append itself introduced. Rewritten to compare the **whole base file** against
>   the **head of the current one**, with the base's own line count as the
>   boundary — which is the actual definition of "pure append". Verified:
>   `VB4 ok — pure append preserved through the signature`.
>
> **Naming note for readers of the older provenance blocks above:** what those
> entries call `AC5b` is now **B6**, and `AC2`'s worked example is now
> **A2's**. The renaming is this round's; the content is unchanged.
