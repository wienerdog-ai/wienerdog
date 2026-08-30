# Round zero's peer — internal coherence pass, on the drafted read-path spec

WP: WP-snapshot-read-path-hardening
Backend: internal executor in a fresh context (no external reviewer), reading the
spec end to end for contradictions and re-running its citations against the tree.
Tree: `wp/snapshot-read-path-hardening` @ `3b43954` (pre-rebase SHA; the same
content now sits at `348b205` after the rebase onto `79ba77f`).

Raw final output, byte-unchanged inside the fence. **Committed AFTER
adjudication**, not before — see the round record for what that costs.

Two of these twenty findings did not survive the orchestrator's spot-check and
were dropped; the record keeps them as written, and the round record names them.

`````text
I re-ran every citation against the files at HEAD 3b43954. Findings below.

---

## HEAVY

**1. The Deliverables row for `broker-wiring.test.js` permits a repair; acceptance criterion 11 forbids one.** (spec `:151` vs `:313-314`)
Row 3 Notes: "listed so the boundary check permits a repair if one of them turns out to depend on an ordering this WP moves." Criterion 11: "`npm test` and `npm run lint` pass, and `tests/unit/broker-wiring.test.js` **passes without being edited**." If the escape hatch the Deliverables row exists for is ever used, the acceptance criterion is unsatisfiable — the implementer is told the file may need repair and simultaneously that repairing it fails the WP.

**2. Table A cites a test comment as "still holds" when Table A abolishes half of what it says.** (spec `:188`)
Table A's cost row: "no content gate can decide an over-cap file (the property recorded at `tests/unit/vault-snapshot.test.js:407-408` still holds)". Re-ran that citation — lines 407-408 read: `// The over-cap file is rejected on its lstat size — it is never read, so no` / `// content gate can have decided it.` The first clause ("rejected on its lstat size — it is never read") is exactly what Table A inverts: "An over-cap file is now opened and read up to the bound before it is refused". Only the derived half survives. That comment is also an unregistered mirror — the Mirrored Surface Checklist (`:220-235`) registers four mirrors, all inside `src/core/vault-snapshot.js`, and none in the test file the spec is asking the implementer to leave in a state its own comment contradicts.

**3. The descriptor-lifecycle exit-path enumeration omits the only path that can leak.** (spec `:189`, criterion at `:301-302`)
Table A: "closed on EVERY exit path: cap skip, gate skip, read error, successful copy." Criterion 7 names the same four. But `:194-196` of `src/core/vault-snapshot.js` is `mkdirPrivate(path.dirname(dest))` and `fs.writeFileSync(dest, buf, {mode: 0o600})`, and `mkdirPrivate` is documented to **throw** `WienerdogError` on a symlinked ancestor (`src/core/private-fs.js:186`, `:201`, `:217`). Today no descriptor exists, so nothing leaks. After Table A one does, and a throw out of `makeVaultSnapshot` is not in either four-item list. An implementation that closes on each of the four named paths (no `try/finally`) satisfies the spec as written and still leaks the fd. Either the list must include "any throw out of the loop body" or the row must require `finally`.

**4. The open-failure contract has no acceptance criterion and no existing test to fall back on.** (spec `:182`)
Table A moves the `unreadable` skip's producer from the read to the open: "ANY failure to open → the existing `unreadable` skip, and the run continues." This is the behaviour the ADR-0031 activation line `(iv)` is built on ("what a failed open … does"). No acceptance criterion asserts it — criterion 2 only says a swap's "skip is visible in `skipped[]`" without naming the reason, and criterion 5 asserts the reason *set*, not who produces it. Criterion 11 (`npm test`) does not cover it either: `grep -n "0o000\|chmodSync\|unreadable" tests/unit/vault-snapshot.test.js tests/unit/broker-wiring.test.js` returns **nothing** — the mode-000 case the Done spec measured (`docs/specs/done/WP-gate-vault-snapshot.md:256`) was never given a test. So the single most-changed failure path in this WP is asserted by nothing.

**5. The spec fixes the JSDoc's whole-path overclaim but preserves the identical overclaim in the user-visible reason string, without saying so.** (spec `:120-122`, `:192` vs `:193`)
`:120-122`: "Prose describing the snapshot's symlink posture exists in **exactly one place**: the `makeVaultSnapshot` JSDoc". Table A `:192` obliges rewriting it because it "currently reads as a whole-path property". But Table A `:193` preserves verbatim the skip reason `not a regular file (**symlinks are never followed**)` — which is prose, reads as a whole-path property, and is surfaced to the user on stderr by `routine-runtime.js`. So "exactly one place" is false, and the spec silently applies two different standards to the same claim. (Verified the rest of `:120-125`: no `symlink` prose about the snapshot anywhere in `src/` outside this JSDoc — `private-fs.js`'s symlink prose is the write path — and none in either routine skill; `docs/THREAT-MODEL.md:97` does say "bounded snapshots" and is its only snapshot mention.)

**6. Table B states win32 behaviour as fact with no reproduction, and generalizes a darwin-only measurement to POSIX.** (spec `:205`, `:206` vs `:107`, `:137-139`)
The measurements are declared "measured on this tree (**darwin**, node v24.18.0)" (`:107`). Table B's POSIX column then asserts `O_NOFOLLOW`/`O_NONBLOCK` "present" for POSIX at large, including the ubuntu runner CI actually uses; and the win32 column asserts "**does not exist**" for both flags with no reproduction and no provenance marker, while every POSIX cell carries "(measured)". The spec's own prose at `:137-139` says win32 behaviour "is a stated posture and a named residual, never a tested claim" — so the table and the prose disagree about the epistemic status of those two cells. The repo rule is "paste the reproduction or do not state the behaviour"; here the composition branch is built on the unmeasured half.

---

## LIGHT

**7. "three code comments" vs four registered mirrors.** (`:172`) Activation `(vii)`: "the same contract appears in this spec, in **three** code comments…". But the checklist registers three at `:220-230` **plus** "A **fourth** mirror" at `:231`, the Deliverables row says "the **four** registered comment mirrors" (`:149`), and criterion 9 says JSDoc + "the other **three**" = four (`:306-309`). The activation line is the only "three".

**8. "two rows of a Done spec" undercounts.** (`:172`) The spec treats at least four Done-spec locations as mirrors of this contract: `:255` (single-read invariant, Table A `:190`), `:267` — which `:254` explicitly calls "a mirror of this contract" — `:270` and `:271` (both cited at `:47-48`), plus checklist item `:412`. All five citations re-run and resolve; only the count is wrong.

**9. Off-by-one citation.** (`:116`) `src/core/secret-scan.js:22` is `const ScanLimits = {`; `SCAN_MAX_BYTES: 256 * 1024` is at `:23`. (The "exported" claim is correct — `module.exports` at `:325` includes `ScanLimits`, so criterion 8's assertion needs no edit outside the listed Deliverables. `secret-scan.js:283` is exactly the oversized bail, correct.)

**10. Grep 1 is over-strict in one direction and doesn't assert what it claims in the other.** (`:323`, claim at `:214-215`)
`! grep -q 'readFileSync' src/core/vault-snapshot.js` matches comments. The checklist at `:220-230` *orders* the read-site comment `:177-181` rewritten; the natural rewrite ("the unbounded `readFileSync` is gone", "replaces `readFileSync`") turns a correct implementation red. Conversely the checklist claims the greps "assert Table A's 'no whole-file read'" — they don't: an unbounded `readSync` loop to EOF, or `fs.readFile`, passes this grep while violating Table A `:184`.

**11. Grep 2 collides with what Table B's composition rule asks for.** (`:325`, rule at `:207`)
Table B: "branch explicitly on `process.platform === 'win32'` and **name what is absent in a comment**". The idiom's name *is* `|| 0`, and the spec itself writes it four times. A comment saying "never `fs.constants.O_NOFOLLOW || 0` — a missing flag would look present" turns a correct implementation red. The substring also matches `|| 0o600`.

**12. Citation clips its block.** (`:133-135`) "the over-cap and leaf-symlink skips at `:176-199`" — the leaf-symlink test runs `:188-200`; `:199` is its last assertion, `:200` closes it. The six call sites (`:140`, `:160`, `:171`, `:181`, `:196`, `:205`) and the three `assert.deepEqual(skipped, [])` at `:147`, `:173`, `:207` all check out.

**13. Out of scope reverts wording a previous internal round already closed.** (`:344-345`) "The scan-limit guard, and `WP-alert-producer-freeform-residual` — **queued behind this one**." Verified: neither has a spec file, and `docs/specs/done/WP-neutralize-alert-callout-rendering.md:167` records that the latter "does not exist"; there is no queue document. This exact phrasing was raised in the gate WP's internal coherence round (`docs/specs/logbook/2026-08-13-vault-snapshot-r0-internal-coherence-raw.md:182-184`) and the Done spec was corrected to "**The two named-but-unwritten follow-ups** … Neither has a spec file, so neither is a dependency" (`:665-668`).

**14. Measurement protocol where the rule asks for one provenance line.** (`:76-78`, `:112-113`) "the race cases are staged deterministically by monkeypatching `fs.lstatSync` for the one candidate path, which reproduces the window's OUTCOME … without depending on timing" and "(killed after 3 s)" are how the measurement was taken, not the measured value. Authoring rule: "A measured value carries one provenance line, not its measurement protocol."

**15. Three facts stated more than once instead of stated once and cited.** The `|| 0` degradation: `:112-114`, `:198-200`, `:207`, `:324`. The CI matrix: `:137` and again inside Table B `:208`. The FIFO 3-second block: `:113` and again at `:206`.

**16. Ungated universal.** (`:179`) "Path resolutions per candidate | Exactly **TWO**". Per copied candidate the module also resolves the destination — `mkdirPrivate(path.dirname(dest))` and `writeFileSync(dest)` at `:194-196`, and `mkdirPrivate` itself walks and lstats ancestry. The row means *source* resolutions; it does not say so, and the same row's "never by re-resolving the path" can be read as forbidding the write-side joins.

**17. Two mirrors of the accepted-directory fact are unregistered.** The fact lives at `:58-61` ("What this package deliberately does not do"), Table A `:192`, the security checklist `:270-272`, Out of scope `:339-341`, and criterion 9. The Mirrored Surface Checklist registers the security checklist and the criteria — not the Context paragraph and not the Out-of-scope bullet.

**18. "The ruling names four subjects" omits the fifth item the same ruling assigns here.** (`:48`) Re-ran `docs/specs/logbook/2026-08-14-…-scope-question.md`: point 2 does name exactly those four. But point 4 additionally routes "**The symlinked-source-directory behaviour travels with the read-path package** as the open product question inside it (refuse, resolve-and-bound, or accept)" to this package. The spec resolves that question (Table A `:192`) but never says the 2026-08-14 ruling is what put it here, so the enumeration reads as complete when it isn't.

**19. The 2026-08-15 owner ruling has no record outside this spec.** Cited at `:60-61`, `:192`, `:271`, `:340` ("do not edit the Done spec whose Residual 7 predates the ruling"). `docs/specs/logbook/` has no 2026-08-15 entry — its last snapshot entries are 2026-08-14. The only place the ruling exists is Table A, i.e. the spec citing itself as the input that discharges a Done spec's Residual 7. Contrast the 2026-08-14 ruling, which has a file. (The same date is also used at `:118` for the coupling discovery, which is fine — that one is attributed to the implementer, not to a ruling.)

**20. Table B's composition rule is asserted by no acceptance criterion.** (`:207`) The `process.platform === 'win32'` branch is backed only by grep 2, which tests the *absence of one idiom*, not the presence of the branch. Meanwhile the checklist item at `:213` claims "Acceptance criteria that assert Tables A **and B**". (Table B's other three rows are covered: criterion 2 → `O_NOFOLLOW`, criterion 3 → `O_NONBLOCK`, criterion 4/`:204` → `O_RDONLY` implicitly.)

---

## Categories with nothing to report

- **Acceptance criteria with no contract row behind them: none.** All eleven map to a Table A or Table B row (1→cap row + coupling row; 2→`O_NOFOLLOW`; 3→fstat + `O_NONBLOCK`; 4→byte-accounting + single-read; 5→reason vocabulary; 6→the read; 7→descriptor lifecycle; 8→coupling; 9→accepted-directory + checklist; 10→preserved-unchanged; 11→Deliverables).
- **Deliverables rows permitting unasked work, or asked work on an unlisted path: none.** Verified that criterion 8's assertion is writable inside the listed files (`ScanLimits` is exported at `secret-scan.js:325`), that the coupling statement and the win32 branch land in `src/core/vault-snapshot.js`, and that the JSDoc obligation lands in a listed file — the spec closes that loop itself at `:126-127` after establishing `THREAT-MODEL.md` and the skills say nothing about symlinks (confirmed).
- **Preserved-unchanged row contradicted by another row: none.** Every item at `:194` re-checked against Tables A and B and against the code; the two things the Done spec `:270` listed as preserved and this WP changes (`st.size` accounting, lstat-based cap enforcement) are correctly absent from this spec's list and explicitly changed at `:186-187`.
- **All other citations re-run and resolve as described**: `vault-snapshot.js` `:9-11`, `:29-31`, `:31`, `:104-124`, `:107-109`, `:111-112`, `:116-118`, `:141`, `:145-149`, `:154-160`, `:156`, `:161-164`, `:165-176`, `:177-181`, `:182-188`, `:184`, `:185-187`, `:189-193`, `:194-198`, `:196`, `:198`, and the 205-line count; `vault-snapshot.test.js:390-411`, `:407-408`, 411 lines; `THREAT-MODEL.md:97`; `ci.yml:33`; `boundary-check.js:44-54` (all four always-allowed paths at `:44`, `:46`, `:48`, `:54`); Done spec `:255`, `:267`, `:270`, `:271`, `:412`; commit `e3c7474`; the logbook Resolution's points 2 and 3.

---

**20 findings, 6 heavy / 14 light.**
`````
