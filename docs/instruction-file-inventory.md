# Instruction-file inventory

**Current as of 2026-09-04. This document is a dated inventory, never a complete
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
| DENY | `CLAUDE.md` | `claude.md` | Claude Code project instructions, `./CLAUDE.md` | https://code.claude.com/docs/en/memory | 2026-09-04 |
| DENY | `CLAUDE.local.md` | `claude.local.md` | Claude Code local instructions, `./CLAUDE.local.md`; documented, not deprecated | https://code.claude.com/docs/en/memory | 2026-09-04 |
| DENY | `AGENTS.md` | `agents.md` | the AGENTS.md open format, repository root; read by Codex CLI, Warp, Zed, opencode, Copilot, Cursor, Cline, Roo Code, Junie, Kiro, Goose and OpenHands | https://agents.md/ · https://learn.chatgpt.com/docs/agent-configuration/agents-md · https://opencode.ai/docs/rules/ | 2026-09-04 |
| DENY | `AGENTS.override.md` | `agents.override.md` | Codex CLI's per-directory override, checked ahead of `AGENTS.md` in each directory from the project root down | https://learn.chatgpt.com/docs/agent-configuration/agents-md | 2026-09-04 |
| DENY | `AGENT.md` | `agent.md` | Zed's project-instruction list, position 6; Roo Code's workspace-root fallback when `AGENTS.md` is absent | https://zed.dev/docs/ai/instructions · https://roocodeinc.github.io/Roo-Code/features/custom-instructions/ | 2026-09-04 |
| DENY | `GEMINI.md` | `gemini.md` | Gemini CLI's default context file, searched from the working directory up to the project root; Zed's list, position 9 | https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md | 2026-09-04 |
| DENY | `QWEN.md` | `qwen.md` | Qwen Code's default context file, project root | https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/memory.md | 2026-09-04 |
| DENY | `WARP.md` | `warp.md` | Warp project rules; still fully supported and takes priority over `AGENTS.md` in the same directory | https://docs.warp.dev/knowledge-and-collaboration/rules | 2026-09-04 |
| DENY | `replit.md` | `replit.md` | Replit Agent's project context file, which must sit at the project root | https://docs.replit.com/features/project-setup/replit-dot-md | 2026-09-04 |

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
| OMIT | `SKILL.md`, `LEARNINGS.md` | Wienerdog itself | **deliberately never denied.** These are Wienerdog's own vault artifacts (ADR-0020) and the `LEDGER_BASENAME` and `SKILL_BASENAME` declarations in `promote.js` name them; denying `SKILL.md` would break the shipped skill-plus-ledger atomic promotion. OpenHands' use of the name is at `.agents/skills/NAME/SKILL.md`, a dot path | none — deliberately admitted; the shipped skill-plus-ledger promotion depends on it | the `LEDGER_BASENAME` and `SKILL_BASENAME` declarations in `src/core/dream/promote.js` |
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
