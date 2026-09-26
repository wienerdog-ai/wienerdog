---
date: 2026-09-26
title: "Rulings: three ADR signatures, all four agents on Opus, the filter's privacy question, and the go to drive the queue"
related_wps: [WP-dream-primary-dialogue-filter, WP-contract-reference-tables, WP-ep2-retention-prune-timing-test, WP-vault-write-cas-window]
---

# Rulings of 2026-09-26 (second message of the session)

Quoted verbatim so this record stands on its own. **Transcribed by the
orchestrator, not owner-typed.** The first ruling of the day (Opus at high effort
for architecture and implementation) is in
`2026-09-26-owner-ruling-opus-high-tier.md`.

```text
I have signed the ADRs. Regarding your judgment calls on leaving the docs and
researcher agents on Sonnet, please switch those over to Opus. The reason for
this is that Opus 5.5 has much better writing skills than Sonnet 5. Once this
change is done, please start to drive the process for implementing the queue
items. Let me know once you get to the point where we can cut the npm release.
Regarding the ruling on the filters' privacy question, the answer is yes,
assuming that this disposable vault only lives on the user's machine and is
accessible by none other than the user.
```

## What each sentence did

1. **"I have signed the ADRs."** The owner edited the three Status lines in his
   own working checkout — ADR-0041 (`:336`), ADR-0019 (`:88`) and ADR-0023
   Amendment 4 (`:520`) — from *"owner signature pending"* to *"owner-signed
   2026-09-26"*. Those three edits are committed unchanged in the PR that carries
   this entry, following the `a8ea9dab` precedent. No agent wrote a signature
   line. `docs/adr/README.md` rows aligned in the same commit.
2. **"switch those over to Opus"** — `wd-docs` and `wd-researcher` move to
   `model: opus`; ADR-0005 Amendment 1's out-of-scope bullet is revised
   accordingly (PR #314, second commit). All four project agents now run on Opus.
3. **"start to drive the process for implementing the queue items"** — the go
   for the sequence recommended earlier this session: done-flip
   `WP-contract-reference-tables`; supersede `WP-ep2-retention-prune-timing-test`
   (its successors are Done); prepare the 0.15.0 release; then the filter's
   offline evaluation and the `WP-vault-write-cas-window` design round.
4. **"Let me know once you get to the point where we can cut the npm release."**
   The release is the owner's act (`npm publish` needs his 2FA); the orchestrator
   prepares the release commit and stops there.
5. **The filter's privacy question: yes, conditional.** Recorded in
   `docs/specs/WP-dream-primary-dialogue-filter.md` under "Entry condition — the
   offline evaluation". The condition is binding: the disposable vault lives only
   on the user's machine and is accessible to no one but the user.
