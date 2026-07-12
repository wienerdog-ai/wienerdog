'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

const manifestLib = require('../core/manifest');

/**
 * Send grants (ADR-0007). Grants are the security boundary that keeps outbound
 * email from becoming an exfiltration channel (THREAT-MODEL T4a): they are
 * mechanics, not vault, so no model-writable surface can create or widen one.
 * They live in a comment-fenced managed section of ~/.wienerdog/config.yaml,
 * written ONLY by the interactive `wienerdog grant` CLI. This module owns
 * parsing/writing that section (it knows the exact shape it writes) and the
 * pure enforcement decision consulted by `gws gmail send`.
 *
 * @typedef {import('../core/paths').WienerdogPaths} WienerdogPaths
 * @typedef {{routine:string, to:string[]}} Grant
 */

/** The exact begin/end sentinels (full lines, including the leading `#`). */
const BEGIN = '# --- wienerdog:grants (managed by `wienerdog grant`; do not edit by hand) ---';
const END = '# --- end wienerdog:grants ---';

/** @param {string} content @returns {string} sha256 hex. */
function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * De-duplicate a recipient list case-insensitively, preserving order and the
 * first-seen (trimmed) spelling.
 * @param {string[]} list
 * @returns {string[]}
 */
function dedupTo(list) {
  const seen = new Set();
  const out = [];
  for (const a of list || []) {
    const trimmed = String(a).trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Parse the grants managed-section out of config.yaml content. Reads only
 * between the two sentinels; tolerant of the exact block this module writes.
 * Absent section → [].
 * @param {string} configText
 * @returns {Grant[]}
 */
function parseGrants(configText) {
  const beginIdx = configText.indexOf(BEGIN);
  const endIdx = configText.indexOf(END);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) return [];
  const inner = configText.slice(beginIdx + BEGIN.length, endIdx);
  /** @type {Grant[]} */
  const grants = [];
  let current = null;
  for (const line of inner.split('\n')) {
    const routineMatch = line.match(/^\s*-\s*routine:\s*(.+?)\s*$/);
    if (routineMatch) {
      current = { routine: routineMatch[1], to: [] };
      grants.push(current);
      continue;
    }
    const toItem = line.match(/^\s*-\s*(\S+)\s*$/);
    if (toItem && current) current.to.push(toItem[1]);
    // `grants:`, `to:`, blank, and comment lines are ignored.
  }
  return grants;
}

/**
 * Render the managed section (sentinels + indented YAML) for `grants`.
 * @param {Grant[]} grants
 * @returns {string} ends with a single trailing newline
 */
function renderSection(grants) {
  const lines = [BEGIN, 'grants:'];
  for (const g of grants) {
    lines.push(`  - routine: ${g.routine}`);
    lines.push('    to:');
    for (const addr of g.to) lines.push(`      - ${addr}`);
  }
  lines.push(END);
  return `${lines.join('\n')}\n`;
}

/**
 * Remove the managed section (and the one blank-line separator we insert before
 * it), returning the content that lives outside the sentinels byte-for-byte.
 * @param {string} configText
 * @returns {string}
 */
function stripSection(configText) {
  const beginIdx = configText.indexOf(BEGIN);
  if (beginIdx === -1) return configText;
  const endIdx = configText.indexOf(END);
  let afterEnd = endIdx + END.length;
  if (configText[afterEnd] === '\n') afterEnd += 1;
  let before = configText.slice(0, beginIdx);
  const after = configText.slice(afterEnd);
  // Undo the single blank-line separator written before BEGIN.
  if (before.endsWith('\n')) before = before.slice(0, -1);
  return before + after;
}

/**
 * Return config.yaml content with the grants section replaced by `grants`
 * (removed entirely if grants is empty). Everything OUTSIDE the sentinels is
 * preserved byte-for-byte; the section is (re)written just before EOF with
 * exactly one blank line before it.
 * @param {string} configText
 * @param {Grant[]} grants
 * @returns {string}
 */
function renderConfigWithGrants(configText, grants) {
  const base = stripSection(configText);
  if (!grants || grants.length === 0) return base;
  const sep = base.endsWith('\n') ? '\n' : '\n\n';
  return base + sep + renderSection(grants);
}

/**
 * Upsert one grant (add, or replace an existing grant with the same routine)
 * and persist config.yaml, then re-sync the manifest hash so uninstall stays
 * clean.
 * @param {WienerdogPaths} paths
 * @param {Grant} grant
 */
function saveGrant(paths, grant) {
  const configText = fs.readFileSync(paths.config, 'utf8');
  const grants = parseGrants(configText);
  const entry = { routine: grant.routine, to: dedupTo(grant.to) };
  const idx = grants.findIndex((g) => g.routine === grant.routine);
  if (idx >= 0) grants[idx] = entry;
  else grants.push(entry);

  const next = renderConfigWithGrants(configText, grants);
  fs.writeFileSync(paths.config, next);

  // Mirror init.js: keep the recorded hash in sync with our own rewrite so
  // uninstall removes config.yaml rather than "keeping … modified since install".
  const manifest = manifestLib.load(paths);
  const configEntry = manifest.entries.find((e) => e.kind === 'file' && e.path === paths.config);
  if (configEntry) {
    configEntry.hash = sha256(next);
    manifestLib.save(paths, manifest);
  }
}

/**
 * Look up the grant for a routine.
 * @param {WienerdogPaths} paths
 * @param {string|null} routine
 * @returns {Grant|null} null if routine is null/absent
 */
function findGrant(paths, routine) {
  if (!routine) return null;
  let configText;
  try {
    configText = fs.readFileSync(paths.config, 'utf8');
  } catch {
    return null;
  }
  return parseGrants(configText).find((g) => g.routine === routine) || null;
}

/**
 * THE ENFORCEMENT DECISION (pure; unit-tested). Allowed IFF grant is non-null
 * AND every recipient is in grant.to (case-insensitive, trimmed exact-address
 * match — no wildcards, no domain grants). Otherwise allowed=false with a
 * plain-language reason naming what was missing.
 * @param {Grant|null} grant
 * @param {string[]} recipients
 * @returns {{allowed:boolean, reason:string}}
 */
function isSendAllowed(grant, recipients) {
  if (!grant) {
    return { allowed: false, reason: 'no send grant for this routine' };
  }
  const list = (recipients || []).map((r) => String(r).trim()).filter(Boolean);
  if (list.length === 0) {
    return { allowed: false, reason: 'no recipient to check (empty list)' };
  }
  const allow = new Set((grant.to || []).map((a) => String(a).trim().toLowerCase()));
  for (const r of list) {
    if (!allow.has(r.toLowerCase())) {
      return { allowed: false, reason: `recipient ${r} not in allowlist` };
    }
  }
  return { allowed: true, reason: 'all recipients granted' };
}

module.exports = { parseGrants, renderConfigWithGrants, saveGrant, findGrant, isSendAllowed };
