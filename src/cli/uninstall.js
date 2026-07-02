'use strict';

const fs = require('node:fs');
const readline = require('node:readline');
const { getPaths } = require('../core/paths');
const manifestLib = require('../core/manifest');
const { WienerdogError } = require('../core/errors');

/** @param {string} p @returns {boolean} */
function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Ask a yes/no question on stdin.
 * @param {string} prompt
 * @returns {Promise<boolean>}
 */
function confirm(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
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

  console.log('wienerdog uninstall — the following will be removed:\n');
  for (const entry of manifest.entries) console.log(`  [${entry.kind}] ${entry.path}`);

  if (dryRun) {
    const { removed, skipped } = manifestLib.reverse(paths, manifest, { dryRun: true });
    console.log(`\n--dry-run: ${removed.length} item(s) would be removed, ${skipped.length} skipped.`);
    return;
  }

  if (!yes) {
    const ok = await confirm('\nProceed with removal? [y/N] ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  const { removed, skipped } = manifestLib.reverse(paths, manifest, { dryRun: false });
  console.log(`\nRemoved ${removed.length} item(s).`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} item(s) (already gone or preserved):`);
    for (const s of skipped) console.log(`  ${s}`);
  }
}

module.exports = { run };
