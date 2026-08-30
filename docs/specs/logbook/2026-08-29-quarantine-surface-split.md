---
title: Why issue #165 became four work packages, and how the one-home principle re-derived the graph
date: 2026-08-29
related_wps: [WP-quarantine-warnings-file, WP-doctor-quarantine-counts, WP-quarantine-banner-decay, WP-dream-report-run-skips]
---

# The quarantine-surface split

Issue #165 ("Unbounded quarantine banner crowds out the digest") proposed four
pieces. The owner ratified them on 2026-08-29 with two modifications, applied in
two passes, and **the second one changed the shape of the family, not just one
package.**

- **Pass 1 — the banner gains a 7-day decay window** (the issue proposed a
  permanent count-banner). This turned a flat list of four into a chain.
- **Pass 2 — the enumeration has exactly ONE home.** Ratified against the first
  draft of the doctor package, which had `doctor` printing all 191 names:
  *"I don't see 191 lines being useful to the user; they can open the file the
  pointer names anytime."* The principle generalizes past `doctor`: **the full
  list lives in `reports/warnings.md` and nowhere else; the digest banner,
  `wienerdog doctor` and the dream report all carry exact counts plus a pointer.**

## What pass 2 actually changed

It looks like a scoping note on one package. It is a graph change.

**Before:** the doctor package owned a per-file enumeration, so it needed a ledger
size reader; the warnings package reused that reader, so warnings depended on
doctor; the banner's sentence named both surfaces, so the banner depended on both.
A linear chain, doctor first.

**After:** doctor prints no names, so it needs no size reader — and the reader
moves to `WP-quarantine-warnings-file`, the only surface that renders a size. That
inverts the doctor↔warnings edge. And because doctor now *points at* the warnings
file, it depends on it.

| # | Package | `depends_on` | Why |
|---|---|---|---|
| 1 | `WP-quarantine-warnings-file` | — | the enumeration's one home; every sibling points at it. Owns the size reader and exports the path constant |
| 2 | `WP-doctor-quarantine-counts` | `[1]` | its pointer line names that file, and its missing-file branch promises "the next dream run writes it" |
| 2 | `WP-quarantine-banner-decay` | `[1]` | same pointer, same reason |
| 3 | `WP-dream-report-run-skips` | `[1, WP-quarantine-banner-decay, WP-dream-promote-in-workspace]` | same pointer, plus the in-flight rewrite of the report, plus the banner edge below |

**The chain became a fan.** Packages 2 and 2 are now genuine parallel siblings —
they no longer touch a shared file and neither blocks the other. That is not a
happy accident: it is what happens when three surfaces stop each owning a copy of
the same list and start deferring to one owner.

> **Amended 2026-08-30, PR review gate (owner-flagged).** The fan claim held for
> the two tier-2 packages and was read one package too wide. The banner package
> and package 4 both modify `src/core/dream/ledger.js`,
> `tests/unit/ledger.test.js` and `tests/integration/dream.test.js`, so parallel
> dispatch guarantees a three-file merge conflict — the tier order above says
> banner-before-report, and a tier order is prose no dispatcher reads.
> `WP-quarantine-banner-decay` is therefore in package 4's `depends_on`, and the
> table row above records it. **It is an ORDERING edge, not a contract one**: no
> claim of package 4 rests on the banner's, and the edge delays nothing, because
> `WP-dream-promote-in-workspace` already gates that package. Packages 2 and 2
> remain genuine parallel siblings — the tier-2 fan is unchanged.

## The dropped second pointer

The banner's ratified-in-pass-1 sentence read "…`reports/warnings.md` in your
vault, **or run wienerdog doctor**." Under pass 2 that became wrong rather than
merely redundant: `doctor` no longer answers "which ones", so the banner would be
sending the reader to a second surface that repeats the count it just gave — in
the most expensive surface in the system to spend bytes in. The banner now names
one destination, and consequently **stopped depending on the doctor package
entirely**. The dream report's pointer sentence lost the same clause for the same
reason.

## Constraint that survived both passes — pointer honesty

A banner or a check must never name a surface that does not do the thing. The repo
already holds the rule, in `src/core/dream/ledger.js`'s comment on the
`secret-revert-exhausted` sentence: "Names NO command: nothing ships a way to
un-skip these sessions yet, and a banner must not tell the user to run something
that does not exist."

This is why every pointing package depends on `WP-quarantine-warnings-file`, and
why `doctor` gained a branch that says the file is not there yet rather than
pointing into the void. The cost is real and was weighed both times: the 17 KB
per-session defect that opened the issue is only fixed once the root lands.

## Constraint 2 — an in-flight family owns the dream report

`WP-dream-promote-module`, `WP-dream-promote-report` and
`WP-dream-promote-in-workspace` (epic `audit-2026-07-29`) are all `Ready` and
unimplemented, and together they move the dream report's composition out of
`validate.js` into `promote()`, explicitly retiring "today's report handling".
Writing piece 4 against `validate.js:1374-1409` today would be writing code with a
scheduled demolition date. So it depends on the pipeline package and carries every
citation marked **PROVISIONAL**, with a dispatch precondition requiring them to be
re-derived against the tree the implementer will find.

The same family's `WP-dream-vault-write-primitive` is `Done`, and its
`writeIntoVault` has **zero production call sites** — it ships consumed by nothing
until the pipeline package lands. `WP-quarantine-warnings-file` becomes its first
production caller, which is why that package also carries the one-sentence
`docs/GLOSSARY.md` correction from "Two writers use it and no others" to three.

## The rename, and why it was allowed

`WP-doctor-lists-quarantines` → **`WP-doctor-quarantine-counts`**. The old slug
asserted the package does the one thing pass 2 forbids.

ADR-0029 makes a slug "chosen at draft time" and globally unique (lint-enforced);
what it protects against is renumbering ids that other surfaces already reference.
This one referenced nothing: the spec was `Draft`, never dispatched, and existed
only in a single unpushed commit on `wp/quarantine-surface-split` — no `done/`
history, no merged `depends_on`, no commit trailer on `main`. Renaming before the
branch lands is still choosing at draft time. The new slug was checked against
`docs/specs/` and `docs/specs/done/` for collision, the move was made with
`git mv`, and the branch's single commit was amended, so the old slug never
existed in shared history at all.

## Three design decisions that were not in the issue

**The warnings file's path is the fixed literal `reports/warnings.md`, not
`<layout.reports_dir>/warnings.md`.** The layout-aware form was genuinely
tempting: it is excluded from the validator's note count for free
(`validate.js:1428`) and it respects an adopted vault's relocated reports
directory. It loses on one measured fact — `src/core/vault-snapshot.js:109,112`
scopes routine snapshots by the hardcoded literal `'reports/dreams'` with a
newest-N window, so a warnings file living there would displace a real dream
report from a routine's context. The note-count problem is fixed directly instead,
by one line, in the same package. **Pass 2 raised the stakes on this path**: it is
now named in three specs and read by two modules, so `warnings.js` exports it as a
constant that `doctor.js` imports rather than retypes; the only other occurrences
are inside fixed English sentences, each pinned by its own package's byte-exact
gate.

**The warnings file is refreshed at exactly the two points the run already
refreshes `state/digest.md`, and not at a third.** Tying the new durable surface
to an existing, well-understood refresh rule means no third point can drift out of
step. It also happens to be forced: a quarantine that *leaves* the set is only
knowable after the commit (`dream.js:597-611`), and a quarantine-only run returns
at `:467-470` without any commit at all — so one refresh point cannot serve both.

> **Amended 2026-08-29, round-zero finding 14 (owner-ruled).** There is a third
> point after all, and the reasoning above is what missed it: both points above are
> *set-change* points, and a **fully idle** run (nothing fresh, no new quarantine)
> reaches neither — which is precisely the upgrade shape, an install whose
> quarantines are all pre-existing. `doctor`'s byte-gated message promises "the
> next dream run writes it", and the owner ruled the mechanism in rather than
> hedging the message. Refresh point 3 is **write-if-absent**, on the
> `sel.entries.length === 0` return at `:467-470`: it writes only when the file is
> absent and the current set is non-empty, appends no run-log entry, and leaves the
> no-churn property of an existing file untouched. The "tie it to `digest.md`'s
> refresh rule" argument still holds for points 1 and 2, which are the set-change
> points; point 3 is a reconciliation and refreshes nothing else.

A second amendment reaches the same passage, from the trust side rather than the
coverage side.

> **Amended 2026-08-30, external review round 3 (owner-ruled). The `## Run log`
> section is dropped, so the phrase "appends no run-log entry" above no longer
> describes anything.** Round 3 attacked the section from the trust side: to
> survive a rewrite the log had to be read back off disk and carried forward, and
> a carried section is **user-controlled input to a code-owned commit** — anything
> a user or another process put below the marker would ride into the dream commit,
> falsifying the stray-edit safety claim. A second finding rode along: the
> composer's `date` argument was not pinned across its two callers. The owner
> dropped the section rather than authenticating the carry, and both findings
> dissolve at the root: **the warnings file is now a pure, stateless render of the
> ledger — header plus `## Current conditions`, nothing else — and nothing on disk
> is ever read into a write or a commit.** The dated history is not lost; it moves
> to where it already existed for free. **The vault is git-versioned by design, so
> every rewrite commit IS the dated delta**, and the dream report's own-run counts
> (`WP-dream-report-run-skips`) carry the per-run story. Two alternatives were
> weighed and rejected: relocating the file to the state directory (`0600` guards
> other users, not a same-user process, so the exposure is location-independent —
> and the git-backed durable record would be lost), and grammar-validating the
> carried log (workable, but new machinery for a section that duplicated git
> history). Refresh point 3 and the write-if-absent reasoning above are otherwise
> unchanged; what it writes is simply the full render.

**An unrecognized reason class is counted with the informational group but never
decays.** The ratified design named three intake reasons as informational and one
as actionable, and said nothing about a fourth arriving later. Folding an unknown
reason into the decaying group would let old code retire a future actionable class;
folding it into the actionable sentence would render text about withheld secret
notes for a condition that has nothing to do with them. Counted, never decayed, is
the only option that keeps ADR-0023's anti-silent-drop invariant true in both
directions.

## Two things pass 2 made *simpler*, worth recording

`doctor` no longer prints any transcript name, so it never calls `displayName` and
the sanitizer question does not arise on that surface at all — strictly stronger
than sanitizing would have been. And the indented-detail output grammar the first
draft introduced disappears: every `doctor` line is back to `[<status>] <message>`,
with the pointer riding the pre-existing bare `[info]` shape (`doctor.js:432`)
rather than a new one.

## One staleness check considered and rejected

`doctor` could cheaply decide whether `reports/warnings.md` is *stale*, not merely
absent: the Current-conditions block is time-invariant by contract, so `doctor`
could re-render it from the ledger and compare. Rejected — it would make `doctor` a
second authority on that file's bytes, for a condition the next dream run heals on
its own, and a false "stale" warning is worse than a missing one. A pointer to a
slightly-old file is still a good pointer; a pointer to no file is not.
**USABILITY, not freshness, is the line** — and "usable" hardened well past mere
existence after this passage was written: review round 4 pinned the probe to a
non-symlink regular file that opens for reading, and the PR review gate
(2026-08-30) added the parent chain, because a symlinked `<vault>/reports` leaves
an ordinary readable file at a destination `writeIntoVault` refuses. Staleness
stayed rejected through both. The probe is owned by
`WP-doctor-quarantine-counts`'s Table B and is not restated here.

## One stale cross-reference found and corrected in passing

ADR-0023 Amendment 1 part 4 points at `WP-quarantine-review-cli` as the future
recovery command for an exhausted transcript. That package was **superseded on
2026-07-25 and will never be implemented**, and under ADR-0029 its slug is
permanently taken. Amendment 2 records the correction rather than rewriting
Amendment 1, following the append-only precedent.
