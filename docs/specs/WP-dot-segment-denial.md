---
id: WP-dot-segment-denial
title: Deny dot-prefixed path segments as a class, at the promotion allowlist and at both layout validators
status: Draft
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004, ADR-0031, ADR-0036]
epic: audit-close
---

# WP-dot-segment-denial: deny dot-prefixed path segments, as a class, everywhere the class can enter

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Dispatch precondition

One item needs an owner ruling before dispatch. It carries a recommendation;
it is not the architect's to take, because it changes what a user observes in
their own vault. The dispatch message records the ruling.

**A dot-prefixed layout value is silently replaced by the built-in default, and
this work package keeps that silence.** After this work package, a
`config.yaml` whose `vault_layout:` maps a tier to a dot-prefixed folder — say
`projects_dir: .projects`, which an earlier `wienerdog adopt` could itself have
written (measured, Current state) — has that key fall back to `01-Projects` on
every read, with **no message**. The user's notes then sit in a directory the
dream run no longer treats as a tier, and nothing says so.

**Recommendation: keep the silence**, on three grounds. (i) The per-key silent
fallback is the **reader's existing contract** for every unsafe value
(absolute, `..`, backslash) and is stated as such in `readVaultLayout`'s JSDoc;
changing its shape means changing what the function returns and touching each of
its four callers — measured: `src/cli/dream.js`, `src/cli/memory.js`,
`src/cli/sync.js` and `src/scheduler/descriptor.js` (`src/cli/adopt.js` is
**not** one of them: it writes the block and never reads it back) — which is a
wider work package than this one. (ii) The **producer side already prints**: `adopt` calls
`printLayout` on the inferred mapping before it writes anything, under `--yes`
as well, so the value a fresh adoption persists is on screen. (iii) ADR-0004
bars anything that watches, polls or reports out of band; the only in-scope
alternative is a line of CLI output at each entry point, which is the wider
change in (i).

The alternative, if the owner prefers it, is a one-line notice at each CLI entry
point that reads the layout — and that is a different work package, not a
widening of this one.

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack": an installer that writes configuration files
into a user's Claude Code / Codex CLI setup, plus a nightly **dream run** that
consolidates recent sessions into the user's markdown **vault**. **IRON RULE
(ADR-0004): Wienerdog is just files.** No daemons, no servers, no telemetry, no
background process that outlives its job. This work package installs nothing
that watches, polls or runs: it adds a **validation condition** to code that
already runs on demand and exits.

**How a note reaches the vault.** The dream run writes into a scratch
**workspace**, then **promotes** changed notes into the vault. Promotion is
gated by one predicate, `makeAdmit` in `src/core/dream/promote.js`, which
`writeIntoVault` calls with the path the write actually **RESOLVES** to (so a
pre-existing vault symlink cannot smuggle a path past it). Its three clauses:
**(a)** the path is under a writable tier directory; **(b)** its final component
ends in `.md`; **(c)** its basename is not a current harness instruction-file
shape, no segment is `.claude` or `.codex`, and the basename is not `.mcp.json`.
Clause (c) is the only clause that can reach a file written *inside* an admitted
tier directory — (a) and (b) both pass for `01-Projects/example/.github/copilot-instructions.md`.

**Where the tier directories come from.** They are not hardcoded. A user's
`config.yaml` may carry a `vault_layout:` block of seven keys
(`identity_dir`, `daily_dir`, `daily_filename`, `projects_dir`, `skills_dir`,
`reports_dir`, `inbox_dir`). `readVaultLayout` in `src/core/layout.js` parses
it; each value is checked by the private `isSafeRelativePath`, and a value that
fails is **silently replaced by that key's built-in default** while the rest of
the block still applies. `inferLayout` in `src/core/layout-infer.js` **produces**
such a block by reading an existing vault's real directory names, and
`wienerdog adopt --yes` writes the inferred block into `config.yaml` and
scaffolds the mapped directories **with no confirmation** — so a layout value is
not solely the user's, Wienerdog can generate it.

**What was ruled, and what is still open.** Two items of the 2026-08-05 audit
ruling are this work package's, and they were ruled against two different
findings. **Item 1**, against threat **M7** ("the brain writes an instruction
file; the fence misses it; it is kept and committed"), **denied any dot-prefixed
path segment, as a class**, so that future control directories need no
maintenance. **Item 3**, against finding **C3**, **required rejecting
dot-prefixed layout values in `isSafeRelativePath`, so the item-1 write rule is
unconditional.** Neither landed. The disposition
record `docs/specs/logbook/2026-09-02-audit-group-c-disposition.md` measured
both and left them **OPEN** as Table D rows **D1 (b)** and **D5**, assigning
both to this work package — *"the same WP as D1 (b), because item 3 exists to
make item 1 unconditional and half-landing either leaves the class open"*. The
owner ruled the severity on 2026-09-02 (option (i), QUEUED; primary record
`docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md`, item 3), placing
`WP-instruction-basename-currency` first in the queue and this work package
immediately after it.

**Why an enumeration is the defect and a class rule is the fix.** Today's
`DENIED_SEGMENTS` is a `Set` of exactly two names where the ruling required a
class. That is not a short list to lengthen: the disposition record's Table E
retirement paragraph records that **every** finite enumeration proposed across
its rounds was defeated by a partial fix that satisfied the listed cases while
the class stayed live — *"a five-name segment list passing while
`.vscode/instructions.md` was written; `.git`/`.projects` fixtures passing while
the reader still accepted `.github` and the producer emitted `.identity`"*. So
the proof this work package owes is a **class** proof, graded on segments it
does not name, and the mutant it must redden is the shipped enumeration itself.

**What this work package is NOT.** It is not the instruction-basename list.
That list stays a list, is owned by `WP-instruction-basename-currency` (Table D
row D1 (c)), and is not reopened here: a dot rule does not refuse
`01-Projects/example/GEMINI.md` (no dot segment), and a basename list does not
refuse `.husky/pre-commit.md`. A class rule **closes**; an enumeration **never
closes**.

## Current state

Every claim below was measured on commit `c26214cb` and re-pinned to this
branch's base, **`29c61d03`** — `git diff --stat c26214cb 29c61d03 -- src tests
scripts` is **empty**, so the tree an implementer will find is byte-identical
under `src/`, `tests/` and `scripts/` to the one measured, and only wording that
names the sibling's lifecycle changed with the rebase.
Re-run them rather than trusting the sentence; the round-zero record
(`docs/specs/logbook/2026-09-04-dot-segment-denial-design-gate-rounds.md`)
carries every command and its exit status.

**Citations here name CONSTRUCTS, not line numbers, deliberately.** The
disposition record cites `promote.js:99` for `DENIED_SEGMENTS` and `:96` for
`INSTRUCTION_BASENAMES`; on this base those declarations are at `:112` and
`:99`, because `WP-instruction-basename-currency` grew the basename set in
between. A line number in a spec that outlives one merge is a citation that
rots — so where a line range appears below it is because the template needs one,
and both of its ends were resolved mechanically at round zero.

- **`makeAdmit` admits dot-prefixed segments beneath an admitted tier.**
  Measured through the production predicate with `defaultLayout()`:
  `01-Projects/example/.github/copilot-instructions.md`,
  `.../.github/instructions/NAME.instructions.md`, `.../.husky/pre-commit.md`,
  `.../.git/hooks/note.md`, `.../.obsidian/plugins/x.md`,
  `.../.cursor/rules/x.md`, `06-Identity/.vscode/instructions.md`,
  `02-Areas/a/.foo/b/c/x.md`, `03-Resources/.a/.b/.c/x.md` and
  `01-Projects/example/.hidden.md` are all **ADMITTED**. Row D1 (b)
  additionally demonstrated the production write path: the real `writeIntoVault`
  with the production `admit` **wrote**
  `01-Projects/example/.github/copilot-instructions.md`.
- **Case folding is in scope and the existing fold covers only the enumerated
  names.** Measured: `01-Projects/example/.GiThUb/copilot-instructions.md` and
  `.../.GITHUB/x.md` are **ADMITTED**, while `.../.CLAUDE/rules/evil.md` — an
  uppercased spelling of an *enumerated* segment — is refused.
- **`DENIED_SEGMENTS` is `const DENIED_SEGMENTS = new Set(['.claude', '.codex']);`**
  — two names — and `DENIED_BASENAME` is `'.mcp.json'`. `makeAdmit`'s clause-(c)
  checks run **before** the `.md` extension check, with the stated reason *"(c)
  first, so a denied instruction file is refused with the reason that actually
  explains it rather than with an extension complaint"*.
- **The deferral pointer is live.** `makeAdmit`'s JSDoc carries
  *"Deliberately NOT a dot-rule: audit finding C3 owns the layout dot-rule and
  its notice, and a directory-and-extension rule does not step on it"*
  (`src/core/dream/promote.js:228-229`). It is a deferral to this work package
  and must move with it.
- **`fold` is `s.normalize('NFC').toLowerCase()`**, applied to every segment by
  `foldedSegments` before any lookup — so a refusal message interpolating a
  segment prints the **folded** spelling. `promote.js` exports exactly
  `promote`, `makeAdmit`, `spawnGitForMerge`.
- **The reader honours dot-prefixed layout values.** With a `config.yaml`
  carrying `projects_dir: .git`, `identity_dir: .GiThUb`, `skills_dir: .` and
  `inbox_dir: a/.b`, `readVaultLayout` returns **every one of them unchanged**,
  and `makeAdmit` built on that layout **admits** `.git/hooks/note.md`,
  `.GiThUb/x.md` and `a/.b/x.md`. A bare `.` is accepted today as well.
- **The producer emits them.** `inferLayout` on a vault holding `.projects/`,
  `.identity/` and `Inbox/` returns `projects_dir: ".projects"`,
  `identity_dir: ".identity"`. Its hygiene loop already calls
  `isSafeRelativePath` on every emitted value and falls back to the default when
  it fails — so the producer needs **no new call site**, only a stricter
  predicate.
- **The validator is duplicated, and the two copies are byte-identical.**
  `src/core/layout.js:65-71` (`function isSafeRelativePath(value) {` … `}`) and
  `src/core/layout-infer.js:40-46` (same two ends) `diff` clean. The copy's own
  JSDoc says it was copied because *"layout.js may not be modified"* — that was
  `WP-026-full-adoption-flow`'s local Deliverables boundary, not a standing
  rule, and no ADR or Done spec forbids modifying `src/core/layout.js`.
  `isSafeRelativePath` is **not** exported today:
  `module.exports = { defaultLayout, readVaultLayout, resolveDailyPath, layoutPromptLines };`
- **`adopt --yes` round-trips a dot value today.** Measured end to end with the
  same calls `src/cli/adopt.js` makes (`inferLayout` → the rendered
  `vault_layout:` block → `readVaultLayout`): the block persists
  `projects_dir: .projects` and the read-back returns `.projects`, so the two
  sides agree **on the wrong value**. `adopt` prints the inferred mapping
  (`printLayout`) before the `--yes` branch skips confirmation, writes the block
  at its step 9 (`src/cli/adopt.js:372-382`) and scaffolds at step 10.
- **The one existing test the class rule breaks, measured by running it.** With
  the rule applied to a scratch copy of this tree, `npm test` reports **2611
  tests, 1 fail** — `tests/unit/dream-promote.test.js:1923-1960`,
  *"report-fallback: a `reports_dir` with a trailing slash still produces a
  report"*. Its case list carries its own rule in a comment — *"THE CASE LIST IS
  EVERY VALUE `readVaultLayout` CAN RETURN UNCHANGED, and it may contain no
  value it CANNOT return"* — and three of its five values (`.`, `./reports`,
  `reports/./dreams`) stop satisfying it. Nothing else in the suite changes.
- **Baselines on the untouched tree.** `npm test`: **2611 tests, 2599 pass, 0
  fail, 12 skipped**, exit 0. `npm run lint`: clean.
  `npm run red-proofs`, run on a pristine copy: **`3 declared proof(s), 3
  selected`**, three `PROVEN` roll-ups, `RUN: PROVEN`, exit 0.
- **`WP-instruction-basename-currency` is `Done`** — its code landed in PR #211
  and it was filed at `docs/specs/done/WP-instruction-basename-currency.md` with
  `status: Done` in `c9b4a82d` (PR #212). `INSTRUCTION_BASENAMES` holds nine
  names and `docs/instruction-file-inventory.md` exists, with **17 `HANDOFF`
  rows** in its Table B. `depends_on` is empty because there is no open work
  package to depend on, and nothing here needs that spec at all: Table D's paths
  are transcribed by hand into this spec rather than parsed from that document,
  and no expected refusal reason in Table D depends on a name that work package
  added.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself (the status flip), package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/promote.js | **ONE new loop inside `makeAdmit`, plus THREE comment edits, nothing else.** The loop applies **Table A** to every segment of the candidate path and returns **Table A row A6's refusal string verbatim**; it sits where **row A5** puts it. **(i)** The JSDoc's clause-(c) sentence gains the class rule — clause (c) is where it belongs in a conjunction the JSDoc states unordered, even though row **A5** puts the check itself last — and the loop carries a one-line comment saying why it is last. **(ii)** The *"Deliberately NOT a dot-rule"* paragraph (`:228-229`) is **replaced** by one recording that this work package discharged it — a dangling deferral to a finding this diff closes is a defect, not a leftover. **(iii)** The **row-Z2 comment above the `reportRel` derivation** (`:1045-1057`) states a split of obligations this work package moves and a measurement it falsifies — see Implementation notes; correct both, and **do not touch the `reportRel` derivation itself**, whose `.`-and-empty filter is row Z1's and stays. **This cell owns what stays unchanged in this file:** `INSTRUCTION_BASENAMES`, `DENIED_SEGMENTS`, `DENIED_BASENAME`, `EXTRA_TIER_DIRS`, `fold`, `foldedSegments`, `isUnder`, `admittedDirs`, the order of the existing clause-(c) checks, **every existing refusal string**, and the module's exports (**Table A row A9**) |
| modify | src/core/layout.js | **ONE new clause inside `isSafeRelativePath`, one JSDoc sentence, one export.** The clause applies **Table A**; the export adds `isSafeRelativePath` to the existing `module.exports` object and changes no other name in it (**Table A row A8**). **This cell owns what stays unchanged:** `LAYOUT_KEYS`, `defaultLayout`, `cleanValue`, `readVaultLayout`'s parser **and its per-key silent fallback** (**Table A row A7**), `resolveDailyPath`, `layoutPromptLines` |
| modify | src/core/layout-infer.js | **DELETE the copied `isSafeRelativePath` — its JSDoc and its body, `:33-46` — and require the shared one** from `./layout` alongside `defaultLayout` (**Table A row A8**). The hygiene loop's call site is **unchanged**: it already calls `isSafeRelativePath` on every emitted value. **This cell owns what stays unchanged:** `dirExists`, `topLevelDirs`, `pick`, `probeDailyFilename`, `inferLayout`'s selection logic and its `reports_dir` special case, and the module's exports |
| create | tests/unit/dot-segment-denial.test.js | **The class proof, and the only new test file.** It carries acceptance criteria **1, 2, 3 and 6** as **exactly the six top-level tests Table C names, with those titles** — the titles are part of the contract because the RED proofs declare failing identities by name and `expectRed` is an equality. Its three oracles: the seeded held-out family, **Table D's 29 paths as a hand-written literal array**, and **Table E's boundary matrix as a second hand-written literal**. Every assertion carries its test's band marker (Table C) so each declaration's `signal` is a fixed string. It reads no document under `docs/` and derives no expected value from one |
| modify | tests/unit/dream-promote.test.js | **ONE site: the case list of the test at `:1923-1960`.** Remove exactly the three values `readVaultLayout` can no longer return unchanged — `.`, `./reports`, `reports/./dreams` — leaving `reports/dreams/` and `reports//dreams`. **Change nothing else in this file**, including that test's title, its `admits` branch and the comment explaining row Z3's residual: the branch's condition becomes constant-true, which is a fact to report under "Discovered issues", not to refactor. **The three removed values do not lose their reader-side coverage** — they return as **Table E row E5**, asserted as a FALLBACK in the new suite |
| modify | tests/integration/adopt-e2e.test.js | **ONE new test: the `adopt --yes` round trip** (acceptance criterion **4**), built on the setup the existing test in this file already performs (temp `HOME`/`WIENERDOG_HOME`, `WIENERDOG_LOADER_NOOP=1` to neutralise the OS scheduler, `init.run(['--yes'])`, then `adopt.run([vault, '--yes'])`). Its vault is its own temp directory containing a dot-prefixed tier candidate; the shared `POWERUSER_FIXTURE` is **not** modified. **This cell owns what stays unchanged:** the existing test, its assertions and the file's fixtures and helpers |
| create | tests/red-proofs/dot-segment-denial.proofs.json | The RED-proof declarations, per **Table C** — **two proofs, one per independently revertible source change**. Inert JSON, parsed and never executed. `suite` is `tests/unit/dot-segment-denial.test.js` |

**NOT a deliverable, stated because it is the trap:**
`docs/instruction-file-inventory.md` is **not touched**. It is a GENERATED
document that `docs/specs/done/WP-instruction-basename-currency.md`'s acceptance
criterion 1 pins **byte for byte** against that spec's canonical rendering block;
one edited byte here fails that work package's verification. Table D below is a **hand
transcription** of its 17 `HANDOFF` rows into this spec, which is why this work
package can close them without touching it. Also untouched:
`src/cli/adopt.js`, `src/core/vault.js`, `tests/unit/layout.test.js`,
`tests/unit/layout-infer.test.js`, `scripts/red-proofs.js`, `package.json` and
every CI workflow.

### Exact contracts

**The predicate, in the shape each site needs it.** Both are one expression over
`Table A`'s definition; neither is a shared helper, and **Table A row A8** says
why the layout pair shares a function while the promotion allowlist does not.

```js
// src/core/dream/promote.js, inside makeAdmit's returned admit(rel), over the
// ALREADY-FOLDED `segments` (foldedSegments(rel)). It is the LAST check, after
// clause (a)'s tier rule and immediately before `return null`, so only a path
// every other clause admits can reach it — see Table A rows A5, A6.
for (const seg of segments) {
  if (seg.startsWith('.')) {
    return `not admitted: path segment \`${seg}\` begins with a dot`;
  }
}

// src/core/layout.js, inside isSafeRelativePath, after the existing `..` clause.
if (value.split('/').some((seg) => seg.startsWith('.'))) return false;
```

**Example input → output pairs, measured on a scratch copy carrying exactly
those two edits:**

```text
makeAdmit(defaultLayout())
  01-Projects/example/.github/copilot-instructions.md
      -> not admitted: path segment `.github` begins with a dot
  01-Projects/example/.GiThUb/x.md
      -> not admitted: path segment `.github` begins with a dot     (the FOLDED spelling)
  01-Projects/example/.claude/CLAUDE.md
      -> not admitted: path segment `.claude` is a harness instruction-discovery root   (UNCHANGED)
  01-Projects/example/.cursorrules
      -> not admitted: only `.md` content files are promoted                            (UNCHANGED)
  .github/copilot-instructions.md      (vault root, out of tier)
      -> not admitted: not under a writable vault tier directory                        (UNCHANGED)
  01-Projects/example/note.md          -> null   (admitted)
  07-Daily/2026-09-04.md               -> null   (admitted — an interior dot is not a prefix)

readVaultLayout(config with `projects_dir: .git`)   -> projects_dir: '01-Projects'  (silent)
readVaultLayout(config with `projects_dir: My.Notes`) -> projects_dir: 'My.Notes'   (unchanged)
inferLayout(vault holding .projects/, .identity/, Inbox/)
      -> { projects_dir: '01-Projects', identity_dir: '06-Identity', inbox_dir: 'Inbox', … }
```

**The `adopt --yes` round-trip contract (acceptance criterion 4), stated as the
conjunction that is red today.** For a vault containing a dot-prefixed tier
candidate, after `adopt.run([vault, '--yes'])`:

1. the `vault_layout:` block written into `config.yaml` carries **no value with
   a dot-prefixed segment** — this is the conjunct that is **red on the
   untouched tree**, where the block persists `projects_dir: .projects`;
2. `readVaultLayout` of that same `config.yaml` returns **exactly** the values
   the block carries — nothing the writer persisted is discarded on read;
3. `makeAdmit` built on that read-back layout **admits** a `.md` note under the
   persisted projects tier and **refuses** one under the dot-prefixed directory
   the vault actually contains.

Conjunct 2 is what makes the producer and the reader one decision rather than
two: a fix that landed only on the reader would satisfy 3 and fail 2.

## Contract reference

Activation (ADR-0031, 2-of-7): **(iv)** refusal/fallback behaviour changes — a
new refusal reason at one site, a new fallback trigger at two others;
**(v)** the task crosses an authority boundary — `adopt`/`inferLayout` **emits**
a layout, `readVaultLayout` **interprets** it, and `makeAdmit` **enforces** on
the resolved path, so one component's output is another's contract;
**(vii)** the same predicate appears in two source files, one new test file, two
RED-proof declarations, all seven Deliverables cells, four acceptance criteria
and two verification steps.

### Table A — canonical: the class predicate and what it may not disturb

The single place the rule's facts are decided. Every other surface in this spec
cites this table rather than restating it.

| # | Fact | Value |
|---|---|---|
| **A1** | **What a segment is** | the substrings produced by splitting the value on `/`. For the promotion allowlist that is `foldedSegments(rel)` — the already-NFC-lowercased segments of the **resolved** relative path. For a layout value it is `value.split('/')`. Nothing else is split on; `\` is separately rejected by `isSafeRelativePath` today and that clause stays |
| **A2** | **What DOT-PREFIXED means** | the segment's **first character** is `.` (U+002E). **Begins with, never contains.** Dot-prefixed: `.git`, `.github`, `.a`, `.`, `..`, `.hidden.md`, `.aider.conf.yml`. **NOT** dot-prefixed: `a.b`, `My.Notes`, `2026-09-04.md`, `x.mdc`, `YYYY-MM-DD.md` |
| **A3** | **Which positions** | **every** segment — first, interior and **last**. The basename is a segment, so `01-Projects/x/.hidden.md` is refused by this rule and not by the extension rule. At **any depth**, with no bound on the number of segments |
| **A4** | **Case** | the rule is **case-insensitive by construction and adds no folding anywhere**: the discriminating character is `.`, which has no case, so `.GiThUb` and `.GITHUB` are refused by the same expression that refuses `.github`. Measured — this is why the proof grades mixed-case held-out segments while no `fold` call is added to `src/core/layout.js` |
| **A5** | **Where the check sits in `makeAdmit`: LAST** | **after every existing check**, including clause (b)'s `.md` extension rule and clause (a)'s tier rule — the final gate before `return null`. **The consequence is the reason for the position, and it is exact: NO path refused today changes the reason it is refused with.** Only a path every other clause admits can reach the loop, so the sole observable change is that a previously **ADMITTED** dot path is now refused, with row **A6**'s string. **The alternative was measured and rejected.** Placing the loop first (before clause (b)) followed the module's *"(c) first"* comment but changed the observed reason for two further classes: 7 of Table D's paths moved off the extension complaint, and — the case that decided it — a dot path **out of any tier** (`.github/copilot-instructions.md` at the vault root, a live input because `writeIntoVault` calls `admit` with the RESOLVED path) moved off *"not under a writable vault tier directory"*. The module's *"(c) first"* rule is about the ENUMERATED checks preferring a specific reason to an extension complaint; it does not reach a class rule whose whole job is to refuse what the other clauses admit. Last is also the simplest thing to state and to prove |
| **A6** | **The refusal string** | exactly `` not admitted: path segment `<seg>` begins with a dot ``, where `<seg>` is the **folded** segment (measured: `.GiThUb` prints `.github`, the same way the `INSTRUCTION_BASENAMES` branch prints its folded basename). **One string for every position**, the basename included — a second message for the basename case would be a second fact to keep in step. No other refusal string, no change to `makeAdmit`'s return type |
| **A7** | **What a violating LAYOUT value produces** | the **existing per-key silent fallback**: that key takes its built-in default, the rest of the block still applies, nothing is printed. Inherited unchanged from the reader's current contract for absolute / `..` / backslash values. **Deliberate, not absorbed** — the Dispatch precondition puts the alternative to the owner |
| **A8** | **ONE validation authority for the layout, and why not three** | `isSafeRelativePath` is **exported** from `src/core/layout.js` and **required** by `src/core/layout-infer.js`; the copy is deleted. The reason is this work package's own finding: the copy is exactly why one gap became two (disposition row D5, *"the **copied** `layout-infer.js` validator has the same gap"*), and the 2026-08-05 ruling names that function as the site. **`makeAdmit` keeps its own expression** and does not import one: it validates a different domain — the folded segments of a candidate **path** — while `isSafeRelativePath` validates a config **value**, and a shared helper for a one-line predicate over two domains is an abstraction this repo's conventions decline. **Sharing the predicate does NOT merge the proofs:** the defect class includes *a caller that never consults the predicate*, which is precisely `makeAdmit` today, so each enforcement point is graded separately (Table B) |
| **A9** | **What is NOT deleted, though the class rule subsumes it** | `DENIED_SEGMENTS`, `DENIED_BASENAME` and `INSTRUCTION_BASENAMES` stay **exactly as shipped**. Every path they refuse begins with a dot or is an instruction basename, so the class rule would cover the first two — and deleting them would (i) change the refusal reason for `.claude` / `.codex` / `.mcp.json` paths, which the shipped `docs/instruction-file-inventory.md` names as the mechanism refusing two of its Table B rows, and (ii) remove the very enumeration Table C's RED mutant must revert to. Keeping them costs two `Set` lookups and buys a mutant that is the production code |
| **A10** | **The bound, both ways** | the rule may **only refuse more**. Nothing admitted today may become refused unless it carries a dot-prefixed segment, and nothing refused today may become admitted. The **no-over-denial** half is a graded expectation, not a hope: acceptance criterion 2 names the dot-free paths and layout values that must stay admitted and honoured |

### Table B — canonical: the three enforcement points, each proved separately

One passing implies nothing about the others. **Measured:** with the promotion
clause reverted and the layout clause in place, the held-out grading scored
`makeAdmit 0/312` while `readVaultLayout 234/234` and `inferLayout 7/7` stayed
green; with the layout clause reverted and the promotion clause in place, the
scores inverted (`makeAdmit 312/312`, `readVaultLayout 0/234`,
`inferLayout 1/7`). That is the whole argument for three separate gradings.

| # | Enforcement point | Where the rule sits | What a violation produces | Measured on the untouched tree | Proved by |
|---|---|---|---|---|---|
| **B1** | **The promotion allowlist** — `makeAdmit`'s clause (c), applied by `writeIntoVault` to the **resolved** path | the segment loop of "Exact contracts", positioned by row **A5** | the refusal string of row **A6**; the path appears in the dream run's refusals and nothing is written | 17 of Table D's 29 paths **ADMITTED**; `.GiThUb/…` admitted; the real `writeIntoVault` **wrote** `01-Projects/example/.github/copilot-instructions.md` | criteria **1, 2, 3, 6**; V1, V2; RED proofs **C1** (identities T1-T3) |
| **B2** | **The reader** — `readVaultLayout` via `isSafeRelativePath` | the clause of "Exact contracts", after the existing `..` clause | row **A7**'s per-key silent fallback | `projects_dir: .git`, `identity_dir: .GiThUb`, `skills_dir: .`, `inbox_dir: a/.b` all returned **unchanged**, and `makeAdmit` on that layout admitted `.git/hooks/note.md` | criteria **1, 2, 4, 6**; V1, V2; RED proof **C2** (identities T4-T5) |
| **B3** | **The producer** — `inferLayout`, reached by `wienerdog adopt --yes` | the **same** function as B2, through the hygiene loop's existing call site (row **A8**) | the emitted key falls back to its built-in default **before** `adopt` renders the block, so nothing dot-prefixed is ever persisted | `inferLayout` on a vault holding `.projects/` emitted `projects_dir: ".projects"`, and the rendered block round-tripped that value through `readVaultLayout` unchanged | criteria **1, 4, 6**; V1, V2; RED proof **C2** (identities T4-T5) |

### Table C — canonical: the two RED-proof mutations (ADR-0036)

One declaration file, `suite` = `tests/unit/dot-segment-denial.test.js`, two
proofs, both with `wp: WP-dot-segment-denial` and `criterion: 1` — so the run
reports **one** roll-up line for that pair naming both ids. `find` / `replace` /
`marker` / `occurrences` are the implementer's to author against the finished
files; these rows decide what each mutation **is**, and the identity contract
below decides what each must declare. **Two rows and not one because the two
edits are independently revertible** (ADR-0036 A3) — measured in Table B's
preamble: reverting either left the other point fully green, so a single
conjoined row could be red because of the half nobody was testing.

**THE SUITE'S TEST IDENTITIES ARE PART OF THIS CONTRACT, because `expectRed` is
an EQUALITY.** `scripts/red-proofs.js`'s `evaluateRed` requires the observed
own-body failing set to **equal** the declared set: an undeclared own-body
failure fails the proof even when the implementation is correct, and a declared
identity that does not fail fails it too. So the suite carries **exactly these
six top-level tests**, partitioned by enforcement point so that each mutation's
failure set is exactly determined:

| # | test identity (the `test` value in `expectRed`) | carries | reddened by |
|---|---|---|---|
| **T1** | `dot-segment-denial B1: held-out segments are refused by makeAdmit at every position and depth` | criterion 1, point B1 | **C1** |
| **T2** | `dot-segment-denial B1: the boundary matrix — the U+002E first-character rule at makeAdmit` | criterion 6, rows E1–E4 | **C1** |
| **T3** | `dot-segment-denial B1: the handoff oracle — Table D's 29 paths, hand-written` | criterion 3 | **C1** |
| **T4** | `dot-segment-denial B2/B3: held-out segments are refused by readVaultLayout and never emitted by inferLayout` | criterion 1, points B2 and B3 | **C2** |
| **T5** | `dot-segment-denial B2/B3: the boundary matrix — the U+002E first-character rule at both layout validators` | criterion 6, rows E5–E10 | **C2** |
| **T6** | `dot-segment-denial: no over-denial — dot-free paths and layout values stay admitted and honoured` | criterion 2 | **neither** |

**Why the boundary matrix is TWO tests and not one:** it spans all three
enforcement points, and a single identity would fail under **both** mutations, so
each declaration would have to list the other's surface and neither failure set
would be attributable. Split at the B1 / B2-B3 seam, each mutation's set is a
partition. **Why T6 is in neither list:** both mutations only ever *admit* more,
so the over-denial test stays green under both — which is also what stops a
mutation from being credited for reddening the whole suite. Measured: C1's
mutant scored `boundary 27/34` (the seven B1 rows) with the layout points green;
C2's scored `boundary 23/34` (the eleven B2/B3 rows) with B1 green.

**The `signal` for each identity** is a stable substring of that test's own
assertion messages, so every assertion in a test carries its identity's band
marker verbatim: `B1 held-out`, `B1 boundary`, `B1 handoff`, `B2/B3 held-out`,
`B2/B3 boundary`, `no over-denial`. Without a fixed marker the declaration's
`signal` is a guess about a message the implementer has not written yet.

| id | criterion | mechanism — TRIGGER and PATCH | what must redden, and why this mutant |
|---|---|---|---|
| **C1** `dot-segment-admit-reverted` | `1` | **TRIGGER: none — the patched code is on the ordinary path.** The suite calls `makeAdmit` directly, so nothing must be injected to reach the segment loop; the exemption's measurement is the APPLY-phase run itself, which must show the marker present and the named assertions failing. **PATCH: delete the segment loop from `makeAdmit`, leaving `DENIED_SEGMENTS` as the module's only segment rule** — which is **byte-for-byte the shipped production enumeration**. The seam is named structurally, by the loop inside the `makeAdmit` declaration, never by a line number (ADR-0036 A2) | **`expectRed` MUST list T1, T2 and T3 — all three, and nothing else.** Deleting the loop reddens the held-out B1 assertions, the B1 boundary rows AND all 17 formerly admitted Table D paths at three depths; declaring only the held-out test makes a CORRECT implementation fail the proof on an undeclared own-body failure. Measured under this mutation: `admit 0/312`, `handoff 36/87`, `boundary 27/34`, both layout points green — three reddened identities, T6 green. Beyond that: **Measured on this base:** the shipped enumeration **scores 0 of 312** graded held-out cases at B1 — it admits every one of them — while B2 and B3 stay green, so the mutant fails the class grading in exactly one point. **An enumeration of the segments the proof itself names would NOT be a valid mutant**: it agrees with the predicate on every value it is graded against. Measured, and this is the row's whole point — an **18-name matcher fitted to the dot segments of Table D's paths** satisfies the hand-written oracle **87 of 87** and still scores **0 of 312** on the held-out grading |
| **C2** `dot-segment-layout-reverted` | `1` | **TRIGGER: none — the patched code is on the ordinary path.** The suite calls `readVaultLayout` and `inferLayout` directly. **PATCH: delete the dot clause from `isSafeRelativePath`**, leaving the shipped validator — whose segment enumeration is the **empty set**. Structurally named by the clause inside that function's declaration | **`expectRed` MUST list T4 and T5, and nothing else.** Deleting the clause reddens the B2/B3 held-out assertions and the B2/B3 boundary rows — including E5's three fallback assertions, which are the report-fallback test's removed values. Measured: `reader 0/234`, `producer 1/7`, `boundary 23/34`, B1 and T6 green. Beyond that: **Measured:** with this clause absent the grading scores `readVaultLayout 0/234` and `inferLayout 1/7` while `makeAdmit` stays `312/312`. One mutation, one independently revertible change: deleting this clause neither requires nor implies the C1 edit |

### Table D — canonical: the handoff closure oracle, hand-transcribed

Table B of `docs/specs/done/WP-instruction-basename-currency.md` hands this work
package **17 `HANDOFF` rows**, each a documented dot-prefixed instruction-file path assigned
to this work package and **not protected until it lands**. Below is every one of
them made concrete — **29 paths, tier-relative** — with what refuses it today and
what must refuse it after. **The `HANDOFF` set is closed in full: 17 rows, 29
paths, none deferred.**

**This table is the source of the hand-written literal array in
`tests/unit/dot-segment-denial.test.js`, and the anchoring chain is:** the test's
literal equals this table; this table is spec text the Deliverables boundary
lets the implementer touch only to flip `status:`; so shrinking the oracle
requires editing the contract, visibly, in the diff — it is not the silent
accident the independent oracle exists to catch. The paths are **transcribed by
hand from the shipped inventory and never parsed out of it**, which is what
keeps this oracle independent of the generated document.

Every "today" cell was measured through `makeAdmit(defaultLayout())` at three
tier depths (`01-Projects/example/`, `06-Identity/`, `02-Areas/a/b/`).
`DOT` = row **A6**'s string.

| # | Path, relative to a tier directory | Inventory row | Today | After this work package |
|---|---|---|---|---|
| 1 | `.github/copilot-instructions.md` | GitHub Copilot | ADMITTED | `DOT` |
| 2 | `.github/instructions/NAME.instructions.md` | GitHub Copilot | ADMITTED | `DOT` |
| 3 | `.cursor/rules/x.mdc` | Cursor | `.md`-only rule | the extension rule — **unchanged** |
| 4 | `.cursorrules` | Cursor | `.md`-only rule | the extension rule — **unchanged** |
| 5 | `.windsurfrules` | Windsurf / Devin | `.md`-only rule | the extension rule — **unchanged** |
| 6 | `.windsurf/rules/x.md` | Windsurf / Devin | ADMITTED | `DOT` |
| 7 | `.devin/rules/x.md` | Windsurf / Devin | ADMITTED | `DOT` |
| 8 | `.clinerules/x.md` | Cline | ADMITTED | `DOT` |
| 9 | `.roo/rules/x.md` | Roo Code | ADMITTED | `DOT` |
| 10 | `.roorules` | Roo Code | `.md`-only rule | the extension rule — **unchanged** |
| 11 | `.continue/rules/x.md` | Continue | ADMITTED | `DOT` |
| 12 | `.junie/AGENTS.md` | JetBrains Junie | `` `agents.md` is a harness instruction file `` | **unchanged** — the basename check runs before the class rule (row **A5**) |
| 13 | `.junie/playbook.md` | JetBrains Junie | ADMITTED | `DOT` |
| 14 | `.junie/rules/x.md` | JetBrains Junie | ADMITTED | `DOT` |
| 15 | `.junie/guidelines.md` | JetBrains Junie | ADMITTED | `DOT` |
| 16 | `.kiro/steering/x.md` | AWS Kiro | ADMITTED | `DOT` |
| 17 | `.amazonq/rules/x.md` | Amazon Q Developer | ADMITTED | `DOT` |
| 18 | `.trae/rules/x.md` | Trae | ADMITTED | `DOT` |
| 19 | `.openhands/microagents/x.md` | OpenHands | ADMITTED | `DOT` |
| 20 | `.openhands/skills/x.md` | OpenHands | ADMITTED | `DOT` |
| 21 | `.agents/skills/NAME/SKILL.md` | OpenHands | ADMITTED | `DOT` |
| 22 | `.qwen/QWEN.local.md` | Qwen Code | ADMITTED | `DOT` |
| 23 | `.claude/CLAUDE.md` | Claude Code | `` path segment `.claude` is a harness instruction-discovery root `` | **unchanged** (rows **A5**, **A9**) |
| 24 | `.claude/rules/x.md` | Claude Code | same as 23 | **unchanged** |
| 25 | `.codex/AGENTS.md` | Codex CLI | `` path segment `.codex` is a harness instruction-discovery root `` | **unchanged** |
| 26 | `.codex/AGENTS.override.md` | Codex CLI | same as 25 | **unchanged** |
| 27 | `.rules` | Zed | `.md`-only rule | the extension rule — **unchanged** |
| 28 | `.goosehints` | Goose | `.md`-only rule | the extension rule — **unchanged** |
| 29 | `.aider.conf.yml` | Aider | `.md`-only rule | the extension rule — **unchanged** |

**Counts, so a shorter table is visible:** 29 paths over 17 inventory rows —
**17 ADMITTED today**, 7 refused by the `.md`-only rule, 1 by the
instruction-basename list, 4 by `DENIED_SEGMENTS`. After this work package the
same 12 keep the exact reason they carry today and the **17 that are admitted
today** carry row **A6**'s string — the partition is *admitted / refused*, not a
new one, which is what row **A5**'s position buys. **Measured on the untouched
tree the whole table scores 36 of 87 cases wrong** — the 12 already-refused rows
already match their expected reason at all three depths, and the 17 admitted ones
(51 cases) do not; on a scratch copy carrying the two edits, 87 of 87 correct.

### Table E — canonical: the fixed boundary matrix (hand-written, never generated)

**Why it exists, measured rather than argued.** Round 1 executed two wrong
predicates against the previous verification and both scored **perfectly** on the
seeded family, on Table D, on the no-over-denial set and on both RED proofs:

| wrong predicate | what it does wrong | which oracle catches it |
|---|---|---|
| `seg.length > 1 && seg.startsWith('.')` | still honours `reports_dir: .`, still admits `01-Projects/x/./y.md` | **only Table E** — it scored `boundary 30/34` and everything else green |
| `seg.trimStart().normalize('NFKC').startsWith('.')` | over-denies legal `<sp>.hi`, `\u2024hidden`, `\uFF0Ehidden` | **only Table E** — `boundary 26/34`, everything else green |

Both the seeded family and Table D consist entirely of `.` + ASCII letters, so
neither can see the **first-character** boundary. Table E is the third oracle and
the only one that pins it. **It is hand-written, never generated, for the same
reason Table D is:** a generator bug cannot shrink a set that was typed out.

**The three trims, each measured, because they decide which rows are legal.**
`foldedSegments` and `isSafeRelativePath` **do not trim** — so an *interior*
whitespace-led segment is legal at every point. `coerceScalar`
(`src/core/frontmatter.js`) trims the **whole config value** before validation —
so `<sp><sp>.hidden` IS a dot value and must fall back. `pick` in
`src/core/layout-infer.js` trims a **picked directory name** — so a directory
named `<sp>.inbox` becomes the dot value `.inbox` and must fall back. Three
different trims, three different rows below.

**Unicode look-alikes are LEGAL, and this is a decision, not an omission.**
Measured: `'\u2024hidden'.normalize('NFC')` does **not** begin with `.`, while
`.normalize('NFKC')` does. The module folds with **NFC** (`fold`), and nothing in
this codebase applies NFKC. A harness discovers `.github`, never `\u2024github`,
so refusing a look-alike would refuse ordinary user content — over-denial, which
row **A10** forbids. Same for a decomposed leading character whose NFC form is
not a dot.

**Notation:** `<sp>` in the rows below is one literal ASCII space (U+0020),
written out because a leading space inside a code span is invisible to a reader
and is stripped by some renderers.

| # | Point | Input | Required outcome |
|---|---|---|---|
| **E1** | B1 | `01-Projects/x/./y.md`, `01-Projects/x/../y.md`, `01-Projects//.b/x.md` | refused, reason **A6** — the exact `.`, the exact `..`, and a dot segment after an empty one |
| **E2** | B1 | `01-Projects/x/.a/y.md`, `.vscode/y.md`, `.ordinary/y.md` (each under `01-Projects/x/`) | refused, reason **A6** — short and ordinary names outside every generated family and outside Table D |
| **E3** | B1 | `01-Projects/x/.note.md` | refused, reason **A6** — a dot-prefixed **basename**, not a directory |
| **E4** | B1 | `01-Projects/x/<sp>.hi/b.md`, `\u2024hidden/b.md`, `\uFF0Ehidden/b.md`, `ab./b.md`, `a.b/c.md`, `e\u0301clair/note.md`, `\u2024note.md`, and `07-Daily/2026-09-04.md` | **ADMITTED** — interior leading whitespace, both dot look-alikes, a trailing dot, an interior dot, an NFD leading character, a look-alike basename, and a date basename |
| **E5** | B2 | `reports_dir` = `.`, `./reports`, `reports/./dreams` | falls back to `reports/dreams`. **These are the three values removed from the report-fallback test's case list** — this row is where their reader-side coverage returns, and it returns as an assertion about the FALLBACK rather than about the honoured value |
| **E6** | B2 | `reports_dir` = `a//.b`, `.a`, `.vscode`, `.ordinary` | falls back. (`..` also falls back, and already does today, so it is evidence of nothing this work package changes and is not a required row) |
| **E7** | B2 | `reports_dir` = `<sp><sp>.hidden` | falls back — the reader trims the whole value first, so this is a dot value and not a whitespace one |
| **E8** | B2 | `projects_dir` = `a/<sp>.hi/b`, `\u2024hidden`, `\uFF0Ehidden`, `ab.`, `a.b`, `My.Notes`, `e\u0301clair` | returned **UNCHANGED** |
| **E9** | B3 | a vault whose top-level directories are `.projects/`, `<sp>.inbox/`, `.daily/` | emits the built-in defaults for all three — the second is the `pick`-trim case |
| **E10** | B3 | a vault whose only directory is `\u2024projects/` | emits `\u2024projects` **unchanged** |

**THE RESIDUAL AFTER ALL THREE ORACLES, stated plainly rather than implied
away.** A matcher fitted to the *union* of the seeded family, Table D's 29 paths
and Table E's rows is still constructible — enumerate E1–E3's inputs, test the
`z` shape, and pass everything. Nothing here makes the proof airtight. What the
three oracles buy is that the union spans **four independent axes** — values
nobody wrote down (seeded), paths a vendor documented (Table D), the character
boundary itself (Table E), and the negative direction (no-over-denial) — so a
fit must be built deliberately against all four at once and is not reachable by
any of the accidents these gates exist to catch. Beyond that, review is the
detector, and this paragraph is what tells a reviewer to look.

### Mirrored Surface Checklist

**Table A** (the class predicate):

- [ ] Deliverables cells for `src/core/dream/promote.js` (the loop, its position, its string), `src/core/layout.js` (the clause and the export) and `src/core/layout-infer.js` (the deletion)
- [ ] The "Exact contracts" code block and its measured input → output pairs
- [ ] Acceptance criteria **1, 2, 3** and verification **V1**, **V2**
- [ ] Current state — every "admitted today" measurement, and the `fold` bullet behind row A6's folded spelling
- [ ] `src/core/dream/promote.js`'s clause-(c) JSDoc and the replaced *"Deliberately NOT a dot-rule"* paragraph; `isSafeRelativePath`'s JSDoc
- [ ] **Table D's "After" column** — every `DOT` cell is row A6's string, so a change to A6 rewrites 17 cells and the test literal in the same pass
- [ ] **Table C's PATCH cells**, which name what the mutation reverts to
- [ ] **Row A5's position, and the claim it makes** — *no path refused today changes its reason*. It is mirrored by Table D's twelve **unchanged** cells, by the count paragraph under Table D, by the three UNCHANGED example pairs under "Exact contracts", by V2's `HANDOFF` expected-reason map, and by the Security checklist's first bullet. Moving the loop moves all five, and the vault-root case is the one that catches a move nobody re-measured
- [ ] **Row A7 is mirrored by the Dispatch precondition**, which is where its alternative is put to the owner — a ruling that changes A7 changes both
- [ ] **REGISTERED AT ROUND ZERO, and it is in a SOURCE file rather than in this spec:** `src/core/dream/promote.js`'s **row-Z2 comment** (`:1045-1057`) states how the four `rel` shapes the vault-write primitive forbids are split between `isSafeRelativePath` and this module's caller, and closes with a measured list of five values *"returned UNCHANGED by `readVaultLayout`"*. Row **A7** and row **A2** together move that split and falsify three of those five. It is registered here because a mirror this checklist cannot see is exactly the R11-2 shape ADR-0031 exists to stop, and because the round-zero sweep found it by grepping the CLAIM (`readVaultLayout` + "unchanged") rather than any wording of it

**Table B** (the enforcement points):

- [ ] Acceptance criteria **1** and **4**, and verification **V1**, **V2**
- [ ] Current state's three measured bullets, one per point
- [ ] The `adopt --yes` round-trip conjunction under "Exact contracts", which is B2 and B3 stated as one observable
- [ ] Table C, whose two rows partition these three points

**Table C** (the RED proofs):

- [ ] The Deliverables cell for `tests/red-proofs/dot-segment-denial.proofs.json`
- [ ] Acceptance criterion **5** and verification **V3**
- [ ] Table A row **A9**, which keeps `DENIED_SEGMENTS` alive precisely so C1's mutant is production code

**Table E** (the fixed boundary matrix):

- [ ] Acceptance criterion **6** and verification **V2**
- [ ] The Deliverables cell for `tests/unit/dot-segment-denial.test.js`, which carries E's rows as a second hand-written literal
- [ ] **Table C's identity table** — rows T2 and T5 are Table E split at the B1 / B2-B3 seam, and the split exists so each mutation's `expectRed` is a partition; moving a row between the halves moves an `expectRed` list
- [ ] **Implementation notes' three-trims bullet and the NFKC bullet**, which are where E4/E7/E8/E9/E10's legality is argued from the code
- [ ] The Out-of-scope NFKC entry, and Table A row **A2**'s U+002E definition — Table E is A2 made executable
- [ ] **The residual paragraph under Table E**, which is the only place this spec bounds what three oracles do NOT buy

**Table D** (the handoff closure oracle):

- [ ] Acceptance criterion **3** and verification **V2**
- [ ] The Deliverables cell for `tests/unit/dot-segment-denial.test.js`, which carries the literal
- [ ] **`docs/instruction-file-inventory.md` — a NON-move**, and the reason is registered here so it is not re-proposed: that document is byte-pinned to the canonical rendering block of `docs/specs/done/WP-instruction-basename-currency.md`, this table is a hand transcription of its `HANDOFF` rows, and the two are kept in step by **nothing** — deliberately. See Out of scope
- [ ] **Registered at round zero:** the count paragraph under the table. A row added or removed changes three numbers there, and the 87-case measurement with it
- [ ] **NAMED RESIDUAL — the anchoring chain is VISIBILITY, not a gate.** `scripts/boundary-check.js` is file-level: once this spec file is touched at all (and it must be, for the `status:` flip), it admits **any** other hunk in the same file, Table D included. Nothing mechanically stops the oracle and the table being shrunk together. **What a reviewer should therefore expect: the diff to this spec file is exactly the one-line `status:` change and nothing else.** Any second hunk in it is anomalous and is a contract change to be judged as one, not a detail of the implementation

## Implementation notes & constraints

- **No new npm dependencies.** Plain Node ≥ 18, no TypeScript, no build step,
  nothing that watches or runs (ADR-0004).
- **The held-out set must be GENERATED, SEEDED PER RUN, and proved held out.**
  Acceptance criterion 1's segments are constructed in the test, not listed in
  it; the generator is seeded from a source that varies between runs; the seed is
  **printed** and re-supplying it (`WD_HELD_OUT_SEED`) reproduces the run; and
  the test asserts that **none of the drawn segments occurs as a substring of the
  three shipped source files** it grades. Each part earns its place: the
  anti-leakage assertion is not decorative — at round zero the first generator
  produced `.has`, which occurs in `DENIED_SEGMENTS.has(`, and the check caught
  it against its own author — while the **seed** is what stops a *fixed* set from
  being defeated by an obfuscated reimplementation of the generator inside
  production code, which no substring check can see.
  **The residual, stated in one line:** seeding varies the values, not the family
  shape (a `z`-led lowercase run of 4-7 characters, its case variants, and its
  keyword-bearing form), so a matcher fitted to the *shape* still passes; that is
  what criterion 3's independent oracle and the review gates are for.
  The `z` lead is not decoration either — it is what keeps a drawn segment from
  colliding with an ordinary method name (`.some`, `.map`, `.filter`) and turning
  the anti-leakage assertion into a flaky failure.
- **The producer needs keyword-bearing held-out segments.** `inferLayout` picks
  a top-level directory whose lowercased name **contains** a layout keyword
  (`identity`, `projects`, `skills`, `inbox`, `daily`, `reports`), so an opaque
  `.zabc` is never selected and grading B3 with one proves nothing. Measured at
  round zero: a second generated family of the shape `.<generated><keyword>` is
  what makes `inferLayout` emit dot-prefixed values at all.
- **`reports_dir` has its own producer path.** `inferLayout` joins
  `<top-level dir containing "reports">/dreams`, so the value it emits is
  two-segment and the dot lands in the **first** of them while the key's
  fallback must still replace the **whole** value. Measured on a vault whose only
  directory is `.myreports/`: untouched `reports_dir = ".myreports/dreams"`, with
  the clause `reports_dir = "reports/dreams"`. Grade this key; the hygiene loop
  covers it only because it validates the joined value rather than the picked
  directory name.
- **`makeAdmit` receives ALREADY-FOLDED segments.** `foldedSegments` runs
  before any check, so the loop needs no `normalize`/`toLowerCase` of its own,
  and the refusal string necessarily prints the folded spelling (Table A row
  A6). Adding a fold to `src/core/layout.js` would be dead code for the same
  reason row A4 gives: the discriminating character has no case.
- **The comment this work package falsifies, and it is in a source file, not a
  spec.** `src/core/dream/promote.js`'s **row-Z2** comment (`:1045-1057`) says
  *"`isSafeRelativePath` (`layout.js:65-71`) already guarantees TWO of the four:
  no `..`, and nothing absolute or backslashed. THE CALLER THEREFORE CLOSES
  EXACTLY THE OTHER TWO — empty and `.`"*, and closes with *"Measured, each
  returned UNCHANGED by `readVaultLayout`: `reports/dreams/`, `reports//dreams`,
  `.`, `./reports`, `reports/./dreams`."* After this work package the reader
  guarantees **three** of the four and three of those five values are no longer
  returned unchanged. **Correct the comment; leave the code.** The
  `.filter((seg) => seg !== '' && seg !== '.')` in the `reportRel` derivation
  stays exactly as it is, because this module accepts a `layout` **object from
  its caller**, and a layout constructed in memory never passes through
  `readVaultLayout`. Row Z1 owns that derivation and is not edited.
- **A coverage consequence, named rather than discovered later.** Removing the
  three values from that case list removes the only exercise of the `.`-segment
  branch of row Z1's filter, because the same loop drives both the
  `readVaultLayout` assertion and the scenario. That is **aligned with the test's
  own rule, not a regression against it**: the rule exists because a case spent
  on an input the reader cannot produce is a case spent on nothing, and after
  this work package a `.` segment is exactly that — every production caller
  obtains its layout from `readVaultLayout`. **The reader-side half of that
  coverage returns as Table E row E5**, which asserts the three values now fall
  back; what stays uncovered is only the in-memory branch of row Z1's filter,
  reachable solely by a caller that builds a layout object itself. The branch
  stays as defence in depth; re-covering it belongs to whoever owns row Z1
  (`docs/specs/done/WP-dream-promote-report.md`), not here. Report it under
  "Discovered issues".
- **The three trims decide which Table E rows are legal, and each was read out
  of the code.** `foldedSegments` (promotion) and `isSafeRelativePath` (layout)
  **do not trim**, so an interior whitespace-led segment such as `<sp>.hi` is legal
  and must stay admitted. `coerceScalar` in `src/core/frontmatter.js` trims the
  **whole** config value before validation, so `<sp><sp>.hidden` arrives as `.hidden`
  and must fall back (row E7). `pick` in `src/core/layout-infer.js` trims a
  **picked directory name**, so a directory named `<sp>.inbox` becomes the value
  `.inbox` and must fall back (row E9). Do not add a trim anywhere to make these
  agree — they already agree, and each row asserts the behaviour that follows
  from the trim that is actually there.
- **Do NOT normalise with NFKC anywhere.** Measured: NFKC maps U+2024 and U+FF0E
  onto `.`, NFC does not, and the module folds with NFC. A round-1 wrong
  predicate used NFKC and over-denied three legal names; rows E4, E8 and E10 are
  what catch it. See Out of scope.
- **The one existing test that must change, and the shape of the change.** It is
  named in the Deliverables cell for `tests/unit/dream-promote.test.js`, and the
  reason is that test's own written rule about its case list. Do **not** widen
  `isUnder` to drop `.` segments to keep those cases alive — that is a named
  residual owned by `docs/specs/done/WP-dream-promote-report.md`'s Table Z row
  **Z3**, which states in terms that *"widening C9's matching is a change to a
  closed spec and belongs in its own work package"*.
- **`npm run red-proofs` must be run UNFILTERED.** A `--wp` or `--proof` filter
  leaves every other declaration's `(wp, criterion)` pair unselected, which the
  roll-up reports as `FILTERED` and the run exits non-zero. A filtered run is
  not evidence of failure — it is evidence of a filter.
- **The RED lane refuses a checkout whose `node_modules` is a symbolic link.**
  Measured at round zero: `SNAPSHOT — unsupported entry type: symbolic link at
  node_modules`. That is a property of a worktree set up with a linked
  dependency directory, not of the repository; run V3 in a checkout with a real
  `node_modules` (or none — the suite is zero-dependency).
- **Ambiguity → choose the simpler option** and record it under "Decisions
  made". Do not expand scope to resolve it.

## Security checklist

- [ ] **The anchored-pattern rule is satisfied by narrowing, and here is the
      argument.** This work package introduces no new identifier into any
      filesystem path or shell command. It adds one **rejecting conjunct** to an
      existing validator (`isSafeRelativePath`, whose `..`, absolute and
      backslash clauses are untouched) and one **refusing loop** to an existing
      predicate (`makeAdmit`, which builds no path and spawns nothing). Both can
      only ever refuse more, never admit more — Table A row **A10**, and
      acceptance criterion 2 is the measured other half, so "refuses more" does
      not silently become "refuses everything". **And because row A5 puts the
      loop last, no path refused today changes the reason it is refused with** —
      the change is confined to the admit/refuse boundary rather than spread
      across the module's refusal vocabulary.
- [ ] **The single-authority change does not widen the producer's acceptance.**
      Deleting `src/core/layout-infer.js`'s copy in favour of the export is safe
      only because the two bodies are **byte-identical today** — measured with
      `diff` at both ends (Current state). If they were not, the deletion would
      be a behaviour change hiding inside a refactor.
- [ ] **The untrusted input on the promotion path is validated elsewhere and
      stays there.** The brain-authored relative path is segment-validated by
      the vault-write primitive, whose **Table H row H1** is owned by
      `docs/specs/done/WP-dream-vault-write-primitive.md` and which calls
      `admit` with the **RESOLVED** path. This work package neither weakens nor
      duplicates that rule, and adds no second containment check.

## Acceptance criteria

- [ ] **1. THE CLASS PROPERTY, GRADED ON HELD-OUT SEGMENTS, AT ALL THREE
      ENFORCEMENT POINTS.** *No path segment and no layout segment beginning
      with `.` is admitted or emitted, at any depth, in any case* — Table A.
      Graded on segments **generated by the test, never listed in it**, none of
      which occurs in the three shipped source files (the anti-fit assertion of
      Implementation notes). The grading covers, separately and with its own
      count: **(B1)** `makeAdmit`, with the segment at the first, an interior
      and the **last** position and at three or more depths; **(B2)**
      `readVaultLayout`, over more than one layout key including a value whose
      dot segment is **not** the first; **(B3)** `inferLayout`, over **every**
      key it emits, driven by a vault whose directory names are generated,
      dot-prefixed and keyword-bearing. **Three counts, not one** — a single
      aggregate number is satisfied by a fix at one point, which is the exact
      shape Table B measured.
- [ ] **2. NO OVER-DENIAL.** A hand-written set of dot-free paths stays
      **admitted** — at least a tier-local note, a daily note (`2026-09-04.md`,
      whose basename carries an interior dot), a `SKILL.md` under the skills
      tier, an identity note, a report under `reports/dreams`, a note under
      `02-Areas` whose basename carries an interior dot, and one under
      `03-Resources` — and a hand-written set of dot-free layout values is
      returned **unchanged** by `readVaultLayout` (at least: `01-Projects`,
      `reports/dreams`, `My.Notes`, `a.b/c.d`, `YYYY/MM/YYYY-MM-DD.md`).
      **This criterion is why criterion 1 cannot be satisfied by refusing
      everything.**
- [ ] **3. THE INDEPENDENT ORACLE — Table D's 29 paths, hand-written in the test
      file.** Every path of Table D reaches denial at each of the three tier
      depths named above, **each with the refusal reason its "After" cell
      names** — so the **twelve** rows that keep today's reason are asserted to
      keep it, and row A5's position is pinned rather than assumed. The expected set
      is a **literal array written by hand in the test file**, transcribed from
      Table D and **never parsed out of `docs/instruction-file-inventory.md`**.
      **Why it exists alongside criterion 1:** criterion 1's set is generated,
      so a generator bug shrinks it silently; criterion 3's is written down, so
      the same accident cannot. **Why criterion 1 exists alongside it:**
      measured, a finite matcher fitted to exactly these 29 paths satisfies this
      criterion **87 of 87** and scores **0 of 312** on criterion 1's grading.
- [ ] **4. THE `adopt --yes` ROUND TRIP.** `adopt.run([vault, '--yes'])` on a
      vault containing a dot-prefixed tier candidate satisfies the three-part
      conjunction under "Exact contracts": nothing dot-prefixed is **persisted**,
      the read-back equals the persisted block **value for value**, and the
      promotion allowlist built on the read-back admits a note under the
      persisted tier while refusing one under the dot-prefixed directory. The
      first conjunct is the discriminating one — it is red on the untouched
      tree, where the block persists `projects_dir: .projects`.
- [ ] **5.** `npm run red-proofs`, unfiltered, reports **one** `PROVEN` roll-up
      line for the pair `WP-dot-segment-denial criterion 1` naming **both**
      declaration ids (`rollUp` groups by `(wp, criterion)` and joins the
      contributing ids), `RUN: PROVEN`, and exits 0. The declared-proof count
      rises from the **3** this tree carries to **5**; the criterion is that
      roll-up line and the run verdict, not the count, because another work
      package may add a declaration first.
- [ ] **6. THE FIXED BOUNDARY MATRIX — the third oracle, and the only one that
      pins the first character.** Every row of **Table E** holds, at its named
      enforcement point: E1–E3 and E5–E7 and E9 refuse or fall back, E4 and E8
      and E10 are admitted or returned unchanged. The inputs are a **literal,
      hand-written** set in the test file, never generated and never derived from
      Table D. **Why it exists:** round 1 executed two wrong predicates that
      scored perfectly on criteria 1, 2, 3 and 4 and on both RED proofs —
      `seg.length > 1 && seg.startsWith('.')`, which still honours
      `reports_dir: .`, and `seg.trimStart().normalize('NFKC').startsWith('.')`,
      which refuses legal `<sp>.hi` and the U+2024 / U+FF0E look-alikes. Both the
      seeded family and Table D are `.` + ASCII letters throughout, so neither
      can see the boundary. **Its assertions must redden under the Table C
      mutation that reaches them** — T2 under C1, T5 under C2.
- [ ] **7.** Idempotence — `N/A` — this work package ships no command and writes
      nothing outside the repository. It adds one loop, one clause, one export,
      deletes one duplicated function, and adds their tests.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — criteria 1-4 in their shipped form, plus the whole suite. The guard names
# the DELIVERABLE-ABSENT state directly instead of letting it arrive as a green
# run of a suite that does not exist yet; on the untouched tree this step is RED
# for that reason. Baseline for comparison: 2611 tests, 2599 pass, 0 fail, 12
# skipped. Exactly ONE existing test must be edited (the Deliverables cell for
# tests/unit/dream-promote.test.js says which); a second edited test is a
# finding, not a fix.
test -f tests/unit/dot-segment-denial.test.js || { echo "MISSING DELIVERABLE: tests/unit/dot-segment-denial.test.js"; exit 1; }
npm test

# V2 — criteria 1, 2, 3 and 6, run OUTSIDE the suite so a reviewer can re-derive
# the verdict without reading test code. It carries ALL THREE oracles — the
# seeded held-out family, Table D's hand-written handoff paths, and Table E's
# fixed boundary matrix — plus the no-over-denial set, and prints a
# per-enforcement-point tally so a partial fix names itself.
#
# THE HELD-OUT SEGMENTS ARE SEEDED PER RUN, not fixed. The seed is printed first
# and re-supplying it in WD_HELD_OUT_SEED reproduces the run exactly. A fixed set
# would let an obfuscated reimplementation of the generator inside production
# code pass the anti-leakage check; a per-run seed defeats that.
#
# TABLE E IS WHY THIS STEP GREW, and it grew to guard a product behaviour rather
# than itself. Round 1 EXECUTED two wrong predicates that scored a PERFECT
# 312/234/7/12/87 against the previous version of this step:
#   seg.length > 1 && seg.startsWith('.')          <- still honours reports_dir: .
#   seg.trimStart().normalize('NFKC').startsWith('.')  <- refuses legal ' .hi',
#                                                        U+2024 and U+FF0E names
# Neither is caught by a generated family whose every member is ASCII '.' plus
# letters, nor by Table D, whose every path has the same shape. Table E is the
# only oracle that pins the exact U+002E FIRST-CHARACTER rule, and it is
# hand-written for the same reason Table D is.
#
# Rehearsed at round zero and round 1 in eight states, all as written:
#   UNTOUCHED tree   admit 0/312 | reader 0/234 | producer 1/7 | over 12/12 |
#                    handoff 36/87 | boundary 16/34   (621 of 686 wrong)  rc=1
#   FULL FIX         312/312 | 234/234 | 7/7 | 12/12 | 87/87 | 34/34      rc=0
#   MUTANT C1        admit 0/312, handoff 36/87, boundary 27/34, layout green rc=1
#   MUTANT C2        reader 0/234, producer 1/7, boundary 23/34, B1 green    rc=1
#   FITTED MATCHER   an 18-name list fitted to Table D: handoff 87/87 and
#                    admit 0/312                                            rc=1
#   WRONG length>1   everything green EXCEPT boundary 30/34                 rc=1
#   WRONG NFKC       everything green EXCEPT boundary 26/34 (over-denial)   rc=1
#   WRONG z-family + Table D names   admit 234/312, producer 1/7, boundary 16/34 rc=1
# The last three are round 1's own attacks, and each is caught by exactly one
# oracle — which is the argument for keeping all three.
node -e "
const fs=require('fs'), os=require('os'), path=require('path');
const {makeAdmit}=require(path.resolve('src/core/dream/promote.js'));
const {defaultLayout,readVaultLayout}=require(path.resolve('src/core/layout.js'));
const {inferLayout}=require(path.resolve('src/core/layout-infer.js'));
// HELD-OUT SEGMENTS: generated per run from a SEED, never listed. The seed is
// printed so a run is reproducible by re-supplying it in WD_HELD_OUT_SEED.
const seed=process.env.WD_HELD_OUT_SEED||String(Date.now());
let x=2166136261;
for(const ch of String(seed)) x=((x^ch.charCodeAt(0))*16777619)>>>0;
const rnd=()=>{x=(x*1103515245+12345)>>>0;return x>>>8;};
const A='abcdefghijklmnopqrstuvwxyz';
const opaque=[], keyed=[], KEYS=['identity','projects','skills','inbox','daily','reports'];
for(let i=0;i<26;i++){
  let t='z'; const n=3+(rnd()%4);
  for(let j=0;j<n;j++) t+=A[rnd()%26];
  opaque.push('.'+t,'.'+t.toUpperCase(),'.'+t[0].toUpperCase()+t.slice(1,-1)+t[t.length-1].toUpperCase());
  keyed.push('.'+t+KEYS[i%KEYS.length]);
}
console.log('seed '+seed+' (re-run with WD_HELD_OUT_SEED='+seed+')');
const src=['src/core/dream/promote.js','src/core/layout.js','src/core/layout-infer.js']
  .map((f)=>fs.readFileSync(path.resolve(f),'utf8')).join('\n').toLowerCase();
const leaked=opaque.concat(keyed).filter((s)=>src.indexOf(s.toLowerCase())>=0);
if(leaked.length){console.error('FAIL: '+leaked.length+' graded segment(s) occur in the shipped sources, so the set is not held out: '+leaked.slice(0,5).join(', '));process.exit(1);}
const DOT='begins with a dot', ROOT='is a harness instruction-discovery root';
const EXT='content files are promoted', BASE='is a harness instruction file';
const bad={admit:[],reader:[],producer:[],over:[],handoff:[],boundary:[]};
const admit=makeAdmit(defaultLayout());
for(const s of opaque)
  for(const rel of ['01-Projects/example/'+s+'/x.md','06-Identity/'+s+'/y/z.md','02-Areas/a/b/'+s+'/x.md','01-Projects/example/'+s+'.md'])
    if(admit(rel)===null) bad.admit.push('ADMITTED '+rel);
const cfgdir=fs.mkdtempSync(path.join(os.tmpdir(),'wd-v2-r-')), cfg=path.join(cfgdir,'config.yaml');
for(const s of opaque){
  fs.writeFileSync(cfg,'vault_layout:\n  projects_dir: '+s+'\n  identity_dir: '+s+'/deep\n  reports_dir: a/'+s+'/b\n');
  const l=readVaultLayout(cfg);
  for(const k of ['projects_dir','identity_dir','reports_dir'])
    if(String(l[k]).split('/').some((g)=>g.startsWith('.'))) bad.reader.push('HONOURED '+k+'='+l[k]);
}
const vault=fs.mkdtempSync(path.join(os.tmpdir(),'wd-v2-i-'));
for(const s of keyed) fs.mkdirSync(path.join(vault,s),{recursive:true});
const inferred=inferLayout(vault);
for(const k of Object.keys(inferred))
  if(String(inferred[k]).split('/').some((g)=>g.startsWith('.'))) bad.producer.push('EMITTED '+k+'='+inferred[k]);
const keep=['01-Projects/example/note.md','07-Daily/2026-09-04.md','05-Skills/x/SKILL.md','06-Identity/profile.md','reports/dreams/2026-08-29.md','02-Areas/a/b.c.md','03-Resources/x/y.md'];
for(const rel of keep) if(admit(rel)!==null) bad.over.push('makeAdmit refused '+rel+': '+admit(rel));
const values=['01-Projects','reports/dreams','My.Notes','a.b/c.d','YYYY/MM/YYYY-MM-DD.md'];
for(const v of values){
  fs.writeFileSync(cfg,'vault_layout:\n  projects_dir: '+v+'\n');
  if(readVaultLayout(cfg).projects_dir!==v) bad.over.push('readVaultLayout dropped '+v);
}
const HANDOFF=[['.github/copilot-instructions.md',DOT],['.github/instructions/NAME.instructions.md',DOT],
['.cursor/rules/x.mdc',EXT],['.cursorrules',EXT],['.windsurfrules',EXT],['.windsurf/rules/x.md',DOT],
['.devin/rules/x.md',DOT],['.clinerules/x.md',DOT],['.roo/rules/x.md',DOT],['.roorules',EXT],
['.continue/rules/x.md',DOT],['.junie/AGENTS.md',BASE],['.junie/playbook.md',DOT],
['.junie/rules/x.md',DOT],['.junie/guidelines.md',DOT],['.kiro/steering/x.md',DOT],['.amazonq/rules/x.md',DOT],
['.trae/rules/x.md',DOT],['.openhands/microagents/x.md',DOT],['.openhands/skills/x.md',DOT],
['.agents/skills/NAME/SKILL.md',DOT],['.qwen/QWEN.local.md',DOT],['.claude/CLAUDE.md',ROOT],
['.claude/rules/x.md',ROOT],['.codex/AGENTS.md',ROOT],['.codex/AGENTS.override.md',ROOT],
['.rules',EXT],['.goosehints',EXT],['.aider.conf.yml',EXT]];
if(HANDOFF.length!==29){console.error('FAIL: the hand-written oracle holds '+HANDOFF.length+' paths, Table D has 29');process.exit(1);}
for(const pair of HANDOFF)
  for(const tier of ['01-Projects/example/','06-Identity/','02-Areas/a/b/']){
    const rel=tier+pair[0], got=admit(rel);
    if(got===null) bad.handoff.push('ADMITTED '+rel);
    else if(got.indexOf(pair[1])<0) bad.handoff.push('WRONG REASON '+rel+' -> '+got+'  (wanted: '+pair[1]+')');
  }
// TABLE E - THE FIXED BOUNDARY MATRIX. Hand-written, never generated, and the
// only oracle that pins the exact U+002E first-character rule. DOT is the same
// substring the handoff oracle uses.
const B1X=['01-Projects/x/./y.md','01-Projects/x/../y.md','01-Projects/x/.a/y.md',
  '01-Projects/x/.vscode/y.md','01-Projects/x/.ordinary/y.md','01-Projects/x/.note.md',
  '01-Projects//.b/x.md'];
for(const rel of B1X){const g=admit(rel);
  if(g===null) bad.boundary.push('B1 ADMITTED '+JSON.stringify(rel));
  else if(g.indexOf(DOT)<0) bad.boundary.push('B1 WRONG REASON '+JSON.stringify(rel)+' -> '+g);}
const B1L=['01-Projects/x/ .hi/b.md','01-Projects/x/․hidden/b.md','01-Projects/x/．hidden/b.md',
  '01-Projects/x/ab./b.md','01-Projects/x/a.b/c.md','01-Projects/x/éclair/note.md',
  '01-Projects/x/․note.md','07-Daily/2026-09-04.md'];
for(const rel of B1L) if(admit(rel)!==null) bad.boundary.push('B1 OVER-DENIED '+JSON.stringify(rel)+': '+admit(rel));
const rd=(k,v)=>{fs.writeFileSync(cfg,'vault_layout:\n  '+k+': '+v+'\n');return readVaultLayout(cfg)[k];};
const B2X=['.','./reports','reports/./dreams','a//.b','.a','.vscode','.ordinary','  .hidden'];
for(const v of B2X){const got=rd('reports_dir',v);
  if(got!=='reports/dreams') bad.boundary.push('B2 HONOURED reports_dir '+JSON.stringify(v)+' -> '+JSON.stringify(got));}
const B2L=['a/ .hi/b','․hidden','．hidden','ab.','a.b','My.Notes','éclair'];
for(const v of B2L){const got=rd('projects_dir',v);
  if(got!==v) bad.boundary.push('B2 OVER-DENIED projects_dir '+JSON.stringify(v)+' -> '+JSON.stringify(got));}
const bv=fs.mkdtempSync(path.join(os.tmpdir(),'wd-v2-b-'));
for(const d of ['.projects',' .inbox','.daily']) fs.mkdirSync(path.join(bv,d),{recursive:true});
const bi=inferLayout(bv);
for(const kv of [['projects_dir','01-Projects'],['inbox_dir','00-Inbox'],['daily_dir','07-Daily']])
  if(bi[kv[0]]!==kv[1]) bad.boundary.push('B3 EMITTED '+kv[0]+'='+JSON.stringify(bi[kv[0]]));
const bv2=fs.mkdtempSync(path.join(os.tmpdir(),'wd-v2-b2-'));
fs.mkdirSync(path.join(bv2,'․projects'),{recursive:true});
const bi2=inferLayout(bv2);
if(bi2.projects_dir!=='․projects') bad.boundary.push('B3 OVER-DENIED projects_dir -> '+JSON.stringify(bi2.projects_dir));
fs.rmSync(bv,{recursive:true,force:true}); fs.rmSync(bv2,{recursive:true,force:true});
fs.rmSync(cfgdir,{recursive:true,force:true}); fs.rmSync(vault,{recursive:true,force:true});
const total={admit:opaque.length*4,reader:opaque.length*3,producer:Object.keys(inferred).length,over:keep.length+values.length,handoff:HANDOFF.length*3,boundary:B1X.length+B1L.length+B2X.length+B2L.length+4};
const line=(k)=>k+' '+(total[k]-bad[k].length)+'/'+total[k];
console.log('held out: '+opaque.length+' opaque + '+keyed.length+' keyword-bearing segments, generated, none present in the sources');
console.log(line('admit')+' | '+line('reader')+' | '+line('producer')+' | '+line('over')+' | '+line('handoff')+' | '+line('boundary'));
const all=[].concat(bad.admit,bad.reader,bad.producer,bad.over,bad.handoff,bad.boundary);
if(all.length){console.error('FAIL: '+all.length+' of '+(total.admit+total.reader+total.producer+total.over+total.handoff+total.boundary)+' graded cases wrong; the first five:');
  for(const b of all.slice(0,5)) console.error('  '+b);
  process.exit(1);}
console.log('V2 OK: the class is refused at all three enforcement points, Table D is closed, the U+002E boundary is pinned, and nothing dot-free is over-denied');
"

# V3 — criterion 5. UNFILTERED, deliberately: a --wp filter reports every other
# criterion FILTERED and exits non-zero. It snapshots and re-copies the tree per
# phase, so it is by far the slowest step here.
#
# THIS STEP'S EXIT STATUS IS NOT THE EVIDENCE, and saying so is the point: on the
# untouched tree it is ALREADY GREEN (3 declared, 3 selected, three PROVEN
# roll-ups, RUN: PROVEN, exit 0 — measured on a pristine copy). What
# discriminates is criterion 5's content: the two roll-up lines naming this work
# package's declarations, which cannot appear unless each mutation actually
# reddened the assertions it names. Read the roll-up, not the exit code.
npm run red-proofs

# V4 — the repo gates.
npm run lint
```

Paste, for each: the command, its output, and its exit status.

## Out of scope (do NOT do these)

- **Editing `docs/instruction-file-inventory.md`.** It is generated and
  byte-pinned to the canonical rendering block of
  `docs/specs/done/WP-instruction-basename-currency.md`;
  a single changed byte fails that work package's acceptance criterion 1. Its
  Table B fifth column (*"Refused independently of the dot-segment rule"*) is a
  column of **mechanisms**, not of states, and stays true after this work
  package lands: what changes is that its `none` rows acquire a second refusing
  rule, not that any cell becomes false.
- **Binding this work package's suite to that document** — for instance
  asserting that it still has 17 `HANDOFF` rows. Deliberately not done: a class
  rule needs no inventory maintenance, which is exactly what distinguishes it
  from the basename list, so a row-count tripwire would import the maintenance
  obligation the class rule exists to remove and would give a generated document
  a second consumer without adding anything the held-out grading does not
  already establish.
- **Deleting `DENIED_SEGMENTS`, `DENIED_BASENAME` or any of their refusal
  strings as subsumed by the class rule** — Table A row **A9** has the reasons,
  including that Table C's mutant depends on the enumeration still being there.
- **Reopening the instruction-basename list.** `WP-instruction-basename-currency`
  owns it (disposition row D1 (c)); an unknown tool's dot-free instruction file
  inside a tier still passes, which is the residual the 2026-08-05 ruling
  accepted and this work package does not argue with.
- **Adding a notice, log line or return-shape change to `readVaultLayout`'s
  per-key fallback** — Table A row **A7**, and the Dispatch precondition is
  where the alternative is put to the owner. If the owner rules for a notice,
  the spec returns to the architect; the implementer does not add one.
- **Widening `isUnder` to drop `.` segments.** Named residual of
  `docs/specs/done/WP-dream-promote-report.md`'s Table Z row **Z3**, which says
  it *"belongs in its own work package"*. This work package makes the residual
  unreachable **through `config.yaml`** and leaves `isUnder` untouched.
- **Normalising with NFKC, or otherwise refusing Unicode dot look-alikes.**
  `\u2024github` is not a discovery path for any harness; refusing it refuses
  ordinary user content, which row **A10** forbids and rows E4, E8 and E10
  assert against. The class as ruled is U+002E (Table A row **A2**).
- **A third RED proof, a fold mutation, or any other growth of
  `tests/red-proofs/`.** Two declarations, two mutations (Table C).
- **Wiring `npm run red-proofs` into CI.** It is a local gate today and stays
  one.
- **Amending `docs/adr/0010-vault-adoption-paths.md`.** Its sentence about
  targeting *"an arbitrary layout instead of the hardcoded default folder
  names"* describes that the pipeline resolves through `vault_layout` rather
  than through string constants, which stays true; the value rules have always
  lived in `isSafeRelativePath`, and this work package narrows them by one
  clause exactly as the 2026-08-05 ruling's item 3 directed. **Separately
  noted, reported and NOT fixed here:** that ADR also says `adopt` *"requires
  the user to confirm it before writing config"*, which `--yes` has not done
  since it existed. Put it under "Discovered issues".
- **The inherited-`GIT_DIR` / `GIT_OBJECT_DIRECTORY` residual** — disposition
  row D2 (b), owned by Draft `WP-dream-git-env-pinning`, whose product decision
  is still open.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(dream): deny dot-prefixed path segments as a class (WP-dot-segment-denial)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. **"Discovered issues" carries three items this spec already
   found and deliberately did not fix**: the now-constant `admits` branch in the
   edited report-fallback test; the `.`-segment branch of row Z1's filter losing
   its only exercise (Implementation notes); and `docs/adr/0010-vault-adoption-paths.md`
   saying `adopt` *"requires the user to confirm it before writing config"*,
   which `--yes` does not (Out of scope).
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
6. On the flip to `Done`, disposition rows **D1 (b)** and **D5** of
   `docs/specs/logbook/2026-09-02-audit-group-c-disposition.md` have their owner
   satisfied — the closure act itself is that record's Table E row **E2**, taken
   when every successor it names is Done, and is not claimed here.

---

**Round-zero self-check (architect):** run and recorded in
`docs/specs/logbook/2026-09-04-dot-segment-denial-design-gate-rounds.md`.
