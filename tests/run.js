'use strict';
// Zero-dep test entry. Activates the hard scheduler guard for the WHOLE suite
// (env inherits to every `node --test` per-file child process) and forwards argv
// so `npm test -- --test-name-pattern X` still works. Cross-platform (no shell
// env syntax).
const { spawnSync } = require('node:child_process');
const env = { ...process.env, WIENERDOG_TEST_NO_REAL_SCHEDULER: '1' };
const r = spawnSync(process.execPath, ['--test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
process.exit(r.status == null ? 1 : r.status);
