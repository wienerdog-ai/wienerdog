---
id: WP-instruction-basename-currency
title: Bring the instruction-basename denial current and give the list a maintenance obligation
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
epic: audit-close
---

# WP-instruction-basename-currency: a dated inventory, with an obligation, for the instruction-basename denial list

## Why this exists

Disposition record: `docs/specs/logbook/2026-09-02-audit-group-c-disposition.md`,
Table D row D1 (c). Owner ruling on severity: queued (option (i)), joining the
queue first, ahead of `WP-dot-segment-denial`
(`docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md`, item 3) —
currency first because it is the smaller change against the more ordinary path.

`INSTRUCTION_BASENAMES` (`promote.js:96`) holds four names and is **stale**:
measured (Table D row D1 (c)), production `makeAdmit` admits — and the real
`writeIntoVault` wrote — `01-Projects/example/GEMINI.md`,
`01-Projects/example/QWEN.md`, `01-Projects/example/WARP.md` and
`01-Projects/example/copilot-instructions.md`. Mixed case passes too:
`Gemini.md` is admitted while the enumerated `ClAuDe.md` is refused.

**Why this is SEPARATE from `WP-dot-segment-denial`.** Those two are one rule
split across two enforcement points, so half-landing either leaves the class
open. These are **two KINDS of rule and neither reaches the other**: a
dot-segment rule does not refuse `01-Projects/example/GEMINI.md` (measured — no
dot segment), and a basename list does not refuse `.husky/pre-commit.md`. A
class rule **closes**; an enumeration **never closes**. Merging them would put
an unclosable item inside a closable WP.

## Body

1. **The gap, measured.** `INSTRUCTION_BASENAMES` (`promote.js:96`) holds four
   names. Production `makeAdmit` admits — and the real `writeIntoVault` wrote —
   `01-Projects/example/GEMINI.md`, `01-Projects/example/QWEN.md`,
   `01-Projects/example/WARP.md` and `01-Projects/example/copilot-instructions.md`.
   Mixed case passes too: `Gemini.md` is admitted while the enumerated
   `ClAuDe.md` is refused. Reproduce with V1 (c) of
   `WP-audit-c-close-disposition`, not from this sentence.
2. **These are documented conventions, not guesses** — `GEMINI.md` (Gemini CLI),
   `QWEN.md` (Qwen Code), `WARP.md` (Warp), `copilot-instructions.md` (GitHub
   Copilot). **Re-confirm every one against current vendor documentation when this
   WP is picked up, and cite a URL per entry**: a stale list is the defect being
   fixed, so a stale citation would repeat it.
3. **What is NOT this WP's:** anything denied by a dot segment rather than by its
   basename. `.cursor/rules.md` is the worked example — its basename is merely
   `rules.md`, so only the dot rule can reach it, and it belongs to
   `WP-dot-segment-denial`. Keeping it here would double-count one residual and
   let each WP assume the other closed it.
4. **The list stays a list, and an enumeration NEVER CLOSES.** The 2026-08-05
   ruling took item 2 as a name list *with a named residual* because no structural
   marker exists for instruction filenames. This WP does not overturn that. **Say
   so plainly in the spec rather than implying completeness** — the honest shape
   is "current as of a date", never "complete".
5. **So the deliverable is a DATED INVENTORY plus an OBLIGATION, not a patch.**
   (i) a dated inventory of documented instruction-file conventions, each with its
   citation; (ii) **accepted omissions recorded explicitly** — anything found and
   deliberately not denied, with the reason; (iii) a standing maintenance
   obligation carrying a **named owner** and an **objective trigger** (for example
   "re-inventory at every minor release, recorded in the release runbook") —
   never an unowned comment.
6. **The residual that remains after this WP, named rather than implied.** A
   genuinely unknown or undocumented tool's instruction file still passes. That is
   the ruling's own accepted residual and is not reopened.
7. **ADR-0004 bounds the fix**: a name list, a dated document and a written
   obligation. Nothing that watches, polls or runs.

## REQUIRED VERIFICATION

Every entry in the dated inventory must be shown to reach **denial across case
and depth** — the inventory, not a sample, is the completeness boundary, and the
accepted-omission list is what makes the boundary honest. **This spec states
that requirement and asserts none of it**: the inventory does not exist yet, and
pre-writing its contents here would be the fourth enumeration.
