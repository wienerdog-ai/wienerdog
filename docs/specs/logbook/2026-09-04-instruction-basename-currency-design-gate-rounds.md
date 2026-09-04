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

### 0.1 Citation liveness — all 20 Table A / Table B URLs, HTTP status

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

## External rounds

None yet. The orchestrator appends each external round here, newest last.
