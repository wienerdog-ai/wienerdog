---
id: WP-shim-recovery-message
title: Make the CLI shim fail with a human recovery message when app/current is unresolvable, not a raw MODULE_NOT_FOUND
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0013, ADR-0028, ADR-0039]
epic: digest-delivery
---

# WP-shim-recovery-message: the shim tells the user what happened

## Context (read this, nothing else)

Wienerdog installs a **vendored** copy of itself under `~/.wienerdog/app/<version>/`
and points `~/.wienerdog/app/current` at it (ADR-0013). Everything that runs the CLI
goes through one **shim**, `~/.local/bin/wienerdog`, a two-line bash script that
`exec`s node against the vendored entry point. The shim is written by `writeShim` in
`src/core/vendor.js` at install, sync and update.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP changes the text of one
generated file. It adds no process.

**The defect.** When `app/current` is unresolvable — a dangling symlink, a purged
worktree on a dev-stance install, an interrupted update — the shim still `exec`s node
against a path that does not exist, and **every** `wienerdog` command dies with a raw
Node `MODULE_NOT_FOUND` stack trace. `sync`, `doctor`, `alerts`, `dream`, `uninstall`:
all of them, because all of them route through this one file.

This is not hypothetical. On the maintainer's machine `app/current` pointed at a
purged worktree from 2026-08-02. For four weeks the hourly `--catch-up` refused
correctly and recorded durable alerts, and the owner could not run
`wienerdog alerts` to read them, because that command went through the same broken
shim. The recovery command was named in the alert text he could not display. See
`docs/specs/logbook/2026-08-30-the-banner-channel-inverted-and-nobody-noticed.md` and
ADR-0039's Context.

The shim is the **last** surface that can speak when everything else is gone. A stack
trace there wastes the only remaining channel.

**What the message must and must not say.** The shim cannot verify anything — it is a
two-line bash script outside every integrity mechanism. It must therefore state a
fact it can actually check (the entry point is missing) and name the recovery, without
implying it has diagnosed a cause. In particular it must **not** tell the user to run
`wienerdog sync`: the launcher's own `reinstall` remedy class exists precisely because
a missing or unconfirmable app tree is the case where syncing is not the safe next
step (`REMEDY_TAIL.reinstall` in `src/scheduler/launcher.js`). The shim's message must
agree with that, and its wording is fixed by Table S below so the two never drift.

## Current state

`src/core/vendor.js`, `writeShim(paths, opts)` — the POSIX shim it generates today:

```js
const content =
  '#!/usr/bin/env bash\n' +
  '# Wienerdog CLI shim (managed) — points at the vendored app entry (ADR-0013).\n' +
  `exec node "${currentBin(paths)}" "$@"\n`;
let same = false;
try { same = fs.readFileSync(shimPath, 'utf8') === content; } catch { same = false; }
let changed = false;
if (!same) {
  fs.mkdirSync(localBin, { recursive: true });
  fs.writeFileSync(shimPath, content, { mode: 0o755 });
  fs.chmodSync(shimPath, 0o755);
  changed = true;
}
if (opts.manifest) recordOnce(opts.manifest, { kind: 'file', path: shimPath });
```

Verbatim from the maintainer's machine:

```bash
#!/usr/bin/env bash
# Wienerdog CLI shim (managed) — points at the vendored app entry (ADR-0013).
exec node "/Users/gyulafeher/.wienerdog/app/current/bin/wienerdog.js" "$@"
```

`currentBin(paths)` returns the absolute `<core>/app/current/bin/wienerdog.js`.
Idempotence is byte-comparison against the whole generated string, so changing the
content means the shim is rewritten once at the next `sync`/`update` and is stable
after that.

**The Windows `.cmd` shim is a different animal and this WP does not touch it.**
`writeShim` also writes `~/.local/bin/wienerdog.cmd` on `win32`:

```js
const cmdContent = `@node "${currentBin(paths)}" %* & exit /b\r\n`;
```

Its own comment (WP-067, superseding WP-051) explains that this **must** stay a single
parser block: `cmd.exe` re-opens the batch file after each line, so a multi-line `.cmd`
crashes with "The batch file cannot be found." when the invoked command deletes the
file mid-run (`wienerdog uninstall` does exactly that). Adding an existence guard
would require more lines and would reintroduce that bug. See Out of scope.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/vendor.js | `writeShim` POSIX branch only: guard before `exec` |
| modify | tests/unit/vendor.test.js | generated content + both runtime branches |

### Exact contracts

The generated POSIX shim becomes exactly this (with `<CURRENT_BIN>` substituted by
`currentBin(paths)`):

```bash
#!/usr/bin/env bash
# Wienerdog CLI shim (managed) — points at the vendored app entry (ADR-0013).
WIENERDOG_ENTRY="<CURRENT_BIN>"
if [ ! -f "$WIENERDOG_ENTRY" ]; then
  echo "wienerdog: the installed app files are missing or unreadable ($WIENERDOG_ENTRY)." >&2
  echo "wienerdog: no command can run until they are restored. Reinstall Wienerdog from a trusted source." >&2
  echo "wienerdog: if you have a checkout, 'npx wienerdog@latest sync' reinstalls the vendored app." >&2
  exit 127
fi
exec node "$WIENERDOG_ENTRY" "$@"
```

### Table S — the shim guard contract

| Row | Fact | Value |
|-----|------|-------|
| S1 | Scope | POSIX shim `~/.local/bin/wienerdog` only. `wienerdog.cmd` is unchanged |
| S2 | Guard test | `[ ! -f "$WIENERDOG_ENTRY" ]` — a regular-file test, which correctly fails for a dangling symlink, a missing dir, and a directory at that path |
| S3 | Exit code | `127` (POSIX "command not found") — distinguishable from any Wienerdog exit code |
| S4 | Stream | All three lines to **stderr**, so a caller capturing stdout sees nothing malformed |
| S5 | Remedy wording | Reinstall from a trusted source. It **never** says "run `wienerdog sync`", matching `REMEDY_TAIL.reinstall` in `src/scheduler/launcher.js` |
| S6 | Mode / manifest | Unchanged: `0755`, one `recordOnce` `file` entry, byte-compare idempotence |
| S7 | Rollout | Existing installs get the new shim at the next `sync`/`update` — no migration, and no help for an install already wedged (that user reinstalls, which is what the message will then say) |

## Contract reference

N/A — one small contract, stated once in Table S above and mirrored only by the
literal shim body in Exact contracts and by the acceptance criteria. Fewer than two of
ADR-0031's seven triggers fire.

## Implementation notes & constraints

- **Do not `exec` and hope.** The point is to check first. `exec` replaces the shell
  process, so anything after it is unreachable — the guard must precede it.
- Keep the shim to plain POSIX-compatible bash with no external commands beyond
  `echo`/`test`. It runs before anything about the install is known to be intact.
- **Quote `$WIENERDOG_ENTRY` everywhere.** The path is absolute and may contain
  spaces (a `$HOME` with a space is common on macOS).
- The shim body is a JS template string in `vendor.js`. Watch the interpolation
  boundaries: `${...}` inside the bash text (there is none in the final form, but
  `"$@"` and `"$WIENERDOG_ENTRY"` must survive as literal shell text). Prefer
  concatenating single-quoted JS strings for the fixed lines and interpolating only
  `currentBin(paths)`, matching the existing style.
- **This changes the shim's bytes, so `writeShim` rewrites it once** on every existing
  install at the next `sync`. That is expected and is the delivery mechanism (S7). The
  second `sync` must report no change — verify idempotence.
- `bin/wienerdog.js` is not involved. Do not add a check inside the app entry point:
  by the time it runs, it exists.
- When uncertain: choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope.

## Security checklist

- [ ] `currentBin(paths)` is derived from `paths`, not from user input or an
      environment variable read inside the shim. Do not make `WIENERDOG_ENTRY`
      overridable from the environment — an env-overridable entry point in the one
      file every command routes through would be an arbitrary-execution primitive.
- [ ] The path is interpolated once, at generation time, into a double-quoted shell
      assignment. Confirm the generated file is byte-correct for a `$HOME` containing
      a space and for one containing a single quote.
- [ ] The guard is a check, not a repair: the shim must never create, move, or
      re-point anything. Repair is `sync`'s attended job or a reinstall (S5).
- [ ] The message names paths only, never file contents.

## Acceptance criteria

- [ ] AC-1 — `writeShim` generates exactly the shim body in Exact contracts, with
      `currentBin(paths)` substituted (S1).
- [ ] AC-2 — With the entry point missing, running the shim writes the three lines to
      **stderr**, writes nothing to stdout, and exits **127** (S2, S3, S4).
- [ ] AC-3 — With the entry point present, the shim `exec`s node against it and
      forwards all arguments unchanged; its exit code is node's.
- [ ] AC-4 — A **dangling symlink** at `app/current` triggers the guard (S2).
- [ ] AC-5 — The message contains no instruction to run `wienerdog sync` (S5). Grep
      the generated content for `wienerdog sync` and confirm only the
      `npx wienerdog@latest sync` reinstall line matches.
- [ ] AC-6 — The shim is `0755` and a `file` manifest entry is recorded exactly once
      (S6).
- [ ] AC-7 — Calling `writeShim` twice reports `changed:false` the second time (S6).
- [ ] AC-8 — On `win32`, `wienerdog.cmd` content is **unchanged** from before this WP
      (S1) — assert the exact existing string.
- [ ] AC-9 — The generated shim is correct for a home directory containing a space.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern vendor
npm test
npm run lint
# AC-2/AC-4 — behaviour against a dangling entry, end to end:
tmp=$(mktemp -d) && mkdir -p "$tmp/bin" && \
  node -e 'const v=require("./src/core/vendor.js");console.log(typeof v.writeShim)' && \
  echo "writeShim reachable"
# AC-5 — the remedy never recommends sync (expect only the npx reinstall line):
node -e 'const s=require("fs").readFileSync("src/core/vendor.js","utf8");
  const m=s.match(/Reinstall Wienerdog from a trusted source[^"]*/g);console.log(m)'
```

## Out of scope (do NOT do these)

- **`~/.local/bin/wienerdog.cmd`.** The WP-067 single-parser-block invariant makes a
  multi-line guard unsafe: `cmd.exe` re-opens the batch file between lines, so a guard
  reintroduces the "batch file cannot be found" crash when `wienerdog uninstall`
  deletes the shim mid-run. A Windows user keeps node's own ENOENT message. Revisit
  only with a design that stays one parser block.
- Verifying, repairing or re-pointing `app/current` — that is `sync`'s attended job
  and the launcher's integrity check (ADR-0028).
- Any change to `currentBin`, the vendor tree layout, the manifest, or `uninstall`.
- The refusal banner and its readers — `WP-launcher-refusal-banner` and
  `WP-refusal-banner-delivery`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(vendor): shim recovery message (WP-shim-recovery-message)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
