---
id: WP-audit-d-code-derived-recipients
title: No verb accepts a model-named address — code derives every draft recipient
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0026]
epic: audit-close
---

# WP-audit-d-code-derived-recipients: No verb accepts a model-named address — code derives every draft recipient

> **Draft stub from the 2026-08-31 handover — this is the harvested content
> of the audit's GROUP D ruling (2026-08-05), which previously lived only in
> war-room material.** The measured basis is from 2026-08-05 (tree
> `45f01d1`); **re-measure every citation before maturing to Ready** — the
> tree has moved substantially since.

## Context (read this, nothing else)

The Google-senses broker gates SEND behind a user-created grant, and the send
verb is safe by construction (zero address input — no to/cc/bcc field
exists, ADR-0026 §4). The asymmetry the audit found: **`create_draft`
accepts any address with no grant** (schema constrained only by string
length + no-CRLF; measured at `verbs.js:154/:165/:170`, grant gate covering
send only at `registry.js:71`). Two routines hold ungated `create_draft` on
their allowlists: weekly-review (whose input includes the vault snapshot —
group B's path) and inbox-triage (whose input is inbound mail). Untrusted
input and an outward capability share a session with no mediation (T4a).

A mandatory-self rule was REJECTED with reason: the two consumers need
different recipients (weekly-review drafts to self; inbox-triage drafts
replies to the mail's author). One rule cannot serve both, so **the WP splits
the verb**:

1. `create_draft_to_self` for weekly-review — no `to` field; recipient
   server-resolved to the account owner (the send verb's structure minus the
   send).
2. A reply-draft verb for inbox-triage — input is a MESSAGE ID, never an
   address; code reads the recipient from that message's headers. The model
   chooses WHICH mail gets a reply, never WHERE it goes.
3. Free-recipient `create_draft` leaves both allowlists; whether the verb is
   deleted outright is decided after a dispatch-time sweep for other callers.
4. The grant asymmetry dissolves structurally — no free-address surface
   remains to gate. **Rejected alternative, recorded:** gating the DRAFT
   class behind a grant (a grant is one yes/no made months earlier; once
   given, any address flows again). The structural fix removes the surface —
   the project's own ratified principle. Check whether ADR-0026 §4 needs a
   drafts paragraph.
5. **Named residual:** a reply-draft's recipient is bound to the replied-to
   message, so an attacker who mails the user can obtain a draft addressed to
   themselves. Inherent to replying; strictly narrower than today; every
   draft passes the user's eyes before sending.
6. **Per-verb call caps are re-decided, not inherited.** Measured (2026-08-05
   and re-verified then): the call counter increments PRE-call with no refund
   (`checkAndCount` at `registry.js:69`, before the grant gate at `:71`), so
   a cap of 1 loses the week's draft to a single transient error. The carried
   recommendation (with its measurement, not as a ruling): cap the self-only
   draft at 3. The live send verb's cap was 2. Numbers are chosen per verb
   under the numeric-pin discipline (each label names its movers).

## What done means

- Both new verbs exist with zero address input; free-recipient `create_draft`
  is off both allowlists (deleted or not, with the sweep recorded).
- Tests: a hostile fixture per input route (snapshot-borne for weekly-review,
  inbound-mail-borne for inbox-triage) proving a model-named address has no
  path to a draft's recipient field.
- The named residual is stated in the threat model where drafts are
  discussed.

## Watch out

- Re-measure ALL the 2026-08-05 line citations first — treat them as content
  pointers, not line numbers.
- Skills' SKILL.md prose (weekly-review `:30`, inbox-triage `:24` at the
  time) must move with the verbs — registered-mirror discipline.
