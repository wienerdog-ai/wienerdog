'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPaths } = require('../core/paths');
const { detectHarnesses } = require('../core/detect');
const { getUpdateNotice, updateCommand } = require('../core/update-check');
const manifestLib = require('../core/manifest');

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

/** @param {string} configPath @returns {string|null} configured vault path, or null. */
function readVaultPath(configPath) {
  let content;
  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
  const m = content.match(/^vault:[ \t]*(.*)$/m);
  if (!m) return null;
  const value = m[1].split('#')[0].trim();
  return value === '' || value === 'null' ? null : value;
}

/** Validate that each SHIPPED wienerdog-* skill is CORRECTLY registered under a
 *  harness's skills dir — not merely present (WP-079 checked only existence, which
 *  let a symlink repointed at a foreign/ephemeral core read as healthy until it went
 *  dangling; the 2026-07-12 demo-sandbox incident). The shipped inventory is read from
 *  the PACKAGED source (path.resolve(__dirname,'..','..','skills')), NOT the mutable
 *  <core>/skills, so a deleted staged skill is a reported problem, never a smaller
 *  count.
 *  For each shipped name:
 *    - staged core copy <core>/skills/<name> absent / no SKILL.md → 'core copy missing'
 *      (and the harness sub-check is skipped — sync re-stages).
 *    - else the harness entry:
 *      · SYMLINK: fs.realpathSync(linkPath) must resolve (else 'broken link') AND
 *        equal fs.realpathSync(<core>/skills/<name>) (else 'points outside this install')
 *        AND the resolved dir must contain SKILL.md (else 'no SKILL.md').
 *      · real DIRECTORY (copied skill, WP-050): DISCOVERABILITY only — must contain
 *        SKILL.md (else 'no SKILL.md'); NOT an ownership check (a user-modified/unrecorded
 *        dir with SKILL.md reads as discoverable; ownership is WP-088/089's job).
 *      · absent / a plain file: 'missing' / 'a file is in the way'.
 *  Read-only; every problem is a WARN with the `wienerdog sync` remediation, never a
 *  fail. Returns [] when the packaged source is unreadable or ships no wienerdog-* skills.
 *  Callers gate on harness presence.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {string} harnessSkillsDir  e.g. path.join(paths.claudeDir, 'skills')
 *  @param {string} label             e.g. 'Claude Code' | 'Codex'
 *  @returns {{status:'ok'|'warn', msg:string}[]} */
function skillLinkChecks(paths, harnessSkillsDir, label) {
  const pkgSkillsRoot = path.resolve(__dirname, '..', '..', 'skills');
  let entries;
  try {
    entries = fs.readdirSync(pkgSkillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const shippedNames = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('wienerdog-'))
    .map((e) => e.name);
  if (shippedNames.length === 0) return [];

  const problems = [];
  for (const name of shippedNames) {
    const coreSkill = path.join(paths.core, 'skills', name);
    let coreIsDir = false;
    try {
      coreIsDir = fs.statSync(coreSkill).isDirectory();
    } catch {
      coreIsDir = false;
    }
    if (!coreIsDir || !fs.existsSync(path.join(coreSkill, 'SKILL.md'))) {
      problems.push({ name, reason: "core copy missing — run 'wienerdog sync'" });
      continue;
    }

    const linkPath = path.join(harnessSkillsDir, name);
    let lstat;
    try {
      lstat = fs.lstatSync(linkPath);
    } catch {
      problems.push({ name, reason: 'missing' });
      continue;
    }

    if (lstat.isSymbolicLink()) {
      let real = null;
      try {
        real = fs.realpathSync(linkPath);
      } catch {
        real = null;
      }
      if (real === null) {
        problems.push({ name, reason: 'broken link (target is gone)' });
        continue;
      }
      let expectedReal = coreSkill;
      try {
        expectedReal = fs.realpathSync(coreSkill);
      } catch {
        // fall back to the literal expected path — coreSkill was already
        // verified to exist above, so realpathSync should not throw here;
        // this guards only against a race, not a real gap.
      }
      if (real !== expectedReal) {
        problems.push({ name, reason: `points outside this install → ${real}` });
        continue;
      }
      if (!fs.existsSync(path.join(real, 'SKILL.md'))) {
        problems.push({ name, reason: `no SKILL.md at ${real}` });
      }
    } else if (lstat.isDirectory()) {
      if (!fs.existsSync(path.join(linkPath, 'SKILL.md'))) {
        problems.push({ name, reason: 'no SKILL.md' });
      }
    } else {
      problems.push({ name, reason: 'a file is in the way' });
    }
  }

  if (problems.length === 0) {
    return [{ status: 'ok', msg: `${label} skills registered (${shippedNames.length}) under ${harnessSkillsDir}` }];
  }
  return [
    {
      status: 'warn',
      msg:
        `${label} skills need attention under ${harnessSkillsDir}: ` +
        `${problems.map((p) => `${p.name} (${p.reason})`).join(', ')} — run 'wienerdog sync' to re-link them`,
    },
  ];
}

// The EXACT (event → script basename) pairs Wienerdog registers, per settings file.
// A generic filename alone is NOT enough — a user's own SessionEnd hook could be named
// session-end.sh — so a hook is Wienerdog-shaped ONLY when BOTH the event AND the basename
// match a pair the corresponding adapter actually writes (src/adapters/{claude,codex}.js).
const WD_HOOK_PAIRS = {
  claude: { SessionStart: 'session-start.sh', SessionEnd: 'session-end.sh' },
  codex: { SessionStart: 'session-start.sh', Stop: 'codex-session-end.sh' },
};

/** Recover the script path from a hook command. Wienerdog writes single-quoted
 *  forward-slash paths (shellQuoteCommand); undo that. A bare/unquoted command (older
 *  or foreign) is returned as-is. @param {string} command @returns {string} */
function unquoteCommand(command) {
  const c = String(command).trim();
  if (c.length >= 2 && c.startsWith("'") && c.endsWith("'")) {
    return c.slice(1, -1).replace(/'\\''/g, "'");
  }
  return c;
}

/** Detect a Wienerdog-SHAPED session hook whose target SCRIPT no longer exists — the
 *  2026-07-12 demo-sandbox residue: a second SessionStart/SessionEnd pair was merged into
 *  the real ~/.claude/settings.json pointing at a temp core the OS later purged, so every
 *  session logged "SessionEnd hook failed". applySettings only prunes variants of its OWN
 *  current command path, so a foreign-path wienerdog hook survives forever. A match
 *  requires the EXACT (event, basename) pair Wienerdog registers for that harness AND a
 *  missing script — this refuses to claim a user's unrelated hook (a session-end.sh under
 *  PreToolUse, or a session-start.sh under SessionEnd, is NOT ours). Ownership still can't
 *  be PROVEN (the path is foreign/unrecorded), so the WARN is HEDGED ("possible leftover …
 *  if you didn't add this yourself"), and NEVER auto-removed (reversibility, ADR-0004).
 *  Read-only; never throws.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {{claude:{present:boolean}, codex:{present:boolean}}} harnesses
 *  @returns {{status:'warn', msg:string}[]} */
function staleHookChecks(paths, harnesses) {
  const targets = [];
  if (harnesses.claude.present) {
    targets.push({ settingsPath: path.join(paths.claudeDir, 'settings.json'), pairs: WD_HOOK_PAIRS.claude });
  }
  if (harnesses.codex.present) {
    targets.push({ settingsPath: path.join(paths.codexDir, 'hooks.json'), pairs: WD_HOOK_PAIRS.codex });
  }

  const findings = [];
  for (const { settingsPath, pairs } of targets) {
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      continue;
    }
    const hooks = settings && settings.hooks;
    if (hooks === null || typeof hooks !== 'object' || Array.isArray(hooks)) continue;

    for (const [event, groups] of Object.entries(hooks)) {
      const expectedBase = pairs[event];
      if (!expectedBase) continue;
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        if (!group || !Array.isArray(group.hooks)) continue;
        for (const h of group.hooks) {
          if (!h || typeof h.command !== 'string') continue;
          const scriptPath = unquoteCommand(h.command);
          const base = scriptPath.replace(/\\/g, '/').split('/').pop();
          if (base !== expectedBase) continue;
          if (fs.existsSync(scriptPath)) continue;
          findings.push({
            status: 'warn',
            msg:
              `possible leftover Wienerdog session hook in ${settingsPath} (${event}): its script is gone, ` +
              `so it fails every session — if you didn't add this hook yourself, remove this entry: ${h.command}`,
          });
        }
      }
    }
  }
  return findings;
}

/** Report Google client-library readiness for a CONNECTED account. Read-only;
 *  never fails (WARN, not fail). Emits NOTHING when Google is not connected (no
 *  token). A damaged token warns separately (never [ok]). Uses a containment-
 *  guarded LOAD probe (not just resolve) so a corrupt/partial install warns.
 *  WP-103 / BUG-gws-deps-missing.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @returns {{status:'ok'|'warn', msg:string}[]} */
function googleReadinessChecks(paths) {
  const { tokenPath } = require('../gws/client');
  const deps = require('../gws/deps');
  const tp = tokenPath(paths);
  if (!fileExists(tp)) return []; // Google not connected — nothing to check (normal)

  // Finding 4 + round-2 Finding 3 — minimal, read-only token validation: a
  // zero-byte / malformed / incomplete token must never read as a healthy [ok].
  // Require valid JSON with a NON-EMPTY STRING refresh_token (a truthiness-only
  // check would let {"refresh_token":true} or a whitespace value pass). Anything
  // else is a separate "damaged" warn.
  let token = null;
  try { token = JSON.parse(fs.readFileSync(tp, 'utf8')); } catch { token = null; }
  if (!token || typeof token !== 'object' ||
      typeof token.refresh_token !== 'string' || token.refresh_token.trim() === '') {
    return [{ status: 'warn', msg: 'Google sign-in file looks damaged — reconnect with /wienerdog-google-setup' }];
  }

  // Finding 1(a) — containment-guarded LOAD probe: actually require the resolved
  // module so a resolvable-but-unloadable (corrupt/partial) install warns instead
  // of falsely reading [ok]. loadGoogleapis resolves via the containment guard
  // AND requires the module inside its try/catch, so a broken entry point throws a
  // WienerdogError we catch here. doctor runs rarely, so the load cost is fine.
  let usable = false;
  try { deps.loadGoogleapis(paths); usable = true; } catch { usable = false; }
  if (usable) {
    return [{ status: 'ok', msg: 'Google connected and its client library is installed' }];
  }
  // Round-2 Finding 2 — DISTINGUISH the two failed-load states, keyed on PHYSICAL
  // PRESENCE (round-6 P2), NOT isInstalled/resolvability:
  //   depsPresent false → ABSENT: the next read WILL self-heal (WP-102).
  //   depsPresent true  → BROKEN (a deps tree exists but won't load — bad main /
  //                       corrupt entry / no .google / symlink-out): self-heal
  //                       NO-OPs (WP-102 gates on depsPresent), so promising an
  //                       offer would be false — require a manual delete+reinstall.
  // NOTE: `deps.isInstalled` is FALSE for a package.json-present-but-unresolvable
  // (missing-main) tree, so keying on it would mis-label that state "missing".
  const dir = deps.depsDir(paths);
  // Quote the prefix (P2-A): a home path with spaces would split the argument when
  // the user pastes the command. Double quotes work in POSIX shells, cmd, PowerShell.
  const cmd = `npm install --ignore-scripts --prefix "${dir}" ${deps.GOOGLEAPIS_SPEC}`;
  // `depsPresent` is exported by WP-102's deps.js and lands here when that branch
  // merges; until then, fall back to `isInstalled` so this branch runs standalone.
  // The typeof guard is dead code post-merge.
  const present =
    typeof deps.depsPresent === 'function' ? deps.depsPresent(paths) : deps.isInstalled(paths);
  if (present) {
    // Round-4 Finding — a bare `npm install` can NO-OP over a corrupt-but-
    // resolvable tree (npm compares tree metadata, not file contents), so the
    // corrupt tree must be DELETED first. Deps dir is single-purpose → safe to
    // remove wholesale. Platform-neutral prose (parity with WP-102).
    return [
      {
        status: 'warn',
        msg:
          `Google is connected but its client library is broken (installed but not loadable) — delete the folder ${dir}, then reinstall it: ` + cmd,
      },
    ];
  }
  return [
    {
      status: 'warn',
      msg:
        'Google is connected but its client library is missing — the next `wienerdog gws` ' +
        'command will offer to install it, or run: ' + cmd,
    },
  ];
}

/**
 * Report on an existing install. Prints one `ok`/`warn`/`fail` line per check;
 * exits 1 (via process.exitCode) if any check fails.
 * @param {string[]} _argv
 */
async function run(_argv) {
  const paths = getPaths();
  let failed = false;

  /** @param {'ok'|'warn'|'fail'} status @param {string} msg */
  const check = (status, msg) => {
    console.log(`[${status}] ${msg}`);
    if (status === 'fail') failed = true;
  };

  // Core directory.
  if (dirExists(paths.core)) check('ok', `core directory exists (${paths.core})`);
  else check('fail', `core directory missing (${paths.core}) — run 'wienerdog init'`);

  // Install manifest parses.
  if (!fileExists(paths.manifest)) {
    check('fail', `install manifest missing (${paths.manifest})`);
  } else {
    try {
      manifestLib.load(paths);
      check('ok', 'install manifest parses');
    } catch {
      check('fail', `install manifest is corrupted (${paths.manifest})`);
    }
  }

  // config.yaml exists and is non-empty (content parsing is a later WP).
  if (fileExists(paths.config) && fs.statSync(paths.config).size > 0) {
    check('ok', 'config.yaml exists and is non-empty');
  } else {
    check('fail', `config.yaml missing or empty (${paths.config})`);
  }

  // Memory vault — unset is a valid just-installed state (warn, not fail).
  const vaultPath = readVaultPath(paths.config);
  if (vaultPath === null) {
    check('warn', 'no memory vault yet — run /wienerdog-setup to create or choose one (this is normal right after install)');
  } else if (dirExists(vaultPath)) {
    check('ok', `vault ready (${vaultPath})`);
  } else {
    check('fail', `vault is set to ${vaultPath} but that folder is missing — run /wienerdog-setup, or 'wienerdog init --fresh-vault' for the default`);
  }

  // secrets directory permissions (skip on Windows).
  if (process.platform === 'win32') {
    check('ok', 'secrets permission check skipped (Windows)');
  } else if (!dirExists(paths.secrets)) {
    check('fail', `secrets directory missing (${paths.secrets})`);
  } else {
    const mode = fs.statSync(paths.secrets).mode & 0o777;
    if (mode === 0o700) check('ok', 'secrets directory permissions are 0700');
    else check('warn', `secrets directory permissions are ${mode.toString(8)} (expected 700)`);
  }

  // A5 private-modes check (WP-126, ADR-0024): READ-ONLY — doctor never
  // mutates (WP-070 invariant); `wienerdog sync` is the fixer. Same predicate
  // as sync --dry-run and the digest banner (private-fs.insecureEntries), so
  // the three surfaces can never disagree. Skipped on win32 (no POSIX modes;
  // owner-approved posture — per-user profile ACLs carry Windows).
  if (process.platform !== 'win32') {
    const { insecureEntries } = require('../core/private-fs');
    for (const p of insecureEntries(paths)) {
      check('warn', `${p} is readable by other users — run 'wienerdog sync' to harden it`);
    }
  }

  // Harness detection summary (informational).
  const harnesses = detectHarnesses();
  check(
    'ok',
    `AI tools — Claude Code: ${harnesses.claude.present ? 'found' : 'not found'}, ` +
      `Codex CLI: ${harnesses.codex.present ? 'found' : 'not found'}`
  );

  // Scheduler-load health: one line per registered entry via a LIVE read-only
  // probe (authoritative — catches even the all-jobs-unloaded case). A missing
  // entry is a warn (actionable), never a hard fail; doctor never mutates.
  const { doctorSchedulerChecks } = require('../scheduler/status');
  for (const c of doctorSchedulerChecks(paths)) check(c.status, c.msg);

  // Skill-link health: each shipped wienerdog-* skill is registered — and its symlink
  // points at THIS install's core (not a stale/foreign one) — under each present
  // harness's skills dir. Read-only; problems are warns (remediation: 'wienerdog sync').
  if (harnesses.claude.present) {
    for (const c of skillLinkChecks(paths, path.join(paths.claudeDir, 'skills'), 'Claude Code')) check(c.status, c.msg);
  }
  if (harnesses.codex.present) {
    for (const c of skillLinkChecks(paths, path.join(paths.codexDir, 'skills'), 'Codex')) check(c.status, c.msg);
  }

  // Stale/foreign Wienerdog session hooks: a wienerdog-shaped hook whose target script no
  // longer exists (e.g. a since-purged temp core merged into the real settings). Read-only;
  // warn with a manual-removal hint — we never edit a settings file we did not record.
  for (const c of staleHookChecks(paths, harnesses)) check(c.status, c.msg);

  // Google client-library readiness for a connected account (WP-103).
  // Read-only; silent when Google is not connected; a missing library is a warn.
  for (const c of googleReadinessChecks(paths)) check(c.status, c.msg);

  // Cache-only update notice (no network; does not affect pass/fail). ADR-0015.
  const upd = getUpdateNotice(paths);
  if (upd.available) {
    console.log(`[info] a newer Wienerdog is available (${upd.current} → ${upd.latest}) — update: ${updateCommand(process.env)}`);
  }

  if (failed) process.exitCode = 1;
}

module.exports = { run };
