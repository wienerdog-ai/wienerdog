---
date: 2026-09-04
title: "Design-gate rounds: WP-instruction-basename-currency"
related_wps: [WP-instruction-basename-currency, WP-dot-segment-denial, WP-audit-c-close-disposition, WP-criterion-red-harness]
---

# Design-gate rounds — WP-instruction-basename-currency

Round zero is the architect's own internal coherence pass
(`docs/runbooks/codex-review.md`, "Internal coherence pass"). The orchestrator
appends the external rounds below it.

## Round zero — architect, 2026-09-04, tree at `4b06afa0`

Every runnable claim the draft makes was executed on this tree. Commands and
their exit statuses are pasted verbatim. **The tree was left clean**: the
fixture inventory used for the three-state rehearsal was deleted and
`git status --short` printed nothing.

### 0.1 Citation liveness — URLs fetched, HTTP status

**Header corrected.** This section originally read *"all 20 Table A / Table B
URLs"* and listed 22 fetches, one of which (`opencode.ai/docs/rules/`)
corresponded to no citation in either table. The count and the coverage are
reconciled in "Round zero — orchestrator's executors", item 5; the block below
is left exactly as it was run.

Every URL fetched 2026-09-04 with `curl -sSL -o /dev/null -w '%{http_code}'`:

```text
200 https://code.claude.com/docs/en/memory
200 https://agents.md/
200 https://learn.chatgpt.com/docs/agent-configuration/agents-md
200 https://zed.dev/docs/ai/instructions
200 https://roocodeinc.github.io/Roo-Code/features/custom-instructions/
200 https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md
200 https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/memory.md
200 https://docs.warp.dev/knowledge-and-collaboration/rules
200 https://docs.replit.com/features/project-setup/replit-dot-md
200 https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
200 https://cursor.com/docs/rules
200 https://docs.cline.bot/customization/cline-rules
200 https://kiro.dev/docs/steering/
200 https://opencode.ai/docs/rules/
200 https://aider.chat/docs/usage/conventions.html
200 https://docs.continue.dev/customize/deep-dives/rules
200 https://docs.devin.ai/desktop/cascade/agents-md
200 https://junie.jetbrains.com/docs/guidelines-and-memory.html
200 https://docs.trae.ai/ide/rules
200 https://docs.openhands.dev/overview/skills/repo
200 https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/context-project-rules.html
404 https://block.github.io/goose/docs/guides/context-engineering/using-goosehints/
```

**The one 404 is recorded in Table B's `.goosehints` row rather than hidden.**
Goose's page is a client-rendered SPA that serves no body to a plain fetch; that
row's disposition rests on two structural facts (a leading-dot filename, and no
`.md` extension), not on the citation, and both were measured in 0.3 below.

**Two URLs named in older material are dead and were replaced, not carried
over:** `https://docs.zed.dev/ai/rules` (307 → `zed.dev/docs/rules`, which is
404) — the live page is `https://zed.dev/docs/ai/instructions`; and
`https://www.jetbrains.com/help/junie/customize-guidelines.html` (301 →
`junie.jetbrains.com/docs/`).

Table A's nine rows were additionally read, not merely pinged: each row's
"Convention it is" cell paraphrases a sentence read on the cited page today.

### 0.2 Table A's internal consistency — parsed with the shipped parser

The `Stored spelling` column must equal `fold(basename)`, or the member is
unreachable dead code. Parsed straight out of the spec with the same code
criterion 3 uses:

```text
parsed 9: CLAUDE.md, CLAUDE.local.md, AGENTS.md, AGENTS.override.md, AGENT.md, GEMINI.md, QWEN.md, WARP.md, replit.md
stored spellings pre-folded? true
stored = fold(basename)? true
```

rc=0. Also `grep -c '^| DENY |'` on the spec = **9**, matching the prose count.
`grep -c '^| HANDOFF | '` = **17** and `grep -c '^| OMIT | '` = **7**, matching
"Twenty-four rows: seventeen HANDOFF, seven OMIT" (an earlier draft said
twenty-three / six and was corrected by this count).

### 0.3 Current-state measurements

Production predicate, `makeAdmit(defaultLayout())`, tier-local paths under
`01-Projects/example/`:

```text
ADMITTED  GEMINI.md
ADMITTED  QWEN.md
ADMITTED  WARP.md
ADMITTED  AGENT.md
ADMITTED  replit.md
ADMITTED  Gemini.md
ADMITTED  gemini.md
ADMITTED  GEMINI.MD
ADMITTED  AmazonQ.md
ADMITTED  CONVENTIONS.md
ADMITTED  copilot-instructions.md
refused   AGENTS.md   <- not admitted: `agents.md` is a harness instruction file
refused   CLAUDE.md   <- not admitted: `claude.md` is a harness instruction file
refused   ClAuDe.md   <- not admitted: `claude.md` is a harness instruction file
refused   CLAUDE.MD   <- not admitted: `claude.md` is a harness instruction file
refused   claude.MD   <- not admitted: `claude.md` is a harness instruction file
refused   AGENTS.OVERRIDE.MD   <- not admitted: `agents.override.md` is a harness instruction file
refused   NFD(CLAUDE.md)   <- not admitted: `claude.md` is a harness instruction file
```

The fold covers **only enumerated names**: every case spelling of `CLAUDE.md`,
and its NFD form, are refused, while every case spelling of `GEMINI.md` is
admitted. `AmazonQ.md`, `CONVENTIONS.md` and a bare `copilot-instructions.md`
are admitted too and stay so — they are Table B `OMIT` rows, not gaps.

Dot-prefixed, non-`.md` basenames are already refused — **by the `.md`-only
extension rule, not by any dot rule**, which is why they are HANDOFF rows and
not already-closed ones:

```text
.rules          -> not admitted: only `.md` content files are promoted
.goosehints     -> not admitted: only `.md` content files are promoted
.clinerules     -> not admitted: only `.md` content files are promoted
.cursorrules    -> not admitted: only `.md` content files are promoted
.windsurfrules  -> not admitted: only `.md` content files are promoted
.aider.conf.yml -> not admitted: only `.md` content files are promoted
x.mdc           -> not admitted: only `.md` content files are promoted
```

Module exports: `promote, makeAdmit, spawnGitForMerge` — `INSTRUCTION_BASENAMES`
is not exported, which is why criterion 3 parses the literal instead of importing
it.

**A vacuity found in existing code, and deliberately NOT fixed here.**
`'AGENTS.override.md'.normalize('NFD') === 'AGENTS.override.md'` is **true** —
the string is pure ASCII, so the NFD assertion at
`tests/unit/dream-promote.test.js:325-326` re-tests the composed spelling. Routed
to the pull request's "Discovered issues", and the spec's new test therefore uses
case variants only rather than adding a second vacuous check.

### 0.4 Line-range citations, both ends, mechanically

Every `file:START-END` and `file:LINE` in the draft was resolved with `sed -n`:

| Citation | Both ends resolve to |
|---|---|
| `promote.js:84-95` | `/**` … `*/` — the `INSTRUCTION_BASENAMES` JSDoc |
| `promote.js:96` | the `INSTRUCTION_BASENAMES` declaration |
| `promote.js:99` | `DENIED_SEGMENTS` |
| `promote.js:102` | `DENIED_BASENAME` |
| `promote.js:111-116` | the `LEDGER_BASENAME` JSDoc … `SKILL_BASENAME` declaration |
| `promote.js:136-138` | `function fold(s) {` … `}` |
| `promote.js:149-151` | `function foldedSegments(rel) {` … `}` |
| `promote.js:237` | `if (INSTRUCTION_BASENAMES.has(base)) {` |
| `promote.js:238` | the refusal `return` |
| `dream-promote.test.js:293` | the row-C9 section header |
| `dream-promote.test.js:295-315` | `test('dream-promote: M7's mechanism …` … `});` |
| `dream-promote.test.js:317-327` | `test('dream-promote: spelling … RED side'` … `});` |
| `dream-promote.test.js:325-326` | the `nfd` const … its assertion |
| `red-proofs.js:2127-2167` | `function rollUp(all, selected, results) {` … `}` |

**Two were wrong in the first draft and were corrected by this check, not by
reading:** `promote.js:118-122` → `:111-116` (off by seven, and the original
range ended inside the next JSDoc), and `red-proofs.js:2127-2166` → `:2127-2167`
(ended one line short of the closing brace).

### 0.5 Verification steps V1–V5, executed

**V1's guard, DELIVERABLE-ABSENT state** — `test -f docs/instruction-file-inventory.md`
→ `rc=1`, so the step exits 1 with `MISSING DELIVERABLE`. Correct: the absent
state is RED.

**V1's assertion body, all three states.** The shipped form of criteria 2 and 3
is a unit test that does not exist yet, so its logic was rehearsed as a
standalone probe against a fixture inventory placed at the real path. All three
states the runbook requires were observed:

| State | Fixture | Result |
|---|---|---|
| deliverable ABSENT | no file | `rc=1`, `MISSING DELIVERABLE` |
| COMPLIANT | inventory = the four names the code holds today | `V1 OK: 4 inventoried basenames, 52 depth x spelling cases, all denied`, rc=0 |
| VIOLATING | inventory = the nine Table A rows, code unchanged | `NOT DENIED (57 of 114)`, rc=1, first failures `06-Identity/AGENT.md -> ADMITTED`, `06-Identity/agent.md -> ADMITTED`, … |

114 = 4 old names × 13 + 4 new uppercase-bearing names × 13 + `replit.md` × 10
(that name yields three distinct spellings, not four) — which is why criterion 2
says *distinct* spellings rather than four.

**V2, both arms.** On the compliant fixture:
`V2 OK: 4 names in INSTRUCTION_BASENAMES = 4 DENY rows, all pre-folded`, rc=0.
On the violating fixture:
`FAIL: INSTRUCTION_BASENAMES has 4 names, the inventory has 9 DENY rows`, rc=1.
The pre-fold arm was exercised separately against a copy of `promote.js` whose
Set literal carried `'GEMINI.md'` in vendor spelling:
`FAIL: not pre-folded, so unreachable: GEMINI.md`, rc=1. **A check that can only
pass would have been invisible here; both arms fire.**

**V3, two non-green states.**
`test -f docs/runbooks/release.md && grep -q 'instruction-file-inventory\.md' docs/runbooks/release.md`
→ `rc=1` today, because the obligation step is not yet in the runbook (correct:
RED before the work). Pointed at a missing file it also returns `rc=1` —
**the `test -f &&` guard is what makes that true**; a bare `! grep -q` would have
exited 0 on the missing file, i.e. greenest where the work was never done. The
GREEN state cannot be observed until the deliverable lands.

**V4** — `npm run red-proofs` on the untouched tree:

```text
2 declared proof(s), 2 selected
PROVEN       dream-private-index-dropped  (WP-show-slot-own-value-kind criterion 3)
PROVEN       known-calls-show-slot-widened  (WP-show-slot-own-value-kind criterion 2)
Criteria:
PROVEN       WP-show-slot-own-value-kind criterion 3 — dream-private-index-dropped=PROVEN
PROVEN       WP-show-slot-own-value-kind criterion 2 — known-calls-show-slot-widened=PROVEN
RUN: PROVEN
```

`EXIT=0`, 1 m 39 s wall. So the baseline is green and criterion 5's expected
`3 declared proof(s), 3 selected` is exactly one added declaration.

**The `--wp` trap, read out of the runner rather than assumed.**
`scripts/red-proofs.js` `rollUp` (`:2127-2167`) builds a pair for **every**
declared proof and marks any pair with unselected members `FILTERED`, which
`worstVerdict` folds into the run verdict — so `--wp WP-instruction-basename-currency`
would exit non-zero on a perfectly good proof. This is why V4 is specified
unfiltered.

**V5** — `npm run lint`: `Linting: 632 file(s)` / `0 error(s)`, shellcheck and
PSScriptAnalyzer clean, `frontmatter check passed: 267 spec(s), 4 agent(s)`.
`npm test`: `tests 2608 / pass 2596 / fail 0 / skipped 12`, `EXIT=0`.

### 0.6 Findings this pass raised against the draft, and their disposition

| # | Finding | Disposition |
|---|---|---|
| Z1 | `promote.js:118-122` and `red-proofs.js:2127-2166` both resolved to the wrong construct | FIXED — `:111-116` and `:2127-2167` |
| Z2 | "Twenty-three rows: seventeen HANDOFF, six OMIT" contradicted the table (24 / 17 / 7) | FIXED by count |
| Z3 | Criterion 2 said "the four case spellings"; `replit.md` yields three | FIXED — *distinct* spellings, with the reason stated |
| Z4 | Criterion 1 and the Deliverables cell said the inventory has "two tables"; the skeleton has three (A, B, C) | FIXED |
| Z5 | The Deliverables cell mandated a **single-line** `Set` literal, which nothing checks and the parser does not need | FIXED — the requirement is now the literal's *shape* (a `new Set([…])` of single-quoted members), which is what criterion 3 parses |
| Z6 | Table C's Owner cell and several Table B cells used spec-internal references (`Dispatch precondition item 2`, `clause (b)`) that would be meaningless once copied into the inventory document | FIXED — both made self-contained |
| Z7 | The inventory skeleton stated the inclusion rule a second time, independently of Table A's preamble | FIXED — the skeleton now points at the preamble and copies it |
| Z8 | Table B named the `.md`-only extension rule on some rows and not others, which reads as an inconsistency | FIXED by a note under the table: it is an additional independent reason, and its absence means the dot reason sufficed |
| Z9 | `code.claude.com/docs/en/memory` shows `.claude/rules/` and a `/init` that reads Cursor and Copilot rule files — more dot paths than the draft listed | ACCEPTED as-is: `.claude` is already a `DENIED_SEGMENTS` member, and the row says so |
| Z10 | The existing NFD assertion at `dream-promote.test.js:325-326` is vacuous | NOT FIXED HERE — routed to the pull request's "Discovered issues", and the spec's new test avoids repeating the shape |

## Round zero — orchestrator's executors, 2026-09-04, branch rebased onto `705ae286`

The clean-context template-conformance executor and the coherence executor
returned **seven** items, proposed disposition FIX on all seven. All seven were
fixed. Everything else was reported CONFORMANT: the template's `Contract
table(s)` scaffold split into Tables A–D and the per-table Mirrored Surface
Checklist were accepted as covering the template's categories, and the extra
`## Dispatch precondition` section is the established convention.

**The branch was rebased, not amended:** the architect's first commit is
`14195491` on top of `705ae286`; these fixes land as a second commit above it.

| # | Finding | Disposition |
|---|---|---|
| **1** | Current state said `WP-criterion-red-harness` is "still `In-Review`". Re-measured: `docs/specs/done/WP-criterion-red-harness.md:3` reads `status: Done` (PR #207, merged before the architect's commit) | **FIXED.** The sentence now states Done and PR #207. `depends_on` stays empty and the reasoning is now the simpler one — there is no open work package to depend on. Measured to justify keeping the drafted-against claims: `git diff --stat 4b06afa0 705ae286 -- src tests scripts package.json` is **empty**, so `scripts/red-proofs.js` and `tests/red-proofs/` are byte-identical across the rebase. Every Current-state claim was re-run on `705ae286` (0.7 below) and the base SHA re-pinned there and in the Current-state preamble |
| **2** | Cross-references baked into the verbatim copy: Table B's column header *"Reason it is not in Table A"*, three rows saying *"already Table A"*, and Table C's *"Table A and Table B of the inventory"* would all dangle once the skeleton renamed the sections; Table B's trailer pointed at *"Current state"*, a section the shipped document lacks | **FIXED, by the skeleton side.** The shipped document now carries `## Table A — denied basenames`, `## Table B — accepted omissions and handoffs`, `## Table C — how this stays current`, so every in-cell label resolves in both homes. **Why this and not eight cell rewrites:** rewriting cells removes one class of reference and leaves the next added cross-reference free to re-create it; keeping the labels closes the class. Additionally an explicit **copy boundary** was introduced — the copied region is each table's *preamble plus the table itself*, so spec-side commentary after a table is provably outside it — and Table B's preamble and trailer were rewritten to be self-contained (the `.md`-only extension reason now sits in the preamble rather than pointing at Current state). The boundary is registered as a mirrored surface in its own right |
| **3** | Table A's trailing *"Nine rows. Four of them are already in `INSTRUCTION_BASENAMES`; five are the change"* is transitional and becomes permanently false in the shipped inventory | **FIXED by moving it out**, into the Current-state bullet on `promote.js:96`, dated to `705ae286`. Table A's trailing paragraph now states the copy boundary instead and says the row count is *checked* (`grep -c '^\| DENY \|'`, V1's first output) rather than asserted. Table A's preamble also lost its hard `2026-09-04` and now defers to each row's own `Fetched` cell — which removes a third exception from criterion 1's verbatim rule |
| **4** | The Security checklist attributed Table H row H1 to `WP-dream-promote-in-workspace` | **FIXED.** Re-measured: `docs/specs/done/WP-dream-vault-write-primitive.md:209` is `### Table H — the vault-write primitive` and `:213` is row H1 (*"Decide on the RESOLVED path, not the given one"*); `docs/specs/done/WP-dream-promote-in-workspace.md:83` only cites it (*"…, rows H1 and H2"*). Both line numbers were resolved with `sed -n` |
| **5** | 0.1's header claimed "all 20 Table A / Table B URLs" while listing 22 fetches, one of which (`opencode.ai/docs/rules/`) matched no citation | **FIXED, by citing it rather than dropping it.** opencode documents `AGENTS.md` (with `CLAUDE.md` as a migration fallback), which is exactly what Table A's `AGENTS.md` row claims of it, so the URL joined that row's citation cell. Measured after the edit: the tables carry **22 distinct citation URLs** across 33 rows. One of the 22 — `https://aider.chat/docs/config/aider_conf.html`, the `.aider.conf.yml` row's citation — had been cited without being fetched; fetched now, **HTTP 200**. So the true statement is **22 cited URLs, 22 × HTTP 200**, plus one deliberate non-citation (`.goosehints`, whose vendor page 404s to a plain fetch and whose disposition rests on two structural facts instead). 0.1's header carries the correction and its pasted block is unchanged |
| **6** | V2 threw an uncaught ENOENT stack trace on the untouched tree — a third failure mode its own comment did not anticipate, and one that reads as infrastructure breakage rather than as a verdict | **FIXED.** V2 now checks both inputs with `fs.existsSync` first and its comment names **four** discriminating modes. All four observed (0.7 below) |
| **7** | The template's line under the title (*"Authoring rules live in `docs/runbooks/spec-authoring.md` …"*) was silently absent | **FIXED** — restored verbatim under the H1 |

### 0.7 Re-runs on the rebased tree (`705ae286`), after the fixes

`git diff --stat 4b06afa0 705ae286 -- src tests scripts package.json` is empty,
so every measurement below is expected to reproduce — and did, byte for byte.

**Current state, re-run.** `01-Projects/example/{GEMINI,QWEN,WARP,AGENT,replit}.md`
and every case spelling of `GEMINI.md` are **ADMITTED**; `AGENTS.md`,
`CLAUDE.md`, `ClAuDe.md`, `CLAUDE.MD`, `claude.MD`, `AGENTS.OVERRIDE.MD` and
NFD-`CLAUDE.md` are refused as harness instruction files; `.rules`,
`.goosehints`, `.clinerules`, `.cursorrules`, `.windsurfrules`,
`.aider.conf.yml` and `x.mdc` are refused with *only `.md` content files are
promoted*. Exports remain `promote, makeAdmit, spawnGitForMerge`.
`docs/runbooks/release.md` is still 13 lines with nine numbered steps.

**Every line anchor re-resolved with `sed -n` at both ends** on `705ae286`:
`promote.js:84`/`:95`, `:96`, `:99`, `:102`, `:111-116`, `:136-138`,
`:149-151`, `:237`, `:238`; `dream-promote.test.js:293`, `:295`/`:315`,
`:317`/`:327`, `:325-326`; `red-proofs.js:2127`/`:2167`. All unchanged. The two
new anchors from item 4 — `WP-dream-vault-write-primitive.md:209` and `:213` —
resolve to the Table H header and row H1.

**V1, three states** (the assertion body rehearsed against a fixture inventory
at the real path, then deleted):

```text
absent      : test -f rc=1  -> the step prints MISSING DELIVERABLE and exits 1
compliant   : grep -c '^| DENY |' = 4
              V1 OK: 4 inventoried basenames, 52 depth x spelling cases, all denied   rc=0
violating   : NOT DENIED (57 of 114):
                06-Identity/AGENT.md -> ADMITTED
                06-Identity/agent.md -> ADMITTED
                06-Identity/AGENT.MD -> ADMITTED                                      rc=1
```

**V2, all four modes** — the point of item 6 is that each one now names itself:

```text
absent input     : FAIL: missing input docs/instruction-file-inventory.md              rc=1
literal missing  : FAIL: the INSTRUCTION_BASENAMES literal was not found in its expected form   rc=1
not pre-folded   : FAIL: not pre-folded, so unreachable: GEMINI.md                     rc=1
count mismatch   : FAIL: INSTRUCTION_BASENAMES has 4 names, the inventory has 9 DENY rows       rc=1
compliant        : V2 OK: 4 names in INSTRUCTION_BASENAMES = 4 DENY rows, all pre-folded        rc=0
```

The *literal missing* mode was produced by rewriting `new Set([` to
`new Set(Array.of(` in a scratch copy; the *not pre-folded* mode by inserting
`'GEMINI.md'` in vendor spelling into a scratch copy's Set. Neither touched the
repository tree.

**V3** — `test -f docs/runbooks/release.md && grep -n 'instruction-file-inventory\.md' docs/runbooks/release.md`
→ `rc=1`, correct: the obligation step is not yet in the runbook. Pointed at a
missing file it is also `rc=1`, which is what the `test -f &&` guard buys.

**Tree left clean.** The fixture inventory was removed;
`git status --short` shows only the two edited documents.

## External rounds

None yet. The orchestrator appends each external round here, newest last.
