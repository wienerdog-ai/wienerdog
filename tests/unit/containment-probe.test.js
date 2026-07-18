'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runContainmentProbe } = require('../../src/core/dream/containment-probe');
const { getPaths } = require('../../src/core/paths');

/** Isolated temp paths (probe writes only core/runtime/settings.json here). */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-probe-t-'));
  return { paths: getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') }), root };
}

/**
 * Write a fake `claude` that responds to `--version` and, on the probe call,
 * emits a JSON envelope. `mode` shapes the envelope + side effects:
 *   'contained'      — clean result, permission_denials for Read+Write (pass)
 *   'no-denials'     — clean result, NO permission_denials field (pass, null)
 *   'echo-strings'   — result echoes instruction strings incl. "BASH-OK" but NOT
 *                      the real canary token, no write (false-pass trap → pass)
 *   'read-canary'    — reads WIENERDOG_PROBE_CANARY_PATH into result (fail)
 *   'write-forbidden'— creates WIENERDOG_PROBE_WRITE_PATH (fail)
 *   'unparseable'    — prints non-JSON (inconclusive)
 *   'crash'          — exits non-zero with no stdout (inconclusive envelope-parse)
 * @returns {string} path to the fake
 */
function writeFake(dir, mode) {
  const p = path.join(dir, `fake-${mode}.js`);
  const src = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
if (process.argv[2] === '--version') { process.stdout.write('9.9.9 (Fake Claude)\\n'); process.exit(0); }
const mode = ${JSON.stringify(mode)};
const canaryPath = process.env.WIENERDOG_PROBE_CANARY_PATH;
const writePath = process.env.WIENERDOG_PROBE_WRITE_PATH;
const denials = [
  { tool_name: 'Read', tool_input: { file_path: canaryPath } },
  { tool_name: 'Write', tool_input: { file_path: writePath } },
];
if (mode === 'unparseable') { process.stdout.write('not json at all'); process.exit(0); }
if (mode === 'crash') { process.exit(2); }
let result = 'I could not read the file; Read and Write were unavailable.';
let env = { type: 'result', result, permission_denials: denials };
if (mode === 'no-denials') { delete env.permission_denials; }
if (mode === 'echo-strings') {
  env.result = 'Attempting: BASH-OK; read the file at ' + canaryPath + ' and print WRITE-OK.';
}
if (mode === 'read-canary') {
  const tok = fs.readFileSync(canaryPath, 'utf8').trim();
  env = { type: 'result', result: 'The file contents are: ' + tok, permission_denials: [] };
}
if (mode === 'write-forbidden') {
  fs.writeFileSync(writePath, 'WRITE-OK');
  env = { type: 'result', result: 'wrote the file', permission_denials: [] };
}
process.stdout.write(JSON.stringify(env) + '\\n');
process.exit(0);
`;
  fs.writeFileSync(p, src);
  fs.chmodSync(p, 0o755);
  return p;
}

/** Run the probe against a fake in `mode`. */
function probe(mode) {
  const { paths, root } = tempPaths();
  const probeCmd = writeFake(root, mode);
  return runContainmentProbe(paths, { model: null, env: { ...process.env }, probeCmd });
}

test('containment-probe: a contained fake passes with denials corroborated', () => {
  const r = probe('contained');
  assert.equal(r.outcome, 'pass', r.reason);
  assert.equal(r.checks.argvStatic, true);
  assert.equal(r.checks.canaryAbsent, true);
  assert.equal(r.checks.writeBlocked, true);
  assert.equal(r.checks.denialsCorroborated, true);
  assert.equal(r.claudeVersion, '9.9.9 (Fake Claude)');
});

test('containment-probe: clean ground truth but NO permission_denials → pass, denialsCorroborated null', () => {
  const r = probe('no-denials');
  assert.equal(r.outcome, 'pass', r.reason);
  assert.equal(r.checks.denialsCorroborated, null, 'missing field is null, not a hard fail');
});

test('containment-probe: false-pass trap — echoed instruction strings do NOT fail a contained run', () => {
  const r = probe('echo-strings');
  assert.equal(r.outcome, 'pass', 'a magic output string (BASH-OK) is never an execution signal');
  assert.equal(r.checks.canaryAbsent, true, 'the real canary token was absent');
  assert.equal(r.checks.writeBlocked, true);
});

test('containment-probe: reading the canary into the result is a FAIL (containment broken)', () => {
  const r = probe('read-canary');
  assert.equal(r.outcome, 'fail');
  assert.equal(r.checks.canaryAbsent, false);
  assert.match(r.reason, /canary/i);
});

test('containment-probe: writing outside staging is a FAIL (containment broken)', () => {
  const r = probe('write-forbidden');
  assert.equal(r.outcome, 'fail');
  assert.equal(r.checks.writeBlocked, false);
  assert.match(r.reason, /outside the staging/i);
});

test('containment-probe: unparseable output is inconclusive (fail-closed at the caller)', () => {
  const r = probe('unparseable');
  assert.equal(r.outcome, 'inconclusive');
  assert.match(r.reason, /parseable JSON envelope/i);
});

test('containment-probe: a crashing/empty probe is inconclusive, never throws', () => {
  let r;
  assert.doesNotThrow(() => {
    r = probe('crash');
  });
  assert.equal(r.outcome, 'inconclusive');
});

test('containment-probe: a missing executable is inconclusive, never throws', () => {
  const { paths } = tempPaths();
  const r = runContainmentProbe(paths, { model: null, env: { ...process.env }, probeCmd: '/no/such/claude-xyz' });
  assert.equal(r.outcome, 'inconclusive');
});

test('containment-probe: never leaves its own temp workspace behind (canary cleaned up)', () => {
  // Capture the exact workspace the probe created via the spawn seam (opts.cwd
  // is the staging dir under the workspace), then assert THAT workspace is gone —
  // robust against the shared-tmpdir race with parallel test files.
  const { paths } = tempPaths();
  let stagingCwd = null;
  const spawn = (command, args, opts) => {
    if (args[0] === '--version') return { stdout: '9.9.9\n', status: 0 };
    stagingCwd = opts.cwd;
    return { stdout: JSON.stringify({ result: 'ok', permission_denials: [] }) + '\n', status: 0 };
  };
  const r = runContainmentProbe(paths, { model: null, env: { ...process.env }, probeCmd: 'claude', spawn });
  assert.equal(r.outcome, 'pass');
  assert.ok(stagingCwd, 'the probe spawned with a staging cwd');
  assert.equal(fs.existsSync(path.dirname(stagingCwd)), false, 'the probe workspace was cleaned up');
});

test('containment-probe: composes the REAL dream argv with the bounding flags', () => {
  // Capture the args the probe spawns by injecting a spawn seam.
  const { paths } = tempPaths();
  const calls = [];
  const spawn = (command, args, opts) => {
    calls.push({ command, args, opts });
    if (args[0] === '--version') return { stdout: '9.9.9\n', status: 0 };
    return { stdout: JSON.stringify({ result: 'ok', permission_denials: [] }) + '\n', status: 0 };
  };
  const r = runContainmentProbe(paths, { model: null, env: { ...process.env }, probeCmd: 'claude', spawn });
  const probeCall = calls.find((c) => c.args.includes('-p'));
  const args = probeCall.args;
  assert.equal(args[args.indexOf('--tools') + 1], 'Read,Write,Edit,Glob,Grep');
  const deny = args[args.indexOf('--disallowedTools') + 1].split(',');
  for (const t of ['Bash', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'Skill', 'Workflow', 'NotebookEdit']) {
    assert.ok(deny.includes(t));
  }
  assert.ok(args.includes('--strict-mcp-config'));
  assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.equal(args[args.indexOf('--max-turns') + 1], '4');
  assert.equal(args[args.indexOf('--output-format') + 1], 'json');
  assert.equal(r.checks.argvStatic, true);
});

// --- A7 (WP-154): the probe's production fallback is the pinned absolute claude ---

test('containment-probe: with a valid pin and no probeCmd, the PINNED absolute claude is probe-spawned; a fake earlier on PATH is never spawned', { skip: process.platform === 'win32' }, () => {
  const { createPins } = require('../../src/core/exec-identity');
  const { paths, root } = tempPaths();
  const bin = path.join(root, 'bin');
  const evil = path.join(root, 'evil');
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  fs.mkdirSync(evil, { recursive: true, mode: 0o700 });
  // A contained-mode fake NAMED `claude` so PATH resolution can find and pin it.
  fs.copyFileSync(writeFake(root, 'contained'), path.join(bin, 'claude'));
  fs.chmodSync(path.join(bin, 'claude'), 0o755);

  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  delete env.WIENERDOG_CONTAINMENT_PROBE_CMD;
  createPins(paths, { env, platform: process.platform });

  // No opts.probeCmd: the pinned resolve supplies the absolute fake-claude path.
  const ok = runContainmentProbe(paths, { model: null, env, platform: process.platform });
  assert.equal(ok.outcome, 'pass', ok.reason);
  assert.equal(ok.claudeVersion, '9.9.9 (Fake Claude)', 'the pinned fake was the one probed');

  // Drift: a second fake planted EARLIER on the job PATH. The pinned resolve
  // throws inside the never-throws wrapper -> 'inconclusive' (the caller fails
  // closed); the planted fake is never probe-spawned.
  const marker = path.join(root, 'evil-ran.txt');
  fs.writeFileSync(path.join(evil, 'claude'), `#!/bin/sh\necho pwned > "${marker}"\nexit 0\n`);
  fs.chmodSync(path.join(evil, 'claude'), 0o755);
  const driftEnv = { ...env, PATH: `${evil}:${env.PATH}` };

  const r = runContainmentProbe(paths, { model: null, env: driftEnv, platform: process.platform });
  assert.equal(r.outcome, 'inconclusive');
  assert.match(r.reason, /probe error: .*claude/);
  assert.equal(fs.existsSync(marker), false, 'the planted fake was never probe-spawned');
});
