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
      <Command>C:\\Program Files\\nodejs\\node.exe</Command>
      <Arguments>"C:\\Users\\John Smith\\.wienerdog\\launcher\\launch.js" dream --descriptor "C:\\Users\\John Smith\\.wienerdog\\state\\descriptors\\dream.json" --expect-digest sha256:deadbeef</Arguments>
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
      <Command>C:\\Program Files\\nodejs\\node.exe</Command>
      <Arguments>"C:\\Users\\John Smith\\.wienerdog\\launcher\\launch.js" --catch-up --expect-digest sha256:deadbeef</Arguments>
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
    logDir: '/Users/ada/.wienerdog/logs/daily-digest',
  });
  assert.equal(out, EXPECTED_PLIST);
});

test('scheduler-generators: catchupPlist matches the golden byte-for-byte', () => {
  const out = gen.catchupPlist({
    node: '/usr/local/bin/node',
    launcher: LAUNCHER,
    expectDigest: DIGEST,
    logDir: '/Users/ada/.wienerdog/logs/catchup',
  });
  assert.equal(out, EXPECTED_CATCHUP);
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
  const out = gen.systemdService({ name: 'daily-digest', node, launcher, descriptor: DESC, expectDigest: DIGEST });
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
    node: 'C:\\Program Files\\nodejs\\node.exe',
    launcher: 'C:\\Users\\John Smith\\.wienerdog\\launcher\\launch.js',
    descriptor: 'C:\\Users\\John Smith\\.wienerdog\\state\\descriptors\\dream.json',
    expectDigest: DIGEST,
    userId: 'WS\\ada',
  });
  assert.equal(out, EXPECTED_DREAM);
  // battery + missed-run settings the dream depends on (ADR-0018).
  assert.match(out, /<DisallowStartIfOnBatteries>false<\/DisallowStartIfOnBatteries>/);
  assert.match(out, /<StopIfGoingOnBatteries>false<\/StopIfGoingOnBatteries>/);
  assert.match(out, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
});

test('scheduler-generators: windowsDreamTaskXml zero-pads hour/minute and XML-escapes interpolations', () => {
  const out = gen.windowsDreamTaskXml({
    name: 'dream',
    hour: 3,
    minute: 5,
    node: 'C:\\node.exe',
    launcher: 'C:\\a & b\\launch.js',
    descriptor: 'C:\\d & e\\dream.json',
    expectDigest: DIGEST,
    userId: 'WS\\a<d>a',
  });
  assert.match(out, /<StartBoundary>2020-01-01T03:05:00<\/StartBoundary>/);
  assert.match(out, /<Arguments>"C:\\a &amp; b\\launch.js" dream --descriptor "C:\\d &amp; e\\dream.json" --expect-digest sha256:deadbeef<\/Arguments>/);
  assert.match(out, /<UserId>WS\\a&lt;d&gt;a<\/UserId>/);
});

test('scheduler-generators: windowsCatchupTaskXml matches the golden byte-for-byte', () => {
  const out = gen.windowsCatchupTaskXml({
    node: 'C:\\Program Files\\nodejs\\node.exe',
    launcher: 'C:\\Users\\John Smith\\.wienerdog\\launcher\\launch.js',
    expectDigest: DIGEST,
    userId: 'WS\\ada',
  });
  assert.equal(out, EXPECTED_WIN_CATCHUP);
  // no LogonTrigger (it needs admin to register); hourly TimeTrigger is the sole
  // trigger + the missed-run/battery settings (WP-074 / ADR-0018 amendment).
  assert.doesNotMatch(out, /<LogonTrigger>/);
  assert.match(out, /<Interval>PT1H<\/Interval>/);
  assert.match(out, /launch\.js" --catch-up --expect-digest/);
  assert.match(out, /<DisallowStartIfOnBatteries>false<\/DisallowStartIfOnBatteries>/);
  assert.match(out, /<StopIfGoingOnBatteries>false<\/StopIfGoingOnBatteries>/);
  assert.match(out, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
});

test('scheduler-generators: windowsTaskXmlBytes prepends the UTF-16 LE BOM and round-trips', () => {
  const xml = gen.windowsDreamTaskXml({
    name: 'dream',
    hour: 3,
    minute: 30,
    node: 'C:\\Program Files\\nodejs\\node.exe',
    launcher: 'C:\\Users\\John Smith\\.wienerdog\\launcher\\launch.js',
    descriptor: 'C:\\Users\\John Smith\\.wienerdog\\state\\descriptors\\dream.json',
    expectDigest: DIGEST,
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
