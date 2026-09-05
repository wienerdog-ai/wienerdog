---
date: 2026-09-05
title: Owner brief — derived reply headers can exceed the RFC line limit
related_wps: [WP-audit-d-code-derived-recipients]
---

# Owner brief — derived reply headers can exceed the RFC line limit

> **RULED 2026-09-05 — option (a), plus the two small fixes.** The owner answered
> *"go with a) as you recommended"* after reading this brief. Provenance and the
> full disposition are in
> `docs/specs/logbook/2026-09-05-owner-rulings-audit-d-derived-headers.md`; the
> ruling is applied in `WP-audit-d-code-derived-recipients` (Table B steps 2, 5 and
> 7, and Dispatch-precondition item 10). **The body below is left exactly as the
> owner read it** — including its "The loop is stopped" section, which described
> the state at the moment of the ruling and is now history rather than status.

## The question

`create_reply_draft` builds a reply's `Subject` and `References` headers from the
message it replies to. We bound every **incoming** header at 998 characters, but
the headers we **build** from them can come out longer — and Gmail then receives
mail that breaks RFC 5322's 998-character line limit.

**How should the verb handle a derived header that would exceed 998 characters?**

## The loop is stopped

Four review rounds, both channels. The design gate's final stop criterion fired:
round 4 found cases the executed case table does not refuse, on a contract that had
already triggered the ADR-0031 circuit breaker. **Table B is frozen and the work
package stays `Draft` until you rule.** Nothing is being dispatched under a
recommendation on this contract.

**Resuming looks like:** one architect pass applying your ruling, then round 5 as a
closing confirmation on both channels.

## What fired, and the measured numbers

- **R4-A — the real one (both channels agreed).** A 998-character source `Subject`
  becomes `Re:` plus a space plus it = 1002 characters — a 1011-character `Subject:` line. Twenty
  ordinary 47-character Message-IDs make a 959-character `References` that passes
  our bound; step 6 then appends the parent id → 1007 characters, a 1019-character
  line. `buildMime` writes single physical lines with no folding, so both go out
  over the limit. Our tests use a stubbed client, so they pass while Gmail would
  receive non-conforming mail.
- **R4-B — small.** The spec says the incoming bound makes the "is this header
  blank" test's shape irrelevant. It doesn't: a correct-looking test written with a
  nested-quantifier regex took **over 1.5 seconds on a 47-character input**.
- **R4-C — small.** A reply to a message with an empty subject produces `Re:` plus
  a trailing space, which on the next reply trims back to `Re:`, is then read as
  already-prefixed, and so is not stable across a thread.

**Also worth knowing** (raised as out of scope, but it is your cost to weigh): with
typical 47-character Message-IDs, an ordinary thread about **21 messages deep**
arrives with a `References` header over 998 characters and is refused outright by
the incoming bound. That is the cost of the 998 bound you were already asked to
accept as item 8 — now quantified.

## Options for R4-A

**(a) Refuse at the output — RECOMMENDED**
After deriving, if the `Subject:` or `References:` line would exceed 998
characters, refuse and create no draft. Extends the contract we already have
("bound it, never build unbounded") to the outputs; no new machinery.
*Cost:* a subject over ~989 characters, or a thread whose References plus the
parent id exceed the budget, cannot be reply-drafted — the user replies by hand.
The incoming bound already refuses most such threads, so the extra loss is small.

**(b) Fold and encode inside `buildMime`**
Generate RFC-compliant folded and RFC 2047-encoded headers. Correct in the full
sense.
*Cost:* MIME-construction machinery and its tests inside a package about
recipients, plus another full design round. Note `buildMime` today also emits raw
UTF-8 in headers for the already-shipped verbs — pre-existing, out of scope here,
recorded under "Discovered issues".

**(c) Trim `References` from the middle, then (a) for `Subject`**
Keep the first and the most recent message ids that fit — what mail clients do.
Keeps deep threads repliable.
*Cost:* a trimming rule to specify and prove, in a package that has already spent
four rounds on this contract.

## The two small ones

- **R4-B:** prescribe the blank-check as a single non-backtracking scan —
  `/[^ \t]/.test(v)` — linear by construction. One line, no cost.
- **R4-C:** when the source subject is empty after trimming, the derived subject is
  **empty too** (no `Re:` on nothing). Gmail's threading condition is subject
  *equality*, so an empty subject matches an empty subject, and applying the rule
  twice changes nothing. Fixtures: empty, spaces, tabs, and two applications.

## Recommendation

**(a) plus the two small ones.** It is the smallest change that makes every draft
we build conform, it reuses the contract shape the package already proved, and it
adds no machinery. **(c) is the natural successor** if dogfooding shows that deep
threads matter in practice — it is strictly additive to (a).

## What each choice means for the schedule

- **(a) + the two:** one architect pass, then round 5 to confirm. Shortest path.
- **(b):** a new design round on MIME construction before anything else moves.
- **(c):** (a) first, then a follow-up work package for the trimming rule.
