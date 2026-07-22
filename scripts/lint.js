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

/** @param {string} dir @param {string} ext @param {string[]} acc @returns {string[]} */
function findFilesByExt(dir, ext, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFilesByExt(full, ext, acc);
    else if (entry.name.endsWith(ext)) acc.push(full);
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
      'tests/**/*.md',
      '*.md',
    ])
  ) {
    console.error('markdownlint failed');
    failed = true;
  }

  console.log('--- shellcheck ---');
  const shellFiles = findFilesByExt(root, '.sh');
  if (shellFiles.length === 0) {
    console.log('no .sh files found, skipping');
  } else if (!hasBinary('shellcheck')) {
    console.warn('shellcheck binary not found, skipping this layer (install shellcheck to run it locally; CI always has it)');
    // Fail only on warning-or-worse. Info/style findings (e.g. SC2015 on an
    // intentional `A && B || die` assertion) are advisory AND vary between
    // shellcheck releases — CI's older build flags some that newer local builds
    // don't — so gating on them makes green depend on the runner's version.
  } else if (!run('shellcheck', ['--severity=warning', ...shellFiles.map((f) => path.relative(root, f))])) {
    console.error('shellcheck failed');
    failed = true;
  }

  console.log('--- PSScriptAnalyzer ---');
  const psFiles = findFilesByExt(root, '.ps1');
  if (psFiles.length === 0) {
    console.log('no .ps1 files found, skipping');
  } else if (!hasBinary('pwsh')) {
    console.warn('pwsh not found, skipping PSScriptAnalyzer (install PowerShell to run it locally; CI has it)');
  } else {
    const script =
      "$r = Invoke-ScriptAnalyzer -Path . -Recurse -Settings ./PSScriptAnalyzerSettings.psd1 " +
      "-Severity Warning,Error; $r | Format-Table -AutoSize; " +
      "if (@($r).Count -gt 0) { exit 1 }";
    if (!run('pwsh', ['-NoProfile', '-Command', script])) {
      console.error('PSScriptAnalyzer failed');
      failed = true;
    }
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
