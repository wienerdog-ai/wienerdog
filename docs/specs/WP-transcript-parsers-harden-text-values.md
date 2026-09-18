---
id: WP-transcript-parsers-harden-text-values
title: Make the default transcript parsers decline a non-string text value instead of throwing or inventing dialogue
status: Draft
model: opus
size: M
depends_on: [WP-dream-collect-parse-throw-quarantine]
adrs: [ADR-0004, ADR-0005, ADR-0023, ADR-0031, ADR-0042]
epic: transcript-fault-boundary
---

# WP-transcript-parsers-harden-text-values: Make the default transcript parsers decline a non-string text value instead of throwing or inventing dialogue

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog's core function is the **dream**: a nightly, scheduled run that reads
the session transcripts two AI coding harnesses leave on disk — Claude Code's
`~/.claude/projects/<project>/<uuid>.jsonl` and Codex CLI's
`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` — and consolidates them into the
user's markdown memory vault. **Wienerdog is just files (ADR-0004):** the dream
runs and exits; there is no daemon, no server and no telemetry, and nothing in
this work package may introduce one. There are no runtime npm dependencies; this
package adds none.

**Transcript content is fully attacker-influenceable.** A transcript records
whatever a web page, a repository, a dependency's README or a tool's output put
in front of the model, and any of those parties can put arbitrary bytes — and
arbitrary JSON *shapes* — into the file. The two default parsers,
`src/core/transcripts/codex.js` and `src/core/transcripts/claude.js`, assemble a
message's text by filtering a `content` array to the text-bearing blocks and
joining their `.text` with `Array.prototype.join`. **`join` coerces, and there is
no string check at any of the four sites.** So a block whose `text` is not a
string does one of two wrong things, both measured on this tree:

- **it throws.** `{"toString":null}` makes the join raise
  `TypeError: Cannot convert object to primitive value`, which escapes the parse.
- **it invents dialogue.** A plain `{}` becomes the literal `"[object Object]"`
  in the user's memory; a number becomes its digits; `null` and `undefined`
  become empty strings; an array becomes its comma-joined elements. None of that
  is anything anyone said, and all of it is durable — it flows into the vault.

The throwing half of that is already **contained**, and containment is not a
fix. `WP-dream-collect-parse-throw-quarantine` (PR #271, merged `900dd6d4`) put
a per-candidate fault boundary around the dream collector's admission loop: a
transcript whose preparation throws is set aside under a new quarantine reason,
`parse-threw`, and the run continues over every other session. That stopped one
crafted file from ending every nightly run forever. It did **not** stop the file
from being lost, and it did nothing at all about invented dialogue, which never
throws. Its own Out of scope names this package: *"Hardening the parsers
themselves — adding `typeof … === 'string'` checks to the four content joins."*

**The rule this package adopts is already in the tree, written down and
proved.** `src/core/transcripts/primary-dialogue.js` — the primary-dialogue
projection added by `WP-dream-primary-dialogue-projection` — joins text blocks
through `joinTextBlocks` (`:81-86`), whose filter is
`block.type === 'text' && typeof block.text === 'string'`, and whose JSDoc
(`:67-80`) states the reason in terms: *"A non-string `text` is not a text value,
so row A2 has nothing to accept and the block is declined … Without the check,
`Array.prototype.join` COERCES … Dialogue is never invented and this never
throws."* This package makes the **default** parsers obey the same rule, so the
two readings of the same file agree instead of disagreeing.

**Every rule here is an acceptance allowlist.** We state the one shape of `text`
we accept — a string — and decline everything else, whatever it is and whenever
it is invented. A list of the bad shapes would be an enumeration over someone
else's grammar and could never be closed.

## Current state

**Base: `08de2bc335baa4a97bba2f33bca224f2f3a28517`** (`main` after PR #274).
Every citation below was derived **construct by construct** at that tip, both
ends of every range checked. Every behavioral claim below was **executed** on
that tip while drafting; the numbers are measurements, not estimates.

### The four sites

All four have the same shape — a `.filter(…)` that tests the block's `type` but
not its `text`, then `.map((block) => block.text)`, then `.join(<separator>)`:

| # | File and lines | Construct | Reached by |
|---|----------------|-----------|------------|
| 1 | `src/core/transcripts/codex.js:79-82` | `extractMessageText`'s join — filter `:80`, map `:81`, `.join('\n')` `:82` | any Codex `response_item` whose payload `type` is `message`, via `mapCodexItem` (`:110-125`) |
| 2 | `src/core/transcripts/codex.js:92-95` | `extractToolOutputText`'s array branch — guard `:91`, filter `:93`, map `:94`, `.join('\n')` `:95` | any Codex payload whose `type` is in `TOOL_OUTPUT_TYPES` (`:67-74`) and whose `content` is an array |
| 3 | `src/core/transcripts/claude.js:60-63` | `flattenToolResultContent`'s array branch — guard `:59`, filter `:61`, map `:62`, `.join('\n')` `:63` | a Claude `tool_result` block whose `content` is an array |
| 4 | `src/core/transcripts/claude.js:175-178` | the assistant text join — filter `:176`, map `:177`, `.join('\n\n')` `:178` | any Claude `assistant` record whose `message.content` is an array (`:172-174`) |

### The rule to mirror

`src/core/transcripts/primary-dialogue.js:81-86`, in full:

```js
function joinTextBlocks(blocks, separator) {
  return blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join(separator);
}
```

It **declines the block** — the block contributes no text — and does not
suppress the record. Its JSDoc (`:71-74`) says so: *"row A5c-blocks says in terms
that 'a block whose type is decided but which A2/A3 decline never taints', so
this is a decline, not a gap."* The **record-level** consequence is decided by
each call site's own pre-existing emptiness rule, which this package does not
touch: in the projection, `parseClaudePrimary` (`:191`, `:198`) turns an empty
join into `null`.

The same split holds at the four default-parser sites, and it is the reason the
change is four one-line filter conditions and nothing else:

- **Site 1** feeds `mapCodexItem`, which returns
  `{role, text: extractMessageText(payload), ts: null}` unconditionally; the push
  at `codex.js:201-202` is `if (mapped) messages.push(mapped)`. So a Codex
  message all of whose blocks decline is still emitted, **with `text: ''`** —
  which is exactly what a Codex message carrying only an `input_image` block
  does today. Unchanged behavior, newly reachable.
- **Site 4** is guarded by `claude.js:179`'s `if (text !== '')`, so a Claude
  assistant record all of whose text blocks decline emits **no** assistant
  message — which is exactly what an assistant record carrying only `tool_use`
  blocks does today. Unchanged behavior, newly reachable.
- **Sites 2 and 3** produce a tool-output string that is already allowed to be
  `''`; `extractToolOutputText`'s own JSDoc (`:85-87`) says the item is *"STILL
  emitted as tool_result (untrusted), never dropped or trusted."*

### What is already declared against these files, and must not be disturbed

`tests/red-proofs/primary-dialogue.proofs.json` declares ten ADR-0042 mutations.
**Two of them target files this package edits or resembles:**

- `pdp-ac3b-depth-limit-notification-removed`, whose `file` is
  `src/core/transcripts/claude.js` and whose `find` is the four-line
  `maxJsonDepth` guard block, `occurrences: 1`. **None of sites 3 and 4 is in
  that block**, so the intended change leaves it alone.
- `pdp-ac3c-text-value-string-check-removed`, whose `file` is
  `src/core/transcripts/primary-dialogue.js` and whose `find` is exactly
  `primary-dialogue.js:83` — four leading spaces followed by
  `.filter((block) => block.type === 'text' && typeof block.text === 'string')` —
  at `occurrences: 1`. That is a **different file** from the two this package edits,
  so a hardened line in `claude.js` cannot change its count — but
  `primary-dialogue.js` is **not** in the Deliverables, and this is the reason:
  re-spelling that one line would leave the declaration unapplicable and the
  unfiltered proof run would report `ERROR`, silently removing a sibling
  package's guarantee. This is a repeat of
  `WP-dream-collect-parse-throw-quarantine`'s Erratum 5, where an implementation
  note that re-spelled a pinned line did exactly that.

**No declaration in any `tests/red-proofs/*.proofs.json` has a `find` that
overlaps any of the four sites** — checked at this tip by reading every
declaration whose `file` is under `src/core/transcripts/`, which is the ten
above.

### What the change breaks, MEASURED

The four filter conditions were applied to this tip and `npm test` was run in
full. The result:

- **Zero golden files change.** `tests/golden/` holds `claude-adapter/CLAUDE.md`,
  `codex-adapter/AGENTS.md`, `digest-default.md` and `vault-default/` —
  harness-config, digest and vault outputs, no transcript-parse output.
- **Zero tests break anywhere except `tests/unit/dream-collect.test.js`.**
- **Exactly three tests break, and all three are in the `[PT-` suite that
  `WP-dream-collect-parse-throw-quarantine` shipped:**
  `[PT-1]` (`:1705`), `[PT-4]` (`:1782`) and `[PT-6]` (`:1829`). All three build
  their crafted corpus from the fixture
  `tests/fixtures/dream/transcripts/codex-poisoned-text-block.jsonl`, via the
  suite helper `writeCraftedCodex(paths, name, fixture, when)`, and all three
  assert that the crafted file lands in `newlyQuarantined` with
  `reason === 'parse-threw'`. Once site 1 is hardened, that fixture parses
  cleanly and is **admitted** instead, so the assertions fail — loudly and by
  design. Its Implementation notes predicted exactly this.
- **`[PT-3]` (`:1758`) does NOT break, and that correction matters.** The filed
  spec's note predicted that *both* of its fixtures would stop throwing. That is
  true only of a hardening that also constrains the **metadata** fields, which
  this package does not do (see Out of scope). `[PT-3]`'s fixture,
  `codex-poisoned-session-id.jsonl`, carries a `session_meta.payload.id` of
  `{"toString":null}`; every one of its `text` values is an ordinary string, so
  it **parses cleanly today** and throws later, at `sanitize(extract.session_id)`
  during scratch-filename derivation. This package changes nothing on that path.
  Measured: `[PT-3]` passes before and after.
- **`[PT-2]` (`:1727`) does not break either**, because it does not use a
  fixture at all: it installs a seam mock —
  `t.mock.method(transcripts, 'parsePrimaryWithOutcome', …)` that throws for one
  candidate keyed by basename — and is the fixture-independent proof the filed
  spec kept precisely so the boundary could not go unproved when the parsers were
  hardened.

### The parse output that changes

Across **all 17** committed transcript `.jsonl` fixtures — the three corpora
`tests/fixtures/dream/transcripts/`, `tests/fixtures/primary-dialogue/` and
`tests/fixtures/transcripts/` — `parse()` and `parseWithOutcome()` were captured
before and after the change. **Exactly one entry differs**, and it is
`codex-poisoned-text-block.jsonl`: it goes from throwing a `TypeError` to
returning the extract pinned in Table B row B3. The other sixteen are identical.

### What the hardening does NOT reach: transcripts already quarantined

`selectState` (`src/core/dream/ledger.js:235-263`) answers `'skip-quarantined'`
for **any** quarantined record whose `fingerprint` still matches the file — the
reason is consulted only by the sticky `secret-revert-exhausted` arm above it —
and `collectExtracts` applies that answer **before** the parse call. So a
`parse-threw` record written by a build without this package keeps its file out
of every later run, and the hardened parser never sees it. **Removing the record
is not a fix** — the no-record path consults `baseline_mtime` first
(`ledger.js:260-261`) and answers `skip-processed` for any file at or below it;
the companion therefore converts the record to a retryable `deferred` one rather
than deleting it (its Table A rows A1 and A9).

**That population is live.** Tag `v0.14.0` is `1f546baa` (2026-09-18 14:14
+0200); it has the parse-throw merge `900dd6d4` as an ancestor,
`git grep -c parse-threw v0.14.0 -- src/core/dream/scratch.js` is 2, and the npm
registry gives `0.14.0` a publish time of 2026-09-18T12:26:43Z. A published
build therefore emits `parse-threw` with the unhardened parsers today.

**And no user action clears it.** `recordQuarantined` (`:326-334`) writes
`{fingerprint, outcome, reason, updated_at, harness}` — no version; `appVersion`
exists in this file only on `oversizedExtracts` memo entries (`:103`,
`:118-125`). `readLedger` (`:139-157`) hard-pins `version: 1` and never reads
`obj.version`; `writeLedger` (`:160-177`) serializes exactly
`{version, baseline_mtime, files, oversizedExtracts?}`, dropping any other
top-level key. Nothing in `src/` ships an un-quarantine, forget or retry
affordance — `ledger.js:483-487` records that as a standing decision — and a
completed transcript's fingerprint does not change on its own. **Table E decides
what follows from this; no code in this package changes on account of it.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/transcripts/codex.js | Table A rows A1 and A2 — sites 1 and 2. One filter condition each; no other change to this file |
| modify | src/core/transcripts/claude.js | Table A rows A3 and A4 — sites 3 and 4. One filter condition each; no other change to this file |
| modify | tests/unit/transcripts.test.js | Whatever acceptance criteria 1, 2 and 3 require in this file. Criterion 3 is the first law (Table B) |
| modify | tests/unit/dream-collect.test.js | Table C — the retarget of `[PT-1]`, `[PT-4]` and `[PT-6]`. No other test in this file changes |
| create | tests/fixtures/transcripts/parse-baseline.snapshot.json | Table B rows B1–B3. Generated at the BASE commit, before any source edit |
| create | tests/red-proofs/transcripts-harden-text-values.proofs.json | Table D — `suite` is `tests/unit/transcripts.test.js` |
| modify | tests/red-proofs/dream-collect-parse-throw.proofs.json | Permission grant, not an instruction. Table C row C4 states the shape under which this file needs **no** edit; touch it only if criterion 6 cannot otherwise be met, and say so under "Decisions made" |

### Exact contracts

Each of the four sites gains **one** conjunct in its existing `.filter(…)`
predicate and changes in no other way. Site 1 after the change, as the shape all
four take:

```js
/** Join a message item's input_text/output_text content blocks. */
function extractMessageText(payload) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content
    .filter((block) => block && (block.type === 'input_text' || block.type === 'output_text') && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}
```

No exported signature changes. `parse`, `parseWithOutcome`,
`parsePrimaryWithOutcome`, `mapCodexItem` and `TOOL_OUTPUT_TYPES` keep their
current shapes, and `src/core/transcripts/index.js` is not edited.

## Contract reference

The ADR-0031 activation trigger fires on **four** of the seven tests, so the
discipline is on: (iii) **structured input parsing / payload acceptance**
changes — a block shape that was accepted by coercion is now declined; (iv)
**error behavior** changes — a `TypeError` that escaped the parse no longer
occurs at these sites; (v) the task **crosses an authority boundary** — the
parsers emit the extract while the dream collector, the quarantine ledger and
the primary-dialogue projection each own their own interpretation of it, and one
of those consumers' shipped tests must be retargeted by this package; (vii) the
**same contract appears in multiple mirrored surfaces**, enumerated in the
checklist below. Operative prose cites the tables rather than restating them.

### Contract table(s)

**Table A — the text-value acceptance rule.** The single place its facts are
decided. It is an **allowlist**: one accepted shape is named and everything else
declines. No row anywhere in this spec enumerates a rejected shape as the rule;
the shapes named under Context are the measured symptoms that motivated it, not
its definition.

| Row | Fact / rule | Value |
|-----|-------------|-------|
| A0 | The rule | A content block contributes text to a join **if and only if** its `text` is a string (`typeof block.text === 'string'`), in addition to every condition that site's filter already applies. A block that does not satisfy it is **declined**: it contributes nothing, it is not coerced, and it does not throw. This is `src/core/transcripts/primary-dialogue.js:83`'s rule, applied verbatim at four more sites; it is stated once here and cited, never restated. |
| A1 | Site 1 | `src/core/transcripts/codex.js:80` — `extractMessageText`'s filter gains row A0's conjunct. |
| A2 | Site 2 | `src/core/transcripts/codex.js:93` — `extractToolOutputText`'s array-branch filter gains row A0's conjunct. |
| A3 | Site 3 | `src/core/transcripts/claude.js:61` — `flattenToolResultContent`'s array-branch filter gains row A0's conjunct. |
| A4 | Site 4 | `src/core/transcripts/claude.js:176` — the assistant text join's filter gains row A0's conjunct. |
| A5 | Block-level, not record-level | A decline drops **the block**, never the message and never the record. Nothing about which records are emitted is decided by this package: each site's existing emptiness rule is untouched, and the three that exist are `codex.js:201-202`'s `if (mapped) messages.push(mapped)` (so a Codex message whose blocks all decline is still emitted, with `text: ''`), `claude.js:179`'s `if (text !== '')` (so a Claude assistant record whose text blocks all decline emits no assistant message), and `extractToolOutputText`'s documented `''` return (`codex.js:85-87`), which still emits the item as `tool_result`. Each is the behavior that site already has for a `content` array carrying no matching block. |
| A6 | Agreement with the projection | After this package, the default parsers and `parsePrimaryWithOutcome` agree about every block: both accept exactly the string-valued `text` of a block whose `type` their own site already accepts. Before it they disagreed — the projection declined what the default parser coerced or threw on. Acceptance criterion 4 is this row. |
| A7 | What is NOT changed | The block `type` filters (`input_text`/`output_text` for Codex, `text` for Claude), the separators (`'\n'` at sites 1, 2 and 3; `'\n\n'` at site 4), `TRUSTED_MESSAGE_ROLES`, `TOOL_OUTPUT_TYPES`, the `block &&` truthiness guards already present at sites 1–4, the metadata fields (Out of scope), `src/core/transcripts/index.js`, `src/core/transcripts/primary-dialogue.js`, `src/core/transcripts/stream.js`, and `src/core/dream/scratch.js`'s `parse-threw` boundary. None is in the Deliverables. |
| A8 | ADR status | **No ADR amendment.** ADR-0023's bounded-intake contract is about how much is read and what happens to a file that cannot be read; this package changes neither. It removes a coercion inside a parse that already completes within those bounds. |

**Table B — the first law: the default parse output is byte-identical to today,
with one named exception.** The single place that claim and its exception set
are decided. The law exists because a change to a parser is exactly the kind of
change that silently rewrites memory the user already has;
`WP-dream-primary-dialogue-projection` established the shape and this package
reuses it, adapted for the fact that here the *code* moves rather than a caller.

| Row | Fact / rule | Value |
|-----|-------------|-------|
| B1 | The snapshot | `tests/fixtures/transcripts/parse-baseline.snapshot.json`, a JSON object keyed by each committed transcript fixture's repo-relative path. Corpora, in this order: `tests/fixtures/dream/transcripts/`, `tests/fixtures/primary-dialogue/`, `tests/fixtures/transcripts/`; `*.jsonl` only; each directory's names sorted. At the base tip that is **17** fixtures. Each value is `{parse, outcome}` — `parse(entry)` and `parseWithOutcome(entry, newRunBudget())` with a **fresh** budget each — or `{threw: <error constructor name>}` when the call throws. The entry is `{harness, path, size}` with `harness` read from the `codex-` / `claude-` filename prefix, which is how `tests/unit/primary-dialogue.test.js:55-59` already derives it. |
| B2 | The one excluded field | `source_path` is **deleted from every captured value**, at every depth. It is the extract's absolute path, and `src/core/transcripts/index.js:187` length-bounds it, so its value depends on how deep the checkout sits — it would make the snapshot fail on any other machine. It is the **only** excluded field, and excluding it costs nothing here: no site in Table A is on the path that produces it. |
| B3 | The exception set — **exactly one** entry, and its new value | `tests/fixtures/dream/transcripts/codex-poisoned-text-block.jsonl` alone. Its baseline value is `{"threw":"TypeError"}`. Its value after this package is exactly: `{"parse":{"harness":"codex","session_id":"poisoned-text-block","started":"2026-01-01T00:00:00.000Z","cwd":"/tmp/wd-fixture","truncated":false,"messages":[{"role":"assistant","text":"","ts":null}]},"outcome":{"extract":{"harness":"codex","session_id":"poisoned-text-block","started":"2026-01-01T00:00:00.000Z","cwd":"/tmp/wd-fixture","truncated":false,"messages":[{"role":"assistant","text":"","ts":null}]},"parse":{"outcome":"ok","oversizedRecords":0,"runExhausted":false}}}` — measured on this tree while drafting. The single `assistant` message with `text: ''` is Table A row A5's Site-1 clause in evidence: the block declined, the message survived. **Every other one of the 17 entries is unchanged**, which was measured, not assumed. |
| B4 | What the snapshot must be generated FROM | The **base commit, before any edit to `src/`**. A snapshot generated after the change proves nothing — it would agree with the changed code by construction. The verification step regenerates it at the base commit and requires a **byte-identical** file; that is what makes the committed snapshot evidence rather than a restatement. |
| B5 | What the committed snapshot contains | The **base** values, including row B3's `{"threw":"TypeError"}`. The test asserts post-change equality for every key except row B3's, and pins row B3's new value separately, so the file stays provably base-derived and the one intended difference is visible in the diff of the test rather than hidden in a regenerated golden. |

**Table C — the retarget of the three quarantine tests.** The single place that
decision and its constraints are decided.
`docs/specs/done/WP-dream-collect-parse-throw-quarantine.md` is a filed record
and is **not** edited by this package (Out of scope); this table is where the
consequence for its shipped tests is settled.

| Row | Fact / rule | Value |
|-----|-------------|-------|
| C1 | What must be retargeted, exactly | The three tests measured to break: `[PT-1]` (`tests/unit/dream-collect.test.js:1705`), `[PT-4]` (`:1782`) and `[PT-6]` (`:1829`). Each builds its crafted candidate from `tests/fixtures/dream/transcripts/codex-poisoned-text-block.jsonl` through the suite helper `writeCraftedCodex`. `[PT-2]`, `[PT-3]`, `[PT-5]`, `[PT-7]` and `[PT-8]` are **not** retargeted and must keep passing untouched. |
| C2 | What they are retargeted TO | The **seam mock `[PT-2]` already uses**: `t.mock.method(transcripts, 'parsePrimaryWithOutcome', …)`, throwing for exactly one candidate keyed by basename and delegating to the real function otherwise (`tests/unit/dream-collect.test.js:1733-1737`). Each of the three keeps its own corpus, its own assertions and its own name; only the source of the throw changes. |
| C3 | Why the seam and not another crafted fixture | Two reasons, and the second is the binding one. (a) There is no fixture-expressible in-parse throw left once Table A lands — and hunting for one would mean building this suite on a parser defect this package exists to remove. A `toJSON` that throws during `JSON.stringify` is **not** an option: `JSON.parse` cannot produce a function, so it too needs a seam mock. (b) **A post-parse throw would break an existing RED declaration's isolation.** `pt-only-parse-is-caught` mutates the collector's `catch` arm to re-throw `if (extract !== undefined)`, i.e. only when the parse already **returned**, and declares that `[PT-3]` and *only* `[PT-3]` reddens — which is the whole evidence for the boundary extending past the parse call. Retargeting the three to any post-parse throw (the session-id fixture, a `toJSON` mock) would make them redden under it too, widening that declaration's set and destroying what it demonstrates. A throw **from the parse seam** leaves `extract` undefined, so the guard is false and the three stay green. |
| C4 | The consequence for the proofs file, and the condition under which it needs no edit | The existing declarations in `tests/red-proofs/dream-collect-parse-throw.proofs.json` name their `expectRed` entries by **test name**. If the three tests keep their names byte-identical — which row C2 requires — then no declaration's `expectRed` set changes: all three still observe the set-aside record (so `pt-boundary-drops-instead-of-quarantining` still reddens them), `[PT-1]` still pins the reason literal (so `pt-reason-literal-pinned` still reddens it), and row C3 keeps them green under `pt-only-parse-is-caught`. **That is the intended outcome, and it is a prediction the unfiltered run in criterion 6 measures, not a fact this table asserts.** If the run says otherwise, the Deliverables grant permission to correct the file. |
| C5 | What `codex-poisoned-text-block.jsonl` becomes | It is **not deleted and not moved.** It changes sides: it stops being the dream collector's proof that a crafted transcript is set aside and becomes this package's proof that the same bytes now parse cleanly — Table B row B3 pins that outcome, and acceptance criterion 1 reads it end to end. |
| C6 | What is NOT weakened by the retarget | The `parse-threw` boundary itself: no line of `src/core/dream/scratch.js`, `src/core/dream/ledger.js`, `src/core/dream/warnings.js` or `src/cli/dream.js` changes, the `parse-threw` reason keeps every one of its surfaces, and the boundary keeps every acceptance criterion it shipped with. What changes is *how one of its tests reaches the throw*, not what the test asserts. |

**Table D — the declared RED proofs (ADR-0042).** One file,
`tests/red-proofs/transcripts-harden-text-values.proofs.json`, whose `suite` is
`tests/unit/transcripts.test.js`. **Four declarations, one per site**, because a
single declaration would leave three sites provable only by a test that might
observe nothing.

| Proof id | Criterion | Mutation (exact-substring) | What it proves |
|----------|-----------|-----------------------------|----------------|
| `htv-site1-codex-message-check-removed` | 1, 2 | in `src/core/transcripts/codex.js`, remove Table A row A1's conjunct from `:80` | that site 1's test observes the check, not merely that the parser returned something |
| `htv-site2-codex-tool-output-check-removed` | 1, 2 | in `src/core/transcripts/codex.js`, remove Table A row A2's conjunct from `:93` | the same for site 2 |
| `htv-site3-claude-tool-result-check-removed` | 1, 2 | in `src/core/transcripts/claude.js`, remove Table A row A3's conjunct from `:61` | the same for site 3 |
| `htv-site4-claude-assistant-check-removed` | 1, 2 | in `src/core/transcripts/claude.js`, remove Table A row A4's conjunct from `:176` | the same for site 4 |

**Each mutation's `find` must be anchored so that it matches its own site and no
other — and leading indentation alone is not enough at sites 3 and 4.** Sites 1
and 2 live in the same file and differ only by indentation (4 spaces at `:80`, 6
at `:93`), so an indented `find` is unique for each. Sites 3 and 4 are worse:
`:61` carries 6 leading spaces and `:176` carries 10, so **`:61`'s whole
indented line is a proper substring of `:176`'s** — an `occurrences: 1`
declaration written for site 3 would match at site 4 as well and report 2. This
was **measured while drafting**: a naive substring replacement of site 3's
6-space line silently rewrote site 4 too, and the four-site gate below then
passed with site 4 supposedly unhardened. Include enough surrounding text (the
preceding line, or the trailing `.map`/`.join` pair, whose separators differ —
`'\n'` at site 3, `'\n\n'` at site 4) to make each `find` unique, and **verify
every declaration's `occurrences` against the finished tree** rather than
trusting this paragraph.

**`expectRed` sets are MEASURED, never predicted.** The Criterion column above
is an authoring intent. Measure each set by hand-applying its mutation and
running the suite under the declaration's own `testNamePattern`, then confirm
against the unfiltered run.
`WP-dream-collect-parse-throw-quarantine` shipped a Criterion column that two of
its four declarations falsified (its Erratum 2), for a mechanical reason that
applies here: **`testNamePattern` selects a whole tagged suite, not the one
criterion a mutation was written for.** Every selected test that observes the
mutated fact reddens.

**Binding on every test in this package, not a suggestion.**
`scripts/red-proofs.js:1655` refuses any red whose failure `code` is not
`ERR_ASSERTION` — *"a thrown error is not an assertion failure"*. **Every one of
Table D's mutations makes production code throw**, so a test that simply calls
`parse()` and lets the `TypeError` escape its body is **unprovable**: wrap the
call in `assert.doesNotThrow`, which was measured on this tree's Node to report
`AssertionError` with `code: 'ERR_ASSERTION'`. Separately,
`scripts/red-proofs.js:716-717` refuses an empty `signal`, and `:1658-1659`
searches the failing diagnostic for it — so each declared assertion must carry
its tag inside its own **message string**, not only in the test name.

**Table E — transcripts quarantined `parse-threw` BEFORE this package exists.**
The single place that question is decided. Raised by the design gate, round 1
(Astra, medium, band A — the product question): the hardening fixes the parser
but does not, on its own, give the hardened parser a second look at the sessions
the defect already cost. Every fact below was read off the code at base
`08de2bc3`, and the two release facts off `git` and the npm registry.

| Row | Fact / rule | Value |
|-----|-------------|-------|
| E1 | The mechanism, exactly | `selectState` (`src/core/dream/ledger.js:235-263`) returns `'skip-quarantined'` for any record whose `outcome` is `'quarantined'` and whose `fingerprint` still equals `fingerprint(disc)`, **for every reason** — the reason is consulted only for the sticky `secret-revert-exhausted` arm above it. `collectExtracts` applies that decision **before** the parse call. So a `parse-threw` record written by an unhardened build keeps its file out of the run after the upgrade, and **the hardened parser never sees it**, until and unless the file's `size:mtimeMs:dev:ino` changes. |
| E2 | Why the user cannot clear it | A completed session transcript is never rewritten by either harness, so the fingerprint does not change on its own. `reports/warnings.md`'s header says *"Do not edit it"* about the report, and its **only** remediation line rides the secret-exhausted group (`src/core/dream/warnings.js:92-95`); the four intake reasons carry none. The digest banner says *"a skipped file is retried automatically if it changes"* (`ledger.js:480`) — true, and useless here. **Nothing in `src/` ships an un-quarantine, forget or retry affordance**, which `ledger.js:483-487` records as a deliberate standing decision (*"Names NO command: nothing ships a way to un-skip these sessions yet"*). So the honest answer to "what can a user do" is: **nothing**. |
| E3 | The population is live, not hypothetical | **`v0.14.0` carries the `parse-threw` reason with the unhardened parsers, and it is published.** Tag `v0.14.0` is `1f546baa` (2026-09-18 14:14 +0200), it has `900dd6d4` — the parse-throw merge — as an ancestor, `git grep -c parse-threw v0.14.0 -- src/core/dream/scratch.js` is 2, and the npm registry gives `0.14.0` a publish time of 2026-09-18T12:26:43Z. Any install of 0.14.0 that meets a poisoned transcript accumulates a record this package would strand. This row is why the residual is **not** acceptable as a bare named residual. |
| E4 | The decision: **(b), bounded recovery — and NOT in this package** | A bounded recovery is required. It does **not** belong here, and the reason is structural rather than a preference: see row E5 for what it costs in `ledger.js`, which is a different kind of change from four filter predicates and cannot be carried by this package's central claim (Table B — "the default parse output is byte-identical"). It is specced as the companion `WP-ledger-retry-parse-threw-on-upgrade`, drafted alongside this package, which `depends_on` it. Its mechanism — decided in round 2 — is to **convert** each `parse-threw` quarantine into a retryable `deferred` record, never to delete it. **Release ordering is the binding constraint, and it is owner item 2.** |
| E5 | Why a one-shot gate needs new ledger-level state — measured, not assumed | The quarantine record carries **no version**: `recordQuarantined` (`:326-334`) writes exactly `{fingerprint, outcome, reason, updated_at, harness}`. `appVersion` exists in this file, but only on `oversizedExtracts` memo entries (`:103`, `:118-125`) — a different map with a different lifecycle. And the schema version is **not readable state**: `readLedger` (`:139-157`) hard-pins `version: 1` on output and never reads `obj.version`, while `writeLedger` (`:160-177`) serializes exactly `{version:1, baseline_mtime, files, oversizedExtracts?}` — so **any new top-level field is silently dropped on the next write** unless `writeLedger` changes too. An ungated sweep is not an option either: after this package a `parse-threw` can still arise outside the four hardened joins (the metadata path — Out of scope), and re-reading, re-parsing and re-throwing on such a file every night is exactly the repeated cost ADR-0023's quarantine exists to stop. So a bounded retry costs edits to `readLedger`, `writeLedger`, the `Ledger` typedef and a migration — the companion's subject, not this one's. |
| E6 | Which decision wins where it meets the Done spec | `WP-dream-collect-parse-throw-quarantine`'s Table A row **A2** says the quarantine **record** gains no field, no counter and no stickiness. The companion **keeps that**: it changes no record shape and no `selectState` arm. Its row **A12**, however, says the reason introduces *"no record field, no counter and no new state"* and concludes that no ADR-0023 amendment is needed — and ledger-level one-shot state **is** new state. So on that narrower point **the companion wins and row A12's premise no longer holds for the family**, which is why the companion, not this package, is where ADR-0023's amendment question is answered. This package changes neither record nor lifecycle and needs no amendment (Table A row A8). |
| E7 | What this package still owes | One thing, and it is criterion 9: **say the residual out loud where the next reader will meet it**, rather than leaving the gap for a later reviewer to rediscover. No code in this package changes on account of Table E. |

### Mirrored Surface Checklist

Every surface below defers to its canonical table. A review finding updates the
table and all its mirrors **in the same commit** — no commit exists in which the
canonical table and a registered mirror disagree (update-all-mirrors) — and any
new mirror found in review is added here on the spot (register-new-mirrors):

- [ ] Deliverables-table cells that restate a path or rule — `codex.js` → Table
      A rows A1, A2; `claude.js` → rows A3, A4; `transcripts.test.js` → criteria
      1–3 and Table B; `dream-collect.test.js` → Table C; the snapshot → Table B
      rows B1–B3; the new proofs file → Table D; the existing proofs file →
      Table C row C4. **No Deliverables row mirrors Table E, and that is Table E
      row E4's decision rather than an omission:** `src/core/dream/ledger.js`
      and `tests/unit/ledger.test.js` are deliberately outside this boundary and
      named in Out of scope
- [ ] Acceptance criteria that assert its facts — criterion 1 asserts Table A
      row A5 and Table B rows B2 and B3; criterion 2 asserts Table A rows
      A0–A5 at all four sites; criterion 3 asserts Table B in full; criterion 4
      asserts Table A row A6; criterion 5 asserts Table C rows C1, C2 and C6;
      criterion 9 asserts Table E;
      criterion 6 asserts Table D and Table C row C4; criterion 7 asserts Table
      A row A7
- [ ] Verification commands / greps — the four-site `node -e` gate asserts Table
      A rows A0 and A5 at each site by shape rather than by fixture; the
      snapshot regeneration command asserts Table B rows B1, B2 and B4 and is
      the only thing that can establish B4; the `grep` gate asserts Table A row
      A7's untouched `primary-dialogue.js` line; `npm test` carries every
      criterion's suite assertions; the **UNFILTERED** `npm run red-proofs`
      asserts Table D and measures Table C row C4's prediction
- [ ] Current-state description — the four-site table and its line citations
      (Table A rows A1–A4), `joinTextBlocks` and its JSDoc (row A0), the three
      emptiness rules (row A5), the two `primary-dialogue.proofs.json`
      declarations and the `occurrences` trap (row A7 and Table D), the measured
      three-test breakage and the `[PT-3]` correction (Table C rows C1 and C3),
      `[PT-2]`'s seam (Table C row C2), the 17-fixture before/after capture
      (Table B), and **"What the hardening does NOT reach"** — `selectState`'s
      reason-blind skip, the `v0.14.0` release facts and the absence of any
      un-quarantine affordance (Table E rows E1, E2, E3, E5) — all pinned to
      base `08de2bc3`
- [ ] Operative prose steps that apply it — **walked, in document order**:
      - Context's "the rule this package adopts is already in the tree" paragraph
        → Table A rows A0 and A6
      - Context's "every rule here is an acceptance allowlist" paragraph → Table
        A row A0 and the Security checklist's last bullet
      - Current state's "what the change breaks, MEASURED" → Table C rows C1 and
        C3; its "the parse output that changes" → Table B rows B3 and B5
      - "Exact contracts"' site-1 listing → Table A rows A0 and A1, and Table D's
        indentation note
      - the Contract-reference preamble's four ADR-0031 tests → Table A row A0
        (parsing), row A5 (error behavior), Table C (authority boundary) and
        this checklist (mirrored surfaces)
      - Implementation notes' "do not re-spell the pinned line" bullet → Table A
        row A7; its "four conditions, nothing else" bullet → Table A rows A1–A4
        and A7; its "generate the snapshot first" bullet → Table B row B4; its
        "no new committed fixtures" bullet → Table B row B1
      - Out of scope's metadata entry → Table A row A7 and Table C row C3(a);
        its filed-spec entry → Table C; its **already-quarantined entry** →
        Table E rows E4 and E5
      - Current state's release facts and acceptance criterion 9 → Table E rows
        E3 and E7; owner item 2 → Table E rows E4 and E6

## Implementation notes & constraints

- **No new npm dependencies** (CLAUDE.md), no TypeScript, JSDoc annotations
  only, nothing that outlives the process (ADR-0004).
- **Four conditions in `src/`, and nothing else.** The whole production change
  is four `.filter(…)` predicates gaining one conjunct (Table A rows A1–A4). If
  a fifth line of `src/` changes, something has gone wrong — say so rather than
  widening.
- **Generate the baseline snapshot FIRST, at the base commit, before touching
  `src/`** (Table B row B4). The cheapest way to get that wrong is to make the
  source change, then generate; the snapshot then agrees with the change by
  construction and the law is empty. The verification step regenerates it at the
  base commit and requires a byte-identical file, which is what catches it.
- **No new committed fixtures.** `tests/unit/transcripts.test.js` already builds
  its inputs as temp `.jsonl` files under `os.tmpdir()` (e.g. `:193`, `:203`);
  use that. A new file under `tests/fixtures/primary-dialogue/` would be swept
  into `tests/unit/primary-dialogue.test.js`'s `committedFixtures` sweep
  (`:55-59`) and silently enter that package's acceptance tests; a new file under
  any of the three corpora would also be an unkeyed entry against Table B row
  B1's snapshot. The one new file under `tests/fixtures/` is the snapshot itself.
- **Do not re-spell `src/core/transcripts/primary-dialogue.js:83`** (Table A row
  A7). It is pinned by `pdp-ac3c-text-value-string-check-removed` at
  `occurrences: 1`. The file is not in the Deliverables, so this cannot happen by
  editing it — but before committing, grep every
  `tests/red-proofs/*.proofs.json` whose `file` is under
  `src/core/transcripts/` and confirm each `find` still occurs its declared
  number of times. That check exists because
  `WP-dream-collect-parse-throw-quarantine`'s Erratum 5 is precisely a
  re-spelling that disarmed a sibling declaration and surfaced only in the
  **unfiltered** proof run.
- **The `ERR_ASSERTION` trap.** See the binding note under Table D. Every test
  whose expected outcome is "the parse completes" must assert that through
  `assert.doesNotThrow`, or its RED declaration is unprovable.
- **Retargeting is a change of mechanism, not of assertion** (Table C row C2).
  Keep each of the three tests' name, corpus shape and assertions; change only
  where the throw comes from. A retarget that also rewrites what a test asserts
  is how a suite silently loses coverage.
- When uncertain: choose the simpler option and note it in the PR description
  under "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] Any untrusted identifier (version, name, path segment, filename) that flows
      into a filesystem path or a shell command is validated with a **fully
      anchored** pattern that rejects `/`, `\`, and `..`, in **every** language it
      passes through (e.g. JS `isSemver` AND the bash/PowerShell regex). A
      start-anchored-only check accepts `1.2.3/../../x` and becomes an
      arbitrary-write primitive (WP-022, WP-055). **Anchor correctly per engine:**
      in .NET/PowerShell `^…$` still matches *before* a trailing newline — use
      `\A…\z`; in JS `$` without the `m` flag is safe; in POSIX `grep` remember it
      is line-oriented (a multiline value with one valid line matches `^…$`), so
      confirm the value cannot contain a newline (WP-057).
- [ ] **Applied here: this package adds no path and no shell.** It narrows four
      filter predicates. The one untrusted identifier that reaches a filesystem
      path from a transcript — `extract.session_id` — is on the metadata path,
      which this package does not touch (Out of scope), and is already bounded
      and allowlisted by `src/core/dream/scratch.js`'s `sanitize`.
- [ ] **Malformed input robustness is the point of the package.** Every input in
      criteria 1 and 2 is hostile by construction: a `text` that is an object
      with a poisoned `toString`, a number, `null`, an array, a nested object.
      For every one of them the parse must **complete** — measured through
      `assert.doesNotThrow`, never by a test that would pass if the call threw.
- [ ] **No coercion, and no invented dialogue** (Table A row A0). Confirm that
      no declined block's value reaches the extract in **any** form: not
      `"[object Object]"`, not a number's digits, not `"null"`, not an array's
      comma-joined elements, not an empty string *contributed by the block*.
      Assert the absence of the coerced strings in the serialized extract, not
      merely the absence of a throw.
- [ ] **The rule is an allowlist and stays one** (Table A row A0). It names the
      one shape we accept — a string — so a `text` shape nobody has thought of
      yet declines by default. Confirm no part of the change enumerates rejected
      shapes: a forbidden-set enumeration over Claude Code's and Codex CLI's
      grammars cannot be closed, and both grammars change without notice.

## Acceptance criteria

- [ ] 1. **The crafted rollout parses cleanly instead of throwing.**
      `parse()` and `parseWithOutcome()` over
      `tests/fixtures/dream/transcripts/codex-poisoned-text-block.jsonl`
      complete — observed through `assert.doesNotThrow` — and return exactly
      **Table B row B3's** pinned value, `source_path` excepted (Table B row
      B2). In particular the assistant message survives with `text: ''` (Table A
      row A5).
- [ ] 2. **All four sites decline a non-string `text`, and none invents
      dialogue.** For each of the four sites named in Table A rows A1–A4,
      separately: a record whose text-bearing block carries a `text` that is an
      object with a poisoned `toString`, a plain object, a number, `null` and an
      array is parsed without throwing; the resulting extract contains **none**
      of the coerced forms those values would have produced; and a sibling block
      in the same record whose `text` **is** a string still contributes its text,
      in its original position and with the site's own separator (Table A rows
      A0, A5).
- [ ] 3. **The first law: the default parse is byte-identical to today, with one
      named exception.** For every key in
      `tests/fixtures/transcripts/parse-baseline.snapshot.json` except Table B
      row B3's, the post-change `{parse, outcome}` computed per Table B rows B1
      and B2 deep-equals the committed baseline value; for row B3's key, the
      baseline value is `{"threw":"TypeError"}` and the post-change value is row
      B3's pinned object. Every key in the snapshot still names an existing file.
- [ ] 4. **The default parsers and the primary-dialogue projection now agree.**
      For an input carrying both a string-valued and a non-string-valued text
      block, the set of block values the default parse takes text from and the
      set `parsePrimaryWithOutcome` takes text from are the same — neither
      accepts a block the other declines (Table A row A6).
- [ ] 5. **The `parse-threw` boundary is intact and its suite is whole.** All of
      `[PT-1]` … `[PT-8]` in `tests/unit/dream-collect.test.js` pass;
      `[PT-1]`, `[PT-4]` and `[PT-6]` reach their throw through Table C row C2's
      seam and keep their names, corpora and assertions; `[PT-2]`, `[PT-3]`,
      `[PT-5]`, `[PT-7]` and `[PT-8]` are unmodified; and no file under
      `src/core/dream/` or `src/cli/` is in the diff (Table C rows C1, C2, C6).
- [ ] 6. **The declared RED proofs are `PROVEN`.** The **UNFILTERED**
      `npm run red-proofs` reports `RUN: PROVEN`, with `PROVEN` for all four
      Table D declarations **and** for every declaration this package did not
      write — in particular the four in
      `tests/red-proofs/dream-collect-parse-throw.proofs.json` and the ten in
      `tests/red-proofs/primary-dialogue.proofs.json` — and reports no
      `FILTERED`, `VACUOUS`, `UNCONTROLLED`, `FAILED` or `ERROR` verdict
      anywhere.
- [ ] 7. **Nothing outside the Deliverables changed.** `git diff --name-only`
      against the merge base lists only paths in the Deliverables table (plus the
      always-allowed set); in particular no file under `tests/golden/`, and no
      file under `src/` other than `codex.js` and `claude.js` (Table A row A7).
- [ ] 8. N/A — this WP ships no command and writes nothing outside the repo; it
      changes two pure parsing functions' block acceptance.
- [ ] 9. **The stranded-quarantine residual is carried, not dropped** (Table E
      row E7). The companion spec
      `docs/specs/WP-ledger-retry-parse-threw-on-upgrade.md` exists and names
      `WP-transcript-parsers-harden-text-values` in its `depends_on`; and the PR
      body states, in one sentence, that transcripts quarantined `parse-threw`
      by a pre-hardening build are **not** recovered by this package and that
      the companion must reach the same release (owner item 2). This criterion
      requires **no code change** — it exists so the gap cannot be closed
      silently by a green test run.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
npm run red-proofs   # UNFILTERED. See the note below before reaching for --wp.
```

**The red-proofs line is the unfiltered run, and that is not a preference.**
`--wp <id>` leaves every other package's declarations unselected;
`rollUp` (`scripts/red-proofs.js:2152-2154`) marks any pair with a left-out
declaration `FILTERED`, the run verdict is the worst pair verdict, and the exit
code is `verdict === 'PROVEN' ? 0 : 1` (`:1893`). So a scoped run reports
`RUN: FILTERED` and exits **1** however green its selected proofs are, and
criterion 6 can only be read off the unfiltered run — which is also the only run
that can show this package disarming a **sibling** package's declaration. The
`--wp` form is a fast non-gating reading while iterating. The unfiltered run
takes 15–20 minutes: redirect its whole output to a file, wait on its own PID,
and read the `RUN:` line from the file.

```bash
# Table A row A7: the primary-dialogue line an existing RED declaration pins is
# byte-unchanged, so primary-dialogue.proofs.json stays applicable. FAILS LOUDLY
# — the `test -f` guard matters because an unguarded grep over a missing file
# exits 2 and a bare `&&` chain would print nothing and exit 0.
{ test -f src/core/transcripts/primary-dialogue.js \
  && test "$(grep -cF "    .filter((block) => block.type === 'text' && typeof block.text === 'string')" src/core/transcripts/primary-dialogue.js)" = 1 \
  && echo "PINNED PD LINE INTACT OK"; } || { echo "PINNED PD LINE FAILED"; exit 1; }
```

```bash
# Table B rows B1, B2 and B4: regenerate the baseline AT THE BASE COMMIT and
# require the committed snapshot to be byte-identical. This is the ONLY check
# that can establish row B4 — that the snapshot was generated before the source
# change rather than from it. Run from the repo root, on the finished branch.
# `$BASE` is the merge base with main (08de2bc3 unless the branch was rebased).
BASE=$(git merge-base HEAD origin/main)
WT=$(mktemp -d)/base && git worktree add --detach "$WT" "$BASE" >/dev/null
cat > /tmp/wd-parse-baseline.js <<'JS'
const fs = require('node:fs'), path = require('node:path');
const T = require(process.cwd() + '/src/core/transcripts');
const DIRS = ['tests/fixtures/dream/transcripts', 'tests/fixtures/primary-dialogue', 'tests/fixtures/transcripts'];
const drop = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'source_path' ? undefined : x)));
const out = {};
for (const dir of DIRS)
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort()) {
    const file = path.join(dir, name), key = dir + '/' + name;
    const entry = { harness: name.startsWith('codex-') ? 'codex' : 'claude', path: file, size: fs.statSync(file).size };
    try { out[key] = { parse: drop(T.parse(entry)), outcome: drop(T.parseWithOutcome(entry, T.newRunBudget())) }; }
    catch (e) { out[key] = { threw: e.constructor.name }; }
  }
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
JS
( cd "$WT" && node /tmp/wd-parse-baseline.js ) > /tmp/wd-base-snapshot.json
if diff -q /tmp/wd-base-snapshot.json tests/fixtures/transcripts/parse-baseline.snapshot.json >/dev/null; then
  echo "BASELINE IS BASE-DERIVED OK"
else
  echo "BASELINE FAILED — the committed snapshot is not what the BASE commit produces"
  diff /tmp/wd-base-snapshot.json tests/fixtures/transcripts/parse-baseline.snapshot.json | head -40
  git worktree remove --force "$WT"; exit 1
fi
# And the change's whole effect on parse output: exactly ONE key differs, and it
# is Table B row B3's. The exit code is carried past the cleanup on purpose — a
# check whose failure is swallowed by a trailing `git worktree remove` reads
# green exactly when it has something to say.
node /tmp/wd-parse-baseline.js > /tmp/wd-head-snapshot.json
node -e "
const a=require('/tmp/wd-base-snapshot.json'), b=require('/tmp/wd-head-snapshot.json');
const d=Object.keys({...a,...b}).filter((k)=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
const want=['tests/fixtures/dream/transcripts/codex-poisoned-text-block.jsonl'];
if(JSON.stringify(d)!==JSON.stringify(want)){console.error('the exception set is not Table B row B3: '+JSON.stringify(d));process.exit(1);}
if(JSON.stringify(a[want[0]])!=='{\"threw\":\"TypeError\"}'){console.error('the baseline value for the exception is not the pinned one');process.exit(1);}
console.log('EXCEPTION SET IS EXACTLY ONE OK');"
rc=$?
git worktree remove --force "$WT"
exit $rc
```

**Before trusting the four-site gate below, observe it red.** It is a NEW
verification step, so run it in three states and paste all three: (a) on the base
tip, where every site must fail; (b) with **one** site left unhardened, where
exactly that site must fail — which is what proves the gate discriminates between
sites rather than passing on the first one it finds; (c) on the finished change,
where it must print `FOUR SITES DECLINE OK`.

```bash
# Table A rows A0 and A5 at all four sites, on inputs built in throwaway temp
# directories, by SHAPE rather than by committed fixture. Run from the repo root.
node -e "
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const T=require('./src/core/transcripts');
const bad=[];
// The declined values. This list is the gate's INPUTS, not the rule: the rule is
// Table A row A0's allowlist, and these are five values that are not strings.
const POISON=[{toString:null},{},42,null,['a','b']];
// What join() would INVENT from them. \`null\` and \`undefined\` are absent on
// purpose: join renders them as the empty string, which is indistinguishable
// from a decline, so there is nothing invented to detect.
const COERCED=['[object Object]','42','a,b'];
const mk=(harness,lines)=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wd-htv-'));
  const file=path.join(dir,harness==='codex'?'rollout-x.jsonl':'s.jsonl');
  fs.writeFileSync(file,lines.map((l)=>JSON.stringify(l)).join('\n')+'\n');
  return {harness,path:file,size:fs.statSync(file).size};
};
// Read ONLY the message text values. Searching the serialized extract instead
// false-positives on every JSON null and on any number that shares digits with
// a coerced form.
const check=(site,entry,keep)=>{
  let ex=null;
  try{ex=T.parse(entry);}catch(e){bad.push(site+': the parse THREW on a non-string text value: '+e.message);return;}
  const texts=(ex.messages||[]).map((m)=>String(m.text));
  for(const c of COERCED) if(texts.some((t)=>t.includes(c))) bad.push(site+': invented dialogue — the coerced form '+JSON.stringify(c)+' reached a message text');
  if(!texts.some((t)=>t.includes(keep))) bad.push(site+': the sibling STRING block was lost too — the decline is not block-scoped: '+JSON.stringify(texts).slice(0,300));
};
for(const p of POISON){
  // Site 1 - codex message content blocks.
  check('site 1',mk('codex',[
    {type:'session_meta',payload:{id:'s1',timestamp:'2026-01-01T00:00:00.000Z',cwd:'/w'}},
    {type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text:p},{type:'output_text',text:'KEEP1'}]}},
  ]),'KEEP1');
  // Site 2 - codex tool-output content blocks.
  check('site 2',mk('codex',[
    {type:'session_meta',payload:{id:'s2',timestamp:'2026-01-01T00:00:00.000Z',cwd:'/w'}},
    {type:'response_item',payload:{type:'custom_tool_call_output',content:[{type:'output_text',text:p},{type:'output_text',text:'KEEP2'}]}},
  ]),'KEEP2');
  // Site 3 - claude tool_result content blocks.
  check('site 3',mk('claude',[
    {type:'user',sessionId:'s3',message:{role:'user',content:[{type:'tool_result',content:[{type:'text',text:p},{type:'text',text:'KEEP3'}]}]}},
  ]),'KEEP3');
  // Site 4 - claude assistant text blocks.
  check('site 4',mk('claude',[
    {type:'user',sessionId:'s4',message:{role:'user',content:'hi'}},
    {type:'assistant',message:{role:'assistant',content:[{type:'text',text:p},{type:'text',text:'KEEP4'}]}},
  ]),'KEEP4');
}
if(bad.length){console.error([...new Set(bad)].join(' | '));process.exit(1);}
console.log('FOUR SITES DECLINE OK');"
```

## Out of scope (do NOT do these)

- **The metadata fields.** `session_meta.payload.id` (`codex.js:193`),
  `sessionId`, `cwd` and `timestamp` are still accepted as whatever JSON shape
  the file carries, so a non-string `payload.id` still becomes the Extract's
  `session_id` and still throws downstream at
  `src/core/dream/scratch.js`'s `sanitize`. That is deliberate: it is what keeps
  `[PT-3]` a real end-to-end proof of the collector's boundary (Table C row C3),
  and it is a separate, unspecced successor. **Do not accept the `Extract`
  typedef's metadata fields as strings here**, and do not touch
  `tests/fixtures/dream/transcripts/codex-poisoned-session-id.jsonl`.
- **`src/core/transcripts/primary-dialogue.js`** — it already has the rule
  (Table A rows A0, A7), and a pinned line in it (Table A row A7).
- **`src/core/transcripts/index.js` and `src/core/transcripts/stream.js`** — the
  capping, budgeting, redaction and depth limits are unchanged (Table A row A7).
- **Anything under `src/core/dream/` or `src/cli/`** — the `parse-threw`
  boundary, the ledger, the warnings file, the console line and the digest
  banner all keep their current behavior (Table C row C6).
- **`src/cli/doctor.js`** — that is `WP-doctor-recognizes-parse-threw`, drafted
  alongside this one. The two packages share no file and impose no order on each
  other.
- **Editing `docs/specs/done/WP-dream-collect-parse-throw-quarantine.md`.** A
  filed spec is a record. Its Implementation notes already predicted that its
  fixtures would stop throwing, and Table C is where the consequence is settled.
  Record the correction to its prediction — that **three** of its tests break and
  `[PT-3]` does not — as a dated entry under `docs/specs/logbook/`, which needs
  no Deliverables listing.
- **Recovering transcripts already quarantined `parse-threw`** — the bounded
  one-time retry is **`WP-ledger-retry-parse-threw-on-upgrade`**, drafted
  alongside this package and depending on it (Table E rows E4, E5). Do not add
  `src/core/dream/ledger.js` or `tests/unit/ledger.test.js` to this package's
  Deliverables, do not sweep, delete or rewrite any ledger record here, and do
  not change `selectState`. Owner item 2 carries the release-ordering
  constraint, which is the part a later reader must not lose.
- **Deleting or moving `tests/fixtures/dream/transcripts/codex-poisoned-text-block.jsonl`**
  (Table C row C5).

## Definition of done

0. **DISPATCH PRECONDITION.** (a) The design gate has run and is closed
   (`docs/runbooks/codex-review.md`, "Weighted closure"); the round and its
   dispositions are recorded in `docs/specs/logbook/`. (b) **Owner items: one,
   below.** (c) Every cite is pinned to base `08de2bc3` and was derived by
   construct, and every behavioral claim under "Current state" was executed on
   that tip. Re-run the Current-state reading before writing code; if anything
   has landed in `src/core/transcripts/` or `tests/unit/dream-collect.test.js`
   since, re-derive those cites construct by construct rather than by adding a
   delta — and re-measure the three-test breakage, because it is what Table C
   sizes. (d) Branch `wp/transcript-parsers-harden-text-values`.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(transcripts): decline a non-string text value instead of throwing or inventing dialogue (WP-transcript-parsers-harden-text-values)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.

## Dispatch precondition — owner items

The item below is **a recommendation with the cost of overruling it, not a
direct ruling**. The standing process is recorded in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`: the
architect records a recommendation with its overrule cost, the session may
dispatch under it, and **the owner reverses it by dated amendment**, applied to
this spec by a committed revision rather than by a dispatch message, because
`scripts/boundary-check.js` reads the Deliverables table in this file and nothing
a message says changes what CI sees. **Nothing in this repository records the
owner approving, accepting, ratifying or signing it, and this spec asserts no
such acceptance.**

**1. Should the metadata fields be hardened in this package, or as a further
successor?**

- *Recommendation:* **a further successor.** Two reasons, both measured. First,
  keeping them apart keeps the two kinds of change apart: this package narrows
  *block acceptance*, which is the surface the primary-dialogue projection
  already decided; the metadata question is different — it asks what an
  `Extract`'s `session_id`, `cwd`, `started` and `harness` may be, which is a
  typedef contract with the dream collector, the scratch filename derivation and
  the ledger's fingerprinting all downstream of it, and it needs its own
  contract table. Second, and concretely: hardening the metadata makes
  `codex-poisoned-session-id.jsonl` stop throwing, which breaks
  `[PT-3]` — the one remaining end-to-end proof that the collector's fault
  boundary extends **past** the parse call. Retargeting that test is a decision
  about the boundary's evidence, not about the parsers, and it should be taken in
  a package whose subject it is.
- *Overrule cost:* fold the seven metadata fields, a fifth and sixth RED
  declaration, and the retarget of `[PT-3]` into this package. The size stays
  **M** but the `[PT-3]` retarget has no cheap answer: the collector would have
  no fixture-expressible post-parse throw left at all, so Table B row B9 of the
  filed spec would have to be re-proved through a seam mock whose extract carries
  a colliding, already-written scratch filename — the construction its Erratum 6
  records as the only way to build that case. Table C row C3(b)'s isolation
  argument would then have to be redone for `pt-only-parse-is-caught`'s whole
  `expectRed` set.

**2. May this package ship in a release that does not also carry
`WP-ledger-retry-parse-threw-on-upgrade`?**

- *Recommendation:* **no — the two must reach the same release, in that order.**
  This is the design gate's round-1 finding (Astra, medium, band A), decided in
  Table E. The reason it is a release question rather than a merge question is
  row E3: **`v0.14.0` is already published** (npm, 2026-09-18T12:26:43Z; tag
  `1f546baa`, which has the parse-throw merge `900dd6d4` as an ancestor), so a
  build that emits `parse-threw` with unhardened parsers is **in users' hands
  today**. Every such quarantine is permanent for its file: `selectState` skips
  an unchanged quarantined file before the parse (row E1), nothing in `src/`
  ships an un-quarantine affordance, and a completed transcript's fingerprint
  never changes on its own (row E2). Shipping the hardening alone would fix the
  defect for future transcripts while making the already-lost ones
  *permanently* lost, with no user action available — and it would do so in a
  release whose notes would truthfully say the parser bug was fixed.
- *Overrule cost:* ship this package alone. The cost is not a regression — it is
  that every session already quarantined `parse-threw` on 0.14.0 stays excluded
  for the life of the install, invisibly, and the later companion has to
  recover a population that has grown in the meantime. Nothing else in this
  package changes; no acceptance criterion moves except criterion 9's second
  clause, which is the sentence recording the choice.
- *If the owner overrules:* the sentence required by criterion 9 becomes the
  release note, not a promise of a companion — say plainly, in the user-facing
  notes, that sessions skipped under this condition before the upgrade are not
  re-read, because Table E row E2's honest answer to "what can I do" is
  **nothing**.
