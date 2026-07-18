---
date: 2026-07-12
title: Demo-sandbox corruption incident
related_wps: [WP-070, WP-072, WP-079, WP-106, WP-107, WP-108]
---

# Demo-sandbox corruption incident (2026-07-12)

**Demo-sandbox corruption incident (2026-07-12 → 07-16, credit: owner dogfooding,
maintainer's machine).** A marketing demo re-record ran the REAL installer with
`WIENERDOG_HOME` pointed at a `mktemp -d` sandbox (`/var/folders/.../tmp.XXXX/wd`) but
did NOT redirect the Claude config dir. `wienerdog init` therefore mutated the real
`~/.claude`: it repointed all seven `~/.claude/skills/wienerdog-*` symlinks at the temp
core (`applySkillLinks` wrong-target → unlink+relink branch) and merged a SECOND
SessionStart/SessionEnd hook pair pointing at the temp `bin/session-*.sh`. macOS purged
the temp dir ~3 days later: all `/wienerdog-*` slash commands vanished ("Unknown
command: /wienerdog-setup"), the nightly dream failed on 07-16, and every session
logged "SessionEnd hook failed: No such file or directory". **Throughout, `wienerdog
doctor` reported all-green.** Three hardening WPs, split by surface. **WP-106** (M,
sonnet, `src/cli/doctor.js`) upgrades the skill-link check from presence-only (WP-079,
which it supersedes) to **target-validating**, and runs it for BOTH harnesses: each
shipped skill's symlink must resolve, its resolved target must equal `<core>/skills/<name>`
in the CURRENT core (a foreign/ephemeral target — the incident — is flagged BEFORE it
goes dangling), and the resolved dir must contain `SKILL.md`; a copied dir (Windows) is
validated by `SKILL.md` presence. Every problem is a `[warn]` with `wienerdog sync`
remediation, never a fail. **WP-107** (S, sonnet, depends WP-106 — shares
`doctor.js`/`doctor.test.js`) adds a read-only `doctor` check for **stale/foreign
wienerdog session hooks**: `applySettings` only prunes variants of its OWN current
command path, so a wienerdog-shaped hook at a foreign path survives forever. The check
scans each present harness's settings file for a command whose unquoted script basename
is one of ours (`session-start.sh`/`session-end.sh`/`codex-session-end.sh`) AND whose
script no longer exists on disk, and emits a `[warn]` naming the exact settings entry
with a MANUAL-removal hint. Decision (recorded in-spec): notice-only, no auto-fix — the
foreign hook was never manifest-recorded, so we can't prove ownership strongly enough to
auto-edit a user-owned settings file (ADR-0004 reversibility); a heuristic delete is
declined for v1. **WP-108** (M, sonnet, independent, `src/core/sandbox-guard.js` +
`init.js` + `sync.js`) fixes the ROOT CAUSE with a **half-sandbox guard**: a pure
`sandboxMismatchWarning(paths, env, harnesses)` fires when `WIENERDOG_HOME` redirects the
core off its default AND a DETECTED harness's config dir is not co-redirected
(`CLAUDE_CONFIG_DIR`/`WIENERDOG_CLAUDE_DIR` for Claude, `CODEX_HOME` for Codex), warning
that real harness configs will get links+hooks pointing at the (possibly ephemeral)
core. Decision (recorded in-spec): **warn, not prompt** — a persistent custom
`WIENERDOG_HOME` is legitimate, and `sync` runs non-interactively in the `update` handoff
(a prompt there is the WP-072 hang class); `init` prints it in its plan BEFORE the
existing `Proceed?` confirm (a real abort point without a new prompt), `sync` warns-only.
A temp-path heuristic (`os.tmpdir()`/`/var/folders`/`/tmp`/`$TMPDIR`) escalates the
wording — worth it, since the incident's core was under `/var/folders`. Silent in the
common and fully-co-redirected cases (every test/scenario harness co-redirects, so zero
CI noise). No new ADR — WP-106/107 are doctor-visibility hardening (WP-070/079
precedent) and WP-108's warn-not-block is a local init/sync UX decision; all three cite
ADR-0004. WP-106 → WP-107 serialize on `doctor.js`; WP-108 is independent and lands in
parallel. **All three Ready (2026-07-16)** after the Codex adversarial design-review loop:
WP-106/107 clean by round 3, WP-108 through eleven rounds (path aliasing, the case-fold
trade, the harness-detection TOCTOU + `isDir` revalidation, and invariant-language
qualification) to an explicit round-11 APPROVE. Three accepted residuals are recorded in
WP-108 (case-insensitive-FS absent-suffix false-positive; post-`isDir` micro-race; and
manifest-provenance orphaning on a crashed `sync`, which motivates a future adapter-atomicity
hardening WP).
