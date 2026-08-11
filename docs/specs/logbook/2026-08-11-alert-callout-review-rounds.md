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

**16 → 4 → 4 → 3 → 1 → 2.** The loop has NOT met the closure criterion (a round
finding nothing about the product), and it is being stopped deliberately rather
than continued — see the design question below.

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

## Where the spec stands

`status: Draft`, 491 lines, `npm run lint` green, the Deliverables table verified
against `scripts/boundary-check.js` in all three directions. Two further items are
named in the spec as **open owner decisions**: whether the producer-side residual
becomes a real work package or an explicit risk acceptance, and — added by this
record — which of (a)/(b)/(c) the truncation contract takes.
