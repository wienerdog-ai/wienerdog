'use strict';
// The fixture root's own test entry, shaped exactly like the repository's
// `tests/run.js`: it activates the hard scheduler guard for the whole suite and
// forwards argv so `--test-reporter=tap` and `--test-name-pattern` pass through.
// The RED-proof runner spawns THIS file, never `node --test` directly, so the
// env var stays set in exactly one place per tree.
const { spawnSync } = require('node:child_process');
const env = { ...process.env, WIENERDOG_TEST_NO_REAL_SCHEDULER: '1' };
const r = spawnSync(process.execPath, ['--test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
process.exit(r.status == null ? 1 : r.status);
