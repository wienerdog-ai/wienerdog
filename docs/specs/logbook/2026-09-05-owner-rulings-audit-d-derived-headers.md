---
date: 2026-09-05
title: "Ruling: derived reply headers — refuse at the output (the first DIRECT ruling of the audit-D loop)"
related_wps: [WP-audit-d-code-derived-recipients]
---

# Ruling: derived reply headers (2026-09-05)

**Provenance — this is a DIRECT ruling, not the standing instruction.** The owner
read the ruling brief and answered in session:

```text
go with a) as you recommended
```

Every previous decision in this package's design loop was dispatched under the
owner's **standing instruction** of 2026-09-05 ("let us go with your
recommendations"), recorded in
`2026-09-05-owner-rulings-durability-queue.md`. **This is the tenth decision and
the first one the owner made directly**, after reading the brief. The distinction
matters and is why this record exists: a recommendation dispatched under a standing
instruction and a decision the owner actually made are not the same act, and the
tree should be able to tell them apart years later.

The wording around the ruling is the orchestrator's; the decision is not.

## What was asked

`docs/specs/logbook/2026-09-05-audit-d-owner-brief-derived-headers.md`, written at
branch tip **`197cd797`**, after round 4 of the design gate fired the loop's final
stop criterion and froze Table B.

The question, as the brief put it: `create_reply_draft` builds a reply's `Subject`
and `References` headers from the message it replies to. Every **incoming** header
was bounded at 998, but the headers the verb **builds** can come out longer — and
Gmail then receives mail that breaks RFC 5322's 998-octet line limit. How should
the verb handle a derived header that would exceed it?

## What is ruled

**(a) — refuse at the output.** After derivation, if the `Subject`, `In-Reply-To`
or `References` line would exceed 998 UTF-8 octets, the verb refuses with a fixed
message and creates no draft. This extends the contract the package already
proved — *bound it, never build unbounded* — to the outputs, and adds no new
machinery.

**Plus the two small fixes named in the brief's recommendation:**

- **R4-B** — the recipient-selection blank-check is **prescribed** as
  `/[^ \t]/.test(v)`: one character class, no quantifier, linear by construction.
- **R4-C** — an empty-after-trim source subject derives the **empty string** (no
  `Re:` on nothing), making the derivation a fixed point.

**Accepted cost, stated in the brief and accepted with the ruling:** a subject over
roughly 985 octets, or a thread whose `References` plus parent id exceed the
budget, cannot be reply-drafted by the routine — the user replies by hand. The
incoming bound already refuses most such threads, so the marginal loss is small.

## What is NOT ruled

- **(c) — trim `References` from the middle**, keeping the first and most recent
  ids that fit, is named as the **successor candidate** and is deliberately **not
  filed** as a work package. It is strictly additive to (a). The owner may file it
  by a later ruling if dogfooding shows deep threads matter in practice.
- **(b) — folding and RFC 2047 encoding inside `buildMime`** is **rejected for this
  package**, with the brief's cost: MIME-construction machinery and its tests
  inside a package about recipients, plus another full design round.
- **Discovered, not fixed here:** `buildMime` today emits raw UTF-8 in headers for
  the already-shipped verbs. Pre-existing and out of scope; it belongs under
  "Discovered issues" in the implementer's PR, not in this package.

## Where it is applied

`WP-audit-d-code-derived-recipients`:

- **Table B step 7** — the output bound, with the measure stated as UTF-8 octets
  and its per-header budgets derived from the prefix lengths.
- **Table B step 2** — the prescribed blank-check.
- **Table B step 5** — the empty-subject fixed point.
- **Exact contracts** — three distinct fixed refusal messages, one per refusing
  step group, so a test can tell which step refused.
- **Dispatch precondition, item 10** — recorded as `RULED (a)`, and marked as the
  first direct ruling so the spec's own list is complete.

## Two things the ruling's application changed about the brief's own numbers

Both were found by executing the rule rather than reading it, and both are recorded
in the round-4→ruling section of
`docs/specs/logbook/2026-09-05-audit-d-design-gate-rounds.md`:

1. **`In-Reply-To` CAN exceed 998, and is therefore checked.** The instruction
   accompanying the ruling said it could not, given the input bound. It can: the
   `In-Reply-To` prefix costs 13 octets, so a **986-octet `Message-ID` passes step
   0 and still produces a 999-octet line** (measured). Step 7 covers all three
   headers, not two.
2. **R4-B is far worse than reported.** The brief cited "over 1.5 s"; executed
   here, the pathological blank-check took **33 962 ms on a 47-octet input**.

## What happens next

One architect pass — this one — applies the ruling. Then **round 5 runs as the
closing confirmation** on both channels. The loop closes on zero product findings;
machinery findings at that point are fixed in-surface without another round. The
ruling covers (a); it does not license re-deriving anything else in Table B.
