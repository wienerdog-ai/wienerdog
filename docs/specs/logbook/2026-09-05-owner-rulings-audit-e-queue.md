---
date: 2026-09-05
title: "Rulings: the five owner items of the audit-E ledger-parser design loop"
related_wps: [WP-audit-e-ledger-parser-corpus]
---

# Rulings: the audit-E queue owner items (2026-09-05)

**Provenance.** These are ruled by the owner's standing instruction of
2026-09-05, recorded verbatim in `2026-09-05-owner-rulings-banner-queue.md` and
quoted again here so this record stands on its own:

```text
Regarding the decision items in the handoff document, let us go with your
recommendations. Also, I am going to sleep soon try and get as much done as
possible overnight. You have authorization to perform merges in this session.
```

The instruction settled the **process**, not only the items in front of it at the
time — `docs/HANDOVER.md`'s 2026-09-05 status pass #3 records the general form:
*the maturing architect records a recommendation with the cost of overruling it,
and the session may dispatch under that recommendation, the owner reversing any
of them by dated amendment.* The wording around each ruling below is the
orchestrator's; the decision is not.

**What is being ruled.** `WP-audit-e-ledger-parser-corpus`'s Dispatch
precondition carries **five** items. Its own heading states the rule they were
written under: *accepting all five recommendations changes no Deliverables row.*
**None of the five existed when the instruction was given** — the design loop
parked them at round zero — and the orchestrator applies the standing instruction
to them on the same authority as the queues that preceded it, recording that it
did so rather than letting it pass silently. The owner may reverse any of the
five by dated amendment.

**This record exists because the spec is about to be dispatched.** Executor
finding X1 of round zero established that a work package may not reach an
implementer under a rulings record that names a different package; this one names
this package, and it is written at the `Ready` flip, before dispatch.

## 1. The duplicate-heading refusal covers all THREE reads

Question: should a repeated `##` heading refuse at the candidate read, the
committed-baseline read used for the append-only comparison, **and** the
committed read on the authorization path? Recommendation: **yes.**

**Ruled by the standing instruction — recommendation adopted.** Measured on
`8c52808f`: a committed ledger carrying `## a.b` twice — first section `true`,
last `false` — **authorizes a Tier-3 skill-body revision today**, because that
read takes the last-wins collapse and never runs the schema loop (Table C row
C18). **Overrule cost:** the authorization path keeps trusting a last-wins
collapse of a ledger nothing validated, and rows C18, C19 and C40's
committed-baseline and authorization identities leave the corpus along with
Table D's LPC-E.

## 2. Raise-only fires on INVALID but not on an absent value

Question: confirm the asymmetry — the raise-only comparison fires when the
baseline entry's value is `true` or INVALID, and stays exempt when the bullet is
genuinely absent. Recommendation: **yes.**

**Ruled by the standing instruction — recommendation adopted.** INVALID is a
present-but-unreadable assertion and may not be lowered; an absent bullet is no
assertion at all, and firing on it would permanently mark every legacy entry
lacking the bullet as untrusted. **Overrule cost:** either direction opens a hole
— firing on absent breaks legacy ledgers, and not firing on INVALID lets a
candidate launder an unreadable committed value into `false` (rows C21/C23, and
C37 after A7 routes unparseable values into INVALID).

## 3. `parseFrontmatter`'s record gains a null prototype

Question: accept a test-visible change to a non-security surface in order to
close the `__proto__` promotion-allowlist hole? Recommendation: **yes.**

**Ruled by the standing instruction — recommendation adopted.** Measured: a
promotion adding `__proto__: injected` to a SKILL.md is **allowed with no
qualifying learning today**, while any other added key is refused (rows C29/C30).
The cost is bounded and measured — of six `assert.deepEqual` calls on
`parseFrontmatter`, five fail and are restated to three observables. **Overrule
cost:** ADR-0020's "ANY other frontmatter change requires learning authorization"
stays false for one key name, and row C30 and Table D's LPC-C leave the package.

## 4. Size class `M`, one package

Question: ship this as one `M` package rather than a chain of three `S` ones?
Recommendation: **M.**

**Ruled by the standing instruction — recommendation adopted.** All the fixes
edit `parseLedgerEntries`'s return shape and its three call sites in one file; a
split would serialise three design loops over one function, which is the archive
predecessor's failure mode rather than its cure. **Overrule cost:** three
sequential design gates on one file, two of them blocked on the first, and the
sequencing rule in Out of scope forbids running them concurrently.

## 5. `headEntries`' initialiser becomes `Object.create(null)`

Question: include a one-token change that is measured behaviourally inert?
Recommendation: **include.**

**Ruled by the standing instruction — recommendation adopted.** Differential run:
that change alone leaves the suite at `2630/2618/0/12` with every driver verdict
byte-identical. **Overrule cost:** the same variable stays null-prototype in one
branch and a plain object in the other, and its present safety is a coincidence —
`new Set(he ? he.sessionIds : [])` collapses both branches to an empty set — so
any future read of `he` silently reopens the chain lookup. It carries no RED
proof either way, by construction: nothing observable changes.
