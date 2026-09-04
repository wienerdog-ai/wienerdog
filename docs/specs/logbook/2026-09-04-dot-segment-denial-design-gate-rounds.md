---
date: 2026-09-04
title: "Design-gate rounds: WP-dot-segment-denial"
related_wps: [WP-dot-segment-denial, WP-instruction-basename-currency, WP-audit-c-close-disposition, WP-dream-promote-report]
---

# Design-gate rounds — WP-dot-segment-denial

Round zero is the architect's own internal coherence pass
(`docs/runbooks/codex-review.md`, "Internal coherence pass"). The orchestrator
appends the external rounds below it.

## Round zero — architect, 2026-09-04, tree at `c26214cb`

`c26214cb` is `origin/main` after PR #211 merged `WP-instruction-basename-currency`.
Every runnable claim the draft makes was executed on this tree, or on a scratch
copy of it produced with `git archive HEAD`. **No measurement mutated the
worktree**: the candidate fix, the three mutants and the pristine RED-proof
baseline all live under `/tmp`, and `git status --short` in the worktree shows
only the two edited documents plus the `node_modules` symlink this worktree
needs for `npm run lint` (removed before the commit).

### 0.1 The candidate fix, and why the round-zero measurements are trustworthy

Round zero applied the fix the spec specifies to a scratch copy (`/tmp/wdfix`)
so that every "after" number below is a **run**, not a prediction. The three
edits are exactly the ones the Deliverables table names:

```text
src/core/dream/promote.js   + the segment loop in makeAdmit, after the DENIED_BASENAME
                              check and before the .md extension check
src/core/layout.js          + one clause in isSafeRelativePath; isSafeRelativePath exported
src/core/layout-infer.js    - the copied isSafeRelativePath; require the shared one
```

Four trees were then measured: `UNTOUCHED` (`c26214cb`), `FULL FIX`,
**`MUTANT P`** (promotion clause reverted, layout clause kept) and
**`MUTANT L`** (layout clause reverted, promotion clause kept), plus
**`MUTANT E`** — a finite matcher **fitted to all 29 of Table D's paths**,
substituted for the class rule in `makeAdmit`.

### 0.2 Current-state measurements

Production predicate, `makeAdmit(defaultLayout())`:

```text
ADMITTED  01-Projects/example/.github/copilot-instructions.md
ADMITTED  01-Projects/example/.github/instructions/NAME.instructions.md
ADMITTED  01-Projects/example/.husky/pre-commit.md
ADMITTED  01-Projects/example/.git/hooks/note.md
ADMITTED  01-Projects/example/.obsidian/plugins/x.md
ADMITTED  01-Projects/example/.cursor/rules/x.md
ADMITTED  01-Projects/example/.GiThUb/copilot-instructions.md
ADMITTED  01-Projects/example/.GITHUB/x.md
ADMITTED  06-Identity/.vscode/instructions.md
ADMITTED  02-Areas/a/.foo/b/c/x.md
ADMITTED  03-Resources/.a/.b/.c/x.md
ADMITTED  01-Projects/example/.hidden.md
refused   01-Projects/example/.cursorrules      <- only `.md` content files are promoted
refused   01-Projects/example/.claude/CLAUDE.md <- path segment `.claude` is a harness instruction-discovery root
refused   01-Projects/example/.codex/AGENTS.md  <- path segment `.codex` is a harness instruction-discovery root
refused   01-Projects/example/.mcp.json         <- `.mcp.json` is a harness configuration file
refused   01-Projects/example/x.mdc             <- only `.md` content files are promoted
refused   .github/copilot-instructions.md       <- not under a writable vault tier directory
```

rc=0. The last line is the trap row D1 (b)'s retired verdict fell into: at the
vault **root** a dot path is refused for being out of tier, which says nothing
about the dot rule. Every other row above is tier-local.

**The reader**, with a `config.yaml` carrying four dot values:

```text
{ identity_dir: ".GiThUb", daily_dir: "My.Notes", daily_filename: "YYYY-MM-DD.md",
  projects_dir: ".git", skills_dir: ".", reports_dir: "reports/dreams", inbox_dir: "a/.b" }
ADMITTED  .git/hooks/note.md
ADMITTED  .GiThUb/x.md
ADMITTED  a/.b/x.md
```

rc=0 — every value returned unchanged, including a bare `.`.

**The producer**, on a vault holding `.projects/`, `.identity/`, `Inbox/`:

```text
{ identity_dir: ".identity", projects_dir: ".projects", inbox_dir: "Inbox", … }
```

and on a vault whose only directory is `.myreports/`:

```text
untouched reports_dir = ".myreports/dreams"
patched   reports_dir = "reports/dreams"
```

**The round trip today**, driven with the same calls `src/cli/adopt.js` makes
(`inferLayout` → the rendered `vault_layout:` block → `readVaultLayout`):

```text
inferred  projects_dir=".projects"  identity_dir=".identity"
read-back projects_dir=".projects"  identity_dir=".identity"
round-trip equal: true
```

The two sides agree **on the wrong value** — which is why acceptance criterion
4's discriminating conjunct is *nothing dot-prefixed is persisted* and not
*the round trip is stable*.

**The duplicated validator:** `sed -n '65,71p' src/core/layout.js` and
`sed -n '40,46p' src/core/layout-infer.js` `diff` clean; both ranges start at
`function isSafeRelativePath(value) {` and end at `}`.

**Baselines:** `npm test` → `tests 2611 / pass 2599 / fail 0 / skipped 12`,
exit 0. `npm run lint` → `Linting: 634 file(s)`, `0 error(s)`,
`frontmatter check passed: 267 spec(s), 4 agent(s)`.
`npm run red-proofs` on a **pristine** `git archive` copy →
`3 declared proof(s), 3 selected`, three `PROVEN` roll-ups, `RUN: PROVEN`,
`EXIT=0`.

### 0.3 The full suite under the candidate fix — exactly one existing test breaks

`npm test` on `/tmp/wdfix`: `tests 2611 / pass 2598 / fail 1`.

```text
✖ dream-promote report-fallback: a `reports_dir` with a trailing slash still produces a report
  AssertionError: .: the case list may only hold values readVaultLayout returns UNCHANGED
  + actual: 'reports/dreams'    - expected: '.'
  at tests/unit/dream-promote.test.js:1940
```

That is the whole blast radius. The test's own comment states the rule it now
fails — the case list may hold only values `readVaultLayout` can return
unchanged — and three of its five values stop qualifying. The spec's
Deliverables cell names the edit and Implementation notes names the coverage
consequence rather than leaving it to be discovered in review.

### 0.4 V1, V2 and V4 executed as written, extracted from the spec's fenced block

Each step was cut out of the spec's ```bash block and run through a shell, so the
shipped escaping is exercised rather than described.

**V1** — untouched tree:

```text
MISSING DELIVERABLE: tests/unit/dot-segment-denial.test.js       rc=1
```

**V2** — five trees, one command:

```text
UNTOUCHED c26214cb
  admit 0/312 | reader 0/234 | producer 1/7 | over 12/12 | handoff 15/87
  FAIL: 624 of 652 graded cases wrong                                        rc=1
FULL FIX
  admit 312/312 | reader 234/234 | producer 7/7 | over 12/12 | handoff 87/87
  V2 OK                                                                      rc=0
MUTANT P — the promotion clause reverted (i.e. the SHIPPED ENUMERATION)
  admit 0/312 | reader 234/234 | producer 7/7 | over 12/12 | handoff 15/87
  FAIL: 384 of 652                                                           rc=1
MUTANT L — the layout clause reverted
  admit 312/312 | reader 0/234 | producer 1/7 | over 12/12 | handoff 87/87
  FAIL: 240 of 652                                                           rc=1
MUTANT E — a 20-name matcher FITTED to all 29 of Table D's paths
  admit 0/312 | reader 234/234 | producer 7/7 | over 12/12 | handoff 87/87
  FAIL: 312 of 652                                                           rc=1
```

**Three things this table establishes, and they are the spec's load-bearing
claims:**

1. **The held-out grading goes RED against the shipped enumeration.** `MUTANT P`
   is `makeAdmit` exactly as it ships today, and it scores 0 of 312.
2. **The three enforcement points are independent.** `MUTANT P` leaves the two
   layout points fully green; `MUTANT L` leaves the promotion point fully green.
   A single aggregate count would have been red in both cases and would have
   told a reviewer nothing about which half landed.
3. **A fixed list cannot substitute for the class.** `MUTANT E` satisfies the
   hand-written oracle **87 of 87** — every path anyone wrote down — and still
   scores **0 of 312** on the held-out set. This is the anti-enumeration
   evidence the disposition record's Table E retirement paragraph asks for, and
   it is why criteria 1 and 3 are two criteria rather than one.

**V4** — `npm run lint`: `0 error(s)`, `lint passed`, rc=0, with both edited
documents in the tree.

**V3 was NOT run to completion in this worktree, and the reason is recorded
rather than papered over.** `npm run red-proofs` refuses here with
`ERROR: SNAPSHOT — unsupported entry type: symbolic link at node_modules`,
because this worktree's `node_modules` is a symlink into the main checkout. The
baseline in 0.2 was therefore taken on a pristine `git archive` copy with no
`node_modules` at all, where the lane runs clean. The trap is recorded in the
spec's Implementation notes so an implementer does not read the refusal as a
failure of their work.

**V3 is a REGRESSION-kind step today, not a completion-kind one, and the spec
says so in the step's own comment.** On the untouched tree it exits 0 with three
`PROVEN` roll-ups; what discriminates is criterion 5's *content* — the two named
roll-up lines, which cannot appear unless each declared mutation actually
reddened the assertions it names.

### 0.5 The anti-fit check is not decorative — it fired on its first run

The first generator produced trigrams including `.has`, `.HAS`, `.HaS`, and V2
refused to grade:

```text
FAIL: 3 graded segment(s) occur in the shipped sources, so the set is not held
out: .has, .HAS, .HaS                                                        rc=1
```

`.has` occurs in `DENIED_SEGMENTS.has(` and `INSTRUCTION_BASENAMES.has(`. The
generator was changed to a `z`-prefixed four-letter form and the check passes.
**Recorded because a reviewer cannot otherwise tell an assertion that fires from
one that cannot:** this one did, on its first execution, against its own author.

### 0.6 Line-range citations, both ends, mechanically

Every `file:START-END` and `file:LINE` in the draft was resolved with a script
that prints both endpoint lines. The spec deliberately carries few, and states
why in Current state: the disposition record's `promote.js:99` / `:96` have
already rotted to `:112` / `:99` through one merge.

| Citation | Both ends resolve to |
|---|---|
| `promote.js:228-229` | the comment line *"Deliberately NOT a dot-rule: audit finding C3 owns the layout dot-rule and"* … *"its notice, and a directory-and-extension rule does not step on it."* |
| `promote.js:1045-1057` | `// ROW Z2 — THE SPLIT OF OBLIGATIONS…` … ``// `reports//dreams`, `.`, `./reports`, `reports/./dreams`.`` |
| `layout.js:65-71` | `function isSafeRelativePath(value) {` … `}` |
| `layout-infer.js:33-46` | `/**` … `}` (the copied JSDoc through the copied body) |
| `layout-infer.js:40-46` | `function isSafeRelativePath(value) {` … `}` |
| `adopt.js:372-382` | `// 9. Write config: …` … `fs.writeFileSync(paths.config, updated);` |
| `dream-promote.test.js:1923-1960` | `test('dream-promote report-fallback: …` … `});` |

**Two were wrong in the first draft and were corrected by this check, not by
reading:** `promote.js:1046-1057` began mid-sentence inside the row-Z2 comment
(corrected to `:1045`), and `adopt.js:371-382` began on a blank line (corrected
to `:372`). A third, `dream-promote.test.js:1923-1961`, ended on the blank line
*after* the closing `});` and was corrected to `:1960`.

### 0.7 Findings this pass raised against the draft, and their disposition

| # | Finding | Disposition |
|---|---|---|
| Z1 | The Dispatch precondition claimed `readVaultLayout` has **five** callers and listed `src/cli/adopt.js` among them. Measured: **four** — `src/cli/dream.js`, `src/cli/memory.js`, `src/cli/sync.js`, `src/scheduler/descriptor.js`. `adopt.js` writes the block and never reads it back | FIXED, with the correction stated in place rather than silently reworded |
| Z2 | **An unregistered mirror in a SOURCE file.** `src/core/dream/promote.js`'s row-Z2 comment states how the four `rel` shapes the vault-write primitive forbids are split between `isSafeRelativePath` and this module's caller, and closes with *"Measured, each returned UNCHANGED by `readVaultLayout`: `reports/dreams/`, `reports//dreams`, `.`, `./reports`, `reports/./dreams`."* This work package moves the split (two of four → three of four) and falsifies three of those five values | FIXED three ways: the Deliverables cell for `promote.js` now names **three** comment edits rather than two; Implementation notes quotes the comment and says correct-the-comment-leave-the-code; and the Mirrored Surface Checklist registers it as a mirror **outside this spec**. Found by sweeping the CLAIM (`readVaultLayout` + "unchanged") rather than any wording of it |
| Z3 | The coverage consequence of editing that case list was unstated: the same loop drives the `readVaultLayout` assertion and the scenario, so removing the three values removes the only exercise of the `.`-segment branch of row Z1's `reportRel` filter | FIXED — named in Implementation notes as a consequence **aligned with the test's own rule** (a case spent on an input the reader cannot produce is a case spent on nothing), the branch kept as defence in depth for a caller-supplied layout, re-covering routed to row Z1's owner, and the item routed to the PR's "Discovered issues" |
| Z4 | The draft said the 2026-08-05 ruling "on threat M7 had four items". Items 3 and 4 were ruled against findings **C3** and **C2**, not against M7 | FIXED — the paragraph now attributes item 1 to M7 and item 3 to C3, and claims no item count |
| Z5 | A Current-state path was transcribed as `02-Areas/a/b/.foo/b/c/x.md`; the measured path was `02-Areas/a/.foo/b/c/x.md` | FIXED by the measurement |
| Z6 | The Contract-reference activation line said the predicate appears in "six Deliverables cells"; the table has **seven** rows | FIXED by count |
| Z7 | Table C and criterion 3 said the shipped enumeration "admits 0 of 312" — it admits all 312 and **scores** 0 | FIXED — score wording, both places |
| Z8 | Current state carried an unmeasured timing ("about 100 s") for `npm run red-proofs` | FIXED by deletion; V3's comment now says only that it is the slowest step, which the per-phase tree copy makes true by construction |
| Z9 | `markdownlint` MD038 × 7 on Table A row A5: a code span containing escaped backticks (`` `only \`.md\` content files are promoted` ``) | FIXED — the extension complaint is quoted as italic prose, and the seven affected paths are named by their Table D row numbers instead |
| Z10 | `docs/adr/0010-vault-adoption-paths.md` says `adopt` *"requires the user to confirm it before writing config"*, which `--yes` has not done since it existed | NOT FIXED HERE — routed to the PR's "Discovered issues" and named in Out of scope, together with the reason the ADR's *"arbitrary layout"* sentence needs no amendment |

### 0.8 Design decisions taken at round zero, with their reasons

Recorded here because each is a judgement the stub left open, and a decision
left unrecorded is one an implementer takes silently.

1. **ONE validation authority for the layout, TWO decision sites overall.**
   `isSafeRelativePath` is exported and the copy deleted — the copy is the
   measured cause of the second gap (row D5), and the 2026-08-05 ruling names
   that function as the site. `makeAdmit` keeps its own expression: it validates
   folded segments of a candidate **path**, not a config **value**, and a shared
   helper for a one-line predicate across two domains is the abstraction this
   repo's conventions decline. Sharing the predicate does **not** merge the
   proofs, because the defect class includes *a caller that never consults it* —
   which is exactly what `makeAdmit` is today.
2. **`DENIED_SEGMENTS`, `DENIED_BASENAME` and `INSTRUCTION_BASENAMES` are kept,
   not deleted as subsumed.** Deleting them would change the observed refusal
   reason for `.claude` / `.codex` / `.mcp.json` paths — reasons the shipped
   `docs/instruction-file-inventory.md` names as the mechanism refusing two of
   its Table B rows — and would remove the very enumeration the RED mutant must
   revert to. The class rule sits **after** them, so the specific reason still
   wins.
3. **The class check sits before the `.md` extension check.** It follows the
   module's own stated ordering rule; the measured cost is that 7 of Table D's
   29 paths change their observed reason from the extension complaint to the dot
   reason. Named in Table A row A5, in Table D and in the count paragraph.
4. **The reader's silence is inherited, and the alternative is put to the
   owner** (Dispatch precondition). Not absorbed by accident, per the stub's
   item 4.
5. **No split.** The disposition record is explicit that the two rows belong to
   one work package — *"half-landing either leaves the class open"* — and the
   round-zero measurement shows why: `MUTANT P` and `MUTANT L` are each a
   half-landing, and each is green on the other half's grading.
6. **No tripwire binding this suite to `docs/instruction-file-inventory.md`.**
   A class rule needs no inventory maintenance; a row-count check would import
   the obligation the class rule exists to remove. Recorded in Out of scope so
   the suggestion is not re-raised in review.

### 0.9 What round zero did NOT establish

- **No external channel has read this draft.** Template conformance and the
  clean-context coherence read are the orchestrator's round-zero executors and
  have not run.
- **The shipped tests do not exist yet.** V1's assertion body was not rehearsed
  against a fixture suite; what was rehearsed is V2, whose oracles the suite
  must carry. A criterion that reads correctly here can still be written as a
  test that cannot discriminate — that is what the external rounds look for.
- **V3's completion state is unobserved** by construction: the two roll-up lines
  cannot appear until the declarations and the suite exist.
- **The `.myreports` and keyword-bearing producer families were measured; the
  full seven-key producer grading on the FIXED tree scored 7/7**, but no
  measurement establishes that `inferLayout` has no *other* emission path — only
  that every key it currently emits was graded.

## External rounds

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material design finding on either channel — an acceptance
criterion that a wrong implementation satisfies (in particular one satisfiable
by a finite matcher, which is band A here); a verification step whose RED is not
red or whose GREEN is not green on this tree; an enforcement point in Table B
whose grading a partial fix passes; a Table D row this work package leaves open
without recording why; a mirror of Table A that the checklist does not register;
or a scope leak into the instruction-basename list, into `isUnder`'s `.`
handling, or into the generated inventory. Machinery and wording findings at
that point are fixed within the frozen surface or accepted as named residuals.

**Escalations:** (i) two consecutive rounds landing findings of the same kind →
a design question per ADR-0031, never a third patch — and the fixed point this
repository has reached four times is *delete the step that has to be right*;
(ii) a finding whose only honest fix adds anything that watches, polls or runs
(ADR-0004), reopens the instruction-basename list, or edits
`docs/instruction-file-inventory.md` is PARKED — to the owner or to the work
package that owns it; (iii) the Dispatch precondition is the owner's, so a
finding that only re-argues the reader's silence is routed as a scope objection
and does not count toward the verdict.
