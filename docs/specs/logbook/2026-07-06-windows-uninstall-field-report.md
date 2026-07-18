---
date: 2026-07-06
title: Windows uninstall field report
related_wps: [WP-051, WP-067, WP-068]
---

# Windows uninstall field report (2026-07-06)

**Windows uninstall field report (2026-07-06, credit: real Windows Server 2022
v0.6.0 uninstall via the `wienerdog.cmd` shim).** The vault-preservation itself
is by design (M7: "install → use → uninstall leaves only the vault") and is
never weakened here — but three mechanics around it were genuinely broken. Two
parallel WPs, **no shared files**, no dependency. **WP-067** (S, `src/core/vendor.js`)
fixes the `.cmd` shim: a successful `uninstall` invoked *through* `wienerdog.cmd`
deleted that shim mid-run, so when the node child returned cmd.exe re-opened the
(now-gone) batch file → `The batch file cannot be found.` + exit 1. The launcher
becomes a single-parser-block line `@node "<current bin>" %* & exit /b` that cmd
reads into memory before node runs and terminates from memory, so it survives
self-deletion and propagates node's exit code (supersedes WP-051's `.cmd`
template; WP-051's done-spec untouched). **WP-068** (M, `src/core/manifest.js` +
`src/cli/uninstall.js`, ADR-0019) fixes uninstall: (a) `vault-file`/`vault-dir`
manifest kinds get an explicit *preserve* handler so the 13 seeded vault files
stop surfacing as "skipping unknown manifest entry kind" errors and instead
produce ONE plain-language line (*"Your memory vault at <path> was left
untouched (N files) — your notes are yours."*); and (b) the core's
machine-generated-mechanics subdirs — `state/`, `logs/`, `schedules/`,
`secrets/` (all Wienerdog-authored, none manifest-tracked; the report's premise
that `secrets/` was "already manifest-handled" was **wrong** — verified: zero
`manifestLib.record` in `src/gws/`) — are recursively disposed after the
manifest replay, then the now-empty core is removed, so `~/.wienerdog` is truly
gone (the sole exception is a deliberately-kept user-modified `config.yaml`).
ADR-0019 records the invariant (the core holds only disposable mechanics; the
vault is always outside it) and the security decision to remove OAuth tokens on
uninstall. A full install → sync → uninstall e2e asserts the vault tree is
byte-identical before/after (the treasure invariant).
