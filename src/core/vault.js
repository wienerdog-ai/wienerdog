'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { WienerdogError } = require('./errors');
const manifestLib = require('./manifest');

const TEMPLATE_ROOT = path.join(__dirname, '..', '..', 'templates', 'vault');

/** @returns {string} today's date as YYYY-MM-DD, or WIENERDOG_FAKE_TODAY if set. */
function today() {
  if (process.env.WIENERDOG_FAKE_TODAY) return process.env.WIENERDOG_FAKE_TODAY;
  return new Date().toISOString().slice(0, 10);
}

/** @param {string[]} args @param {string} cwd @returns {boolean} true if git exited 0. */
function gitOk(args, cwd) {
  const result = spawnSync('git', args, { cwd });
  return !result.error && result.status === 0;
}

/** @throws {WienerdogError} if git is not installed. */
function assertGitInstalled() {
  const result = spawnSync('git', ['--version']);
  if (result.error) {
    throw new WienerdogError('git is required to create the vault — please install git and try again.');
  }
}

/**
 * Run fn() while holding an exclusive, cross-process lock keyed on targetDir
 * (a temp-dir marker directory, since mkdir is atomic). Guards the git
 * bootstrap below against two scaffoldVault calls racing on the same
 * directory (e.g. two test files sharing a default vault path).
 * @param {string} targetDir @param {() => void} fn
 */
async function withVaultLock(targetDir, fn) {
  const key = crypto.createHash('sha1').update(path.resolve(targetDir)).digest('hex');
  const lockPath = path.join(os.tmpdir(), `wienerdog-vault-${key}.lock`);
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      fs.mkdirSync(lockPath);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (Date.now() > deadline) {
        throw new WienerdogError(`timed out waiting for the vault lock at ${targetDir}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  try {
    fn();
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
}

/** @param {string} dir @returns {string[]} relative file paths under dir, recursively, sorted. */
function walkTemplateFiles(dir) {
  /** @type {string[]} */
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(TEMPLATE_ROOT, full));
    }
  };
  walk(dir);
  return out;
}

/**
 * Scaffold the vault at targetDir from templates/vault/. Existing files are
 * never overwritten. Initializes a git repo with one commit if targetDir was
 * not already a git repo.
 * @param {string} targetDir
 * @param {{dryRun?: boolean, manifest?: object}} [opts]
 * @returns {{created: string[], skipped: string[]}}
 */
async function scaffoldVault(targetDir, opts = {}) {
  const { dryRun = false, manifest } = opts;
  assertGitInstalled();

  const created = [];
  const skipped = [];
  const date = today();

  const relFiles = walkTemplateFiles(TEMPLATE_ROOT);
  for (const rel of relFiles) {
    const destPath = path.join(targetDir, rel);
    if (fs.existsSync(destPath)) {
      skipped.push(destPath);
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const srcPath = path.join(TEMPLATE_ROOT, rel);
      const content = fs.readFileSync(srcPath, 'utf8').replaceAll('{{DATE}}', date);
      fs.writeFileSync(destPath, content);
    }
    created.push(destPath);
    if (manifest && !dryRun) {
      manifestLib.record(manifest, { kind: 'vault-file', path: destPath });
    }
  }

  if (!dryRun) {
    await withVaultLock(targetDir, () => {
      if (!gitOk(['rev-parse', '--git-dir'], targetDir)) {
        execFileSync('git', ['init'], { cwd: targetDir, stdio: 'ignore' });
      }
      if (!gitOk(['rev-parse', 'HEAD'], targetDir)) {
        execFileSync('git', ['add', '-A'], { cwd: targetDir, stdio: 'ignore' });
        execFileSync(
          'git',
          ['-c', 'user.name=wienerdog', '-c', 'user.email=wienerdog@localhost', 'commit', '-m', 'wienerdog: vault created'],
          { cwd: targetDir, stdio: 'ignore' }
        );
      }
    });
  }

  return { created, skipped };
}

/** The four identity stub templates seeded into an empty identity dir. */
const IDENTITY_STUBS = ['profile.md', 'preferences.md', 'goals.md', 'instructions.md'];

/**
 * Fill ONLY the missing mapped directories of an adopted vault, without laying down
 * the full default template and WITHOUT git-init (adoption handles git separately).
 * Existing files are never touched. Manifest entries use kinds `uninstall` skips
 * (vault-dir / vault-file), so the adopted vault is never removed on uninstall.
 * @param {string} targetDir  the adopted vault
 * @param {import('./layout').VaultLayout} layout
 * @param {{dryRun?: boolean, manifest?: object}} [opts]
 * @returns {{createdDirs: string[], seededFiles: string[], skipped: string[]}}
 */
function scaffoldMappedDirs(targetDir, layout, opts = {}) {
  const { dryRun = false, manifest } = opts;
  const date = today();

  /** @type {string[]} */ const createdDirs = [];
  /** @type {string[]} */ const seededFiles = [];
  /** @type {string[]} */ const skipped = [];

  const mappedDirs = [
    layout.identity_dir,
    layout.daily_dir,
    layout.projects_dir,
    layout.inbox_dir,
    layout.skills_dir,
    layout.reports_dir,
  ];

  for (const rel of mappedDirs) {
    const abs = path.join(targetDir, rel);
    if (fs.existsSync(abs)) {
      skipped.push(abs);
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(abs, { recursive: true });
      if (manifest) manifestLib.record(manifest, { kind: 'vault-dir', path: abs });
    }
    createdDirs.push(abs);
  }

  // Seed identity stubs ONLY IF the mapped identity dir contains no *.md file —
  // a real adopted vault keeps its own identity notes untouched.
  const identityAbs = path.join(targetDir, layout.identity_dir);
  const hasIdentityNotes = () => {
    try {
      return fs.readdirSync(identityAbs).some((name) => name.toLowerCase().endsWith('.md'));
    } catch {
      return false;
    }
  };
  if (!hasIdentityNotes()) {
    for (const name of IDENTITY_STUBS) {
      const destPath = path.join(identityAbs, name);
      if (fs.existsSync(destPath)) {
        skipped.push(destPath);
        continue;
      }
      if (!dryRun) {
        const srcPath = path.join(TEMPLATE_ROOT, '06-Identity', name);
        const content = fs.readFileSync(srcPath, 'utf8').replaceAll('{{DATE}}', date);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, content);
        if (manifest) manifestLib.record(manifest, { kind: 'vault-file', path: destPath });
      }
      seededFiles.push(destPath);
    }
  }

  return { createdDirs, seededFiles, skipped };
}

module.exports = { scaffoldVault, scaffoldMappedDirs };
