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

## Round 2 — dispositions

Reviewed tip `7aee86b9`. Raw and focus committed **before adjudication** at
`d8bc9a57`:

- `docs/specs/logbook/2026-09-18-parse-threw-successors-design-r2-astra-raw.json`
- `docs/specs/logbook/2026-09-18-parse-threw-successors-design-r2-astra-focus.txt`

**Nothing re-opened** on `WP-doctor-recognizes-parse-threw` or
`WP-transcript-parsers-harden-text-values`. One finding, on the companion.

| # | Finding | Source | Band | Weight | Disposition |
|---|---------|--------|------|--------|-------------|
| 7 | **`WP-ledger-retry-parse-threw-on-upgrade.md:158`, Table A row A1 assumed the no-record path always selects.** It does not: `ledger.js:260-261` returns `skip-processed` when `mtimeMs <= baseline_mtime[harness]`. Reachable when a path that already carries a record is restored with an older timestamp — its changed fingerprint permits the parse, the unhardened parser throws, and it is quarantined `parse-threw` below the baseline. After the deletion the file is **silently treated as processed** and its `reports/warnings.md` line disappears with the record: the session is lost **and** the notice of losing it is erased. | Astra, medium | A | **HEAVY** | **ACCEPTED. Mechanism replaced: CONVERT, do not delete.** See below. |

**Reproduced before fixing**, on the base tree, with
`baseline_mtime.codex = 2000` and a file at `mtimeMs = 1000`:

| state | `selectState` |
|-------|---------------|
| quarantined `parse-threw`, fingerprint matches | `skip-quarantined` |
| **after deletion (the round-1 design)** | **`skip-processed`** |
| **converted to `{outcome:'deferred', reason:'parse-threw'}`** | **`select`** |
| after deletion, same file with `mtimeMs = 3000` | `select` |

The last row is why the defect reads as correct: deletion works whenever the
mtime is above the baseline, which is the common case and the only one a
casually-built test would cover.

**The fix, and why it needs no new field.** `selectState` consults
`baseline_mtime` **only** on the no-record path, so keeping any
matching-fingerprint record bypasses it; `case 'deferred': return 'select'`
(`:255-256`) is the existing state that already means "retry". The converted
record is `{fingerprint: <unchanged>, outcome: 'deferred', reason: 'parse-threw',
updated_at, harness}` — existing keys, existing values, **no `deferrals`**.
Checked against the one guard that could have been disturbed:
`secretDeferralCount`'s `deferred` arm opens
`if (rec.reason !== SECRET_REVERT_REASON) return 0;` (`:288-289`), and it was
measured returning **0** for exactly this record, so no secret-revert budget is
consumed or invented. `activeQuarantines` (`:390-399`) selects
`outcome === 'quarantined'` only, so the converted record leaves the banner for
the span of the run and the run's own outcome rewrites it; a crash in that
window leaves `reports/warnings.md` lagging by one run, which ADR-0023
Amendment 2 permits in terms, and the `deferred` record is still selected next
run — self-healing, not stuck.

**What it costs against the filed spec, stated honestly.**
`WP-dream-collect-parse-throw-quarantine`'s row **A2** still holds exactly (no
new field, no counter, no stickiness; `recordQuarantined` untouched). Row
**A12**'s "no new state" premise is now exceeded **twice**: by the one-shot
ledger-level gate, and by the new transition `quarantined → deferred`, which
also produces a combination the tree has never held — a `deferred` record whose
`reason` is not `secret-revert`. Both are routed to the companion's owner item 1
(recommend a short docs-only ADR-0023 amendment; overrule cost stated). Nothing
in this repository records the owner approving, accepting, ratifying or signing
any of it.

**Mirrored in the same commit:** companion Table A rows A1 (rewritten), **A9**
(the hazard, measured) and **A10** (the `secretDeferralCount` check) new; rows
A4, A5, A6, A7 and Out of scope reworded from "drop/delete" to "convert";
acceptance criteria 1, 3, 4 and 5 rewritten — criterion 1 now **requires** a
corpus file at or below the baseline; two new RED declarations,
`rpt-deletion-instead-of-deferral` (criterion 1) and
`rpt-reason-dropped-on-conversion` (criterion 3); Current state item 2, the
Implementation-notes bullet, the Security checklist and the Mirrored Surface
Checklist all updated; and `WP-transcript-parsers-harden-text-values`' Table E
rows E1/E4 now say the companion converts rather than deletes.

## Round 3 — CLOSED

Reviewed tip `a9ba8e20`. Raw and focus committed **before adjudication** at
`0cf82f96`:

- `docs/specs/logbook/2026-09-18-parse-threw-successors-design-r3-astra-raw.json`
- `docs/specs/logbook/2026-09-18-parse-threw-successors-design-r3-astra-focus.txt`

**Verdict `approve`, no findings.** Astra confirmed in memory: the single
expected parse-output change across the 17 fixtures; below-baseline retry
selection under the converted `deferred` record; the preserved secret-deferral
budget; and re-quarantine of a transcript that still fails.

| # | Finding | Band | Weight | Disposition |
|---|---------|------|--------|-------------|
| — | none | — | — | **Gate CLOSED at round 3** (rounds 1 and 2 HEAVY, round 3 approve), per `docs/runbooks/codex-review.md`, "Weighted closure". |

## Gate closure

All three specs moved `Draft` → **`Ready`** on 2026-09-18 by the architect, and
each carries the closure in its own Definition of done, dispatch precondition
(a), citing the three pre-adjudication raws `8e2c0cef` / `d8bc9a57` /
`0cf82f96` and this file.

**This is a review gate, not owner approval.** Nothing in this repository
records the owner approving, accepting, ratifying or signing any of the three
packages. The owner items stay open in the standing recommendation form and are
reversible by dated amendment, applied by a committed revision rather than by a
dispatch message:

| Spec | Owner items still open |
|------|------------------------|
| `WP-doctor-recognizes-parse-threw` | none |
| `WP-transcript-parsers-harden-text-values` | **1** — metadata hardening as a further successor; **2** — must reach the same release as the companion, in that order |
| `WP-ledger-retry-parse-threw-on-upgrade` | **1** — whether the ledger-level gate and the `quarantined → deferred` transition need an ADR-0023 amendment |

Dispatch order is a property of the specs, not of this gate:
`WP-transcript-parsers-harden-text-values` must merge before
`WP-ledger-retry-parse-threw-on-upgrade`, and
`WP-doctor-recognizes-parse-threw` is independent of both.
