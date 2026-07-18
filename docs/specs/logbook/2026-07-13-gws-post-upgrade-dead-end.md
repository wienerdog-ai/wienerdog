---
date: 2026-07-13
title: gws post-upgrade dead-end
related_wps: [WP-047, WP-102, WP-103, WP-104, WP-105]
---

# gws post-upgrade dead-end (2026-07-13)

**gws post-upgrade dead-end (2026-07-13, `BUG-gws-deps-missing-after-upgrade.md`,
credit: owner dogfooding).** A user who connected Google **before** WP-047's
on-demand `googleapis` deps-dir scheme has a **valid token** but an **absent**
`~/.wienerdog/app/deps/`; after `wienerdog update` across that boundary, every
gws read fails with the misleading `Google isn't set up yet — run
/wienerdog-google-setup` — a **permanent dead-end** (nothing on the read path
backfills `app/deps`) that also silently breaks headless routines (digest,
inbox triage). Root cause: `loadGoogleapis` (read path) only *throws*, never
installs; the installer `ensureGoogleapis` is called **only** by `gws auth`.
Three WPs close it, split by surface. **WP-102** (S, sonnet, `src/gws/deps.js` +
`src/gws/index.js` + its test) is the fix: a read command with a valid token but
absent deps now **self-heals** — `ensureGoogleReady()` runs the same consented
`ensureGoogleapis` install on first read (interactive: consent prompt like first
auth; non-TTY/headless: fails to the accurate, browser-free `npm install`
remedy, no worse than today); an **unauthed** user (no token) is a no-op and
keeps the existing connect-Google flow. `loadGoogleapis` — the sole emit site of
the misleading string — is made **token-aware and state-aware** (no token →
unchanged connect message; token present + library absent → "needs a one-time
install … the next `wienerdog gws` command will offer to install it"; token
present + library resolvable-but-unloadable → "broken (installed but not
loadable) — delete the folder `<depsDir>`, then reinstall it", no offer claim,
mirroring WP-103), the defensive backstop for any direct caller. The
containment guard (`resolveFromDeps`) is untouched. The existing no-token test
assertions stay valid (they exercise the unchanged branch) and are **not**
modified. **WP-103** (S, sonnet, depends WP-102, `src/cli/doctor.js` + its test)
adds the matching visibility: a read-only `doctor` probe that reports a connected
account whose client library is missing **or broken** as a WARN with the one-line
npm remedy (silent when Google is not connected; never a fail). Per the Codex
round-1 review it uses a containment-guarded **LOAD** probe (`loadGoogleapis` in
try/catch — not resolve-only, so a corrupt/partial install warns instead of
falsely reading `[ok]`) and minimally validates the token (valid JSON +
`refresh_token`, else a separate "sign-in file looks damaged" warn). No new ADR:
this implements the existing ADR-0011/0013 on-demand-consented-install design on
the read path that WP-047 missed. **WP-105** (S, sonnet, depends WP-102, Draft,
`src/cli/sync.js` + a new test) **reverses the report's fix-3 "skip"** after the
Codex review showed it was wrong for **headless-only (routines-only) users**:
their routines run non-TTY and decline the consented install by design, so the
read-path self-heal never populates their `app/deps`. WP-105 adds a **consented,
interactive-only** backfill in the `sync` flow (which `wienerdog update` hands
off to with `stdio: 'inherit'`); a non-TTY `sync` stays mutation-free, and the
backfill is best-effort (a decline/failure never fails `sync`). **WP-104** (S,
sonnet, independent) captures the report's separate appendix papercut: `gws drive
search` passes its arg verbatim as Drive `q`, so a bare word (`budget`) hits
`Invalid Value`; the fix wraps a plain term as `fullText contains '…'` by default
and adds `--raw` for literal Drive query language — a **default-behavior change
the owner confirmed (option B) on 2026-07-13**.
