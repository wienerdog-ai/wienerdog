---
id: WP-dream-projection-done-spec-errata
title: File Errata 7–9 against the Done primary-dialogue projection spec
status: Draft
model: opus
size: S
depends_on: [WP-dream-primary-dialogue-projection]
adrs: []
epic: dream-primary-dialogue
---

# WP-dream-projection-done-spec-errata: File Errata 7–9 against the Done primary-dialogue projection spec

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **A docs-only package.** It changes one Markdown file and no code, test or
> fixture. Anyone can implement it as an ordinary docs PR; it needs no design
> round of its own, because every sentence it adds is a measured fact already
> recorded in a committed logbook entry, cited in the text. Filed under the
> owner's ruling of 2026-09-26,
> `docs/specs/logbook/2026-09-27-owner-ruling-harness-records-option-iii.md`.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** The nightly **dream** reads recent
session **transcripts** and gives a bounded extract of each to one
consolidation pass. Since `WP-dream-primary-dialogue-projection` (Done,
merged as PR #266) that extract holds only **primary dialogue**, and the Done spec
`docs/specs/done/WP-dream-primary-dialogue-projection.md` is the record of
that contract. A Done spec is never rewritten; a fact found wrong after merge
is recorded as a numbered **erratum** in the errata blockquote at the top of
the file (six exist, dated 2026-09-18), plus a short bold marker in place at
each sentence it corrects.

The design round of the now superseded
`docs/specs/done/WP-dream-projection-harness-user-records.md` measured three
facts that make three sentences of the Done spec wrong. Its round record is
`docs/specs/logbook/2026-09-26-projection-harness-user-records-design-review.md`
(**the round record**); every count below is from its §2, taken on the owner's
local corpus (334 Claude transcript files, Claude Code 2.1.232–2.1.283,
counts only, no transcript text read). The owner then ruled (2026-09-26,
option (iii)) that **no decline rule is built**, so the three facts are filed
as they stand:

1. **Erratum 7.** The Done spec says, at `:150`, *"Harness-authored and
   developer-authored instructions are not dialogue."* Its row A2 (`:458`)
   accepts every Claude `user` record without `isMeta` or `isSidechain` whose
   `message.role` is `"user"`, so records Claude Code writes itself — a
   subagent's `<task-notification>` report, slash-command echoes, `!`-command
   input and output, compaction summaries, interruption markers — reach the
   dream as the person's words (round record §2.3: 1,103 task notifications,
   134 command echoes, 8 `!`-command records, 9 compaction or interruption
   records, beside 705 prompts). The owner chose to keep that behaviour, so
   the sentence is recorded as a **named gap**, not corrected by code.
   Option (iii)'s own text, which the owner chose, said the sentence "stays
   false and is corrected by the docs package" — this package.
2. **Erratum 8.** The Done spec says, at `:562-563`, *"There is therefore no
   field in the Claude transcript schema by which this projection can tell a
   `claude -p` routine prompt from a human one,"* and row A5b (`:462`) says
   the routine prompt *"is indistinguishable from a person's"*. That was
   measured by comparing field **names**. The **value** of the top-level
   `promptSource` field differs: `"sdk"` on a `claude -p` prompt, `"typed"`,
   `"queued"` or `"suggestion_accepted"` on a person's (round record §2.3).
   No shipped code reads `promptSource`, so row A5b's contract — `false` does
   not mean a human wrote the words — is unchanged.
3. **Erratum 9 (its measured half).** The Done spec's literal worked example
   (`:343`) has, as its third record, one `user` record carrying both a
   `tool_result` block and the person's `text` block. Over every array-valued
   Claude `user` record in the corpus — 11,884 of them — that mixed shape
   occurs **0** times (round record §2.4). The example still demonstrates a
   real rule (row A5e step 3: one record can both taint and supply dialogue)
   and its documented values are unchanged; it is a constructed shape, not
   one Claude Code was observed to write. (The other half the superseded spec
   drafted — the example's records being declined — belonged to the unbuilt
   decline rule and is dropped.)

## Current state

Every citation below re-derived at `main` = `67359a5e`, both ends printed.

- `docs/specs/done/WP-dream-primary-dialogue-projection.md` — 1,041 lines.
  - `:14-102` is the existing errata blockquote (Errata 1–6 and a
    "Recorded, not errata" paragraph); its last line, `:102`, is exactly
    `> the more complete reference.`
  - `:103` is blank; `:104` is exactly
    `<!-- errata above; the spec as it shipped follows -->`.
  - `:150` contains the anchor
    `Harness-authored and developer-authored instructions are not dialogue.`
  - `:343` contains the anchor
    ``Source file `/samples/claude-demo.jsonl`, four records:``
  - `:462` (row A5b) contains the anchor
    `is indistinguishable from a person's (see Implementation notes).`
  - `:563` contains the anchor `routine prompt from a human one.**`
  - Each of the four anchors occurs **exactly once** in the file; the strings
    `see Erratum 7`, `see Erratum 8` and `see Erratum 9` occur zero times.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/specs/done/WP-dream-primary-dialogue-projection.md | E0–E4 below, verbatim; no other byte changes |

### Exact contracts

`<DATE>` is the `YYYY-MM-DD` date of the implementation commit. It occurs in
E0 only.

**E0 continues the existing errata blockquote.** Directly after `:102`
(`> the more complete reference.`), insert one line that is exactly `>` and
then E0's lines, so the blank line and the `<!-- errata above … -->` comment
follow unchanged. (A blank line between two blockquotes fails markdownlint
MD028, which is why E0 is not a blockquote of its own.)

E0:

```text
> **Errata, <DATE> — filed by `WP-dream-projection-done-spec-errata`.**
> Numbered on from the six above. Measured on the owner's local corpus (334
> Claude transcript files, Claude Code 2.1.232–2.1.283; counts only) in
> `docs/specs/logbook/2026-09-26-projection-harness-user-records-design-review.md`
> §2.
>
> **Erratum 7 — "Harness-authored and developer-authored instructions are not
> dialogue" is not true of Claude `user` records the harness writes.** *What
> is wrong:* row A2 accepts every `user` record with no `isMeta` or
> `isSidechain` flag and `message.role` `"user"`, so a subagent's
> `<task-notification>` report, a slash-command echo and its local output, a
> `!` command's input and output, a compaction summary and an interruption
> marker all reach the dream as the person's words, flagged `false` — 1,103
> task notifications, 134 command echoes, 8 `!`-command records and 9
> compaction or interruption records on the corpus, beside 705 prompts. *What
> is true:* the sentence holds for Codex (row A3 accepts only
> `content_item_kinds` `"user.text"`) and for Claude `isMeta` records; for the
> Claude records above it is a **named gap**, kept by the owner's ruling of
> 2026-09-26 (`docs/specs/logbook/2026-09-27-owner-ruling-harness-records-option-iii.md`),
> which builds no decline rule. *Found:* the filter's offline evaluation,
> `docs/specs/logbook/2026-09-26-dream-primary-dialogue-filter-offline-evaluation.md`.
> **Class: a contract sentence the shipped rule does not implement, kept as a
> named gap.**
>
> **Erratum 8 — "no field … can tell a `claude -p` routine prompt from a human
> one" was measured on field NAMES.** *What was wrong:* the routine-prompt
> Implementation note and row A5b compared top-level field sets, which are
> identical. *What is true:* the VALUE of the top-level `promptSource` field
> differs — `"sdk"` on a `claude -p` prompt; `"typed"`, `"queued"` or
> `"suggestion_accepted"` on a person's — across the corpus's 25 Claude Code
> versions. No shipped code reads `promptSource`, so row A5b's contract is
> unchanged: `false` does not mean a human wrote the words. *Found:* the
> design round above, §2.3 and §5. **Class: a measurement that answered a
> narrower question than the sentence built on it.**
>
> **Erratum 9 — the literal worked example's third record is a constructed
> shape.** Its shape — a `tool_result` block and the person's `text` block in
> one `user` record — occurs in 0 of 11,884 array-valued Claude `user`
> records on the corpus (§2.4). The example still demonstrates row A5e step
> 3 (one record can both taint and supply dialogue), and its documented
> values are unchanged. **Class: an example that demonstrates a rule with a
> shape not observed in the wild.**
```

E1–E4 are each inserted **directly after** the anchor named, with one
leading space, in the same line. Each anchor occurs exactly once in the file.

E1 — after the anchor
`Harness-authored and developer-authored instructions are not dialogue.`
(`:150`):

```text
(**Not true of Claude `user` records the harness writes — a named gap; see Erratum 7.**)
```

E2 — in row A5b (`:462`), after the anchor
`is indistinguishable from a person's (see Implementation notes).`:

```text
(**By field set; the `promptSource` value distinguishes them — see Erratum 8.**)
```

E3 — in the routine-prompt Implementation note, after the anchor
`routine prompt from a human one.**` (`:563`):

```text
(**By field NAMES only — see Erratum 8.**)
```

E4 — after the anchor
``Source file `/samples/claude-demo.jsonl`, four records:`` (`:343`):

```text
(**The third record's shape is constructed — see Erratum 9.**)
```

## Contract reference (optional — mark N/A if this WP is not contract-dense)

N/A — one of seven triggers fires ((vii): E1–E4 restate E0), and the
verification script below enforces every fact exhaustively: it rebuilds the
expected file from the base and this spec's own blocks and anchors, and
requires byte equality.

## Implementation notes & constraints

- Copy E0–E4 **verbatim** from the fenced blocks above, replacing only
  `<DATE>`. Do not reflow, re-wrap or re-punctuate any existing line of the
  Done spec.
- The file uses typographic apostrophes in some rows and ASCII ones in
  others; the anchors above are exactly as printed (the `:462` anchor's
  `person's` is ASCII `'`). If an anchor does not occur exactly once, stop
  and report it rather than choosing a nearby line.
- `WP-dream-projection-notification-taint` depends on this package and files
  its own Erratum 10 after it; do not reserve or mention that number here.

## Security checklist (delete only if the WP touches no untrusted input)

N/A — docs only; no code reads untrusted input.

## Acceptance criteria

- [ ] **AC1** — E0 continues the errata blockquote directly after `:102`
      (through a line that is exactly `>`), and E1–E4 each sit directly after
      their anchor; `<DATE>` is replaced everywhere.
- [ ] **AC2** — the modified file equals the base file with exactly E0–E4
      inserted, each verbatim from this spec's blocks (`<DATE>` replaced):
      no other change.
- [ ] **AC3** — `npm run lint` passes (markdownlint over the modified file).
- [ ] Idempotence: `N/A — the package ships a docs edit, no command`.

## Verification steps (run these; paste output in the PR)

The first command checks AC1 and AC2 together. It rebuilds the expected file
from the base and **this spec's own fenced blocks** — E0 after its head line,
each of E1–E4 after its anchor as the prose above names it, `<DATE>` taken
from E0's header in the modified file — and requires the modified file to
equal that rebuild byte for byte. So a changed word inside a block, a marker
placed after another anchor, or any other byte changed all fail. Observed at
drafting, with E0–E4 applied to the file at `67359a5e` (round record
`docs/specs/logbook/2026-09-27-projection-notification-taint-design-review.md`
§10): applied → `errata: exact`; the base file (deliverable absent) → exit 1
(`E0 not found`); applied with "0 of 11,884" changed to "5 of 11,884" inside
E0 → exit 1; applied with one byte changed elsewhere → exit 1.

```bash
node - <<'EOF'
const fs = require('fs');
const { execSync } = require('child_process');
const fail = (m) => { console.error(m); process.exit(1); };
const S = fs.readFileSync('docs/specs/WP-dream-projection-done-spec-errata.md', 'utf8');
const F = 'docs/specs/done/WP-dream-primary-dialogue-projection.md';
const base = execSync(`git show "$(git merge-base HEAD main)":${F}`).toString();
const cur = fs.readFileSync(F, 'utf8');
const dm = /^> \*\*Errata, (\d{4}-\d{2}-\d{2}) — filed by `WP-dream-projection-done-spec-errata`\.\*\*$/m.exec(cur);
if (!dm) fail('E0 not found');
const block = (label) => {
  const m = new RegExp('\\n' + label + '(?::| — ([\\s\\S]*?):)\\n\\n```text\\n([\\s\\S]*?)\\n```\\n').exec(S);
  if (!m) fail(`${label} not found in the spec`);
  const a = m[1] && /after the anchor\s+(?:``\s?([\s\S]*?)\s?``|`([^`]*)`)/.exec(m[1]);
  return { body: m[2].replace(/<DATE>/g, dm[1]), anchor: a ? (a[1] ?? a[2]).replace(/\n/g, ' ') : null };
};
const insertAfter = (text, anchor, add) => {
  if (text.split(anchor).length !== 2) fail(`anchor not exactly once: ${anchor}`);
  return text.replace(anchor, () => anchor + add);
};
let want = insertAfter(base, '> the more complete reference.\n', '>\n' + block('E0').body + '\n');
for (const n of [1, 2, 3, 4]) {
  const { body, anchor } = block('E' + n);
  want = insertAfter(want, anchor, ' ' + body);
}
if (cur !== want) fail('the file is not the base plus E0-E4 verbatim');
console.log('errata: exact');
EOF
npm run lint
```

## Out of scope (do NOT do these)

- **Any change to `src/`, `tests/` or `skills/`** — nothing is built.
- **The notification-taint amendment** to row A5 —
  `WP-dream-projection-notification-taint`, which files its own erratum after
  this one.
- **The Codex arm's pre-0.151 rollouts** that project replies with no request
  (round record §2.8) — routed separately.
- **Any edit to the superseded spec or to a dated logbook entry.**

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `docs(specs): file Errata 7–9 against the primary-dialogue projection spec (WP-dream-projection-done-spec-errata)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
