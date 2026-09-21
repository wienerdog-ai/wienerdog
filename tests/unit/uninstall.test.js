'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
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
  // realpath'd: on macOS os.tmpdir() is itself behind a /var -> /private/var
  // symlink, and WP-uninstall-shelf-deletion-guards' protected set records every
  // link on a shelf's resolution chain — a host artifact in the fixture's own
  // root would put one there and make its behaviour platform-dependent.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-uninstall-')));
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
/** The CLI module itself — `quarantineBlock` is exported for its PLATFORM SEAM
 *  (ruling R-W4-win32) and for deriving `gateStrings()` from the product. */
const uninstallMod = require('../../src/cli/uninstall');

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

/**
 * Every string the gate can put on a surface, DERIVED FROM THE BUILDER ITSELF
 * rather than transcribed. A hand-written list silently rots: PR round 1
 * reworded the remedy heading and this list kept asserting the absence of a
 * string the product no longer emitted, which is an absence assertion that can
 * never fail. Rendering both message shapes on both platform branches over a
 * synthetic core, then dropping every line that carries the synthetic path,
 * leaves exactly the wording — and nothing can drift out of it.
 * @returns {string[]}
 */
function gateStrings() {
  const SYNTH = '/zzsynthzz';
  const fakePaths = /** @type {any} */ ({ state: `${SYNTH}/state` });
  const nonEmpty = {
    roots: [{ dir: `${SYNTH}/state/quarantine`, entries: 1, bytes: 7 }],
    entries: 2, bytes: 7, unreadable: [], blockers: [`${SYNTH}/state/Quarantine`],
  };
  const unreadable = {
    roots: [], entries: 0, bytes: 0,
    unreadable: [{ dir: `${SYNTH}/state/quarantine`, code: 'EACCES' }], blockers: [],
  };
  /** @type {Set<string>} */ const out = new Set();
  for (const platform of ['darwin', 'win32']) {
    for (const inv of [nonEmpty, unreadable]) {
      for (const line of uninstallMod.quarantineBlock(inv, fakePaths, platform).split('\n')) {
        const t = line.trim();
        if (t && !t.includes(SYNTH)) out.add(t);
      }
    }
  }
  // The two lines the CLI adds around the block.
  out.add('wienerdog uninstall stopped');
  out.add('A real `wienerdog uninstall` stops at this point');
  return [...out];
}

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

/**
 * The two remedy lines THIS HOST's block builder emits for `target` — ruling
 * **R-QU7′**: a CLI-level assertion selects its expected lines by
 * `process.platform` instead of hard-coding the POSIX pair, or it fails on
 * win32 for a reason that has nothing to do with what it is testing. Derived
 * from the product's own builder, so the expectation cannot drift from it.
 * @param {string} target @returns {string[]}
 */
function expectedRemedyLines(target) {
  const inv = {
    roots: [{ dir: target, entries: 1, bytes: 1 }],
    entries: 1, bytes: 1, unreadable: [], blockers: [],
  };
  return uninstallMod
    .quarantineBlock(inv, /** @type {any} */ ({ state: target }), process.platform)
    .split('\n')
    .filter((l) => /^ {2}(mv|rm -rf|Move-Item|Remove-Item) /.test(l));
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
  const [moveLine, deleteLine] = expectedRemedyLines(q);
  assert.ok(msg.includes(moveLine), `${S}: (5) the move line, in THIS host's shell — ${moveLine}`);
  assert.ok(msg.includes(deleteLine), `${S}: (5) the delete line, likewise — ${deleteLine}`);
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

  for (const s of gateStrings()) {
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
  // ENOENT on the same path is ABSENCE, the one special case. The shelf is
  // EMPTIED first: WP-uninstall-shelf-deletion-guards' Table X row X1 makes the
  // live deleter's guarantee the KERNEL's — `<state>/quarantine` comes off only
  // through `rmdirSync`, which fails `ENOTEMPTY` on a populated shelf whatever
  // an injected `readdirSync` reports — so a shelf that still HOLDS the user's
  // file is preserved and Table W row W10 stops the run. Faulting the
  // inventory's read can no longer make the deleter destroy it, which is the
  // whole point of that row; this arm's subject is the GATE's classification of
  // `ENOENT`, so the fixture is made genuinely empty to isolate it.
  fs.rmSync(path.join(q, '2026-07-01-tooling.md'), { force: true });
  const absent = await withQuarantineReaddirFault(q, 'ENOENT', () => uninstallInProcess(env, ['--yes']));
  assert.equal(absent.err, null, `${S}: ENOENT does not abort`);
  assert.equal(fs.existsSync(core), false, `${S}: it uninstalled`);
});

test('[QU-7] AC7 (W7): the shelf gate runs FIRST — with BOTH a non-empty shelf and an unreadable scheduler root, the SHELF refusal is what is printed', async () => {
  const S = 'QU7-shelf-gate-runs-before-D9';
  // Ruling R-QU7: PLATFORM-INDEPENDENT. `<core>/schedules` is a discovery root
  // on darwin, linux AND win32 (`discoverSchedulesOnDisk`'s third root), and the
  // failure is INJECTED as a code rather than arranged with a real permission —
  // so this ordering assertion, and the two RED declarations that cite it, are
  // provable on every host instead of on darwin alone.
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const schedRoot = path.join(core, 'schedules');
  fs.mkdirSync(schedRoot, { recursive: true });
  const orphan = path.join(schedRoot, 'wienerdog-orphan.xml');
  fs.writeFileSync(orphan, 'x');
  const q = path.join(core, 'state', 'quarantine');
  plantShelfFile(q, '2026-07-01-tooling.md', 812);
  const before = snapshot(core);

  // NO CONTROL ARM HERE, deliberately. The control this ordering assertion wants
  // — "the same injection DOES abort on its own once the shelf is empty" — is
  // already a shipped, declared test of the package that owns D9:
  // `WP-scheduler-replay AC17` above, which is the sole declared red of that
  // package's `srm-resolution-failure-read-as-external`. Asserting D9's VERDICT
  // a second time here makes this test redden under that package's mutation
  // without being declared in it, and a red whose reason is not the cell's is
  // not a measurement — the unfiltered lane rejected exactly that (measured).
  // This test asserts PRECEDENCE only, which is its own concern and is
  // insensitive to how D9 classifies a resolution failure.

  const res = await withRealpathFault(schedRoot, 'EACCES', () => uninstallInProcess(env, ['--yes']));
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
  const [blockerMove, blockerDelete] = expectedRemedyLines(up);
  assert.ok(res.stderr.includes(blockerDelete), `${S}: the remedy names the ACTUAL path — ${res.stderr}`);
  assert.ok(res.stderr.includes(blockerMove), `${S}: both remedy lines do`);
  assert.ok(res.stderr.includes(`  ${up} — not a folder`), `${S}: and it is listed, so the user can see it`);
  assert.ok(fs.existsSync(up), `${S}: the remedy names something that EXISTS`);
  assert.deepEqual(snapshot(core), before, `${S}: nothing removed`);
});

test('[QU-12] (PR round 1): the remedy lines are POSIX-quoted — a hostile core path stays one literal argument', (t) => {
  // The only host-shaped test in this package, and it is the FIXTURE that is
  // host-shaped, not the rule: a Windows filename cannot contain `"`, and there
  // is no `/bin/sh` to parse the token with. The win32 remedy branch is asserted
  // by injection in [QU-14] instead, which runs everywhere.
  if (process.platform === 'win32') return t.skip('the fixture needs a POSIX filename and /bin/sh');
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

test('[QU-13] R-Y1 (PR round 2): an unreadable NESTED DIRECTORY is reported by its shelf ROOT — its own name never reaches a surface', async () => {
  const S = 'QU13-nested-unreadable-reports-the-shelf-root';
  const token = 'zzNESTEDTOKENzz';
  for (const depth of [1, 2]) {
    const { env, q } = shelfInstall();
    // depth 1: <q>/zzTOKENzz     depth 2: <q>/outer/zzTOKENzz
    const parent = depth === 1 ? q : path.join(q, 'outer');
    const nested = path.join(parent, token);
    fs.mkdirSync(nested, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(nested, 'note.md'), 'x'.repeat(5), { mode: 0o600 });

    const refused = await withQuarantineReaddirFault(nested, 'EACCES', () =>
      uninstallInProcess(env, ['--yes'])
    );
    assert.ok(refused.err, `${S}: depth ${depth} — the run refused`);
    const surface = refused.out + refused.err.message;
    assert.equal(surface.includes(token), false,
      `${S}: depth ${depth} — the nested directory's own name is the user's text and never reaches a surface — ${surface}`);
    assert.ok(surface.includes(`${q} (EACCES)`),
      `${S}: depth ${depth} — the SHELF ROOT and the code are what is reported`);

    const dry = await withQuarantineReaddirFault(nested, 'EACCES', () =>
      uninstallInProcess(env, ['--dry-run'])
    );
    assert.equal(dry.err, null, `${S}: depth ${depth} — --dry-run does not abort`);
    assert.equal(dry.out.includes(token), false, `${S}: depth ${depth} — nor does --dry-run leak it — ${dry.out}`);
    assert.ok(dry.out.includes(`${q} (EACCES)`), `${S}: depth ${depth} — while still reporting the root`);
  }
});

test('[QU-14] R-W4-win32 (PR rounds 2/3b): the remedy lines are the HOST shell’s, and each branch escapes EVERY quote ITS parser honours', () => {
  const S = 'QU14-remedy-lines-follow-the-host-shell';
  // Every character that ends a quoted string in one shell or the other, in one
  // path: the ASCII apostrophe, `$`, a backtick, a double quote, and the four
  // code points PowerShell ALSO closes a single-quoted string on — U+2018 ‘,
  // U+2019 ’ (the `O’Connor` case, which is an ordinary folder name, not a
  // contrived one), U+201A ‚ and U+201B ‛.
  const target = "/h/O’Connor's ‘x‛ ‚y $z `id` \"d\"/state/quarantine";
  const paths = /** @type {any} */ ({ state: '/h/state' });
  const inv = {
    roots: [{ dir: target, entries: 1, bytes: 9 }],
    entries: 1, bytes: 9, unreadable: [], blockers: [],
  };
  const lines = (platform) =>
    uninstallMod.quarantineBlock(inv, paths, platform)
      .split('\n')
      .filter((l) => /^ {2}(mv|rm -rf|Move-Item|Remove-Item) /.test(l));

  // ── POSIX branch. String assertions run on EVERY host (R-QU7′); only the real
  //    shell invocation below is guarded.
  for (const posix of ['darwin', 'linux']) {
    const [mv, rm] = lines(posix);
    const posixQuoted = `'${target.split("'").join("'\\''")}'`;
    assert.equal(mv, `  mv ${posixQuoted} ~/wienerdog-quarantine`, `${S}: ${posix} — POSIX single-quote escaping, ' -> '\\''`);
    assert.equal(rm, `  rm -rf ${posixQuoted}`, `${S}: ${posix} — and the delete line`);
    assert.equal(rm.includes('Remove-Item'), false, `${S}: ${posix} gets no PowerShell command`);
  }

  // ── win32 branch. All five delimiters doubled, and ONLY those.
  const [move, remove] = lines('win32');
  let psQuoted = '';
  for (const ch of target) psQuoted += ["'", '‘', '’', '‚', '‛'].includes(ch) ? ch + ch : ch;
  psQuoted = `'${psQuoted}'`;
  assert.equal(move, `  Move-Item -LiteralPath ${psQuoted} -Destination "$HOME\\wienerdog-quarantine"`,
    `${S}: win32 — every PowerShell quote delimiter doubled`);
  assert.equal(remove, `  Remove-Item -LiteralPath ${psQuoted} -Recurse -Force`, `${S}: win32 — and the delete line`);
  assert.equal(move.includes('mv '), false, `${S}: win32 gets no POSIX command`);
  for (const ch of ['‘', '’', '‚', '‛']) {
    assert.ok(remove.includes(ch + ch), `${S}: win32 — U+${ch.codePointAt(0).toString(16)} is doubled, not passed through`);
  }

  // ── Both branches name the SAME target, so neither can silently address
  //    another path.
  assert.ok(move.includes('/state/quarantine') && lines('darwin')[0].includes('/state/quarantine'), `${S}: same target`);
});

test('[QU-14a] R-W4-win32: a REAL /bin/sh parses the POSIX remedy token back to the literal path', (t) => {
  // The rule is asserted everywhere by [QU-14]; only this FIXTURE is host-shaped
  // — there is no /bin/sh on win32 (R-QU7′, same guard as [QU-12]).
  if (process.platform === 'win32') return t.skip('needs a POSIX shell');
  const S = 'QU14a-posix-remedy-parses-in-a-real-shell';
  const target = "/h/O’Connor's ‘x‛ $z `id` \"d\"/state/quarantine";
  const inv = { roots: [{ dir: target, entries: 1, bytes: 9 }], entries: 1, bytes: 9, unreadable: [], blockers: [] };
  const rm = uninstallMod.quarantineBlock(inv, /** @type {any} */ ({ state: '/h/state' }), 'darwin')
    .split('\n').find((l) => l.startsWith('  rm -rf '));
  const token = rm.slice('  rm -rf '.length);
  assert.equal(execFileSync('/bin/sh', ['-c', `printf %s ${token}`], { encoding: 'utf8' }), target,
    `${S}: /bin/sh parses the printed token back to the literal path`);
});

test('[QU-14b] R-W4-win32 (round 3b): a REAL PowerShell parser reads -LiteralPath back as the literal path', (t) => {
  // Host-shaped FIXTURE, not a host-shaped rule: skipped where `pwsh` is not on
  // PATH. Where it is, this is the assertion that actually caught the defect —
  // doubling only U+0027 left `O’Connor` closing the string early, and
  // ParseInput reported "The string is missing the terminator: '." (measured).
  const pwsh = (() => {
    const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['pwsh'], { encoding: 'utf8' });
    return probe.status === 0 && String(probe.stdout).trim() ? String(probe.stdout).trim().split('\n')[0] : null;
  })();
  if (!pwsh) return t.skip('pwsh is not on PATH');
  const S = 'QU14b-powershell-parses-literalpath';
  const target = "/h/O’Connor's ‘x‛ ‚y $z `id` \"d\"/state/quarantine";
  const inv = { roots: [{ dir: target, entries: 1, bytes: 9 }], entries: 1, bytes: 9, unreadable: [], blockers: [] };
  const remove = uninstallMod.quarantineBlock(inv, /** @type {any} */ ({ state: '/h/state' }), 'win32')
    .split('\n').find((l) => l.startsWith('  Remove-Item ')).trim();

  // The line travels through a FILE, never through an argv or a shell, so
  // nothing between this test and the parser can re-quote it.
  const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-psparse-'));
  const lineFile = path.join(scriptDir, 'line.txt');
  fs.writeFileSync(lineFile, remove, 'utf8');
  const script = [
    '$line = Get-Content -Raw -LiteralPath $env:WD_LINE_FILE',
    '$errs = $null; $toks = $null',
    '$ast = [System.Management.Automation.Language.Parser]::ParseInput($line, [ref]$toks, [ref]$errs)',
    'if ($errs.Count) { Write-Output ("ERRORS=" + $errs.Count); exit 0 }',
    '$cmd = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true)',
    '$els = $cmd.CommandElements',
    'for ($i = 0; $i -lt $els.Count; $i++) {',
    '  if ($els[$i].ToString() -eq "-LiteralPath") { Write-Output ("LITERALPATH=" + $els[$i + 1].Value) }',
    '}',
  ].join('\n');
  const r = spawnSync(pwsh, ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    env: { ...process.env, WD_LINE_FILE: lineFile },
  });
  assert.equal(r.status, 0, `${S}: pwsh ran — ${r.stderr}`);
  const out = String(r.stdout);
  assert.equal(out.includes('ERRORS='), false, `${S}: the line PARSES — ${out}${r.stderr}`);
  assert.ok(out.includes(`LITERALPATH=${target}`),
    `${S}: and -LiteralPath is the literal target, not a truncated or re-parsed one — ${out}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// THE DELETION-SIDE GUARDS — WP-uninstall-shelf-deletion-guards.
// Every test here is tagged `[SG-n]` so the RED-proof lane can scope a mutation
// to this package's own assertions WITHOUT also selecting the gate package's
// `[QU-n]` ones, and every assertion carries its test's signal so a reddening
// diagnostic identifies itself.
// ─────────────────────────────────────────────────────────────────────────────

const manifestMod = require('../../src/core/manifest');

/** Read a file's text, or null when it is gone — so a DESTROYED original
 *  reddens as an ASSERTION failure carrying its signal, never as a bare ENOENT
 *  throw (`scripts/red-proofs.js` refuses any red whose code is not
 *  ERR_ASSERTION). */
function readOrNull(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

/** The raw bytes, or null when the file is gone — same reason. @param {string} p */
function readBytesOrNull(p) {
  try { return fs.readFileSync(p); } catch { return null; }
}

/** True iff `p` is an existing symlink — same reason. @param {string} p */
function isLink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}
const { getPaths } = require('../../src/core/paths');

/** A bare core laid out like a live install — state/ (with one non-shelf
 *  child), logs/, schedules/, secrets/ — driven WITHOUT the CLI so the sweep
 *  can be called directly. */
function sweepCore() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sg-')));
  const core = path.join(root, 'wd');
  const paths = getPaths({
    HOME: root,
    WIENERDOG_HOME: core,
    XDG_CONFIG_HOME: path.join(root, '.config'),
    CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
    CODEX_HOME: path.join(root, 'absent-codex'),
  });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.mkdirSync(path.join(core, 'schedules'), { recursive: true });
  fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(paths.state, 'scheduler-status.json'), '{}\n');
  fs.writeFileSync(path.join(paths.logs, 'run.log'), 'log\n');
  fs.writeFileSync(path.join(paths.secrets, 'token.json'), '{"t":1}\n');
  return { root, core, paths, sched: path.join(core, 'schedules') };
}

/** Write one shelf file exactly as `quarantinePreserve` leaves it. */
function shelfFile(dir, name, text) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = path.join(dir, name);
  fs.writeFileSync(p, text, { mode: 0o600 });
  return p;
}

/** Count every mutating `fs` call made inside `fn`, and optionally run a
 *  side effect the first time `seamOn` is called — the interleaving seam. */
function withFsSeam(fn, { seamOn = null, seam = null } = {}) {
  const names = ['rmSync', 'rmdirSync', 'unlinkSync', 'writeFileSync', 'renameSync', 'mkdirSync', 'chmodSync'];
  /** @type {Record<string, any[]>} */ const calls = {};
  /** @type {Record<string, any>} */ const orig = {};
  let fired = false;
  for (const n of names) {
    calls[n] = [];
    orig[n] = fs[n];
    fs[n] = (...args) => {
      if (!fired && seamOn === n && seam) { fired = true; seam(); }
      calls[n].push(args[0]);
      return orig[n](...args);
    };
  }
  try {
    return { value: fn(), calls };
  } finally {
    for (const n of names) fs[n] = orig[n];
  }
}

/** An install plus a hand-editable manifest AND the two shelf paths. */
function shelfManifestInstall() {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  const manifestPath = path.join(core, 'install-manifest.json');
  const q = path.join(core, 'state', 'quarantine');
  const addEntries = (entries, first = false) => {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (first) m.entries.unshift(...entries);
    else m.entries.push(...entries);
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
  };
  return { root, core, env, manifestPath, q, r: path.join(q, 'redacted'), addEntries };
}

test('[SG-1] AC1 (X1/X4): a shelf entry SURVIVES the live sweep, on each shelf in turn, while every mechanics dir still goes', () => {
  const S = 'SG1-shelf-entries-survive-the-sweep';
  for (const depth of ['quarantine', 'redacted']) {
    const { core, paths, sched } = sweepCore();
    const q = path.join(paths.state, 'quarantine');
    const dir = depth === 'quarantine' ? q : path.join(q, 'redacted');
    const note = shelfFile(dir, '2026-09-18-note.md', 'the only copy\n');
    fs.mkdirSync(path.join(paths.state, 'scratch'), { recursive: true });
    const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
    assert.equal(readOrNull(note, 'utf8'), 'the only copy\n',
      `${S}: ${depth} — the entry's BYTES are unchanged, read back and compared`);
    assert.equal(fs.existsSync(paths.state), true, `${S}: ${depth} — <state> is left in place`);
    assert.equal(fs.existsSync(q), true, `${S}: ${depth} — and so is the shelf root`);
    assert.ok(res.preservedQuarantine.length > 0,
      `${S}: ${depth} — the preserved directories are REPORTED (${JSON.stringify(res.preservedQuarantine)})`);
    assert.equal(fs.existsSync(paths.logs), false, `${S}: ${depth} — logs/ still goes`);
    assert.equal(fs.existsSync(sched), false, `${S}: ${depth} — schedules/ still goes`);
    assert.equal(fs.existsSync(paths.secrets), false, `${S}: ${depth} — secrets/ still goes`);
    assert.equal(fs.existsSync(path.join(paths.state, 'scratch')), false,
      `${S}: ${depth} — and every other child of <state>`);
    assert.equal(res.removed.includes(paths.state), false,
      `${S}: ${depth} — <state> is NOT reported removed while a shelf level survives (X4)`);
    assert.equal(fs.existsSync(core), true, `${S}: ${depth} — the core is kept`);
  }
});

test('[SG-2] AC1 round 11 (X18): no recursive delete reaches the shelf THROUGH AN ALIAS, and the target is asserted before the link', () => {
  const S = 'SG2-no-recursive-delete-through-an-alias';
  for (const where of ['state-sibling', 'core-logs']) {
    const { paths } = sweepCore();
    const q = path.join(paths.state, 'quarantine');
    const targetDir = where === 'state-sibling' ? path.join(paths.state, 'cache') : path.join(paths.logs, 'cache');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.symlinkSync(targetDir, q);
    // `quarantinePreserve` writes THROUGH the alias: it joins the lexical path
    // and the kernel follows it.
    const note = path.join(q, '2026-09-18-note.md');
    fs.writeFileSync(note, 'written through the alias\n');
    const physical = path.join(targetDir, '2026-09-18-note.md');
    const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
    // THE TARGET'S SURVIVAL FIRST — round 11 measured a loss reported as a save.
    assert.equal(readOrNull(physical, 'utf8'), 'written through the alias\n',
      `${S}: ${where} — the ORIGINAL's bytes survive, read back from the alias target`);
    assert.equal(fs.existsSync(targetDir), true, `${S}: ${where} — the target directory itself is left in place`);
    assert.ok(res.preservedQuarantine.some((p) => p === targetDir || p === paths.logs || p === q || p === paths.state),
      `${S}: ${where} — and it is REPORTED (${JSON.stringify(res.preservedQuarantine)})`);
    assert.equal(isLink(q), true, `${S}: ${where} — the quarantine link is still there`);
  }
});

test('[SG-3] AC1 round 12 (X19): a <state> alias covering a shelf is RETAINED across BOTH live sweeps', () => {
  const S = 'SG3-state-alias-retained-across-both-sweeps';
  const { paths } = sweepCore();
  fs.rmSync(paths.state, { recursive: true, force: true });
  fs.symlinkSync(paths.logs, paths.state);
  const note = shelfFile(path.join(paths.logs, 'quarantine'), '2026-09-18-note.md', 'under the alias\n');
  // The sequence uninstall.js actually performs — :408, then :467.
  const first = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  assert.equal(readOrNull(note, 'utf8'), 'under the alias\n', `${S}: the original survives the FIRST sweep`);
  const second = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  assert.equal(readOrNull(note, 'utf8'), 'under the alias\n',
    `${S}: and the SECOND — an implementation that unlinks the alias loses it here, not on the first call`);
  assert.equal(isLink(paths.state), true, `${S}: the <state> link is RETAINED`);
  assert.equal(fs.existsSync(paths.logs), true, `${S}: and <core>/logs was not recursively deleted`);
  assert.ok(first.preservedQuarantine.length > 0 && second.preservedQuarantine.length > 0,
    `${S}: both calls REPORT what they retained (${JSON.stringify([first.preservedQuarantine, second.preservedQuarantine])})`);
});

test('[SG-4] AC1 round 14 (X17 (1a)): the TWO-HOP chain is protected — the intermediate link, then its directory, then the bytes', () => {
  const S = 'SG4-chain-closure-protects-the-intermediate-link';
  const { paths } = sweepCore();
  const q = path.join(paths.state, 'quarantine');
  const cache = path.join(paths.state, 'cache');
  const link = path.join(cache, 'link');
  const recovery = path.join(paths.logs, 'recovery');
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(recovery, { recursive: true });
  fs.symlinkSync(recovery, link);
  fs.symlinkSync(link, q);
  const note = shelfFile(recovery, '2026-09-18-note.md', 'two hops away\n');
  for (const pass of ['run', 'retry']) {
    manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
    manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
    assert.equal(fs.existsSync(link), true,
      `${S}: ${pass} — the INTERMEDIATE link still exists (asserted first: the failure cascades from here)`);
    assert.equal(fs.existsSync(cache), true, `${S}: ${pass} — <state>/cache was not recursively deleted`);
    assert.equal(readOrNull(note, 'utf8'), 'two hops away\n', `${S}: ${pass} — and the original's bytes are unchanged`);
  }
});

test('[SG-5] AC2 (X1/X4): ABSENT, EMPTY and BOTH-EMPTY all end with <state> gone, reported ONCE, and nothing preserved', () => {
  const S = 'SG5-empty-and-absent-shelves-still-remove-state';
  const arms = {
    absent: () => {},
    empty: (paths) => fs.mkdirSync(path.join(paths.state, 'quarantine'), { recursive: true }),
    'both-empty': (paths) => fs.mkdirSync(path.join(paths.state, 'quarantine', 'redacted'), { recursive: true }),
  };
  for (const [name, seed] of Object.entries(arms)) {
    const { paths } = sweepCore();
    seed(paths);
    const inv = manifestMod.quarantineInventory(paths);
    assert.equal(inv.entries, 0, `${S}: ${name} — the inventory counts nothing`);
    const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
    assert.equal(fs.existsSync(paths.state), false, `${S}: ${name} — <state> is GONE`);
    assert.deepEqual(res.preservedQuarantine, [], `${S}: ${name} — and nothing was preserved`);
    assert.equal(res.removed.filter((p) => p === paths.state).length, 1,
      `${S}: ${name} — <state> appears in removed EXACTLY ONCE (${JSON.stringify(res.removed)})`);
    assert.equal(res.removed.some((p) => p.includes('quarantine')), false,
      `${S}: ${name} — and neither shelf path appears in it — the granularity the caller's count depends on`);
  }
});

test('[SG-6] AC2 round 15 (X17 (1a) class split): on a SYMLINKED CORE the credentials are still removed', () => {
  const S = 'SG6-chain-node-does-not-protect-its-descendants';
  for (const shelves of ['absent', 'present-empty']) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sg-')));
    const physical = path.join(root, 'data', 'wienerdog');
    fs.mkdirSync(physical, { recursive: true });
    const core = path.join(root, 'wd');
    fs.symlinkSync(physical, core);
    const paths = getPaths({
      HOME: root, WIENERDOG_HOME: core, XDG_CONFIG_HOME: path.join(root, '.config'),
      CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'), CODEX_HOME: path.join(root, 'absent-codex'),
    });
    fs.mkdirSync(paths.state, { recursive: true });
    fs.mkdirSync(paths.logs, { recursive: true });
    fs.mkdirSync(path.join(core, 'app'), { recursive: true });
    fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(paths.secrets, 'google-oauth.json'), '{"refresh_token":"x"}\n');
    if (shelves === 'present-empty') fs.mkdirSync(path.join(paths.state, 'quarantine', 'redacted'), { recursive: true });
    manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
    assert.equal(fs.existsSync(path.join(physical, 'secrets')), false,
      `${S}: ${shelves} — the CREDENTIALS are gone: a protection that strands them has failed in the other direction`);
    assert.equal(fs.existsSync(path.join(physical, 'logs')), false, `${S}: ${shelves} — logs/ is gone`);
    assert.equal(fs.existsSync(path.join(physical, 'state')), false, `${S}: ${shelves} — and state/ with it`);
  }
});

test('[SG-7] AC3 (W6/X4): on an install with no shelf ENTRIES the complete stdout is byte-identical, both plans compared in full', async () => {
  const S = 'SG7-empty-shelf-output-is-byte-identical';
  /** @param {(core:string)=>void} seed */
  const capture = async (seed, argv) => {
    const { root, core, env } = tempEnv();
    run(['init', '--yes'], env);
    seed(core);
    const res = await uninstallInProcess(env, argv);
    assert.equal(res.err, null, `${S}: ${argv.join(' ')} — the run completes (${res.err && res.err.message})`);
    return normalizeRun(res.out, root, core);
  };
  for (const argv of [['--dry-run'], ['--yes']]) {
    const base = await capture(() => {}, argv);
    const both = await capture(
      (core) => fs.mkdirSync(path.join(core, 'state', 'quarantine', 'redacted'), { recursive: true }),
      argv
    );
    assert.equal(both, base,
      `${S}: ${argv.join(' ')} — two EMPTY shelf directories change not one byte, including the "Removed N item(s)" line and the mechanics plan`);
    assert.ok(base.includes('Removed') || base.includes('would be removed'),
      `${S}: ${argv.join(' ')} — and the compared text really is the plan/summary`);
  }
});

test('[SG-8] AC4 (X1/X3/W8): a copy completing BETWEEN the child removals and the rmdir climb survives, on both live sweeps', () => {
  const S = 'SG8-interleaved-copy-survives';
  for (const shelfName of ['quarantine', 'Quarantine']) {
    const { paths } = sweepCore();
    const lex = path.join(paths.state, 'quarantine');
    fs.mkdirSync(path.join(paths.state, shelfName), { recursive: true, mode: 0o700 });
    // The gate's inventory sees an EMPTY shelf here, so the run proceeds…
    assert.equal(manifestMod.quarantineInventory(paths).entries, 0, `${S}: ${shelfName} — the gate sees an empty shelf`);
    let note = null;
    const { calls } = withFsSeam(
      () => manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null }),
      {
        seamOn: 'rmdirSync',
        // …and a preserve completes THROUGH THE LOWERCASE PATH between step 2's
        // child removals and step 3's climb.
        seam: () => { note = shelfFile(lex, '2026-09-18-note.md', 'arrived mid-sweep\n'); },
      }
    );
    assert.ok(note && readOrNull(note, 'utf8') === 'arrived mid-sweep\n',
      `${S}: ${shelfName} — the interleaved copy's BYTES survive, read back`);
    assert.equal(calls.rmSync.includes(path.join(paths.state, shelfName)), false,
      `${S}: ${shelfName} — and no recursive rmSync was ever aimed at the shelf, counted through the seam`);
    const again = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
    assert.equal(readOrNull(note, 'utf8'), 'arrived mid-sweep\n', `${S}: ${shelfName} — the SECOND sweep preserves it too`);
    assert.ok(again.preservedQuarantine.length > 0, `${S}: ${shelfName} — and reports it`);
  }
});

test('[SG-9] AC5 (X10/Y9): a symlinked <state> is NEVER DESCENDED, and the ordinary alias layout still completes', async () => {
  const S = 'SG9-symlinked-state-is-never-descended';
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  const external = path.join(root, 'personal');
  fs.mkdirSync(path.join(external, 'notes'), { recursive: true });
  fs.writeFileSync(path.join(external, 'notes', 'mine.md'), 'my own file\n');
  const state = path.join(core, 'state');
  fs.rmSync(state, { recursive: true, force: true });
  fs.symlinkSync(external, state);
  const res = await uninstallInProcess(env, ['--yes']);
  assert.equal(res.err, null, `${S}: the whole command COMPLETES (${res.err && res.err.message})`);
  assert.equal(readOrNull(path.join(external, 'notes', 'mine.md'), 'utf8'), 'my own file\n',
    `${S}: every file in the external directory is present with its bytes unchanged`);
  assert.equal(fs.existsSync(state), false, `${S}: while the LINK at <core>/state is removed`);
  assert.equal(fs.existsSync(core), false, `${S}: and the core is gone`);
  const second = await uninstallInProcess(env, ['--yes']);
  assert.ok(second.err && /no install manifest found/.test(second.err.message),
    `${S}: a second run refuses with "no install manifest found", not with a preservation stop — ${second.err && second.err.message}`);
});

test('[SG-10] AC5 round 3 (X11): validation runs TOP-DOWN — an external `redacted/` under a symlinked shelf root is never removed', () => {
  const S = 'SG10-validation-runs-top-down';
  for (const at of ['quarantine', 'state']) {
    const { paths } = sweepCore();
    const externalRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sg-ext-')));
    let linkPath;
    let externalRedacted;
    if (at === 'quarantine') {
      externalRedacted = path.join(externalRoot, 'redacted');
      fs.mkdirSync(externalRedacted);
      linkPath = path.join(paths.state, 'quarantine');
      fs.symlinkSync(externalRoot, linkPath);
    } else {
      externalRedacted = path.join(externalRoot, 'quarantine', 'redacted');
      fs.mkdirSync(externalRedacted, { recursive: true });
      linkPath = paths.state;
      fs.rmSync(paths.state, { recursive: true, force: true });
      fs.symlinkSync(externalRoot, paths.state);
    }
    const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
    assert.equal(fs.existsSync(externalRedacted), true,
      `${S}: ${at} — the EXTERNAL redacted/ directory still exists (an empty directory has no bytes to compare, so existence is the assertion)`);
    assert.equal(isLink(linkPath), true, `${S}: ${at} — the link is preserved, never followed and never removed`);
    assert.ok(res.preservedQuarantine.length > 0, `${S}: ${at} — and reported (${JSON.stringify(res.preservedQuarantine)})`);
  }
});

test('[SG-11] AC6 (X12): shelf identity is CASE-FOLDED, and a fold-equal-but-not-byte-equal name is preserved as ambiguous', () => {
  const S = 'SG11-fold-equal-name-is-preserved';
  // (b) a NON-EMPTY `Quarantine` is not recursively deleted by step 2.
  const { paths } = sweepCore();
  const cap = path.join(paths.state, 'Quarantine');
  const note = shelfFile(cap, '2026-09-18-note.md', 'capitalized shelf\n');
  const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  assert.equal(readOrNull(note, 'utf8'), 'capitalized shelf\n',
    `${S}: every byte in a capitalized shelf survives — a byte-equality test would have deleted it in step 2`);
  assert.ok(res.preservedQuarantine.some((p) => p === cap || p === paths.state),
    `${S}: and it is reported (${JSON.stringify(res.preservedQuarantine)})`);
  assert.equal(fs.existsSync(paths.state), true, `${S}: <state> is preserved with it`);
  // (c) the ambiguity rule, with the byte-exact lowercase name beside it.
  const caseSensitive = !fs.existsSync(path.join(paths.state, 'QUARANTINE'));
  if (caseSensitive) {
    const { paths: p2 } = sweepCore();
    const lower = path.join(p2.state, 'quarantine');
    const upper = path.join(p2.state, 'Quarantine');
    fs.mkdirSync(lower, { recursive: true });
    fs.mkdirSync(upper, { recursive: true });
    const res2 = manifestMod.disposeCoreMechanics(p2, { dryRun: false, vaultPath: null });
    assert.ok(res2.preservedQuarantine.includes(upper),
      `${S}: a fold-equal name that is NOT byte-equal is preserved and reported even beside the byte-exact one`);
    assert.equal(fs.existsSync(upper), true, `${S}: and it is still on disk`);
    assert.equal(fs.existsSync(p2.state), true, `${S}: which keeps <state> alive by the existing ENOTEMPTY rule`);
  }
});

test('[SG-12] AC7 (X13/Y10): an ordinary mechanics failure still PROPAGATES while a shelf ENOTEMPTY does not', async () => {
  const S = 'SG12-mechanics-failure-propagates';
  const { paths } = sweepCore();
  shelfFile(path.join(paths.state, 'quarantine'), '2026-09-18-note.md', 'kept\n');
  const orig = fs.rmSync;
  let thrown = null;
  fs.rmSync = (p, ...rest) => {
    if (p === paths.secrets) {
      const e = new Error('injected EPERM');
      /** @type {any} */ (e).code = 'EPERM';
      throw e;
    }
    return orig(p, ...rest);
  };
  try {
    manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  } catch (e) {
    thrown = e;
  } finally {
    fs.rmSync = orig;
  }
  assert.ok(thrown && thrown.code === 'EPERM',
    `${S}: a failure removing secrets/ still THROWS — swallowing it strands a live OAuth credential and deletes the ledger`);
  assert.equal(fs.existsSync(paths.secrets), true, `${S}: and the directory is still there`);
  // The other side of the same boundary: a shelf-level ENOTEMPTY does NOT throw.
  const quiet = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  assert.ok(quiet.preservedQuarantine.length > 0,
    `${S}: while a shelf-level ENOTEMPTY is reported in preservedQuarantine instead of thrown`);
  // And a failure ENUMERATING <state> propagates too (X1 step 1).
  const origRead = fs.readdirSync;
  let readThrew = null;
  fs.readdirSync = (p, ...rest) => {
    if (p === paths.state) {
      const e = new Error('injected EIO');
      /** @type {any} */ (e).code = 'EIO';
      throw e;
    }
    return origRead(p, ...rest);
  };
  try {
    manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  } catch (e) {
    readThrew = e;
  } finally {
    fs.readdirSync = origRead;
  }
  assert.ok(readThrew, `${S}: and so does a failure ENUMERATING <state>`);
});

test('[SG-13] AC8 (X15): --dry-run PLANS BY READING, and performs ZERO mutating filesystem calls', () => {
  const S = 'SG13-dry-run-plans-by-reading-only';
  const arms = [
    ['empty', (paths) => fs.mkdirSync(path.join(paths.state, 'quarantine'), { recursive: true }), true],
    ['populated', (paths) => shelfFile(path.join(paths.state, 'quarantine'), 'n.md', 'x\n'), false],
  ];
  for (const [name, seed, predicts] of arms) {
    const { paths } = sweepCore();
    seed(paths);
    const { value, calls } = withFsSeam(() => manifestMod.disposeCoreMechanics(paths, { dryRun: true, vaultPath: null }));
    for (const n of Object.keys(calls)) {
      assert.equal(calls[n].length, 0,
        `${S}: ${name} — ZERO mutating calls, counted through the seam: fs.${n} was called ${calls[n].length} time(s)`);
    }
    assert.equal(value.removed.includes(paths.state), predicts,
      `${S}: ${name} — the plan ${predicts ? 'predicts' : 'does NOT predict'} <state> removed (${JSON.stringify(value.removed)})`);
    if (!predicts) {
      assert.ok(value.preservedQuarantine.length > 0,
        `${S}: ${name} — and names the shelf it would keep instead (${JSON.stringify(value.preservedQuarantine)})`);
    }
  }
  // UNREADABLE: reported, and no removal predicted (K4).
  const { paths } = sweepCore();
  const q = path.join(paths.state, 'quarantine');
  fs.mkdirSync(q, { recursive: true });
  const origRead = fs.readdirSync;
  fs.readdirSync = (p, ...rest) => {
    if (p === q) {
      const e = new Error('injected EACCES');
      /** @type {any} */ (e).code = 'EACCES';
      throw e;
    }
    return origRead(p, ...rest);
  };
  let plan;
  try {
    plan = manifestMod.disposeCoreMechanics(paths, { dryRun: true, vaultPath: null });
  } finally {
    fs.readdirSync = origRead;
  }
  assert.equal(plan.removed.includes(paths.state), false, `${S}: unreadable — no removal is predicted`);
  assert.ok(plan.preservedQuarantine.includes(q), `${S}: unreadable — and the level is reported`);
});

test('[SG-14] AC9 (X16/Y6): a forged hash-less {kind:file} entry cannot reach the shelf, interleaved and through a `..` alias', async () => {
  const S = 'SG14-forged-file-entry-cannot-reach-the-shelf';
  for (const shape of ['literal', 'dot-dot']) {
    const { core, env, manifestPath, q, addEntries } = shelfManifestInstall();
    const name = '2026-09-18-note.md';
    const target = shape === 'literal'
      ? path.join(q, name)
      : path.join(core, 'state', '.', 'quarantine', '..', 'quarantine', name);
    // FIRST in `entries` ⇒ LAST in reverse()'s reversed loop, so the seam has
    // already completed the preserve by the time this entry is replayed.
    addEntries([{ kind: 'file', path: target }], true);
    const bytesBefore = fs.readFileSync(manifestPath);
    // The shelf is EMPTY when the gate's inventory runs, so the run proceeds…
    const origMkdir = fs.mkdirSync;
    let planted = null;
    // …and the preserve completes under exactly that name BEFORE reverse()
    // replays the entry: seam on reverse()'s own first stderr-free mutation.
    const seamFs = fs.rmSync;
    fs.rmSync = (p, ...rest) => {
      if (!planted) planted = shelfFile(q, name, 'the only copy\n');
      return seamFs(p, ...rest);
    };
    let res;
    try {
      res = await uninstallInProcess(env, ['--yes']);
    } finally {
      fs.rmSync = seamFs;
      fs.mkdirSync = origMkdir;
    }
    assert.ok(planted, `${S}: ${shape} — the fixture really did complete a preserve mid-run`);
    assert.equal(readOrNull(planted, 'utf8'), 'the only copy\n',
      `${S}: ${shape} — the original's BYTES survive the replay, read back`);
    assert.deepEqual(readBytesOrNull(manifestPath), bytesBefore,
      `${S}: ${shape} — and the manifest bytes never changed, so the byte-compare is not what saved it`);
    assert.ok(res.err, `${S}: ${shape} — the run stops rather than deleting the ledger`);
  }
});

test('[SG-15] AC9 round 9 (X16 from-above, Table V): a forged recursively-deleting entry that CONTAINS the shelf is guarded, and `dir` is not', async () => {
  const S = 'SG15-from-above-guard';
  for (const kind of ['vendored-tree', 'copied-skill']) {
    const { core, env, q, addEntries } = shelfManifestInstall();
    const state = path.join(core, 'state');
    let entryPath = state;
    if (kind === 'vendored-tree') {
      // `<core>/app` IS the alias: reverseVendoredTree's ONLY ownership test is
      // sameResolvedDir(entry.path, appRoot), which a forged entry satisfies
      // exactly when the two resolve to the same directory.
      fs.rmSync(path.join(core, 'app'), { recursive: true, force: true });
      fs.symlinkSync(state, path.join(core, 'app'));
    } else {
      // copied-skill's ownership proof is parent-equals-skills-root +
      // `wienerdog-*` basename + real dir + hashDir match, so the only shape
      // that reaches its recursive rmSync is a REAL skill directory that
      // CONTAINS the shelf — which is what a `<state>` alias into it produces.
      const skillsRoot = path.join(core, 'skills');
      entryPath = path.join(skillsRoot, 'wienerdog-shelf');
      fs.mkdirSync(entryPath, { recursive: true });
      fs.rmSync(state, { recursive: true, force: true });
      fs.symlinkSync(entryPath, state);
      env.CLAUDE_CONFIG_DIR = core;
    }
    // LAST in `entries` ⇒ FIRST replayed: the forged entry's ownership proof
    // resolves through `<core>/app`, which the install's OWN vendored-tree entry
    // unlinks if it is replayed first. The shelf is EMPTY when the gate's
    // inventory runs, and the preserve completes on entry to `reverse()` —
    // before the replay, which is the window round 9 measured.
    const hash = kind === 'copied-skill' ? manifestMod.hashDir(entryPath) : undefined;
    addEntries([hash ? { kind, path: entryPath, hash } : { kind, path: entryPath }]);
    const seamFs = fs.rmSync;
    const origReverse = manifestMod.reverse;
    /** @type {string[]} */ const recursiveTargets = [];
    let note = null;
    fs.rmSync = (p, opts, ...rest) => {
      if (opts && opts.recursive) recursiveTargets.push(p);
      return seamFs(p, opts, ...rest);
    };
    manifestMod.reverse = (...a) => {
      if (!note && !a[2].dryRun) note = shelfFile(q, '2026-09-18-note.md', 'guarded from above\n');
      return origReverse(...a);
    };
    let res;
    try {
      res = await uninstallInProcess(env, ['--yes']);
    } finally {
      fs.rmSync = seamFs;
      manifestMod.reverse = origReverse;
    }
    assert.ok(note, `${S}: ${kind} — the fixture really did complete a preserve before the replay`);
    assert.equal(readOrNull(note, 'utf8'), 'guarded from above\n',
      `${S}: ${kind} — the original's bytes survive a recursive reverser aimed ABOVE the shelf`);
    assert.equal(recursiveTargets.includes(entryPath), false,
      `${S}: ${kind} — and the recursive rmSync was never invoked on it, counted through the seam (${JSON.stringify(recursiveTargets)})`);
    assert.ok(res.err, `${S}: ${kind} — the run stops with the ledger intact`);
  }
  // THE NEGATIVE CONTROL (Table V): an ordinary `{kind:'dir', path:'<state>'}`
  // entry is NOT guarded — its reverser removes only a virtually-empty
  // directory, and guarding it would add a `skipped` line to every ordinary
  // uninstall and break Table W row W6.
  const ctl = shelfManifestInstall();
  const ctlPaths = require('../../src/core/paths').getPaths({ ...ctl.env });
  fs.mkdirSync(ctl.q, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(ctl.q, 'n.md'), 'x\n', { mode: 0o600 });
  const ctlManifest = { version: 1, createdAt: '', entries: [{ kind: 'dir', path: path.join(ctl.core, 'state') }] };
  const ctlRes = manifestMod.reverse(ctlPaths, ctlManifest, { dryRun: true });
  assert.deepEqual(ctlRes.shelfGuarded, [],
    `${S}: dir — the dir kind is the single, provable exemption from the from-above half`);
});

test('[SG-16] AC9 round 10 (X17): ABSENCE is not a failure — an ordinary install skips nothing new, and a late shelf is still protected', async () => {
  const S = 'SG16-absence-is-not-a-failure';
  // (a) THE ORDINARY INSTALL: neither shelf directory exists.
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  assert.equal(fs.existsSync(path.join(core, 'state', 'quarantine')), false, `${S}: the fixture really has no shelf`);
  const plain = await uninstallInProcess(env, ['--yes']);
  assert.equal(plain.err, null, `${S}: it uninstalls — the round-10 defect turned every app-tree removal into a skip (${plain.err && plain.err.message})`);
  assert.equal(fs.existsSync(core), false, `${S}: and the core is gone`);
  assert.equal(/preserving .* secret quarantine/.test(normalizeRun(plain.out, root, core)), false,
    `${S}: with nothing newly skipped on stdout`);
  // (c) the two outcomes stay distinguishable.
  const { paths } = sweepCore();
  const q = path.join(paths.state, 'quarantine');
  for (const [code, expectPreserved] of [['ENOENT', false], ['EACCES', true]]) {
    const { paths: p } = sweepCore();
    const target = path.join(p.state, 'quarantine');
    const origLstat = fs.lstatSync;
    fs.lstatSync = (pp, ...rest) => {
      if (pp === target) {
        const e = new Error(`injected ${code}`);
        /** @type {any} */ (e).code = code;
        throw e;
      }
      return origLstat(pp, ...rest);
    };
    let out;
    try {
      out = manifestMod.disposeCoreMechanics(p, { dryRun: false, vaultPath: null });
    } finally {
      fs.lstatSync = origLstat;
    }
    assert.equal(out.preservedQuarantine.length > 0, expectPreserved,
      `${S}: ${code} — ${expectPreserved ? 'UNANSWERABLE preserves and reports' : 'ABSENCE preserves nothing and reports nothing'} (${JSON.stringify(out.preservedQuarantine)})`);
  }
  assert.equal(fs.existsSync(q), false, `${S}: the control fixture had no shelf either`);
});

test('[SG-17] AC9 round 17 (X17 (1a)): a HYPOTHETICAL shelf root keeps FULL class (i) reach — the physical path is covered too', async () => {
  const S = 'SG17-hypothetical-root-keeps-subtree-reach';
  const { root, core, env } = tempEnv();
  // `init` refuses to write under a symlinked core, so the STABLE alias is put
  // in place after the install and before the run — which is the layout round 17
  // measured: created before the run, not during it.
  run(['init', '--yes'], env);
  const physical = path.join(root, 'data', 'wienerdog');
  fs.mkdirSync(path.dirname(physical), { recursive: true });
  fs.renameSync(core, physical);
  fs.symlinkSync(physical, core);
  const manifestPath = path.join(core, 'install-manifest.json');
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const physicalNote = path.join(physical, 'state', 'quarantine', '2026-09-18-note.md');
  // FIRST in `entries` ⇒ LAST replayed, so the preserve has completed by then.
  m.entries.unshift({ kind: 'file', path: physicalNote });
  fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
  assert.equal(fs.existsSync(path.join(physical, 'state', 'quarantine')), false, `${S}: both shelves start ABSENT`);
  const seamFs = fs.rmSync;
  let planted = null;
  fs.rmSync = (p, ...rest) => {
    if (!planted) planted = shelfFile(path.join(physical, 'state', 'quarantine'), '2026-09-18-note.md', 'physical path\n');
    return seamFs(p, ...rest);
  };
  let res;
  try {
    res = await uninstallInProcess(env, ['--yes']);
  } finally {
    fs.rmSync = seamFs;
  }
  assert.equal(readOrNull(physicalNote, 'utf8'), 'physical path\n',
    `${S}: the bytes survive although the entry names the PHYSICAL path, which the lexical anchors never see`);
  assert.ok(res.err, `${S}: and the run stops with the ledger intact`);
});

test('[SG-18] AC9 round 13 (X20): a `symlink` entry on a protected shelf’s chain is preserved — the alias first, then the original', async () => {
  const S = 'SG18-symlink-entry-on-the-chain-is-preserved';
  for (const which of ['intermediate', 'outermost']) {
    const { root, core, env, addEntries } = shelfManifestInstall();
    const state = path.join(core, 'state');
    const claudeSkills = path.join(root, 'sg-claude', 'skills');
    fs.mkdirSync(claudeSkills, { recursive: true });
    env.CLAUDE_CONFIG_DIR = path.join(root, 'sg-claude');
    const intermediate = path.join(claudeSkills, 'wienerdog-test');
    const logs = path.join(core, 'logs');
    fs.mkdirSync(logs, { recursive: true });
    fs.rmSync(state, { recursive: true, force: true });
    fs.symlinkSync(logs, intermediate);
    fs.symlinkSync(intermediate, state);
    const notePath = path.join(logs, 'quarantine', '2026-09-18-note.md');
    const entryPath = which === 'intermediate' ? intermediate : state;
    const linkTarget = which === 'intermediate' ? logs : intermediate;
    const id = manifestMod.linkIdentity(entryPath);
    addEntries([{ kind: 'symlink', path: entryPath, target: linkTarget, ...(id || {}) }], true);
    const seamFs = fs.rmSync;
    let note = null;
    fs.rmSync = (p, ...rest) => {
      if (!note) note = shelfFile(path.join(logs, 'quarantine'), '2026-09-18-note.md', 'behind two aliases\n');
      return seamFs(p, ...rest);
    };
    let res;
    try {
      res = await uninstallInProcess(env, ['--yes']);
    } finally {
      fs.rmSync = seamFs;
    }
    assert.ok(note && note === notePath, `${S}: ${which} — the fixture completed a preserve before the replay`);
    assert.equal(fs.existsSync(intermediate), true,
      `${S}: ${which} — the alias survives FIRST: it is what makes the original protectable on the next pass`);
    assert.equal(readOrNull(note, 'utf8'), 'behind two aliases\n', `${S}: ${which} — and the original's bytes are unchanged`);
    assert.ok(res.err, `${S}: ${which} — the run stops with the ledger intact`);
    // …and again as a RETRY, which is where the pre-round-13 rule lost it.
    const retry = await uninstallInProcess(env, ['--yes']);
    assert.equal(readOrNull(note, 'utf8'), 'behind two aliases\n', `${S}: ${which} — the RETRY leaves them unchanged too`);
    assert.ok(retry.err, `${S}: ${which} — and stops again`);
  }
});

test('[SG-19] AC4 round 18/19 (X19 clause (b)): an alias whose target OVERLAPS an allowed root is retained, across a full retry', async () => {
  const S = 'SG19-alias-into-an-allowed-root-is-retained';
  const { root, core, env, addEntries } = shelfManifestInstall();
  const aliasTarget = path.join(root, 'sg-claude');
  const claudeDir = path.join(aliasTarget, 'cfg');
  fs.mkdirSync(claudeDir, { recursive: true });
  env.CLAUDE_CONFIG_DIR = claudeDir;
  const state = path.join(core, 'state');
  fs.rmSync(state, { recursive: true, force: true });
  fs.symlinkSync(aliasTarget, state);
  const note = path.join(aliasTarget, 'quarantine', '2026-09-18-note.md');
  addEntries([{ kind: 'file', path: note }]);
  assert.equal(fs.existsSync(path.join(aliasTarget, 'quarantine')), false, `${S}: both shelves are ABSENT at the retention decision`);
  // The copy completes AFTER the retention decision: `<state>` is the FIRST
  // mechanics entry, so step 0b has already run by the time the sweep reaches
  // its next `fs.rmSync`. Wrapping the disposer is what confines the seam to
  // that window.
  const origDispose = manifestMod.disposeCoreMechanics;
  let planted = null;
  manifestMod.disposeCoreMechanics = (...a) => {
    const out = origDispose(...a);
    if (!planted) planted = shelfFile(path.join(aliasTarget, 'quarantine'), '2026-09-18-note.md', 'ancestor shape\n');
    return out;
  };
  try {
    await uninstallInProcess(env, ['--yes']);
  } finally {
    manifestMod.disposeCoreMechanics = origDispose;
  }
  assert.ok(planted, `${S}: the fixture really did complete a copy after the retention decision`);
  assert.equal(isLink(state), true, `${S}: the alias is RETAINED — its target overlaps an allowed root`);
  assert.equal(readOrNull(note, 'utf8'), 'ancestor shape\n', `${S}: and the copy survives the first run`);
  const retry = await uninstallInProcess(env, ['--yes']);
  assert.equal(readOrNull(note, 'utf8'), 'ancestor shape\n',
    `${S}: THE RETRY IS THE POINT — under the pre-round-18 rule the first run passes and the second destroys it`);
  assert.ok(retry.err, `${S}: and the retry stops rather than deleting the ledger`);
});

test('[SG-20] AC10 (W10): the MANIFEST survives a sweep that preserved something, and is deleted when nothing was', async () => {
  const S = 'SG20-manifest-survives-a-preserving-sweep';
  const { core, env, manifestPath, q } = shelfManifestInstall();
  const configPath = path.join(core, 'config.yaml');
  const configBefore = fs.readFileSync(configPath);
  const manifestBefore = fs.readFileSync(manifestPath);
  const origRmdir = fs.rmdirSync;
  let planted = null;
  fs.rmdirSync = (p, ...rest) => {
    if (!planted) planted = shelfFile(q, '2026-09-18-note.md', 'late copy\n');
    return origRmdir(p, ...rest);
  };
  let res;
  try {
    res = await uninstallInProcess(env, ['--yes']);
  } finally {
    fs.rmdirSync = origRmdir;
  }
  assert.ok(res.err, `${S}: the run STOPS rather than deleting the retry ledger`);
  assert.equal(fs.existsSync(manifestPath), true, `${S}: install-manifest.json is still present`);
  assert.deepEqual(readBytesOrNull(manifestPath), manifestBefore, `${S}: with unchanged bytes`);
  assert.equal(fs.existsSync(configPath), true, `${S}: and so is config.yaml`);
  assert.deepEqual(readBytesOrNull(configPath), configBefore, `${S}: likewise unchanged`);
  assert.ok(res.err.message.includes(q) || res.err.message.includes(path.dirname(q)),
    `${S}: the message NAMES what was preserved, literally — ${res.err.message}`);
  assert.ok(/re-running is safe/.test(res.err.message), `${S}: and says re-running is safe — ${res.err.message}`);
  // …and re-running once the shelf is cleared COMPLETES.
  fs.rmSync(q, { recursive: true, force: true });
  const again = await uninstallInProcess(env, ['--yes']);
  assert.equal(again.err, null, `${S}: re-running after the user clears the shelf completes (${again.err && again.err.message})`);
  assert.equal(fs.existsSync(core), false, `${S}: and the core is gone`);
  // ROUND 16'S ARM: the copy lands AFTER the first live sweep returned nothing
  // and before the manifest delete, and NO manifest entry names it — so the
  // FRESH inventory read is the only one of W10's three inputs that can see it.
  const late = shelfManifestInstall();
  const origDispose = manifestMod.disposeCoreMechanics;
  let calls = 0;
  let lateNote = null;
  manifestMod.disposeCoreMechanics = (...a) => {
    const out = origDispose(...a);
    calls += 1;
    if (calls === 1) lateNote = shelfFile(late.q, '2026-09-18-note.md', 'after the first sweep\n');
    return out;
  };
  let lateRes;
  try {
    lateRes = await uninstallInProcess(late.env, ['--yes']);
  } finally {
    manifestMod.disposeCoreMechanics = origDispose;
  }
  assert.ok(lateNote, `${S}: the fixture really did seam the copy in after the first sweep`);
  assert.ok(lateRes.err, `${S}: the run stops on the FRESH read alone — the first sweep legitimately returned nothing`);
  assert.equal(fs.existsSync(late.manifestPath), true, `${S}: and the ledger survives`);
  assert.equal(fs.existsSync(path.join(late.core, 'config.yaml')), true, `${S}: with config.yaml`);
  fs.rmSync(late.q, { recursive: true, force: true });
  const lateAgain = await uninstallInProcess(late.env, ['--yes']);
  assert.equal(lateAgain.err, null, `${S}: and a retry completes once the shelf is cleared (${lateAgain.err && lateAgain.err.message})`);

  // THE BOUNDARY: with nothing preserved the manifest is deleted exactly as before.
  const plain = shelfManifestInstall();
  const ok = await uninstallInProcess(plain.env, ['--yes']);
  assert.equal(ok.err, null, `${S}: an ordinary install still completes`);
  assert.equal(fs.existsSync(plain.manifestPath), false, `${S}: and its manifest IS deleted — the criterion measures the boundary`);
});

test('[SG-21] AC10 round 20 (X22): a replay-only resolution failure reaches W10, and an unconstructable SET aborts before any mutation', async () => {
  const S = 'SG21-shelf-guard-skip-reaches-w10';
  // (2) PER-ENTRY: a transient failure CONFINED TO THE LIVE REPLAY WINDOW —
  // wrapping `reverse()` itself is what confines it, so every later read
  // succeeds, the inventory finds the shelves empty and the disposer reports no
  // preservation. The stop then comes from `shelfGuarded` alone, which is the
  // whole point of the arm.
  const { core, env, manifestPath } = shelfManifestInstall();
  const appDir = path.join(core, 'app');
  // The chain walk classifies each component under its RESOLVED prefix, so the
  // injection has to answer to both spellings of the same object.
  const appDirReal = path.join(fs.realpathSync(core), 'app');
  const origReverse = manifestMod.reverse;
  manifestMod.reverse = (...a) => {
    const origLstat = fs.lstatSync;
    const origNative = fs.realpathSync.native;
    const boom = () => {
      const e = new Error('injected EIO');
      /** @type {any} */ (e).code = 'EIO';
      throw e;
    };
    // Under X17′ the RESOLUTION is `realpathSync.native`, so the injection has
    // to answer there as well as at the `lstat` that classifies the component.
    fs.lstatSync = (p, ...rest) => ((p === appDir || p === appDirReal) ? boom() : origLstat(p, ...rest));
    fs.realpathSync.native = (p, ...rest) => (
      (p === appDir || p === appDirReal) ? boom() : origNative(p, ...rest)
    );
    try {
      return origReverse(...a);
    } finally {
      fs.lstatSync = origLstat;
      fs.realpathSync.native = origNative;
    }
  };
  let res;
  try {
    res = await uninstallInProcess(env, ['--yes']);
  } finally {
    manifestMod.reverse = origReverse;
  }
  assert.ok(res.err, `${S}: a shelf-guard skip alone STOPS the run — the disposer preserved nothing`);
  assert.equal(fs.existsSync(manifestPath), true, `${S}: install-manifest.json survives`);
  assert.equal(fs.existsSync(path.join(core, 'config.yaml')), true, `${S}: and config.yaml with it`);
  const retry = await uninstallInProcess(env, ['--yes']);
  assert.equal(retry.err, null, `${S}: and re-running the whole command completes (${retry.err && retry.err.message})`);
  // (1) SET-LEVEL: unconstructable at guard initialisation ⇒ abort, nothing removed.
  const set = shelfManifestInstall();
  const before = snapshot(set.core);
  const target = path.join(set.core, 'state', 'quarantine');
  fs.mkdirSync(target, { recursive: true });
  const targetReal = path.join(fs.realpathSync(set.core), 'state', 'quarantine');
  const origLstat2 = fs.lstatSync;
  fs.lstatSync = (p, ...rest) => {
    if (p === target || p === targetReal) {
      const e = new Error('injected EIO');
      /** @type {any} */ (e).code = 'EIO';
      throw e;
    }
    return origLstat2(p, ...rest);
  };
  let setRes;
  let dryRes;
  try {
    setRes = await uninstallInProcess(set.env, ['--yes']);
    dryRes = await uninstallInProcess(set.env, ['--dry-run']);
  } finally {
    fs.lstatSync = origLstat2;
  }
  assert.ok(setRes.err, `${S}: an unanswerable protected SET aborts the live replay`);
  assert.ok(setRes.err.message.includes(target) && setRes.err.message.includes('EIO'),
    `${S}: naming the directory and its code — ${setRes.err.message}`);
  assert.deepEqual(snapshot(set.core), before, `${S}: with every recorded artifact still present`);
  assert.equal(dryRes.err, null, `${S}: while --dry-run reports it instead of aborting (${dryRes.err && dryRes.err.message})`);
});

test('[SG-22] AC10 round 21 (W10 outstanding filter): the remedy TERMINATES — a cleared path never blocks again', async () => {
  const S = 'SG22-remedy-terminates';
  const { core, env, manifestPath, q, addEntries } = shelfManifestInstall();
  const note = shelfFile(q, '2026-09-18-note.md', 'clear me\n');
  addEntries([{ kind: 'file', path: note }]);
  const first = await uninstallInProcess(env, ['--yes']);
  assert.ok(first.err, `${S}: the first run STOPS with that file preserved`);
  assert.equal(fs.existsSync(manifestPath), true, `${S}: and the manifest is kept`);
  // The complementary case, in the same test: still present ⇒ still stops.
  const stillThere = await uninstallInProcess(env, ['--yes']);
  assert.ok(stillThere.err, `${S}: with the file still present the run still stops — the filter is a FILTER, not a removal`);
  // Exactly the remedy the refusal prints: clear the file, do NOT edit the manifest.
  fs.rmSync(q, { recursive: true, force: true });
  const second = await uninstallInProcess(env, ['--yes']);
  assert.equal(second.err, null,
    `${S}: the second run COMPLETES — a protection that can never be satisfied is a denial of service (${second.err && second.err.message})`);
  assert.equal(fs.existsSync(manifestPath), false, `${S}: the manifest is deleted`);
  assert.equal(fs.existsSync(core), false, `${S}: and the core is gone`);
});

// ─── PR-gate round 2 regressions (PR #312 review, 2026-09-21) ───────────────
// Four guard bypasses the independent gate reproduced, each planted as the
// shape it found: the shelf bytes must survive, the run must stop via W10, and
// the stop must SAY so.

test('[SG-23] round 2 finding 1 (X12): a CASE-ALIASED entry path cannot slip past the guard', async () => {
  const S = 'SG23-case-aliased-entry-is-canonicalised';
  const { core, env, q, addEntries } = shelfManifestInstall();
  fs.mkdirSync(q, { recursive: true, mode: 0o700 });
  const capital = path.join(core, 'state', 'QUARANTINE');
  const caseInsensitive = fs.existsSync(capital);
  // The entry names the CAPITALISED spelling while the stored directory is
  // `quarantine`, so no lexical anchor contains it: only canonicalising each
  // existing component by the X12 fold can catch it.
  addEntries([{ kind: 'file', path: path.join(capital, '2026-note.md') }], true);
  const seamFs = fs.rmSync;
  let note = null;
  fs.rmSync = (p, ...rest) => {
    if (!note) note = shelfFile(q, '2026-note.md', 'case-aliased\n');
    return seamFs(p, ...rest);
  };
  let res;
  try {
    res = await uninstallInProcess(env, ['--yes']);
  } finally {
    fs.rmSync = seamFs;
  }
  assert.ok(note, `${S}: the fixture completed a preserve before the replay`);
  assert.equal(readOrNull(note), 'case-aliased\n',
    `${S}: the original's BYTES survive whichever spelling the entry used`);
  if (caseInsensitive) {
    assert.ok(res.err, `${S}: and the run STOPS — the case alias reaches the same object`);
    assert.ok(/quarantined copies are still here/.test(res.err.message),
      `${S}: with the shelf-derived form of the stop — ${res.err && res.err.message}`);
    assert.ok(res.err.message.includes(q), `${S}: naming the shelf directory`);
  } else {
    assert.equal(fs.existsSync(capital), false,
      `${S}: on a case-SENSITIVE volume the capitalised path is genuinely absent, so no deleter reaches it`);
    assert.ok(res.err, `${S}: and the run still stops on the copy itself`);
  }
});

test('[SG-24] round 2 finding 2 (X17): a relative link target resolves SEGMENT BY SEGMENT, not by lexical collapse', () => {
  const S = 'SG24-relative-link-target-resolved-in-order';
  const { paths } = sweepCore();
  const inner = path.join(paths.logs, 'inner');
  const recovery = path.join(paths.logs, 'recovery');
  fs.mkdirSync(inner, { recursive: true });
  fs.mkdirSync(recovery, { recursive: true });
  fs.symlinkSync(inner, path.join(paths.core, 'jump'));
  // `../jump/../recovery` from <state>: `..` → <core>, `jump` → <core>/logs/inner,
  // `..` → <core>/logs, `recovery` → <core>/logs/recovery. Collapsing the `..`
  // LEXICALLY first yields <core>/recovery and leaves <core>/logs unprotected.
  fs.symlinkSync('../jump/../recovery', path.join(paths.state, 'quarantine'));
  const note = shelfFile(recovery, '2026-note.md', 'behind a relative hop\n');
  const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  assert.equal(readOrNull(note), 'behind a relative hop\n',
    `${S}: the original's bytes survive — the kernel's answer is <core>/logs/recovery`);
  assert.equal(fs.existsSync(paths.logs), true,
    `${S}: and <core>/logs was NOT recursively deleted while the link was reported preserved`);
  assert.ok(res.preservedQuarantine.length > 0,
    `${S}: the sweep REPORTS what it kept (${JSON.stringify(res.preservedQuarantine)})`);
});

test('[SG-25] round 2 finding 3 (X18): a component NAMED `..recovery` is not parent traversal', () => {
  const S = 'SG25-dot-dot-prefixed-name-is-not-traversal';
  const { paths } = sweepCore();
  const odd = path.join(paths.logs, '..recovery');
  fs.mkdirSync(odd, { recursive: true });
  fs.symlinkSync(odd, path.join(paths.state, 'quarantine'));
  const note = shelfFile(odd, '2026-note.md', 'under a dot-dot name\n');
  const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  assert.equal(readOrNull(note), 'under a dot-dot name\n',
    `${S}: the original's bytes survive — a name beginning with two dots is a NAME, not an escape out of <core>/logs`);
  assert.equal(fs.existsSync(paths.logs), true, `${S}: and <core>/logs was not recursively deleted`);
  assert.ok(res.preservedQuarantine.length > 0,
    `${S}: the sweep REPORTS what it kept (${JSON.stringify(res.preservedQuarantine)})`);
});

test('[SG-26] round 2 finding 4 (P2): the hop budget is PER ROOT, so a long valid chain never blocks forever', async () => {
  const S = 'SG26-hop-budget-does-not-leak-between-roots';
  const { core, env } = shelfManifestInstall();
  const state = path.join(core, 'state');
  const chainRoot = path.join(core, 'hops');
  const realState = path.join(chainRoot, 'real');
  fs.mkdirSync(realState, { recursive: true });
  const realShelf = path.join(realState, 'quarantine');
  fs.mkdirSync(realShelf, { recursive: true, mode: 0o700 });
  // 21 links ABOVE the shelf, so both shelf roots are walked through them and
  // both shelf roots are REAL directories — the gate sees an EMPTY shelf and
  // the run proceeds to the replay, which is where the budget was spent. Under
  // a budget SHARED across the roots the second root reports ELOOP, the
  // protected set is unanswerable, and the live replay aborts on every retry.
  let target = realState;
  for (let i = 0; i < 21; i += 1) {
    const link = path.join(chainRoot, `l${i}`);
    fs.symlinkSync(target, link);
    target = link;
  }
  fs.rmSync(state, { recursive: true, force: true });
  fs.symlinkSync(target, state);
  assert.equal(manifestMod.quarantineInventory(require('../../src/core/paths').getPaths({ ...env })).entries, 0,
    `${S}: the gate sees an EMPTY shelf, so the run reaches the replay`);
  const seamFs = fs.rmSync;
  let note = null;
  fs.rmSync = (p, ...rest) => {
    if (!note) note = shelfFile(realShelf, '2026-note.md', 'twenty-one hops away\n');
    return seamFs(p, ...rest);
  };
  let first;
  try {
    first = await uninstallInProcess(env, ['--yes']);
  } finally {
    fs.rmSync = seamFs;
  }
  assert.ok(note, `${S}: the fixture completed a preserve before the replay`);
  assert.ok(first.err, `${S}: the run stops`);
  assert.equal(/ELOOP/.test(first.err.message), false,
    `${S}: but NOT with an ELOOP abort — the second root must get its own budget — ${first.err.message}`);
  assert.ok(/quarantined copies are still here/.test(first.err.message),
    `${S}: it is the shelf-derived stop, which names what to clear — ${first.err.message}`);
  assert.equal(readOrNull(note), 'twenty-one hops away\n', `${S}: and the original's bytes survive`);
  // …and the remedy TERMINATES: with the copy and the chain cleared it finishes.
  fs.rmSync(realShelf, { recursive: true, force: true });
  fs.unlinkSync(state);
  fs.rmSync(chainRoot, { recursive: true, force: true });
  fs.mkdirSync(state, { recursive: true });
  const second = await uninstallInProcess(env, ['--yes']);
  assert.equal(second.err, null,
    `${S}: once the chain and the copy are gone the run COMPLETES (${second.err && second.err.message})`);
});

// ─── PR-gate round 3 regressions (PR #312 review, 2026-09-21) ───────────────
// Two more P1 bypasses and two P2 false blocks. The resolver is now the
// kernel's (X17′), so each of these is a property of `realpathSync.native`
// rather than of a hand-rolled rule — which is what the freeze buys.

test('[SG-27] round 3 P1 (X17\u2032): a NON-ASCII case alias is the kernel\u2019s answer, on EITHER volume', () => {
  const S = 'SG27-non-ascii-case-alias-is-the-kernels';
  const { paths } = sweepCore();
  // The shelf is a DIRECT CHILD of <state>, so the two spellings are the only
  // thing that differs between the volumes — nothing else moves.
  const stored = path.join(paths.state, '\u03a9');
  fs.mkdirSync(path.join(stored, 'recovery'), { recursive: true });
  const note = shelfFile(path.join(stored, 'recovery'), '2026-note.md', 'behind an omega\n');
  const lower = path.join(paths.state, '\u03c9', 'recovery');
  fs.symlinkSync(lower, path.join(paths.state, 'quarantine'));
  const caseInsensitive = fs.existsSync(lower);
  const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  if (caseInsensitive) {
    assert.equal(readOrNull(note), 'behind an omega\n',
      `${S}: the kernel resolves the lowercase alias to the STORED spelling, so the original's bytes survive`);
    assert.equal(fs.existsSync(stored), true, `${S}: and the directory holding it is preserved`);
    assert.ok(res.preservedQuarantine.length > 0,
      `${S}: the sweep reports what it kept (${JSON.stringify(res.preservedQuarantine)})`);
  } else {
    // On a case-SENSITIVE volume the lowercase path names NOTHING, so the link
    // dangles and protects nothing — and that is the CORRECT outcome, not a
    // second-class one: <state>'s ordinary children are swept as always.
    assert.equal(fs.existsSync(lower), false, `${S}: the alias really does dangle here`);
    assert.equal(readOrNull(note), null,
      `${S}: and <state>/\u03a9 is swept exactly as any other ordinary child — the dangling alias protects nothing`);
  }
});

test('[SG-28] round 3 P1 (X17′): a RELATIVE manifest path is anchored at the canonical cwd and guarded', async () => {
  const S = 'SG28-relative-entry-path-is-anchored';
  const { core, env, q, addEntries } = shelfManifestInstall();
  fs.mkdirSync(q, { recursive: true, mode: 0o700 });
  fs.symlinkSync(q, path.join(core, 'cache'));
  // `../cache/n.md` means nothing until it is anchored; walked from an empty
  // root it used to resolve to `/cache/n.md` and miss every anchor.
  addEntries([{ kind: 'file', path: path.join('..', 'cache', '2026-note.md') }], true);
  // The cwd must OUTLIVE the sweep: a directory the uninstall removes would
  // leave the process without one and break every later test in the file.
  const here = path.join(core, 'cwd-anchor');
  fs.mkdirSync(here, { recursive: true });
  const cwd = process.cwd();
  const seamFs = fs.rmSync;
  let note = null;
  fs.rmSync = (p, ...rest) => {
    if (!note) note = shelfFile(q, '2026-note.md', 'reached by a relative path\n');
    return seamFs(p, ...rest);
  };
  let res;
  try {
    process.chdir(here);
    res = await uninstallInProcess(env, ['--yes']);
  } finally {
    fs.rmSync = seamFs;
    process.chdir(cwd);
  }
  assert.ok(note, `${S}: the fixture completed a preserve before the replay`);
  assert.equal(readOrNull(note), 'reached by a relative path\n',
    `${S}: the original's BYTES survive — the relative entry resolves into the shelf`);
  assert.ok(res.err, `${S}: and the run stops rather than deleting the ledger`);
});

test('[SG-29] round 3 P2 (X16\u2033): an out-of-root TARGET is not admitted by an in-root SPELLING', async () => {
  const S = 'SG29-out-of-root-target-is-not-guarded';
  const { root, core, env, addEntries } = shelfManifestInstall();
  // The reviewer's shape: a SYMLINKED home, with the shelf resolving under the
  // real home — outside all four allowed roots — and a `copied-skill` LINK
  // inside the core pointing at that shelf node. Its SPELLING is in-root; its
  // TARGET is not, and no deleter can reach the target, so guarding it would
  // block the uninstall forever over a path this command never touches.
  const realHome = path.join(root, 'real-home');
  fs.mkdirSync(realHome, { recursive: true });
  const homeLink = path.join(root, 'home');
  fs.symlinkSync(realHome, homeLink);
  const shelfNode = path.join(realHome, 'quarantine');
  fs.mkdirSync(shelfNode, { recursive: true, mode: 0o700 });
  const state = path.join(core, 'state');
  fs.rmSync(state, { recursive: true, force: true });
  fs.symlinkSync(homeLink, state);
  const skills = path.join(core, 'skills');
  fs.mkdirSync(skills, { recursive: true });
  const link = path.join(skills, 'wienerdog-retargeted');
  fs.symlinkSync(shelfNode, link);
  addEntries([{ kind: 'copied-skill', path: link, hash: 'deadbeef' }]);
  // The ruling is about `shelfGuarded`, so that is what is pinned directly.
  const paths = require('../../src/core/paths').getPaths({ ...env });
  const m = JSON.parse(fs.readFileSync(path.join(core, 'install-manifest.json'), 'utf8'));
  const dry = manifestMod.reverse(paths, m, { dryRun: true });
  assert.equal(dry.shelfGuarded.includes(link), false,
    `${S}: the entry does NOT enter shelfGuarded — its TARGET is outside every allowed root, so no deleter reaches it (${JSON.stringify(dry.shelfGuarded)})`);
  const res = await uninstallInProcess(env, ['--yes']);
  assert.equal(readOrNull(path.join(realHome, 'marker')) === null, true,
    `${S}: nothing was written outside the core by the run`);
  assert.equal(fs.existsSync(shelfNode), true,
    `${S}: and the out-of-root shelf node is untouched`);
  void res;
});

test('[SG-30] round 3 P2 (X4′): a preserved report is RECONCILED, so an emptied case alias never blocks', async () => {
  const S = 'SG30-preserved-report-is-reconciled';
  const { core, env } = shelfManifestInstall();
  const state = path.join(core, 'state');
  const capital = path.join(state, 'Quarantine');
  fs.mkdirSync(capital, { recursive: true, mode: 0o700 });
  const caseInsensitive = fs.existsSync(path.join(state, 'quarantine'));
  const res = await uninstallInProcess(env, ['--yes']);
  if (caseInsensitive) {
    assert.equal(res.err, null,
      `${S}: an EMPTY shelf under either spelling lets the uninstall COMPLETE — the report must not name a directory the sweep already removed (${res.err && res.err.message})`);
    assert.equal(fs.existsSync(core), false, `${S}: and the core is gone`);
  } else {
    assert.ok(res.err, `${S}: on a case-SENSITIVE volume the fold-ambiguous name is preserved by X12, as designed`);
    assert.ok(/quarantined copies are still here/.test(res.err.message),
      `${S}: with the shelf-derived stop — ${res.err.message}`);
  }
});

test('[SG-FUZZ] X17′ exactness: walkChain agrees with the kernel over randomised layouts', () => {
  const S = 'SGFUZZ-walkchain-equals-realpath-native';
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-fuzz-')));
  // Unicode case pairs, an ASCII pair and a caseless letter, so the fold this
  // package no longer runs cannot come back by accident.
  const NAMES = ['a', 'B', 'b', 'ω', 'Ω', 'é', 'É', 'ß', 'x.y', '..z', 'z..'];
  const dirs = [root];
  const files = [];
  const links = [];
  let seed = 20260921;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 700; i += 1) {
    const parent = dirs[rnd(dirs.length)];
    const name = NAMES[rnd(NAMES.length)] + (rnd(4) === 0 ? '' : String(i));
    const full = path.join(parent, name);
    if (fs.existsSync(full)) continue;
    const kind = rnd(10);
    try {
      if (kind < 4) { fs.mkdirSync(full); dirs.push(full); }
      else if (kind < 6) { fs.writeFileSync(full, 'x'); files.push(full); }
      else {
        // Targets: absolute, relative, and relative with `..` AFTER a link.
        const pick = [...dirs, ...files, ...links][rnd(dirs.length + files.length + links.length)];
        const t = rnd(3) === 0 ? pick
          : rnd(2) === 0 ? path.relative(parent, pick) || '.'
            : path.join(path.relative(parent, pick) || '.', '..', path.basename(pick));
        fs.symlinkSync(t, full); links.push(full);
      }
    } catch { /* name clash on a case-insensitive volume — skip */ }
  }
  // A deliberate cycle, so the ELOOP arm is exercised rather than merely declared.
  const c1 = path.join(root, 'cycle-a');
  const c2 = path.join(root, 'cycle-b');
  fs.symlinkSync(c2, c1);
  fs.symlinkSync(c1, c2);
  links.push(c1, c2);
  const cwd = process.cwd();
  const cwds = [root, dirs[1] || root, dirs[2] || root, dirs[3] || root,
    dirs[4] || root, dirs[5] || root, dirs[6] || root, cwd];
  const all = [...dirs, ...files, ...links];
  let probes = 0; let okAgree = 0; let absent = 0; let eloop = 0;
  try {
    for (const from of cwds) {
      process.chdir(from);
      for (const target of all) {
        for (const suffix of ['', '/nope', '/..', '/./x', '/../..', '/nope/../also-nope']) {
          for (const rel of [false, true]) {
            let p = target + suffix;
            if (rel) {
              const r = path.relative(from, target);
              if (r === '' || r.startsWith('..')) continue;
              p = r + suffix;
            }
            probes += 1;
            const mine = manifestMod.__walkChainForTest(p);
            let kernel = null; let kcode = null;
            try { kernel = fs.realpathSync.native(p); } catch (e) { kcode = e.code; }
            if (kernel !== null) {
              assert.equal(mine.state, 'ok', `${S}: the kernel resolved ${p} but walkChain said ${mine.state}`);
              assert.equal(mine.real, kernel, `${S}: walkChain must equal realpathSync.native for ${p}`);
              okAgree += 1;
            } else if (kcode === 'ELOOP') {
              assert.equal(mine.state, 'unanswerable', `${S}: ELOOP must be UNANSWERABLE for ${p}`);
              assert.equal(mine.code, 'ELOOP', `${S}: and carry the code for ${p}`);
              eloop += 1;
            } else if (kcode === 'ENOENT' || kcode === 'ENOTDIR') {
              assert.equal(mine.state, 'absent', `${S}: absence is not a failure for ${p}`);
              absent += 1;
            }
          }
        }
      }
    }
  } finally {
    process.chdir(cwd);
  }
  assert.ok(probes >= 3000, `${S}: at least 3000 probes (ran ${probes})`);
  assert.ok(okAgree >= 500, `${S}: and a real population of RESOLVING probes (${okAgree})`);
  assert.ok(absent >= 100, `${S}: and of absent ones (${absent})`);
  assert.ok(eloop >= 1, `${S}: and the ELOOP arm really fired (${eloop})`);
  process.stderr.write(`[SG-FUZZ] probes=${probes} agree=${okAgree} absent=${absent} eloop=${eloop}\n`);
});

// ─── PR-gate round 4 regressions (PR #312 review, 2026-09-21) ───────────────
// ONE family: chain collection. Under X17″ the chain nodes of a shelf root are
// EVERY node the raw-segment traversal visits — each link location, each
// intermediate target, and every directory traversed inside a link-target
// string — and each root's walk gets its own hop budget.

/** Plant a copy the first time `fs.rmSync` runs, i.e. after the gate's
 *  inventory and inside the replay. @returns {() => string|null} */
function seamPlant(dir, name, text) {
  const orig = fs.rmSync;
  let planted = null;
  fs.rmSync = (p, ...rest) => {
    if (!planted) planted = shelfFile(dir, name, text);
    return orig(p, ...rest);
  };
  return { restore: () => { fs.rmSync = orig; }, get: () => planted };
}

test('[SG-31] round 4 P1 #1 (X17″): a relative target is traversed RAW, so a link inside it is on the chain', async () => {
  const S = 'SG31-relative-target-traversed-raw';
  const { core, env } = shelfManifestInstall();
  const app = path.join(core, 'app');
  const logs = path.join(core, 'logs');
  const inner = path.join(core, 'inner');
  fs.mkdirSync(logs, { recursive: true });
  fs.mkdirSync(inner, { recursive: true });
  fs.rmSync(app, { recursive: true, force: true });
  fs.mkdirSync(app, { recursive: true });
  fs.symlinkSync(inner, path.join(app, 'jump'));
  const state = path.join(core, 'state');
  fs.rmSync(state, { recursive: true, force: true });
  // `app/jump/../logs` as a LITERAL string — `path.join` would collapse it here
  // in the fixture itself, which is the very mistake under test.
  fs.symlinkSync(['app', 'jump', '..', 'logs'].join(path.sep), state);
  const seam = seamPlant(path.join(logs, 'quarantine'), '2026-note.md', 'behind a raw hop\n');
  let res;
  try {
    res = await uninstallInProcess(env, ['--yes']);
  } finally {
    seam.restore();
  }
  const note = seam.get();
  assert.ok(note, `${S}: the fixture completed a preserve after the gate`);
  assert.equal(fs.existsSync(path.join(app, 'jump')), true,
    `${S}: the link INSIDE the target string survives — removing it makes <state> dangle`);
  assert.equal(fs.existsSync(app), true, `${S}: and so does the directory holding it`);
  assert.equal(readOrNull(note), 'behind a raw hop\n', `${S}: so the original's bytes survive`);
  assert.ok(res.err, `${S}: and the run stops with the ledger intact`);
});

test('[SG-32] round 4 P1 #2 (X17″): a DIRECTORY traversed inside a target string is a class (ii) node', async () => {
  const S = 'SG32-traversed-directory-is-a-chain-node';
  for (const form of ['absolute', 'relative']) {
    const { core, env } = shelfManifestInstall();
    const app = path.join(core, 'app');
    const logs = path.join(core, 'logs');
    fs.mkdirSync(logs, { recursive: true });
    const state = path.join(core, 'state');
    fs.rmSync(state, { recursive: true, force: true });
    const target = form === 'absolute'
      ? [app, '..', 'logs'].join(path.sep)
      : ['app', '..', 'logs'].join(path.sep);
    fs.symlinkSync(target, state);
    const seam = seamPlant(path.join(logs, 'quarantine'), '2026-note.md', 'past a traversed dir\n');
    let res;
    try {
      res = await uninstallInProcess(env, ['--yes']);
    } finally {
      seam.restore();
    }
    const note = seam.get();
    assert.ok(note, `${S}: ${form} — the fixture completed a preserve after the gate`);
    assert.equal(fs.existsSync(app), true,
      `${S}: ${form} — <core>/app is on the chain: its removal would make <state> dangle, so the replay is REFUSED`);
    assert.equal(readOrNull(note), 'past a traversed dir\n',
      `${S}: ${form} — and the original's bytes survive`);
    assert.ok(res.err, `${S}: ${form} — the run stops and reports`);
  }
});

test('[SG-33] round 4 P1 #3 (X17″): each shelf root gets its OWN hop budget', () => {
  const S = 'SG33-hop-budget-is-per-root';
  const { paths, core } = sweepCore();
  const chainRoot = path.join(core, 'hops');
  const realState = path.join(chainRoot, 'real');
  fs.mkdirSync(realState, { recursive: true });
  let target = realState;
  for (let i = 0; i < 21; i += 1) {
    const link = path.join(chainRoot, `l${i}`);
    fs.symlinkSync(target, link);
    target = link;
  }
  fs.rmSync(paths.state, { recursive: true, force: true });
  fs.symlinkSync(target, paths.state);
  // The REDACTED root's walk is the SECOND one, and its intermediate link sits
  // INSIDE a directory the mechanics sweep deletes recursively. Only collecting
  // that link makes `<core>/schedules` block from above; a second root whose
  // walk never got there loses the link and dangles the chain.
  const recovery = path.join(core, 'store', 'recovery');
  fs.mkdirSync(recovery, { recursive: true });
  const jump = path.join(core, 'schedules', 'jump');
  fs.symlinkSync(recovery, jump);
  fs.mkdirSync(path.join(realState, 'quarantine'), { recursive: true, mode: 0o700 });
  fs.symlinkSync(jump, path.join(realState, 'quarantine', 'redacted'));
  const note = shelfFile(recovery, '2026-note.md', 'on the second root chain\n');
  const prot = manifestMod.__shelfProtectionForTest(paths);
  assert.equal(prot.unanswerable, null,
    `${S}: each root's walk has budget of its own (${JSON.stringify(prot.unanswerable)})`);
  const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  assert.equal(isLink(jump), true,
    `${S}: the intermediate link on the SECOND root's chain was collected, so it survives`);
  assert.equal(fs.existsSync(path.join(core, 'schedules')), true,
    `${S}: and the swept directory HOLDING it is blocked from above rather than removed`);
  assert.equal(readOrNull(note), 'on the second root chain\n',
    `${S}: the original's bytes survive`);
  assert.ok(res.preservedQuarantine.length > 0,
    `${S}: the sweep reports what it kept (${JSON.stringify(res.preservedQuarantine)})`);
});

test('[SG-34] round 4 P2 (X15′): the planner applies the SAME retention as the live sweep', () => {
  const S = 'SG34-planner-applies-retention';
  const build = () => {
    const { paths } = sweepCore();
    fs.rmSync(paths.state, { recursive: true, force: true });
    fs.symlinkSync(paths.logs, paths.state);
    fs.mkdirSync(path.join(paths.logs, 'quarantine'), { recursive: true, mode: 0o700 });
    return paths;
  };
  const planPaths = build();
  const { value: plan, calls } = withFsSeam(
    () => manifestMod.disposeCoreMechanics(planPaths, { dryRun: true, vaultPath: null })
  );
  for (const n of Object.keys(calls)) {
    assert.equal(calls[n].length, 0,
      `${S}: the planner still performs ZERO mutating calls — fs.${n} ran ${calls[n].length} time(s)`);
  }
  const livePaths = build();
  const live = manifestMod.disposeCoreMechanics(livePaths, { dryRun: false, vaultPath: null });
  const strip = (arr, base) => arr.map((x) => path.relative(base, x)).sort();
  assert.deepEqual(strip(plan.preservedQuarantine, planPaths.core), strip(live.preservedQuarantine, livePaths.core),
    `${S}: the plan PRESERVES exactly what the live run preserves — a plan that lists a directory the command cannot remove is the defect`);
  assert.deepEqual(strip(plan.removed, planPaths.core), strip(live.removed, livePaths.core),
    `${S}: and predicts exactly what it removes`);
  assert.ok(plan.preservedQuarantine.length > 0,
    `${S}: and on this fixture that is a NON-EMPTY set (${JSON.stringify(strip(plan.preservedQuarantine, planPaths.core))})`);
});

/** A core that is ITSELF a symlink, plus an N-link relative chain from
 *  `<state>/quarantine` to a real directory holding the user's copy. Every hop
 *  is a DISTINCT link, and reaching each one re-walks the core link — which is
 *  exactly what used to be charged again on every hop (X17‴). */
function symlinkedCoreChain(hops) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sg-')));
  const real = path.join(root, 'real-wd');
  const core = path.join(root, 'wd');
  fs.mkdirSync(real, { recursive: true });
  fs.symlinkSync(real, core); // <core> IS a link, re-traversed by every relative target
  const paths = getPaths({
    HOME: root,
    WIENERDOG_HOME: core,
    XDG_CONFIG_HOME: path.join(root, '.config'),
    CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
    CODEX_HOME: path.join(root, 'absent-codex'),
  });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(paths.logs, 'run.log'), 'log\n');
  // The far end: a real directory with the user's quarantined copy in it.
  const store = path.join(paths.state, 'store');
  const note = shelfFile(store, '2026-note.md', 'at the end of a long chain\n');
  // `h0 -> h1 -> … -> h(hops-2) -> store`, then `quarantine -> h0`. Relative
  // targets throughout, so each resolution walks the core link again.
  for (let i = hops - 2; i >= 0; i -= 1) {
    const next = i === hops - 2 ? 'store' : `h${i + 1}`;
    fs.symlinkSync(next, path.join(paths.state, `h${i}`));
  }
  fs.symlinkSync('h0', path.join(paths.state, 'quarantine'));
  return { root, core, paths, note, store };
}

test('[SG-35] round 4 P1 (X17‴): a hop budget that expires is UNANSWERABLE, never a completed walk', () => {
  const S = 'SG35-budget-exhaustion-fails-closed';
  // 45 DISTINCT links: past the 40-hop budget however the hops are counted, so
  // the collection cannot finish and the answer must be "I could not verify
  // this", not the kernel's cheerful `ok`.
  const { paths, note } = symlinkedCoreChain(45);
  const walked = manifestMod.__walkChainForTest(path.join(paths.state, 'quarantine'));
  assert.equal(walked.state, 'unanswerable',
    `${S}: a walk cut short by the budget is UNANSWERABLE, never \`ok\` (${JSON.stringify(walked)})`);
  assert.equal(walked.code, 'EBUDGET',
    `${S}: with the budget's own code — the resolver answers before it asks the kernel`);
  assert.equal(manifestMod.spellResolutionCode('EBUDGET'), 'chain too long to verify',
    `${S}: which the report spells in words, not as an invented errno`);
  const prot = manifestMod.__shelfProtectionForTest(paths);
  assert.notEqual(prot.unanswerable, null,
    `${S}: and the protected set carries the open question rather than a partial closure`);
  const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  assert.equal(readOrNull(note), 'at the end of a long chain\n',
    `${S}: and the copy at the far end of the chain still has its bytes`);
  assert.ok(res.preservedQuarantine.length > 0,
    `${S}: the sweep preserves and REPORTS rather than deleting what it could not verify`);
});

test('[SG-36] round 4 P1 (X17‴): a kernel-valid chain on a symlinked core stays UNDER budget and completes', () => {
  const S = 'SG36-distinct-link-hops-only';
  // 25 links — the kernel resolves this without complaint, so a protected set
  // that reported "too long" here would refuse an install the OS is happy with.
  // Before X17‴ the core link was charged again on every hop: ~50 charges.
  const { paths, note, store } = symlinkedCoreChain(25);
  const prot = manifestMod.__shelfProtectionForTest(paths);
  assert.equal(prot.unanswerable, null,
    `${S}: 25 distinct hops is under the budget (got ${JSON.stringify(prot.unanswerable)})`);
  assert.equal(prot.existing, true, `${S}: and the shelf resolved, so the walk really did finish`);
  const walked = manifestMod.__walkChainForTest(path.join(paths.state, 'quarantine'));
  assert.equal(walked.state, 'ok', `${S}: walkChain agrees with the kernel (${JSON.stringify(walked)})`);
  assert.equal(walked.real, fs.realpathSync.native(store), `${S}: and lands where the kernel lands`);
  const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  assert.equal(readOrNull(note), 'at the end of a long chain\n', `${S}: the copy survives the sweep`);
  assert.equal(res.removed.includes(paths.logs), true,
    `${S}: and an ordinary uninstall still proceeds — logs/ is gone (${JSON.stringify(res.removed)})`);
});

test('[SG-37] round 4 P2: the empty-directory climb never removes a CHAIN NODE', () => {
  const S = 'SG37-climb-preserves-a-chain-node';
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sg-')));
  const real = path.join(root, 'real-wd');
  const core = path.join(root, 'wd');
  fs.mkdirSync(path.join(real, 'state', 'quarantine', 'redacted'), { recursive: true });
  // The core link's own target TRAVELS THROUGH the shelf and climbs back out, so
  // `redacted` is a class (ii) chain node: remove it and the core link dangles.
  fs.symlinkSync(
    [real, 'state', 'quarantine', 'redacted', '..', '..', '..'].join(path.sep),
    core
  );
  const paths = getPaths({
    HOME: root,
    WIENERDOG_HOME: core,
    XDG_CONFIG_HOME: path.join(root, '.config'),
    CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
    CODEX_HOME: path.join(root, 'absent-codex'),
  });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.writeFileSync(path.join(paths.logs, 'run.log'), 'log\n');
  const redacted = path.join(real, 'state', 'quarantine', 'redacted');
  const res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  assert.equal(fs.existsSync(redacted), true,
    `${S}: the empty shelf the core link stands on is NOT rmdir'd`);
  assert.equal(isLink(core), true, `${S}: so the core link still points at something`);
  assert.equal(fs.realpathSync.native(core), real, `${S}: and still resolves to the physical core`);
  assert.ok(res.preservedQuarantine.length > 0,
    `${S}: and the run REPORTS what it kept instead of claiming completion (${JSON.stringify(res.preservedQuarantine)})`);
});

test('[SG-38] round 4 P2 (X15′): the planner discounts only the child it predicted removing', () => {
  const S = 'SG38-planner-discounts-one-predicted-child';
  // (a) A FILE named `redacted` INSIDE the redacted shelf. Nothing removes it,
  //     so the live climb takes ENOTEMPTY at the first level and stops — but a
  //     filter keyed on the fold-equal NAME discounted it and predicted the
  //     whole tree away. This arm is filesystem-independent.
  const a = sweepCore();
  const aRed = path.join(a.paths.state, 'quarantine', 'redacted');
  shelfFile(aRed, 'redacted', 'a copy that happens to be named after its shelf\n');
  const aPlan = manifestMod.disposeCoreMechanics(a.paths, { dryRun: true, vaultPath: null });
  const aLive = manifestMod.disposeCoreMechanics(a.paths, { dryRun: false, vaultPath: null });
  assert.equal(aPlan.removed.includes(a.paths.state), aLive.removed.includes(a.paths.state),
    `${S}: plan and live agree about <state> (plan=${JSON.stringify(aPlan.removed)}, live=${JSON.stringify(aLive.removed)})`);
  assert.equal(aLive.removed.includes(a.paths.state), false,
    `${S}: and neither removes it — the shelf still holds a file`);
  assert.equal(readOrNull(path.join(aRed, 'redacted')), 'a copy that happens to be named after its shelf\n',
    `${S}: whose bytes are untouched`);
  // (b) The same discount, one level up, on a case-SENSITIVE volume only: a
  //     second directory `REDACTED` that no climb step removes.
  const b = sweepCore();
  const bq = path.join(b.paths.state, 'quarantine');
  fs.mkdirSync(path.join(bq, 'redacted'), { recursive: true });
  fs.mkdirSync(path.join(bq, 'REDACTED'), { recursive: true });
  const caseSensitive = fs.readdirSync(bq).length === 2;
  const bPlan = manifestMod.disposeCoreMechanics(b.paths, { dryRun: true, vaultPath: null });
  const bLive = manifestMod.disposeCoreMechanics(b.paths, { dryRun: false, vaultPath: null });
  assert.equal(bPlan.removed.includes(b.paths.state), bLive.removed.includes(b.paths.state),
    `${S}: plan and live agree there too (plan=${JSON.stringify(bPlan.removed)}, live=${JSON.stringify(bLive.removed)})`);
  if (caseSensitive) {
    assert.equal(bLive.removed.includes(b.paths.state), false,
      `${S}: and on ext4 neither removes it — REDACTED is a leftover the climb cannot take`);
  } else {
    assert.equal(bLive.removed.includes(b.paths.state), true,
      `${S}: while on a case-INSENSITIVE volume the two spellings are ONE empty shelf, and both take it`);
  }
});

test('[SG-39] AC4 round 4 (W8′): the closing summary prints EVERY preserved path, one per line', async () => {
  const S = 'SG39-summary-lists-every-preserved-path';
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const manifest = path.join(core, 'install-manifest.json');
  const state = path.join(core, 'state');
  // `R-post-ledger-preserve` is the ONE path that reaches the closing summary
  // rather than Table W row W10's stop: the copy lands after the retry ledger is
  // gone, so the second sweep preserves and the run still completes. Two
  // directories are preserved — a fold-equal child and the level the climb
  // stops at — and a summary that named only the first would strand the other.
  const orig = fs.rmSync;
  let planted = false;
  fs.rmSync = (p, ...rest) => {
    const r = orig(p, ...rest);
    if (!planted && !fs.existsSync(manifest)) {
      planted = true;
      shelfFile(path.join(state, 'Quarantine'), '2026-note.md', 'after the ledger\n');
    }
    return r;
  };
  let res;
  try {
    res = await uninstallInProcess(env, ['--yes']);
  } finally {
    fs.rmSync = orig;
  }
  assert.equal(planted, true, `${S}: the seam fired — the copy really did land after the ledger`);
  assert.equal(res.err, null, `${S}: and the run COMPLETES rather than stopping (${res.err && res.err.message})`);
  const lines = res.out.split('\n');
  const header = lines.findIndex((l) => l.includes('your quarantined copies are still in it'));
  assert.notEqual(header, -1, `${S}: the W8 arm is the one that printed:\n${res.out}`);
  const listed = [];
  for (let i = header + 1; i < lines.length && lines[i].startsWith('  '); i += 1) listed.push(lines[i].trim());
  assert.ok(listed.length >= 2,
    `${S}: EVERY preserved path is on a line of its own, not just the first (${JSON.stringify(listed)})`);
  assert.equal(listed.length, new Set(listed).size, `${S}: each exactly once`);
  for (const p of listed) {
    assert.equal(fs.existsSync(p), true, `${S}: and each named path really is still there — ${p}`);
  }
});

// ─── PR-gate round 5b regressions (PR #312 review, 2026-09-21) ──────────────
// X17⁗: every deletion guard tests BOTH the kernel-canonical target and the one
// the deleter's own `fs.realpathSync` computes; a chain that cannot be READ to
// the end is unanswerable; and the planner matches its predicted child by
// filesystem identity.

test('[SG-40] round 5b P1 (X17⁗): the guard tests the target the DELETER resolves, not only the kernel’s', () => {
  const S = 'SG40-deleter-target-is-guarded';
  const { core, env, q, addEntries } = shelfManifestInstall();
  const outside = path.join(core, 'outside', 'deep');
  fs.mkdirSync(outside, { recursive: true });
  // The KERNEL's landing place has to exist too, or the alias is simply dangling
  // and both resolvers agree on ENOENT. With both present they split.
  fs.mkdirSync(path.join(core, 'outside', 'state', 'quarantine'), { recursive: true });
  fs.mkdirSync(q, { recursive: true, mode: 0o700 });
  // `jump -> outside/deep`, and the alias target carries a `..` AFTER it. The
  // kernel follows `jump` first and lands in `<core>/outside`; Node's own
  // realpath collapses the `..` LEXICALLY and lands in `<core>/state/quarantine`
  // — and it is that second answer the file reverser acts on.
  fs.symlinkSync(path.join('outside', 'deep'), path.join(core, 'jump'));
  const alias = path.join(core, 'alias');
  fs.symlinkSync(['jump', '..', 'state', 'quarantine'].join(path.sep), alias);
  const native = (p) => { try { return fs.realpathSync.native(p); } catch { return null; } };
  const js = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
  assert.notEqual(native(alias), js(alias),
    `${S}: the fixture really does split the two resolvers (${native(alias)} vs ${js(alias)})`);
  assert.equal(js(alias), fs.realpathSync(q), `${S}: and the DELETER's answer is the shelf itself`);
  // `reverse()` deletes `fs.realpathSync(entry.path)` — so the alias names the
  // SHELF to the deleter, even though the kernel reads the same spelling as a
  // path inside `outside/`.
  assert.equal(fs.realpathSync(alias), fs.realpathSync(q),
    `${S}: the deleter's own resolver lands on the shelf itself`);
  const note = shelfFile(q, '2026-note.md', 'reached through the collapsed alias\n');
  const shadow = path.join(alias, '2026-note.md');
  assert.equal(fs.realpathSync(shadow), fs.realpathSync(note),
    `${S}: and so does the entry path — this is the file \`reverse()\` would unlink`);
  addEntries([{ kind: 'file', path: shadow }], true);
  // The ruling is about the GUARD, so `reverse()` is driven directly: the CLI's
  // gate refuses a populated shelf long before any deleter runs, which would
  // make a whole-command fixture pass for a reason that is not this one.
  const paths = require('../../src/core/paths').getPaths({ ...env });
  const m = JSON.parse(fs.readFileSync(path.join(core, 'install-manifest.json'), 'utf8'));
  // `reverse()` may ABORT before any mutation (X22) — that is also a preserve,
  // and it must reach this test as an assertion about the bytes rather than as
  // an uncaught throw, which `scripts/red-proofs.js` refuses as a red.
  let res = null;
  let err = null;
  try {
    res = manifestMod.reverse(paths, m, { dryRun: false });
  } catch (e) {
    err = e;
  }
  assert.equal(readOrNull(note), 'reached through the collapsed alias\n',
    `${S}: the copy's BYTES survive the replay`);
  if (res) {
    assert.equal(res.shelfGuarded.includes(shadow), true,
      `${S}: and the entry is REPORTED as shelf-guarded (${JSON.stringify(res.shelfGuarded)})`);
    assert.equal(res.removed.includes(shadow), false, `${S}: never removed`);
  } else {
    assert.ok(err, `${S}: the replay aborted before any mutation, which preserves too`);
  }
});

test('[SG-41] round 5b P1: a chain that cannot be READ to the end is UNANSWERABLE, not a shorter chain', () => {
  const S = 'SG41-unreadable-chain-fails-closed';
  const { paths, core } = sweepCore();
  const bridge = path.join(core, 'app', 'bridge');
  fs.mkdirSync(path.join(core, 'app'), { recursive: true });
  const store = path.join(core, 'store');
  fs.mkdirSync(store, { recursive: true });
  fs.symlinkSync(store, bridge);
  fs.rmSync(paths.state, { recursive: true, force: true });
  fs.symlinkSync(path.join('app', 'bridge'), paths.state);
  const note = shelfFile(path.join(store, 'quarantine'), '2026-note.md', 'behind an unreadable link\n');
  // The kernel resolves the whole path happily; our own `readlink` of <state>
  // is what fails, so without X17‴'s widening the walk would answer `ok` with
  // `app/bridge` missing from the chain.
  const origReadlink = fs.readlinkSync;
  fs.readlinkSync = (p, ...rest) => {
    if (String(p) === paths.state) {
      const e = new Error('injected'); /** @type {any} */ (e).code = 'EIO'; throw e;
    }
    return origReadlink(p, ...rest);
  };
  let prot;
  let res;
  try {
    prot = manifestMod.__shelfProtectionForTest(paths);
    res = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  } finally {
    fs.readlinkSync = origReadlink;
  }
  assert.notEqual(prot.unanswerable, null,
    `${S}: an incomplete collection is reported, not carried on with`);
  assert.equal(prot.unanswerable.code, 'EIO',
    `${S}: carrying the code the filesystem gave (${JSON.stringify(prot.unanswerable)})`);
  assert.equal(readOrNull(note), 'behind an unreadable link\n', `${S}: and the copy's bytes survive`);
  assert.equal(isLink(paths.state), true, `${S}: the <state> link is retained`);
  assert.ok(res.preservedQuarantine.length > 0, `${S}: and the sweep reports what it kept`);
});

test('[SG-42] round 5b P2 (X15′): the planner matches its predicted child by filesystem IDENTITY', () => {
  const S = 'SG42-predicted-child-matched-by-identity';
  const { paths } = sweepCore();
  const q = path.join(paths.state, 'quarantine');
  // Only the CAPITAL spelling is created, so on a case-insensitive volume the
  // stored name differs from the lowercase path the climb predicts removing —
  // which is exactly when a byte comparison leaves the plan's own child sitting
  // in `leftovers`.
  fs.mkdirSync(path.join(q, 'REDACTED'), { recursive: true });
  const caseInsensitive = fs.existsSync(path.join(q, 'redacted'));
  const plan = manifestMod.disposeCoreMechanics(paths, { dryRun: true, vaultPath: null });
  const live = manifestMod.disposeCoreMechanics(paths, { dryRun: false, vaultPath: null });
  assert.equal(plan.removed.includes(paths.state), live.removed.includes(paths.state),
    `${S}: plan and live agree about <state> (plan=${JSON.stringify(plan.removed)}, live=${JSON.stringify(live.removed)})`);
  assert.deepEqual(plan.preservedQuarantine, live.preservedQuarantine,
    `${S}: and about what is preserved`);
  if (caseInsensitive) {
    assert.equal(live.removed.includes(paths.state), true,
      `${S}: on this volume REDACTED and redacted are ONE empty shelf, so the whole of <state> goes — a plan matching by NAME would have said preserved`);
  } else {
    assert.equal(live.removed.includes(paths.state), false,
      `${S}: on a case-SENSITIVE volume they are two directories and the climb stops at the leftover`);
  }
});
