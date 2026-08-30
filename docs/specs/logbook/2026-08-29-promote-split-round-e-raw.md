---
title: Round (e) — undirected round on the extraction (raw), the promote family
date: 2026-08-29
related_wps: [WP-dream-promote-module, WP-dream-promote-report, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE. Condensation declared: the 16-row
     prior-findings table is carried by its verdicts (ALL genuinely fixed, each
     with lines cited in the transcript); the single finding and the execution
     report are verbatim. -->

# Round (e) — undirected round on the extraction (raw)

Reviewer: gptsol, external, FRESH agent, undirected. Vendored prompt, unedited,
**sha256 verified against its declared checksum** (`f3b28a6c…aefe0f`). Targets:
all three specs at `ade0aa2`. Read-only verified independently.

## Prior findings — ALL SIXTEEN genuinely fixed

Both A-bands, the B-band, the placeholder correction, and all twelve earlier
findings ruled **genuinely fixed**, each with current lines cited. **This is the
first round of the loop in which no prior was re-opened.**

## Verdict

`needs-attention`. **NO-SHIP.** "The previously demonstrated report leaks are
specifically covered now, but Table N's claimed structural closure is not real:
neither the value set nor the default transformation is connected to an
executable schema, and the required test cannot enumerate a JSDoc return shape
reliably at runtime. The same file already contains stale hand-written mirrors
that omit the newly added redaction channels."

## Finding 1 — B: Table N's "derived value set" and default neutralization have no executable enforcement

- **Affected file:** `docs/specs/WP-dream-promote-report.md`
- **line_start:** 182 **line_end:** 207 **Confidence:** 0.98

**What can go wrong:** A later string channel can be added to report composition without acquiring the required redact-then-sanitize transformation. The claimed safe default will not run automatically, and the mandated test can remain green if its representative return object does not populate the new field or union arm. That recreates the same durable-secret leak class found in rounds (c) and (d).

**Why vulnerable:** The text says the value set is "derived from the return shape" and that a new channel cannot exist without a row, but the table is still a manually maintained list followed by a prose catch-all: explicit field rows at lines `193-199`; "every remaining string field" at line `200`; a prose default at line `205`. **Nothing mechanically connects these rows to `promote()` or to report interpolation.**

The acceptance criterion at lines `346-369` then requires channels to be enumerated "from `promote()`'s return shape at test time." **The exact contract is JSDoc in plain JavaScript. JSDoc types do not exist at runtime.** Inspecting an actual returned object reveals only fields populated on that execution, not every declared field and not every arm of the report union. It also cannot determine which fields report composition interpolates or which Table N row classifies them.

**The current file demonstrates that this is not merely theoretical.** Despite declaring Table N canonical: Table R says "the set is NAMED" and then hand-lists only `r.path` and `r.reason` at line `234`; the Security checklist again calls those "BOTH channels" at lines `298-302`. **Both mirrors omit Table N's newly added `redacted[].rel` and `redacted[].artifact` channels.**

The specific `redacted[].rel` leak is still caught by the explicit red-direction acceptance clause, so this is not a regression of that exact finding. **It is evidence that the promised structural derivation and default are not operating.**

**Likely impact:** The current listed redaction path is test-covered, but the next added report channel can silently bypass neutralization and persist a credential or markdown-active text in the durable report. At implementation time, the builder must invent a reflection or document-parsing mechanism that the contract neither supplies nor makes reliable. Likely caught during downstream implementation or review, hence **B**, but if implemented as the obvious hand-written field calls it leaves the security class open to recurrence.

**Concrete recommendation:** Make the channel contract executable inside `src/core/dream/promote.js`, for example with one code-owned descriptor/registry identifying (1) the source accessor, (2) whether the channel is attacker-influenceable, (3) the transformation, (4) the required order. Use that same registry to compose the report and to drive the tests. Route any unregistered string through a real generic redact-then-sanitize fallback, rather than expressing the default only in prose. Have tests compare the executable registry against every interpolation performed by the composer and exercise every report union arm. Remove the hand-written field sets from Table R and the Security checklist; those surfaces should cite Table N or the executable descriptor without restating its members. **If no executable registry is intended, withdraw the claims that the set is derived and that a new field automatically fails the test.** Replace them with an honest explicit enumeration and exhaustive per-field tests.

## Scope objections

**None.** "It concerns whether Table N performs as the boundary contract it claims to be."

## Execution report — the most executed round of the loop

Verified HEAD/clean before and after; vendored checksum matched. **Ran:** the
redactor and sanitizer in both orders (sanitizer-first: no finding; redact-first:
both contextual secrets removed; `[REDACTED:generic-secret]` → `REDACTED_generic-secret_`,
not restoring the secret); the shipped `validateAndCommit` against
`04-Atomic/token=abcdefghijkl.md` (`secretRedactions: 1`, credential still in the
shipped report — reproducing the predecessor behaviour Table N must replace);
shipped `writeIntoVault` against a **symlinked dated report target**
(`{written:false}`, victim bytes unchanged, target still a symlink); **a runtime
return-object enumeration probe and an exact-contract schema probe — both
confirming JSDoc type information is unavailable at runtime**; a corrected
`scratchIntact` probe (`true`, `EVIL.json` remained); `dream-vault-write` 27/27,
`dream-delta` 24/24, `dream-workspace` 44/44, `reap` 26/26 (win32 test-injected,
not native), three focused `dream-validate` tests 3/3; `npm run lint` exit 0;
`git diff --check` clean; `npm test` exit 1 on the one unrelated baseline
`adopt-e2e` failure, reproduced focused (executable-pin mismatch).

**Two early scratch probes exited 1 and are disclosed:** the first passed wrong
arguments; the second omitted `path`/`fs`/`crypto` from its VM context and hit
zsh's read-only `status`. **No conclusion relied on either.**

**Not run, and stated:** the future `promote()`, report extension and rewired
pipeline (they do not exist); a native Windows host; a real surviving process
group; mid-rename crash recovery.

## Author's verification, before adjudication

**The stale mirrors are real and are this author's.** `WP-dream-promote-report.md:298-302`
still reads "for BOTH channels (`r.path` and `r.reason`)" — a hand-listed set,
inside the very pass whose purpose was to end hand-listed sets, omitting the two
channels the same pass added. The finding's evidence stands as written.
