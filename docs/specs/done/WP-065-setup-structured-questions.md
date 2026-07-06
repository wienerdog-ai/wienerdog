---
id: WP-065
title: Structured closed-choice interview questions + dream catch-up reassurance in the setup skill
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0014]
branch: wp/065-setup-structured-questions
---

# WP-065: Structured closed-choice interview questions + dream catch-up reassurance in the setup skill

## Context (read this, nothing else)

Wienerdog installs files that upgrade a user's Claude Code / Codex CLI setup.
One of those files is the **setup skill** (`skills/wienerdog-setup/SKILL.md`): a
prose script that an AI agent follows to interview the user and write their
identity notes into the vault. The skill is read and executed by whichever AI
harness the user runs — **it must work identically under Claude Code and Codex
CLI** (vendor neutrality is binding: the product serves both).

This WP makes two field-driven UX improvements to that one skill file:

1. **Structured closed-choice questions.** A few interview questions have a
   small fixed set of good answers (a tone, one of three vault choices, one of
   three memory modes). Those read better as a tap-to-pick multiple-choice
   question than as a free-text prompt. Where the harness offers a structured
   question tool (Claude Code's `AskUserQuestion`), the skill should tell the
   agent to use it; where it does not (Codex CLI), the agent presents the same
   options as a plain numbered list. Genuinely open questions (what you do,
   your goals, tools you use, standing rules) stay free-text — do NOT
   over-structure them.

2. **Dream catch-up reassurance.** When a vault is created, Wienerdog silently
   schedules a nightly memory pass ("dreaming") at 03:30 (ADR-0014). Field
   feedback: telling users "dreaming is scheduled for 03:30" is correct but
   anxiety-inducing — people think they must leave the machine on overnight.
   The truth (already guaranteed by the catch-up logic, WP-020) is they do not.
   Every place that discloses the schedule must **also** state, plainly, that a
   machine that is off or asleep at 03:30 catches up automatically. This WP adds
   that reassurance to the setup skill's closing text so the driving agent
   relays it. (The CLI and README disclosure surfaces are handled by WP-066, in
   parallel — this WP owns only the skill file.)

**Product invariant (ADR-0014, must not be weakened):** the schedule is still
**plainly disclosed** — the reassurance *extends* the disclosure, it does not
replace or soften "we scheduled a nightly job at 03:30." **Iron rule (ADR-0004):
Wienerdog is just files** — this WP edits a markdown skill and a test; it starts
nothing.

Both asks edit the same one file (`skills/wienerdog-setup/SKILL.md`). To let
WP-065 and WP-066 land in parallel with no merge conflict, this WP owns **all**
edits to the setup skill (both the structured-question rewrite and the
reassurance sentence); WP-066 owns the CLI/README disclosure surfaces and shares
no files with this WP.

## Current state

`skills/wienerdog-setup/SKILL.md` exists (180 lines) and is verified by
`tests/unit/setup-skill-structure.test.js`. Its structure today:

- Two top-of-file **hard rules** (only write inside vault/`config.yaml`; never
  touch `CLAUDE.md`/`AGENTS.md`).
- **Step 0** — setting-up vs adjusting. The adjust path asks a menu question:
  `> What would you like to adjust?` / `> profile / preferences & tone / goals /
  standing instructions / memory mode`.
- **Step 1** — find the vault via `~/.wienerdog/config.yaml`.
- **Step 2** — the interview: role & background; current projects &
  responsibilities; communication preferences (detail, tone, format); tools
  they live in; goals; anything the AI should always know or never do.
- **Step 3** — existing notes: three vault choices in plain language —
  **Start fresh** (`wienerdog init --fresh-vault`), **Import from it** (read-only
  mining into the fresh vault, `origin: import`, mandatory "what was taken"
  summary), **Adopt it in place** (power users; run `wienerdog adopt <path>` or
  `node <repo>/bin/wienerdog.js adopt <path>` from the terminal — not from the
  skill).
- **Step 4** — memory eagerness: `conservative` / `standard` (default) /
  `eager`; writes `memory_mode:` in `config.yaml`.
- **Step 5** — write the four identity notes (`profile.md`, `preferences.md`,
  `goals.md`, `instructions.md`), `origin: interview`.
- **Step 6** — run `wienerdog sync`, tell them what their AI now knows, quote a
  few digest lines, invite re-run.

The existing structure test asserts these literal substrings survive (all MUST
still be present after your edit, or the test fails):

- `Only ever write inside the vault and \`config.yaml\``
- `Never touch \`CLAUDE.md\` or \`AGENTS.md\` yourself`
- `start fresh`, `import from it`, `adopt it in place` (case-insensitive)
- `wienerdog adopt`, `bin/wienerdog.js adopt`
- `read-only`, and `never` … `move, copy wholesale, edit, or delete`
- `` origin:` to **`import`** `` (exact)
- `profile.md`, `preferences.md`, `goals.md`, `instructions.md`, `01-Projects/`
- `wienerdog init --fresh-vault`, `wienerdog sync`
- `exactly what was taken`, `import is never silent`

Nothing about dream scheduling appears in the skill today (verified: no `03:30`,
`dream`, or catch-up mention).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | skills/wienerdog-setup/SKILL.md | add closed-choice instruction block; annotate the 4 closed-choice questions; add dream reassurance to Step 6. Preserve ALL existing semantics and the literal substrings listed above. |
| modify | tests/unit/setup-skill-structure.test.js | add assertions for the closed-choice instruction, the type-your-own invariant, and the reassurance sentence |

### Exact contracts

This is a prose/skill change — the "contract" is the exact text to add and which
questions become closed-choice. Copy the frozen blocks verbatim.

**1. Insert a new section immediately before `## Step 2 — The interview`,**
titled exactly `## Asking closed-choice questions`, with this frozen body:

```markdown
## Asking closed-choice questions

A few of the questions below have a small, fixed set of sensible answers (for
example a tone, or one of three vault choices). Ask those as a **structured
multiple-choice question** so the person can pick with one tap instead of
typing:

- **Where your environment provides a structured multiple-choice question tool**
  — in Claude Code this is the `AskUserQuestion` tool — use it for these items
  and offer the listed presets as the choices.
- **Where it does not** — for example Codex CLI — present exactly the same
  options as a short numbered list in plain text and let them reply with a
  number.

Never depend on any one tool by name; always degrade gracefully to the numbered
list. Whichever way you ask, one thing is always true: **the person can always
type their own answer instead of picking a preset** — a closed-choice question
is a shortcut, never a cage. (In Claude Code the `AskUserQuestion` tool already
offers a free-text "Other" choice automatically, so you do not need to add one;
just make sure that, however you ask, a custom typed answer is always accepted.)

Only the questions marked **(closed-choice)** below are asked this way.
Everything else in the interview is open — ask it as a normal, free-text
conversation and let the person answer in their own words.
```

**2. The four closed-choice questions.** Mark exactly these — and no others —
as `(closed-choice)`, keeping every existing behavior:

- **Step 0 adjust-menu** — keep the existing menu wording
  (`profile / preferences & tone / goals / standing instructions / memory mode`);
  add `(closed-choice)` and offer those five as the presets.
- **Step 2 → preferred tone** — split "communication preferences" so that
  **tone** is asked `(closed-choice)` with these three presets, verbatim:
  `Direct and concise`, `Warm and conversational`, `Neutral and professional`.
  Leave detail level and format as part of the open conversation (do NOT
  structure them).
- **Step 3 vault choice** — the three options (`Start fresh` / `Import from it` /
  `Adopt it in place`) become the presets of one `(closed-choice)` question.
  **Preserve every existing sub-detail unchanged:** the "Start fresh is the
  default if unsure" note, the `wienerdog init --fresh-vault` command, the full
  Import mining/read-only/`origin: import`/`01-Projects/` seeding/"exactly what
  was taken"/"import is never silent" text, and the Adopt-from-terminal note
  with BOTH invocation forms (`wienerdog adopt <path>` and
  `node <repo>/bin/wienerdog.js adopt <path>`).
- **Step 4 memory eagerness** — `conservative` / `standard` / `eager` become the
  presets of one `(closed-choice)` question; `standard` stays the default; keep
  the "update `memory_mode:` in `config.yaml`, change nothing else" instruction.

**Genuinely open (leave free-text — enumerated so you do not over-structure):**
role & background; current projects & responsibilities; communication detail
level and format specifics; tools they live in; goals (now / this year);
anything the AI should always know or never do.

**3. Dream catch-up reassurance in Step 6.** Append to `## Step 6 — Refresh and
confirm`, after the existing "invite them to run this setup again" text, this
frozen paragraph (the quoted sentence is the canonical reassurance — reproduce
it verbatim, including the em-dash and apostrophes):

```markdown
Finally, mention the nightly dream so it is never a surprise: tell them
Wienerdog has scheduled a quiet nightly memory pass ("dreaming") at 03:30 that
folds each day's work into their vault, and relay this reassurance in plain
words — "If your computer is off or asleep at that time, don't worry — Wienerdog
catches up automatically the next time you're back." They never need to leave
the machine on overnight.
```

**4. Test additions** in `tests/unit/setup-skill-structure.test.js` — add three
`test(...)` cases (keep every existing case untouched):

```js
test('setup-skill: closed-choice questions degrade gracefully across harnesses', () => {
  assert.ok(text.includes('AskUserQuestion'), 'names Claude Code AskUserQuestion tool');
  assert.ok(lower.includes('numbered list'), 'Codex fallback (numbered list) missing');
  assert.ok(
    lower.includes('type their own answer') || lower.includes('a custom typed answer is always accepted'),
    'type-your-own invariant missing'
  );
});

test('setup-skill: exactly the four intended questions are marked closed-choice', () => {
  const count = (text.match(/\(closed-choice\)/g) || []).length;
  assert.equal(count, 4, `expected 4 (closed-choice) markers, found ${count}`);
});

test('setup-skill: Step 6 relays the dream catch-up reassurance (ADR-0014)', () => {
  assert.ok(text.includes('03:30'), 'schedule still plainly disclosed (03:30)');
  assert.ok(
    text.includes("catches up automatically the next time you're back"),
    'canonical catch-up reassurance sentence missing'
  );
});
```

## Implementation notes & constraints

- **Durable posture (record here, no ADR needed):** every surface that discloses
  the 03:30 dream schedule must ALSO state the catch-up reassurance. This
  *extends* ADR-0014's "the summary states plainly that dreaming was scheduled"
  requirement — do not drop or weaken the disclosure of the time itself.
- The canonical reassurance sentence is frozen across this WP and WP-066; it must
  read identically wherever it appears:
  `If your computer is off or asleep at that time, don't worry — Wienerdog catches up automatically the next time you're back.`
- Exactly **four** `(closed-choice)` markers — the test asserts the count. Do not
  add a fifth (e.g. do not structure tools, goals, or detail/format).
- Preserve the literal substrings listed in "Current state"; the existing
  structure test will fail otherwise. When in doubt, add wording rather than
  rewrite existing sentences.
- `wienerdog-routines` and `wienerdog-google-setup` also contain closed-choice
  prompts (the routine menu; browser-step choices). Giving them the same
  treatment is **out of scope** here (see Out of scope) — noted as a follow-up to
  keep this an S.
- Markdown must pass markdownlint (the repo config): keep list style, heading
  levels, and line length consistent with the surrounding file.

## Security checklist

Deleted — this WP edits skill prose and a test; it touches no untrusted input,
no filesystem paths, and no shell commands.

## Acceptance criteria

- [ ] `## Asking closed-choice questions` section present with the vendor-neutral
      rule (AskUserQuestion where available; numbered list where not) and the
      type-your-own invariant.
- [ ] Exactly four questions marked `(closed-choice)`: Step 0 menu, Step 2 tone,
      Step 3 vault choice, Step 4 memory mode.
- [ ] All open questions remain free-text; no extra structuring added.
- [ ] Step 6 discloses the 03:30 dream schedule AND relays the canonical catch-up
      reassurance sentence verbatim.
- [ ] Every pre-existing assertion in `setup-skill-structure.test.js` still
      passes (all preserved substrings intact).
- [ ] The three new test cases pass.

## Verification steps (run these; paste output in the PR)

```bash
node --test tests/unit/setup-skill-structure.test.js
npm run lint
```

## Out of scope (do NOT do these)

- The CLI (`init.js`/`adopt.js`) and README dream-disclosure surfaces — **WP-066**
  owns those (parallel WP). Do not edit them here.
- Structured-question treatment for `wienerdog-routines` (routine menu) and
  `wienerdog-google-setup` (browser-step choices) — deferred follow-up.
- Changing memory-mode defaults, vault-choice behavior, import logic, or any
  interview content beyond the closed-choice framing and the Step 6 reassurance.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/065-setup-structured-questions`; conventional commits; PR titled
   `feat(setup): structured closed-choice interview questions + dream reassurance (WP-065)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
