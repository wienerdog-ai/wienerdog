'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const gen = require('../../src/scheduler/generators');
const { WienerdogError } = require('../../src/core/errors');

// WP-157: OS entries invoke the out-of-tree launcher with a descriptor path +
// expect-digest, not the app bin directly. Shared fixtures for the goldens.
const LAUNCHER = '/opt/wienerdog/launcher/launch.js';
const DESC = '/opt/wienerdog/state/descriptors/daily-digest.json';
const DIGEST = 'sha256:deadbeef';
// WP-157 F8/A10/R4: every OS entry binds the scheduled env (clears the code-
// loading Node vars + ambient cred/config roots, binds the authorized HOME).
const HOME = '/Users/ada';

const EXPECTED_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.wienerdog.daily-digest</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/opt/wienerdog/launcher/launch.js</string>
    <string>daily-digest</string>
    <string>--descriptor</string>
    <string>/opt/wienerdog/state/descriptors/daily-digest.json</string>
    <string>--expect-digest</string>
    <string>sha256:deadbeef</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>/Users/ada</string>
    <key>NODE_OPTIONS</key>
    <string></string>
    <key>NODE_PATH</key>
    <string></string>
    <key>CLAUDE_CONFIG_DIR</key>
    <string></string>
    <key>CODEX_HOME</key>
    <string></string>
    <key>ANTHROPIC_API_KEY</key>
    <string></string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>7</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/ada/.wienerdog/logs/daily-digest/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/ada/.wienerdog/logs/daily-digest/launchd.err.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`;

const EXPECTED_CATCHUP = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.wienerdog.catchup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/opt/wienerdog/launcher/launch.js</string>
    <string>--catch-up</string>
    <string>--expect-digest</string>
    <string>sha256:deadbeef</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>/Users/ada</string>
    <key>NODE_OPTIONS</key>
    <string></string>
    <key>NODE_PATH</key>
    <string></string>
    <key>CLAUDE_CONFIG_DIR</key>
    <string></string>
    <key>CODEX_HOME</key>
    <string></string>
    <key>ANTHROPIC_API_KEY</key>
    <string></string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/ada/.wienerdog/logs/catchup/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/ada/.wienerdog/logs/catchup/launchd.err.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`;

const EXPECTED_TIMER = `[Unit]
Description=Wienerdog job: daily-digest

[Timer]
OnCalendar=*-*-* 07:00:00
Persistent=true

[Install]
WantedBy=timers.target
`;

const EXPECTED_SERVICE = `[Unit]
Description=Wienerdog job: daily-digest

[Service]
Type=oneshot
Environment=HOME="/Users/ada"
Environment=NODE_OPTIONS=
Environment=NODE_PATH=
Environment=CLAUDE_CONFIG_DIR=
Environment=CODEX_HOME=
Environment=ANTHROPIC_API_KEY=
ExecStart="/usr/bin/node" "/opt/wienerdog/launcher/launch.js" daily-digest --descriptor "/opt/wienerdog/state/descriptors/daily-digest.json" --expect-digest sha256:deadbeef
`;

const EXPECTED_DREAM = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Wienerdog</Author>
    <Description>Wienerdog nightly dream (memory consolidation).</Description>
    <URI>\\Wienerdog\\dream</URI>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2020-01-01T03:30:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>WS\\ada</UserId>
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
      <Command>C:\\Users\\John Smith\\.wienerdog\\schedules\\wienerdog-dream.cmd</Command>
    </Exec>
  </Actions>
</Task>
`;

const EXPECTED_WIN_CATCHUP = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Wienerdog</Author>
    <Description>Wienerdog catch-up: runs any dream missed while off or logged off.</Description>
    <URI>\\Wienerdog\\catchup</URI>
  </RegistrationInfo>
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
  <Principals>
    <Principal id="Author">
      <UserId>WS\\ada</UserId>
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
      <Command>C:\\Users\\John Smith\\.wienerdog\\schedules\\wienerdog-catchup.cmd</Command>
    </Exec>
  </Actions>
</Task>
`;

test('scheduler-generators: launchdPlist matches the golden byte-for-byte', () => {
  const out = gen.launchdPlist({
    name: 'daily-digest',
    hour: 7,
    minute: 0,
    node: '/usr/local/bin/node',
    launcher: LAUNCHER,
    descriptor: DESC,
    expectDigest: DIGEST,
    home: HOME,
    logDir: '/Users/ada/.wienerdog/logs/daily-digest',
  });
  assert.equal(out, EXPECTED_PLIST);
});

test('scheduler-generators: catchupPlist matches the golden byte-for-byte', () => {
  const out = gen.catchupPlist({
    node: '/usr/local/bin/node',
    launcher: LAUNCHER,
    expectDigest: DIGEST,
    home: HOME,
    logDir: '/Users/ada/.wienerdog/logs/catchup',
  });
  assert.equal(out, EXPECTED_CATCHUP);
});

// WP-catchup-per-job-authorization: the catch-up entry binds the per-job digest MAP as a
// base64url `--job-digests` token (macOS + Windows). The map is the loaded-state
// authorization anchor; the run-job runner decodes + union-authorizes against it.

test('scheduler-generators: encodeJobDigests → decodeJobDigests round-trips a canonical, key-sorted map', () => {
  const map = { dream: `sha256:${'a'.repeat(64)}`, backup: `sha256:${'b'.repeat(64)}` };
  const token = gen.encodeJobDigests(map);
  // base64url: no +/=, no XML/shell metacharacters — safe as one argv value.
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  // Canonical: keys sorted regardless of insertion order → deterministic token.
  assert.equal(token, gen.encodeJobDigests({ backup: map.backup, dream: map.dream }));
  const decoded = gen.decodeJobDigests(token);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.map, map);
});

test('scheduler-generators: catchupPlist binds --job-digests when a map token is supplied', () => {
  const token = gen.encodeJobDigests({ dream: `sha256:${'c'.repeat(64)}` });
  const out = gen.catchupPlist({
    node: '/usr/local/bin/node',
    launcher: LAUNCHER,
    expectDigest: DIGEST,
    jobDigests: token,
    home: HOME,
    logDir: '/Users/ada/.wienerdog/logs/catchup',
  });
  assert.match(out, /<string>--job-digests<\/string>/, 'the map flag is present');
  assert.match(out, new RegExp(`<string>${token}</string>`), 'the exact bound token is present');
  // Round-trips back to the map the launcher forwards to the catch-up runner.
  const between = out.slice(out.indexOf('--job-digests'));
  const bound = between.match(/<string>([A-Za-z0-9_-]+)<\/string>/)[1];
  assert.deepEqual(gen.decodeJobDigests(bound).map, { dream: `sha256:${'c'.repeat(64)}` });
});

test('scheduler-generators: the Windows catch-up wrapper carries --job-digests bare (base64url is metachar-free)', () => {
  const token = gen.encodeJobDigests({ dream: `sha256:${'d'.repeat(64)}` });
  const w = gen.windowsLauncherWrapper({
    node: 'C:\\node.exe',
    launcher: 'C:\\wd\\launch.js',
    home: 'C:\\Users\\ada',
    launchArgs: ['--catch-up', '--expect-digest', DIGEST, '--job-digests', token],
  });
  // base64url matches the wrapper's safe-charset test, so the token is UNQUOTED.
  assert.match(w, new RegExp(`--job-digests ${token}(\\r\\n|$)`));
});

test('scheduler-generators: decodeJobDigests fails closed on malformed / oversized / shape-invalid input (never throws)', () => {
  // Not base64url.
  assert.equal(gen.decodeJobDigests('not base64url !!!').ok, false);
  // Absent.
  assert.equal(gen.decodeJobDigests(undefined).ok, false);
  assert.equal(gen.decodeJobDigests('').ok, false);
  // Valid base64url but not a JSON object.
  assert.equal(gen.decodeJobDigests(Buffer.from('[1,2,3]', 'utf8').toString('base64url')).ok, false);
  assert.equal(gen.decodeJobDigests(Buffer.from('"x"', 'utf8').toString('base64url')).ok, false);
  // Object with a non-digest value.
  assert.equal(gen.decodeJobDigests(Buffer.from('{"dream":"nope"}', 'utf8').toString('base64url')).ok, false);
  // Object with an invalid job name.
  assert.equal(gen.decodeJobDigests(Buffer.from(`{"../evil":"sha256:${'a'.repeat(64)}"}`, 'utf8').toString('base64url')).ok, false);
  // Oversized token (> cap) — refused before any decode.
  const huge = 'A'.repeat(gen.JOB_DIGESTS_MAX_BYTES + 1);
  assert.equal(gen.decodeJobDigests(huge).ok, false);
  // Empty map is VALID (a real empty registration → refuse-all at catch-up).
  assert.deepEqual(gen.decodeJobDigests(gen.encodeJobDigests({})).map, {});
});

test('scheduler-generators: systemdTimer matches the golden byte-for-byte', () => {
  assert.equal(gen.systemdTimer({ name: 'daily-digest', hour: 7, minute: 0 }), EXPECTED_TIMER);
});

test('scheduler-generators: systemdService matches the golden byte-for-byte', () => {
  assert.equal(
    gen.systemdService({
      name: 'daily-digest',
      node: '/usr/bin/node',
      launcher: LAUNCHER,
      descriptor: DESC,
      expectDigest: DIGEST,
      home: HOME,
    }),
    EXPECTED_SERVICE
  );
});

test('scheduler-generators: xmlEscape escapes & < > in that order', () => {
  assert.equal(gen.xmlEscape('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
  // a bare & must become &amp; and not be re-mangled by the later </> passes.
  assert.equal(gen.xmlEscape('&<>'), '&amp;&lt;&gt;');
});

test('scheduler-generators: launchdPlist XML-escapes node/launcher/logDir path values', () => {
  const out = gen.launchdPlist({
    name: 'daily-digest',
    hour: 7,
    minute: 0,
    node: '/opt/a&b/node',
    launcher: '/opt/<wienerdog>/wienerdog.js',
    descriptor: DESC,
    expectDigest: DIGEST,
    home: HOME,
    logDir: '/var/log/a&b<c>d',
  });
  assert.match(out, /<string>\/opt\/a&amp;b\/node<\/string>/);
  assert.match(out, /<string>\/opt\/&lt;wienerdog&gt;\/wienerdog\.js<\/string>/);
  assert.match(out, /<string>\/var\/log\/a&amp;b&lt;c&gt;d\/launchd\.out\.log<\/string>/);
  assert.match(out, /<string>\/var\/log\/a&amp;b&lt;c&gt;d\/launchd\.err\.log<\/string>/);
  // well-formed: every & is part of a recognized entity, and no bare < or > remain
  // outside of the plist's own tags (the interpolated values contain none).
  assert.doesNotMatch(out, /&(?!amp;|lt;|gt;)/);
});

test('scheduler-generators: catchupPlist XML-escapes node/launcher/logDir path values', () => {
  const out = gen.catchupPlist({
    node: '/opt/a&b/node',
    launcher: '/opt/<wienerdog>/wienerdog.js',
    expectDigest: DIGEST,
    home: HOME,
    logDir: '/var/log/a&b<c>d',
  });
  assert.match(out, /<string>\/opt\/a&amp;b\/node<\/string>/);
  assert.match(out, /<string>\/opt\/&lt;wienerdog&gt;\/wienerdog\.js<\/string>/);
  assert.match(out, /<string>\/var\/log\/a&amp;b&lt;c&gt;d\/launchd\.out\.log<\/string>/);
  assert.match(out, /<string>\/var\/log\/a&amp;b&lt;c&gt;d\/launchd\.err\.log<\/string>/);
  assert.doesNotMatch(out, /&(?!amp;|lt;|gt;)/);
});

test('scheduler-generators: launchdPlist is byte-identical to the golden for a normal path (no special chars)', () => {
  const out = gen.launchdPlist({
    name: 'daily-digest',
    hour: 7,
    minute: 0,
    node: '/usr/local/bin/node',
    launcher: LAUNCHER,
    descriptor: DESC,
    expectDigest: DIGEST,
    home: HOME,
    logDir: '/Users/ada/.wienerdog/logs/daily-digest',
  });
  assert.equal(out, EXPECTED_PLIST);
});

test('scheduler-generators: systemdQuote double-quotes and escapes \\, %, and " (order: \\ before ")', () => {
  assert.equal(gen.systemdQuote('/opt/wienerdog/bin/wienerdog.js'), '"/opt/wienerdog/bin/wienerdog.js"');
  assert.equal(gen.systemdQuote('/opt/with space/node'), '"/opt/with space/node"');
  assert.equal(gen.systemdQuote('/opt/100%dir/node'), '"/opt/100%%dir/node"');
  assert.equal(gen.systemdQuote('C:\\path\\node.exe'), '"C:\\\\path\\\\node.exe"');
  assert.equal(gen.systemdQuote('/opt/"quoted"/node'), '"/opt/\\"quoted\\"/node"');
  // kitchen sink: space + % + backslash + " all in one path.
  const rawPath = '/opt/wien er/100%\\path"quote';
  const expectedQuoted = '"/opt/wien er/100%%\\\\path\\"quote"';
  assert.equal(gen.systemdQuote(rawPath), expectedQuoted);
});

test('scheduler-generators: systemdService quotes ExecStart paths and escapes %, \\, ", and spaces', () => {
  const node = '/opt/with space/100%node\\path"x';
  const launcher = '/opt/wienerdog/launcher/launch.js';
  const out = gen.systemdService({ name: 'daily-digest', node, launcher, descriptor: DESC, expectDigest: DIGEST, home: HOME });
  const expectedExecStart = `ExecStart=${gen.systemdQuote(node)} ${gen.systemdQuote(launcher)} daily-digest --descriptor ${gen.systemdQuote(DESC)} --expect-digest ${DIGEST}`;
  assert.ok(out.includes(expectedExecStart), out);
  // the literal % must render doubled (%%), never a bare specifier-expandable %.
  assert.match(out, /100%%node/);
  assert.doesNotMatch(out, /100%node/);
});

test('scheduler-generators: systemdService ExecStart matches the golden (quoted form) for a normal path', () => {
  assert.equal(
    gen.systemdService({
      name: 'daily-digest',
      node: '/usr/bin/node',
      launcher: LAUNCHER,
      descriptor: DESC,
      expectDigest: DIGEST,
      home: HOME,
    }),
    EXPECTED_SERVICE
  );
});

test('scheduler-generators: systemd OnCalendar zero-pads single-digit hour/minute', () => {
  const timer = gen.systemdTimer({ name: 'x', hour: 3, minute: 5 });
  assert.match(timer, /^OnCalendar=\*-\*-\* 03:05:00$/m);
});

test('scheduler-generators: parseAt maps HH:MM to hour/minute', () => {
  assert.deepEqual(gen.parseAt('03:30'), { hour: 3, minute: 30 });
  assert.deepEqual(gen.parseAt('00:00'), { hour: 0, minute: 0 });
  assert.deepEqual(gen.parseAt('23:59'), { hour: 23, minute: 59 });
  assert.deepEqual(gen.parseAt('7:00'), { hour: 7, minute: 0 });
});

test('scheduler-generators: parseAt throws WienerdogError on invalid input', () => {
  for (const bad of ['24:00', '12:60', '7', '7:5', 'ab:cd', '', '25:00', '12:99']) {
    assert.throws(() => gen.parseAt(bad), WienerdogError, `expected throw for ${JSON.stringify(bad)}`);
  }
});

test('scheduler-generators: path/label helpers', () => {
  assert.equal(gen.launchdLabel('daily-digest'), 'ai.wienerdog.daily-digest');
  assert.equal(gen.systemdUnitBase('daily-digest'), 'wienerdog-daily-digest');
  assert.equal(gen.launchAgentsDir('/home/ada'), '/home/ada/Library/LaunchAgents');
  assert.equal(
    gen.systemdUserDir('/home/ada', {}),
    '/home/ada/.config/systemd/user'
  );
  assert.equal(
    gen.systemdUserDir('/home/ada', { XDG_CONFIG_HOME: '/xdg' }),
    '/xdg/systemd/user'
  );
});

test('scheduler-generators: nodePath/wienerdogBin are absolute', () => {
  const path = require('node:path');
  const { getPaths } = require('../../src/core/paths');
  const paths = getPaths({ HOME: '/home/ada', WIENERDOG_HOME: '/home/ada/.wienerdog' });
  assert.ok(path.isAbsolute(gen.nodePath()));
  assert.ok(path.isAbsolute(gen.wienerdogBin(paths)));
  assert.ok(gen.wienerdogBin(paths).endsWith(path.join('bin', 'wienerdog.js')));
  // wienerdogBin targets the STABLE app/current entry (ADR-0013), not the running copy.
  assert.equal(
    gen.wienerdogBin(paths),
    path.join('/home/ada/.wienerdog', 'app', 'current', 'bin', 'wienerdog.js')
  );
});

test('scheduler-generators: windowsTaskName namespaces and validates', () => {
  assert.equal(gen.windowsTaskName('dream'), '\\Wienerdog\\dream');
  assert.equal(gen.windowsTaskName('catchup'), '\\Wienerdog\\catchup');
  assert.equal(gen.windowsTaskName('a-b0'), '\\Wienerdog\\a-b0');
  for (const bad of ['a_b', '../x', 'A', '-a', '', 'a b', 'a\\b', 'a/b', 'a.b', '..']) {
    assert.throws(() => gen.windowsTaskName(bad), WienerdogError, `expected throw for ${JSON.stringify(bad)}`);
  }
});

test('scheduler-generators: windows path helpers', () => {
  const path = require('node:path');
  const { getPaths } = require('../../src/core/paths');
  const paths = getPaths({ HOME: '/home/ada', WIENERDOG_HOME: '/home/ada/.wienerdog' });
  assert.equal(gen.windowsTaskFileName('dream'), 'wienerdog-dream.xml');
  assert.equal(gen.windowsTasksDir(paths), path.join(paths.core, 'schedules'));
  const f = gen.windowsTaskFile(paths, 'dream');
  assert.ok(f.startsWith(paths.core), 'task file is under paths.core');
  assert.ok(f.endsWith(path.join('schedules', 'wienerdog-dream.xml')), f);
});

test('scheduler-generators: windowsCurrentUserId prefers domain-qualified form', () => {
  assert.equal(gen.windowsCurrentUserId({ USERDOMAIN: 'WS', USERNAME: 'ada' }), 'WS\\ada');
  assert.equal(gen.windowsCurrentUserId({ USERNAME: 'ada' }), 'ada');
  assert.equal(gen.windowsCurrentUserId({ USERDOMAIN: 'WS' }), '');
  assert.equal(gen.windowsCurrentUserId({}), '');
});

test('scheduler-generators: windowsXmlEscape escapes the five entities and keeps spaces intact', () => {
  assert.equal(gen.windowsXmlEscape('a & b < c > d " e \' f'), 'a &amp; b &lt; c &gt; d &quot; e &apos; f');
  // a space-containing path is embedded intact (only the five metacharacters change).
  assert.equal(
    gen.windowsXmlEscape('C:\\Users\\John Smith\\.wienerdog'),
    'C:\\Users\\John Smith\\.wienerdog'
  );
});

test('scheduler-generators: windowsDreamTaskXml matches the golden byte-for-byte', () => {
  const out = gen.windowsDreamTaskXml({
    name: 'dream',
    hour: 3,
    minute: 30,
    wrapper: 'C:\\Users\\John Smith\\.wienerdog\\schedules\\wienerdog-dream.cmd',
    userId: 'WS\\ada',
  });
  assert.equal(out, EXPECTED_DREAM);
  // battery + missed-run settings the dream depends on (ADR-0018).
  assert.match(out, /<DisallowStartIfOnBatteries>false<\/DisallowStartIfOnBatteries>/);
  assert.match(out, /<StopIfGoingOnBatteries>false<\/StopIfGoingOnBatteries>/);
  assert.match(out, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
});

test('scheduler-generators: windowsDreamTaskXml zero-pads hour/minute and XML-escapes the wrapper Command + userId (WP-157 F8)', () => {
  const out = gen.windowsDreamTaskXml({
    name: 'dream',
    hour: 3,
    minute: 5,
    wrapper: 'C:\\a & b\\wienerdog-dream.cmd',
    userId: 'WS\\a<d>a',
  });
  assert.match(out, /<StartBoundary>2020-01-01T03:05:00<\/StartBoundary>/);
  // WP-157 F8: the task Command is the env-scrubbing cmd wrapper (node/launcher/
  // descriptor/digest moved INTO the wrapper), XML-escaped; no <Arguments>.
  assert.match(out, /<Command>C:\\a &amp; b\\wienerdog-dream.cmd<\/Command>/);
  assert.doesNotMatch(out, /<Arguments>/);
  assert.match(out, /<UserId>WS\\a&lt;d&gt;a<\/UserId>/);
});

test('scheduler-generators: windowsCatchupTaskXml matches the golden byte-for-byte', () => {
  const out = gen.windowsCatchupTaskXml({
    wrapper: 'C:\\Users\\John Smith\\.wienerdog\\schedules\\wienerdog-catchup.cmd',
    userId: 'WS\\ada',
  });
  assert.equal(out, EXPECTED_WIN_CATCHUP);
  // no LogonTrigger (it needs admin to register); hourly TimeTrigger is the sole
  // trigger + the missed-run/battery settings (WP-074 / ADR-0018 amendment).
  assert.doesNotMatch(out, /<LogonTrigger>/);
  assert.match(out, /<Interval>PT1H<\/Interval>/);
  // WP-157 F8: the Command is the env-scrubbing catch-up cmd wrapper.
  assert.match(out, /<Command>.*wienerdog-catchup\.cmd<\/Command>/);
  assert.doesNotMatch(out, /<Arguments>/);
  assert.match(out, /<DisallowStartIfOnBatteries>false<\/DisallowStartIfOnBatteries>/);
  assert.match(out, /<StopIfGoingOnBatteries>false<\/StopIfGoingOnBatteries>/);
  assert.match(out, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
});

test('scheduler-generators: windowsTaskXmlBytes prepends the UTF-16 LE BOM and round-trips', () => {
  const xml = gen.windowsDreamTaskXml({
    name: 'dream',
    hour: 3,
    minute: 30,
    wrapper: 'C:\\Users\\John Smith\\.wienerdog\\schedules\\wienerdog-dream.cmd',
    userId: 'WS\\ada',
  });
  const buf = gen.windowsTaskXmlBytes(xml);
  assert.ok(Buffer.isBuffer(buf));
  // Leading BOM (0xFF 0xFE) then '<' encoded as UTF-16 LE (0x3C 0x00).
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1], 0xfe);
  assert.equal(buf[2], 0x3c);
  assert.equal(buf[3], 0x00);
  // Every byte after the BOM decodes back to the exact renderer string.
  assert.equal(buf.slice(2).toString('utf16le'), xml);
  // Byte length: 2 (BOM) + 2 per UTF-16 code unit.
  assert.equal(buf.length, 2 + xml.length * 2);
});

// -------------------------------------------------------------------------
// WP-157 F8/A10/R4: the scheduled OS entries neutralize the code-loading Node
// vars + ambient credential/config roots and bind the authorized HOME.
// -------------------------------------------------------------------------

test('scheduler-generators: launchdPlist EnvironmentVariables clears NODE_OPTIONS/NODE_PATH + binds HOME (F8/R4)', () => {
  const out = gen.launchdPlist({
    name: 'daily-digest', hour: 7, minute: 0, node: '/n', launcher: LAUNCHER,
    descriptor: DESC, expectDigest: DIGEST, home: '/Users/bob', logDir: '/l',
  });
  assert.match(out, /<key>EnvironmentVariables<\/key>/);
  // NODE_OPTIONS + NODE_PATH set to the empty string (launchd overrides inherited).
  assert.match(out, /<key>NODE_OPTIONS<\/key>\n\s*<string><\/string>/);
  assert.match(out, /<key>NODE_PATH<\/key>\n\s*<string><\/string>/);
  assert.match(out, /<key>HOME<\/key>\n\s*<string>\/Users\/bob<\/string>/);
  assert.match(out, /<key>CLAUDE_CONFIG_DIR<\/key>\n\s*<string><\/string>/);
  assert.match(out, /<key>ANTHROPIC_API_KEY<\/key>\n\s*<string><\/string>/);
});

test('scheduler-generators: catchupPlist EnvironmentVariables clears NODE_OPTIONS/NODE_PATH + binds HOME (F8/R4)', () => {
  const out = gen.catchupPlist({ node: '/n', launcher: LAUNCHER, expectDigest: DIGEST, home: '/Users/bob', logDir: '/l' });
  assert.match(out, /<key>NODE_OPTIONS<\/key>\n\s*<string><\/string>/);
  assert.match(out, /<key>NODE_PATH<\/key>\n\s*<string><\/string>/);
  assert.match(out, /<key>HOME<\/key>\n\s*<string>\/Users\/bob<\/string>/);
});

test('scheduler-generators: systemdService Environment= clears NODE_OPTIONS/NODE_PATH + binds HOME (F8/R4)', () => {
  const out = gen.systemdService({ name: 'x', node: '/n', launcher: LAUNCHER, descriptor: DESC, expectDigest: DIGEST, home: '/home/bob' });
  assert.match(out, /^Environment=NODE_OPTIONS=$/m);
  assert.match(out, /^Environment=NODE_PATH=$/m);
  assert.match(out, /^Environment=HOME="\/home\/bob"$/m);
  assert.match(out, /^Environment=CLAUDE_CONFIG_DIR=$/m);
  assert.match(out, /^Environment=ANTHROPIC_API_KEY=$/m);
  // The clears precede ExecStart so the launcher's node never sees them.
  assert.ok(out.indexOf('Environment=NODE_OPTIONS=') < out.indexOf('ExecStart='));
});

test('scheduler-generators: the Windows cmd wrapper clears NODE_OPTIONS/NODE_PATH + cred roots and binds HOME before node (F8/A10)', () => {
  const w = gen.windowsLauncherWrapper({
    node: 'C:\\node.exe',
    launcher: 'C:\\wd\\launch.js',
    home: 'C:\\Users\\Bob',
    launchArgs: ['dream', '--descriptor', 'C:\\wd\\d.json', '--expect-digest', DIGEST],
  });
  // Security-critical clears use quoted empty assignments (%-safe).
  assert.match(w, /set "NODE_OPTIONS="/);
  assert.match(w, /set "NODE_PATH="/);
  assert.match(w, /set "CLAUDE_CONFIG_DIR="/);
  assert.match(w, /set "CODEX_HOME="/);
  assert.match(w, /set "ANTHROPIC_API_KEY="/);
  assert.match(w, /set "HOME=C:\\Users\\Bob"/);
  assert.match(w, /set "USERPROFILE=C:\\Users\\Bob"/);
  // The clears come BEFORE the node invocation (so the launcher's node is clean).
  assert.ok(w.indexOf('set "NODE_OPTIONS="') < w.indexOf('"C:\\node.exe"'));
  // node + launcher quoted; the descriptor path (spaces-capable) quoted; flags bare.
  assert.match(w, /"C:\\node.exe" "C:\\wd\\launch.js" dream --descriptor "C:\\wd\\d.json" --expect-digest sha256:deadbeef/);
  // CRLF line endings (canonical for .cmd).
  assert.ok(w.includes('\r\n'));
});

test('scheduler-generators: the Windows wrapper path helpers namespace under <core>/schedules', () => {
  const { getPaths } = require('../../src/core/paths');
  const paths = getPaths({ HOME: '/home/ada', WIENERDOG_HOME: '/home/ada/.wienerdog' });
  assert.equal(gen.windowsWrapperFileName('dream'), 'wienerdog-dream.cmd');
  const path = require('node:path');
  assert.equal(gen.windowsWrapperFile(paths, 'catchup'), path.join(paths.core, 'schedules', 'wienerdog-catchup.cmd'));
});

test('scheduler-generators: ensureCatchup backstop renders the launcher + real args, never "undefined" (F14)', { skip: process.platform !== 'darwin' }, () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { getPaths } = require('../../src/core/paths');
  const vendor = require('../../src/core/vendor');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-gen-catchup-'));
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
  fs.mkdirSync(paths.state, { recursive: true });
  const calls = [];
  const res = gen.ensureCatchup(paths, { loader: (a) => (calls.push(a), { status: 0 }) });
  assert.equal(res.changed, true);
  const plistPath = path.join(gen.launchAgentsDir(paths.home), 'ai.wienerdog.catchup.plist');
  const text = fs.readFileSync(plistPath, 'utf8');
  // Old bug: catchupPlist got {node, bin, logDir} → launcher undefined → a
  // "<string>undefined</string>" argv. F14 passes {node, launcher, expectDigest,
  // home, logDir}.
  assert.doesNotMatch(text, /undefined/, 'no "undefined" argv (F14 signature)');
  assert.ok(text.includes(vendor.launcherPath(paths)), 'renders the out-of-tree launcher path');
  assert.match(text, /<string>--catch-up<\/string>/, 'runs --catch-up');
  assert.match(text, /<key>EnvironmentVariables<\/key>/, 'binds the scrubbed env (F8)');
});
