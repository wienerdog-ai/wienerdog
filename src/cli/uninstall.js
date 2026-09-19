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
 * Matching is FIXED-STRING, per-domain, and anchored at the identifier's
 * BOUNDARY: a token must START WITH the namespace, never merely contain it.
 * Containment would make a foreign registration that happens to embed our name
 * — `com.vendor.ai.wienerdog.helper`, `not-wienerdog-related`,
 * `\Vendor\Wienerdog\task` — report as ours, and an innocent uninstall would be
 * blocked by somebody else's job. This probe enumerates Wienerdog's OWN
 * identifiers and nothing else; erring toward LIVE is the fail-closed direction
 * but it is still the wrong answer.
 *
 * Case follows each domain: launchd labels and systemd unit names are
 * case-sensitive and compared exactly, while Windows task paths are
 * case-INSENSITIVE, so the win32 arm folds case. A folder header line (`Folder:
 * \Wienerdog`) deliberately does NOT match — the namespace carries its trailing
 * separator, so an empty folder is not read as a live registration.
 * @param {string} out @param {NodeJS.Platform} platform @returns {string[]}
 */
function ownIdentifiersIn(out, platform) {
  const ns = platform === 'win32' ? windowsTaskNamespace().toLowerCase() : null;
  const hit = (t) => {
    if (platform === 'darwin') return t.startsWith(LAUNCHD_LABEL_PREFIX);
    if (platform === 'linux') return t.startsWith(SYSTEMD_UNIT_PREFIX);
    if (platform === 'win32') return t.toLowerCase().startsWith(ns);
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

/** The `identifiers` payload's contract shape: an array of strings. Both arms of
 *  the verdict read it from here, so neither can drift into accepting a payload
 *  the other rejects. @param {any} v @returns {boolean} */
function isIdentifierList(v) {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
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
    isIdentifierList(v.identifiers) &&
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
  // A `live` status aborts, and its payload cannot soften that — but the payload
  // still has to be one the contract recognizes. ABSENT or EMPTY is the specified
  // LIVE shape (the message then says so); anything else is the contract's
  // malformed row and lands on NOT-PROBEABLE below, which aborts too. So the
  // verdict never flips to permissive, only the message changes — and `join` is
  // reached only over values proven to be strings, so formatting the refusal
  // cannot itself throw (a `Symbol` element would otherwise raise a raw
  // TypeError out of the gate instead of a coherent refusal).
  if (isLive(result) && (result.identifiers === undefined || isIdentifierList(result.identifiers))) {
    const named =
      isIdentifierList(result.identifiers) && result.identifiers.length > 0
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

/**
 * Table D rows D3/D11/D12 + Table R rows R4/R9, as amended by ruling R-B′ at
 * round 2 of the PR gate: disclose the DISK-DERIVED set as its own labeled
 * block, in both `--dry-run` and the pre-confirm plan, after the
 * manifest-derived lines. Per item: the re-derived `would run:` line (omitted
 * when the derivation yields nothing — a `.service`, a uid-less darwin), then
 *
 *   - `remove <path>` when the disposition permits it and no record owns the
 *     file — phase D5b's own deletion, and the one case the manifest-derived
 *     lines exclude so nothing is disclosed twice;
 *   - `removed by its own manifest entry (listed above)` when a record owns the
 *     file AND THE PLAN SAYS that record's reverser deletes it, which is read
 *     off the same plan the user is shown rather than from an ownership flag;
 *   - otherwise `keep <path> (another manifest entry owns this file)`, plus
 *     R9's plain-language login warning when the basename recognizes as
 *     launchd — correct even for a record naming a symlink alias, whose
 *     reverser unlinks the alias and leaves the plist behind.
 *
 * Every discovered path therefore appears in the plan exactly once, and what the
 * plan says will be removed sums to what the run removes.
 * @param {{schedules:Array<{path:string, real:string, remove:boolean}>, unreadable:Array<{root:string, code:string}>, skippedForVault:string[]}} discovery
 * @param {NodeJS.Platform} platform
 * @param {string} vaultPath
 * @param {Set<string>} planRemoved  the paths this run's plan reports in `removed`
 * @returns {void}
 */
function printDiscoveredSchedules(discovery, platform, vaultPath, planRemoved) {
  const gen = require('../scheduler/generators');
  if (discovery.schedules.length === 0 && discovery.skippedForVault.length === 0) return;
  console.log('\nScheduled jobs found on disk:');
  for (const item of discovery.schedules) {
    const argv = gen.deriveUnloadArgv(item.path, platform);
    if (argv) console.log(`  would run: ${argv.join(' ')}`);
    if (manifestLib.DISCOVERED_DISPOSITION === 'unload-and-remove' && item.remove) {
      console.log(`  remove ${item.path}`);
    } else if (!item.remove) {
      if (planRemoved.has(item.path)) {
        console.log(`  removed by its own manifest entry (listed above)`);
      } else {
        console.log(`  keep ${item.path} (another manifest entry owns this file)`);
        if (gen.recognizeScheduleBasename(path.basename(item.path)) === 'launchd') {
          console.log(`    ${manifestLib.R9_LOGIN_RELOAD_WARNING}`);
        }
      }
    }
  }
  for (const p of discovery.skippedForVault) {
    console.log(`  keep ${p} (it sits inside your memory vault at ${vaultPath} — your notes are yours)`);
  }
}

/** The "may be the only copy" hedge of Table W row **W4**, verbatim.
 *  `WP-quarantine-only-copy-shelf`'s Table O row **O8** verified it against all
 *  four shelf classes and fixed the phrasing: **may be**, never "is", and never
 *  "a spare". No surface may strengthen it. */
const QUARANTINE_HEDGE =
  'Some or all of these may be the only copy of that text on this computer, and they hold the original, not a blanked-out version.';

/**
 * POSIX single-quote a path so the printed remedy lines are SAFE TO COPY.
 * Double quotes were not: inside them a shell still expands `$`, `` ` `` and
 * `\`, so a core under a home directory containing `$HOME`, a backtick or a
 * quote character would produce an `rm -rf` line that addresses a DIFFERENT
 * path, or that executes the embedded text — on a command whose whole purpose
 * is to delete the user's only copy of their own notes. Inside single quotes
 * nothing is special, and the one character that cannot appear is escaped the
 * only way POSIX allows: end the quoting, emit a literal quote, resume.
 * @param {string} p @returns {string}
 */
function shQuote(p) {
  return `'${String(p).split("'").join("'\\''")}'`;
}

/** PowerShell single-quote a path. Same reasoning as `shQuote`, different
 *  escape: in PowerShell a literal single quote inside a single-quoted string
 *  is written by DOUBLING it, and `-LiteralPath` then also stops `[` and `]`
 *  being read as wildcards. @param {string} p @returns {string} */
function psQuote(p) {
  return `'${String(p).split("'").join("''")}'`;
}

/**
 * The two remedy lines of Table W row **W4** item (5), in the HOST SHELL —
 * ruling **R-W4-win32**. A user on Windows has no `mv` and no `rm -rf`, so a
 * POSIX-only remedy is not a remedy at all on a third of the supported
 * platforms; and a `--dry-run` that prints a command the user cannot run is
 * exactly the disclosure failure W5 exists to prevent. The platform is a
 * parameter, not a read, so both branches are unit-testable on any host.
 * @param {string} target @param {NodeJS.Platform} platform @returns {string[]}
 */
function remedyLines(target, platform) {
  if (platform === 'win32') {
    return [
      `  Move-Item -LiteralPath ${psQuote(target)} -Destination "$HOME\\wienerdog-quarantine"`,
      `  Remove-Item -LiteralPath ${psQuote(target)} -Recurse -Force`,
    ];
  }
  return [`  mv ${shQuote(target)} ~/wienerdog-quarantine`, `  rm -rf ${shQuote(target)}`];
}

/**
 * The secret-quarantine disclosure block (Table W row **W4**), printed
 * byte-for-byte by the refusal and by `--dry-run` (Table W row **W5**) so the
 * two can never disagree about what is on the shelf. It carries the total entry
 * count and the total size in bytes as a plain integer, one line per shelf
 * directory that HOLDS at least one entry (an existing-but-empty shelf
 * contributes no entry by Table K row **K2** and so no line — a refusal listing
 * an empty directory would tell the user to deal with nothing), one line per
 * `blockers` path, the hedge, and the remedy as two literal shell lines followed
 * by the re-run and the runbook pointer. When the shelf's state could not be
 * determined it names each directory and its `code` instead of a count.
 *
 * It NEVER prints a filename and never a byte of any file's content (Table Y row
 * **Y1**): the inventory opened no file (Table K row **K6**), every
 * `unreadable[].dir` is a DIRECTORY rather than an entry, and the user is about
 * to list the directory themselves, so printing names buys nothing and not
 * printing them is strictly safer.
 * @param {{roots:Array<{dir:string, entries:number, bytes:number}>, entries:number, bytes:number, unreadable:Array<{dir:string, code:string}>, blockers:string[]}} inv
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {NodeJS.Platform} [platform] the host whose shell the remedy is
 *   written for (**R-W4-win32**); a parameter so both branches are testable
 *   without a Windows host
 * @returns {string}
 */
function quarantineBlock(inv, paths, platform = process.platform) {
  // The remedy names a path that EXISTS wherever one does — `roots` and
  // `blockers` both report their ACTUAL on-disk path, so a capitalized shelf,
  // or a file sitting where the shelf should be, is named as it is stored
  // (Table K rows K1/K8). The canonical join is the last resort only.
  const target =
    (inv.roots.length > 0 && inv.roots[0].dir) ||
    (inv.blockers.length > 0 && inv.blockers[0]) ||
    path.join(paths.state, 'quarantine');
  /** @type {string[]} */ const lines = [];
  if (inv.unreadable.length > 0) {
    lines.push(
      'Wienerdog set aside copies of your own notes that looked like they held a password or a key, and it cannot tell what is in them right now — so removing them could lose text without ever saying it was there:'
    );
    for (const u of inv.unreadable) lines.push(`  ${u.dir} (${u.code})`);
  } else {
    lines.push(
      `Wienerdog set aside ${inv.entries} file(s) of your own notes, ${inv.bytes} bytes in total, because they looked like they held a password or a key:`
    );
    for (const r of inv.roots) {
      if (r.entries === 0) continue;
      lines.push(`  ${r.dir} — ${r.entries} file(s), ${r.bytes} bytes`);
    }
    // W4 item (3b) — one line per blocker (ruling R-K).
    for (const b of inv.blockers) {
      lines.push(`  ${b} — not a folder; something else is sitting where the quarantine folder goes`);
    }
  }
  lines.push('', QUARANTINE_HEDGE, '');
  lines.push(
    inv.unreadable.length > 0
      ? 'Fix the permission or disk problem so it can be read, then move it somewhere you keep, or delete it:'
      : 'Move that somewhere you keep, or delete it:'
  );
  lines.push(...remedyLines(target, platform));
  lines.push('then run `wienerdog uninstall` again.');
  lines.push('There is more about these copies in docs/runbooks/secret-incident.md.');
  return lines.join('\n');
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

  // ── Table K row K5 / Table W row W3: the SECRET-QUARANTINE GATE. One
  //    read-only walk, EXACTLY ONCE per invocation, and BEFORE THE FIRST
  //    console.log — so before the manifest headline, before any plan, before
  //    Table D row D2's discovery and therefore before its D9 abort, and before
  //    every deletion (Table W row W7: the shelf gate goes first because it is
  //    the cheaper check — one walk inside our own core, no ambient roots — and
  //    because it reports data we would DESTROY, while D9 reports a deletion we
  //    might fail to perform; both aborts delete nothing and both are retryable).
  //    It fires on NON-EMPTY or UNREADABLE (Table K rows K3/K4): an unreadable
  //    shelf is never an empty one, because `rmSync({force:true})` succeeds
  //    silently on a tree the walk could not see (Table Y row Y5).
  const quarantine = manifestLib.quarantineInventory(paths);
  if (quarantine.entries > 0 || quarantine.unreadable.length > 0) {
    if (dryRun) {
      // --dry-run does NOT abort: it deletes nothing, and a --dry-run that
      // refuses to show the plan defeats the surface a user consults precisely
      // to find out what an uninstall will do (Table W row W5).
      console.log(quarantineBlock(quarantine, paths));
      console.log(
        '\nA real `wienerdog uninstall` stops at this point. The rest of this plan is what it would do once these files have been moved or deleted.'
      );
    } else {
      // A refusal in the shape this command's other refusals already use — it
      // names what was found, says nothing was removed, and gives the remedy.
      // Identical with and without `--yes`: `--yes` skips the PROMPT, and a
      // refusal is not a prompt (Table W row W2, Table Y row Y7, ADR-0035).
      throw new WienerdogError(
        `wienerdog uninstall stopped — nothing was removed.\n\n${quarantineBlock(quarantine, paths)}`
      );
    }
  }

  // ── Table D row D2: discovery runs EXACTLY ONCE per invocation, BEFORE
  //    anything is printed, with the accepted vault path already read so D12 can
  //    apply. The returned list is the accepted snapshot of the disk-derived
  //    set, and it is the only such list this run ever uses — passed by value
  //    into both reverse() calls (D4/D7), so the post-confirm run cannot widen
  //    past what was disclosed.
  const discovery = manifestLib.discoverSchedulesOnDisk(paths, manifest, { vaultPath });
  // Round 11 ruling R-B: `reverse().removed` is the POST-ACTION record and
  // includes every phase-D5b deletion, but the plan and --dry-run are
  // DISCLOSURE, where a discovered path is disclosed exactly once — inside the
  // `Scheduled jobs found on disk:` block. Subtract it from the manifest-derived
  // `remove` lines and from the --dry-run headline count, which also keeps that
  // count independent of Table R row R4's cell, as Table D row D3 requires.
  // Ruling R-B′ (round 2 of the PR gate): exclude from the manifest-derived
  // `remove` lines and from the --dry-run headline ONLY the paths the disk block
  // itself discloses with a `remove` line — phase D5b's own deletions. A
  // `remove:false` item's fate belongs to its owning record's reverser, and that
  // reverser's own line stays, or the plan under-states a deletion.
  const discoveredRemovals = new Set(
    manifestLib.DISCOVERED_DISPOSITION === 'unload-and-remove'
      ? discovery.schedules.filter((it) => it.remove).map((it) => it.path)
      : []
  );
  // Table D rows D9/D15: an unreadable root is NOT an empty root. With scheduler
  // authority present the live probe is short-circuited, so a silently empty
  // result would let the core be disposed without anything ever having LOOKED at
  // the directory holding an unrecorded live job. Refuse here — before the plan
  // is printed and with nothing deleted. --dry-run does not abort: it deletes
  // nothing, so it reports them and continues.
  if (!dryRun && discovery.unreadable.length > 0) {
    const named = discovery.unreadable.map((u) => `${u.root} (${u.code})`).join(', ');
    throw new WienerdogError(
      'refusing to uninstall: a folder that can hold scheduled jobs could not be read, so a job ' +
        `may still be registered there — ${named}. Nothing was removed. Fix the permission or ` +
        'disk problem, then re-run: npx wienerdog@latest uninstall'
    );
  }

  console.log('wienerdog uninstall — the following will be removed:\n');
  for (const entry of manifest.entries) console.log(`  [${entry.kind}] ${entry.path}`);

  if (dryRun) {
    const { removed, skipped, preserved, deferredConfig } = manifestLib.reverse(paths, manifest, {
      dryRun: true,
      discoveredSchedules: discovery.schedules,
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
    const headline = removed.filter((p) => !discoveredRemovals.has(p)).length + (deferredConfig ? 1 : 0);
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
    printDiscoveredSchedules(discovery, process.platform, vaultPath, new Set(removed));
    if (discovery.unreadable.length > 0) {
      console.log('\nFolders that can hold scheduled jobs but could not be read (a real uninstall would stop here):');
      for (const u of discovery.unreadable) console.log(`  ${u.root} (${u.code})`);
    }
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
    const plan = manifestLib.reverse(paths, manifest, {
      dryRun: true,
      discoveredSchedules: discovery.schedules,
    });
    const mechPlan = manifestLib.disposeCoreMechanics(paths, { dryRun: true, vaultPath });
    for (const p of plan.removed) {
      if (discoveredRemovals.has(p)) continue; // R-B′ — disclosed once, in the block below
      console.log(`  remove ${p}`);
    }
    if (plan.deferredConfig) console.log(`  remove ${plan.deferredConfig} (unmodified config — deleted last)`);
    for (const d of mechPlan.removed) console.log(`  remove ${d} (machine-generated state, recursive)`);
    console.log(`  remove ${paths.core} (the canonical core — removed once empty)`);
    printDiscoveredSchedules(discovery, process.platform, vaultPath, new Set(plan.removed));
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
    { dryRun: false, discoveredSchedules: discovery.schedules }
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
// `quarantineBlock` is exported for its PLATFORM SEAM only (ruling R-W4-win32):
// the win32 remedy branch has to be assertable on a POSIX host, and a block
// builder that reads `process.platform` internally cannot be. No production
// caller imports it.
module.exports = { run, ownIdentifiersIn, quarantineBlock };
