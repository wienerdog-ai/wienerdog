'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { renderDigest } = require('../core/digest');

/**
 * Read the `vault:` path out of config.yaml (flat-YAML subset, same approach as
 * init.js). Returns null if the file is unreadable or the value is unset/null.
 * @param {string} configPath
 * @returns {string|null}
 */
function readVaultPath(configPath) {
  let content;
  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
  const m = content.match(/^vault:\s*(.*)$/m);
  if (!m) return null;
  const value = m[1].split('#')[0].trim();
  return value === '' || value === 'null' ? null : value;
}

/**
 * `wienerdog sync` — render the identity digest and write it atomically to
 * state/digest.md. v1 renders the digest only; later WPs add more sync work.
 * @param {string[]} _argv
 * @returns {Promise<void>}
 */
async function run(_argv) {
  const paths = getPaths();
  const vaultPath = readVaultPath(paths.config);
  if (!vaultPath) {
    throw new WienerdogError('no vault configured in config.yaml — run `npx wienerdog init` first.');
  }
  let isDir = false;
  try {
    isDir = fs.statSync(vaultPath).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    throw new WienerdogError(`vault not found at ${vaultPath} — run \`npx wienerdog init\` first.`);
  }

  const digest = renderDigest(vaultPath);
  fs.mkdirSync(paths.state, { recursive: true });
  const dest = path.join(paths.state, 'digest.md');
  const tmp = path.join(paths.state, `.digest.md.${process.pid}.tmp`);
  fs.writeFileSync(tmp, digest);
  fs.renameSync(tmp, dest);

  console.log(`wienerdog: wrote ${dest} (${Buffer.byteLength(digest)} bytes).`);
}

module.exports = { run };
