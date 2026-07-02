#!/usr/bin/env node
/**
 * Runs all lint layers for Wienerdog, in order. Exits 1 if any layer fails.
 *
 *   1. markdownlint-cli2 on docs, skills, templates and root *.md (config lives inline in
 *      package.json under the "markdownlint-cli2" key).
 *   2. shellcheck on **\/*.sh, if any .sh files exist AND the shellcheck
 *      binary is installed. Skipped with a warning if the binary is absent
 *      (e.g. local machines); CI always has it installed.
 *   3. Frontmatter schema check (scripts/check-frontmatter.js).
 */
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

/** @param {string} cmd @param {string[]} args @returns {boolean} */
function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: root });
  return result.status === 0;
}

/** @param {string} dir @param {string[]} acc @returns {string[]} */
function findShellFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findShellFiles(full, acc);
    else if (entry.name.endsWith('.sh')) acc.push(full);
  }
  return acc;
}

/** @param {string} name @returns {boolean} */
function hasBinary(name) {
  const result = spawnSync(name, ['--version']);
  return !result.error;
}

function main() {
  let failed = false;

  console.log('--- markdownlint ---');
  if (
    !run('npx', [
      '--no-install',
      'markdownlint-cli2',
      '--config',
      'package.json',
      '--configPointer',
      '/markdownlint-cli2',
      'docs/**/*.md',
      'skills/**/*.md',
      'templates/**/*.md',
      '*.md',
    ])
  ) {
    console.error('markdownlint failed');
    failed = true;
  }

  console.log('--- shellcheck ---');
  const shellFiles = findShellFiles(root);
  if (shellFiles.length === 0) {
    console.log('no .sh files found, skipping');
  } else if (!hasBinary('shellcheck')) {
    console.warn('shellcheck binary not found, skipping this layer (install shellcheck to run it locally; CI always has it)');
  } else if (!run('shellcheck', shellFiles.map((f) => path.relative(root, f)))) {
    console.error('shellcheck failed');
    failed = true;
  }

  console.log('--- frontmatter check ---');
  if (!run('node', ['scripts/check-frontmatter.js'])) {
    console.error('frontmatter check failed');
    failed = true;
  }

  if (failed) {
    console.error('\nlint failed');
    process.exit(1);
  }
  console.log('\nlint passed');
}

main();
