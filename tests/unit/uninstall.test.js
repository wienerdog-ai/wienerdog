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

// ─────────────────────────────────────────────────────────────────────────────
// WP-scheduler-replay-manifest-independent — `uninstall` replays the scheduler
// from the schedule FILES in this install's own roots, not from the ledger alone.
//
// Every test below carries a UNIQUE SIGNAL TOKEN in each of its assertion
// messages, so the ADR-0042 red-proof declarations can tie a mutation to the
// assertion that catches it (`tests/red-proofs/scheduler-replay-manifest-independent.proofs.json`).
// ─────────────────────────────────────────────────────────────────────────────

const generatorsMod = require('../../src/scheduler/generators');

/** Plant `names` in `dir` and return their absolute paths. */
function plantSchedules(dir, names) {
  fs.mkdirSync(dir, { recursive: true });
  return names.map((n) => {
    const p = path.join(dir, n);
    fs.writeFileSync(p, 'x');
    return p;
  });
}

/** An install fixture whose manifest we can rewrite by hand. */
function schedInstall() {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  const manifestPath = path.join(core, 'install-manifest.json');
  const la = path.join(root, 'Library', 'LaunchAgents');
  fs.mkdirSync(la, { recursive: true });
  const addEntries = (entries) => {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    m.entries.push(...entries);
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
  };
  return { root, core, env, manifestPath, la, addEntries };
}

/**
 * Drive the in-process `uninstall` with the scheduler mutation chokepoint
 * replaced by a counting stub and `console.log` captured. Authority is ABSENT and
 * an injected CLEAN probe grants clearance, so nothing here can reach a real
 * scheduler domain. @param {NodeJS.ProcessEnv} env @param {string[]} argv
 * @param {{platform?:NodeJS.Platform}} [inject]
 */
async function uninstallInProcess(env, argv, inject = {}) {
  const spawnMod = require('../../src/scheduler/spawn');
  const { run: runUninstall } = require('../../src/cli/uninstall');
  const origSpawn = spawnMod.schedulerSpawn;
  const origDerive = generatorsMod.deriveUnloadArgv;
  const origLog = console.log;
  /** @type {string[][]} */ const calls = [];
  /** @type {string[]} */ const lines = [];
  spawnMod.schedulerSpawn = (a) => { calls.push(a); return { status: 0 }; };
  // The Platform-scope table's injection: derive for the named platform on this
  // host, without ever mocking `process.platform`.
  if (inject.platform) generatorsMod.deriveUnloadArgv = (p) => origDerive(p, inject.platform);
  console.log = (...args) => { lines.push(args.map(String).join(' ')); };
  /** @type {any} */ let err = null;
  try {
    await withProcessEnv(env, async () => {
      try {
        await runUninstall(argv, { probe: cleanProbe() });
      } catch (e) {
        err = e;
      }
    });
  } finally {
    spawnMod.schedulerSpawn = origSpawn;
    generatorsMod.deriveUnloadArgv = origDerive;
    console.log = origLog;
  }
  return { calls, out: lines.join('\n'), err };
}

/** Make `fs.realpathSync` throw `code` for exactly `target`. */
function withRealpathFault(target, code, fn) {
  const orig = fs.realpathSync;
  /** @type {any} */
  const patched = (p, ...rest) => {
    if (p === target) {
      const e = new Error(`injected ${code}`);
      /** @type {any} */ (e).code = code;
      throw e;
    }
    return orig(p, ...rest);
  };
  patched.native = orig.native;
  fs.realpathSync = patched;
  try {
    return fn();
  } finally {
    fs.realpathSync = orig;
  }
}

const bootout = (label) => ['launchctl', 'bootout', `gui/${process.getuid()}/${label}`];

test('WP-scheduler-replay AC1: an orphaned schedule file no manifest entry records is UNLOADED and disposed of', async (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'SRM-1-orphan-unloaded-and-disposed';
  const { core, env, la } = schedInstall();
  const [orphan] = plantSchedules(la, ['ai.wienerdog.orphan.plist']);
  const { calls, err } = await uninstallInProcess(env, ['--yes']);
  assert.equal(err, null, `${S}: the uninstall completed — ${err && err.message}`);
  assert.deepEqual(calls, [bootout('ai.wienerdog.orphan')], `${S}: the re-derived argv reached the chokepoint`);
  assert.equal(fs.existsSync(orphan), false, `${S}: the orphaned schedule file is gone`);
  assert.equal(fs.existsSync(core), false, `${S}: the uninstall itself still completed`);
});

test('WP-scheduler-replay AC3: the disk-derived block is disclosed BEFORE consent, and again in --dry-run', (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'SRM-3-disclosed-before-consent';
  const { env, la } = schedInstall();
  const [orphan] = plantSchedules(la, ['ai.wienerdog.orphan.plist']);

  // Answering "n" at the prompt: the plan must already name the file.
  const declined = (() => {
    try {
      return execFileSync('node', [bin, 'uninstall'], { env, encoding: 'utf8', input: 'n\n' });
    } catch (e) {
      return `${e.stdout || ''}${e.stderr || ''}`;
    }
  })();
  assert.ok(declined.includes('Scheduled jobs found on disk:'), `${S}: the plan carries the labeled block — ${declined}`);
  assert.ok(declined.includes(`would run: ${bootout('ai.wienerdog.orphan').join(' ')}`), `${S}: the plan discloses the re-derived command`);
  assert.ok(declined.includes(`remove ${orphan}`), `${S}: the plan discloses the deletion`);
  assert.ok(declined.indexOf('Planned actions:') < declined.indexOf('Scheduled jobs found on disk:'),
    `${S}: the block follows the manifest-derived lines in the same pre-consent plan`);
  assert.equal(fs.existsSync(orphan), true, `${S}: declining deletes nothing`);

  const dry = run(['uninstall', '--dry-run'], env);
  assert.equal(dry.status, 0, `${S}: --dry-run exits 0 — ${dry.stderr}`);
  assert.ok(dry.stdout.includes('Scheduled jobs found on disk:'), `${S}: --dry-run carries the same block`);
  assert.ok(dry.stdout.includes(`would run: ${bootout('ai.wienerdog.orphan').join(' ')}`), `${S}: --dry-run discloses the command`);
  assert.equal(fs.existsSync(orphan), true, `${S}: --dry-run deletes nothing`);
});

test('WP-scheduler-replay AC2: a basename withinSchedulerRoot accepts but R2 rejects is never acted on', async (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'SRM-2-loose-basename-is-not-evidence';
  const { env, la } = schedInstall();
  const [loose, spaced, real] = plantSchedules(la, ['ai.wienerdog...plist', 'ai.wienerdog. .plist', 'ai.wienerdog.orphan.plist']);
  assert.equal(
    require('../../src/core/manifest').withinSchedulerRoot(loose, [la]), true,
    `${S}: the loose gate really does accept it, so the strict rule is what is under test`
  );
  const { calls, err } = await uninstallInProcess(env, ['--yes']);
  assert.equal(err, null, `${S}: the uninstall completed — ${err && err.message}`);
  assert.deepEqual(calls, [bootout('ai.wienerdog.orphan')], `${S}: only the R2-recognized file reached the chokepoint`);
  assert.equal(fs.existsSync(loose), true, `${S}: the dot-only basename survives`);
  assert.equal(fs.existsSync(spaced), true, `${S}: the space-bearing basename survives`);
  assert.equal(fs.existsSync(real), false, `${S}: the control file WAS acted on`);
});

test('WP-scheduler-replay AC3/AC17: a removal re-check that cannot resolve SKIPS the deletion, keeps the file, and does not abort', async (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'SRM-3b-act-time-recheck-narrows-removal-only';
  const { core, env, la } = schedInstall();
  const [orphan] = plantSchedules(la, ['ai.wienerdog.orphan.plist']);
  // The fault is armed only once discovery has already resolved this path, so
  // the item is disclosed and then fails phase D5b's re-check.
  let seen = 0;
  const origRealpath = fs.realpathSync;
  /** @type {any} */
  const patched = (p, ...rest) => {
    if (p === orphan) {
      seen += 1;
      if (seen > 1) {
        const e = new Error('injected EIO');
        /** @type {any} */ (e).code = 'EIO';
        throw e;
      }
    }
    return origRealpath(p, ...rest);
  };
  patched.native = origRealpath.native;
  fs.realpathSync = patched;
  let res;
  try {
    res = await uninstallInProcess(env, ['--yes']);
  } finally {
    fs.realpathSync = origRealpath;
  }
  assert.equal(res.err, null, `${S}: a skipped REMOVAL never aborts the run — ${res.err && res.err.message}`);
  assert.deepEqual(res.calls, [bootout('ai.wienerdog.orphan')], `${S}: the unload had already happened, unconditionally`);
  assert.equal(fs.existsSync(orphan), true, `${S}: the file is kept rather than deleted on an unresolvable re-check`);
  assert.equal(fs.existsSync(core), false, `${S}: the rest of the uninstall completed`);
});

test('WP-scheduler-replay AC4: the disposition is exclusive — the unrecorded file is gone, not merely unloaded', async (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'SRM-4-disposition-unload-and-remove';
  const manifestLib = require('../../src/core/manifest');
  const { env, la } = schedInstall();
  const [orphan] = plantSchedules(la, ['ai.wienerdog.orphan.plist']);
  const { calls, err } = await uninstallInProcess(env, ['--yes']);
  assert.equal(err, null, `${S}: the uninstall completed — ${err && err.message}`);
  assert.equal(manifestLib.DISCOVERED_DISPOSITION, 'unload-and-remove', `${S}: Table R row R4's cell as shipped`);
  assert.equal(calls.length, 1, `${S}: it was unloaded`);
  assert.equal(fs.existsSync(orphan), false, `${S}: under unload-and-remove the file is GONE; the unload-only arm does NOT occur`);
});

test('WP-scheduler-replay AC9: an unreadable scheduler root aborts a real uninstall and only warns in --dry-run', async (t) => {
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (process.platform !== 'darwin' || asRoot) return t.skip('needs a non-root darwin host');
  const S = 'SRM-9-unreadable-root-aborts';
  const { core, env, la } = schedInstall();
  const [orphan] = plantSchedules(la, ['ai.wienerdog.orphan.plist']);
  fs.chmodSync(la, 0o000);
  let res;
  let dry;
  try {
    res = await uninstallInProcess(env, ['--yes']);
    dry = run(['uninstall', '--dry-run'], env);
  } finally {
    fs.chmodSync(la, 0o755);
  }
  assert.ok(res.err, `${S}: a root that cannot be read is not an empty root`);
  assert.ok(res.err.message.includes(la), `${S}: the refusal names the directory — ${res.err.message}`);
  assert.match(res.err.message, /EACCES|EPERM/, `${S}: and its code`);
  assert.equal(res.calls.length, 0, `${S}: nothing was unloaded`);
  assert.equal(fs.existsSync(core), true, `${S}: nothing was removed`);
  assert.equal(fs.existsSync(orphan), true, `${S}: the schedule file is still present`);
  assert.equal(dry.status, 0, `${S}: --dry-run does not abort — ${dry.stderr}`);
  assert.ok(dry.stdout.includes(la), `${S}: --dry-run reports the unreadable root`);
});

test('WP-scheduler-replay AC17: a root that cannot be CANONICALIZED aborts with zero removals and zero chokepoint calls', async (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'SRM-17-resolution-failure-is-not-external';
  const { core, env, la } = schedInstall();
  const [orphan] = plantSchedules(la, ['ai.wienerdog.orphan.plist']);
  const res = await withRealpathFault(la, 'EACCES', () => uninstallInProcess(env, ['--yes']));
  assert.ok(res.err, `${S}: an unresolvable root is unreadable, never "not contained"`);
  assert.ok(res.err.message.includes(la), `${S}: the refusal names the root — ${res.err.message}`);
  assert.ok(res.err.message.includes('EACCES'), `${S}: and its code`);
  assert.equal(res.calls.length, 0, `${S}: zero chokepoint calls`);
  assert.equal(fs.existsSync(core), true, `${S}: zero files removed`);
  assert.equal(fs.existsSync(orphan), true, `${S}: the schedule file survives the refusal`);
});

test('WP-scheduler-replay AC11: a user file inside a vault at <core>/schedules survives the widened pass', async (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'SRM-11-vault-resident-candidate-survives';
  const { core, env } = schedInstall();
  const vault = path.join(core, 'schedules');
  const [notes] = plantSchedules(vault, ['wienerdog-notes.xml']);
  fs.writeFileSync(path.join(core, 'config.yaml'), `version: 1\nvault: ${vault}\n`);
  const { calls, err } = await uninstallInProcess(env, ['--yes']);
  assert.equal(err, null, `${S}: the uninstall completed — ${err && err.message}`);
  assert.equal(calls.length, 0, `${S}: a vault-resident candidate is never unloaded`);
  assert.equal(fs.existsSync(notes), true, `${S}: and the user's file is still on disk after the run`);
});

test('WP-scheduler-replay AC12: a win32 XML another record deletes mid-loop is still unloaded — phase D5a runs first', async (t) => {
  if (process.platform !== 'darwin') return t.skip('the fixture plants POSIX paths');
  const S = 'SRM-12-unload-precedes-the-entry-loop';
  const { core, env, addEntries } = schedInstall();
  const [xml] = plantSchedules(path.join(core, 'schedules'), ['wienerdog-dream.xml']);
  addEntries([{ kind: 'file', path: xml }]); // deletable: <core>/schedules is an allowed root
  const { calls, err } = await uninstallInProcess(env, ['--yes'], { platform: 'win32' });
  assert.equal(err, null, `${S}: the uninstall completed — ${err && err.message}`);
  assert.deepEqual(calls, [['schtasks', '/delete', '/tn', '\\Wienerdog\\dream', '/f']],
    `${S}: the unload reached the chokepoint even though the file reverser destroyed its evidence`);
  assert.equal(fs.existsSync(xml), false, `${S}: the file record removed the file, as it always did`);
});

test('WP-scheduler-replay AC13: no manifest record of any shape prevents an unload', async (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'SRM-13-no-record-suppresses-an-unload';
  const { core, env, la, addEntries } = schedInstall();
  const [otherKind] = plantSchedules(la, ['ai.wienerdog.digest.plist']);
  const [target] = plantSchedules(path.join(core, 'schedules'), ['wienerdog-dream.xml']);
  const alias = path.join(core, 'schedules', 'wienerdog-alias.xml');
  fs.symlinkSync(target, alias);
  addEntries([
    { kind: 'file', path: otherKind },            // a record of ANOTHER kind
    { kind: 'scheduler-entry', path: alias },     // an in-root symlink alias
    { kind: 'file', path: target },               // …whose evidence a LATER record deletes
  ]);
  const { calls, err } = await uninstallInProcess(env, ['--yes']);
  assert.equal(err, null, `${S}: the uninstall completed — ${err && err.message}`);
  const flat = calls.map((c) => c.join(' '));
  assert.ok(flat.includes(bootout('ai.wienerdog.digest').join(' ')),
    `${S}: a record of another kind never suppressed the unload — ${JSON.stringify(flat)}`);
  assert.equal(fs.existsSync(otherKind), true, `${S}: and D11 still withheld its deletion`);
});

test('WP-scheduler-replay AC15/AC16: an XDG root outside this run\'s HOME contributes nothing; the same files inside it are discovered', async (t) => {
  if (process.platform !== 'darwin') return t.skip('the systemd arm is fixture-only off linux');
  const S = 'SRM-15-external-xdg-root-is-not-a-discovery-root';
  const { root, core, env } = schedInstall();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-xdg-external-'));
  const [externalTimer] = plantSchedules(path.join(external, 'systemd', 'user'), ['wienerdog-dream.timer']);
  const outsideEnv = { ...env, XDG_CONFIG_HOME: external };
  const outside = await uninstallInProcess(outsideEnv, ['--dry-run']);
  assert.equal(outside.err, null, `${S}: --dry-run completed — ${outside.err && outside.err.message}`);
  assert.ok(!outside.out.includes(externalTimer), `${S}: the external root appears in no disclosed plan`);
  assert.equal(outside.calls.length, 0, `${S}: and produces no chokepoint call`);
  assert.equal(fs.existsSync(externalTimer), true, `${S}: the developer's own timer is untouched`);

  // The same file under an XDG root INSIDE the run's HOME IS discovered, so this
  // measures the containment rule rather than "discovery found nothing".
  const [insideTimer] = plantSchedules(path.join(root, '.config', 'systemd', 'user'), ['wienerdog-dream.timer']);
  assert.ok(env.XDG_CONFIG_HOME.startsWith(root), `${S}: criterion 16 — the suite's own XDG_CONFIG_HOME resolves under its root`);
  const inside = await uninstallInProcess(env, ['--dry-run']);
  assert.ok(inside.out.includes(insideTimer), `${S}: an in-home XDG root IS a discovery root — ${inside.out}`);
  assert.equal(fs.existsSync(core), true, `${S}: --dry-run removed nothing`);
});

/** The pre-confirm plan, captured by declining at the prompt. Nothing is deleted.
 *  @param {NodeJS.ProcessEnv} env @returns {string} */
function planText(env) {
  try {
    return execFileSync('node', [bin, 'uninstall'], { env, encoding: 'utf8', input: 'n\n' });
  } catch (e) {
    return `${e.stdout || ''}${e.stderr || ''}`;
  }
}





test('WP-scheduler-replay AC11 disclosure: a vault-resident candidate gets its own line naming the vault', (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'SRM-11b-vault-skip-is-disclosed-by-name';
  const { core, env } = schedInstall();
  const vault = path.join(core, 'schedules');
  const [notes] = plantSchedules(vault, ['wienerdog-notes.xml']);
  fs.writeFileSync(path.join(core, 'config.yaml'), `version: 1\nvault: ${vault}\n`);
  const out = planText(env);
  assert.ok(out.includes(`keep ${notes} (it sits inside your memory vault at ${vault} — your notes are yours)`),
    `${S}: the vault-skipped candidate is disclosed by name — ${out}`);
  assert.equal(fs.existsSync(notes), true, `${S}: and is not deleted`);
});



test('WP-scheduler-replay AC10 / round-2 R-B′: every discovered path is disclosed ONCE, in the vocabulary its fate warrants', (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'SRM-10-plan-vocabulary-matches-the-fate';
  const manifestLib = require('../../src/core/manifest');
  const { core, env, la, addEntries } = schedInstall();
  // F5's four-item corpus: one of each fate the block has a line for.
  const [orphan, byScheduler, byFile, aliasTarget] = plantSchedules(la, [
    'ai.wienerdog.orphan.plist',   // unrecorded            → remove
    'ai.wienerdog.dream.plist',    // scheduler-entry        → removed by its own entry
    'ai.wienerdog.digest.plist',   // {kind:'file'} entry    → keep + warning (outside allowed roots)
    'ai.wienerdog.weekly.plist',   // scheduler-entry ALIAS  → keep + warning (alias unlinked, plist survives)
  ]);
  const alias = path.join(la, 'ai.wienerdog.alias.plist');
  fs.symlinkSync(aliasTarget, alias);
  addEntries([
    { kind: 'scheduler-entry', path: byScheduler },
    { kind: 'file', path: byFile },
    { kind: 'scheduler-entry', path: alias },
  ]);

  const out = planText(env);
  const lines = out.split('\n').map((l) => l.trimEnd());
  const once = (needle) => lines.filter((l) => l.trim() === needle).length;
  assert.equal(once(`remove ${orphan}`), 1, `${S}: the unrecorded orphan is disclosed once, as a removal — ${out}`);
  assert.equal(once(`remove ${byScheduler}`), 1,
    `${S}: its OWN reverser's manifest-derived line stays — R-B\u2032 excludes only the block's own removals`);
  assert.ok(lines.some((l) => l.trim() === 'removed by its own manifest entry (listed above)'),
    `${S}: the scheduler-entry-owned plist is disclosed as removed by its own entry — ${out}`);
  assert.equal(once(`keep ${byFile} (another manifest entry owns this file)`), 1,
    `${S}: the file-record-owned plist is kept`);
  assert.equal(once(`keep ${aliasTarget} (another manifest entry owns this file)`), 1,
    `${S}: so is the alias's TARGET — its record unlinks the alias, not the plist`);
  const warnings = lines.filter((l) => l.trim() === manifestLib.R9_LOGIN_RELOAD_WARNING).length;
  assert.equal(warnings, 2, `${S}: exactly the two surviving reloadable plists carry R9's warning — ${out}`);

  const dry = run(['uninstall', '--dry-run'], env);
  assert.equal(dry.status, 0, `${S}: --dry-run exits 0 — ${dry.stderr}`);
  assert.ok(dry.stdout.includes(`remove ${orphan}`), `${S}: --dry-run carries the same block`);

  // Every path a `remove` line named is gone afterwards, and every path a `keep`
  // line named survives — the plan's promise, checked against the fate.
  const promisedGone = lines
    .map((l) => /^\s*remove (\/\S+?)(?: \(.*\))?$/.exec(l))
    .filter(Boolean).map((m) => m[1]);
  assert.ok(promisedGone.includes(orphan), `${S}: the block's removal is among the promises`);

  const r = runUninstallCli(['uninstall', '--yes'], env);
  assert.equal(r.status, 0, `${S}: the uninstall completed — ${r.stderr}`);
  assert.equal(fs.existsSync(orphan), false, `${S}: the removal the block promised happened`);
  assert.equal(fs.existsSync(byScheduler), false, `${S}: the scheduler-entry's own reverser removed its plist, as the plan said`);
  assert.equal(fs.existsSync(byFile), true, `${S}: the kept plist survives, as the plan said`);
  assert.equal(fs.existsSync(aliasTarget), true, `${S}: and so does the alias's target`);
  assert.equal(fs.existsSync(alias), false, `${S}: while the alias the record named is gone`);
  const stillThere = promisedGone.filter((p2) => fs.existsSync(p2));
  assert.deepEqual(stillThere, [], `${S}: everything the plan promised to remove is gone — ${r.stdout}`);
  assert.equal(fs.existsSync(core), false, `${S}: the kept plists sit outside the core, which is swept either way`);
});

test('WP-scheduler-replay round-2 R-B′: the --dry-run headline is independent of the block’s own removals', (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'SRM-RB-headline-excludes-the-blocks-removals';
  const { env, la } = schedInstall();
  const [orphan] = plantSchedules(la, ['ai.wienerdog.orphan.plist']);
  const dry = run(['uninstall', '--dry-run'], env);
  assert.equal(dry.status, 0, `${S}: --dry-run exits 0 — ${dry.stderr}`);
  const withOrphan = Number(/--dry-run: (\d+) item\(s\)/.exec(dry.stdout)[1]);
  const removeLines = dry.stdout.split('\n').filter((l) => l.trim() === `remove ${orphan}`);
  assert.equal(removeLines.length, 1, `${S}: disclosed exactly once, in the block — ${dry.stdout}`);
  fs.rmSync(orphan);
  const without = Number(/--dry-run: (\d+) item\(s\)/.exec(run(['uninstall', '--dry-run'], env).stdout)[1]);
  assert.equal(withOrphan, without, `${S}: the count does not move with the discovered set (R4-cell independent)`);
});


// ─────────────────────────────────────────────────────────────────────────────
// The secret-quarantine gate — Tables K/W/Y
// (WP-adr-0019-quarantine-uninstall-gate). Every test here is tagged `[QU-n]`
// so the RED-proof lane can scope a mutation to this package's own assertions,
// and every assertion carries its test's signal so a reddening diagnostic
// identifies itself.
// ─────────────────────────────────────────────────────────────────────────────

/** An install plus the two shelf paths under its core. */
function shelfInstall() {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  const q = path.join(core, 'state', 'quarantine');
  return { root, core, env, q, r: path.join(q, 'redacted') };
}

/** Put `bytes` bytes on a shelf under `dir`. @returns {string} the file's path */
function plantShelfFile(dir, name, bytes) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = path.join(dir, name);
  fs.writeFileSync(p, 'x'.repeat(bytes), { mode: 0o600 });
  return p;
}

/** Replace this run's own absolute roots with placeholders, so two runs under
 *  two temp HOMEs can be compared BYTE FOR BYTE. */
function normalizeRun(out, root, core) {
  return out.split(core).join('<CORE>').split(root).join('<ROOT>');
}

/** Every string the gate adds to any surface. Criterion 5 asserts against a
 *  captured expectation AND that none of these ever appears on an empty shelf. */
const GATE_STRINGS = [
  'wienerdog uninstall stopped',
  'may be the only copy of that text on this computer',
  'Move that folder somewhere you keep',
  'A real `wienerdog uninstall` stops at this point',
  'because they looked like they held a password or a key',
];

/** Make `fs.readdirSync` throw `code` for exactly `target`. Platform scope: a
 *  real `chmod 0000` is not EACCES for a privileged user and does not exist on
 *  Windows, and `quarantineInventory` classifies by `code`, so the injected code
 *  is the whole of what the rule reads.
 *  @param {string} target @param {string} code @param {() => any} fn */
function withQuarantineReaddirFault(target, code, fn) {
  const orig = fs.readdirSync;
  /** @type {any} */
  const patched = (p, ...rest) => {
    if (p === target) {
      const e = new Error(`injected ${code}`);
      /** @type {any} */ (e).code = code;
      throw e;
    }
    return orig(p, ...rest);
  };
  fs.readdirSync = patched;
  try {
    return fn();
  } finally {
    fs.readdirSync = orig;
  }
}

/** Make `fs.lstatSync` throw `code` for exactly `target`, leaving every other
 *  path alone — the entry-level half of the Platform-scope injection.
 *  @param {string} target @param {string} code @param {() => any} fn */
function withQuarantineLstatFault(target, code, fn) {
  const orig = fs.lstatSync;
  /** @type {any} */
  const patched = (p, ...rest) => {
    if (p === target) {
      const e = new Error(`injected ${code}`);
      /** @type {any} */ (e).code = code;
      throw e;
    }
    return orig(p, ...rest);
  };
  fs.lstatSync = patched;
  try {
    return fn();
  } finally {
    fs.lstatSync = orig;
  }
}

test('[QU-1] AC1 (W3/W4): a non-empty shelf makes uninstall REFUSE — nothing removed, and the message carries all five things', () => {
  const S = 'QU1-non-empty-shelf-must-refuse';
  const { core, env, q, r } = shelfInstall();
  plantShelfFile(q, '2026-07-01-tooling.md', 812);
  plantShelfFile(r, '2026-07-02-fp.md', 1240);
  plantShelfFile(r, '2026-07-03-fp.md', 990);
  const before = snapshot(core);
  const res = runUninstallCli(['uninstall'], env);

  assert.equal(res.status, 1, `${S}: exits non-zero`);
  assert.deepEqual(snapshot(core), before, `${S}: having removed nothing — manifest, config, core and every shelf entry intact`);
  assert.ok(fs.existsSync(path.join(core, 'install-manifest.json')), `${S}: the manifest survives`);
  const msg = res.stderr;
  assert.match(msg, /nothing was removed/, `${S}: (1) nothing was removed`);
  assert.ok(msg.includes('3 file(s)'), `${S}: (2) the total entry count — ${msg}`);
  assert.ok(msg.includes('3042 bytes in total'), `${S}: (2) and the total size as a PLAIN INTEGER`);
  assert.ok(msg.includes(`${q} — 1 file(s), 812 bytes`), `${S}: (3) one line per shelf directory, with its own counts`);
  assert.ok(msg.includes(`${r} — 2 file(s), 2230 bytes`), `${S}: (3) and the redacted shelf likewise`);
  assert.ok(
    msg.includes('Some or all of these may be the only copy of that text on this computer, and they hold the original, not a blanked-out version.'),
    `${S}: (4) the Table O row O8 hedge, verbatim`
  );
  assert.doesNotMatch(msg, /\bis the only copy\b/, `${S}: (4) and never strengthened to "is"`);
  assert.ok(msg.includes(`  mv '${q}' ~/wienerdog-quarantine`), `${S}: (5) the move line`);
  assert.ok(msg.includes(`  rm -rf '${q}'`), `${S}: (5) the delete line`);
  assert.ok(msg.includes('then run `wienerdog uninstall` again'), `${S}: (5) and the retry`);
  assert.ok(msg.includes('docs/runbooks/secret-incident.md'), `${S}: (5) with the runbook pointer`);
});

test('[QU-2] AC2 (W2/Y7): --yes refuses IDENTICALLY — a refusal is not a prompt', () => {
  const S = 'QU2-yes-refuses-identically';
  const mk = () => {
    const f = shelfInstall();
    plantShelfFile(f.q, '2026-07-01-tooling.md', 812);
    plantShelfFile(f.r, '2026-07-02-fp.md', 1240);
    plantShelfFile(f.r, '2026-07-03-fp.md', 990);
    return f;
  };
  const a = mk();
  const b = mk();
  const beforeB = snapshot(b.core);
  const plain = runUninstallCli(['uninstall'], a.env);
  const yes = runUninstallCli(['uninstall', '--yes'], b.env);

  assert.equal(yes.status, 1, `${S}: --yes exits non-zero too`);
  assert.equal(yes.status, plain.status, `${S}: the same exit status`);
  assert.deepEqual(snapshot(b.core), beforeB, `${S}: --yes removed nothing either`);
  assert.equal(
    normalizeRun(yes.stderr, b.root, b.core),
    normalizeRun(plain.stderr, a.root, a.core),
    `${S}: and the refusal text is BYTE-IDENTICAL between the two runs`
  );
  assert.equal(yes.stdout, '', `${S}: --yes printed no plan before refusing — the refusal precedes the first console.log`);
  assert.equal(plain.stdout, '', `${S}: and neither did the interactive run`);
});

test('[QU-3] AC3 (K6/Y1): the refusal prints no shelf FILENAME and no shelf BYTE', () => {
  const S = 'QU3-no-shelf-name-or-byte-on-any-surface';
  const { env, q } = shelfInstall();
  const basename = 'zzdistinctivebasenamezz.md';
  const contents = 'qqDISTINCTIVE-SHELF-CONTENTqq';
  fs.mkdirSync(q, { recursive: true, mode: 0o700 });
  const file = path.join(q, basename);
  fs.writeFileSync(file, contents, { mode: 0o600 });
  // The fixture is first shown to place both on disk.
  assert.ok(fs.existsSync(file), `${S}: the fixture wrote the file`);
  assert.equal(fs.readFileSync(file, 'utf8'), contents, `${S}: with those exact contents`);

  const res = runUninstallCli(['uninstall', '--yes'], env);
  assert.equal(res.status, 1, `${S}: the run refused`);
  const complete = res.stdout + res.stderr;
  assert.equal(complete.includes(basename), false, `${S}: no filename reached the complete output — ${complete}`);
  assert.equal(complete.includes(contents), false, `${S}: and no byte of its content did`);
  assert.ok(complete.includes(q), `${S}: the DIRECTORY is named, which is what the user acts on`);
});

test('[QU-4] AC4 (W5): --dry-run does not abort — it prints the same block, says a real run stops there, and still prints the plan', () => {
  const S = 'QU4-dry-run-discloses-the-shelf';
  const { env, q, r } = shelfInstall();
  plantShelfFile(q, '2026-07-01-tooling.md', 812);
  plantShelfFile(r, '2026-07-02-fp.md', 1240);
  plantShelfFile(r, '2026-07-03-fp.md', 990);
  const res = run(['uninstall', '--dry-run'], env);

  assert.equal(res.status, 0, `${S}: --dry-run exits 0 — ${res.stderr}`);
  assert.ok(res.stdout.includes('3 file(s)') && res.stdout.includes('3042 bytes in total'),
    `${S}: the same counts and byte total as the refusal — ${res.stdout}`);
  assert.ok(res.stdout.includes(`${q} — 1 file(s), 812 bytes`), `${S}: the same directories`);
  assert.ok(res.stdout.includes(`${r} — 2 file(s), 2230 bytes`), `${S}: both of them`);
  assert.ok(res.stdout.includes('Some or all of these may be the only copy'), `${S}: the same hedge`);
  assert.ok(
    res.stdout.includes('A real `wienerdog uninstall` stops at this point.'),
    `${S}: the one line saying a real run stops here`
  );
  // ...and then today's plan, unchanged.
  assert.match(res.stdout, /wienerdog uninstall — the following will be removed:/, `${S}: today's plan still prints`);
  assert.match(res.stdout, /would be removed/, `${S}: with its headline`);
  assert.match(res.stdout, /the canonical core — removed once empty/, `${S}: and its core line`);
  assert.ok(
    res.stdout.indexOf('A real `wienerdog uninstall` stops at this point.') <
      res.stdout.indexOf('wienerdog uninstall — the following will be removed:'),
    `${S}: the block comes first, so the plan below it is already qualified`
  );
});

test('[QU-5] AC5 (W6): with no shelf ENTRIES the complete output is byte-identical — both the absent and the round-6 empty fixture', () => {
  const S = 'QU5-empty-shelf-output-is-byte-identical';
  // (a) no shelf directory at all — the captured expectation.
  const base = shelfInstall();
  // (b) BOTH shelf directories present and EMPTY: the state the refusal asks the
  //     user to reach, and the one a naive implementation reports three removed
  //     paths for where the baseline reports one.
  const empty = shelfInstall();
  fs.mkdirSync(empty.r, { recursive: true, mode: 0o700 });
  assert.ok(fs.existsSync(empty.q) && fs.existsSync(empty.r), `${S}: both shelf roots exist and hold nothing`);

  const baseDry = run(['uninstall', '--dry-run'], base.env);
  const emptyDry = run(['uninstall', '--dry-run'], empty.env);
  assert.equal(baseDry.status, 0, `${S}: the baseline dry run`);
  assert.equal(emptyDry.status, 0, `${S}: an empty shelf does not refuse — ${emptyDry.stderr}`);
  assert.equal(
    normalizeRun(emptyDry.stdout, empty.root, empty.core),
    normalizeRun(baseDry.stdout, base.root, base.core),
    `${S}: --dry-run's COMPLETE stdout is byte-identical, mechanics plan and all`
  );

  const baseYes = runUninstallCli(['uninstall', '--yes'], base.env);
  const emptyYes = runUninstallCli(['uninstall', '--yes'], empty.env);
  assert.equal(baseYes.status, 0, `${S}: the baseline full uninstall`);
  assert.equal(emptyYes.status, 0, `${S}: an empty shelf uninstalls — ${emptyYes.stderr}`);
  assert.equal(
    normalizeRun(emptyYes.stdout, empty.root, empty.core),
    normalizeRun(baseYes.stdout, base.root, base.core),
    `${S}: uninstall --yes is byte-identical too, the \`Removed N item(s)\` line included`
  );
  assert.match(baseYes.stdout, /Removed \d+ item\(s\)/, `${S}: and that line was actually in the compared text`);
  assert.equal(fs.existsSync(empty.core), false, `${S}: the empty-shelf install uninstalled completely`);

  for (const s of GATE_STRINGS) {
    for (const out of [baseDry.stdout, emptyDry.stdout, baseYes.stdout, emptyYes.stdout]) {
      assert.equal(out.includes(s), false, `${S}: no shelf wording anywhere — ${s}`);
    }
  }
});

test('[QU-6] AC6 (K4/Y5): an UNREADABLE shelf aborts a real run naming its code, does not abort --dry-run, and ENOENT does not abort', async () => {
  const S = 'QU6-unreadable-shelf-is-never-empty';
  const { core, env, q } = shelfInstall();
  plantShelfFile(q, '2026-07-01-tooling.md', 812);
  for (const code of ['EACCES', 'EIO']) {
    const before = snapshot(core);
    const res = await withQuarantineReaddirFault(q, code, () => uninstallInProcess(env, ['--yes']));
    assert.ok(res.err, `${S}: ${code} — an unreadable shelf is never an empty one`);
    assert.ok(res.err.message.includes(q), `${S}: ${code} — the refusal names the directory (${res.err.message})`);
    assert.ok(res.err.message.includes(code), `${S}: ${code} — and its code`);
    assert.ok(res.err.message.includes('cannot tell what is in them'),
      `${S}: ${code} — and says the state could not be determined (${res.err.message})`);
    assert.deepEqual(snapshot(core), before, `${S}: ${code} — zero files removed`);
    assert.equal(res.out, '', `${S}: ${code} — it aborted before any disclosure`);
  }
  // --dry-run deletes nothing, so it reports and continues.
  const dry = await withQuarantineReaddirFault(q, 'EACCES', () => uninstallInProcess(env, ['--dry-run']));
  assert.equal(dry.err, null, `${S}: --dry-run does not abort — ${dry.err && dry.err.message}`);
  assert.ok(dry.out.includes(`${q} (EACCES)`), `${S}: --dry-run reports the unreadable shelf`);
  assert.ok(dry.out.includes('the following will be removed'), `${S}: and still prints the plan`);
  // ENOENT on the same path is ABSENCE, the one special case.
  const absent = await withQuarantineReaddirFault(q, 'ENOENT', () => uninstallInProcess(env, ['--yes']));
  assert.equal(absent.err, null, `${S}: ENOENT does not abort`);
  assert.equal(fs.existsSync(core), false, `${S}: it uninstalled`);
});

test('[QU-7] AC7 (W7): the shelf gate runs FIRST — with BOTH a non-empty shelf and an unreadable scheduler root, the SHELF refusal is what is printed', async (t) => {
  if (process.platform !== 'darwin') return t.skip('the launchd arm is executable on darwin only');
  const S = 'QU7-shelf-gate-runs-before-D9';
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  const la = path.join(root, 'Library', 'LaunchAgents');
  const [orphan] = plantSchedules(la, ['ai.wienerdog.orphan.plist']);
  const q = path.join(core, 'state', 'quarantine');
  plantShelfFile(q, '2026-07-01-tooling.md', 812);
  const before = snapshot(core);

  const res = await withRealpathFault(la, 'EACCES', () => uninstallInProcess(env, ['--yes']));
  assert.ok(res.err, `${S}: the run refused`);
  assert.ok(res.err.message.includes(q), `${S}: the SHELF refusal is the message — ${res.err.message}`);
  assert.equal(res.err.message.includes('a folder that can hold scheduled jobs'), false,
    `${S}: D9 never got the chance to speak — the cheaper check that reports data we would DESTROY goes first`);
  assert.deepEqual(snapshot(core), before, `${S}: and nothing was removed`);
  assert.equal(fs.existsSync(orphan), true, `${S}: the schedule file survives too`);
  assert.equal(res.calls.length, 0, `${S}: zero chokepoint calls`);
});

test('[QU-8] AC10: the REFUSAL is idempotent — same status, same message, zero filesystem change in either run', () => {
  const S = 'QU8-refusal-is-idempotent';
  const { core, env, q, r } = shelfInstall();
  plantShelfFile(q, '2026-07-01-tooling.md', 812);
  plantShelfFile(r, '2026-07-02-fp.md', 1240);
  const before = snapshot(core);
  const first = runUninstallCli(['uninstall', '--yes'], env);
  // Asserted BEFORE the snapshot: a run that proceeded has removed the core, and
  // `snapshot` would then throw ENOENT — a thrown error is not an assertion
  // failure, and the RED lane refuses one (measured).
  assert.equal(first.status, 1, `${S}: the first run refused`);
  assert.ok(fs.existsSync(core), `${S}: and left the core in place to compare`);
  const between = snapshot(core);
  const second = runUninstallCli(['uninstall', '--yes'], env);
  assert.equal(second.status, first.status, `${S}: the same exit status both times`);
  assert.equal(second.stderr, first.stderr, `${S}: and the same message`);
  assert.ok(fs.existsSync(core), `${S}: the second run left it in place too`);
  const after = snapshot(core);
  assert.deepEqual(between, before, `${S}: zero filesystem changes in the first run (size and mtime)`);
  assert.deepEqual(after, before, `${S}: and zero in the second`);
});

test('[QU-9] AC11(a) (K8/K1): a CAPITALIZED shelf still refuses, and the refusal names it by its ACTUAL on-disk name', () => {
  const S = 'QU9-shelf-identity-is-case-folded';
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const up = path.join(core, 'state', 'Quarantine');
  plantShelfFile(up, '2026-07-01-tooling.md', 77);
  const before = snapshot(core);
  const res = runUninstallCli(['uninstall', '--yes'], env);

  assert.equal(res.status, 1, `${S}: a byte-equality name test would have let this run delete the file`);
  assert.ok(res.stderr.includes(`${up} — 1 file(s), 77 bytes`), `${S}: named as STORED — ${res.stderr}`);
  assert.ok(res.stderr.includes('77 bytes in total'), `${S}: and counted`);
  assert.deepEqual(snapshot(core), before, `${S}: nothing removed`);
});

test('[QU-10] Y1 (PR round 1): an unreadable shelf FILE never puts its name on ANY surface — refusal or --dry-run', async () => {
  const S = 'QU10-unreadable-entry-leaks-no-filename';
  const { env, q } = shelfInstall();
  const token = 'zzleakytokenzz';
  const leaky = plantShelfFile(q, `2026-07-01-${token}.md`, 64);
  assert.ok(fs.existsSync(leaky), `${S}: the fixture put the token on disk`);

  const refused = await withQuarantineLstatFault(leaky, 'EACCES', () => uninstallInProcess(env, ['--yes']));
  assert.ok(refused.err, `${S}: the run refused`);
  const refusalSurface = refused.out + (refused.err ? refused.err.message : '');
  assert.equal(refusalSurface.includes(token), false,
    `${S}: the refusal names the CONTAINING directory, never the note — ${refusalSurface}`);
  assert.ok(refusalSurface.includes(`${q} (EACCES)`), `${S}: and it does name the directory and the code`);

  const dry = await withQuarantineLstatFault(leaky, 'EACCES', () => uninstallInProcess(env, ['--dry-run']));
  assert.equal(dry.err, null, `${S}: --dry-run does not abort`);
  assert.equal(dry.out.includes(token), false, `${S}: and --dry-run leaks no filename either — ${dry.out}`);
  assert.ok(dry.out.includes(`${q} (EACCES)`), `${S}: while still reporting the directory`);
});

test('[QU-11] K2 (PR round 1): a FILE sitting where the shelf goes is named BY ITS ACTUAL PATH in the remedy', () => {
  const S = 'QU11-blocker-remedy-names-a-path-that-exists';
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  // On a case-sensitive volume the canonical lowercase path does not exist, so
  // a remedy naming it would `rm -rf` nothing and the refusal would never clear.
  const up = path.join(core, 'state', 'Quarantine');
  fs.mkdirSync(path.dirname(up), { recursive: true });
  fs.writeFileSync(up, 'not our directory\n');
  const before = snapshot(core);
  const res = runUninstallCli(['uninstall', '--yes'], env);

  assert.equal(res.status, 1, `${S}: it blocks the uninstall`);
  assert.ok(res.stderr.includes(`  rm -rf '${up}'`), `${S}: the remedy names the ACTUAL path — ${res.stderr}`);
  assert.ok(res.stderr.includes(`  mv '${up}' ~/wienerdog-quarantine`), `${S}: both remedy lines do`);
  assert.ok(res.stderr.includes(`  ${up} — not a folder`), `${S}: and it is listed, so the user can see it`);
  assert.ok(fs.existsSync(up), `${S}: the remedy names something that EXISTS`);
  assert.deepEqual(snapshot(core), before, `${S}: nothing removed`);
});

test('[QU-12] (PR round 1): the remedy lines are POSIX-quoted — a hostile core path stays one literal argument', () => {
  const S = 'QU12-remedy-lines-are-shell-safe';
  const { root, env } = tempEnv();
  // `$x` would expand, a backtick would run a command substitution and `"`
  // would end the quoting — all three inside double quotes, none inside single.
  const nasty = path.join(root, 'a $x b `id` c "d" e');
  fs.mkdirSync(nasty, { recursive: true });
  const core = path.join(nasty, 'wd');
  const hostile = { ...env, WIENERDOG_HOME: core };
  run(['init', '--yes'], hostile);
  const q = path.join(core, 'state', 'quarantine');
  plantShelfFile(q, '2026-07-01-tooling.md', 12);
  const res = runUninstallCli(['uninstall', '--yes'], hostile);
  assert.equal(res.status, 1, `${S}: it refused — ${res.stderr}`);

  const rmLine = res.stderr.split('\n').find((l) => l.startsWith('  rm -rf '));
  assert.ok(rmLine, `${S}: the delete line is present — ${res.stderr}`);
  const token = rmLine.slice('  rm -rf '.length);
  // Hand the printed token to a real shell: what it parses must be the path.
  const parsed = execFileSync('/bin/sh', ['-c', `printf %s ${token}`], { encoding: 'utf8' });
  assert.equal(parsed, q, `${S}: the shell parses the printed token back to the literal path`);
  assert.ok(token.startsWith("'") && token.endsWith("'"),
    `${S}: single-quoted, not double-quoted — inside "" the shell still expands $ and \` — ${token}`);

  const mvLine = res.stderr.split('\n').find((l) => l.startsWith('  mv '));
  const mvToken = mvLine.slice('  mv '.length, mvLine.lastIndexOf(' ~/wienerdog-quarantine'));
  assert.equal(
    execFileSync('/bin/sh', ['-c', `printf %s ${mvToken}`], { encoding: 'utf8' }), q,
    `${S}: the move line parses back to the same literal path`
  );
});
