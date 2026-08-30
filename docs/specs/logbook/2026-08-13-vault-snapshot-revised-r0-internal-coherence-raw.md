# Internal coherence pass — spec revised to the ruling

WP: WP-gate-vault-snapshot
Backend: general-purpose executor | subagent transcript agent-ac59b694dd00af986.jsonl
Raw final output, byte-unchanged inside the fence. Recovered from the session transcript and
committed unadjudicated, per docs/runbooks/codex-review.md ("Rules").

`````text
I verified every citation by reading the cited files, re-ran the measured `parseNoteResult` table live, and checked the boundary-check reasoning against the script. Findings below, most severe first.

---

# PRODUCT findings

## P1 — Deliverables omits the file that actually owns `makeVaultSnapshot`'s tests
Deliverables lists `create | tests/unit/vault-snapshot.test.js` and `modify | tests/unit/routine-runtime.test.js`. But the existing coverage of `makeVaultSnapshot` lives entirely in an unlisted file:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/broker-wiring.test.js:14` `const { makeVaultSnapshot } = require('../../src/core/vault-snapshot');` — six call sites at `:140, :160, :171, :181, :196, :205`, including `assert.deepEqual(skipped, [])` at `:147, :173, :207` and the skip-reason assertions at `:182-184, :197-199`.

The acceptance criterion that depends on those assertions is:
> "Every item in Table A's 'Preserved unchanged' row holds, and per its empty-plan row `inbox-triage` still returns a null `snapshotDir`. Existing skip reason strings are unchanged."

CI rejects PRs touching unlisted files, and the spec never names `broker-wiring.test.js` — not to list it, not to forbid touching it. I checked the fixtures (`'older'`, `'newest report'`, `` `day ${d}` ``, `'r'`, `'x'.repeat(300*1024)`): none carries frontmatter, none is undecodable, and the over-cap one is skipped before the gates, so the tests *probably* still pass. That makes this a latent trap rather than a certain break, which is worse: the implementer discovers it only if a gate fires unexpectedly, and then has no legal way to fix it. Table A also adds a boolean to `SNAPSHOT_PLANS` (`vault-snapshot.js:28-35`, exported) — an implementer who wants to assert the new plan shape has no listed file to do it in.

## P2 — Table A's "Gate order" row contradicts itself
> `| Gate order | Secret scan before the provenance gate is NOT required; both must run before the copy, and a file skipped by either is skipped. Where both would fire, report the FIRST one that does, in the order above, so the reason string is deterministic |`

Three mutually incompatible claims in one cell. (a) If the order is genuinely free, the reason string is *not* deterministic — an implementer who runs provenance first reports `provenance gate: malformed` where the row says `appears to contain a secret`. (b) "both must run" contradicts "report the FIRST one that does" plus the skip-on-first-hit shape every other row implies. (c) Gate 1 (decodability) is order-constrained by necessity — the row's own text says "The gates decide on text" — so "order is not required" is false for at least one of the three. No acceptance criterion pins the precedence, so both implementations ship green.

## P3 — The reports-slice exemption rests on a universal the spec's own acceptance criterion falsifies
Table A:
> `| Why the reports slice is exempt | Nothing writes `derived_from_untrusted` onto a dream report — no stamp is built (the 2026-08-14 ruling), and no other writer sets it — so the gate could only ever fire there on `malformed`. … The exemption trades an unreachable benefit for a real availability risk |`

and Current state, line 113-114:
> "on the reports slice it would buy nothing (nothing ever writes the flag onto a report)"

Contradicted in place by the acceptance criterion:
> "On the REPORTS slice, none of those three cases causes a skip: a report whose body opens with `---` prose, **and one carrying `derived_from_untrusted: true`**, are both copied."

If nothing ever writes the flag onto a report, that fixture is unconstructible. And the spec's own cited source says the opposite — `docs/specs/logbook/2026-08-13-vault-snapshot-gating-design-blockers.md`, Blocker 1: the dream model "is instructed to author the report body (`skills/wienerdog-dream/SKILL.md:409-425`)" and "nothing stops it from writing that exact block shape itself." **The dream model is a writer.** The exemption may still be the right call under the ruling, but its stated rationale ("unreachable benefit") is wrong: the reachable case is a hijacked dream writing `derived_from_untrusted: true` onto its own report, which this exemption makes the snapshot ignore. That is a fail-open direction the spec currently does not acknowledge anywhere — Residual 5 covers hijacked-dream *content*, not a hijacked dream's *self-declared flag being discarded*.

## P4 — Context announces two gates; Table A specifies three
Context, line 43:
> "This WP ports the first two of those three gates and adds a code-owned framing line at mount."

Table A specifies `Gate 1 — decodability (EVERY file)`, `Gate 2 — secret scan`, `Gate 3 — provenance`. Gate 1 is **new** — not one of the digest's three, not ported, and announced nowhere in Context or Current state. It has its own acceptance criterion and its own skip reason (`not valid UTF-8 text`), so it is a real behaviour change a reader of "Context (read this, nothing else)" would not know exists. The Mirrored Surface Checklist item "Current-state description — what Table A adds" is therefore unsatisfied.

## P5 — The honest summary disagrees with the surface it points at
Context, line 56-58:
> "the honest summary is there too: **the daily-notes leg** of M3 gains no instruction-content filter from this WP."

Security checklist, closing item:
> "M3 has two legs. Both gain the two filters Table A ports… **Neither leg** gains an instruction-content filter."

Context names one leg where the cited surface names both. The Context version understates the residual on exactly the point the spec elsewhere insists must not be understated ("the PR body must say so instead of marking the finding resolved").

## P6 — Half of the budget-accounting criterion cannot be demonstrated
> "A file skipped by any gate consumes neither the file-count nor the byte-total budget: with a gated-out file present, a later file that would otherwise have been displaced is still copied."

`MAX_FILES = 32` (`vault-snapshot.js:18`), but the largest plan picks 7 + 7 = 14 files (`:30-33`). The file-count cap is unreachable through `makeVaultSnapshot`'s only entry point, `SNAPSHOT_PLANS` is `Object.freeze`d, and "Widening or narrowing the snapshot caps or plan `dir`/`newest` values" is explicitly out of scope. The byte-total half is demonstrable (8 × 256 KiB > 2 MiB); the file-count half is not.

---

# SPEC-MACHINERY findings

## S1 — The Table C byte-exactness gate is self-referential and cannot catch the drift it names
```
# Copy Table C's literal into this file FIRST, as ONE unwrapped line. It is not
# repeated here on purpose: Table C is the single place those bytes are decided,
# and a second copy in a shell block is how the two drift apart.
test "$(grep -Fxc -f /tmp/wp-t1-bullet.txt docs/THREAT-MODEL.md)" = 1
```
The gate asserts that `docs/THREAT-MODEL.md` matches *what the implementer pasted into `/tmp`*, not what Table C says. An implementer who mis-copies Table C (a smart quote, a collapsed double space, a wrapped line) into **both** destinations gets a green run. Contrast Table D, which solves this correctly: the heredoc carries the literal and the table declares itself canonical on disagreement ("if the two ever disagree, this row is canonical and the gate is wrong"). I byte-compared Table D's row against its heredoc — identical. Table C has no equivalent check at all.

## S2 — An acceptance criterion that is already green before work starts, worded as an instruction
> "- [ ] The parked decision's logbook entry carries its dated Resolution addendum."

Verified: the `## Resolution (2026-08-14)` section is already present in `docs/specs/logbook/2026-08-05-parked-report-provenance-product-decision.md` on this branch, committed at `6f3875e`, and absent from `main` (`git show main:… | grep -c "Resolution (2026-08-14)"` → 0). It even already names "that WP's Residual 6". But the Deliverables prose reads as a work item — "Also written, on an always-allowed path…: a dated **Resolution** addendum … recording the ruling" — inviting the implementer to author or revise it. Both in-repo precedents say this explicitly the other way: `docs/specs/done/WP-daily-summary-per-line-framing.md:157` ("**It is ALREADY WRITTEN in this spec's commit — do not author it, do not revise it.**") and `docs/specs/done/WP-adr-0028-entry-node-path-amendment.md:112`.

Related: that Deliverables paragraph describes the ruling as "exclusion rejected, **label + inherit** adopted always-on, no stamp". "Inherit" is the write-back marking — Residual 6 establishes it has no surface in this tree and this WP implements none of it. The addendum sentence therefore describes an adoption the WP does not carry, using vocabulary inherited from the parked entry's title.

## S3 — Mirrored Surface Checklist line is false as generalized
> "- [ ] Deliverables-table cells (each row cites its table)"

The `create | tests/unit/vault-snapshot.test.js` row cites no table ("cover the acceptance criteria below (the implementer designs the cases)"), and the logbook-addendum paragraph cites none. The pre-rewrite version scoped this correctly ("each `src/` row cites its table; the two doc rows cite D and E"); the renumbering pass over-generalized it into a claim the table does not satisfy.

## S4 — Leftover phrase: "the replaced measurement deliverable"
> "- [ ] Implementation notes: the single-read rule and **the replaced measurement deliverable**"

There is no measurement deliverable, replaced or otherwise. The Implementation notes bullet it points at is titled "**No measurement deliverable.**" This is the only surviving noun-phrase from the deleted mechanism that still reads as if the thing exists.

## S5 — "none of those three cases" demonstrates two
> "On the REPORTS slice, **none of those three cases** causes a skip: a report whose body opens with `---` prose, and one carrying `derived_from_untrusted: true`, are both copied."

Two fixtures for three classes; `untrusted-invalid` is never exercised on the reports slice. (The notes-slice criterion directly above it correctly names all three.)

## S6 — Orphaned row in the measured table
The "Measured behaviour of `parseNoteResult`" table retains `` `# Dream report — <date>\n\nbody\n` (today's report shape) | `null` — trusted ``. Its consumer disappeared when the gate became notes-only — the old heading was "on report-shaped input" with the justification "Needed because Table A applies the gate to reports as well as notes." I re-ran all seven rows against HEAD and every one reproduces exactly (`null`, `untrusted-exact`, `null`, `null`, `malformed`, `malformed`, `malformed`), and `require('./digest').parseNoteResult` is a function — so the table is *correct*, just partly consumerless now.

## S7 — "Measured" carries a claim it doesn't back
> "Measured, that is a live hazard rather than a dead branch: a model-written report body opening with `---` classifies as malformed, and `daily-digest`'s ONLY input is that one file."

The word "Measured" backs the *classification* (confirmed: `---\nprose\n---\n` → `malformed`). It does not back "live hazard", which is a frequency claim. Nothing in this spec or in `2026-08-13-vault-snapshot-gating-design-blockers.md` measures how often a dream report body opens with `---`, and the spec's own table shows today's actual report shape yields `null`. Given that this WP exists because a 98.57% figure killed the previous mechanism, an unquantified "live hazard" is the weakest sentence in the document.

## S8 — Loose citations (3 of ~45; none wrong, all verified)
- `digest.js:747-748` is cited for "`renderDigest` already runs **this exact function** over the daily note". Those lines call `readNoteBounded`; `parseNoteResult` is reached indirectly at `digest.js:265`. The claim is true, the line range doesn't show it.
- `CLAUDE.md :33-36` — the cited content (zero deps, Node ≥ 18, JSDoc, no build step) ends at `:35`; `:36` begins the idempotency bullet.
- `CURRENT-IMPLEMENTATION-REVIEW.md:292` is the M3 heading; "Major / High" is at `:294`.

## S9 — Deviation from precedent on who authors the ADR amendment
Table D: "The implementer writes it from this table; the OWNER signs it…". Both prior ADR-amendment WPs state the architect pre-writes the amendment in the spec's own commit and the implementer must not author it (`WP-daily-summary-per-line-framing.md:157`, `WP-adr-0028-entry-node-path-amendment.md:112`). Not a contradiction inside this spec, but a silent reversal of an established pattern; if it's deliberate, it should say so.

---

# Categories that are clean

- **Renumbering damage: CLEAN.** All 40 `Table A–D` references resolve to the table now holding that content. Zero surviving `Table E`. `Gate 2 → Gate 3` was renumbered consistently, including the Implementation-notes reuse bullet. Residuals 1–6 all resolve; no dangling Residual 7 (the old spec had seven).
- **Deleted-mechanism leftovers: essentially clean.** No surviving mention of raise-only, atomic temp+rename, `truncateExtractToFit`/message-dropping signals, `validate.js`, `dream/scratch.js`, `transcripts/*`, a measurement deliverable, or a warning line, except as explicit negations under "Out of scope" and Implementation notes. The one `tool_result` mention (Context, line 30) is legitimate background and mirrors `ADR-0032:20`. The only residue is S4 and S6.
- **Counts: clean except P4/S5.** "five existing checks" = 5 pushes at `vault-snapshot.js:83,87,91,95,99` ✓; "six numbered residuals" ✓; "two documents this WP corrects" ✓; "2-of-7 — three fire" = (iii),(iv),(vii), and `ADR-0031:105-114` is indeed two-or-more-of-seven ✓; "four always-allowed paths" matches `boundary-check.js:44,46,48,54` ✓; "the other five [verification steps] are red until the work is done" — 7 assertions, 2 green-on-untouched, 5 red ✓.
- **The logbook Deliverables reasoning: correct.** `boundary-check.js:49-53` says verbatim that a logbook entry "is never an implementation surface, so it is never a Deliverables entry and a spec that listed one would be wrong", `:54` adds `docs/specs/logbook/` with the trailing slash, and `:57-59` makes the prefix match work. The spec's justification for not listing it is accurate.
- **Verification-gate mechanics: sound.** `Wienerdog-authored facts (job status; a validated semver)` is present at `THREAT-MODEL.md:90` (so the `! grep -q` gate is genuinely red today); the bullet is exactly 7 lines (`:86-92`), so the `1\t7` numstat is right; `Status: PROPOSED — awaiting owner signature` occurs 0 times in ADR-0032 today (the existing amendment uses `Status: **ACCEPTED — OWNER-SIGNED 2026-08-10.**`), so `grep -Fxc = 1` is achievable and unambiguous; all four neutralizers exist as `function <name>(` in `src/` (`renderAlertField`, `sanitizeProjectName`, `listSecretQuarantine` in `digest.js`, `displayName` in `dream/ledger.js`), so the loop is green on the untouched tree as claimed; the `:-0` defence is real — `WP-daily-summary-per-line-framing.md:254` does carry the bare `cut -f2` form.
- **No require cycle.** `digest.js` requires `layout, safety-profile, frontmatter, identity-approvals, alerts, secret-scan` — nothing reaches `vault-snapshot.js`, so Table A's two new requires are safe. (The spec doesn't state this; the sibling `WP-neutralize-alert-callout-rendering` spec made the equivalent no-cycle claim explicitly. Worth adding, not a defect.)
- **`tests/unit/vault-snapshot.test.js` does not exist**, so `create` is the right action.
`````
