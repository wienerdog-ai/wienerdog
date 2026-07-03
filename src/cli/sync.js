'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { renderDigest } = require('../core/digest');
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
 * @returns {Promise<void>}
 */
async function run(argv) {
  const dryRun = argv.includes('--dry-run');
  const paths = getPaths();
  const vaultPath = readVaultPath(paths.config);
  if (!vaultPath) {
    throw new WienerdogError('no vault configured in config.yaml — run `npx wienerdog init` first.');
  }
  let isDir = false;
  try {
    isDir = fs.statSync(vaultPath).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    throw new WienerdogError(`vault not found at ${vaultPath} — run \`npx wienerdog init\` first.`);
  }

  // 1. Render + write the digest atomically.
  const layout = readVaultLayout(paths.config);
  const digest = renderDigest(vaultPath, layout);
  const dest = path.join(paths.state, 'digest.md');
  if (!dryRun) {
    fs.mkdirSync(paths.state, { recursive: true });
    const tmp = path.join(paths.state, `.digest.md.${process.pid}.tmp`);
    fs.writeFileSync(tmp, digest);
    fs.renameSync(tmp, dest);
  }
  console.log(`wienerdog: ${dryRun ? 'would write' : 'wrote'} ${dest} (${Buffer.byteLength(digest)} bytes).`);

  // 2. Load the manifest so adapter + skill staging can extend it.
  const manifest = manifestMod.load(paths);

  /** @type {{changed: string[], unchanged: string[], notices: string[]}} */
  const summary = { changed: [], unchanged: [], notices: [] };

  // 3. Stage shipped skills into the core (vendor-neutral).
  stageSkills(paths, dryRun, manifest, summary);

  // 4. Apply the Claude Code adapter if Claude Code is present.
  if (detectHarnesses(process.env).claude.present) {
    const res = applyClaudeAdapter(paths, { dryRun, manifest });
    summary.changed.push(...res.changed);
    summary.unchanged.push(...res.unchanged);
    summary.notices.push(...res.notices);
  } else {
    console.log('Claude Code not detected; skipping adapter.');
  }

  // 4b. Apply the Codex CLI adapter if Codex CLI is present.
  if (detectHarnesses(process.env).codex.present) {
    const res = applyCodexAdapter(paths, { dryRun, manifest });
    summary.changed.push(...res.changed);
    summary.unchanged.push(...res.unchanged);
    summary.notices.push(...res.notices);
  } else {
    console.log('Codex CLI not detected; skipping adapter.');
  }

  // 5. Persist the manifest (never on dry-run).
  if (!dryRun) manifestMod.save(paths, manifest);

  // 6. Summary.
  console.log(
    `wienerdog: ${summary.changed.length} changed, ${summary.unchanged.length} unchanged.`
  );
  for (const n of summary.notices) console.log(`  note: ${n}`);
}

module.exports = { run };
