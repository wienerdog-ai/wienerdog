---
id: WP-067
title: Windows .cmd shim single-parser-block (survive self-deletion on uninstall)
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0013, ADR-0004]
branch: wp/067-cmd-shim-single-parser-block
---

# WP-067: Windows .cmd shim single-parser-block (survive self-deletion on uninstall)

## Context (read this, nothing else)

Wienerdog installs files, never a daemon (ADR-0004). To keep long-lived
references (scheduler entries, self-invocations, the user typing `wienerdog …`)
pointing at a stable path across version bumps, `init`/`sync` **vendor** the
running package into `~/.wienerdog/app/<version>/` behind a symlink
`~/.wienerdog/app/current`, and write PATH **shims** at `~/.local/bin/wienerdog`
so bare `wienerdog …` resolves. The single module that owns the shims is
`src/core/vendor.js#writeShim`.

On POSIX `writeShim` writes a bash launcher (`exec node "<current bin>" "$@"`).
On **native Windows** (cmd.exe / PowerShell cannot run a bash script) it
**additionally** writes `~/.local/bin/wienerdog.cmd` — a cmd.exe batch file that
shells out to `node "<current bin>" %*`. Both are manifest-tracked (`kind:'file'`)
and removed by `uninstall`.

**The field bug (real Windows uninstall, v0.6.0, run through the `wienerdog.cmd`
shim).** `wienerdog uninstall` removed everything correctly, then printed
`The batch file cannot be found.` and exited **1** — a *successful* uninstall
reported as a failure. Root cause is classic cmd.exe batch semantics:

- cmd.exe does not load a batch file into memory once. It processes it by
  **seeking to a byte offset, reading the next line, executing it, then
  re-opening/re-seeking the file for the following line.** (This is the same
  mechanism behind the well-known "`del %0` self-delete" batch idiom and its
  trailing `The batch file cannot be found.` message.)
- The user invoked uninstall *through* `wienerdog.cmd`. That `.cmd` runs
  `node "<current bin>" %*` (the uninstall), which **deletes the `.cmd` shim
  itself** mid-run (it is a manifest `file` entry). When the `node` child
  returns, cmd.exe re-opens the batch file to read the next line — **the file is
  gone** → `The batch file cannot be found.` + a nonzero exit.

The current `.cmd` template (frozen by WP-051, now Done) is two lines:

```text
@echo off<CR><LF>
node "<current bin>" %*<CR><LF>
```

After `node …` returns, cmd re-opens the batch to look for a line after the
`node` line — and that re-open is what fails once uninstall has deleted the file.

**The fix (single-parser-block launcher).** Write the launcher so the *entire*
execution completes within a **single line that cmd has already read into memory
before `node` runs**, and terminate batch processing from that same in-memory
line so cmd never re-opens the file afterward. The canonical pattern:

```text
@node "<current bin>" %* & exit /b<CR><LF>
```

- The whole line is read into memory **before** `node` executes, so `node`
  deleting the batch mid-run cannot affect what cmd does next.
- `& exit /b` (unconditional `&`, **never** `&&`) runs after `node` regardless
  of `node`'s exit code, and `exit /b` **with no code** ends batch processing
  immediately while **leaving `ERRORLEVEL` unchanged** — i.e. `node`'s exit code
  propagates as the shim's exit code (so `wienerdog doctor` etc. still report
  status correctly). Because `exit /b` terminates from memory, cmd never
  re-opens the (now-deleted) file → no `The batch file cannot be found.`, exit 0
  on a successful uninstall.
- Leading `@` suppresses echo of the line, replacing the separate `@echo off`
  first line (which is no longer needed and — being a separate line — would only
  add a harmless pre-`node` re-open, not the harmful post-`node` one).

**`&&` would reintroduce the bug on the failure path:** with `node … && exit /b`,
`exit /b` runs only when `node` *succeeds*; on a `node` failure cmd falls through
and re-reads the file — the exact crash, on the error path. Use `&`.

**Confidence in the cmd.exe mechanism: HIGH** (well-documented batch re-read /
self-deletion semantics and `exit /b` ERRORLEVEL behavior). CI has **no Windows
runner**, so the CI-verifiable part is the frozen bytes + structural shape; the
real Windows self-deletion behavior is a **mandatory manual verification item**
(below), per the WP-058 / WP-064 no-Windows-CI precedent.

**The bash shim needs no change.** `exec node …` **replaces** the shell process
image with `node`; when `node` exits there is no shell left to re-read the script
file, so the bash launcher is inherently immune to self-deletion. Confirm this in
the PR; do not change it.

This WP is the exact analog of WP-051 for the launcher *contents*: it supersedes
WP-051's frozen `.cmd` template. **Do not edit the WP-051 done-spec** — this WP
carries the new frozen contract.

## Current state

`src/core/vendor.js#writeShim` today (WP-051) writes the `.cmd` on `win32` with
this exact content (the block this WP replaces):

```js
  let cmdPath = null;
  let cmdChanged = false;
  if (platform === 'win32') {
    cmdPath = path.join(localBin, 'wienerdog.cmd');
    const cmdContent = `@echo off\r\nnode "${currentBin(paths)}" %*\r\n`;
    let cmdSame = false;
    try { cmdSame = fs.readFileSync(cmdPath, 'utf8') === cmdContent; } catch { cmdSame = false; }
    if (!cmdSame) {
      fs.mkdirSync(localBin, { recursive: true });
      fs.writeFileSync(cmdPath, cmdContent);
      cmdChanged = true;
    }
    if (opts.manifest) recordOnce(opts.manifest, { kind: 'file', path: cmdPath });
  }
```

Everything else in `writeShim` (the bash-shim block, the `opts.platform` seam,
the return object shape `{path, changed, onPath, cmdPath, cmdChanged}`, the
manifest record) is correct and **unchanged**. `currentBin(paths)` →
`<core>/app/current/bin/wienerdog.js` (a `path.join` result — backslash absolute
path on a real Windows host, POSIX path under a `platform:'win32'` test on POSIX).

`tests/unit/vendor.test.js` has a test titled
`vendor: writeShim on win32 also writes a .cmd launcher, byte-idempotent` whose
exact-content assertion (line ~263) currently reads:

```js
assert.equal(cmdContent, `@echo off\r\nnode "${vendor.currentBin(paths)}" %*\r\n`, 'exact CRLF content');
```

Test helpers: `tempPaths()` (fresh temp `HOME` + `WIENERDOG_HOME`, resolved
paths). The off-Windows test (`platform:'linux'` → no `.cmd`) and the bash-shim
tests must keep passing unchanged.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/vendor.js | change ONLY the `.cmd` `cmdContent` template inside `writeShim` to the single-parser-block form; update the JSDoc/comment to explain the self-deletion fix. No other function or block changes. Both call sites unchanged. |
| modify | tests/unit/vendor.test.js | update the win32 `.cmd` exact-content assertion to the new frozen bytes; add structural assertions (single logical line, contains `& exit /b`, contains `%*`); keep byte-idempotency, manifest-tracking, bash-shim-also-written, and off-Windows (`platform:'linux'` → no `.cmd`) assertions passing |

### Exact contract — frozen `.cmd` bytes

Replace the `cmdContent` line with **exactly**:

```js
const cmdContent = `@node "${currentBin(paths)}" %* & exit /b\r\n`;
```

Frozen file contents (exact bytes; `<current bin>` = `currentBin(paths)`):

```text
@node "<current bin>" %* & exit /b<CR><LF>
```

i.e. the string `` `@node "${currentBin(paths)}" %* & exit /b\r\n` `` — **one**
physical line, CRLF-terminated, one space around `&`, an unconditional `&` (not
`&&`), `exit /b` with **no** exit code. No `@echo off` line. This supersedes
WP-051's `` `@echo off\r\nnode "${currentBin(paths)}" %*\r\n` ``.

Everything else in the `if (platform === 'win32')` block (the byte-idempotent
compare, the `mkdirSync` + `writeFileSync`, the `recordOnce` `kind:'file'`)
stays exactly as-is — only the template string changes.

### Example (evidence-shaped)

- Windows install: `~/.local/bin/wienerdog.cmd` contains
  `@node "C:\Users\ada\.wienerdog\app\current\bin\wienerdog.js" %* & exit /b`.
- `wienerdog uninstall` typed in cmd.exe resolves through the `.cmd`, runs
  `node …/uninstall`, which deletes the `.cmd` mid-run; cmd then runs `exit /b`
  from memory and returns `node`'s exit code (0). No
  `The batch file cannot be found.` message; the shell prompt returns cleanly.
- `wienerdog doctor` (nonzero exit on a failed check) propagates that exit code
  through `exit /b` unchanged.

## Implementation notes & constraints

- No new npm dependencies. Plain Node ≥ 18, JSDoc types only, no build step.
- Do NOT change `vendorSelf`, `sync.js`, the bash-shim block, the `opts.platform`
  seam, the return shape, or the manifest record. This is a **content-only**
  change to one template string plus its explanatory comment.
- Test on POSIX via `opts.platform: 'win32'` (NEVER mock `process.platform`).
  Assert against `` `@node "${vendor.currentBin(paths)}" %* & exit /b\r\n` `` —
  not a hardcoded backslash path (on POSIX `currentBin` yields a POSIX path).
- Structural assertions to add (CI-verifiable substitute for running cmd.exe):
  the `.cmd` content, split on `\r\n` and dropping the trailing empty element,
  is exactly **one** line; that line ends with `& exit /b`; and it contains
  `%*`. A comment on the test should name the invariant: *the node invocation and
  the batch-terminating `exit /b` share one line cmd reads before node runs, so
  the shim survives deleting itself.*
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope.

## Acceptance criteria

- [ ] `writeShim(paths, { manifest, platform: 'win32' })` writes
      `~/.local/bin/wienerdog.cmd` with exactly
      `` `@node "${currentBin(paths)}" %* & exit /b\r\n` `` and returns
      `cmdChanged: true`; a second identical call returns `cmdChanged: false`
      and does not grow the manifest (byte-idempotent).
- [ ] The `.cmd` content is a single logical line (one element after splitting on
      `\r\n` and dropping the trailing empty), ends with `& exit /b`, and
      contains `%*`.
- [ ] The `.cmd` is recorded as a `kind:'file'` manifest entry and the bash shim
      is still written on `win32`.
- [ ] `writeShim(paths, { platform: 'linux' })` writes no `.cmd`
      (`cmdPath: null`); the bash-shim tests still pass unchanged.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern writeShim
npm test -- --test-name-pattern vendor
npm test
npm run lint
```

## Manual verification (mandatory — CI has no Windows runner)

On a real Windows machine with `~/.local/bin` on `PATH` and Wienerdog installed:

1. In **cmd.exe**, run `wienerdog uninstall --yes` (invoked through the `.cmd`
   shim, not `node` directly). Expected: it completes, prints its normal
   removal summary, does **not** print `The batch file cannot be found.`, and
   `echo %ERRORLEVEL%` afterward is `0`.
2. Reinstall, then in cmd.exe run `wienerdog doctor` on a machine with a
   deliberately failing check. Expected: `echo %ERRORLEVEL%` is nonzero (the
   `.cmd` propagates node's exit code via `exit /b`).

Record the results (or "not yet run") in the PR body; this WP's field sign-off
follows the WP-058 / WP-064 owner-checklist precedent.

## Out of scope (do NOT do these)

- Any change to the bash shim, `repointCurrent`, `vendorSelf`, or `sync.js`.
- The uninstall preserve-handler + generated-state disposal — that is **WP-068**
  (`src/core/manifest.js` + `src/cli/uninstall.js`); it shares no files with this
  WP and lands in parallel.
- Windows scheduling / `install.ps1` internals — out of this WP.
- Editing the WP-051 done-spec (its frozen template is superseded here, not
  edited in place).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body; manual
   Windows results (or "not yet run") noted.
2. Branch `wp/067-cmd-shim-single-parser-block`; conventional commits; PR titled
   `fix(vendor): single-parser-block .cmd shim survives self-deletion (WP-067)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. Credit the field report:
   `Reported-by: external user (Windows v0.6.0 uninstall field report)`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
