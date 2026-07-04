'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { readDreamConfig } = require('../core/dream/config');
const { acquireLock, releaseLock } = require('../core/dream/lock');
const { readWatermarks, writeWatermarks } = require('../core/dream/watermarks');
const { collectExtracts, cleanScratch } = require('../core/dream/scratch');
const { spawnBrain, buildClaudeArgs } = require('../core/dream/brain');
const { readVaultLayout } = require('../core/layout');
const { renderDigest } = require('../core/digest');
const { renderUpdateLine } = require('../core/update-check');
const { readAlerts } = require('../core/alerts');
const {
  validateAndCommit,
  assertGitRepo,
  assertCleanTree,
  precommitSessionEdits,
  restoreVaultToHead,
} = require('../core/dream/validate');

/** @returns {string} today's date as local YYYY-MM-DD, or WIENERDOG_FAKE_TODAY. */
function resolveDate() {
  if (process.env.WIENERDOG_FAKE_TODAY) return process.env.WIENERDOG_FAKE_TODAY;
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Snapshot {absPath: sha256} for the scratch files before the brain runs. */
function hashScratch(files) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const f of files) {
    try {
      out[path.resolve(f)] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    } catch {
      // A file that vanished before hashing is caught by the presence check later.
    }
  }
  return out;
}

/** Print the dry-run plan: session counts, bytes, drops, vault, resolved argv. */
function printPlan(sel, cfg, vaultDir, date, layout) {
  /** @type {Record<string, number>} */
  const perHarness = {};
  for (const e of sel.entries) perHarness[e.harness] = (perHarness[e.harness] || 0) + 1;
  let totalBytes = 0;
  for (const f of sel.wrote) {
    try {
      totalBytes += fs.statSync(f).size;
    } catch {
      // ignore
    }
  }
  console.log('wienerdog: dream plan (dry-run) — no brain, no commit.');
  console.log(`  vault: ${vaultDir}`);
  console.log(`  date: ${date}`);
  for (const harness of Object.keys(perHarness).sort()) {
    console.log(`  ${harness} sessions: ${perHarness[harness]}`);
  }
  console.log(`  total input bytes: ${totalBytes}`);
  console.log(`  dropped for size: ${sel.droppedForSize}`);
  const argv = buildClaudeArgs({ vaultDir, scratchDir: sel.scratchDir, date, model: cfg.model, layout });
  console.log(`  brain argv: claude ${argv.join(' ')}`);
}

/**
 * Run the brain under a hard watchdog. Guarantees the child process tree and the
 * timer are gone before it returns, on BOTH the normal and timeout paths
 * (ADR-0004: nothing outlives the job).
 * @param {{vaultDir:string, scratchDir:string, date:string, model:string|null,
 *          layout:import('../core/layout').VaultLayout,
 *          timeoutMs:number, logStream:NodeJS.WritableStream}} o
 */
async function runBrainWithWatchdog(o) {
  const { vaultDir, scratchDir, date, model, layout, timeoutMs, logStream } = o;
  const { child, done } = spawnBrain({ vaultDir, scratchDir, date, model, layout, env: process.env, logStream });

  let timer = null;
  const watchdog = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      // Kill the whole process GROUP (WP-008 spawned the child detached, so its
      // pid is the group leader) → the entire child tree dies.
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Already gone — nothing to kill.
      }
      reject(new WienerdogError(`dream timed out after ${Math.round(timeoutMs / 60000)} min`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([done, watchdog]);
    if (result.code !== 0) {
      const tail = (result.stderrTail || '').trim();
      throw new WienerdogError(`dream brain exited ${result.code}${tail ? `: ${tail}` : ''}`);
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * wienerdog dream [--dry-run] [--yes]
 * Exit 0 = success, "another dream running", or "nothing to dream".
 * Exit 1 = expected failure (WienerdogError): no vault, dirty tree, brain
 *          failure/timeout, git error.
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function run(argv) {
  const dryRun = argv.includes('--dry-run');

  // 1. Resolve config + date.
  const paths = getPaths();
  const cfg = readDreamConfig(paths.config); // throws WienerdogError when no vault
  const vaultDir = cfg.vault;
  const layout = readVaultLayout(paths.config);
  const date = resolveDate();

  // 2. Vault must be a git repo. (Uncommitted session edits are handled by the
  //    pre-commit below, after the lock — no clean-tree precondition here.)
  assertGitRepo(vaultDir);

  // 3. Collect the fresh transcripts into scratch.
  const wm = readWatermarks(paths.state);
  const sel = collectExtracts(paths, wm, cfg.maxInputBytes);

  // 4. Nothing new → no brain, no commit, no watermark change.
  if (sel.entries.length === 0) {
    cleanScratch(paths.state);
    console.log('wienerdog: nothing new to dream.');
    return;
  }

  // 5. Dry-run → print the plan and stop.
  if (dryRun) {
    printPlan(sel, cfg, vaultDir, date, layout);
    cleanScratch(paths.state);
    return;
  }

  // Baseline the scratch files while they are still pristine (before the brain).
  const scratchBaseline = hashScratch(sel.wrote);

  // 6. Acquire the single-run lock.
  const lock = acquireLock(paths.state, cfg.timeoutMs);
  if (!lock.acquired) {
    cleanScratch(paths.state);
    console.log('wienerdog: another dream is in progress.');
    return;
  }
  if (lock.stolen) {
    console.warn('wienerdog: warning — stole a stale dream lock from a prior run that never released it.');
  }

  // 7. Run the brain under the watchdog, then validate + commit.
  try {
    // Commit the user's own uncommitted session edits so the post-brain diff is
    // exactly the brain's writes (fixes dirty-vault starvation).
    precommitSessionEdits(vaultDir);
    // After the pre-commit the tree MUST be clean. If it is not, dirt appeared
    // while the lock was held (a race, not session edits) — refuse (pathological).
    assertCleanTree(vaultDir);

    const logDir = path.join(paths.logs, 'dream');
    fs.mkdirSync(logDir, { recursive: true });
    const logStream = fs.createWriteStream(path.join(logDir, `${date}.log`), { flags: 'a' });
    try {
      await runBrainWithWatchdog({
        vaultDir,
        scratchDir: sel.scratchDir,
        date,
        model: cfg.model,
        layout,
        timeoutMs: cfg.timeoutMs,
        logStream,
      });
    } catch (err) {
      // Brain failed/timed out: discard its partial, unvalidated writes (all dirt
      // is brain-authored by construction after the pre-commit) before releasing
      // the lock. Still fail: run-job records the error + fails loud.
      restoreVaultToHead(vaultDir);
      throw err;
    } finally {
      logStream.end();
    }

    // 8. Validate the writes and make exactly one commit.
    const res = validateAndCommit({
      vaultDir,
      scratchDir: sel.scratchDir,
      date,
      expectedScratch: sel.wrote,
      scratchBaseline,
      layout,
    });

    // 9. Advance the watermarks — ONLY after a successful commit.
    writeWatermarks(paths.state, { claude: sel.maxMtime.claude, codex: sel.maxMtime.codex });

    // 10. Regenerate the injected session digest (atomic temp + rename).
    fs.mkdirSync(paths.state, { recursive: true });
    const digest = renderDigest(vaultDir, layout, { alerts: readAlerts(paths), updateLine: renderUpdateLine(paths) });
    const digestDest = path.join(paths.state, 'digest.md');
    const digestTmp = path.join(paths.state, `.digest.md.${process.pid}.tmp`);
    fs.writeFileSync(digestTmp, digest);
    fs.renameSync(digestTmp, digestDest);

    // 11. Summary.
    const shaShort = res.sha ? res.sha.slice(0, 7) : '(none)';
    console.log(
      `wienerdog: dream committed ${shaShort} — ${res.counts.notes} notes, ${res.counts.skills} skills; ` +
        `${res.reverted.length} reverted, ${res.outOfVault.length} out-of-vault.`
    );
  } finally {
    // 12. Always release the lock and wipe scratch (success, error, or timeout).
    releaseLock(paths.state);
    cleanScratch(paths.state);
  }
}

module.exports = { run };
