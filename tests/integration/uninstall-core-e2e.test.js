'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

/** Isolated temp HOME with env overrides (never touches real config dirs). The
 *  vault lives OUTSIDE the core by construction (WIENERDOG_VAULT vs WIENERDOG_HOME).
 *  WIENERDOG_LOADER_NOOP neutralizes the OS scheduler so init/sync never spawn
 *  launchctl/systemctl/schtasks. */
function tempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-uninstall-e2e-'));
  const core = path.join(root, 'wd');
  const vault = path.join(root, 'vault');
  return {
    root,
    core,
    vault,
    env: {
      ...process.env,
      HOME: root,
      WIENERDOG_HOME: core,
      WIENERDOG_VAULT: vault,
      CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
      CODEX_HOME: path.join(root, 'absent-codex'),
      // Table D row D14 (WP-scheduler-replay-manifest-independent): the systemd
      // user dir derives from $XDG_CONFIG_HOME, which a HOME redirect does NOT
      // move — so spreading `...process.env` above would point it at the
      // DEVELOPER'S OWN ~/.config/systemd/user while this run holds
      // WIENERDOG_ALLOW_REAL_SCHEDULER=1. Pin it inside `root`.
      XDG_CONFIG_HOME: path.join(root, '.config'),
      WIENERDOG_LOADER_NOOP: '1',
      // Table T's subprocess channel (ADR-0041): a subprocess has only the
      // environment, so the one non-dry-run uninstall below is granted the real
      // product authority predicate rather than being told a falsehood about the
      // domain. The mutation it permits is still neutralized by the NOOP above —
      // Table A row 1 sits ahead of the authorized-spawn row.
      WIENERDOG_ALLOW_REAL_SCHEDULER: '1',
    },
  };
}

/** @param {string[]} args @param {NodeJS.ProcessEnv} env */
function run(args, env) {
  try {
    const stdout = execFileSync('node', [bin, ...args], { env, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

/** Map every file under dir to the sha256 of its bytes (the treasure invariant). */
function shaTree(dir) {
  /** @type {Record<string, string>} */
  const out = {};
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(dir, full)] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

test('uninstall-core-e2e: init --fresh-vault → sync → uninstall leaves ONLY the vault, byte-identical', () => {
  const { core, vault, env } = tempEnv();

  // 1. init a fresh default vault + core, then sync (writes state/digest.md).
  const initRes = run(['init', '--fresh-vault', '--yes'], env);
  assert.equal(initRes.status, 0, initRes.stderr);
  assert.ok(fs.existsSync(vault), 'fresh vault seeded');
  const syncRes = run(['sync'], env);
  assert.equal(syncRes.status, 0, syncRes.stderr);
  assert.ok(fs.existsSync(path.join(core, 'state', 'digest.md')), 'sync wrote state/digest.md');

  // 2. Plant untracked runtime artifacts (as if Google-connected / dream logged /
  //    Windows-scheduled) so the recursive sweep is exercised without real I/O.
  fs.mkdirSync(path.join(core, 'secrets'), { recursive: true });
  fs.writeFileSync(path.join(core, 'secrets', 'google-token.json'), '{"token":"x"}\n');
  fs.mkdirSync(path.join(core, 'logs', 'dream'), { recursive: true });
  fs.writeFileSync(path.join(core, 'logs', 'dream', '2026-07-06.log'), 'run\n');
  fs.mkdirSync(path.join(core, 'schedules'), { recursive: true });
  fs.writeFileSync(path.join(core, 'schedules', 'wienerdog-dream.xml'), '<Task/>\n');

  // 3. Snapshot the vault tree by content BEFORE uninstall (the treasure invariant).
  const before = shaTree(vault);
  assert.ok(Object.keys(before).length > 0, 'vault has seeded files to protect');

  // 4. uninstall --yes.
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /was left untouched \(\d+ files\) — your notes are yours\./);
  assert.match(r.stdout, /fully removed/);

  // 5. The core (incl. all untracked artifacts) is GONE.
  assert.equal(fs.existsSync(core), false, '~/.wienerdog is gone');

  // 6. The vault survives BYTE-IDENTICAL — nothing added, removed, or altered.
  assert.equal(fs.existsSync(vault), true, 'vault preserved');
  const after = shaTree(vault);
  assert.deepEqual(after, before, 'vault tree is byte-identical before and after uninstall');
});

test('uninstall-core-e2e AC15/AC16: XDG_CONFIG_HOME is sandboxed, and an EXTERNAL one contributes no discovery root', () => {
  const { root, core, env } = tempEnv();

  // AC16, asserted by the test's OWN environment rather than by inspection: the
  // value tempEnv() passes resolves under its root (Table D row D14).
  assert.equal(env.XDG_CONFIG_HOME, path.join(root, '.config'), 'XDG_CONFIG_HOME is inside the temp HOME');
  fs.mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });
  const rel = path.relative(fs.realpathSync(root), fs.realpathSync(env.XDG_CONFIG_HOME));
  assert.ok(rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel),
    `XDG_CONFIG_HOME resolves under root (relative path was ${JSON.stringify(rel)})`);

  assert.equal(run(['init', '--fresh-vault', '--yes'], env).status, 0);

  // AC15: a systemd unit under an XDG root OUTSIDE this run's HOME is left on
  // disk, untouched — this is the `npm test` deletes-a-developer's-timer case.
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-xdg-external-'));
  const externalUnits = path.join(external, 'systemd', 'user');
  fs.mkdirSync(externalUnits, { recursive: true });
  const externalTimer = path.join(externalUnits, 'wienerdog-dream.timer');
  fs.writeFileSync(externalTimer, '[Timer]\n');
  const externalBytes = fs.readFileSync(externalTimer);

  const r = run(['uninstall', '--yes'], { ...env, XDG_CONFIG_HOME: external });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(externalTimer), true, 'the external timer survives');
  assert.deepEqual(fs.readFileSync(externalTimer), externalBytes, 'byte-identical');
  assert.ok(!r.stdout.includes(externalTimer), 'and it appeared in no disclosed plan');
  assert.equal(fs.existsSync(core), false, 'the uninstall itself completed');
});
