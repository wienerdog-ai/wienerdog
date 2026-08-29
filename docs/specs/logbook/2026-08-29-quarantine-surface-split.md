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
| 3 | `WP-dream-report-run-skips` | `[1, WP-dream-promote-in-workspace]` | same pointer, plus the in-flight rewrite of the report |

**The chain became a fan.** Packages 2 and 2 are now genuine parallel siblings —
they no longer touch a shared file and neither blocks the other. That is not a
happy accident: it is what happens when three surfaces stop each owning a copy of
the same list and start deferring to one owner.

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
slightly-old file is still a good pointer; a pointer to no file is not. Existence
alone is the line.

## One stale cross-reference found and corrected in passing

ADR-0023 Amendment 1 part 4 points at `WP-quarantine-review-cli` as the future
recovery command for an exhausted transcript. That package was **superseded on
2026-07-25 and will never be implemented**, and under ADR-0029 its slug is
permanently taken. Amendment 2 records the correction rather than rewriting
Amendment 1, following the append-only precedent.
