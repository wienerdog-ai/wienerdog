'use strict';

// One-time legacy-token migration (WP-138, D-TOKEN-MIGRATION: retire +
// re-auth). The pre-split combined token is a scope SUPERSET of every split
// credential, so the exact-scope verification would refuse it by design — it
// is never imported or reused. Instead it is renamed aside (kept, not
// destroyed) and the user is told to re-run `wienerdog gws auth`.

const fs = require('node:fs');
const { tokenPath } = require('./client');

const MIGRATION_NOTICE =
  'Your Google connection used one combined credential; Wienerdog now uses\n' +
  'separate, least-privilege credentials per capability. The old credential was\n' +
  'set aside and will not be used. Run `wienerdog gws auth` to re-connect.\n';

/**
 * Is the legacy combined token file present?
 * @param {import('../core/paths').WienerdogPaths} paths
 * @returns {boolean}
 */
function hasLegacyToken(paths) {
  return fs.existsSync(tokenPath(paths));
}

/**
 * Retire the legacy combined token by renaming it aside (idempotent; keeps
 * the bytes so nothing is destroyed without the user's say).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @returns {string|null} the retired file path, or null when nothing to do
 */
function retireLegacyToken(paths) {
  const legacy = tokenPath(paths);
  if (!fs.existsSync(legacy)) return null;
  const retired = `${legacy}.retired`;
  fs.renameSync(legacy, retired);
  return retired;
}

module.exports = { hasLegacyToken, retireLegacyToken, MIGRATION_NOTICE };
