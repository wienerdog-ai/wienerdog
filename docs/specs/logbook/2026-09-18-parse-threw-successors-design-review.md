---
date: 2026-09-18
related_wps:
  - WP-doctor-recognizes-parse-threw
  - WP-transcript-parsers-harden-text-values
  - WP-ledger-retry-parse-threw-on-upgrade
  - WP-dream-collect-parse-throw-quarantine
---

# Design review — parse-threw successors (PR #281)

Rounds on the two Draft specs opened as PR #281. Reviewed tip `67feb485`
(base `08de2bc3`). Raw and focus text for round 1 were **committed before
adjudication**, at `8e2c0cef`:

- `docs/specs/logbook/2026-09-18-parse-threw-successors-design-r1-astra-raw.json`
- `docs/specs/logbook/2026-09-18-parse-threw-successors-design-r1-astra-focus.txt`

Reviewer: Codex plugin `review`, model `gpt-6-astra`, effort medium, branch mode
against `08de2bc3`. Verdict `needs-attention`; thread
`01a0b47b-c507-7052-878d-f9db1e16edf1`.

## Round 1 — dispositions

| # | Finding | Source | Band | Weight | Disposition |
|---|---------|--------|------|--------|-------------|
| 1 | **No recovery for transcripts ALREADY quarantined `parse-threw`.** `selectState` skips an unchanged quarantined file before the parse, so the hardened parser never revisits sessions the defect already cost. | Astra, medium, confidence 0.99 | A | **HEAVY** | **ACCEPTED, and answered (b) — bounded recovery, as a companion package.** See "Finding 1 in full" below. |
| 2 | Doctor spec: Mirrored Surface Checklist says AC1 asserts rows A2, A4 and A5; AC1 cites only A2 and A4. | round zero | B | LIGHT | **ACCEPTED.** Checklist corrected — row A5 (the row's position) is criterion 2's, not criterion 1's, and the entry now says so in place. |
| 3 | Doctor spec: *"its one proof"* — `quarantine-banner-location-doctor.proofs.json` carries **two** declarations. | round zero | B | LIGHT | **ACCEPTED.** Measured: `doctor-shelf-claim-restored` (file `src/cli/doctor.js`) and `pointer-derivation-doctor` (file `src/core/dream/ledger.js`). Current state now names both and says which one the package's edits could disarm. The narrower claim it supports — exactly one declaration whose `file` is `doctor.js` — was true and is kept. |
| 4 | Doctor spec: *"`dream-pipeline.test.js` already carries four"* sibling declaration files — measured **five**. | round zero | B | LIGHT | **ACCEPTED.** Corrected to five: `dream-digest-omits-own-job-alerts`, `dream-git-env-pinning`, `dream-lock-stale-owner-loud-pipeline`, `dream-pipeline`, `dream-primary-collection-pipeline`. |
| 5 | Transcripts spec: checklist says AC1 asserts A0, A5 and B3; AC1 cites A5 and B2 explicitly and B3 only in prose. | round zero | B | LIGHT | **ACCEPTED.** Checklist now reads "row A5 and Table B rows B2 and B3", and AC1 bolds its **Table B row B3** citation so the fact and its scope are adjacent (one sweep pattern catches both). |
| 6 | Transcripts spec contained a literal **NUL byte** at line 661, inside the four-site gate's join separator, which was written as a unicode escape for U+0000. The file was `data` rather than text, so `grep` treated it as binary and suppressed every match. | architect, self-found while applying #1 | B | LIGHT | **ACCEPTED.** Introduced by an editing tool interpreting a written-out unicode escape as the character itself; it survived `npm run lint` (markdownlint passed) and the round-1 review. The separator was unnecessary — the check now tests each message text individually, with no separator. Gate re-observed red on base and green hardened afterwards. |

Round-zero checks that **passed** and are recorded so a later round need not
redo them: the four-site gate is RED on base at all four sites; a throwaway
application of the four filters breaks exactly `[PT-1]`, `[PT-4]` and `[PT-6]`
with `[PT-3]` green; the sites-3/4 substring hazard is real; 17 committed
transcript fixtures; both pinned `find` strings occur once.

## Finding 1 in full

**The mechanism, read off the code at `08de2bc3`.** `selectState`
(`src/core/dream/ledger.js:235-263`) returns `'skip-quarantined'` for any
quarantined record whose `fingerprint` still matches — the reason is consulted
only by the sticky `secret-revert-exhausted` arm — and `collectExtracts` applies
that answer before the parse call.

**The population is live, which is what made this band A rather than a
hypothetical.** Tag `v0.14.0` is `1f546baa` (2026-09-18 14:14 +0200), has the
parse-throw merge `900dd6d4` as an ancestor, carries `parse-threw` in
`src/core/dream/scratch.js`, and npm gives `0.14.0` a publish time of
2026-09-18T12:26:43Z. A published build emits `parse-threw` with unhardened
parsers **today**.

**No user action clears it.** `recordQuarantined` (`:326-334`) writes no
version; `appVersion` exists only on `oversizedExtracts` memo entries (`:103`,
`:118-125`). Nothing in `src/` ships an un-quarantine affordance —
`ledger.js:483-487` records that as a standing decision — and a completed
transcript's fingerprint never changes on its own. The honest answer to "what
can a user do" is **nothing**.

**Why a one-shot gate needs new ledger-level state.** `readLedger` (`:139-157`)
hard-pins `version: 1` and never reads `obj.version`, so the schema version is
not usable as a gate; `writeLedger` (`:160-177`) serializes an explicit literal,
so any new top-level key is dropped on the next write unless `writeLedger`
learns it. And an **ungated** sweep is not an option: after the hardening a
`parse-threw` can still arise outside the four joins (the metadata path), and
re-reading and re-throwing on such a file nightly is the repeated cost
ADR-0023's quarantine exists to stop.

**Disposition: (b), and NOT folded into the hardening package.** Folding it in
would add `src/core/dream/ledger.js`, `src/cli/dream.js` and two test suites to
a package whose central claim is "four filter predicates; parse output
byte-identical", pushing it past M and mixing a reversible code change with an
irreversible rewrite of persistent user state. Split instead, per CLAUDE.md's
preference for a dependency chain over one large package:

- `WP-transcript-parsers-harden-text-values` gains **Table E** (the residual,
  decided), a Current-state subsection, **acceptance criterion 9**, an Out-of-scope
  entry, checklist mirrors, and **owner item 2** — the release-ordering
  constraint.
- **`WP-ledger-retry-parse-threw-on-upgrade`** is drafted as the companion
  (M, opus, `depends_on: [WP-transcript-parsers-harden-text-values]`), carrying
  the upgrade test Astra asked for: start from an unchanged quarantined
  transcript, preserve unrelated reasons, re-quarantine what still fails.

**Which decision wins where it meets the filed spec.**
`WP-dream-collect-parse-throw-quarantine`'s Table A row **A2** — the quarantine
*record* gains no field, no counter, no stickiness — **is kept**: the companion
changes no record shape and no `selectState` arm. Its row **A12** — *"no record
field, no counter and no new state"*, the premise for needing no ADR-0023
amendment — **no longer holds for the family**, because ledger-level one-shot
state is new state. That contradiction is routed to the companion's owner item
1, which recommends a short docs-only ADR-0023 amendment and states the cost of
overruling it. Nothing in this repository records the owner approving,
accepting, ratifying or signing any of it.

## Round 2

A fresh Astra round follows the fix, because finding 1 is HEAVY. Not yet run at
the time of writing.
