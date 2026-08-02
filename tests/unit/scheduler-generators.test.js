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
// WP-157 F8/A10/R4 + A7 hardening pass: every OS entry binds the scheduled env
// (clears the code-loading Node vars + ambient cred/config roots, binds the
// authorized HOME, and binds WIENERDOG_HOME to the registration-time core).
const HOME = '/Users/ada';
const CORE = '/Users/ada/.wienerdog';

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
    <key>WIENERDOG_HOME</key>
    <string>/Users/ada/.wienerdog</string>
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
    <key>WIENERDOG_HOME</key>
    <string>/Users/ada/.wienerdog</string>
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
Environment=WIENERDOG_HOME="/Users/ada/.wienerdog"
Environment=NODE_OPTIONS=
Environment=NODE_PATH=
Environment=CLAUDE_CONFIG_DIR=
Environment=CODEX_HOME=
Environment=ANTHROPIC_API_KEY=
ExecStart="/usr/bin/node" "/opt/wienerdog/launcher/launch.js" daily-digest --descriptor "/opt/wienerdog/state/descriptors/daily-digest.json" --expect-digest sha256:deadbeef
`;

// A7 hardening pass (ADR-0028 R16): the Windows task binds the COMPLETE
// authorization command into the REGISTERED <Arguments> (cmd.exe as <Command>),
// not a reopened wrapper file. Fixtures for the cmd-argument golden.
const WIN_NODE = 'C:\\Program Files\\nodejs\\node.exe';
const WIN_LAUNCHER = 'C:\\Users\\ada\\.wienerdog\\launcher\\launch.js';
const WIN_DESC = 'C:\\Users\\ada\\.wienerdog\\state\\descriptors\\dream.json';
const WIN_HOME = 'C:\\Users\\ada';
const WIN_CORE = 'C:\\Users\\ada\\.wienerdog';
// Off-Windows, windowsCmdExePath falls back to C:\Windows (no SystemRoot).
const WIN_CMD = 'C:\\Windows\\System32\\cmd.exe';
// The exact bound argument string: `%SystemRoot%\System32\cmd.exe /d /s /v:off
// /c "…"` scrubbing+binding every scheduled env var then invoking node+launcher
// with the bound descriptor/expect-digest. This is the mutation-sensitive golden;
// the XML tests only assert it is embedded (XML-escaped) verbatim.
const EXPECTED_DREAM_ARGS =
  '/d /s /v:off /c "' +
  'set "HOME=C:\\Users\\ada" & ' +
  'set "WIENERDOG_HOME=C:\\Users\\ada\\.wienerdog" & ' +
  'set "NODE_OPTIONS=" & ' +
  'set "NODE_PATH=" & ' +
  'set "CLAUDE_CONFIG_DIR=" & ' +
  'set "CODEX_HOME=" & ' +
  'set "ANTHROPIC_API_KEY=" & ' +
  'set "USERPROFILE=C:\\Users\\ada" & ' +
  '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\ada\\.wienerdog\\launcher\\launch.js" ' +
  'dream --descriptor "C:\\Users\\ada\\.wienerdog\\state\\descriptors\\dream.json" ' +
  '--expect-digest sha256:deadbeef"';

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
    core: CORE,
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
    core: CORE,
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
    core: CORE,
    logDir: '/Users/ada/.wienerdog/logs/catchup',
  });
  assert.match(out, /<string>--job-digests<\/string>/, 'the map flag is present');
  assert.match(out, new RegExp(`<string>${token}</string>`), 'the exact bound token is present');
  // Round-trips back to the map the launcher forwards to the catch-up runner.
  const between = out.slice(out.indexOf('--job-digests'));
  const bound = between.match(/<string>([A-Za-z0-9_-]+)<\/string>/)[1];
  assert.deepEqual(gen.decodeJobDigests(bound).map, { dream: `sha256:${'c'.repeat(64)}` });
});

test('scheduler-generators: the Windows catch-up cmd Arguments carry --job-digests bare inline (base64url is metachar-free)', () => {
  const token = gen.encodeJobDigests({ dream: `sha256:${'d'.repeat(64)}` });
  const argline = gen.windowsCmdArguments({
    node: 'C:\\node.exe',
    launcher: 'C:\\wd\\launch.js',
    home: 'C:\\Users\\ada',
    core: 'C:\\Users\\ada\\.wienerdog',
    launchArgs: ['--catch-up', '--expect-digest', DIGEST, '--job-digests', token],
  });
  // base64url matches the bare cmd-token charset, so the token is UNQUOTED and
  // bound INLINE in the registered arguments — not a separate mutable file.
  assert.match(argline, new RegExp(`--job-digests ${token}"$`));
  // The whole command is a single cmd.exe /c string; nothing references a .cmd file.
  assert.match(argline, /^\/d \/s \/v:off \/c "/);
  assert.doesNotMatch(argline, /\.cmd\b/);
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
      core: CORE,
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
    core: CORE,
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
    core: CORE,
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
    core: CORE,
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
      core: CORE,
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

// A7 hardening pass (ADR-0028 R16): windowsCmdArguments binds the COMPLETE
// authorization command; windowsCmdExePath is the cmd.exe <Command>.

test('scheduler-generators: windowsCmdExePath resolves the absolute cmd.exe (SystemRoot, else C:\\Windows fallback)', () => {
  assert.equal(gen.windowsCmdExePath({ SystemRoot: 'D:\\Win' }), 'D:\\Win\\System32\\cmd.exe');
  assert.equal(gen.windowsCmdExePath({ windir: 'E:\\W' }), 'E:\\W\\System32\\cmd.exe');
  assert.equal(gen.windowsCmdExePath({}), 'C:\\Windows\\System32\\cmd.exe');
});

test('scheduler-generators: windowsCmdArguments binds env scrub/bind + node+launcher inline, byte-for-byte', () => {
  const argline = gen.windowsCmdArguments({
    node: WIN_NODE,
    launcher: WIN_LAUNCHER,
    home: WIN_HOME,
    core: WIN_CORE,
    launchArgs: ['dream', '--descriptor', WIN_DESC, '--expect-digest', DIGEST],
  });
  assert.equal(argline, EXPECTED_DREAM_ARGS);
  // WIENERDOG_HOME is bound to the registration-time core (fix #2) and NODE_OPTIONS
  // is cleared BEFORE node runs; both are INLINE in the registered arguments.
  assert.match(argline, /set "WIENERDOG_HOME=C:\\Users\\ada\\.wienerdog"/);
  assert.ok(argline.indexOf('set "NODE_OPTIONS="') < argline.indexOf('"C:\\Program Files\\nodejs\\node.exe"'));
  // No authorization datum lives in a reopened file — it's one cmd.exe /c string.
  assert.doesNotMatch(argline, /\.cmd\b/);
});

test('scheduler-generators: cmdQuotedToken doubles trailing backslashes and throws on an embedded quote', () => {
  assert.equal(gen.cmdQuotedToken('C:\\Users\\ada'), 'C:\\Users\\ada');
  assert.equal(gen.cmdQuotedToken('C:\\dir\\'), 'C:\\dir\\\\'); // trailing \\ doubled
  assert.equal(gen.cmdQuotedToken('C:\\a & b\\x'), 'C:\\a & b\\x'); // & literal in quotes
  assert.throws(() => gen.cmdQuotedToken('C:\\a"b'), WienerdogError);
});

test('scheduler-generators: windowsDreamTaskXml binds cmd.exe <Command> + the bound <Arguments> (A7 hardening pass, R16)', () => {
  const argline = gen.windowsCmdArguments({
    node: WIN_NODE, launcher: WIN_LAUNCHER, home: WIN_HOME, core: WIN_CORE,
    launchArgs: ['dream', '--descriptor', WIN_DESC, '--expect-digest', DIGEST],
  });
  const out = gen.windowsDreamTaskXml({
    name: 'dream', hour: 3, minute: 5, command: WIN_CMD, argline, userId: 'WS\\a<d>a',
  });
  assert.match(out, /<StartBoundary>2020-01-01T03:05:00<\/StartBoundary>/);
  // <Command> is cmd.exe; <Arguments> is the bound argline, XML-escaped verbatim.
  assert.match(out, /<Command>C:\\Windows\\System32\\cmd\.exe<\/Command>/);
  assert.ok(out.includes(`<Arguments>${gen.windowsXmlEscape(argline)}</Arguments>`), out);
  // The auth args live in the REGISTERED <Arguments> (needs registration privilege
  // to change), NOT a reopened .cmd wrapper file.
  assert.doesNotMatch(out, /\.cmd\b/);
  // The expect-digest is carried INLINE (escaped) inside <Arguments>.
  assert.match(out, /--expect-digest sha256:deadbeef/);
  assert.match(out, /<UserId>WS\\a&lt;d&gt;a<\/UserId>/);
  // battery + missed-run settings the dream depends on (ADR-0018).
  assert.match(out, /<DisallowStartIfOnBatteries>false<\/DisallowStartIfOnBatteries>/);
  assert.match(out, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
});

test('scheduler-generators: windowsCatchupTaskXml binds cmd.exe <Command> + the catch-up <Arguments> with --job-digests inline (R16)', () => {
  const token = gen.encodeJobDigests({ dream: `sha256:${'e'.repeat(64)}` });
  const argline = gen.windowsCmdArguments({
    node: WIN_NODE, launcher: WIN_LAUNCHER, home: WIN_HOME, core: WIN_CORE,
    launchArgs: ['--catch-up', '--expect-digest', DIGEST, '--job-digests', token],
  });
  const out = gen.windowsCatchupTaskXml({ command: WIN_CMD, argline, userId: 'WS\\ada' });
  // no LogonTrigger (needs admin); hourly TimeTrigger only + missed-run settings.
  assert.doesNotMatch(out, /<LogonTrigger>/);
  assert.match(out, /<Interval>PT1H<\/Interval>/);
  assert.match(out, /<Command>C:\\Windows\\System32\\cmd\.exe<\/Command>/);
  assert.ok(out.includes(`<Arguments>${gen.windowsXmlEscape(argline)}</Arguments>`), out);
  // The per-job digest MAP is bound INLINE in the registered arguments, not a file.
  assert.match(out, new RegExp(`--job-digests ${token}`));
  assert.doesNotMatch(out, /\.cmd\b/);
  assert.match(out, /<DisallowStartIfOnBatteries>false<\/DisallowStartIfOnBatteries>/);
  assert.match(out, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
});

test('scheduler-generators: windowsTaskXmlBytes prepends the UTF-16 LE BOM and round-trips', () => {
  const argline = gen.windowsCmdArguments({
    node: WIN_NODE, launcher: WIN_LAUNCHER, home: WIN_HOME, core: WIN_CORE,
    launchArgs: ['dream', '--descriptor', WIN_DESC, '--expect-digest', DIGEST],
  });
  const xml = gen.windowsDreamTaskXml({
    name: 'dream', hour: 3, minute: 30, command: WIN_CMD, argline, userId: 'WS\\ada',
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

test('scheduler-generators: launchdPlist EnvironmentVariables clears NODE_OPTIONS/NODE_PATH + binds HOME + WIENERDOG_HOME (F8/R4 + fix #2)', () => {
  const out = gen.launchdPlist({
    name: 'daily-digest', hour: 7, minute: 0, node: '/n', launcher: LAUNCHER,
    descriptor: DESC, expectDigest: DIGEST, home: '/Users/bob', core: '/Users/bob/.wienerdog', logDir: '/l',
  });
  assert.match(out, /<key>EnvironmentVariables<\/key>/);
  // NODE_OPTIONS + NODE_PATH set to the empty string (launchd overrides inherited).
  assert.match(out, /<key>NODE_OPTIONS<\/key>\n\s*<string><\/string>/);
  assert.match(out, /<key>NODE_PATH<\/key>\n\s*<string><\/string>/);
  assert.match(out, /<key>HOME<\/key>\n\s*<string>\/Users\/bob<\/string>/);
  // fix #2: WIENERDOG_HOME bound to the registration-time core, overriding ambient.
  assert.match(out, /<key>WIENERDOG_HOME<\/key>\n\s*<string>\/Users\/bob\/\.wienerdog<\/string>/);
  assert.match(out, /<key>CLAUDE_CONFIG_DIR<\/key>\n\s*<string><\/string>/);
  assert.match(out, /<key>ANTHROPIC_API_KEY<\/key>\n\s*<string><\/string>/);
});

test('scheduler-generators: catchupPlist EnvironmentVariables clears NODE_OPTIONS/NODE_PATH + binds HOME + WIENERDOG_HOME (F8/R4 + fix #2)', () => {
  const out = gen.catchupPlist({ node: '/n', launcher: LAUNCHER, expectDigest: DIGEST, home: '/Users/bob', core: '/Users/bob/.wienerdog', logDir: '/l' });
  assert.match(out, /<key>NODE_OPTIONS<\/key>\n\s*<string><\/string>/);
  assert.match(out, /<key>NODE_PATH<\/key>\n\s*<string><\/string>/);
  assert.match(out, /<key>HOME<\/key>\n\s*<string>\/Users\/bob<\/string>/);
  assert.match(out, /<key>WIENERDOG_HOME<\/key>\n\s*<string>\/Users\/bob\/\.wienerdog<\/string>/);
});

test('scheduler-generators: systemdService Environment= clears NODE_OPTIONS/NODE_PATH + binds HOME + WIENERDOG_HOME (F8/R4 + fix #2)', () => {
  const out = gen.systemdService({ name: 'x', node: '/n', launcher: LAUNCHER, descriptor: DESC, expectDigest: DIGEST, home: '/home/bob', core: '/home/bob/.wienerdog' });
  assert.match(out, /^Environment=NODE_OPTIONS=$/m);
  assert.match(out, /^Environment=NODE_PATH=$/m);
  assert.match(out, /^Environment=HOME="\/home\/bob"$/m);
  // fix #2: WIENERDOG_HOME bound to the registration-time core.
  assert.match(out, /^Environment=WIENERDOG_HOME="\/home\/bob\/\.wienerdog"$/m);
  assert.match(out, /^Environment=CLAUDE_CONFIG_DIR=$/m);
  assert.match(out, /^Environment=ANTHROPIC_API_KEY=$/m);
  // The clears precede ExecStart so the launcher's node never sees them.
  assert.ok(out.indexOf('Environment=NODE_OPTIONS=') < out.indexOf('ExecStart='));
});

test('scheduler-generators: windowsCmdArguments clears NODE_OPTIONS/NODE_PATH + cred roots and binds HOME + WIENERDOG_HOME before node (F8/A10 + fix #2)', () => {
  const argline = gen.windowsCmdArguments({
    node: 'C:\\node.exe',
    launcher: 'C:\\wd\\launch.js',
    home: 'C:\\Users\\Bob',
    core: 'C:\\Users\\Bob\\.wienerdog',
    launchArgs: ['dream', '--descriptor', 'C:\\wd\\d.json', '--expect-digest', DIGEST],
  });
  // Security-critical clears use quoted empty assignments (%-safe).
  assert.match(argline, /set "NODE_OPTIONS="/);
  assert.match(argline, /set "NODE_PATH="/);
  assert.match(argline, /set "CLAUDE_CONFIG_DIR="/);
  assert.match(argline, /set "CODEX_HOME="/);
  assert.match(argline, /set "ANTHROPIC_API_KEY="/);
  assert.match(argline, /set "HOME=C:\\Users\\Bob"/);
  assert.match(argline, /set "USERPROFILE=C:\\Users\\Bob"/);
  // fix #2: WIENERDOG_HOME bound to the registration-time core.
  assert.match(argline, /set "WIENERDOG_HOME=C:\\Users\\Bob\\.wienerdog"/);
  // The clears come BEFORE the node invocation (so the launcher's node is clean).
  assert.ok(argline.indexOf('set "NODE_OPTIONS="') < argline.indexOf('"C:\\node.exe"'));
  // node + launcher quoted; the descriptor path (spaces-capable) quoted; flags bare.
  assert.match(argline, /"C:\\node.exe" "C:\\wd\\launch.js" dream --descriptor "C:\\wd\\d.json" --expect-digest sha256:deadbeef/);
  // cmd.exe /c wrapper with AutoRun disabled and delayed expansion off.
  assert.match(argline, /^\/d \/s \/v:off \/c "/);
});

// WP-scheduler-node-path-durability: `entryNodePath` (Table A) is the ENTRY-only
// role — the durable Homebrew alias, taken ONLY when proven to be the same
// interpreter that is running. `nodePath()` stays the RUNTIME role (Table B)
// and is untouched (T4 covers its own preservation implicitly via T5's split).

// T1 — Table A rows 5-6, injected realpath: the three alias positives (Table F
// rows 13-15), the different-inode negative, and the throwing negative (AC1).
const T1_POSITIVES = [
  [
    '/opt/homebrew/Cellar/node/25.9.0_2/bin/node',
    '/opt/homebrew/opt/node/bin/node',
    'Table F row 13 — plain homebrew formula',
  ],
  [
    '/usr/local/Cellar/node@22/22.14.0/bin/node',
    '/usr/local/opt/node@22/bin/node',
    'Table F row 14 — versioned formula (node@22)',
  ],
  [
    '/home/linuxbrew/.linuxbrew/Cellar/node/24.0.1/bin/node',
    '/home/linuxbrew/.linuxbrew/opt/node/bin/node',
    'Table F row 15 — linuxbrew prefix derivation',
  ],
];

test('node-path-durability: entryNodePath takes the alias only when realpath proves it is the same binary (AC1)', () => {
  const sameRealpath = () => 'SAME-INODE';
  for (const [input, expected, why] of T1_POSITIVES) {
    assert.equal(gen.entryNodePath(input, { realpath: sameRealpath }), expected, why);
  }

  // Different-inode negative: ALIAS and exec resolve to DIFFERENT strings —
  // the alias currently names a different binary — fail-safe direction wins.
  const CELLAR = '/opt/homebrew/Cellar/node/25.9.0_2/bin/node';
  const identityRealpath = (p) => p;
  assert.equal(
    gen.entryNodePath(CELLAR, { realpath: identityRealpath }),
    CELLAR,
    'different-inode negative must return execPath verbatim'
  );

  // Throwing negative: realpath throws (ENOENT-shaped) — fail-safe direction wins.
  const throwingRealpath = () => {
    throw new Error('ENOENT: no such file or directory');
  };
  assert.equal(
    gen.entryNodePath(CELLAR, { realpath: throwingRealpath }),
    CELLAR,
    'a throwing realpath must return execPath verbatim, never throw'
  );
});

// T2 — Table A rows 1-4, table-driven over Table F rows 1-12: every fixture
// returns its input verbatim, and — via the `reached` flag, checked AFTER the
// call so a swallowed exception cannot mask it — realpath is never invoked
// (AC2; this is what makes Table E rows 4-6 red).
const T2_FIXTURES = [
  [null, null, 'Table F row 1 — not a string (null)'],
  [42, 42, 'Table F row 2 — not a string (number)'],
  ['', '', 'Table F row 3 — empty string, no leading /'],
  [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files\\nodejs\\node.exe',
    'Table F row 4 — Windows path, no leading /',
  ],
  ['/usr/bin/node', '/usr/bin/node', 'Table F row 5 — len < 6'],
  [
    '/opt/homebrew/Cellar/node/bin/node',
    '/opt/homebrew/Cellar/node/bin/node',
    'Table F row 6 — len < 6',
  ],
  [
    '/home/u/.nvm/versions/node/v22.1.0/bin/node',
    '/home/u/.nvm/versions/node/v22.1.0/bin/node',
    "Table F row 7 — parts[i] === 'versions', not Cellar",
  ],
  [
    '/opt/homebrew/Cellar/node/25.9.0_2/bin/x/node',
    '/opt/homebrew/Cellar/node/25.9.0_2/bin/x/node',
    'Table F row 8 — Cellar at the wrong depth',
  ],
  [
    '/opt/homebrew/Cellar/pnpm/9.0.0/bin/node',
    '/opt/homebrew/Cellar/pnpm/9.0.0/bin/node',
    "Table F row 9 — formula 'pnpm' is not a node keg",
  ],
  [
    '/opt/homebrew/Cellar/../1.0.0/bin/node',
    '/opt/homebrew/Cellar/../1.0.0/bin/node',
    'Table F row 10 — traversal in the formula position',
  ],
  [
    '/opt/homebrew/Cellar/node/../bin/node',
    '/opt/homebrew/Cellar/node/../bin/node',
    'Table F row 11 — traversal in the version position',
  ],
  [
    '/opt/homebrew/Cellar/node/beta/bin/node',
    '/opt/homebrew/Cellar/node/beta/bin/node',
    "Table F row 12 — version 'beta' does not start with a digit",
  ],
];

test('node-path-durability: entryNodePath returns every non-alias input verbatim, WITHOUT touching the filesystem (AC2)', () => {
  for (const [input, expected, why] of T2_FIXTURES) {
    const reached = { realpath: false };
    const realpath = () => {
      reached.realpath = true;
      assert.fail(`AC2: realpath must not be called — ${why}`);
    };
    const got = gen.entryNodePath(input, { realpath });
    assert.equal(got, expected, why);
    assert.equal(reached.realpath, false, `realpath was reached for: ${why}`);
  }
});

// T4 — idempotence (AC6): entryNodePath is deterministic for a fixed
// filesystem, and rendering the same job twice through a real renderer with
// entryNodePath's result produces byte-identical strings. AC6 asserts
// rendered-bytes idempotence ONLY — it says nothing about OS convergence
// (Table C rows 4 and 7 are the residual on that front, not this test's job).
test('node-path-durability: entryNodePath is deterministic, and double-rendering a plist with it is byte-identical (AC6)', () => {
  const opts = { realpath: () => 'SAME-INODE' };
  const exec = '/opt/homebrew/Cellar/node/25.9.0_2/bin/node';

  const first = gen.entryNodePath(exec, opts);
  const second = gen.entryNodePath(exec, opts);
  assert.equal(first, second);
  assert.equal(first, '/opt/homebrew/opt/node/bin/node');

  const render = () =>
    gen.launchdPlist({
      name: 'daily-digest',
      hour: 7,
      minute: 0,
      node: gen.entryNodePath(exec, opts),
      launcher: LAUNCHER,
      descriptor: DESC,
      expectDigest: DIGEST,
      home: HOME,
      core: CORE,
      logDir: '/Users/ada/.wienerdog/logs/daily-digest',
    });
  assert.equal(render(), render());
});

// T5 — the role-split detector (AC4, Table E row 7): a fabricated Homebrew
// layout, exercised through the REAL fs.realpathSync against a REAL symlink,
// with NO seam at all. `nodePath()` must still return process.execPath
// unchanged; `entryNodePath()` must return the durable alias; and the two
// must differ. POSIX-only — a Windows execPath is a drive-letter path, which
// Table A row 1 correctly returns unchanged (already covered by AC2/Table F
// row 4), so gating this test loses no coverage (see AC4).
const posixOnly = { skip: process.platform === 'win32' };

test('node-path-durability: nodePath() vs entryNodePath() under a fabricated Homebrew layout — the role split, no seam (AC4, Table E row 7)', posixOnly, () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');

  // (i) realpath the temp root FIRST — on macOS /tmp is a symlink to
  // /private/tmp, and building paths off the unresolved root would compare
  // two different strings later.
  const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-nodepath-')));
  const originalExecPath = process.execPath;

  try {
    // (iii) the fabricated Cellar binary must be a REAL regular file (never
    // executed, only realpath'd); TMP/opt must exist as a directory BEFORE
    // the symlink is created, since fs.symlinkSync does not create parents.
    const cellarDir = path.join(TMP, 'Cellar', 'node', '9.9.9', 'bin');
    fs.mkdirSync(cellarDir, { recursive: true });
    const cellarNode = path.join(cellarDir, 'node');
    fs.writeFileSync(cellarNode, '');

    fs.mkdirSync(path.join(TMP, 'opt'), { recursive: true });
    fs.symlinkSync(path.join('..', 'Cellar', 'node', '9.9.9'), path.join(TMP, 'opt', 'node'));

    // (ii) restored in the `finally` below — never leak a fake execPath into
    // the rest of the suite.
    Object.defineProperty(process, 'execPath', { value: cellarNode, configurable: true, writable: true });

    assert.equal(gen.nodePath(), process.execPath);
    const alias = path.join(TMP, 'opt', 'node', 'bin', 'node');
    assert.equal(gen.entryNodePath(), alias);
    assert.notEqual(gen.nodePath(), gen.entryNodePath());
  } finally {
    Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true, writable: true });
    // (iv) clean the temp dir in the same finally.
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});
