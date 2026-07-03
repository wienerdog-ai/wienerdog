---
id: WP-034
title: Read CLI confirmation prompts from /dev/tty under piped stdin
status: Ready
model: sonnet
size: S
depends_on: [WP-031]
adrs: [ADR-0006, ADR-0011]
branch: wp/034-tty-prompts
---

# WP-034: Read CLI confirmation prompts from /dev/tty under piped stdin

## Context (read this, nothing else)

Found live during the first public curl-installer test: `curl -fsSL <url>/install.sh | bash` correctly runs the bash consent engine (which reads from `/dev/tty` per ADR-0011), finds Node, and `exec`s into `npx wienerdog@latest init`. But `init`'s own "Proceed? [y/N]" confirmation uses Node `readline` on **stdin** — and under a pipe, stdin is the already-consumed script stream at EOF. The readline callback never fires, the event loop drains, and the process **exits 0 silently having installed nothing**. Every real user of the curl one-liner hits this. The same latent defect exists in `uninstall`'s confirmation (and was noted as a non-blocking quirk in the WP-003 review, before anything piped into these commands).

The fix mirrors the bash engine's rule in Node: when stdin is not a TTY, prompt via `/dev/tty`; when `/dev/tty` is unavailable too (CI, cron), **abort loudly** with a message telling the user to re-run with `--yes` — never proceed (consent), never exit silently (the current bug).

## Current state

- `src/cli/init.js` — has a `confirm(question)` helper using `readline.createInterface({ input: process.stdin, output: process.stdout })`; called when `--yes` absent. Same-shaped helper in `src/cli/uninstall.js`. `src/cli/adopt.js` and `src/cli/grant.js` have their own prompt seams (grant's is injectable `promptFn`) — OUT OF SCOPE here (interactive-terminal commands; a follow-up may unify).
- The bash side (`install.sh` `tty_reachable`/`consent_run`) is correct and unchanged.
- Tests drive init/uninstall with `--yes` everywhere, which is why this never surfaced.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/prompt.js | shared confirm helper with the tty rule |
| modify | src/cli/init.js | use the shared helper |
| modify | src/cli/uninstall.js | use the shared helper |
| create | tests/unit/prompt.test.js | all three input modes |

### Exact contracts

```js
/** src/core/prompt.js
 *  confirm(question) → Promise<boolean>
 *  Input selection:
 *   1. If process.stdin.isTTY → readline on stdin/stdout (current behavior).
 *   2. Else try fs.createReadStream('/dev/tty') as readline input (output:
 *      process.stderr so stdout stays clean for piped consumers). On any
 *      open/read error → mode 3.
 *   3. Neither available → print to stderr:
 *      "wienerdog: can't ask for confirmation here (no terminal). Re-run with --yes to proceed non-interactively."
 *      and return false (callers already treat false as abort).
 *  Answer parsing unchanged: /^y(es)?$/i → true, everything else (incl.
 *  empty) → false. EOF mid-prompt → false with the mode-3 message (never a
 *  silent hang or silent exit — attach an 'close' handler that resolves).
 *  Test seam: WIENERDOG_PROMPT_TTY env overrides the '/dev/tty' path so tests
 *  can point mode 2 at a fixture file (mirrors install.sh's WIENERDOG_TTY).
 */
```

`init.js`/`uninstall.js`: replace their local helpers with `require('../core/prompt').confirm`; no other behavior change; `--yes` path untouched.

## Implementation notes & constraints

- Mode 2's readline must close its tty stream in all paths (no fd leak, no hang keeping the event loop alive).
- Do NOT touch adopt.js/grant.js (their flows are terminal-direct today; unification is a follow-up if dogfooding demands it).
- The e2e proof lives in the verification steps (piped run below), not a new integration file.

## Acceptance criteria

- [ ] Piped stdin + fixture tty answering "y" (via WIENERDOG_PROMPT_TTY) → init proceeds and installs.
- [ ] Piped stdin + fixture tty answering "" or "n" → clean abort message, exit 0, zero changes.
- [ ] Piped stdin + no tty available → the mode-3 stderr message, abort, exit 0, zero changes — NEVER a silent no-op exit (assert the message text).
- [ ] `--yes` behavior byte-identical everywhere; existing init/uninstall tests unedited and green.
- [ ] `npm test`, `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
npm test -- --test-name-pattern prompt
# e2e piped proof (temp env): echo simulates curl|bash stdin-at-EOF
T=$(mktemp -d); printf 'y\n' > "$T/tty"
WIENERDOG_HOME=$T/wd WIENERDOG_VAULT=$T/v CLAUDE_CONFIG_DIR=$T/cc CODEX_HOME=$T/cx \
  WIENERDOG_PROMPT_TTY=$T/tty bash -c 'echo | node bin/wienerdog.js init'
test -d "$T/wd" && echo "INSTALLED-VIA-TTY-CONSENT"
```

## Out of scope (do NOT do these)

- adopt.js / grant.js prompt unification. install.sh changes (correct already). Windows console handling.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/034-tty-prompts`; PR titled `fix(cli): read confirmation prompts from /dev/tty under piped stdin (WP-034)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
