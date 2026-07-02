---
id: WP-016
title: Implement curl installer bootstrapper (install.sh)
status: In-Review
model: sonnet
size: S
depends_on: [WP-003]
adrs: [ADR-0003, ADR-0004, ADR-0006]
branch: wp/016-curl-installer
---

# WP-016: Implement curl installer bootstrapper (install.sh)

## Context (read this, nothing else)

Wienerdog's default install command is `curl -fsSL <url>/install.sh | bash` (ADR-0006). The script is a *bootstrapper*, not an installer: it checks the environment and delegates to `npx wienerdog@latest init`, which does the real, manifest-tracked work (WP-003). Rationale: many Claude Code users installed via the native binary and have no Node; the script turns that from a cryptic failure into guided next steps. Trust rules: the script never installs software silently, never uses sudo, and stays short enough to read in one screen-and-a-bit (our audience is told "you can read what this does"). It must behave correctly when piped (`curl | bash`): no reliance on `$0`, interactive prompts must read from `/dev/tty` and degrade gracefully when unavailable.

## Current state

`install.sh` does not exist. WP-003 provides `npx`-runnable `wienerdog init` with `--yes`/`--dry-run`. CI (WP-001) provides `npm run lint` including shellcheck when shell files exist.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | install.sh | the bootstrapper |
| create | tests/unit/install-sh.test.js | drives the script with stubbed PATH |
| modify | README.md | ONLY the install-command block (curl default, npx alternative) — no other README edits |

### Exact contracts

`install.sh` behavior, in order:
1. `#!/usr/bin/env bash`, `set -euo pipefail`. A header comment: what the script does in 3 lines + repo URL.
2. Refuse to run as root (`EUID -eq 0` → explain and exit 1). Detect OS via `uname -s`; on unsupported (not Darwin/Linux) print the npx alternative and the Windows note, exit 1.
3. Find `node` on PATH and check major version ≥ 18 (`node -v`).
   - Found & recent → print one line ("Found Node <version> — handing over to the Wienerdog installer…") then `exec npx --yes wienerdog@latest init "$@"`.
   - Missing/old → print per-OS guidance and exit 1: macOS → "install Node LTS from https://nodejs.org or `brew install node` if you use Homebrew"; Linux → distro package manager hint + nodejs.org. Final line always: "Then run this command again." Never download or install Node itself.
4. All informational output to stderr except nothing; keep stdout clean (the delegated `init` owns stdout).

`tests/unit/install-sh.test.js` (node:test, spawns bash): (a) with a stub `node` shim (fake `-v` → `v16.0.0`) on a controlled PATH → exits 1, output contains "nodejs.org"; (b) with a stub `node` (`v20.0.0`) and a stub `npx` that records its argv to a temp file → exits 0 (stub exits 0) and recorded argv equals `--yes wienerdog@latest init`; (c) running under `EUID=0` — skip this case if not root-testable without sudo; instead assert the root-check line exists in the script text (grep). State this in "Decisions made".

README install block (replace the current single `npx` code fence):
```markdown
​```
curl -fsSL https://raw.githubusercontent.com/wienerdog-ai/wienerdog/main/install.sh | bash
​```

Prefer npm? `npx wienerdog@latest init` does the same thing. Windows: use the npx command (PowerShell installer coming). The script is ~60 lines — [read it first](install.sh) if you like; it only checks for Node and hands over to the versioned npm package.
```

## Implementation notes & constraints

- Must pass `shellcheck` (CI runs it) and `bash -n`.
- Trap: when piped, `read` without `/dev/tty` hangs or eats the piped script — this script asks nothing; keep it prompt-free (delegation target `init` prompts, and `npx --yes` only auto-accepts the *package install*, not init's own confirmation — do NOT pass `--yes` through to `init`).
- Trap: `exec npx …` must come last; nothing after it runs.
- Do not add a domain URL; raw.githubusercontent is the canonical URL until a domain exists (README updated separately at launch).

## Acceptance criteria

- [ ] `bash -n install.sh` and shellcheck pass.
- [ ] Stub-PATH tests (a) and (b) pass on macOS and Linux CI.
- [ ] Script never writes to disk and never invokes sudo/package managers (grep-assert in test: no `sudo`, no `apt`, `brew` etc. outside comment/echo lines — simplest: assert those words appear only in lines that are comments or echo/printf strings; note approach in "Decisions made").
- [ ] README shows curl as default, npx as alternative; `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

```bash
bash -n install.sh
npm run lint
npm test -- --test-name-pattern install-sh
```

## Out of scope (do NOT do these)

- PowerShell variant (M6–M7). Domain/hosting setup. Any change to `init` behavior (WP-003). Installing Node on the user's behalf — permanently out of scope per ADR-0006.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/016-curl-installer`; PR titled `feat(install): implement curl installer bootstrapper (WP-016)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
