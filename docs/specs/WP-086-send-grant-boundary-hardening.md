---
id: WP-086
title: Harden the send-grant boundary — require a terminal to mint a grant; fail closed on an empty recipient list
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0007]
branch: wp/086-send-grant-boundary-hardening
---

# WP-086: Harden the send-grant boundary

## Context (read this, nothing else)

Outbound email is Wienerdog's highest-risk capability. **THREAT-MODEL T4a /
ADR-0007** makes a **send grant** the security boundary: a grant is a
`(routine, recipient-allowlist)` pair, stored in a managed section of
`~/.wienerdog/config.yaml`, and **created ONLY by the interactive
`wienerdog grant` CLI with a typed-word confirmation** — the stated invariant is
that *no skill, hook, dream, or headless job can mint or widen a grant*. At send
time, `gmail.send()` consults `isSendAllowed(grant, recipients)`; a
missing/insufficient grant degrades to a draft.

**Scope of the achievable guarantee (read before writing the claim):** a controlling-
terminal check makes *ordinary redirected/piped/closed stdin* unable to confirm a
grant — that is the reachable headless bypass and the one this WP closes. It does NOT
prove a human is present: a same-user process can allocate a PTY (`expect`/`script`)
to present a terminal device and script the word. That PTY path is an accepted
residual (parity with the existing "a local process that can write `config.yaml` can
forge a grant" residual — same actor, no new capability). Write the checklist claim in
those narrow, true terms; do not claim the fix "restores" the full invariant.

Two verified defects weaken that boundary, both in the grant machinery:

1. **A grant can be minted non-interactively by piping the confirmation.**
   `src/cli/grant.js` `defaultPrompt()` reads the confirmation word straight from
   `process.stdin` via `readline`, with no `isTTY` / `/dev/tty` check. So
   `printf 'grant\n' | wienerdog grant send --routine stolen --to attacker@evil.com`
   satisfies the "typed confirmation" from a headless pipe — exactly the class the
   invariant claims is impossible. The module comment (grant.js:8–13) asserts the
   confirmation is "driven by real stdin," which is currently false.

2. **The enforcement decision fails OPEN on an empty recipient list.**
   `src/gws/grant.js` `isSendAllowed(grant, recipients)` loops over `recipients`
   and returns `{allowed:false}` on the first non-allowlisted address; when
   `recipients` is `[]` the loop never runs and it returns `{allowed:true}`.
   `gmail.send()` builds `recipients` by splitting/trimming/filtering `opts.to`, so
   a malformed `to` (empty/whitespace) yields `[]` and — with any grant present for
   the routine — reaches `messages.send` with **no** recipient check. A gate must
   fail **closed** (degrade to draft) on malformed input.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004).
The fixes are input-validation and a terminal check; they start no process.

## Current state

`src/cli/grant.js` — `defaultPrompt(question)` (lines ~21–29):

```js
function defaultPrompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}
```

`run()` prints the routine + recipients, then
`const answer = await promptFn('Type the word "grant" to confirm …')` and only
calls `grantLib.saveGrant` when `answer.trim() === 'grant'`. `promptFn` is
injectable (`opts.promptFn`) — tests already pass a stub, so **this existing
code-level injection seam is how tests exercise `run()`; it is NOT an env var and
is unreachable by an untrusted process's environment.**

`src/core/prompt.js`'s `confirm()` (the CLI's yes/no prompt) selects the terminal
the same way — `process.stdin.isTTY` else `/dev/tty` — but ALSO honors a
`WIENERDOG_PROMPT_TTY` env override for its own tests. **This WP must NOT copy that
env override into the grant path.** An env-var override is attacker-settable: a
headless process could set `WIENERDOG_PROMPT_TTY=/path/to/file` containing
`grant\n` and mint a grant from a pipe — the exact bypass the invariant forbids.
The grant's controlling-terminal read must be literal (`/dev/tty`, no env), with
testability coming from a **code-level** injected stream factory (a function
parameter, not an environment variable), so no ambient environment can supply the
confirmation word. The grant needs a **typed word**, not yes/no, so it cannot call
`confirm()` directly; it implements the terminal-selection rule itself.

`src/gws/grant.js` — `isSendAllowed(grant, recipients)` (lines ~184–196):

```js
function isSendAllowed(grant, recipients) {
  if (!grant) return { allowed: false, reason: 'no send grant for this routine' };
  const allow = new Set((grant.to || []).map((a) => String(a).trim().toLowerCase()));
  for (const r of recipients) {
    const norm = String(r).trim().toLowerCase();
    if (!allow.has(norm)) return { allowed: false, reason: `recipient ${String(r).trim()} not in allowlist` };
  }
  return { allowed: true, reason: 'all recipients granted' };  // ← also returned for recipients === []
}
```

`src/gws/gmail.js` `send()` computes
`const recipients = String(opts.to).split(',').map(s=>s.trim()).filter(Boolean)`
and calls `isSendAllowed(grant, recipients)`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/grant.js | `defaultPrompt` reads a real controlling terminal ONLY (stdin-if-TTY, else literal `/dev/tty` — NO env override); no-terminal/EOF/error aborts the grant loudly; add a code-level injected `openTty` stream-factory seam and export `defaultPrompt` for tests |
| modify | src/gws/grant.js | `isSendAllowed`: empty/whitespace-only recipient list → `{allowed:false}` |
| modify | tests/unit/gws-grant.test.js | tests for piped-stdin abort (no grant written) and for empty-recipients denial |

### Exact contracts

**`isSendAllowed` fail-closed on empty input.** Add an explicit empty-list guard
before the loop:

```js
function isSendAllowed(grant, recipients) {
  if (!grant) return { allowed: false, reason: 'no send grant for this routine' };
  const list = (recipients || []).map((r) => String(r).trim()).filter(Boolean);
  if (list.length === 0) return { allowed: false, reason: 'no recipient to check (empty list)' };
  const allow = new Set((grant.to || []).map((a) => String(a).trim().toLowerCase()));
  for (const r of list) {
    if (!allow.has(r.toLowerCase())) return { allowed: false, reason: `recipient ${r} not in allowlist` };
  }
  return { allowed: true, reason: 'all recipients granted' };
}
```

(Filtering blanks inside the gate also hardens it against a whitespace-only entry;
the behavior for a normal non-empty list is unchanged.)

**`defaultPrompt` requires a real controlling terminal (no env override).**
Replace the bare `process.stdin` read with a terminal-selection rule that reads
ONLY a controlling terminal and takes its terminal source from a **code-level**
injected factory (a function parameter — never an environment variable):

```js
const fs = require('node:fs');

const NO_TTY_GRANT_MESSAGE =
  'wienerdog: a send grant can only be created at a real terminal (no terminal here). ' +
  'Run `wienerdog grant send …` in an interactive shell.';

/** Read the typed-word confirmation from a real controlling terminal. When stdin
 *  is a TTY, read it directly; otherwise open the controlling terminal (/dev/tty).
 *  There is NO environment override — a headless process must not be able to point
 *  this at a regular file and script the confirmation (ADR-0007). `openTty` is a
 *  code-level test seam only: tests pass a fake stream factory; production uses the
 *  literal /dev/tty. On no reachable terminal (piped/redirected/EOF/error) it prints
 *  a refusal and resolves to '' — which can never equal the confirmation word.
 *  @param {string} question
 *  @param {{openTty?:() => NodeJS.ReadableStream}} [opts]
 *  @returns {Promise<string>} */
function defaultPrompt(question, opts = {}) {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
  }
  const openTty = opts.openTty || (() => fs.createReadStream('/dev/tty'));
  return new Promise((resolve) => {
    let input;
    try { input = openTty(); } catch { process.stderr.write(`${NO_TTY_GRANT_MESSAGE}\n`); resolve(''); return; }
    let settled = false;
    const refuse = () => {
      if (settled) return; settled = true;
      try { input.destroy(); } catch { /* ignore */ }
      process.stderr.write(`${NO_TTY_GRANT_MESSAGE}\n`); resolve('');
    };
    input.once('error', refuse);
    const rl = readline.createInterface({ input, output: process.stderr });
    rl.on('error', () => {}); // readline re-emits stream errors; `input`'s handler drives the abort
    rl.question(question, (a) => {
      if (settled) return; settled = true;
      rl.close(); try { input.destroy(); } catch { /* ignore */ }
      resolve(a);
    });
    rl.on('close', () => { if (!settled) refuse(); });
  });
}
```

Export `defaultPrompt` (add it to `module.exports`) so tests can drive its
controlling-terminal logic directly with an injected `openTty`. The
controlling-terminal read is what makes the confirmation un-scriptable: in the
non-TTY branch `process.stdin` is **never read**, so a piped/redirected stdin
(`printf 'grant\n' | wienerdog grant …`, CI, cron, `ssh host 'cmd'`) cannot supply
the word. `run()` and its `opts.promptFn` seam are unchanged — the existing
gws-grant tests keep passing a stub `promptFn`; only the *default* prompt changes.
`--yes` still does not bypass (grant.js already ignores it).

Behavior:
- `printf 'grant\n' | node bin/wienerdog.js grant send --routine r --to a@b.com`
  in a headless environment (stdin not a TTY, no controlling terminal): the
  non-TTY branch opens `/dev/tty`, its `open`/`error` fails (no controlling
  terminal) → refusal printed, resolves `''` → run() sees `'' !== 'grant'` → **no**
  grant saved. Piped stdin is ignored entirely.
- An interactive run (stdin is a TTY, or a real controlling terminal on `/dev/tty`)
  still creates the grant when the user types `grant`.
- Unit tests drive both outcomes by injecting `openTty`: a factory returning a
  stream that emits `error` proves the no-terminal refusal; a factory returning a
  readable stream yielding `grant\n` proves the controlling-terminal path works —
  neither is reachable from the process environment.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- **Do NOT introduce or honor any environment override for the terminal source**
  (no `WIENERDOG_PROMPT_TTY`, no new env var). Production reads the literal
  `/dev/tty`; the ONLY test seam is the code-level `openTty` function parameter.
  This is deliberately stricter than `src/core/prompt.js`'s `confirm()`, whose env
  seam is acceptable for a non-security yes/no prompt but NOT for the grant
  boundary. Duplicating the ~15-line terminal-open logic here (rather than reusing
  `confirm()`) is intentional — record it under "Decisions made".
- Do not change `run()`'s printed consent text, the `looksLikeAddress` check, or
  `saveGrant`. `run()` continues to call `promptFn` (default `defaultPrompt`); it
  does not thread `openTty` — tests that need `openTty` call `defaultPrompt`
  directly.
- The empty-recipient guard must not change behavior for any non-empty recipient
  list (the existing gws-grant tests must still pass).

## Security checklist

- [ ] The typed-word confirmation is read from a **controlling terminal**
      (`process.stdin` only when `isTTY`, else the literal `/dev/tty`) with **no
      environment override** of the terminal source; a piped/redirected/EOF stdin
      and the no-terminal case abort with a value that can never satisfy the
      `=== 'grant'` check — so **ordinary redirected/piped/closed stdin** (`printf … |`,
      cron, `ssh host 'cmd'`), and any attacker-set environment variable, cannot
      confirm a grant. (Narrower-but-true claim — see Round-2 dispositions: a same-user
      process that *deliberately allocates a PTY* with `expect`/`script` can present a
      TTY device and script the word; that is OUTSIDE the threat model because such an
      actor can already edit `config.yaml` directly, so it mints no new capability.
      TTY presence proves a terminal DEVICE, not human consent — this WP closes the
      ambient/redirected-stdin bypass, which is the reachable one.)
- [ ] `isSendAllowed` FAILS CLOSED on an empty/whitespace recipient list
      (`{allowed:false}`), so a malformed `opts.to` degrades to a draft instead of
      reaching `messages.send` unchecked.

## Acceptance criteria

- [ ] `isSendAllowed(grant, [])` and `isSendAllowed(grant, ['   '])` return
      `{allowed:false}`; a valid non-empty allowlisted list still returns
      `{allowed:true}`.
- [ ] `defaultPrompt(question, { openTty })` with stdin non-TTY and an `openTty`
      that returns a stream emitting `error` (no controlling terminal) prints the
      refusal and resolves to `''` (never `'grant'`); driven through `run()` via a
      `promptFn` that returns `''`, `grant send` writes **no** grant to
      `config.yaml`. No environment variable can change this.
- [ ] `defaultPrompt(question, { openTty })` with an `openTty` returning a readable
      stream that yields `grant\n` resolves to `'grant'` (the controlling-terminal
      path works); driven through `run()` with a `promptFn` returning `'grant'`,
      the grant is created.
- [ ] The existing gws-grant tests (via `opts.promptFn` stub) still pass unchanged.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern grant
npm test
npm run lint
```

## Out of scope (do NOT do these)

- MIME header injection — **WP-085**.
- A cryptographic provenance marker distinguishing CLI-created grants from
  hand-written `config.yaml` grants, and removing the exported `saveGrant`
  primitive's convention-only boundary — these remain **documented accepted
  residuals** (THREAT-MODEL "Residual risks"); do not implement here.
- OAuth `state`/PKCE hardening of the loopback flow (separate concern).

## Round-2 dispositions

- **Codex round-2 P1/P2 (env-var TTY seam preserves the headless bypass):**
  RESOLVED by removing the env override entirely. The original draft mirrored
  `src/core/prompt.js`'s `WIENERDOG_PROMPT_TTY` seam; that is attacker-settable
  (`WIENERDOG_PROMPT_TTY=/file/with/grant`). Production now reads only a real
  controlling terminal (`stdin.isTTY` / literal `/dev/tty`); testability comes from
  a code-level injected `openTty` function parameter, unreachable from the process
  environment. `src/core/prompt.js` itself is NOT changed (its env seam gates a
  non-security yes/no prompt and is out of this WP's Deliverables); only the grant
  path is hardened.
- **Owner judgment call — refusal return value.** The default applied here is
  `resolve('')` (a value that can never equal `'grant'`) plus a stderr refusal,
  rather than rejecting with `WienerdogError`. Rationale: `run()` already treats any
  non-`'grant'` answer as a clean cancel, so `''` gives the same fail-closed outcome
  without a stack/abort. Flip to a throw only if the owner prefers a nonzero exit.
- **Codex round-3 P1 (TTY presence does not prove human consent) — NARROWED CLAIM +
  ACCEPTED RESIDUAL.** Round-3 is conceptually correct: `stdin.isTTY` / a readable
  `/dev/tty` proves a terminal DEVICE, not a human — a same-user process can allocate
  and drive a pseudoterminal (`expect`, `script`, a PTY API) so `isTTY` becomes true
  and scripted `grant` input is accepted. The over-strong invariant ("no headless job
  can EVER mint a grant") is unachievable by TTY detection alone. Default applied per
  brief: **narrow the claim** to what the fix actually guarantees — *ordinary
  redirected/piped/closed stdin cannot confirm a grant* — and record the PTY path as
  an accepted residual. It is out of the threat model at parity with THREAT-MODEL's
  existing residual "a local process that can write `config.yaml` can forge a grant":
  a same-user actor who can allocate a PTY to script the CLI can equally well write
  the grant into `config.yaml` directly, so the PTY path grants no NEW capability. The
  production gate (stdin-if-TTY else literal `/dev/tty`, no env override) and the
  code-level `openTty` test seam are unchanged; only the wording is corrected from
  "restores the invariant" to the narrower true statement.

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/086-send-grant-boundary-hardening`; conventional commits; PR titled
   `fix(gws): require a terminal to mint a grant; fail closed on empty recipients (WP-086)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
