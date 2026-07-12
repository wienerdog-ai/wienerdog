---
id: WP-080
title: Transcript extracts retain a skill-invocation signal (Claude parser)
status: Done
model: sonnet
size: M
depends_on: []
adrs: [ADR-0020]
branch: wp/080-transcript-skill-invocation-signal
---

# WP-080: Transcript extracts retain a skill-invocation signal (Claude parser)

## Context (read this, nothing else)

Wienerdog's nightly **dream** consolidates recent sessions into the user's
markdown **vault**. Before the dream runs, an orchestrator scans each harness's
on-disk session **transcripts** and turns each into a redacted, size-capped
**extract** — a JSON object the dream brain reads as quoted data. The extract
schema (defined in `src/core/transcripts/index.js`) is a `messages` array where
each message is `{ role: 'user' | 'assistant' | 'tool_result', text, ts }`.

A new feature (ADR-0020, "Skill revision lifecycle") lets the dream accumulate
per-skill learnings from *observed usage* and later revise skills. To observe
usage, the dream needs to know **which skills a session actually invoked and
whether the invocation errored**. Today the Claude parser
(`src/core/transcripts/claude.js`) **drops that signal entirely**: an assistant
message's `tool_use` blocks are filtered out (only `type: 'text'` blocks are
kept), so a `Skill` invocation leaves no trace in the extract. This WP adds a
**minimal** structured signal — the invoked skill's name plus whether its paired
tool result errored — and nothing more (no full tool-use/tool-result payload;
the input budget and the injection surface stay exactly as they are).

Two product invariants bound this WP. **Wienerdog is just files (ADR-0004):**
this is pure parsing code that a short-lived job runs; it starts nothing. **The
transcript is untrusted data (dream threat model):** the skill name is
model-authored control-plane metadata (the assistant chose a skill from the
installed set), and the errored flag is `tool_result` *metadata* (a boolean),
not `tool_result` free text — so this addition does **not** widen what free text
reaches the dream. Downstream provenance handling of this signal is WP-081's job,
not this WP's.

## Current state

`src/core/transcripts/claude.js` — `parseClaudeTranscript(filePath)` walks the
JSONL lines and, for `type: 'assistant'` messages, keeps only text blocks:

```js
} else if (obj.type === 'assistant') {
  const content = obj.message && obj.message.content;
  if (Array.isArray(content)) {
    const text = content
      .filter((block) => block && block.type === 'text')
      .map((block) => block.text)
      .join('\n\n');
    if (text !== '') {
      messages.push({ role: 'assistant', text, ts: obj.timestamp || null });
    }
  }
}
```

For `type: 'user'` messages it emits a `tool_result` message per `tool_result`
block:

```js
} else if (Array.isArray(content)) {
  for (const block of content) {
    if (block && block.type === 'tool_result') {
      messages.push({
        role: 'tool_result',
        text: flattenToolResultContent(block.content),
        ts: obj.timestamp || null,
      });
    }
  }
}
```

The function returns a raw Extract `{ harness, session_id, started, cwd,
source_path, truncated:false, messages }`. `src/core/transcripts/index.js`'s
`parse(entry)` then redacts + size-caps and returns `{ ...raw, truncated,
messages }` — so any extra top-level field a parser returns (e.g.
`skill_invocations`) flows through untouched.

The Extract `@typedef` lives in `src/core/transcripts/index.js` (lines ~7-15).

**Real transcript shapes** (verbatim structure the parser consumes):

- A `Skill` invocation is an assistant `tool_use` block:
  `{"type":"tool_use","id":"toolu_9","name":"Skill","input":{"skill":"daily-digest","args":"…"}}`
- Its result is a later `user`-message `tool_result` block keyed by the same id:
  `{"type":"tool_result","tool_use_id":"toolu_9","is_error":true,"content":[…]}`
  (`is_error` is `true`, `false`, or `null`).

The existing golden fixture `tests/fixtures/transcripts/claude-session.jsonl`
contains an assistant `tool_use` for `Read` (not `Skill`), which must continue to
produce **no** skill-invocation entry.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/transcripts/claude.js | detect `Skill` tool_use, id-pair its result (index → `resultIndex`, `is_error` → errored), emit `skill_invocations` `[{skill, index, resultIndex, errored}]` |
| modify | src/core/transcripts/index.js | extend the Extract `@typedef`; add + export `rebaseInvocations`; rebase `skill_invocations` in `parse()` under the message cap |
| modify | tests/fixtures/transcripts/claude-session.expected.json | add `"skill_invocations": []` (Read tool_use produces none) |
| create | tests/fixtures/transcripts/claude-skill-invocation.jsonl | new fixture: two `Skill` invocations, one erroring |
| create | tests/fixtures/transcripts/claude-skill-invocation.expected.json | expected extract with a populated `skill_invocations` array (incl. `resultIndex`) |
| modify | tests/unit/transcripts.test.js | fixture test; `rebaseInvocations` unit test; a >MAX_MESSAGES generated-transcript test asserting rebased indexes |

### Exact contracts

**Extract schema addition.** Every Claude extract gains a top-level
`skill_invocations` array (always present; `[]` when the session invoked no
skill). Each entry is exactly:

```jsonc
{ "skill": "daily-digest", "index": 4, "resultIndex": 4, "errored": false }
```

- `skill` — string, the invoked skill's name, read from the `tool_use` block's
  `input.skill`. It is emitted **only if** it is a string matching the strict
  grammar `^[a-z0-9][a-z0-9-]{0,63}$` (lowercase kebab, 1–64 chars). If
  `input.skill` is absent, not a string, or does not match the grammar, **emit no
  entry at all** for this invocation (no `"unknown"` placeholder, no fallback to
  any other field). There is **no `input.command` fallback** — that field's schema
  is unverified and may contain arguments or arbitrary text, so it is not read.
  The skill name is a control-plane identifier that downstream WPs (WP-081/082/084)
  match to ledger paths `<skills_dir>/<name>/` by name equality; the grammar is
  what makes it path-safe (no `/`, `\`, `..`, whitespace, or length blow-up) and
  spoof-resistant at that trust boundary. It is not redacted or otherwise
  transformed — it either passes the grammar verbatim or the invocation is omitted.
- `index` — integer, the **0-based position in this extract's `messages` array**
  of the first message emitted after the invoking assistant turn (i.e.
  `messages.length` at the moment the `Skill` `tool_use` block is collected). This
  is the invocation's place in the message timeline; WP-084 uses it as the start of
  the invocation **window** (from this `index` to the next invocation's `index`, or
  the end of the extract). A small non-negative array index, never a path/command.
- `resultIndex` — integer or `null`, the **0-based `messages` position of this
  invocation's OWN paired `tool_result`** — the message pushed when the parser sees
  the `tool_result` block whose `tool_use_id` matches this `Skill` `tool_use`. This
  is captured by the parser's existing id-pairing (the same pairing that sets
  `errored`), NOT inferred by position — so a batched external tool call (e.g.
  `Read`) whose result lands *before* the skill's cannot be mistaken for it. `null`
  when the paired result was never captured (e.g. the transcript ended first).
  WP-084 excludes EXACTLY `messages[resultIndex]` from window-taint and **fails
  closed** (session untrusted) when it is `null` or outside the window.
- `errored` — boolean. `true` iff the paired `tool_result` block (matched by
  `tool_use_id === <this tool_use's id>`) has `is_error === true`. Default
  `false` (covers `is_error` being `false`, `null`, absent, or no paired result
  found — e.g. a truncated transcript). A `tool_result` whose id maps to an
  omitted invocation (grammar-failing name) has nowhere to record, so it no-ops.
- Entries appear in **invocation order** (the order the emitted `tool_use` blocks
  are encountered while walking the file).

Only `tool_use` blocks with `name === 'Skill'` **and** a grammar-conforming
`input.skill` produce an entry. All other `tool_use` blocks (Read, Bash, …), and
`Skill` blocks with a missing/non-conforming name, are ignored — the former
exactly as today, the latter silently (no entry).

**Codex is unchanged.** `src/core/transcripts/codex.js` is NOT modified: Codex
`$skill-name` invocations already survive as plain text in `user`/`assistant`
messages, so Codex extracts simply carry no `skill_invocations` key. Do not add
the field to the Codex parser or touch `codex-rollout.expected.json`.

**`claude.js` implementation sketch** (the parser gains an ordered list + an
id→index map so a later `tool_result` can set `errored`):

```js
// Strict control-plane identifier grammar (fully anchored, JS `$` needs no `m`).
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const skillInvocations = [];
const pendingByToolUseId = new Map(); // tool_use_id -> index in skillInvocations

// in the assistant branch, alongside the existing text extraction:
for (const block of content) {
  if (block && block.type === 'tool_use' && block.name === 'Skill') {
    const input = block.input || {};
    // Emit ONLY a grammar-conforming input.skill. No input.command fallback, no
    // "unknown" placeholder — a bad/absent name means no entry for this block.
    if (typeof input.skill !== 'string' || !SKILL_NAME_RE.test(input.skill)) continue;
    // index = the invocation's place in the message timeline (0-based position of
    // the first message emitted after this assistant turn). resultIndex is filled
    // in below, when the paired tool_result is pushed.
    const pos = skillInvocations.push({ skill: input.skill, index: messages.length, resultIndex: null, errored: false }) - 1;
    if (block.id) pendingByToolUseId.set(block.id, pos);
  }
}

// in the user branch, the existing loop pushes each tool_result as a message —
// keep that push, and ALSO pair it to a captured Skill invocation by tool_use_id:
if (block && block.type === 'tool_result') {
  messages.push({ role: 'tool_result', text: flattenToolResultContent(block.content), ts: obj.timestamp || null });
  const pos = pendingByToolUseId.get(block.tool_use_id);
  if (pos !== undefined) {
    // The paired result's OWN message index (just pushed) — WP-084 excludes exactly
    // this message from window-taint. Id-pairing, not position, is authoritative.
    skillInvocations[pos].resultIndex = messages.length - 1;
    if (block.is_error === true) skillInvocations[pos].errored = true;
  }
}

// return { …existing fields…, skill_invocations: skillInvocations };
```

The additions are (1) the `SKILL_NAME_RE` constant, (2) collecting
grammar-conforming `Skill` tool_use blocks in the assistant branch (with
`resultIndex: null`), and (3) in the user branch, recording the paired result's
message index (`resultIndex`) and `errored` when that `tool_result` is pushed.
Return `skill_invocations` as a new field on the raw Extract object.

**`index.js` `@typedef` addition** — add one property line to the Extract typedef:

```js
 *  @property {Array<{skill:string, index:number, resultIndex:number|null, errored:boolean}>} [skill_invocations]  // Claude only; each Skill tool_use: name, timeline index, its paired result's index (null if uncaptured), whether it errored
```

**`index.js` `parse()` MUST rebase `skill_invocations` under the message cap.**
`parse()` front-truncates when `messages.length > MAX_MESSAGES` (2000) via
`messages = messages.slice(messages.length - MAX_MESSAGES)`, dropping the LEADING
messages. Today it spreads `...raw`, so `skill_invocations` keeps its **raw**
indexes — after front truncation every index is off by the dropped count, and
invocations past the retained tail produce empty windows that WP-084 would read as
clean (a padded session hides a poisoned window). Fix: transform the invocations
together with the messages. Add a pure, exported helper and call it in `parse()`:

```js
/**
 * Rebase skill_invocations after `dropped` leading messages were removed: subtract
 * `dropped` from index and resultIndex, and DROP any invocation whose window is no
 * longer fully retained (its index fell below 0; a non-null result fell below 0).
 * @param {Array<{skill:string,index:number,resultIndex:number|null,errored:boolean}>} invocations
 * @param {number} dropped
 * @returns {typeof invocations}
 */
function rebaseInvocations(invocations, dropped) {
  return invocations
    .map((si) => ({ ...si, index: si.index - dropped, resultIndex: si.resultIndex == null ? null : si.resultIndex - dropped }))
    .filter((si) => si.index >= 0 && (si.resultIndex === null || si.resultIndex >= 0));
}
```

In `parse()`, when the count cap fires, compute `dropped` BEFORE slicing and rebase
(only for Claude, which has the array):

```js
let rebased; // set only when the count cap fires
if (messages.length > MAX_MESSAGES) {
  const dropped = messages.length - MAX_MESSAGES;
  messages = messages.slice(dropped);
  truncated = true;
  if (Array.isArray(raw.skill_invocations)) rebased = rebaseInvocations(raw.skill_invocations, dropped);
}
const out = { ...raw, truncated, messages };
if (rebased !== undefined) out.skill_invocations = rebased; // else `...raw` carries the untouched array (or none for Codex)
return out;
```

(Per-message char-capping never changes the message COUNT, so only the count cap
shifts indexes.) Export `rebaseInvocations` from `index.js`.

**Capping invariant (state it verbatim in a code comment):** *after capping, every
emitted `index`/`resultIndex` refers to the exact `messages` array written to the
extract; front-truncation subtracts the dropped-leading count from both, and any
invocation whose window (invocation through its paired result) is not fully retained
is dropped.*

**New fixture `claude-skill-invocation.jsonl`** — one session, **three** `Skill`
invocations: `wienerdog-setup` (succeeds), `daily-digest` (errors), and a THIRD
whose `input.skill` fails the grammar (use `input.skill: "Bad Name/../x"`) which
must produce **no** entry — the omission behavior finding E adds. Plus one
ordinary text turn so the messages array is non-trivial. Author it in the exact
JSONL shape of `claude-session.jsonl` (one JSON object per line). It must produce
this extract (this is `claude-skill-invocation.expected.json`, minus
`source_path`, which the test checks separately) — note the grammar-failing third
invocation leaves `skill_invocations` at exactly two entries:

```json
{
  "harness": "claude",
  "session_id": "sess-skill",
  "started": "2026-02-01T09:00:00.000Z",
  "cwd": "/home/ada/proj",
  "truncated": false,
  "messages": [
    { "role": "user", "text": "set up my memory", "ts": "2026-02-01T09:00:00.000Z" },
    { "role": "assistant", "text": "Starting setup.", "ts": "2026-02-01T09:00:02.000Z" },
    { "role": "tool_result", "text": "setup complete", "ts": "2026-02-01T09:00:03.000Z" },
    { "role": "assistant", "text": "Now the digest.", "ts": "2026-02-01T09:00:05.000Z" },
    { "role": "tool_result", "text": "no google grant", "ts": "2026-02-01T09:00:06.000Z" },
    { "role": "assistant", "text": "Trying a variant.", "ts": "2026-02-01T09:00:08.000Z" }
  ],
  "skill_invocations": [
    { "skill": "wienerdog-setup", "index": 2, "resultIndex": 2, "errored": false },
    { "skill": "daily-digest", "index": 4, "resultIndex": 4, "errored": true }
  ]
}
```

The `index` values follow from the walk: `wienerdog-setup`'s `tool_use` is
collected after its assistant text "Starting setup." is pushed (messages 0,1
present → `index` 2); its paired result "setup complete" is the next message pushed
→ `resultIndex` 2. `daily-digest`'s `tool_use` is collected after "Now the digest."
(messages 0–3 → `index` 4); its paired result "no google grant" is pushed next →
`resultIndex` 4. (Here each `index` equals its `resultIndex` because the result is
the first message after the invoking turn; the fields differ when other tool
results are interleaved.) The grammar-failing third invocation is dropped, so it
gets no entry.

Design the JSONL so it yields exactly the above: the first assistant message
carries the `Skill`/`wienerdog-setup` tool_use (`id: "toolu_a"`) alongside its
text; the following user message carries `wienerdog-setup`'s result
(`tool_use_id: "toolu_a"`, `is_error: false`); the second assistant message
carries the `Skill`/`daily-digest` tool_use (`id: "toolu_b"`) alongside its text;
the following user message carries `daily-digest`'s result (`tool_use_id:
"toolu_b"`, `is_error: true`). Add a third assistant message with the text
`"Trying a variant."` (`ts: 2026-02-01T09:00:08.000Z`) that ALSO carries a
`Skill` tool_use with `input.skill: "Bad Name/../x"` (`id: "toolu_c"`) and NO
paired `tool_result` — its name fails the grammar so it yields no
`skill_invocations` entry, while its text turn still appears in `messages` (the
sixth entry above). Set `sessionId: "sess-skill"`, `cwd: "/home/ada/proj"`, and
the timestamps above.

**Test addition** in `tests/unit/transcripts.test.js` (mirror the existing
"Claude golden extract matches fixture" test exactly):

```js
test('parse: Claude skill-invocation extract matches fixture', () => {
  const inputPath = path.join(fixturesDir, 'claude-skill-invocation.jsonl');
  const expected = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, 'claude-skill-invocation.expected.json'), 'utf8'),
  );
  const extract = parse({ harness: 'claude', path: inputPath });
  assert.deepEqual(withoutSourcePath(extract), expected);
  assert.equal(extract.source_path, inputPath);
});
```

**Capping-rebase tests** (import `rebaseInvocations` and `MAX_MESSAGES`):

```js
test('rebaseInvocations: shifts survivors and drops fallen-off invocations', () => {
  const inv = [
    { skill: 'a', index: 1, resultIndex: 2, errored: false },   // dropped: 1-5 < 0
    { skill: 'b', index: 7, resultIndex: 8, errored: false },   // survives → 2, 3
    { skill: 'c', index: 9, resultIndex: null, errored: false },// survives → 4, null result kept
  ];
  assert.deepEqual(rebaseInvocations(inv, 5), [
    { skill: 'b', index: 2, resultIndex: 3, errored: false },
    { skill: 'c', index: 4, resultIndex: null, errored: false },
  ]);
});

test('parse: skill_invocations are rebased to the retained messages under the cap', () => {
  // Build a transcript with >MAX_MESSAGES leading text turns, then ONE Skill
  // invocation + its result as the final events. After the front-truncation the
  // surviving invocation's index/resultIndex must point at the retained tail.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-cap-'));
  const p = path.join(dir, 'big.jsonl');
  const lines = [];
  const pad = MAX_MESSAGES + 5; // this many leading user text messages
  for (let i = 0; i < pad; i++) {
    lines.push(JSON.stringify({ type: 'user', sessionId: 's', cwd: '/x', timestamp: '2026-02-01T00:00:00.000Z', message: { role: 'user', content: `pad ${i}` } }));
  }
  lines.push(JSON.stringify({ type: 'assistant', sessionId: 's', cwd: '/x', timestamp: '2026-02-01T00:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'run it' }, { type: 'tool_use', id: 'toolu_z', name: 'Skill', input: { skill: 'foo' } }] } }));
  lines.push(JSON.stringify({ type: 'user', sessionId: 's', cwd: '/x', timestamp: '2026-02-01T00:00:02.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_z', is_error: false, content: [{ type: 'text', text: 'done' }] }] } }));
  fs.writeFileSync(p, lines.join('\n') + '\n');
  const extract = parse({ harness: 'claude', path: p });
  assert.equal(extract.messages.length, MAX_MESSAGES);
  assert.equal(extract.skill_invocations.length, 1);
  const si = extract.skill_invocations[0];
  // Rebased onto the retained tail: index/resultIndex are in-range and the paired
  // result lands on the real 'done' tool_result (not a stale raw offset).
  assert.ok(Number.isInteger(si.index) && si.index >= 0 && si.index < MAX_MESSAGES);
  assert.ok(Number.isInteger(si.resultIndex) && si.resultIndex < MAX_MESSAGES);
  assert.equal(extract.messages[si.resultIndex].text, 'done');
});
```

(The second test needs `os` in scope — it is already imported in
`transcripts.test.js`.)

## Implementation notes & constraints

- **Zero new dependencies**; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- The `claude-session.expected.json` change is a **deliberately authorized golden
  update** (this spec explicitly permits it, per CLAUDE.md's "update golden
  fixtures ONLY when your spec says so"). The only change is adding
  `"skill_invocations": []`; do not alter its `messages`.
- **Verify the live tool shape before coding — this is now load-bearing.** The
  `name === 'Skill'` literal and the `input.skill` field are designed against
  **current Claude Code** and could not be re-verified against a live transcript
  in the spec. With the strict grammar and no fallback, a wrong tool name or field
  would silently emit **zero** entries and the whole feature would be dead with no
  error. Before implementing, spot-check a real Claude Code transcript (a `.jsonl`
  under `~/.claude/projects/…` from a session that ran a `/`-skill) to confirm the
  `tool_use` `name` is `"Skill"` and the invoked name is at `input.skill`. Mirror
  `codex.js`'s honesty convention with a one-line comment recording what you
  verified. If the real transcript shows a different tool name/field, note it
  under "Discovered issues" and use the verified field; do not add a speculative
  fallback.
- Keep the change surgical: do not refactor the existing text/tool_result
  extraction, do not change redaction, caps, or `discover`.
- When uncertain, choose the simpler option and record it under "Decisions
  made"; do not expand scope.

## Security checklist

- [ ] The emitted skill name is constrained by the fully-anchored grammar
      `^[a-z0-9][a-z0-9-]{0,63}$` (JS `$` needs no `m` flag), which rejects `/`,
      `\`, `..`, whitespace, and over-long strings — so the model-authored name
      cannot become a path-traversal or spoofing primitive when WP-081/082 use it
      as a `<skills_dir>/<name>/` path segment and match it to ledgers by equality.
      A non-conforming or absent name emits no entry (no `"unknown"`, no fallback).
- [ ] The `input.command` fallback is removed: its schema is unverified and may
      carry arguments or arbitrary text, so it is never read.
- [ ] No `tool_result` free text is newly retained: only the boolean `is_error`,
      the paired result's `messages` INDEX (not its text), and the grammar-validated
      `input.skill` string. The input budget and injection surface are unchanged.
- [ ] `resultIndex` comes from the parser's `tool_use_id` pairing (authoritative),
      NOT from positional inference — so a batched external tool call whose result
      lands before the skill's cannot be mistaken for the skill's own result. Under
      the message cap, every emitted index is rebased so it refers to the exact
      `messages` array written to the extract (no stale/out-of-range index reaches
      WP-084, which would otherwise read a padded session's poisoned window as clean).

## Acceptance criteria

- [ ] A Claude extract always has a `skill_invocations` array; it is `[]` for a
      session with no `Skill` invocation (proved by `claude-session.expected.json`).
- [ ] Each `Skill` invocation with a grammar-conforming `input.skill` yields one
      `{skill, index, resultIndex, errored}` entry, in invocation order; `index` is
      `messages.length` when the `tool_use` is collected; `resultIndex` is the
      `messages` position of the id-paired `tool_result` (or `null` if uncaptured);
      `errored` is `true` iff that result has `is_error:true` (proved by the
      fixture's `index`/`resultIndex` 2 and 4).
- [ ] Under the message cap, `parse()` rebases `skill_invocations` to the retained
      `messages` (subtract dropped-leading count from `index`/`resultIndex`; drop
      any invocation whose window is not fully retained) — proved by the
      `rebaseInvocations` unit test and the >MAX_MESSAGES parse test. Every emitted
      index refers to the exact array written to the extract.
- [ ] A `Skill` invocation with an absent or non-conforming `input.skill`
      (grammar `^[a-z0-9][a-z0-9-]{0,63}$`) yields **no** entry — proved by the
      third invocation in `claude-skill-invocation.jsonl` (name `Bad Name/../x`).
- [ ] There is no `"unknown"` placeholder and no `input.command` fallback anywhere.
- [ ] Non-`Skill` `tool_use` blocks (Read/Bash/…) produce no entry.
- [ ] Codex extracts and `codex-rollout.expected.json` are unchanged.
- [ ] `npm test -- --test-name-pattern transcripts` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern transcripts
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any change to `src/core/transcripts/codex.js` or its golden.
- Any dream-skill prose that *consumes* the signal — that is **WP-081**.
- Any provenance/gate/`validate.js` logic — WP-081 (ledger) / WP-082 (revision).
- Retaining full tool_use/tool_result payloads, tool arguments, or per-message
  annotations beyond the three `{skill, index, errored}` fields.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/080-transcript-skill-invocation-signal`; conventional commits;
   PR titled `feat(transcripts): retain skill-invocation signal (WP-080)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Done record (2026-07-12)

Merged to main as `40ba34e` (PR #80, squash) + fix `6b69053`. Double gate per
docs/runbooks/codex-review.md: wd-reviewer APPROVE (fixture byte-matches the
spec's literal JSON; grammar constant, id-based resultIndex pairing, and
no-new-injection-surface all verified); Codex PR review found one real P1 —
the spec's own pinned `rebaseInvocations` sketch filtered only the left edge,
so an invocation as the final raw event of an over-cap transcript survived
with `index === MAX_MESSAGES` (out of range). Fixed at the call site (the
spec-pinned helper kept byte-identical), regression test added. Codex
re-review's P2 (keep capped trailing invocations as null-result markers) was
REJECTED against the spec's explicit drop rule — disposition recorded on the
PR. Spec correction note: the pinned sketch carried the P1; it survived seven
design-review rounds and was caught only at PR review — boundary-check pinned
code sketches in both roles. Live-transcript verification confirmed
`tool_use.name === "Skill"` / `input.skill` / `tool_use_id` pairing on real
sessions before coding.
