'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const gen = require('../../src/scheduler/generators');
const { WienerdogError } = require('../../src/core/errors');

const EXPECTED_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.wienerdog.daily-digest</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/opt/wienerdog/bin/wienerdog.js</string>
    <string>run-job</string>
    <string>daily-digest</string>
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
    <string>/opt/wienerdog/bin/wienerdog.js</string>
    <string>run-job</string>
    <string>--catch-up</string>
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
ExecStart=/usr/bin/node /opt/wienerdog/bin/wienerdog.js run-job daily-digest
`;

test('scheduler-generators: launchdPlist matches the golden byte-for-byte', () => {
  const out = gen.launchdPlist({
    name: 'daily-digest',
    hour: 7,
    minute: 0,
    node: '/usr/local/bin/node',
    bin: '/opt/wienerdog/bin/wienerdog.js',
    logDir: '/Users/ada/.wienerdog/logs/daily-digest',
  });
  assert.equal(out, EXPECTED_PLIST);
});

test('scheduler-generators: catchupPlist matches the golden byte-for-byte', () => {
  const out = gen.catchupPlist({
    node: '/usr/local/bin/node',
    bin: '/opt/wienerdog/bin/wienerdog.js',
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
      bin: '/opt/wienerdog/bin/wienerdog.js',
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
  assert.ok(path.isAbsolute(gen.nodePath()));
  assert.ok(path.isAbsolute(gen.wienerdogBin()));
  assert.ok(gen.wienerdogBin().endsWith(path.join('bin', 'wienerdog.js')));
});
