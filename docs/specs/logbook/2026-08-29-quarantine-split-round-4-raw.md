---
title: Round 4 raw — quarantine surface split (external adversarial review, verbatim)
date: 2026-08-30
related_wps: [WP-quarantine-warnings-file, WP-doctor-quarantine-counts, WP-quarantine-banner-decay, WP-dream-report-run-skips]
---

# Round 4 raw — external adversarial review, relayed verbatim

Backend: a fresh gptsol agent (codex/gpt-5.6-sol), vendored prompt
`docs/runbooks/review-prompts/adversarial.md`; focus text: Part A (verify the
two round-3 findings resolved by the run-log removal) + Part B (final full-set
sweep for loop closure). Reviewed tip: `8a6b934`. Committed before
adjudication per `docs/runbooks/codex-review.md`. Read-only verified (git
status --porcelain byte-identical before/after, both empty; asserted inside
the payload).

Relay note for the adjudication: the focus text stated owner ruling (2) as
"informational quarantine banners decay after a 7-day window; only
secret-revert-exhausted is permanent" WITHOUT the unrecognized-reason
exception the owner ruled separately on 2026-08-29 (the round-zero walkthrough,
second decision: an unrecognized reason is counted with the informational
group but never decays, because the system cannot know it is informational).
Finding 2 below measures the spec against the relay's imprecise ruling
statement, not against the ruling.

---

needs-attention — Do not ship. The run-log removal fixes the composer itself, but the independently landing warnings package still permits non-canonical on-disk bytes into a pre-promotion commit. The banner contract also contradicts the owner-ratified decay rule, and `doctor` does not pin a safe regular-file/readability check for its trusted pointer.

PART A

1. RE-WORDED-NOT-FIXED — The run log, second section, membership append, carried snapshot, and second composer argument are gone, but before `WP-dream-promote-in-workspace` lands, the current pipeline can still commit a brain-edited `reports/warnings.md` through wholesale staging; G8 protects only the later post-promotion pipeline.
2. FIXED — `composeWarnings(ledger)` has exactly one argument, the whole document is specified as time-invariant, the module is forbidden from reading a clock, and G8 renders from the ledger without a date or other time-bearing input.

```json
[
  {
    "title": "The warnings package can still commit brain-controlled file bytes before promotion lands",
    "body": "WP-quarantine-warnings-file is independently dispatchable and must land before WP-dream-promote-in-workspace, but its pre-promotion account only says that the next run's precommitSessionEdits sweeps the file into git. The current pipeline runs precommitSessionEdits before the brain and later stages every surviving working-tree change with git add -A. Because this package writes reports/warnings.md into the brain's vault and changes validate.js only for note counting, the brain can alter that file after refresh point 1 and have those altered on-disk bytes committed verbatim. G8's canonical commit-time render does not exist until the dependent promotion package lands. This violates the claimed invariant that no on-disk byte can enter a commit and can permanently place model-authored or user-authored bytes in the code-owned warnings history.",
    "file": "docs/specs/WP-quarantine-warnings-file.md",
    "line_start": 481,
    "line_end": 505,
    "confidence": 0.98,
    "recommendation": "Give the warnings package a pre-promotion commit guard: immediately before the current validator commits, replace/stage this path from composeWarnings(ledger), or reject every brain-originated change to it and stage only canonical bytes. Add an integration case where the brain edits arbitrary bytes anywhere in reports/warnings.md and prove that no such byte reaches either the dream commit or a precommit. G8 can replace this transitional guard when promotion lands."
  },
  {
    "title": "Unrecognized reasons are permanent despite the ruling that only secret-revert-exhausted is permanent",
    "body": "The contract classifies missing, non-string, and future-schema reasons as never decaying, and an unrecognized record therefore keeps the informational banner alive forever. That directly conflicts with the owner ruling supplied for this gate: informational quarantine banners use the seven-day per-record freshness window and only secret-revert-exhausted is permanent. A corrupt or forward-schema ledger record can consequently recreate the permanent digest banner and banner-blindness this package is intended to remove.",
    "file": "docs/specs/WP-quarantine-banner-decay.md",
    "line_start": 201,
    "line_end": 230,
    "confidence": 0.99,
    "recommendation": "Apply the same per-record seven-day freshness rule to unrecognized reasons while retaining the fail-loud timestamp fallback: missing or invalid updated_at remains fresh, but a valid timestamp becomes stale after seven days. Keep only secret-revert-exhausted permanently bannered, and synchronize Amendment 2 plus the acceptance and verification cases."
  },
  {
    "title": "Doctor can bless a symlinked or unreadable warnings target as the canonical enumeration",
    "body": "Table B requires the info branch only for a readable regular warnings file and sends absent, non-regular, or unreadable targets to the warning branch. The surrounding implementation guidance, however, describes an existence check, while doctor.js's existing fileExists helper uses statSync().isFile(), which follows symlinks and does not prove readability. The acceptance criteria test absence, a directory, and a null vault, but not a symlink or unreadable file. An implementation reusing that helper can report [info] for a symlink to an arbitrary regular file even though writeIntoVault refuses to write through that symlink. The user is then directed to foreign bytes as if they were Wienerdog's code-owned enumeration, and the condition cannot self-heal.",
    "file": "docs/specs/WP-doctor-quarantine-counts.md",
    "line_start": 238,
    "line_end": 255,
    "confidence": 0.94,
    "recommendation": "Pin the check to lstat of the exact leaf, require a non-symlink regular file, and prove it can be opened for reading before returning info. Add acceptance cases for a symlink to a regular file, a dangling symlink, and an unreadable regular file; each must take the warn branch."
  }
]
```

Scope objections (routed to the owner, not counted): none

Executed vs read

- Executed inspection commands only: `git status --porcelain` at the start and end; `git rev-parse --short HEAD` (returned `8a6b934`); `wc -l` over the reviewed documents; targeted `rg` searches for carry, run-log, date, composer, commit-set, and quarantine-surface references; `git show` and `git diff` to inspect the round revision.
- Read/inspected, but did not execute: Amendment 2 of the ADR; the four quarantine work packages in full; the requested reopened sites in WP-dream-promote-in-workspace.md; the requested Table E and commit-set sites in WP-dream-promote-module.md; relevant source context in ledger.js, scratch.js, vault-write.js, dream.js, validate.js, doctor.js, digest.js, docs/GLOSSARY.md; relevant test locations under tests/unit/ and tests/integration/ through targeted search.
- Did not execute tests, lint, the dream command, or any product code.

git status --porcelain before: (empty). After: (empty). Byte-identical.
