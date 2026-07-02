'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { getPaths } = require('../core/paths');
const { detectHarnesses } = require('../core/detect');
const manifestLib = require('../core/manifest');

/** @param {string} p @returns {boolean} */
function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} p @returns {boolean} */
function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** @param {string} content @returns {string} sha256 hex. */
function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Render the initial config.yaml, reflecting harness detection results.
 * @param {ReturnType<typeof detectHarnesses>} harnesses
 * @returns {string}
 */
function renderConfig(harnesses) {
  return `# Wienerdog configuration — https://github.com/wienerdog-ai/wienerdog
version: 1
vault: null            # set by vault setup (WP-004)
harnesses:
  claude: ${harnesses.claude.present}        # set true by init when detected
  codex: ${harnesses.codex.present}
memory_mode: standard  # conservative | standard | eager
`;
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
 * Create the Wienerdog canonical core (~/.wienerdog) and record everything in
 * the install manifest. Idempotent: a second run with everything present makes
 * zero changes. --dry-run prints the plan and stops; --yes skips confirmation.
 * @param {string[]} argv
 */
async function run(argv) {
  const dryRun = argv.includes('--dry-run');
  const yes = argv.includes('--yes');
  const paths = getPaths();
  const harnesses = detectHarnesses();

  const dirs = [paths.core, paths.state, paths.secrets, paths.logs];
  const needConfig = !fileExists(paths.config);
  const missingDirs = dirs.filter((d) => !dirExists(d));

  if (missingDirs.length === 0 && !needConfig) {
    console.log('wienerdog: already installed, nothing to do.');
    return;
  }

  console.log('wienerdog init — plan:\n');
  console.log('Directories:');
  for (const d of dirs) console.log(`  ${dirExists(d) ? '[exists]' : '[create]'} ${d}`);
  console.log('\nFiles:');
  console.log(`  ${fileExists(paths.config) ? '[exists]' : '[create]'} ${paths.config}`);
  console.log('\nDetected AI tools:');
  console.log(`  Claude Code: ${harnesses.claude.present ? 'found' : 'not found'} (${harnesses.claude.dir})`);
  console.log(`  Codex CLI:   ${harnesses.codex.present ? 'found' : 'not found'} (${harnesses.codex.dir})`);

  if (dryRun) {
    console.log('\n--dry-run: no changes made.');
    return;
  }

  if (!yes) {
    const ok = await confirm('\nProceed? [y/N] ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  const manifest = manifestLib.load(paths);

  for (const d of dirs) {
    if (!dirExists(d)) {
      fs.mkdirSync(d, { recursive: true, mode: d === paths.secrets ? 0o700 : undefined });
      manifestLib.record(manifest, { kind: 'dir', path: d });
    }
  }
  // Enforce 0700 on secrets even if umask reduced the create-time mode.
  fs.chmodSync(paths.secrets, 0o700);

  if (needConfig) {
    const content = renderConfig(harnesses);
    fs.writeFileSync(paths.config, content);
    manifestLib.record(manifest, { kind: 'file', path: paths.config, hash: sha256(content) });
  }

  manifestLib.save(paths, manifest);
  console.log('\nwienerdog: installed. Run `wienerdog doctor` to check the setup.');
}

module.exports = { run };
