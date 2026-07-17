---
id: WP-121
title: Make the three shipped session hooks genuinely fail-open + a hook fail-open harness (audit A6)
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004]
branch: wp/121-hook-fail-open-hardening
---

# WP-121: Make the three shipped session hooks genuinely fail-open + a hook fail-open harness (audit A6)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**, skills, hooks,
scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons, no servers,
no telemetry. Shell scripts must pass `shellcheck` and be formatted with `shfmt -i 2`.

Wienerdog ships **three session hooks** the adapters register into the harnesses:

- `templates/hooks/session-start.sh` — Claude Code **SessionStart** (enrichment): reads the
  pre-rendered **digest** and emits it as `additionalContext` JSON so a new session knows the
  user. Its header promises "Fast, fail-open (always exit 0), no computation".
- `templates/hooks/session-end.sh` — Claude Code **SessionEnd** (enrichment): appends a
  capture hint to `state/queue.jsonl` from the hook JSON on stdin. Promises "Fail-open".
- `templates/hooks/codex-session-end.sh` — Codex **Stop** hook: same queue append for Codex.
  Promises "Fail-open".

A 2026-07-15 security audit (action **A6**, deep-dive `07-parsing-dos.md`, finding **F4**;
A6 point 8 explicitly extends the audit to **every** shipped hook, not only SessionStart)
found the promised fail-open is **not code-enforced**. All three open with
`set -euo pipefail` and end with `exit 0`, but under `set -e` **any** non-zero command before
that line aborts the script with a non-zero code and the `exit 0` is **never reached**:

- SessionStart: if `node -e '…' "$DIGEST"` exits non-zero — the digest was deleted in the
  race between `[ -f "$DIGEST" ]` and the read (TOCTOU), an OOM on a pathologically large
  digest, or any Node runtime error — the script exits with that code.
- SessionEnd / codex-session-end: if `mkdir -p "$CORE/state"` fails (unwritable state), or
  the `node -e` stdin read/`appendFileSync` fails (malformed or oversized stdin, unwritable
  queue), the script aborts non-zero.

Harness non-blocking semantics mask most of this today, but the stated guarantee is stronger
than the code enforces, and an unbounded stdin/digest is a real resource concern (ties into
the digest caps of WP-120). This WP makes all three hooks **genuinely fail-open**: guard
`HOME`/`node`/state, **bound stdin**, make every optional write best-effort, produce no unsafe
partial stdout, and **always reach `exit 0`** — proven by a new subprocess harness that drives
each hook through every adverse condition and asserts exit 0.

**A6 opens NO capability gate.** `wienerdog safety` must still show all five gates
(`google-setup`, `gws-use`, `external-content-routine`, `daily-summary-injection`,
`identity-auto-activation`) BLOCKED after this WP. Do not touch `src/core/safety-profile.js`.

## Current state

`templates/hooks/session-start.sh` (verbatim):

```bash
#!/usr/bin/env bash
set -euo pipefail
[ -n "${WIENERDOG_JOB:-}" ] && exit 0
CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
DIGEST="$CORE/state/digest.md"
[ -f "$DIGEST" ] || exit 0
node -e 'const fs=require("fs");const t=fs.readFileSync(process.argv[1],"utf8");process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:t}}));' "$DIGEST"
exit 0
```

`templates/hooks/session-end.sh` and `codex-session-end.sh` (same shape): `set -euo pipefail`,
`CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"`, `QUEUE="$CORE/state/queue.jsonl"`,
`mkdir -p "$CORE/state"`, then a `node -e` that reads **all** of stdin, `JSON.parse`s it
(try/catch → `{}`), and `appendFileSync`s one JSON line; ends `exit 0`. The codex variant
differs only in `harness:"codex"` and the header note that Stop hooks emit no stdout.

**Solid controls to PRESERVE (audit-credited, do not regress):** the SessionStart envelope is
built with `JSON.stringify` over raw digest bytes (injection-safe; invalid UTF-8 → U+FFFD),
and both queue writers `JSON.stringify` each record so an attacker-influenced
`cwd`/`transcript_path` cannot break the JSONL line. Keep `JSON.stringify` as the encoder in
every case. No `src/` code consumes `queue.jsonl` (it is enrichment only), so a dropped queue
append is harmless.

There is **no existing shell-hook test**; the hooks are only referenced by the adapters
(`src/adapters/claude.js`, `codex.js`) and `doctor.js`. The lint pipeline (`scripts/lint.js`)
runs `shellcheck` + `shfmt -i 2` over `**/*.sh`. Node ≥ 18 is always present on a real install
(Wienerdog is a Node CLI) but the hook must still fail-open if `node` is somehow unresolvable.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | templates/hooks/session-start.sh | fail-open: drop `set -e` reliance, guard HOME/node/digest, best-effort node step, no partial stdout, always `exit 0` |
| modify | templates/hooks/session-end.sh | fail-open: guard HOME/node, best-effort mkdir/append, **bound stdin**, always `exit 0` |
| modify | templates/hooks/codex-session-end.sh | same fail-open hardening (Codex; no stdout) |
| create | tests/integration/hooks-fail-open.test.js | subprocess harness: drive each hook through every adverse condition, assert exit 0 (+ no partial stdout on SessionStart) |

### Exact contracts — the fail-open shape (apply to all three)

The binding invariant: **the process always exits 0**, regardless of missing `HOME`/`node`,
a vanished/unreadable digest, an unwritable state dir/queue, or malformed/oversized stdin. Use
this structure (do NOT rely on `set -e` to abort; make each fallible step explicitly
best-effort). shellcheck-clean, `shfmt -i 2`.

**Common preamble (all three):**
- Drop `set -e` and `set -o pipefail` (a leaf enrichment hook must never abort on a failed
  optional step). Keep `set -u`-safety by continuing to use `${VAR:-}` guards (already
  present) — do NOT add bare `set -u` (an unset expansion mid-script would abort under it).
- **Guard HOME/CORE:** if neither `WIENERDOG_HOME` nor `HOME` is set, `exit 0` immediately
  (no usable core path). Then `CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"`.
- **Guard node:** `command -v node >/dev/null 2>&1 || exit 0` (node unresolvable → fail-open).
- Keep the `WIENERDOG_JOB` skip in session-start.

**session-start.sh specifics:**
- `DIGEST="$CORE/state/digest.md"`; `[ -f "$DIGEST" ] || exit 0`.
- Run the node envelope step **best-effort** so a TOCTOU-deleted / unreadable / oversized
  digest can never abort the script: wrap it so failure is swallowed and the trailing
  `exit 0` is always reached — e.g. `node -e '…' "$DIGEST" || true` (or an `if … ; then`).
- **No partial/unsafe stdout on failure.** The node one-liner must build the FULL
  `JSON.stringify(...)` string and `process.stdout.write` it in a single call at the end (it
  already does). Guard the node body in a `try { … } catch { /* no output */ }` so a read
  error emits **nothing** rather than a half-written envelope. (An empty stdout = "no
  additional context", the correct fail-open outcome.)
- Keep `JSON.stringify` as the encoder (injection-safe). End with `exit 0`.

**session-end.sh / codex-session-end.sh specifics:**
- `QUEUE="$CORE/state/queue.jsonl"`; `mkdir -p "$CORE/state" 2>/dev/null || true` (best-effort;
  an unwritable state dir must not abort).
- **Bound stdin.** The hook JSON is small; a malicious caller could pipe unbounded stdin. Cap
  what is read to `HOOK_STDIN_MAX` bytes and ignore the rest, so node can never buffer an
  unbounded string. Bound it **inside the node reader** (accumulate up to the cap, then stop
  appending — do not rely on an external `head` + pipefail): e.g. the `data` handler appends
  only while `raw.length < HOOK_STDIN_MAX`. Malformed JSON already degrades to `{}` via the
  existing try/catch — keep that.
- Wrap the whole node step best-effort (`… || true`) and the `appendFileSync` in the node
  body in a `try/catch` so an unwritable queue is swallowed. End with `exit 0`.
- codex-session-end emits **no stdout** (Stop-hook rule) — keep it that way; the node body
  only appends to the queue, never writes stdout.

### Reference (session-start.sh, illustrative — implement equivalently, shellcheck-clean)

```bash
#!/usr/bin/env bash
# Wienerdog SessionStart hook (enrichment): inject the pre-rendered digest.
# GENUINELY fail-open — always exit 0 (audit A6 / F4). No set -e: a failed
# optional step must never abort before exit 0.
[ -n "${WIENERDOG_JOB:-}" ] && exit 0
[ -n "${WIENERDOG_HOME:-}" ] || [ -n "${HOME:-}" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0
CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
DIGEST="$CORE/state/digest.md"
[ -f "$DIGEST" ] || exit 0
node -e '
try {
  const fs = require("fs");
  const t = fs.readFileSync(process.argv[1], "utf8");
  process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:t}}));
} catch (e) { /* fail-open: no output */ }
' "$DIGEST" || true
exit 0
```

### The harness — `tests/integration/hooks-fail-open.test.js`

Zero-dep `node:test`. For each of the three hook scripts, `spawnSync('bash', [hookPath], {
env, input })` under controlled conditions and assert `status === 0` every time. Cover
(mapping to the A6 acceptance list):

- **missing HOME** (env without `HOME` and without `WIENERDOG_HOME`) → exit 0.
- **missing node** (`PATH` set to a dir with no `node`) → exit 0.
- **TOCTOU / unreadable digest** (SessionStart): point `WIENERDOG_HOME` at a temp core whose
  `state/digest.md` is a **directory** (so `[ -f ]` may pass-or-fail and `readFileSync`
  throws) OR delete it between passing `[ -f ]` — simulate the read failure via the
  directory-as-digest trick — and assert exit 0 AND **empty stdout** (no partial envelope).
- **unreadable/normal digest present** (SessionStart) → exit 0 and stdout is a single valid
  JSON object (parse it; assert `hookSpecificOutput.hookEventName === 'SessionStart'`).
- **unwritable state** (SessionEnd/codex): `chmod 0500` the temp `state/` (skip the assertion
  gracefully if running as root where mode is ignored — detect via a probe write) → exit 0.
- **malformed stdin** (`input: 'not json{{'`) → exit 0, queue line either absent or a
  well-formed record with null fields (never a crash).
- **oversized stdin** (`input` of `HOOK_STDIN_MAX + 1` bytes) → exit 0 within a reasonable
  time bound (proves the read is bounded, not buffering unboundedly).
- **node failure** (a `node` stub earlier on PATH that `exit 1`s): the hook still exits 0
  (the `|| true` / guard swallows it). Provide the stub as a tiny executable temp script.

Use `paths` helpers only for the repo-relative hook location (`templates/hooks/*.sh`); the
test manufactures its own temp `WIENERDOG_HOME`. Skip the whole file cleanly on win32 (bash
hooks are POSIX; note it) — `process.platform === 'win32'` → `test.skip`.

## OWNER-DECISION (pending) — the stdin bound

- **HOOK_STDIN_MAX — recommend `1 MB` (`1048576` bytes).** The hook JSON
  (`{session_id, transcript_path, cwd, …}`) is a few hundred bytes; 1 MB is orders of
  magnitude of headroom while bounding a hostile pipe. *Alt:* `256 KB` (tighter) / `4 MB`.

## Implementation notes & constraints

- **Fail-open is now code-enforced, not aspirational.** Every fallible step is best-effort and
  the script always reaches `exit 0`. Do NOT reintroduce `set -e`/`pipefail` on these leaf
  hooks.
- **Preserve the injection-safe encoders.** `JSON.stringify` stays the encoder for the
  SessionStart envelope and both queue records — the audit credited these; do not hand-roll.
- **No behavior change on the happy path.** A present digest still injects the same
  `additionalContext`; a normal SessionEnd still appends the same queue record. Only the
  failure paths change (they now exit 0 cleanly) and stdin is bounded.
- **shellcheck + `shfmt -i 2` clean** (the lint pipeline runs both over `**/*.sh`). Run
  `npm run lint` and paste the shell layers' output.
- **Adapters/doctor are NOT touched.** The hook *filenames*, registration, and the manifest
  are unchanged — this WP edits only the three script bodies (and adds the test). Confirm the
  adapter/doctor tests still pass (they reference the hook paths, not their contents).
- Zero deps, POSIX bash. When uncertain, choose simpler + record it under "Decisions made".

## Security checklist

- [ ] Every shipped hook reaches `exit 0` under: missing `HOME`, unresolvable `node`, a
      vanished/unreadable digest (TOCTOU), an unwritable state dir/queue, and malformed or
      oversized stdin — proven by the harness. SessionStart emits **no partial stdout** on
      failure (empty = no context). Stdin is bounded (`HOOK_STDIN_MAX`) so a hostile pipe
      cannot make the hook buffer unbounded input. Content still reaches stdout/queue only
      through `JSON.stringify` (no envelope breakout, no command injection); no
      attacker-influenced value is interpolated into a shell command.

## Acceptance criteria

- [ ] The harness drives each of the three hooks through missing-HOME, missing-node,
      TOCTOU/unreadable-digest, unwritable-state, malformed-stdin, oversized-stdin, and
      node-failure, and asserts `exit 0` in **every** case.
- [ ] On a present, readable digest, `session-start.sh` prints exactly one valid JSON object
      with `hookSpecificOutput.hookEventName === 'SessionStart'`; on a read failure it prints
      **nothing** and exits 0.
- [ ] `session-end.sh` / `codex-session-end.sh` append a well-formed `JSON.stringify` record
      on the happy path and exit 0; oversized stdin is bounded (test completes within a time
      bound) and codex emits no stdout.
- [ ] `npm run lint` passes (shellcheck + `shfmt -i 2` on the three hooks).
- [ ] `wienerdog safety` shows all five gates BLOCKED (unchanged).
- [ ] `npm test` passes (incl. the unchanged adapter/doctor hook-registration tests).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "hook"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
shellcheck templates/hooks/*.sh && shfmt -d -i 2 templates/hooks/*.sh && echo "hooks clean"
```

## Out of scope (do NOT do these)

- The digest line/byte caps that bound the file SessionStart reads — **WP-120** (complementary;
  this WP fail-opens regardless of digest size, WP-120 bounds the size).
- The transcript parser / ledger — **WP-118 / WP-119**.
- Any change to adapter hook registration, `doctor.js`, or the install manifest.
- Windows/PowerShell hook equivalents (the shipped session hooks are POSIX bash).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/121-hook-fail-open-hardening`; conventional commits; PR titled
   `fix(hooks): make the three session hooks genuinely fail-open (WP-121)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per WORKING-NOTES.md; `branch:`/PR fields are
> kept for template/upstream-porting fidelity.
