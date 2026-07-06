'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

/** Isolated temp HOME with env overrides (never touches real config dirs). */
function tempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-uninstall-'));
  const core = path.join(root, 'wd');
  return {
    root,
    core,
    env: {
      ...process.env,
      // Isolate HOME so the PATH shim (~/.local/bin/wienerdog, WP-042) is written
      // to — and removed from — the temp tree, never the developer's real
      // ~/.local/bin. Detection uses the config-dir overrides below.
      HOME: root,
      WIENERDOG_HOME: core,
      WIENERDOG_VAULT: path.join(root, 'vault'),
      CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
      CODEX_HOME: path.join(root, 'absent-codex'),
    },
  };
}

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * @returns {{status: number, stdout: string, stderr: string}}
 */
function run(args, env) {
  try {
    const stdout = execFileSync('node', [bin, ...args], { env, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

/** Snapshot every file under dir as path -> "size:mtime". */
function snapshot(dir) {
  /** @type {Record<string, string>} */
  const out = {};
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const s = fs.statSync(full);
        out[full] = `${s.size}:${s.mtimeMs}`;
      }
    }
  };
  walk(dir);
  return out;
}

test('uninstall --dry-run lists manifest contents and changes nothing', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const before = snapshot(core);
  const r = run(['uninstall', '--dry-run'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /config\.yaml/);
  assert.match(r.stdout, /\[dir\]/);
  assert.match(r.stdout, /would be removed/);
  assert.ok(fs.existsSync(core));
  assert.deepEqual(snapshot(core), before);
});

test('uninstall --yes removes the entire core', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Removed/);
  assert.equal(fs.existsSync(core), false);
});

test('uninstall --yes removes the PATH shim (WP-042)', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  const shim = path.join(root, '.local', 'bin', 'wienerdog');
  assert.ok(fs.existsSync(shim), 'init wrote the ~/.local/bin/wienerdog shim');
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(shim), false, 'uninstall removed the shim');
  assert.equal(fs.existsSync(core), false);
});

test('uninstall keeps a user-modified config.yaml', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  fs.writeFileSync(path.join(core, 'config.yaml'), 'edited by the user\n');
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.ok(fs.existsSync(path.join(core, 'config.yaml')));
  assert.match(r.stdout, /Skipped/);
});

test('uninstall exits 0 when some entries were already gone', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  fs.rmSync(path.join(core, 'logs'), { recursive: true });
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(core), false);
});

test('uninstall without an install errors (exit 1)', () => {
  const { env } = tempEnv();
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /wienerdog: .*nothing to uninstall/);
});

test('uninstall --yes prints ONE vault-preserve line, no per-file dump, keeps the vault (Finding A)', () => {
  const { env } = tempEnv();
  const vaultDir = env.WIENERDOG_VAULT;
  run(['init', '--fresh-vault', '--yes'], env);
  assert.ok(fs.existsSync(vaultDir), 'fresh vault was seeded');
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  // Exactly one plain-language reassurance line, never a per-file list.
  const vaultLines = r.stdout
    .split('\n')
    .filter((l) => /was left untouched \(\d+ files\) — your notes are yours\./.test(l));
  assert.equal(vaultLines.length, 1, 'exactly one vault-preserve line');
  assert.match(vaultLines[0], new RegExp(`Your memory vault at ${vaultDir} was left untouched`));
  // No "unknown kind" wording for vault-file. The top "will be removed" preview
  // lists every entry by kind (unchanged), but the vault files must NOT reappear
  // as a per-file dump under the "Skipped" heading.
  assert.doesNotMatch(r.stderr, /unknown manifest entry kind 'vault-file'/);
  const skippedSection = r.stdout.includes('Skipped') ? r.stdout.slice(r.stdout.indexOf('Skipped')) : '';
  assert.doesNotMatch(skippedSection, new RegExp(vaultDir), 'no vault path listed under Skipped');
  // Core gone; vault directory (the treasure) still present with its files.
  assert.equal(fs.existsSync(env.WIENERDOG_HOME), false, 'core removed');
  assert.equal(fs.existsSync(vaultDir), true, 'vault preserved');
});

test('uninstall --yes sweeps untracked state/logs/secrets/schedules and leaves the core gone', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  // Plant runtime artifacts the manifest never tracks (as if synced / ran / connected Google).
  fs.mkdirSync(path.join(core, 'state', 'scratch'), { recursive: true });
  fs.writeFileSync(path.join(core, 'state', 'digest.md'), '# digest\n');
  fs.mkdirSync(path.join(core, 'logs', 'dream'), { recursive: true });
  fs.writeFileSync(path.join(core, 'logs', 'dream', '2026-07-06.log'), 'run\n');
  fs.mkdirSync(path.join(core, 'schedules'), { recursive: true });
  fs.writeFileSync(path.join(core, 'schedules', 'wienerdog-dream.xml'), '<Task/>\n');
  fs.mkdirSync(path.join(core, 'secrets'), { recursive: true });
  fs.writeFileSync(path.join(core, 'secrets', 'google-token.json'), '{}\n');

  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /fully removed/);
  assert.equal(fs.existsSync(core), false, 'core swept clean including untracked artifacts');
});

test('uninstall --dry-run lists the recursive core cleanup and changes nothing', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  fs.mkdirSync(path.join(core, 'state'), { recursive: true });
  fs.writeFileSync(path.join(core, 'state', 'digest.md'), '# digest\n');
  const before = snapshot(core);
  const r = run(['uninstall', '--dry-run'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Machine-generated state \(removed recursively, not manifest-tracked\):/);
  assert.match(r.stdout, /the canonical core — removed once empty/);
  assert.ok(fs.existsSync(core));
  assert.deepEqual(snapshot(core), before);
});

test('uninstall never deletes a vault nested inside state/ — survives with the honest note (regression)', () => {
  // Reviewer repro: a legacy/hand-edited install whose vault sits INSIDE the
  // core's state/ dir (adopt now refuses this up front; we simulate it by
  // writing config directly). Pre-guard, disposeCoreMechanics recursively
  // deleted state/ WITH the vault while printing "your notes are yours."
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const crypto = require('node:crypto');
  const nestedVault = path.join(core, 'state', 'mynotes');
  fs.mkdirSync(nestedVault, { recursive: true });
  const precious = path.join(nestedVault, 'precious-note.md');
  fs.writeFileSync(precious, '# precious\n');
  // Point config at the nested vault and re-sync the manifest hash (as adopt
  // would), so the config rewrite is not mistaken for a user edit.
  const configPath = path.join(core, 'config.yaml');
  const cfg = fs.readFileSync(configPath, 'utf8').replace(/^vault:.*$/m, `vault: ${nestedVault}`);
  fs.writeFileSync(configPath, cfg);
  const manifestPath = path.join(core, 'install-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const cfgEntry = manifest.entries.find((e) => e.kind === 'file' && e.path === configPath);
  cfgEntry.hash = crypto.createHash('sha256').update(cfg).digest('hex');
  manifest.entries.push({ kind: 'vault-file', path: precious });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  // The vault SURVIVES — the treasure invariant holds even nested in the core.
  assert.equal(fs.readFileSync(precious, 'utf8'), '# precious\n', 'nested vault file survives');
  // The honest variant is printed; the plain reassurance NEVER appears alone.
  assert.match(
    r.stdout,
    /was left untouched \(1 files\) — your notes are yours\. Note: it sits inside Wienerdog's own folder \(.*state\), which was therefore left in place — consider moving it somewhere of your own\./
  );
  const plainAlone = r.stdout
    .split('\n')
    .filter((l) => /your notes are yours\.\s*$/.test(l) && !/Note: it sits inside/.test(l));
  assert.deepEqual(plainAlone, [], 'no false plain reassurance line');
  // The core is kept (it still holds the vault), and says why.
  assert.equal(fs.existsSync(core), true);
  assert.match(r.stdout, /your memory vault still lives inside it/);
  assert.doesNotMatch(r.stdout, /fully removed/);
});

test('uninstall --yes with a symlinked core exits 0 and unlinks the link (target dir kept)', () => {
  const { root, env } = tempEnv();
  // The core path is a symlink to a real dir the user made themselves.
  const realCore = path.join(root, 'real-core');
  fs.mkdirSync(realCore, { recursive: true });
  fs.symlinkSync(realCore, env.WIENERDOG_HOME);
  run(['init', '--yes'], env);
  // Untracked state content, so reverse() leaves state/ + core to the sweep.
  fs.writeFileSync(path.join(realCore, 'state', 'digest.md'), '# digest\n');

  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0, `expected exit 0, stderr: ${r.stderr}`);
  assert.equal(fs.existsSync(env.WIENERDOG_HOME), false, 'core symlink unlinked');
  assert.equal(fs.lstatSync(realCore).isDirectory(), true, 'the user-made target dir remains');
  assert.deepEqual(fs.readdirSync(realCore), [], 'target dir emptied of mechanics');
});
