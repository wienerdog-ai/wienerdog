'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { getPaths } = require('../core/paths');
const { spawnPinnedSync } = require('../core/exec-identity');
const { WienerdogError } = require('../core/errors');
const { readDreamConfig } = require('../core/dream/config');
const { acquireLock, releaseLock, ownsLock } = require('../core/dream/lock');
const ledgerLib = require('../core/dream/ledger');
const { collectExtracts, cleanScratch, MIN_TRUNCATE_BYTES } = require('../core/dream/scratch');
const { refreshWarnings, composeWarnings, WARNINGS_REL } = require('../core/dream/warnings');
const { spawnBrain, buildClaudeArgs } = require('../core/dream/brain');
const { readVaultLayout } = require('../core/layout');
const { renderDigest, listSecretQuarantine } = require('../core/digest');
const { writeFilePrivate, scanPrivateModes, mkdirPrivate, createLogStreamPrivate, mechanicsRootUntrusted } = require('../core/private-fs');
const { reapTree, reapGroup } = require('../core/reap');
const { ensureSettingsProfile } = require('../core/runtime-settings');
const { runContainmentProbe } = require('../core/dream/containment-probe');
const identityApprovals = require('../core/identity-approvals');
const { renderUpdateLine } = require('../core/update-check');
const { readAlerts } = require('../core/alerts');
const { unacknowledgedAlerts } = require('../core/alert-ack');
const {
  makeGates,
  assertGitRepo,
  isNewSkillDraft,
  parseFrontmatter,
} = require('../core/dream/validate');
const { createWorkspace, destroyWorkspace, WORKSPACE_DIRNAME } = require('../core/dream/workspace');
const { computeDelta } = require('../core/dream/delta');
const { promote } = require('../core/dream/promote');
const { readRegistry, recordSkills } = require('../core/dream/skill-registry');
const { redactOnly } = require('../core/secret-scan');
const { sanitizeProjectName } = require('../core/digest');

/** Today's date as local YYYY-MM-DD. The date env seam (audit A7/F5, WP-155) was
 *  deleted from production; tests inject the clock via the JS-only `opts.now`.
 *  @param {Date} [d] injected clock; defaults to the system clock.
 *  @returns {string} */
function resolveDate(d = new Date()) {
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

/** @param {string} dir @returns {string[]} absolute file paths under dir, recursively.
 *  Row G12's enumerate half: `scratchIntact` below checks only that the EXPECTED
 *  extracts are intact, so it takes an enumeration to see an UNEXPECTED one. */
function listFilesRecursive(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} d */
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return; // unreadable dir → nothing to enumerate
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      // EVERY NON-DIRECTORY ENTRY, not every regular file. A symlink, FIFO,
      // socket or device the brain plants in the read-only scratch dir is a
      // sandbox-policy breach exactly like a stray `.json`, and `cleanScratch`
      // removes it at teardown either way — so an enumerator that skipped it
      // would delete the evidence and record NOTHING, which is the observability
      // loss row G12 exists to prevent, arriving as a breach that survives
      // nowhere. The retired enumerator ended `else out.push(full)`; narrowing
      // it to `isFile()` was a silent narrowing of a durable behaviour.
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
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

/** Print the dry-run plan: session counts, bytes, drops, vault, resolved argv.
 *  `settingsPath` is the WP-129 hook-free settings profile, ensured by the
 *  caller (idempotent) so the echoed argv matches the real spawn's argv.
 *
 *  THE PREVIEW MOVES WITH THE TARGET (row G1, Table V row V8). It prints the
 *  composed argv, so once the real run writes a WORKSPACE, a preview still
 *  naming the vault would describe a run that no longer happens. It is the same
 *  composition or it is not a preview — hence `workspaceDir` is a parameter here
 *  rather than the local `vaultDir` reused. */
function printPlan(sel, cfg, vaultDir, workspaceDir, date, layout, settingsPath) {
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
  // The --dry-run preview must compose the SAME write-target argument the real
  // invocation does, or it prints a plan that is not the plan.
  const argv = buildClaudeArgs({ workspaceDir, scratchDir: sel.scratchDir, date, model: cfg.model, layout, settingsPath });
  console.log(`  brain argv: claude ${argv.join(' ')}`);
}

/**
 * THIS FILE'S git seam (CLAIM 2b): total over `src/cli/dream.js`, NOT over the dream
 * path — a LIMIT row W1(c)'s COVERAGE clause states and owns. Every invocation goes
 * through here, so a test can substitute it and observe every `cwd` — which is what
 * the pipeline-wide "no git with a cwd at or beneath the workspace root" assertion
 * needs. A source grep cannot discriminate: it is green today, green on a correct
 * implementation, and green on a broken one that passes the path through a variable.
 * @param {(o:{args:string[], cwd:string, env:NodeJS.ProcessEnv}) => {status:number|null, stdout?:string|Buffer, stderr?:string, error?:Error}} spawnGit
 * @param {string} cwd @param {string[]} args
 * @param {{allowFail?:boolean, input?:Buffer, env?:NodeJS.ProcessEnv}} [opts]
 */
function gitIn(spawnGit, cwd, args, opts = {}) {
  const res = spawnGit({ args, cwd, env: opts.env || process.env, input: opts.input });
  if (res.error) {
    throw new WienerdogError(`git could not run (${args[0]}): ${res.error.message}`);
  }
  if (!opts.allowFail && res.status !== 0) {
    throw new WienerdogError(`git ${args[0]} failed: ${String(res.stderr || '').trim()}`);
  }
  return res;
}

/** The real seam: the WP-154 pinned front door, never a bare `git`. */
function spawnGitPinned(o) {
  return spawnPinnedSync('git', getPaths(), {
    args: ['-C', o.cwd, ...o.args],
    env: o.env,
    platform: process.platform,
    encoding: 'utf8',
    ...(o.input === undefined ? {} : { input: o.input }),
  });
}

/**
 * ROW G8 — build the run's ONE commit out of a NAMED set of paths, each carrying
 * ITS CLASS's decided bytes.
 *
 * TWO THINGS THIS HAS TO GET RIGHT, and neither is achieved by naming paths to
 * `git add`.
 *
 * (1) NOTHING BUT THE NAMED SET. With no pre-commit (row G6) a wholesale stage
 *     would sweep the user's uncommitted edits into the dream commit. So the
 *     tree is built from HEAD in a PRIVATE INDEX — the user's own index and
 *     working tree are never touched, never read, and never staged.
 *
 * (2) THE DECIDED BYTES, NOT A FRESH READ. Staging re-reads the working tree, so
 *     a user save landing between the publish and the staging call is what would
 *     enter the commit, ungated. Measured: with a save in that gap,
 *     `git add -- <path>` stages the user's post-publish bytes. Each member's
 *     buffer is hashed straight into the object store instead, so the committed
 *     content is the buffer promotion approved. The user's post-publish save
 *     remains as an uncommitted working-tree modification — not committed, not
 *     discarded.
 *
 * HOW that is achieved is the implementer's (round-4 CUT ruling); this is the
 * how. `--path <rel>` makes git apply the same `.gitattributes` clean filters
 * and `core.autocrlf` conversion a real `git add <rel>` would, so the blob is
 * what that path's content must be.
 *
 * @param {{vaultDir:string, stateDir:string, members:Array<{rel:string, bytes:Buffer}>,
 *          message:string, spawnGit:Function}} o
 * @returns {string} the new commit sha
 */
function commitNamedSet(o) {
  const { vaultDir, members, message, spawnGit } = o;
  const g = (args, opts) => gitIn(spawnGit, vaultDir, args, opts);
  const head = g(['rev-parse', 'HEAD']).stdout.toString().trim();

  // A private index, outside the vault's `.git`, so a concurrent `git` in the
  // user's own shell never contends with it and the user's staged state is
  // untouched whatever happens here.
  const tmpIndex = path.join(o.stateDir, `dream-index.${process.pid}.tmp`);
  fs.rmSync(tmpIndex, { force: true });
  // The private index travels in the CHILD's env only — never by mutating this
  // process's, which a concurrent caller would see.
  const indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex };
  const withIndex = (args, opts) => g(args, { ...opts, env: indexEnv });

  try {
    withIndex(['read-tree', head]);
    for (const m of members) {
      // Keep the path's existing mode when HEAD has one — a promotion must not
      // silently re-permission a file it did not author.
      const ls = g(['ls-tree', head, '--', m.rel], { allowFail: true });
      const mode = (String(ls.stdout || '').trim().split(/\s+/)[0]) || '100644';
      // NO `--path`, AND THAT IS THE CONTRACT RATHER THAN AN OMISSION. `--path`
      // makes git apply THAT PATH's clean filter and eol/text attributes to the
      // piped buffer, so in a vault carrying `* text=auto` — or any filter — the
      // stored blob is NOT byte-equal to `m.bytes`. Measured: an approved CRLF
      // buffer is stored with LF bytes, i.e. the commit carries content no gate
      // judged, which is exactly what row G8 and Table S forbid. Without the
      // flag, `--stdin` stores the bytes verbatim.
      //
      // It bought nothing here: the mode comes from `ls-tree` above, not from
      // the attributes. (An earlier form passed `--path` reasoning that it made
      // the blob match what `git add <rel>` would produce — true, and precisely
      // the wrong target: this commit must carry the DECIDED bytes, not the
      // bytes a working-tree add would have made of them.)
      const blob = g(['hash-object', '-w', '--stdin'], { input: m.bytes });
      const sha = String(blob.stdout).trim();
      if (!sha) throw new WienerdogError(`dream commit: git could not hash ${m.rel}`);
      withIndex(['update-index', '--add', '--cacheinfo', mode, sha, m.rel]);
    }
    const tree = withIndex(['write-tree']).stdout.toString().trim();
    const commit = g(
      ['-c', 'user.name=wienerdog', '-c', 'user.email=wienerdog@localhost',
        'commit-tree', tree, '-p', head, '-m', message]
    ).stdout.toString().trim();
    g(['update-ref', '-m', 'wienerdog dream', 'HEAD', commit, head]);

    // THE USER'S INDEX IS NOT THIS RUN'S PROPERTY, and this run does not touch
    // it. THE CLAIM RANGES OVER THIS RUN'S OWN ACTS — its own git invocations
    // and its own file writes (row W1(a), which defines the scope). A hook the
    // user has configured to fire on ref updates is the user's code running on
    // the user's standing instruction; triggering the contracted `update-ref`
    // does not make that hook's write this run's act. That is a decision with a
    // cost, taken deliberately (owner ruling,
    // 2026-08-31) after a refresh mechanism here produced FOUR data-loss defects
    // in four review rounds: it destroyed staged content, then staged deletions
    // and staged modes, then disabled itself through a parser bug, then flattened
    // a user's unresolved merge stages into one entry.
    //
    // THE COST, STATED PLAINLY: after this commit the user's index still
    // describes the OLD head, so `git status` reports the paths this run
    // committed as staged deletions or reverse modifications until they run
    // `git reset` in the vault. That is cosmetic and recoverable in one command.
    // What the refresh risked was not.
    //
    // Nothing downstream reads the index: the commit is built in a PRIVATE index
    // above (`GIT_INDEX_FILE`) and published with `commit-tree` + `update-ref`,
    // so the user's index is never an input to anything this package decides.
    // Re-deriving git's own staging rules by hand — which is what any correct
    // refresh would have to do — is not this package's business.
    return commit;
  } finally {
    fs.rmSync(tmpIndex, { force: true });
  }
}

/**
 * TABLE N's TRANSFORMATION for the ONE channel this package RENDERS.
 *
 * `report.accounting.reason` originates with the vault-write primitive, whose
 * surviving staging object or directory DERIVES ITS NAME FROM THE BRAIN-CHOSEN
 * PATH — so `WP-dream-promote-report`'s Table N classifies it
 * attacker-influenceable BY DERIVATION. The write that would have composed it is
 * the very one that was refused, so that package's code-authored-section
 * criterion does not reach it: this pipeline is the party that renders it, and
 * this is where the classification is enforced.
 *
 * REDACT FIRST, THEN SANITISE — the order is `WP-dream-promote-report`'s **Table
 * N row N1** and is CITED, never restated. This is the second rendering site of
 * that one contract (Table N names this package as the renderer of both
 * `report.reason` and `accounting.reason`, because the section composer never
 * touches either value), so two carriers is the design — but the ORDER
 * RATIONALE and its measurement belong to N1 alone. Restating them here is what
 * would falsify twice the day the order is re-decided; the consolidation of the
 * two carriers is routed to a successor.
 * @param {unknown} value @returns {string}
 */
function neutralise(value) {
  return sanitizeProjectName(redactOnly(String(value)));
}

/**
 * Run the brain under a hard watchdog. Guarantees the child process tree and the
 * timer are gone before it returns, on BOTH the normal and timeout paths
 * (ADR-0004: nothing outlives the job).
 *
 * Supervised path (audit A10, ADR-0030): when run-job minted a per-run token
 * (`WIENERDOG_DREAM_RUN_TOKEN`), the brain's identity is handed UP to the outer
 * supervisor via the per-token pidfile `state/dream-brain.<token>.pid`
 * ({pid, pgid} — the brain is spawned detached, so its pid IS its pgid),
 * written ATOMICALLY via writeFilePrivate immediately after the spawn (the
 * spawn→hand-up window is sub-ms; a middle that dies inside that gap before
 * the write is the documented ADR-0030 residual). run-job reads ONLY its own
 * run's token pidfile, so a concurrent run can never reap another run's brain.
 * Standalone runs (no token) write no hand-up pidfile — the inner watchdog
 * reaps the brain directly.
 * @param {{workspaceDir:string, vaultDir:string, scratchDir:string, date:string,
 *          model:string|null,
 *          layout:import('../core/layout').VaultLayout,
 *          timeoutMs:number, logStream:NodeJS.WritableStream,
 *          containmentProbe?:{outcome:string, claudeVersion:string},
 *          paths?:import('../core/paths').WienerdogPaths,
 *          runToken?:string|null,
 *          platform?:NodeJS.Platform,
 *          seams?:{reapTree?: typeof reapTree, reapGroup?: typeof reapGroup,
 *                  writeFilePrivate?: typeof writeFilePrivate,
 *                  pollDelayMs?: number}}} o
 *   `platform` is injected (never mock process.platform); `seams` is the
 *   JS-only test-injection idiom (WP-155) for the reap primitives and the
 *   R10-1 hand-up write-failure guard.
 * @returns {Promise<{sawUnknownCommand:boolean,
 *                    reap:{verified:boolean, why:string}}>}
 *   This function used to return NOTHING, and BOTH of the run's post-settle
 *   signals were trapped inside it. Table G needs both in the caller.
 *
 *   sawUnknownCommand  the brain's rejection marker. **The abort DECISION lives
 *         with the caller (row G3)**, because the second half of that decision —
 *         an empty workspace delta — is not known until the brain has settled
 *         and the walk has run, which is the caller's ground and not this
 *         function's. Its two other aborts stay HERE: a non-zero brain exit and
 *         the watchdog timeout each rest on evidence this function already holds.
 *   reap  the post-settle reap verdict, computed on EVERY run — tokenized
 *         scheduler run and tokenless manual run alike (row G2) — and surfaced
 *         rather than discarded. It used to be computed INSIDE `if (pidfile)`,
 *         and `pidfile` is null on a tokenless manual run, so on a standalone
 *         success the verdict was not merely discarded: it was ABSENT.
 *         `verified:false` and an absent verdict are the same thing to the
 *         caller — unverified, refuse fail-closed.
 */
async function runBrainWithWatchdog(o) {
  const { workspaceDir, vaultDir, scratchDir, date, model, layout, timeoutMs, logStream, containmentProbe } = o;
  const platform = o.platform || process.platform;
  const seams = o.seams || {};
  const reapTreeFn = seams.reapTree || reapTree;
  const reapGroupFn = seams.reapGroup || reapGroup;
  const writePrivate = seams.writeFilePrivate || writeFilePrivate;
  // The two post-settle signals this function SURFACES (row G2, row G3). They
  // are assigned on the settle paths below and returned together; the `finally`
  // that computes the reap verdict runs on every path, including the two that
  // throw, so a thrown abort never leaves a stale verdict behind for a caller
  // that will never see it.
  let sawUnknownCommand = false;
  /** @type {{verified:boolean, why:string}} */
  let reap = { verified: false, why: 'the reap verdict was never computed' };
  // ROW G1 — THE WRITE TARGET IS THE RUN'S WORKSPACE. The sibling's transitional
  // argument (`workspaceDir: vaultDir`) is gone: this pipeline now builds the
  // workspace before the spawn, promotes out of it afterwards, and tears it down
  // on every exit path. This is the line where the sibling's CLAIM 1 becomes
  // true of the running product.
  const { child, done } = spawnBrain({
    // `vaultDir` is NOT a second write target — it is the run's real vault
    // (`cfg.vault`), passed so the brain's constructed environment can keep it
    // OUT. It must come from here: `wienerdog adopt` writes an arbitrary path
    // into config.yaml, so `paths.vault` is a different directory on an adopted
    // vault and sanitising against it would strip the wrong one.
    workspaceDir, vaultDir, scratchDir, date, model, layout, env: process.env, logStream, containmentProbe,
  });

  // Hand the brain's identity UP to the outer supervisor, per-run token.
  const pidfile =
    o.runToken && o.paths && Number.isInteger(child.pid) && child.pid > 1
      ? path.join(o.paths.state, `dream-brain.${o.runToken}.pid`)
      : null;
  if (pidfile) {
    try {
      // Atomic 0600 temp+rename, immediately post-spawn (sub-ms hand-up window).
      writePrivate(pidfile, `${JSON.stringify({ pid: child.pid, pgid: child.pid })}\n`);
    } catch (err) {
      // R10-1: the hand-up write is FALLIBLE I/O (disk-full / permission /
      // temp→final rename) and it failed AFTER the brain was spawned. No
      // identity was handed up, so run-job's backstop (which reaps group B
      // ONLY when the pidfile is present) can NEVER retry this group — this
      // guard is the only reaper holding child.pid, and it must finish the job
      // here: reap the just-spawned brain group NOW and FAIL the run (never
      // proceed into the brain race as if supervised, never a silent exit).
      // Distinct from the accepted sub-ms spawn→hand-up-window residual
      // (there the write never runs; here the write itself failed).
      let r = await reapGroupFn(child.pid, platform, seams);
      if (!r || r.reaped !== true) {
        // R11-3, unified with R8-1: on { reaped: false } do ONE bounded FINAL
        // escalation while still holding child.pid (bounded — never an
        // unbounded block-until-ESRCH; the unkillable D-state group is the
        // ADR-0030 residual, surfaced loudly below).
        r = await reapGroupFn(child.pid, platform, seams);
        if (!r || r.reaped !== true) {
          // Survivor-specific fail-loud: name the un-reaped brain group so
          // run-job's alert + error watermark surface the surviving group.
          throw new WienerdogError(
            `dream failed: could not record the brain's process id for supervision ` +
              `(${err.message}) AND the brain's process group ${child.pid} could not be reaped to ` +
              'quiescence after a bounded escalation — a dream process may still be running ' +
              '(ADR-0004; see ADR-0030).'
          );
        }
      }
      throw new WienerdogError(
        `dream failed: could not record the brain's process id for supervision (${err.message}); ` +
          'the brain was stopped and this run was aborted.'
      );
    }
  }

  let timer = null;
  const watchdog = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      // Reap the brain's REAL descendant tree from the authoritative process
      // table (audit A10 — replaces the single inline group-kill): a brain
      // child that re-detached into its own group is still a ppid-descendant
      // and dies too. Best-effort; never throws.
      reapTreeFn(child.pid, platform, seams);
      reject(new WienerdogError(`dream timed out after ${Math.round(timeoutMs / 60000)} min`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([done, watchdog]);
    if (result.code !== 0) {
      const tail = (result.stderrTail || '').trim();
      throw new WienerdogError(`dream brain exited ${result.code}${tail ? `: ${tail}` : ''}`);
    }
    sawUnknownCommand = result.sawUnknownCommand === true;
    // THE COMPOUND GUARD'S SECOND HALF IS NOT KNOWN HERE (row G3). The text
    // signal alone is attacker-influenceable — transcripts are untrusted, and a
    // steered brain could END its output with the bare marker line — so the
    // abort has always needed corroboration that the brain did NO WORK. That
    // corroboration used to be vault-cleanliness, sound only because the tree
    // was asserted clean immediately before the spawn: the premise
    // the retired pre-commit supplied, and row G6 removes it.
    //
    // Under promotion the brain writes the WORKSPACE, so the evidence moves
    // there: a genuine rejection produced an EMPTY workspace delta. That delta
    // does not exist until the brain has settled AND the walk has run, which is
    // the caller's ground — so the marker is SURFACED and the caller decides.
    // The vault's cleanliness is no longer evidence of anything the brain did.
  } finally {
    if (timer) clearTimeout(timer);
    {
      // R6-2/R7-2 — PROVE group-B quiescence BEFORE releasing the hand-up, on
      // EVERY settle where the brain leader has exited (not only on timeout:
      // on a non-timeout brain-leader non-zero exit a same-PGID group-B child
      // can survive the leader, and neither the inner watchdog — timeout-only
      // — nor run-job — whose backstop reaps group B only while the pidfile is
      // present — would reap it if this finally dropped the pidfile first).
      // Order is load-bearing: FIRST the checked reapGroup(child.pid) — the
      // negative-PGID kill that reaps surviving members even after the leader
      // exited (brain pgid == child.pid) — THEN remove the pidfile ONLY on a
      // verified { reaped: true }. On { reaped: false } (the bounded poll
      // timed out with a member still present) RETAIN the pidfile so
      // run-job's settle backstop can retry reapGroup(brain.pgid) — never
      // delete a pidfile whose group is not yet verified empty. (reapGroup is
      // idempotent: an already-empty group is a harmless ESRCH probe and
      // returns { reaped: true } at once, so the clean path costs nothing.)
      //
      // ROW G2 MAKES THIS UNCONDITIONAL. It used to run inside `if (pidfile)`,
      // and `pidfile` is null on a tokenless manual run — so on a standalone
      // success the verdict was ABSENT, not merely discarded. The workspace walk
      // that follows must not run while a member of the brain's group can still
      // mutate the workspace, so the verdict is computed on EVERY run and
      // surfaced to the caller, which refuses fail-closed on anything but a
      // verified reap.
      const r = await reapGroupFn(child.pid, platform, seams);
      const reaped = !!(r && r.reaped === true);
      if (pidfile && reaped) {
        try {
          fs.rmSync(pidfile, { force: true }); // unlink only after the verified reap
        } catch {
          /* best-effort */
        }
      }
      // PLATFORM-SCOPED, and the scope is the repo's own (row G2).
      // `src/core/reap.js:25-33` states that the leaderless-reparented-member
      // guarantee is POSIX-only this release, and `:505-519` shows the win32
      // branch returning `{reaped:false}` whenever `taskkill` cannot reach an
      // already-exited leader — so a platform-blind fail-closed rule keyed on a
      // verified group reap would refuse NORMAL Windows runs, which is the
      // product not running. On win32 the precondition is satisfied instead by
      // the brain leader's verified exit (we only reach this point on a settled,
      // non-timeout leader) plus the tree-kill attempt above. The leaderless
      // member is NAMED, not solved: it is `WP-a10-windows-reap`'s subject.
      reap = platform === 'win32'
        ? {
            verified: true,
            why: 'win32: the brain leader exited and the tree-kill ran; the leaderless-member '
              + 'residual is WP-a10-windows-reap\'s subject',
          }
        : {
            verified: reaped,
            why: reaped
              ? 'the brain process group was verified empty'
              : 'the brain process group could not be verified empty',
          };
    }
  }

  return { sawUnknownCommand, reap };
}

/**
 * wienerdog dream [--dry-run] [--yes]
 * Exit 0 = success, "another dream running", or "nothing to dream".
 * Exit 1 = expected failure (WienerdogError): no vault, dirty tree, brain
 *          failure/timeout, git error.
 * @param {string[]} argv
 * @param {{skipContainmentProbe?:boolean, probeCmd?:string, now?:Date,
 *          platform?:NodeJS.Platform,
 *          reapTree?: typeof reapTree, reapGroup?: typeof reapGroup,
 *          writeFilePrivate?: typeof writeFilePrivate,
 *          pollDelayMs?: number}} [opts]
 *   TEST-ONLY (WP-155, same idiom as run-job's opts): reachable only by a JS
 *   caller — bin/wienerdog.js calls run(rest) with argv only, so production
 *   sees opts = {} and ALWAYS runs the probe against the WP-154 pinned claude.
 *   skipContainmentProbe: skip the pre-dream containment self-check (a fake
 *   brain cannot satisfy a live probe). probeCmd: forwarded to
 *   runContainmentProbe's opts.probeCmd DI seam. now: injected clock (replaces
 *   the deleted date env seam). platform + the reap/writeFilePrivate seams
 *   (WP-a10-reap-mechanism) inject the watchdog-reap primitives and the R10-1
 *   hand-up write-failure guard — never mock process.platform. No env var can
 *   do any of these.
 * @returns {Promise<void>}
 */
async function run(argv, opts = {}) {
  const dryRun = argv.includes('--dry-run');
  // THIS FILE'S git seam (CLAIM 2b) — not the run's only one; see `gitIn` and
  // row W1(c). JS-only: production passes no opts, so the pinned door always runs.
  const spawnGit = opts.spawnGit || spawnGitPinned;

  // 1. Resolve config + date.
  const paths = getPaths();

  // SINGLE ENTRY GATE (F9/F12/F13, ADR-0027): if ANY top-level protected dir
  // (core/state/logs/secrets) is a PRE-EXISTING symlink/non-dir, refuse BEFORE
  // any core-local writer — acquireLock, collectExtracts (rm+mkdir+write under
  // state/), cleanScratch, releaseLock, and the digest/ledger writes all live
  // under the mechanics root and would FOLLOW the symlink into the external tree.
  // Throw (→ non-zero exit, loud) writing NOTHING under it.
  if (mechanicsRootUntrusted(paths)) {
    throw new WienerdogError(
      `dream refused: the Wienerdog mechanics root under ${paths.core} has a symlink or non-directory at a ` +
        'top-level protected path (core/state/logs/secrets) — refusing to write anything under it. ' +
        'Investigate and remove it.'
    );
  }

  const cfg = readDreamConfig(paths.config); // throws WienerdogError when no vault
  const vaultDir = cfg.vault;
  const layout = readVaultLayout(paths.config);
  const date = resolveDate(opts.now);

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
    // file leaves quarantine. quarantineBannerLine exposes basenames + a
    // code-owned reason enum only (never content, never a full path), so no
    // untrusted bytes reach the injected digest (same rule as formatAlerts).
    // A3 hash gate (WP-116, ADR-0021): the dream NEVER seeds — it reads the
    // registry established at the last attended sync/approval and enforces, so
    // a nightly corruption fails closed against that baseline.
    const regenerateDigest = () => {
      fs.mkdirSync(paths.state, { recursive: true });
      const idReg = identityApprovals.readRegistry(paths.state);
      const quarantineLine = ledgerLib.quarantineBannerLine(ledger);
      const digest = renderDigest(vaultDir, layout, {
        alerts: unacknowledgedAlerts(paths, readAlerts(paths)),
        updateLine: renderUpdateLine(paths),
        identityApprovals: identityApprovals.approvalsMap(idReg),
        quarantineLine,
        // Cache-only (no probe, no spawn, no heal): without this the nightly
        // rewrite would wipe the scheduler callout sync wrote (ADR-0023 class).
        schedulerLine: require('../scheduler/status').renderSchedulerStatusLine(paths),
        secretQuarantine: listSecretQuarantine(paths.state), // EP4 pending-review banner (WP-125)
        // Insecure-modes awareness banner (WP-126, OWNER-APPROVED): the nightly
        // path only READS modes — repair is sync's attended job, never here.
        insecureModes: scanPrivateModes(paths).insecure,
      });
      const digestDest = path.join(paths.state, 'digest.md');
      writeFilePrivate(digestDest, digest); // atomic 0600 (audit A5, WP-126)
    };

    // The vault's durable record of what the dream could NOT see
    // (WP-quarantine-warnings-file, ADR-0023 Amendment 2). The digest banner is
    // news for a bounded window; this file is standing state, and the vault is
    // git-versioned, so every rewrite is itself the dated delta.
    //
    // A refresh failure NEVER fails the dream: the ledger still holds the
    // condition, `doctor` still reports the counts, the banner still raises it,
    // and the next refresh point re-reads and re-decides. A deliberate no-op
    // carries no reason and says nothing — only a real failure is narrated.
    /** @param {{written:boolean, reason?:string}} r */
    const reportWarningsRefresh = (r) => {
      if (r.reason) {
        console.log(
          `wienerdog: dream — could not update ${WARNINGS_REL} in your vault (${r.reason}); ` +
            'the skipped sessions are still recorded and this is retried on the next run.'
        );
      }
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
      // Refresh point 1 — the same moment the other ledger-derived durable
      // surface is refreshed, so the two cannot drift out of step. This is also
      // the point that serves the adopt-with-history first run, which returns
      // below without ever making a commit.
      reportWarningsRefresh(refreshWarnings({ vaultDir, ledger }));
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
      // Refresh point 3 — write-if-absent reconciliation, and the one refresh
      // point that is NOT a set-change point. A fully idle run reaches neither
      // of the others (point 1 needs a new quarantine; point 2 is past this
      // return), so without this an install whose quarantines are ALL
      // pre-existing — the upgrade shape — would never get the file at all.
      // Its own guard: this return comes BEFORE step 8's dry-run return, so a
      // preview run reaches it and must still write nothing.
      if (!dryRun) reportWarningsRefresh(refreshWarnings({ vaultDir, ledger }));
      return;
    }

    // 8. Dry-run → print the plan and stop (no brain). The settings profile is
    //    ensured here too (idempotent) so the echoed argv is the real argv.
    //    The preview names the WORKSPACE the real run writes (row G1, Table V
    //    row V8) — its PATH, composed exactly as `createWorkspace` composes it,
    //    without building it: a preview run must write nothing.
    const workspacePath = path.join(paths.state, WORKSPACE_DIRNAME);
    if (dryRun) {
      printPlan(sel, cfg, vaultDir, workspacePath, date, layout, ensureSettingsProfile(paths));
      return;
    }

    // 8b. PRE-DREAM CONTAINMENT SELF-CHECK (WP-135, ADR-0025 Amendment 2). Only
    //     reached when a real brain is about to spawn (past nothing-to-dream +
    //     dry-run + capacity-wedge) — never on a fast path (cost). Skippable
    //     ONLY via the JS-only opts seam (WP-155) — tests skip it because a
    //     fake brain cannot satisfy a live probe; production passes no opts, so
    //     no env var can disable this check. Unlike the managed-hook WARNING
    //     (WP-132, trusted admin), a broken/unproven hermetic runtime IS an
    //     attacker-reachable threat, so a fail OR inconclusive HALTS the dream
    //     fail-closed: no brain, no workspace, a durable alert (run-job's
    //     fail-loud records it on the scheduled path; the manual path prints it
    //     and exits 1).
    let containmentProbe = null;
    if (!opts.skipContainmentProbe) {
      containmentProbe = runContainmentProbe(paths, { model: cfg.model, env: process.env, probeCmd: opts.probeCmd });
      if (containmentProbe.outcome !== 'pass') {
        throw new WienerdogError(
          `dream halted: pre-dream containment self-check ${containmentProbe.outcome} on claude ` +
            `${containmentProbe.claudeVersion} — ${containmentProbe.reason}. The dream did not run; your ` +
            'memory was not touched. Re-run after updating/checking Claude.'
        );
      }
    }

    // 9. Baseline the scratch files while they are still pristine (before brain).
    const scratchBaseline = hashScratch(sel.wrote);

    // 10. ROW G1 — BUILD THE RUN'S WORKSPACE, BEFORE THE BRAIN IS SPAWNED.
    //     A private copy of the vault's readable content plus the CONSTRUCTED
    //     BASELINE: the exact bytes it just wrote, which is what "before" means
    //     for this run. Capture-before-spawn is a pipeline fact, not only a
    //     module fact, and this ordering is what makes it one.
    //
    //     `createWorkspace` THROWS rather than returning on a failed build, and
    //     removes whatever it had already built before it throws — so no exit
    //     path below can reach a partial tree, and none tries.
    //
    //     THE PRE-COMMIT IS GONE (row G6). It existed so the post-brain diff
    //     would be exactly the brain's writes; the brain writes nothing in the
    //     vault now, so there is no such diff and `promote()` reads `vault-now`
    //     from the filesystem. What remained was only its cost: committing the
    //     user's in-flight edits under the `wienerdog` identity without asking.
    const { workspaceDir, baseline } = createWorkspace({ vaultDir, paths, date, layout });
    /** true once the workspace must NOT be torn down (row G5's two exceptions) */
    let retainWorkspace = false;

    try {
      // 11. Run the brain under the watchdog, writing into the WORKSPACE.
      const logDir = path.join(paths.logs, 'dream');
      mkdirPrivate(logDir, { core: paths.core }); // 0700 log dir, umask-independent, symlink-refusing (WP-a9)
      // 0600 log stream, fail-closed — refuses a symlinked ancestor/leaf and
      // secures a pre-existing (legacy 0666) append target on the fd (WP-a9).
      const logStream = createLogStreamPrivate(path.join(logDir, `${date}.log`), { flags: 'a', core: paths.core });
      // A10 (ADR-0030): the per-run hand-up token, set by the run-job supervisor
      // in the child env before it spawned us. Strictly-shaped (16 hex chars —
      // exactly what run-job mints) so it can never smuggle a path segment into
      // the pidfile name; anything else is treated as absent (standalone run —
      // no hand-up pidfile, the inner watchdog reaps the brain directly).
      const rawToken = process.env.WIENERDOG_DREAM_RUN_TOKEN;
      const runToken = typeof rawToken === 'string' && /^[a-f0-9]{16}$/.test(rawToken) ? rawToken : null;
      /** @type {{sawUnknownCommand:boolean, reap:{verified:boolean, why:string}}} */
      let settle;
      try {
        settle = await runBrainWithWatchdog({
          workspaceDir,
          vaultDir,
          scratchDir: sel.scratchDir,
          date,
          model: cfg.model,
          layout,
          timeoutMs: cfg.timeoutMs,
          logStream,
          containmentProbe: containmentProbe
            ? { outcome: containmentProbe.outcome, claudeVersion: containmentProbe.claudeVersion }
            : null,
          paths,
          runToken,
          platform: opts.platform || process.platform,
          // JS-only seams (WP-155 idiom): reap primitives + the R10-1 hand-up
          // write guard; production passes no opts, so the real ones always run.
          seams: {
            reapTree: opts.reapTree,
            reapGroup: opts.reapGroup,
            writeFilePrivate: opts.writeFilePrivate,
            pollDelayMs: opts.pollDelayMs,
          },
        });
      } finally {
        logStream.end();
      }

      // 11b. ROW G2 — THE REAP PRECONDITION, fail-closed and platform-scoped.
      //      The walk below enumerates a tree the brain's process group could
      //      still be writing, so it does not run until that group is VERIFIABLY
      //      empty. An absent verdict is unverified, never success.
      //
      //      THIS REFUSAL DOES NOT TEAR DOWN (row G5): removing a tree a
      //      surviving process may still be writing is not a cleanup, and this
      //      is the one state in which that is distinguishable. The workspace it
      //      leaves behind is the residue-lifecycle successor's subject.
      if (!settle.reap.verified) {
        retainWorkspace = true;
        throw new WienerdogError(
          `dream refused: the brain's process group could not be verified empty (${settle.reap.why}), so ` +
            'this run will not read the workspace a surviving process could still be writing. Nothing was ' +
            'promoted, nothing was committed and the transcript ledger was not advanced (these sessions ' +
            `are retried next run). The run workspace was left in place at ${workspaceDir} for inspection.`
        );
      }

      // 12. STATE-ADVANCE SAFETY GATE (WP-069, now per-file) AND ROW G12's
      //     delete-and-RECORD half, which no other row inherits.
      //
      //     TWO HALVES, and they are not the same check. The FAIL-LOUD abort for
      //     a MISSING or CHANGED expected extract stays exactly as it was: if
      //     any expected extract vanished or changed (2026-07-07: a second dream
      //     deleted this run's live scratch, so the brain wrote only failure-doc
      //     notes on empty inputs), the brain consolidated NOTHING and the run
      //     fails loud with no ledger advance.
      //
      //     The ENUMERATE-DELETE-RECORD half is the retired validator's Step 1,
      //     and `scratchIntact` is NOT equivalent to it: measured, that function
      //     checks only that expected extracts still exist and byte-match, so an
      //     added `EVIL.json` passes it unchanged. An unexpected scratch write is
      //     a SANDBOX-POLICY BREACH; dropping the record would downgrade a
      //     security-visible event into routine teardown, and cleanup would
      //     delete the file with nothing left to show it existed.
      //
      //     It runs AFTER the verified reap and BEFORE promotion.
      if (!scratchIntact(sel.wrote, scratchBaseline)) {
        throw new WienerdogError(
          'dream aborted: the input extracts vanished or changed mid-run — no session ' +
            'was consolidated, so the watermark is not advanced (these sessions will be retried next run).'
        );
      }
      /** @type {Array<{path:string, reason:string}>} out-of-vault records (row G12) */
      const records = [];
      const expectedSet = new Set(sel.wrote.map((f) => path.resolve(f)));
      for (const file of listFilesRecursive(sel.scratchDir)) {
        const abs = path.resolve(file);
        if (expectedSet.has(abs)) continue;
        fs.rmSync(abs, { force: true });
        records.push({ path: abs, reason: 'brain wrote into the read-only scratch dir; deleted' });
      }

      // 13. ROW G1 — classify what the brain wrote, against the constructed
      //     baseline, with the GIT-FREE delta primitive.
      //
      //     M10's closure rests HERE (the dream writes `.gitignore` and blinds
      //     every gate): classification is a filesystem walk that never consults
      //     git, so an ignore file has nothing to blind. The mechanism is
      //     absent, not defeated — the closure rests on the git-free walk and on
      //     no repository-status property of the workspace.
      const delta = computeDelta(workspaceDir, baseline);

      // 14. ROW G3 — THE UNKNOWN-COMMAND NON-VACUITY GUARD, re-based.
      //     The marker alone is attacker-influenceable, so the abort has always
      //     needed corroboration that the brain did NO WORK. That corroboration
      //     is now the EMPTY WORKSPACE DELTA — never vault cleanliness, whose
      //     premise row G6 destroyed. A run that emitted the marker but DID
      //     write the workspace proceeds into promotion, exactly as today's
      //     guard let a writing run proceed into validation.
      if (settle.sawUnknownCommand && delta.records.length === 0) {
        throw new WienerdogError(
          'dream aborted: the brain did not run — Claude rejected the trigger prompt as an ' +
            'unknown slash command (no sessions were consolidated; nothing was committed and the ' +
            'transcript ledger was not advanced, so these sessions are retried next run). ' +
            'Update/repair Claude Code and re-run `wienerdog sync`.'
        );
      }

      // 15. ROW G7 + the promotion. The four gates are built here and INJECTED,
      //     so `promote()` carries no dependency on `validate.js`. The delta is
      //     computed by THIS pipeline and handed over rather than recomputed
      //     inside the module: the run needs that same result for the decision
      //     above, and computing it twice would let the two answers disagree.
      const registry = readRegistry(paths.state);
      const extractsBySession = new Map();
      for (const f of sel.wrote) {
        try {
          const ex = JSON.parse(fs.readFileSync(f, 'utf8'));
          if (ex && ex.harness && ex.session_id) extractsBySession.set(`${ex.harness}:${ex.session_id}`, ex);
        } catch { /* unreadable extract → its sessions won't verify → the ledger gate fails closed */ }
      }
      const gates = makeGates({ stateDir: paths.state });
      let res;
      try {
        res = promote({
          vaultDir, workspaceDir, date, baseline, delta, layout,
          gates, registry, extractsBySession, records,
          // JS-only test seam, forwarded rather than invented: `promote()` already
          // documents `writeFile` as the vault-write primitive's injection point.
          // The pipeline needs it because the report's SECOND write — the one whose
          // refusal produces the `promoted`-with-`published:false` arm — cannot be
          // made to fail from outside `promote()`: it targets a path the first
          // write just published, inside the same synchronous call. Production
          // passes no opts, so the real primitive always runs.
          ...(opts.writeFile ? { writeFile: opts.writeFile } : {}),
        });
      } catch (err) {
        // ROW G5's SECOND teardown exception, and it is the only-copy invariant
        // (`WP-dream-promote-module`, Table Q row Q4). Under promotion the
        // destruction risk moved from the vault to the WORKSPACE rather than
        // vanishing: when a note's redaction AND its withheld preservation both
        // failed, the workspace holds the sole surviving copy of what the brain
        // wrote, and removing it is the data loss the shipped abort exists to
        // refuse. The run fails loud with the tree intact.
        retainWorkspace = true;
        throw err;
      }
      // Retention, once per run and only after a completed redaction — the
      // point the gate's per-path loop used to be followed by.
      gates.pruneRedacted();

      // 16. ROW G8 — THE RUN'S ONE COMMIT: a NAMED set, each member carrying its
      //     CLASS's decided bytes, and nothing else.
      /** @type {Array<{rel:string, bytes:Buffer}>} */
      const members = [];
      for (const p of res.promoted) members.push({ rel: p.rel, bytes: p.bytes });
      for (const r of res.redacted) members.push({ rel: r.rel, bytes: r.bytes });
      // THE REPORT PATH ON BOTH FORMS OF `accounting` (round 4's A1). When
      // `report.outcome` is `promoted` with `accounting.published === false`,
      // THIS RUN PUBLISHED THE BODY and the enforcement section never reached
      // the vault. Skipping the path there would drop a published, gated file
      // out of the run's one commit; manufacturing the missing section would
      // commit bytes no gate judged and no primitive published. What is
      // committed is that arm's `bytes` — the bytes THIS RUN PUBLISHED for that
      // path — never `report.record` and never a fresh read.
      if (res.report.outcome === 'promoted' || res.report.outcome === 'fallback') {
        members.push({ rel: res.report.rel, bytes: res.report.bytes });
      }
      const reportRels = new Set(
        res.report.outcome === 'refused' ? [] : [res.report.rel]
      );

      // ROW G8's THIRD CLAUSE — reconcile the CODE-OWNED vault warnings file, BY
      // CONTENT, never by authorship. `WP-quarantine-warnings-file` writes it at
      // refresh points this commit does not cover (point 2 runs AFTER this
      // commit; point 3 runs on an idle run that makes no commit at all), and it
      // relied on the NEXT run's pre-commit of the user's edits to sweep it in —
      // the call row G6 removes. An authorship test ("did this run write it?") would
      // strand it forever, because on the next run the file is already correct
      // on disk so nothing rewrites it.
      //
      // The render takes the pinned LEDGER and nothing else — no carried
      // snapshot, no date, and NEVER the file on disk. So a stray user edit
      // anywhere in the file is never committed: the commit carries the
      // canonical render and writes nothing to disk, and the user's edit
      // survives as an uncommitted working-tree modification.
      const warningsRender = composeWarnings(ledger);
      const headWarnings = gitIn(spawnGit, vaultDir, ['show', `HEAD:${WARNINGS_REL}`], { allowFail: true });
      if (headWarnings.status === 0) {
        // Present at HEAD: include iff the canonical render differs. Equal ⇒
        // omit, so an unchanged quarantine set produces no churn commit.
        if (!Buffer.from(String(headWarnings.stdout), 'utf8').equals(warningsRender)) {
          members.push({ rel: WARNINGS_REL, bytes: warningsRender });
        }
      } else if (ledgerLib.activeQuarantines(ledger).length > 0) {
        // Absent at HEAD: the same is true PROVIDED the ledger holds at least
        // one active quarantine. A vault that has never had one gets no file —
        // an empty ledger renders NON-EMPTY bytes, which differ from an absent
        // file, so without this guard the comparison would order the very churn
        // commit it forbids.
        members.push({ rel: WARNINGS_REL, bytes: warningsRender });
      }

      // THE COUNTS, whose semantics are exact and INHERITED, not re-derived
      // (row G11, Table V row V7): one per added-or-modified member, skills for
      // ANY path under the skills directory — not only `SKILL.md` — notes for
      // anything outside the skills and reports directories, and the report
      // counted in neither. `reports/warnings.md` is counted in neither either:
      // it sits outside both directories, so the rule as stated would count this
      // run's reconciliation of it as a user note.
      let notes = 0;
      let skills = 0;
      for (const m of members) {
        if (m.rel.startsWith(layout.skills_dir + '/')) skills += 1;
        else if (m.rel.startsWith(layout.reports_dir + '/')) continue;
        else if (m.rel === WARNINGS_REL) continue; // code-owned, layout-independent: not a note
        else notes += 1;
      }
      const sha = members.length === 0
        ? null
        : commitNamedSet({
            vaultDir,
            stateDir: paths.state,
            members,
            message: `dream: ${date} — ${notes} notes, ${skills} skills`,
            spawnGit,
          });

      // 17. ROW G10 — the skill-ownership registry, a durable POST-COMMIT side
      //     effect. The shipped contract requires an entry for every new
      //     dream-created skill the orchestrator accepts and commits, and a
      //     skill that is committed but UNREGISTERED is not dream-owned, so
      //     every later autonomous revision of it fails closed.
      //
      //     Three things the inversion changes, each a consequence rather than a
      //     port: "NEW" can no longer be `change.untracked` — a git INDEX fact,
      //     the class of evidence whose absence made this family's predecessor
      //     Superseded — so newness comes from the run's DELTA status `added`
      //     for a path the promotion outcome shows PUBLISHED, ordinary or
      //     redacted alike; `id` and `created` are derived from the DECIDED
      //     BYTES, never by re-reading the vault path; and the call still runs
      //     only after the commit succeeds.
      if (sha) {
        const addedRels = new Set(
          delta.records.filter((r) => r.status === 'added').map((r) => r.rel)
        );
        /** @type {Array<{rel:string, created:string, id:string}>} */
        const newSkills = [];
        for (const m of [...res.promoted, ...res.redacted]) {
          if (!addedRels.has(m.rel) || !isNewSkillDraft(m.rel, layout)) continue;
          const fm = parseFrontmatter(m.bytes.toString('utf8'));
          newSkills.push({ rel: m.rel, id: String(fm.id || ''), created: String(fm.created || date) });
        }
        if (newSkills.length > 0) recordSkills(paths.state, newSkills);
      }

      // 18. ROW G4 — the transcript advance, from the TYPED EP2 disposition.
      //     ONLY `withheld` defers: a transcript whose only note was WITHHELD is
      //     NOT marked processed, so it regenerates next run rather than being
      //     silently lost. A REDACTED note does NOT defer — the sanitized note
      //     WAS promoted, so its transcript was consumed, and regenerating it
      //     would re-do consumed work and mint a second quarantine artifact.
      //     `redactions` is accounting and reporting, never a deferral trigger.
      //     A refusal for a NON-secret reason (allowlist, conflict) advances the
      //     transcript normally. The typed field is read; a human-readable
      //     refusal reason is never parsed — that would be an undocumented
      //     security interface. Fail closed on the counter: anything that is not
      //     a non-negative safe integer counts as "this run withheld".
      const withheld = res.secretDisposition && res.secretDisposition.withheld;
      const withheldKnown = Number.isSafeInteger(withheld) && withheld >= 0;
      const cleanRun = withheldKnown && withheld === 0;
      let deferredCount = 0;
      let quarantinedCount = 0;
      for (const d of sel.processed) {
        if (cleanRun) {
          ledger = ledgerLib.recordProcessed(ledger, d);
          continue;
        }
        const prior = ledgerLib.secretDeferralCount(ledger, d);
        if (prior >= ledgerLib.SECRET_REVERT_MAX_DEFERRALS) {
          ledger = ledgerLib.recordSecretExhausted(ledger, d);
          quarantinedCount += 1;
        } else {
          ledger = ledgerLib.recordSecretDeferred(ledger, d, prior + 1);
          deferredCount += 1;
        }
      }
      ledgerLib.writeLedger(paths.state, ledger);
      // Counts only — no basenames, no paths, no content, no matched value.
      if (!cleanRun) {
        console.log(
          ledgerLib.secretRevertSummaryLine({
            withheld: withheldKnown ? withheld : 0,
            deferred: deferredCount,
            quarantined: quarantinedCount,
          })
        );
      }

      // 19. Regenerate the injected session digest (atomic temp + rename),
      //     including the durable quarantine banner from the current ledger.
      //     THE ORDER IS THE CONTENT (row G4, Table V row V10): `state/digest.md`
      //     is the next session's context, so regenerating it BEFORE the ledger
      //     is persisted would show that session a state this run has already
      //     changed.
      regenerateDigest();
      // Refresh point 2 — the only point at which a quarantine that LEFT the set,
      // or a secret-exhausted one that ENTERED it in step 18, is knowable. It is
      // after the commit, so such a change rides the NEXT run's commit, which
      // row G8's render-versus-HEAD reconciliation is what makes work.
      reportWarningsRefresh(refreshWarnings({ vaultDir, ledger }));

      // 20. ROW G11 — EVERY RECORD THIS RUN PRODUCED REACHES THE USER.
      //     Returning is not delivering, and this is the delivery.
      //
      //     (i) THE REFUSED REPORT ARM. When `promote()` returns
      //     `report.outcome === 'refused'`, `report.record` holds the COMPLETE
      //     enforcement record and the vault holds none of it: the vault object
      //     is left untouched and the record travels through this run's log and
      //     output instead. Nothing is staged or committed on that arm — there
      //     are no bytes to commit.
      //
      //     (i-b) THE PARTIALLY PUBLISHED REPORT ARM. When `outcome` is
      //     `promoted` and `accounting.published` is false, THIS RUN PUBLISHED
      //     THE BODY, the enforcement SECTION never reached the vault, and
      //     `record` again holds the COMPLETE record — the redaction line and
      //     every preserved-copy line the refused section would have carried
      //     included. It differs from (i) in ONE respect and stating it is the
      //     point: here something IS committed, the report path from that arm's
      //     `bytes`, so (i)'s "nothing is committed" is (i)'s clause alone. What
      //     the target HOLDS at the end of such a run is refusal-cause-specific
      //     and nothing here says anything about it.
      const undelivered =
        res.report.outcome === 'refused' ||
        (res.report.outcome === 'promoted' && res.report.accounting && res.report.accounting.published === false);
      if (undelivered) {
        console.log(
          res.report.outcome === 'refused'
            ? `wienerdog: dream — the report could not be written to your vault (${neutralise(res.report.reason)}); ` +
                'the complete record of this run follows and is not stored anywhere else.'
            : 'wienerdog: dream — the report body was published, but its enforcement section was NOT ' +
                `(${neutralise(res.report.accounting.reason)}); the complete record of this run follows.`
        );
        for (const line of res.report.record) console.log(`  ${line}`);
      }
      // (ii) the out-of-vault records from row G12 reach the SAME channel. They
      //      also travel to the durable dream report through `promote()`'s
      //      `records` input: two channels, deliberately, because a log line is
      //      not a durable record and a sandbox-policy breach that survives only
      //      in transient output is the observability loss row G12 prevents.
      for (const r of records) console.log(`wienerdog: dream — out-of-vault: ${neutralise(r.path)} — ${r.reason}`);

      // 21. Summary. (iii) the note and skill COUNTS, and the refusal count.
      //     (iv) the path list the retired validator returned as `committed[]`
      //     is DROPPED, and dropped explicitly rather than by omission: it had
      //     no production consumer, and promotion's own `promoted[]` carries the
      //     same information at the point it is decided.
      const shaShort = sha ? sha.slice(0, 7) : '(none)';
      console.log(
        `wienerdog: dream committed ${shaShort} — ${notes} notes, ${skills} skills; ` +
          `${res.refused.length} refused, ${records.length} out-of-vault.`
      );
    } finally {
      // 22. ROW G5 — TEARDOWN, on every exit path: success, refusal, brain
      //     failure, timeout. With the two NAMED exceptions above, which are the
      //     two states in which the workspace may hold something no other place
      //     does. Teardown never touches the vault.
      if (!retainWorkspace) destroyWorkspace(workspaceDir);
    }
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

module.exports = {
  run,
  // Exported for the deliverable test file: row G12's enumerate half must return
  // every NON-DIRECTORY entry, and a test that could only reach it through a
  // whole dream run could not distinguish "the symlink was enumerated" from "the
  // symlink was never created in time". It regressed once, unseen, exactly there.
  __listFilesRecursive: listFilesRecursive,
};
