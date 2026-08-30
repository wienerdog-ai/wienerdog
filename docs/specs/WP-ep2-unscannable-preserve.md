---
id: WP-ep2-unscannable-preserve
title: Move the unscannable classification into the EP2 gate so the bytes are preserved before they are refused
status: In-Review
model: opus
size: S
depends_on: [WP-dream-promote-module, WP-dream-promote-in-workspace]
adrs: [ADR-0004, ADR-0024, ADR-0031, ADR-0034]
epic: dream-promotion
---

# WP-ep2-unscannable-preserve: unscannable content is withheld the way a quarantine-severity finding is — preserved first

## Context (read this, nothing else)

Wienerdog is an open-source "AI upgrade stack" that writes configuration files
into a user's Claude Code / Codex CLI setup. **IRON RULE (ADR-0004): Wienerdog
is just files** — no daemons, no servers, no telemetry. Nothing in this work
package starts anything; it changes which function makes one decision.

The **dream** is a nightly job in which an AI "brain" reads recent session
transcripts and writes notes into the user's markdown **vault**. The brain does
not write to the vault directly: it writes into a scratch **workspace**, and a
**promotion** step decides, per path, whether those bytes may be published into
the vault. That step is `promote()` in `src/core/dream/promote.js`. It runs four
injected **gates**; the first is **EP2**, the staged-output secret gate.

EP2's disposition is a **taxonomy**, not a yes/no (binding ADR-0034):

- **pass** — nothing found, the bytes go on to the merge;
- **redact** — a context-free high-entropy hit and nothing worse. The gate
  preserves the unredacted original into `state/quarantine/redacted/`, scrubs
  only the lines this run added, and returns the sanitized bytes for promotion;
- **refuse (withhold)** — a hard finding. The gate **first preserves the bytes
  into `state/quarantine/`** (dir `0700`, file `0600`, raw bytes intact) and
  then refuses. Nothing is promoted.

The preserved copy is not a nicety. It is the only durable artifact of content
the brain authored and the run refused, and it is what makes two user-facing
things work: the owner can open or restore the file, and the **digest's
pending-review banner** fires — `listSecretQuarantine` in `src/core/digest.js`
drives that banner off a **directory listing** of `state/quarantine/`, so no
copy means no banner, ever.

There is a fourth case the taxonomy has always had to answer: content that
**cannot be scanned at all** — a delta record the primitive marked `binary`, or
bytes that do not survive a UTF-8 round trip. `Buffer.toString('utf8')` never
fails; it substitutes U+FFFD, so scanning the decoded text is scanning bytes
that are not in the file. Unscannable content is a **refusal, never a pass**,
and always has been. What this work package changes is **who makes that call and
therefore where in the sequence it lands.**

## Current state

On `wp/dream-promote-in-workspace` (this WP branches from `7d30fa9`, not from
`main` — the extracted gate exists only there), the classification is made by
`promote()` **before** the gate is called, at `src/core/dream/promote.js`, Phase
1, immediately above `const verdict = gates.secret({...})`:

```js
if (record.binary === true) {
  disposition.withheld += 1;
  refuse('EP2: content is binary and cannot be secret-scanned; not promoted');
  continue;
}
if (!isLosslessUtf8(afterBytes)) {
  disposition.withheld += 1;
  refuse('EP2: content is not lossless UTF-8 and cannot be secret-scanned; not promoted');
  continue;
}
```

`continue` means the gate never runs, and the gate is the only party that
preserves. So the class that most needs a durable copy gets none — measured and
recorded in `docs/specs/logbook/2026-08-31-unscannable-content-loses-its-durable-artifact.md`,
whose verdict was **REGRESSION, not a narrowing**, and which the owner ruled on
2026-08-31 with disposition **B — REORDER**.

The gate itself is `makeGates(...).secret` in `src/core/dream/validate.js`. Its
withhold arm already does exactly what is needed, four lines below where control
never arrives:

```js
const preserved = quarantinePreserve(stateDir, afterBytes, rel, date, 'withheld');
...
const record = [];
if (preserved) record.push({ artifact: preserved.name, location: 'quarantine' });
return { refuse: true, reason, preserved: record };
```

`quarantinePreserve(stateDir, content, rel, date, kind)` **takes the bytes, never
a path to read** (that is the shipped TOCTOU fix), returns
`{name, bytes} | null`, writes `<date>-<sanitized-basename>` atomically at `0600`
inside a `0700` directory, and resolves name collisions itself.

The gate's own JSDoc states the current ordering as a premise it relies on:
*"`promote()` refuses binary and non-lossless-UTF-8 content BEFORE calling this
gate, so both arms below may assume decodable text."*

Three surfaces mirror the split today and are updated by this WP: the two
`promote()` unit tests in `tests/unit/dream-promote.test.js`, the `gateFixture`
harness in `tests/unit/dream-validate.test.js` (which **replays** the pre-refusal
so no fixture in that file can observe what the gate does with a binary note),
and the three tests in that file whose quarantine assertions were deleted during
the migration and replaced with `assert.deepEqual(res.preservedFor(rel), [], 'the
refusal precedes preservation')`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | docs/specs/WP-ep2-unscannable-preserve.md | this spec |
| modify | docs/specs/done/WP-dream-promote-module.md | amend the EP2 contract: unscannable is the GATE's classification and lands in the withhold arm. Table D's EP2 row, the "Unscannable content is a REFUSAL" paragraph, and the Table Q row that enumerates what carries a preservation record |
| modify | src/core/dream/promote.js | DELETE the Phase-1 pre-refusal (both branches) and the module-local `isLosslessUtf8` helper together with its `module.exports` entry; leave the `verdict.refuse` branch, its `disposition.withheld` increment and its preservation-record read exactly as they are |
| modify | src/core/dream/validate.js | in `makeGates(...).secret`: classify unscannable content FIRST, set `reason`, and FALL THROUGH to the existing withhold arm. Update the gate's JSDoc premise and its `record` param type |
| modify | tests/unit/dream-promote.test.js | replace the two pre-refusal tests with (a) the gate is CALLED on an unscannable record and is handed `record.binary` plus the undecoded bytes, and its refusal carries the preservation record; (b) the module runs no unscannable check of its own. Drop the `isLosslessUtf8` import and its two direct assertions |
| modify | tests/unit/dream-validate.test.js | stop replaying the pre-refusal in `gateFixture`; pass the primitive's `binary` flag and an empty `addedLineNumbers` for a binary record; restore the quarantine assertions on all three unscannable fixtures |

**Explicitly NOT in the boundary**, and each for a stated reason:

- `docs/THREAT-MODEL.md` — **it stays accurate untouched.** Its sentence at the
  T4 secret-lifecycle bullet reads *"Staged content that is binary — and so
  unscannable — is withheld the same way as a quarantine-severity finding,
  fail-closed"*, and the quarantine-severity way it names two sentences earlier
  is *"the flagged working-tree copy is first preserved into
  `state/quarantine/`"*. Under this reorder that becomes true again, which is
  one of the two consequences the owner named as the point of choosing B. It is
  pinned by rows **Q10** and **Q17** of the shipped
  `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`; both keep holding.
- `src/cli/dream.js` and `tests/unit/dream-pipeline.test.js` — a parallel
  implementer round is editing them, and the amendment does not need them.
  The pipeline already builds the gate with the state directory
  (`makeGates({ stateDir: paths.state })`), which is all the preservation
  requires from that layer.
- `src/core/digest.js` — the banner needs no change. It lists
  `state/quarantine/`; restoring the copy is what makes it fire.

### Exact contracts

The gate's signature is unchanged. What changes is that `record.binary` becomes
a **required, load-bearing input** rather than an ignored one:

```js
/**
 * @param {{rel:string, record:{binary?:boolean}, baselineBytes:Buffer|null,
 *          afterBytes:Buffer, addedLineNumbers:number[],
 *          layout:import('../layout').VaultLayout, date:string}} g
 * @returns {{ok:true}
 *          |{refuse:true, reason:string, preserved:Array<{artifact:string, location:string}>}
 *          |{redact:true, sanitizedBytes:Buffer,
 *            redaction:{lines:number, labels:string},
 *            preserved:Array<{artifact:string, location:string}>}}
 */
const secret = (g) => { ... }
```

The two refusal reason strings are **byte-identical before and after**. The gate
returns the undecorated form and `promote()` prefixes `EP2:` and a space, which is what it
already does for every gate refusal:

| Class | Gate `reason` | Refusal recorded by `promote()` |
|---|---|---|
| binary | `content is binary and cannot be secret-scanned; not promoted` | `EP2: content is binary and cannot be secret-scanned; not promoted` |
| not lossless UTF-8 | `content is not lossless UTF-8 and cannot be secret-scanned; not promoted` | `EP2: content is not lossless UTF-8 and cannot be secret-scanned; not promoted` |

A worked example. The brain writes `01-Projects/alpha/note.md` with bytes
`23 20 00 ff fe 0a` on a run dated `2026-08-29`. The delta primitive marks the
record `binary: true` and gives it `addedLineNumbers: []`.

- **Before:** `promote()` refuses; `state/quarantine/` is never created;
  `res.refused[0].preserved` is `[]`; no banner.
- **After:** `promote()` calls `gates.secret` with `record.binary === true` and
  the raw six bytes; the gate writes `state/quarantine/2026-08-29-note.md`
  (`0600`, byte-identical, NUL and all) and returns
  `{refuse: true, reason: 'content is binary and cannot be secret-scanned; not promoted',
  preserved: [{artifact: '2026-08-29-note.md', location: 'quarantine'}]}`;
  `promote()` records the refusal with reason `EP2: content is binary and cannot
  be secret-scanned; not promoted`, increments `secretDisposition.withheld` to 1,
  and attaches the preservation record with `remediation: 'delete'`; the banner
  fires on the next digest.

## Contract reference

Activation trigger (ADR-0031's 2-of-7 test) fires on three:

- **(ii) a result taxonomy changes** — which EP2 arm the unscannable class
  belongs to;
- **(v) the task crosses an authority boundary** — the classification moves from
  the caller to the gate, and the gate is the party that preserves;
- **(vii) the same contract appears in multiple mirrored surfaces** — a Done
  spec's Table D, a threat-model sentence, two source JSDoc blocks, a test
  harness and five tests.

### Table U — the unscannable class: owner, arm, and what it produces

**This table is the single place these facts are decided.** Every other surface
in this spec, and every code comment the WP writes, defers to it.

| Row | Fact | Value, and why |
|---|---|---|
| **U1** | **Which EP2 arm handles unscannable content** | **The WITHHOLD arm — the SAME arm a hard-secret finding takes, reached by the same fall-through.** It preserves the judged bytes to `state/quarantine/` and then refuses. **The carrying argument is SIBLING PARITY:** under promotion, a hard-secret withhold already preserves brain-authored workspace bytes that were **never in the vault**. Unscannable content has the same origin, the same author and the same "destroyed with the workspace" fate. One class getting a durable copy plus a banner while the other got nothing was an asymmetry with **no defence** — "brain-authored, never in the vault" is the strongest form of the argument for withholding preservation, and this design already declines to take it for the adjacent class |
| **U2** | **WHO classifies** | **The EP2 gate (`makeGates(...).secret` in `src/core/dream/validate.js`), not `promote()`.** The party that holds the bytes and performs the preservation is the party that must decide "can this be scanned?", because deciding it anywhere earlier puts the refusal **ahead of** the preservation — which is exactly the regression measured in the logbook entry. `promote()` keeps NO copy of the predicate: the module-local `isLosslessUtf8` is deleted, so there is no second place the decision can drift to |
| **U3** | **What a withheld unscannable path PRODUCES** | Three things, the same three a hard-secret withhold produces: (a) a durable copy at `state/quarantine/<date>-<sanitized-basename>`, `0600` inside a `0700` directory, **byte-identical to the judged bytes** (never decoded — decoding is the thing that is unsafe here); (b) a **preservation record** `[{artifact, location: 'quarantine'}]` on the gate's verdict, which `promote()` reads and completes with `remediation: 'delete'` (Table Q rows Q8/Q9 of `WP-dream-promote-module` own that shape); (c) the **digest pending-review banner**, which follows automatically because `listSecretQuarantine` reads that directory |
| **U4** | **The order of the two checks, and why it precedes the decode** | `record.binary === true` first, then the UTF-8 round trip, **both before `afterBytes.toString('utf8')`**. The delta primitive's `binary` flag is the first half of "unscannable" and the round trip is the second; the decode below them is precisely what these bytes cannot survive, so no branch may run it first. A caller that omits `record` gets only the round-trip half — stated in the gate's JSDoc, not left to be discovered |
| **U5** | **Neither class is a FINDING, so neither may reach the redact arm** | The redact arm scrubs lines and re-encodes; on bytes that do not round-trip it would rewrite lines the run never added, all over the file, while reporting that it replaced only the added ones. The classification therefore **skips the redact arm entirely** and goes straight to the withhold arm — `redactCopy` stays `null` and `redactFellThrough` stays `false`, so the preservation-failure abort and the identity-gated deletion are not in play for this class |
| **U6** | **The refusal reasons are UNCHANGED, byte for byte** | Both strings are exactly what shipped, and they are METADATA ONLY — a code-owned sentence, never a matched byte and never a line of the note. What moves is who composes them; the gate returns the undecorated form and `promote()` adds the `EP2:` prefix (with its trailing space) it adds to every gate refusal, producing the identical final string |
| **U7** | **What deferral is, and what it is NOT** | The transcript still defers, exactly as before: `promote()`'s `verdict.refuse` branch increments `secretDisposition.withheld`, and per Table E only `withheld` defers a transcript. **Deferral is not a substitute for preservation and never was** — measured: the retired validator's binary branch set its reason and fell through to the withhold arm, which **both preserved AND counted the revert**, so the transcript deferred *alongside* a durable copy. **Nothing was traded for deferral, so deferral cannot be what replaced preservation.** This row exists so the "the transcript regenerates it" defence is not re-offered; it is additionally false on its own terms, because deferral is bounded at `SECRET_REVERT_MAX_DEFERRALS = 3` and a binary note is binary deterministically — three regenerations, then the transcript is retired with a sticky skip and the bytes are gone |
| **U8** | **`docs/THREAT-MODEL.md` needs NO edit** | Its T4 sentence *"Staged content that is binary — and so unscannable — is withheld the same way as a quarantine-severity finding, fail-closed"* becomes **true again** under this reorder, because the quarantine-severity way it names is "the flagged working-tree copy is first preserved into `state/quarantine/`". Rows **Q10** and **Q17** of `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`, which pin that sentence and the `validate.js` header's parenthetical `(and unscannable binary content)` into one voice, keep holding unamended. **Keeping the claim true with no rewrite is the second consequence the owner named as the point of disposition B** |

### Mirrored Surface Checklist

Every surface that mirrors **Table U**. A review finding updates the table and
all of these in one pass; a new mirror found in review is registered here on the
spot.

- [x] **Deliverables-table cells** — the `promote.js`, `validate.js` and two test
      rows each restate U2 and U1; the "Explicitly NOT in the boundary" bullet
      for `docs/THREAT-MODEL.md` restates U8.
- [x] **Acceptance criteria** — AC1 (U2), AC2/AC3 (U1, U3), AC4 (U4), AC5 (U6),
      AC6 (U7), AC7 (U8), AC8 (U5).
- [x] **Verification commands / greps** — V2's grep asserts the absence of the
      pre-refusal in `promote.js` (U2); V3's grep asserts `docs/THREAT-MODEL.md`
      is untouched (U8).
- [x] **Current-state description** — the `## Current state` section states the
      pre-move ownership and the gate's existing withhold arm; it is the "before"
      of U1/U2 and must move with them.
- [x] **Operative prose steps** — `### Exact contracts`, including the reason
      table (U6) and the worked example (U3).
- [x] **Code comments this WP writes** — the replacement comment at the EP2 call
      site in `promote.js`, the classification comment in `validate.js`, the
      gate's JSDoc premise (U4), and the `gateFixture` harness comment. Each
      cites `WP-ep2-unscannable-preserve`, Table U rather than restating the
      reasoning.
- [x] **The amended Done spec** — `docs/specs/done/WP-dream-promote-module.md`,
      three surfaces, each now citing Table U as the owner of the arm assignment
      rather than restating it: (1) the "Unscannable content is a REFUSAL, never
      a pass" paragraph, which gains the amendment note; (2) **Table D's EP2 row,
      "Refusal remedy" cell** — the taxonomy sentence that lists which outcome
      each severity takes; (3) **Table Q row Q1**, whose clause "the refuse arm
      carries it too — the hard withhold included" enumerates which arms carry a
      preservation record and must now name this class too. Table Q rows Q8 and
      Q9 are deliberately NOT touched: Q8 governs refusals reached *after* EP2
      ran, and unscannable is an EP2 refusal; Q9's per-field provenance is
      unchanged.

## Implementation notes & constraints

- **Branch from `7d30fa9` on `wp/dream-promote-in-workspace`, not from `main`.**
  On `main`, `promote()` is not wired into the pipeline at all and the extracted
  gate does not exist; there is nothing to reorder there.
- **`const record` is already taken** inside `secret` — it names the preservation
  record built in the withhold arm. Bind the delta record as `deltaRecord`; a
  second `const record` in that scope is a `SyntaxError`, not a shadow.
- **Do not `return` from the unscannable branch.** Set `reason` and fall through,
  which is both the retired validator's shape and the only way the withhold arm
  runs. Returning early is precisely the mutation the RED proof uses.
- **The `gateFixture` harness must supply `binary`**, because only the delta
  primitive can answer that question and the gate now takes it as an input. Give
  a binary record **empty** `addedLineNumbers`, matching the primitive — that
  empty scan is exactly the thing the gate must not read as a pass.
- Removing the pre-refusal leaves `isLosslessUtf8` in `promote.js` with no
  caller. **Delete it and its export** rather than leaving it dead: a spare copy
  of the predicate in the module that no longer owns the decision is how the
  split gets reintroduced. Its two direct assertions in
  `tests/unit/dream-promote.test.js` go with it; the live predicate in
  `validate.js` is covered end-to-end through the gate by the non-lossless
  fixture, which is the stronger test.
- Zero new dependencies, no new files under `src/`, no build step. Nothing here
  starts a process (ADR-0004).

## Security checklist

- [x] **No new untrusted identifier reaches a filesystem path.** The quarantine
      basename is built by `quarantinePreserve` from `displayName(rel)` (the
      shared attacker-safe basename sanitizer) plus `date`, whose
      `/^\d{4}-\d{2}-\d{2}$/` shape `promote()` already enforces as a positive
      allowlist. This WP adds no path construction of its own — it changes which
      function calls an existing, unchanged preserving helper.
- [x] **The refusal reasons stay metadata-only.** Both strings are code-owned
      constants; neither interpolates note content. Asserted by exact-value
      equality in the fixtures, including one whose bytes carry a planted AWS
      key (Table U row U6).
- [x] **The preserved copy deliberately DOES contain the secret**, because
      quarantine is where the owner inspects what was refused — `0600` inside a
      `0700` directory, outside the vault and outside any git repository, which
      is the shipped contract of `state/quarantine/`.
- [x] **Fail-closed is unchanged.** Unscannable content is still never promoted.
      A preservation that fails returns `null` and the gate still refuses, with
      an empty preservation record — the pre-existing "withholds without a copy"
      behaviour, not a new path.

## Acceptance criteria

- [ ] **AC1** — `promote()` calls `gates.secret` for a record marked `binary`,
      passing `record` (carrying `binary: true`) and the **undecoded**
      `afterBytes`. No unscannable predicate remains in `promote.js`.
- [ ] **AC2** — the real EP2 gate refuses a binary note **and** writes
      `state/quarantine/<date>-<basename>` byte-identical to the judged bytes,
      mode `0600`, inside a `0700` directory.
- [ ] **AC3** — the same holds for a note that is not lossless UTF-8 and that git
      classifies as text (so the `binary` flag is false and the round-trip check
      is demonstrably what caught it). No U+FFFD appears in the preserved copy.
- [ ] **AC4** — the classification runs before any decode: a binary fixture with
      an embedded secret is refused with the binary reason, never the
      secret-pattern reason.
- [ ] **AC5** — both refusal strings are byte-identical to the pre-change ones,
      asserted by exact equality, and neither contains any byte of the note.
- [ ] **AC6** — `secretDisposition.withheld` is `1` for a single withheld
      unscannable path, so the transcript defers exactly as before.
- [ ] **AC7** — `docs/THREAT-MODEL.md` is unmodified by this PR.
- [ ] **AC8** — nothing is written to `state/quarantine/redacted/` on the
      unscannable path; the redact arm is never entered.
- [ ] **AC9** — idempotence: `N/A — this WP ships no command and writes nothing
      outside the repo; it changes which function makes one in-process decision.`

### Both-directions proof (required — the point of the WP is a thing that HAPPENS)

Green alone cannot distinguish "preserved" from "the assertion was deleted
again", which is how the regression got in. Each mutation below must turn the
named tests RED; restore the file afterwards.

| Mutation | Applied to | Must fail |
|---|---|---|
| **A** — restore the Phase-1 pre-refusal in `promote()` | `src/core/dream/promote.js` | both `dream-promote D:` tests — the gate is never called |
| **B** — the gate classifies but `return`s with `preserved: []` instead of falling through to the withhold arm | `src/core/dream/validate.js` | all three unscannable fixtures in `tests/unit/dream-validate.test.js`, on the preservation record |
| **C** — the gate stops classifying binary records (`if (false && ...)`) | `src/core/dream/validate.js` | the two binary fixtures — the note is kept |

## Verification steps (run these; paste output in the PR)

```bash
# V1 — the two suites this WP changes
node --test tests/unit/dream-validate.test.js tests/unit/dream-promote.test.js

# V2 — no unscannable predicate survives in the promotion module (expect: no output)
grep -nE 'isLosslessUtf8|record\.binary === true' src/core/dream/promote.js

# V3 — the threat model is untouched by this PR (expect: no output)
git diff --name-only 7d30fa9..HEAD -- docs/THREAT-MODEL.md

# V4 — the full suite and the lint pipeline
npm test
npm run lint
```

## Out of scope (do NOT do these)

- **Rewriting `docs/THREAT-MODEL.md`** — Table U row U8: it stays true.
- **`src/cli/dream.js` and `tests/unit/dream-pipeline.test.js`** — a parallel
  round owns them (`WP-dream-promote-in-workspace`), and the amendment does not
  need them.
- **The redact arm's `lines` count narrowing** — a named pending owner decision
  in `WP-dream-promote-in-workspace` row G7, untouched here.
- **Quarantine retention, export or uninstall behaviour** — owned by
  `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` (Table N) and
  `WP-adr-0019-quarantine-uninstall-export.md`.
- **Any change to the banner's own logic** in `src/core/digest.js` — it needs
  none; restoring the copy is what makes it fire.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   the three both-directions mutation runs.
2. Conventional commits; PR titled
   `fix(dream): preserve unscannable content before refusing it (WP-ep2-unscannable-preserve)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review.
