'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { getPaths } = require('../core/paths');
const { detectHarnesses } = require('../core/detect');
const manifestLib = require('../core/manifest');
const { scaffoldVault } = require('../core/vault');
const { confirm } = require('../core/prompt');

/** @param {string} p @returns {boolean} */
function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} p @returns {boolean} */
function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** @param {string} content @returns {string} sha256 hex. */
function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** @param {string} configContent @returns {boolean} true if the `vault:` line is still `null`. */
function isVaultNull(configContent) {
  return /^vault:\s*null(\s|#|$)/m.test(configContent);
}

/** @param {string} configContent @returns {string|null} the configured vault path, or null. */
function readConfigVaultPath(configContent) {
  const m = configContent.match(/^vault:\s*(.*)$/m);
  if (!m) return null;
  const value = m[1].split('#')[0].trim();
  return value === 'null' || value === '' ? null : value;
}

/**
 * Render the initial config.yaml, reflecting harness detection results.
 * @param {ReturnType<typeof detectHarnesses>} harnesses
 * @returns {string}
 */
function renderConfig(harnesses) {
  return `# Wienerdog configuration — https://github.com/wienerdog-ai/wienerdog
version: 1
vault: null            # set by /wienerdog-setup or \`wienerdog adopt\`
harnesses:
  claude: ${harnesses.claude.present}        # set true by init when detected
  codex: ${harnesses.codex.present}
memory_mode: standard  # conservative | standard | eager
update_check: true     # check npm for new versions (set false to disable)
`;
}

/**
 * Create the Wienerdog canonical core (~/.wienerdog) and record everything in
 * the install manifest. Idempotent: a second run with everything present makes
 * zero changes. --dry-run prints the plan and stops; --yes skips confirmation.
 * @param {string[]} argv
 */
async function run(argv) {
  const dryRun = argv.includes('--dry-run');
  const yes = argv.includes('--yes');
  const freshVault = argv.includes('--fresh-vault');
  const paths = getPaths();
  const harnesses = detectHarnesses();

  const dirs = [paths.core, paths.state, paths.secrets, paths.logs];
  const needConfig = !fileExists(paths.config);
  const missingDirs = dirs.filter((d) => !dirExists(d));

  const existingConfigContent = needConfig ? null : fs.readFileSync(paths.config, 'utf8');
  // Scaffold the default vault ONLY under --fresh-vault, and only if the config
  // does not already point at a vault (fresh machine, or config still `vault: null`).
  const vaultStep = freshVault && (needConfig || isVaultNull(existingConfigContent));
  const vaultConfigured = !needConfig && !isVaultNull(existingConfigContent);

  if (missingDirs.length === 0 && !needConfig && !vaultStep) {
    console.log('wienerdog: already installed, nothing to do.');
    console.log("Tip: run 'wienerdog sync' to refresh skills, hooks, and memory.");
    return;
  }

  console.log('wienerdog init — plan:\n');
  console.log('Directories:');
  for (const d of dirs) console.log(`  ${dirExists(d) ? '[exists]' : '[create]'} ${d}`);
  console.log('\nFiles:');
  console.log(`  ${fileExists(paths.config) ? '[exists]' : '[create]'} ${paths.config}`);
  console.log('\nVault:');
  if (vaultStep) {
    console.log(`  [create] ${paths.vault}`);
  } else if (vaultConfigured) {
    console.log(`  [configured] ${readConfigVaultPath(existingConfigContent)}`);
  } else {
    console.log('  [deferred] choose or create your vault with /wienerdog-setup');
    console.log("             (or run 'wienerdog init --fresh-vault' for the default ~/wienerdog)");
  }
  console.log('\nDetected AI tools:');
  console.log(`  Claude Code: ${harnesses.claude.present ? 'found' : 'not found'} (${harnesses.claude.dir})`);
  console.log(`  Codex CLI:   ${harnesses.codex.present ? 'found' : 'not found'} (${harnesses.codex.dir})`);

  const { sandboxMismatchWarning } = require('../core/sandbox-guard');
  const sandboxWarning = sandboxMismatchWarning(paths, process.env, harnesses);
  if (sandboxWarning) console.log(`\n${sandboxWarning}`);

  if (dryRun) {
    console.log('\n--dry-run: no changes made.');
    return;
  }

  if (!yes) {
    const ok = await confirm('\nProceed? [Y/n] ', { defaultYes: true });
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  const manifest = manifestLib.load(paths);

  let createdSecrets = false;
  /** @type {string[]} */
  const createdDirs = [];
  for (const d of dirs) {
    if (!dirExists(d)) {
      fs.mkdirSync(d, { recursive: true, mode: 0o700 });
      manifestLib.record(manifest, { kind: 'dir', path: d });
      createdDirs.push(d);
      if (d === paths.secrets) createdSecrets = true;
    }
  }
  // Enforce 0700 on every dir WE created (audit A5, WP-126: core/state/logs are
  // secret-lifecycle dirs — the explicit chmod defeats a permissive umask, since
  // mkdir's mode is umask-masked). A pre-existing user path is never
  // re-permissioned by init — repair of legacy modes is `wienerdog sync`'s job.
  if (createdSecrets) fs.chmodSync(paths.secrets, 0o700);
  for (const d of createdDirs) {
    if (d !== paths.secrets) {
      try {
        fs.chmodSync(d, 0o700);
      } catch {
        /* best-effort (win32 no-op) — init must not fail on a mode */
      }
    }
  }

  if (needConfig) {
    const content = renderConfig(harnesses);
    fs.writeFileSync(paths.config, content);
    manifestLib.record(manifest, { kind: 'file', path: paths.config, hash: sha256(content) });
  }

  if (vaultStep) {
    console.log(`\nVault: scaffolding ${paths.vault}`);
    const { created, skipped } = await scaffoldVault(paths.vault, { manifest });
    console.log(`  created ${created.length} file(s), skipped ${skipped.length} existing file(s)`);
    const configContent = fs.readFileSync(paths.config, 'utf8');
    const updatedConfig = configContent.replace(/^vault: null.*$/m, `vault: ${paths.vault}`);
    fs.writeFileSync(paths.config, updatedConfig);
    // Keep the manifest's recorded hash in sync with our own rewrite, so
    // uninstall doesn't mistake it for a user edit and refuse to remove it.
    const configEntry = manifest.entries.find((e) => e.kind === 'file' && e.path === paths.config);
    if (configEntry) configEntry.hash = sha256(updatedConfig);
  }

  manifestLib.save(paths, manifest);

  // Register skills + hooks into every detected harness (and, when a vault is
  // configured, the digest + managed block) so the promised /wienerdog-setup skill
  // is live the moment init finishes. sync is idempotent; with no vault it installs
  // skills + hooks and defers memory features (exit 0). Passing our argv is safe —
  // sync only reads --dry-run from it, and we never reach here on a dry-run.
  await require('./sync').run(argv, { suppressSandboxWarning: true, harnesses });

  if (vaultStep) {
    // WP-catchup-per-job-authorization [R7]: `init` is a first-class attended MINT caller —
    // ensureDreamSchedule → registerPlatform mints the catch-up per-job digest map
    // from the freshly-derived dream descriptor (init does not necessarily run
    // `sync` for scheduling). No config-trusted or stale map.
    const { ensureDreamSchedule } = require('./schedule');
    const d = ensureDreamSchedule(paths);
    console.log('\nwienerdog: installed with a fresh vault.');
    if (d.scheduled) {
      console.log(`Nightly memory (dreaming) is scheduled for ${d.at} to consolidate each day into your vault.`);
      console.log('If your computer is off or asleep at that time, don\'t worry — Wienerdog catches up automatically the next time you\'re back.');
      console.log('Change or turn it off anytime: `wienerdog schedule remove dream`, or the routine menu (/wienerdog-routines).');
    } else if (d.reason === 'unsupported') {
      console.log('Nightly dreaming could not be auto-scheduled on this system yet; run `wienerdog dream` manually, or schedule it once supported.');
    } else if (d.reason === 'load-failed') {
      console.log('Nightly dreaming was set up but your computer\'s scheduler did not accept it yet — run `wienerdog doctor` to see why, then `wienerdog sync` to retry.');
    }
    console.log('Run `wienerdog doctor` to check the setup.');
  } else if (vaultConfigured) {
    console.log('\nwienerdog: installed. Run `wienerdog doctor` to check the setup.');
  } else {
    console.log('\nwienerdog: core installed — no vault yet.');
    console.log('Next: run /wienerdog-setup in Claude Code to create or choose your vault,');
    console.log("or run 'wienerdog init --fresh-vault' for the default ~/wienerdog vault.");
    console.log('Then run `wienerdog doctor` to check the setup.');
  }
}

module.exports = { run };
