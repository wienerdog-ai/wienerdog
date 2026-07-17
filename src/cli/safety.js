'use strict';
const { capabilityStatus } = require('../core/safety-profile');

/** @param {string[]} argv @returns {Promise<void>} */
async function run(argv) {
  const rows = capabilityStatus();
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  process.stdout.write('Wienerdog safety profile — pre-use freeze (P0 security gates not cleared).\n');
  process.stdout.write('Each capability stays BLOCKED until its gate is cleared in a reviewed release.\n\n');
  for (const r of rows) process.stdout.write(`  [${r.status}] ${r.name} — ${r.description}\n`);
  process.stdout.write('\nThere is no flag or environment override for a blocked gate.\n');
}

module.exports = { run };
