---
date: 2026-08-19
title: "WP-validator-decided-bytes round 0b — internal coherence pass, raw output"
related_wps: [WP-validator-decided-bytes]
---

# Round 0b — internal coherence (raw)

**Backend:** internal, **fresh clean context** — deliberately NOT the drafting
context. The predecessor's record flagged the same defect three packages
running (`2026-08-17-frontmatter-recognition-review-rounds.md`,
`2026-08-15-snapshot-read-path-review-rounds.md`,
`2026-08-14-vault-snapshot-review-rounds.md`): the internal pass had always run
inline during drafting, so its findings were fixed in the same breath and its
raw output could never be committed before adjudication. Running it in a
different context from the one that fixes is the only shape that satisfies the
rule. **This raw file is committed BEFORE adjudication and before any fix.**

**Revision reviewed:** `5e90d31`, branch `wp/validator-decided-bytes`.
**Scope instruction given:** internal contradiction only — a claim unmade
elsewhere, a count that does not match its list, a cross-reference that does
not resolve, a verification command whose stated purpose does not match what it
asserts. Explicitly NOT a design critique.
**Read-only:** verified mechanically by the executor on both sides —
`git status --porcelain` empty and byte-identical before and after.

Everything below the line is the reviewer's final message, verbatim.

---

## Verdict
4 FINDINGS

## What I executed
All read-only; all exit 0.

1. `git status --porcelain | tee /tmp/gs-before.txt` — exit 0 (empty)
2. `Read` on `docs/specs/WP-validator-decided-bytes.md`
3. `grep -n 'parseFrontmatter(' src/core/dream/validate.js; wc -l src/core/dream/validate.js; ls -la tests/unit/{dream-validate,frontmatter-digest-differential,frontmatter-unify}.test.js` — exit 0
4. `sed -n '180,200p;290,350p;480,510p;1150,1180p' src/core/dream/validate.js` — exit 0
5. `sed -n '325,340p;378,392p' docs/specs/done/WP-frontmatter-recognition-failopen.md` — exit 0
6. `cat -n tests/unit/frontmatter-digest-differential.test.js; sed -n '183,196p;685,692p' src/core/digest.js` — exit 0
7. `grep -n 'raise-only\|derived_from_untrusted === true\|allowlist' src/core/dream/validate.js; awk 'NR>=327&&NR<=350' src/core/dream/validate.js` — exit 0
8. `wc -l tests/unit/frontmatter-unify.test.js; awk 'NR==61||NR==93||NR==94' …; awk` anchor probe over 17 cited validate.js line numbers — exit 0
9. `grep -n '^### \|^## Successors' docs/specs/done/WP-frontmatter-recognition-failopen.md; awk 'NR>=380&&NR<=390'` — exit 0
10. `git status --porcelain > /tmp/gs-after.txt; diff /tmp/gs-before.txt /tmp/gs-after.txt` — exit 0

## Findings

### 1. (high) "five parse sites" contradicts the spec's own definition of a parse site

Line 178–180:
> `The four rejecting rows above — five parse sites — are the whole of the`
> `guard: no other site in the file reads a frontmatter field to make a security`
> `decision.`

Lines 71–84 define what a parse site is and enumerate them:
> `Six sites consult the shared parser, five through`
> `` `parseFrontmatter` and one through `skillBody`: ``
> …bullets for `:195`, `:317`/`:325`, `:343`, `:500`, `:1170`

The four rejecting rows of Table A are `:195`, `:317`/`:325`, `:332`, `:500`. Of those line numbers, only **four** are parse sites (`:195`, `:317`, `:325`, `:500`); `:332` is the raise-only guard, which per the Current-state list is not one of the six parse sites (confirmed in code: `validate.js:332` is `if (head.derived_from_untrusted === true && cur.derived_from_untrusted !== true)`, reusing the parses from `:317`/`:325`). The count "five" matches the *decision*-site count the spec uses elsewhere — line 158: `"a changed outcome at five decision sites"`.

Smallest edit: line 178, `— five parse sites —` → `— five decision sites —`.

(Related, same axis, low: line 218's checklist item `"The Current-state list of the six parse sites (Table A's rows)"` equates six parse sites with Table A's rows, but Table A has seven rows — it adds `:332` and `:346`, neither a parse site.)

### 2. (medium) "successor B" names two different things — one connected to this WP, one explicitly unconnected

Line 170 (Table A, `:195` row):
> `so that reason states a falsehood and sends the user to add fields that are already there — the inaccurate-remedy defect this repo is already tracking as the charter's successor B`

Lines 352–355 (Out of scope):
> `- The digest banner's remedy accuracy — the charter's successor **B**`
> `` (`docs/specs/done/WP-frontmatter-recognition-failopen.md:383`), a six-class ``
> `problem with no connection to this one.`

Table A says the falsehood it is *fixing here* (via R1) is the defect tracked as successor B; Out of scope says successor B has "no connection to this one" and is out of bounds. Verified against the cited charter: `WP-frontmatter-recognition-failopen.md:383` is `### B. The banner's remedy accuracy`, scoped to `digest.js:784`'s template and its six exclusion classes — not the validator's Tier-3 revert reason. So the Table A row also mislabels the identifier it cites.

Smallest edit: line 170, `the inaccurate-remedy defect this repo is already tracking as the charter's successor B` → `the same inaccurate-remedy failure mode the charter's successor B tracks on the digest banner — a different surface`.

### 3. (medium) A verification step's comment cites Table A for a rule that is canonical in Table B

Lines 323–324:
> `# Table A: no second read of a decided Tier-3 path survives at registration.`
> `` ! grep -n 'parseFrontmatter(fs.readFileSync' src/core/dream/validate.js ``

Line 163 / line 186:
> `### Table A — where a malformed block is rejected`
> `| Reads per accepted Tier-3 path | exactly one, made by the decision at `:195`. The `:1170` re-read is removed (C2) |`  (Table B)

And line 143–145: `**C2 — decide once.** … there is no second read of that path (Table B).`

The check asserts C2, which the spec states is canonical in Table B; Table A is titled as the malformed-rejection table. (The grep itself is accurate: `parseFrontmatter(fs.readFileSync` matches only `validate.js:1170` on this tree, so the command does match its stated purpose.)

Smallest edit: line 323, `# Table A:` → `# Table B (C2):`.

### 4. (low) "each is an assertion … rather than printing a number a reader must judge" is falsified by the first of the four, and only three red-run recipes are given for four assertions

Lines 339–344:
> `The last four are NEW steps and each is an assertion — it exits non-zero on`
> `failure rather than printing a number a reader must judge. Paste a real green`
> `… **and** a real red from a deliberately broken state (the`
> `` `:1170` re-read restored; one reason literal reworded; a line inserted between ``
> `the retention comment and its call), so a check that cannot fail is caught`
> `before anyone believes it.`

Line 321 (the first of those four steps):
> `…if(!parse(t).malformed)throw new Error("fixture is no longer malformed — the test lost its subject");console.log("parse.malformed=true, fieldsExposed="+Object.keys(P(t)).length)'`

That step does print a number no assertion covers (`fieldsExposed`), and the parenthetical enumerates three break recipes — one each for steps 2, 3 and 4 — leaving the fixture guard without one, though the sentence demands a red for each.

Smallest edit: line 339, `The last four are NEW steps and each is an assertion` → `The last four are NEW steps; the last three are assertions (the fixture guard also prints an unasserted field count)` — or add a fourth recipe (`the fixture's junk line repaired`) to the parenthetical at line 341.

### Considered and not reported
- `C2 … "This alone fixes nothing observable"` (line 146) vs AC4's observable registry assertion (lines 288–291): AC4's "nor the commit" half belongs to C3, and "observable" is plausibly meant as "security-observable". Too close to a reading dispute to file.
- Every line-number citation into `validate.js`, `digest.js`, the two test files and the done charter resolves (`:161`, `:187`, `:195`, `:196`, `:317`, `:325`, `:332`, `:343`, `:500`, `:670`, `:685`, `:987`, `:1041`, `:1056`, `:1074`, `:1111`, `:1170`, `:1178`, `:1250`, `:1286`, `:1332-1333`, `:1341`, `:1378`, `:1410`, `:1430`; `digest.js:185`, `:193`, `:689`; charter `:332`, `:383`; unify test `:61`, `:93-94`). The differential test's corpus at `:19` is indeed twenty values and contains no malformed input, as claimed. Only `:189` ("reads the working copy") is off by one — it is the `try {`, the read is `:190`; not an internal disagreement.
- The six-step enumeration (line 67–71) matches the code's own `Step 1…Step 6` comments, and every "Step N" reference in Tables A/B and Implementation notes lines up with it.

## Read-only property
`git status --porcelain` was byte-identical before and after: both captures were empty (0 bytes), `diff` exit 0.

```text
before: (empty — 0 bytes)
after:  (empty — 0 bytes)
```

Only `/tmp/gs-before.txt` and `/tmp/gs-after.txt` were written, both outside the repo.
