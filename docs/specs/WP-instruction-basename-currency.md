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

Every claim below was measured on this tree at commit `4b06afa0`. Re-run them
rather than trusting the sentence; the round-zero record
(`docs/specs/logbook/2026-09-04-instruction-basename-currency-design-gate-rounds.md`)
carries the commands and their output.

- `src/core/dream/promote.js:96` is one line:
  `const INSTRUCTION_BASENAMES = new Set(['claude.md', 'claude.local.md', 'agents.md', 'agents.override.md']);`
  — **four names**, each already NFC-lowercased. Its JSDoc is `:84-95` and says,
  correctly, that this is a deny-list "stated as one that will NOT cover the next
  convention".
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
  **`depends_on` is deliberately empty**: `WP-criterion-red-harness` is still
  `In-Review`, but this work package depends on the runner *on main*, which is
  already there and measured green — not on that spec's status flip. If its
  review round changes the runner or the declaration schema, dispatch-time
  re-verification is what catches it, and Table D is the one place this spec
  would change.
- `docs/runbooks/release.md` is 13 lines, nine numbered steps, and carries **no**
  re-inventory step. `docs/instruction-file-inventory.md` does not exist.
- `npm test` on this tree: 2608 tests, 0 fail, exit 0. `npm run lint`: clean.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself (the status flip), package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | docs/instruction-file-inventory.md | The dated inventory. Its skeleton is fixed under "Exact contracts"; its three tables are **Table A**, **Table B** and **Table C**, copied verbatim. **The row shape is load-bearing**: a DENY row starts with `\| DENY \|` and its **second cell** is the basename in backticks — acceptance criterion 2's test parses exactly that. **On this work package's flip to Done this file becomes the canonical inventory** and Tables A, B and C here become its record |
| modify | src/core/dream/promote.js | **ONE executable line and one comment block, nothing else.** `:96` — `INSTRUCTION_BASENAMES` gains the Table A names it lacks, each written **NFC-lowercased** (Table A, "Stored spelling"). **The literal's shape is what criterion 3's check parses**, so it stays a `const INSTRUCTION_BASENAMES = new Set([ … ])` whose members are single-quoted strings; line breaks inside the brackets are fine, a different construction is not. `:84-95` — its JSDoc gains one sentence pointing at `docs/instruction-file-inventory.md` as the canonical inventory and keeps its existing "will NOT cover the next convention" sentence. **This cell owns what stays unchanged in this file:** `DENIED_SEGMENTS` (`:99`), `DENIED_BASENAME` (`:102`), `EXTRA_TIER_DIRS`, `fold` (`:136-138`), `foldedSegments`, `isUnder`, `admittedDirs`, `makeAdmit`'s clause order and every one of its refusal strings, and the module's exports |
| modify | tests/unit/dream-promote.test.js | **THREE sites, all under the row-C9 section header at `:293`.** (a) `:295-315` — the `hostile` fixture gains one tier-local path per newly denied Table A name, so the existing end-to-end test covers them; (b) `:317-327` — the RED-side case list gains one mixed-case spelling of a newly denied name; (c) **one NEW test** implementing acceptance criteria 2 and 3, which **derives its subject list from `docs/instruction-file-inventory.md`** and fails when zero DENY rows parse. **This cell owns what stays unchanged:** every other test, every existing title, and the `scenario`/`run`/`refusalFor`/`get` helpers |
| create | tests/red-proofs/instruction-basenames.proofs.json | The RED-proof declaration for criterion 2, per **Table D**. Inert JSON, parsed and never executed. `suite` is `tests/unit/dream-promote.test.js`; `file` is `src/core/dream/promote.js` |
| modify | docs/runbooks/release.md | **ONE new numbered step**, inserted so the existing steps renumber consistently, carrying **Table C**'s obligation: owner, trigger, and the literal path `docs/instruction-file-inventory.md`. No other step is reworded |

**NOT a deliverable, stated because it is the trap:** `src/core/layout.js`,
`src/core/dream/vault-write.js`, `scripts/red-proofs.js`, `package.json` and
every CI workflow are **not touched**. In particular `npm run red-proofs` stays
out of CI (Out of scope), so no workflow file changes.

### Exact contracts

**`docs/instruction-file-inventory.md` — the literal skeleton.** Tables A and B
of this spec supply the rows; nothing else in the file is the implementer's to
invent. `<DATE>` is the date the implementer re-fetched the citations.

```markdown
# Instruction-file inventory

**Current as of <DATE>. This document is a dated inventory, never a complete
list** — an enumeration of instruction filenames cannot close, because no
structural marker distinguishes one. A tool whose instruction file is
undocumented, or whose filename the user configured, is not covered here and is
the accepted residual of the 2026-08-05 audit ruling on threat M7.

This inventory is the canonical source for `INSTRUCTION_BASENAMES` in
`src/core/dream/promote.js`: every DENY row below is a name the dream run
refuses to promote into the vault, at any depth and in any case.

<Table A's inclusion-rule preamble, verbatim>

## Denied basenames

<Table A of WP-instruction-basename-currency, verbatim, header included>

## Accepted omissions and handoffs

<Table B of WP-instruction-basename-currency, verbatim, header included>

## How this stays current

<Table C of WP-instruction-basename-currency, verbatim, header included>
```

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

### Table A — the dated inventory of denied basenames (canonical, as of 2026-09-04)

**Inclusion rule** (the single place it is decided): a basename is DENY when
current vendor documentation establishes it as an instruction-file discovery
path at a **plain, dot-free, project-relative location**. That rule and nothing
else — no per-name judgement about how ordinary the name looks, because that
judgement is what goes stale. Every citation below was fetched and read on
**2026-09-04**, and every URL returned HTTP 200 on that date (round-zero record).
**Stored spelling** is what goes into `INSTRUCTION_BASENAMES`: NFC-lowercased,
because `fold` is applied to the candidate before the lookup.

| Disposition | Basename | Stored spelling | Convention it is | Citation | Fetched |
|---|---|---|---|---|---|
| DENY | `CLAUDE.md` | `claude.md` | Claude Code project instructions, `./CLAUDE.md` | https://code.claude.com/docs/en/memory | 2026-09-04 |
| DENY | `CLAUDE.local.md` | `claude.local.md` | Claude Code local instructions, `./CLAUDE.local.md`; documented, not deprecated | https://code.claude.com/docs/en/memory | 2026-09-04 |
| DENY | `AGENTS.md` | `agents.md` | the AGENTS.md open format, repository root; read by Codex CLI, Warp, Zed, opencode, Copilot, Cursor, Cline, Roo Code, Junie, Kiro, Goose and OpenHands | https://agents.md/ · https://learn.chatgpt.com/docs/agent-configuration/agents-md | 2026-09-04 |
| DENY | `AGENTS.override.md` | `agents.override.md` | Codex CLI's per-directory override, checked ahead of `AGENTS.md` in each directory from the project root down | https://learn.chatgpt.com/docs/agent-configuration/agents-md | 2026-09-04 |
| DENY | `AGENT.md` | `agent.md` | Zed's project-instruction list, position 6; Roo Code's workspace-root fallback when `AGENTS.md` is absent | https://zed.dev/docs/ai/instructions · https://roocodeinc.github.io/Roo-Code/features/custom-instructions/ | 2026-09-04 |
| DENY | `GEMINI.md` | `gemini.md` | Gemini CLI's default context file, searched from the working directory up to the project root; Zed's list, position 9 | https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md | 2026-09-04 |
| DENY | `QWEN.md` | `qwen.md` | Qwen Code's default context file, project root | https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/memory.md | 2026-09-04 |
| DENY | `WARP.md` | `warp.md` | Warp project rules; still fully supported and takes priority over `AGENTS.md` in the same directory | https://docs.warp.dev/knowledge-and-collaboration/rules | 2026-09-04 |
| DENY | `replit.md` | `replit.md` | Replit Agent's project context file, which must sit at the project root | https://docs.replit.com/features/project-setup/replit-dot-md | 2026-09-04 |

**Nine rows. Four of them (`CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`,
`AGENTS.override.md`) are already in `INSTRUCTION_BASENAMES`; five are the
change.**

### Table B — accepted omissions and handoffs (canonical)

Everything found in the same sweep and deliberately **not** denied by this work
package, with the reason. A `HANDOFF` row belongs to `WP-dot-segment-denial`; an
`OMIT` row belongs to nobody and is a stated non-denial.

| Disposition | Path(s) as documented | Tool | Reason it is not in Table A | Citation |
|---|---|---|---|---|
| HANDOFF | `.github/copilot-instructions.md`, `.github/instructions/NAME.instructions.md` | GitHub Copilot | dot-prefixed segment | https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions |
| HANDOFF | `.cursor/rules/*.mdc`, `.cursorrules` | Cursor | dot-prefixed; `.mdc` also fails the `.md`-only extension rule | https://cursor.com/docs/rules |
| HANDOFF | `.windsurfrules`, `.windsurf/rules/`, `.devin/rules/` | Windsurf (now Devin Desktop) | dot-prefixed; `.windsurfrules` also fails the `.md`-only extension rule | https://docs.devin.ai/desktop/cascade/agents-md |
| HANDOFF | `.clinerules/` | Cline | dot-prefixed | https://docs.cline.bot/customization/cline-rules |
| HANDOFF | `.roo/rules/`, `.roorules` | Roo Code | dot-prefixed | https://roocodeinc.github.io/Roo-Code/features/custom-instructions/ |
| HANDOFF | `.continue/rules/` | Continue | dot-prefixed | https://docs.continue.dev/customize/deep-dives/rules |
| HANDOFF | `.junie/AGENTS.md`, `.junie/playbook.md`, `.junie/rules/`, `.junie/guidelines.md` | JetBrains Junie | dot-prefixed; its bare form is `AGENTS.md`, already Table A | https://junie.jetbrains.com/docs/guidelines-and-memory.html |
| HANDOFF | `.kiro/steering/` | AWS Kiro | dot-prefixed; its bare form is `AGENTS.md`, already Table A | https://kiro.dev/docs/steering/ |
| HANDOFF | `.amazonq/rules/**/*.md` | Amazon Q Developer | dot-prefixed | https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/context-project-rules.html |
| HANDOFF | `.trae/rules/` | Trae | dot-prefixed; file names inside it are arbitrary | https://docs.trae.ai/ide/rules |
| HANDOFF | `.openhands/microagents/`, `.openhands/skills/`, `.agents/skills/NAME/SKILL.md` | OpenHands | dot-prefixed; its current bare form is `AGENTS.md`, already Table A | https://docs.openhands.dev/overview/skills/repo |
| HANDOFF | `.qwen/QWEN.local.md` | Qwen Code | dot-prefixed | https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/memory.md |
| HANDOFF | `.claude/CLAUDE.md`, `.claude/rules/` | Claude Code | dot-prefixed — **and already refused today** by `DENIED_SEGMENTS`'s `.claude` | https://code.claude.com/docs/en/memory |
| HANDOFF | `.codex/AGENTS.md`, `.codex/AGENTS.override.md` | Codex CLI | dot-prefixed — **and already refused today** by `DENIED_SEGMENTS`'s `.codex` | https://learn.chatgpt.com/docs/agent-configuration/agents-md |
| HANDOFF | `.rules` | Zed | dot-prefixed leading-dot filename; also fails the `.md`-only extension rule | https://zed.dev/docs/ai/instructions |
| HANDOFF | `.goosehints` | Goose | dot-prefixed leading-dot filename; also fails the `.md`-only extension rule. **Its disposition does not rest on a citation:** the vendor page is a client-rendered SPA that returned HTTP 404 to a plain fetch on 2026-09-04, and the two structural reasons hold regardless | — (no live citation; see reason) |
| HANDOFF | `.aider.conf.yml` | Aider | dot-prefixed; also fails the `.md`-only extension rule | https://aider.chat/docs/config/aider_conf.html |
| OMIT | `copilot-instructions.md` (bare) | GitHub Copilot | **not a documented discovery path.** GitHub documents the file only under `.github/`; a bare tier-local one is an ordinary note, and denying it would deny legitimate notes | https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions |
| OMIT | `rules.md` (bare) | Cursor | merely the basename of a path inside `.cursor/`; not a convention on its own | https://cursor.com/docs/rules |
| OMIT | `CONVENTIONS.md` | Aider | **Aider documents no fixed filename.** `CONVENTIONS.md` appears as a documentation *example*; the real mechanism is `.aider.conf.yml`'s `read:` key, which takes any user-chosen path | https://aider.chat/docs/usage/conventions.html |
| OMIT | `project_rules.md` | Trae | not documented. Trae's current docs establish the `.trae/rules/` directory with arbitrarily named `*.md` files inside it | https://docs.trae.ai/ide/rules |
| OMIT | `AmazonQ.md` | Amazon Q Developer | not documented. The AWS page establishes `.amazonq/rules/` only | https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/context-project-rules.html |
| OMIT | `SKILL.md`, `LEARNINGS.md` | Wienerdog itself | **deliberately never denied.** These are Wienerdog's own vault artifacts (ADR-0020) and `promote.js:111-116` names them; denying `SKILL.md` would break the shipped skill-plus-ledger atomic promotion. OpenHands' use of the name is at `.agents/skills/NAME/SKILL.md`, a dot path | `src/core/dream/promote.js:111-116` |
| OMIT | user-configured names — Gemini CLI and Qwen Code `context.fileName`; Codex CLI `project_doc_fallback_filenames` (documented example: `TEAM_GUIDE.md`); Goose `CONTEXT_FILE_NAMES` | several | **THIS IS THE NAMED RESIDUAL.** The name space is unbounded and user-chosen, so no inventory can cover it. This is the residual the 2026-08-05 ruling accepted, restated rather than reopened | https://learn.chatgpt.com/docs/agent-configuration/agents-md · https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md |

**Twenty-four rows: seventeen HANDOFF, seven OMIT.** Where a row also names the
`.md`-only extension rule, that is an **additional, independent** reason measured
in Current state; its absence on another row means only that the dot reason was
sufficient there, never that the extension rule fails to apply.

### Table C — the standing maintenance obligation (canonical)

| Fact | Value |
|---|---|
| Owner | **the release maintainer** — whoever executes `docs/runbooks/release.md`. Deliberately a role, not a person: a name in a checked-in runbook goes stale on the first handover. If a person is wanted instead, this cell is the one place that changes |
| Trigger | **every MINOR version bump** — a `package.json` version going `0.x.y` → `0.(x+1).0`. Objective and observable in the diff; patch releases are not triggered |
| Where the obligation is recorded | one numbered step in `docs/runbooks/release.md`, naming the literal path `docs/instruction-file-inventory.md` |
| What the step obliges | re-fetch every citation in Table A and Table B of the inventory; add any newly documented plain-path convention; update the `Current as of` date and each row's `Fetched` cell. **If the DENY set changed, `INSTRUCTION_BASENAMES` and its tests change in the same pull request** — a docs-only refresh would recreate exactly the defect this work package closes |
| What it is NOT | nothing scheduled, nothing that watches, polls or runs; no CI step, no hook, no job. **ADR-0004** — it is a line in a runbook a human follows |
| The failure it accepts, stated | a release cut without performing the step leaves the inventory stale and nothing detects it. That is the cost of a human obligation, and it is chosen over machinery on ADR-0004 |

### Table D — the required RED proof (one row, one mutation; ADR-0036)

One declaration in `tests/red-proofs/instruction-basenames.proofs.json`. The
`find` / `replace` / `marker` / `expectRed` values are the implementer's to
author against the finished file; this row decides what the mutation **is**.

| id | wp / criterion | mechanism — TRIGGER and PATCH | what must redden, and how the row is verified |
|---|---|---|---|
| `instruction-basenames-reverted` | `WP-instruction-basename-currency` / criterion `2` | **TRIGGER: none — the patched constant is on the ordinary path.** The new test calls `makeAdmit` directly, so nothing has to be injected to reach the Set lookup at `promote.js:237`; the exemption's measurement is the APPLY-phase run itself, which must show the marker present and the named assertions failing. **PATCH: the `const INSTRUCTION_BASENAMES = new Set([...])` declaration is reverted to the four names shipped at `4b06afa0`** — `claude.md`, `claude.local.md`, `agents.md`, `agents.override.md`. The seam is named structurally, by that declaration, never by a line number (ADR-0036 A2) | Every own-body terminal failure the revert causes must appear in `expectRed`, or the proof is `FAILED` — **and the revert reddens the two extended existing tests as well as the new one**, so either all of them are declared or the declaration carries a `testNamePattern` scoping the run to the new test. Both are legal; the choice goes in the pull request under "Decisions made". **One mutation, one independently revertible change** (ADR-0036 A3): reverting the Set neither requires nor implies any other edit |

### Mirrored Surface Checklist

**Table A** (the denial set):

- [ ] Deliverables cells for `docs/instruction-file-inventory.md` (the row shape), `src/core/dream/promote.js` (the stored spelling and the literal's shape) and `tests/unit/dream-promote.test.js` (all three sites)
- [ ] Acceptance criteria **1, 2, 3** and verification **V1** and **V2**
- [ ] Current state — the measured admits and the `fold` paragraph
- [ ] `src/core/dream/promote.js:84-95` — the JSDoc, which after this work package points at the inventory rather than restating the list
- [ ] Table D's PATCH cell, which names the four-name baseline
- [ ] **Table B is a registered mirror in the negative:** its complement is Table A, so moving a name between them is one pass, not two

**Table B** (the omissions):

- [ ] The Out of scope section, which cites it for the dot-segment boundary
- [ ] Current state's clause-(b) measurement (`.rules`, `.goosehints`, `.mdc`, …), which several HANDOFF rows cite
- [ ] The inventory document's **opening paragraph**, which states the residual Table B's last row decides
- [ ] `docs/specs/WP-dot-segment-denial.md` — **a NON-move.** That spec's own required verification owns the class predicate; this work package hands it rows and changes none of its text

**Table C** (the obligation):

- [ ] The Deliverables cell for `docs/runbooks/release.md`
- [ ] Acceptance criterion **4** and verification **V3**
- [ ] The inventory document's "How this stays current" section, which is Table C copied

**Table D** (the RED proof):

- [ ] The Deliverables cell for `tests/red-proofs/instruction-basenames.proofs.json`
- [ ] Acceptance criterion **5** and verification **V4**

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
- **Ambiguity → choose the simpler option** and record it under "Decisions made".
  Do not expand scope to resolve it.

## Security checklist

- [ ] **The anchored-pattern rule does not apply, and here is why.** No
      identifier introduced by this work package flows into a filesystem path or
      a shell command. The change adds string members to a `Set` that is compared
      against an already-folded path segment; `makeAdmit` builds no path, spawns
      nothing, and its inputs are the same `rel` values it receives today. The
      untrusted input on this path — the brain-authored relative path — is
      validated by the vault-write primitive (Table H row H1 of
      `WP-dream-promote-in-workspace`), and this work package neither weakens nor
      duplicates that. The change can only ever **refuse** more, never admit
      more.

## Acceptance criteria

- [ ] **1.** `docs/instruction-file-inventory.md` exists, follows the skeleton
      under "Exact contracts", and its three tables are Table A, Table B and
      Table C **verbatim except** each Table A row's `Fetched` cell and the
      document's `Current as of` date, which carry the date the implementer
      re-fetched. (Table B carries no per-row date; the document's
      `Current as of` date covers its citations.) Every DENY row starts with
      `| DENY |` and holds its basename in backticks in the **second** cell.
- [ ] **2.** Every basename the inventory marks `DENY` is refused with a reason
      containing `is a harness instruction file` at each of the three tier-local
      depths `06-Identity/`, `01-Projects/example/`, `02-Areas/x/y/`, in every
      **distinct** spelling among {as written, lowercased, uppercased,
      alternating case} — distinct, because an all-lowercase name such as
      `replit.md` yields three, not four; and is refused by *something* at the
      vault root, which is clause (a)'s job. The assertion **derives its name
      list from the inventory document** and fails when zero DENY rows parse.
- [ ] **3.** `INSTRUCTION_BASENAMES` holds exactly as many names as the inventory
      has DENY rows, and every member equals its own `NFC`-lowercased form.
- [ ] **4.** `docs/runbooks/release.md` carries a numbered step naming the
      literal path `docs/instruction-file-inventory.md`, its owner and its
      minor-release trigger, per Table C.
- [ ] **5.** `npm run red-proofs`, unfiltered, reports `3 declared proof(s), 3
      selected`, a `PROVEN` roll-up line for
      `WP-instruction-basename-currency criterion 2`, `RUN: PROVEN`, and exits 0.
- [ ] **6.** Idempotence — `N/A` — this work package ships no command and writes
      nothing outside the repository; it changes one constant, one JSDoc block,
      one runbook step, one new document and their tests.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — criteria 1, 2 and 3. The new test carries all three. The guard names the
# DELIVERABLE-ABSENT state directly instead of surfacing it as a readFileSync
# throw from inside the suite, and the count is the number V2 must agree with.
test -f docs/instruction-file-inventory.md || { echo "MISSING DELIVERABLE: docs/instruction-file-inventory.md"; exit 1; }
grep -c '^| DENY |' docs/instruction-file-inventory.md
npm test

# V2 — criterion 3's mechanical half, run outside the suite so a reviewer can
# re-derive it without reading test code. Both arms were observed at round zero:
# it fails on a name that is not pre-folded, and on a count mismatch.
node -e "
const fs=require('fs');
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

# V3 — criterion 4. The `test -f &&` guard is required: a bare negated grep on a
# missing file exits 2, and the negation would turn that into a pass.
test -f docs/runbooks/release.md && grep -n 'instruction-file-inventory\.md' docs/runbooks/release.md

# V4 — criterion 5. UNFILTERED, deliberately: a --wp filter reports every other
# criterion FILTERED and exits non-zero. Takes about two minutes.
npm run red-proofs

# V5 — the repo gates.
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
