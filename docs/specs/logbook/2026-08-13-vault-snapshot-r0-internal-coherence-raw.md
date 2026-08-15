# Internal coherence pass — pre-ruling draft

WP: WP-gate-vault-snapshot
Backend: general-purpose executor | subagent transcript agent-a09550480f96cb8c4.jsonl
Raw final output, byte-unchanged inside the fence. Recovered from the session transcript and
committed unadjudicated, per docs/runbooks/codex-review.md ("Rules").

`````text
I read the spec end to end and verified every `file:line` citation against the repo at HEAD. Findings below, product first, then spec machinery, each ranked.

---

# PRODUCT findings (implementer would build the wrong thing)

### P1. "Puts the digest's gates on the snapshot path" — only two of the three named gates are actually ported

Context, `:36-39`:
> "gates that same class of material at **three points**: a per-section secret scan, a three-state fail-closed provenance gate on frontmatter, and **per-line untrusted framing of the daily summary**. **The snapshot path has none of them**"

Context, `:47`:
> "This WP puts **the digest's gates** on the snapshot path"

But Table A's chain is `Gate 1 — decodability` (new, not a digest gate), `Gate 2 — provenance`, `Gate 3 — secret scan`. Per-line framing is nowhere in it. Its stand-in, Table C, is explicitly disclaimed:

Table C, `:243`: "Standing | **Defense in depth ONLY** … Tables A and B are the load-bearing fix"
Residual 4, `:347`: "the framing line is **not** the fix"

So the third gate of the three-gate table is not ported at all, and the spec elsewhere says its substitute doesn't count. The daily notes that `weekly-review` receives — the exact bytes ADR-0032 fences per-line in the digest — arrive in the snapshot with no per-line marking. **Why it matters:** the Context sets the implementer's mental model of "what done looks like" as three gates; the tables deliver two plus an admitted non-fix.

### P2. Table B calls `false` "not stamped" while every other statement says the block is written on every run

Table B rows, `:223-224`:
> "| Value = `false` (**not stamped**) | ONLY when all three hold …"
> "| Value = `true` (**stamped**) | Every other case …"

contradicted in the same table, `:227`:
> "| Written when | **ALWAYS**, once per run"

and in Exact contracts, `:178`:
> "The dream report's leading bytes become, **for every run** (Table B): `---\nderived_from_untrusted: false\n---\n…`"

and in acceptance, `:379`: "a run whose extracts contain none carries `false`".

**Why it matters:** an implementer reading "Value = `false` (not stamped)" can reasonably write nothing on the clean path. That silently breaks the acceptance criterion at `:379`, and it also degrades Table A's Gate 2 back to "trusted-by-default absence" for every clean report. The word "stamp" is used for two different things — the block, and the block's value being `true` (the measurement at `:298-303` uses the second sense: "the rate at which the stamp fires").

### P3. Table E's Correction 1 misstates what ADR-0032 currently says, and contradicts Residual 3

Spec, `:140-141`:
> "`docs/adr/0032-daily-summary-untrusted-fence.md` says at `:80-82` that `renderDigest` is 'the single chokepoint'"

Verified `0032:80-82` actually reads:
> "`renderDigest` is the single chokepoint **for the daily `## Summary`**, so every consumer of its output (SessionStart injection and any managed-block compile) inherits the fence"

The scope qualifier already exists and the spec drops it. Correction 1 (`:266`) then instructs the implementer to write:
> "`renderDigest` is the single chokepoint for the **digest path**."

That is a *different* qualifier, not a narrowing of the one on the page. Worse, it is in tension with the spec's own Residual 3, `:342-344`:
> "it does not bound what a hijacked dream writes into **the daily notes that `weekly-review` also reads**, and those notes carry no stamp"

The snapshot delivers the newest 7 daily notes — i.e. the very `## Summary` bytes ADR-0032 governs — into a model session unfenced. So Correction 1's "The vault snapshot … is a distinct route into a model session, **outside this ADR's mechanism**" is the opposite of what the spec establishes elsewhere. **Why it matters:** the amendment is owner-signed content in an append-only ADR; a wrong correction cannot be edited out later, only re-amended.

### P4. Table E's insertion point contradicts the ADR's own recorded ordering rule

Table E, `:263-264`:
> "| Anchor | The line whose entire content is `Amended by:` (`:95`)"
> "| Inserted line (byte-exact, **immediately after the anchor**) | …"

`0032:90-93` (verified) states the convention:
> "Amending work packages are recorded in the list under `Amended by:` below — one line per package, **appended** by the amending package itself"

Inserting immediately after `:95` places the new line *before* the existing `WP-daily-summary-per-line-framing` entry at `:96` — prepending to a list the ADR says is appended to. The verification gate (`grep -Fxc … = 1`) checks presence, not position, so nothing catches it.

### P5. Dangling reference: "Decision 1-4" — ADR-0032's Decision section has three decisions

Table E, `:269`:
> "| Not in this amendment | Any change to **Decision 1-4**, to the accepted residual, or to the bounded-read and gate decisions |"

Verified: `0032`'s `## Decision` section is numbered 1, 2, 3 (`:41-52`). The only 1-4 list in the file is inside the 2026-08-09 *amendment* (`:124-146`), which is a different list and is not called "Decision". The reference resolves to nothing under that name. It also double-counts: "the bounded-read and gate decisions" *are* Decisions 2 and 3.

### P6. Table B claims a measurement that the measurement table does not cover

Table B, `:229`:
> "| A model-written `---` block | Harmless and requires no special case: only the leading block is frontmatter … (**measured — see Current state**) |"

The Current-state measurement table (`:118-122`) row that this points at is:
> "| A code block, then a **LATER** `---` block in the body | `null` — only the leading block is frontmatter |"

Those are different shapes. Table B's `Written when` row (`:227`) prepends the code block "to the existing bytes" — if the model wrote its own frontmatter, the result is `---\nderived_from_untrusted: …\n---\n---\n…`, i.e. a second `---` **immediately adjacent** to the closing delimiter, not "later in the body". The adjacent-delimiter case is the one the new code actually creates and it is the one not measured.

### P7. Table B's `false` condition is not decidable from the artifact it names

Table B, `:223`:
> "ONLY when all three hold: `expectedScratch` is an array; **every path in it yielded an entry in `extractsBySession`**; and no entry has a message with `role === 'tool_result'`"

Verified `validate.js:1103-1109`: the map is keyed `` `${ex.harness}:${ex.session_id}` ``, so two paths sharing a key collapse to one entry and `map.size` under-counts. Also, an extract that parses fine but lacks `ex.harness`/`ex.session_id` is dropped by the `if` guard — silently absent from the map — yet the spec's Current state (`:102-103`) names only one absence mode: "An unreadable extract is swallowed by the `catch` and is simply absent from the map." Both omissions push toward fail-closed (`true`), so they are safe, but the rule as written is not implementable as stated against the cited data structure.

---

# SPEC-MACHINERY findings

### S1. "expect red on the untouched tree" is false for half the new gates

`:436-443`:
> "run each NEW step twice … once on the untouched tree (**expect red**)"

Verified against HEAD:
- `! grep -q "derived_from_untrusted" src/core/vault-snapshot.js` → the file has **0** occurrences today, so this assertion is **green** before any work.
- The neutralizer loop (`for fn in renderAlertField sanitizeProjectName displayName listSecretQuarantine`) → all four exist today (`digest.js:150`, `digest.js:414`, `dream/ledger.js:319`, `digest.js:839`), so this is **green** before any work.

Only blocks 1, 2, the `! grep -q 'Wienerdog-authored facts…'` line, and `grep -q "parseNoteResult"` go red. The instruction as written makes a correct implementer report two "failures to reproduce red."

### S2. Acceptance criterion with no verification path — Table D byte-exactness and "no other line changed"

`:393-394`:
> "`docs/THREAT-MODEL.md` carries Table D's replacement bullet **byte-exactly**, the false enumeration is gone, and **no other line of that file changed**."

The verification block only asserts *removal* of one old string plus the existence of four functions. Nothing asserts the replacement text byte-for-byte, and nothing asserts the rest of the file is untouched — even though the ADR gets exactly those two gates (`numstat` + `grep -Fxc`). The asymmetry is unexplained.

### S3. Count mismatch — ADR-0032 line count

`:144`: "It is owner-signed and append-only (**155 lines at HEAD**)."
Verified: `git show HEAD:docs/adr/0032-daily-summary-untrusted-fence.md | wc -l` → **153**.

### S4. Unbacked citation — boundary-check line range omits two of the four paths it claims

`:148-149`:
> "Always allowed without listing, per `scripts/boundary-check.js:48-54`: **this spec file itself, package-lock.json**, memory/lessons/inbox.md, and docs/specs/logbook/"

Verified: `:48` is `memory/lessons/inbox.md`, `:54` is `docs/specs/logbook/`. The spec file is added at **`:44`** and `package-lock.json` at **`:46`** — outside the cited range. Correct range is `:44-54`.

### S5. Mirrored Surface Checklist asserts something the Security checklist doesn't do

`:279`: "Security checklist: the four residuals, **each naming its table**"

Residual 1 (`:324-331`) names Table B ✓. Residual 4 (`:347-350`) names Tables A/B/C ✓. **Residual 2 (`:332-338`) names no table.** **Residual 3 (`:339-346`) names no table.** The checklist item is false as stated.

### S6. Dangling term — "the candidate-OR"

Residual 3, `:339`:
> "**The candidate-OR** defends against PASSIVE pass-through"

`candidate-OR` appears exactly once in the document and is defined nowhere. Table B never uses the term for the taint disjunction it specifies. Reads as leftover from an earlier draft.

### S7. Unbacked citation — `vault-snapshot.js:42-43`

`:73-74`:
> "Every skip is VISIBLE: **pushed to `skipped[]` (`:42-43`)**"

Verified `:42-43`:
```
 * skipped quietly); an over-cap file is skipped VISIBLY via `skipped`.
 * @param {import('./paths').WienerdogPaths} paths
```
That's JSDoc prose and a `@param` tag. The actual `skipped.push(...)` calls are at `:83`, `:87`, `:91`, `:95`, `:99`.

### S8. Unbacked citation — Correction 2's `:14-16` does not state a deferral

`:141-142` and Table E `:267`:
> "the honest statement this file already carries at **`:14-16`** and in its amendment tail"

Verified `0032:14-16` says WP-112 "nam[ed] a future entry-level-provenance WP that was **never written**" — a statement that the WP doesn't exist, not that the work is deferred. The actual deferral statements are at `:54-60` ("so it is deferred") and `:150-151` ("remains the deferred full solution" — the amendment tail, which the spec does cite correctly).

### S9. Acceptance criterion doesn't match the row it quantifies over

`:371-374`:
> "**Every existing behaviour in Table A's last row** is unchanged — the three caps **and their reasons**, the filename-descending pick, symlink skipping, 0700/0600 modes, the mirrored layout, **`inbox-triage` returning a null `snapshotDir`**, and the function's return shape."

Table A's last row (`:215`) lists: "The three caps, **`SNAPSHOT_PLANS`**, the filename-descending pick, the lstat symlink safety, 0700 dirs / 0600 files, the mirrored layout, and the function's **signature** and return shape." The criterion adds two items not in that row (cap reason strings; `inbox-triage`, which is a *different* row at `:214`) and drops two that are (`SNAPSHOT_PLANS`, the signature). The universal "Every … in Table A's last row" therefore does not quantify over that row.

### S10. "The ruled interim behaviour" — the cited source says it is unruled

`:231` and `:450`: "the **ruled** interim behaviour (exclusion, Table B)"

Verified `docs/specs/logbook/2026-08-05-parked-report-provenance-product-decision.md:9-13`:
> "**Status: PARKED by the owner.** This is a recorded, **undecided** product question … **Nothing here is binding until the owner reopens and rules it.**"

No document in the spec's citation set establishes who ruled the interim. The parked entry does describe exclusion as what the gating WP builds, so the behaviour is backed — the word "ruled" is not.

### S11. Dangling reference — `WP-alert-producer-freeform-residual` does not exist

`:460-462`:
> "**The two queued follow-up WPs** — the secret-scan limit guard, and `WP-alert-producer-freeform-residual`. **Both sit behind this package in the queue**"

Verified: no such file in `docs/specs/` or `docs/specs/done/`. `docs/specs/done/WP-neutralize-alert-callout-rendering.md:167` already records: "`WP-alert-producer-freeform-residual`; **that spec does not exist**". "The secret-scan limit guard" matches no spec filename either (`WP-secret-scan-baseline-oracle.md`, `WP-secret-scan-whole-token-runs.md` are the only secret-scan specs). There is no queue document in the repo that either could "sit behind this package" in.

### S12. Ungated universal contradicted inside its own bullet

Security checklist, `:313-318`:
> "**N/A — no untrusted identifier reaches a filesystem path or a shell command here.** Snapshot destination paths are built from `SNAPSHOT_PLANS`' code-owned `dir` values **and a filename** already filtered by the existing `.md` pick and lstat checks"

The filename *is* an untrusted identifier and it *does* reach `path.join(snapshotDir, spec.dir, name)` (`vault-snapshot.js:102`). The bullet asserts the universal and then names its own exception without retracting the universal. The load-bearing claim — "this WP adds no path or command construction" — is correct and sufficient; the universal in front of it is not.

### S13. The "awkward-but-legal" case named for the Table A gate cannot exercise that gate

`:441-443`:
> "including the awkward-but-legal cases — … and a `vault-snapshot.js` that calls `parseNoteResult` while **a test fixture elsewhere still contains the string `derived_from_untrusted`**"

The gate is `! grep -q "derived_from_untrusted" src/core/vault-snapshot.js` — scoped to one file. A fixture "elsewhere" is out of scope by construction, so this case can never turn the gate red. The genuinely awkward case (a legitimate mention of the identifier inside a comment in `vault-snapshot.js`) is not named.

### S14. Acceptance criterion spans two Deliverables rows with no owner

`:388-389`: "A stamped report is excluded from a `daily-digest` snapshot by Gate 2, visibly — **the end-to-end path from Table B to Table A**."

Deliverables assign `tests/unit/vault-snapshot.test.js` → "the acceptance criteria below" and `tests/unit/dream-validate.test.js` → "cover **Table B's** acceptance criteria". The end-to-end criterion belongs to neither cleanly, and neither cell mentions it.

### S15. Minor unbacked citation — `codex.js:63`

`:106` and `:225` claim `role: 'tool_result'` "is assigned by code" at "`transcripts/codex.js:63`, `:122`". Verified `:63` is a comment (`// Tool/external-output item types → UNTRUSTED (role 'tool_result')`); the assignment is only at `:122`. `claude.js:139-141` ✓ correct.

### S16. Acceptance item with a partially-missing gate

`:395-397` requires "the dated amendment **with its PROPOSED status line**". The two ADR gates cover deletions (numstat) and the amender line (`grep -Fxc`). Nothing asserts the presence of `Status: PROPOSED — awaiting owner signature`.

---

# Categories with nothing to report

- **Deliverables mismatch (category 7): none found.** Every file the prose or verification commands require is listed or is one of `boundary-check.js`'s always-allowed paths (spec file `:44`, `package-lock.json` `:46`, `memory/lessons/inbox.md` `:48`, `docs/specs/logbook/` `:54`). `tests/golden/digest-default.md` is correctly *unlisted* and asserted unchanged. No listed file is unused: `tests/unit/dream-validate.test.js` and `tests/unit/routine-runtime.test.js` exist (modify ✓), `tests/unit/vault-snapshot.test.js` does not (create ✓).

# Citations that verified clean (checked, not eyeballed)

`vault-snapshot.js` 113 lines ✓, `:9-11` ✓, `:18-20` ✓, `:28-35` ✓, `:54` ✓, `:70-74` ✓, `:79-107` ✓ · `routine-runtime.js:121-145` ✓, `:126-128` ✓ · `digest.js:150-152` ✓, `:160-174` ✓, `:181-186` ✓, `:190-200` ✓, `:504-508` (four fields ✓), `:609-611` ✓, `:701-703` (quote exact ✓), `:701-713` ✓, `:710` ✓, `:735-736` ✓, `:764-774` ✓; `parseNoteResult` is exported at `digest.js:855` ✓ · `dream/validate.js:196-211` ✓, `:457-474` ✓, `:1103-1109` ✓, `:1342-1344` ✓, `:1345-1350` ✓, `:1349` ✓, `:1355-1358` ✓; `1103` and `1345` are both inside `validateAndCommit` (starts `:1041`, next function >1500) ✓ · `cli/dream.js:558-563` ✓ · `transcripts/claude.js:139-141` ✓, `codex.js:122` ✓ · `dream/scratch.js:245-247` ✓ · `THREAT-MODEL.md:86-92` (bullet boundaries exact ✓), `:65-81` ✓, `:66-81` ✓ · `ADR-0032:21-24` ✓, `:80-82` (text present, see P3) , `:86-88` ✓, `:95` anchor is a whole line and the prose occurrence at `:90` is distinct ✓, zero "snapshot" mentions ✓ · `audit …REVIEW.md:292` ✓ (severity is on `:294`), `:552` ✓ · `SKILL.md:409-425` ✓ · `routine-runtime.test.js:104-106` ✓ · `CLAUDE.md:33-36` ✓ · `boundary-check.js:48-54` (see S4) · ADR-0031 criteria (iii)(iv)(v)(vii) all match their descriptions and the "four fire" count is correct ✓ · all four Table D neutralizers exist and two of them do implement the `[A-Za-z0-9._-]` whitelist the bullet claims ✓ · the Table D removal-grep string occurs exactly once in `THREAT-MODEL.md` today ✓ · all eight prefix sources Table D enumerates exist in `digest.js` (`identityWarn`, `formatAlerts`, `quarantineLine`, `secretQuarantineWarn`, `insecureModesWarn`, `schedulerLine`, `updateLine`, Active-projects) ✓.
`````
