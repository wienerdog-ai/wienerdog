---
date: 2026-08-11
title: Alert-callout rendering spec — round zero, coherence pass, and five external rounds
related_wps: [WP-neutralize-alert-callout-rendering]
---

# Alert-callout rendering spec — round zero and five external rounds (2026-08-11)

Covers everything run against `WP-neutralize-alert-callout-rendering` before it was
put to the owner. Raw reviewer output for each external round is committed verbatim
beside this file, each one **before** its findings were read for adjudication.

## The series

| round | kind | findings |
|---|---|---|
| zero | template conformance, throwaway executor, two inputs | PASS + 1 unresolved reference |
| — | internal coherence pass, fresh context | 16 (1 high, 8 medium, 7 low) + 7 needs-the-tree |
| 1 | external, codex companion | 4 (2 high, 2 medium) |
| 2 | external | 4 (2 high, 2 medium) |
| 3 | external | 3 (2 high, 1 medium) |
| 4 | external | 1 (high) |
| 5 | external | 2 (1 high, 1 medium) |
| — | **owner ruling (c): refusal replaces truncation** | — |
| 6 | external (first attempt hung, cancelled, re-run) | 3 (1 high, 2 medium) |
| 7 | external | 3 (1 high, 2 medium) |
| 8 | external | 2 (1 high, 1 medium) |

**16 → 4 → 4 → 3 → 1 → 2 → 3 → 3 → 2.** The loop has NOT met the closure criterion
and is stopped twice over: once at round 5 for the design question below, and again
at round 8 for a **new** owner decision it surfaced.

## What the spec was before any of this

Two commits: a 752-line first draft, then a distillation to 377 after the owner
observed it had been modelled on `WP-sanitize-project-display-names` (763 lines,
written **before** the altitude rule in `docs/runbooks/spec-authoring.md`) rather
than on `WP-daily-summary-per-line-framing` (298, written after). The literal
function body, splice site, test-file head, ten-test table and ten mutation rows
came out; the properties they encoded stayed as acceptance criteria.

## Three defects the process caught that no round did

Recorded because they are the ones a reader would not find in the raw outputs.

1. **A gate that could never pass.** Two verification steps were written
   `test "$(git diff … | wc -l)" = 0`. `wc` left-pads on macOS, so the comparison
   is `"       0"` against `"0"` — red on a clean tree. This is the mirror of the
   vacuous gate the observe-green-and-red rule exists to catch, and the same rule
   caught it. Now `git diff --quiet`, observed in both directions.
2. **A count stated before it was counted.** "The first nine criteria quantify over
   Table A" — there were ten; the tenth applies the same facts to the persisted
   surface. Found by counting rather than by reading.
3. **A refuted finding that still earned its keep.** The coherence pass argued the
   render budget breaks idempotence at the boundary. Measured: it does not, the
   truncated form is its own fixed point. But the sweep that would gate it uses
   three-character shapes and never reaches the budget, so the claim was true and
   **ungated**. The criterion now names the overflow case.

## Two structural answers, both under the circuit breaker

**First application, after rounds 1 and 2 both landed "the spec asserts a security
property wider than its contract decides".** Table A gained a canonical
**scope-of-the-guarantee** row: physical source-line containment is granted;
renderer-level structure is not, because a payload of ordinary ASCII such as an
inline `<h1>` is out of reach of a code-point denylist and narrowing the alphabet
would mangle every real alert. The title, H1, Context, Security checklist and
acceptance criteria were reduced to citations. Round 3 then found the title and H1
still unqualified and the Mirrored Surface Checklist claiming they carried a
citation, which a title cannot — both now carry the qualifying words instead.

**Second application is the design question below**, because rounds 4 and 5 both
landed on the truncation contract.

## The measurement that changed the most

`sanitizeAlert` slices to `MAX_FIELD_CHARS` and only then runs `redactOnly`, which
**expands**. Round 1 measured that a 2000-character `api_key=…` field is written to
`alerts.jsonl` at **3235** characters but comes back from `readAlerts` at 2000, and
concluded the renderer never sees more than the cap. Round 2 refuted that by
attacking the input nobody had varied: a record `appendAlert` did **not** write —
hand-edited, or left by an older version — makes `readAlerts` return **3235**
characters carrying **no unsafe code point at all**. So the renderer can be handed a
benign field longer than the budget, and this WP truncates it.

Round 3 then found the promised recovery surface does not exist for one field:
`wienerdog alerts` prints the job, the timestamps and the reason, and **never
prints `log_hint`** — the name occurs in `src/cli/alerts.js` only in a JSDoc type.

## OPEN DESIGN QUESTION — the render cap has produced findings in three consecutive rounds

The cap exists for one reason: escaping expands up to 9× per code point, and
without a bound this WP would hand back in bytes what it takes away in lines
(measured — at two hostile jobs the body is expelled where today it survives). It
is not decoration.

But every finding in rounds 4 and 5, and one in round 3, comes from it: maximality
(U1), the lexical-versus-provenance boundary (V1), the encoded-form bound (V2), the
`log_hint` recovery gap (T3). The runbook is explicit that two consecutive rounds
on one family call for a design question rather than a sixth patch.

Three options, for the owner:

- **(a) Keep truncation as specified.** The contract is now correct as far as five
  rounds can establish, but it is intricate: maximality, provenance-defined token
  boundaries, an encoded-form bound, and a per-field recovery story.
- **(b) Drop the cap.** The simplest contract; reintroduces the measured
  byte-starvation regression at two hostile jobs, as a named residual.
- **(c) Replace truncation with refusal.** If a field's complete encoding exceeds
  the budget, emit a fixed code-owned placeholder instead of a truncated prefix.
  **This appears to dissolve the whole family:** there is no retained prefix, so
  maximality, the token boundary and the pass-through interaction all disappear,
  and the emitted text is entirely code-owned, so the `log_hint` recovery gap stops
  mattering. The cost is a product decision — a user with an over-long field sees a
  placeholder instead of the first 2000 characters.

(c) looks the strongest to the executor, and it is **not** applied: it changes what
the user sees, and scope decisions are the owner's.

## Rounds 6–8, after the owner ruled (c)

The ruling worked on its own terms: **every input that generated a finding in rounds
3–5 now takes the refusal branch**, and the family — maximality, token boundaries,
partial fields, per-field recoverability — is gone rather than repaired. It is also
strictly better on the axis that justified a threshold at all: six jobs each
carrying a 2000-character field of astral `Cf` give 48 928 bytes with the body
**gone** before, 1 792 bytes with the body **kept** after.

What rounds 6–8 then found was almost entirely in the *new* prose, and in two
recurring families:

- **Family A — a rule that does not say which rendering stage it governs.** Round 6
  named two criteria; round 7 found a third; the structural answer was to sweep all
  twelve rather than the ones a round names, plus a Table A row defining the two
  stages, moved to position 1. Round 8 found a fourth anyway — and how it hid is
  the lesson: **criterion 10 said "the same properties hold on the persisted managed
  block" and delegates by reference, so a sweep for stage words passes straight over
  it.** A criterion that points instead of stating inherits whatever confusion it
  points at.
- **Family B — a frequency claim over a producer population nobody measured.**
  Three instances across three rounds (C9, W2, X3), each finding one more unbounded
  path: the containment probe's raw `err.message`, the external `--version` string,
  and finally `policyHooks.sources.join(', ')` — file paths read from a drop-in
  directory, inside the very template that had been cited as "fully code-owned".
  The structural answer was to **delete the proportionality argument** rather than
  narrow it a third time.

## NEW OPEN OWNER DECISION — refusal can make a failing job unidentifiable

Round 8 surfaced an extension of the accepted price that the ruling did not
contemplate, and it is flagged rather than absorbed.

The contract refuses **per field**, uniformly. The decision now rests entirely on
its consequence — and that consequence is **not uniform across the four fields**.
When the *reason* is refused, the line still names the job, the count and the log.
When the **job name** or the **log hint** is itself refused, that field is replaced
too: the line survives but identifies neither which job failed nor where its log
is, and two distinct over-long job names render as two lines naming neither. The
line-count criterion does not catch this, because it counts lines.

Two ways out, for the owner:

- **Accept it.** The untouched record is in `alerts.jsonl` and `wienerdog alerts`
  prints the job and reason from it, so the information is recoverable outside the
  digest. The criterion is now honestly named "No failing job loses its **line**".
- **Exempt `job` from refusal.** Keeps the callout always identifiable, at the cost
  of putting one unbounded field back into the prefix — the thing the threshold
  exists to prevent.

## Where the spec stands

`status: Draft`, 520 lines, `npm run lint` green, the Deliverables table verified
against `scripts/boundary-check.js` in all three directions.

Decisions taken since this record was opened: the truncation contract is **(c),
refusal** (owner), and the producer-side residual is a **queued follow-up package**
(owner), not a dependency — `depends_on` stays `[]` and the self-email stays a
named non-goal.

**One decision is open and blocks closure:** the job/log-hint identifiability
question above. It is not a wording defect and no further review round will settle
it — a ninth round would re-examine a contract whose product question is known to
be open.
