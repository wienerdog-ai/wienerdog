---
id: WP-074
title: Windows task XML — write UTF-16 LE so schtasks accepts it; drop the LogonTrigger it can't register unprivileged
status: Done
model: opus
size: M
depends_on: []
adrs: [ADR-0018, ADR-0004]
branch: wp/074-windows-task-xml-utf16-drop-logontrigger
---

# WP-074: Windows task XML — write UTF-16 LE so schtasks accepts it; drop the LogonTrigger it can't register unprivileged

## Context (read this, nothing else)

Wienerdog schedules the nightly dream on Windows through the OS-native Task Scheduler,
registered per-user with **no elevation** (ADR-0018): a `\Wienerdog\dream` task (daily
03:30) and a `\Wienerdog\catchup` task (missed-run recovery). Registration writes an
XML file to `~/.wienerdog/schedules/wienerdog-<name>.xml` and runs
`schtasks /create /tn "\Wienerdog\<name>" /xml <file> /f`. The XML is produced by two
pure renderers in `src/scheduler/generators.js`: `windowsDreamTaskXml` and
`windowsCatchupTaskXml`. Product invariant: Wienerdog is just files; no daemon
(ADR-0004). These are OS-native scheduled tasks, not a background process.

The first external Windows tester (Windows 11 Pro, hu-HU, non-elevated, Developer Mode
OFF, wienerdog 0.6.4) found two hard defects that make Windows scheduling silently fail
on a stock machine:

**Defect A — encoding.** The renderers emit the XML declaration `encoding="UTF-8"` and
the file is written as UTF-8 bytes. `schtasks /create /xml` **rejects** it. Reproduced
on hu-HU:

```
schtasks /create /tn "\Wienerdog\dream" /xml "...\schedules\wienerdog-dream.xml" /f
ERROR: A feladat XML-kódja hibás.
(1,40)::HIBA: nem lehet átváltani a kódolást
```

("The task XML is malformed. (1,40): ERROR: cannot convert the encoding." Position
(1,40) is the `encoding="UTF-8"` declaration.) Task Scheduler's canonical task XML is
**UTF-16**. The tester's workaround (change the declaration to `encoding="UTF-16"` and
pass the resulting .NET string to `Register-ScheduledTask`) succeeded — but that path
hands a UTF-16-in-memory string to a COM API. Our path writes a **file** that `schtasks`
reads from disk, so the file's *bytes* must be UTF-16 LE with a BOM and a matching
`encoding="UTF-16"` declaration. (The tester could not verify whether an en-US machine
accepts the current UTF-8 file; UTF-16 LE + BOM is the encoding Task Scheduler exports
and accepts on every locale, so it is the safe universal fix.)

**Defect B — the catchup task's `<LogonTrigger>`.** Registering the shipped catchup XML
from a non-elevated shell fails with `Access denied` (HRESULT 0x80070005). The `dream`
task — identical principal (`InteractiveToken`, `LeastPrivilege`), no logon trigger —
registers fine from the same shell. **A logon-trigger task requires admin rights to
create.** This breaks the README's "no admin rights" promise. The catchup task also
carries an hourly `TimeTrigger` with `StartWhenAvailable=true`, which already recovers a
missed dream shortly after the machine/user is next available. Dropping the
`<LogonTrigger>` makes the catchup task registrable unprivileged; the cost is that
catch-up after a logon lags up to ~1h (the next hourly tick) instead of firing at logon
— which is exactly the "within an hour" guarantee Wienerdog already advertises
(WP-020/WP-066) and matches ADR-0018's own statement that "the ONLOGON+hourly catch-up
is the real safety net" (here: the hourly half is the safety net).

Both defects are decided here: **write the files as UTF-16 LE + BOM**, and **drop the
`<LogonTrigger>` from the Windows catchup task**. Defect B is a durable change to
ADR-0018 point 2 (which specified ONLOGON + hourly), recorded as an ADR-0018 amendment
in this WP.

## Current state

### `src/scheduler/generators.js`

`windowsDreamTaskXml(o)` (lines 283–324) and `windowsCatchupTaskXml(o)` (lines 332–377)
are pure string renderers. Both begin with:

```js
return `<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
```

`windowsCatchupTaskXml`'s `<Triggers>` block (exact current code):

```js
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
    <TimeTrigger>
      <StartBoundary>2020-01-01T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <Repetition>
        <Interval>PT1H</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </TimeTrigger>
  </Triggers>
```

There is **no** bytes-encoding helper yet. The module exports (lines 437–459) list each
function individually.

### `src/cli/schedule.js`

`ensureEntry(manifest, filePath, content, unload)` (lines 76–91) is the shared writer
for launchd/systemd/Windows scheduler files. Exact current code:

```js
function ensureEntry(manifest, filePath, content, unload) {
  const identical = isFile(filePath) && fs.readFileSync(filePath, 'utf8') === content;
  const hasEntry = manifest.entries.some(
    (e) => e.kind === 'scheduler-entry' && e.path === filePath
  );
  if (identical && hasEntry) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  if (!hasEntry) { /* record scheduler-entry */ }
  return true;
}
```

It reads/writes as UTF-8-implicit strings. It is called with **string** content by the
launchd (`registerPlatform` darwin), systemd (`registerPlatform` linux), macOS catchup
(`ensureCatchup`), Windows dream (`registerPlatform` win32, line ~193–202), and Windows
catchup (`ensureWindowsCatchup`, line 121–126) paths.

Windows call sites today (exact):

```js
// registerPlatform win32 (lines 193–203)
const content = gen.windowsDreamTaskXml({ name: o.name, hour: o.hour, minute: o.minute, node, bin, userId });
const unload = ['schtasks', '/delete', '/tn', taskName, '/f'];
const changed = ensureEntry(manifest, dreamXmlPath, content, unload);
if (changed) loader(['schtasks', '/create', '/tn', taskName, '/xml', dreamXmlPath, '/f']);

// ensureWindowsCatchup (lines 119–128)
const content = gen.windowsCatchupTaskXml({ node: gen.nodePath(), bin: gen.wienerdogBin(paths), userId });
const xmlPath = gen.windowsTaskFile(paths, 'catchup');
...
if (ensureEntry(manifest, xmlPath, content, unload)) {
  loader(['schtasks', '/create', '/tn', taskName, '/xml', xmlPath, '/f']);
}
```

### `tests/unit/scheduler-generators.test.js`

Holds inline goldens `EXPECTED_DREAM` (line 88) and `EXPECTED_WIN_CATCHUP` (line 129),
both starting `encoding="UTF-8"`, `EXPECTED_WIN_CATCHUP` containing the `<LogonTrigger>`
block. Tests at lines 292–330 assert the renderers match byte-for-byte and that catchup
output matches `/<LogonTrigger>/`.

### `docs/adr/0018-windows-scheduled-dreaming.md`

Decision point 2 specifies `\Wienerdog\catchup` = "ONLOGON trigger + hourly
`Repetition (PT1H)`". This WP amends it.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/generators.js | both win renderers' declaration → `encoding="UTF-16"`; remove `<LogonTrigger>` block from `windowsCatchupTaskXml`; add + export `windowsTaskXmlBytes(xml)` returning a UTF-16 LE + BOM Buffer |
| modify | src/cli/schedule.js | make `ensureEntry` accept `string\|Buffer` content (byte-wise compare + write); win32 dream + catchup call sites wrap the renderer string in `gen.windowsTaskXmlBytes(...)` before `ensureEntry` |
| modify | tests/unit/scheduler-generators.test.js | update `EXPECTED_DREAM` + `EXPECTED_WIN_CATCHUP` goldens (declaration; drop LogonTrigger); invert the `/<LogonTrigger>/` assertion to `assert.doesNotMatch`; add a `windowsTaskXmlBytes` test asserting the exact leading BOM bytes + round-trip decode |
| modify | tests/unit/scheduler-schedule.test.js | assert the win32 register/catchup path writes a UTF-16-LE-BOM file to disk (leading bytes `0xFF 0xFE`) and that a byte-identical second run is idempotent (`ensureEntry` returns false) |
| modify | docs/adr/0018-windows-scheduled-dreaming.md | append the amendment below (drop LogonTrigger; UTF-16-LE-BOM file encoding) |

### Exact contracts

**1. Renderer declarations.** In BOTH `windowsDreamTaskXml` and
`windowsCatchupTaskXml`, change the first line to:

```xml
<?xml version="1.0" encoding="UTF-16"?>
```

Leave the launchd/systemd renderers (`launchdPlist`, `catchupPlist`, `systemdTimer`,
`systemdService`) at `encoding="UTF-8"` — those files are UTF-8 and unaffected.

**2. Drop the LogonTrigger.** `windowsCatchupTaskXml`'s `<Triggers>` becomes:

```xml
  <Triggers>
    <TimeTrigger>
      <StartBoundary>2020-01-01T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <Repetition>
        <Interval>PT1H</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </TimeTrigger>
  </Triggers>
```

`StartWhenAvailable=true` (already present in `<Settings>`) is what makes the missed
hourly occurrence fire shortly after the machine/user is next available. Do not add or
change any other setting.

**3. Bytes helper.** Add to `generators.js` and export:

```js
/** Encode a Task Scheduler XML string as the bytes schtasks accepts from a file:
 *  UTF-16 LE with a leading BOM (0xFF 0xFE). The declaration must already read
 *  encoding="UTF-16". @param {string} xml @returns {Buffer} */
function windowsTaskXmlBytes(xml) {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);
}
```

**4. `ensureEntry` accepts `string|Buffer`.** Change only its read/compare/write to be
byte-wise (string content stays byte-identical to today — `Buffer.from(str)` defaults to
UTF-8, exactly what `fs.writeFileSync(path, str)` wrote):

```js
function ensureEntry(manifest, filePath, content, unload) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  let identical = false;
  try { identical = fs.readFileSync(filePath).equals(buf); } catch { identical = false; }
  identical = identical && manifest.entries.some(
    (e) => e.kind === 'scheduler-entry' && e.path === filePath);
  const hasEntry = manifest.entries.some(
    (e) => e.kind === 'scheduler-entry' && e.path === filePath);
  if (identical) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
  if (!hasEntry) { /* record scheduler-entry — UNCHANGED */ }
  return true;
}
```
(Keep the existing `hasEntry`/record structure; the only substantive change is
buffer-wise compare + write. Do not alter the manifest-record logic.)

**5. Win32 call sites wrap the string in bytes.** In `registerPlatform` win32:

```js
const content = gen.windowsTaskXmlBytes(gen.windowsDreamTaskXml({ name: o.name, hour: o.hour, minute: o.minute, node, bin, userId }));
```

and in `ensureWindowsCatchup`:

```js
const content = gen.windowsTaskXmlBytes(gen.windowsCatchupTaskXml({ node: gen.nodePath(), bin: gen.wienerdogBin(paths), userId }));
```

The `loader([...schtasks /create...])` argv is unchanged; it points at the file, whose
bytes are now UTF-16 LE + BOM.

**6. ADR-0018 amendment.** Append this section verbatim to
`docs/adr/0018-windows-scheduled-dreaming.md`:

```markdown
## Amendment (2026-07-08): unprivileged catchup (no LogonTrigger) + UTF-16 file encoding

Status: Accepted (amends decision points 1–2). Born from the first external Windows
tester's report (Windows 11 Pro, hu-HU, non-elevated, Developer Mode off, v0.6.4).

1. **The Windows task XML file is written as UTF-16 LE with a BOM**, declaration
   `encoding="UTF-16"`. `schtasks /create /xml <file>` reads the file's bytes and
   rejects UTF-8 (`(1,40): cannot convert the encoding`, reproduced on hu-HU) — Task
   Scheduler's canonical task XML is UTF-16. launchd/systemd files stay UTF-8.

2. **The `\Wienerdog\catchup` task drops its `<LogonTrigger>`; the hourly `TimeTrigger`
   (PT1H) with `StartWhenAvailable=true` is retained as the sole trigger.** A
   logon-trigger task requires **admin rights** to register (0x80070005 Access denied
   from a standard shell), which breaks the elevation-free install promise. The hourly
   trigger + StartWhenAvailable already recovers a dream missed by power-off or logoff
   shortly after the machine/user is next available; the accepted cost is that
   post-logon catch-up can lag up to ~1h (the next hourly tick) instead of firing at
   logon — within Wienerdog's existing "within an hour" catch-up guarantee. This
   supersedes decision point 2's "ONLOGON trigger + hourly" for Windows.
```

### Expected UTF-16 dream file (first bytes)

`windowsTaskXmlBytes(windowsDreamTaskXml(...))` yields a Buffer whose first four bytes
are `0xFF 0xFE 0x3C 0x00` (BOM, then `<` in UTF-16 LE). `buf.slice(2).toString('utf16le')`
round-trips to the exact renderer string.

## Implementation notes & constraints

- **Windows-only encoding.** Only the two `windows*TaskXml` outputs are byte-encoded;
  launchd/systemd stay string/UTF-8. `ensureEntry`'s buffer-awareness is generic but
  byte-neutral for string callers (verify a launchd golden test still passes unchanged).
- **BOM is required.** `Buffer.from(str, 'utf16le')` does NOT prepend a BOM; prepend
  `0xFF 0xFE` explicitly. Without the BOM, `schtasks` may still mis-detect the encoding.
- **Idempotency across the encoding change (update-safety).** On the tester's machine the
  on-disk `wienerdog-dream.xml`/`wienerdog-catchup.xml` are the old UTF-8 bytes. After
  this WP ships, a `wienerdog sync` re-vendors and re-runs `registerPlatform` for the
  `dream` job (which also ensures catchup). The new content is a different byte string
  (UTF-16 + BOM; catchup also loses the LogonTrigger), so `ensureEntry` sees a byte
  mismatch → rewrites the file → `schtasks /create … /f` overwrites the tester's
  hand-registered tasks, **converging his state to the shipped one** (his catchup was
  hand-patched to drop the LogonTrigger, which now matches the shipped XML; his dream
  was hand-registered from a UTF-16 string, which now matches the shipped file). A
  second sync with no version change is a byte-identical no-op (`ensureEntry` → false).
  State this convergence in the PR body.
- **Do not change `describeEntry`/`reloadMissing`/the reload argv** — the reload command
  already just points `schtasks /create … /xml <file>` at the file; the encoding lives
  in the file. (Fail-loud on a failed create is WP-075, which depends on this WP.)
- **No `process.platform` mocking.** The win32 register path is already testable via the
  `platform` argument to `registerPlatform` + an injected loader (existing test seams).
- Zero new dependencies; no build step (CLAUDE.md).

## Security checklist

- [ ] `o.name`, `o.node`, `o.bin`, `o.userId` are already validated/escaped before they
      enter the XML: `registerPlatform` win32 runs `windowsTaskName(o.name)`
      (`^[a-z0-9][a-z0-9-]*$`, throws otherwise) BEFORE rendering, and the renderers
      `windowsXmlEscape` the node/bin/userId. This WP changes only the byte encoding and
      removes a static trigger block — it introduces **no** new interpolated value and
      no new shell/path argument. The BOM bytes and the `'utf16le'` encoding name are
      fixed literals.

## Acceptance criteria

- [ ] `windowsDreamTaskXml(...)` and `windowsCatchupTaskXml(...)` strings start with
      `<?xml version="1.0" encoding="UTF-16"?>`.
- [ ] `windowsCatchupTaskXml(...)` contains **no** `<LogonTrigger>` and retains the
      hourly `<TimeTrigger>`/`PT1H`/`StartWhenAvailable=true`.
- [ ] `windowsTaskXmlBytes(x)` returns a Buffer whose first two bytes are `0xFF 0xFE`
      and whose remainder decodes (`utf16le`) back to `x`.
- [ ] The win32 register + catchup paths write files whose first two bytes are
      `0xFF 0xFE`; a second run is a byte-identical no-op.
- [ ] launchd/systemd goldens and idempotency are unchanged (buffer-awareness is
      byte-neutral for string callers).
- [ ] The ADR-0018 amendment is present.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "generators|schedule"
npm run lint
```

### Manual Windows verification (owner/tester gate — CI has no Windows runner)

CI cannot run `schtasks`. Before merge, on a **stock Windows machine (Developer Mode
OFF, non-elevated shell)** confirm, from a build of this branch:

1. `schtasks /create /tn "\Wienerdog\dream"  /xml "%USERPROFILE%\.wienerdog\schedules\wienerdog-dream.xml"  /f` succeeds (no `(1,40) cannot convert the encoding`).
2. `schtasks /create /tn "\Wienerdog\catchup" /xml "%USERPROFILE%\.wienerdog\schedules\wienerdog-catchup.xml" /f` succeeds with **no** `Access denied`/0x80070005 (LogonTrigger gone).
3. `schtasks /query /tn "\Wienerdog\dream"` and `…\catchup` both show `Ready`.
4. On the tester's existing 0.6.4 machine, a `wienerdog sync` from this build reconciles
   the hand-registered `\Wienerdog\dream` + `\Wienerdog\catchup` to the shipped XML
   (both re-registered via `/f`, catchup now matching the shipped no-LogonTrigger task).

Paste the console output into the PR under "Manual verification". (Prefer confirming on
both hu-HU and, if available, en-US.)

## Out of scope (do NOT do these)

- The junction fix for `repointCurrent` — **WP-073**.
- Making a failed `schtasks /create` surface as an error/alert instead of a false
  success — **WP-075** (depends on this WP; shares `src/cli/schedule.js`).
- Any change to launchd/systemd renderers, the reload/probe argv, or `WakeToRun`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body. The manual
   Windows `schtasks` check is completed (or explicitly deferred to the owner/tester with
   the exact commands above) before merge.
2. Branch from frontmatter; conventional commits; PR titled
   `fix(scheduler): Windows task XML UTF-16 + drop unprivileged LogonTrigger (WP-074)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Done record (2026-07-08)

Merged to main as `1d962eb` (PR #74, squash). Reviewer verdict: approve, zero
findings (BOM tamper-tested; `ensureEntry` convergence edge cases verified;
ADR-0018 amendment byte-identical to this spec). **Manual Windows `schtasks`
gate waived at merge** (WP-058/064 precedent): the named field tester's
post-publish update run — `sync` rewriting his on-disk UTF-8 XML to
UTF-16 LE + BOM and re-registering both tasks (catchup without LogonTrigger) unprivileged
over his hand-registered ones — is the confirming reproduction on hu-HU; confirm
en-US separately if a machine is available.

**Gate CLOSED 2026-07-08** (`userreports/wienerdog-sync-and-tasks-2026-07-08.md`):
the tester's 0.6.4→0.6.5 `sync` (hu-HU, non-elevated) re-rendered both task XMLs
(byte-compare vs his on-disk UTF-8 originals → rewrite as UTF-16 LE + BOM) and
re-registered both via `schtasks /create /f` with zero WP-075 notices — i.e.
schtasks accepted the UTF-16 files and the no-LogonTrigger catchup registered
unprivileged. `schtasks /query /v` confirms both tasks `Ready` under `\Wienerdog`,
catchup hourly-only, dream daily 03:30. en-US still unverified (no machine).
