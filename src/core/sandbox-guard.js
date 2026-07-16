'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Detect the "half-sandbox" foot-gun: WIENERDOG_HOME redirects the core to a
 *  non-default (possibly ephemeral) location, but one or more DETECTED harness config
 *  dirs are NOT co-redirected — so init/sync will write skill links + session hooks into
 *  the user's REAL ~/.claude / ~/.codex pointing at that core. If the core is later
 *  removed (e.g. a temp dir the OS purges), every /wienerdog-* command and hook there
 *  breaks (the 2026-07-12 demo-sandbox incident). Returns a loud multi-line warning, or
 *  null when there is no mismatch: WIENERDOG_HOME unset, or set to the default core path,
 *  or every DETECTED harness config dir is co-redirected. Reads the disk ONLY via realpath
 *  (to resolve symlink/case aliases when comparing dirs); never writes, never spawns,
 *  never prompts.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {NodeJS.ProcessEnv} env
 *  @param {{claude:{present:boolean,dir:string}, codex:{present:boolean,dir:string}}} harnesses
 *  @returns {string|null} */
function sandboxMismatchWarning(paths, env, harnesses) {
  if (!env.WIENERDOG_HOME) return null;

  const home = env.HOME || os.homedir();
  const defaultCore = path.join(home, '.wienerdog');
  // Redirected only if the core is not the default location. sameDir ALWAYS compares by
  // physicalPath (canonicalize the longest EXISTING ancestor via realpath, re-append the
  // absent suffix) — so a not-yet-created core at init plan time still compares by its
  // existing parent's physical identity (e.g. a symlinked HOME), never a lexical whole-path
  // compare that would false-flag a fresh default core as redirected (round-4).
  if (sameDir(paths.core, defaultCore)) return null;

  // A detected harness is "exposed" when its config dir is the SAME DIRECTORY as the real
  // default — compared by physicalPath IDENTITY, never a lexical string compare. Two ways a
  // string compare fails: (1) env PRESENCE is not co-redirection — CLAUDE_CONFIG_DIR=$HOME/
  // .claude / CODEX_HOME=$HOME/.codex point at the real config; (2) a SYMLINK or a
  // differently-CASED alias (macOS case-insensitive APFS) of ~/.claude mutates the real dir
  // but differs as a string. harnesses.<h>.dir is getPaths()'s resolved dir and a DETECTED
  // harness's dir necessarily EXISTS, so physicalPath fully realpaths it; the default side
  // is canonicalized the same way, so both are physical.
  const claudeDefault = path.join(home, '.claude');
  const codexDefault = path.join(home, '.codex');
  const exposed = [];
  if (harnesses.claude.present && sameDir(harnesses.claude.dir, claudeDefault)) {
    exposed.push({ name: 'Claude Code', dir: harnesses.claude.dir });
  }
  if (harnesses.codex.present && sameDir(harnesses.codex.dir, codexDefault)) {
    exposed.push({ name: 'Codex CLI', dir: harnesses.codex.dir });
  }
  if (exposed.length === 0) return null;

  const temp = looksTemporary(paths.core, env);
  const where = temp
    ? `${paths.core}, which looks like a TEMPORARY directory your system may delete.`
    : `${paths.core}, a non-default location.`;
  const targets = exposed.map((e) => `${e.name} (${e.dir})`).join(', ');
  return [
    `wienerdog: WARNING — WIENERDOG_HOME points the core at ${where}`,
    `But these AI tool config dir(s) are NOT redirected and will receive skill links + session hooks pointing back at that core: ${targets}.`,
    `If that core is ever removed, the /wienerdog-* commands and session hooks written there will break.`,
    `If this is a permanent custom location, you can ignore this. Otherwise co-redirect the config dir (set CLAUDE_CONFIG_DIR / CODEX_HOME to a matching sandbox) or unset WIENERDOG_HOME before continuing.`,
  ].join('\n');
}

/** True iff `a` and `b` are the SAME directory, by PHYSICAL identity via physicalPath
 *  (below). physicalPath canonicalizes the longest EXISTING ancestor of each path (realpath
 *  — resolving symlinks AND case on macOS APFS) and re-appends the not-yet-created suffix,
 *  so: (1) a config dir aliased by a symlink or a differently-cased name is caught; and
 *  (2) a not-yet-created core under a SYMLINKED parent (e.g. a symlinked HOME on a fresh
 *  install) still compares by its parent's physical identity — never a false "redirected"
 *  (round-4 P3). The compare is CASE-SENSITIVE on every platform: for EXISTING dirs realpath
 *  already canonicalizes case on a case-insensitive filesystem; for an ABSENT
 *  differently-cased suffix the compare treats the two names as distinct, which errs toward
 *  a (cautious, non-blocking) WARNING — the safe direction, never hiding a real half-sandbox
 *  (round-6; the case-insensitive-FS false-positive is an accepted residual — see
 *  Implementation notes). @param {string} a @param {string} b @returns {boolean} */
function sameDir(a, b) {
  return physicalPath(a) === physicalPath(b);
}

/** Canonicalize as much of `p` as exists: realpath the longest existing ancestor, then
 *  re-append the unresolved leaf suffix. A whole-path realpath is NOT enough — an absent
 *  leaf beneath a symlinked/case-aliased parent must still compare by that parent's
 *  physical identity (a bare path.resolve fallback would compare divergent lexical parents
 *  and mis-classify a fresh default core as redirected). If nothing up to the filesystem
 *  root resolves (never, in practice — the root always exists), degrade to path.resolve(p).
 *  @param {string} p @returns {string} */
function physicalPath(p) {
  let cur = path.resolve(p);
  const suffix = [];
  for (;;) {
    try {
      const real = fs.realpathSync.native(cur);
      return suffix.length ? path.join(real, ...suffix) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p); // reached the root; nothing resolved
      suffix.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

/** True when `p` resolves under a known temp root ($TMPDIR / os.tmpdir() / /var/folders
 *  / /tmp). Best-effort heuristic — only escalates warning wording, never gates — so it
 *  stays lexical (a symlinked temp core merely gets the milder wording, still warns).
 *  @param {string} p @param {NodeJS.ProcessEnv} env @returns {boolean} */
function looksTemporary(p, env) {
  const rp = path.resolve(p);
  const roots = [os.tmpdir(), env.TMPDIR, '/tmp', '/var/folders', '/private/var/folders']
    .filter(Boolean)
    .map((r) => path.resolve(r));
  return roots.some((r) => rp === r || rp.startsWith(r + path.sep));
}

module.exports = { sandboxMismatchWarning };
