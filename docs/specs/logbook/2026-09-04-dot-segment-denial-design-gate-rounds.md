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

## Round zero — orchestrator's executors, 2026-09-04, rebased onto `29c61d03`

The clean-context **template-conformance** executor reported the spec CONFORMANT
with nothing silently absent. The **coherence** executor reproduced every
citation, every Current-state measurement, V1/V2/V4 as written, the
"exactly one existing test breaks" claim byte for byte, the `adopt --yes` round
trip and the `.myreports` edge case, and returned **four findings**. All four
were fixed.

**The branch was rebased, not amended:** the architect's first commit is
`f7a8a9e8` on top of `29c61d03`; these fixes land as a second commit above it.
`git diff --stat c26214cb 29c61d03 -- src tests scripts` is **empty**, so no
measurement above is owed a re-run for the rebase — the only base-dependent facts
that moved are the sibling's path and status.

**SUPERSEDED BY FINDING 2, and left standing above rather than rewritten:**
§0.4's and §0.8's numbers describe the draft in which the class loop sat
**before** clause (b). Finding 2 moved it to **last**. Everything §0.4 records
was really run, and it is what the rejected alternative measures; the numbers
that replace it for the shipped design are in "the re-runs" below. Specifically,
§0.8's design decision **3** ("the class check sits before the `.md` extension
check") is **withdrawn**, and §0.4's `handoff 15/87` and its "20-name fitted
matcher" belong to that superseded ordering.

| # | Finding | Disposition |
|---|---|---|
| **1** [B] | Current state said the sibling's spec "still reads `status: In-Review` at `docs/specs/WP-instruction-basename-currency.md`". On the branch's actual base it is `docs/specs/done/WP-instruction-basename-currency.md` with `status: Done` (filed in `c9b4a82d`, PR #212) | **FIXED.** The Current-state preamble now pins the base at `29c61d03` with the one-line justification (`git diff --stat c26214cb 29c61d03 -- src tests scripts` empty), and **all five** mentions of the sibling — the Current-state bullet, the Deliverables trap paragraph, the Out-of-scope bullet, the Mirrored Surface Checklist's NON-move entry and Table D's preamble — now name the `done/` path. `depends_on` stays empty and the reason is now the simple one: there is no open work package to depend on |
| **2** [A/B] | Table A row A5's *"Every other refusal string in the module is emitted for exactly the paths it is emitted for today"* was **false under the draft's own fix**. With the loop before clause (b) it also runs before clause (a), so a dot path **out of any tier** — `.github/copilot-instructions.md` at the vault root, a live input because `writeIntoVault` calls `admit` with the RESOLVED path — moved off *"not under a writable vault tier directory"* onto the dot reason. No test asserts that string, so nothing broke; the universal claim was simply wrong | **FIXED by taking option (i): the loop moves to LAST**, after clause (a), immediately before `return null` — see the decision and its measurements below |
| **3** [C] | The held-out generator was fully deterministic (the same 104 strings every run), so the anti-leakage substring check caught literal hardcoding but not an obfuscated reimplementation of the same generator inside production code | **FIXED by seeding.** The generator draws from a per-run seed (`Date.now()`, overridable by `WD_HELD_OUT_SEED`), the seed is **printed as V2's first line**, and re-supplying it reproduces the run exactly — verified below. Implementation notes carries the same obligation for the shipped test, and **the residual is stated in one line**: seeding varies the values, not the family shape, so a matcher fitted to the shape still passes — which is what criterion 3's independent oracle and the review gates are for |
| **4** [C] | Table D's oracle-shrink protection is *"visible in the diff"*, not mechanically gated: `scripts/boundary-check.js` is file-level and admits any edit to the spec file once it is touched at all — and it must be touched, for the `status:` flip | **FIXED by naming it.** A new **NAMED RESIDUAL** entry in the Mirrored Surface Checklist under Table D says exactly that, and states what a reviewer should expect instead: *the diff to this spec file is exactly the one-line `status:` change and nothing else; any second hunk in it is anomalous and is a contract change to be judged as one* |

### 0.11 Finding 2 — the ordering decision, measured on both alternatives

**The two options, measured on scratch copies of `29c61d03` (never the
worktree).** `makeAdmit(defaultLayout())`, the four inputs that separate them:

```text
                                        UNTOUCHED            (ii) loop FIRST        (i) loop LAST
.github/copilot-instructions.md   not under a writable   begins with a dot      not under a writable
  (vault root, out of tier)         vault tier directory                          vault tier directory
.gitignore  (vault root)          only `.md` content     begins with a dot      only `.md` content
                                    files are promoted                             files are promoted
01-Projects/example/.cursorrules  only `.md` content     begins with a dot      only `.md` content
                                    files are promoted                             files are promoted
01-Projects/example/
  .github/copilot-instructions.md ADMITTED               begins with a dot      begins with a dot
```

**Option (i) is taken.** Under it the loop is reachable only by a path every
other clause admits, so **no path refused today changes the reason it is refused
with** — row A5's universal becomes true as written rather than being narrowed
to a longer exception list. Option (ii) would have required enumerating three
classes of refusal-string change (7 Table D paths, out-of-tier dot paths, and
root dot non-`.md` paths) and keeping that enumeration correct; option (i)
requires none, because the change is confined to the admit/refuse boundary. The
module's *"(c) first"* comment argues that an ENUMERATED check should prefer its
own reason over an extension complaint; it does not reach a class rule whose job
is to refuse what the other clauses admit. **Simplest to state, simplest to
prove, and it is the option that keeps the claim honest** — which is what the
finding asked for.

**What changed in the spec as a consequence, all in one pass:** row A5 (position,
the exact claim, and the rejected alternative with its measurement); Table D's
"After" column — **17 rows now carry the dot reason and 12 keep today's reason
exactly**, where the draft had 24 and 5; the count paragraph under Table D; the
three UNCHANGED example pairs under "Exact contracts" (one of them the vault-root
case); V2's `HANDOFF` expected-reason map; criterion 3 ("the twelve rows that
keep today's reason"); Table C's C1 cell; the Security checklist's first bullet;
and the Mirrored Surface Checklist entry for A5, which now registers all five
mirrors by name.

### 0.12 The re-runs on the shipped ordering, V1/V2 extracted from the spec

Five trees, the extracted V2 run in each. **These supersede §0.4's table.**

```text
UNTOUCHED 29c61d03
  admit 0/312 | reader 0/234 | producer 1/7 | over 12/12 | handoff 36/87
  FAIL: 603 of 652                                                            rc=1
FULL FIX (ordering (i))
  admit 312/312 | reader 234/234 | producer 7/7 | over 12/12 | handoff 87/87
  V2 OK                                                                       rc=0
MUTANT P — the promotion clause reverted (the SHIPPED ENUMERATION)
  admit 0/312 | reader 234/234 | producer 7/7 | over 12/12 | handoff 36/87
  FAIL: 363 of 652                                                            rc=1
MUTANT L — the layout clause reverted
  admit 312/312 | reader 0/234 | producer 1/7 | over 12/12 | handoff 87/87
  FAIL: 240 of 652                                                            rc=1
MUTANT E — an 18-name matcher FITTED to the dot segments of Table D's paths
  admit 0/312 | reader 234/234 | producer 7/7 | over 12/12 | handoff 87/87
  FAIL: 312 of 652                                                            rc=1
```

The three claims §0.4 established survive the reorder unchanged, and one gets
sharper: **`handoff 36/87` on the untouched tree** is the twelve already-refused
rows matching their expected reason at all three depths while the seventeen
admitted ones do not — the oracle now measures exactly the admit/refuse boundary
row A5 confines the change to. `MUTANT E` still satisfies the hand-written
oracle **87 of 87** while scoring **0 of 312** held out.

**V1**, extracted and run on the untouched tree:

```text
MISSING DELIVERABLE: tests/unit/dot-segment-denial.test.js                     rc=1
```

**The full suite under ordering (i):** `npm test` on the scratch copy →
`tests 2611 / pass 2598 / fail 1`, the failure again and only
`dream-promote report-fallback: a reports_dir with a trailing slash still
produces a report` at `tests/unit/dream-promote.test.js:1940`. **The blast-radius
claim is unchanged by the reorder**, which is itself worth recording: the one
break is layout-side and the promotion clause's position cannot affect it.

**The seed, verified reproducible.** An untouched-tree run printed
`seed 1788534226945`; re-running with `WD_HELD_OUT_SEED=1788534226945` produced
the identical draw (`.zqyo`, `.ZQYO`, …) and the identical tally. A second
unseeded run drew different segments and reached the same verdict — which is the
property the seeding buys: the values vary, the conclusion does not.

**`npm run lint`** with both revised documents in the tree: `Linting: 635
file(s)`, `0 error(s)`, `frontmatter check passed: 267 spec(s), 4 agent(s)`,
rc=0.

### 0.13 What this round did NOT change

- **No acceptance criterion was weakened or removed**, and no verification step
  was added: V2 grew a seed and a corrected expected-reason map inside its
  existing body, which is a fix within the frozen surface rather than new
  machinery (`docs/runbooks/codex-review.md`, "The loop converges by freezing
  surface").
- **The Dispatch precondition is untouched.** The reader's silence is still the
  owner's call and no finding argued with it.
- **`status:` stays `Draft`.** Only the orchestrator's design-gate loop flips it.

## External rounds

Round zero closed at `9356659d` (architect self-check `430deaa2` → the
orchestrator's two clean-context executors, template conformance CONFORMANT and
coherence 4 findings — 1 A/B, 1 B, 2 C — all FIX in `9356659d`; the loop moved
LAST so no refusal string moves; the held-out generator is seeded per run).

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material design finding on either channel — a dot-prefixed
segment or layout value that any of the three enforcement points (`makeAdmit`,
`readVaultLayout`, `inferLayout`/`adopt --yes`) still admits or emits at some
depth or case; an acceptance criterion or verification step a wrong
implementation passes (held-out grading that a fitted matcher satisfies, a RED
mutant that is not the shipped enumeration, an oracle the same accident can
shrink); an over-denial of a legal path; the `adopt --yes` round trip persisting
a mapping a later read discards; or a scope leak into the instruction-basename
list `WP-instruction-basename-currency` closed — and machinery/wording findings
at that point are fixed within the frozen surface or accepted as named
residuals. **Escalations:** (i) two consecutive rounds landing findings of the
same kind → a design question per ADR-0031, never a third patch; (ii) a finding
whose only honest fix adds a notice, anything that watches or runs (ADR-0004),
or reopens the basename list is PARKED — to the owner or to a successor; (iii)
the Dispatch-precondition item (the reader's silent fallback stays silent) is the
owner's, so a finding that only re-argues it is routed as a scope objection and
does not count toward the verdict.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review
--base main`, run from the branch worktree); shadow = hermetic Codex
(`codex exec -s read-only`, `CODEX_HOME=~/.codex-review-home`, detached worktree
at the round's tip, no approvals). Raw outputs committed BEFORE adjudication as
`2026-09-04-dot-segment-gate-raw-round<N>-<channel>.txt`.

### Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
| 1 (`4f02c5f3`) | needs-attention / needs-attention | `…round1-codex-plugin.txt`, `…round1-herdr-shadow.txt` (both `7fca573c`) | Plugin 1 A + 1 B, shadow 1 A, zero scope objections counted; both PASSED Table D's mapping of the 17 HANDOFF rows onto 29 paths, the loop-LAST ordering, the adopt conjunction, the Deliverables boundary, ADR-0004 and size M. **Converged (A):** both grading families — the seeded z-family and Table D — share the same first-character shape (`.` + ASCII letters), so neither pins the U+002E boundary: both channels executed a wrong predicate (`length > 1 && trimStart().normalize('NFKC').startsWith('.')`) that scored a PERFECT V2 while admitting the bare `.` (so `reports_dir: .` stays honoured) and over-denying legal whitespace-led and U+2024/U+FF0E look-alike segments; the plugin also fitted a z-family ∪ Table D matcher that missed `.ordinary`/`.vscode` → FIX: **Table E, a hand-written ten-row boundary matrix** (refusals incl. `.`, `..`, `a//.b`, `.a`, `.vscode`, `.ordinary`, a dot basename, a whole-value `<sp><sp>.hidden`, and the three values removed from the report-fallback test asserted as a fallback; legal positives incl. `<sp>.hi`, the look-alikes, trailing/interior dots, an NFD lead) as a third oracle in V2 and the suite, criterion 6; whitespace and Unicode decided per trim site from the code (`coerceScalar` trims the value, `pick` trims a directory name, the validators trim nothing; NFC does not fold the look-alikes, NFKC explicitly Out of scope). Measured on eight trees: each of four attacks (length>1, NFKC, z∪TableD, fitted list) is caught by exactly one oracle; the union-fitted residual stated. **Plugin (B):** `evaluateRed` requires the own-body failure set to EQUAL `expectRed`, and C1's mutation also reddens the Table D oracle → six named test identities partitioned at the B1 / B2-B3 seam (C1 declares T1–T3, C2 declares T4–T5, T6 no-over-denial in neither), band markers per assertion for `signal`, criterion 5 reworded after reading `rollUp`. All FIX, applied in `a3985def`. **HEAVY** (a new criterion, a second literal, two more RED identities) → round 2 runs as the closing confirmation. |

### Round 1 fixes — architect, 2026-09-04, on top of `7fca573c`

Two findings, **one [A] converged across both channels**, one [B] from the
plugin. Both fixed. Both channels reported **zero scope objections counted**
(the silent-fallback item, the 2026-08-05 class shape and the basename list were
all routed), and both PASSED, unwidened: Table D maps all 17 `HANDOFF` rows onto
the 29 paths exactly; the loop-LAST ordering preserves every existing refusal
reason (spot-checked on five production paths); the `adopt --yes` conjunction;
the Deliverables boundary; ADR-0004; size M.

**THE CONVERGED FINDING WAS EXECUTED, NOT ARGUED, AND IT REPRODUCED HERE.** Both
channels built a wrong predicate and ran the spec's own V2 against it. So did
this pass, on scratch copies, before writing a word of the fix:

```text
                                                  V2 as it stood at 4f02c5f3
seg.length > 1 && seg.startsWith('.')             admit 312/312 | reader 234/234 |
                                                  producer 7/7 | over 12/12 |
                                                  handoff 87/87            rc=0  (!)
seg.trimStart().normalize('NFKC').startsWith('.') identical perfect score   rc=0  (!)
```

Both are wrong. The first still honours `reports_dir: .` and admits
`01-Projects/x/./y.md`; the second refuses legal `<sp>.hi`, `U+2024 hidden` and
`U+FF0E hidden`. **A verification that scores 100% against two wrong
implementations is not evidence**, and the reason is structural: every generated
segment and every Table D path is `.` + ASCII letters, so neither oracle can see
the FIRST CHARACTER. The third channel-suggested attack — a matcher combining
the generated family with Table D's segment names — is caught partly by the
per-run seed added at round zero (`admit 234/312`) and decisively by the new
matrix.

| # | Finding | Disposition |
|---|---|---|
| **R1-A** [A, converged] | The grading families do not pin the exact U+002E first-character boundary: no bare `.`, no whitespace-led segment, no trailing-dot segment, no Unicode look-alike, and the one place the bare `.` WAS exercised is the case list this work package removes. Two wrong predicates pass everything, including both RED proofs | **FIXED with a THIRD ORACLE, hand-written like Table D and for the same reason.** New **Table E — the fixed boundary matrix**, ten rows over all three enforcement points, present in **both** V2 and the shipped suite: refusals `.`, `..`, `a//.b`, `.a`, `.vscode`, `.ordinary`, a dot-prefixed BASENAME, and the three values removed from the report-fallback test (row **E5**, which is where their reader-side coverage returns, now asserted as a FALLBACK); legal positives `<sp>.hi`, `U+2024`/`U+FF0E` look-alikes, a trailing dot, an interior dot, an NFD leading character, plus the producer's own pair (`<sp>.inbox` falls back because `pick` trims it; `U+2024 projects` is emitted unchanged). New acceptance criterion **6**; idempotence moved to **7**. **The three trims and the NFC/NFKC decision are each argued from the code** in Implementation notes, and NFKC normalisation is now explicitly Out of scope. **The residual is stated rather than implied:** a matcher fitted to the UNION of all three oracles is still constructible; what the union buys is four independent axes, and beyond that the detector is review |
| **R1-B** [B, plugin] | Table C's C1 named only the B1 held-out assertions, but deleting the promotion loop also reddens all 17 formerly admitted Table D paths at three depths. `evaluateRed` requires the observed own-body failing set to EQUAL `expectRed`, so a CORRECT implementation would fail the proof on an undeclared failure | **FIXED by making the suite's test identities part of the contract.** Table C now carries an identity table: six named top-level tests (**T1–T6**), partitioned at the B1 / B2-B3 seam so each mutation's failure set is a partition — **C1 declares T1, T2, T3; C2 declares T4, T5; T6 (no over-denial) is in neither**, because both mutations only ever admit more. The boundary matrix is deliberately **two** tests rather than one: a single identity would fail under both mutations and neither set would be attributable. Each test's assertions carry a fixed band marker so the declaration's `signal` is not a guess about a message nobody has written yet. Both proofs keep `criterion: 1`, so `rollUp` emits ONE line for that pair naming both ids — criterion 5 was reworded to match, after reading `rollUp` |

### 1.1 Round-1 measurements — eight trees, V2 extracted from the spec and run as written

```text
UNTOUCHED 29c61d03
  admit 0/312 | reader 0/234 | producer 1/7 | over 12/12 | handoff 36/87 | boundary 16/34
  FAIL: 621 of 686                                                              rc=1
FULL FIX
  312/312 | 234/234 | 7/7 | 12/12 | 87/87 | 34/34   V2 OK                       rc=0
MUTANT C1 — the promotion loop deleted (the SHIPPED ENUMERATION)
  admit 0/312 | reader 234/234 | producer 7/7 | over 12/12 | handoff 36/87 | boundary 27/34
  FAIL: 370 of 686                                                              rc=1
MUTANT C2 — the layout clause deleted
  admit 312/312 | reader 0/234 | producer 1/7 | over 12/12 | handoff 87/87 | boundary 23/34
  FAIL: 251 of 686                                                              rc=1
FITTED — an 18-name matcher fitted to Table D's dot segments
  admit 0/312 | ... | handoff 87/87 | boundary 27/34   FAIL: 319 of 686         rc=1
WRONG 1 — seg.length > 1 && seg.startsWith('.')
  everything green EXCEPT boundary 30/34   FAIL: 4 of 686                       rc=1
WRONG 2 — seg.trimStart().normalize('NFKC').startsWith('.')
  everything green EXCEPT boundary 26/34   FAIL: 8 of 686                       rc=1
WRONG 3 — the z-family regex UNION Table D's 13 segment names
  admit 234/312 | producer 1/7 | handoff 87/87 | boundary 16/34  FAIL: 102/686  rc=1
```

**Each of the last three is caught by exactly one oracle, and that is the
argument for keeping all three.** WRONG 1 and WRONG 2 are green everywhere but
the boundary matrix — the finding, reproduced against the fix. WRONG 3 is
green on the handoff oracle (87/87) and red on the held-out family. FITTED is
green on the handoff oracle and red on the held-out family. **No single oracle
catches all four attacks**; the union does.

**The C1/C2 partition, measured** — this is what R1-B's identity table rests on:
C1 reddens B1's three surfaces (`admit 0/312`, `handoff 36/87`, `boundary 27/34`)
with both layout points green; C2 reddens B2/B3's two (`reader 0/234`,
`producer 1/7`, `boundary 23/34`) with B1 green. `over 12/12` under **both**,
which is why T6 is in neither `expectRed`.

**The boundary rows, measured on both sides.** On the untouched tree every one of
the 18 refusal rows is wrong (`.`, `./reports` and `reports/./dreams` are
honoured; `.a`, `.vscode`, `.ordinary`, `.note.md`, `a//.b`, `.projects`,
`<sp>.inbox`, `.daily` all pass) and all 16 legal positives already hold; under
the fix all 34 hold. The `U+2024 projects` producer row is the one that would
have gone red under an NFKC implementation and stays green here.

**V1**, extracted and run on the untouched tree:
`MISSING DELIVERABLE: tests/unit/dot-segment-denial.test.js`, rc=1.
**`npm run lint`** with both revised documents: `0 error(s)`, rc=0.

### 1.2 What round 1 did not change

- **The ordering decision stands.** Both channels confirmed the loop-LAST
  partition preserves every existing refusal reason; nothing in either finding
  argued with it.
- **No new verification STEP was added.** V2 grew a third oracle inside its
  existing body — machinery growing to guard a product behaviour, which is the
  one growth `docs/runbooks/codex-review.md` permits, and in the smallest form
  that guards it: a literal table, no new parser, no new command.
- **The Dispatch precondition is untouched**, and both channels routed it.
- **`status:` stays `Draft`.**

**Weighted closure, the architect's read: HEAVY.** R1-A changes what the
implementer builds — a new acceptance criterion, a second hand-written literal in
the shipped test file, and two more declared RED identities — and it changes what
the finished predicate must do at inputs the previous draft never named. R1-B
changes the declaration contract the implementer writes. Neither is a wording
fix. The orchestrator owns the call; this is the input to it.

### Round 2 fixes — architect, 2026-09-04, on top of `5036163b`

**THE CIRCUIT BREAKER FIRED.** Round 1's `[A]` and round 2's two `[A]`s are **one
kind**: *every oracle was a hand-picked or family-shaped SAMPLE of the refusal
set, so each round found a dimension the sample did not vary and a one-conjunct
predicate that exploited it.* The runbook's rule — two consecutive rounds landing
findings of the same kind is a design question, never another textual patch —
applies, and the fixed point this repository has now reached five times is
**delete the step that has to be right**.

| round | predicate that passed EVERYTHING | dimension never varied |
|---|---|---|
| 1 | `seg.length > 1 && seg.startsWith('.')` | the bare `.` |
| 1 | `seg.trimStart().normalize('NFKC').startsWith('.')` | leading whitespace, dot look-alikes |
| 2 | `seg.startsWith('.') && /^[\x00-\x7F]+$/.test(seg)` | the tail alphabet |
| 2 | `seg.startsWith('.') && seg.length <= 16` | the length |

Both channels verified R1-A and R1-B genuinely fixed — all ten Table E outcomes
correct per enforcement point, whitespace consistent with how `makeAdmit` is
called and with the vault-write primitive, E5 replacing the removed reader
coverage, C1 → exactly T1–T3, C2 → exactly T4–T5, T6 green, adopt-e2e outside
the declared suite, one atomic work package rather than a split. **None of that
was widened.** Zero scope objections counted.

**THE DESIGN MOVE: stop sampling the refusal set, grade against the property.**

1. **A REFERENCE PREDICATE is now the contract** (new Table A row **A11**):
   `const refSeg = (seg) => [...seg][0] === '.';` — the segment's first **code
   point** is U+002E — applied after each point's documented pre-step (`fold` at
   B1; `coerceScalar` at B2; `pick`'s `trim` at B3). `[...seg][0]`, not
   `seg[0]`, so an astral first character is one character and not a surrogate.
2. **V2's first oracle is EQUALITY with that reference** over a seeded
   **full-alphabet** sample (new Table **F**): 112 code points — ASCII printable
   minus the two separators, space and tab, Latin diacritics, CJK, combining
   marks, astral emoji, four dot look-alikes — lengths 1–65, a leading `.` on
   about half the draws, **≥ 1000 draws per enforcement point** (5000 verdicts by
   default). Equality, not refusal: an over-denial fails exactly as an
   under-denial does.
3. **The two hand-shaped families are DELETED** — the `z`-led opaque family and
   the keyword-bearing producer family. They are what all four attacks fitted.
4. **The anti-leakage substring check is DELETED**, and the reason is the design
   change rather than a judgement call: under reference equality, reimplementing
   the generator inside production code buys nothing, because the attacker must
   still agree with the reference on whatever it draws.
5. **Table D and Table E stay.** Table D is the product obligation (the 17
   handed-off `HANDOFF` rows), not a sample of the class. Table E is the exact
   boundary — and **the measurement below is why it stays**, not an argument.

**THE MACHINERY SHRANK, which is the point.** Before: two hand-shaped generators
plus an anti-leakage check plus a boundary table plus a handoff table, four
things that had to be right about *which examples were chosen*. After: **one
reference predicate and one full-alphabet generator**, plus the two tables that
encode obligations rather than samples. What the deleted machinery enforced —
"did we pick enough examples?" — is now enforced by the fact that the grading is
against the rule itself.

| # | Finding | Disposition |
|---|---|---|
| **R2-A** [A, plugin] | An ASCII-only predicate scores 686/686 on V2 while admitting `.éclair`, `.éprojects`: every refusing segment in all three oracles had an ASCII tail | **FIXED by the design move.** Reproduced here: on the round-1 verification it scored a perfect run; against the reference grading it scores `ref1 1060/2000` — and still `handoff 87/87`, which is precisely why Table D could never have caught it. The shape is additionally pinned as a fixed row (Table E rows E2, E6, E9 gained a non-ASCII-tailed name) so it cannot regress even outside a draw |
| **R2-B** [A, shadow] | A length-capped predicate (`seg.length <= 16`) scores 686/686 while admitting `.abcdefghijklmnop`: the generator's segments were 5–8 characters and no refusing row in D or E exceeded 16 | **FIXED by the design move.** Reproduced: `ref1 1166/2000` against the reference grading, `handoff 87/87` unchanged. Lengths are now drawn 1–65 per sample, and a 36-character name is pinned in Table E rows E2 and E6 |
| **R2-C** [C, plugin] | V3's commentary still said "the two roll-up lines" while criterion 5 (fixed at round 1) says one line naming both ids | **FIXED.** V3's comment now states the single roll-up line for the pair `WP-dot-segment-denial criterion 1` and why `rollUp` emits one |
| **R2-D** [process objection, shadow] | The 1014-line spec prescribes exact test titles, fixture arrays, assertion markers and mutation structure, which `docs/runbooks/spec-authoring.md` says a spec never does | **DROPPED as a category error, with the reason recorded — and its honest half TAKEN.** ADR-0036 makes the mutation contract (Table C) a spec surface, and `scripts/red-proofs.js`'s `evaluateRed` is an **equality** over failing identities, so the test identities are contract too — settled repo practice, and the sibling `WP-instruction-basename-currency` (Done) carries exactly this shape. Deleting Table C or the identity table would make the RED proofs unwritable. **The honest half:** three Implementation-notes bullets restated machinery that Tables A11 and F now own (the generator's construction, its anti-leakage argument, the producer family) and were collapsed into **one** bullet keeping only the two traps a reader cannot derive — the producer's keyword requirement and `reports_dir`'s joined value. Table E's preamble likewise lost the two-predicate table it duplicated with Table F. **No contract was deleted.** The objection is recorded here because the boundary it names is real even where its conclusion does not follow: everything this spec prescribes about test structure must be traceable to Table C, the oracles or an acceptance criterion, and anything else is prose to prune |

### 2.1 A generator defect this pass caught in its own work, before shipping it

The first draft of the full-alphabet generator kept the round-1 LCG
(`x = (x*1103515245+12345) >>> 0`, sampling `x >>> 8`). Measured over 1000 draws:

```text
leading dot 922/1000   distinct first code points 30 of 112
```

**A generator that claimed a full alphabet and sampled a thirtieth of it**, and
nothing in the tally would have shown it — every count would have read 2000/2000.
Replaced with splitmix32 and re-measured: **111 of 112 distinct first code
points, leading-dot share 0.486**. The lesson is now a checked precondition, not
a memory: **Table F row F5** requires the run to assert ≥ 60 distinct first code
points and a leading-dot share in 0.35–0.65, and to print both — so a future
weakening of the draw fails loudly instead of grading nothing.

*(This is the same shape as round 3 of the sibling's loop: a byte comparison is
only as good as the two artifacts handed to it; a distribution grading is only as
good as the distribution.)*

### 2.2 Round-2 measurements — ten trees, V2 extracted from the spec and run as written

`ref1` = B1 (two positions × N), `ref2` = B2 (two value shapes × N), `ref3` = B3.
N = 1000. Every wrong tree fails; only the fix passes.

```text
UNTOUCHED 29c61d03   ref1  960/2000 | ref2 1014/2000 | ref3  538/1000 | over 12/12 | handoff 36/87 | boundary 16/38   rc=1
FULL FIX             ref1 2000/2000 | ref2 2000/2000 | ref3 1000/1000 | over 12/12 | handoff 87/87 | boundary 38/38   rc=0
MUTANT C1            ref1  998/2000 | ref2 2000/2000 | ref3 1000/1000 | over 12/12 | handoff 36/87 | boundary 29/38   rc=1
MUTANT C2            ref1 2000/2000 | ref2  928/2000 | ref3  483/1000 | over 12/12 | handoff 87/87 | boundary 25/38   rc=1
FITTED 18-name list  ref1 1014/2000 |      green     |     green      | over 12/12 | handoff 87/87 | boundary 29/38   rc=1
WRONG length>1       ref1 2000/2000 | ref2 2000/2000 | ref3 1000/1000 | over 12/12 | handoff 87/87 | boundary 34/38   rc=1
WRONG trimStart+NFKC ref1 1966/2000 | ref2 1988/2000 | ref3  995/1000 | over 12/12 | handoff 87/87 | boundary 30/38   rc=1
WRONG z-family + D   ref1  982/2000 | ref2 1012/2000 | ref3  468/1000 | over 12/12 | handoff 87/87 | boundary 16/38   rc=1
WRONG ASCII-only     ref1 1060/2000 | ref2 1044/2000 | ref3  494/1000 | over 12/12 | handoff 87/87 | boundary 35/38   rc=1
WRONG length<=16     ref1 1166/2000 | ref2 1172/2000 | ref3  536/1000 | over 12/12 | handoff 87/87 | boundary 36/38   rc=1
```

**Four things this table establishes.**

1. **Both round-2 attacks now fail massively** — 2405 and 2128 disagreements —
   and both still score `handoff 87/87`, which is the direct evidence that Table
   D can never bound the class and was never meant to.
2. **The C1/C2 partition survives the redesign**, so Table C's identity table is
   unchanged in shape: C1 reddens B1's three surfaces with the layout points
   green; C2 reddens B2/B3's two with B1 green; `over 12/12` under both, so T6
   stays out of every `expectRed`.
3. **`length > 1` scores a PERFECT 5000/5000 on the reference grading** and is
   caught by four boundary cases alone. **That is why Table E stays**, stated as
   a measurement rather than as a preference: the generator appends a fixed
   suffix to every draw, so it can never produce the bare `.`, and a predicate
   that differs from the reference only there is invisible to the sample. Table F
   row F7 carries this as the residual it is.
4. **`trimStart+NFKC`, which round 1's family could not see at all, now
   disagrees 59 times** across all three points — the full alphabet reaches what
   a `z`-led ASCII family could not.

**V1**, extracted and run on the untouched tree:
`MISSING DELIVERABLE: tests/unit/dot-segment-denial.test.js`, rc=1.
**`npm run lint`** with both revised documents: `0 error(s)`, rc=0.
**Wall time:** V2 completes in about 0.4 s at N = 1000, so the 5000-verdict floor
costs nothing.

**A shell-embedding defect caught by extraction, not by reading.** The first
version of the new V2 carried `new Set(['<','>',':','"','|','?','*'])` — a
literal double quote inside the `node -e "…"` string, which closed it and made
the extracted step a syntax error. The character is now built with
`String.fromCharCode(34)`, and the guard on the block is widened to `$`, backtick
**and** `"`. Round zero's lesson repeated one level down: a fenced command is not
verified until it is extracted and run.

### 2.3 What round 2 did not change

- **The ordering decision, the adopt round trip, Table D's 29 rows, the
  Deliverables boundary, ADR-0004 and size M** — all confirmed by both channels
  and none widened.
- **The Dispatch precondition** is untouched and still the owner's.
- **`status:` stays `Draft`.**

**Weighted closure, the architect's read: HEAVY.** The grading the implementer
must satisfy changed shape — a reference predicate they must match rather than a
list of examples they must refuse — and criterion 1, Table C's identity titles
and two Table E rows moved with it. No `src/` behaviour, no ADR contract and no
user-observable product change: the shipped predicate is the same one-line rule
in all four drafts. The orchestrator owns the call; round 3 as the closing
confirmation is the shape this loop has taken before.
