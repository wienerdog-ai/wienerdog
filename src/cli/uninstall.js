'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getPaths } = require('../core/paths');
const manifestLib = require('../core/manifest');
const { WienerdogError } = require('../core/errors');
const { confirm } = require('../core/prompt');
const { realSchedulerAuthority } = require('../scheduler/spawn');

/** @param {string} p @returns {boolean} */
function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * @typedef {{status:'clean'|'live', identifiers:string[]}} SchedulerProbeResult
 *   'clean' — the client was invoked, exited successfully, and reported no
 *             Wienerdog identifier; `identifiers` is empty.
 *   'live'  — it reported at least one; `identifiers` lists them.
 *   There is no third success value: NOT-PROBEABLE is signalled by THROWING.
 * @typedef {() => SchedulerProbeResult} SchedulerProbe
 *   The live-domain probe (Table U step 2). SYNCHRONOUS by contract — a returned
 *   promise is malformed, not awaited.
 */

/** How Wienerdog names its own registrations in each scheduler domain. The
 *  clearance probe enumerates OUR OWN good and nothing else, and the shapes are
 *  NOT interchangeable across platforms — hence one per domain rather than one
 *  list matched everywhere. */
const LAUNCHD_LABEL_PREFIX = 'ai.wienerdog.'; // generators.launchdLabel
const SYSTEMD_UNIT_PREFIX = 'wienerdog-'; //     generators.systemdUnitBase

/** The Task Scheduler FOLDER namespace Wienerdog registers under, DERIVED from
 *  the generator that writes those registrations rather than restated here:
 *  `windowsTaskName('dream')` is `\Wienerdog\dream`, so a task's identifier does
 *  NOT carry either POSIX prefix above and a probe matching only those would
 *  report a live Windows install as CLEAN. Deriving it means the probe cannot
 *  drift from what registration actually produces. Required lazily and only on
 *  win32: `src/scheduler/generators.js` requires nothing under `src/cli/`, so
 *  there is no cycle (measured), but there is also no reason to load it
 *  elsewhere. @returns {string} e.g. '\\Wienerdog\\' */
function windowsTaskNamespace() {
  const { windowsTaskName } = require('../scheduler/generators');
  return windowsTaskName('probe').slice(0, -'probe'.length);
}

/**
 * The live Wienerdog identifiers in a scheduler client's raw stdout, for
 * `platform`. PURE — no I/O — so each domain's output format is testable on any
 * host. Whitespace tokenization is what the three formats have in common: an
 * identifier is never split by it (launchd `print` prints the label as its own
 * column, systemd `list-units` the unit name, and `schtasks /query /fo LIST` the
 * task path after `TaskName:`), and our own names cannot contain whitespace
 * (`windowsTaskName` and the job-name charset are both `[a-z0-9-]`).
 *
 * Matching is FIXED-STRING and per-domain: launchd labels and systemd unit names
 * are case-sensitive and matched exactly, while Windows task paths are
 * case-INSENSITIVE, so the win32 arm folds case. A folder header line (`Folder:
 * \Wienerdog`) deliberately does NOT match — the namespace includes its trailing
 * separator, so an empty folder is not read as a live registration.
 * @param {string} out @param {NodeJS.Platform} platform @returns {string[]}
 */
function ownIdentifiersIn(out, platform) {
  const ns = platform === 'win32' ? windowsTaskNamespace().toLowerCase() : null;
  const hit = (t) => {
    if (platform === 'darwin') return t.includes(LAUNCHD_LABEL_PREFIX);
    if (platform === 'linux') return t.includes(SYSTEMD_UNIT_PREFIX);
    if (platform === 'win32') return t.toLowerCase().includes(ns);
    return false;
  };
  /** @type {string[]} */ const identifiers = [];
  for (const token of String(out).split(/\s+/)) {
    if (token === '' || !hit(token)) continue;
    if (!identifiers.includes(token)) identifiers.push(token);
  }
  return identifiers;
}

/** @param {string} p @returns {boolean} */
function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The read-only enumeration command for this platform's live per-user scheduler
 *  domain. The client is named by ABSOLUTE PATH by contract: a bare-name lookup
 *  could resolve through a shimmed PATH and make the probe observe test
 *  machinery instead of the OS. Throws (→ NOT-PROBEABLE) when no client is
 *  available or the platform has no supported query.
 *  @returns {{client:string, argv:string[]}} */
function probeCommand() {
  if (process.platform === 'darwin') {
    const client = '/bin/launchctl';
    if (!isExecutable(client)) throw new Error(`launchctl client absent at ${client}`);
    const uid = typeof process.getuid === 'function' ? process.getuid() : '';
    return { client, argv: ['print', `gui/${uid}`] };
  }
  if (process.platform === 'linux') {
    const candidates = ['/usr/bin/systemctl', '/bin/systemctl'];
    const client = candidates.find(isExecutable);
    if (!client) throw new Error(`systemctl client absent at ${candidates.join(' or ')}`);
    return { client, argv: ['--user', 'list-units', '--all', '--no-legend'] };
  }
  if (process.platform === 'win32') {
    const client = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'schtasks.exe');
    if (!isExecutable(client)) throw new Error(`schtasks client absent at ${client}`);
    return { client, argv: ['/query', '/fo', 'LIST'] };
  }
  throw new Error(`no supported scheduler query on ${process.platform}`);
}

/**
 * The default `SchedulerProbe` (Table U step 2): a READ-ONLY query of this OS
 * user's live scheduler domain for Wienerdog's OWN identifiers. It never mutates
 * anything and deliberately does NOT route through `schedulerSpawn` — that is the
 * MUTATION chokepoint, and a read must not enter it. It also never reads
 * WIENERDOG_TEST_NO_REAL_SCHEDULER or WIENERDOG_LOADER_NOOP as evidence that the
 * domain is clean: those variables suppress mutations, and treating either as
 * CLEAN would let a test variable silence a product safety gate in exactly the
 * configuration that needs it.
 * Throws on an unanswerable domain — the caller reads that as NOT-PROBEABLE and
 * fails closed.
 * @type {SchedulerProbe}
 * @returns {SchedulerProbeResult}
 */
function defaultSchedulerProbe() {
  const { client, argv } = probeCommand();
  const r = spawnSync(client, argv, { encoding: 'utf8' });
  if (r.error) throw new Error(`${client} could not be run (${r.error.message})`);
  if (r.status !== 0) {
    throw new Error(`${client} exited ${r.status === null ? 'on a signal' : r.status}`);
  }
  const identifiers = ownIdentifiersIn(
    typeof r.stdout === 'string' ? r.stdout : '',
    process.platform
  );
  return identifiers.length > 0
    ? { status: 'live', identifiers }
    : { status: 'clean', identifiers: [] };
}

/** True only for the ONE shape that grants clearance: a coherent CLEAN result.
 *  `status` alone can never grant it — a result that says "nothing is live" while
 *  listing something live is internally contradictory, and the reading that must
 *  never win is the permissive one. @param {any} v @returns {boolean} */
function isCoherentClean(v) {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof v.then !== 'function' &&
    v.status === 'clean' &&
    Array.isArray(v.identifiers) &&
    v.identifiers.length === 0
  );
}

/** True when the result aborts as LIVE. Aborting requires only `status`: in the
 *  aborting direction the payload cannot soften the verdict.
 *  @param {any} v @returns {boolean} */
function isLive(v) {
  return v !== null && typeof v === 'object' && typeof v.then !== 'function' && v.status === 'live';
}

/**
 * DELETION CLEARANCE (Table U, ADR-0041 Decision 2). Called after the confirm and
 * immediately before the first deletion; returns silently when the deletion is
 * cleared and throws a WienerdogError otherwise, having deleted nothing.
 *
 * Clearance is WEAKER than scheduler authority and is granted by either:
 *   1. scheduler authority (Table B) — no probe, no domain contact at all; or
 *   2. a read-only probe that positively answered CLEAN — an install with no live
 *      Wienerdog identifier has nothing to orphan.
 * Everything else — a live identifier, a throw, a thenable, a malformed or
 * self-contradictory result — fails CLOSED, because a wrong abort costs one
 * command while a wrong proceed silently orphans a job that keeps firing with the
 * records that could have stopped it already deleted.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{probe?: SchedulerProbe}} opts
 * @returns {void}
 */
function requireDeletionClearance(paths, opts) {
  if (realSchedulerAuthority().ok) return; // step 1 — no probe
  const injected = typeof opts.probe === 'function' ? opts.probe : null;
  if (!injected && process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER) {
    // Deterministic on every machine, clean or not: a test reached this gate with
    // neither channel (Table T), so it fails here rather than on the host's luck.
    throw new WienerdogError(
      'a test reached the uninstall scheduler gate without injecting a probe or granting ' +
        'authority — pass opts.probe to run(), or set WIENERDOG_ALLOW_REAL_SCHEDULER=1 on ' +
        'the subprocess env.'
    );
  }
  const tail =
    `This run's core is ${paths.core}. Nothing was deleted. ` +
    'Set WIENERDOG_ALLOW_REAL_SCHEDULER=1 to uninstall anyway.';
  let result;
  try {
    result = (injected || defaultSchedulerProbe)(); // step 2
  } catch (e) {
    throw new WienerdogError(
      'refusing to uninstall: this computer\'s live scheduler domain could not be queried, so ' +
        `a scheduled Wienerdog job may still be registered (${(e && e.message) || String(e)}). ${tail}`
    );
  }
  if (isCoherentClean(result)) return; // step 3 — clearance granted
  if (isLive(result)) {
    const named =
      Array.isArray(result.identifiers) && result.identifiers.length > 0
        ? result.identifiers.join(', ')
        : 'the identifiers were not reported';
    throw new WienerdogError(
      `refusing to uninstall: this computer's scheduler still holds a live Wienerdog ` +
        `registration (${named}), and without scheduler authority the unload would be skipped ` +
        `while its records were deleted — leaving a job that keeps firing. ${tail}`
    );
  }
  throw new WienerdogError(
    'refusing to uninstall: the live-scheduler check returned an unusable answer, so a ' +
      `scheduled Wienerdog job may still be registered. ${tail}`
  );
}

/** Read the configured vault path from config.yaml, or null. `[ \t]*` (not
 *  `\s*`) so a bare `vault:` line cannot let the match run onto the next line.
 *  @param {string} configPath @returns {string|null} */
function readVaultPath(configPath) {
  try {
    const m = fs.readFileSync(configPath, 'utf8').match(/^vault:[ \t]*(.*)$/m);
    const v = m && m[1].trim();
    return v && v !== 'null' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Remove everything Wienerdog created by replaying the install manifest in
 * reverse. Never touches anything not in the manifest. --dry-run prints the
 * plan and stops; --yes skips confirmation. Exits 0 even if some entries were
 * already gone (reported as skipped).
 * @param {string[]} argv
 * @param {{probe?: SchedulerProbe}} [opts]
 *   `opts.probe` is the live-domain probe seam (Table U step 2). TEST-ONLY: no
 *   production caller passes it (bin/wienerdog.js calls `run(rest)`).
 */
async function run(argv, opts = {}) {
  const dryRun = argv.includes('--dry-run');
  const yes = argv.includes('--yes');
  const paths = getPaths();

  if (!fileExists(paths.manifest)) {
    throw new WienerdogError(
      `no install manifest found at ${paths.manifest} — nothing to uninstall`
    );
  }

  // The exact bytes the plan below is rendered from. Read BEFORE the parse, so a
  // write racing the load can only make the post-confirm compare FAIL — the
  // direction that stops a deletion (Table U, consent integrity).
  let disclosedBytes;
  try {
    disclosedBytes = fs.readFileSync(paths.manifest);
  } catch {
    throw new WienerdogError(`install manifest is corrupted (${paths.manifest})`);
  }

  let manifest;
  try {
    manifest = manifestLib.load(paths);
  } catch {
    throw new WienerdogError(`install manifest is corrupted (${paths.manifest})`);
  }

  // Capture the vault path BEFORE reverse removes config.yaml (for the summary).
  const vaultPath = readVaultPath(paths.config) || paths.vault;

  console.log('wienerdog uninstall — the following will be removed:\n');
  for (const entry of manifest.entries) console.log(`  [${entry.kind}] ${entry.path}`);

  if (dryRun) {
    const { removed, skipped, preserved, deferredConfig } = manifestLib.reverse(paths, manifest, {
      dryRun: true,
    });
    const { removed: mech, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
      dryRun: true,
      vaultPath,
    });
    // The unmodified config moved out of reverse()'s `removed` into deferredConfig
    // (uninstall.js deletes it live), so include it in the headline "would be
    // removed" count — otherwise it is silently dropped from the plan. The
    // mechanics dirs and the core stay separate disclosure lines (ADR-0019), so
    // this headline is NOT claimed to equal the live `Removed N` total.
    const headline = removed.length + (deferredConfig ? 1 : 0);
    console.log(`\n--dry-run: ${headline} item(s) would be removed, ${skipped.length} skipped.`);
    if (preserved.length > 0) {
      const vaultFiles = manifest.entries.filter((e) => e.kind === 'vault-file').length;
      if (skippedForVault.length > 0) {
        console.log(`\nYour memory vault at ${vaultPath} would be left untouched (${vaultFiles} files) — your notes are yours. Note: it sits inside Wienerdog's own folder (${skippedForVault[0]}), which would therefore be left in place — consider moving it somewhere of your own.`);
      } else {
        console.log(`\nYour memory vault at ${vaultPath} would be left untouched (${vaultFiles} files) — your notes are yours.`);
      }
    }
    if (mech.length > 0) {
      console.log('\nMachine-generated state (removed recursively, not manifest-tracked):');
      for (const d of mech) console.log(`  ${d}`);
    }
    console.log(`  ${paths.core}  (the canonical core — removed once empty)`);
    return;
  }

  if (!yes) {
    // A8 (WP-145): show the DERIVED plan — every command, path, and effect —
    // BEFORE asking for consent. Same enumeration --dry-run prints; reverse()
    // itself emits each re-derived `would run: …` unregister command (ADR-0027:
    // commands are code-derived, never manifest-stored argv). This is
    // disclosure, not a gate — --yes skips only the prompt, the set of valid
    // actions is identical either way.
    console.log('\nPlanned actions:');
    const plan = manifestLib.reverse(paths, manifest, { dryRun: true });
    const mechPlan = manifestLib.disposeCoreMechanics(paths, { dryRun: true, vaultPath });
    for (const p of plan.removed) console.log(`  remove ${p}`);
    if (plan.deferredConfig) console.log(`  remove ${plan.deferredConfig} (unmodified config — deleted last)`);
    for (const d of mechPlan.removed) console.log(`  remove ${d} (machine-generated state, recursive)`);
    console.log(`  remove ${paths.core} (the canonical core — removed once empty)`);
    const ok = await confirm('\nProceed with removal? [y/N] ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  // ── Table U (ADR-0041), in this order: consent integrity, then clearance, then
  //    deletion. Three separate concerns, deliberately not merged.
  //
  // 1. Reload + byte-compare. The user consented to a specific disclosed list; a
  //    concurrent `sync` or a hand edit during the prompt could otherwise add
  //    entries that reverse() then deletes UNDISCLOSED. Byte-exact on the raw file
  //    (no field-by-field diff: any concurrent write at all should stop the run,
  //    and a byte compare has no equality semantics to get subtly wrong). A
  //    missing/unreadable manifest here ABORTS — manifestLib.load's
  //    ENOENT-to-empty fallback must NOT be reached, or the sweep below would run
  //    having replayed no scheduler entry at all. This is a CONSENT check, never a
  //    safety one: it can only ever stop a deletion (ADR-0038's permitted
  //    direction), and clearance still comes from authority or the live probe.
  let currentBytes = null;
  try {
    currentBytes = fs.readFileSync(paths.manifest);
  } catch {
    currentBytes = null;
  }
  if (currentBytes === null || !currentBytes.equals(disclosedBytes)) {
    throw new WienerdogError(
      `the install changed while you were deciding (${paths.manifest} is no longer the one ` +
        'that was listed above), so nothing was removed — run `wienerdog uninstall` again to ' +
        'see the current plan.'
    );
  }
  // 2. Deletion clearance, decided immediately before the first deletion so the
  //    evidence cannot go stale across an open prompt.
  requireDeletionClearance(paths, opts);
  // 3. reverse() acts on the ACCEPTED SNAPSHOT — the same parsed manifest the plan
  //    was disclosed from, with the pre-confirm vaultPath: no input to the
  //    deletion is newer than the consent.
  const { removed, skipped, preserved, deferredConfig, deferredConfigHash } = manifestLib.reverse(
    paths,
    manifest,
    { dryRun: false }
  );
  // First sweep: removes state/logs/schedules/secrets, protecting a nested vault
  // via vaultPath (read from the STILL-PRESENT config.yaml at line 57). The core
  // is NOT removed yet — the manifest + config.yaml still sit in it, so its
  // emptiness check fails (correct). The recovery ledger has survived every
  // crash-prone step above.
  const { removed: mech, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
    dryRun: false,
    vaultPath,
  });
  // Delete the deferred set LAST — MANIFEST FIRST, then config.yaml. Every
  // crash-prone step above has completed. Manifest-before-config is load-bearing:
  // a retry proceeds only while the manifest exists, and a retry that reaches a
  // sweep needs config.yaml for the nested-vault path, so config.yaml must exist
  // at every point the manifest still does ("manifest-present ⟹ config-present").
  // The manifest delete must be CONFIRMED before config is touched. The
  // confirmation is rmSync's OWN outcome: `{force:true}` does NOT throw on ENOENT
  // (already-gone = success) but DOES throw on a real failure (EACCES/EPERM/IO).
  // So "rmSync returned without throwing" proves the manifest is gone — no
  // post-hoc existence check (which fs.existsSync makes ambiguous: it returns
  // false on a LOOKUP error too, which would reopen the P1 nested-vault window).
  try {
    fs.rmSync(paths.manifest, { force: true });
  } catch (e) {
    // Real deletion failure, manifest still present → ABORT before touching
    // config, leaving BOTH files present so every retry stays vault-safe.
    throw new WienerdogError(
      `could not remove the install manifest (${e?.code || 'unknown error'}) — uninstall partially completed; ` +
        `left config.yaml and ${paths.core} in place so a retry stays safe. ` +
        `Fix the permission/IO issue, then re-run: npx wienerdog@latest uninstall`
    );
  }
  // rmSync returned without throwing ⇒ the manifest is gone (or was already
  // absent). The retry gate is now closed → only now is it safe to delete an
  // unmodified config.
  let configDeleted = false;
  if (deferredConfig) {
    // Prove-before-delete AT THE DELETE SITE: config was proven unmodified back in
    // reverse(), but it is deleted here, AFTER the (potentially slow, recursive)
    // mechanics sweep. If the user EDITED config.yaml during that window it is now
    // customized — deleting it would destroy their edit (a TOCTOU the deferral
    // opened). Re-verify the carried-forward hash; delete only if it STILL matches,
    // else PRESERVE with a keep-notice. A missing/unreadable file also aborts the
    // delete (nothing to prove → keep).
    let currentHash = null;
    try {
      currentHash = manifestLib.sha256File(deferredConfig);
    } catch {
      currentHash = null;
    }
    if (currentHash !== null && currentHash === deferredConfigHash) {
      try {
        fs.rmSync(deferredConfig, { force: true });
        configDeleted = true;
      } catch {
        /* best-effort */
      }
    } else {
      process.stderr.write(`wienerdog: keeping ${deferredConfig} — modified since install\n`);
    }
  }
  // Second sweep: mechanics are already gone (idempotent); with the manifest +
  // unmodified config deleted the core is now empty, so this removes it
  // (symlink-aware, vault-aware). A kept CUSTOMIZED config leaves the core
  // non-empty → core preserved (unchanged).
  const { removed: coreSwept } = manifestLib.disposeCoreMechanics(paths, {
    dryRun: false,
    vaultPath,
  });
  console.log(
    `\nRemoved ${removed.length + mech.length + coreSwept.length + (configDeleted ? 1 : 0)} item(s).`
  );
  if (preserved.length > 0) {
    const vaultFiles = manifest.entries.filter((e) => e.kind === 'vault-file').length;
    if (skippedForVault.length > 0) {
      // The vault was found INSIDE a mechanics dir (legacy/hand-edited install):
      // the dir was left in place to protect it — say so, never the plain
      // reassurance alone (a false "left untouched" is as bad as the deletion).
      console.log(`\nYour memory vault at ${vaultPath} was left untouched (${vaultFiles} files) — your notes are yours. Note: it sits inside Wienerdog's own folder (${skippedForVault[0]}), which was therefore left in place — consider moving it somewhere of your own.`);
    } else {
      console.log(`\nYour memory vault at ${vaultPath} was left untouched (${vaultFiles} files) — your notes are yours.`);
    }
  }
  // reverse() now defers core/state removal to disposeCoreMechanics, so its
  // `skipped` array carries <core> and <core>/state — items the sweep above has
  // since removed. Report as "skipped" only what genuinely REMAINS on disk after
  // the whole uninstall, so the summary never contradicts "fully removed" below.
  // A kept customized config.yaml or a preserved skill still exists → still shown.
  const skippedShown = skipped.filter((s) => fs.existsSync(s));
  if (skippedShown.length > 0) {
    console.log(`Skipped ${skippedShown.length} item(s) (a customized config or other file kept in place):`);
    for (const s of skippedShown) console.log(`  ${s}`);
  }
  if (!fs.existsSync(paths.core)) {
    console.log(`\nWienerdog is fully removed — the canonical core (${paths.core}) is gone.`);
  } else if (skippedForVault.length > 0) {
    console.log(`\nKept ${paths.core} (your memory vault still lives inside it).`);
  } else {
    console.log(`\nKept ${paths.core} (a customized config.yaml remains).`);
  }
}

// `ownIdentifiersIn` is exported for its own unit tests only: it is pure, and the
// three scheduler output formats it parses cannot otherwise be exercised off
// their native platform. It is not a seam into the gate — `run` remains the only
// entry point, still reached from exactly one production require.
module.exports = { run, ownIdentifiersIn };
