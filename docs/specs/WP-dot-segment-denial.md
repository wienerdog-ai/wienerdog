---
id: WP-dot-segment-denial
title: Deny dot-prefixed path segments at the promotion allowlist and at every layout validator
status: Draft
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004]
epic: audit-close
---

# WP-dot-segment-denial: deny dot-prefixed path segments, as a class, everywhere the class can enter

## Why this exists

Disposition record: `docs/specs/logbook/2026-09-02-audit-group-c-disposition.md`,
Table D rows D1 (b) and D5. Owner ruling on severity: queued (option (i)), joining
the queue immediately after `WP-instruction-basename-currency` — quoted
verbatim in that disposition record's section 4, the in-patch record. (Primary
record: `docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md`, item 3;
lands with PR #201.)

The 2026-08-05 audit ruling's item 1 was **"no write to any path with a
dot-prefixed segment"**, stated as a class so future control directories need
no maintenance. `promote.js`'s `DENIED_SEGMENTS` (`:99`) is an **enumeration**
of exactly two names (`.claude`, `.codex`) where the ruling required a class:
measured (Table D row D1 (b)), `.github`, `.husky`, `.git`, `.obsidian` and
`.cursor` are admitted beneath an admitted tier, and the real `writeIntoVault`
with the production `admit` **wrote** `01-Projects/example/.github/copilot-instructions.md`.

## Body

1. **The rule, as ruled: no write to any path with a dot-prefixed SEGMENT** — a
   class, not a list. Today's `DENIED_SEGMENTS` (`promote.js:99`) enumerates two
   names, so `.github`, `.husky`, `.git`, `.obsidian` and `.cursor` are admitted
   beneath an admitted tier. Reproduce with V1 (b) of
   `WP-audit-c-close-disposition`, not from this sentence.
2. **Two enforcement points, both required.** (a) `makeAdmit`'s clause (c) —
   segment-level, applied to the resolved path. (b) The layout validators — a
   dot-prefixed layout value makes a dot directory a *tier*, which is the other
   way the class opens.
3. **The layout side is TWO validators, not one, and one of them is a producer.**
   `layout.js:65-71` (reader) and the copied `layout-infer.js:40-46` (producer);
   `adopt --yes` infers, writes the block into `config.yaml` and scaffolds the
   directories with no confirmation. **So the value is not solely the user's —
   Wienerdog can generate it.** Decide explicitly: one validation authority
   (export and reuse the predicate) or reject at both. A **round-trip acceptance
   case is required**: `adopt --yes` on a vault containing a dot-prefixed
   directory must not persist a mapping a later run silently discards.
4. **The inherited notice, not to be changed there.** The reader's per-key
   fallback to the built-in default is **silent** by the existing contract; a dot
   rejection inherits that silence. Whether to notify is that WP's decision to
   take deliberately, not to absorb by accident.
5. **The residual this rule does NOT close, named rather than implied.** The
   instruction-basename list (`promote.js:96`) stays a list; an unknown tool's
   dot-free instruction file inside a tier still passes. That was accepted at
   ruling time and is not reopened here.
6. **ADR-0004 bounds the fix.** Nothing resident re-reads `config.yaml`: a bad
   value is read by one CLI run that then exits. The fix is a validation
   condition — never anything that watches.
7. **The pointer that must move with it.** `promote.js`'s *"Deliberately NOT a
   dot-rule: audit finding C3 owns the layout dot-rule and its notice"* is a live
   deferral to this WP; landing it means updating that comment in the same pass.

## REQUIRED VERIFICATION

The proof must establish the **class predicate**, not a list:

- **The property:** *no path segment and no layout segment beginning with `.` is
  admitted or emitted, at any depth, in any case.* Stated as a universal over the
  segment alphabet, not over a set of examples.
- **All three enforcement points**, separately: `makeAdmit`, `readVaultLayout`,
  `inferLayout`/`adopt`. One passing implies nothing about the others — measured.
- **The proof is graded on HELD-OUT segments** — dot-prefixed segments the proof
  does not name, generated rather than listed. Stated as the property, not the
  generator: *a segment whose first character is `.` is refused, at every depth,
  in any case, at all three enforcement points.*
- **The RED mutant is the CURRENT PRODUCTION ENUMERATION** — `DENIED_SEGMENTS`
  as shipped — which must FAIL the held-out set. **An enumeration of the names
  the proof itself exercises is NOT a valid mutant**: it agrees with the
  predicate on every value it is graded against, so it cannot go red. (Measured:
  zero disagreement on the exercised set; the shipped enumeration, by contrast,
  admitted 7 of 7 held-out segments.) A broader finite matcher — a prefix table,
  a bounded-length rule, a regex fitted to the fixtures — must fail the same way,
  which is what held-out grading buys and a fixed list cannot.
- **Case folding is in scope:** measured, `.GiThUb/copilot-instructions.md` is
  admitted today while the enumerated `ClAuDe.md` is refused, so the existing
  fold covers only enumerated names.
