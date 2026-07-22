'use strict';
const { capabilityStatus } = require('../core/safety-profile');

/** @param {string[]} argv @returns {Promise<void>} */
async function run(argv) {
  const rows = capabilityStatus();
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  process.stdout.write('Wienerdog capability status (code-owned safety gates).\n\n');
  for (const r of rows) process.stdout.write(`  [${r.status}] ${r.name} — ${r.description}\n`);
  process.stdout.write('\nThese gates are set in code (no environment or CLI-flag override).\n');
}

module.exports = { run };
