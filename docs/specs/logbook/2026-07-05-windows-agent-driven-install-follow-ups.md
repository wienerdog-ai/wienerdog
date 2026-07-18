---
date: 2026-07-05
title: Windows agent-driven-install follow-ups
related_wps: [WP-049, WP-050, WP-051, WP-052]
---

# Windows agent-driven-install follow-ups (2026-07-05)

**Windows agent-driven-install follow-ups (2026-07-05).** After WP-049/050 fixed
the two headline Windows crashes, the same from-scratch report (Windows Server
2022, Claude Code driving `npx wienerdog@latest init`) surfaced three further
items. **WP-051** (independent of WP-050, on `src/core/vendor.js`) closes two
defects on unconditional code paths: (1) `repointCurrent` rewrote the `current`
symlink on *every* sync even when it already pointed at the target — needlessly
exercising the WP-049 remove-then-rename fallback, which can self-lock on
Windows because the invoking `node` runs from inside `app/current` and holds the
reparse point; it now no-ops when `current` is already correct (path.resolve
compare) while still sweeping orphans; and (2) the bash `~/.local/bin/wienerdog`
shim is unusable by cmd.exe/PowerShell, so `writeShim` now additionally writes a
`wienerdog.cmd` on win32 (manifest-tracked `kind:'file'`, byte-idempotent, CRLF).
Both are POSIX-testable via the existing `opts.rename` seam and a new
`opts.platform` seam — no `process.platform` mocking. **WP-052** (docs/skill
only, independent) fixes the agent-driven install *instructions*: the README
paste-in prompt now tells the driving AI to show the plan (`init --dry-run`)
before installing (`init --yes`) — the human-in-chat is the consent surface —
hands it the repo + npm URLs so a cautious agent can verify the package, and
tells the user to restart the harness so the `/wienerdog-*` commands load;
`init`'s own prompting is unchanged. The two WPs share no files and can land in
parallel.
