# 2026-08-30 — the classifier for migrating `tests/unit/dream-validate.test.js`

**Subject:** `WP-dream-promote-in-workspace`, Deliverables row
`modify | tests/unit/dream-validate.test.js | the gates' new inputs and the
removed enforcement half`.
**Status:** owner-approved parallel dispatch. Written BEFORE the dispatch, so the
delegate is judged against a rule and not against a taste.

## Why a classifier and not a task list

Row G7 retires `validateAndCommit`. This file's 133 tests were all written
against it, so every one of them is now in one of exactly three states — and the
expensive mistake is not mis-migrating a test, it is **silently deleting a test
that was asserting a decision the product still makes**. The classifier exists to
make that mistake impossible to make by accident: an unclear test is not a
judgement call for the delegate, it is a hand-back.

## The three classes

### (a) The test asserts a DECISION outcome → MIGRATE

It asserts *what the run decided about a path*: refused or admitted, and with
which reason. That decision still exists — row G7 requires each extracted gate to
return **the same verdict for the same content** as its pre-extraction form — so
the test keeps its subject and changes only its surface.

Migrate it onto the gate/promote surface: the `gateFixture(...)` adapter already
in the file, or a direct `makeGates()` gate call where that reads better.

Signatures of (a):

- `res.reverted.some(r => r.path === X && /reason/.test(r.reason))`
- `res.kept(X)` (already converted from a vault-rooted `fs.existsSync`)
- `res.secretDisposition` / redaction accounting / the preserved-copy record
- anything asserting a refusal REASON STRING

### (b) The test asserts the extracted ENFORCEMENT mechanics → DELETE

It asserts *the machinery that acted on the decision inside the vault*. Under
promotion nothing this file decides is ever written to the vault, so the subject
is gone — not moved, gone. Deleting it is what the Deliverables row means by
"the removed enforcement half".

Signatures of (b):

- `git checkout HEAD -- <rel>` / "restored to HEAD bytes" / "reverted, not committed"
- index manipulation: "the index entry was NOT cleared", `git add -A -- rel`
- the scrub's write-and-stage half: "the rename was actually reached",
  `hash-object`/`update-index` ordering, the pre-rename comparison read
- commit assertions: commit counts, `dream: <date> — N notes` message shape,
  "always commits (report append) even with only reverts", "git revert cleanly
  undoes the whole run"
- `precommitSessionEdits` (the function is retired)
- the Step-4 report append and its `## Reverted by orchestrator` heading
  (Table V row V4 — `WP-dream-promote-report` owns the report now)
- the ownership-registry write (Table V row V6 — row G10 moved it to the pipeline)

**Every deletion carries a RETIREMENT NOTE** — a comment at the deletion site, or
one note covering an adjacent run of deletions:

```js
// RETIRED with the EP2 enforcement half (WP-dream-promote-in-workspace, row G7):
// <what it asserted>. Under promotion nothing is written to the vault, so
// <the subject> has no subject. The DECISION this test rested on is asserted by
// <the surviving test name>, or: is asserted at pipeline level in
// tests/unit/dream-pipeline.test.js.
```

A deletion whose note cannot name where the decision is still asserted is **not
a (b)** — it is a (c).

### (c) Anything else → LEAVE MARKED, DO NOT GUESS

Including, explicitly: a test that looks like (b) but whose decision has no
surviving assertion anywhere; a test that mixes (a) and (b) assertions in one
body and cannot be split mechanically; a test whose reason string changed and it
is not obvious whether the VERDICT changed with it; anything touching the three
durable-lifecycle behaviours (the preservation-failure abort, the identity-gated
deletion of a redundant `redacted/` copy, the once-per-run retention prune),
which are `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`'s and which row G7
requires the extraction to PRESERVE.

Mark it in place and move on:

```js
// CLASSIFY(c): <one line — what is unclear, and which way it could go>
```

Leave the test body untouched under the marker. A marked test that is still red
is the expected output, not a failure of the pass.

## What the delegate does not do

- **No commits, no `git` writes of any kind.** The owner reviews the diff and
  commits it.
- **No file other than `tests/unit/dream-validate.test.js`.** Not `src/`, not the
  spec, not another test. `scripts/boundary-check.js` is the boundary and this
  pass is inside one row of it.
- **No change that makes a test pass by weakening what it asserts.** A migrated
  (a) asserts the same verdict on the same content; if it cannot, it is a (c).

## Ground state at dispatch

Branch `wp/dream-promote-in-workspace`, working tree carries the uncommitted
adapter pass on this file: **48 pass / 95 fail**, from 5 / 138 before it. The
`gateFixture(...)` adapter, the `run(...)` and `RUN(...)` drivers, the 40
converted direct call sites and the vault-rooted `fs.existsSync` → `res.kept()`
conversion are already in place and are not to be re-done.

## The record this pass is also making

The test surface of this WP has proven larger than its `size: M` sizing — this
file alone, plus `tests/integration/dream.test.js` and a
`tests/unit/dream-pipeline.test.js` carrying ~20 acceptance criteria each needing
a green AND a deliberately-red proof. **That is recorded here as a signal, not
argued as a re-sizing:** if the pipeline test's two-directional obligation really
does overshoot, the T-tripwire is what fires on it, and it fires on measurement
after the fact rather than on an estimate before it.
