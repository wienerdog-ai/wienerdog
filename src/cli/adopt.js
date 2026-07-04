'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');
const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const manifestLib = require('../core/manifest');
const tccguard = require('../scheduler/tccguard');
const { inferLayout } = require('../core/layout-infer');
const { resolveDailyPath } = require('../core/layout');
const { scaffoldMappedDirs } = require('../core/vault');
const adoptGit = require('../core/adopt-git');

// Small helpers copied from init.js (init does not export them, and it is not
// in this WP's deliverables). Kept identical so behavior matches.

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

/** @param {string} dir @param {string[]} args @returns {import('child_process').SpawnSyncReturns<Buffer>} */
function git(dir, args) {
  return spawnSync('git', ['-C', dir, ...args]);
}

/** @param {string} dir @returns {boolean} true if dir is inside a git work tree. */
function isGitRepo(dir) {
  const r = git(dir, ['rev-parse', '--git-dir']);
  return !r.error && r.status === 0;
}

/**
 * Render the `vault_layout:` block appended to config.yaml. Two-space indented,
 * exactly the shape readVaultLayout parses.
 * @param {import('../core/layout').VaultLayout} layout
 * @returns {string}
 */
function renderLayoutBlock(layout) {
  return [
    'vault_layout:',
    `  identity_dir: ${layout.identity_dir}`,
    `  daily_dir: ${layout.daily_dir}`,
    `  daily_filename: ${layout.daily_filename}`,
    `  projects_dir: ${layout.projects_dir}`,
    `  skills_dir: ${layout.skills_dir}`,
    `  reports_dir: ${layout.reports_dir}`,
    `  inbox_dir: ${layout.inbox_dir}`,
    '',
  ].join('\n');
}

/**
 * Print the inferred folder mapping in plain language — one line per slot, with a
 * concrete example daily-note path so the user can sanity-check the nesting.
 * @param {import('../core/layout').VaultLayout} layout
 */
function printLayout(layout) {
  const exampleDaily = resolveDailyPath(layout, '2026-07-03');
  console.log('\nProposed folder mapping (how Wienerdog will read your vault):');
  console.log(`  Identity notes:  ${layout.identity_dir}`);
  console.log(`  Daily notes:     ${layout.daily_dir}, filenames like ${exampleDaily}`);
  console.log(`  Projects:        ${layout.projects_dir}`);
  console.log(`  Skills:          ${layout.skills_dir}`);
  console.log(`  Inbox:           ${layout.inbox_dir}`);
  console.log(`  Dream reports:   ${layout.reports_dir}`);
}

/**
 * Adopt an existing vault in place as THE Wienerdog vault. Gated on a local
 * (non-TCC) path and a git repo (so every night's memory writes are one commit
 * that `git revert` can undo), confirms an inferred folder mapping, then points
 * config at the vault, writes the layout, and seeds only MISSING mapped dirs —
 * never overwriting the user's files. Reversible: adopted-vault artifacts are
 * recorded under manifest kinds uninstall skips, so uninstall leaves the vault
 * exactly as found.
 * @param {string[]} argv
 */
async function run(argv) {
  const dryRun = argv.includes('--dry-run');
  const yes = argv.includes('--yes');
  const rawPath = argv.find((a) => !a.startsWith('--'));

  // 1. Parse args.
  if (!rawPath) {
    throw new WienerdogError('usage: wienerdog adopt <path> [--dry-run] [--yes]');
  }

  // 2. Require an existing install.
  const paths = getPaths();
  if (!fileExists(paths.config)) {
    throw new WienerdogError('no Wienerdog install found — run `npx wienerdog init` first.');
  }
  const manifest = manifestLib.load(paths);

  // 3. Path must be an existing directory.
  const absPath = path.resolve(rawPath);
  if (!dirExists(absPath)) {
    throw new WienerdogError(`not a directory: ${absPath} — point adopt at an existing vault folder.`);
  }
  const adoptedPath = fs.realpathSync(absPath);

  // 4. Refuse re-adoption (raw-text check keeps the config rewrite atomic).
  const configText = fs.readFileSync(paths.config, 'utf8');
  if (/^vault_layout:/m.test(configText)) {
    throw new WienerdogError(
      'this install already has a vault_layout; edit `config.yaml` or reinstall to re-adopt.'
    );
  }

  // 5. TCC / local-disk check (macOS only; off-darwin always ok).
  // Symlink-domain rule (spec, binding): guard compares via path.relative, so
  // both sides must be in the same symlink-resolution domain. adoptedPath is
  // already realpath'd above; a RAW home against it makes path.relative yield
  // `../…` under any symlinked home component and the guard fails OPEN.
  const tcc = tccguard.guard([adoptedPath], fs.realpathSync(paths.home));
  if (!tcc.ok) {
    throw new WienerdogError(
      `that folder is inside ${tcc.prefix}, a macOS-protected location (${tcc.offending}).\n` +
        'Unattended nightly jobs hang forever on the permission prompt those folders trigger.\n' +
        'Move the vault to a plain folder in your home directory (e.g. ~/notes) and try again,\n' +
        'or use guided import (`wienerdog init`) to copy it into a fresh vault instead.'
    );
  }

  // 6. Git prerequisite + initial snapshot — the revert-safety guarantee rests on it.
  //    Idempotent: take the snapshot whenever the repo has no HEAD commit yet, so a
  //    re-run after a crash mid-snapshot heals itself instead of skipping the block.
  const alreadyRepo = isGitRepo(adoptedPath);
  const hasHead = alreadyRepo && git(adoptedPath, ['rev-parse', '--verify', 'HEAD']).status === 0;

  if (!hasHead) {
    if (!alreadyRepo) {
      console.log(
        '\nThis folder is not yet tracked by git.\n' +
          'Wienerdog needs git so a night of auto-written memory is one commit you can undo\n' +
          'with a single `git revert`. Without it, adopted memory would not be recoverable.'
      );
    }

    if (dryRun) {
      console.log(
        alreadyRepo
          ? '(--dry-run: this repo has no initial commit; would offer a starter .gitignore, clear any stale index.lock, and take an initial snapshot.)'
          : '(--dry-run: would init git, offer a starter .gitignore, clear any stale index.lock, and take an initial snapshot here.)'
      );
    } else {
      // 6a. Consent to git init only when the folder is not a repo yet.
      if (!alreadyRepo) {
        const okGit = yes || (await confirm('Initialize a git repository here and take an initial snapshot? [y/N] '));
        if (!okGit) throw new WienerdogError('adoption needs a git repo; aborted.');
        adoptGit.runGitStep(adoptedPath, ['init'], 'git init');
      }

      // 6b. Offer a starter .gitignore BEFORE staging, so churny/hazardous files
      //     (running plugin binaries, huge caches) never enter the snapshot.
      const plan = adoptGit.planGitignore(adoptedPath);
      if (plan.missing.length > 0) {
        console.log('\nWienerdog can add a starter .gitignore so git skips churny or hazardous files:');
        for (const l of plan.missing) console.log(`  ${l}`);
        console.log('(Appended to any existing .gitignore; nothing you wrote is overwritten.)');
        const okIgnore = yes || (await confirm('Add these lines to .gitignore? [y/N] '));
        if (okIgnore) adoptGit.applyGitignore(plan);
        else console.log('Proceeding without them — a very large or locked file may make git fail.');
      }

      // 6c. Recover from a stale index.lock left by an interrupted earlier run.
      const lock = adoptGit.inspectIndexLock(adoptedPath);
      if (lock.present && lock.stale) {
        console.log(
          `\nFound a leftover git lock (${lock.lockPath}), about ${Math.round(lock.ageMs / 1000)}s old,\n` +
            'likely from an interrupted earlier run. No git process appears to be using it.'
        );
        const okRm = yes || (await confirm('Remove the stale lock and continue? [y/N] '));
        if (!okRm) throw new WienerdogError('git index is locked; remove `.git/index.lock` and retry.');
        adoptGit.removeIndexLock(lock.lockPath);
      } else if (lock.present && !lock.stale) {
        throw new WienerdogError(
          'another git process seems to be using this repo right now (a fresh `.git/index.lock`); ' +
            'finish or stop it, then retry.'
        );
      }

      // 6d. Snapshot. Every step surfaces stderr + code/signal on failure.
      adoptGit.runGitStep(adoptedPath, ['add', '-A'], 'git add -A (staging the vault)');
      adoptGit.runGitStep(
        adoptedPath,
        [
          '-c',
          'user.name=wienerdog',
          '-c',
          'user.email=wienerdog@localhost',
          'commit',
          '--allow-empty',
          '-m',
          'wienerdog: adopt — initial snapshot',
        ],
        'git commit (initial snapshot)'
      );
    }
  }

  // 7. Infer + confirm layout.
  const layout = inferLayout(adoptedPath);
  printLayout(layout);
  if (!dryRun && !yes) {
    const okLayout = await confirm('\nUse this folder mapping? [y/N] ');
    if (!okLayout) {
      throw new WienerdogError(
        'layout not confirmed; aborted — re-run and confirm, or edit config.yaml after adopting.'
      );
    }
  }

  // 8. --dry-run stop point: report the scaffold plan, make no writes.
  if (dryRun) {
    const plan = scaffoldMappedDirs(adoptedPath, layout, { dryRun: true });
    console.log('\nWould create these missing folders:');
    if (plan.createdDirs.length === 0) console.log('  (none — all mapped folders already exist)');
    for (const d of plan.createdDirs) console.log(`  ${d}`);
    if (plan.seededFiles.length > 0) {
      console.log('Would seed identity starter notes:');
      for (const f of plan.seededFiles) console.log(`  ${f}`);
    }
    console.log('\n--dry-run: no changes made.');
    return;
  }

  // 9. Write config: point vault at the adopted path, set conservative mode,
  //    append the confirmed vault_layout block. Keep the manifest hash in sync.
  let updated = configText;
  updated = updated.replace(/^vault:.*$/m, `vault: ${adoptedPath}`);
  updated = updated.replace(
    /^memory_mode:.*$/m,
    'memory_mode: conservative  # set by adopt — strict gates for the first week'
  );
  if (!updated.endsWith('\n')) updated += '\n';
  updated += renderLayoutBlock(layout);
  fs.writeFileSync(paths.config, updated);
  const configEntry = manifest.entries.find((e) => e.kind === 'file' && e.path === paths.config);
  if (configEntry) configEntry.hash = sha256(updated);

  // 10. Scaffold only the missing mapped dirs (never overwrites existing files).
  const { createdDirs, seededFiles } = scaffoldMappedDirs(adoptedPath, layout, { manifest });

  // 11. Persist the manifest.
  manifestLib.save(paths, manifest);

  // Ensure the vendored app + PATH shim exist (adopt may run from an npx/temp copy
  // and does not call sync), then silently schedule the nightly dream (ADR-0014).
  const { vendorSelf, writeShim } = require('../core/vendor');
  vendorSelf(paths, { manifest });
  writeShim(paths, { manifest });
  manifestLib.save(paths, manifest);
  const { ensureDreamSchedule } = require('./schedule');
  const dream = ensureDreamSchedule(paths);

  // 12. Next steps.
  console.log('\nwienerdog: adoption complete.');
  console.log(`  Vault:        ${adoptedPath}`);
  console.log(`  Memory mode:  conservative (strict gates for your first week)`);
  console.log(`  Folders made: ${createdDirs.length}, starter notes seeded: ${seededFiles.length}`);
  if (dream.scheduled) {
    console.log(`  Nightly dreaming: scheduled for ${dream.at} (change/disable: \`wienerdog schedule remove dream\` or /wienerdog-routines).`);
  } else if (dream.reason === 'unsupported') {
    console.log('  Nightly dreaming: could not be auto-scheduled on this system yet — run `wienerdog dream` manually.');
  }
  if (dirExists(paths.vault)) {
    console.log(`\nThe default vault at ${paths.vault} is now unused — you can delete it if you like.`);
  }
  console.log('Run `wienerdog sync` to render your session digest from this vault.');
}

module.exports = { run };
