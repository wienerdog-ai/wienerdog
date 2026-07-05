'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { currentVersion, cmpRelease } = require('../core/update-check');
const { fetchLatestManifest, installVersion } = require('../core/tarball');
const { appDir } = require('../core/vendor');

/**
 * `wienerdog update` — fetch the latest published version from the npm registry,
 * verify its checksum, unpack it into the vendored app dir, then hand off to the
 * NEW version's `sync` (which repoints current + refreshes managed blocks,
 * digest, schedules). Works with or without npm. Only ever runs when the user
 * types this command (ADR-0004/0015: no auto-update).
 *
 * @param {string[]} argv  supports --dry-run
 * @param {{fetchManifest?:Function, downloadBuffer?:Function, spawn?:Function,
 *          runSync?:(binPath:string)=>{status:number|null}, current?:string}} [opts]
 * @returns {Promise<void>}
 */
async function run(argv, opts = {}) {
  const dryRun = argv.includes('--dry-run');
  const paths = getPaths();
  const cur = opts.current || currentVersion();

  const man = await fetchLatestManifest(opts);          // {version, integrity} — throws on bad input
  if (cmpRelease(man.version, cur) <= 0) {
    console.log(`wienerdog: already up to date (v${cur}).`);
    return;
  }

  console.log(`wienerdog: updating v${cur} → v${man.version}.`);
  console.log(`  will download the verified package from the npm registry and unpack it to`);
  console.log(`  ${appDir(paths)}/${man.version}`);
  if (dryRun) { console.log('--dry-run: no changes made.'); return; }

  const res = await installVersion(paths, {
    version: man.version, integrity: man.integrity,
    downloadBuffer: opts.downloadBuffer, fetchManifest: opts.fetchManifest, spawn: opts.spawn,
  });
  console.log(`wienerdog: unpacked v${res.version}${res.alreadyPresent ? ' (already present)' : ''}.`);

  // Hand off to the NEW version's sync so IT re-vendors + repoints current.
  const newBin = path.join(res.target, 'bin', 'wienerdog.js');
  const runSync = opts.runSync || ((bin) =>
    spawnSync(process.execPath, [bin, 'sync'], { stdio: 'inherit' }));
  const s = runSync(newBin);
  if (!s || s.status !== 0) {
    throw new WienerdogError(`update unpacked v${res.version} but 'sync' failed — run 'wienerdog sync' to finish.`);
  }
  console.log(`wienerdog: updated to v${res.version}.`);
}

module.exports = { run };
