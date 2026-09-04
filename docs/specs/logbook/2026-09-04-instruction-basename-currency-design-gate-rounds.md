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

Round zero closed at `79cfcae9` (architect self-check `14195491` → the
orchestrator's two clean-context executors, template conformance and coherence,
7 findings — 2 A, 2 B, 3 C — all FIX in `79cfcae9`; their record is §0.7 above).

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material design finding on either channel — a Table A row
whose denial the implementer cannot reach through the shipped predicate (stored
spelling vs the fold at the Set lookup); a copy-boundary ambiguity that lets the
shipped inventory and the spec's canonical tables diverge; an acceptance
criterion or verification step that cannot discriminate (its RED not red, its
GREEN not green, its mutant not the shipped enumeration); a documented bare-path
instruction-file convention that Table A neither denies nor Table B records; or a
scope leak into the dot-segment class `WP-dot-segment-denial` owns — and
machinery/wording findings at that point are fixed within the frozen surface or
accepted as named residuals. **Escalations:** (i) two consecutive rounds landing
findings of the same kind → a design question per ADR-0031, never a third
patch; (ii) a finding whose only honest fix turns the enumeration into a class
rule, adds anything that watches, polls or runs (ADR-0004), or widens the
inventory into the dot-prefixed surface is PARKED — to the owner or to
`WP-dot-segment-denial`; (iii) the two Dispatch-precondition items are the
owner's, so a finding that only re-argues them is routed as a scope objection
and does not count toward the verdict.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review
--base main`, run from the branch worktree); shadow = herdr-spawned hermetic
Codex (`CODEX_HOME=~/.codex-review-home`, `-s read-only`, detached worktree at
the round's tip, fresh thread per round). Raw outputs committed BEFORE
adjudication as `2026-09-04-basename-currency-gate-raw-round<N>-<channel>.txt`.

### Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
| 1 (`f43f6c62`) | needs-attention / needs-attention | `…round1-codex-plugin.txt` (`3a3f8606`), `…round1-herdr-shadow.txt` (`42345398`) | Plugin 1 A + 2 B, shadow 1 A + 1 B, zero scope objections counted on either channel (both routed the two Dispatch-precondition items, the 2026-08-05 list-with-residual ruling and the dot-segment class as scope objections with no verdict effect). **Converged (A):** the shipped inventory, `INSTRUCTION_BASENAMES` and the fixtures were mutually validating mirrors — criterion 2 failed only on zero parsed rows, criterion 3 compared the constant against the same parse, V2 carried no fixed expected count — so a consistently omitted row (`QWEN.md`) passed every gate and the four-name RED proof still reported PROVEN → FIX: a hand-written literal expected set in the test (criterion 7, the one surface the accident cannot shrink) plus a spec-vs-document region compare (V3) over Tables A/B/C allowing only the `Fetched` substitution; Table D's proof retargeted at criterion 7 so a shrunken tree fails at BASELINE instead of certifying the shrink. **Converged (B):** V3 (now V4) grepped only the inventory pathname → isolates exactly one numbered runbook step and asserts Table C's five literal tokens on its text; criterion 4 rewritten to the same contract. **Plugin (B):** Table B's copied preamble said HANDOFF rows "are denied instead" by a rule that is not in force → ASSIGNED, not protected until `WP-dot-segment-denial` lands, plus a measured fifth column per row (8 of 17 HANDOFF rows refused by nothing today). Both channels PASSED reachability (9/9 rows, stored spellings NFC-lowercase), the RED-proof mechanism (`ERR_ASSERTION`), Table B completeness, the Deliverables boundary, ADR-0004 and size S. All FIX, applied in `07b24c0c`; the round-1 record is the architect's "Round 1 fixes" and §0.8 below. Finding 2 edits a table that ships as a product document → round 2 runs as the closing confirmation. |
| 2 (`0eb96a96`) | needs-attention / needs-attention | `…round2-codex-plugin.txt`, `…round2-herdr-shadow.txt` (both `6b7a6080`) | **Full convergence, two A, zero scope objections counted; both channels verified R1-A/B/C landed** (the nine-name literal, the ASSIGNED wording with the measured fifth column, the one-step token check) and both executed their way past the new machinery. **Converged (A):** V3 compared only the three table regions — a document with no H1, no `Current as of` sentence, no canonical-source statement and no named-residual opening passed; heading suffixes passed; the `Fetched` normaliser replaced any final cell so `NOT-A-DATE` passed. **Converged (A):** V4 was five substrings — both channels wrote a step that names all five tokens and cancels the obligation ("need not re-fetch … unnecessary") and got `V4 OK`. **CIRCUIT-BREAKER (escalation (i)): rounds 1 and 2 are one kind — a verification that parses or tokenises the shipped artifact can be satisfied by a wrong one.** Design move put to the architect, not a third parser: delete the step that has to be right. Applied in `e5aa1c0a`: Tables A/B/C MOVED bodily into one sentinel-delimited canonical block with a single `@DATE@` placeholder; the shipped inventory is PRODUCED by V3's own script (`--write`) and V3 without `--write` re-renders and compares every byte (one date, validated `^\d{4}-\d{2}-\d{2}$` and ≥ 2026-09-04; every `Fetched` cell carries the same date because Table C obliges one re-fetch pass); the release step is one 523-byte canonical sentence V4 requires as exactly one numbered runbook line, byte for byte. Five things that had to be right (region locator, heading matcher, cell normaliser, duplicate scanner, token parser) became two byte comparisons plus criterion 7's literal set; the copy boundary ceased to exist. Rehearsed on both channels' own wrong documents (all red) and on the compliant renders (green); V3 green with V2 red on a four-name tree proves the halves independent. Round 3 runs as the closing confirmation. |
| 3 (`f070c888`) | needs-attention / needs-attention | `…round3-codex-plugin.txt`, `…round3-herdr-shadow.txt` (both `332e7e4c`) | **Both channels verified R2-A and R2-B genuinely closed** (skeleton-less, `NOT-A-DATE` and negated-step mutants red), the anchoring chain, Table D, Deliverables, ADR-0004 and size S coherent, zero scope objections counted — and **neither found anything about the product**: every finding is input validation of the byte compares. **Converged (A):** V3 took only the first non-flag argument, shape-checked it, and never validated the template's placeholder sites — `2026-99-99`, two dates, a fully hardcoded block and a partially stale cell all rendered green. **Converged (A):** an interior fence delimiter inside the payload rendered a malformed inventory and compared green. **Shadow (A):** V3/V4 hardcoded the draft spec path while Table C and the release sentence name `done/` — the check would break on the day of the flip and the shipped document embedded the rotting path. **Plugin (A):** V4 matched a numbered line inside a fenced example. **Converged (C):** "523 bytes" was `String.length` (525 UTF-8). All FIX in `f9019b42`, LIGHT under Weighted closure (machinery only): exactly one real calendar date (UTC round-trip) ≥ the floor; placeholder sites structurally accounted (one `Current as of` line + one per DENY row = 10, the unexplained prose site deleted rather than whitelisted); any fence delimiter in the payload refused; the spec resolved at exactly one of the draft and `done/` paths and the rendering names `done/`; V4 tracks fence state and requires a top-level numbered line; `Buffer` comparison and `Buffer.byteLength`. `--write` overwriting a differing generated file recorded as accepted (generated-only contract). **LOOP CLOSED on the orchestrator's mechanical verification**, not a fourth external round: V3 and V4 extracted from the fenced blocks as written and run against 32 states — every argument gate, both channels' own wrong documents, the interior fence, the hardcoded and partially hardcoded block, the extra prose site, the duplicate sentinel, the three path layouts, the negated / `should` / bulleted / indented / duplicated / fenced-only / unclosed-fence steps, and the compliant renders at 2026-09-04 and 2027-01-15 — 32 of 32 as expected (record: `2026-09-04-basename-currency-closing-verification.txt`; the one row marked FAIL there was the orchestrator's mutant rewriting a measured prose date, re-run properly as the green 2027 round-trip). `status` flipped to Ready in the same commit. |

### Round 1 fixes — architect, 2026-09-04, on top of `42345398`

Three findings, two of them converged across both channels, proposed disposition
FIX on all three. All three fixed. Both channels reported zero scope objections
against the verdict, and PASSED: reachability of all nine Table A rows, the
copy-boundary prose, the RED-proof design, Table B completeness, the Deliverables
boundary, ADR-0004 and size S. **None of those was widened.**

**Verification steps were renumbered** by this pass — V3 is new (the region
compare), the old V3 became V4 and was rewritten, red-proofs moved V4 → V5 and
lint V5 → V6. Section 0.5 above says "V1–V5" and is left as the record of what
was run under the old numbering.

| # | Finding | Disposition |
|---|---|---|
| **1** [A, both channels] | A consistently omitted deny row passes every automated gate: the shipped inventory is both the test oracle and the source-count oracle, so dropping a row from the document, the constant and the fixtures together keeps criteria 2–3, V1, V2 and the RED proof green while criterion 1's verbatim copy is violated and Tables B and C go unchecked | **FIXED with TWO oracles, and they guard different things.** **(i) Acceptance criterion 7 — the one that cannot be shrunk:** a test carries the expected DENY basenames as a **hand-written literal array in the test file** and asserts set equality against the parse. It is the only surface in this work package whose expected value is not derived from the shipped document, so the consistent-omission accident does not also shrink it. **(ii) Verification V3 — the fidelity oracle:** compares the shipped document's three copied regions against this spec's canonical regions, allowing only the permitted `Fetched`-cell substitution, and rejects duplicate DENY basenames. It is the one with the wider blast radius — Tables B and C, their preambles, headings, cells and citations were entirely unchecked before it. **And the RED proof was retargeted**: Table D's `expectRed` must now name criterion 7's test, and the declaration's `criterion` field moved `2` → `7`. The reason is stated in Table D's last cell and re-derived here: aimed at the parse-derived test, the proof still goes red on a shrunken tree (eight names against four) and reports `PROVEN` while the defect stands; aimed at the literal set it fails at **BASELINE** there instead, so `npm run red-proofs` reports non-`PROVEN` and the RED machinery catches the subset rather than hiding it. No other machinery grew: V1's body is unchanged, V2 is unchanged, and nothing was added to `scripts/red-proofs.js`, CI or `package.json` |
| **2** [B, plugin] | Table B's verbatim preamble said every HANDOFF row "is denied instead" by the dot-segment rule, which does not exist yet — so the shipped canonical inventory would overstate coverage on day one | **FIXED, and measured rather than reworded.** The preamble now says a HANDOFF row is **ASSIGNED** to `WP-dot-segment-denial` and **is not protected by that rule until that work package lands** — assignment is not coverage. A **fifth column, `Refused independently of the dot-segment rule`**, was added to every Table B row and each value was measured path by path through the production predicate (0.8 below). It is a column of *mechanisms*, not states, so it stays true after the class rule lands. Measured totals: **8 of 17 HANDOFF rows read `none`** (every documented path admitted), **3 are partly covered** (`.windsurfrules`, `.roorules`, `.junie/AGENTS.md` alone), **6 are fully refused** already |
| **3** [B, both channels] | V3 greps only for the inventory pathname, so a step reading "Read docs/instruction-file-inventory.md" passes while the owner, trigger, refresh and same-PR synchronisation are all absent | **FIXED.** The step (now **V4**) isolates **exactly one** numbered runbook step by the inventory path — zero matches and two matches both fail — and asserts **Table C's five tokens** on that step's own text. The five literals are decided in one new Table C row: `docs/instruction-file-inventory.md`, `MINOR`, `release maintainer`, `re-fetch`, `same pull request`. Criterion 4 was rewritten to the same contract |

### 0.8 Round-1 measurements and rehearsals

Every value below was produced on the untouched tree at branch tip `42345398`
(`src/`, `tests/` and `scripts/` unchanged since `705ae286`). The fixture
inventory used for the rehearsals was generated from the spec, then deleted;
`git status --short` shows only the two edited documents.

**Table B's fifth column, measured through `makeAdmit(defaultLayout())`** on
tier-local paths under `01-Projects/example/`:

```text
ADMITTED  .github/copilot-instructions.md   .github/instructions/x.instructions.md
ADMITTED  .windsurf/rules/x.md   .devin/rules/x.md   .clinerules/x.md   .roo/rules/x.md
ADMITTED  .continue/rules/x.md   .junie/playbook.md   .junie/rules/x.md   .junie/guidelines.md
ADMITTED  .kiro/steering/x.md   .amazonq/rules/x.md   .trae/rules/x.md
ADMITTED  .openhands/microagents/x.md   .openhands/skills/x.md   .agents/skills/n/SKILL.md
ADMITTED  .qwen/QWEN.local.md
refused   .cursor/rules/x.mdc  .cursorrules  .windsurfrules  .roorules  .rules  .goosehints  .aider.conf.yml
              <- only `.md` content files are promoted
refused   .junie/AGENTS.md     <- `agents.md` is a harness instruction file
refused   .claude/CLAUDE.md  .claude/rules/x.md   <- path segment `.claude` is a harness instruction-discovery root
refused   .codex/AGENTS.md  .codex/AGENTS.override.md   <- path segment `.codex` is a harness instruction-discovery root
```

**V3, run exactly as the spec writes it** (extracted from the fenced block and
executed through a shell, so the `\$` escaping is exercised too), in six states:

```text
absent document                : FAIL: missing input docs/instruction-file-inventory.md            rc=1
compliant (generated from spec): Table A: identical (23 lines)
                                 Table B: identical (41 lines)
                                 Table C: identical (9 lines)
                                 V3 OK: all three copied regions are byte-identical
                                 modulo the Fetched cells; 9 unique DENY rows                      rc=0
Fetched dates -> 2027-01-15    : same green output                                                 rc=0
QWEN.md DENY row dropped       : FAIL: Table A diverges at region line 21
                                   spec: | DENY | `QWEN.md` | `qwen.md` | Qwen Code's default ...
                                   doc : | DENY | `WARP.md` | `warp.md` | Warp project rules ...   rc=1
one Table B cell reworded      : FAIL: Table B diverges at region line 21
                                   spec: ... | Cline | dot-prefixed | ...
                                   doc : ... | Cline | fine, ignore | ...                          rc=1
Table C heading removed        : FAIL: document Table C: 0 headings start with
                                 "## Table C — ", expected 1                                       rc=1
WARP.md DENY row duplicated    : FAIL: duplicate DENY basenames: `WARP.md`                         rc=1
```

The fourth line is **the finding's exact attack**, and V3 names the missing row.

**V4, run exactly as the spec writes it**, in five states:

```text
untouched tree (default path)  : FAIL: 0 numbered step(s) name docs/instruction-file-inventory.md,
                                 expected exactly 1 (of 9 steps)                                   rc=1
absent file                    : FAIL: missing input <temp>/nope-release.md                        rc=1
a link-only step               : FAIL: step 3 is missing 4 of the five Table C tokens:
                                 "MINOR", "release maintainer", "re-fetch", "same pull request"    rc=1
two matching steps             : FAIL: 2 numbered step(s) name docs/instruction-file-inventory.md,
                                 expected exactly 1 (of 11 steps)                                  rc=1
a step carrying all five       : V4 OK: step 3 of 10 carries all five Table C tokens               rc=0
```

**A real defect the rehearsal caught, recorded because reading would not have
found it.** The first draft of V4 read its optional path from
`process.argv[2]`. Measured — `node -e "console.log(JSON.stringify(process.argv))" FOO BAR`
prints `["…/node","FOO","BAR"]` — **`node -e` puts the first extra argument at
`argv[1]`, not `argv[2]`**, so all four rehearsal states silently fell back to
the default path and returned the *same* message. The index is fixed and the
reason is a comment on that line.

**V1 and V2, verbatim on the untouched tree:**

```text
V1: MISSING DELIVERABLE: docs/instruction-file-inventory.md              rc=1
V2: FAIL: missing input docs/instruction-file-inventory.md               rc=1
```

**Citations touched this round:** none. No Table A or Table B citation URL was
added, removed or changed; the only Table B change is the new fifth column,
whose values are measurements of this repository's own code and carry no URL.
The `promote.js` anchors the new column's reasoning rests on — `:96`, `:99`,
`:102`, `:237`, `:238` — were re-resolved at both ends in 0.7 and are unchanged.

**Weighted closure, the architect's read:** finding 1's fix is **LIGHT** under
`docs/runbooks/codex-review.md`'s test. It changes no `src/` behaviour, no ADR
contract and nothing a user or a consuming model observes — the shipped deny-list
is the same nine names either way; what changed is the evidence that the nine
really shipped. Findings 2 and 3 are also LIGHT by that test, with one honest
caveat on finding 2: it edits a canonical table that *ships as a product
document*, so a reader of `docs/instruction-file-inventory.md` observes the
difference. The orchestrator owns the HEAVY/LIGHT call; this is the input to it,
not the decision.

### Round 2 fixes — architect, 2026-09-04, on top of `6b7a6080`

Two findings, **both A, both converged across the plugin and the shadow**, both
executed rather than reasoned: each channel ran the exact fenced V3 and V4 bodies
against synthetic wrong artifacts and got exit 0. Zero scope objections counted
on either channel.

**THE CIRCUIT BREAKER FIRED.** Round 1's [A] and round 2's two [A]s are **one
kind**: *a verification that parses or tokenises the shipped artifact, and can
therefore be satisfied by a wrong one.* The runbook's rule — two consecutive
rounds landing findings of the same kind is a design question, never another
textual patch — applies, and the fixed point this repository has reached three
times before is **delete the step that has to be right**. The closing move of
`docs/specs/logbook/2026-09-01-show-slot-design-gate-rounds.md` states it in its
own words: *"any checker that must find the set inside a JavaScript file
enumerates the ways JS can hide it, an alien grammar that never closes… the
checker hashes the ENTIRE file — nothing to locate, the whole evasion class
unconstructible."*

**The design change, applied.**

1. **`docs/instruction-file-inventory.md` is now a WHOLE-FILE byte comparison.**
   Tables A, B and C were **moved bodily into a single canonical rendering
   block** in the spec, delimited by `<!-- BEGIN-CANONICAL-INVENTORY -->` /
   `<!-- END-CANONICAL-INVENTORY -->`. They exist nowhere else; the three
   `### Table …` subsections under `## Contract reference` became pointers that
   decide nothing. The block is the whole file with **exactly one placeholder**,
   `@DATE@`, validated by `^\d{4}-\d{2}-\d{2}$` and required to be ≥ `2026-09-04`.
   V3 extracts the block, substitutes, and compares **every byte**. The
   implementer **produces** the file with the same command and `--write`, and
   never retypes it — the show-slot precedent, named in the spec.
   **The agreement rule, chosen deliberately: ONE date, not two.** Table C
   obliges one re-fetch pass, so every `Fetched` cell carries the `Current as of`
   date and no other. There is nothing to reconcile between header and cells, no
   second placeholder to validate, and no `max(Fetched)` rule to get wrong — the
   whole document is a function of one value. A row whose citation could not be
   confirmed in the pass is not silently refreshed; it is *changed*, which
   changes the rendering block.
2. **The release-runbook step is now one pinned sentence.** It sits between
   `<!-- BEGIN-CANONICAL-RELEASE-STEP -->` / `<!-- END-CANONICAL-RELEASE-STEP -->`
   in a one-line `text` fence, **525 UTF-8 bytes** (round 2 recorded 523, which was `String.length` in UTF-16 code units — corrected by round 3's [C] finding). V4 requires **exactly one** numbered
   line of the runbook whose body equals it byte for byte, and asserts nothing
   else. Table C's five-token row was replaced by `The step's canonical text`,
   which names the pinned bytes. The obligation is the sentence; a negation would
   have to be byte-identical to the affirmative.
3. **Criterion 7's hand-written literal set stays**, unchanged, and Table D stays
   targeted at it. What was added is the **anchoring chain, stated explicitly**
   in criterion 7: the literal equals the shipped document's DENY basenames
   (half (a)) → the shipped document equals the canonical rendering byte for byte
   (criterion 1, proved by V3) → the rendering is spec text the Deliverables
   table lets the implementer touch only to flip `status:`. Both channels reached
   this conclusion independently and declined to count the contract-tampering
   case as a separate finding.

**THE MACHINERY SHRANK, which is the point.** Before: a region locator, a heading
matcher, a final-cell normaliser, a duplicate scanner, and a five-token step
parser — five things that had to be right about a document. After: **two byte
comparisons and one hand-written literal set.** Everything the old checks
enforced piecewise (headings, regions, cell contents, duplicates, the opening
paragraph, the dates, the step's meaning) is enforced by the fact that the file
*is* the rendering. The copy boundary was **deleted**, not restated: there is no
boundary because there is no region.

| # | Finding | Disposition |
|---|---|---|
| **R2-A** [A, converged] | V3 compared only the regions under three headings, so a document with no H1, no `Current as of` sentence, no canonical-source statement and no residual opening passed; heading suffixes were accepted; the `Fetched` normalisation replaced any final cell, so `NOT-A-DATE` passed. Both channels executed V3's exact body and got exit 0 on those documents | **FIXED by deletion of the mechanism.** Whole-file byte compare against a one-placeholder rendering. Re-run below in **eight** states, including both of the exact documents the channels used |
| **R2-B** [A, converged] | V4 accepted a step carrying all five tokens and negating every one of them. Both channels executed it and got `V4 OK` | **FIXED by deletion of the mechanism.** One pinned sentence, one byte-equal numbered line. The channels' own negated step is now rejected; re-run below in **six** states |

### 0.9 Round-2 re-runs, all on the untouched tree at `6b7a6080`

`src/`, `tests/` and `scripts/` are unchanged since `705ae286`. Every command
below was **extracted from the spec's fenced block and executed through a shell**,
so the escaping ships exercised. The rendering fixture was produced by the spec's
own `--write` and deleted afterwards; `git status --short` shows only the two
edited documents.

**V1–V4 on the untouched tree — all RED for their intended reasons:**

```text
V1: MISSING DELIVERABLE: docs/instruction-file-inventory.md                            rc=1
V2: FAIL: missing input docs/instruction-file-inventory.md                             rc=1
V3: FAIL: missing input docs/instruction-file-inventory.md                             rc=1
V4: FAIL: 0 numbered line(s) of docs/runbooks/release.md carry the canonical
    step body, expected exactly 1                                                      rc=1
```

**V3, eight states.** The first two are the production step and its proof; the
next two are the exact wrong documents the round-2 channels used.

```text
--write (production)        : V3 --write: rendered docs/instruction-file-inventory.md at
                              2026-09-04, 99 lines, 13779 bytes — as printed then; 13,855 UTF-8                        rc=0
compare, same date          : V3 OK: byte-identical to the canonical rendering at
                              2026-09-04 (13779 bytes — as printed then; 13,855 UTF-8)                                 rc=0
entire opening removed      : FAIL: first byte difference at line 1
                                expected: "# Instruction-file inventory"
                                actual  : "## Table A — denied basenames"
                              FAIL: not the canonical rendering (83 lines vs 99)        rc=1
every Fetched = NOT-A-DATE  : FAIL: first byte difference at line 34, column 129
                                expected: "e.claude.com/docs/en/memory | 2026-09-04 |"
                                actual  : "e.claude.com/docs/en/memory | NOT-A-DATE |"  rc=1
QWEN.md DENY row dropped    : FAIL: first byte difference at line 40, column 11
                                expected: "| DENY | `QWEN.md` | `qwen.md` | Qwen Code's…"
                                actual  : "| DENY | `WARP.md` | `warp.md` | Warp project…" rc=1
heading suffix added        : FAIL: first byte difference at line 17, column 30
                                expected: "## Table A — denied basenames"
                                actual  : "## Table A — denied basenames (current)"     rc=1
CRLF line endings           : FAIL: first byte difference at line 1, column 29
                                expected: "# Instruction-file inventory"
                                actual  : "# Instruction-file inventory\r"              rc=1
2027-01-15 render + compare : V3 OK: byte-identical … at 2027-01-15 (13779 bytes — as printed then; 13,855 UTF-8)      rc=0
2027-01-15 file, 2026 arg   : FAIL: first byte difference at line 3, column 20
                                expected: "**Current as of 2026-09-04. …"
                                actual  : "**Current as of 2027-01-15. …"               rc=1
NOT-A-DATE argument         : FAIL: pass exactly one date as YYYY-MM-DD                rc=1
2020-01-01 argument         : FAIL: 2020-01-01 is earlier than 2026-09-04, the date
                              this spec read its citations                             rc=1
```

**V4, six states.** The canonical step body is **525 UTF-8 bytes** (recorded as 523 at the time; that was `String.length`, corrected in round 3).

```text
untouched runbook           : FAIL: 0 numbered line(s) … expected exactly 1            rc=1
absent runbook              : FAIL: missing input <temp>/rb-missing.md                 rc=1
compliant                   : V4 OK: … carries the canonical step body exactly once
                              (523 bytes — as printed then; 525 UTF-8)                                              rc=0
ROUND 2'S NEGATED STEP      : FAIL: 0 numbered line(s) … expected exactly 1            rc=1
two copies                  : FAIL: 2 numbered line(s) … expected exactly 1            rc=1
MUST -> should (one word)   : FAIL: 0 numbered line(s) … expected exactly 1            rc=1
present but not numbered    : FAIL: 0 numbered line(s) … expected exactly 1            rc=1
```

**The honest cross-check that the pair is not vacuous.** With the rendering
written and the constant still at four names, V3 is **green** and V2 is **red**
(`FAIL: INSTRUCTION_BASENAMES has 4 names, the inventory has 9 DENY rows`) — the
documentation half satisfied, the source half not yet. The two halves are
independent, which is what round 1 asked for and round 2 did not disturb.

**One defect this pass caught in its own work**, recorded because it is the same
lesson as round 1's `argv` index: V3's first diff report printed the first 100
characters of each line, so the `NOT-A-DATE` mutant rendered as two *identical*
preview lines with the difference past the cut. The report now computes the
common-prefix column and prints a window around it — visible in the pasted output
above as `line 34, column 129`.

**Sentinel integrity, measured:** each of the four sentinels occurs **exactly
once as a standalone line** in the spec (`grep -cx` = 1 for each). V3 and V4 both
assert this themselves and fail loudly otherwise.

**CORRECTION, entered by round 3 and left here where the wrong claim was made.**
This paragraph continued *"neither extraction is load-bearing in the round-1
sense: a mis-extraction makes the byte compare fail, never pass."* **That was
false as stated.** Both channels demonstrated a mis-extraction that passes: an
interior standalone ``` line inside the payload was extracted, rendered, written
and approved with rc=0, producing a malformed shipped document. The claim is
withdrawn and replaced by the narrower true one: *an extraction that returns the
WRONG SPAN fails the byte compare, but an extraction that returns a span whose
CONTENT is invalid markdown was not detected at all until round 3 made the
payload's own well-formedness a checked precondition.*

**Citations touched this round:** none. No Table A or Table B row, cell or URL
changed; the rows moved into the rendering block byte-identically. Table A's
preamble gained the one-pass/one-date sentence, and Table C exchanged its
`Where the obligation is recorded` and five-token rows for the canonical-text
pair — those are the only content edits inside the rendered document.

**Weighted closure, the architect's read:** **LIGHT.** No `src/` behaviour, no
ADR contract, no user-observable product change — the shipped deny-list is the
same nine names and the shipped inventory is the same content. What changed is
how the artifacts are produced and proved. The one caveat from round 1 stands:
the inventory ships as a product document, so its Table C rows and Table A
preamble sentence are reader-visible. The orchestrator owns the call.

### Round 3 fixes — architect, 2026-09-04, on top of `332e7e4c`

Both channels confirmed **R2-A and R2-B genuinely closed** — the skeleton-less
document, the all-`NOT-A-DATE` document and the negated release step are all red
against the byte-compare design — and confirmed the anchoring chain, Table D,
the Deliverables boundary, ADR-0004 and size S coherent. Zero scope objections
counted on either channel.

**Neither channel found anything about the PRODUCT.** The deny list, the
reachability of all nine names, and the obligation's *content* were not
questioned by either channel in this round. Every finding is about the
verification machinery's own **input validation** — the byte compare was sound,
but it compared two things it had not checked. Under the runbook's weighted
closure that is **LIGHT**: fixed inside the frozen surface, no new mechanism, no
further external round.

**The shape of all five, in one sentence:** *a byte comparison is only as good as
the two artifacts handed to it, and rounds 1 and 2 had spent all their attention
on the comparison.* Nothing here re-opens the fixed point; it hardens its inputs.

| # | Finding | Disposition |
|---|---|---|
| **R3-1** [A, converged] | V3's date/placeholder contract was unenforced: `2026-99-99` rendered; a second date argument was silently ignored; a block with every `@DATE@` hardcoded rendered under a *different* pass date; a 2027 render kept one `Fetched` cell at `2026-09-04`. The post-substitution placeholder check was tautological | **FIXED, four gates before any substitution.** Exactly **one** non-flag argument. A **real calendar date**, by UTC construction and `toISOString` round-trip. The lower bound `≥ 2026-09-04` kept. And the placeholder sites are **structurally accounted for**: exactly one `**Current as of @DATE@.` line, every `\| DENY \|` row ending in `\| @DATE@ \|`, and the total `@DATE@` count equal to `1 + DENY rows` — **no unaccounted site permitted**. The tautological post-check was deleted. **The prose site was removed rather than whitelisted:** the rendering's own "GENERATED" sentence used to contain a literal `@DATE@` (which the renderer then substituted, producing a sentence that named a date instead of the placeholder). It now says *"a single date substituted into its date placeholders"*, so the count is **10 = 1 + 9** and every site is one the structure explains. The magic number in the check is not a number at all — it is `deny.length + 1` |
| **R3-2** [A, converged] | An interior standalone ``` line inside the payload was extracted, rendered, written and **approved**, producing malformed markdown. The wrapper check validated only the lines adjacent to the sentinels | **FIXED.** Any payload line matching `/^[ \t]*(```\|~~~)/` is rejected before `--write` and before compare. **The logbook sentence this falsified has been corrected in place** (round-2 §0.9, "Sentinel integrity"): the claim *"a mis-extraction makes the byte compare fail, never pass"* is **withdrawn** and replaced by the narrower true statement — a wrong *span* fails the compare, but a span whose *content* was invalid markdown went undetected until the payload's own well-formedness became a checked precondition |
| **R3-3** [A, shadow] | V3/V4 hardcoded the **draft** spec path while Table C and the pinned release sentence direct the maintainer to `docs/specs/done/…`. Executed with only the `done/` file present, V3 failed `missing input`; and the shipped inventory embedded the path that rots at the flip | **FIXED on both sides.** V3 and V4 now resolve the spec at **exactly one** of `docs/specs/WP-instruction-basename-currency.md` and `docs/specs/done/WP-instruction-basename-currency.md`, failing on **zero or both**. The *rendered document's* canonical-source sentence now names the **`done/`** path — the one the release maintainer will still find, because Table C's trigger fires after the flip by construction. Current state gained a bullet saying the draft path is the live one until the flip, with the measurement that produced the finding |
| **R3-4** [A, plugin] | A runbook consisting solely of a fenced ```` ```text ```` example containing `7. <sentence>` passed V4 — an obligation existing only inside a code sample | **FIXED in the smallest form asked for.** V4 tracks fence state (a line starting ``` or `~~~` toggles it) and lines inside a fence are never candidates; an unclosed fence at EOF is itself a failure. The match must be a **top-level** numbered line, which the anchored `/^[0-9]+\. /` already required. **Deliberately NOT** a whole-runbook base-plus-insertion compare: `release.md`'s other steps move independently and that pin would rot under dispatch — recorded in V4's own comment so it is not re-proposed |
| **R3-5** [C, converged] | "523 bytes" was `String.length` in UTF-16 code units; the sentence is **525** UTF-8 bytes and the rendering **13,855** as measured at f070c888 | **FIXED.** V3 now compares **Buffers** (`Buffer.compare`) and reports `Buffer.length`; V4 reports `Buffer.byteLength(want,'utf8')`. Round 2's recorded numbers are corrected in place with the reason. **The current numbers differ from the review's** because R3-1 and R3-3 changed the block: the rendering is now **13,895 UTF-8 bytes over 100 lines**, and the step body is **523 code units / 525 UTF-8 bytes** (unchanged) |

**Recorded as ACCEPTED, not a finding, so it is not re-raised:** `--write`
silently overwrites an existing different `docs/instruction-file-inventory.md`.
The plugin executed it and did not count it, and the reason is now in
Implementation notes — the file's contract is *generated, never edited by hand*,
so there is no hand-authored state an overwrite could destroy, and a
refuse-if-exists flag would only stand between the implementer and the one
correct byte sequence.

### 0.10 Round-3 re-runs, all as written, extracted from the fenced blocks

Every command below is the spec's own text run through a shell. Mutants that
required a different repository layout were driven with a Python runner that only
sets `cwd`; the shell text is untouched. The repository tree was left clean.

**V1–V4 on the untouched tree — all RED for their intended reasons:**

```text
V1: MISSING DELIVERABLE: docs/instruction-file-inventory.md                             rc=1
V2: FAIL: missing input docs/instruction-file-inventory.md                              rc=1
V3: FAIL: missing input docs/instruction-file-inventory.md                              rc=1
V4: FAIL: 0 top-level numbered line(s) of docs/runbooks/release.md carry the
    canonical step body, expected exactly 1                                             rc=1
```

**V3 — the round-3 argument mutants (R3-1):**

```text
--write (production)   : V3 --write: rendered docs/instruction-file-inventory.md from
                         docs/specs/WP-instruction-basename-currency.md at 2026-09-04 —
                         100 lines, 13895 bytes utf8, 10 placeholder sites               rc=0
compare, same date     : V3 OK: byte-identical … (13895 bytes utf8, 10 placeholder sites) rc=0
2026-99-99             : FAIL: 2026-99-99 is not a real calendar date                    rc=1
two date arguments     : FAIL: pass exactly one date argument, got 2:
                         ["2026-09-04","2026-09-05"]                                     rc=1
no date argument       : FAIL: pass exactly one date argument, got 0: []                 rc=1
NOT-A-DATE             : FAIL: "NOT-A-DATE" is not shaped YYYY-MM-DD                     rc=1
2020-01-01             : FAIL: 2020-01-01 is earlier than 2026-09-04, the date this
                         spec read its citations                                         rc=1
2027-01-15 round trip  : V3 OK: byte-identical … at 2027-01-15                           rc=0
2027 file, 2026 arg    : FAIL: first difference at line 3, column 20
                           expected: "**Current as of 2026-09-04. …"
                           actual  : "**Current as of 2027-01-15. …"                     rc=1
```

**V3 — the round-3 payload mutants (R3-1, R3-2), each a mutated copy of this
spec in its own temporary repository root:**

```text
interior ``` fence in the payload   : FAIL: the payload carries 1 fence delimiter
                                      line(s); the first is "```"                        rc=1
zero placeholders (dates hardcoded) : FAIL: 9 DENY row(s) do not end in a @DATE@ Fetched
                                      cell; the first ends "…memory | 2026-09-04 |"      rc=1
one Fetched cell left at 2026-09-04,
  rendered at 2027-01-15            : FAIL: 1 DENY row(s) do not end in a @DATE@ Fetched
                                      cell; the first ends "…memory | 2026-09-04 |"      rc=1
an extra @DATE@ site in prose       : FAIL: 11 @DATE@ site(s) in the payload, but 10 are
                                      accounted for (1 Current-as-of + 9 DENY rows);
                                      every site must be one of those                    rc=1
```

**V3 and V4 — the lifecycle-path layouts (R3-3):**

```text
only docs/specs/done/ — write   : V3 --write: rendered … from
                                  docs/specs/done/WP-instruction-basename-currency.md
                                  at 2026-09-04 — 100 lines, 13895 bytes utf8            rc=0
only docs/specs/done/ — compare : V3 OK: byte-identical to the canonical rendering of
                                  docs/specs/done/WP-instruction-basename-currency.md    rc=0
both paths exist — V3           : FAIL: exactly one of the draft and done spec paths must
                                  exist; found 2: …                                      rc=1
both paths exist — V4           : same                                                   rc=1
neither path exists — V3        : FAIL: exactly one … found 0                            rc=1
neither path exists — V4        : same                                                   rc=1
```

The `done/`-only run is the future state Table C's obligation fires in, and it is
now green where round 3 measured it red.

**V4 — ten states, including round 3's exact attack (R3-4):**

```text
untouched runbook (no argument)          : FAIL: 0 top-level numbered line(s) …          rc=1
absent runbook                           : FAIL: missing input <temp>/rb-missing.md      rc=1
COMPLIANT                                : V4 OK: … exactly once, outside any fence
                                           (525 bytes utf8)                              rc=0
ROUND 2's NEGATED STEP                   : FAIL: 0 top-level numbered line(s) …          rc=1
two copies                               : FAIL: 2 top-level numbered line(s) …          rc=1
MUST -> should (one word)                : FAIL: 0 top-level numbered line(s) …          rc=1
present but not numbered                 : FAIL: 0 top-level numbered line(s) …          rc=1
ROUND 3's ATTACK — only a fenced ```text
  example containing "7. <sentence>"     : FAIL: 0 top-level numbered line(s) …          rc=1
a real step PLUS a fenced example
  quoting it                             : V4 OK: … exactly once, outside any fence      rc=0
an indented numbered copy                : FAIL: 0 top-level numbered line(s) …          rc=1
```

The last-but-one row is the case the fence rule must **not** break: quoting the
step in an example alongside a real step stays green, because only the fenced
copy is skipped.

**Byte accounting, measured (R3-5):** the canonical step body is **523 UTF-16
code units / 525 UTF-8 bytes**; the rendering is **13,895 UTF-8 bytes over 100
lines** at this revision. V3 compares `Buffer`s and reports `Buffer.length`; V4
reports `Buffer.byteLength(want,'utf8')`.

**Weighted closure, the architect's read: LIGHT, and the loop should close here.**
No `src/` behaviour, no ADR contract, no user-observable product change — the
nine names, their citations and the obligation's content are byte-identical to
round 2 apart from the two sentences R3-1 and R3-3 required. Both channels
returned zero product findings. The machinery did not grow a mechanism: V3 gained
input gates and V4 gained fence state, both inside the existing two byte
comparisons.

## Outcome

- **Loop closed 2026-09-04 after round zero + 3 double-channel rounds** (6 gate
  runs, plus two clean-context round-zero executors). The spec is `Ready` at the
  closing commit (820 lines; `size: S`, sonnet).
- **Design lineage — the loop converged by DELETING machinery, not adding it:**
  three checks that parsed the shipped artifact (inventory row parse as the only
  oracle; a region compare; a five-token step check) → the circuit breaker at
  round 2 → one canonical block rendered by the verification's own script and
  compared whole, one canonical sentence byte-matched, one hand-written literal
  set (criterion 7) that the same accident cannot shrink. Round 3 hardened the
  compares' INPUTS (argument, template, source path) and found nothing about the
  product.
- **Owner items (Dispatch precondition), both carrying the architect's
  recommendation:** deny `replit.md` and `AGENT.md` on the single inclusion rule
  (recommended) or omit them into Table B; keep the obligation's owner as a role
  (recommended). The orchestrator dispatches under the recommendations unless the
  owner rules otherwise; the dispatch message records which.
- **Named residual, unchanged from the 2026-08-05 ruling:** an undocumented tool's
  instruction file still passes; the list is current as of its date, never
  complete.

