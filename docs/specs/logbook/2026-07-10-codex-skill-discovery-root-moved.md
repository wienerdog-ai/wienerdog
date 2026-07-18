---
date: 2026-07-10
title: Codex skill-discovery-root moved
related_wps: [WP-010, WP-078, WP-079]
---

# Codex skill-discovery-root moved (2026-07-10)

**Codex skill-discovery-root moved (2026-07-10, credit: owner dogfooding —
macOS, Codex CLI 0.144.1, wienerdog 0.6.6).** The Codex adapter symlinks skills
into `~/.agents/skills/` (WP-010's research fact), but current Codex does **not**
scan that dir — its user-scope skill-discovery root is now `$CODEX_HOME/skills/`
(default `~/.codex/skills/`); `~/.agents/` is only the plugin marketplace. So
`sync` reported success while **no `wienerdog-*` skill ever appeared in a Codex
session** — the Codex half was silently dead, unflagged by `sync`/`doctor`.
Verified: symlinks in `~/.codex/skills/` ARE followed (`codex debug prompt-input`
lists all seven skills); no copy fallback needed on macOS; `~/.codex/skills/`
already holds Codex's own `.system/` (only `wienerdog-*` entries may be touched).
**WP-078** (S, sonnet, Done — merged e90b948, PR #78) retargets the adapter's one skill-link dir from
`path.join(paths.home,'.agents','skills')` to `path.join(paths.codexDir,'skills')`,
repoints the pinning tests, and adds ONE plain-language notice that Codex skills are
not slash commands — `/skills` lists them, `$wienerdog-setup` (or plain words) starts
one (the predictable second wall for a Claude-Code user: no `/wienerdog-setup` exists
in Codex). Two findings kept it small: (1) `applySkillLinks`
**already** adopts a pre-existing correct symlink into the manifest (`recordOnce`
on the unchanged branch, `shared.js:296`), so the field machine's hand-made
`~/.codex/skills/` links become uninstall-clean after one `sync` with **no
shared.js change** — WP-078 only adds a regression test; and (2) `sync`
loads-and-extends the manifest (`sync.js:147`), so the old `~/.agents/skills/`
entries survive and a later uninstall still reverses them — the **conservative
migration (leave the old links inert-but-tracked) needs zero code**. **Migration
decision RESOLVED (2026-07-10, Ready)** by the wd-researcher memo
`memory/research/2026-07-10-codex-cli-skills-discovery.md`: Codex shipped with
`$CODEX_HOME/skills` only; `~/.agents/skills` was added in source Feb 2026 (and
source even marks `$CODEX_HOME/skills` "deprecated"), **but no shipped version
reliably scans `~/.agents/skills` while `$CODEX_HOME/skills` is verified-current**
— so write ONLY to `$CODEX_HOME/skills/`, add no speculative `~/.agents/skills`
links, prune nothing. **Watch item** (future, not this WP): if OpenAI fixes
discovery so `~/.agents/skills` becomes primary again, machines still carrying
legacy links could list each skill twice — re-check on Codex upgrades. **WP-079**
(S, sonnet, depends WP-078) adds the missing
visibility: a read-only `doctor` check that each shipped `wienerdog-*` skill is
registered (symlink OR copied dir) under `$CODEX_HOME/skills/` when Codex is
detected — a missing link is a WARN with `wienerdog sync` remediation, never a
fail — so the next discovery-root move is caught, not silent. No new ADR: WP-078
is a factual correction of a stale research memo, not an architectural decision.
