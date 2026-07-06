---
id: WP-063
title: Windows Task Scheduler XML generators (pure renderers + name/path helpers)
status: In-Review
model: opus
size: M
depends_on: []
adrs: [ADR-0018, ADR-0013, ADR-0004]
branch: wp/063-windows-task-scheduler-generators
---

# WP-063: Windows Task Scheduler XML generators (pure renderers + name/path helpers)

## Context (read this, nothing else)

`src/scheduler/generators.js` holds the **pure text renderers and path helpers**
for OS-native scheduler entries. It already renders macOS launchd plists
(`launchdPlist`, `catchupPlist`) and Linux systemd units (`systemdTimer`,
`systemdService`), plus helpers (`nodePath`, `wienerdogBin`, `parseAt`,
`launchdLabel`, `systemdUnitBase`, …). The dispatch layer (`schedule.js`) calls
these; this file itself performs no registration.

Wienerdog is adding **Windows scheduled dreaming** (ADR-0018). On Windows the
schedule is a **Task Scheduler task** registered from an **XML definition** via
`schtasks /create /tn <name> /xml <file> /f`. This WP adds the pure Windows XML
**renderers** and the name/path helpers — the exact launchd/systemd analog. It
performs no registration and touches no other file; the dispatch that consumes
these lands in WP-064.

Why XML (not `schtasks` scheduling flags): only XML can set
`StartWhenAvailable` (fire a missed run when the machine returns) and, critically,
`DisallowStartIfOnBatteries`/`StopIfGoingOnBatteries` — whose **defaults are
`true`**, which would **skip or kill the 03:30 dream on an unplugged laptop**.
XML's `<Command>`/`<Arguments>` split also avoids `/tr` quoting hazards (e.g. a
Windows profile path with a space: `C:\Users\John Smith\.wienerdog\…`).

Design invariants this WP must honor (ADR-0018):
- **Per-user, no elevation:** `LogonType=InteractiveToken` + `RunLevel=LeastPrivilege`.
  The task runs only while the user is logged on (the accepted macOS-LaunchAgent
  posture); missed runs are covered by a catch-up task.
- **Two tasks** namespaced under a `\Wienerdog\` task folder: a **daily** dream
  task and an **ONLOGON + hourly catch-up** task calling `run-job --catch-up`.
- **Stable vendored bin** (ADR-0013): the action targets
  `<core>\app\current\bin\wienerdog.js` through the `current` symlink, via
  `wienerdogBin(paths)` — version-independent.

## Current state

`src/scheduler/generators.js` exists. Relevant existing exports you build beside:

- `nodePath()` → `process.execPath` (absolute node path).
- `wienerdogBin(paths)` → the stable vendored `…\app\current\bin\wienerdog.js`.
- `parseAt(at)` → `{hour, minute}` (validates 24-h `HH:MM`).
- `pad2(n)` → zero-padded 2-digit string (module-local; reuse it).
- `launchdLabel(name)` / `systemdUnitBase(name)` — the naming analogs.

The renderers return a full string; the test file
(`tests/unit/scheduler-generators.test.js`) asserts the whole string inline
against an `EXPECTED_*` constant (there is no golden-file dir). Match that style.

Nothing Windows exists yet in this file. You are creating the Windows helpers and
renderers.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/generators.js | add Windows helpers + two XML renderers; export them |
| modify | tests/unit/scheduler-generators.test.js | inline `EXPECTED_*` assertions for both renderers + helper tests |

### Exact contracts

Add these functions and export every one of them.

**`windowsTaskName(name)`** → the namespaced Task Scheduler path.
```js
/** 'dream' → '\\Wienerdog\\dream'. Validates `name` (defense in depth — it flows
 *  into schtasks argv and the XML <URI>): must match /^[a-z0-9][a-z0-9-]*$/,
 *  else throw WienerdogError. */
function windowsTaskName(name) // returns e.g. '\Wienerdog\dream'
```
(The stored/displayed string uses a single backslash separator: `\Wienerdog\dream`.)

**`windowsTasksDir(paths)`** → `path.join(paths.core, 'schedules')` — the dir
where the XML artifacts live (manifest-tracked; reversed with the entry).

**`windowsTaskFileName(name)`** → `` `wienerdog-${name}.xml` `` (basename only;
WP-064's `remove()` matches on this).

**`windowsTaskFile(paths, name)`** →
`path.join(windowsTasksDir(paths), windowsTaskFileName(name))`.

**`windowsCurrentUserId(env = process.env)`** → the XML `<UserId>` for the
current user: `` `${env.USERDOMAIN}\\${env.USERNAME}` `` when both are present,
else `env.USERNAME || ''`. (Task Scheduler resolves a bare username to the local
account; the domain-qualified form is preferred when available.)

**`windowsXmlEscape(s)`** → escape `&`, `<`, `>`, `"`, `'` for XML text/attribute
content (`&amp; &lt; &gt; &quot; &apos;`). Apply to every interpolated path,
user id, and description before it enters the XML. Module-local is fine but
export it (the test asserts a space-containing path is embedded intact).

**`windowsDreamTaskXml(o)`** — the daily dream task. `@param {{name:string,
hour:number, minute:number, node:string, bin:string, userId:string}} o`.
Returns exactly (all interpolations XML-escaped; `${pad2(o.hour)}` /
`${pad2(o.minute)}`; `<Arguments>` embeds the bin path **double-quoted**):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Wienerdog</Author>
    <Description>Wienerdog nightly dream (memory consolidation).</Description>
    <URI>\Wienerdog\${o.name}</URI>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2020-01-01T${pad2(o.hour)}:${pad2(o.minute)}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${escaped userId}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <Enabled>true</Enabled>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escaped node}</Command>
      <Arguments>"${escaped bin}" run-job ${o.name}</Arguments>
    </Exec>
  </Actions>
</Task>
```
End the string with a trailing newline (match the plist renderers).

**`windowsCatchupTaskXml(o)`** — the catch-up task (ONLOGON + hourly).
`@param {{node:string, bin:string, userId:string}} o`. Returns exactly:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Wienerdog</Author>
    <Description>Wienerdog catch-up: runs any dream missed while off or logged off.</Description>
    <URI>\Wienerdog\catchup</URI>
  </RegistrationInfo>
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
  <Principals>
    <Principal id="Author">
      <UserId>${escaped userId}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <Enabled>true</Enabled>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escaped node}</Command>
      <Arguments>"${escaped bin}" run-job --catch-up</Arguments>
    </Exec>
  </Actions>
</Task>
```
The catch-up task name is the fixed literal `catchup` (`\Wienerdog\catchup`).

## Implementation notes & constraints

- No new npm deps. Plain Node ≥ 18, JSDoc types only. Pure functions: no fs, no
  spawn, no `process.platform` reads inside the renderers (the caller decides
  platform). `windowsCurrentUserId` may read `process.env` via its `env` param
  default, mirroring `systemdUserDir(home, env)`.
- **Encoding decision (recorded):** the XML declares `encoding="UTF-8"` and the
  file is written UTF-8 by WP-064, so the `ensureEntry` content-hash idempotency
  (which reads the file back as `utf8` and string-compares) stays clean. Modern
  `schtasks /create /xml` accepts UTF-8 task XML. **Contingency (do NOT implement
  now, note only):** if the owner's VPS run finds `schtasks` rejects UTF-8, the
  fix is a follow-up WP that writes UTF-16LE+BOM and switches this entry's hash
  to a binary hash — flagged on WP-064's manual checklist, not this WP's problem.
- The `StartBoundary` date is a fixed past date (`2020-01-01`) so the daily
  trigger is active immediately; only the time-of-day varies. This is standard
  Task Scheduler practice (a past StartBoundary on a daily schedule = "every day
  at this time from now on").
- Match the existing renderers' formatting exactly (2-space XML indentation as
  shown, trailing newline). The test asserts the whole string; whitespace counts.
- When uncertain: choose the simpler option and record it under "Decisions made".
  Do NOT expand scope.

## Security checklist

- [ ] `name` flows into `windowsTaskName`, the `<URI>`, and (via WP-064) a
      `schtasks` argv. `windowsTaskName` **fully anchors** the JS check
      `/^[a-z0-9][a-z0-9-]*$/` (start+end anchored; JS `$` without `m` is a true
      end-anchor — safe here) and rejects anything else with `WienerdogError`, so
      `/`, `\`, `..`, spaces, and quotes can never reach the task path or argv.
      (Production only ever passes the literals `dream`/`catchup`; the guard is
      defense in depth for the `schedule add <name>` path in WP-064.)
- [ ] Every interpolated path / userId / description is run through
      `windowsXmlEscape` before entering the XML, so a profile path containing
      `&` or a space cannot break the document or the `<Arguments>` quoting
      (the bin path is additionally wrapped in double quotes inside `<Arguments>`).

## Acceptance criteria

- [ ] `windowsTaskName('dream')` === `'\\Wienerdog\\dream'`; `windowsTaskName('a_b')`
      and `windowsTaskName('../x')` each throw `WienerdogError`.
- [ ] `windowsTaskFile(paths,'dream')` ends with
      `…${sep}schedules${sep}wienerdog-dream.xml` under `paths.core`.
- [ ] `windowsCurrentUserId({USERDOMAIN:'WS',USERNAME:'ada'})` === `'WS\\ada'`;
      with only `USERNAME` set → `'ada'`.
- [ ] `windowsDreamTaskXml({name:'dream',hour:3,minute:30,node:'C:\\…\\node.exe',
      bin:'C:\\Users\\John Smith\\.wienerdog\\app\\current\\bin\\wienerdog.js',
      userId:'WS\\ada'})` equals the literal XML above with `03:30:00`, the
      double-quoted space-containing bin path intact, and `run-job dream`.
- [ ] `windowsCatchupTaskXml(...)` equals the literal catch-up XML above with
      `run-job --catch-up` and both a `LogonTrigger` and an hourly `TimeTrigger`.
- [ ] `DisallowStartIfOnBatteries`/`StopIfGoingOnBatteries` are `false` and
      `StartWhenAvailable` is `true` in both renderers (assert their presence).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern generators
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any registration / `schtasks` spawn / fs write / manifest work — WP-064.
- `registerPlatform`, `ensureDreamSchedule`, `remove()` — WP-064 (`schedule.js`).
- `run-job.js` clean-env/watchdog — WP-062.
- The UTF-16 encoding contingency (note only; a later WP if the VPS run needs it).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch from frontmatter; conventional commits; PR titled
   `feat(scheduler): Windows Task Scheduler XML generators (WP-063)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
