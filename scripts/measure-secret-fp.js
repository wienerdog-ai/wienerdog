#!/usr/bin/env node
/**
 * Reproduce the secret-scanner false-positive measurements M1 and M5 of
 * `docs/specs/WP-secret-fence-two-tier-detector.md` against a real vault.
 *
 *   node scripts/measure-secret-fp.js ~/Obsidian/<name>
 *
 * OPT-IN AND OFFLINE. It is not run by `npm test`, is not wired into any job,
 * reads the vault and writes nothing. The vault path is developer-supplied on
 * the command line.
 *
 * IT PRINTS COUNTS, RULE LABELS AND STRUCTURAL DESCRIPTIONS ONLY — never a
 * matched run, never a line of vault prose, never a path outside the
 * vault-relative form. Its output is meant to be pasted into a PR body, so
 * treat every byte of it as public.
 *
 * The `today` column is the SHIPPED detector: the same labelled rules this WP
 * keeps (it changes their severity only, which a "does it fire" count cannot
 * see) plus a CONTEXT-FREE entropy pass over `[A-Za-z0-9+/=]{24,}` at the same
 * floor. The labelled half is observed through the shared module minus the one
 * label this WP ADDS (`basic-auth`); the entropy half is the twenty lines below.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { scanAndRedact } = require('../src/core/secret-scan');

const SKIP_DIRS = new Set(['.git', '.obsidian', '.trash']);
const ADDED_BY_THIS_WP = 'basic-auth';

// --- the shipped, context-free entropy pass ---------------------------------

const SHIPPED_MIN_LEN = 24;
const SHIPPED_MIN_BITS_PER_CHAR = 3.5;
const SHIPPED_CANDIDATE = new RegExp(`[A-Za-z0-9+/=]{${SHIPPED_MIN_LEN},}`, 'g');

/** @param {string} run @returns {number} Shannon entropy in bits per character */
function bitsPerChar(run) {
  const freq = new Map();
  for (let i = 0; i < run.length; i += 1) {
    const ch = run[i];
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }
  let bits = 0;
  for (const n of freq.values()) {
    const p = n / run.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** The runs the SHIPPED detector would have replaced. @param {string} text @returns {string[]} */
function shippedEntropyRuns(text) {
  return (text.match(SHIPPED_CANDIDATE) || []).filter(
    (run) => bitsPerChar(run) >= SHIPPED_MIN_BITS_PER_CHAR,
  );
}

// --- corpus walk ------------------------------------------------------------

/** @param {string} dir @param {string[]} acc @returns {string[]} absolute .md paths */
function collectNotes(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectNotes(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

// --- report -----------------------------------------------------------------

/** @param {string} label @param {number|string} value @returns {string} */
function row(label, value) {
  return `${label.padEnd(48)}${String(value).padStart(5)}`;
}

/** @param {string} vaultPath @returns {number} process exit code */
function measure(vaultPath) {
  const notes = collectNotes(vaultPath);

  let anyFindingToday = 0;
  let entropyOnly = 0;
  let labelledOnly = 0;
  let both = 0;
  let entropyOccurrences = 0;
  const distinctRuns = new Set();
  /** @type {Map<string, number>} */
  const labelledOccurrences = new Map();

  let proposedWithheld = 0;
  let proposedScrubbed = 0;
  let proposedUntouched = 0;

  for (const file of notes) {
    const text = fs.readFileSync(file, 'utf8');
    const { findings } = scanAndRedact(text);

    // today
    const labelled = findings.filter(
      (f) => f.label !== 'high-entropy' && f.label !== ADDED_BY_THIS_WP,
    );
    const runs = shippedEntropyRuns(text);
    for (const run of runs) distinctRuns.add(run);
    entropyOccurrences += runs.length;
    for (const f of labelled) {
      labelledOccurrences.set(f.label, (labelledOccurrences.get(f.label) || 0) + f.count);
    }
    const hasEntropy = runs.length > 0;
    const hasLabelled = labelled.length > 0;
    if (hasEntropy || hasLabelled) anyFindingToday += 1;
    if (hasEntropy && hasLabelled) both += 1;
    else if (hasEntropy) entropyOnly += 1;
    else if (hasLabelled) labelledOnly += 1;

    // proposed
    if (findings.some((f) => f.severity === 'quarantine')) proposedWithheld += 1;
    else if (findings.length > 0) proposedScrubbed += 1;
    else proposedUntouched += 1;
  }

  const pct = notes.length ? ((100 * anyFindingToday) / notes.length).toFixed(1) : '0.0';
  const byRule = [`high-entropy ${entropyOccurrences} occurrences`]
    .concat([...labelledOccurrences].sort().map(([l, n]) => `${l} ${n}`))
    .join('  |  ');

  console.log(`vault: ${vaultPath}`);
  console.log('');
  console.log('M1 — where the false positives come from (SHIPPED detector)');
  console.log(row('notes scanned', notes.length));
  console.log(`${row('notes with ANY finding (EP2 reverts today)', anyFindingToday)}   (${pct}%)`);
  console.log(row('    high-entropy ONLY', entropyOnly));
  console.log(row('    a labelled rule ONLY', labelledOnly));
  console.log(row('    both', both));
  console.log(`findings by rule:  ${byRule}`);
  console.log(row('distinct high-entropy runs', distinctRuns.size));
  console.log('');
  console.log('M5 — the whole design, end to end (PROPOSED detector)');
  console.log(row('notes WITHHELD (a quarantine finding)', proposedWithheld));
  console.log(row('notes SCRUBBED in place (redact only)', proposedScrubbed));
  console.log(row('notes untouched (no finding)', proposedUntouched));
  console.log('');
  console.log('Interim, with EP2 still keying on findings.length > 0 (this leg alone)');
  console.log(row('notes REVERTED by EP2, today', anyFindingToday));
  console.log(row('notes REVERTED by EP2, after this leg', proposedWithheld + proposedScrubbed));
  return 0;
}

function main() {
  const vaultPath = process.argv[2];
  if (!vaultPath) {
    console.error('usage: node scripts/measure-secret-fp.js <vault-path>');
    return 2;
  }
  let stat;
  try {
    stat = fs.statSync(vaultPath);
  } catch {
    console.error(`not a readable path: ${vaultPath}`);
    return 2;
  }
  if (!stat.isDirectory()) {
    console.error(`not a directory: ${vaultPath}`);
    return 2;
  }
  return measure(vaultPath);
}

process.exit(main());
