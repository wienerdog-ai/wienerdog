---
id: WP-097
title: XML-escape launchd plist values and quote systemd ExecStart paths so a special-character install path can't break registration
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: []
branch: wp/097-scheduler-generator-path-escaping
---

# WP-097: Scheduler generator path escaping

## Context (read this, nothing else)

Wienerdog schedules its nightly dream via OS-native entries (THREAT-MODEL T6, no
daemon — ADR-0004). The pure renderers live in `src/scheduler/generators.js`:
`launchdPlist`/`catchupPlist` emit macOS `.plist` XML; `systemdService` emits a
Linux `.service` unit. Each interpolates the absolute `node` path, the Wienerdog
`bin` path, and log-file paths — all derived from the install location
(`$WIENERDOG_HOME`/home).

The **verified defect (scheduler #8):** these paths are interpolated **without
escaping**. If the install path contains an XML special character (`&`, `<`, `>`),
the plist becomes invalid XML and `launchctl` rejects it. If it contains a space, systemd's
`ExecStart=${node} ${bin} …` splits the executable/arguments on whitespace, so the
service runs the wrong command; and if it contains a `%`, systemd expands it as a
**specifier** (`%h`, `%u`, …) **even inside double quotes**, altering the path.
Either way registration fails or mis-runs — and, given the `ensureEntry`
"unchanged" fast path, a once-written-broken file can persist. The job name is
already validated (`^[a-z0-9][a-z0-9-]*$`), so only the path values need escaping.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004);
these are pure string renderers, golden-testable. A normal (no-special-char) path
must produce byte-identical output to today.

## Current state

`src/scheduler/generators.js`:

```js
function launchdPlist(o) {
  return `…<array>
    <string>${o.node}</string>
    <string>${o.bin}</string>
    <string>run-job</string>
    <string>${o.name}</string>
  </array>
  …<key>StandardOutPath</key>
  <string>${path.join(o.logDir, 'launchd.out.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(o.logDir, 'launchd.err.log')}</string>…`;
}
// catchupPlist(o) similarly interpolates o.node, o.bin, path.join(o.logDir, …)

function systemdService(o) {
  return `[Unit]
Description=Wienerdog job: ${o.name}

[Service]
Type=oneshot
ExecStart=${o.node} ${o.bin} run-job ${o.name}
`;
}
```

`o.name` is validated upstream (`schedule add` name regex; `windowsTaskName`), so
it needs no escaping here. `o.node`/`o.bin`/`o.logDir` are install-path-derived.
Generators are tested inline in `tests/unit/scheduler-generators.test.js` (no
golden fixture pins their output).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/generators.js | add `xmlEscape` + `systemdQuote` (which also escapes `%`→`%%`); escape path values in `launchdPlist`/`catchupPlist`; quote+specifier-escape paths in `systemdService`'s ExecStart |
| modify | tests/unit/scheduler-generators.test.js | tests: a plist path with `&`/`<`/`>` is XML-escaped and well-formed; a systemd path with a space, a `%`, a backslash, and a `"` is single-quoted-argument-safe (`%`→`%%`); a normal path is byte-identical (plist) / quoted-form (systemd) |

### Exact contracts

**XML escaping for plist `<string>` values:**

```js
/** Escape a value for insertion into XML character data (plist <string>). Order
 *  matters: & first. @param {string} s @returns {string} */
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

Apply to every interpolated PATH value in `launchdPlist` and `catchupPlist`
(`o.node`, `o.bin`, and each `path.join(o.logDir, …)`). Do NOT escape the fixed
literal strings (`run-job`, `--catch-up`) or `o.name` (already validated), though
escaping them is a harmless no-op — prefer escaping only the path values to keep
the diff minimal.

**systemd ExecStart quoting + specifier escaping** — systemd expands `%` specifiers
(e.g. `%h`, `%%`) **even inside double-quoted `ExecStart` arguments**, at
unit-file-parse time BEFORE quote processing. So quoting alone is not enough: a
path containing a literal `%` would be altered (or corrupted) despite the quotes.
Escape `%`→`%%` in addition to the `\` and `"` quote escapes, and wrap each path so
a space cannot split it:

```js
/** Quote a path as a single systemd ExecStart argument: escape the systemd
 *  specifier char (% → %%) so a literal % is not expanded, then double-quote,
 *  escaping \ and ". Order: \ first (so added \" is not re-escaped), then %, then ".
 *  @param {string} s @returns {string} */
function systemdQuote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/%/g, '%%').replace(/"/g, '\\"')}"`;
}
// ExecStart=${systemdQuote(o.node)} ${systemdQuote(o.bin)} run-job ${o.name}
```

(`o.name` is validated `^[a-z0-9][a-z0-9-]*$`, so it can carry no `%`/space/quote and
needs no escaping. launchd/plist does NOT do specifier expansion — only the systemd
renderer needs `%%`; the plist path just needs XML escaping.)

**Byte-identical for normal paths:** a path with no `&<>` is unchanged by
`xmlEscape`. `systemdQuote` DOES add quotes around `node`/`bin` unconditionally —
this changes the `ExecStart` line even for normal paths. That is acceptable and
correct (quoted absolute paths are valid systemd), but update the
`systemdService` inline test's expected string to the quoted form. (launchd/plist
tests with normal paths stay byte-identical.)

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Keep the renderers PURE (no I/O). Only the interpolation of path values changes.
- Do not touch the Windows Task Scheduler XML renderers
  (`windowsDreamTaskXml`/`windowsCatchupTaskXml`) — not in scope for this WP.
- Do not change `ensureEntry`, `registerPlatform`, name validation, or the plist
  structure/keys.

## Security checklist (untrusted-input note)

- [ ] Install-path-derived values (`node`, `bin`, log paths) are XML-escaped before
      entering plist `<string>` elements, and double-quoted WITH `%`→`%%` specifier
      escaping before entering systemd `ExecStart`, so a path containing `&`/`<`/`>`
      (plist) or a space/`%`/`\`/`"` (systemd) cannot produce an invalid plist, a
      mis-split command, or a specifier-expanded path — any of which would fail or
      mis-register the job. (These paths are not attacker-controlled, but robust
      escaping prevents a broken registration that fails-loud or, worse, mis-runs.)

## Acceptance criteria

- [ ] `launchdPlist`/`catchupPlist` with a `logDir` or `bin` containing `&` produces
      well-formed XML (the `&` appears as `&amp;`); parseable as XML in the test.
- [ ] `systemdService` with a `node`/`bin` path containing a space produces an
      `ExecStart` where each path is a single double-quoted argument; a path
      containing a literal `%` renders it as `%%` (not an expandable specifier); a
      backslash and a `"` are escaped as `\\` and `\"`.
- [ ] launchd/plist output for a normal path is byte-identical to before; the
      systemd inline test is updated to the quoted `ExecStart` form.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "generators|scheduler"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Windows Task Scheduler XML escaping — separate; not flagged here.
- The `ensureEntry` "unchanged" vs OS-loaded probe (scheduler #5) — covered by
  WP-070's doctor/digest health check (Done).
- Scheduler mutation fail-loud on secondary calls / `remove()` reporting — **WP-098**.

## Round-2 dispositions

- **Codex round-2 P1 (`systemdQuote` does not escape systemd specifier
  expansion):** RESOLVED. `systemdQuote` now escapes `%`→`%%` (before the `"`
  escape) in addition to quoting, so a literal `%` in an install path is not expanded
  as a systemd specifier even inside the quoted `ExecStart`. Acceptance/test cases
  extended to `%`, backslash, and quote (not only spaces). launchd/plist is
  unaffected (it does no specifier expansion).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/097-scheduler-generator-path-escaping`; conventional commits; PR
   titled `fix(scheduler): escape plist and systemd path values (WP-097)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
