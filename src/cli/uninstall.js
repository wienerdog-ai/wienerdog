'use strict';

const fs = require('node:fs');
const { getPaths } = require('../core/paths');
const manifestLib = require('../core/manifest');
const { WienerdogError } = require('../core/errors');
const { confirm } = require('../core/prompt');

/** @param {string} p @returns {boolean} */
function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Read the configured vault path from config.yaml, or null. `[ \t]*` (not
 *  `\s*`) so a bare `vault:` line cannot let the match run onto the next line.
 *  @param {string} configPath @returns {string|null} */
function readVaultPath(configPath) {
  try {
    const m = fs.readFileSync(configPath, 'utf8').match(/^vault:[ \t]*(.*)$/m);
    const v = m && m[1].trim();
    return v && v !== 'null' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Remove everything Wienerdog created by replaying the install manifest in
 * reverse. Never touches anything not in the manifest. --dry-run prints the
 * plan and stops; --yes skips confirmation. Exits 0 even if some entries were
 * already gone (reported as skipped).
 * @param {string[]} argv
 */
async function run(argv) {
  const dryRun = argv.includes('--dry-run');
  const yes = argv.includes('--yes');
  const paths = getPaths();

  if (!fileExists(paths.manifest)) {
    throw new WienerdogError(
      `no install manifest found at ${paths.manifest} — nothing to uninstall`
    );
  }

  let manifest;
  try {
    manifest = manifestLib.load(paths);
  } catch {
    throw new WienerdogError(`install manifest is corrupted (${paths.manifest})`);
  }

  // Capture the vault path BEFORE reverse removes config.yaml (for the summary).
  const vaultPath = readVaultPath(paths.config) || paths.vault;

  console.log('wienerdog uninstall — the following will be removed:\n');
  for (const entry of manifest.entries) console.log(`  [${entry.kind}] ${entry.path}`);

  if (dryRun) {
    const { removed, skipped, preserved } = manifestLib.reverse(paths, manifest, { dryRun: true });
    const { removed: mech, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
      dryRun: true,
      vaultPath,
    });
    console.log(`\n--dry-run: ${removed.length} item(s) would be removed, ${skipped.length} skipped.`);
    if (preserved.length > 0) {
      const vaultFiles = manifest.entries.filter((e) => e.kind === 'vault-file').length;
      if (skippedForVault.length > 0) {
        console.log(`\nYour memory vault at ${vaultPath} would be left untouched (${vaultFiles} files) — your notes are yours. Note: it sits inside Wienerdog's own folder (${skippedForVault[0]}), which would therefore be left in place — consider moving it somewhere of your own.`);
      } else {
        console.log(`\nYour memory vault at ${vaultPath} would be left untouched (${vaultFiles} files) — your notes are yours.`);
      }
    }
    if (mech.length > 0) {
      console.log('\nMachine-generated state (removed recursively, not manifest-tracked):');
      for (const d of mech) console.log(`  ${d}`);
    }
    console.log(`  ${paths.core}  (the canonical core — removed once empty)`);
    return;
  }

  if (!yes) {
    const ok = await confirm('\nProceed with removal? [y/N] ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  const { removed, skipped, preserved } = manifestLib.reverse(paths, manifest, { dryRun: false });
  const { removed: mech, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
    dryRun: false,
    vaultPath,
  });
  console.log(`\nRemoved ${removed.length + mech.length} item(s).`);
  if (preserved.length > 0) {
    const vaultFiles = manifest.entries.filter((e) => e.kind === 'vault-file').length;
    if (skippedForVault.length > 0) {
      // The vault was found INSIDE a mechanics dir (legacy/hand-edited install):
      // the dir was left in place to protect it — say so, never the plain
      // reassurance alone (a false "left untouched" is as bad as the deletion).
      console.log(`\nYour memory vault at ${vaultPath} was left untouched (${vaultFiles} files) — your notes are yours. Note: it sits inside Wienerdog's own folder (${skippedForVault[0]}), which was therefore left in place — consider moving it somewhere of your own.`);
    } else {
      console.log(`\nYour memory vault at ${vaultPath} was left untouched (${vaultFiles} files) — your notes are yours.`);
    }
  }
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} item(s) (already gone or a customized config kept):`);
    for (const s of skipped) console.log(`  ${s}`);
  }
  if (!fs.existsSync(paths.core)) {
    console.log(`\nWienerdog is fully removed — the canonical core (${paths.core}) is gone.`);
  } else if (skippedForVault.length > 0) {
    console.log(`\nKept ${paths.core} (your memory vault still lives inside it).`);
  } else {
    console.log(`\nKept ${paths.core} (a customized config.yaml remains).`);
  }
}

module.exports = { run };
