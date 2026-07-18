---
date: 2026-07-18
title: A1 hermetic runtime profiles
related_wps: [WP-128, WP-129, WP-130, WP-131, WP-132, WP-133, WP-134, WP-135]
---

# A1 hermetic runtime profiles (2026-07-18)

**A1 hermetic runtime profiles (2026-07-18, ADR-0025 Accepted + 2 amendments).** Closes the
audit's defining containment defect (R1): a headless `claude -p` job (the dream + every
routine) inherited its capabilities from the user's ambient Claude config, so a hijacked
job over a malicious transcript/email could reach an inherited Bash rule, plugin, hook, or
MCP. A1 makes every job run under a **code-owned hermetic runtime profile** composed by
Wienerdog: explicit non-empty `--tools` allowlist (primary) + expanded deny list, empty MCP
(dream) or one local A2-broker seam (routine), no ambient setting source (`--setting-sources
""`) + a hook-free `--settings` profile (`disableAllHooks`), a vendored integrity-checked
skill via `--append-system-prompt`, and a fresh staging cwd. Spec phase informed by live
`claude -p` spikes (empty `--tools` exposes ALL built-ins → explicit allowlist; `--setting-
sources ""` excludes the user source; `--append-system-prompt` faithfully delivers the 22 KB
skill; a probe prompt's echoed `BASH-OK` string is a false-fail trap → judge by the
structured `permission_denials` field + canary ground truth) and a wd-researcher pass
(managed/admin-policy hooks are trusted-computing-base, not an attacker vector → WARN + record,
not STOP). **WP-128** the profile registry + argv composer; **WP-129** hook-free settings +
vendored-skill integrity; **WP-130** the hermetic dream (staging cwd + absolute tier paths);
**WP-131** the hermetic routine (contained-and-inert until A2 wires the broker + vault
snapshot); **WP-132** the managed-policy WARNING + secret-free run evidence; **WP-133** the
dev-time live negative harness (the full end-to-end run-job wrapper proof is a REQUIRED
gate-opening precondition, executed at A2); **WP-135** the pre-dream containment self-check —
a bounded live canary probe of the real hermetic composition run before every dream, fail-
closed halt if the actually-installed Claude no longer honors the flags (containment is
**runtime-self-verified**, ADR-0025 Amendment 2, not asserted against a repo-pinned version
that goes stale on every Claude auto-update); **WP-134** the honest docs (threat model,
glossary, sandbox→hermetic rename). **A1 opens NO capability gate** — `wienerdog safety` shows
all five BLOCKED after every WP; A1 contains the agent, A2 restores routine function, and the
gate opens only later (P1 + audit rerun + explicit go + the end-to-end containment proof).
Chain: 128 → 129 → {130, 131}; {130,131} → 132; 132 → {133, 135}; 134 → all.
