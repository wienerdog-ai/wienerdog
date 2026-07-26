---
date: 2026-07-25
title: Secret-fence false positives destroyed six notes, and six rounds of precision could not fix it
related_wps: [WP-124, WP-secret-revert-defers-ledger, WP-secret-fence-shape-and-context, WP-secret-scan-baseline-oracle, WP-secret-allowlist-exact-value-store, WP-quarantine-review-cli, WP-secret-fence-two-tier-entropy]
---

# Secret-fence false positives destroyed six notes, and six rounds of precision could not fix it (2026-07-25)

**Secret-fence false positives destroyed six notes, and six rounds of precision
could not fix it (2026-07-24 → 2026-07-25).** The 07-24 18:26 dream reverted
three legitimate notes as `high-entropy` false positives — the keychain-auth
resource note, the **2026-07-24 daily rollup**, and its own dream report — and
the 07-25 03:30 run reverted three more. The failure was not the over-firing;
it was that a reverted note **still consumed its transcripts**. `selectState`
marked those sessions processed, so nothing was queued for retry and the 07-24
rollup is permanently gone. This contradicted **ADR-0023's own rule** that only
a file actually consumed is marked processed: the code contradicted the ADR it
implemented, and that one gap is what turned six false positives into permanent
loss. Two layers were needed to see it. The **WP-124** detector's context-free
entropy pass (`[A-Za-z0-9+/=]{24,}` at ≥3.5 bits/char, `high-entropy` at
`quarantine` severity, a single hit reverting the whole note via
`src/core/dream/validate.js`) over-fires on precisely what security notes are
made of — sha256 digests, git SHAs, token-shaped examples — measured at **100
of 178 vault notes (56.2%)** reverted by the EP2 gate. The eighteen labelled
rules were never the problem; only the blunt pass behind them.

**The fix that failed, and why it is worth recording.**
**WP-secret-fence-shape-and-context** attacked the over-firing directly and ran
six adversarial double-gate rounds, producing a **fail-open critical in five
consecutive ones**: word-shaped hex vetoing a real credential in the same token
→ `+` cloaking → a delimiter inside a credential → runs of more than eight
segments → shortest-reach truncation. Every fix *relocated* the hole rather than
closing it. The structural invariant it finally exposed: **suppression plus any
selective extraction is fail-open**, because something always goes unevaluated,
and exhaustive extraction measures quadratic — a DoS at the 256 KiB cap. Two of
its own proposed remedies died on measurement: a bigram "text-likeness"
discriminator (11–41 of 178 vault false positives against a 3/178 target) and
URL-anchored Drive-id suppression (covering **0 of 8** real occurrences, 0.00%
adversarial detection at N=20 000). Twice a verification harness **shared the
spec's blind spot** and certified a class closed when only an instance was — a
closure test whose credential contained no delimiter, and a reach test that
never checked a *rejected* short span. The `+` bypass was itself the product of
four regexes that had to agree on a delimiter alphabet and did not; the
structural cure (one canonical alphabet consumed by every site, plus a generated
95-character closure family asserting the sets identical) then surfaced a second
live instance of the same class, `=`, that no review round had found. Three
rounds that *subtracted* mechanism each closed their finding outright and shrank
the spec; every round that *added* mechanism generated the next finding.

**The reframe, which is the actual lesson.** With a destructive false positive
you need a *precise* detector, and that requirement is what drove the
complexity spiral. **WP-secret-revert-defers-ledger** (PR #111, `efd1489`)
removed the premise instead of chasing the precision: a secret-reverted dream
now **defers** its source transcripts rather than consuming them — three
deferrals, then a loud `secret-revert-exhausted` quarantine with a banner naming
what to do — so a false positive costs a deferred consolidation, not a note. It
also closed an unrelated hole it exposed, `sync` never passing `quarantineLine`
to `renderDigest`, which silently erased the transcript-quarantine banner until
the next dream. Once false positives are **non-destructive** and **reviewable**,
a blunt, provably fail-closed detector beats a precise one nobody can prove
correct — so the fence spec is **superseded, not to be patched**: salvage its
measurement corpus, its adversarial families and its 528 MB transcript baseline,
and discard the design. The replacement chain is deliberately four small
packages, each with its own gate and its own revert point —
**WP-secret-scan-baseline-oracle** (freeze the before-column so a successor
cannot quietly move it) → **WP-secret-scan-whole-token-runs** (make a candidate
a maximal delimiter-bounded run, so a digest can mean *this exact value*) →
**WP-secret-allowlist-exact-value-store** → **WP-quarantine-review-cli**. Shape
allowlists are permanently rejected in every form; **ADR-0033** records the
human-ratified exact-value alternative — sha256 digests of whole spans, never
raw strings, suppressing `high-entropy` only and never a labelled provider
match, with suppression detector-wide as an explicit owner decision. Amends
ADR-0023 (Amendment 1). Extends ADR-0024.

**Addendum, 2026-07-25 (same day) — that four-package chain was itself
superseded before any of it shipped.** Left as written above, because the
sequence is the lesson. Measuring the vault once more with the whole detector
answered the question the chain was built to work around: **100% of the
destructive false positives come from the single context-free entropy rule**
(102 of 181 notes flagged; 101 of them on `high-entropy` alone; the other
seventeen labelled rules produced exactly one finding in the corpus, a
documented `AKIA` placeholder). The allowlist chain treats those as a set of
individually blessable values — measured, ~118 approvals up front, 97% of them
file paths, growing with every new project folder. **The false positives were a
rule defect, not a trust-management problem**, and the tell was visible in the
same data all along: 102 of the 106 flagged runs contain a `/`, and the longest
slash-free segment among them is **17 characters against a 24-character floor**
— a 7-character structural void that no allowlist was needed to cross. The
third lesson, then, after "remove the premise" and "adding mechanism generates
findings": **re-measure before designing around a problem; the workaround chain
was four packages of machinery for a defect one rule wide.** What replaced it:
**ADR-0034** (the fence's threat model — accidental persistence in scope,
deliberate exfiltration out, ratified so a review has a fixed criterion instead
of an unbounded counterexample game) implemented by
**WP-secret-fence-two-tier-entropy**. **ADR-0033 is superseded by ADR-0034 and
was never ratified — nothing in it is in force**; its only durable content, the
permanent shape-allowlist ban, is lifted verbatim into ADR-0034 Decision 7. The
four chain specs are filed under `docs/specs/done/` as `status: Superseded`.
