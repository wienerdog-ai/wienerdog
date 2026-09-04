---
id: WP-instruction-basename-currency
title: Bring the instruction-basename denial current and give the list a maintenance obligation
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0031, ADR-0036]
epic: audit-close
---

# WP-instruction-basename-currency: a dated inventory, with an obligation, for the instruction-basename denial list

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Dispatch precondition

Two items need an owner ruling before dispatch. Both carry a recommendation;
neither is the architect's to take, because both change what a user observes in
their own vault. The dispatch message records the rulings.

1. **Denying `replit.md` and `AGENT.md` denies two plausible ordinary note
   names.** Every basename in Table A is a documented convention, but two of
   them read like ordinary notes a brain might legitimately write: `replit.md`
   (all-lowercase, the shape of a note *about* Replit) and `AGENT.md`. Denial is
   not silent — the path appears in the dream run's refusals with the reason
   `` `replit.md` is a harness instruction file `` and nothing is written — and
   the repo has already accepted exactly this cost for `claude.md`, where a note
   about Claude collides the same way. **Recommendation: deny all nine, on the
   single inclusion rule (Table A's preamble), because a per-name plausibility
   judgement is the thing that goes stale.** The alternative is to omit those
   two into Table B with the reason recorded, which is a smaller behaviour change
   and a larger residual.
2. **The obligation's owner is a ROLE, not a person.** Table C names *the
   release maintainer — whoever executes `docs/runbooks/release.md`*.
   **Recommendation: keep the role.** A person named in a checked-in runbook goes
   stale on the first handover, and this repo has one maintainer today, so the
   role and the person are the same value with different rot rates. If the owner
   wants a name, Table C's Owner cell is the single place it changes.

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack": an installer that writes configuration files
into a user's Claude Code / Codex CLI setup, plus a nightly **dream run** that
consolidates recent sessions into the user's markdown **vault**. **IRON RULE
(ADR-0004): Wienerdog is just files.** No daemons, no servers, no telemetry, no
background process that outlives its job. This work package installs nothing
that watches, polls or runs.

The dream run writes into a scratch **workspace**, then **promotes** changed
notes into the vault. Promotion is gated by one predicate, `makeAdmit` in
`src/core/dream/promote.js`, whose three clauses are: **(a)** the path is under a
writable tier directory; **(b)** its final component ends in `.md`; **(c)** its
basename is not a current harness instruction-file shape, no segment is
`.claude` or `.codex`, and the basename is not `.mcp.json`. Clause (c) is the
only clause that can reach an instruction file written *inside* an admitted tier
directory — (a) and (b) both pass for `01-Projects/example/GEMINI.md`.

**Why clause (c) exists at all.** The 2026-08-05 audit ruling on threat M7 ("the
brain writes an instruction file; the fence misses it; it is kept and
committed") had two items. Item 1 denied any dot-prefixed path segment, as a
class. Item 2 denied instruction filenames as a **name list**, accepted **with a
named residual** — because no structural marker exists for instruction
filenames, so an enumeration is the only available shape and an enumeration
never closes.

**What this work package is.** The disposition record
`docs/specs/logbook/2026-09-02-audit-group-c-disposition.md`, Table D row D1 (c),
found that the item-2 list is **stale** — a different defect from being a list.
The owner ruled the severity on 2026-09-02 (option (i), QUEUED; primary record
`docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md`, item 3), placing
this work package first in the queue and `WP-dot-segment-denial` immediately
after it. So the deliverable is **a dated inventory plus a standing obligation,
and the source change the inventory drives** — not a longer list, and never a
claim of completeness. The honest shape is "current as of a date".

**Why this is SEPARATE from `WP-dot-segment-denial`.** These are two kinds of
rule and neither reaches the other: a dot-segment rule does not refuse
`01-Projects/example/GEMINI.md` (measured — no dot segment), and a basename list
does not refuse `.husky/pre-commit.md`. A class rule **closes**; an enumeration
**never closes**. Merging them would put an unclosable item inside a closable
work package.

## Current state

Every claim below was re-measured on this branch's base, commit `705ae286`
(`origin/main` after PR #208). The docs-only commits above it touch no file
under `src/`, `tests/` or `scripts/`, so the tree an implementer will find is
the one measured here. Re-run them rather than trusting the sentence; the
round-zero record
(`docs/specs/logbook/2026-09-04-instruction-basename-currency-design-gate-rounds.md`)
carries the commands and their output.

- `src/core/dream/promote.js:96` is one line:
  `const INSTRUCTION_BASENAMES = new Set(['claude.md', 'claude.local.md', 'agents.md', 'agents.override.md']);`
  — **four names**, each already NFC-lowercased. Its JSDoc is `:84-95` and says,
  correctly, that this is a deny-list "stated as one that will NOT cover the next
  convention". **The size of this work package, stated here rather than inside
  Table A:** as of `705ae286`, four of Table A's nine basenames are already
  members (`CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md`) and
  five are the change. That sentence lives in Current state and not in the table
  because the table is copied verbatim into a document that outlives this work
  package, where "five are the change" would be permanently false.
- `src/core/dream/promote.js:99` is `DENIED_SEGMENTS` (two names) and `:102` is
  `DENIED_BASENAME` (`.mcp.json`). **Neither is this work package's** — see
  Out of scope.
- `fold` (`:136-138`) is `s.normalize('NFC').toLowerCase()`, applied to every
  candidate segment by `foldedSegments` (`:149-151`) **before** the Set lookup at
  `:237`. The Set's members are stored already-folded, so **a member added in
  vendor spelling would be unreachable dead code**. Measured: `CLAUDE.MD`,
  `claude.MD` and `ClAuDe.md` are all refused, while `Gemini.md`, `gemini.md` and
  `GEMINI.MD` are all **admitted**.
- Measured through the production predicate with `defaultLayout()`:
  `01-Projects/example/GEMINI.md`, `.../QWEN.md`, `.../WARP.md`, `.../AGENT.md`
  and `.../replit.md` are **ADMITTED**. Row D1 (c) additionally demonstrated the
  production write path: the real `writeIntoVault` with the production `admit`
  **wrote** `01-Projects/example/QWEN.md`.
- Dot-prefixed names that carry **no** `.md` extension are already refused, but
  by **clause (b)**, not by any dot rule. Measured: `.rules`, `.goosehints`,
  `.clinerules`, `.cursorrules`, `.windsurfrules` and `.aider.conf.yml` all
  return ``not admitted: only `.md` content files are promoted``, and so does
  `x.mdc`.
- `promote.js` exports exactly `promote`, `makeAdmit`, `spawnGitForMerge`.
  `INSTRUCTION_BASENAMES` is **not** exported, and this work package does not
  export it.
- `tests/unit/dream-promote.test.js` is the **only** file in `tests/` that
  references `makeAdmit`, and the only place the basename set is pinned. Two
  tests do it: `:295-315` (`M7's mechanism — the current instruction-file
  conventions never enter the vault`) and `:317-327` (`spelling does not decide
  admission — RED side`). Both sit under the section header at `:293`.
- `scripts/red-proofs.js` and `npm run red-proofs` exist (merged in PR #204).
  On this tree the run reports `2 declared proof(s), 2 selected` and `RUN:
  PROVEN`, exit 0, in about 100 s. `npm run red-proofs` is **not** wired into CI.
  **`depends_on` is deliberately empty, and the reason is now the simple one:**
  `docs/specs/done/WP-criterion-red-harness.md:3` reads `status: Done` (flipped
  by PR #207), so there is no open work package to depend on. Measured:
  `scripts/red-proofs.js` and `tests/red-proofs/` are byte-identical between
  `4b06afa0` and `705ae286`, so the runner this spec was drafted against is the
  runner an implementer gets. If a later change moves the declaration schema,
  dispatch-time re-verification is what catches it, and Table D is the one place
  this spec would change.
- `docs/runbooks/release.md` is 13 lines, nine numbered steps, and carries **no**
  re-inventory step. `docs/instruction-file-inventory.md` does not exist.
- **This spec's own path, and why both V3 and V4 accept two of them.** Today the
  live path is the DRAFT one, `docs/specs/WP-instruction-basename-currency.md`;
  `docs/specs/done/WP-instruction-basename-currency.md` does not exist. On the
  flip to `Done` the file moves and the draft path stops existing. Both
  verification steps therefore resolve the spec at **exactly one** of the two and
  fail on zero or both, and the *rendered document* names the `done/` path as its
  regeneration source — that is the one the release maintainer will still find
  when Table C's obligation fires, which is after the flip by construction.
  Round 3 measured the alternative: with only the `done/` file present, the
  previous hardcoded-draft-path form failed `missing input`, and the shipped
  inventory carried a path that had already rotted.
- `npm test` on this tree: 2608 tests, 0 fail, exit 0. `npm run lint`: clean.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself (the status flip), package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | docs/instruction-file-inventory.md | **GENERATED, never written by hand.** It is the canonical rendering block under "Exact contracts" with `@DATE@` substituted, produced by running verification step **V3 with `--write`**. Not one byte of it is the implementer's to compose. **The DENY row shape is load-bearing** — a row starts with `\| DENY \|` and its **second cell** is the basename in backticks — because acceptance criterion 2's test parses exactly that; the shape is fixed in the rendering, so honouring it takes no effort and breaking it is a byte difference V3 catches. **On this work package's flip to Done this file becomes the canonical inventory**, and the rendering block here becomes its record and its regeneration source |
| modify | src/core/dream/promote.js | **ONE executable line and one comment block, nothing else.** `:96` — `INSTRUCTION_BASENAMES` gains the Table A names it lacks, each written **NFC-lowercased** (Table A, "Stored spelling"). **The literal's shape is what criterion 3's check parses**, so it stays a `const INSTRUCTION_BASENAMES = new Set([ … ])` whose members are single-quoted strings; line breaks inside the brackets are fine, a different construction is not. `:84-95` — its JSDoc gains one sentence pointing at `docs/instruction-file-inventory.md` as the canonical inventory and keeps its existing "will NOT cover the next convention" sentence. **This cell owns what stays unchanged in this file:** `DENIED_SEGMENTS` (`:99`), `DENIED_BASENAME` (`:102`), `EXTRA_TIER_DIRS`, `fold` (`:136-138`), `foldedSegments`, `isUnder`, `admittedDirs`, `makeAdmit`'s clause order and every one of its refusal strings, and the module's exports |
| modify | tests/unit/dream-promote.test.js | **THREE sites, all under the row-C9 section header at `:293`.** (a) `:295-315` — the `hostile` fixture gains one tier-local path per newly denied Table A name, so the existing end-to-end test covers them; (b) `:317-327` — the RED-side case list gains one mixed-case spelling of a newly denied name; (c) **NEW tests** implementing acceptance criteria 2, 3 and **7** — criterion 2's derives its subject list from `docs/instruction-file-inventory.md` and fails when zero DENY rows parse, while **criterion 7's carries its expected basenames as a hand-written literal array and asserts set equality against the parse**. One test or two is the implementer's call, but the two expectations may not share an oracle, and the RED-proof declaration names criterion 7's. **This cell owns what stays unchanged:** every other test, every existing title, and the `scenario`/`run`/`refusalFor`/`get` helpers |
| create | tests/red-proofs/instruction-basenames.proofs.json | The RED-proof declaration for **criterion 7**, per **Table D**. Inert JSON, parsed and never executed. `suite` is `tests/unit/dream-promote.test.js`; `file` is `src/core/dream/promote.js` |
| modify | docs/runbooks/release.md | **ONE new numbered step**, inserted so the existing steps renumber consistently. Its body is the canonical sentence pinned between this spec's `BEGIN-CANONICAL-RELEASE-STEP` and `END-CANONICAL-RELEASE-STEP` sentinels, **copied byte for byte** — one line, exactly as that runbook's other steps are written. No other step is reworded |

**NOT a deliverable, stated because it is the trap:** `src/core/layout.js`,
`src/core/dream/vault-write.js`, `scripts/red-proofs.js`, `package.json` and
every CI workflow are **not touched**. In particular `npm run red-proofs` stays
out of CI (Out of scope), so no workflow file changes.

### Exact contracts

**The canonical rendering of `docs/instruction-file-inventory.md`.** The block
below is the WHOLE FILE, byte for byte, with exactly one placeholder: `@DATE@`.
Tables A, B and C live here and nowhere else in this spec — the `## Contract
reference` subsections below describe what each decides and point here for its
text, so there is one authority and nothing to keep in step.

**THE IMPLEMENTER RUNS THE EXTRACTION AND NEVER RETYPES THE BLOCK.** Verification
step V3 carries the extraction verbatim; run it with `--write` to produce the
file, then run it again without `--write` to prove the file is byte-identical to
the rendering. Retyping is how a copy drifts, and the precedent is
`docs/specs/done/WP-show-slot-own-value-kind.md`, whose design gate spent four
rounds on a checker that had to locate a block inside a file before it settled on
extracting the block to its own file and hashing the whole thing.

**The one placeholder, and the agreement rule.** `@DATE@` is substituted
everywhere it appears — the `Current as of` sentence and all nine `Fetched`
cells — with a single date matching `^\d{4}-\d{2}-\d{2}$` that is **not earlier
than `2026-09-04`**, the date this spec's citations were read. One date and not
ten because Table C obliges **one re-fetch pass**: a row whose citation was
confirmed in that pass carries the pass's date, and a row that could not be
confirmed is not refreshed silently — it is changed, which changes the rendering
block. There is therefore nothing to reconcile between the header date and the
cells, and no second placeholder to validate.

The two sentinel comments are part of this spec, not of the rendered file. The
extraction takes the lines strictly between them, minus the fence lines, and
fails loudly if either sentinel is missing, duplicated, or not followed/preceded
by its fence.

<!-- BEGIN-CANONICAL-INVENTORY -->
```markdown
# Instruction-file inventory

**Current as of @DATE@. This document is a dated inventory, never a complete
list** — an enumeration of instruction filenames cannot close, because no
structural marker distinguishes one. A tool whose instruction file is
undocumented, or whose filename the user configured, is not covered here and is
the accepted residual of the 2026-08-05 audit ruling on threat M7.

This inventory is the canonical source for `INSTRUCTION_BASENAMES` in
`src/core/dream/promote.js`: every DENY row below is a name the dream run
refuses to promote into the vault, at any depth and in any case.

**This file is GENERATED and is never edited by hand.** It is the canonical
rendering block of `docs/specs/done/WP-instruction-basename-currency.md` with a
single date substituted into its date placeholders. To change it, change that
block and re-render — never this file.

## Table A — denied basenames

**Inclusion rule** (the single place it is decided): a basename is DENY when
current vendor documentation establishes it as an instruction-file discovery
path at a **plain, dot-free, project-relative location**. That rule and nothing
else — no per-name judgement about how ordinary the name looks, because that
judgement is what goes stale. **Every citation below was fetched and read on the date at the top of this
document, and returned HTTP 200 on that date.** One re-fetch pass, one date:
every `Fetched` cell carries the `Current as of` date and no other, which is
what makes this whole document a function of exactly one placeholder.
**Stored spelling** is what goes into `INSTRUCTION_BASENAMES` in
`src/core/dream/promote.js`: NFC-lowercased, because that module folds a
candidate's basename before looking it up, so a member in vendor spelling would
be unreachable.

| Disposition | Basename | Stored spelling | Convention it is | Citation | Fetched |
|---|---|---|---|---|---|
| DENY | `CLAUDE.md` | `claude.md` | Claude Code project instructions, `./CLAUDE.md` | https://code.claude.com/docs/en/memory | @DATE@ |
| DENY | `CLAUDE.local.md` | `claude.local.md` | Claude Code local instructions, `./CLAUDE.local.md`; documented, not deprecated | https://code.claude.com/docs/en/memory | @DATE@ |
| DENY | `AGENTS.md` | `agents.md` | the AGENTS.md open format, repository root; read by Codex CLI, Warp, Zed, opencode, Copilot, Cursor, Cline, Roo Code, Junie, Kiro, Goose and OpenHands | https://agents.md/ · https://learn.chatgpt.com/docs/agent-configuration/agents-md · https://opencode.ai/docs/rules/ | @DATE@ |
| DENY | `AGENTS.override.md` | `agents.override.md` | Codex CLI's per-directory override, checked ahead of `AGENTS.md` in each directory from the project root down | https://learn.chatgpt.com/docs/agent-configuration/agents-md | @DATE@ |
| DENY | `AGENT.md` | `agent.md` | Zed's project-instruction list, position 6; Roo Code's workspace-root fallback when `AGENTS.md` is absent | https://zed.dev/docs/ai/instructions · https://roocodeinc.github.io/Roo-Code/features/custom-instructions/ | @DATE@ |
| DENY | `GEMINI.md` | `gemini.md` | Gemini CLI's default context file, searched from the working directory up to the project root; Zed's list, position 9 | https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md | @DATE@ |
| DENY | `QWEN.md` | `qwen.md` | Qwen Code's default context file, project root | https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/memory.md | @DATE@ |
| DENY | `WARP.md` | `warp.md` | Warp project rules; still fully supported and takes priority over `AGENTS.md` in the same directory | https://docs.warp.dev/knowledge-and-collaboration/rules | @DATE@ |
| DENY | `replit.md` | `replit.md` | Replit Agent's project context file, which must sit at the project root | https://docs.replit.com/features/project-setup/replit-dot-md | @DATE@ |

## Table B — accepted omissions and handoffs

Everything found in the same sweep as Table A and deliberately **not** denied by
basename, with the reason.

**A `HANDOFF` row is ASSIGNED to `WP-dot-segment-denial`, the work package that
owns the class rule against dot-prefixed path segments. It is not protected by
that rule until that work package lands** — assignment is not coverage, and this
inventory claims none. The fifth column says what refuses the row **independently
of that class rule**: the `.claude` / `.codex` members of the promotion
allowlist's `DENIED_SEGMENTS`, the allowlist's `.md`-only extension rule, or a
basename that is already in Table A. Where that column reads `none`, every
documented path in the row is **admitted** by the promotion allowlist and stays
so until the class rule lands.

An `OMIT` row is assigned to nobody and is a stated non-denial.

| Disposition | Path(s) as documented | Tool | Reason it is not in Table A | Refused independently of the dot-segment rule | Citation |
|---|---|---|---|---|---|
| HANDOFF | `.github/copilot-instructions.md`, `.github/instructions/NAME.instructions.md` | GitHub Copilot | dot-prefixed segment | none — every documented path is admitted; assigned wholly to `WP-dot-segment-denial` | https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions |
| HANDOFF | `.cursor/rules/*.mdc`, `.cursorrules` | Cursor | dot-prefixed; `.mdc` also fails the `.md`-only extension rule | all paths — the `.md`-only extension rule | https://cursor.com/docs/rules |
| HANDOFF | `.windsurfrules`, `.windsurf/rules/`, `.devin/rules/` | Windsurf (now Devin Desktop) | dot-prefixed; `.windsurfrules` also fails the `.md`-only extension rule | `.windsurfrules` only — the `.md`-only extension rule; the two directory paths are assigned to `WP-dot-segment-denial` | https://docs.devin.ai/desktop/cascade/agents-md |
| HANDOFF | `.clinerules/` | Cline | dot-prefixed | none — every documented path is admitted; assigned wholly to `WP-dot-segment-denial` | https://docs.cline.bot/customization/cline-rules |
| HANDOFF | `.roo/rules/`, `.roorules` | Roo Code | dot-prefixed | `.roorules` only — the `.md`-only extension rule; `.roo/rules/` is assigned to `WP-dot-segment-denial` | https://roocodeinc.github.io/Roo-Code/features/custom-instructions/ |
| HANDOFF | `.continue/rules/` | Continue | dot-prefixed | none — every documented path is admitted; assigned wholly to `WP-dot-segment-denial` | https://docs.continue.dev/customize/deep-dives/rules |
| HANDOFF | `.junie/AGENTS.md`, `.junie/playbook.md`, `.junie/rules/`, `.junie/guidelines.md` | JetBrains Junie | dot-prefixed; its bare form is `AGENTS.md`, already Table A | `.junie/AGENTS.md` only — its basename is already a Table A row; the other three paths are assigned to `WP-dot-segment-denial` | https://junie.jetbrains.com/docs/guidelines-and-memory.html |
| HANDOFF | `.kiro/steering/` | AWS Kiro | dot-prefixed; its bare form is `AGENTS.md`, already Table A | none — every documented path is admitted; assigned wholly to `WP-dot-segment-denial` | https://kiro.dev/docs/steering/ |
| HANDOFF | `.amazonq/rules/**/*.md` | Amazon Q Developer | dot-prefixed | none — every documented path is admitted; assigned wholly to `WP-dot-segment-denial` | https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/context-project-rules.html |
| HANDOFF | `.trae/rules/` | Trae | dot-prefixed; file names inside it are arbitrary | none — every documented path is admitted; assigned wholly to `WP-dot-segment-denial` | https://docs.trae.ai/ide/rules |
| HANDOFF | `.openhands/microagents/`, `.openhands/skills/`, `.agents/skills/NAME/SKILL.md` | OpenHands | dot-prefixed; its current bare form is `AGENTS.md`, already Table A | none — every documented path is admitted; assigned wholly to `WP-dot-segment-denial` | https://docs.openhands.dev/overview/skills/repo |
| HANDOFF | `.qwen/QWEN.local.md` | Qwen Code | dot-prefixed | none — every documented path is admitted; assigned wholly to `WP-dot-segment-denial` | https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/memory.md |
| HANDOFF | `.claude/CLAUDE.md`, `.claude/rules/` | Claude Code | dot-prefixed — **and already refused independently** by `promote.js`'s `DENIED_SEGMENTS` member `.claude` | all paths — the `.claude` member of `DENIED_SEGMENTS` | https://code.claude.com/docs/en/memory |
| HANDOFF | `.codex/AGENTS.md`, `.codex/AGENTS.override.md` | Codex CLI | dot-prefixed — **and already refused independently** by `promote.js`'s `DENIED_SEGMENTS` member `.codex` | all paths — the `.codex` member of `DENIED_SEGMENTS` | https://learn.chatgpt.com/docs/agent-configuration/agents-md |
| HANDOFF | `.rules` | Zed | dot-prefixed leading-dot filename; also fails the `.md`-only extension rule | the `.md`-only extension rule | https://zed.dev/docs/ai/instructions |
| HANDOFF | `.goosehints` | Goose | dot-prefixed leading-dot filename; also fails the `.md`-only extension rule. **Its disposition does not rest on a citation:** the vendor page is a client-rendered SPA that returned HTTP 404 to a plain fetch on 2026-09-04, and the two structural reasons hold regardless | the `.md`-only extension rule | — (no live citation; see reason) |
| HANDOFF | `.aider.conf.yml` | Aider | dot-prefixed; also fails the `.md`-only extension rule | the `.md`-only extension rule | https://aider.chat/docs/config/aider_conf.html |
| OMIT | `copilot-instructions.md` (bare) | GitHub Copilot | **not a documented discovery path.** GitHub documents the file only under `.github/`; a bare tier-local one is an ordinary note, and denying it would deny legitimate notes | none — an ordinary note, deliberately admitted | https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions |
| OMIT | `rules.md` (bare) | Cursor | merely the basename of a path inside `.cursor/`; not a convention on its own | none — an ordinary note, deliberately admitted | https://cursor.com/docs/rules |
| OMIT | `CONVENTIONS.md` | Aider | **Aider documents no fixed filename.** `CONVENTIONS.md` appears as a documentation *example*; the real mechanism is `.aider.conf.yml`'s `read:` key, which takes any user-chosen path | none — an ordinary note, deliberately admitted | https://aider.chat/docs/usage/conventions.html |
| OMIT | `project_rules.md` | Trae | not documented. Trae's current docs establish the `.trae/rules/` directory with arbitrarily named `*.md` files inside it | none — an ordinary note, deliberately admitted | https://docs.trae.ai/ide/rules |
| OMIT | `AmazonQ.md` | Amazon Q Developer | not documented. The AWS page establishes `.amazonq/rules/` only | none — an ordinary note, deliberately admitted | https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/context-project-rules.html |
| OMIT | `SKILL.md`, `LEARNINGS.md` | Wienerdog itself | **deliberately never denied.** These are Wienerdog's own vault artifacts (ADR-0020) and `promote.js:111-116` names them; denying `SKILL.md` would break the shipped skill-plus-ledger atomic promotion. OpenHands' use of the name is at `.agents/skills/NAME/SKILL.md`, a dot path | none — deliberately admitted; the shipped skill-plus-ledger promotion depends on it | `src/core/dream/promote.js:111-116` |
| OMIT | user-configured names — Gemini CLI and Qwen Code `context.fileName`; Codex CLI `project_doc_fallback_filenames` (documented example: `TEAM_GUIDE.md`); Goose `CONTEXT_FILE_NAMES` | several | **THIS IS THE NAMED RESIDUAL.** The name space is unbounded and user-chosen, so no inventory can cover it. This is the residual the 2026-08-05 ruling accepted, restated rather than reopened | none — unbounded and user-chosen; the named residual | https://learn.chatgpt.com/docs/agent-configuration/agents-md · https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md |

## Table C — how this stays current

| Fact | Value |
|---|---|
| Owner | **the release maintainer** — whoever executes `docs/runbooks/release.md`. Deliberately a role, not a person: a name in a checked-in runbook goes stale on the first handover. If a person is wanted instead, this cell is the one place that changes |
| Trigger | **every MINOR version bump** — a `package.json` version going `0.x.y` → `0.(x+1).0`. Objective and observable in the diff; patch releases are not triggered |
| Where the obligation is recorded | **exactly one numbered step** in `docs/runbooks/release.md`, whose body is the canonical sentence named in the next row. Exactly one; zero and two both fail. **Nothing else about that step is checked or constrained** |
| The step's canonical text | **pinned verbatim** in `docs/specs/WP-instruction-basename-currency.md`, between its `BEGIN-CANONICAL-RELEASE-STEP` and `END-CANONICAL-RELEASE-STEP` sentinels (after this work package is Done, under `docs/specs/done/`). **The obligation IS that sentence, byte for byte.** A check that looked for tokens instead accepted a step negating every one of them, so the contract is the bytes and negation is impossible without changing them |
| What the step obliges | exactly what the canonical sentence says: re-fetch every citation in this inventory, add any newly documented plain-path convention, and **re-render this document from the spec's canonical block** with the pass's date. **If the set of denied basenames changed, `INSTRUCTION_BASENAMES` in `src/core/dream/promote.js` and its tests change in the same pull request** — a docs-only refresh would recreate exactly the defect this inventory was created to close |
| What it is NOT | nothing scheduled, nothing that watches, polls or runs; no CI step, no hook, no job. **ADR-0004** — it is a line in a runbook a human follows |
| The failure it accepts, stated | a release cut without performing the step leaves the inventory stale and nothing detects it. That is the cost of a human obligation, and it is chosen over machinery on ADR-0004 |
```
<!-- END-CANONICAL-INVENTORY -->

**The canonical release-runbook step.** The block below is the BODY of the one
numbered step `docs/runbooks/release.md` must carry — everything after its
its number and the space after it number, on one line, as that runbook's other steps are written. **The
obligation is these bytes, not a set of words in them:** round 2 executed a step
carrying every required token and negating every one of them, and the check said
OK. V4 asserts that exactly one numbered line of the runbook has this body, and
asserts nothing else, so a negation is unconstructible without changing the
pinned text. Same extraction as the rendering above, same two-sentinel shape.

<!-- BEGIN-CANONICAL-RELEASE-STEP -->
```text
**Re-inventory the instruction filenames — MINOR releases only.** On every MINOR version bump the release maintainer MUST re-fetch every citation in `docs/instruction-file-inventory.md`, add any newly documented plain-path convention, and re-render that document from the canonical block in `docs/specs/done/WP-instruction-basename-currency.md` with the date of this pass. If the set of denied basenames changed, `INSTRUCTION_BASENAMES` in `src/core/dream/promote.js` and its tests MUST be updated in the same pull request.
```
<!-- END-CANONICAL-RELEASE-STEP -->

**The refusal string is unchanged.** A newly denied basename is refused with the
existing message the `INSTRUCTION_BASENAMES` branch already emits
(`promote.js:238`), which interpolates the folded basename:

```text
not admitted: `gemini.md` is a harness instruction file
```

No new reason string, no new refusal shape, no change to `makeAdmit`'s return
type.

## Contract reference

Activation (ADR-0031, 2-of-7): **(vi)** `WP-dot-segment-denial` inherits the
boundary this spec draws, and the standing obligation has every future release as
its consumer; **(vii)** the same denial set appears in the inventory document,
in `promote.js`, in its JSDoc, in the tests, in the RED-proof declaration and in
the release runbook — six mirrored surfaces.

### Table A — the dated inventory of denied basenames (pointer)

**Canonical text: the `## Table A — denied basenames` section of the rendering
block above.** It is not restated here, and this subsection decides nothing the
block does not carry.

What Table A is: the dated inventory of basenames the promotion allowlist
refuses, one row per documented convention, with the vendor-documentation URL
that establishes it and the date that URL was read. Its **inclusion rule** and
its **Stored spelling** column are stated in the block's own preamble, which is
part of the shipped file.

Spec-side commentary, outside the rendering and therefore outside the file:

**THE COPY BOUNDARY IS GONE, and its deletion is the round-2 design change.**
There is no boundary to state, because there is no region to locate: the whole
file is one span, rendered from one block. Rounds 1 and 2 each broke a check that
had to *find* the right part of the shipped document — regions, headings, final
cells, step tokens — and the runbook's same-kind rule says the third repair is a
design change, not a fourth patch. So nothing is copied and nothing is compared
piecewise; V3 re-renders the file and compares every byte. What follows is
spec-side commentary, which lives outside the rendering block and therefore
outside the file by construction rather than by rule: how many of these rows are
new *today* is a fact about this work package, not about the inventory, and is
stated in Current state instead.

### Table B — accepted omissions and handoffs (pointer)

**Canonical text: the `## Table B — accepted omissions and handoffs` section of
the rendering block above.** Not restated here.

What Table B is: everything the same sweep found and this work package
deliberately does **not** deny by basename, each with its reason, its assignment
(`HANDOFF` rows go to `WP-dot-segment-denial`; `OMIT` rows go to nobody) and a
measured fifth column saying what refuses the row **independently** of the
dot-segment class rule.

Spec-side commentary, outside the rendering and therefore outside the file:

**Twenty-four rows: seventeen HANDOFF, seven OMIT** — a spec-side count, outside
the rendering block. **Every value in the fifth column was measured through the
production predicate**, path by path, not inferred from the row's shape; the run
is in the round-1 record. It is a column of *mechanisms*, not of states, so it
stays true after `WP-dot-segment-denial` lands: what changes then is that the
`none` rows acquire a second refusing rule, not that any cell becomes false.
**Measured: eight of the seventeen HANDOFF rows read `none`, three more are only
partly covered (`.windsurfrules`, `.roorules`, `.junie/AGENTS.md` alone), and six
are fully refused already.** That eleven-row gap is the residual this work package
hands on and does not close.

### Table C — the standing maintenance obligation (pointer)

**Canonical text: the `## Table C — how this stays current` section of the
rendering block above.** Not restated here.

What Table C is: the standing maintenance obligation — its owner, its objective
trigger, the one runbook step that records it, **the exact sentence that step
must contain** (the row `The step's canonical text`), what the step obliges, what
it is not, and the failure it accepts. ADR-0004 bounds it: a line in a runbook a
human follows, nothing that watches, polls or runs.

### Table D — the required RED proof (one row, one mutation; ADR-0036)

One declaration in `tests/red-proofs/instruction-basenames.proofs.json`. The
`find` / `replace` / `marker` / `expectRed` values are the implementer's to
author against the finished file; this row decides what the mutation **is**.

| id | wp / criterion | mechanism — TRIGGER and PATCH | what must redden, and how the row is verified |
|---|---|---|---|
| `instruction-basenames-reverted` | `WP-instruction-basename-currency` / criterion `7` | **TRIGGER: none — the patched constant is on the ordinary path.** The new test calls `makeAdmit` directly, so nothing has to be injected to reach the Set lookup at `promote.js:237`; the exemption's measurement is the APPLY-phase run itself, which must show the marker present and the named assertions failing. **PATCH: the `const INSTRUCTION_BASENAMES = new Set([...])` declaration is reverted to the four names shipped at `705ae286`** — `claude.md`, `claude.local.md`, `agents.md`, `agents.override.md`. The seam is named structurally, by that declaration, never by a line number (ADR-0036 A2). **Which assertion the patch reddens: criterion 7's half (b)**, the reachability half — each literal name must reach denial through `makeAdmit`, and five of them stop doing so. Half (a), the set-equality half, is untouched by the patch and is the half that fails at BASELINE on a shrunken tree | **`expectRed` MUST name the criterion-7 test — the one whose expected basenames are a literal in the test file — and not only the criterion-2 test that parses the inventory.** The reason is the round-1 [A] finding: on a tree where the shipped inventory, the constant and the fixtures were all shrunk together, a proof aimed at the parse-derived test still goes red (eight names against four) and reports `PROVEN` while the defect stands; a proof aimed at the literal set instead fails at **BASELINE**, because that test is already red on the unmutated shrunken tree — so `npm run red-proofs` reports non-`PROVEN` and the subset is caught by the RED machinery rather than hidden by it. Beyond that: every own-body terminal failure the revert causes must appear in `expectRed`, or the proof is `FAILED` — **and the revert reddens the two extended existing tests as well as the new ones**, so either all of them are declared or the declaration carries a `testNamePattern` scoping the run. Both are legal; the choice goes in the pull request under "Decisions made". **One mutation, one independently revertible change** (ADR-0036 A3): reverting the Set neither requires nor implies any other edit |

### Mirrored Surface Checklist

**THE CANONICAL RENDERING BLOCK IS THE SINGLE SURFACE FOR TABLES A, B AND C.**
They exist nowhere else in this spec; the three `### Table …` subsections below
are pointers that decide nothing. So the classic mirror problem does not arise
for their content — there is one copy, and the shipped document is a byte
function of it. What remains registered is the small set of surfaces that
describe the *mechanism*: the Deliverables cell for
`docs/instruction-file-inventory.md`, the "Exact contracts" prose around the two
sentinel blocks, acceptance criteria **1** and **4**, and verification steps
**V3** and **V4**. A change to how the file or the runbook step is produced moves
all of them in one pass. **Registered at round 2**, replacing the copy-boundary
entry: rounds 1 and 2 each broke a check that had to locate part of the shipped
artifact, so the boundary was deleted rather than described again.

**Table A** (the denial set):

- [ ] Deliverables cells for `docs/instruction-file-inventory.md` (generated, never typed), `src/core/dream/promote.js` (the stored spelling and the literal's shape) and `tests/unit/dream-promote.test.js` (all three sites)
- [ ] Acceptance criteria **1, 2, 3, 7** and verification **V1**, **V2** and **V3**. **Criterion 7 is the independent oracle and V3 is the fidelity oracle**; criteria 2 and 3 take the shipped document as theirs, so all four move together and a change to Table A must reach criterion 7's hand-written literal in the same pass
- [ ] Current state — the measured admits and the `fold` paragraph
- [ ] `src/core/dream/promote.js:84-95` — the JSDoc, which after this work package points at the inventory rather than restating the list
- [ ] Table D's PATCH cell, which names the four-name baseline
- [ ] **Table B is a registered mirror in the negative:** its complement is Table A, so moving a name between them is one pass, not two

**Table B** (the omissions):

- [ ] The Out of scope section, which cites it for the dot-segment boundary
- [ ] Current state's clause-(b) measurement (`.rules`, `.goosehints`, `.mdc`, …) — the evidence behind **Table B's preamble**, which is where the `.md`-only extension reason is now stated once for every row that names it
- [ ] The inventory document's **opening paragraph**, which states the residual Table B's last row decides
- [ ] **The fifth column, `Refused independently of the dot-segment rule`** — measured per row through the production predicate, and the surface that stops the preamble from overstating coverage. It moves with Table B's preamble and with Table B's trailing count of `none` rows
- [ ] Acceptance criterion **1** and verification **V3**, which compare the whole shipped file against this block
- [ ] `docs/specs/WP-dot-segment-denial.md` — **a NON-move.** That spec's own required verification owns the class predicate; this work package hands it rows and changes none of its text

**Table C** (the obligation):

- [ ] The Deliverables cell for `docs/runbooks/release.md`
- [ ] Acceptance criterion **4** and verification **V4**, plus **Table C's `The step's canonical text` row** and the sentinel-pinned sentence it names, which is what V4 asserts
- [ ] The inventory document's `## Table C — how this stays current` section, which **is** Table C — the same bytes, rendered — and which **V3** compares as part of the whole file

**Table D** (the RED proof):

- [ ] The Deliverables cell for `tests/red-proofs/instruction-basenames.proofs.json`
- [ ] Acceptance criterion **5** and verification **V5**

## Implementation notes & constraints

- **No new npm dependencies.** Plain Node ≥ 18, no TypeScript, no build step.
- **The stored spelling is the trap, and it is silent.** `INSTRUCTION_BASENAMES`
  is consulted with an already-folded basename (`promote.js:237` on the value
  from `foldedSegments`). A member written as `'GEMINI.md'` is unreachable dead
  code that no test would notice unless it asserts on the name it added.
  Criterion 3 exists for exactly this: it rejects any member that is not equal to
  its own `NFC`-lowercased form.
- **Re-confirm every citation before writing the file.** A stale citation repeats
  the defect being fixed. If a re-fetch contradicts a Table A row: update the
  row, update the code and tests to match, and record it under "Decisions made".
  If it would **add** a name, that is in scope — the inventory is the boundary,
  not this spec's row count. If it would **remove** a name, leave the name denied
  and record the finding; loosening a denial is a behaviour change this work
  package does not make.
- **Discovered issue to REPORT, not fix.** The existing assertion at
  `tests/unit/dream-promote.test.js:325-326` builds `nfd` as
  `'AGENTS.override.md'.normalize('NFD')`. Measured: that string is pure ASCII,
  so `NFD` is the identity and the assertion is vacuous — it re-tests the
  composed spelling. Do **not** repair it here; note it under "Discovered issues"
  in the pull request. For the same reason the new test's spelling set is
  **case** variants only: adding an `NFD` case over ASCII names would be a second
  vacuous check.
- **The completeness argument for criterion 3, so a reviewer can re-derive it.**
  Criterion 2 shows every inventory name is refused with the reason
  `is a harness instruction file`, which only the `INSTRUCTION_BASENAMES` branch
  emits — so inventory ⊆ code. Criterion 3 shows the two have equal size.
  Together they force set equality, which is why no third check enumerates the
  code side.
- **`npm run red-proofs` must be run UNFILTERED.** Measured in `scripts/red-proofs.js`
  (`rollUp`, `:2127-2167`): a `--wp` or `--proof` filter leaves every other
  declaration's `(wp, criterion)` pair unselected, which the roll-up reports as
  `FILTERED` and the run exits non-zero. A filtered run is not evidence of
  failure — it is evidence of a filter.
- **`--write` silently overwrites an existing, different `docs/instruction-file-inventory.md`,
  and that is ACCEPTED, not an oversight.** The plugin channel executed it in
  round 3 and did not count it as a finding, for the reason recorded here so no
  later reviewer re-raises it: the file's contract is *generated, never edited by
  hand*, so there is no hand-authored state for an overwrite to destroy, and a
  refuse-if-exists flag would only add a step between the implementer and the
  one correct byte sequence. If the file on disk differs from the rendering, the
  right outcome is to replace it, which is exactly what happens.
- **Ambiguity → choose the simpler option** and record it under "Decisions made".
  Do not expand scope to resolve it.

## Security checklist

- [ ] **The anchored-pattern rule does not apply, and here is why.** No
      identifier introduced by this work package flows into a filesystem path or
      a shell command. The change adds string members to a `Set` that is compared
      against an already-folded path segment; `makeAdmit` builds no path, spawns
      nothing, and its inputs are the same `rel` values it receives today. The
      untrusted input on this path — the brain-authored relative path — is
      validated by the vault-write primitive, whose **Table H row H1** is owned
      by `docs/specs/done/WP-dream-vault-write-primitive.md:213` (Table H's
      header is at `:209`; `WP-dream-promote-in-workspace.md:83` only cites it).
      That row segment-validates `rel` and then calls `admit` with the RESOLVED
      path. This work package neither weakens nor duplicates it, and the change
      can only ever **refuse** more, never admit more.

## Acceptance criteria

- [ ] **1. THE SHIPPED FILE IS THE RENDERING, BYTE FOR BYTE.**
      `docs/instruction-file-inventory.md` equals the canonical rendering block
      of this spec with `@DATE@` substituted by **one** date matching
      `^\d{4}-\d{2}-\d{2}$` that is not earlier than `2026-09-04`. **There is no
      other permitted difference** — not a heading, not a paragraph, not a cell,
      not a line ending, not a trailing byte. **The file is PRODUCED by running
      V3 with `--write` and is never retyped**, and V3 without `--write` proves
      it. Nothing is located inside the document, so this criterion has no
      structure a wrong document can satisfy: rounds 1 and 2 each defeated a
      check that had to find the right part of it, and the third repair deletes
      the finding rather than improving it.
      **The comparison's INPUTS are validated too, which is what round 3 added.**
      Exactly one non-flag argument; the date is a real calendar date (UTC
      round-trip, so `2026-99-99` fails); the payload carries **no fence
      delimiter line**; and every `@DATE@` site is structurally accounted for —
      **one `Current as of` line plus one per DENY row, ten today, and no
      other** — so a block with its dates hardcoded, or with one `Fetched` cell
      left at an older date, fails before anything is rendered. The spec is
      resolved at **exactly one** of `docs/specs/WP-instruction-basename-currency.md`
      and `docs/specs/done/WP-instruction-basename-currency.md`; zero or both is
      a failure, so the command survives this spec's own status flip.
- [ ] **2.** Every basename the inventory marks `DENY` is refused with a reason
      containing `is a harness instruction file` at each of the three tier-local
      depths `06-Identity/`, `01-Projects/example/`, `02-Areas/x/y/`, in every
      **distinct** spelling among {as written, lowercased, uppercased,
      alternating case} — distinct, because an all-lowercase name such as
      `replit.md` yields three, not four; and is refused by *something* at the
      vault root, which is clause (a)'s job. The assertion **derives its name
      list from the inventory document** and fails when zero DENY rows parse.
      **This criterion's oracle is the shipped document, which is why it cannot
      stand alone — criterion 7 is its independent half.**
- [ ] **3.** `INSTRUCTION_BASENAMES` holds exactly as many names as the inventory
      has DENY rows, and every member equals its own `NFC`-lowercased form.
      **Same oracle as criterion 2, therefore the same limitation** — the two
      shrink together, and criterion 7 is what does not.
- [ ] **4. THE OBLIGATION IS A SENTENCE, BYTE FOR BYTE.**
      `docs/runbooks/release.md` has **exactly one** numbered line whose body —
      everything after its its number and the space after it — equals the canonical release step pinned
      between this spec's `BEGIN-CANONICAL-RELEASE-STEP` and
      `END-CANONICAL-RELEASE-STEP` sentinels. Zero and two both fail, and an
      unnumbered occurrence does not count, and **neither does an occurrence
      inside a fenced code block** — round 3 passed a runbook that was nothing
      but a ```` ```text ```` example containing `7. <the sentence>`, so fence
      state is tracked and lines inside a fence are never candidates. **Nothing
      else about the runbook is checked or constrained**, and deliberately so: a
      whole-runbook base-plus-insertion pin would rot the moment any other
      release step changes. Round 2 executed the previous token check against a
      step that carried every required token and negated every one of them, and
      it passed; a negation of these bytes is not constructible.
- [ ] **5.** `npm run red-proofs`, unfiltered, reports `3 declared proof(s), 3
      selected`, a `PROVEN` roll-up line for
      `WP-instruction-basename-currency criterion 7`, `RUN: PROVEN`, and exits 0.
      **Criterion 7 and not criterion 2, deliberately** — Table D's last cell
      gives the reason: aimed at criterion 2's parse-derived test the proof goes
      green on a consistently shrunken tree, aimed at criterion 7's literal set
      it fails at BASELINE there instead.
- [ ] **6.** Idempotence — `N/A` — this work package ships no command and writes
      nothing outside the repository; it changes one constant, one JSDoc block,
      one runbook step, one new document and their tests.
- [ ] **7. THE INDEPENDENT ORACLE — the one assertion that does not read the
      shipped inventory.** A test in `tests/unit/dream-promote.test.js` carries
      the expected DENY basenames as a **literal array written by hand in the
      test file**, and asserts (a) that the set parsed out of
      `docs/instruction-file-inventory.md` is exactly equal to it — same members,
      no duplicates, no extras, no omissions — and (b) that each of those names
      reaches denial through `makeAdmit`. **As of 2026-09-04 that literal holds
      the nine names of Table A**; if a re-fetch legitimately adds one, this
      literal, the spec's Table A and the shipped document move together in one
      pass and the pull request says so under "Decisions made". **Why it is
      written by hand and not derived:** criteria 2 and 3 both take the shipped
      document as their oracle, so an omission propagated to the document, the
      constant and the fixtures passes all of them;       a hand-written expected set
      is the only surface in this work package a consistent omission does not
      also shrink. Round 1's [A] finding, both channels.
      **THE ANCHORING CHAIN, stated explicitly because round 2 asked for it.**
      The literal lives in `tests/unit/dream-promote.test.js`, a file the
      implementer edits for other reasons in this same work package — so it is
      not shrink-proof by isolation. It is shrink-proof by **anchoring**: the
      literal must equal the DENY basenames of the shipped document (criterion
      7's half (a)); the shipped document must equal this spec's canonical
      rendering byte for byte (criterion 1, proved by V3); and the canonical
      rendering is spec text, which the Deliverables table lets the implementer
      touch only to flip `status:`. Shrinking every mirror therefore requires
      editing the canonical rendering itself — an explicit contract change,
      visible as such in the diff, and not the accident this criterion exists to
      catch. Both round-2 channels reached the same conclusion and declined to
      count that contract-tampering case as a separate finding.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — criteria 2, 3 and 7. The new tests carry all three, and criterion 7 is
# the one whose expected set is a hand-written literal rather than a parse of
# the shipped document. The guard names the DELIVERABLE-ABSENT state directly
# instead of surfacing it as a readFileSync throw from inside the suite, and the
# count is the number V2 must agree with. Criterion 1 is NOT carried here — it
# is V3's, and rounds 1 and 2 each found a way past the checks that tried.
test -f docs/instruction-file-inventory.md || { echo "MISSING DELIVERABLE: docs/instruction-file-inventory.md"; exit 1; }
grep -c '^| DENY |' docs/instruction-file-inventory.md
npm test

# V2 — criterion 3's mechanical half, run outside the suite so a reviewer can
# re-derive it without reading test code. FOUR failure modes, all discriminating
# and all observed at round zero: an ABSENT input file, a literal that is not
# where the parser looks, a name that is not pre-folded, and a count mismatch.
# The existence checks are what stop mode 1 from arriving as an uncaught ENOENT
# stack trace, which reads as infrastructure breakage rather than as a verdict.
node -e "
const fs=require('fs');
for(const f of ['src/core/dream/promote.js','docs/instruction-file-inventory.md'])
  if(!fs.existsSync(f)){console.error('FAIL: missing input '+f);process.exit(1);}
const src=fs.readFileSync('src/core/dream/promote.js','utf8');
const m=src.match(/const INSTRUCTION_BASENAMES = new Set\(\[([\s\S]*?)\]\)/);
if(!m){console.error('FAIL: the INSTRUCTION_BASENAMES literal was not found in its expected form');process.exit(1);}
const code=(m[1].match(/'[^']+'/g)||[]).map((s)=>s.slice(1,-1));
const doc=fs.readFileSync('docs/instruction-file-inventory.md','utf8');
const inv=doc.split('\n').filter((l)=>l.startsWith('| DENY |'))
  .map((l)=>l.split('|')[2].trim().replace(/[^A-Za-z0-9._-]/g,''));
const unfolded=code.filter((c)=>c!==c.normalize('NFC').toLowerCase());
if(unfolded.length){console.error('FAIL: not pre-folded, so unreachable: '+unfolded.join(', '));process.exit(1);}
if(code.length!==inv.length){console.error('FAIL: INSTRUCTION_BASENAMES has '+code.length+' names, the inventory has '+inv.length+' DENY rows');process.exit(1);}
console.log('V2 OK: '+code.length+' names in INSTRUCTION_BASENAMES = '+inv.length+' DENY rows, all pre-folded');
"

# V3 — criterion 1. THE WHOLE FILE, NOT A REGION. Extracts the canonical
# rendering block from the spec between its two sentinels, substitutes the one
# @DATE@ placeholder, and compares EVERY BYTE against the shipped document.
# Nothing is located inside the document, so nothing about the document can be
# located wrongly: no headings, no regions, no final cells, no duplicate scan.
# Round 2 killed all four of those by executing the old region compare against a
# document that had no H1, no "Current as of" line and NOT-A-DATE in every
# Fetched cell — and got exit 0. This form cannot: a missing opening paragraph is
# a byte difference like any other.
#
# ROUND 3 added the INPUT validation this had none of, because a byte compare is
# only as good as the two things it compares. Four gates, each one a mutant both
# channels executed green: exactly ONE non-flag argument (two dates silently
# ignored the second); a REAL CALENDAR DATE by UTC round-trip (2026-99-99 passed
# the shape test); the payload carries NO fence delimiter (an interior ``` line
# rendered and was approved, producing malformed markdown); and the placeholder
# sites are STRUCTURALLY ACCOUNTED FOR — one Current-as-of line plus one per DENY
# row, ten today, and no other site — which is what a block with its dates
# hardcoded (zero placeholders) and a block with one Fetched cell left at an old
# date both failed to satisfy. The spec is resolved at exactly one of its draft
# and done/ paths, so the command keeps working after the status flip.
#
# The SAME command with --write is how the implementer PRODUCES the file. Run it
# once with --write, then once without, and paste both. Never retype the block.
#   node -e "<the script below>" 2026-09-15 --write
node -e "
const fs=require('fs');
const DOC='docs/instruction-file-inventory.md';
const CAND=['docs/specs/WP-instruction-basename-currency.md','docs/specs/done/WP-instruction-basename-currency.md'];
const BEGIN='<!-- BEGIN-CANONICAL-INVENTORY -->', END='<!-- END-CANONICAL-INVENTORY -->';
const args=process.argv.slice(1);
const write=args.indexOf('--write')>=0;
const dates=args.filter((a)=>a!=='--write');
if(dates.length!==1){console.error('FAIL: pass exactly one date argument, got '+dates.length+': '+JSON.stringify(dates));process.exit(1);}
const date=dates[0];
if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}\$/.test(date)){console.error('FAIL: '+JSON.stringify(date)+' is not shaped YYYY-MM-DD');process.exit(1);}
const d=new Date(date+'T00:00:00Z');
if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date){console.error('FAIL: '+date+' is not a real calendar date');process.exit(1);}
if(date<'2026-09-04'){console.error('FAIL: '+date+' is earlier than 2026-09-04, the date this spec read its citations');process.exit(1);}
const found=CAND.filter((f)=>fs.existsSync(f));
if(found.length!==1){console.error('FAIL: exactly one of the draft and done spec paths must exist; found '+found.length+(found.length?': '+found.join(', '):''));process.exit(1);}
const SPEC=found[0];
const L=fs.readFileSync(SPEC,'utf8').split('\n');
function at(m){const h=[];for(let i=0;i<L.length;i++) if(L[i]===m) h.push(i);
  if(h.length!==1){console.error('FAIL: sentinel '+m+' occurs '+h.length+' times in '+SPEC+', expected 1');process.exit(1);} return h[0];}
const b=at(BEGIN), e=at(END);
if(!(b<e)||L[b+1]!=='\`\`\`markdown'||L[e-1]!=='\`\`\`'){console.error('FAIL: the sentinels do not wrap a markdown fence');process.exit(1);}
const payload=L.slice(b+2,e-1);
const fences=payload.filter((l)=>/^[ \t]*(\`\`\`|~~~)/.test(l));
if(fences.length){console.error('FAIL: the payload carries '+fences.length+' fence delimiter line(s); the first is '+JSON.stringify(fences[0]));process.exit(1);}
const deny=payload.filter((l)=>l.indexOf('| DENY |')===0);
if(deny.length===0){console.error('FAIL: the payload has no DENY rows');process.exit(1);}
const bad=deny.filter((l)=>!/\| @DATE@ \|\$/.test(l));
if(bad.length){console.error('FAIL: '+bad.length+' DENY row(s) do not end in a @DATE@ Fetched cell; the first ends '+JSON.stringify(bad[0].slice(-40)));process.exit(1);}
const hdr=payload.filter((l)=>l.indexOf('**Current as of @DATE@.')===0);
if(hdr.length!==1){console.error('FAIL: '+hdr.length+' Current-as-of placeholder line(s), expected exactly 1');process.exit(1);}
const body=payload.join('\n');
const sites=body.split('@DATE@').length-1;
if(sites!==deny.length+1){console.error('FAIL: '+sites+' @DATE@ site(s) in the payload, but '+(deny.length+1)+' are accounted for (1 Current-as-of + '+deny.length+' DENY rows); every site must be one of those');process.exit(1);}
const rendered=Buffer.from(body.split('@DATE@').join(date)+'\n','utf8');
if(write){fs.writeFileSync(DOC,rendered);console.log('V3 --write: rendered '+DOC+' from '+SPEC+' at '+date+' — '+(payload.length+1)+' lines, '+rendered.length+' bytes utf8, '+sites+' placeholder sites');process.exit(0);}
if(!fs.existsSync(DOC)){console.error('FAIL: missing input '+DOC);process.exit(1);}
const actual=fs.readFileSync(DOC);
if(Buffer.compare(actual,rendered)===0){console.log('V3 OK: '+DOC+' is byte-identical to the canonical rendering of '+SPEC+' at '+date+' ('+rendered.length+' bytes utf8, '+sites+' placeholder sites)');process.exit(0);}
const A=actual.toString('utf8').split('\n'), R=rendered.toString('utf8').split('\n');
for(let i=0;i<Math.max(A.length,R.length);i++) if(A[i]!==R[i]){
  const ai=A[i]===undefined?'<end of file>':A[i], ri=R[i]===undefined?'<end of file>':R[i];
  let c=0; while(c<ai.length&&c<ri.length&&ai[c]===ri[c]) c++;
  const w=(x)=>JSON.stringify(x.slice(Math.max(0,c-30),c+70));
  console.error('FAIL: first difference at line '+(i+1)+', column '+(c+1));
  console.error('  expected: '+w(ri));
  console.error('  actual  : '+w(ai));
  break;
}
console.error('FAIL: '+DOC+' is not the canonical rendering ('+actual.length+' bytes vs '+rendered.length+')');
process.exit(1);
" 2026-09-04

# V4 — criterion 4. THE OBLIGATION IS A SENTENCE, NOT A BAG OF TOKENS. Extracts
# the canonical step body from the spec between its two sentinels and requires
# exactly one numbered line of the runbook whose body equals it BYTE FOR BYTE.
# Round 2 executed the old token check against "On a MINOR release, the release
# maintainer need not re-fetch docs/instruction-file-inventory.md; updating code
# and tests in the same pull request is unnecessary" and got V4 OK. A negation
# is unconstructible here: it would have to be byte-identical to the affirmative.
#
# ROUND 3: a runbook consisting only of a fenced ```text example containing
# "7. <the sentence>" passed — an obligation that exists only inside a code
# sample. Fence state is now tracked and lines inside a fence are never
# candidates. The match must also be a TOP-LEVEL numbered line: the anchored
# /^[0-9]+\. / already rejects any indentation, which is why an indented
# continuation line was red in every round. Deliberately NOT a whole-runbook
# base+insertion compare — release.md's other steps move independently and such
# a pin would rot the moment anything else in the release process changes.
#
# Takes an optional runbook path so the same code can be rehearsed on a temp
# copy; with none it reads the real runbook.
node -e "
const fs=require('fs');
const CAND=['docs/specs/WP-instruction-basename-currency.md','docs/specs/done/WP-instruction-basename-currency.md'];
const BEGIN='<!-- BEGIN-CANONICAL-RELEASE-STEP -->', END='<!-- END-CANONICAL-RELEASE-STEP -->';
const RB=process.argv.slice(1)[0]||'docs/runbooks/release.md';
const found=CAND.filter((f)=>fs.existsSync(f));
if(found.length!==1){console.error('FAIL: exactly one of the draft and done spec paths must exist; found '+found.length+(found.length?': '+found.join(', '):''));process.exit(1);}
const SPEC=found[0];
if(!fs.existsSync(RB)){console.error('FAIL: missing input '+RB);process.exit(1);}
const L=fs.readFileSync(SPEC,'utf8').split('\n');
function at(m){const h=[];for(let i=0;i<L.length;i++) if(L[i]===m) h.push(i);
  if(h.length!==1){console.error('FAIL: sentinel '+m+' occurs '+h.length+' times in '+SPEC+', expected 1');process.exit(1);} return h[0];}
const b=at(BEGIN), e=at(END);
if(!(b<e)||L[b+1]!=='\`\`\`text'||L[e-1]!=='\`\`\`'||e-1!==b+3){console.error('FAIL: the sentinels do not wrap a one-line text fence');process.exit(1);}
const want=L[b+2];
let inFence=false; const hits=[];
for(const l of fs.readFileSync(RB,'utf8').split('\n')){
  if(/^[ \t]*(\`\`\`|~~~)/.test(l)){inFence=!inFence;continue;}
  if(inFence) continue;
  if(/^[0-9]+\. /.test(l)&&l.replace(/^[0-9]+\. /,'')===want) hits.push(l);
}
if(inFence){console.error('FAIL: '+RB+' ends inside an unclosed fence');process.exit(1);}
if(hits.length!==1){console.error('FAIL: '+hits.length+' top-level numbered line(s) of '+RB+' carry the canonical step body, expected exactly 1');process.exit(1);}
console.log('V4 OK: '+RB+' carries the canonical step body exactly once, outside any fence ('+Buffer.byteLength(want,'utf8')+' bytes utf8)');
"

# V5 — criterion 5. UNFILTERED, deliberately: a --wp filter reports every other
# criterion FILTERED and exits non-zero. Takes about two minutes.
npm run red-proofs

# V6 — the repo gates.
npm run lint
```

Paste, for each: the command, its output, and its exit status.

## Out of scope (do NOT do these)

- **The dot-segment class rule and both layout validators** — `WP-dot-segment-denial`
  (rows D1 (b) and D5). Every `HANDOFF` row of Table B is that work package's, not
  this one's, and none of its text is edited here.
- **Reopening the 2026-08-05 ruling.** The residual stays: an undocumented tool's
  instruction file, or one whose filename the user configured, still passes. It
  is named in Table B's last row and in the inventory's opening paragraph, and it
  is not argued with.
- **Exporting `INSTRUCTION_BASENAMES`**, or changing `fold`, `foldedSegments`,
  `isUnder`, `admittedDirs`, `DENIED_SEGMENTS`, `DENIED_BASENAME`,
  `EXTRA_TIER_DIRS`, `makeAdmit`'s clause order, or any refusal string.
- **Repairing the vacuous NFD assertion** at `tests/unit/dream-promote.test.js:325-326`
  — report it, do not fix it.
- **A second RED proof**, a fold mutation, or any other growth of
  `tests/red-proofs/`. One declaration, one mutation.
- **Wiring `npm run red-proofs` into CI.** It is a local gate today and stays one.
- **Denying user-configurable instruction filenames** (`context.fileName`,
  `project_doc_fallback_filenames`, `CONTEXT_FILE_NAMES`). Unbounded by
  construction; that is the residual, not a gap.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(dream): bring the instruction-basename denial current (WP-instruction-basename-currency)`.
3. PR template filled, including "Decisions made" (or "none"), "Discovered
   issues" (the vacuous NFD assertion belongs there) and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
6. On the flip to `Done`, `docs/instruction-file-inventory.md` becomes the
   canonical inventory and Tables A, B and C of this spec become its record.

---

**Round-zero self-check (architect):** run and recorded in
`docs/specs/logbook/2026-09-04-instruction-basename-currency-design-gate-rounds.md`.
