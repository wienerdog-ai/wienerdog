'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { renderDigest, listSecretQuarantine } = require('../core/digest');
const { writeFilePrivate, repairPrivateModes, scanPrivateModes } = require('../core/private-fs');
const identityApprovals = require('../core/identity-approvals');
const { renderUpdateLine } = require('../core/update-check');
const { readAlerts } = require('../core/alerts');
const { readVaultLayout } = require('../core/layout');
const { detectHarnesses } = require('../core/detect');
const manifestMod = require('../core/manifest');
const { applyClaudeAdapter } = require('../adapters/claude');
const { applyCodexAdapter } = require('../adapters/codex');

/**
 * Read the `vault:` path out of config.yaml (flat-YAML subset, same approach as
 * init.js). Returns null if the file is unreadable or the value is unset/null.
 * @param {string} configPath
 * @returns {string|null}
 */
function readVaultPath(configPath) {
  let content;
  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
  // `[ \t]*` (not `\s*`) so a bare `vault:` line does not let the match run
  // across the newline into the next line's content.
  const m = content.match(/^vault:[ \t]*(.*)$/m);
  if (!m) return null;
  const value = m[1].split('#')[0].trim();
  return value === '' || value === 'null' ? null : value;
}

/**
 * Recursively copy a directory into dest, idempotently: create missing dirs
 * (manifest 'dir'), write missing/changed files (manifest 'file'), skip
 * byte-identical files. On dryRun make no writes; still report intended copies.
 * @param {string} srcDir
 * @param {string} destDir
 * @param {boolean} dryRun
 * @param {object} manifest
 * @param {{changed: string[], unchanged: string[]}} out
 */
function stageDir(srcDir, destDir, dryRun, manifest, out) {
  if (!fs.existsSync(destDir)) {
    if (!dryRun) fs.mkdirSync(destDir, { recursive: true });
    recordOnce(manifest, { kind: 'dir', path: destDir });
  }
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      stageDir(src, dest, dryRun, manifest, out);
    } else if (entry.isFile()) {
      const desired = fs.readFileSync(src);
      let same = false;
      try {
        same = fs.readFileSync(dest).equals(desired);
      } catch {
        same = false;
      }
      if (same) {
        out.unchanged.push(dest);
      } else {
        if (!dryRun) fs.writeFileSync(dest, desired);
        out.changed.push(dest);
      }
      recordOnce(manifest, { kind: 'file', path: dest });
    }
  }
}

/**
 * Record a manifest entry only if no entry with the same kind+path exists.
 * @param {object} manifest
 * @param {{kind: string, path: string}} entry
 */
function recordOnce(manifest, entry) {
  const exists = manifest.entries.some((e) => e.kind === entry.kind && e.path === entry.path);
  if (!exists) manifestMod.record(manifest, entry);
}

/**
 * Stage packaged `skills/wienerdog-*` folders into `<core>/skills/`. Vendor-
 * neutral so the future Codex adapter reuses the same core skills.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {boolean} dryRun
 * @param {object} manifest
 * @param {{changed: string[], unchanged: string[]}} out
 */
function stageSkills(paths, dryRun, manifest, out) {
  const pkgSkillsRoot = path.resolve(__dirname, '..', '..', 'skills');
  const coreSkillsDir = path.join(paths.core, 'skills');
  let names = [];
  try {
    names = fs
      .readdirSync(pkgSkillsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('wienerdog-'))
      .map((d) => d.name);
  } catch {
    names = [];
  }
  if (names.length === 0) return;

  if (!fs.existsSync(coreSkillsDir)) {
    if (!dryRun) fs.mkdirSync(coreSkillsDir, { recursive: true });
    recordOnce(manifest, { kind: 'dir', path: coreSkillsDir });
  }
  for (const name of names) {
    stageDir(path.join(pkgSkillsRoot, name), path.join(coreSkillsDir, name), dryRun, manifest, out);
  }
}

/**
 * `wienerdog sync` — the compiler pass. Renders the identity digest, stages the
 * shipped skills into the canonical core, then applies each present harness
 * adapter (Claude Code in this WP). Idempotent and manifest-tracked; a second
 * run with unchanged inputs makes zero changes.
 * @param {string[]} argv
 * @param {{loader?: (argv:string[])=>{status:number},
 *          interactive?: boolean,
 *          ensureGoogleReady?: (paths:import('../core/paths').WienerdogPaths)=>Promise<void>,
 *          suppressSandboxWarning?: boolean,
 *          harnesses?: {claude:{present:boolean,dir:string}, codex:{present:boolean,dir:string}}}} [opts]
 *   `loader`: scheduler loader seam. `interactive`: overrides terminal detection
 *   (tests); default `!!process.stdin.isTTY`. `ensureGoogleReady`: inject the
 *   googleapis self-heal fn (tests); default `require('../gws/deps').ensureGoogleReady`.
 *   `suppressSandboxWarning`: skip the half-sandbox warning print (init already
 *   printed it). `harnesses`: a pre-computed harness snapshot (init passes its
 *   plan-time snapshot); a standalone sync detects once here when omitted.
 * @returns {Promise<void>}
 */
async function run(argv, opts = {}) {
  const dryRun = argv.includes('--dry-run');
  const paths = getPaths();
  const vaultPath = readVaultPath(paths.config);
  // One harness snapshot for the whole run: the guard warns about the harnesses the adapters
  // below MAY write into (they write a subset — those still present at revalidation). From init
  // this is init's snapshot (opts.harnesses); a standalone sync detects once here. A harness
  // that appears mid-run is not in the snapshot → not written unwarned (round-7).
  const harnesses = opts.harnesses || detectHarnesses(process.env);
  if (!opts.suppressSandboxWarning) {
    const { sandboxMismatchWarning } = require('../core/sandbox-guard');
    const w = sandboxMismatchWarning(paths, process.env, harnesses);
    if (w) console.log(w);
  }

  // A configured vault MUST exist on disk. An UNSET vault is a valid first-time
  // state (WP-027): we still install skills + hooks, we just defer memory.
  if (vaultPath) {
    let isDir = false;
    try {
      isDir = fs.statSync(vaultPath).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      throw new WienerdogError(
        `vault not found at ${vaultPath} — run /wienerdog-setup, or 'wienerdog init --fresh-vault' for the default.`
      );
    }
  }

  const manifest = manifestMod.load(paths);

  // A7 (WP-154, ADR-0028): pin claude/git/codex by command path + install dir.
  // Resolution runs under the SAME clean PATH the nightly job builds — pinning
  // under the interactive shell PATH would false-drift every night whenever the
  // shell orders the claude/git dirs differently than buildCleanEnv does.
  // Idempotent re-pin on every sync (sync IS the explicit "confirm and re-pin"
  // step the fail-safe message points at). Dry-run: count only, no writes.
  //
  // ORDERING INVARIANT (WP-156 F4/A1): createPins runs ABOVE repointSchedules so
  // the descriptor written at repoint embeds the just-created pins. If the
  // descriptor were bound with exec:{} before pins existed, the next fire would
  // re-derive a NON-empty exec and the launcher would refuse (nightly fail-closed
  // until a 2nd sync); worse, an empty-exec bind lets a later-planted claude
  // digest-match (WP-154 A1b backstop depends on exec being non-empty at bind).
  {
    const { createPins } = require('../core/exec-identity');
    const { buildCleanEnv } = require('./run-job');
    const pinEnv = buildCleanEnv(paths, 'sync');
    if (dryRun) {
      const r = createPins(paths, { env: pinEnv, dryRun: true });
      console.log(`wienerdog: would pin ${Object.keys(r.pins).length} executable(s).`);
    } else {
      const r = createPins(paths, { env: pinEnv, manifest });
      for (const n of r.notices) console.log(`wienerdog: ${n}`);
    }
  }

  // Vendor the running package into the core and write the PATH shim so every
  // long-lived reference (scheduler entries, self-invocations) targets a stable
  // app/current bin, and bare `wienerdog` resolves (ADR-0013). Dry-run makes no
  // writes.
  const { vendorSelf, writeShim } = require('../core/vendor');
  if (!dryRun) {
    const v = vendorSelf(paths, { manifest });
    const shim = writeShim(paths, { manifest });
    console.log(`wienerdog: vendored app ${v.version}${v.dev ? ' (dev checkout — linked in place)' : ''}.`);
    if (!shim.onPath) {
      console.log(`wienerdog: add ${path.dirname(shim.path)} to your PATH to run \`wienerdog\` directly ` +
        `(e.g. add 'export PATH="$HOME/.local/bin:$PATH"' to your shell profile).`);
    }
    // Migrate existing OS scheduler entries to the stable vendored bin (ADR-0013).
    // Idempotent: only stale entries are rewritten+reloaded; a clean re-sync is a
    // no-op. Never fails sync — an unschedulable job degrades to a notice.
    //
    // WP-catchup-per-job-authorization [R6]: this attended `sync` → `repointSchedules` call is the SOLE
    // owner of catch-up REPAIR + TEARDOWN. repointSchedules re-mints the per-job
    // digest map for every job, restores a LOADED catch-up registration the OS
    // dropped (regenerating the canonical entry + correct bound map), and tears the
    // entry + map down cleanly on final-job removal. The generic reloadMissing heal
    // below never touches the catch-up entry.
    const { repointSchedules } = require('./schedule');
    const r = repointSchedules(paths, manifest, { loader: opts.loader });
    if (r.changed > 0) console.log(`wienerdog: repointed ${r.changed} schedule(s) to the vendored app.`);
    // A4/F7: a non-zero descriptor-write-failure count is surfaced so sync never
    // reports success while a job descriptor failed to write (silent nightly
    // fail-closed once WP-157 enforces the digest).
    if (r.descriptorFailures > 0) {
      console.log(
        `wienerdog: WARNING — ${r.descriptorFailures} job descriptor(s) could not be written; ` +
          `the affected job(s) will fail closed at fire time until the next successful 'wienerdog sync'.`
      );
    }
    for (const n of r.notices) console.log(`  note: ${n}`);

    // Heal any registered scheduler entry the OS silently lost (repoint no-ops on
    // identical files, so it never reloads a bootout'd-but-file-intact entry), then
    // refresh the cache so the digest reflects the post-heal, clean state. Heal
    // BEFORE refresh. The ONLY scheduler mutation in the read/heal split (ADR-0018).
    const status = require('../scheduler/status');
    const heal = status.reloadMissing(paths, { loader: opts.loader });
    if (heal.reloaded.length > 0) {
      console.log(`wienerdog: reloaded ${heal.reloaded.length} scheduled job(s) the OS had dropped: ${heal.reloaded.join(', ')}.`);
    }
    if (heal.failed.length > 0) {
      console.log(`wienerdog: WARNING — could not reload ${heal.failed.length} scheduled job(s): ${heal.failed.join(', ')}. Run 'wienerdog doctor' for details.`);
    }
    status.refreshSchedulerStatus(paths);
  }

  /** @type {{changed: string[], unchanged: string[], notices: string[]}} */
  const summary = { changed: [], unchanged: [], notices: [] };

  // 0. Private-modes repair (audit A5, WP-126, OWNER-APPROVED: sync is THE
  //    attended fixer; doctor reports, the nightly path only reads). Runs
  //    BEFORE the digest render so a repairing sync's own digest carries no
  //    stale insecure-modes banner. Dry-run never chmods — it reports the
  //    would-repair count from the read-only scan.
  if (dryRun) {
    const { insecure } = scanPrivateModes(paths);
    if (insecure > 0) console.log(`wienerdog: would harden ${insecure} artifact permission(s).`);
  } else {
    const { changed } = repairPrivateModes(paths);
    if (changed > 0) console.log(`wienerdog: hardened ${changed} artifact permission(s).`);
  }

  // 1. Digest + managed block need a vault. Skip both when unset (exit 0).
  const skipManagedBlock = !vaultPath;
  if (vaultPath) {
    const layout = readVaultLayout(paths.config);
    // A3 identity trust registry (WP-116, ADR-0021): an attended sync seeds
    // FIRST-TIME-ONLY records for identity files with no record yet, then the
    // digest injects only exact-byte matches. Never re-seeds a changed file —
    // that requires `wienerdog memory approve` (WP-117).
    if (!dryRun) identityApprovals.seedApprovals(paths.state, vaultPath, layout);
    const idReg = identityApprovals.readRegistry(paths.state);
    const digest = renderDigest(vaultPath, layout, {
      alerts: readAlerts(paths),
      schedulerLine: require('../scheduler/status').renderSchedulerStatusLine(paths),
      updateLine: renderUpdateLine(paths),
      identityApprovals: identityApprovals.approvalsMap(idReg),
      secretQuarantine: listSecretQuarantine(paths.state), // EP4 pending-review banner (WP-125)
      insecureModes: scanPrivateModes(paths).insecure, // post-repair on a real sync (WP-126)
    });
    const dest = path.join(paths.state, 'digest.md');
    if (!dryRun) {
      writeFilePrivate(dest, digest); // atomic 0600, parent 0700 (audit A5, WP-126)
    }
    console.log(
      `wienerdog: ${dryRun ? 'would write' : 'wrote'} ${dest} (${Buffer.byteLength(digest)} bytes).`
    );
  } else {
    console.log(
      'wienerdog: no vault yet — memory features (digest + managed block) activate after /wienerdog-setup; skills and hooks are installed.'
    );
  }

  // 2. Stage shipped skills into the core (vendor-neutral) — ALWAYS.
  stageSkills(paths, dryRun, manifest, summary);

  // 3. Apply each present harness adapter — ALWAYS. They install skills + hooks
  //    and only skip the managed block when skipManagedBlock is true.
  // The initial snapshot is an AUTHORIZATION UPPER BOUND, not a promise the dir still exists.
  // Adapter set = { snapshot.present harnesses whose dir is STILL a directory at this check } —
  // the intersection of the snapshot and on-disk state at revalidation time. It does not grow
  // past the snapshot: a harness that APPEARED mid-run is not in the snapshot → not written
  // unwarned (round-7); a harness whose disappearance is OBSERVABLE here fails revalidation →
  // skipped (round-8). A removal/symlink-retarget in the window AFTER this check and before the
  // adapter's write is an inherent non-atomic-fs micro-race (accepted residual — see
  // Implementation notes). fs is already required at the top of sync.js.
  const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

  if (harnesses.claude.present && isDir(harnesses.claude.dir)) {
    const res = applyClaudeAdapter(paths, { dryRun, manifest, skipManagedBlock });
    summary.changed.push(...res.changed);
    summary.unchanged.push(...res.unchanged);
    summary.notices.push(...res.notices);
  } else if (harnesses.claude.present) {
    console.log('Claude Code config is no longer present; skipping adapter (it will be applied on the next `wienerdog sync`).');
  } else {
    console.log('Claude Code not detected; skipping adapter.');
  }
  if (harnesses.codex.present && isDir(harnesses.codex.dir)) {
    const res = applyCodexAdapter(paths, { dryRun, manifest, skipManagedBlock });
    summary.changed.push(...res.changed);
    summary.unchanged.push(...res.unchanged);
    summary.notices.push(...res.notices);
  } else if (harnesses.codex.present) {
    console.log('Codex CLI config is no longer present; skipping adapter (it will be applied on the next `wienerdog sync`).');
  } else {
    console.log('Codex CLI not detected; skipping adapter.');
  }

  if (!dryRun) manifestMod.save(paths, manifest);

  console.log(
    `wienerdog: ${summary.changed.length} changed, ${summary.unchanged.length} unchanged.`
  );
  for (const n of summary.notices) console.log(`  note: ${n}`);

  // Interactive backfill of the on-demand googleapis install (BUG-gws-deps-missing).
  // A routines-only (headless) user who connected Google before WP-047 never
  // reaches an interactive read to self-heal — their non-TTY routines decline the
  // consented install by design, so app/deps is never populated. When a PERSON runs
  // sync (or update/init hands off with the terminal attached) and a token exists
  // but the deps dir is absent, offer the same consented install here so their
  // routines then work. No-op when already installed or unauthed (ensureGoogleReady
  // handles both). RUN LAST — after manifestMod.save — so a Ctrl-C at the prompt or
  // a kill during npm leaves a fully persisted, consistent sync (the install is not
  // manifest-tracked). Best-effort: a decline/failure prints a note and NEVER fails
  // sync. A non-TTY (or dry-run) sync stays mutation-free (no prompt, no install). WP-105.
  const interactive = opts.interactive !== undefined ? opts.interactive : !!process.stdin.isTTY;
  if (!dryRun && interactive) {
    const ensureGoogleReady = opts.ensureGoogleReady || require('../gws/deps').ensureGoogleReady;
    try {
      await ensureGoogleReady(paths);
    } catch (e) {
      console.log(`wienerdog: Google's client library was not installed — ${e.message}`);
    }
  }
}

module.exports = { run };
