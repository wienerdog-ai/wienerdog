#!/usr/bin/env node
'use strict';

const { WienerdogError } = require('../src/core/errors');

const USAGE = `wienerdog — give your AI a memory, habits, and a daily routine, with nothing but files.

Usage: wienerdog <command> [options]

Commands:
  init        Create the Wienerdog core (~/.wienerdog) and detect your AI tools
  adopt       Use an existing vault in place as your Wienerdog vault
  sync        Re-render the session digest from your vault's identity notes
  update      Update Wienerdog to the latest published version (no npm required)
  dream       Consolidate recent sessions into vault memory (one commit)
  schedule    Add, remove, or list scheduled jobs (dream, routines)
  run-job     Run a scheduled job now (used by the OS scheduler)
  doctor      Check an existing install for problems
  uninstall   Remove everything Wienerdog created (reverses the install)
  gws         Read Gmail/Calendar/Drive and draft mail (Google Workspace)
  grant       Authorize a routine to send email (typed confirmation required)

Global options:
  --dry-run   Show what would happen; make no changes
  --yes       Skip confirmation prompts
`;

/** @returns {Promise<void>} */
async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(USAGE);
    return;
  }

  /** @type {Record<string, () => {run: (argv: string[]) => Promise<void>}>} */
  const commands = {
    init: () => require('../src/cli/init'),
    adopt: () => require('../src/cli/adopt'),
    sync: () => require('../src/cli/sync'),
    update: () => require('../src/cli/update'),
    dream: () => require('../src/cli/dream'),
    schedule: () => require('../src/cli/schedule'),
    'run-job': () => require('../src/cli/run-job'),
    doctor: () => require('../src/cli/doctor'),
    uninstall: () => require('../src/cli/uninstall'),
    gws: () => require('../src/gws/index'),
    grant: () => require('../src/cli/grant'),
  };

  const loader = commands[cmd];
  if (!loader) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  await loader().run(rest);
}

main().catch((err) => {
  if (err instanceof WienerdogError) {
    process.stderr.write(`wienerdog: ${err.message}\n`);
    process.exit(1);
  }
  // Unexpected error: surface the full stack.
  console.error(err);
  process.exit(1);
});
