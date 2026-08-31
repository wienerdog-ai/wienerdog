---
title: Two owner-signed ADR-0039s — the fork's dedup stands, the by-reference chain stands down
date: 2026-08-31
related_wps: [WP-managed-block-by-reference, WP-digest-stable-volatile-split, WP-codex-block-pointer-line, WP-memory-import-hermetic-canary, WP-launcher-refusal-banner, WP-refusal-banner-delivery, WP-launcher-alert-bound, WP-session-start-digest-dedup]
---

# 2026-08-31 — two ADR-0039s, and the chain stands down

**Status: SETTLED — owner ruling, 2026-08-31.**

## What happened

On 2026-08-30, the same double-delivery problem — every session carrying the
digest twice, once in the managed block and once from the SessionStart hook —
was solved twice, on two divergent trees, and both solutions were owner-signed
as **ADR-0039** the same day:

- **Upstream** (pre-fork-adoption): *the managed block is a reference, not a
  copy*. The block shrinks to a preamble plus a memory import of the digest
  path; volatile, untrusted-derived bytes leave the user-owned file entirely;
  the Claude Code hook injection is de-registered. Backed by an eight-WP
  chain (`epic: digest-delivery`), which stayed spec-only: seven design review
  rounds, PR #176 (spec revision) open, PR #174 held, PR #175 draft.
- **The fork** (adopted as mainline base by PR #177 hours later): *the
  SessionStart hook injects the digest only when the managed block does not
  already carry it*. The block keeps the full copy as the no-hooks baseline;
  the hook compares bytes and sends nothing when they match. Implemented,
  mutation-tested (`WP-session-start-digest-dedup`, hardened by
  `WP-hook-doctor-inspection-read-hardening`), and running in the fork's live
  pipeline.

The integration merge of the fork's next 152 commits surfaced the collision:
one number, two signed decisions, opposite mechanisms.

## The ruling

The **fork's ADR-0039 stands**. Deciding weight: it is implemented and tested
on the tree already ruled to be the mainline base, and — together with the
issue #165 remediation on the same tree (`reports/warnings.md`, count+pointer
banners, the 400-line cap) — it removes the measured pain that motivated the
chain. The upstream ADR was renumbered to
[ADR-0040](../../adr/0040-managed-block-is-a-reference-not-a-copy.md) and
marked **Withdrawn**, with a salvage note.

Both designs share the load-bearing safety property: an attended
`wienerdog sync` remains the only writer of `CLAUDE.md`/`AGENTS.md`; no
unattended job read-modify-writes a user-owned file. Nothing in this ruling
weakens that.

## What it took with it

- The seven unimplemented chain specs moved to `done/` as **Superseded**
  (`WP-managed-block-by-reference`, `WP-digest-stable-volatile-split`,
  `WP-codex-block-pointer-line`, `WP-memory-import-hermetic-canary`,
  `WP-launcher-refusal-banner`, `WP-refusal-banner-delivery`,
  `WP-launcher-alert-bound`). `WP-shim-recovery-message` — the eighth spec of
  the epic, but orthogonal in substance — shipped as PR #173 and moved to
  `done/` as **Done**.
- PRs #174, #175 and #176 were closed with disposition comments.
- The Amendment 1 texts this ADR had appended to ADR-0024 and ADR-0032 were
  removed (they described changes that will now not happen); the analyses
  survive in git history at upstream `f139bce` and are cited by ADR-0040's
  salvage note.

## What survives, by name

1. **The write rule** (ADR-0040 §1) — assumed but unstated by the surviving
   ADR-0039; re-propose standalone if it is to be durable ADR text.
2. **The launcher refusal-banner problem** (ADR-0040 §5) — a launcher-stage
   refusal still has no delivery channel that works without the app tree.
   Real, unsolved, re-proposable against the current tree.
3. The instruction-channel argument (fenced untrusted text should not ride in
   a file the harness presents as instructions) and the secret-durability
   argument (a digest copy in a 0644 user-owned file downgrades A5's posture)
   — both remain true observations about the *current* design and are the
   starting brief for any future by-reference proposal.
