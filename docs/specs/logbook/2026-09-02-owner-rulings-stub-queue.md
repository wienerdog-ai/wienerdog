---
date: 2026-09-02
title: "Rulings: the four owner items parked by the 2026-09-01/02 design-gate loop"
related_wps: [WP-index-guard-residuals, WP-preservation-abort-widening, WP-quarantine-preserve-durability, WP-quarantine-banner-location, WP-audit-c-close-disposition, WP-instruction-basename-currency, WP-dot-segment-denial, WP-criterion-red-harness]
---

# Rulings: the stub-queue owner items (2026-09-02)

**Provenance.** The owner ruled these on 2026-09-02, in the session that
resumed from `docs/HANDOVER.md`'s 2026-09-02 status pass, after reading a
summary of the four Dispatch preconditions. The rulings are quoted verbatim
below; the wording around them is the orchestrator's, the decisions are not.
Each spec's Dispatch precondition said "the dispatch message records it"; this
entry exists so the rulings have a record of their own in the tree, because the
2026-09-01 loop found (`WP-preservation-abort-widening`, Dispatch precondition)
that a ruling cited only inside the spec it governs leaves nothing to point at.

## 1. `WP-index-guard-residuals` (PR #196)

Question: is refusing to judge a non-absolute `private` `GIT_INDEX_FILE`
(UNJUDGED state from `classify`, harness error at the seam wrapper) a fifth
failure mode?

```text
1) ratified
```

**Ruled: the refusal is NOT a fifth failure mode.** Table A stands as written;
the WP does not return to design. Dispatch is unblocked.

## 2. `WP-preservation-abort-widening` (PR #197) and its successors

Question (a): confirm the blast radius — the whole run fails loud on the two
newly guarded arms (rows P0–P3), on a read-back mismatch (P0b) and on an
unremovable rejected artifact (Table D row D3) — or make the added arms
refuse-and-continue. Question (b): where `WP-quarantine-preserve-durability`
sits in the owner's earlier chain `WP-preservation-abort-widening` →
`WP-quarantine-banner-location`.

```text
2) fail-loud confirmed. Confirm after WP-quarantine-banner-location.
```

**Ruled: (a) fail-loud, as specified. (b) the chain is
`WP-preservation-abort-widening` → `WP-quarantine-banner-location` →
`WP-quarantine-preserve-durability`.** Dispatch of the first is unblocked; the
second's `depends_on` already names the first; the third's `depends_on` gains
nothing here — its sequencing is this record.

## 3. `WP-audit-c-close-disposition` (PR #199) — severity call

Question: are Table D row D1's open halves (dot-prefixed segments beneath
admitted tiers are promotable; the instruction-file basename list is a stale
enumeration of four) a queued work package, option (i), or an incident with a
hotfix, option (ii)? The spec recommended (i).

```text
3) go with your recommendation
```

**Ruled: option (i), QUEUED.** `WP-instruction-basename-currency` joins the
queue first and `WP-dot-segment-denial` immediately after it, in the normal
order; no incident entry is filed; no hotfix jumps the queue. Group C's
disposition stays **Open — residuals** as Table D records. The third live
mechanism (inherited `GIT_DIR` / `GIT_OBJECT_DIRECTORY` redirecting the run's
writes) stays with Draft `WP-dream-git-env-pinning`, whose product decision is
still open and is not ruled here.

## 4. `WP-criterion-red-harness` (PR #198) — ADR-0042 and the two Node options

Question: sign ADR-0042 (the doctrine — a spec may *require* machine-run RED
evidence, and CI may fail a PR when a declared proof stops proving); and the two
parked options in the spec's Out of scope — raise `package.json` `engines` to
≥ 18.15 (recommendation: raise it, if taken up) and a supported-Node reporter
compatibility matrix (recommendation: revisit together with `engines`).

```text
4) 0042 signed. Agree with recommendations on Node.
```

**Ruled: ADR-0042 is signed by the owner as of 2026-09-02.** The signature line
in `docs/adr/0042-machine-run-red-proofs.md` and its mirror in
`docs/adr/README.md` are the owner's own act (ADR-0035) and land separately
from this record. **On Node: the owner agrees with both recommendations as
written** — the `engines` floor is raised to ≥ 18.15 when that option is taken
up, and the compatibility matrix is revisited together with it, since the two
decide the same range. Neither is taken by this ruling and neither is a
precondition of the harness WP, which enforces its own floor at load.

## What this unblocks

Dispatch-time re-verification (`docs/runbooks/codex-review.md`, "Dispatch-time
re-verification"), then implementation, for: `WP-index-guard-residuals`,
`WP-audit-c-close-disposition`, `WP-criterion-red-harness`,
`WP-preservation-abort-widening`. Still Draft and next in line for maturation:
`WP-quarantine-banner-location`, `WP-quarantine-preserve-durability`,
`WP-instruction-basename-currency` and `WP-dot-segment-denial` (the last two are
filed by `WP-audit-c-close-disposition` itself).
