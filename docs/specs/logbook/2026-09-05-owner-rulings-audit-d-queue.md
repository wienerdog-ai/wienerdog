---
date: 2026-09-05
title: "Rulings: the ten owner items of the audit-D code-derived-recipients design loop"
related_wps: [WP-audit-d-code-derived-recipients]
---

# Rulings: the audit-D owner items (2026-09-05)

**Provenance.** Items 1–9 are ruled by the owner's standing instruction of
2026-09-05, recorded verbatim in `2026-09-05-owner-rulings-banner-queue.md` and
quoted again here so this record stands on its own:

```text
Regarding the decision items in the handoff document, let us go with your
recommendations. Also, I am going to sleep soon try and get as much done as
possible overnight. You have authorization to perform merges in this session.
```

**Item 10 is different and has its own record.** It was ruled **directly**, in
session, after the owner read this package's ruling brief:

```text
go with a) as you recommended
```

Full provenance and disposition:
`2026-09-05-owner-rulings-audit-d-derived-headers.md`. The distinction between a
recommendation dispatched under a standing instruction and a decision the owner
actually made is load-bearing, and this record keeps the two apart.

The wording around the rulings is the orchestrator's; the decisions are not. The
owner may reverse any of the ten by dated amendment.

**When the items arose.** Items 1–7 existed when the standing instruction was
given. **Items 8 and 9 did not** — they were parked by the design loop's escalation
(ii) at rounds 3 and 4, after the owner's message. The orchestrator applied the
standing instruction to them on the same authority as 1–7 and records that it did
so rather than letting it pass silently.

## 1. `weekly-review`'s broker process gains the READ credential

**Question:** `create_draft_to_self` must resolve the owner's address via
`getProfile`, which routes to the READ credential — so a DRAFT-only routine cannot
reach it. Should `weekly-review` load READ as well?
**Recommendation:** yes. **RULED: yes.**
**Overrule cost:** the only alternative is item 2 — there is no third option. The
model's reachable surface is unchanged either way: the verb allowlist still names
only `create_draft_to_self`.

## 2. Keep or drop weekly-review's email draft

**Question:** dropping the draft makes the routine `mcp:'empty'` — no broker, no
credentials, no Google surface for the one routine whose input is the vault
snapshot. Keep it?
**Recommendation:** keep. **RULED: keep.**
**Overrule cost:** `create_draft_to_self` is deleted from the package, weekly-review
loses its broker wiring, and the user loses the emailed weekly review.

## 3. Delete `create_draft`, or leave it defined but de-allowlisted

**Question:** after the split the verb has no callers. Delete the record, or leave
it in the frozen table?
**Recommendation:** delete. **RULED: delete.**
**Overrule cost:** V5 becomes unsatisfiable and the package's title claim false; the
universal would narrow to "no *allowlisted* verb", which nothing enforces.

## 4. `Reply-To` before `From` for the derived recipient

**Question:** which header does the recipient come from?
**Recommendation:** `Reply-To`, else `From`. **RULED: `Reply-To`, else `From`.**
**Overrule cost:** `From`-only breaks replies to mailing-list and aliased mail for
no security gain — both headers are the author's choice, so the residual is
identical either way.
**Named residual (routed by round 5, accepted):** step 2's ruled ASCII predicate
treats `U+00A0` as content, so a `U+00A0`-only `Reply-To` is selected and then
grammar-refused rather than falling through to `From`. Executed: the outcome is a
**refusal, never a wrong recipient**. Widening the predicate to Unicode whitespace
would reopen item 10's cost question on the one test just ruled must stay linear.

## 5. The per-verb call caps, 3 and 10

**Question:** re-decided under the numeric-pin discipline, with each label naming
its movers.
**Recommendation:** `create_draft_to_self` = 3, `create_reply_draft` = 10.
**RULED: 3 and 10**, movers as stated in Table A.
**Overrule cost:** a cap of 1 on the self-draft loses the week's draft to a single
transient error — the counter increments pre-call with no refund (measured).

## 6. T4a's "cannot name a new recipient" claim is false today

**Question:** patch `docs/THREAT-MODEL.md` separately, or let this package's own
deliverable correct it?
**Recommendation:** no separate patch. **RULED: no separate patch** — it lands with
the code that makes it true.
**Overrule cost:** one interim docs commit, and the same two lines rewritten again
when this package merges.

## 7. Table B's grammar is narrower than RFC 5322

**Question:** it refuses quoted local parts, address literals, dotless domains,
comments, groups and obsolete forms, with no draft. Accept the narrowing?
**Recommendation:** accept. **RULED: accept.**
**Overrule cost:** a looser grammar admits addresses the broker cannot reason about,
on the one field an attacker fully controls.
*(Round 1 found this item's original premise misstated — the round-0 pattern
claimed to refuse address literals and did not. The premise was corrected; the
recommendation never changed.)*

## 8. The 998-character input bound on every raw header value

**Question:** a new refusal of long-but-legal headers, applied before any parsing.
**Recommendation:** take the bound. **RULED: take the bound.**
**Overrule cost:** without a pre-parse bound the grammar's worst case reverts to an
input-dependent claim needing re-measurement on every engine after every change —
which is what two consecutive rounds of findings were — and every operation before
the bound becomes attacker-scaled again.
**Admitted cost, quantified in round 4:** the bound **can** refuse conforming mail.
Gmail's API returns unfolded values and RFC 5322 §2.2.3 permits unfolded fields of
any length; with representative 47-character Message-IDs, an ordinary thread about
**21 messages deep** arrives over 998 characters and is refused. An earlier draft
claimed it was "unreachable by conforming mail"; that was **false** and is retracted
in place.

## 9. Keep `create_reply_draft` as a code-derived-recipient verb

**Question:** the loop's stop criterion fired twice on Table B. Is that evidence
against deriving the recipient from the message at all?
**Recommendation:** keep the verb — the findings were the ORDER contract not yet
applied to its own rows, not a defect in deriving. **RULED: keep.**
**Overrule cost:** inbox-triage loses its only outward action (it would draft
nothing), and the audit's group-D ruling is reopened.

## 10. The derived-header output bound — RULED DIRECTLY

**Question:** a derived `Subject`, `References`, `In-Reply-To` or `To` line can
exceed RFC 5322's 998-octet limit even though every input was bounded. Refuse at
the output, fold and encode in `buildMime`, or trim `References` from the middle?
**RULED (direct): (a) refuse at the output**, plus R4-B's prescribed linear
blank-check and R4-C's empty-subject fixed point. **(c)** is the named successor
candidate and is deliberately **not filed**. **(b)** is rejected for this package.
**Overrule cost:** stated in the brief and accepted with the ruling — a subject over
roughly 985 octets, or a thread whose `References` plus parent id exceed the budget,
cannot be reply-drafted; the user replies by hand.
Own record: `2026-09-05-owner-rulings-audit-d-derived-headers.md`.

## OPEN — not ruled, not dispatched under

**Should item 8's input bound be restated in UTF-8 octets to match item 10's output
bound?** Recorded in the derived-headers record. There is **no output-safety
consequence** either way once the output bound covers every emitted line, but
**availability differs**: with 998 `€` characters in `References` and no
`Message-ID`, the character bound drafts (the header is omitted) while an octet
bound would refuse at step 0. The character bound is the more permissive; both are
output-safe.

This is deliberately **not** an owner item and **not** dispatched under the standing
instruction: the architect was caught in round 5 making exactly this change without
a licence, so recording it as an open question the owner answers directly is the
honest correction.
