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
    const { removed, skipped, preserved, deferredConfig } = manifestLib.reverse(paths, manifest, {
      dryRun: true,
    });
    const { removed: mech, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
      dryRun: true,
      vaultPath,
    });
    // The unmodified config moved out of reverse()'s `removed` into deferredConfig
    // (uninstall.js deletes it live), so include it in the headline "would be
    // removed" count — otherwise it is silently dropped from the plan. The
    // mechanics dirs and the core stay separate disclosure lines (ADR-0019), so
    // this headline is NOT claimed to equal the live `Removed N` total.
    const headline = removed.length + (deferredConfig ? 1 : 0);
    console.log(`\n--dry-run: ${headline} item(s) would be removed, ${skipped.length} skipped.`);
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

  const { removed, skipped, preserved, deferredConfig, deferredConfigHash } = manifestLib.reverse(
    paths,
    manifest,
    { dryRun: false }
  );
  // First sweep: removes state/logs/schedules/secrets, protecting a nested vault
  // via vaultPath (read from the STILL-PRESENT config.yaml at line 57). The core
  // is NOT removed yet — the manifest + config.yaml still sit in it, so its
  // emptiness check fails (correct). The recovery ledger has survived every
  // crash-prone step above.
  const { removed: mech, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
    dryRun: false,
    vaultPath,
  });
  // Delete the deferred set LAST — MANIFEST FIRST, then config.yaml. Every
  // crash-prone step above has completed. Manifest-before-config is load-bearing:
  // a retry proceeds only while the manifest exists, and a retry that reaches a
  // sweep needs config.yaml for the nested-vault path, so config.yaml must exist
  // at every point the manifest still does ("manifest-present ⟹ config-present").
  // The manifest delete must be CONFIRMED before config is touched. The
  // confirmation is rmSync's OWN outcome: `{force:true}` does NOT throw on ENOENT
  // (already-gone = success) but DOES throw on a real failure (EACCES/EPERM/IO).
  // So "rmSync returned without throwing" proves the manifest is gone — no
  // post-hoc existence check (which fs.existsSync makes ambiguous: it returns
  // false on a LOOKUP error too, which would reopen the P1 nested-vault window).
  try {
    fs.rmSync(paths.manifest, { force: true });
  } catch (e) {
    // Real deletion failure, manifest still present → ABORT before touching
    // config, leaving BOTH files present so every retry stays vault-safe.
    throw new WienerdogError(
      `could not remove the install manifest (${e?.code || 'unknown error'}) — uninstall partially completed; ` +
        `left config.yaml and ${paths.core} in place so a retry stays safe. ` +
        `Fix the permission/IO issue, then re-run: npx wienerdog@latest uninstall`
    );
  }
  // rmSync returned without throwing ⇒ the manifest is gone (or was already
  // absent). The retry gate is now closed → only now is it safe to delete an
  // unmodified config.
  let configDeleted = false;
  if (deferredConfig) {
    // Prove-before-delete AT THE DELETE SITE: config was proven unmodified back in
    // reverse(), but it is deleted here, AFTER the (potentially slow, recursive)
    // mechanics sweep. If the user EDITED config.yaml during that window it is now
    // customized — deleting it would destroy their edit (a TOCTOU the deferral
    // opened). Re-verify the carried-forward hash; delete only if it STILL matches,
    // else PRESERVE with a keep-notice. A missing/unreadable file also aborts the
    // delete (nothing to prove → keep).
    let currentHash = null;
    try {
      currentHash = manifestLib.sha256File(deferredConfig);
    } catch {
      currentHash = null;
    }
    if (currentHash !== null && currentHash === deferredConfigHash) {
      try {
        fs.rmSync(deferredConfig, { force: true });
        configDeleted = true;
      } catch {
        /* best-effort */
      }
    } else {
      process.stderr.write(`wienerdog: keeping ${deferredConfig} — modified since install\n`);
    }
  }
  // Second sweep: mechanics are already gone (idempotent); with the manifest +
  // unmodified config deleted the core is now empty, so this removes it
  // (symlink-aware, vault-aware). A kept CUSTOMIZED config leaves the core
  // non-empty → core preserved (unchanged).
  const { removed: coreSwept } = manifestLib.disposeCoreMechanics(paths, {
    dryRun: false,
    vaultPath,
  });
  console.log(
    `\nRemoved ${removed.length + mech.length + coreSwept.length + (configDeleted ? 1 : 0)} item(s).`
  );
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
  // reverse() now defers core/state removal to disposeCoreMechanics, so its
  // `skipped` array carries <core> and <core>/state — items the sweep above has
  // since removed. Report as "skipped" only what genuinely REMAINS on disk after
  // the whole uninstall, so the summary never contradicts "fully removed" below.
  // A kept customized config.yaml or a preserved skill still exists → still shown.
  const skippedShown = skipped.filter((s) => fs.existsSync(s));
  if (skippedShown.length > 0) {
    console.log(`Skipped ${skippedShown.length} item(s) (a customized config or other file kept in place):`);
    for (const s of skippedShown) console.log(`  ${s}`);
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
