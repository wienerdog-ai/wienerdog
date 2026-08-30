---
date: 2026-08-13
title: "Deferred: entry-level daily provenance — granularity, not protection"
related_wps: []
---

# Deferred: entry-level daily provenance (2026-08-13)

**Status: DEFERRED by the owner.** A recorded, undecided piece of future
work — deliberately not a work package.

## What it is

Line-level provenance on daily notes: tagging each entry or line of a
daily note with whether it derives from untrusted input, so that
trusted-authored lines could one day be treated as trusted while
untrusted-derived lines stay gated. Today only a file-level
`derived_from_untrusted` flag exists, and nothing writes it onto daily
notes.

## Why it is deferred, and why that is safe

The system fails closed on not-knowing: unable to tell which daily line
came from where, the digest's provenance gate treats the whole daily
summary as untrusted and the per-line framing wraps all of it. The cost of
the gap is therefore **granularity, not defenselessness** — a precision
feature is missing while the safe coarse default stands. Building it is a
cross-cutting writer-side change (every writer of daily-note content must
classify what it writes) and needs its own ADR; it is out of scope for the
security-audit remediation stream. ADR-0032 states the same deferral from
the digest's side: entry-level daily provenance remains the deferred full
solution.

## What reopens it

The snapshot-gating work package — the same package named in
`2026-08-05-parked-report-provenance-product-decision.md` — measures how
often its report-provenance stamp fires. When that measurement lands and
the parked report-provenance decision reopens, this question is taken up
**in the same sitting**: the two decisions share one axis (how much
provenance precision the vault carries), and ruling one without the other
would decide that axis by accident.

## Provenance of this entry

Named as a non-goal while planning the vault-snapshot gating work during
the 2026-07-29 security audit's remediation. Recorded as a logbook entry
so it stays findable beside the parked product decision it is bound to,
rather than living in anyone's memory.
