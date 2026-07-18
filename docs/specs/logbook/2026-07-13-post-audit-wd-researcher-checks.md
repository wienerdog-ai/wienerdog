---
date: 2026-07-13
title: Post-audit wd-researcher checks
related_wps: [WP-100, WP-101]
---

# Post-audit wd-researcher checks (2026-07-13)

**Post-audit wd-researcher checks (2026-07-13).** Two owner-approved
follow-ups landed after post-audit wd-researcher investigations verified a pair
of flagged-but-unresolved P2s against real, current systems (not code comments).
Both are Draft pending a Codex spec-review before Ready; neither depends on the
other. **WP-100** (S, sonnet, `src/core/transcripts/codex.js`) closes a verified
Codex-parser defect: `mapCodexItem` only recognized `function_call_output`, but
codex-cli 0.144.x emits tool/exec output as `custom_tool_call_output` (with
`function_call_output`/`local_shell_call`/`web_search_call`/`tool_search_output`
as legacy/alternate variants), so ~18% of Codex session content — all tool/exec
output — was silently DROPPED and the Codex `derived_from_untrusted` tagging path
never fired (memo `2026-07-13-codex-transcript-role-provenance.md`, verified
against a live codex-cli 0.144.1 machine + upstream `openai/codex` source). It
also replaces the default-trust `role !== 'assistant' → 'user'` logic with an
explicit trusted-role allowlist (`user`/`developer`/`system` → user; unrecognized
role → DROP, never trust), so the parser fails closed if Codex's untyped upstream
`Message.role` string ever routes tool content through a novel role — closing the
latent T1 provenance-bypass class. Adds a T1 THREAT-MODEL note recording the
parser-level provenance dependency. **WP-101** (S, sonnet, `src/gws/auth.js`)
adds `state` + PKCE to the OAuth loopback flow: RFC 8252 §6 makes PKCE a MUST for
this public Desktop-app/loopback client shape, and a verified `state` closes a
co-resident DoS/CSRF-injection variant on the one-shot listener (memo
`2026-07-13-gws-oauth-loopback-state-pkce.md`; PKCE API confirmed present in the
pinned `google-auth-library`). Adds a new T4b THREAT-MODEL subsection for the
OAuth handshake (previously uncovered — only token storage was). Both stay within
a single file each; no new dependency, no new ADR (each implements an explicit
spec MUST / verified fix within the existing design).
