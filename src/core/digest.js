'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { defaultLayout } = require('./layout');

// Minimal, inlined frontmatter reader. We only need to (a) separate the YAML
// block from the body and (b) read the single flat flag `derived_from_untrusted`.
// A fuller flat-YAML parser already lives in scripts/check-frontmatter.js; it is
// not in this WP's Deliverables, so rather than import it we inline the ~15
// lines we need. Future extraction into src/core/frontmatter.js is fine when a
// second consumer appears (noted in the PR "Decisions made").

/**
 * Split a note into its frontmatter map and body text.
 * @param {string} text
 * @returns {{data: Record<string, string>, body: string}}
 */
function splitFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return { data: {}, body: text };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { data: {}, body: text };
  /** @type {Record<string, string>} */
  const data = {};
  for (const raw of lines.slice(1, end)) {
    const m = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2];
    const hash = value.indexOf('#');
    if (hash !== -1) value = value.slice(0, hash);
    data[m[1]] = value.trim();
  }
  return { data, body: lines.slice(end + 1).join('\n') };
}

/**
 * Read a note, honouring the trust gate. Returns null if the file is missing
 * or is flagged `derived_from_untrusted: true` (excluded from Tier-3 digest).
 * @param {string} filePath
 * @returns {{data: Record<string, string>, body: string}|null}
 */
function readNote(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  const note = splitFrontmatter(text);
  if (note.data.derived_from_untrusted === 'true') return null;
  return note;
}

/** @param {string} line @returns {boolean} */
function isHeading(line) {
  return /^#{1,6}\s/.test(line);
}

/**
 * Compact a note body: drop the frontmatter (already removed by caller), drop
 * a single leading level-1 heading (the note's own `# Title`), drop headings
 * whose section has no non-blank content, collapse runs of blank lines to
 * one, and trim leading/trailing blank lines.
 * @param {string} body
 * @returns {string}
 */
function compact(body) {
  let lines = body.split('\n');
  // Drop a single leading level-1 heading — the note's own `# Title`. renderDigest
  // already prepends the section header (## Preferences, …); without this the note's
  // own H1 stacks under it as a duplicate. Only the FIRST non-blank line, and only
  // if it is exactly a one-hash heading (`# `). H2+ are section structure — preserved.
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first !== -1 && /^#\s/.test(lines[first])) {
    lines = [...lines.slice(0, first), ...lines.slice(first + 1)];
  }
  /** @type {string[]} */
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (isHeading(lines[i])) {
      const heading = lines[i];
      let j = i + 1;
      /** @type {string[]} */
      const section = [];
      while (j < lines.length && !isHeading(lines[j])) {
        section.push(lines[j]);
        j++;
      }
      if (section.some((l) => l.trim() !== '')) out.push(heading, ...section);
      i = j;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

/**
 * Return the trimmed content of a `## <name>` section, or null if absent/empty.
 * @param {string} body
 * @param {string} name
 * @returns {string|null}
 */
function extractSection(body, name) {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.*)$/);
    if (!m || m[1].trim() !== name) continue;
    let j = i + 1;
    /** @type {string[]} */
    const section = [];
    while (j < lines.length && !isHeading(lines[j])) {
      section.push(lines[j]);
      j++;
    }
    const text = section
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');
    return text || null;
  }
  return null;
}

/** @param {string} dir @returns {string[]} names of immediate subdirectories, sorted. */
function listProjectDirs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Find the newest daily note by walking `dir` recursively and collecting files
 * whose basename matches YYYY-MM-DD.md (which sort chronologically). Handles both
 * flat (07-Daily/2026-07-03.md) and nested (05-Daily/2026/07/2026-07-03.md)
 * layouts with the same code. A missing `dir` returns null.
 * @param {string} dir
 * @returns {{path: string, date: string}|null}
 */
function newestDaily(dir) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} d */
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(entry.name)) {
        found.push(full);
      }
    }
  }
  walk(dir);
  if (found.length === 0) return null;
  // Newest by basename (lexical sort == chronological for YYYY-MM-DD).
  found.sort((a, b) => (path.basename(a) < path.basename(b) ? -1 : 1));
  const newest = found[found.length - 1];
  return { path: newest, date: path.basename(newest).replace(/\.md$/, '') };
}

/**
 * Render the SessionStart digest from a vault. Deterministic; no model calls.
 * Reads {identity_dir}/{profile,preferences,goals,instructions}.md, the newest
 * daily note under {daily_dir} (found recursively), and {projects_dir}/* directory
 * names — all resolved from `layout` (defaults == today's hardcoded paths). Notes
 * flagged `derived_from_untrusted: true` and blocks whose source is missing/empty
 * are omitted. Output is <=120 lines.
 * @param {string} vaultDir
 * @param {import('./layout').VaultLayout} [layout]  defaults to defaultLayout()
 * @returns {string}
 */
function renderDigest(vaultDir, layout = defaultLayout()) {
  const idDir = path.join(vaultDir, layout.identity_dir);
  /** @type {[string, string][]} */
  const identity = [
    ['profile.md', "# Who you're working with"],
    ['preferences.md', '## Preferences'],
    ['goals.md', '## Goals'],
    ['instructions.md', '## Standing instructions'],
  ];

  /** @type {string[]} */
  const parts = [];

  for (const [file, header] of identity) {
    const note = readNote(path.join(idDir, file));
    if (!note) continue;
    const content = compact(note.body);
    if (!content) continue;
    parts.push(`${header}\n${content}`);
  }

  const projects = listProjectDirs(path.join(vaultDir, layout.projects_dir));
  if (projects.length > 0) {
    parts.push(`## Active projects\n${projects.map((n) => `- ${n}`).join('\n')}`);
  }

  const daily = newestDaily(path.join(vaultDir, layout.daily_dir));
  if (daily) {
    const note = readNote(daily.path);
    const summary = note && extractSection(note.body, 'Summary');
    if (summary) parts.push(`## Latest daily log (${daily.date})\n${summary}`);
  }

  return `${parts.join('\n\n')}\n`;
}

module.exports = { renderDigest };
