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
      // Never touch the real OS scheduler: init/uninstall here register+unload
      // launchd agents, whose labels are per-user-global (NOT HOME-scoped) — a
      // temp-HOME run would still bootout the developer's real dream agent
      // (WP-071). NOOP neutralizes the loader AND the uninstall unload spawn.
      WIENERDOG_LOADER_NOOP: '1',
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

test('a clean uninstall deletes the manifest last, then the unmodified config, and removes the empty core', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  assert.ok(fs.existsSync(path.join(core, 'install-manifest.json')), 'init wrote the manifest');
  assert.ok(fs.existsSync(path.join(core, 'config.yaml')), 'init wrote config.yaml');
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /fully removed/);
  // Manifest + the unmodified config gone WITH the emptied core (deleted last,
  // then the core swept).
  assert.equal(fs.existsSync(path.join(core, 'config.yaml')), false, 'the unmodified config is deleted');
  assert.equal(fs.existsSync(core), false, 'the empty core is removed');
});

test('a clean uninstall summary does not list the swept core/state under "Skipped" (consistent with "fully removed")', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /fully removed/);
  // The core and its state dir were swept — they must NOT be reported as skipped,
  // which would contradict "fully removed".
  const skippedSection = r.stdout.includes('Skipped') ? r.stdout.slice(r.stdout.indexOf('Skipped')) : '';
  assert.doesNotMatch(skippedSection, new RegExp(`${core}(\\s|$)`), 'the swept core is not listed under Skipped');
  assert.doesNotMatch(skippedSection, new RegExp(path.join(core, 'state')), 'the swept state dir is not listed under Skipped');
  // On a fully-clean uninstall nothing is preserved, so no Skipped section at all.
  assert.doesNotMatch(r.stdout, /Skipped \d+ item/);
});

test('uninstall keeps the manifest when disposeCoreMechanics throws mid-sweep (recovery ledger intact)', async () => {
  const { core, env } = tempEnv();
  // Build a real install via the CLI (subprocess), then drive run() IN-PROCESS so
  // we can inject a throwing disposeCoreMechanics between reverse() and the
  // manifest deletion — proving a crash there leaves a replayable ledger.
  run(['init', '--yes'], env);
  const manifestPath = path.join(core, 'install-manifest.json');
  assert.ok(fs.existsSync(manifestPath));

  const manifestLib = require('../../src/core/manifest');
  const { run: runUninstall } = require('../../src/cli/uninstall');
  const origDispose = manifestLib.disposeCoreMechanics;
  const savedEnv = { ...process.env };
  Object.assign(process.env, env); // getPaths() reads env at call time
  manifestLib.disposeCoreMechanics = () => {
    throw new Error('boom mid-sweep');
  };
  let threw = false;
  try {
    await runUninstall(['--yes']);
  } catch {
    threw = true;
  } finally {
    manifestLib.disposeCoreMechanics = origDispose;
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
  assert.ok(threw, 'the injected dispose throw propagates out of run()');
  assert.equal(
    fs.existsSync(manifestPath),
    true,
    'the manifest ledger survives a crash during the mechanics sweep — uninstall can be re-run'
  );
  assert.equal(
    fs.existsSync(path.join(core, 'config.yaml')),
    true,
    'config.yaml also survives the crash — its vault: line is the retry vault-path source'
  );
});

/**
 * Nest a vault INSIDE the core's state/ dir, point config.yaml at it, re-sync the
 * manifest hash (so the rewrite is not mistaken for a user edit), and record a
 * vault-file entry. Mirrors the legacy/hand-edited install the regression guards.
 * @param {string} core @returns {{nestedVault:string, precious:string}}
 */
function nestVaultInState(core) {
  const crypto = require('node:crypto');
  const nestedVault = path.join(core, 'state', 'mynotes');
  fs.mkdirSync(nestedVault, { recursive: true });
  const precious = path.join(nestedVault, 'precious-note.md');
  fs.writeFileSync(precious, '# precious\n');
  const configPath = path.join(core, 'config.yaml');
  const cfg = fs.readFileSync(configPath, 'utf8').replace(/^vault:.*$/m, `vault: ${nestedVault}`);
  fs.writeFileSync(configPath, cfg);
  const manifestPath = path.join(core, 'install-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const cfgEntry = manifest.entries.find((e) => e.kind === 'file' && e.path === configPath);
  cfgEntry.hash = crypto.createHash('sha256').update(cfg).digest('hex');
  manifest.entries.push({ kind: 'vault-file', path: precious });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { nestedVault, precious };
}

test('crashed-then-retried uninstall with a NESTED vault: retry re-reads config.yaml and the nested vault survives (config-deferral regression)', async () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const { precious } = nestVaultInState(core);
  const manifestPath = path.join(core, 'install-manifest.json');
  const configPath = path.join(core, 'config.yaml');

  const manifestLib = require('../../src/core/manifest');
  const { run: runUninstall } = require('../../src/cli/uninstall');
  const origDispose = manifestLib.disposeCoreMechanics;
  const savedEnv = { ...process.env };
  Object.assign(process.env, env); // getPaths() reads env at call time
  try {
    // ── Attempt 1: crash INSIDE disposeCoreMechanics (before it sweeps). ──
    manifestLib.disposeCoreMechanics = () => {
      throw new Error('boom mid-sweep');
    };
    let threw = false;
    try {
      await runUninstall(['--yes']);
    } catch {
      threw = true;
    }
    manifestLib.disposeCoreMechanics = origDispose; // real dispose for the retry
    assert.ok(threw, 'attempt 1 crashes in the sweep');
    // The deferred set + the nested vault all survive the crash → a retry is safe.
    assert.equal(fs.existsSync(manifestPath), true, 'ledger survives the crash');
    assert.equal(fs.existsSync(configPath), true, 'config.yaml (vault-path source) survives the crash');
    assert.equal(fs.readFileSync(precious, 'utf8'), '# precious\n', 'nested vault untouched after the crash');

    // ── Attempt 2: a REAL retry re-reads the surviving config.yaml. ──
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    try {
      await runUninstall(['--yes']);
    } finally {
      console.log = origLog;
    }
    const out = logs.join('\n');
    // The nested vault SURVIVES the crashed-then-retried uninstall (skippedForVault).
    assert.equal(
      fs.readFileSync(precious, 'utf8'),
      '# precious\n',
      'the nested vault survives the crashed-then-retried uninstall'
    );
    assert.match(out, /left in place|still lives inside it/, 'the retry reports the vault was protected (skippedForVault)');
    assert.equal(fs.existsSync(core), true, 'core kept — it still holds the nested vault');
  } finally {
    manifestLib.disposeCoreMechanics = origDispose;
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
});

test('manifest-delete FAILURE injection: run() aborts with WienerdogError, config NOT deleted, and a real retry keeps a nested vault', async () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const { precious } = nestVaultInState(core);
  const manifestPath = path.join(core, 'install-manifest.json');
  const configPath = path.join(core, 'config.yaml');
  const configContent = fs.readFileSync(configPath, 'utf8');

  const { run: runUninstall } = require('../../src/cli/uninstall');
  const { WienerdogError } = require('../../src/core/errors');
  const savedEnv = { ...process.env };
  Object.assign(process.env, env);
  const origRmSync = fs.rmSync;
  try {
    // ── Stub ONLY the manifest deletion to throw (real err.code), delegate every
    //    other rmSync to the real filesystem (no verification is stubbed — the
    //    gate is rmSync's own outcome). ──
    fs.rmSync = (target, opts) => {
      if (target === manifestPath) {
        const err = new Error('permission denied');
        err.code = 'EACCES';
        throw err;
      }
      return origRmSync(target, opts);
    };
    let caught = null;
    try {
      await runUninstall(['--yes']);
    } catch (e) {
      caught = e;
    }
    fs.rmSync = origRmSync; // lift the stub before observing / retrying

    assert.ok(caught instanceof WienerdogError, 'run() rejects with WienerdogError on a manifest-delete failure');
    assert.match(caught.message, /could not remove the install manifest \(EACCES\)/);
    // The manifest is still present (delete threw) and config was NOT deleted →
    // manifest-present + config-present, so a retry stays vault-safe.
    assert.equal(fs.existsSync(manifestPath), true, 'the ledger remains after the failed delete');
    assert.equal(fs.existsSync(configPath), true, 'config.yaml was NOT deleted after the manifest-delete failure');
    assert.equal(fs.readFileSync(configPath, 'utf8'), configContent, 'config.yaml is untouched on disk');
    assert.equal(fs.readFileSync(precious, 'utf8'), '# precious\n', 'nested vault intact on the delete-failure path');

    // ── A subsequent REAL retry (stub lifted) completes and keeps the nested vault. ──
    await runUninstall(['--yes']);
    assert.equal(
      fs.readFileSync(precious, 'utf8'),
      '# precious\n',
      'the nested vault survives the retry after the delete-failure abort'
    );
    assert.equal(fs.existsSync(core), true, 'core kept — it still holds the nested vault');
  } finally {
    fs.rmSync = origRmSync;
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
});

test('deferred config re-verify (TOCTOU): a config.yaml edited DURING the sweep is PRESERVED, not deleted', async () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const configPath = path.join(core, 'config.yaml');

  const manifestLib = require('../../src/core/manifest');
  const { run: runUninstall } = require('../../src/cli/uninstall');
  const origDispose = manifestLib.disposeCoreMechanics;
  const savedEnv = { ...process.env };
  Object.assign(process.env, env);
  // Capture the keep-notice emitted at the delete site.
  const origErrWrite = process.stderr.write.bind(process.stderr);
  let errOut = '';
  const editedContent = 'user edited config DURING uninstall\n';
  let calls = 0;
  // reverse() proves config unmodified and defers it. The FIRST disposeCoreMechanics
  // runs BETWEEN reverse() and the deferred config delete — the exact TOCTOU window.
  // Mutate config there to simulate the user editing it mid-uninstall, then delegate
  // to the real sweep.
  manifestLib.disposeCoreMechanics = (p, opts) => {
    calls += 1;
    if (calls === 1) fs.writeFileSync(configPath, editedContent);
    return origDispose(p, opts);
  };
  process.stderr.write = (chunk) => {
    errOut += chunk;
    return true;
  };
  try {
    await runUninstall(['--yes']);
  } finally {
    manifestLib.disposeCoreMechanics = origDispose;
    process.stderr.write = origErrWrite;
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
  // The re-verify at the delete site sees the mismatched hash → PRESERVE. The user's
  // mid-uninstall edit survives byte-identical; it is NOT deleted.
  assert.equal(fs.existsSync(configPath), true, 'the edited config is preserved, not deleted');
  assert.equal(fs.readFileSync(configPath, 'utf8'), editedContent, 'the user edit survives byte-identical');
  assert.match(errOut, /keeping .*config\.yaml — modified since install/, 'a keep-notice is emitted at the delete site');
  // A now-customized config keeps the core alive (core non-empty).
  assert.equal(fs.existsSync(core), true, 'core kept — the edited config remains in it');
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
