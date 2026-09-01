'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

// Table T: the IN-PROCESS channel must be authority-FREE, or the gate never arms
// and every injected probe below becomes a dead seam that keeps passing after the
// in-process path breaks. `tempEnv()` spreads `...process.env` and the
// in-process tests splat that back with `Object.assign(process.env, env)`, so an
// ambient WIENERDOG_ALLOW_REAL_SCHEDULER=1 in the launching shell would leak
// straight through both hops. Strip it once, here, before any env object is
// built; `runUninstallCli()` re-adds it on the SUBPROCESS env only.
delete process.env.WIENERDOG_ALLOW_REAL_SCHEDULER;

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
      // Isolate the systemd user dir too: it derives from XDG_CONFIG_HOME (falling
      // back to HOME/.config). The CI Linux runners SET XDG_CONFIG_HOME on the
      // host, which — spread in above — would otherwise point systemdUserDir()
      // outside `root`, so a planted `root/.config/systemd/user/*.timer` entry
      // reads as "not in a scheduler root" and its unregister is never derived.
      XDG_CONFIG_HOME: path.join(root, '.config'),
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

/**
 * A SUBPROCESS uninstall (Table T's environment channel, ADR-0041). The
 * authority marker travels on the env handed to THIS invocation only — never in
 * `tempEnv()`'s `env` object, which the in-process tests below splat into
 * `process.env` (`Object.assign(process.env, env)`). Putting it there would grant
 * authority to those calls too, the deletion-clearance gate would never arm, and
 * their injected probes would be dead seams that keep passing after the
 * in-process path breaks.
 *
 * This is not a switch that suppresses a check: it is the product's real
 * authority predicate, supplied through the only channel a subprocess has, and
 * the mutation it permits is still neutralized by WIENERDOG_LOADER_NOOP — Table A
 * row 1 sits ahead of the authorized-spawn row.
 * @param {string[]} args @param {NodeJS.ProcessEnv} env
 */
function runUninstallCli(args, env) {
  return run(args, { ...env, WIENERDOG_ALLOW_REAL_SCHEDULER: '1' });
}

/**
 * An IN-PROCESS probe seam (Table T's other channel): authority is ABSENT, so
 * the gate arms and decides — on evidence this test supplies. Counts its calls so
 * a test can assert the seam was actually consulted; a seam that is never called
 * cannot be told apart from a broken gate by its return value alone.
 * @param {'clean'|'live'} [status] @param {string[]} [identifiers]
 */
function cleanProbe(status = 'clean', identifiers = []) {
  /** @type {any} */
  const p = () => {
    p.calls += 1;
    return { status, identifiers };
  };
  p.calls = 0;
  return p;
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
  const r = runUninstallCli(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Removed/);
  assert.equal(fs.existsSync(core), false);
});

test('uninstall --yes removes the PATH shim (WP-042)', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  const shim = path.join(root, '.local', 'bin', 'wienerdog');
  assert.ok(fs.existsSync(shim), 'init wrote the ~/.local/bin/wienerdog shim');
  const r = runUninstallCli(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(shim), false, 'uninstall removed the shim');
  assert.equal(fs.existsSync(core), false);
});

test('uninstall keeps a user-modified config.yaml', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  fs.writeFileSync(path.join(core, 'config.yaml'), 'edited by the user\n');
  const r = runUninstallCli(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.ok(fs.existsSync(path.join(core, 'config.yaml')));
  assert.match(r.stdout, /Skipped/);
});

test('uninstall exits 0 when some entries were already gone', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  fs.rmSync(path.join(core, 'logs'), { recursive: true });
  const r = runUninstallCli(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(core), false);
});

test('uninstall without an install errors (exit 1)', () => {
  const { env } = tempEnv();
  const r = runUninstallCli(['uninstall', '--yes'], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /wienerdog: .*nothing to uninstall/);
});

test('uninstall --yes prints ONE vault-preserve line, no per-file dump, keeps the vault (Finding A)', () => {
  const { env } = tempEnv();
  const vaultDir = env.WIENERDOG_VAULT;
  run(['init', '--fresh-vault', '--yes'], env);
  assert.ok(fs.existsSync(vaultDir), 'fresh vault was seeded');
  const r = runUninstallCli(['uninstall', '--yes'], env);
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

  const r = runUninstallCli(['uninstall', '--yes'], env);
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

  const r = runUninstallCli(['uninstall', '--yes'], env);
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
  const r = runUninstallCli(['uninstall', '--yes'], env);
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
  const r = runUninstallCli(['uninstall', '--yes'], env);
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
  const probe = cleanProbe();
  let threw = false;
  try {
    await runUninstall(['--yes'], { probe });
  } catch {
    threw = true;
  } finally {
    manifestLib.disposeCoreMechanics = origDispose;
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
  assert.ok(threw, 'the injected dispose throw propagates out of run()');
  assert.equal(probe.calls, 1, 'the gate armed and consulted the injected probe');
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
    const probe1 = cleanProbe();
    let threw = false;
    try {
      await runUninstall(['--yes'], { probe: probe1 });
    } catch {
      threw = true;
    }
    manifestLib.disposeCoreMechanics = origDispose; // real dispose for the retry
    assert.ok(threw, 'attempt 1 crashes in the sweep');
    assert.equal(probe1.calls, 1, 'attempt 1 armed the gate and consulted its own probe');
    // The deferred set + the nested vault all survive the crash → a retry is safe.
    assert.equal(fs.existsSync(manifestPath), true, 'ledger survives the crash');
    assert.equal(fs.existsSync(configPath), true, 'config.yaml (vault-path source) survives the crash');
    assert.equal(fs.readFileSync(precious, 'utf8'), '# precious\n', 'nested vault untouched after the crash');

    // ── Attempt 2: a REAL retry re-reads the surviving config.yaml. ──
    const probe2 = cleanProbe(); // a SEPARATE probe: each attempt must be observed
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    try {
      await runUninstall(['--yes'], { probe: probe2 });
    } finally {
      console.log = origLog;
    }
    assert.equal(probe2.calls, 1, 'the retry armed the gate and consulted its own probe');
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
    const probe1 = cleanProbe();
    let caught = null;
    try {
      await runUninstall(['--yes'], { probe: probe1 });
    } catch (e) {
      caught = e;
    }
    fs.rmSync = origRmSync; // lift the stub before observing / retrying
    assert.equal(probe1.calls, 1, 'attempt 1 armed the gate and consulted its own probe');

    assert.ok(caught instanceof WienerdogError, 'run() rejects with WienerdogError on a manifest-delete failure');
    assert.match(caught.message, /could not remove the install manifest \(EACCES\)/);
    // The manifest is still present (delete threw) and config was NOT deleted →
    // manifest-present + config-present, so a retry stays vault-safe.
    assert.equal(fs.existsSync(manifestPath), true, 'the ledger remains after the failed delete');
    assert.equal(fs.existsSync(configPath), true, 'config.yaml was NOT deleted after the manifest-delete failure');
    assert.equal(fs.readFileSync(configPath, 'utf8'), configContent, 'config.yaml is untouched on disk');
    assert.equal(fs.readFileSync(precious, 'utf8'), '# precious\n', 'nested vault intact on the delete-failure path');

    // ── A subsequent REAL retry (stub lifted) completes and keeps the nested vault. ──
    const probe2 = cleanProbe(); // a SEPARATE probe: each attempt must be observed
    await runUninstall(['--yes'], { probe: probe2 });
    assert.equal(probe2.calls, 1, 'the retry armed the gate and consulted its own probe');
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
  const probe = cleanProbe();
  try {
    await runUninstall(['--yes'], { probe });
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
  assert.equal(probe.calls, 1, 'the gate armed and consulted the injected probe');
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

  const r = runUninstallCli(['uninstall', '--yes'], env);
  assert.equal(r.status, 0, `expected exit 0, stderr: ${r.stderr}`);
  assert.equal(fs.existsSync(env.WIENERDOG_HOME), false, 'core symlink unlinked');
  assert.equal(fs.lstatSync(realCore).isDirectory(), true, 'the user-made target dir remains');
  assert.deepEqual(fs.readdirSync(realCore), [], 'target dir emptied of mechanics');
});

test('WP-144 uninstall: a poisoned external path is preserved and a malformed settings entry no longer wedges the uninstall', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);

  // Poison the (untrusted, plaintext) manifest by hand, like an attacker or a
  // corrupted edit would: an external user file + a malformed settings target.
  const taxes = path.join(root, 'taxes.pdf');
  fs.writeFileSync(taxes, 'precious user bytes');
  const badSettings = path.join(root, 'absent-claude', 'settings.json');
  fs.mkdirSync(path.dirname(badSettings), { recursive: true });
  fs.writeFileSync(badSettings, '{ not json at all');
  const manifestPath = path.join(core, 'install-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  // Prepend so the reverse-order loop hits them LAST — after real entries — and
  // append one too so they bracket the sweep either way.
  manifest.entries.unshift({ kind: 'file', path: taxes });
  manifest.entries.push({ kind: 'settings-entry', path: badSettings, commands: ['x'] });
  manifest.entries.push({ kind: 'file', path: 42 });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const r = runUninstallCli(['uninstall', '--yes'], env);

  assert.equal(r.status, 0, r.stderr);
  // (The test-runner `run` helper captures stderr only on failure, so the
  // "preserving … outside every Wienerdog-owned root" notice is asserted in
  // manifest.test.js; here the on-disk preservation is the proof.)
  assert.equal(fs.readFileSync(taxes, 'utf8'), 'precious user bytes', 'external file preserved');
  assert.equal(fs.readFileSync(badSettings, 'utf8'), '{ not json at all', 'malformed settings left in place');
  assert.equal(fs.existsSync(core), false, 'the core (and its manifest) is fully removed — not wedged');
});

test('WP-144/F31 reverse: an UNREADABLE config no longer aborts the sweep — later entries still reverse, ledger retained for deletion', (t) => {
  const isPosix = process.platform !== 'win32';
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (!isPosix || isRoot) return t.skip('needs POSIX permission enforcement (non-root)');
  const crypto = require('node:crypto');
  const { getPaths } = require('../../src/core/paths');
  const manifestLib = require('../../src/core/manifest');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-f31-'));
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.logs);
  fs.mkdirSync(paths.secrets, { mode: 0o700 });
  const content = `vault: ${path.join(root, 'vault')}\n`;
  fs.writeFileSync(paths.config, content);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const manifest = { version: 1, createdAt: new Date().toISOString(), entries: [] };
  // config recorded LAST → reversed FIRST, so a throw here (pre-fix) would abort
  // before the dirs are swept; the dir removals prove the sweep continued past it.
  manifestLib.record(manifest, { kind: 'dir', path: paths.core });
  manifestLib.record(manifest, { kind: 'dir', path: paths.logs });
  manifestLib.record(manifest, { kind: 'dir', path: paths.secrets });
  manifestLib.record(manifest, { kind: 'file', path: paths.config, hash });
  manifestLib.save(paths, manifest);
  // Make the config unreadable: the deferred-config sha256File(readFileSync) hits
  // EACCES. Pre-fix that hash ran ABOVE the per-entry try and aborted the sweep.
  fs.chmodSync(paths.config, 0o000);

  let res;
  try {
    assert.doesNotThrow(() => {
      res = manifestLib.reverse(paths, manifest, {});
    }, 'an unreadable config must NOT abort the whole sweep (F31)');
  } finally {
    fs.chmodSync(paths.config, 0o600); // restore so tmp cleanup can proceed
  }

  assert.ok(res.skipped.includes(paths.config), 'the unverifiable config is left in place, reported skipped');
  assert.equal(res.deferredConfig, null, 'an unverifiable config is NOT deferred for deletion');
  assert.ok(
    res.removed.includes(paths.logs) && res.removed.includes(paths.secrets),
    'entries after the throwing config still reverse — the sweep ran to completion'
  );
  assert.equal(fs.existsSync(paths.manifest), true, 'reverse() retains the ledger for uninstall.js to delete');
});

test('WP-145 uninstall: the interactive path shows the derived plan (incl. would-run) BEFORE the confirm prompt', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);

  // Plant a platform-correct schedule file + entry so a derived command exists.
  let schedDir;
  let base;
  let derivedHead;
  if (process.platform === 'darwin') {
    schedDir = path.join(root, 'Library', 'LaunchAgents');
    base = 'ai.wienerdog.dream.plist';
    derivedHead = 'launchctl bootout';
  } else if (process.platform === 'win32') {
    schedDir = path.join(core, 'schedules');
    base = 'wienerdog-dream.xml';
    derivedHead = 'schtasks /delete';
  } else {
    schedDir = path.join(root, '.config', 'systemd', 'user');
    base = 'wienerdog-dream.timer';
    derivedHead = 'systemctl --user disable';
  }
  fs.mkdirSync(schedDir, { recursive: true });
  const schedFile = path.join(schedDir, base);
  fs.writeFileSync(schedFile, 'x');
  const manifestPath = path.join(core, 'install-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.entries.push({ kind: 'scheduler-entry', path: schedFile, unload: ['/bin/sh', '-c', 'echo poisoned'] });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Interactive run, answering "n": the plan must print, then the prompt fires
  // (confirm() may route the prompt text to stderr/dev-tty when stdin is a
  // pipe), then abort. 'Aborted.' prints only AFTER the prompt resolves, so it
  // is the reliable post-prompt marker inside stdout.
  const { spawnSync } = require('node:child_process');
  // Declines AT the confirm, so it never reaches the gate that sits after it —
  // it carries the authority marker anyway, so every subprocess caller is uniform.
  const r = spawnSync('node', [bin, 'uninstall'], {
    env: { ...env, WIENERDOG_ALLOW_REAL_SCHEDULER: '1' },
    encoding: 'utf8',
    input: 'n\n',
  });
  const stdout = r.stdout || '';
  const planIdx = stdout.indexOf('Planned actions:');
  const wouldRunIdx = stdout.indexOf(`would run: ${derivedHead}`);
  const abortedIdx = stdout.indexOf('Aborted.');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(planIdx !== -1, stdout);
  assert.ok(wouldRunIdx !== -1, 'the derived unregister command is disclosed');
  assert.ok(abortedIdx !== -1, stdout);
  assert.ok(planIdx < wouldRunIdx && wouldRunIdx < abortedIdx, 'plan (with derived commands) precedes the prompt outcome');
  assert.ok(!stdout.includes('/bin/sh'), 'the stored (poisoned) argv is never shown');
  assert.ok(fs.existsSync(core), 'declining the prompt removed nothing');
  assert.ok(fs.existsSync(schedFile));
});

test('WP-145 uninstall --yes: a poisoned scheduler unload argv never spawns; the canary is never created', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  const canary = path.join(root, 'pwned-canary.txt');
  const outside = path.join(root, 'not-a-schedule.plist');
  fs.writeFileSync(outside, 'x');
  const manifestPath = path.join(core, 'install-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.entries.push({
    kind: 'scheduler-entry',
    path: outside,
    unload: ['/bin/sh', '-c', `touch ${canary}`],
  });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const r = runUninstallCli(['uninstall', '--yes'], env);

  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(canary), false, 'the stored argv was never executed');
  assert.equal(fs.existsSync(outside), true, 'the unrecognized schedule path is preserved');
  assert.equal(fs.existsSync(core), false, 'the uninstall itself completed');
});

// ─────────────────────────────────────────────────────────────────────────────
// Table U (ADR-0041): `uninstall` needs DELETION CLEARANCE before it deletes, and
// establishes it from LIVE EVIDENCE — never from the (untrusted) manifest. Table
// T: how that gate stays unbypassable in production and hermetic here.
//
// Every test below runs IN-PROCESS with the authority marker ABSENT, so the gate
// really arms and the injected probe is what decides. `snapshot()` before/after is
// the proof that an abort deleted nothing.
// ─────────────────────────────────────────────────────────────────────────────

/** Splat `env` into process.env for the duration of `fn` (getPaths() reads env at
 *  call time), then restore. @param {NodeJS.ProcessEnv} env @param {() => any} fn */
async function withProcessEnv(env, fn) {
  const savedEnv = { ...process.env };
  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
}

/** A temp install plus the pieces every gate test needs. @returns {object} */
function installedFixture() {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  const manifestPath = path.join(core, 'install-manifest.json');
  return { root, core, env, manifestPath, before: snapshot(core), bytes: fs.readFileSync(manifestPath) };
}

/** Run the in-process uninstall and return the error it threw (or null).
 *  @param {NodeJS.ProcessEnv} env @param {string[]} argv @param {object} opts */
async function gateError(env, argv, opts) {
  const { run: runUninstall } = require('../../src/cli/uninstall');
  return withProcessEnv(env, async () => {
    try {
      await runUninstall(argv, opts);
      return null;
    } catch (e) {
      return e;
    }
  });
}

test('Table U abort: authority absent + a LIVE domain — nothing is deleted and the manifest is byte-identical', async () => {
  const { core, env, manifestPath, before, bytes } = installedFixture();
  const { WienerdogError } = require('../../src/core/errors');
  const probe = cleanProbe('live', ['ai.wienerdog.dream']);
  const err = await gateError(env, ['--yes'], { probe });
  assert.ok(err instanceof WienerdogError, `expected a WienerdogError, got ${err}`);
  assert.match(err.message, /ai\.wienerdog\.dream/, 'names the live identifier');
  assert.match(err.message, /WIENERDOG_ALLOW_REAL_SCHEDULER/, 'names the deliberate way to proceed');
  assert.ok(err.message.includes(core), 'names the resolved core');
  assert.equal(probe.calls, 1, 'the injected probe was actually consulted');
  assert.deepEqual(snapshot(core), before, 'nothing under the core was deleted');
  assert.deepEqual(fs.readFileSync(manifestPath), bytes, 'the manifest is untouched');
});

test('Table U abort: the decision does not change when the manifest carries NO scheduler-entry (round-2 case)', async () => {
  const { core, env, manifestPath } = installedFixture();
  const stripped = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  stripped.entries = stripped.entries.filter((e) => e.kind !== 'scheduler-entry');
  fs.writeFileSync(manifestPath, JSON.stringify(stripped, null, 2));
  const before = snapshot(core);
  const probe = cleanProbe('live', ['ai.wienerdog.catchup']);
  const err = await gateError(env, ['--yes'], { probe });
  assert.ok(err, 'a stripped manifest does not unarm the gate');
  assert.match(err.message, /ai\.wienerdog\.catchup/);
  assert.deepEqual(snapshot(core), before, 'nothing was deleted');
});

test('Table U proceed: authority absent + a probe that answered CLEAN completes (clearance, not authority)', async () => {
  const { core, env } = installedFixture();
  const probe = cleanProbe();
  const err = await gateError(env, ['--yes'], { probe });
  assert.equal(err, null, err && err.message);
  assert.equal(probe.calls, 1, 'the probe decided it');
  assert.equal(fs.existsSync(core), false, 'the uninstall completed normally');
});

test('Table U fail-closed: a probe that cannot answer aborts and deletes nothing', async () => {
  const { core, env, before } = installedFixture();
  const probe = () => {
    throw new Error('launchctl client absent at /bin/launchctl');
  };
  const err = await gateError(env, ['--yes'], { probe });
  assert.ok(err, 'an unanswerable domain counts as possibly-live');
  assert.match(err.message, /could not be queried/);
  assert.match(err.message, /launchctl client absent/, "carries the probe's reason");
  assert.match(err.message, /WIENERDOG_ALLOW_REAL_SCHEDULER/);
  assert.deepEqual(snapshot(core), before, 'nothing was deleted');
});

test('Table U step 1: with authority present the gate never probes at all', async () => {
  const { core, env } = installedFixture();
  const probe = cleanProbe('live', ['ai.wienerdog.dream']); // would abort if consulted
  const err = await gateError(
    { ...env, WIENERDOG_ALLOW_REAL_SCHEDULER: '1' },
    ['--yes'],
    { probe }
  );
  assert.equal(err, null, err && err.message);
  assert.equal(probe.calls, 0, 'authority short-circuits: no probe, no domain contact');
  assert.equal(fs.existsSync(core), false, 'uninstall completed normally');
});

test('Table U --dry-run: never probes, never aborts, never reloads — under every probe outcome', async () => {
  const { core, env, before } = installedFixture();
  const throwing = () => {
    throw new Error('the domain is unanswerable');
  };
  const live = cleanProbe('live', ['ai.wienerdog.dream']);
  for (const probe of [throwing, live]) {
    const err = await gateError(env, ['--dry-run'], { probe });
    assert.equal(err, null, err && err.message);
    assert.deepEqual(snapshot(core), before, '--dry-run deleted nothing');
  }
  assert.equal(live.calls, 0, '--dry-run never consulted the probe');
});

test('the probe type contract: every uncertain, malformed or self-contradictory result aborts', async () => {
  const { core, env, before } = installedFixture();
  const notProbeable = [
    ['a non-object', 42],
    ['null', null],
    ['a string', 'clean'],
    ['an unknown status', { status: 'nope', identifiers: [] }],
    ['identifiers not an array', { status: 'clean', identifiers: 'ai.wienerdog.dream' }],
    ['identifiers not strings', { status: 'clean', identifiers: [1] }],
    ['clean WITH identifiers (cross-field invariant)', { status: 'clean', identifiers: ['ai.wienerdog.dream'] }],
    ['clean with identifiers ABSENT', { status: 'clean' }],
    ['a thenable', { status: 'clean', identifiers: [], then: () => {} }],
    ['a Promise', Promise.resolve({ status: 'clean', identifiers: [] })],
  ];
  for (const [label, value] of notProbeable) {
    const err = await gateError(env, ['--yes'], { probe: () => value });
    assert.ok(err, `${label} must abort`);
    assert.match(err.message, /unusable answer/, `${label} is NOT-PROBEABLE`);
    assert.deepEqual(snapshot(core), before, `${label} deleted something`);
  }
  // In the ABORTING direction the payload cannot soften the verdict: `status`
  // alone is enough, and a missing/empty list only changes the wording.
  for (const value of [{ status: 'live' }, { status: 'live', identifiers: [] }]) {
    const err = await gateError(env, ['--yes'], { probe: () => value });
    assert.ok(err, 'a live status aborts however malformed the payload');
    assert.match(err.message, /the identifiers were not reported/);
    assert.deepEqual(snapshot(core), before, 'nothing was deleted');
  }
});

test('Table T forgotten-seam determinism: no authority and no injected probe fails BEFORE any real query', async () => {
  const { core, env, before } = installedFixture();
  // tests/run.js sets WIENERDOG_TEST_NO_REAL_SCHEDULER=1 for the whole suite and
  // tempEnv() spreads process.env, so the guard is present here.
  assert.equal(env.WIENERDOG_TEST_NO_REAL_SCHEDULER, '1', 'the suite guard is inherited');
  const err = await gateError(env, ['--yes'], {});
  assert.ok(err, 'a forgotten seam fails deterministically, not on the host');
  assert.match(err.message, /without injecting a probe or granting authority/);
  assert.deepEqual(snapshot(core), before, 'nothing was deleted');
});

test('Table T monotonicity: neither neutralizer can move the gate from abort to proceed', async () => {
  const { core, env, before } = installedFixture();
  const guarded = { ...env, WIENERDOG_TEST_NO_REAL_SCHEDULER: '1', WIENERDOG_LOADER_NOOP: '1' };
  const err = await gateError(guarded, ['--yes'], { probe: cleanProbe('live', ['ai.wienerdog.dream']) });
  assert.ok(err, 'neither variable is ever read as evidence that the domain is CLEAN');
  assert.match(err.message, /ai\.wienerdog\.dream/);
  assert.deepEqual(snapshot(core), before, 'nothing was deleted');
});

test('Table U reload+compare: a manifest that changed during the prompt aborts, deletes nothing, and never probes', async () => {
  const { core, env, manifestPath, before } = installedFixture();
  const manifestLib = require('../../src/core/manifest');
  const origLoad = manifestLib.load;
  const probe = cleanProbe();
  let err;
  try {
    // A concurrent writer between the disclosure and the confirm: the plan the
    // user saw is no longer the plan reverse() would replay.
    manifestLib.load = (p) => {
      const m = origLoad(p);
      const now = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      now.entries.push({ kind: 'file', path: path.join(core, 'appeared-during-the-prompt') });
      fs.writeFileSync(manifestPath, JSON.stringify(now, null, 2));
      return m;
    };
    err = await gateError(env, ['--yes'], { probe });
  } finally {
    manifestLib.load = origLoad;
  }
  assert.ok(err, 'a changed manifest aborts');
  assert.match(err.message, /changed while you were deciding/);
  assert.match(err.message, /uninstall` again/, 'tells the user to rerun');
  assert.equal(probe.calls, 0, 'the compare runs BEFORE the probe');
  const after = snapshot(core);
  delete after[manifestPath]; // the injected concurrent write is the test's own
  const expected = { ...before };
  delete expected[manifestPath];
  assert.deepEqual(after, expected, 'neither the disclosed items nor the new entry were deleted');
});

test('Table U reload failure: a manifest MISSING at the reload point aborts — never the ENOENT-to-empty path', async () => {
  const { core, env, manifestPath } = installedFixture();
  const manifestLib = require('../../src/core/manifest');
  const origLoad = manifestLib.load;
  const probe = cleanProbe();
  let err;
  try {
    manifestLib.load = (p) => {
      const m = origLoad(p);
      fs.rmSync(manifestPath, { force: true }); // vanished during the prompt
      return m;
    };
    err = await gateError(env, ['--yes'], { probe });
  } finally {
    manifestLib.load = origLoad;
  }
  assert.ok(err, 'a vanished manifest is a CHANGE, not an empty install');
  assert.match(err.message, /changed while you were deciding/);
  assert.equal(probe.calls, 0, 'the reload failure precedes the probe');
  // The proof it did not take manifestLib.load's ENOENT-to-empty path: that would
  // have replayed nothing while disposeCoreMechanics still swept the core.
  assert.equal(fs.existsSync(path.join(core, 'config.yaml')), true, 'the core was not swept');
  assert.equal(fs.existsSync(core), true, 'the core still exists');
});

test('Table U accepted snapshot: a post-confirm rewrite REVERTED to the disclosed bytes still replays exactly the disclosed entries', async () => {
  const { core, env, manifestPath } = installedFixture();
  const disclosed = fs.readFileSync(manifestPath);
  const disclosedEntries = JSON.parse(disclosed.toString('utf8')).entries;
  // A file the DISCLOSED manifest does not mention. The tampering below records
  // it and then puts the file back byte-for-byte, so the compare passes — and
  // what reverse() replays must still be the snapshot, never a re-derivation.
  const sentinel = path.join(core, 'appeared-then-reverted');
  fs.writeFileSync(sentinel, 'x');
  const manifestLib = require('../../src/core/manifest');
  const origLoad = manifestLib.load;
  const origReverse = manifestLib.reverse;
  const probe = cleanProbe();
  let loaded = null;
  /** @type {Array<{m:any, o:any}>} */ const reverseCalls = [];
  let err;
  try {
    manifestLib.load = (p) => {
      loaded = origLoad(p);
      const tampered = JSON.parse(disclosed.toString('utf8'));
      tampered.entries.push({ kind: 'file', path: sentinel });
      fs.writeFileSync(manifestPath, JSON.stringify(tampered, null, 2));
      fs.writeFileSync(manifestPath, disclosed); // reverted to the disclosed bytes
      return loaded;
    };
    manifestLib.reverse = (p, m, o) => {
      reverseCalls.push({ m, o });
      return origReverse(p, m, o);
    };
    err = await gateError(env, ['--yes'], { probe });
  } finally {
    manifestLib.load = origLoad;
    manifestLib.reverse = origReverse;
  }
  assert.equal(err, null, err && err.message);
  assert.equal(probe.calls, 1, 'the compare passed, so the gate went on to consult the probe');
  const destructive = reverseCalls.filter((c) => c.o && c.o.dryRun === false);
  assert.equal(destructive.length, 1, 'exactly one destructive reverse()');
  assert.equal(destructive[0].m, loaded, 'reverse() got the ACCEPTED SNAPSHOT object — not a re-read');
  assert.deepEqual(destructive[0].m.entries, disclosedEntries, 'it replays exactly the disclosed entries');
  assert.equal(fs.existsSync(sentinel), true, 'the entry that appeared and vanished was never deleted');
});

// ─────────────────────────────────────────────────────────────────────────────
// The clearance probe's OUTPUT PARSER, per scheduler domain. Pure, so each
// platform's real client format is exercised on every host. The blocks below are
// captured/representative output, not invented shapes.
// ─────────────────────────────────────────────────────────────────────────────

const { ownIdentifiersIn } = require('../../src/cli/uninstall');

/** `launchctl print gui/<uid>` — captured on darwin (tabs between columns). */
const LAUNCHCTL_PRINT = [
  '\tservices = {',
  '\t\t   44211   (jt) \tcom.apple.spotlightknowledged.updater',
  '\t\t       0      0 \tai.wienerdog.dream',
  '\t\t       0      0 \tcom.electron.wispr-flow.ShipIt',
  '\t\t   34307   (pe) \tcom.apple.installerauthagent',
  '\t\t       0      1 \tai.wienerdog.catchup',
  '\t\t    1960      - \tapplication.com.google.drivefs.240074756',
  '\t}',
  '',
].join('\n');

/** `systemctl --user list-units --all --no-legend`. */
const SYSTEMCTL_LIST_UNITS = [
  '  dbus.socket                loaded active   running D-Bus User Message Bus Socket',
  '  wienerdog-dream.service    loaded inactive dead    Wienerdog job: dream',
  '  wienerdog-dream.timer      loaded active   waiting Wienerdog job timer: dream',
  '  gpg-agent.socket           loaded active   running GnuPG cryptographic agent',
  '',
].join('\n');

/** `schtasks /query /fo LIST` — one blank-line-separated block per task, the
 *  task's full path on the `TaskName:` line. */
const SCHTASKS_LIST = [
  '',
  'Folder: \\Microsoft\\Windows\\UpdateOrchestrator',
  'HostName:                             DESKTOP-7Q2',
  'TaskName:                             \\Microsoft\\Windows\\UpdateOrchestrator\\Reboot',
  'Next Run Time:                        N/A',
  'Status:                               Disabled',
  '',
  'Folder: \\Wienerdog',
  'HostName:                             DESKTOP-7Q2',
  'TaskName:                             \\Wienerdog\\dream',
  'Next Run Time:                        9/2/2026 3:00:00 AM',
  'Status:                               Ready',
  'Logon Mode:                           Interactive only',
  '',
  'HostName:                             DESKTOP-7Q2',
  'TaskName:                             \\Wienerdog\\catchup',
  'Next Run Time:                        N/A',
  'Status:                               Ready',
  '',
].join('\n');

test('probe parser (win32): a real schtasks /fo LIST block reports the \\Wienerdog\\ tasks as LIVE', () => {
  // The regression this pins: Wienerdog registers Windows tasks under the
  // \Wienerdog\ FOLDER namespace (generators.windowsTaskName), so a task's
  // identifier carries neither `ai.wienerdog.` nor `wienerdog-`. A probe matching
  // only those prefixes reported a live Windows install as CLEAN, clearance was
  // granted, the unload was soft-refused, and reverse() orphaned the task.
  assert.deepEqual(ownIdentifiersIn(SCHTASKS_LIST, 'win32'), ['\\Wienerdog\\dream', '\\Wienerdog\\catchup']);
  assert.deepEqual(
    ownIdentifiersIn(SCHTASKS_LIST, 'win32').filter((t) => t.includes('Microsoft')),
    [],
    'a foreign task in the same output is not ours'
  );
});

test('probe parser (win32): task paths are matched case-INSENSITIVELY', () => {
  const shouty = SCHTASKS_LIST.replace(/\\Wienerdog\\dream/g, '\\WIENERDOG\\Dream');
  assert.deepEqual(ownIdentifiersIn(shouty, 'win32'), ['\\WIENERDOG\\Dream', '\\Wienerdog\\catchup']);
});

test('probe parser (win32): a bare folder header is not a registration', () => {
  // `Folder: \Wienerdog` with no task under it must read CLEAN — the namespace
  // includes its trailing separator precisely so an empty folder cannot abort an
  // uninstall.
  const emptyFolder = 'Folder: \\Wienerdog\nINFO: There are no scheduled tasks presently available at your access level.\n';
  assert.deepEqual(ownIdentifiersIn(emptyFolder, 'win32'), []);
});

test('probe parser (darwin): launchctl print reports the ai.wienerdog.* labels, and nothing foreign', () => {
  assert.deepEqual(ownIdentifiersIn(LAUNCHCTL_PRINT, 'darwin'), ['ai.wienerdog.dream', 'ai.wienerdog.catchup']);
  const foreignOnly = LAUNCHCTL_PRINT.split('\n').filter((l) => !l.includes('wienerdog')).join('\n');
  assert.deepEqual(ownIdentifiersIn(foreignOnly, 'darwin'), []);
});

test('probe parser (linux): systemctl list-units reports the wienerdog-* units, and nothing foreign', () => {
  assert.deepEqual(ownIdentifiersIn(SYSTEMCTL_LIST_UNITS, 'linux'), [
    'wienerdog-dream.service',
    'wienerdog-dream.timer',
  ]);
  const foreignOnly = SYSTEMCTL_LIST_UNITS.split('\n').filter((l) => !l.includes('wienerdog')).join('\n');
  assert.deepEqual(ownIdentifiersIn(foreignOnly, 'linux'), []);
});

test('probe parser: the three identifier shapes are NOT interchangeable across domains', () => {
  // Why the matching is per-domain rather than one prefix list applied
  // everywhere: each domain's output only ever contains its own shape, and
  // matching a foreign shape would be a false LIVE (a wrongly bricked uninstall)
  // exactly as matching too few is a false CLEAN (an orphaned job).
  assert.deepEqual(ownIdentifiersIn(SCHTASKS_LIST, 'darwin'), [], 'no launchd label in schtasks output');
  assert.deepEqual(ownIdentifiersIn(SCHTASKS_LIST, 'linux'), [], 'no systemd unit in schtasks output');
  assert.deepEqual(ownIdentifiersIn(LAUNCHCTL_PRINT, 'win32'), [], 'no task path in launchctl output');
  assert.deepEqual(ownIdentifiersIn(SYSTEMCTL_LIST_UNITS, 'win32'), [], 'no task path in systemctl output');
  assert.deepEqual(ownIdentifiersIn('', 'darwin'), [], 'empty output is CLEAN input, never a crash');
  assert.deepEqual(ownIdentifiersIn(LAUNCHCTL_PRINT, 'freebsd'), [], 'an unsupported platform matches nothing');
});

test('probe parser: a foreign identifier that merely EMBEDS our name is not ours (boundary, not containment)', () => {
  // Containment would let somebody else's registration block an innocent
  // uninstall: each token below carries a Wienerdog namespace somewhere inside
  // it, but none of them is a Wienerdog registration. Erring toward LIVE is the
  // fail-closed direction and still the wrong answer — the probe enumerates our
  // OWN identifiers, so the namespace must match at the identifier's boundary.
  const launchdLookalike = [
    '\t\t       0      0 \tcom.vendor.ai.wienerdog.helper',
    '\t\t       0      0 \tai.wienerdog.dream',
    '',
  ].join('\n');
  assert.deepEqual(
    ownIdentifiersIn(launchdLookalike, 'darwin'),
    ['ai.wienerdog.dream'],
    'a vendor label embedding ai.wienerdog. is not ours; the real label still is'
  );

  const systemdLookalike = [
    '  not-wienerdog-related.timer  loaded active   waiting Someone else entirely',
    '  wienerdog-dream.timer        loaded active   waiting Wienerdog job timer: dream',
    '',
  ].join('\n');
  assert.deepEqual(
    ownIdentifiersIn(systemdLookalike, 'linux'),
    ['wienerdog-dream.timer'],
    'a unit embedding wienerdog- is not ours; the real unit still is'
  );

  const taskLookalike = [
    'TaskName:                             \\Vendor\\Wienerdog\\task',
    'TaskName:                             \\Wienerdog\\dream',
    '',
  ].join('\n');
  assert.deepEqual(
    ownIdentifiersIn(taskLookalike, 'win32'),
    ['\\Wienerdog\\dream'],
    'a task under a foreign parent folder is not ours; the real task still is'
  );

  // Each lookalike ALONE reports CLEAN — no innocent uninstall is blocked.
  assert.deepEqual(ownIdentifiersIn('com.vendor.ai.wienerdog.helper', 'darwin'), []);
  assert.deepEqual(ownIdentifiersIn('not-wienerdog-related.timer', 'linux'), []);
  assert.deepEqual(ownIdentifiersIn('\\Vendor\\Wienerdog\\task', 'win32'), []);
});

test('the probe type contract, LIVE payloads: absent/empty stays LIVE, malformed is NOT-PROBEABLE — and neither ever throws a raw TypeError', async () => {
  const { core, env, before } = installedFixture();
  const { WienerdogError } = require('../../src/core/errors');

  // ABSENT or EMPTY is the contract's specified LIVE shape: the abort still
  // happens and the message says the identifiers were not reported.
  for (const [label, value] of [
    ['identifiers absent', { status: 'live' }],
    ['identifiers empty', { status: 'live', identifiers: [] }],
  ]) {
    const err = await gateError(env, ['--yes'], { probe: () => value });
    assert.ok(err instanceof WienerdogError, `${label}: coherent refusal`);
    assert.match(err.message, /still holds a live Wienerdog registration/, `${label} aborts as LIVE`);
    assert.match(err.message, /the identifiers were not reported/, label);
    assert.deepEqual(snapshot(core), before, `${label} deleted something`);
  }

  // A MALFORMED payload is the contract's malformed row → NOT-PROBEABLE. That is
  // still an abort, so `status` never un-aborts; only the message changes. The
  // Symbol case is the one that used to reach `join` and raise a raw TypeError
  // out of the gate instead of a refusal.
  for (const [label, value] of [
    ['a Symbol element', { status: 'live', identifiers: [Symbol('ai.wienerdog.dream')] }],
    ['number elements', { status: 'live', identifiers: [1, 2] }],
    ['a mixed array', { status: 'live', identifiers: ['ai.wienerdog.dream', 7] }],
    ['a truthy non-array (number)', { status: 'live', identifiers: 42 }],
    ['a truthy non-array (string)', { status: 'live', identifiers: 'ai.wienerdog.dream' }],
    ['a truthy non-array (object)', { status: 'live', identifiers: { 0: 'ai.wienerdog.dream' } }],
    ['null', { status: 'live', identifiers: null }],
  ]) {
    const err = await gateError(env, ['--yes'], { probe: () => value });
    assert.ok(err instanceof WienerdogError, `${label}: a coherent refusal, never a raw TypeError`);
    assert.doesNotMatch(String(err), /TypeError|Cannot convert/, `${label}: no formatting crash`);
    assert.match(err.message, /unusable answer/, `${label} is NOT-PROBEABLE`);
    assert.deepEqual(snapshot(core), before, `${label} deleted something`);
  }

  // Non-regression: a well-formed live payload is still named in full.
  const named = await gateError(env, ['--yes'], {
    probe: () => ({ status: 'live', identifiers: ['ai.wienerdog.dream', 'ai.wienerdog.catchup'] }),
  });
  assert.match(named.message, /ai\.wienerdog\.dream, ai\.wienerdog\.catchup/);
  assert.deepEqual(snapshot(core), before, 'nothing was deleted');
});
