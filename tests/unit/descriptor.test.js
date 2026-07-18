'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const descriptor = require('../../src/scheduler/descriptor');
const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');

const DREAM_JOB = { name: 'dream', run: 'builtin:dream', timeoutMinutes: 20 };

/**
 * A temp core with a minimal vendored app tree (app/current → app/0.0.1) and a
 * vault-carrying config, plus optional WP-154 exec pins — everything
 * buildDescriptor reads.
 */
function setup({ pins = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-descr-'));
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(paths.config, `version: 1\nvault: ${path.join(root, 'vault')}\n`);

  const versionDir = path.join(paths.core, 'app', '0.0.1');
  fs.mkdirSync(path.join(versionDir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(versionDir, 'package.json'), '{"version":"0.0.1"}\n');
  fs.writeFileSync(path.join(versionDir, 'bin', 'wienerdog.js'), '// app\n');
  fs.symlinkSync(versionDir, path.join(paths.core, 'app', 'current'));

  if (pins) {
    fs.writeFileSync(
      path.join(paths.state, 'exec-pins.json'),
      JSON.stringify({
        schema: 1,
        pins: {
          claude: { commandPath: '/x/bin/claude', installDir: '/x/share/claude/versions', version: '9.9', pinnedAt: 't' },
          git: { commandPath: '/usr/bin/git', installDir: '/usr/bin', version: 'git 2.99', pinnedAt: 't' },
        },
      }),
      { mode: 0o600 }
    );
  }
  return { root, paths };
}

test('descriptor: deriveDescriptorDigest is deterministic for unchanged inputs', () => {
  const { paths } = setup();
  const a = descriptor.deriveDescriptorDigest(paths, DREAM_JOB);
  const b = descriptor.deriveDescriptorDigest(paths, DREAM_JOB);
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a, b);
});

test('descriptor: every covered input changes the digest (run, vault, model, timeout, pin, app tree)', () => {
  const { paths } = setup();
  const base = descriptor.deriveDescriptorDigest(paths, DREAM_JOB);
  const digests = new Set([base]);
  const mustDiffer = (label, digest) => {
    assert.ok(!digests.has(digest), `${label} must change the digest`);
    digests.add(digest);
  };

  // vault root (config `vault`)
  mustDiffer('vaultRoot', descriptor.deriveDescriptorDigest(paths, DREAM_JOB, { vaultRoot: '/elsewhere' }));
  // model (config `dream_model`; null = unset default)
  mustDiffer('model', descriptor.deriveDescriptorDigest(paths, DREAM_JOB, { model: 'opus' }));
  // effective timeout (config `dream_timeout_minutes`)
  mustDiffer('timeoutMs', descriptor.deriveDescriptorDigest(paths, DREAM_JOB, { timeoutMs: 300_000 }));

  // an exec pin (command path moves)
  const pinsFile = path.join(paths.state, 'exec-pins.json');
  const store = JSON.parse(fs.readFileSync(pinsFile, 'utf8'));
  store.pins.claude.commandPath = '/tmp/evil/claude';
  fs.writeFileSync(pinsFile, JSON.stringify(store));
  mustDiffer('exec pin', descriptor.deriveDescriptorDigest(paths, DREAM_JOB));

  // the app tree bytes
  fs.appendFileSync(path.join(paths.core, 'app', '0.0.1', 'bin', 'wienerdog.js'), '// edited\n');
  mustDiffer('app tree', descriptor.deriveDescriptorDigest(paths, DREAM_JOB));
});

test('descriptor: pin version/pinnedAt do NOT drift the digest (auto-update stays silent)', () => {
  const { paths } = setup();
  const base = descriptor.deriveDescriptorDigest(paths, DREAM_JOB);
  const pinsFile = path.join(paths.state, 'exec-pins.json');
  const store = JSON.parse(fs.readFileSync(pinsFile, 'utf8'));
  store.pins.claude.version = '10.0 (auto-updated)';
  store.pins.claude.pinnedAt = 'later';
  fs.writeFileSync(pinsFile, JSON.stringify(store));
  assert.equal(descriptor.deriveDescriptorDigest(paths, DREAM_JOB), base);
});

test('descriptor: appTreeDigest is stable and changes on byte change, file add, and file remove', () => {
  const { paths } = setup();
  const a = descriptor.appTreeDigest(paths);
  assert.equal(descriptor.appTreeDigest(paths), a, 'stable across calls');

  const extra = path.join(paths.core, 'app', '0.0.1', 'extra.txt');
  fs.writeFileSync(extra, 'x');
  const b = descriptor.appTreeDigest(paths);
  assert.notEqual(b, a, 'file add changes the digest');

  fs.appendFileSync(extra, 'y');
  const c = descriptor.appTreeDigest(paths);
  assert.notEqual(c, b, 'byte change changes the digest');

  fs.rmSync(extra);
  assert.equal(descriptor.appTreeDigest(paths), a, 'file remove restores the original digest');
});

test('descriptor: canonicalize sorts keys recursively — insertion order never matters', () => {
  const a = descriptor.canonicalize({ b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } });
  const b = descriptor.canonicalize({ a: { c: [{ e: 4, f: 3 }], d: 2 }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"c":[{"e":4,"f":3}],"d":2},"b":1}');
});

test('descriptor: buildDescriptor fields — schema, profile, stance, exec identity only', () => {
  const { paths } = setup();
  const d = descriptor.buildDescriptor(paths, DREAM_JOB);
  assert.equal(d.schema, 1);
  assert.equal(d.job, 'dream');
  assert.equal(d.run, 'builtin:dream');
  assert.equal(d.profileId, 'dream');
  assert.match(d.promptHash, /^sha256:/);
  assert.equal(d.timeoutMs, 1_200_000, 'effective default: 20 min in ms (readDreamConfig)');
  assert.equal(d.model, null, 'dream_model unset → null (no --model)');
  assert.equal(d.node, process.execPath);
  assert.deepEqual(d.exec.claude, { commandPath: '/x/bin/claude', installDir: '/x/share/claude/versions' });
  assert.deepEqual(d.exec.git, { commandPath: '/usr/bin/git', installDir: '/usr/bin' });
  assert.equal(d.appRelease.version, '0.0.1');
  assert.match(d.appRelease.treeDigest, /^sha256:/);
  assert.equal(d.appRelease.stance, 'prod', 'no .git in the fixture tree');
});

test('descriptor: config dream_model and dream_timeout_minutes feed the descriptor (same read as the spawn)', () => {
  const { root, paths } = setup();
  fs.writeFileSync(
    paths.config,
    `version: 1\nvault: ${path.join(root, 'vault')}\ndream_model: opus\ndream_timeout_minutes: 5\n`
  );
  const d = descriptor.buildDescriptor(paths, DREAM_JOB);
  assert.equal(d.model, 'opus');
  assert.equal(d.timeoutMs, 300_000, 'EFFECTIVE cfg.timeoutMs, not job.timeoutMinutes');
});

test('descriptor: writeDescriptor writes 0600 canonical bytes, idempotent second write', () => {
  const { paths } = setup();
  const first = descriptor.writeDescriptor(paths, DREAM_JOB);
  assert.equal(first.path, path.join(paths.state, 'descriptors', 'dream.json'));
  assert.equal(first.changed, true);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o600);
  const bytes = fs.readFileSync(first.path);

  const second = descriptor.writeDescriptor(paths, DREAM_JOB);
  assert.equal(second.changed, false, 'unchanged inputs ⇒ byte-identical no-op');
  assert.equal(second.digest, first.digest);
  assert.ok(fs.readFileSync(first.path).equals(bytes));

  // The stored digest matches the re-derived one while inputs are unchanged.
  assert.equal(descriptor.deriveDescriptorDigest(paths, DREAM_JOB), first.digest);
});

test('descriptor: a config run-action drift is detectable — stored digest vs re-derived digest diverge', () => {
  const { paths } = setup();
  const { digest } = descriptor.writeDescriptor(paths, DREAM_JOB);
  // The F1 attack: a scoped write flips the job's run action in config.yaml
  // without re-registering anything. Re-derivation exposes it.
  const drifted = descriptor.deriveDescriptorDigest(paths, { ...DREAM_JOB, run: 'skill:wienerdog-weekly-review' });
  assert.notEqual(drifted, digest, 'run-action rewrite yields a different digest');
});

test('descriptor: unknown run kinds and unprofiled skills fail closed', () => {
  const { paths } = setup();
  assert.throws(() => descriptor.buildDescriptor(paths, { name: 'x', run: 'builtin:frobnicate' }), WienerdogError);
  assert.throws(() => descriptor.buildDescriptor(paths, { name: 'x', run: 'weird:thing' }), WienerdogError);
  assert.throws(() => descriptor.buildDescriptor(paths, { name: 'x', run: 'skill:attacker-skill' }), WienerdogError);
});

test('descriptor: a dev-checkout app records stance dev', () => {
  const { paths } = setup();
  fs.mkdirSync(path.join(paths.core, 'app', '0.0.1', '.git')); // isDevCheckout marker
  const d = descriptor.buildDescriptor(paths, DREAM_JOB);
  assert.equal(d.appRelease.stance, 'dev');
});
