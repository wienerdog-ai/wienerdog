---
date: 2026-08-01
title: A correct refusal that repeats forever is a different defect from a wrong refusal, and it has a different door
related_wps: [WP-attended-alert-acknowledgement, WP-refusal-remedy-discriminator, WP-dev-descriptor-no-tree-hash]
---

# A correct refusal that repeats forever is a different defect from a wrong refusal, and it has a different door (2026-08-01)

**The condition.** On the maintainer's dev-stance install, the hourly catch-up
entry refuses because `<core>/app/current` legitimately resolves outside
`<core>/app`. Every layer of that is working exactly as ADR-0028 ratified it:
containment is the stance authority, the catch-up path has no dev branch, the
refusal is fail-closed, the remedy class is `reinstall` because nothing was
confirmed, and the alert is durable. Measured on 2026-08-01: **119** records,
**two** distinct `(job, reason)` pairs, **118** of them identical and one per
hour since 2026-07-27T13:53:42.303Z. Every one of those records is correct. The
digest banner they produce told the owner, on every session start for six days,
that he might be compromised and should reinstall from a trusted source.

**The trap the first two candidate fixes fell into.** Both obvious repairs — make
the refusal text dev-aware, or stop registering catch-up on a dev install — read
the install's stance, and ADR-0028's §3 rule forbids selecting a path on a signal
an A7-scoped write can produce. The instinct is to check whether the *specific*
signal is forgeable and, if it looks solid, proceed. That instinct is what needed
correcting twice in this chain already: §3 exists precisely because
`WIENERDOG_DEV` looked solid, then on-disk `.git` looked solid, and each was
falsified by moving the write one attended `sync` earlier. Containment is
genuinely the stance authority and genuinely cannot be forged by writing *into*
the tree — but `app/current` is a **symlink**, and repointing one symlink is a
scoped write that produces "dev" on a production install. So a dev-aware banner
would have reassured the user at the exact moment a repoint attack was in
progress. The signal that resists writes *inside* a boundary is not automatically
the signal that resists writes *at* it.

**What actually decided it was not the security argument.** Candidate (b) —
don't register catch-up on dev — survives §3 in the narrow sense: it selects
between *enforced* and *absent*, never between enforced and *reduced*, so it
creates no weaker execution path. It died on a much duller fact: **nothing ever
clears a `--catch-up` alert.** `clearAlerts` runs when a job *succeeds*, and
`--catch-up` is a pseudo-job that never reports success, so all 119 records are
durable by construction. Unregistering the entry would have stopped record 120
and left the banner rendering the previous 119 forever. The candidate that
survived the threat model failed the arithmetic. It is worth writing down that
the arithmetic was cheaper to check than the threat model and should have been
checked first.

**The door that was open the whole time was the one that changes a different
noun.** Every candidate was trying to change what the system *verifies* or
*registers*. The problem was never verification — it was **rendering**. An
owner-attended, typed terminal confirmation that suppresses the re-rendering of
one specific already-seen `(job, reason)` pair keys on nothing about the install,
engages §3 not at all, and — because a typed terminal confirmation is not a file
write — sits outside the A7 adversary's reach entirely. The honest boundary is
short and worth stating rather than defending: the acknowledgement store lives at
the same write surface as `alerts.jsonl`, and anyone who can forge a record there
can already delete the log. It adds no capability. The security guarantee of a
refusal was never the alert; it is the zero spawn and the non-zero exit, and both
are untouched.

**The adjacent defect that got recorded instead of fixed.** The launcher's
`appendRefuseAlert` is the only writer of `alerts.jsonl` that applies no record or
byte bound, so the file grows without limit on that path and the app-side
newest-200 compaction lets a repeating refusal crowd older alerts for other jobs
out of the history. The obvious repair — collapse consecutive identical records —
was drafted as a second work package and then withdrawn: `formatAlerts` derives
its count from the record count, so collapsing would have made the digest report
*"has failed"* for a job that genuinely failed 118 consecutive times. A fix that
understates a real recurring failure is worse than the growth it cures. The
correct repairs (give the launcher the same bound the app-side writer has, or
extend the record schema with a count) are larger than they look and are not
launch-day changes. Withdrawing a drafted spec because its cure is lossier than
its disease is a normal outcome and should not need a rescue to discover.
