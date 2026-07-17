'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { readDreamConfig } = require('../core/dream/config');
const { acquireLock, releaseLock, ownsLock } = require('../core/dream/lock');
const ledgerLib = require('../core/dream/ledger');
const { collectExtracts, cleanScratch, MIN_TRUNCATE_BYTES } = require('../core/dream/scratch');
const { spawnBrain, buildClaudeArgs } = require('../core/dream/brain');
const { readVaultLayout } = require('../core/layout');
const { renderDigest, listSecretQuarantine } = require('../core/digest');
const identityApprovals = require('../core/identity-approvals');
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

/**
 * True IFF every expected extract still exists AND byte-matches its pre-brain
 * baseline — proof the brain's inputs were present and unchanged for the whole
 * run. A false result means the inputs vanished or changed mid-run (the
 * 2026-07-07 concurrency incident): the brain could not have consolidated them.
 * @param {string[]} wrote  the extract paths collectExtracts wrote (sel.wrote)
 * @param {Record<string,string>} baseline  {absPath: sha256} from hashScratch()
 * @returns {boolean}
 */
function scratchIntact(wrote, baseline) {
  for (const f of wrote) {
    const abs = path.resolve(f);
    let h;
    try {
      h = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    } catch {
      return false; // missing → vanished
    }
    if (baseline[abs] !== h) return false; // present but changed
  }
  return true;
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
  console.log(`  truncated to fit: ${sel.truncated.length}`);
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

  // 2. Vault must be a git repo (read-only check; fail fast without the lock).
  assertGitRepo(vaultDir);

  // 3. Acquire the single-run lock BEFORE any scratch collect/write. state/
  //    dream-scratch is shared mutable state; collectExtracts rebuilds it
  //    (rm + mkdir + write). Locking first is what guarantees a concurrent dream
  //    can never destroy the holder's live inputs (2026-07-07 incident). A dream
  //    that does NOT get the lock touches NOTHING and returns — a pure no-op.
  const lock = acquireLock(paths.state, cfg.timeoutMs);
  if (!lock.acquired) {
    console.log('wienerdog: another dream is in progress.');
    return; // no collect, no cleanScratch, no lock write.
  }
  if (lock.stolen) {
    console.warn('wienerdog: warning — stole a stale dream lock from a prior run that never released it.');
  }

  try {
    // 4. Read + one-time-migrate the per-file quarantine ledger (audit A6,
    //    ADR-0023 — replaces the scalar watermark), then collect the fresh
    //    transcripts into scratch (now safely under the lock). The migration
    //    write is ALSO dry-run-guarded (OWNER-APPROVED 2026-07-17, second
    //    review round): the upgrade path — watermarks.json present, no ledger
    //    yet — is exactly the state every existing user first dry-runs from,
    //    and a preview run must not permanently mutate state. On dry-run the
    //    migrated ledger is used in-memory only; migration is idempotent, so
    //    the next real run re-migrates identically.
    let ledger = ledgerLib.readLedger(paths.state);
    const mig = ledgerLib.migrateFromWatermarks(paths.state, ledger);
    ledger = mig.ledger;
    if (mig.migrated && !dryRun) ledgerLib.writeLedger(paths.state, ledger);
    const sel = collectExtracts(paths, ledger, cfg.maxInputBytes);

    // Regenerate the injected session digest from the CURRENT ledger (atomic
    // temp + rename). The quarantine banner is re-derived from the ledger every
    // render — durable while a quarantine is active, self-clearing after the
    // file leaves quarantine. activeQuarantines exposes basenames + a code-owned
    // reason enum only (never content, never a full path), so no untrusted
    // bytes reach the injected digest (same rule as formatAlerts).
    // A3 hash gate (WP-116, ADR-0021): the dream NEVER seeds — it reads the
    // registry established at the last attended sync/approval and enforces, so
    // a nightly corruption fails closed against that baseline.
    const regenerateDigest = () => {
      fs.mkdirSync(paths.state, { recursive: true });
      const idReg = identityApprovals.readRegistry(paths.state);
      const q = ledgerLib.activeQuarantines(ledger);
      const quarantineLine =
        q.length > 0
          ? `> [!warning] Wienerdog: ${q.length} session transcript(s) could not be read and were skipped — ` +
            `${q.map((e) => `${e.file} (${e.reason})`).join(', ')}. Dreaming continues over your other sessions; ` +
            'a skipped file is retried automatically if it changes.'
          : '';
      const digest = renderDigest(vaultDir, layout, {
        alerts: readAlerts(paths),
        updateLine: renderUpdateLine(paths),
        identityApprovals: identityApprovals.approvalsMap(idReg),
        quarantineLine,
        secretQuarantine: listSecretQuarantine(paths.state), // EP4 pending-review banner (WP-125)
      });
      const digestDest = path.join(paths.state, 'digest.md');
      const digestTmp = path.join(paths.state, `.digest.md.${process.pid}.tmp`);
      fs.writeFileSync(digestTmp, digest);
      fs.renameSync(digestTmp, digestDest);
    };

    // 5. Surface capacity events plainly — a size event must NEVER be silent.
    for (const t of sel.truncated) {
      console.log(
        `wienerdog: dream — truncated ${t.harness}/${t.session_id} to fit the input budget ` +
          `(kept the newest ${t.keptBytes} of ${t.originalBytes} bytes).`
      );
    }
    if (sel.dropped.length > 0) {
      const names = sel.dropped.map((d) => `${d.harness}/${d.session_id} (${d.bytes}B)`).join(', ');
      console.log(
        `wienerdog: dream — capacity: dropped ${sel.dropped.length} session(s) over ` +
          `dream_max_input_bytes (${cfg.maxInputBytes}): ${names}.`
      );
    }
    // Per-quarantine console line: secret-free — SANITIZED folded basename +
    // reason enum only, through the SAME sanitizer as the digest banner
    // (ledger.displayName; review finding, amended 2026-07-17). A dry-run only
    // diagnoses ("would quarantine"), mirroring the capacity-wedge carve-out.
    for (const q of sel.newlyQuarantined) {
      const name = `${q.harness}/${ledgerLib.displayName(q.path)} (${q.reason})`;
      if (dryRun) {
        console.log(`wienerdog: dream plan (dry-run) — would quarantine ${name}.`);
      } else {
        console.log(`wienerdog: dream — quarantined ${name}; it will not be retried until it changes.`);
      }
    }

    // 5b. Record + surface quarantines even on an otherwise-idle run — BEFORE
    //     the entries.length === 0 returns, so a quarantine-only run records
    //     them, shows the banner, and exits 0. Next run the unchanged file is
    //     skip-quarantined: a permanently-broken file must not fail-loud (or
    //     re-alert) every night. Dry-run-guarded (OWNER-APPROVED 2026-07-17):
    //     a preview run must not permanently mutate transcript-ledger.json or
    //     the injected digest.md.
    if (sel.newlyQuarantined.length > 0 && !dryRun) {
      for (const q of sel.newlyQuarantined) ledger = ledgerLib.recordQuarantined(ledger, q, q.reason);
      ledgerLib.writeLedger(paths.state, ledger);
      regenerateDigest();
    }

    // 6. Fresh sessions existed but NONE could be fed → capacity WEDGE: fail loud
    //    (run-job records a durable alert). Dry-run only diagnoses.
    if (sel.entries.length === 0 && sel.dropped.length > 0) {
      if (dryRun) {
        console.log(
          'wienerdog: dream plan (dry-run) — capacity exhausted: no fresh session fits ' +
            `dream_max_input_bytes (${cfg.maxInputBytes}); raise it in config.yaml.`
        );
        return;
      }
      throw new WienerdogError(
        `dream capacity exhausted: ${sel.dropped.length} fresh session(s) exceed ` +
          `dream_max_input_bytes (${cfg.maxInputBytes}) and none fit even after truncation ` +
          `(per-session floor ${MIN_TRUNCATE_BYTES} bytes) — raise dream_max_input_bytes in config.yaml.`
      );
    }

    // 7. Genuinely nothing new → no brain, no commit.
    if (sel.entries.length === 0) {
      console.log('wienerdog: nothing new to dream.');
      return;
    }

    // 8. Dry-run → print the plan and stop.
    if (dryRun) {
      printPlan(sel, cfg, vaultDir, date, layout);
      return;
    }

    // 9. Baseline the scratch files while they are still pristine (before brain).
    const scratchBaseline = hashScratch(sel.wrote);

    // 10. Pre-commit the user's own uncommitted session edits so the post-brain
    //     diff is exactly the brain's writes; after it the tree MUST be clean.
    precommitSessionEdits(vaultDir);
    assertCleanTree(vaultDir);

    // 11. Run the brain under the watchdog.
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
      // Brain failed/timed out: discard its partial, unvalidated writes, then fail.
      restoreVaultToHead(vaultDir);
      throw err;
    } finally {
      logStream.end();
    }

    // 12. STATE-ADVANCE SAFETY GATE (WP-069, now per-file). The brain exited 0 —
    //     but only trust that as a consolidation if its inputs were AVAILABLE
    //     and UNCHANGED for the whole run. If any expected extract vanished or
    //     changed (2026-07-07: a second dream deleted this run's live scratch,
    //     so the brain wrote only failure-doc notes on empty inputs), the brain
    //     consolidated NOTHING: restore the vault, record NO per-file outcome,
    //     and fail loud so run-job records a durable alert. The sessions are
    //     retried next run.
    if (!scratchIntact(sel.wrote, scratchBaseline)) {
      restoreVaultToHead(vaultDir);
      throw new WienerdogError(
        'dream aborted: the input extracts vanished or changed mid-run — no session ' +
          'was consolidated, so the watermark is not advanced (these sessions will be retried next run).'
      );
    }

    // 13. Validate the writes and make exactly one commit.
    const res = validateAndCommit({
      vaultDir,
      scratchDir: sel.scratchDir,
      date,
      expectedScratch: sel.wrote,
      scratchBaseline,
      layout,
      stateDir: paths.state,
    });

    // 14. Record the per-file outcomes — only now: brain 0 + inputs intact +
    //     commit ok (the exact WP-069 watermark-safety property, per-file). A
    //     capacity-deferred file is in NEITHER processed nor newlyQuarantined →
    //     no record → naturally retried next run (the WP-048/069 starvation
    //     fix, structural — no scalar can jump past an unconsolidated session).
    for (const d of sel.processed) ledger = ledgerLib.recordProcessed(ledger, d);
    ledgerLib.writeLedger(paths.state, ledger);

    // 15. Regenerate the injected session digest (atomic temp + rename),
    //     including the durable quarantine banner from the current ledger.
    regenerateDigest();

    // 16. Summary.
    const shaShort = res.sha ? res.sha.slice(0, 7) : '(none)';
    console.log(
      `wienerdog: dream committed ${shaShort} — ${res.counts.notes} notes, ${res.counts.skills} skills; ` +
        `${res.reverted.length} reverted, ${res.outOfVault.length} out-of-vault.`
    );
  } finally {
    // 17. Teardown: clean scratch + release the lock ONLY if we still hold it. If
    //     we were superseded by a stale-lock steal, the stealer now owns both the
    //     lock and the rebuilt scratch — touch NEITHER. Clean before release so no
    //     newly-starting dream can acquire the freed lock and have its fresh
    //     scratch wiped by our cleanup (TOCTOU).
    if (ownsLock(paths.state)) {
      cleanScratch(paths.state);
      releaseLock(paths.state);
    }
  }
}

module.exports = { run };
