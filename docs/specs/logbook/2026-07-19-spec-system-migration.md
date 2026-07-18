---
date: 2026-07-19
title: Spec-system migration — slug identity, frontmatter authority, ROADMAP retired
related_wps: [WP-160, WP-roadmap-retirement, WP-spec-ritual-updates]
---

# Spec-system migration — slug identity, frontmatter authority, ROADMAP retired (2026-07-19)

**Trigger.** Two engineers on a shared `main` collided on the global WP counter
(WP-153 allocated twice → a manual "+1 renumber" plus a follow-up mermaid fix
commit) and conflicted on nearly every pull over the hand-maintained ROADMAP
status table. The owner walkthrough established that every ROADMAP fact was a
hand-synced copy of spec frontmatter, that nothing programmatic consumed it,
and that the Milestone column was never consciously used (105 of 159 WPs
stamped "M7" after the phase sequence was consumed; confirmed by both
engineers).

**Decision.** ADR-0029 (Accepted, owner-ratified): WP identity is a kebab slug;
frontmatter is the sole authority (status, `depends_on`, optional `epic:`);
every shared aggregate is generated on demand or effectively write-free.
Ratified after two independent wd-architect review passes on the draft
(findings included a silent fail-open: the CI boundary job's numeric spec
regex would have skipped the Deliverables check for slug specs).

**Execution (same day).** Three WPs, epic `spec-system`: WP-160 — the last
numbered WP — switched the machine gates (schema, cross-file id/depends_on
lint, CI regexes, boundary allowlist); WP-spec-ritual-updates — the first
slug-id WP — rewired the prose rituals (agents, template, glossary,
CLAUDE.md/AGENTS.md); WP-roadmap-retirement split ROADMAP into MILESTONES.md
(byte-identical M-table) plus 34 dated logbook entries (1025/1025 narrative
quote lines conserved, scripted extraction) and deleted it. No mass edits:
numeric ids are valid slugs, legacy `branch:` lines are inert. The ADR index
was backfilled 0016–0029 — it had been stale since 0016, itself evidence for
the hand-maintained-aggregate disease. During drafting the ADR numbering
nearly collided too (0028 was reserved by the in-flight A7 walkthrough);
ADR-0029 records that counter risk as accepted for owner-serialized ADRs.

**Review.** All three WPs passed wd-reviewer post-hoc, pre-push (3× APPROVE;
conservation independently re-derived by the reviewer). One reviewer finding:
the retirement spec's Current-state repeated a stale fact from a review report
instead of the live file — verify-before-assuming applies to specs.

**Follow-ups identified (gap analysis against live code, not the audit text).**
A9 is mostly done by side effects (private-fs.js, 0700 init dirs, doctor
checks, WP-126 modes); remaining: an incident-drill runbook WP (independent,
can land now), a permissive-umask/upgrade mode-repair WP (after WP-154, shares
sync.js), and the alert-tail exclusion which belongs to WP-151, not a new WP.
A10 is half-done (run-job is the single timeout authority since WP-141);
remaining: close the double-detach race and add setsid/double-fork
escape-negative tests — speccable now against the frozen A7 contracts,
implementable after WP-155/WP-157. A11 needs an ADR before M4; A12 stays
owner-optional. Open process item: direct-to-main has no mechanical review
gate — the canonical repo decides.
