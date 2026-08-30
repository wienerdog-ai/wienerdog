# Internal coherence pass — after the read-path split

WP: WP-gate-vault-snapshot
Backend: general-purpose executor | subagent transcript agent-ac179eefae085453a.jsonl
Raw final output, byte-unchanged inside the fence. Recovered from the session transcript and
committed unadjudicated, per docs/runbooks/codex-review.md ("Rules").

`````text
I verified every `file:line` citation in the spec against the tree at HEAD `60aaa39`, ran the `parseNoteResult` measurement table, ran all six verification gates, and reproduced the read-failure behaviour of `makeVaultSnapshot`.

---

# PRODUCT FINDINGS

## P1 — Table A still claims cap-time containment the deleted read contract used to provide, and contradicts itself two rows later

**`:237`** (Position of the new gates):
> "AFTER the existing checks (regular-file, per-file cap, file-count cap, total-byte cap) and BEFORE the copy, **so an over-cap file is never read into memory**"

**`:251`** (same table, Known-imperfect row):
> "The `lstat`-then-reopen window: a file grown after its size check copies **262145 bytes past the 262144-byte cap with an empty `skipped[]`**"

and **`:250`** (Preserved unchanged): "The three cap VALUES **and the existing `lstat`-based way they are enforced**".

The caps are enforced from `st.size` (`vault-snapshot.js:90`, `:98`), and the read is now an unbounded `fs.readFileSync` whose bounding is explicitly out of scope (`:238`, `:561`). So "never read into memory" is true only of *a file that was over-cap at `lstat` time*. A file that is over-cap **at read time** is read into memory in full — the exact reproduction the same table records. Under the deleted contract (read capped at `MAX_FILE_BYTES+1`) the claim was structurally true; it is now a leftover. It also has no acceptance criterion and no gate, so nothing catches it.

## P2 — The spec demands total (never-throwing) behaviour while excluding the only mechanism that delivers it; the criterion is false of the code today

**`:450-451`**:
> "No gate throws: a scan error, **an unreadable file** and undecodable bytes all yield a skip, and `makeVaultSnapshot` completes."

**`:247`**: "No gate throws, no gate fails the run, no gate is silent". **`:81`**: "Every skip is VISIBLE".

Against **`:238`** ("Everything else about how that read is performed — … descriptor lifecycle — is DELIBERATELY not specified here") and **`:570`** ("do not 'improve' the surrounding read while you are in the file").

Measured on this tree: a mode-`000` file makes `lstatSync` succeed and `readFileSync` throw, so **`makeVaultSnapshot` throws `EACCES` out of `composeRoutineRun` today** — no skip, no `skipped[]` entry, the whole routine composition dies. The existing `unreadable` skip at `:83` fires only on `lstat` failure. This WP *moves the read earlier* into the gate chain, which makes the read's error path load-bearing for "no gate fails the run" — and the read's error/close lifecycle is precisely what was split out. Either the criterion is unsatisfiable inside the boundary, or the implementer must add read error handling that Out of scope forbids. Nothing in the spec resolves which.

## P3 — Residual 7 disclaims the one property the surviving read requirement exists to guarantee

**`:404-405`** (Residual 7):
> "What it does NOT: **that the file gated is still the file copied under a concurrent write**, or that the caps are unbypassable."

**`:238`** (the WP's only read requirement):
> "ONE read, whose bytes feed BOTH the gate decision and the copy … **No second read, so no window between deciding and copying**"

**`:439-441`** (acceptance):
> "Every copied file is byte-identical to its source, **and to the bytes the gates decided on**: the file is read ONCE"

With a single read there is no gated-file/copied-file divergence — that is the entire point of the requirement and of the `digest.js:181-186` rationale the spec cites. The property that genuinely survives unguaranteed is different: *the file `lstat`ed is not necessarily the file read* (post-check symlink swap). Residual 7 is a leftover of the two-read/TOCTOU framing and, as written, tells the implementer the single-read rule buys nothing.

Related ungated universal in the same criterion: **"Every copied file is byte-identical to its source"** — under the symlink-swap reproduction the copy is of an out-of-vault file, so it is byte-identical to *what was read*, not to "its source". The criterion names no exception set.

## P4 — "Both legs gain the two filters Table A ports" is false, and miscounts which gates are ports

**`:407-409`** (Security checklist, closing item):
> "M3 has two legs. **Both gain the two filters Table A ports**, so a report or note carrying a detectable secret, **or undecodable bytes**, no longer reaches a routine."

Contradicted by **`:241`** (Gate 3 is "NOTES SLICE ONLY") and **`:430-433`** (acceptance: on the reports slice *none* of the three exclusion classes causes a skip). The reports leg — which is `daily-digest`'s single input — gains only decodability + secret scan. And the sentence's own example names decodability, which **`:46-48`** and **`:98`** call the gate that is *new*, not ported ("two ported, one new", restated in the checklist at `:300`). So both the count and the membership are wrong in the one paragraph the Definition of done (`:610`) makes the PR body repeat.

## P5 — The gate-order rationale claims to match the digest while inverting it

**`:244`**:
> "The secret scan precedes the provenance gate … **matching the digest**, where the secret scan is the last filter before content ships (`digest.js:701-703`)"

Verified `digest.js:701-703`: "the LAST filter before a section joins the digest — **runs after** the A3 hash gate **and A4 provenance gate**". In the digest, provenance runs *first* and the scan *last*; the snapshot inverts that. The cited lines support the opposite of "matching". The order choice may still be right — the reason given for it is not the one the citation supports.

## P6 — The reports-slice exemption points at a residual that does not cover it

**`:243`**: "See **Residual 6** for the direction this exemption gives up".

Residual 6 (**`:378-390`**) is entirely about the *routine vault write-back path that does not exist*. It says nothing about dream reports or about the reports slice. Meanwhile the cost the exemption actually incurs — a report carrying `derived_from_untrusted: true` is copied **by design** (`:430-433`) — is recorded in no residual at all. Residual 4 covers only the notes-slice `malformed` cost.

## P7 — Unqualified symlink claim in Current state

**`:76-77`**: "`!isFile()` → skip **(symlinks never followed)**", and `:81` "**Every** skip is VISIBLE".

Contradicted by **`:251`**: a post-check symlink swap "copies an out-of-vault file", and "A symlinked SOURCE DIRECTORY **is followed** by `readdirSync` (`:66`) … also with an empty `skipped[]`". The Current-state summary is where an implementer forms their mental model; the correction arrives 170 lines later inside a table cell.

---

# SPEC-MACHINERY FINDINGS

## S1 — The Mirrored Surface Checklist promises two things the Implementation notes no longer contain

**`:298`**: "Implementation notes: **the single-read rule, the fixed gate order**, and the absence of a measurement deliverable".

The Implementation notes section (`:302-320`) contains: dependencies/Node, ADR-0004, "Reuse, do not reimplement", "No measurement deliverable", "No warning line", "When uncertain". **Neither the single-read rule nor the gate order appears there** — both live only in Table A `:238`/`:244`. Almost certainly a casualty of the read-contract deletion: the checklist row was not updated with the section.

## S2 — Two citations to ruling "point 5" are wrong (verified against the ruling)

**`:313`**: "**No measurement deliverable.** The 2026-08-14 ruling **(point 5)** replaces it…"
**`:574`**: "**Re-measuring the stamp firing rate** — ruled out **(point 5)**"

The ruling's numbered points (`docs/specs/logbook/2026-08-05-parked-report-provenance-product-decision.md:85-116`) are: 1 untrusted-by-default, 2 write-back marking, 3 **no stamp is built** (this is where the 98.57% measurement reasoning lives), 4 no warning line, 5 **entry-level provenance stays deferred**. The measurement rule is point 3 / the Resolution preamble. Point 4 (`:317`, `:573`) and point 2 (`:380`) are cited correctly.

## S3 — The residual→table map in the checklist is only true of the bold headers

**`:299`**: "1, 4 and 7 cite Table A, 2 cites Table B, and **3, 5 and 6 cite no table**".

Residual 3 (`:351-358`) cites **Table B** ("Table B's single prompt sentence is not an equivalent") and **Table D** ("Table D's Correction 1 records the same fact"). Residual 7 (`:391-405`) cites Table A **and Table B**. Residuals 5 and 6 do check out. The checklist also silently omits the two unnumbered Security-checklist items at `:324` and `:332`.

## S4 — "The three test rows … carry scope notes, not contracts"

**`:293`**. Two of the three cite tables: `:195` "cover **Table A**'s acceptance criteria" and `:198` "cover **Table B**". Minor, but this is the row that is supposed to certify the Deliverables/table mirror.

## S5 — ADR-0032 described at its pre-commit length, and as wholly owner-signed

**`:176`**: "Measured 2026-08-13: the file mentions the snapshot **zero** times. It is **owner-signed and append-only (153 lines)**."

Verified: `git show main:…0032….md | wc -l` = **153**; the file **on this branch is 200 lines**, because this spec's own commit already appended the 47-line 2026-08-14 amendment (`git diff --numstat main` → `47  0`) — which the spec itself asserts at `:284`. The amendment also carries `Status: PROPOSED — awaiting owner signature` (verified at `:157` of the ADR), so "owner-signed" is now true of only part of the file. The implementer opening the file sees 200 lines and a snapshot mentioned repeatedly.

## S6 — "The two gates below … check" that the T1 bullet is true

**`:520-521`**: "what matters about this bullet is that it is TRUE, **which the two gates below plus the acceptance criterion check**".

The two gates below are the `1 7` numstat (`:522`) and the neutralizer loop (`:526-528`). Numstat checks *line counts*, not truth. Only the loop bears on truth, and only for the existence of four identifiers out of the bullet's ~a dozen factual claims. (I verified all four exist: `renderAlertField` `digest.js:150`, `sanitizeProjectName` `digest.js:414`, `displayName` `dream/ledger.js:319`, `listSecretQuarantine` `digest.js:839`, and spot-checked the whitelist regexes and the already-formatted scheduler/update lines — the bullet's claims hold.)

## S7 — Criteria with no verification path

- **`:471`** "The parked decision's logbook entry carries its dated Resolution addendum." — no gate, and nothing asks for it (it is already written per `:204-206`). A dead criterion.
- **`:472`** "`tests/golden/digest-default.md` is byte-identical and is not edited." — "is not edited" has no gate; only `npm test`'s golden compare touches its content.

## S8 — "SIX new assertions" vs seven failure-exiting commands

**`:531`**. The block after `npm run lint` contains seven commands that exit non-zero: the `main` baseline guard (`:488`), `test "${ADR_DEL:-0}" = 0`, the amender-line `grep -Fxc`, the heading `grep -Fxc`, the `! grep -q` old string, the THREAT-MODEL numstat, and the neutralizer loop. The direction table (`:539-546`) has six rows because it folds the baseline guard into row 1 — but that row's own break instruction treats it as a separately-runnable check.

## S9 — The Position row enumerates four existing checks; there are five

**`:237`**: "(regular-file, per-file cap, file-count cap, total-byte cap)". The code has five skip sites — `:83` (`unreadable`, on `lstat` failure), `:87`, `:91`, `:95`, `:99` — and the spec itself lists all five at `:81`. The omitted one is the same `unreadable` path P2 turns on.

## S10 — Out of scope's read-path bullet is narrower than the ruling it cites

**`:561-562`**: "the `lstat`→open race, bounding the read, `O_NOFOLLOW` and its Windows semantics, and the descriptor lifecycle."

The owner ruling's point 4 (`…2026-08-14-snapshot-read-hardening-scope-question.md:127-130`) also assigns **the symlinked source directory** to that package. Table A `:251` and Residual 7 `:395-397` both name it; the operative "do NOT do these" list does not.

---

# CATEGORIES THAT ARE CLEAN

**Leftover read-contract requirements: clean.** Grepped `descriptor|O_NOFOLLOW|fstat|openSync|win32|Windows|bounded read|close|finally|TOCTOU`. Every surviving mention (`:238`, `:251`, `:398`, `:562`) is an explicit exclusion naming the queued WP. No surviving requirement about `O_NOFOLLOW`, fstat, a `MAX_FILE_BYTES+1` bound, close-in-finally, a win32 posture, or byte accounting from actual read length — the byte accounting is explicitly `st.size` (`:250`), matching the un-hardened code.

**Dangling references: clean.** All 49 `Table A–D` references resolve to defined tables; Residuals 1–7 are all defined and all referenced; Gates 1–3 defined at `:239-241` and referenced at `:308`. The residual count is exactly SEVEN as claimed.

**Deliverables: clean.** `SNAPSHOT_PLANS` has no consumer outside `vault-snapshot.js` (verified), so adding the notes-slice boolean touches no unlisted file. `npm test` = `tests/run.js` (unit + golden); the scenario harnesses that call `composeRoutineRun` (`tests/scenarios/negative/run-negative.js:359`) are a separate npm script and assert nothing about the prompt text; the only other prompt assertion (`codex-adapter.test.js:341`) is the *dream* prompt from `dream/brain.js:54`, a different code path. `tests/unit/routines-skill-structure.test.js` only greps skill markdown. Nothing else in the tree asserts the routine argv. Both intra-repo requires resolve and export what Table A calls (`parseNoteResult` and `scanAndRedact` verified as functions; `scanAndRedact` returns `{text, findings}`).

**Verification-gate directions: all six verified correct on this branch.** `main` exists; ADR numstat `47 0` → GREEN; amendment heading `grep -Fxc` = 1 → GREEN; amender line = 0 → RED; old T1 string present → `! grep -q` RED; THREAT-MODEL numstat empty ≠ `1\t7` → RED; all four neutralizers exist → GREEN. The `:86-92` bullet is exactly 7 lines, so the `1 7` expectation is right, and the old-string pattern sits entirely on line 90 so the line-based grep matches.

**Citations: everything else verified true.** `vault-snapshot.js` `:9-11`, `:18-20`, `:28-35`, `:42-43`, `:54`, `:66`, `:68`, `:70-74`, `:79-107`, `:83/:87/:91/:95/:99`, `:102`, `:104`, 113 lines, requires only `node:fs`/`node:path`/`./private-fs`; `routine-runtime.js` `:65-70`, `:121-145`, `:126-128`, `:129-130`; `digest.js` `:150-152`, `:160-174`, `:162-167`, `:181-186`, `:190-200`, `:265`, `:504-508`, `:701-713`, `:710`, `:735-736`, `:747`, `:764-774`, `:765`; ADR-0032 `:21-24`, `:54-60`, `:80-82`, `:86-88`, `:90`, `:90-93`, `:95`, `:96`, `:124-146`, `:150-151`; `broker-wiring.test.js` — exactly six `makeVaultSnapshot` call sites from `:133`, `deepEqual(skipped, [])` at `:147/:173/:207`, skip-reason asserts at `:182-184` and `:196-199`; `routine-runtime.test.js:104-106` asserts exactly the two named properties; `boundary-check.js:44-54` and `:49-53`; `CLAUDE.md:33-35`; `weekly-review/SKILL.md:26-28` (quote is verbatim); `dream/SKILL.md:409-425`; audit `:292`, `:294`, `:552`; `WP-daily-summary-per-line-framing.md:157` and `:288-293`; `WP-neutralize-alert-callout-rendering.md:167`; all three logbook paths exist; ADR-0031 has criteria (i)–(vii) and (iii)/(iv)/(vii) say what the spec claims. I re-ran the whole `parseNoteResult` measurement table at `:107-115` — **all seven rows reproduce exactly**, including `untrusted-invalid` on `True`.
`````
